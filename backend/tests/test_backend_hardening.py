import pytest
from fastapi import HTTPException
from pydantic import SecretStr

from app.config import Settings
from app.providers.exercisedb import ExerciseDBProvider
from app.providers.factory import get_exercise_provider
from app.providers.seed import SeedExerciseProvider
from app.routers import admin
from app.services import turso_export as turso_export_module
from app.services.exercise_sync import safe_error_message
from app.services import supabase as supabase_module
from app.services.supabase import SupabaseService
from app.services.turso_export import _clear_scope, _select_by_ids, _upsert_rows, export_to_turso


def make_settings(**overrides: object) -> Settings:
    values = {
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": SecretStr("service-role"),
    }
    values.update(overrides)
    return Settings(**values)


def test_remote_turso_requires_auth_token() -> None:
    settings = make_settings(turso_database_url="libsql://example.turso.io")

    assert settings.is_remote_turso_database
    assert not settings.has_turso_credentials


def test_local_turso_file_does_not_require_auth_token() -> None:
    settings = make_settings(turso_database_url="local.db")

    assert not settings.is_remote_turso_database
    assert settings.has_turso_credentials


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


class FakeResponse:
    def __init__(self, payload: list[dict[str, object]]) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> list[dict[str, object]]:
        return self.payload


class FakeAsyncClient:
    requests: list[dict[str, object]] = []
    pages: list[list[dict[str, object]]] = []
    closed = False

    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs

    async def get(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, str] | None = None,
    ) -> FakeResponse:
        self.requests.append({"url": url, "headers": headers or {}, "params": params or {}})
        return FakeResponse(self.pages.pop(0))

    async def post(self, *args: object, **kwargs: object) -> FakeResponse:
        return FakeResponse([{"id": "row-1"}])

    async def patch(self, *args: object, **kwargs: object) -> FakeResponse:
        return FakeResponse([])

    async def aclose(self) -> None:
        type(self).closed = True


@pytest.mark.asyncio
async def test_supabase_select_all_uses_range_headers_and_in_filters(
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
        )

    assert rows == [{"id": "a"}, {"id": "b"}, {"id": "c"}]
    assert FakeAsyncClient.requests[0]["headers"] == {"Range-Unit": "items", "Range": "0-1"}
    assert FakeAsyncClient.requests[1]["headers"] == {"Range-Unit": "items", "Range": "2-3"}
    assert FakeAsyncClient.requests[0]["params"]["exercise_id"] == "in.(ex-1,ex-2)"
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
async def test_supabase_select_validates_ranges(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(supabase_module.httpx, "AsyncClient", FakeAsyncClient)
    service = SupabaseService(make_settings())

    try:
        with pytest.raises(ValueError, match="range_start and range_end"):
            await service.select("exercise_aliases", range_start=0)
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


class FakeConnection:
    def __init__(self) -> None:
        self.statements: list[tuple[str, list[object]]] = []
        self.committed = False
        self.closed = False

    def execute(self, sql: str, values: list[object] | None = None) -> None:
        self.statements.append((sql, values or []))

    def commit(self) -> None:
        self.committed = True

    def close(self) -> None:
        self.closed = True


def test_turso_upsert_rows_rejects_unknown_table() -> None:
    with pytest.raises(ValueError, match="Unsupported Turso export table"):
        _upsert_rows(FakeConnection(), "bad_table", [{"id": "1"}])


def test_turso_upsert_rows_rejects_unknown_columns() -> None:
    with pytest.raises(ValueError, match="Unsupported columns"):
        _upsert_rows(FakeConnection(), "mcp_exercises", [{"id": "1", "drop table": "x"}])


def test_turso_upsert_rows_converts_booleans() -> None:
    conn = FakeConnection()

    _upsert_rows(conn, "mcp_exercises", [{"id": "1", "is_active": True, "is_custom": False}])

    assert conn.statements[0][1] == ["1", 1, 0]


def test_safe_error_message_is_bounded_and_has_fallback() -> None:
    assert safe_error_message(RuntimeError("")) == "RuntimeError"
    assert len(safe_error_message(RuntimeError("x" * 600))) == 500


def test_clear_scope_limits_user_export_cleanup() -> None:
    conn = FakeConnection()

    _clear_scope(conn, "user-1")

    statements = [statement for statement, _values in conn.statements]
    values = [values for _statement, values in conn.statements]
    assert any("delete from mcp_workouts where user_id = ?" in statement for statement in statements)
    assert any("delete from mcp_exercises where is_custom = 1 and user_id = ?" in statement for statement in statements)
    assert ["user-1"] in values


def test_clear_scope_global_cleanup_preserves_global_exercises() -> None:
    conn = FakeConnection()

    _clear_scope(conn, "")

    statements = [statement for statement, _values in conn.statements]
    assert "delete from mcp_exercises" not in statements
    assert "delete from mcp_exercises where is_custom = 1" in statements


class FakeExportSupabaseService:
    instances: list["FakeExportSupabaseService"] = []

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.calls: list[dict[str, object]] = []
        self.closed = False
        self.instances.append(self)

    async def __aenter__(self) -> "FakeExportSupabaseService":
        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        self.closed = True

    async def select_all(
        self,
        table: str,
        select: str = "*",
        *,
        in_filters: dict[str, list[str]] | None = None,
        **filters: str,
    ) -> list[dict[str, object]]:
        self.calls.append({"table": table, "select": select, "in_filters": in_filters, "filters": filters})
        if table == "exercises" and filters.get("is_custom") == "eq.false":
            return [{"id": "global-exercise", "is_custom": False, "is_active": True}]
        if table == "exercises" and filters.get("user_id") == "eq.user-1":
            return [{"id": "custom-exercise", "is_custom": True, "is_active": True, "user_id": "user-1"}]
        if table == "exercise_aliases":
            return [{"id": "alias-1", "exercise_id": "global-exercise"}]
        if table == "workouts":
            return [{"id": "workout-1", "user_id": "user-1"}]
        if table == "workout_exercises":
            return [{"id": "workout-exercise-1", "workout_id": "workout-1"}]
        if table == "workout_sets":
            return [{"id": "set-1", "workout_exercise_id": "workout-exercise-1"}]
        if table == "routines":
            return [{"id": "routine-1", "user_id": "user-1"}]
        if table == "routine_exercises":
            return [{"id": "routine-exercise-1", "routine_id": "routine-1"}]
        return []


@pytest.mark.asyncio
async def test_select_by_ids_chunks_large_parent_lists() -> None:
    service = FakeExportSupabaseService(make_settings())
    ids = [f"id-{index}" for index in range(205)]

    await _select_by_ids(service, "exercise_aliases", "id,exercise_id", "exercise_id", ids)

    filters = [call["in_filters"] for call in service.calls]
    assert filters == [
        {"exercise_id": ids[:100]},
        {"exercise_id": ids[100:200]},
        {"exercise_id": ids[200:]},
    ]


@pytest.mark.asyncio
async def test_turso_export_pushes_child_filters_to_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = FakeConnection()
    FakeExportSupabaseService.instances = []
    monkeypatch.setattr(turso_export_module, "SupabaseService", FakeExportSupabaseService)
    monkeypatch.setattr(turso_export_module.libsql, "connect", lambda **_kwargs: conn)

    result = await export_to_turso(
        make_settings(turso_database_url="local.db", turso_export_user_id="user-1")
    )

    service = FakeExportSupabaseService.instances[0]
    child_calls = {call["table"]: call["in_filters"] for call in service.calls if call["in_filters"]}
    assert child_calls["exercise_aliases"] == {"exercise_id": ["global-exercise", "custom-exercise"]}
    assert child_calls["workout_exercises"] == {"workout_id": ["workout-1"]}
    assert child_calls["workout_sets"] == {"workout_exercise_id": ["workout-exercise-1"]}
    assert child_calls["routine_exercises"] == {"routine_id": ["routine-1"]}
    assert result["workout_sets"] == 1
    assert conn.committed
    assert conn.closed
    assert service.closed
