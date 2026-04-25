import * as fs from 'fs';
import * as path from 'path';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string | undefined;
}

// All current Claude models share a 200k context window.
// Add entries here when new models with different limits ship.
export const MODEL_WINDOW_MAP: Record<string, number> = {};

export function findMostRecentJsonl(dir: string): string | null {
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

export function parseLatestUsage(filePath: string): TokenUsage | null {
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

export function getContextWindowSize(model: string | undefined, fallback: number): number {
  if (model) {
    for (const [pattern, size] of Object.entries(MODEL_WINDOW_MAP)) {
      if (model.includes(pattern)) {
        return size;
      }
    }
  }
  return fallback;
}

export function fmt(n: number): string {
  if (n >= 100000) {
    return `${Math.round(n / 1000)}k`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return n.toString();
}

export function buildTooltip(
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
