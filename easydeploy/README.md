# EasyDeploy CLI

A lightweight Python CLI tool that allows users to deploy applications instantly to AWS, GCP, or Azure through the EasyDeploy server.

## Installation

```bash
pip install easydeploy
```

## Quick Start

1. First, log in to the EasyDeploy service:
```bash
easydeploy login
```

2. Initialize a new EasyDeploy configuration:
```bash
easydeploy init
```

3. Edit the generated `easydeploy.yaml` file to configure your deployment:
```yaml
app_name: my-project
provider: aws  # aws, gcp, azure
region: us-west-2
runtime: docker
build:
  dockerfile: Dockerfile
networking:
  port: 8080
  public: true
env:
  - KEY=VALUE
```

4. Deploy your application:
```bash
easydeploy deploy
```

5. Check the status of your deployment:
```bash
easydeploy status
```

## Environment Variables

- `EASYDEPLOY_API_KEY`: Your API key (alternatively, use `easydeploy login`)
- `EASYDEPLOY_API_URL`: URL of the EasyDeploy API server (defaults to http://localhost:8000/api/v1)

## Commands

- `easydeploy login`: Log in to the EasyDeploy service
- `easydeploy init`: Generate initial configuration file
- `easydeploy deploy`: Deploy application
- `easydeploy status [job_id]`: Check deployment status (specify job ID or see all recent deployments)
- `easydeploy logs [job_id]`: View deployment logs (specify job ID or see most recent deployment logs)
- `easydeploy remove`: Remove deployment
- `easydeploy whoami`: Show current user information

## Configuration (easydeploy.yaml)

```yaml
# Required configuration
app_name: my-project
provider: aws  # aws, gcp, azure
region: us-west-2
runtime: docker  # docker, serverless, static

# Docker configuration (for docker runtime)
build:
  dockerfile: Dockerfile
  context: .
  args:
    - ARG1=value1
    
# Resource configuration
resources:
  cpu: 1
  memory: 1024
  min_instances: 1
  max_instances: 3
  
# Network configuration
networking:
  port: 8080
  public: true
  custom_domain: myapp.example.com
  
# Environment variables
env:
  - DATABASE_URL=postgres://user:password@host:5432/db
  - API_KEY=secret
```

## VS Code Extension

For an even smoother experience, try our Visual Studio Code extension:
1. Search for "EasyDeploy" in the VS Code Extensions marketplace
2. Install the extension
3. Use the Deploy button or Command Palette for one-click deployments 