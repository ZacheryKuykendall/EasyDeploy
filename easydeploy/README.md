# EasyDeploy

A lightweight Python library/CLI that allows users to deploy applications instantly to AWS, GCP, or Azure, similar to platforms like Replit or Lovable.

## Installation

```bash
pip install easydeploy
```

## Quick Start

1. Initialize a new EasyDeploy configuration:
```bash
easydeploy init
```

2. Edit the generated `easydeploy.yaml` file to configure your deployment

3. Deploy your application:
```bash
easydeploy deploy
```

4. Check the status of your deployment:
```bash
easydeploy status
```

## Configuration (easydeploy.yaml)

```yaml
app_name: my-project
provider: aws  # aws, gcp, azure
region: us-west-2
runtime: docker
build:
  dockerfile: Dockerfile
env:
  - KEY=VALUE
```

## Commands

- `easydeploy init`: Generate initial configuration file
- `easydeploy deploy`: Deploy application
- `easydeploy status`: Check deployment status
- `easydeploy logs`: View deployment logs
- `easydeploy remove`: Remove deployment

## VS Code Extension

For an even smoother experience, try our Visual Studio Code extension:
1. Search for "EasyDeploy" in the VS Code Extensions marketplace
2. Install the extension
3. Use the Deploy button or Command Palette for one-click deployments 