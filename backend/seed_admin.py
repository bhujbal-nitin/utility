import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from auth_service.models import User, RoleEnum
from core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def seed():
    async with async_session() as session:
        # Instead of creating, we just promote an existing user to admin, or to automation
        # to avoid passlib bcrypt issues in a standalone script.
        # Ensure you registered 'admin@autoedge.com' via the UI first!
        result = await session.execute(select(User).where(User.email == "admin@autoedge.com"))
        user = result.scalars().first()
        if user:
            user.role = RoleEnum.ADMIN
            await session.commit()
            print("Admin user promoted!")
        else:
            print("User admin@autoedge.com not found. Please register it via the UI first.")
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed())
