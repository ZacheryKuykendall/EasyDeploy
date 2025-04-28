import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EasyDeployClient } from './client';

export class DeploymentItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly jobId?: string,
        public readonly status?: string,
        public readonly url?: string
    ) {
        super(label, collapsibleState);

        // Set description based on status
        this.description = status || '';

        // Set different icons based on status
        if (status === 'completed') {
            this.iconPath = new vscode.ThemeIcon('check');
        } else if (status === 'failed') {
            this.iconPath = new vscode.ThemeIcon('error');
        } else if (status === 'in_progress') {
            this.iconPath = new vscode.ThemeIcon('loading~spin');
        } else {
            this.iconPath = new vscode.ThemeIcon('cloud');
        }

        // Set tooltip with detailed information
        this.tooltip = `${label}\nStatus: ${status || 'unknown'}\nJob ID: ${jobId || 'N/A'}`;
        if (url) {
            this.tooltip += `\nURL: ${url}`;
        }

        // Set command to open logs when clicked
        if (jobId) {
            this.command = {
                command: 'easydeploy.logs',
                title: 'View Logs',
                arguments: [jobId]
            };
        }
    }
}

export class DeploymentProvider implements vscode.TreeDataProvider<DeploymentItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DeploymentItem | undefined | null | void> = new vscode.EventEmitter<DeploymentItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DeploymentItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private _client: EasyDeployClient | undefined;

    constructor() {
        // Get stored API key from extension storage
        const apiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
        if (apiKey) {
            this._client = new EasyDeployClient(apiKey);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DeploymentItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: DeploymentItem): Thenable<DeploymentItem[]> {
        if (element) {
            // If we're expanding a specific deployment, we could show details
            return Promise.resolve([]);
        } else {
            // Top level - show all deployments
            return this.getDeployments();
        }
    }

    private getDeployments(): Promise<DeploymentItem[]> {
        return new Promise<DeploymentItem[]>(async (resolve, reject) => {
            // Check if we have a workspace
            if (!vscode.workspace.workspaceFolders) {
                return resolve([
                    new DeploymentItem(
                        'No workspace open',
                        vscode.TreeItemCollapsibleState.None
                    )
                ]);
            }

            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const configPath = path.join(workspaceRoot, 'easydeploy.yaml');

            // Check if easydeploy.yaml exists
            if (!fs.existsSync(configPath)) {
                return resolve([
                    new DeploymentItem(
                        'No EasyDeploy configuration found',
                        vscode.TreeItemCollapsibleState.None
                    )
                ]);
            }

            // Check if we have a client
            if (!this._client) {
                const apiKey = await vscode.window.showInputBox({
                    prompt: 'Please enter your EasyDeploy API key',
                    password: true
                });
                
                if (!apiKey) {
                    return resolve([
                        new DeploymentItem(
                            'API key required',
                            vscode.TreeItemCollapsibleState.None
                        )
                    ]);
                }
                
                // Save the API key to settings
                await vscode.workspace.getConfiguration('easydeploy').update('apiKey', apiKey, true);
                this._client = new EasyDeployClient(apiKey);
            }

            try {
                // Get deployments directly from the API
                const deployments = await this._client.listDeployments();
                
                if (!deployments || deployments.length === 0) {
                    return resolve([
                        new DeploymentItem(
                            'No deployments found',
                            vscode.TreeItemCollapsibleState.None
                        )
                    ]);
                }
                
                // Map API deployments to tree items
                const items = deployments.map(d => {
                    return new DeploymentItem(
                        d.name || `Deployment ${d.id}`,
                        vscode.TreeItemCollapsibleState.None,
                        d.id,
                        d.status,
                        d.url
                    );
                });
                
                resolve(items);
            } catch (error: any) {
                console.error('Error fetching deployments:', error);
                resolve([
                    new DeploymentItem(
                        `Error fetching deployments: ${error.message}`,
                        vscode.TreeItemCollapsibleState.None
                    )
                ]);
            }
        });
    }
} 