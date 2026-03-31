import asyncio
import sys
import os
import json
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, select

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from core.config import settings
from auth_service.models import User

engine = create_async_engine(settings.async_database_url, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def force_fix():
    async with async_session() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        for u in users:
            print(f"Before: {u.email} -> {u.roles}")
            # force to proper list of lowercase strings
            fixed_roles = [str(r).lower() for r in getattr(u, 'roles', [])]
            # remove enum member reference if any string was 'RoleEnum.ADMIN'
            fixed_roles = [r.split('.')[-1] for r in fixed_roles]
            u.roles = fixed_roles
            
            # also verify the string
            
            print(f"After: {u.email} -> {u.roles}")
        
        await session.commit()
    print("Force fix complete.")

asyncio.run(force_fix())
