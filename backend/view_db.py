import asyncio
import sys
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from core.config import settings

engine = create_async_engine(settings.async_database_url, echo=False)

async def print_roles():
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT email, roles FROM users;"))
        rows = res.fetchall()
        print(f"Users found: {len(rows)}")
        for r in rows:
            print(r)

asyncio.run(print_roles())
