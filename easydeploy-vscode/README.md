# EasyDeploy

A VS Code extension for deploying applications instantly to AWS, GCP, or Azure with a single click.

## Features

- **Deploy Button**: Click the deploy button in the status bar to instantly deploy your application
- **Deployment Status**: View the status of your deployments in the Activity Bar
- **Real-time Logs**: See deployment logs directly in VS Code
- **Configuration Editor**: Edit your deployment configuration with syntax highlighting and validation
- **Dashboard Widget**: Monitor and manage your deployments with a convenient widget interface

## Requirements

- Python 3.7 or higher
- EasyDeploy CLI (`pip install easydeploy`)
- Docker (for containerized deployments)

## Installation

1. Install the extension from the VS Code Marketplace
2. Install the EasyDeploy CLI: `pip install easydeploy`
3. Initialize your project with `easydeploy init` or use the command palette and select "EasyDeploy: Initialize Configuration"

## Usage

### Initialize a Project

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Select "EasyDeploy: Initialize Configuration"
3. Edit the generated `easydeploy.yaml` file to configure your deployment

### Deploy an Application

1. Click the "Deploy" button in the status bar, or
2. Right-click on the `easydeploy.yaml` file and select "Deploy Application", or
3. Open the Command Palette and select "EasyDeploy: Deploy Application"

### Check Deployment Status

1. Open the EasyDeploy sidebar in the Activity Bar
2. Click on a deployment to view its logs
3. Use the Command Palette and select "EasyDeploy: Check Deployment Status"

### Using the Dashboard Widget

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Select "EasyDeploy: Open Dashboard Widget"
3. Use the widget to:
   - Deploy your application
   - View deployment status
   - Check logs
   - Remove deployments
   - Monitor application info

## Extension Settings

This extension contributes the following settings:

* `easydeploy.apiKey`: API Key for EasyDeploy service
* `easydeploy.apiEndpoint`: EasyDeploy API endpoint URL

## Release Notes

### 0.1.0

Initial release of EasyDeploy VS Code extension with:
- Basic deployment functionality
- Status checking
- Log viewing
- Dashboard widget for monitoring and managing deployments

## License

MIT

---

## About EasyDeploy

EasyDeploy is a lightweight deployment tool that makes it easy to deploy applications to major cloud providers with minimal configuration. 