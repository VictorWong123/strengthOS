import shutil
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app import main as app_main
from app.auth import dependencies as auth_dependencies
from app.auth.dependencies import extract_bearer_token, verify_supabase_token
from app.config import Settings
from app.providers.exercisedb import ExerciseDBProvider
from app.providers.factory import get_exercise_provider
from app.providers.seed import SeedExerciseProvider
from app.repositories import supabase_training as training_repository_module
from app.repositories.supabase_training import TrainingRepository
from app.routers import admin, exercise_images, oauth_metadata
from app.services import supabase as supabase_module
from app.services.exercise_sync import safe_error_message
from app.services.supabase import SupabaseService
from app.services.training_analytics import (
    TrainingAnalyticsService,
    estimated_one_rep_max,
    validate_days,
)


def make_settings(**overrides: object) -> Settings:
    values = {
        "supabase_url": "https://example.supabase.co",
        "supabase_anon_key": SecretStr("anon-key"),
        "supabase_service_role_key": SecretStr("service-role"),
        "admin_api_key": SecretStr(""),
        "exercise_api_key": SecretStr(""),
    }
    values.update(overrides)
    return Settings(**values)


@pytest.mark.asyncio
async def test_admin_key_uses_constant_time_compare(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str]] = []

    def fake_compare_digest(provided: str, expected: str) -> bool:
        calls.append((provided, expected))
        return provided == expected

    monkeypatch.setattr(admin, "get_settings", lambda: make_settings(admin_api_key=SecretStr("secret")))
    monkeypatch.setattr(admin.secrets, "compare_digest", fake_compare_digest)

    await admin.require_admin_key("secret")

    assert calls == [("secret", "secret")]


@pytest.mark.asyncio
async def test_admin_key_rejects_missing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin, "get_settings", lambda: make_settings(admin_api_key=SecretStr("secret")))

    with pytest.raises(HTTPException) as exc_info:
        await admin.require_admin_key(None)

    assert exc_info.value.status_code == 401


def test_exercise_provider_requires_explicit_seed_provider() -> None:
    settings = make_settings(exercise_api_provider="seed")

    assert isinstance(get_exercise_provider(settings), SeedExerciseProvider)


def test_exercisedb_provider_requires_credentials() -> None:
    settings = make_settings(exercise_api_provider="exercisedb")

    with pytest.raises(ValueError, match="ExerciseDB provider requires"):
        get_exercise_provider(settings)


def test_exercisedb_provider_uses_credentials_when_available() -> None:
    settings = make_settings(
        exercise_api_provider="exercisedb",
        exercise_api_key=SecretStr("rapidapi-key"),
        exercise_api_host="exercisedb.p.rapidapi.com",
    )

    assert isinstance(get_exercise_provider(settings), ExerciseDBProvider)


def test_exercisedb_provider_normalizes_current_api_fields() -> None:
    settings = make_settings(
        exercise_api_provider="exercisedb",
        exercise_api_key=SecretStr("rapidapi-key"),
        exercise_api_host="exercisedb.p.rapidapi.com",
    )
    provider = ExerciseDBProvider(settings)

    exercise = provider._normalize(
        {
            "id": "0001",
            "name": "3/4 sit-up",
            "target": "abs",
            "bodyPart": "waist",
            "equipment": "body weight",
            "secondaryMuscles": ["hip flexors"],
        }
    )

    assert exercise.external_id == "0001"
    assert exercise.primary_muscle == "Abs"
    assert exercise.body_part == "Waist"
    assert exercise.equipment == "Body Weight"
    assert exercise.secondary_muscles == ["Hip Flexors"]


@pytest.mark.asyncio
async def test_exercisedb_provider_falls_back_to_body_part_endpoints(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = make_settings(
        exercise_api_provider="exercisedb",
        exercise_api_key=SecretStr("rapidapi-key"),
        exercise_api_host="exercisedb.p.rapidapi.com",
        exercise_sync_page_size=2,
    )
    FakeAsyncClient.requests = []
    FakeAsyncClient.statuses = [403, 200, 200, 200]
    FakeAsyncClient.pages = [
        [{"message": "not subscribed"}],
        ["back"],
        [
            {
                "exerciseId": "0001",
                "name": "pull up",
                "targetMuscles": ["lats"],
                "bodyParts": ["back"],
                "equipments": ["body weight"],
            },
            {
                "exerciseId": "0002",
                "name": "chin up",
                "targetMuscles": ["lats"],
                "bodyParts": ["back"],
                "equipments": ["body weight"],
            },
        ],
        [],
    ]
    monkeypatch.setattr("app.providers.exercisedb.httpx.AsyncClient", FakeAsyncClient)

    provider = ExerciseDBProvider(settings)
    exercises = await provider.list_exercises()

    assert [exercise.name for exercise in exercises] == ["pull up", "chin up"]
    assert FakeAsyncClient.requests[0]["url"] == "https://exercisedb.p.rapidapi.com/exercises"
    assert FakeAsyncClient.requests[1]["url"] == "https://exercisedb.p.rapidapi.com/exercises/bodyPartList"
    assert FakeAsyncClient.requests[2]["url"] == "https://exercisedb.p.rapidapi.com/exercises/bodyPart/back"


@pytest.mark.asyncio
async def test_exercise_image_proxy_streams_provider_gif(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = make_settings(
        exercise_api_key=SecretStr("rapidapi-key"),
        exercise_api_host="exercisedb.p.rapidapi.com",
    )
    FakeAsyncClient.requests = []
    FakeAsyncClient.statuses = [200]
    FakeAsyncClient.pages = [b"GIF89a"]
    cache_dir = Path("pytest-cache-files-exercise-images-stream")
    shutil.rmtree(cache_dir, ignore_errors=True)
    monkeypatch.setattr(exercise_images, "get_settings", lambda: settings)
    monkeypatch.setattr(exercise_images, "IMAGE_CACHE_DIR", cache_dir)
    monkeypatch.setattr("app.routers.exercise_images.httpx.AsyncClient", FakeAsyncClient)

    try:
        response = await exercise_images.get_exercise_image("0001", "180")
    finally:
        shutil.rmtree(cache_dir, ignore_errors=True)

    assert response.media_type == "image/gif"
    assert FakeAsyncClient.requests[0]["url"] == "https://exercisedb.p.rapidapi.com/image"
    assert FakeAsyncClient.requests[0]["params"] == {"exerciseId": "0001", "resolution": "180"}


@pytest.mark.asyncio
async def test_exercise_image_proxy_serves_cached_image_without_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = make_settings(
        exercise_api_key=SecretStr("rapidapi-key"),
        exercise_api_host="exercisedb.p.rapidapi.com",
    )
    cache_dir = Path("pytest-cache-files-exercise-images-cached")
    shutil.rmtree(cache_dir, ignore_errors=True)
    monkeypatch.setattr(exercise_images, "get_settings", lambda: settings)
    monkeypatch.setattr(exercise_images, "IMAGE_CACHE_DIR", cache_dir)
    exercise_images.write_cached_image("0001", "180", b"GIF89a", "image/gif")

    try:
        response = await exercise_images.get_exercise_image("0001", "180")
    finally:
        shutil.rmtree(cache_dir, ignore_errors=True)

    assert response.media_type == "image/gif"
    assert response.body == b"GIF89a"


@pytest.mark.asyncio
async def test_exercise_image_proxy_surfaces_provider_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = make_settings(
        exercise_api_key=SecretStr("rapidapi-key"),
        exercise_api_host="exercisedb.p.rapidapi.com",
    )

    class RateLimitedExerciseDBClient:
        def __init__(self, _settings: Settings) -> None:
            return None

        async def get(self, *_args: object, **_kwargs: object) -> FakeResponse:
            return FakeResponse(b"rate limited", 429)

    monkeypatch.setattr(exercise_images, "get_settings", lambda: settings)
    monkeypatch.setattr(exercise_images, "ExerciseDBClient", RateLimitedExerciseDBClient)

    with pytest.raises(HTTPException) as exc_info:
        await exercise_images.get_exercise_image("0001", "180")

    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_exercise_image_proxy_rejects_invalid_ids() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await exercise_images.get_exercise_image("../0001", "180")

    assert exc_info.value.status_code == 400


class FakeResponse:
    def __init__(
        self,
        payload: object,
        status_code: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.payload = payload
        self.status_code = status_code
        self.headers = headers or {}

    def raise_for_status(self) -> None:
        return None

    @property
    def content(self) -> bytes:
        return self.payload if isinstance(self.payload, bytes) else b""

    def json(self) -> object:
        return self.payload


class FakeAsyncClient:
    requests: list[dict[str, object]] = []
    pages: list[list[dict[str, object]]] = []
    statuses: list[int] = []
    auth_payload: dict[str, object] = {"id": "user-1", "email": "user@example.com"}
    auth_status_code = 200
    closed = False

    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs

    async def __aenter__(self) -> "FakeAsyncClient":
        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        type(self).closed = True

    async def get(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, str] | None = None,
    ) -> FakeResponse:
        self.requests.append({"url": url, "headers": headers or {}, "params": params or {}})
        if url.endswith("/auth/v1/user"):
            return FakeResponse(self.auth_payload, self.auth_status_code)
        status = self.statuses.pop(0) if self.statuses else 200
        return FakeResponse(self.pages.pop(0), status)

    async def post(self, *args: object, **kwargs: object) -> FakeResponse:
        return FakeResponse([{"id": "row-1"}])

    async def patch(self, *args: object, **kwargs: object) -> FakeResponse:
        return FakeResponse([])

    async def aclose(self) -> None:
        type(self).closed = True


@pytest.mark.asyncio
async def test_supabase_select_all_uses_range_headers_order_limit_and_in_filters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.pages = [
        [{"id": "a"}, {"id": "b"}],
        [{"id": "c"}],
    ]
    FakeAsyncClient.closed = False
    monkeypatch.setattr(supabase_module.httpx, "AsyncClient", FakeAsyncClient)

    async with SupabaseService(make_settings()) as service:
        rows = await service.select_all(
            "exercise_aliases",
            "id,exercise_id",
            page_size=2,
            in_filters={"exercise_id": ["ex-1", "ex-2"]},
            order="created_at.desc",
        )

    assert rows == [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    assert FakeAsyncClient.requests[0]["headers"] == {"Range-Unit": "items", "Range": "0-1"}
    assert FakeAsyncClient.requests[1]["headers"] == {"Range-Unit": "items", "Range": "2-3"}
    assert FakeAsyncClient.requests[0]["params"]["exercise_id"] == "in.(ex-1,ex-2)"
    assert FakeAsyncClient.requests[0]["params"]["order"] == "created_at.desc"
    assert FakeAsyncClient.closed


@pytest.mark.asyncio
async def test_supabase_empty_in_filter_short_circuits(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.pages = []
    monkeypatch.setattr(supabase_module.httpx, "AsyncClient", FakeAsyncClient)
    service = SupabaseService(make_settings())

    try:
        rows = await service.select("exercise_aliases", in_filters={"exercise_id": []})
    finally:
        await service.aclose()

    assert rows == []
    assert FakeAsyncClient.requests == []


@pytest.mark.asyncio
async def test_supabase_select_validates_ranges_and_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(supabase_module.httpx, "AsyncClient", FakeAsyncClient)
    service = SupabaseService(make_settings())

    try:
        with pytest.raises(ValueError, match="range_start and range_end"):
            await service.select("exercise_aliases", range_start=0)
        with pytest.raises(ValueError, match="limit"):
            await service.select("exercise_aliases", limit=0)
    finally:
        await service.aclose()


@pytest.mark.asyncio
async def test_supabase_select_all_validates_page_size(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(supabase_module.httpx, "AsyncClient", FakeAsyncClient)
    service = SupabaseService(make_settings())

    try:
        with pytest.raises(ValueError, match="page_size"):
            await service.select_all("exercise_aliases", page_size=0)
    finally:
        await service.aclose()


def test_supabase_in_filter_quotes_special_values() -> None:
    assert SupabaseService.in_filter(["plain", "needs,quotes", "has(paren)"]) == 'in.(plain,"needs,quotes","has(paren)")'


def test_extract_bearer_token_rejects_missing_or_empty_tokens() -> None:
    with pytest.raises(HTTPException) as missing:
        extract_bearer_token(None)
    with pytest.raises(HTTPException) as empty:
        extract_bearer_token("Bearer ")

    assert missing.value.status_code == 401
    assert empty.value.status_code == 401


def test_extract_bearer_token_returns_token() -> None:
    assert extract_bearer_token("Bearer token-1") == "token-1"
    assert extract_bearer_token("bearer token-2") == "token-2"


def test_settings_preserves_legacy_frontend_origin() -> None:
    settings = make_settings(frontend_url="https://new.example", frontend_origin="https://old.example")

    assert settings.allowed_frontend_origins == [
        "http://localhost:5173",
        "https://new.example",
        "https://old.example",
    ]


@pytest.mark.asyncio
async def test_oauth_protected_resource_metadata_uses_public_backend_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = make_settings(
        backend_public_url="https://api.example.com/",
        frontend_url="https://app.example.com",
    )
    monkeypatch.setattr(oauth_metadata, "get_settings", lambda: settings)

    metadata = await oauth_metadata.oauth_protected_resource(object())

    assert metadata == {
        "resource": "https://api.example.com/mcp",
        "authorization_servers": ["https://example.supabase.co/auth/v1"],
        "scopes_supported": ["openid", "email", "profile"],
        "resource_documentation": "https://app.example.com",
    }


def test_oauth_metadata_endpoint_is_public(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        app_main,
        "get_settings",
        lambda: make_settings(
            backend_public_url="https://api.example.com",
            frontend_url="https://app.example.com",
        ),
    )
    monkeypatch.setattr(
        oauth_metadata,
        "get_settings",
        lambda: make_settings(
            backend_public_url="https://api.example.com",
            frontend_url="https://app.example.com",
        ),
    )

    client = TestClient(app_main.create_app())

    response = client.get("/.well-known/oauth-protected-resource")

    assert response.status_code == 200
    assert response.json()["resource"] == "https://api.example.com/mcp"
    assert response.json()["authorization_servers"] == ["https://example.supabase.co/auth/v1"]


def test_unauthenticated_mcp_returns_bearer_resource_metadata_challenge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        app_main,
        "get_settings",
        lambda: make_settings(backend_public_url="https://api.example.com"),
    )

    client = TestClient(app_main.create_app())

    response = client.post("/mcp")

    assert response.status_code == 401
    assert (
        response.headers["www-authenticate"]
        == 'Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"'
    )


def test_authenticated_mcp_request_checks_supabase_user_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    settings = make_settings(backend_public_url="https://api.example.com")
    monkeypatch.setattr(app_main, "get_settings", lambda: settings)

    async def fake_verify_supabase_token(token: str, resolved_settings: Settings):
        calls.append(token)
        assert resolved_settings is settings
        return auth_dependencies.AuthenticatedUser(id="user-1")

    monkeypatch.setattr(app_main, "verify_supabase_token", fake_verify_supabase_token)
    with TestClient(app_main.create_app()) as client:
        response = client.post("/mcp", headers={"Authorization": "Bearer access-token"})

    assert calls
    assert set(calls) == {"access-token"}
    assert response.status_code != 401


@pytest.mark.asyncio
async def test_verify_supabase_token_calls_auth_user_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.auth_payload = {"id": "user-1", "email": "user@example.com"}
    FakeAsyncClient.auth_status_code = 200
    monkeypatch.setattr(auth_dependencies.httpx, "AsyncClient", FakeAsyncClient)

    user = await verify_supabase_token("access-token", make_settings())

    assert user.id == "user-1"
    assert FakeAsyncClient.requests[0]["url"] == "https://example.supabase.co/auth/v1/user"
    assert FakeAsyncClient.requests[0]["headers"]["apikey"] == "anon-key"
    assert FakeAsyncClient.requests[0]["headers"]["authorization"] == "Bearer access-token"


@pytest.mark.asyncio
async def test_verify_supabase_token_rejects_invalid_token(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.auth_payload = {"message": "invalid"}
    FakeAsyncClient.auth_status_code = 401
    monkeypatch.setattr(auth_dependencies.httpx, "AsyncClient", FakeAsyncClient)

    with pytest.raises(HTTPException) as exc_info:
        await verify_supabase_token("bad-token", make_settings())

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_supabase_token_rejects_missing_user_id(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeAsyncClient.requests = []
    FakeAsyncClient.auth_payload = {"email": "user@example.com"}
    FakeAsyncClient.auth_status_code = 200
    monkeypatch.setattr(auth_dependencies.httpx, "AsyncClient", FakeAsyncClient)

    with pytest.raises(HTTPException) as exc_info:
        await verify_supabase_token("bad-token", make_settings())

    assert exc_info.value.status_code == 401


class FakeSupabaseService:
    instances: list["FakeSupabaseService"] = []

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.calls: list[dict[str, object]] = []
        self.instances.append(self)

    async def __aenter__(self) -> "FakeSupabaseService":
        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        return None

    async def select(
        self,
        table: str,
        select: str = "*",
        **kwargs: object,
    ) -> list[dict[str, object]]:
        self.calls.append({"method": "select", "table": table, "select": select, "kwargs": kwargs})
        return [{"id": "workout-1", "user_id": "user-1"}]

    async def select_all(
        self,
        table: str,
        select: str = "*",
        **kwargs: object,
    ) -> list[dict[str, object]]:
        self.calls.append({"method": "select_all", "table": table, "select": select, "kwargs": kwargs})
        return []


@pytest.mark.asyncio
async def test_training_repository_scopes_workout_reads_to_user(monkeypatch: pytest.MonkeyPatch) -> None:
    FakeSupabaseService.instances = []
    monkeypatch.setattr(training_repository_module, "SupabaseService", FakeSupabaseService)

    async with TrainingRepository(make_settings()) as repository:
        await repository.get_workout("user-1", "workout-1")

    call = FakeSupabaseService.instances[0].calls[0]
    assert call["table"] == "workouts"
    assert call["kwargs"]["user_id"] == "eq.user-1"
    assert call["kwargs"]["id"] == "eq.workout-1"


@pytest.mark.asyncio
async def test_training_repository_scopes_visible_exercises_to_global_or_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeSupabaseService.instances = []
    monkeypatch.setattr(training_repository_module, "SupabaseService", FakeSupabaseService)

    async with TrainingRepository(make_settings()) as repository:
        await repository.get_visible_exercises("user-1", exercise_ids=["exercise-1"])

    call = FakeSupabaseService.instances[0].calls[0]
    assert call["table"] == "exercises"
    assert call["kwargs"]["is_active"] == "eq.true"
    assert call["kwargs"]["or"] == "(user_id.is.null,user_id.eq.user-1)"
    assert call["kwargs"]["in_filters"] == {"id": ["exercise-1"]}


def test_estimated_one_rep_max_excludes_high_rep_sets() -> None:
    assert estimated_one_rep_max(100, 5) == 116.67
    assert estimated_one_rep_max(100, 16) is None


def test_validate_days_rejects_out_of_range_values() -> None:
    with pytest.raises(ValueError, match="days"):
        validate_days(0)
    with pytest.raises(ValueError, match="days"):
        validate_days(3651)


def test_safe_error_message_is_bounded_and_has_fallback() -> None:
    assert safe_error_message(RuntimeError("")) == "RuntimeError"
    assert len(safe_error_message(RuntimeError("x" * 600))) == 500


class FakeTrainingRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def __aenter__(self) -> "FakeTrainingRepository":
        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        return None

    async def find_exercise_by_name(self, user_id: str, exercise_name: str) -> dict[str, object]:
        assert user_id == "user-1"
        assert exercise_name == "Bench Press"
        return {
            "id": "exercise-1",
            "name": "Bench Press",
            "equipment": "barbell",
            "primary_muscle": "chest",
        }

    async def get_recent_workouts(self, user_id: str, days: int) -> list[dict[str, object]]:
        assert user_id == "user-1"
        assert days == 90
        return [
            {"id": "workout-1", "started_at": "2026-06-01T12:00:00+00:00"},
            {"id": "workout-2", "started_at": "2026-06-08T12:00:00+00:00"},
        ]

    async def get_workout_exercises_by_workouts(self, workout_ids: list[str]) -> list[dict[str, object]]:
        assert workout_ids == ["workout-1", "workout-2"]
        return [
            {"id": "we-1", "workout_id": "workout-1", "exercise_id": "exercise-1"},
            {"id": "we-2", "workout_id": "workout-2", "exercise_id": "exercise-1"},
        ]

    async def get_sets_by_workout_exercises(self, ids: list[str]) -> list[dict[str, object]]:
        assert ids == ["we-1", "we-2"]
        return [
            {"id": "set-1", "workout_exercise_id": "we-1", "weight": 100, "reps": 5, "is_completed": True},
            {"id": "set-2", "workout_exercise_id": "we-2", "weight": 110, "reps": 5, "is_completed": True},
        ]


@pytest.mark.asyncio
async def test_strength_progress_returns_structured_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.training_analytics.TrainingRepository", FakeTrainingRepository)

    result = await TrainingAnalyticsService(make_settings()).get_strength_progress(
        "user-1",
        "Bench Press",
    )

    assert result["exercise"]["name"] == "Bench Press"
    assert result["performances"][0]["best_set"]["estimated_1rm"] == 116.67
    assert result["summary"]["classification"] == "progressing"
