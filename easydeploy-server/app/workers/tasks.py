from celery import shared_task, chain, group
import logging
import time
import docker
import boto3
import uuid
import yaml
import os
import json
from typing import Dict, Any, Optional, List
import tempfile
import shutil
import requests
import asyncio
from concurrent.futures import ThreadPoolExecutor
import traceback

from app.workers.celery_app import celery_app
from app.db.session import AsyncSessionLocal
from app.db.repositories.deployment_repository import update_deployment_status, add_deployment_log, get_deployment_by_job_id
from app.core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Task Registry for job submission
def enqueue_deploy(job_id: str, config: Dict[str, Any], user_id: int):
    """Enqueue a deployment job in Celery"""
    task = deploy.delay(job_id, config, user_id)
    logger.info(f"Enqueued deployment job: {job_id}, task_id: {task.id}")
    return task

def enqueue_remove(job_id: str, app_name: str, user_id: int):
    """Enqueue a removal job in Celery"""
    task = remove.delay(job_id, app_name, user_id)
    logger.info(f"Enqueued removal job: {job_id}, task_id: {task.id}")
    return task

# Helper functions
async def _update_status(job_id: str, status: str, error: Optional[str] = None, url: Optional[str] = None, resources: Optional[Dict[str, Any]] = None):
    """Update the status of a deployment in the database"""
    async with AsyncSessionLocal() as db:
        await update_deployment_status(db, job_id, status, error, url, resources)

async def _add_log(job_id: str, level: str, message: str, data: Optional[Dict[str, Any]] = None):
    """Add a log entry for a deployment"""
    async with AsyncSessionLocal() as db:
        deployment = await get_deployment_by_job_id(db, job_id)
        if deployment:
            await add_deployment_log(db, deployment.id, level, message, data)
        else:
            logger.error(f"Could not add log: deployment {job_id} not found")

def run_async(coro):
    """Run an async coroutine from a synchronous context"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

# Main deployment tasks
@shared_task(bind=True, name="app.workers.tasks.deploy")
def deploy(self, job_id: str, config: Dict[str, Any], user_id: int):
    """
    Main deployment task that orchestrates the deployment process
    """
    try:
        # Update status to in_progress
        run_async(_update_status(job_id, "in_progress"))
        run_async(_add_log(job_id, "INFO", f"Starting deployment of {config.get('app_name')}"))
        
        # Deploy based on provider
        provider = config.get("provider", "aws").lower()
        
        if provider == "aws":
            result = deploy_to_aws(self, job_id, config, user_id)
        elif provider == "gcp":
            result = deploy_to_gcp(self, job_id, config, user_id)
        elif provider == "azure":
            result = deploy_to_azure(self, job_id, config, user_id)
        else:
            error = f"Unsupported provider: {provider}"
            run_async(_update_status(job_id, "failed", error=error))
            run_async(_add_log(job_id, "ERROR", error))
            return {"success": False, "error": error}
        
        if result.get("success"):
            run_async(_update_status(
                job_id, 
                "completed", 
                url=result.get("url"),
                resources=result.get("resources")
            ))
            run_async(_add_log(
                job_id, 
                "INFO", 
                f"Deployment completed: {result.get('url')}"
            ))
        else:
            run_async(_update_status(
                job_id, 
                "failed", 
                error=result.get("error")
            ))
            run_async(_add_log(
                job_id, 
                "ERROR", 
                f"Deployment failed: {result.get('error')}"
            ))
        
        return result
    
    except Exception as e:
        error = f"Deployment failed: {str(e)}"
        logger.error(error)
        logger.error(traceback.format_exc())
        run_async(_update_status(job_id, "failed", error=error))
        run_async(_add_log(job_id, "ERROR", error))
        return {"success": False, "error": error}

@shared_task(bind=True, name="app.workers.tasks.remove")
def remove(self, job_id: str, app_name: str, user_id: int):
    """
    Task to remove a deployed application
    """
    try:
        run_async(_add_log(job_id, "INFO", f"Starting removal of {app_name}"))
        
        # Get deployment details from database
        db_session = AsyncSessionLocal()
        deployment = run_async(get_deployment_by_job_id(db_session, job_id))
        
        if not deployment:
            error = f"Deployment {job_id} not found"
            run_async(_add_log(job_id, "ERROR", error))
            return {"success": False, "error": error}
        
        # Get provider from deployment
        provider = deployment.provider.lower()
        resources = deployment.resources or {}
        
        # Remove resources based on provider
        if provider == "aws":
            result = remove_from_aws(self, job_id, app_name, resources)
        elif provider == "gcp":
            result = remove_from_gcp(self, job_id, app_name, resources)
        elif provider == "azure":
            result = remove_from_azure(self, job_id, app_name, resources)
        else:
            error = f"Unsupported provider for removal: {provider}"
            run_async(_add_log(job_id, "ERROR", error))
            return {"success": False, "error": error}
        
        if result.get("success"):
            # Mark deployment as deleted in database
            run_async(_update_status(job_id, "completed", resources={"deleted": True}))
            run_async(_add_log(job_id, "INFO", f"Successfully removed {app_name}"))
        else:
            run_async(_add_log(job_id, "ERROR", f"Failed to remove {app_name}: {result.get('error')}"))
        
        return result
    
    except Exception as e:
        error = f"Removal failed: {str(e)}"
        logger.error(error)
        logger.error(traceback.format_exc())
        run_async(_add_log(job_id, "ERROR", error))
        return {"success": False, "error": error}

# Provider-specific deployment functions
def deploy_to_aws(task, job_id: str, config: Dict[str, Any], user_id: int):
    """
    Deploy to AWS
    """
    # Placeholder for actual AWS deployment logic
    run_async(_add_log(job_id, "INFO", "Starting AWS deployment"))
    
    try:
        app_name = config.get("app_name")
        region = config.get("region", "us-west-2")
        runtime = config.get("runtime", "docker")
        
        # Simulate a deployment process
        run_async(_add_log(job_id, "INFO", f"Building application for AWS in {region}"))
        time.sleep(2)  # Simulate build time
        
        run_async(_add_log(job_id, "INFO", "Pushing to ECR"))
        time.sleep(1)  # Simulate push time
        
        run_async(_add_log(job_id, "INFO", "Deploying to Fargate"))
        time.sleep(2)  # Simulate deployment time
        
        # Generate a fake URL
        url = f"https://{app_name}-{job_id[:8]}.{region}.aws.example.com"
        
        # Record resources created (this would be actual AWS resources in production)
        resources = {
            "ecr_repository": f"{app_name}",
            "cluster": f"{app_name}-cluster",
            "service": f"{app_name}-service",
            "task_definition": f"{app_name}:1",
            "region": region
        }
        
        return {
            "success": True,
            "url": url,
            "resources": resources
        }
        
    except Exception as e:
        error = f"AWS deployment failed: {str(e)}"
        logger.error(error)
        return {"success": False, "error": error}

def deploy_to_gcp(task, job_id: str, config: Dict[str, Any], user_id: int):
    """
    Deploy to Google Cloud Platform
    """
    # Placeholder for actual GCP deployment logic
    run_async(_add_log(job_id, "INFO", "GCP deployment not yet implemented"))
    return {"success": False, "error": "GCP deployment not yet implemented"}

def deploy_to_azure(task, job_id: str, config: Dict[str, Any], user_id: int):
    """
    Deploy to Azure
    """
    # Placeholder for actual Azure deployment logic
    run_async(_add_log(job_id, "INFO", "Azure deployment not yet implemented"))
    return {"success": False, "error": "Azure deployment not yet implemented"}

# Provider-specific removal functions
def remove_from_aws(task, job_id: str, app_name: str, resources: Dict[str, Any]):
    """
    Remove resources from AWS
    """
    # Placeholder for actual AWS removal logic
    run_async(_add_log(job_id, "INFO", f"Removing AWS resources for {app_name}"))
    
    try:
        time.sleep(2)  # Simulate removal time
        
        return {
            "success": True,
            "message": f"Successfully removed {app_name} from AWS"
        }
        
    except Exception as e:
        error = f"AWS removal failed: {str(e)}"
        logger.error(error)
        return {"success": False, "error": error}

def remove_from_gcp(task, job_id: str, app_name: str, resources: Dict[str, Any]):
    """
    Remove resources from GCP
    """
    # Placeholder for actual GCP removal logic
    run_async(_add_log(job_id, "INFO", "GCP removal not yet implemented"))
    return {"success": False, "error": "GCP removal not yet implemented"}

def remove_from_azure(task, job_id: str, app_name: str, resources: Dict[str, Any]):
    """
    Remove resources from Azure
    """
    # Placeholder for actual Azure removal logic
    run_async(_add_log(job_id, "INFO", "Azure removal not yet implemented"))
    return {"success": False, "error": "Azure removal not yet implemented"} 