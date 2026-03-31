import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from core.config import settings

engine = create_async_engine(settings.async_database_url, echo=True)

async def fix_roles():
    async with engine.begin() as conn:
        try:
            # PostgreSQL query to convert all JSON array elements to lowercase
            # Actually, standard jsonb or json manipulation:
            await conn.execute(text("""
                UPDATE users 
                SET roles = (
                    SELECT json_agg(LOWER(elem::text))
                    FROM json_array_elements_text(roles) as elem
                )
            """))
            print("Roles casing fixed.")
        except Exception as e:
            print(f"Error: {e}")

asyncio.run(fix_roles())
