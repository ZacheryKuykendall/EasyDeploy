import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as yaml from 'js-yaml';
import { exec } from 'child_process';

/**
 * Client for interacting with the EasyDeploy API
 */
export class EasyDeployClient {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        
        // Get the API URL from settings or use default
        const config = vscode.workspace.getConfiguration('easydeploy');
        this.baseUrl = config.get<string>('apiUrl') || 'https://api.easydeploy.io/v1';
    }

    /**
     * Deploy an application using the config file
     */
    public async deploy(configPath: string): Promise<any> {
        try {
            // Read the config file
            const configContent = fs.readFileSync(configPath, 'utf8');
            const config = yaml.load(configContent) as any;

            if (!config) {
                throw new Error('Invalid configuration file');
            }

            // Prepare the deployment request
            const deployData = {
                name: config.name,
                type: config.type,
                platform: config.platform,
                region: config.region,
                resources: config.resources,
                env_vars: config.env || {}
            };

            // Make the request to the API
            const response = await axios.post(`${this.baseUrl}/deployments`, deployData, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                deployment_id: response.data.id
            };
        } catch (error: any) {
            console.error('Deployment error:', error);
            return {
                success: false,
                error: error.message || 'Unknown error occurred'
            };
        }
    }

    /**
     * List all deployments
     */
    public async listDeployments(appName?: string, limit: number = 10): Promise<any[]> {
        try {
            // Build URL with query parameters
            let url = `${this.baseUrl}/deployments`;
            const params = new URLSearchParams();
            
            if (appName) {
                params.append('app_name', appName);
            }
            
            params.append('limit', limit.toString());
            
            // Append parameters if any exist
            if (params.toString()) {
                url += `?${params.toString()}`;
            }
            
            console.log(`Calling API: GET ${url}`);
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            console.log('API response status:', response.status);
            console.log('API response data:', JSON.stringify(response.data).substring(0, 200) + '...');
            
            // Handle both response formats:
            // 1. {deployments: [...]} 
            // 2. Direct array of deployments
            if (response.data.deployments) {
                return response.data.deployments || [];
            } else if (Array.isArray(response.data)) {
                return response.data;
            } else {
                console.warn('Unexpected response format:', response.data);
                return [];
            }
        } catch (error: any) {
            console.error('Error listing deployments:', error);
            // Add more detailed error info
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
                console.error('Response headers:', error.response.headers);
                throw new Error(`API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                // The request was made but no response was received
                console.error('No response received:', error.request);
                throw new Error('No response received from API server');
            } else {
                // Something happened in setting up the request that triggered an Error
                console.error('Request error:', error.message);
                throw new Error(error.message || 'Failed to list deployments');
            }
        }
    }

    /**
     * Get deployment status
     */
    public async getStatus(deploymentId: string): Promise<any> {
        try {
            const response = await axios.get(`${this.baseUrl}/deployments/${deploymentId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('Error getting deployment status:', error);
            throw new Error(error.message || 'Failed to get deployment status');
        }
    }

    /**
     * Get deployment logs
     */
    public async getLogs(deploymentId: string): Promise<string> {
        try {
            const response = await axios.get(`${this.baseUrl}/deployments/${deploymentId}/logs`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return response.data.logs || 'No logs available';
        } catch (error: any) {
            console.error('Error getting logs:', error);
            throw new Error(error.message || 'Failed to get logs');
        }
    }

    /**
     * Remove a deployment
     */
    public async remove(deploymentId: string): Promise<any> {
        try {
            const response = await axios.delete(`${this.baseUrl}/deployments/${deploymentId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return {
                success: true,
                message: response.data.message || 'Deployment removed successfully'
            };
        } catch (error: any) {
            console.error('Error removing deployment:', error);
            return {
                success: false,
                error: error.message || 'Failed to remove deployment'
            };
        }
    }

    /**
     * Get current user information
     */
    public async getUserInfo(): Promise<any> {
        try {
            const response = await axios.get(`${this.baseUrl}/user`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return response.data;
        } catch (error: any) {
            console.error('Error getting user info:', error);
            throw new Error(error.message || 'Failed to get user information');
        }
    }

    // Get list of user's domains
    async getDomains(): Promise<string[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/domains`, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            return response.data.domains || [];
        } catch (error) {
            console.error('Error fetching domains:', error);
            throw error;
        }
    }

    // Add a new domain
    async addDomain(domain: string): Promise<{ success: boolean, error?: string }> {
        try {
            const response = await axios.post(`${this.baseUrl}/domains`, 
                { domain },
                { headers: { 'Authorization': `Bearer ${this.apiKey}` } }
            );
            return { success: true };
        } catch (error: any) {
            console.error('Error adding domain:', error);
            return { 
                success: false, 
                error: error.response?.data?.message || error.message 
            };
        }
    }

    // Redeploy an existing application
    async redeploy(deploymentId: string): Promise<{ success: boolean, deployment_id?: string, error?: string }> {
        try {
            const response = await axios.post(`${this.baseUrl}/deployments/${deploymentId}/redeploy`, 
                {},
                { headers: { 'Authorization': `Bearer ${this.apiKey}` } }
            );
            return { 
                success: true, 
                deployment_id: response.data.deployment_id 
            };
        } catch (error: any) {
            console.error('Error redeploying application:', error);
            return { 
                success: false, 
                error: error.response?.data?.message || error.message 
            };
        }
    }

    /**
     * Test connection to the API
     */
    public async testConnection(): Promise<{success: boolean, message: string}> {
        try {
            console.log(`Testing connection to API: ${this.baseUrl}`);
            
            const response = await axios.get(`${this.baseUrl}/health`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: 10000 // 10 second timeout
            });

            return {
                success: true,
                message: `Connected successfully to ${this.baseUrl}`
            };
        } catch (error: any) {
            console.error('API connection test failed:', error);
            
            let errorMessage = 'Failed to connect to API';
            
            if (error.response) {
                // The request was made and the server responded with a status code
                errorMessage = `API responded with status ${error.response.status}`;
            } else if (error.request) {
                // The request was made but no response was received
                errorMessage = `No response from server at ${this.baseUrl}`;
            } else {
                // Something happened in setting up the request
                errorMessage = `Connection error: ${error.message}`;
            }
            
            return {
                success: false,
                message: errorMessage
            };
        }
    }
} 