import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine
from core.config import settings
from core.db import Base

# We must import models so they register with Base.metadata
from auth_service.models import User
from migration_service.models import MigrationCache

engine = create_async_engine(settings.async_database_url, echo=False)

async def check():
    async with engine.connect() as conn:
        def inspect_tables(sync_conn):
            from sqlalchemy import inspect
            inspector = inspect(sync_conn)
            return inspector.get_table_names()
            
        tables = await conn.run_sync(inspect_tables)
        print("TABLES IN DATABASE:")
        for t in tables:
            print(f"- {t}")

        print("\nEXPECTED TABLES GIVEN METADATA:")
        for t in Base.metadata.sorted_tables:
            print(f"- {t.name}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check())
