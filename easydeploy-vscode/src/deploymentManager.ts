import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { EasyDeployClient } from './client';

/**
 * A class that provides a user-friendly interface for managing deployments
 */
export class DeploymentManager {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];
    private client: EasyDeployClient | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Initialize the client with the API key from settings
     */
    private async initClient(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('easydeploy');
        const apiKey = config.get<string>('apiKey');
        
        if (!apiKey) {
            const result = await vscode.window.showErrorMessage(
                'EasyDeploy API key not found. Please configure it in settings.',
                'Open Settings'
            );
            
            if (result === 'Open Settings') {
                await vscode.commands.executeCommand('workbench.action.openSettings', 'easydeploy.apiKey');
            }
            return false;
        }

        this.client = new EasyDeployClient(apiKey);
        return true;
    }

    /**
     * Show the deployment manager panel
     */
    public async show() {
        // Initialize the client first
        if (!await this.initClient()) {
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace folder first');
            return;
        }

        // Check if we already have a panel
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Create and show a new webview panel
        this.panel = vscode.window.createWebviewPanel(
            'easydeployManager',
            'EasyDeploy Manager',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath))
                ]
            }
        );

        // Set the webview's HTML content
        this.panel.webview.html = this.getHtml();

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'get-deployments':
                        await this.getDeployments();
                        break;
                    case 'deploy':
                        await this.deploy(message.configPath);
                        break;
                    case 'get-logs':
                        await this.getLogs(message.deploymentId);
                        break;
                    case 'remove':
                        await this.removeDeployment(message.deploymentId);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Reset panel when closed
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // Load deployments immediately when panel is shown
        setTimeout(() => {
            if (this.panel) {
                this.getDeployments();
            }
        }, 500);
    }

    /**
     * Get all deployments and send to webview
     */
    private async getDeployments() {
        if (!this.client || !this.panel) {
            return;
        }

        try {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Fetching deployments...',
                    cancellable: false
                },
                async () => {
                    try {
                        const deployments = await this.client!.listDeployments();
                        if (this.panel && this.panel.webview) {
                            this.panel.webview.postMessage({
                                command: 'deployments-loaded',
                                deployments
                            });
                        }
                    } catch (error) {
                        vscode.window.showErrorMessage(`Error fetching deployments: ${error}`);
                    }
                }
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Error fetching deployments: ${error}`);
        }
    }

    /**
     * Deploy the application using the specified config path
     */
    private async deploy(configPath?: string) {
        if (!this.client || !this.panel) {
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        // If no config path provided, look for easydeploy.yaml in workspace
        if (!configPath) {
            configPath = path.join(workspaceFolders[0].uri.fsPath, 'easydeploy.yaml');
        }

        // Check if config exists
        if (!fs.existsSync(configPath)) {
            vscode.window.showErrorMessage('Configuration file not found. Please create an easydeploy.yaml file first.');
            return;
        }

        // Show progress notification during deployment
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Deploying application...',
                cancellable: false
            },
            async () => {
                try {
                    const result = await this.client!.deploy(configPath!);
                    
                    if (result.success) {
                        vscode.window.showInformationMessage(`Deployment started: ${result.deployment_id}`);
                        
                        // Refresh the deployments list
                        setTimeout(() => this.getDeployments(), 1000);
                    } else {
                        vscode.window.showErrorMessage(`Deployment failed: ${result.error}`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Deployment error: ${error}`);
                }
            }
        );
    }

    /**
     * Get logs for a specific deployment
     */
    private async getLogs(deploymentId: string) {
        if (!this.client || !this.panel) {
            return;
        }

        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Fetching logs...',
                cancellable: false
            },
            async () => {
                try {
                    const logs = await this.client!.getLogs(deploymentId);
                    
                    if (this.panel && this.panel.webview) {
                        this.panel.webview.postMessage({
                            command: 'logs-loaded',
                            deploymentId,
                            logs
                        });
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error fetching logs: ${error}`);
                }
            }
        );
    }

    /**
     * Remove a deployment
     */
    private async removeDeployment(deploymentId: string) {
        if (!this.client || !this.panel) {
            return;
        }

        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to remove deployment ${deploymentId}?`,
            'Yes',
            'No'
        );

        if (result !== 'Yes') {
            return;
        }

        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Removing deployment...',
                cancellable: false
            },
            async () => {
                try {
                    const response = await this.client!.remove(deploymentId);
                    
                    if (response.success) {
                        vscode.window.showInformationMessage(`Deployment ${deploymentId} removed successfully`);
                        
                        // Refresh the deployments list
                        setTimeout(() => this.getDeployments(), 1000);
                    } else {
                        vscode.window.showErrorMessage(`Failed to remove deployment: ${response.error}`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error removing deployment: ${error}`);
                }
            }
        );
    }

    /**
     * Get the HTML for the deployment manager
     */
    private getHtml() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EasyDeploy Manager</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                }
                h1, h2 {
                    color: var(--vscode-editor-foreground);
                    font-weight: normal;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .toolbar {
                    display: flex;
                    gap: 8px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    cursor: pointer;
                    border-radius: 2px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .button-icon {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    margin-right: 6px;
                    vertical-align: middle;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                th, td {
                    padding: 8px 12px;
                    text-align: left;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                th {
                    background-color: var(--vscode-panel-background);
                    font-weight: bold;
                }
                tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .status {
                    display: inline-block;
                    padding: 3px 6px;
                    border-radius: 3px;
                    font-size: 12px;
                }
                .status-running {
                    background-color: var(--vscode-statusBarItem-prominentBackground);
                    color: var(--vscode-statusBarItem-prominentForeground);
                }
                .status-failed {
                    background-color: var(--vscode-errorForeground);
                    color: white;
                }
                .status-completed {
                    background-color: var(--vscode-terminal-ansiGreen);
                    color: white;
                }
                .actions {
                    display: flex;
                    gap: 5px;
                }
                .logs-panel {
                    display: none;
                    background-color: var(--vscode-terminal-background);
                    color: var(--vscode-terminal-foreground);
                    font-family: var(--vscode-editor-font-family);
                    padding: 10px;
                    overflow: auto;
                    height: 300px;
                    margin-top: 20px;
                    border-radius: 3px;
                }
                .deployment-empty {
                    text-align: center;
                    padding: 40px;
                    color: var(--vscode-descriptionForeground);
                }
                .timestamp {
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.85em;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>EasyDeploy Manager</h1>
                <div class="toolbar">
                    <button id="refresh-btn">
                        <span class="button-icon">↻</span> Refresh
                    </button>
                    <button id="deploy-btn">
                        <span class="button-icon">↑</span> Deploy
                    </button>
                </div>
            </div>
            
            <div id="deployments-container">
                <div class="deployment-empty">
                    Loading deployments...
                </div>
            </div>
            
            <div id="logs-panel" class="logs-panel">
                <h2>Logs: <span id="logs-deployment-id"></span></h2>
                <pre id="logs-content"></pre>
            </div>
            
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    let deployments = [];
                    
                    // DOM Elements
                    const refreshBtn = document.getElementById('refresh-btn');
                    const deployBtn = document.getElementById('deploy-btn');
                    const deploymentsContainer = document.getElementById('deployments-container');
                    const logsPanel = document.getElementById('logs-panel');
                    const logsDeploymentId = document.getElementById('logs-deployment-id');
                    const logsContent = document.getElementById('logs-content');
                    
                    // Add event listeners
                    refreshBtn.addEventListener('click', () => {
                        loadDeployments();
                    });
                    
                    deployBtn.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'deploy'
                        });
                    });
                    
                    // Load deployments initially
                    loadDeployments();
                    
                    // Functions
                    function loadDeployments() {
                        deploymentsContainer.innerHTML = '<div class="deployment-empty">Loading deployments...</div>';
                        vscode.postMessage({
                            command: 'get-deployments'
                        });
                    }
                    
                    function renderDeployments() {
                        if (!deployments || deployments.length === 0) {
                            deploymentsContainer.innerHTML = \`
                                <div class="deployment-empty">
                                    <p>No deployments found</p>
                                    <p>Click the Deploy button to create a new deployment</p>
                                </div>
                            \`;
                            return;
                        }
                        
                        // Create table
                        let html = \`
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                        \`;
                        
                        deployments.forEach(deployment => {
                            const statusClass = getStatusClass(deployment.status);
                            const createdDate = new Date(deployment.created_at).toLocaleString();
                            
                            html += \`
                                <tr data-id="\${deployment.id}">
                                    <td>\${deployment.name}</td>
                                    <td><span class="status \${statusClass}">\${deployment.status}</span></td>
                                    <td><span class="timestamp">\${createdDate}</span></td>
                                    <td class="actions">
                                        <button class="logs-btn" data-id="\${deployment.id}">Logs</button>
                                        <button class="remove-btn" data-id="\${deployment.id}">Remove</button>
                                    </td>
                                </tr>
                            \`;
                        });
                        
                        html += \`
                                </tbody>
                            </table>
                        \`;
                        
                        deploymentsContainer.innerHTML = html;
                        
                        // Add event listeners for actions
                        document.querySelectorAll('.logs-btn').forEach(btn => {
                            btn.addEventListener('click', (e) => {
                                const deploymentId = e.target.getAttribute('data-id');
                                showLogs(deploymentId);
                            });
                        });
                        
                        document.querySelectorAll('.remove-btn').forEach(btn => {
                            btn.addEventListener('click', (e) => {
                                const deploymentId = e.target.getAttribute('data-id');
                                removeDeployment(deploymentId);
                            });
                        });
                    }
                    
                    function getStatusClass(status) {
                        switch (status.toLowerCase()) {
                            case 'running':
                            case 'pending':
                            case 'deploying':
                                return 'status-running';
                            case 'failed':
                            case 'error':
                                return 'status-failed';
                            case 'completed':
                            case 'succeeded':
                            case 'success':
                                return 'status-completed';
                            default:
                                return '';
                        }
                    }
                    
                    function showLogs(deploymentId) {
                        logsPanel.style.display = 'block';
                        logsDeploymentId.textContent = deploymentId;
                        logsContent.textContent = 'Loading logs...';
                        
                        vscode.postMessage({
                            command: 'get-logs',
                            deploymentId
                        });
                    }
                    
                    function removeDeployment(deploymentId) {
                        vscode.postMessage({
                            command: 'remove',
                            deploymentId
                        });
                    }
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'deployments-loaded':
                                deployments = message.deployments;
                                renderDeployments();
                                break;
                                
                            case 'logs-loaded':
                                logsContent.textContent = message.logs || 'No logs available';
                                break;
                        }
                    });
                })();
            </script>
        </body>
        </html>`;
    }
} 