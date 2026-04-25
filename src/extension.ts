import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string | undefined;
}

// All current Claude models share a 200k context window.
// Add entries here when new models with different limits ship.
const MODEL_WINDOW_MAP: Record<string, number> = {};

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
    statusBar.text = '$(chip)$(sparkle) Claude: --';
    statusBar.tooltip = 'No Claude Code session found';
    statusBar.backgroundColor = undefined;
    return;
  }

  const config = vscode.workspace.getConfiguration('claudeTokenStatus');
  const windowSize = getContextWindowSize(usage.model, config);
  const contextUsed = usage.inputTokens + usage.cacheReadTokens;
  const pct = (contextUsed / windowSize) * 100;
  const modelLabel = usage.model ?? 'unknown model';

  statusBar.text = `$(chip)$(sparkle) ${fmt(contextUsed)} / ${fmt(windowSize)}`;
  statusBar.tooltip = buildTooltip(usage, contextUsed, windowSize, pct, modelLabel);

  if (pct >= 90) {
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else if (pct >= 75) {
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    statusBar.backgroundColor = undefined;
  }
}

function buildTooltip(
  usage: TokenUsage,
  contextUsed: number,
  windowSize: number,
  pct: number,
  modelLabel: string
): string {
  const sep = '─'.repeat(38);
  return [
    `Claude Code Context Window (${modelLabel})`,
    sep,
    `Input tokens:       ${usage.inputTokens.toLocaleString()}`,
    `Output tokens:      ${usage.outputTokens.toLocaleString()}`,
    `Cache read:         ${usage.cacheReadTokens.toLocaleString()}`,
    `Cache creation:     ${usage.cacheCreationTokens.toLocaleString()}`,
    sep,
    `Total context:  ${contextUsed.toLocaleString()} / ${windowSize.toLocaleString()} (${pct.toFixed(1)}%)`,
  ].join('\n');
}

function getLatestTokenUsage(): TokenUsage | null {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return null;
  }
  const jsonlFile = findMostRecentJsonl(PROJECTS_DIR);
  if (!jsonlFile) {
    return null;
  }
  return parseLatestUsage(jsonlFile);
}

function findMostRecentJsonl(dir: string): string | null {
  let bestPath: string | null = null;
  let bestTime = 0;

  function scan(current: string): void {
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          try {
            const { mtimeMs } = fs.statSync(full);
            if (mtimeMs > bestTime) {
              bestTime = mtimeMs;
              bestPath = full;
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    } catch {
      // skip unreadable directories
    }
  }

  scan(dir);
  return bestPath;
}

function parseLatestUsage(filePath: string): TokenUsage | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const lines = content.split('\n').filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      const u = entry?.message?.usage;
      if (entry?.type === 'assistant' && u && typeof u.input_tokens === 'number') {
        return {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          cacheReadTokens: u.cache_read_input_tokens ?? 0,
          cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
          model: typeof entry.message.model === 'string' ? entry.message.model : undefined,
        };
      }
    } catch {
      // skip malformed lines
    }
  }

  return null;
}

function getContextWindowSize(
  model: string | undefined,
  config: vscode.WorkspaceConfiguration
): number {
  if (model) {
    for (const [pattern, size] of Object.entries(MODEL_WINDOW_MAP)) {
      if (model.includes(pattern)) {
        return size;
      }
    }
  }
  return config.get<number>('contextWindowSize', 200000);
}

function fmt(n: number): string {
  if (n >= 10000) {
    return `${Math.round(n / 1000)}k`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return n.toString();
}

export function deactivate() {
  clearInterval(pollingTimer);
}
