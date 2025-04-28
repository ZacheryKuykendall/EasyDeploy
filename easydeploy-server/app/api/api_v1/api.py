from fastapi import APIRouter

from app.api.api_v1.endpoints import deployments, status, logs, users, api_keys

api_router = APIRouter()

api_router.include_router(deployments.router, prefix="/deploy", tags=["deployments"])
api_router.include_router(status.router, prefix="/status", tags=["status"])
api_router.include_router(logs.router, prefix="/logs", tags=["logs"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(api_keys.router, prefix="/api-keys", tags=["api-keys"]) 