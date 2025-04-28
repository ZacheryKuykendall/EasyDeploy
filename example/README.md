# EasyDeploy Sample Application

This is a sample application demonstrating how to use EasyDeploy to deploy a Node.js application to the cloud.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run locally:
   ```bash
   npm run dev
   ```

3. Visit [http://localhost:8080](http://localhost:8080)

## Deployment with EasyDeploy

1. Make sure you have the EasyDeploy CLI installed:
   ```bash
   pip install easydeploy
   ```

2. The `easydeploy.yaml` configuration file is already set up for this project.

3. Deploy the application:
   ```bash
   easydeploy deploy
   ```

4. Check deployment status:
   ```bash
   easydeploy status
   ```

## Configuration

The deployment is configured in the `easydeploy.yaml` file. Key settings:

- `app_name`: The name of your application (sample-app)
- `provider`: The cloud provider (AWS)
- `region`: The region to deploy to (us-west-2)
- `runtime`: The runtime type (docker)
- `build`: Docker build configuration
- `env`: Environment variables for the application
- `resources`: CPU and memory allocation
- `networking`: Port and domain configuration 