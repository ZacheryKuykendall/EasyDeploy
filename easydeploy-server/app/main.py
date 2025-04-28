from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import time
import os

from app.api.api_v1.api import api_router
from app.core.config import settings
from app.db.session import init_db
from app.core.security import verify_api_key

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="EasyDeploy API",
    description="API for deploying applications to cloud providers",
    version="0.1.0",
    docs_url="/docs" if os.getenv("ENVIRONMENT") == "development" else None,
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(api_router, prefix="/api/v1")

# Request timing middleware
@app.middleware("http")
async def add_process_time_header(request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

@app.on_event("startup")
async def startup_db_client():
    await init_db()
    logger.info("Database initialized")

@app.get("/healthcheck", tags=["healthcheck"])
async def healthcheck():
    return {"status": "healthy"}

@app.get("/", tags=["root"])
async def root():
    return {
        "message": "Welcome to EasyDeploy API",
        "docs": "/docs",
        "healthcheck": "/healthcheck"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True) 