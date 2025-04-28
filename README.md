# EasyDeploy

A lightweight Python library/CLI combined with a VS Code extension that allows users to deploy applications instantly to AWS, GCP, or Azure, similar to platforms like Replit or Lovable.

## System Architecture

```
[Developer IDE or CLI]
        ↓
    Python Library
   (easydeploy CLI)
        ↓
   EasyDeploy Server
  (FastAPI + Workers)
        ↓
 Cloud Providers' APIs
(AWS/GCP/Azure SDKs or Terraform)
        ↓
   Running Application
```

## Components

This repository contains two main components:

1. **Python CLI Package** (`/easydeploy`): A command-line tool for deploying applications
2. **VS Code Extension** (`/easydeploy-vscode`): An extension that integrates the CLI into VS Code for a smoother experience

## Python CLI Installation

```bash
# Install from PyPI
pip install easydeploy

# Or install from source
cd easydeploy
pip install -e .
```

## VS Code Extension Installation

1. Install from VS Code Marketplace (search for "EasyDeploy")
2. Or install from VSIX:
   ```
   cd easydeploy-vscode
   npm install
   npm run package
   # Then install the generated .vsix file in VS Code
   ```

## Quick Start

1. Initialize a new project:
   ```
   easydeploy init
   ```

2. Edit the generated `easydeploy.yaml` configuration file:
   ```yaml
   app_name: my-project
   provider: aws
   region: us-west-2
   runtime: docker
   build:
     dockerfile: Dockerfile
   env:
     - KEY=VALUE
   ```

3. Deploy your application:
   ```
   easydeploy deploy
   ```

4. Check deployment status:
   ```
   easydeploy status
   ```

## Development

### Python CLI

1. Clone the repository
2. Navigate to the `easydeploy` directory
3. Create a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
4. Install in development mode:
   ```
   pip install -e .
   ```

### VS Code Extension

1. Navigate to the `easydeploy-vscode` directory
2. Install dependencies:
   ```
   npm install
   ```
3. Open in VS Code:
   ```
   code .
   ```
4. Press F5 to start debugging

## License

MIT 