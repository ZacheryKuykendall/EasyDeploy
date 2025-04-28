# EasyDeploy Server

The server component of the EasyDeploy platform, responsible for handling deployment requests and managing cloud resources.

## Architecture

```
[Client (CLI or VS Code Extension)]
            |
            V
       FastAPI API
            |
            V
  +-------------------+
  |                   |
  | PostgreSQL        |
  | (Deployment Data) |
  |                   |
  +-------------------+
            |
            V
  +-------------------+
  |                   |
  | Celery Workers    |
  | (Async Tasks)     |
  |                   |
  +-------------------+
            |
            V
  +-------------------+
  |                   |
  | Cloud Provider    |
  | SDKs/APIs         |
  |                   |
  +-------------------+
```

## Setup

### Requirements

- Python 3.9+
- Docker and Docker Compose
- PostgreSQL
- Redis

### Local Development

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run with Docker Compose (recommended):
   ```bash
   docker-compose up
   ```

   This will start:
   - FastAPI server
   - PostgreSQL database
   - Redis for Celery
   - Celery workers

4. Or run components separately:
   ```bash
   # Run the API server
   uvicorn app.main:app --reload

   # Run Celery worker
   celery -A app.workers.celery_app worker --loglevel=info
   ```

5. Access the API documentation at: http://localhost:8000/docs

## API Endpoints

### Deployment

- `POST /api/v1/deploy` - Deploy an application
- `DELETE /api/v1/deploy` - Remove a deployment

### Status

- `GET /api/v1/status/{job_id}` - Get deployment status
- `GET /api/v1/status?app_name={app_name}` - List deployments

### Logs

- `GET /api/v1/logs/{job_id}` - Get deployment logs

### Users

- `GET /api/v1/users/me` - Get current user

### API Keys

- `GET /api/v1/api-keys` - List API keys
- `POST /api/v1/api-keys` - Create new API key
- `DELETE /api/v1/api-keys/{api_key_id}` - Revoke API key

## Database Migrations

Database migrations are managed with Alembic:

```bash
# Create a new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head
```

## Environment Variables

Create a `.env` file with the following variables:

```
DATABASE_URL=postgresql://postgres:postgres@db:5432/easydeploy
REDIS_URL=redis://redis:6379/0
SECRET_KEY=change_this_in_production
ENVIRONMENT=development
```

## Cloud Provider Configuration

For AWS:
```
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=us-west-2
```

For GCP:
```
GCP_PROJECT_ID=your_project_id
GCP_CREDENTIALS_JSON=path_to_credentials.json
```

For Azure:
```
AZURE_SUBSCRIPTION_ID=your_subscription_id
AZURE_TENANT_ID=your_tenant_id
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret
``` 