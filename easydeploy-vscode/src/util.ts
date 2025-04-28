import * as vscode from 'vscode';

/**
 * Show a status message in the global status bar
 */
export function showGlobalMessage(message: string, isError: boolean = false) {
    if (isError) {
        vscode.window.showErrorMessage(message);
    } else {
        vscode.window.showInformationMessage(message);
    }
}

/**
 * Get the appropriate status icon for deployments
 */
export function getLogStatusIcon(status: string): string {
    switch (status?.toLowerCase()) {
        case 'success':
        case 'completed':
        case 'done':
            return '✅';
        case 'failed':
        case 'error':
            return '❌';
        case 'running':
        case 'in_progress':
        case 'pending':
            return '🔄';
        default:
            return '⏳';
    }
} 