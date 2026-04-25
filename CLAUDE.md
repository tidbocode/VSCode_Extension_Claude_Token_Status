# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Extension Does

Shows Claude Code context window usage in the VSCode status bar — format `$(chip)$(sparkle) 45.2k / 200k` — so developers can see how close they are to the token limit during an active Claude Code session.

## Build & Development Commands

```bash
npm install          # install dev dependencies
npm run compile      # tsc one-shot build → out/
npm run watch        # tsc in watch mode during development
```

To test the extension locally: press **F5** in VSCode to launch the Extension Development Host.

To package for distribution:
```bash
npx vsce package     # produces a .vsix file
```

## Architecture

All logic lives in `src/extension.ts`. There is intentionally no bundler — `tsc` compiles directly to `out/`.

**Data flow:**
1. On activation, `activate()` creates the `StatusBarItem` and registers a `FileSystemWatcher` on `~/.claude/projects/**/*.jsonl`
2. Any file change (or the polling interval) triggers `updateStatusBar()`
3. `updateStatusBar()` calls `getLatestTokenUsage()`, which scans `~/.claude/projects/` for the most recently modified `.jsonl` file and parses it
4. The parser walks the JSONL lines in reverse, finds the last `type === "assistant"` entry with a `message.usage` block, and extracts token counts
5. Context used = `input_tokens + cache_read_input_tokens` (both occupy context window space)
6. The model name is read from `message.model` and mapped to a context window size; unknown models fall back to the configured default (200k)

**Color thresholds:**
- < 75% → default
- 75–89% → `statusBarItem.warningBackground`
- ≥ 90% → `statusBarItem.errorBackground`

## Key Constraints

- **No external npm dependencies** — only Node stdlib (`fs`, `path`, `os`) and the `vscode` API.
- **Session scope is always "most recent"** — the extension reads whichever JSONL was modified most recently across all projects, not just the current workspace.
- **Status bar only supports codicons** — no custom image files. Icon is `$(chip)$(sparkle)`.

## Configuration Keys

Defined in `package.json` under `contributes.configuration`, read via `vscode.workspace.getConfiguration('claudeTokenStatus')`:

| Key | Default | Purpose |
|---|---|---|
| `contextWindowSize` | `200000` | Fallback token limit if model is unrecognised |
| `refreshInterval` | `10` | Polling interval in seconds |

## Claude Code Session File Format

Each line in a session `.jsonl` is a JSON object. Only `type === "assistant"` entries with a `message.usage` object are relevant:

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-sonnet-4-6",
    "usage": {
      "input_tokens": 45200,
      "output_tokens": 1800,
      "cache_read_input_tokens": 120000,
      "cache_creation_input_tokens": 5000
    }
  }
}
```

The last such entry in the file is the current context state.
