import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

/**
 * A class that provides a form-based editor for the easydeploy.yaml configuration
 */
export class ConfigEditor {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];
    private configPath: string = '';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async show() {
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
            'easydeployConfigEditor',
            'EasyDeploy Configuration Editor',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath))
                ]
            }
        );

        // Set the webview's HTML content
        this.panel.webview.html = this.getHtml();

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'save-config':
                        await this.saveConfig(message.config);
                        break;
                    case 'load-config':
                        await this.loadConfig();
                        break;
                }
            },
            undefined,
            this.disposables
        );

        // Reset panel when closed
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // Load config immediately when panel is shown
        setTimeout(() => {
            if (this.panel) {
                this.loadConfig();
            }
        }, 500);
    }

    /**
     * Load configuration from the workspace
     */
    private async loadConfig() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        const configPath = path.join(workspaceFolders[0].uri.fsPath, 'easydeploy.yaml');
        
        try {
            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf8');
                const config = yaml.load(configContent);
                
                if (this.panel && this.panel.webview) {
                    this.panel.webview.postMessage({
                        command: 'config-loaded',
                        config: config || {}
                    });
                }
            } else {
                // Create a default config template
                const defaultConfig = {
                    name: '',
                    type: 'web',
                    platform: 'aws',
                    region: 'us-east-1',
                    resources: {
                        cpu: 1,
                        memory: 1
                    },
                    environment: {}
                };
                
                if (this.panel && this.panel.webview) {
                    this.panel.webview.postMessage({
                        command: 'config-loaded',
                        config: defaultConfig
                    });
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error loading configuration: ${error}`);
        }
    }

    /**
     * Save configuration to the workspace
     */
    private async saveConfig(config: any) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace folder first');
            return;
        }

        const configPath = path.join(workspaceFolders[0].uri.fsPath, 'easydeploy.yaml');
        
        try {
            // Convert config object to YAML
            const yamlContent = yaml.dump(config, { indent: 2 });
            
            // Write to file
            fs.writeFileSync(configPath, yamlContent, 'utf8');
            
            vscode.window.showInformationMessage('Configuration saved successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Error saving configuration: ${error}`);
        }
    }

    /**
     * Get the HTML for the configuration editor
     */
    private getHtml() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EasyDeploy Configuration Editor</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                }
                h1 {
                    color: var(--vscode-editor-foreground);
                    font-size: 1.5em;
                    margin-bottom: 20px;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                input, select, textarea {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 2px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                    margin-right: 10px;
                    border-radius: 2px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .actions {
                    margin-top: 20px;
                }
                .section {
                    padding: 15px;
                    margin-bottom: 20px;
                    border: 1px solid var(--vscode-editorWidget-border);
                    border-radius: 4px;
                }
                .section-title {
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: var(--vscode-editor-foreground);
                }
                .add-button {
                    margin-top: 10px;
                }
                .env-row {
                    display: flex;
                    margin-bottom: 8px;
                }
                .env-row input {
                    flex: 1;
                    margin-right: 8px;
                }
                .delete-btn {
                    background-color: var(--vscode-errorForeground);
                    color: white;
                    border: none;
                    padding: 4px 8px;
                    cursor: pointer;
                    border-radius: 2px;
                }
            </style>
        </head>
        <body>
            <h1>EasyDeploy Configuration Editor</h1>
            
            <div class="section">
                <div class="section-title">Basic Information</div>
                <div class="form-group">
                    <label for="name">Application Name:</label>
                    <input type="text" id="name" placeholder="my-app">
                </div>
                
                <div class="form-group">
                    <label for="type">Application Type:</label>
                    <select id="type">
                        <option value="web">Web Application</option>
                        <option value="worker">Worker/Background Process</option>
                        <option value="static">Static Website</option>
                    </select>
                </div>
            </div>
            
            <div class="section">
                <div class="section-title">Deployment Options</div>
                <div class="form-group">
                    <label for="platform">Platform:</label>
                    <select id="platform">
                        <option value="aws">AWS</option>
                        <option value="gcp">Google Cloud Platform</option>
                        <option value="azure">Microsoft Azure</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="region">Region:</label>
                    <select id="region">
                        <option value="us-east-1">US East (N. Virginia)</option>
                        <option value="us-east-2">US East (Ohio)</option>
                        <option value="us-west-1">US West (N. California)</option>
                        <option value="us-west-2">US West (Oregon)</option>
                        <option value="eu-west-1">EU (Ireland)</option>
                        <option value="eu-central-1">EU (Frankfurt)</option>
                        <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                        <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                    </select>
                </div>
            </div>
            
            <div class="section">
                <div class="section-title">Resources</div>
                <div class="form-group">
                    <label for="cpu">CPU (cores):</label>
                    <select id="cpu">
                        <option value="0.5">0.5 cores</option>
                        <option value="1" selected>1 core</option>
                        <option value="2">2 cores</option>
                        <option value="4">4 cores</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="memory">Memory (GB):</label>
                    <select id="memory">
                        <option value="0.5">0.5 GB</option>
                        <option value="1" selected>1 GB</option>
                        <option value="2">2 GB</option>
                        <option value="4">4 GB</option>
                        <option value="8">8 GB</option>
                    </select>
                </div>
            </div>
            
            <div class="section">
                <div class="section-title">Environment Variables</div>
                <div id="env-vars-container">
                    <!-- Dynamic environment variable rows will be added here -->
                </div>
                <button class="add-button" id="add-env-var">Add Environment Variable</button>
            </div>
            
            <div class="actions">
                <button id="save-config">Save Configuration</button>
                <button id="load-config">Reload Configuration</button>
            </div>
            
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    let currentConfig = {};
                    
                    // DOM Elements
                    const nameInput = document.getElementById('name');
                    const typeSelect = document.getElementById('type');
                    const platformSelect = document.getElementById('platform');
                    const regionSelect = document.getElementById('region');
                    const cpuSelect = document.getElementById('cpu');
                    const memorySelect = document.getElementById('memory');
                    const envVarsContainer = document.getElementById('env-vars-container');
                    const addEnvVarButton = document.getElementById('add-env-var');
                    const saveButton = document.getElementById('save-config');
                    const loadButton = document.getElementById('load-config');
                    
                    // Add event listeners
                    addEnvVarButton.addEventListener('click', addEnvironmentVariable);
                    saveButton.addEventListener('click', saveConfig);
                    loadButton.addEventListener('click', loadConfig);
                    
                    // Load config initially
                    loadConfig();
                    
                    // Functions
                    function loadConfig() {
                        vscode.postMessage({ command: 'load-config' });
                    }
                    
                    function saveConfig() {
                        // Basic information
                        currentConfig.name = nameInput.value;
                        currentConfig.type = typeSelect.value;
                        currentConfig.platform = platformSelect.value;
                        currentConfig.region = regionSelect.value;
                        
                        // Resources
                        currentConfig.resources = {
                            cpu: parseFloat(cpuSelect.value),
                            memory: parseFloat(memorySelect.value)
                        };
                        
                        // Environment variables
                        const envVars = {};
                        const envRows = document.querySelectorAll('.env-row');
                        envRows.forEach(row => {
                            const keyInput = row.querySelector('.env-key');
                            const valueInput = row.querySelector('.env-value');
                            if (keyInput.value) {
                                envVars[keyInput.value] = valueInput.value;
                            }
                        });
                        currentConfig.environment = envVars;
                        
                        vscode.postMessage({
                            command: 'save-config',
                            config: currentConfig
                        });
                    }
                    
                    function addEnvironmentVariable(key = '', value = '') {
                        const row = document.createElement('div');
                        row.className = 'env-row';
                        row.innerHTML = \`
                            <input type="text" class="env-key" placeholder="KEY" value="\${key}">
                            <input type="text" class="env-value" placeholder="value" value="\${value}">
                            <button class="delete-btn">×</button>
                        \`;
                        
                        const deleteBtn = row.querySelector('.delete-btn');
                        deleteBtn.addEventListener('click', () => {
                            row.remove();
                        });
                        
                        envVarsContainer.appendChild(row);
                    }
                    
                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'config-loaded':
                                currentConfig = message.config;
                                updateFormValues(currentConfig);
                                break;
                        }
                    });
                    
                    function updateFormValues(config) {
                        // Basic information
                        nameInput.value = config.name || '';
                        typeSelect.value = config.type || 'web';
                        platformSelect.value = config.platform || 'aws';
                        regionSelect.value = config.region || 'us-east-1';
                        
                        // Resources
                        if (config.resources) {
                            cpuSelect.value = config.resources.cpu || 1;
                            memorySelect.value = config.resources.memory || 1;
                        }
                        
                        // Environment variables
                        envVarsContainer.innerHTML = '';
                        if (config.environment) {
                            for (const [key, value] of Object.entries(config.environment)) {
                                addEnvironmentVariable(key, value);
                            }
                        }
                        
                        // Add an empty row if no environment variables exist
                        if (!config.environment || Object.keys(config.environment).length === 0) {
                            addEnvironmentVariable();
                        }
                    }
                })();
            </script>
        </body>
        </html>`;
    }
} 