import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { findMostRecentJsonl, parseLatestUsage, getContextWindowSize, buildTooltip, fmt } from './parser';

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

let pollingTimer: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext) {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'claudeTokenStatus.refresh';
  statusBar.show();
  context.subscriptions.push(statusBar);

  const refresh = () => updateStatusBar(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTokenStatus.refresh', refresh)
  );

  refresh();
  resetPolling(statusBar);
  context.subscriptions.push({ dispose: () => clearInterval(pollingTimer) });

  if (fs.existsSync(PROJECTS_DIR)) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(PROJECTS_DIR), '**/*.jsonl')
    );
    watcher.onDidChange(refresh);
    watcher.onDidCreate(refresh);
    context.subscriptions.push(watcher);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeTokenStatus')) {
        resetPolling(statusBar);
        refresh();
      }
    })
  );
}

function resetPolling(statusBar: vscode.StatusBarItem): void {
  clearInterval(pollingTimer);
  const config = vscode.workspace.getConfiguration('claudeTokenStatus');
  const intervalMs = config.get<number>('refreshInterval', 10) * 1000;
  pollingTimer = setInterval(() => updateStatusBar(statusBar), intervalMs);
}

function updateStatusBar(statusBar: vscode.StatusBarItem): void {
  const usage = getLatestTokenUsage();

  if (!usage) {
    statusBar.text = '$(sparkle) Claude: --';
    statusBar.tooltip = 'No Claude Code session found';
    statusBar.backgroundColor = undefined;
    return;
  }

  const config = vscode.workspace.getConfiguration('claudeTokenStatus');
  const fallback = config.get<number>('contextWindowSize', 200000);
  const windowSize = getContextWindowSize(usage.model, fallback);
  const contextUsed = usage.inputTokens + usage.cacheReadTokens;
  const pct = (contextUsed / windowSize) * 100;
  const modelLabel = usage.model ?? 'unknown model';

  statusBar.text = `$(sparkle) ${fmt(contextUsed)} / ${fmt(windowSize)}`;
  statusBar.tooltip = buildTooltip(usage, contextUsed, windowSize, pct, modelLabel);

  if (pct >= 90) {
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (pct >= 75) {
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    statusBar.backgroundColor = undefined;
  }
}

function getLatestTokenUsage() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return null;
  }
  const jsonlFile = findMostRecentJsonl(PROJECTS_DIR);
  if (!jsonlFile) {
    return null;
  }
  return parseLatestUsage(jsonlFile);
}

export function deactivate() {
  clearInterval(pollingTimer);
}
