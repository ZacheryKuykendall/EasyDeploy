from celery import Celery
import os
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Create Celery app
celery_app = Celery(
    "easydeploy",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.tasks"],
)

# Configure Celery
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_concurrency=os.cpu_count() or 4,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_time_limit=3600,  # 1 hour
    task_soft_time_limit=3300,  # 55 minutes
)

# Define custom task routes
celery_app.conf.task_routes = {
    "app.workers.tasks.deploy": {"queue": "deploy"},
    "app.workers.tasks.build": {"queue": "build"},
    "app.workers.tasks.remove": {"queue": "remove"},
}

# Override the default task with a custom task base
class BaseTask(celery_app.Task):
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        logger.error(f"Task {task_id} failed: {exc}")
        super().on_failure(exc, task_id, args, kwargs, einfo)

    def on_success(self, retval, task_id, args, kwargs):
        logger.info(f"Task {task_id} succeeded: {retval}")
        super().on_success(retval, task_id, args, kwargs)

celery_app.Task = BaseTask 