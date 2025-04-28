from sqlalchemy import Column, Integer, DateTime, func
from sqlalchemy.ext.declarative import declared_attr
from datetime import datetime
import uuid

from app.db.session import Base

class BaseModel(Base):
    """Base model with common fields for all models"""
    
    __abstract__ = True
    
    # Auto-generate table name from class name
    @declared_attr
    def __tablename__(cls):
        return cls.__name__.lower()
    
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    @staticmethod
    def generate_uuid():
        """Generate a unique UUID string"""
        return str(uuid.uuid4()) 