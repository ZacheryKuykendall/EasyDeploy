"""
EasyDeploy CLI - Main command line interface
"""

import os
import sys
import click
import yaml
import json
import requests
from colorama import init, Fore, Style
from tabulate import tabulate
import docker
import time

# Initialize colorama
init(autoreset=True)

API_ENDPOINT = os.environ.get("EASYDEPLOY_API", "https://api.easydeploy.com")
CONFIG_FILE = "easydeploy.yaml"
API_KEY_ENV = "EASYDEPLOY_API_KEY"

class Config:
    def __init__(self):
        self.api_key = os.environ.get(API_KEY_ENV)
        self.verbose = False

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

def read_config():
    """Read configuration from easydeploy.yaml"""
    try:
        with open(CONFIG_FILE, 'r') as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        print_error(f"Configuration file '{CONFIG_FILE}' not found. Run 'easydeploy init' first.")
        sys.exit(1)
    except yaml.YAMLError as e:
        print_error(f"Error parsing {CONFIG_FILE}: {e}")
        sys.exit(1)

@click.group()
@click.option('--verbose', '-v', is_flag=True, help='Enable verbose output')
@click.version_option()
@pass_config
def cli(config, verbose):
    """EasyDeploy - Deploy applications instantly to AWS, GCP, or Azure"""
    config.verbose = verbose
    
    # Check for API key if needed
    if not config.api_key:
        if os.path.exists(os.path.expanduser("~/.easydeploy")):
            try:
                with open(os.path.expanduser("~/.easydeploy"), 'r') as f:
                    config_data = json.load(f)
                    config.api_key = config_data.get('api_key', '')
            except:
                pass

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
        "env": []
    }
    
    with open(CONFIG_FILE, "w") as f:
        yaml.dump(example, f, default_flow_style=False)
    
    print_success(f"{CONFIG_FILE} created successfully.")
    
    if not os.environ.get(API_KEY_ENV):
        api_key = click.prompt("Enter your EasyDeploy API key (or press Enter to skip)", default="")
        if api_key:
            with open(os.path.expanduser("~/.easydeploy"), 'w') as f:
                json.dump({"api_key": api_key}, f)
            print_success("API key saved.")
    
    click.echo(f"\nNext step: Edit {CONFIG_FILE} to configure your application")

@cli.command()
@pass_config
def deploy(config):
    """Deploy your application to the cloud"""
    cfg = read_config()
    app_name = cfg.get('app_name')
    
    if not app_name:
        print_error("app_name is required in configuration file")
        sys.exit(1)
    
    if not config.api_key:
        print_error(f"API key not found. Set {API_KEY_ENV} environment variable or run 'easydeploy init'")
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
            client = docker.from_env()
            image, build_logs = client.images.build(
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
        headers = {
            "X-API-KEY": config.api_key,
            "Content-Type": "application/json"
        }
        
        response = requests.post(
            f"{API_ENDPOINT}/deploy",
            json=cfg,
            headers=headers
        )
        
        if response.status_code != 200:
            print_error(f"Deployment failed: {response.text}")
            sys.exit(1)
        
        data = response.json()
        job_id = data.get('job_id')
        
        print_success(f"Deployment started, job ID: {job_id}")
        print_info("Checking deployment status...")
        
        # Poll for status
        for _ in range(5):  # Poll 5 times
            time.sleep(2)
            status_response = requests.get(
                f"{API_ENDPOINT}/status/{job_id}",
                headers=headers
            )
            
            if status_response.status_code == 200:
                status_data = status_response.json()
                status = status_data.get('status')
                
                if status == 'completed':
                    url = status_data.get('url', 'N/A')
                    print_success(f"Deployment completed successfully! Your app is running at: {url}")
                    return
                elif status == 'failed':
                    print_error(f"Deployment failed: {status_data.get('error', 'Unknown error')}")
                    sys.exit(1)
                else:
                    print_info(f"Status: {status} - {status_data.get('message', '')}")
        
        print_info(f"Deployment is still in progress. Run 'easydeploy status {job_id}' to check the status.")
        
    except requests.RequestException as e:
        print_error(f"Error communicating with EasyDeploy API: {e}")
        sys.exit(1)

@cli.command()
@click.argument('job_id', required=False)
@pass_config
def status(config, job_id):
    """Check the status of a deployment"""
    if not config.api_key:
        print_error(f"API key not found. Set {API_KEY_ENV} environment variable or run 'easydeploy init'")
        sys.exit(1)
    
    headers = {
        "X-API-KEY": config.api_key,
        "Content-Type": "application/json"
    }
    
    try:
        if job_id:
            # Check specific job
            response = requests.get(
                f"{API_ENDPOINT}/status/{job_id}",
                headers=headers
            )
            
            if response.status_code != 200:
                print_error(f"Error checking status: {response.text}")
                sys.exit(1)
            
            data = response.json()
            status = data.get('status', 'unknown')
            message = data.get('message', '')
            url = data.get('url', 'N/A')
            
            click.echo(f"Job ID: {job_id}")
            if status == 'completed':
                print_success(f"Status: {status}")
                click.echo(f"URL: {url}")
            elif status == 'failed':
                print_error(f"Status: {status}")
                click.echo(f"Error: {data.get('error', 'Unknown error')}")
            else:
                print_info(f"Status: {status}")
                if message:
                    click.echo(f"Message: {message}")
        else:
            # List all jobs
            cfg = read_config()
            app_name = cfg.get('app_name')
            
            response = requests.get(
                f"{API_ENDPOINT}/deployments",
                params={"app_name": app_name},
                headers=headers
            )
            
            if response.status_code != 200:
                print_error(f"Error fetching deployments: {response.text}")
                sys.exit(1)
            
            data = response.json()
            deployments = data.get('deployments', [])
            
            if not deployments:
                click.echo("No deployments found.")
                return
            
            table_data = []
            for dep in deployments:
                status_str = dep.get('status', 'unknown')
                status_colored = status_str
                
                if status_str == 'completed':
                    status_colored = f"{Fore.GREEN}{status_str}{Style.RESET_ALL}"
                elif status_str == 'failed':
                    status_colored = f"{Fore.RED}{status_str}{Style.RESET_ALL}"
                elif status_str == 'in_progress':
                    status_colored = f"{Fore.YELLOW}{status_str}{Style.RESET_ALL}"
                
                table_data.append([
                    dep.get('job_id'),
                    dep.get('app_name'),
                    status_colored,
                    dep.get('created_at'),
                    dep.get('url', 'N/A')
                ])
            
            click.echo(tabulate(
                table_data,
                headers=["Job ID", "App Name", "Status", "Created At", "URL"],
                tablefmt="pretty"
            ))
            
    except requests.RequestException as e:
        print_error(f"Error communicating with EasyDeploy API: {e}")
        sys.exit(1)

@cli.command()
@click.argument('job_id', required=False)
@pass_config
def logs(config, job_id):
    """View deployment logs"""
    if not config.api_key:
        print_error(f"API key not found. Set {API_KEY_ENV} environment variable or run 'easydeploy init'")
        sys.exit(1)
    
    headers = {
        "X-API-KEY": config.api_key,
        "Content-Type": "application/json"
    }
    
    if not job_id:
        # Get the latest job ID
        cfg = read_config()
        app_name = cfg.get('app_name')
        
        try:
            response = requests.get(
                f"{API_ENDPOINT}/deployments",
                params={"app_name": app_name, "limit": 1},
                headers=headers
            )
            
            if response.status_code != 200:
                print_error(f"Error fetching deployments: {response.text}")
                sys.exit(1)
            
            data = response.json()
            deployments = data.get('deployments', [])
            
            if not deployments:
                print_error("No deployments found.")
                return
            
            job_id = deployments[0].get('job_id')
            
        except requests.RequestException as e:
            print_error(f"Error communicating with EasyDeploy API: {e}")
            sys.exit(1)
    
    try:
        response = requests.get(
            f"{API_ENDPOINT}/logs/{job_id}",
            headers=headers
        )
        
        if response.status_code != 200:
            print_error(f"Error fetching logs: {response.text}")
            sys.exit(1)
        
        data = response.json()
        logs = data.get('logs', [])
        
        if not logs:
            click.echo("No logs available for this deployment.")
            return
        
        for log_entry in logs:
            timestamp = log_entry.get('timestamp')
            level = log_entry.get('level', 'INFO').upper()
            message = log_entry.get('message', '')
            
            if level == 'ERROR':
                click.echo(f"{timestamp} {Fore.RED}[{level}]{Style.RESET_ALL} {message}")
            elif level == 'WARNING':
                click.echo(f"{timestamp} {Fore.YELLOW}[{level}]{Style.RESET_ALL} {message}")
            else:
                click.echo(f"{timestamp} [{level}] {message}")
            
    except requests.RequestException as e:
        print_error(f"Error communicating with EasyDeploy API: {e}")
        sys.exit(1)

@cli.command()
@pass_config
def remove(config):
    """Remove your deployed application"""
    if not config.api_key:
        print_error(f"API key not found. Set {API_KEY_ENV} environment variable or run 'easydeploy init'")
        sys.exit(1)
    
    cfg = read_config()
    app_name = cfg.get('app_name')
    
    if not click.confirm(f"Are you sure you want to remove {app_name}?"):
        click.echo("Operation cancelled.")
        return
    
    headers = {
        "X-API-KEY": config.api_key,
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.delete(
            f"{API_ENDPOINT}/deploy",
            json={"app_name": app_name},
            headers=headers
        )
        
        if response.status_code != 200:
            print_error(f"Error removing deployment: {response.text}")
            sys.exit(1)
        
        print_success(f"Application {app_name} removed successfully.")
        
    except requests.RequestException as e:
        print_error(f"Error communicating with EasyDeploy API: {e}")
        sys.exit(1)

if __name__ == "__main__":
    cli() 