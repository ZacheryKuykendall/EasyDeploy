from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.api.api_v1.schemas.deployment import DeploymentStatusResponse, DeploymentListResponse, StatusEnum
from app.db.session import get_db
from app.db.repositories.deployment_repository import get_deployment_by_job_id, get_deployments_by_app_name
from app.core.security import verify_api_key

router = APIRouter()

@router.get("/{job_id}", response_model=DeploymentStatusResponse)
async def get_deployment_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    auth: Dict[str, Any] = Depends(verify_api_key),
):
    """
    Get the status of a deployment by job ID.
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
    
    # Format response
    response = DeploymentStatusResponse(
        job_id=deployment.job_id,
        app_name=deployment.app_name,
        status=StatusEnum(deployment.status),
        url=deployment.url,
        started_at=deployment.started_at,
        completed_at=deployment.completed_at,
        error=deployment.error,
    )
    
    # Add a message based on status
    if response.status == StatusEnum.pending:
        response.message = "Deployment is queued and waiting to start"
    elif response.status == StatusEnum.in_progress:
        duration = ""
        if response.started_at:
            elapsed = (datetime.utcnow() - response.started_at).total_seconds()
            duration = f" (running for {int(elapsed)}s)"
        response.message = f"Deployment is in progress{duration}"
    elif response.status == StatusEnum.completed:
        response.message = "Deployment completed successfully"
    elif response.status == StatusEnum.failed:
        response.message = f"Deployment failed: {response.error or 'Unknown error'}"
    
    return response

@router.get("", response_model=DeploymentListResponse)
async def list_deployments(
    app_name: str,
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    auth: Dict[str, Any] = Depends(verify_api_key),
):
    """
    List deployments for an application.
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
    
    # Get deployments
    deployments = await get_deployments_by_app_name(db, app_name, user_id, limit)
    
    # Format response
    deployment_responses = []
    for deployment in deployments:
        deployment_responses.append(
            DeploymentStatusResponse(
                job_id=deployment.job_id,
                app_name=deployment.app_name,
                status=StatusEnum(deployment.status),
                url=deployment.url,
                started_at=deployment.started_at,
                completed_at=deployment.completed_at,
                error=deployment.error,
            )
        )
    
    return DeploymentListResponse(deployments=deployment_responses) 