from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import Optional, List

from app.models.api_key import APIKey
from app.db.session import AsyncSessionLocal

async def create_api_key(
    db: AsyncSession,
    key: str,
    name: str,
    user_id: int,
    organization_id: Optional[int] = None,
    description: Optional[str] = None,
    scopes: str = "read:deployments,write:deployments",
    expires_at: Optional[datetime] = None,
) -> APIKey:
    """Create a new API key"""
    api_key = APIKey(
        key=key,
        name=name,
        user_id=user_id,
        organization_id=organization_id,
        description=description,
        scopes=scopes,
        expires_at=expires_at,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    return api_key

async def get_api_key_by_key(key: str) -> Optional[APIKey]:
    """Get API key by the key value"""
    async with AsyncSessionLocal() as db:
        query = select(APIKey).where(APIKey.key == key)
        result = await db.execute(query)
        api_key = result.scalars().first()
        
        if api_key:
            # Update last used timestamp
            api_key.update_last_used()
            await db.commit()
            
        return api_key

async def get_api_keys_by_user(db: AsyncSession, user_id: int) -> List[APIKey]:
    """Get all API keys for a user"""
    query = select(APIKey).where(APIKey.user_id == user_id, APIKey.is_revoked == False)
    result = await db.execute(query)
    return result.scalars().all()

async def revoke_api_key(db: AsyncSession, api_key_id: int) -> bool:
    """Revoke an API key"""
    query = (
        update(APIKey)
        .where(APIKey.id == api_key_id)
        .values(is_revoked=True, revoked_at=datetime.utcnow())
    )
    result = await db.execute(query)
    await db.commit()
    return result.rowcount > 0 