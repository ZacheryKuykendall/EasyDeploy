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
    public async listDeployments(): Promise<any[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/deployments`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return response.data.deployments || [];
        } catch (error: any) {
            console.error('Error listing deployments:', error);
            throw new Error(error.message || 'Failed to list deployments');
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
} 