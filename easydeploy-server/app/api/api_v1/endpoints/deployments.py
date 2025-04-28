from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from app.api.api_v1.schemas.deployment import DeployRequest, DeployResponse
from app.db.session import get_db
from app.db.repositories.deployment_repository import create_deployment
from app.core.security import verify_api_key
from app.workers.tasks import enqueue_deploy

router = APIRouter()

@router.post("", response_model=DeployResponse, status_code=status.HTTP_202_ACCEPTED)
async def deploy_application(
    request: DeployRequest,
    db: AsyncSession = Depends(get_db),
    auth: Dict[str, Any] = Depends(verify_api_key),
):
    """
    Deploy an application based on the provided configuration.
    
    This endpoint accepts the deployment configuration and queues a deployment job.
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
    if "write:deployments" not in scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key does not have the required scope (write:deployments)",
        )
    
    # Generate a job ID
    deploy_response = DeployResponse()
    job_id = deploy_response.job_id
    
    # Create deployment record
    config = request.config
    deployment = await create_deployment(
        db=db,
        job_id=job_id,
        app_name=config.app_name,
        user_id=user_id,
        provider=config.provider.value,
        region=config.region,
        runtime=config.runtime.value,
        config=config.dict(),
    )
    
    # Enqueue the deployment job
    enqueue_deploy(
        job_id=job_id,
        config=config.dict(),
        user_id=user_id,
    )
    
    return deploy_response

@router.delete("", status_code=status.HTTP_202_ACCEPTED)
async def remove_deployment(
    app_name: str,
    db: AsyncSession = Depends(get_db),
    auth: Dict[str, Any] = Depends(verify_api_key),
):
    """
    Remove an application deployment.
    
    This endpoint marks a deployment for removal and queues a cleanup job.
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
    if "write:deployments" not in scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key does not have the required scope (write:deployments)",
        )
        
    # Get the latest deployment for this app
    from app.db.repositories.deployment_repository import get_deployments_by_app_name
    deployments = await get_deployments_by_app_name(db, app_name, user_id, limit=1)
    
    if not deployments:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active deployment found for {app_name}",
        )
    
    # Enqueue removal job
    from app.workers.tasks import enqueue_remove
    deployment = deployments[0]
    enqueue_remove(
        job_id=deployment.job_id,
        app_name=app_name,
        user_id=user_id,
    )
    
    return {"message": f"Removal of {app_name} has been queued", "job_id": deployment.job_id} 