import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import * as yaml from 'js-yaml';
import { EasyDeployClient } from './client';
import { showGlobalMessage } from './util';
import { getLogStatusIcon } from './util';
import { URL } from 'url';
import { join } from 'path';
import { existsSync } from 'fs';

export class EasyDeployWidget {
    private static currentPanel: EasyDeployWidget | undefined;
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];
    private _deployments: Array<{ id: string, name: string, status: 'completed' | 'in_progress' | 'failed', url?: string }> = [];
    private _client: EasyDeployClient | undefined;
    private _context: vscode.ExtensionContext;
    private _isLoggedIn: boolean = false;
    private _apiKey: string | undefined;
    private _userInfo: any = null;
    private _domains: string[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (EasyDeployWidget.currentPanel) {
            EasyDeployWidget.currentPanel._panel?.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'easydeployWidget',
            'EasyDeploy Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(extensionUri.fsPath, 'media'))
                ]
            }
        );

        // Create the widget instance
        EasyDeployWidget.currentPanel = new EasyDeployWidget({ extensionPath: extensionUri.fsPath } as vscode.ExtensionContext);
        
        // Set the panel and initialize
        EasyDeployWidget.currentPanel._panel = panel;
        EasyDeployWidget.currentPanel._initializePanel();
    }

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        
        // Get stored API key from extension storage
        this._apiKey = context.globalState.get<string>('easydeploy.apiKey');
        this._isLoggedIn = !!this._apiKey;
        
        // Initialize API client if we have key
        if (this._apiKey) {
            this._client = new EasyDeployClient(this._apiKey);
            // Fetch user info in the background
            this.fetchUserInfo();
        }
    }
    
    private _initializePanel() {
        if (!this._panel) {
            return;
        }
        
        // Set initial HTML content
        this._panel.webview.html = this.getWebviewHtml();

        // Handle panel disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            e => {
                if (this._panel?.visible) {
                    this._panel.webview.html = this.getWebviewHtml();
                    
                    // Fetch data if logged in
                    if (this._isLoggedIn) {
                        this.updateDeploymentsView();
                        this.fetchUserInfo();
                    }
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'login':
                        this.handleLogin(message.apiKey);
                        return;
                    case 'logout':
                        this.handleLogout();
                        return;
                    case 'refresh':
                        this.refreshDeployments();
                        return;
                    case 'deploy':
                        this.startNewDeployment();
                        return;
                    case 'addDomain':
                        this.addDomain(message.domain);
                        return;
                    case 'viewLogs':
                        this.viewDeploymentLogs(message.deploymentId);
                        return;
                    case 'viewDetails':
                        this.viewDeploymentDetails(message.deploymentId);
                        return;
                    case 'redeploy':
                        this.redeployApplication(message.deploymentId);
                        return;
                    case 'openUrl':
                        if (message.url) {
                            vscode.env.openExternal(vscode.Uri.parse(message.url));
                        }
                        return;
                    case 'saveConfig':
                        this.saveConfig(message.config);
                        return;
                }
            },
            null,
            this._disposables
        );

        // Initialize with real deployments if logged in
        if (this._isLoggedIn) {
            this.refreshDeployments();
        }
    }

    // Handle login with API key
    private async handleLogin(apiKey: string): Promise<void> {
        if (!apiKey) {
            vscode.window.showErrorMessage('Please enter a valid API key');
            return;
        }
        
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Verifying API key...',
                cancellable: false
            },
            async () => {
                try {
                    // Create a temporary client to validate the key
                    const tempClient = new EasyDeployClient(apiKey);
                    const userData = await tempClient.getUserInfo();
                    
                    if (userData && userData.user_id) {
                        // Successfully authenticated
                        this._apiKey = apiKey;
                        this._isLoggedIn = true;
                        this._client = tempClient;
                        this._userInfo = userData;
                        
                        // Store the API key in extension storage
                        await this._context.globalState.update('easydeploy.apiKey', apiKey);
                        
                        // Update UI to show logged in state
                        if (this._panel) {
                            this._panel.webview.html = this.getWebviewHtml();
                            
                            // Load deployments
                            this.refreshDeployments();
                            
                            // Fetch user's domains
                            this.fetchDomains();
                        }
                        
                        vscode.window.showInformationMessage(`Logged in as ${userData.username || 'user'}`);
                    } else {
                        vscode.window.showErrorMessage('Invalid API key or authentication failed');
                    }
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Login failed: ${error.message}`);
                }
            }
        );
    }
    
    // Handle logout
    private async handleLogout(): Promise<void> {
        // Clear stored credentials
        this._apiKey = undefined;
        this._isLoggedIn = false;
        this._client = undefined;
        this._userInfo = null;
        this._deployments = [];
        
        // Remove from storage
        await this._context.globalState.update('easydeploy.apiKey', undefined);
        
        // Update UI
        if (this._panel) {
            this._panel.webview.html = this.getWebviewHtml();
        }
        
        vscode.window.showInformationMessage('Successfully logged out');
    }
    
    // Fetch user information
    private async fetchUserInfo(): Promise<void> {
        if (!this._client) {
            return;
        }
        
        try {
            const userData = await this._client.getUserInfo();
            this._userInfo = userData;
            
            // Update the webview with user info
            if (this._panel) {
                this._panel.webview.postMessage({
                    type: 'userInfo',
                    value: userData
                });
            }
            
            // Fetch domains after user info
            this.fetchDomains();
            
        } catch (error: any) {
            console.error('Error fetching user info:', error);
        }
    }
    
    // Fetch user's domains
    private async fetchDomains(): Promise<void> {
        if (!this._client) {
            return;
        }
        
        try {
            const domains = await this._client.getDomains();
            this._domains = domains;
            
            // Update the webview with domains
            if (this._panel) {
                this._panel.webview.postMessage({
                    type: 'domains',
                    value: domains
                });
            }
        } catch (error: any) {
            console.error('Error fetching domains:', error);
        }
    }
    
    // Add a new domain
    private async addDomain(domain: string): Promise<void> {
        if (!this._client) {
            return;
        }
        
        if (!domain) {
            vscode.window.showErrorMessage('Please enter a valid domain');
            return;
        }
        
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Adding domain ${domain}...`,
                cancellable: false
            },
            async () => {
                try {
                    const result = await this._client!.addDomain(domain);
                    
                    if (result.success) {
                        vscode.window.showInformationMessage(`Domain ${domain} added successfully`);
                        
                        // Refresh domains list
                        this.fetchDomains();
                    } else {
                        vscode.window.showErrorMessage(`Failed to add domain: ${result.error || 'Unknown error'}`);
                    }
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Error adding domain: ${error.message}`);
                }
            }
        );
    }
    
    // Redeploy an application
    private async redeployApplication(deploymentId: string): Promise<void> {
        if (!this._client) {
            return;
        }
        
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Redeploying application...',
                cancellable: false
            },
            async () => {
                try {
                    const result = await this._client!.redeploy(deploymentId);
                    
                    if (result.success && result.deployment_id) {
                        vscode.window.showInformationMessage(`Redeployment started: ${result.deployment_id}`);
                        
                        // Add the new deployment to the list immediately
                        this._deployments.unshift({
                            id: result.deployment_id,
                            name: `Redeployment (${new Date().toLocaleTimeString()})`,
                            status: 'in_progress'
                        });
                        
                        this.updateDeploymentsView();
                        
                        // Refresh after a short delay to get updated status
                        setTimeout(() => this.refreshDeployments(), 3000);
                    } else {
                        vscode.window.showErrorMessage(`Redeployment failed: ${result.error}`);
                    }
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Redeployment error: ${error.message}`);
                }
            }
        );
    }

    // Update the webview with current deployments
    private updateDeploymentsView() {
        if (!this._panel) {
            return;
        }
        
        this._panel.webview.postMessage({
            type: 'deployments',
            value: this._deployments
        });
    }

    // Fetch deployments from API
    private async refreshDeployments() {
        if (!this._client) {
            await this.initClient();
            if (!this._client) {
                vscode.window.showErrorMessage('Unable to initialize API client. Please check your API key.');
                return;
            }
        }

        try {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: 'Fetching deployments...',
                    cancellable: false
                },
                async () => {
                    try {
                        // Call the API to get deployments
                        const deployments = await this._client!.listDeployments();
                        
                        // Map API response to our format
                        this._deployments = deployments.map(d => ({
                            id: d.id,
                            name: d.name || `Deployment ${d.id}`,
                            status: this.mapStatus(d.status),
                            url: d.url
                        }));
                        
                        this.updateDeploymentsView();
                    } catch (error: any) {
                        console.error('Error fetching deployments:', error);
                        vscode.window.showErrorMessage(`Failed to fetch deployments: ${error.message}`);
                    }
                }
            );
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error refreshing deployments: ${error.message}`);
        }
    }
    
    // Map API status to our status types
    private mapStatus(status: string): 'completed' | 'in_progress' | 'failed' {
        switch (status?.toLowerCase()) {
            case 'success':
            case 'completed':
            case 'done':
                return 'completed';
            case 'failed':
            case 'error':
                return 'failed';
            case 'running':
            case 'in_progress':
            case 'pending':
            default:
                return 'in_progress';
        }
    }

    // Start a new deployment using config file
    private async startNewDeployment() {
        if (!this._client) {
            await this.initClient();
            if (!this._client) {
                return;
            }
        }

        // Check if we have a workspace
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace folder first');
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const configPath = path.join(workspaceRoot, 'easydeploy.yaml');

        // Check if config exists
        if (!fs.existsSync(configPath)) {
            const result = await vscode.window.showErrorMessage(
                'Configuration file not found. Would you like to create one?',
                'Yes',
                'No'
            );
            
            if (result === 'Yes') {
                vscode.commands.executeCommand('easydeploy.init');
            }
            return;
        }

        // Show progress during deployment
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Starting deployment...',
                cancellable: false
            },
            async () => {
                try {
                    const result = await this._client!.deploy(configPath);
                    
                    if (result.success) {
                        vscode.window.showInformationMessage(`Deployment started: ${result.deployment_id}`);
                        
                        // Add the new deployment to the list immediately
                        this._deployments.unshift({
                            id: result.deployment_id,
                            name: `New Deployment (${new Date().toLocaleTimeString()})`,
                            status: 'in_progress'
                        });
                        
                        this.updateDeploymentsView();
                        
                        // Refresh after a short delay to get updated status
                        setTimeout(() => this.refreshDeployments(), 3000);
                    } else {
                        vscode.window.showErrorMessage(`Deployment failed: ${result.error}`);
                    }
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Deployment error: ${error.message}`);
                }
            }
        );
    }
    
    // View logs for a specific deployment
    private async viewDeploymentLogs(deploymentId: string) {
        if (!this._client) {
            await this.initClient();
            if (!this._client) {
                return;
            }
        }
        
        try {
            // Show logs in output channel
            const outputChannel = vscode.window.createOutputChannel('EasyDeploy Logs');
            outputChannel.show();
            outputChannel.appendLine(`Fetching logs for deployment ${deploymentId}...`);
            
            const logs = await this._client.getLogs(deploymentId);
            outputChannel.appendLine('='.repeat(80));
            outputChannel.appendLine(logs);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error viewing logs: ${error.message}`);
        }
    }
    
    // View details for a specific deployment
    private async viewDeploymentDetails(deploymentId: string) {
        if (!this._client) {
            await this.initClient();
            if (!this._client) {
                return;
            }
        }
        
        try {
            const details = await this._client.getStatus(deploymentId);
            
            // Format details to show in a message
            const detailsStr = [
                `Deployment ID: ${details.id}`,
                `Name: ${details.name}`,
                `Status: ${details.status}`,
                `Created: ${details.created_at}`,
                `Platform: ${details.platform}`,
                `URL: ${details.url || 'N/A'}`
            ].join('\n');
            
            vscode.window.showInformationMessage(detailsStr, 'View Logs', 'Open URL')
                .then(selection => {
                    if (selection === 'View Logs') {
                        this.viewDeploymentLogs(deploymentId);
                    } else if (selection === 'Open URL' && details.url) {
                        vscode.env.openExternal(vscode.Uri.parse(details.url));
                    }
                });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error viewing details: ${error.message}`);
        }
    }

    // Show the widget
    public show() {
        if (EasyDeployWidget.currentPanel) {
            EasyDeployWidget.currentPanel._panel?.reveal();
        } else {
            // Create a new panel if none exists
            const column = vscode.window.activeTextEditor
                ? vscode.window.activeTextEditor.viewColumn
                : undefined;
                
            const panel = vscode.window.createWebviewPanel(
                'easydeployWidget',
                'EasyDeploy Dashboard',
                column || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
            
            // Set the panel and initialize
            this._panel = panel;
            this._initializePanel();
            
            // Store as current panel
            EasyDeployWidget.currentPanel = this;
        }
    }

    private getWebviewHtml(): string {
        // Different HTML based on login state
        if (!this._isLoggedIn) {
            return this.getLoginHtml();
        }
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EasyDeploy Dashboard</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 0;
                    margin: 0;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-panel-background);
                }
                .container {
                    padding: 15px;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }
                .user-info {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .logout-btn {
                    background: transparent;
                    color: var(--vscode-textLink-foreground);
                    border: none;
                    cursor: pointer;
                    font-size: 12px;
                    padding: 2px 5px;
                }
                .logout-btn:hover {
                    text-decoration: underline;
                }
                .tabs {
                    display: flex;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    margin-bottom: 15px;
                }
                .tab {
                    padding: 8px 12px;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                }
                .tab.active {
                    border-bottom: 2px solid var(--vscode-textLink-foreground);
                    font-weight: bold;
                }
                h2 {
                    margin-top: 0;
                    margin-bottom: 15px;
                    font-size: 18px;
                    font-weight: 600;
                    padding-bottom: 8px;
                }
                ul {
                    list-style-type: none;
                    padding: 0;
                    margin: 0;
                }
                li {
                    margin-bottom: 10px;
                    padding: 10px;
                    border-radius: 4px;
                    background-color: var(--vscode-panel-background);
                    border: 1px solid var(--vscode-panel-border);
                    display: flex;
                    align-items: center;
                }
                .deployment-name {
                    flex-grow: 1;
                    margin-left: 10px;
                }
                .deployment-actions {
                    display: flex;
                    gap: 5px;
                }
                .action-btn {
                    background: transparent;
                    border: none;
                    color: var(--vscode-textLink-foreground);
                    cursor: pointer;
                    font-size: 12px;
                    padding: 2px 5px;
                }
                .action-btn:hover {
                    text-decoration: underline;
                }
                .status-icon {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    display: inline-block;
                }
                .status-completed {
                    background-color: #4CAF50;
                }
                .status-in_progress {
                    background-color: #2196F3;
                    animation: pulse 1.5s infinite;
                }
                .status-failed {
                    background-color: #F44336;
                }
                @keyframes pulse {
                    0% { opacity: 0.6; }
                    50% { opacity: 1; }
                    100% { opacity: 0.6; }
                }
                .button-container {
                    margin-top: 20px;
                    display: flex;
                    gap: 10px;
                }
                button {
                    padding: 8px 12px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .no-deployments {
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                    padding: 10px 0;
                }
                .url-link {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                    font-size: 12px;
                    margin-left: 5px;
                }
                .url-link:hover {
                    text-decoration: underline;
                }
                .domain-form, .deploy-form {
                    margin-top: 15px;
                    padding: 15px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                }
                input, select {
                    width: 100%;
                    padding: 6px 8px;
                    color: var(--vscode-input-foreground);
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                }
                .tab-content {
                    display: none;
                }
                .tab-content.active {
                    display: block;
                }
                .domain-list {
                    margin-top: 15px;
                }
                .domain-item {
                    padding: 8px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    margin-bottom: 8px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>EASYDEPLOY DASHBOARD</h2>
                    <div class="user-info">
                        <span id="user-display">Loading user info...</span>
                        <button class="logout-btn" id="logout-btn">Logout</button>
                    </div>
                </div>
                
                <div class="tabs">
                    <div class="tab active" data-tab="deployments">Deployments</div>
                    <div class="tab" data-tab="domains">Domains</div>
                    <div class="tab" data-tab="config">Configuration</div>
                </div>
                
                <!-- Deployments Tab -->
                <div class="tab-content active" id="deployments-tab">
                    <ul id="deployments-list">
                        <!-- Deployments will be inserted here -->
                    </ul>
                    <div class="button-container">
                        <button id="refresh-btn">Refresh</button>
                        <button id="deploy-btn">Deploy</button>
                    </div>
                </div>
                
                <!-- Domains Tab -->
                <div class="tab-content" id="domains-tab">
                    <h2>Your Domains</h2>
                    <div id="domains-list" class="domain-list">
                        <!-- Domains will be inserted here -->
                    </div>
                    
                    <div class="domain-form">
                        <h3>Add New Domain</h3>
                        <div class="form-group">
                            <label for="domain-input">Domain Name:</label>
                            <input type="text" id="domain-input" placeholder="example.com or subdomain.example.com">
                        </div>
                        <button id="add-domain-btn">Add Domain</button>
                    </div>
                </div>
                
                <!-- Configuration Tab -->
                <div class="tab-content" id="config-tab">
                    <h2>Deployment Configuration</h2>
                    <div class="deploy-form">
                        <div class="form-group">
                            <label for="app-name">Application Name:</label>
                            <input type="text" id="app-name" placeholder="My Application">
                        </div>
                        <div class="form-group">
                            <label for="platform-select">Platform:</label>
                            <select id="platform-select">
                                <option value="node">Node.js</option>
                                <option value="python">Python</option>
                                <option value="static">Static Site</option>
                                <option value="docker">Docker</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="domain-select">Domain:</label>
                            <select id="domain-select">
                                <option value="">Select a domain</option>
                                <!-- Domains will be inserted here -->
                            </select>
                        </div>
                        <button id="save-config-btn">Save Configuration</button>
                    </div>
                </div>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const deploymentsList = document.getElementById('deployments-list');
                    const domainsList = document.getElementById('domains-list');
                    const userDisplay = document.getElementById('user-display');
                    const refreshBtn = document.getElementById('refresh-btn');
                    const deployBtn = document.getElementById('deploy-btn');
                    const logoutBtn = document.getElementById('logout-btn');
                    const addDomainBtn = document.getElementById('add-domain-btn');
                    const domainInput = document.getElementById('domain-input');
                    const domainSelect = document.getElementById('domain-select');
                    const tabs = document.querySelectorAll('.tab');
                    const tabContents = document.querySelectorAll('.tab-content');
                    const saveConfigBtn = document.getElementById('save-config-btn');
                    const appNameInput = document.getElementById('app-name');
                    const platformSelect = document.getElementById('platform-select');
                    
                    // Tab switching
                    tabs.forEach(tab => {
                        tab.addEventListener('click', () => {
                            // Update active tab
                            tabs.forEach(t => t.classList.remove('active'));
                            tab.classList.add('active');
                            
                            // Show corresponding content
                            const tabName = tab.getAttribute('data-tab');
                            tabContents.forEach(content => {
                                content.classList.remove('active');
                            });
                            document.getElementById(\`\${tabName}-tab\`).classList.add('active');
                        });
                    });
                    
                    // Handle logout button click
                    logoutBtn.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'logout'
                        });
                    });
                    
                    // Handle refresh button click
                    refreshBtn.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'refresh'
                        });
                    });
                    
                    // Handle deploy button click
                    deployBtn.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'deploy'
                        });
                    });
                    
                    // Handle add domain button click
                    addDomainBtn.addEventListener('click', () => {
                        const domain = domainInput.value.trim();
                        if (domain) {
                            vscode.postMessage({
                                command: 'addDomain',
                                domain: domain
                            });
                            domainInput.value = '';
                        }
                    });
                    
                    // Handle save config button click
                    saveConfigBtn.addEventListener('click', () => {
                        const appName = appNameInput.value.trim();
                        const platform = platformSelect.value;
                        const domain = domainSelect.value;
                        
                        if (!appName) {
                            alert('Please enter an application name');
                            return;
                        }
                        
                        vscode.postMessage({
                            command: 'saveConfig',
                            config: {
                                appName,
                                platform,
                                domain
                            }
                        });
                    });
                    
                    // Listen for messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.type) {
                            case 'deployments':
                                renderDeployments(message.value);
                                break;
                            case 'userInfo':
                                renderUserInfo(message.value);
                                break;
                            case 'domains':
                                renderDomains(message.value);
                                break;
                            case 'config':
                                renderConfig(message.value);
                                break;
                            case 'saveConfig':
                                handleSaveConfig(message.config);
                                break;
                        }
                    });
                    
                    // Render the user info
                    function renderUserInfo(userInfo) {
                        if (userInfo && userInfo.username) {
                            userDisplay.textContent = \`Logged in as \${userInfo.username}\`;
                        } else {
                            userDisplay.textContent = 'Logged in';
                        }
                    }
                    
                    // Render the domains list
                    function renderDomains(domains) {
                        domainsList.innerHTML = '';
                        domainSelect.innerHTML = '<option value="">Select a domain</option>';
                        
                        if (!domains || domains.length === 0) {
                            const noDomains = document.createElement('p');
                            noDomains.className = 'no-deployments';
                            noDomains.textContent = 'No domains found. Add a domain to get started.';
                            domainsList.appendChild(noDomains);
                            return;
                        }
                        
                        domains.forEach(domain => {
                            // Add to domains list
                            const domainItem = document.createElement('div');
                            domainItem.className = 'domain-item';
                            domainItem.textContent = domain;
                            domainsList.appendChild(domainItem);
                            
                            // Add to domain select
                            const option = document.createElement('option');
                            option.value = domain;
                            option.textContent = domain;
                            domainSelect.appendChild(option);
                        });
                    }
                    
                    // Render the config
                    function renderConfig(config) {
                        if (config) {
                            appNameInput.value = config.appName || '';
                            platformSelect.value = config.platform || 'node';
                            
                            // Set domain if it exists
                            if (config.domain) {
                                // Check if option exists
                                let found = false;
                                for (let i = 0; i < domainSelect.options.length; i++) {
                                    if (domainSelect.options[i].value === config.domain) {
                                        domainSelect.selectedIndex = i;
                                        found = true;
                                        break;
                                    }
                                }
                                
                                // If not found, add it
                                if (!found && config.domain) {
                                    const option = document.createElement('option');
                                    option.value = config.domain;
                                    option.textContent = config.domain;
                                    domainSelect.appendChild(option);
                                    domainSelect.value = config.domain;
                                }
                            }
                        }
                    }
                    
                    // Render the deployments list
                    function renderDeployments(deployments) {
                        deploymentsList.innerHTML = '';
                        
                        if (!deployments || deployments.length === 0) {
                            const noDeployments = document.createElement('p');
                            noDeployments.className = 'no-deployments';
                            noDeployments.textContent = 'No deployments found.';
                            deploymentsList.appendChild(noDeployments);
                            return;
                        }
                        
                        deployments.forEach(deployment => {
                            const li = document.createElement('li');
                            
                            const statusIcon = document.createElement('span');
                            statusIcon.className = \`status-icon status-\${deployment.status}\`;
                            
                            const nameSpan = document.createElement('span');
                            nameSpan.className = 'deployment-name';
                            nameSpan.textContent = deployment.name;
                            
                            // Add actions
                            const actionsDiv = document.createElement('div');
                            actionsDiv.className = 'deployment-actions';
                            
                            const logsBtn = document.createElement('button');
                            logsBtn.className = 'action-btn';
                            logsBtn.textContent = 'Logs';
                            logsBtn.addEventListener('click', () => {
                                vscode.postMessage({
                                    command: 'viewLogs',
                                    deploymentId: deployment.id
                                });
                            });
                            
                            const detailsBtn = document.createElement('button');
                            detailsBtn.className = 'action-btn';
                            detailsBtn.textContent = 'Details';
                            detailsBtn.addEventListener('click', () => {
                                vscode.postMessage({
                                    command: 'viewDetails',
                                    deploymentId: deployment.id
                                });
                            });
                            
                            const redeployBtn = document.createElement('button');
                            redeployBtn.className = 'action-btn';
                            redeployBtn.textContent = 'Redeploy';
                            redeployBtn.addEventListener('click', () => {
                                vscode.postMessage({
                                    command: 'redeploy',
                                    deploymentId: deployment.id
                                });
                            });
                            
                            actionsDiv.appendChild(logsBtn);
                            actionsDiv.appendChild(detailsBtn);
                            actionsDiv.appendChild(redeployBtn);
                            
                            // Add URL link if available
                            if (deployment.url) {
                                const urlLink = document.createElement('a');
                                urlLink.href = '#';
                                urlLink.className = 'url-link';
                                urlLink.textContent = 'Open URL';
                                urlLink.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    vscode.postMessage({
                                        command: 'openUrl',
                                        url: deployment.url
                                    });
                                });
                                actionsDiv.appendChild(urlLink);
                            }
                            
                            li.appendChild(statusIcon);
                            li.appendChild(nameSpan);
                            li.appendChild(actionsDiv);
                            
                            deploymentsList.appendChild(li);
                        });
                    }
                    
                    // Request initial data
                    vscode.postMessage({
                        command: 'refresh'
                    });
                })();
            </script>
        </body>
        </html>`;
    }
    
    // HTML for login screen
    private getLoginHtml(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EasyDeploy Login</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-panel-background);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                }
                h2 {
                    margin-bottom: 20px;
                }
                .login-container {
                    width: 100%;
                    max-width: 400px;
                    padding: 20px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 5px;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                }
                input {
                    width: 100%;
                    padding: 8px;
                    color: var(--vscode-input-foreground);
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 3px;
                }
                button {
                    width: 100%;
                    padding: 10px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    margin-top: 10px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .signup-link {
                    margin-top: 15px;
                    text-align: center;
                }
                .signup-link a {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                }
                .signup-link a:hover {
                    text-decoration: underline;
                }
                .error-message {
                    color: #F44336;
                    margin-top: 10px;
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <h2>Login to EasyDeploy</h2>
                <div class="form-group">
                    <label for="api-key">API Key:</label>
                    <input type="password" id="api-key" placeholder="Enter your EasyDeploy API key">
                </div>
                <button id="login-button">Login</button>
                <div id="error-message" class="error-message"></div>
                <div class="signup-link">
                    <p>Don't have an account? <a href="#" id="signup-link">Sign up for EasyDeploy</a></p>
                </div>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const apiKeyInput = document.getElementById('api-key');
                    const loginButton = document.getElementById('login-button');
                    const errorMessage = document.getElementById('error-message');
                    const signupLink = document.getElementById('signup-link');
                    
                    loginButton.addEventListener('click', () => {
                        const apiKey = apiKeyInput.value.trim();
                        
                        if (!apiKey) {
                            errorMessage.textContent = 'Please enter your API key';
                            errorMessage.style.display = 'block';
                            return;
                        }
                        
                        // Send login message to extension
                        vscode.postMessage({
                            command: 'login',
                            apiKey: apiKey
                        });
                    });
                    
                    apiKeyInput.addEventListener('keyup', (event) => {
                        if (event.key === 'Enter') {
                            loginButton.click();
                        }
                    });
                    
                    signupLink.addEventListener('click', (event) => {
                        event.preventDefault();
                        vscode.postMessage({
                            command: 'openUrl',
                            url: 'https://easydeploy.io/signup'
                        });
                    });
                })();
            </script>
        </body>
        </html>`;
    }

    public dispose() {
        EasyDeployWidget.currentPanel = undefined;

        if (this._panel) {
            this._panel.dispose();
        }

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Initialize the API client with the stored API key
     */
    private initClient(): void {
        if (this._apiKey) {
            this._client = new EasyDeployClient(this._apiKey);
            
            // Fetch user info and domains after initializing the client
            this.fetchUserInfo();
            this.fetchDomains();
        }
    }

    /**
     * Save configuration to easydeploy.yaml file
     */
    private async saveConfig(config: any): Promise<void> {
        // Check if we have a workspace
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace folder first');
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const configPath = path.join(workspaceRoot, 'easydeploy.yaml');

        try {
            // Create YAML configuration
            const yamlConfig = {
                name: config.appName,
                platform: config.platform,
                type: 'web',
                region: 'us-east-1', // Default region
                resources: {
                    cpu: '1x',
                    memory: '512MB'
                },
                env: {},
            };

            // Add domain if specified
            if (config.domain) {
                yamlConfig.domain = config.domain;
            }

            // Convert to YAML
            const yamlContent = yaml.dump(yamlConfig);

            // Write to file
            fs.writeFileSync(configPath, yamlContent, 'utf8');

            vscode.window.showInformationMessage('Configuration saved to easydeploy.yaml');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error saving configuration: ${error.message}`);
        }
    }

    /**
     * Refresh the panel with current data
     */
    private refreshPanel(): void {
        if (this._panel) {
            this._panel.webview.html = this.getWebviewHtml();
            
            if (this._isLoggedIn) {
                // Refresh data if logged in
                this.updateDeploymentsView();
                this.fetchUserInfo();
            }
        }
    }
} 