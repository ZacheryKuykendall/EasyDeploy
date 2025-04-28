"""
EasyDeploy API Client - Handles communication with the EasyDeploy server
"""

import os
import json
import requests
from typing import Dict, Any, Optional, List, Union

class EasyDeployClient:
    """Client for interacting with the EasyDeploy API"""
    
    def __init__(self, api_key: str, api_url: Optional[str] = None):
        """Initialize the EasyDeploy client
        
        Args:
            api_key: API key for authentication
            api_url: URL of the EasyDeploy API server (optional)
        """
        self.api_key = api_key
        self.api_url = api_url or os.environ.get("EASYDEPLOY_API_URL", "http://localhost:8000/api/v1")
    
    def _headers(self) -> Dict[str, str]:
        """Get the headers for API requests"""
        return {
            "X-API-KEY": self.api_key,
            "Content-Type": "application/json"
        }
    
    def _handle_response(self, response: requests.Response) -> Dict[str, Any]:
        """Handle API response and extract data
        
        Args:
            response: Response from the API
            
        Returns:
            Dictionary containing the response data
            
        Raises:
            Exception: If the response status code is not 200
        """
        if response.status_code == 401:
            raise Exception("Unauthorized: Invalid API key")
        elif response.status_code == 403:
            raise Exception("Forbidden: Insufficient permissions")
        elif response.status_code >= 400:
            error_msg = "Unknown error"
            try:
                error_data = response.json()
                error_msg = error_data.get("detail", "Unknown error")
            except:
                error_msg = response.text
            
            raise Exception(f"API Error ({response.status_code}): {error_msg}")
        
        return response.json()
    
    def deploy(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Deploy an application
        
        Args:
            config: Deployment configuration
            
        Returns:
            Dictionary containing the deployment job information
        """
        # Prepare the request payload format according to the server API schema
        payload = {"config": config}
        
        response = requests.post(
            f"{self.api_url}/deploy",
            headers=self._headers(),
            json=payload
        )
        
        return self._handle_response(response)
    
    def get_status(self, job_id: str) -> Dict[str, Any]:
        """Get the status of a deployment
        
        Args:
            job_id: Deployment job ID
            
        Returns:
            Dictionary containing the deployment status
        """
        response = requests.get(
            f"{self.api_url}/status/{job_id}",
            headers=self._headers()
        )
        
        return self._handle_response(response)
    
    def list_deployments(self, app_name: str, limit: int = 10) -> Dict[str, Any]:
        """List deployments for an application
        
        Args:
            app_name: Name of the application
            limit: Maximum number of deployments to return
            
        Returns:
            Dictionary containing the list of deployments
        """
        response = requests.get(
            f"{self.api_url}/status?app_name={app_name}&limit={limit}",
            headers=self._headers()
        )
        
        return self._handle_response(response)
    
    def get_logs(self, job_id: str, limit: int = 100) -> Dict[str, Any]:
        """Get logs for a deployment
        
        Args:
            job_id: Deployment job ID
            limit: Maximum number of logs to return
            
        Returns:
            Dictionary containing the deployment logs
        """
        response = requests.get(
            f"{self.api_url}/logs/{job_id}?limit={limit}",
            headers=self._headers()
        )
        
        return self._handle_response(response)
    
    def remove_deployment(self, app_name: str) -> Dict[str, Any]:
        """Remove a deployment
        
        Args:
            app_name: Name of the application to remove
            
        Returns:
            Dictionary containing the removal job information
        """
        response = requests.delete(
            f"{self.api_url}/deploy?app_name={app_name}",
            headers=self._headers()
        )
        
        return self._handle_response(response)
    
    def get_user_info(self) -> Dict[str, Any]:
        """Get information about the current user
        
        Returns:
            Dictionary containing user information
        """
        response = requests.get(
            f"{self.api_url}/users/me",
            headers=self._headers()
        )
        
        return self._handle_response(response) 