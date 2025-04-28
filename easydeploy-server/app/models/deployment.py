from sqlalchemy import Column, String, Integer, ForeignKey, Text, JSON, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB

from app.models.base import BaseModel

class Deployment(BaseModel):
    """Deployment model representing an application deployment"""
    
    # Identifiers
    job_id = Column(String, unique=True, index=True, nullable=False)
    app_name = Column(String, index=True, nullable=False)
    
    # Ownership
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    user = relationship("User", back_populates="deployments")
    
    # Configuration
    provider = Column(String, nullable=False)  # aws, gcp, azure
    region = Column(String, nullable=False)
    runtime = Column(String, nullable=False)  # docker, serverless, static
    config = Column(JSONB, nullable=False)  # Full configuration as JSON
    
    # Status
    status = Column(String, default="pending", nullable=False)
    # Possible values: pending, in_progress, completed, failed
    
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)
    
    # Result
    url = Column(String, nullable=True)  # Public URL of the deployment
    resources = Column(JSONB, nullable=True)  # Created cloud resources
    
    # Management
    is_active = Column(Boolean, default=True, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

class DeploymentLog(BaseModel):
    """Deployment logs for tracking progress of a deployment"""
    
    deployment_id = Column(Integer, ForeignKey("deployment.id"), nullable=False)
    deployment = relationship("Deployment", backref="logs")
    
    timestamp = Column(DateTime, nullable=False)
    level = Column(String, default="INFO", nullable=False)  # INFO, WARNING, ERROR
    message = Column(Text, nullable=False)
    data = Column(JSONB, nullable=True)  # Additional structured data 