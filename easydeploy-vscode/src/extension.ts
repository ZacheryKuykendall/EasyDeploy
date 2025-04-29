import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { DeploymentProvider } from './deploymentProvider';
import { EasyDeployWidget } from './widget';
import { ConfigEditor } from './configEditor';
import { DeploymentManager } from './deploymentManager';
import { EasyDeployClient } from './client';

// Cache for deployment info
let lastDeploymentId: string | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('EasyDeploy extension is now active');

    // Create widget instance and register it
    const widget = new EasyDeployWidget(context);
    
    // New user-friendly components
    const configEditor = new ConfigEditor(context);
    const deploymentManager = new DeploymentManager(context);

    // Status bar item for quick deploy
    const deployButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    deployButton.text = "$(cloud-upload) Deploy";
    deployButton.tooltip = "Deploy application with EasyDeploy";
    deployButton.command = 'easydeploy.deploy';
    context.subscriptions.push(deployButton);
    
    // Status bar item for deployment manager
    const manageButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    manageButton.text = "$(gear) Manage";
    manageButton.tooltip = "Manage EasyDeploy deployments";
    manageButton.command = 'easydeploy.openManager';
    context.subscriptions.push(manageButton);

    // Setup sidebar view
    const deploymentsProvider = new DeploymentProvider();
    const deploymentsView = vscode.window.createTreeView('easydeploy-sidebar-view', {
        treeDataProvider: deploymentsProvider
    });
    context.subscriptions.push(deploymentsView);
    context.subscriptions.push(deploymentsProvider);

    // Check if easydeploy.yaml exists and show the buttons
    const updateStatusBarButtons = () => {
        if (vscode.workspace.workspaceFolders) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const configPath = path.join(workspaceRoot, 'easydeploy.yaml');
            
            if (fs.existsSync(configPath)) {
                deployButton.show();
                manageButton.show();
            } else {
                deployButton.hide();
                manageButton.hide();
            }
        } else {
            deployButton.hide();
            manageButton.hide();
        }
    };

    // Initial update
    updateStatusBarButtons();

    // Register file watcher for easydeploy.yaml
    if (vscode.workspace.workspaceFolders) {
        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/easydeploy.yaml');
        context.subscriptions.push(fileWatcher);

        fileWatcher.onDidCreate(() => updateStatusBarButtons());
        fileWatcher.onDidDelete(() => updateStatusBarButtons());
    }

    // Register the new commands
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.editConfig', () => {
            configEditor.show();
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.openManager', () => {
            deploymentManager.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.openWidget', () => {
            // Show the widget
            EasyDeployWidget.createOrShow(context.extensionUri);
        })
    );

    // Initialize command
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.init', async () => {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage('Please open a workspace directory first');
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const configPath = path.join(workspaceRoot, 'easydeploy.yaml');

            // Check if file already exists
            if (fs.existsSync(configPath)) {
                const overwrite = await vscode.window.showWarningMessage(
                    'easydeploy.yaml already exists. Do you want to overwrite it?',
                    'Yes',
                    'No'
                );
                
                if (overwrite !== 'Yes') {
                    return;
                }
            }
            
            // Get application name
            const appName = await vscode.window.showInputBox({
                prompt: 'Enter your application name',
                placeHolder: 'my-application'
            });
            
            if (!appName) {
                return;
            }
            
            try {
                // Create basic config
                const config = {
                    app_name: appName,
                    environment: 'production',
                    framework: 'nodejs',
                    region: 'us-west-2',
                    provider: 'aws',
                    resources: {
                        memory: 512,
                        cpu: 0.5
                    },
                    environment_variables: {
                        NODE_ENV: 'production',
                        DEBUG: false
                    }
                };
                
                // Write to file
                fs.writeFileSync(configPath, yaml.dump(config), 'utf8');
                
                // Open the file in editor
                const document = await vscode.workspace.openTextDocument(configPath);
                await vscode.window.showTextDocument(document);
                
                vscode.window.showInformationMessage('EasyDeploy configuration created successfully!');
                
                // Update status bar
                updateStatusBarButtons();
            } catch (error: any) {
                vscode.window.showErrorMessage(`Error creating configuration: ${error.message}`);
            }
        })
    );

    // Deploy command
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.deploy', async () => {
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

            // Read the config to get app name
            let appName = 'your app';
            try {
                const configData = yaml.load(fs.readFileSync(configPath, 'utf8')) as any;
                if (configData && configData.app_name) {
                    appName = configData.app_name;
                }
            } catch (error) {
                console.error('Error reading config file:', error);
            }

            // Create and show output channel
            const outputChannel = vscode.window.createOutputChannel('EasyDeploy');
            outputChannel.show();
            outputChannel.appendLine(`Deploying ${appName}...`);

            // Get API key from settings or prompt user
            const apiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
            if (!apiKey) {
                const newApiKey = await vscode.window.showInputBox({
                    prompt: 'Please enter your EasyDeploy API key',
                    password: true
                });
                
                if (!newApiKey) {
                    outputChannel.appendLine('Deployment cancelled: No API key provided');
                    return;
                }
                
                // Save API key to settings
                await vscode.workspace.getConfiguration('easydeploy').update('apiKey', newApiKey, true);
            }

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Deploying ${appName}...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });
                
                return new Promise<void>(async (resolve) => {
                    try {
                        outputChannel.appendLine('Connecting to EasyDeploy API...');
                        progress.report({ increment: 10, message: 'Connecting to API...' });
                        
                        // Get current API key (may have been just set)
                        const currentApiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
                        if (!currentApiKey) {
                            outputChannel.appendLine('Error: API key not found');
                            return resolve();
                        }
                        
                        // Create API client
                        const client = new EasyDeployClient(currentApiKey);
                        
                        outputChannel.appendLine('Preparing application for deployment...');
                        progress.report({ increment: 30, message: 'Preparing application...' });
                        
                        // Deploy using the API client
                        const result = await client.deploy(configPath);
                        
                        if (result.success) {
                            lastDeploymentId = result.deployment_id;
                            outputChannel.appendLine(`Deployment started successfully! ID: ${result.deployment_id}`);
                            outputChannel.appendLine('Check status using "EasyDeploy: Check Deployment Status"');
                            progress.report({ increment: 100, message: 'Deployment started!' });
                            
                            // Refresh the deployments tree view
                            deploymentsProvider.refresh();
                            resolve();
                        } else {
                            outputChannel.appendLine(`Deployment failed: ${result.error}`);
                            progress.report({ increment: 100, message: 'Failed' });
                            resolve();
                        }
                    } catch (error: any) {
                        outputChannel.appendLine(`Error during deployment: ${error.message}`);
                        progress.report({ increment: 100, message: 'Error' });
                        resolve();
                    }
                });
            });
        })
    );

    // Status command
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.status', async () => {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage('Please open a workspace directory first');
                return;
            }

            const outputChannel = vscode.window.createOutputChannel('EasyDeploy Status');
            outputChannel.show();
            outputChannel.appendLine('Checking deployment status...');

            // Get API key from settings or prompt user
            const apiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
            if (!apiKey) {
                const newApiKey = await vscode.window.showInputBox({
                    prompt: 'Please enter your EasyDeploy API key',
                    password: true
                });
                
                if (!newApiKey) {
                    outputChannel.appendLine('Status check cancelled: No API key provided');
                    return;
                }
                
                // Save API key to settings
                await vscode.workspace.getConfiguration('easydeploy').update('apiKey', newApiKey, true);
            }

            try {
                // Get current API key (may have been just set)
                const currentApiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
                if (!currentApiKey) {
                    outputChannel.appendLine('Error: API key not found');
                    return;
                }
                
                // Create API client
                const client = new EasyDeployClient(currentApiKey);
                
                // If we have a last deployment ID, use it
                if (lastDeploymentId) {
                    const deploymentInfo = await client.getStatus(lastDeploymentId);
                    outputChannel.appendLine('Most recent deployment:');
                    outputChannel.appendLine(`ID: ${deploymentInfo.id}`);
                    outputChannel.appendLine(`Name: ${deploymentInfo.name || 'N/A'}`);
                    outputChannel.appendLine(`Status: ${deploymentInfo.status}`);
                    outputChannel.appendLine(`Created: ${deploymentInfo.created_at || 'N/A'}`);
                    outputChannel.appendLine(`URL: ${deploymentInfo.url || 'N/A'}`);
                } else {
                    // Get all deployments
                    const deployments = await client.listDeployments();
                    
                    if (deployments.length === 0) {
                        outputChannel.appendLine('No deployments found');
                    } else {
                        outputChannel.appendLine('Recent deployments:');
                        for (const d of deployments.slice(0, 5)) {
                            outputChannel.appendLine(`- ${d.name || d.id}: ${d.status} (${d.url || 'No URL'})`);
                        }
                        
                        // Store most recent deployment ID
                        if (deployments.length > 0) {
                            lastDeploymentId = deployments[0].id;
                        }
                    }
                }
                
                // Refresh the deployments tree view
                deploymentsProvider.refresh();
            } catch (error: any) {
                outputChannel.appendLine(`Error checking status: ${error.message}`);
            }
        })
    );

    // Logs command
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.logs', async (jobId?: string) => {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage('Please open a workspace directory first');
                return;
            }

            const outputChannel = vscode.window.createOutputChannel('EasyDeploy Logs');
            outputChannel.show();
            outputChannel.appendLine('Fetching deployment logs...');

            // Get API key from settings or prompt user
            const apiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
            if (!apiKey) {
                const newApiKey = await vscode.window.showInputBox({
                    prompt: 'Please enter your EasyDeploy API key',
                    password: true
                });
                
                if (!newApiKey) {
                    outputChannel.appendLine('Logs retrieval cancelled: No API key provided');
                    return;
                }
                
                // Save API key to settings
                await vscode.workspace.getConfiguration('easydeploy').update('apiKey', newApiKey, true);
            }

            try {
                // Get current API key (may have been just set)
                const currentApiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
                if (!currentApiKey) {
                    outputChannel.appendLine('Error: API key not found');
                    return;
                }
                
                // Create API client
                const client = new EasyDeployClient(currentApiKey);
                
                // Use provided job ID, or last deployment ID
                const targetId = jobId || lastDeploymentId;
                
                if (!targetId) {
                    outputChannel.appendLine('No deployment ID available. Please deploy first or select a specific deployment.');
                    return;
                }
                
                // Get logs
                const logs = await client.getLogs(targetId);
                outputChannel.appendLine(`Logs for deployment ${targetId}:`);
                outputChannel.appendLine('-------------------------------------------');
                outputChannel.appendLine(logs);
            } catch (error: any) {
                outputChannel.appendLine(`Error fetching logs: ${error.message}`);
            }
        })
    );

    // Remove command
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.remove', async () => {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage('Please open a workspace directory first');
                return;
            }

            const outputChannel = vscode.window.createOutputChannel('EasyDeploy Remove');
            outputChannel.show();
            
            // Get API key from settings or prompt user
            const apiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
            if (!apiKey) {
                const newApiKey = await vscode.window.showInputBox({
                    prompt: 'Please enter your EasyDeploy API key',
                    password: true
                });
                
                if (!newApiKey) {
                    outputChannel.appendLine('Operation cancelled: No API key provided');
                    return;
                }
                
                // Save API key to settings
                await vscode.workspace.getConfiguration('easydeploy').update('apiKey', newApiKey, true);
            }

            // We need a deployment ID
            if (!lastDeploymentId) {
                outputChannel.appendLine('No active deployment found. Please check status first to identify deployments.');
                return;
            }
            
            const confirmation = await vscode.window.showWarningMessage(
                `Are you sure you want to remove deployment ${lastDeploymentId}?`,
                { modal: true },
                'Yes',
                'No'
            );

            if (confirmation !== 'Yes') {
                return;
            }

            outputChannel.appendLine(`Removing deployment ${lastDeploymentId}...`);

            try {
                // Get current API key (may have been just set)
                const currentApiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
                if (!currentApiKey) {
                    outputChannel.appendLine('Error: API key not found');
                    return;
                }
                
                // Create API client
                const client = new EasyDeployClient(currentApiKey);
                
                // Remove deployment
                const result = await client.remove(lastDeploymentId);
                
                if (result.success) {
                    outputChannel.appendLine(result.message || 'Deployment removed successfully');
                    lastDeploymentId = undefined;
                    
                    // Refresh the deployments tree view
                    deploymentsProvider.refresh();
                } else {
                    outputChannel.appendLine(`Failed to remove deployment: ${result.error}`);
                }
            } catch (error: any) {
                outputChannel.appendLine(`Error removing deployment: ${error.message}`);
            }
        })
    );

    // Test API Connection command
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.testConnection', async () => {
            const outputChannel = vscode.window.createOutputChannel('EasyDeploy API Test');
            outputChannel.show();
            outputChannel.appendLine('Testing connection to EasyDeploy API...');

            // Get API key from settings or prompt user
            const apiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
            if (!apiKey) {
                const newApiKey = await vscode.window.showInputBox({
                    prompt: 'Please enter your EasyDeploy API key',
                    password: true
                });
                
                if (!newApiKey) {
                    outputChannel.appendLine('Connection test cancelled: No API key provided');
                    return;
                }
                
                // Save API key to settings
                await vscode.workspace.getConfiguration('easydeploy').update('apiKey', newApiKey, true);
            }

            // Get API URL from settings
            const apiUrl = vscode.workspace.getConfiguration('easydeploy').get<string>('apiUrl');
            outputChannel.appendLine(`Using API URL: ${apiUrl || 'Default URL'}`);
            
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Testing API connection...',
                    cancellable: false
                },
                async (progress) => {
                    try {
                        progress.report({ increment: 50, message: 'Connecting to API...' });
                        
                        // Create API client
                        const currentApiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
                        if (!currentApiKey) {
                            outputChannel.appendLine('Error: API key not found');
                            return;
                        }
                        
                        const client = new EasyDeployClient(currentApiKey);
                        const result = await client.testConnection();
                        
                        if (result.success) {
                            outputChannel.appendLine(`✅ Connection successful: ${result.message}`);
                            vscode.window.showInformationMessage('API connection successful');
                            progress.report({ increment: 100, message: 'Connected!' });
                        } else {
                            outputChannel.appendLine(`❌ Connection failed: ${result.message}`);
                            vscode.window.showErrorMessage(`API connection failed: ${result.message}`);
                        }
                        
                        // Show troubleshooting tips
                        outputChannel.appendLine('\nTroubleshooting tips:');
                        outputChannel.appendLine('1. Verify your API key is correct');
                        outputChannel.appendLine('2. Check if the API URL is correct in settings');
                        outputChannel.appendLine(`   Current URL: ${vscode.workspace.getConfiguration('easydeploy').get<string>('apiUrl') || 'Default URL'}`);
                        outputChannel.appendLine('3. Ensure your network can reach the API server');
                        outputChannel.appendLine('4. Check if your firewall is blocking the connection');
                    } catch (error: any) {
                        outputChannel.appendLine(`Error testing connection: ${error.message}`);
                        vscode.window.showErrorMessage(`Connection test error: ${error.message}`);
                    }
                }
            );
        })
    );

    // Register additional commands for the sidebar
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.refreshSidebar', () => {
            deploymentsProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.signIn', async (provider: string) => {
            const outputChannel = vscode.window.createOutputChannel(`EasyDeploy Sign In: ${provider}`);
            outputChannel.show();
            outputChannel.appendLine(`Signing in to ${provider}...`);
            
            try {
                if (provider === 'redhat') {
                    vscode.env.openExternal(vscode.Uri.parse('https://console.redhat.com/openshift/token'));
                    outputChannel.appendLine('Please sign in using your web browser and provide the token when prompted.');
                    
                    const token = await vscode.window.showInputBox({
                        prompt: 'Please enter your Red Hat OpenShift token',
                        password: true
                    });
                    
                    if (token) {
                        // Save token to settings
                        await vscode.workspace.getConfiguration('easydeploy').update('redhat.token', token, true);
                        vscode.window.showInformationMessage('Successfully signed in to Red Hat OpenShift');
                    }
                } else if (provider === 'gcloud') {
                    vscode.commands.executeCommand('easydeploy.installCLI', 'gcloud');
                } else if (provider === 'azure') {
                    vscode.commands.executeCommand('easydeploy.installCLI', 'azure');
                } else if (provider === 'aws') {
                    vscode.commands.executeCommand('easydeploy.installCLI', 'aws');
                }
            } catch (error: any) {
                outputChannel.appendLine(`Error signing in: ${error.message}`);
                vscode.window.showErrorMessage(`Error signing in: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.createAccount', async (provider: string) => {
            try {
                if (provider === 'redhat') {
                    vscode.env.openExternal(vscode.Uri.parse('https://www.redhat.com/wapps/ugc/register.html'));
                } else if (provider === 'gcloud') {
                    vscode.env.openExternal(vscode.Uri.parse('https://console.cloud.google.com/freetrial'));
                } else if (provider === 'azure') {
                    vscode.env.openExternal(vscode.Uri.parse('https://azure.microsoft.com/free/'));
                } else if (provider === 'azure-student') {
                    vscode.env.openExternal(vscode.Uri.parse('https://azure.microsoft.com/free/students/'));
                } else if (provider === 'aws') {
                    vscode.env.openExternal(vscode.Uri.parse('https://aws.amazon.com/free/'));
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Error opening registration page: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.installCLI', async (cliName: string) => {
            const outputChannel = vscode.window.createOutputChannel(`EasyDeploy Install CLI: ${cliName}`);
            outputChannel.show();
            outputChannel.appendLine(`Installing ${cliName} CLI...`);
            
            try {
                if (cliName === 'gcloud') {
                    // Instructions for Google Cloud CLI
                    outputChannel.appendLine('Please follow these steps to install Google Cloud CLI:');
                    outputChannel.appendLine('1. Visit: https://cloud.google.com/sdk/docs/install');
                    outputChannel.appendLine('2. Download the installer appropriate for your operating system');
                    outputChannel.appendLine('3. Run the installer and follow the prompts');
                    outputChannel.appendLine('4. After installation, run: gcloud init');
                    
                    vscode.env.openExternal(vscode.Uri.parse('https://cloud.google.com/sdk/docs/install'));
                } else if (cliName === 'azure') {
                    // Instructions for Azure CLI
                    outputChannel.appendLine('Please follow these steps to install Azure CLI:');
                    outputChannel.appendLine('1. Visit: https://docs.microsoft.com/cli/azure/install-azure-cli');
                    outputChannel.appendLine('2. Follow the instructions for your operating system');
                    outputChannel.appendLine('3. After installation, run: az login');
                    
                    vscode.env.openExternal(vscode.Uri.parse('https://docs.microsoft.com/cli/azure/install-azure-cli'));
                } else if (cliName === 'aws') {
                    // Instructions for AWS CLI
                    outputChannel.appendLine('Please follow these steps to install AWS CLI:');
                    outputChannel.appendLine('1. Visit: https://aws.amazon.com/cli/');
                    outputChannel.appendLine('2. Download the installer appropriate for your operating system');
                    outputChannel.appendLine('3. Run the installer and follow the prompts');
                    outputChannel.appendLine('4. After installation, run: aws configure');
                    
                    vscode.env.openExternal(vscode.Uri.parse('https://aws.amazon.com/cli/'));
                } else if (cliName === 'redhat' || cliName === 'openshift') {
                    // Instructions for OpenShift CLI
                    outputChannel.appendLine('Please follow these steps to install OpenShift CLI:');
                    outputChannel.appendLine('1. Visit: https://docs.openshift.com/container-platform/latest/cli_reference/openshift_cli/getting-started-cli.html');
                    outputChannel.appendLine('2. Download the appropriate version for your operating system');
                    outputChannel.appendLine('3. Extract the archive and add the oc binary to your PATH');
                    
                    vscode.env.openExternal(vscode.Uri.parse('https://docs.openshift.com/container-platform/latest/cli_reference/openshift_cli/getting-started-cli.html'));
                }
            } catch (error: any) {
                outputChannel.appendLine(`Error setting up CLI: ${error.message}`);
                vscode.window.showErrorMessage(`Error setting up CLI: ${error.message}`);
            }
        })
    );
}

export function deactivate() {
    // Clean up resources
} 