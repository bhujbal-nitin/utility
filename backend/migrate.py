import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from core.config import settings

engine = create_async_engine(settings.async_database_url, echo=True)

async def run_migration():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN roles JSON DEFAULT '[\"ba\"]'::json;"))
            await conn.execute(text("UPDATE users SET roles = json_build_array(role::text);"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN is_approved BOOLEAN DEFAULT FALSE;"))
            await conn.execute(text("UPDATE users SET is_approved = TRUE;"))
            await conn.execute(text("ALTER TABLE users DROP COLUMN role;"))
            print("Migration successful.")
        except Exception as e:
            print(f"Migration error: {e}")

asyncio.run(run_migration())
