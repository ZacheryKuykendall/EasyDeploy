import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EasyDeployClient } from './client';
import * as yaml from 'js-yaml';

export class DeploymentItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly status?: string,
        public readonly metadata?: any
    ) {
        super(label, collapsibleState);

        // Set description based on status
        this.description = status || '';

        // Set icons based on context and status
        if (contextValue === 'deployment') {
            if (status === 'running') {
                this.iconPath = new vscode.ThemeIcon('check');
            } else if (status === 'failed') {
                this.iconPath = new vscode.ThemeIcon('error');
            } else if (status === 'deploying') {
                this.iconPath = new vscode.ThemeIcon('loading~spin');
            } else if (status === 'stopped') {
                this.iconPath = new vscode.ThemeIcon('debug-stop');
            } else {
                this.iconPath = new vscode.ThemeIcon('cloud');
            }
        } else if (contextValue === 'section') {
            this.iconPath = new vscode.ThemeIcon('list-unordered');
        } else if (contextValue === 'cloud') {
            this.iconPath = new vscode.ThemeIcon('cloud');
        } else if (contextValue === 'auth') {
            this.iconPath = new vscode.ThemeIcon('key');
        } else if (contextValue === 'create-account') {
            this.iconPath = new vscode.ThemeIcon('add');
        } else if (contextValue === 'install') {
            this.iconPath = new vscode.ThemeIcon('desktop-download');
        } else if (contextValue === 'error') {
            this.iconPath = new vscode.ThemeIcon('error');
        } else if (contextValue === 'student') {
            this.iconPath = new vscode.ThemeIcon('mortar-board');
        }

        // Set tooltip with detailed information
        this.tooltip = label;
        if (status) {
            this.tooltip += `\nStatus: ${status}`;
        }
        if (metadata && metadata.id) {
            this.tooltip += `\nID: ${metadata.id}`;
        }
        if (metadata && metadata.url) {
            this.tooltip += `\nURL: ${metadata.url}`;
        }

        // Set command when clicked based on context
        if (contextValue === 'deployment' && metadata && metadata.id) {
            this.command = {
                command: 'easydeploy.getLogs',
                title: 'View Logs',
                arguments: [metadata.id]
            };
        } else if (contextValue === 'auth') {
            const provider = label.toLowerCase().includes('red hat') ? 'redhat' : 
                            label.toLowerCase().includes('google') ? 'gcloud' : 
                            'azure';
            this.command = {
                command: 'easydeploy.signIn',
                title: 'Sign in',
                arguments: [provider]
            };
        } else if (contextValue === 'create-account') {
            const provider = label.toLowerCase().includes('red hat') ? 'redhat' : 
                            label.toLowerCase().includes('google') ? 'gcloud' : 
                            'azure';
            this.command = {
                command: 'easydeploy.createAccount',
                title: 'Create Account',
                arguments: [provider]
            };
        } else if (contextValue === 'student') {
            this.command = {
                command: 'easydeploy.createAccount',
                title: 'Create Student Account',
                arguments: ['azure-student']
            };
        } else if (contextValue === 'install') {
            this.command = {
                command: 'easydeploy.installCLI',
                title: 'Install CLI',
                arguments: [label.toLowerCase().includes('google') ? 'gcloud' : 'azure']
            };
        } else if (contextValue === 'error') {
            this.command = {
                command: 'easydeploy.testConnection',
                title: 'Test Connection'
            };
        }
    }
}

export class DeploymentProvider implements vscode.TreeDataProvider<DeploymentItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DeploymentItem | undefined | null | void> = new vscode.EventEmitter<DeploymentItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DeploymentItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private client: EasyDeployClient | undefined;
    private deployments: any[] = [];
    private refreshInterval: NodeJS.Timeout | undefined;

    constructor() {
        // Initialize without a client - we'll create it when needed
        this.startAutoRefresh();
    }

    private startAutoRefresh(): void {
        // Refresh deployments every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.refresh();
        }, 30000);
    }

    dispose(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DeploymentItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DeploymentItem): Promise<DeploymentItem[]> {
        if (!element) {
            // Root level - show clouds section and deployments section
            return [
                new DeploymentItem(
                    'CLOUDS', 
                    vscode.TreeItemCollapsibleState.Expanded,
                    'section'
                ),
                new DeploymentItem(
                    'DEPLOYMENTS', 
                    vscode.TreeItemCollapsibleState.Expanded,
                    'section'
                )
            ];
        } else if (element.label === 'CLOUDS') {
            // Cloud providers section
            return [
                new DeploymentItem(
                    'Red Hat OpenShift', 
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'cloud'
                ),
                new DeploymentItem(
                    'Google Cloud', 
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'cloud'
                ),
                new DeploymentItem(
                    'Azure', 
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'cloud'
                ),
                new DeploymentItem(
                    'AWS', 
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'cloud'
                )
            ];
        } else if (element.label === 'Red Hat OpenShift') {
            return [
                new DeploymentItem(
                    'Sign in to Red Hat', 
                    vscode.TreeItemCollapsibleState.None,
                    'auth'
                ),
                new DeploymentItem(
                    'Create Red Hat Account', 
                    vscode.TreeItemCollapsibleState.None,
                    'create-account'
                ),
                new DeploymentItem(
                    'Install OpenShift CLI', 
                    vscode.TreeItemCollapsibleState.None,
                    'install'
                )
            ];
        } else if (element.label === 'Google Cloud') {
            return [
                new DeploymentItem(
                    'Install Google Cloud CLI', 
                    vscode.TreeItemCollapsibleState.None,
                    'install'
                ),
                new DeploymentItem(
                    'Sign in to Google Cloud', 
                    vscode.TreeItemCollapsibleState.None,
                    'auth'
                ),
                new DeploymentItem(
                    'Create Google Cloud Account', 
                    vscode.TreeItemCollapsibleState.None,
                    'create-account'
                )
            ];
        } else if (element.label === 'Azure') {
            return [
                new DeploymentItem(
                    'Sign in to Azure', 
                    vscode.TreeItemCollapsibleState.None,
                    'auth'
                ),
                new DeploymentItem(
                    'Create an Azure Account', 
                    vscode.TreeItemCollapsibleState.None,
                    'create-account'
                ),
                new DeploymentItem(
                    'Create an Azure for Students Account', 
                    vscode.TreeItemCollapsibleState.None,
                    'student'
                ),
                new DeploymentItem(
                    'Install Azure CLI', 
                    vscode.TreeItemCollapsibleState.None,
                    'install'
                )
            ];
        } else if (element.label === 'AWS') {
            return [
                new DeploymentItem(
                    'Sign in to AWS', 
                    vscode.TreeItemCollapsibleState.None,
                    'auth'
                ),
                new DeploymentItem(
                    'Create an AWS Account', 
                    vscode.TreeItemCollapsibleState.None,
                    'create-account'
                ),
                new DeploymentItem(
                    'Install AWS CLI', 
                    vscode.TreeItemCollapsibleState.None,
                    'install'
                )
            ];
        } else if (element.label === 'DEPLOYMENTS') {
            // Try to fetch deployments, if failed, return a single item with error
            try {
                // Lazy initialize the client if needed
                if (!this.client) {
                    const apiKey = vscode.workspace.getConfiguration('easydeploy').get<string>('apiKey');
                    if (!apiKey) {
                        return [new DeploymentItem(
                            'API key not set', 
                            vscode.TreeItemCollapsibleState.None,
                            'error',
                            undefined,
                            { message: 'Please set your API key in the settings' }
                        )];
                    }
                    this.client = new EasyDeployClient(apiKey);
                }
                
                this.deployments = await this.client.listDeployments();
                
                if (this.deployments.length === 0) {
                    return [new DeploymentItem(
                        'No deployments found', 
                        vscode.TreeItemCollapsibleState.None,
                        'info'
                    )];
                }
                
                return this.deployments.map(d => {
                    return new DeploymentItem(
                        d.name || `Deployment ${d.id.substring(0, 8)}`,
                        vscode.TreeItemCollapsibleState.None,
                        'deployment',
                        d.status,
                        d
                    );
                });
            } catch (error: any) {
                return [new DeploymentItem(
                    'Error fetching deployments', 
                    vscode.TreeItemCollapsibleState.None,
                    'error',
                    undefined,
                    { message: error.message }
                )];
            }
        }
        
        return [];
    }
} 