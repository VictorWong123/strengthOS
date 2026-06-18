"""Command-line entrypoint for Supabase-to-Turso export."""

import asyncio

from app.config import Settings, get_settings
from app.services.turso_export import export_to_turso


async def sync_turso(settings: Settings | None = None) -> dict[str, int]:
    """Run the Turso read-replica export."""

    return await export_to_turso(settings or get_settings())


def main() -> None:
    """Run the export job from `python -m app.scripts.sync_turso`."""

    result = asyncio.run(sync_turso())
    print(result)


if __name__ == "__main__":
    main()
