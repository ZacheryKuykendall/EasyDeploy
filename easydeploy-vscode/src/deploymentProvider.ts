import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

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

    constructor() {}

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
        return new Promise<DeploymentItem[]>((resolve, reject) => {
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

            // Run the easydeploy status command to get deployments
            exec('easydeploy status', { cwd: workspaceRoot }, (error, stdout, stderr) => {
                if (error) {
                    return resolve([
                        new DeploymentItem(
                            'Error fetching deployments',
                            vscode.TreeItemCollapsibleState.None
                        )
                    ]);
                }

                // Parse the output (this is a bit brittle, would be better with structured output)
                // In a real implementation, consider adding a --json flag to the CLI for better parsing
                const items: DeploymentItem[] = [];
                
                // If no deployments found
                if (stdout.includes('No deployments found')) {
                    return resolve([
                        new DeploymentItem(
                            'No deployments found',
                            vscode.TreeItemCollapsibleState.None
                        )
                    ]);
                }

                // Try to parse table-like output
                const lines = stdout.split('\n').filter(line => line.trim().length > 0);
                
                // First attempt: Look for lines that might contain deployment info
                const deploymentRegex = /([a-zA-Z0-9-]+)\s+([a-zA-Z0-9_-]+)\s+(completed|failed|in_progress|unknown)\s+([^\s]+)\s+(https?:\/\/[^\s]+|N\/A)/i;
                
                for (const line of lines) {
                    const match = line.match(deploymentRegex);
                    if (match) {
                        items.push(
                            new DeploymentItem(
                                `${match[2]}`,
                                vscode.TreeItemCollapsibleState.None,
                                match[1], // job ID
                                match[3], // status
                                match[5] !== 'N/A' ? match[5] : undefined // URL
                            )
                        );
                    }
                }

                // Second attempt: Look for a single deployment
                if (items.length === 0 && stdout.includes('Job ID:')) {
                    const jobIdMatch = stdout.match(/Job ID: ([a-zA-Z0-9-]+)/);
                    const statusMatch = stdout.match(/Status: ([a-zA-Z0-9_]+)/);
                    const urlMatch = stdout.match(/URL: (https?:\/\/[^\s]+)/);
                    
                    if (jobIdMatch) {
                        items.push(
                            new DeploymentItem(
                                'Deployment',
                                vscode.TreeItemCollapsibleState.None,
                                jobIdMatch[1],
                                statusMatch ? statusMatch[1] : 'unknown',
                                urlMatch ? urlMatch[1] : undefined
                            )
                        );
                    }
                }

                // If we still couldn't parse anything but have output
                if (items.length === 0 && lines.length > 0) {
                    // Just add a generic item
                    items.push(
                        new DeploymentItem(
                            'Recent deployment',
                            vscode.TreeItemCollapsibleState.None,
                            undefined,
                            'check status for details'
                        )
                    );
                }

                resolve(items);
            });
        });
    }
} 