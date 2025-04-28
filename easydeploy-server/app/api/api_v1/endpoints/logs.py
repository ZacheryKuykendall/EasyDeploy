from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, List

from app.api.api_v1.schemas.deployment import DeploymentLogsResponse, DeploymentLogEntry
from app.db.session import get_db
from app.db.repositories.deployment_repository import get_deployment_by_job_id, get_deployment_logs
from app.core.security import verify_api_key

router = APIRouter()

@router.get("/{job_id}", response_model=DeploymentLogsResponse)
async def get_deployment_logs(
    job_id: str,
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    auth: Dict[str, Any] = Depends(verify_api_key),
):
    """
    Get logs for a deployment by job ID.
    """
    # Extract user info from auth
    user_id = auth.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid user authentication required",
        )
    
    # Check for required scope
    scopes = auth.get("scopes", "").split(",")
    if "read:deployments" not in scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key does not have the required scope (read:deployments)",
        )
    
    # Get deployment
    deployment = await get_deployment_by_job_id(db, job_id)
    if not deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Deployment with job_id {job_id} not found",
        )
    
    # Verify ownership
    if deployment.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this deployment",
        )
    
    # Get logs
    logs = await get_deployment_logs(db, deployment.id, limit)
    
    # Format response
    log_entries = []
    for log in logs:
        log_entries.append(
            DeploymentLogEntry(
                timestamp=log.timestamp,
                level=log.level,
                message=log.message,
                data=log.data,
            )
        )
    
    return DeploymentLogsResponse(logs=log_entries) 