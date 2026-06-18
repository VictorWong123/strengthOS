"""Service-role Supabase REST client used by backend jobs only."""

from collections.abc import Iterable
from typing import Any

import httpx

from app.config import Settings


class SupabaseService:
    """Small REST client for service-role Supabase table operations.

    The client owns one scoped ``httpx.AsyncClient`` so callers that perform many
    REST operations can reuse connection pooling. Long-running jobs should call
    ``aclose`` or use the service as an async context manager.
    """

    def __init__(self, settings: Settings) -> None:
        """Create a service client using backend-only credentials."""

        if not settings.has_supabase_credentials:
            raise ValueError("Supabase service credentials are required.")
        self.rest_url = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        token = settings.supabase_service_role_key.get_secret_value()
        self.headers = {
            "apikey": token,
            "authorization": f"Bearer {token}",
            "content-type": "application/json",
            "prefer": "return=representation",
        }
        self._client = httpx.AsyncClient(timeout=60, headers=self.headers)

    async def __aenter__(self) -> "SupabaseService":
        """Return this service for async context manager usage."""

        return self

    async def __aexit__(self, *_exc_info: object) -> None:
        """Close the underlying HTTP client when leaving a context."""

        await self.aclose()

    async def aclose(self) -> None:
        """Close the scoped HTTP client."""

        await self._client.aclose()

    async def insert(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Insert one row and return the inserted representation."""

        response = await self._client.post(f"{self.rest_url}/{table}", json=payload)
        response.raise_for_status()
        data = response.json()
        return data[0] if isinstance(data, list) else data

    async def patch_by_id(self, table: str, row_id: str, payload: dict[str, Any]) -> None:
        """Patch a table row by its `id` primary key."""

        response = await self._client.patch(
            f"{self.rest_url}/{table}",
            headers={"prefer": "return=minimal"},
            params={"id": f"eq.{row_id}"},
            json=payload,
        )
        response.raise_for_status()

    async def upsert(
        self,
        table: str,
        payload: dict[str, Any] | list[dict[str, Any]],
        on_conflict: str,
    ) -> list[dict[str, Any]]:
        """Upsert rows into a Supabase table by a named conflict target."""

        response = await self._client.post(
            f"{self.rest_url}/{table}",
            headers={"prefer": "resolution=merge-duplicates,return=representation"},
            params={"on_conflict": on_conflict},
            json=payload,
        )
        response.raise_for_status()
        return response.json()

    async def select(
        self,
        table: str,
        select: str = "*",
        *,
        range_start: int | None = None,
        range_end: int | None = None,
        in_filters: dict[str, Iterable[str]] | None = None,
        **filters: str,
    ) -> list[dict[str, Any]]:
        """Select rows from a Supabase table using PostgREST filters.

        ``range_start`` and ``range_end`` send the standard PostgREST item range
        headers. ``in_filters`` converts iterable values into ``in.(...)``
        filters so callers can push scoped child-row filtering to Supabase.
        """

        if (range_start is None) != (range_end is None):
            raise ValueError("range_start and range_end must be provided together.")
        params: dict[str, str] = {"select": select, **filters}
        if in_filters:
            for column, values in in_filters.items():
                values_list = list(values)
                if not values_list:
                    return []
                params[column] = self.in_filter(values_list)
        headers: dict[str, str] = {}
        if range_start is not None and range_end is not None:
            headers = {"Range-Unit": "items", "Range": f"{range_start}-{range_end}"}
        response = await self._client.get(f"{self.rest_url}/{table}", headers=headers, params=params)
        response.raise_for_status()
        return response.json()

    async def select_all(
        self,
        table: str,
        select: str = "*",
        *,
        page_size: int = 1000,
        in_filters: dict[str, Iterable[str]] | None = None,
        **filters: str,
    ) -> list[dict[str, Any]]:
        """Select all matching rows by paging through PostgREST ranges."""

        if page_size < 1:
            raise ValueError("page_size must be greater than zero.")
        rows: list[dict[str, Any]] = []
        start = 0
        while True:
            page = await self.select(
                table,
                select,
                range_start=start,
                range_end=start + page_size - 1,
                in_filters=in_filters,
                **filters,
            )
            rows.extend(page)
            if len(page) < page_size:
                return rows
            start += page_size

    @staticmethod
    def in_filter(values: Iterable[str]) -> str:
        """Return a PostgREST ``in`` filter for trusted scalar identifiers."""

        rendered = []
        for value in values:
            text = str(value)
            if any(char in text for char in (",", "(", ")", '"')):
                text = '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'
            rendered.append(text)
        return f"in.({','.join(rendered)})"
