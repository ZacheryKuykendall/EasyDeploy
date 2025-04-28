"""
EasyDeploy CLI - Main command line interface
"""

import os
import sys
import click
import yaml
import json
import time
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
from colorama import init, Fore, Style
from tabulate import tabulate
import docker

from .client import EasyDeployClient

# Initialize colorama
init(autoreset=True)

# Constants
API_KEY_ENV = "EASYDEPLOY_API_KEY"
API_URL_ENV = "EASYDEPLOY_API_URL"
CONFIG_FILE = "easydeploy.yaml"
CONFIG_DIR = Path.home() / ".easydeploy"
CREDENTIALS_FILE = CONFIG_DIR / "credentials.json"

class Config:
    def __init__(self):
        self.api_key = os.environ.get(API_KEY_ENV)
        self.api_url = os.environ.get(API_URL_ENV)
        self.client = None
        self.verbose = False
        
        # Load credentials from file if not in environment
        if not self.api_key and CREDENTIALS_FILE.exists():
            try:
                with open(CREDENTIALS_FILE, 'r') as f:
                    credentials = json.load(f)
                    self.api_key = credentials.get('api_key')
                    self.api_url = credentials.get('api_url') or self.api_url
            except Exception as e:
                click.echo(f"Warning: Could not load credentials: {e}", err=True)
        
        # Initialize client if we have an API key
        if self.api_key:
            self.client = EasyDeployClient(self.api_key, self.api_url)

# Pass configuration to all commands
pass_config = click.make_pass_decorator(Config, ensure=True)

def print_error(message):
    """Print error message in red"""
    click.echo(f"{Fore.RED}Error: {message}{Style.RESET_ALL}")

def print_success(message):
    """Print success message in green"""
    click.echo(f"{Fore.GREEN}{message}{Style.RESET_ALL}")

def print_info(message):
    """Print info message in blue"""
    click.echo(f"{Fore.BLUE}{message}{Style.RESET_ALL}")

def print_warning(message):
    """Print warning message in yellow"""
    click.echo(f"{Fore.YELLOW}{message}{Style.RESET_ALL}")

def read_config() -> Dict[str, Any]:
    """Read configuration from easydeploy.yaml"""
    try:
        with open(CONFIG_FILE, 'r') as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        print_error(f"Configuration file '{CONFIG_FILE}' not found. Run 'easydeploy init' first.")
        sys.exit(1)
    except yaml.YAMLError as e:
        print_error(f"Error parsing {CONFIG_FILE}: {e}")
        sys.exit(1)

def ensure_config_dir():
    """Ensure the config directory exists"""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

def save_credentials(api_key: str, api_url: Optional[str] = None):
    """Save API credentials to file"""
    ensure_config_dir()
    
    credentials = {
        'api_key': api_key
    }
    
    if api_url:
        credentials['api_url'] = api_url
    
    with open(CREDENTIALS_FILE, 'w') as f:
        json.dump(credentials, f)

def ensure_client(config: Config):
    """Ensure we have a client or exit"""
    if not config.api_key:
        print_error(f"API key not found. Set {API_KEY_ENV} environment variable or run 'easydeploy login'")
        sys.exit(1)
    
    if not config.client:
        config.client = EasyDeployClient(config.api_key, config.api_url)
    
    return config.client

@click.group()
@click.option('--verbose', '-v', is_flag=True, help='Enable verbose output')
@click.version_option()
@pass_config
def cli(config, verbose):
    """EasyDeploy - Deploy applications instantly to AWS, GCP, or Azure"""
    config.verbose = verbose

@cli.command()
def init():
    """Initialize a new EasyDeploy configuration file"""
    if os.path.exists(CONFIG_FILE):
        if not click.confirm(f"{CONFIG_FILE} already exists. Overwrite?"):
            return
    
    example = {
        "app_name": os.path.basename(os.getcwd()),
        "provider": "aws",
        "region": "us-west-2",
        "runtime": "docker",
        "build": {"dockerfile": "Dockerfile"},
        "networking": {
            "port": 8080,
            "public": True
        },
        "env": []
    }
    
    with open(CONFIG_FILE, "w") as f:
        yaml.dump(example, f, default_flow_style=False)
    
    print_success(f"{CONFIG_FILE} created successfully.")
    
    # Check if we need to login
    if not os.environ.get(API_KEY_ENV) and not CREDENTIALS_FILE.exists():
        print_info("\nTip: Run 'easydeploy login' to connect to your EasyDeploy account")
    
    click.echo(f"\nNext step: Edit {CONFIG_FILE} to configure your application")

@cli.command()
@click.option('--api-key', help='Your EasyDeploy API key')
@click.option('--api-url', help='URL of the EasyDeploy API server (optional)')
def login(api_key, api_url):
    """Save your EasyDeploy API credentials"""
    if not api_key:
        api_key = click.prompt("Enter your EasyDeploy API key", hide_input=True)
    
    if not api_url:
        api_url = click.prompt("Enter API server URL (or press Enter for default)", default="", show_default=False)
    
    # Save the credentials
    save_credentials(api_key, api_url if api_url else None)
    print_success("Credentials saved successfully.")
    
    # Test the credentials
    try:
        client = EasyDeployClient(api_key, api_url)
        user_info = client.get_user_info()
        print_success(f"Successfully authenticated!")
    except Exception as e:
        print_warning(f"Credentials saved, but authentication test failed: {e}")
        return

@cli.command()
@pass_config
def deploy(config):
    """Deploy your application to the cloud"""
    # Ensure we have a client
    client = ensure_client(config)
    
    # Read deployment configuration
    cfg = read_config()
    app_name = cfg.get('app_name')
    
    if not app_name:
        print_error("app_name is required in configuration file")
        sys.exit(1)
    
    print_info(f"Deploying {app_name}...")
    
    # Build Docker image if needed
    if cfg.get('runtime') == 'docker':
        dockerfile = cfg.get('build', {}).get('dockerfile', 'Dockerfile')
        if not os.path.exists(dockerfile):
            print_error(f"Dockerfile '{dockerfile}' not found")
            sys.exit(1)
        
        print_info("Building Docker image...")
        try:
            docker_client = docker.from_env()
            image, build_logs = docker_client.images.build(
                path=".",
                dockerfile=dockerfile,
                tag=f"{app_name}:latest",
                rm=True
            )
            print_success("Docker image built successfully")
        except Exception as e:
            print_error(f"Error building Docker image: {e}")
            sys.exit(1)
    
    # Call the deployment API
    try:
        # Deploy the application
        response = client.deploy(cfg)
        job_id = response.get('job_id')
        
        print_success(f"Deployment started, job ID: {job_id}")
        print_info("Checking deployment status...")
        
        # Poll for status
        for _ in range(10):  # Poll 10 times with increasing delays
            time.sleep(3)
            status_data = client.get_status(job_id)
            status = status_data.get('status')
            message = status_data.get('message', '')
            
            if status == 'completed':
                url = status_data.get('url', 'N/A')
                print_success(f"Deployment completed successfully! Your app is running at: {url}")
                return
            elif status == 'failed':
                print_error(f"Deployment failed: {status_data.get('error', 'Unknown error')}")
                sys.exit(1)
            else:
                print_info(f"Status: {status} - {message}")
        
        print_info(f"Deployment is still in progress. Run 'easydeploy status {job_id}' to check the status.")
        
    except Exception as e:
        print_error(f"Deployment failed: {e}")
        sys.exit(1)

@cli.command()
@click.argument('job_id', required=False)
@pass_config
def status(config, job_id):
    """Check the status of a deployment"""
    client = ensure_client(config)
    
    try:
        if job_id:
            # Get status of a specific deployment
            status_data = client.get_status(job_id)
            
            # Print the deployment status
            status = status_data.get('status')
            message = status_data.get('message', '')
            app_name = status_data.get('app_name')
            url = status_data.get('url', 'N/A')
            
            if status == 'completed':
                print_success(f"Deployment of {app_name} completed successfully!")
                click.echo(f"URL: {url}")
            elif status == 'failed':
                print_error(f"Deployment of {app_name} failed: {status_data.get('error', 'Unknown error')}")
            else:
                print_info(f"Status of {app_name}: {status} - {message}")
            
            # Show timestamps if available
            started_at = status_data.get('started_at')
            completed_at = status_data.get('completed_at')
            
            if started_at:
                click.echo(f"Started: {started_at}")
            if completed_at:
                click.echo(f"Completed: {completed_at}")
            
        else:
            # No job ID provided, list recent deployments
            cfg = read_config()
            app_name = cfg.get('app_name')
            
            if not app_name:
                print_error("app_name is required in configuration file")
                sys.exit(1)
            
            print_info(f"Recent deployments for {app_name}:")
            
            try:
                deployments = client.list_deployments(app_name)
                deployments_list = deployments.get('deployments', [])
                
                if not deployments_list:
                    print_info("No deployments found")
                    return
                
                # Build table data
                table = []
                for d in deployments_list:
                    status_str = d.get('status', 'unknown')
                    if status_str == 'completed':
                        status_str = f"{Fore.GREEN}{status_str}{Style.RESET_ALL}"
                    elif status_str == 'failed':
                        status_str = f"{Fore.RED}{status_str}{Style.RESET_ALL}"
                    elif status_str == 'in_progress':
                        status_str = f"{Fore.BLUE}{status_str}{Style.RESET_ALL}"
                    
                    table.append([
                        d.get('job_id'),
                        status_str,
                        d.get('url', 'N/A'),
                        d.get('started_at', 'N/A')
                    ])
                
                # Print table
                headers = ["Job ID", "Status", "URL", "Started At"]
                click.echo(tabulate(table, headers=headers, tablefmt="simple"))
                
            except Exception as e:
                print_error(f"Error listing deployments: {e}")
                sys.exit(1)
    
    except Exception as e:
        print_error(f"Error checking status: {e}")
        sys.exit(1)

@cli.command()
@click.argument('job_id', required=False)
@pass_config
def logs(config, job_id):
    """View deployment logs"""
    client = ensure_client(config)
    
    # If no job ID provided, try to get the most recent one
    if not job_id:
        cfg = read_config()
        app_name = cfg.get('app_name')
        
        if not app_name:
            print_error("app_name is required in configuration file")
            sys.exit(1)
        
        try:
            deployments = client.list_deployments(app_name, limit=1)
            deployments_list = deployments.get('deployments', [])
            
            if not deployments_list:
                print_error("No deployments found. Please specify a job ID.")
                sys.exit(1)
            
            job_id = deployments_list[0].get('job_id')
            print_info(f"Showing logs for most recent deployment (Job ID: {job_id})")
        except Exception as e:
            print_error(f"Error getting recent deployment: {e}")
            sys.exit(1)
    
    # Get logs
    try:
        logs_data = client.get_logs(job_id)
        logs_list = logs_data.get('logs', [])
        
        if not logs_list:
            print_info("No logs found for this deployment")
            return
        
        # Print logs
        for log in logs_list:
            timestamp = log.get('timestamp')
            level = log.get('level', 'INFO')
            message = log.get('message', '')
            
            # Format timestamp
            try:
                ts = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                timestamp = ts.strftime('%Y-%m-%d %H:%M:%S')
            except:
                pass
            
            # Color based on level
            if level == 'ERROR':
                level_str = f"{Fore.RED}{level}{Style.RESET_ALL}"
            elif level == 'WARNING':
                level_str = f"{Fore.YELLOW}{level}{Style.RESET_ALL}"
            else:
                level_str = f"{Fore.BLUE}{level}{Style.RESET_ALL}"
            
            click.echo(f"{timestamp} [{level_str}] {message}")
    
    except Exception as e:
        print_error(f"Error retrieving logs: {e}")
        sys.exit(1)

@cli.command()
@pass_config
def remove(config):
    """Remove a deployed application"""
    client = ensure_client(config)
    
    # Get app name from config
    cfg = read_config()
    app_name = cfg.get('app_name')
    
    if not app_name:
        print_error("app_name is required in configuration file")
        sys.exit(1)
    
    # Confirm deletion
    if not click.confirm(f"Are you sure you want to remove {app_name}?"):
        return
    
    try:
        # Remove the deployment
        response = client.remove_deployment(app_name)
        job_id = response.get('job_id')
        
        print_success(f"Removal of {app_name} has been initiated.")
        print_info(f"Job ID: {job_id}")
    
    except Exception as e:
        print_error(f"Error removing deployment: {e}")
        sys.exit(1)

@cli.command()
@pass_config
def whoami(config):
    """Display information about the current user"""
    client = ensure_client(config)
    
    try:
        user_info = client.get_user_info()
        click.echo(f"User ID: {user_info.get('id')}")
    except Exception as e:
        print_error(f"Error retrieving user information: {e}")
        sys.exit(1)

if __name__ == '__main__':
    cli() 