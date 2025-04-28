import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import * as yaml from 'js-yaml';

export class EasyDeployWidget {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];
    private refreshInterval: NodeJS.Timeout | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public show() {
        const columnToShowIn = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this.panel) {
            // If panel already exists, reveal it
            this.panel.reveal(columnToShowIn);
            return;
        }

        // Create and show a new panel
        this.panel = vscode.window.createWebviewPanel(
            'easyDeployWidget',
            'EasyDeploy Widget',
            columnToShowIn || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
                ]
            }
        );

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'deploy':
                        await this.executeDeploy();
                        break;
                    case 'status':
                        await this.executeStatus();
                        break;
                    case 'logs':
                        await this.executeLogs(message.jobId);
                        break;
                    case 'refresh':
                        await this.updateWebview();
                        break;
                    case 'remove':
                        await this.executeRemove(message.jobId);
                        break;
                }
            },
            null,
            this.disposables
        );

        // Initial content
        this.panel.webview.html = this.getInitialHtml();
        
        // Update content with deployment info
        this.updateWebview();

        // Set up auto-refresh every 10 seconds
        this.refreshInterval = setInterval(() => {
            if (this.panel) {
                this.updateWebview();
            }
        }, 10000);

        // Clean up resources when panel is closed
        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
                
                // Clear the refresh interval
                if (this.refreshInterval) {
                    clearInterval(this.refreshInterval);
                    this.refreshInterval = undefined;
                }
                
                // Dispose of all disposables
                while (this.disposables.length) {
                    const disposable = this.disposables.pop();
                    if (disposable) {
                        disposable.dispose();
                    }
                }
            },
            null,
            this.disposables
        );
    }

    private getInitialHtml(): string {
        // The HTML content of the widget
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EasyDeploy Widget</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                }
                .container {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .card {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 6px;
                    padding: 16px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }
                h2 {
                    margin: 0;
                    font-size: 16px;
                }
                .actions {
                    display: flex;
                    gap: 8px;
                }
                .deployments {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .deployment {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 12px;
                }
                .deployment-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .status {
                    display: inline-flex;
                    align-items: center;
                    font-size: 12px;
                    padding: 2px 8px;
                    border-radius: 10px;
                }
                .status.completed {
                    background-color: var(--vscode-testing-iconPassed);
                    color: white;
                }
                .status.failed {
                    background-color: var(--vscode-testing-iconFailed);
                    color: white;
                }
                .status.in_progress {
                    background-color: var(--vscode-notificationsInfoIcon);
                    color: white;
                }
                .deployment-info {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    font-size: 12px;
                }
                .deployment-actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 12px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background-color 0.2s;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .loading {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100px;
                }
                .spinner {
                    border: 4px solid rgba(0, 0, 0, 0.1);
                    border-left-color: var(--vscode-progressBar-background);
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .no-deployments {
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    padding: 20px;
                }
                .url-link {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                }
                .url-link:hover {
                    text-decoration: underline;
                }
                .refresh-button {
                    background: transparent;
                    border: none;
                    color: var(--vscode-button-foreground);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    padding: 4px;
                }
                .refresh-button:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }
                .refresh-icon {
                    width: 16px;
                    height: 16px;
                    display: inline-block;
                    margin-right: 4px;
                }
                .last-updated {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 4px;
                }
                .app-info {
                    margin-bottom: 12px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <div class="header">
                        <h2>EasyDeploy Widget</h2>
                        <div class="actions">
                            <button id="refresh-btn" class="refresh-button">
                                <span class="refresh-icon">🔄</span> Refresh
                            </button>
                            <button id="deploy-btn">Deploy Application</button>
                        </div>
                    </div>
                    <div class="app-info" id="app-info">
                        Loading application info...
                    </div>
                    <div class="last-updated" id="last-updated">
                        Last updated: just now
                    </div>
                </div>
                
                <div class="card">
                    <h2>Recent Deployments</h2>
                    <div id="deployments-container">
                        <div class="loading">
                            <div class="spinner"></div>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    // Initial state
                    let state = {
                        deployments: [],
                        appInfo: null,
                        lastUpdated: new Date()
                    };

                    // Restore previous state if any
                    const previousState = vscode.getState();
                    if (previousState) {
                        state = previousState;
                        updateUI();
                    }

                    // Setup event listeners
                    document.getElementById('deploy-btn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'deploy' });
                        showLoading();
                    });

                    document.getElementById('refresh-btn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'refresh' });
                        showLoading();
                    });

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.type) {
                            case 'deployments':
                                state.deployments = message.value;
                                state.lastUpdated = new Date();
                                break;
                            case 'appInfo':
                                state.appInfo = message.value;
                                break;
                            case 'error':
                                // Could show an error message
                                console.error(message.value);
                                break;
                        }
                        
                        vscode.setState(state);
                        updateUI();
                    });

                    function updateUI() {
                        // Update app info
                        const appInfoElement = document.getElementById('app-info');
                        if (state.appInfo) {
                            appInfoElement.innerHTML = \`
                                <strong>App:</strong> \${state.appInfo.appName || 'Unknown'}<br>
                                <strong>Environment:</strong> \${state.appInfo.environment || 'Not specified'}<br>
                                <strong>Framework:</strong> \${state.appInfo.framework || 'Not specified'}
                            \`;
                        } else {
                            appInfoElement.textContent = 'No application information available';
                        }

                        // Update last updated time
                        const lastUpdatedElement = document.getElementById('last-updated');
                        lastUpdatedElement.textContent = \`Last updated: \${formatTimeDifference(state.lastUpdated)}\`;

                        // Update deployments
                        const deploymentsContainer = document.getElementById('deployments-container');
                        
                        if (!state.deployments || state.deployments.length === 0) {
                            deploymentsContainer.innerHTML = \`
                                <div class="no-deployments">
                                    No deployments found. Deploy your application to get started.
                                </div>
                            \`;
                            return;
                        }

                        let html = '<div class="deployments">';
                        
                        state.deployments.forEach(deployment => {
                            html += \`
                                <div class="deployment">
                                    <div class="deployment-header">
                                        <div>\${deployment.name || 'Deployment'}</div>
                                        <div class="status \${deployment.status.toLowerCase()}">\${formatStatus(deployment.status)}</div>
                                    </div>
                                    <div class="deployment-info">
                                        <div><strong>Job ID:</strong> \${deployment.jobId}</div>
                                        <div><strong>Created:</strong> \${deployment.created || 'Unknown'}</div>
                                        \${deployment.url ? \`<div><strong>URL:</strong> <a href="\${deployment.url}" class="url-link" target="_blank">\${deployment.url}</a></div>\` : ''}
                                    </div>
                                    <div class="deployment-actions">
                                        <button onclick="viewLogs('\${deployment.jobId}')">View Logs</button>
                                        \${deployment.status.toLowerCase() === 'completed' ? 
                                            \`<button onclick="removeDeployment('\${deployment.jobId}')">Remove</button>\` : ''}
                                    </div>
                                </div>
                            \`;
                        });
                        
                        html += '</div>';
                        deploymentsContainer.innerHTML = html;
                    }

                    function showLoading() {
                        document.getElementById('deployments-container').innerHTML = \`
                            <div class="loading">
                                <div class="spinner"></div>
                            </div>
                        \`;
                    }

                    function formatStatus(status) {
                        switch (status.toLowerCase()) {
                            case 'completed':
                                return 'Completed';
                            case 'failed':
                                return 'Failed';
                            case 'in_progress':
                                return 'In Progress';
                            default:
                                return status;
                        }
                    }

                    function formatTimeDifference(date) {
                        const now = new Date();
                        const diffMs = now - new Date(date);
                        const diffSec = Math.floor(diffMs / 1000);
                        
                        if (diffSec < 10) {
                            return 'just now';
                        } else if (diffSec < 60) {
                            return \`\${diffSec} seconds ago\`;
                        } else if (diffSec < 3600) {
                            return \`\${Math.floor(diffSec / 60)} minutes ago\`;
                        } else {
                            return \`\${Math.floor(diffSec / 3600)} hours ago\`;
                        }
                    }

                    // Global functions needed for button handlers
                    window.viewLogs = function(jobId) {
                        vscode.postMessage({ command: 'logs', jobId });
                    };

                    window.removeDeployment = function(jobId) {
                        if (confirm('Are you sure you want to remove this deployment?')) {
                            vscode.postMessage({ command: 'remove', jobId });
                            showLoading();
                        }
                    };

                    // Initial refresh
                    vscode.postMessage({ command: 'refresh' });
                })();
            </script>
        </body>
        </html>`;
    }

    private async updateWebview() {
        if (!this.panel) {
            return;
        }

        if (!vscode.workspace.workspaceFolders) {
            this.panel.webview.postMessage({
                type: 'error',
                value: 'No workspace open'
            });
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const configPath = path.join(workspaceRoot, 'easydeploy.yaml');

        // Get app info from config
        try {
            if (fs.existsSync(configPath)) {
                const configData = yaml.load(fs.readFileSync(configPath, 'utf8')) as any;
                this.panel.webview.postMessage({
                    type: 'appInfo',
                    value: {
                        appName: configData.app_name || 'Unknown',
                        environment: configData.environment || 'Not specified',
                        framework: configData.framework || 'Not specified'
                    }
                });
            } else {
                this.panel.webview.postMessage({
                    type: 'appInfo',
                    value: null
                });
            }
        } catch (error) {
            console.error('Error reading config:', error);
        }

        // Get deployment status
        this.executeStatus(true);
    }

    private async executeDeploy() {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace directory first');
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const configPath = path.join(workspaceRoot, 'easydeploy.yaml');

        if (!fs.existsSync(configPath)) {
            const init = await vscode.window.showErrorMessage('easydeploy.yaml not found. Do you want to create it?', 'Yes', 'No');
            if (init === 'Yes') {
                vscode.commands.executeCommand('easydeploy.init');
            }
            return;
        }

        // Execute the deploy command
        vscode.commands.executeCommand('easydeploy.deploy');
        
        // Update the widget after a slight delay to allow deploy to start
        setTimeout(() => this.updateWebview(), 2000);
    }

    private async executeStatus(silent: boolean = false) {
        if (!this.panel || !vscode.workspace.workspaceFolders) {
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        
        // Run the status command and parse the output
        exec('easydeploy status', { cwd: workspaceRoot }, (error, stdout, stderr) => {
            if (error && !silent) {
                vscode.window.showErrorMessage(`Error checking status: ${error.message}`);
                return;
            }

            // Parse the output to get deployments
            const deployments: any[] = [];
            
            if (stdout.includes('No deployments found')) {
                // No deployments
                this.panel?.webview.postMessage({ 
                    type: 'deployments',
                    value: []
                });
                return;
            }

            // Try to parse table-like output
            const lines = stdout.split('\n').filter(line => line.trim().length > 0);
            
            // First attempt: Look for lines that might contain deployment info
            const deploymentRegex = /([a-zA-Z0-9-]+)\s+([a-zA-Z0-9_-]+)\s+(completed|failed|in_progress|unknown)\s+([^\s]+)\s+(https?:\/\/[^\s]+|N\/A)/i;
            
            for (const line of lines) {
                const match = line.match(deploymentRegex);
                if (match) {
                    deployments.push({
                        jobId: match[1],
                        name: match[2],
                        status: match[3],
                        created: match[4],
                        url: match[5] !== 'N/A' ? match[5] : null
                    });
                }
            }

            // Second attempt: Look for a single deployment
            if (deployments.length === 0 && stdout.includes('Job ID:')) {
                const jobIdMatch = stdout.match(/Job ID: ([a-zA-Z0-9-]+)/);
                const statusMatch = stdout.match(/Status: ([a-zA-Z0-9_]+)/);
                const urlMatch = stdout.match(/URL: (https?:\/\/[^\s]+)/);
                const createdMatch = stdout.match(/Created: ([^\n]+)/);
                
                if (jobIdMatch) {
                    deployments.push({
                        jobId: jobIdMatch[1],
                        name: 'Deployment',
                        status: statusMatch ? statusMatch[1] : 'unknown',
                        created: createdMatch ? createdMatch[1] : null,
                        url: urlMatch ? urlMatch[1] : null
                    });
                }
            }

            // Send the deployments to the webview
            this.panel?.webview.postMessage({
                type: 'deployments',
                value: deployments
            });
        });
    }

    private async executeLogs(jobId?: string) {
        // Just use the existing logs command
        vscode.commands.executeCommand('easydeploy.logs', jobId);
    }

    private async executeRemove(jobId: string) {
        if (!jobId) {
            vscode.window.showErrorMessage('No job ID provided for removal');
            return;
        }

        // Use the existing remove command
        vscode.commands.executeCommand('easydeploy.remove', jobId);
        
        // Update the widget after a slight delay
        setTimeout(() => this.updateWebview(), 2000);
    }
} 