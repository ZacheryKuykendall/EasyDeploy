from pydantic import BaseModel, Field, validator, root_validator
from typing import List, Dict, Any, Optional
from enum import Enum
from datetime import datetime
import uuid

class ProviderEnum(str, Enum):
    aws = "aws"
    gcp = "gcp"
    azure = "azure"

class RuntimeEnum(str, Enum):
    docker = "docker"
    serverless = "serverless"
    static = "static"

class StatusEnum(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    failed = "failed"

class EnvironmentVar(BaseModel):
    key: str
    value: str

class DockerBuildConfig(BaseModel):
    dockerfile: str = "Dockerfile"
    context: str = "."
    args: Optional[List[str]] = None

class ResourceConfig(BaseModel):
    cpu: Optional[int] = 1
    memory: Optional[int] = 1024
    min_instances: Optional[int] = 1
    max_instances: Optional[int] = 1

class NetworkingConfig(BaseModel):
    port: Optional[int] = 8080
    public: Optional[bool] = True
    custom_domain: Optional[str] = None

class DeploymentConfig(BaseModel):
    app_name: str
    provider: ProviderEnum
    region: str
    runtime: RuntimeEnum
    build: Optional[DockerBuildConfig] = None
    env: Optional[List[str]] = None
    resources: Optional[ResourceConfig] = None
    networking: Optional[NetworkingConfig] = None
    
    @validator('app_name')
    def app_name_valid(cls, v):
        if not v or not v.strip():
            raise ValueError('app_name cannot be empty')
        if len(v) > 63:
            raise ValueError('app_name must be 63 characters or less')
        return v
    
    @validator('provider')
    def provider_valid(cls, v):
        return v.lower()
    
    @validator('region')
    def region_valid(cls, v):
        if not v or not v.strip():
            raise ValueError('region cannot be empty')
        return v
    
    @validator('runtime')
    def runtime_valid(cls, v):
        return v.lower()
    
    @root_validator
    def validate_docker_build(cls, values):
        runtime = values.get('runtime')
        build = values.get('build')
        
        if runtime == RuntimeEnum.docker and not build:
            values['build'] = DockerBuildConfig()
        
        return values

class DeployRequest(BaseModel):
    config: DeploymentConfig

class DeployResponse(BaseModel):
    job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    message: str = "Deployment job submitted successfully"

class DeploymentLogEntry(BaseModel):
    timestamp: datetime
    level: str
    message: str
    data: Optional[Dict[str, Any]] = None

class DeploymentStatusResponse(BaseModel):
    job_id: str
    app_name: str
    status: StatusEnum
    url: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    message: Optional[str] = None
    
    @property
    def is_terminal_state(self) -> bool:
        """Check if the deployment is in a terminal state (completed or failed)"""
        return self.status in [StatusEnum.completed, StatusEnum.failed]

class DeploymentListResponse(BaseModel):
    deployments: List[DeploymentStatusResponse]

class DeploymentLogsResponse(BaseModel):
    logs: List[DeploymentLogEntry] 