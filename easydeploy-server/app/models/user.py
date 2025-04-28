from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from typing import List, Optional

from app.models.base import BaseModel

class User(BaseModel):
    """User model representing a user in the system"""
    
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)
    
    # Relationships
    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
    deployments = relationship("Deployment", back_populates="user", cascade="all, delete-orphan")
    
    # Organization membership
    organization_id = Column(Integer, ForeignKey("organization.id"), nullable=True)
    organization = relationship("Organization", back_populates="users")
    
    # User preferences
    default_provider = Column(String, nullable=True)  # aws, gcp, azure
    default_region = Column(String, nullable=True)

class Organization(BaseModel):
    """Organization model representing a team or company"""
    
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    billing_email = Column(String, nullable=True)
    
    # Relationships
    users = relationship("User", back_populates="organization")
    api_keys = relationship("APIKey", back_populates="organization", cascade="all, delete-orphan")
    
    # Organization settings
    allowed_providers = Column(String, nullable=True)  # Comma-separated list (aws,gcp,azure) 