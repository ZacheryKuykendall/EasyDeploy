# EasyDeploy for VS Code

Deploy applications instantly to AWS, GCP, or Azure with a single click.

## Features

- Deploy applications directly from VS Code
- Monitor deployment status in real-time
- View deployment logs
- Custom domain management
- Multiple cloud provider support

## Getting Started

1. Install the extension from the VS Code marketplace
2. Open a workspace containing your application
3. Create a `easydeploy.yaml` configuration file or use the "EasyDeploy: Initialize Configuration" command
4. Enter your EasyDeploy API key when prompted
5. Use the "EasyDeploy: Deploy Application" command to deploy

## Configuration

The extension requires an API key from EasyDeploy to function. You can obtain an API key by signing up at [https://easydeploy.io](https://easydeploy.io).

### Settings

- `easydeploy.apiKey`: Your EasyDeploy API key
- `easydeploy.apiUrl`: EasyDeploy API endpoint URL (defaults to `https://api.easydeploy.io/v1`)

## Commands

- **EasyDeploy: Deploy Application** - Deploy the current application
- **EasyDeploy: Initialize Configuration** - Create a new configuration file
- **EasyDeploy: Check Deployment Status** - Check the status of deployments
- **EasyDeploy: View Deployment Logs** - View logs for a deployment
- **EasyDeploy: Remove Deployment** - Remove a deployment
- **EasyDeploy: Open Dashboard Widget** - Open the EasyDeploy dashboard widget
- **EasyDeploy: Edit Configuration** - Open the configuration editor
- **EasyDeploy: Open Deployment Manager** - Open the deployment manager
- **EasyDeploy: Test API Connection** - Test connectivity to the EasyDeploy API

## Troubleshooting

### API Connection Issues

If you're experiencing issues connecting to the EasyDeploy API, try these steps:

1. Use the "EasyDeploy: Test API Connection" command to verify connectivity
2. Check your API key in the settings (`easydeploy.apiKey`)
3. Verify the API URL is correct (`easydeploy.apiUrl`)
4. Check your internet connection and any firewall/proxy settings

### Common Error Messages

- **Authentication failed**: Your API key is invalid or expired. Get a new key from the EasyDeploy dashboard.
- **Server unreachable**: The API server cannot be reached. Check your network connection.
- **API endpoint not found**: The API URL may be incorrect. Verify in settings.

### Logging

The extension logs diagnostic information to output channels named:
- "EasyDeploy"
- "EasyDeploy Status"
- "EasyDeploy Logs"
- "EasyDeploy API Test"

## Support

For support, please visit [https://easydeploy.io/support](https://easydeploy.io/support) or email [support@easydeploy.io](mailto:support@easydeploy.io).

---

## About EasyDeploy

EasyDeploy is a lightweight deployment tool that makes it easy to deploy applications to major cloud providers with minimal configuration. 