"""Service-role Supabase REST client used by backend jobs only."""

from typing import Any

import httpx

from app.config import Settings


class SupabaseService:
    """Small REST client for service-role Supabase table operations."""

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

    async def insert(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Insert one row and return the inserted representation."""

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(f"{self.rest_url}/{table}", headers=self.headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data[0] if isinstance(data, list) else data

    async def patch_by_id(self, table: str, row_id: str, payload: dict[str, Any]) -> None:
        """Patch a table row by its `id` primary key."""

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.patch(
                f"{self.rest_url}/{table}",
                headers={**self.headers, "prefer": "return=minimal"},
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

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.rest_url}/{table}",
                headers={**self.headers, "prefer": "resolution=merge-duplicates,return=representation"},
                params={"on_conflict": on_conflict},
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    async def select(self, table: str, select: str = "*", **filters: str) -> list[dict[str, Any]]:
        """Select rows from a Supabase table using simple REST filters."""

        params: dict[str, str] = {"select": select, **filters}
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.get(f"{self.rest_url}/{table}", headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
