from sqlalchemy import select, update, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import Optional, List, Dict, Any

from app.models.deployment import Deployment, DeploymentLog
from app.db.session import AsyncSessionLocal

async def create_deployment(
    db: AsyncSession,
    job_id: str,
    app_name: str,
    user_id: int,
    provider: str,
    region: str,
    runtime: str,
    config: Dict[str, Any],
) -> Deployment:
    """Create a new deployment"""
    deployment = Deployment(
        job_id=job_id,
        app_name=app_name,
        user_id=user_id,
        provider=provider,
        region=region,
        runtime=runtime,
        config=config,
        status="pending",
    )
    db.add(deployment)
    await db.commit()
    await db.refresh(deployment)
    
    # Add initial log
    await add_deployment_log(
        db,
        deployment.id,
        "INFO",
        f"Deployment job {job_id} created for {app_name}"
    )
    
    return deployment

async def get_deployment_by_job_id(db: AsyncSession, job_id: str) -> Optional[Deployment]:
    """Get a deployment by its job ID"""
    query = select(Deployment).where(Deployment.job_id == job_id)
    result = await db.execute(query)
    return result.scalars().first()

async def get_deployments_by_app_name(
    db: AsyncSession,
    app_name: str,
    user_id: Optional[int] = None,
    limit: int = 10
) -> List[Deployment]:
    """Get deployments for an app, optionally filtered by user"""
    query = select(Deployment).where(
        Deployment.app_name == app_name,
        Deployment.is_deleted == False
    )
    
    if user_id:
        query = query.where(Deployment.user_id == user_id)
    
    query = query.order_by(desc(Deployment.created_at)).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

async def update_deployment_status(
    db: AsyncSession,
    job_id: str,
    status: str,
    error: Optional[str] = None,
    url: Optional[str] = None,
    resources: Optional[Dict[str, Any]] = None,
) -> Optional[Deployment]:
    """Update the status of a deployment"""
    deployment = await get_deployment_by_job_id(db, job_id)
    if not deployment:
        return None
    
    update_data = {"status": status}
    
    if status == "in_progress" and not deployment.started_at:
        update_data["started_at"] = datetime.utcnow()
    
    if status in ["completed", "failed"]:
        update_data["completed_at"] = datetime.utcnow()
    
    if error:
        update_data["error"] = error
    
    if url:
        update_data["url"] = url
    
    if resources:
        update_data["resources"] = resources
    
    query = (
        update(Deployment)
        .where(Deployment.job_id == job_id)
        .values(**update_data)
    )
    
    await db.execute(query)
    await db.commit()
    
    # Add log entry for the status change
    log_level = "ERROR" if status == "failed" else "INFO"
    log_message = f"Deployment status changed to {status}"
    if error:
        log_message += f": {error}"
    
    await add_deployment_log(
        db,
        deployment.id,
        log_level,
        log_message
    )
    
    # Refresh and return the deployment
    await db.refresh(deployment)
    return deployment

async def add_deployment_log(
    db: AsyncSession,
    deployment_id: int,
    level: str,
    message: str,
    data: Optional[Dict[str, Any]] = None,
) -> DeploymentLog:
    """Add a log entry for a deployment"""
    log = DeploymentLog(
        deployment_id=deployment_id,
        timestamp=datetime.utcnow(),
        level=level,
        message=message,
        data=data
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log

async def get_deployment_logs(
    db: AsyncSession,
    deployment_id: int,
    limit: int = 100
) -> List[DeploymentLog]:
    """Get logs for a deployment"""
    query = (
        select(DeploymentLog)
        .where(DeploymentLog.deployment_id == deployment_id)
        .order_by(DeploymentLog.timestamp)
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all() 