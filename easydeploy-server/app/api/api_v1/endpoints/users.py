from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from app.db.session import get_db
from app.core.security import verify_api_key

router = APIRouter()

@router.get("/me")
async def get_current_user(
    db: AsyncSession = Depends(get_db),
    auth: Dict[str, Any] = Depends(verify_api_key),
):
    """
    Get the current user information.
    """
    # Extract user info from auth
    user_id = auth.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid user authentication required",
        )
    
    # TODO: Implement actual user lookup
    
    return {
        "id": user_id,
        "message": "User endpoint is under development"
    } 