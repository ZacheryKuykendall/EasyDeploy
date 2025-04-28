from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, Text, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from app.models.base import BaseModel

class APIKey(BaseModel):
    """API Key model for authenticating API requests"""
    
    key = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # Relations
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    user = relationship("User", back_populates="api_keys")
    
    organization_id = Column(Integer, ForeignKey("organization.id"), nullable=True)
    organization = relationship("Organization", back_populates="api_keys")
    
    # Status
    is_revoked = Column(Boolean, default=False, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    
    # Permissions
    scopes = Column(String, default="read:deployments,write:deployments", nullable=False)
    
    def is_valid(self) -> bool:
        """Check if the API key is valid (not revoked and not expired)"""
        if self.is_revoked:
            return False
        
        if self.expires_at and self.expires_at < datetime.utcnow():
            return False
            
        return True
        
    def update_last_used(self):
        """Update the last_used_at timestamp"""
        self.last_used_at = datetime.utcnow() 