import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { DeploymentProvider } from './deploymentProvider';
import { EasyDeployWidget } from './widget';

// Cache for deployment info
let lastDeploymentId: string | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('EasyDeploy extension is now active');

    // Widget instance
    const widget = new EasyDeployWidget(context);

    // Status bar item for quick deploy
    const deployButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    deployButton.text = "$(cloud-upload) Deploy";
    deployButton.tooltip = "Deploy application with EasyDeploy";
    deployButton.command = 'easydeploy.deploy';
    context.subscriptions.push(deployButton);

    // Setup sidebar view
    const deploymentsProvider = new DeploymentProvider();
    const deploymentsView = vscode.window.createTreeView('easydeploy-sidebar-view', {
        treeDataProvider: deploymentsProvider
    });
    context.subscriptions.push(deploymentsView);

    // Check if easydeploy.yaml exists and show the deploy button
    const updateDeployButton = () => {
        if (vscode.workspace.workspaceFolders) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const configPath = path.join(workspaceRoot, 'easydeploy.yaml');
            
            if (fs.existsSync(configPath)) {
                deployButton.show();
            } else {
                deployButton.hide();
            }
        } else {
            deployButton.hide();
        }
    };

    // Initial update
    updateDeployButton();

    // Register file watcher for easydeploy.yaml
    if (vscode.workspace.workspaceFolders) {
        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/easydeploy.yaml');
        context.subscriptions.push(fileWatcher);

        fileWatcher.onDidCreate(() => updateDeployButton());
        fileWatcher.onDidDelete(() => updateDeployButton());
    }

    // Initialize configuration command
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.init', async () => {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage('Please open a workspace directory first');
                return;
            }

            const terminal = vscode.window.createTerminal('EasyDeploy');
            terminal.show();
            terminal.sendText('easydeploy init');

            // Wait for file creation
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const configPath = path.join(workspaceRoot, 'easydeploy.yaml');

            // Let's poll for the file to be created
            const maxChecks = 10;
            const checkInterval = 500; // ms
            
            for (let i = 0; i < maxChecks; i++) {
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                
                if (fs.existsSync(configPath)) {
                    const document = await vscode.workspace.openTextDocument(configPath);
                    await vscode.window.showTextDocument(document);
                    break;
                }
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

            // Check if easydeploy CLI is installed
            checkCLIInstalled().catch(error => {
                vscode.window.showErrorMessage(`EasyDeploy CLI not found: ${error}. Please install it using 'pip install easydeploy'`);
                return;
            });

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

            // Create terminal and run deploy command
            const terminal = vscode.window.createTerminal('EasyDeploy');
            terminal.show();
            
            // Show a progress notification
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Deploying ${appName}`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });

                return new Promise<void>((resolve) => {
                    // Execute CLI command
                    const process = exec('easydeploy deploy', { cwd: workspaceRoot }, (error, stdout, stderr) => {
                        if (error) {
                            outputChannel.appendLine(`Deployment failed: ${error.message}`);
                            vscode.window.showErrorMessage(`Deployment failed: ${error.message}`);
                            resolve();
                            return;
                        }

                        // Parse job ID from output
                        const jobIdMatch = stdout.match(/job ID: ([a-zA-Z0-9-]+)/);
                        if (jobIdMatch && jobIdMatch[1]) {
                            lastDeploymentId = jobIdMatch[1];
                            deploymentsProvider.refresh();
                        }

                        outputChannel.appendLine(stdout);
                        if (stderr) {
                            outputChannel.appendLine(`Errors: ${stderr}`);
                        }

                        if (stdout.includes('completed successfully')) {
                            vscode.window.showInformationMessage('Deployment completed successfully!');
                        }
                        resolve();
                    });

                    // Pipe output to VS Code terminal
                    process.stdout?.on('data', (data: string) => {
                        outputChannel.append(data);
                        progress.report({ increment: 20, message: 'Processing...' });
                    });

                    process.stderr?.on('data', (data: string) => {
                        outputChannel.append(data);
                    });
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

            // Check if easydeploy CLI is installed
            checkCLIInstalled().catch(error => {
                vscode.window.showErrorMessage(`EasyDeploy CLI not found: ${error}. Please install it using 'pip install easydeploy'`);
                return;
            });

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const outputChannel = vscode.window.createOutputChannel('EasyDeploy Status');
            outputChannel.show();
            outputChannel.appendLine('Checking deployment status...');

            // If we have a last deployment ID, use it
            let command = 'easydeploy status';
            if (lastDeploymentId) {
                command += ` ${lastDeploymentId}`;
            }

            const process = exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
                if (error) {
                    outputChannel.appendLine(`Error checking status: ${error.message}`);
                    return;
                }

                outputChannel.appendLine(stdout);
                if (stderr) {
                    outputChannel.appendLine(`Errors: ${stderr}`);
                }

                // Refresh the deployments tree view
                deploymentsProvider.refresh();
            });
        })
    );

    // Logs command
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.logs', async (jobId?: string) => {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage('Please open a workspace directory first');
                return;
            }

            // Check if easydeploy CLI is installed
            checkCLIInstalled().catch(error => {
                vscode.window.showErrorMessage(`EasyDeploy CLI not found: ${error}. Please install it using 'pip install easydeploy'`);
                return;
            });

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const outputChannel = vscode.window.createOutputChannel('EasyDeploy Logs');
            outputChannel.show();
            outputChannel.appendLine('Fetching deployment logs...');

            // Use provided job ID, or last deployment ID, or no ID
            let command = 'easydeploy logs';
            if (jobId) {
                command += ` ${jobId}`;
            } else if (lastDeploymentId) {
                command += ` ${lastDeploymentId}`;
            }

            const process = exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
                if (error) {
                    outputChannel.appendLine(`Error fetching logs: ${error.message}`);
                    return;
                }

                outputChannel.appendLine(stdout);
                if (stderr) {
                    outputChannel.appendLine(`Errors: ${stderr}`);
                }
            });
        })
    );

    // Remove command
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.remove', async () => {
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage('Please open a workspace directory first');
                return;
            }

            // Check if easydeploy CLI is installed
            checkCLIInstalled().catch(error => {
                vscode.window.showErrorMessage(`EasyDeploy CLI not found: ${error}. Please install it using 'pip install easydeploy'`);
                return;
            });

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            
            const confirmation = await vscode.window.showWarningMessage(
                'Are you sure you want to remove your deployed application?',
                { modal: true },
                'Yes',
                'No'
            );

            if (confirmation !== 'Yes') {
                return;
            }

            const outputChannel = vscode.window.createOutputChannel('EasyDeploy Remove');
            outputChannel.show();
            outputChannel.appendLine('Removing deployment...');

            const terminal = vscode.window.createTerminal('EasyDeploy Remove');
            terminal.show();
            terminal.sendText('easydeploy remove');

            // Refresh the deployments tree view after a delay
            setTimeout(() => {
                deploymentsProvider.refresh();
            }, 3000);
        })
    );

    // Widget command
    context.subscriptions.push(
        vscode.commands.registerCommand('easydeploy.openWidget', () => {
            widget.show();
        })
    );
}

async function checkCLIInstalled(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        exec('easydeploy --version', (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(true);
        });
    });
}

export function deactivate() {
    // Clean up resources
} 