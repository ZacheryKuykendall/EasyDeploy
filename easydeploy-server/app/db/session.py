from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import logging

from app.core.config import settings

# Convert standard PostgreSQL URL to asyncpg URL
if settings.DATABASE_URL.startswith("postgresql://"):
    SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
else:
    SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# Create async engine
engine = create_async_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=False,
    future=True,
)

# Create async session factory
AsyncSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Create base class for models
Base = declarative_base()

# Logger for DB operations
logger = logging.getLogger(__name__)

async def init_db():
    """Initialize the database, creating tables if needed"""
    try:
        # Create tables
        async with engine.begin() as conn:
            # Uncomment to create tables during startup, but this should be 
            # handled by migrations in production
            # await conn.run_sync(Base.metadata.create_all)
            pass
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise

async def get_db():
    """Get database session - use as dependency in route handlers"""
    db = AsyncSessionLocal()
    try:
        yield db
    finally:
        await db.close() 