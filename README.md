# Claude Token Status

A VS Code extension that shows your [Claude Code](https://claude.ai/code) context window usage in the status bar — so you always know how close you are to the token limit.

## Features

- **Live token count** in the status bar: `✨ 56k / 200k`
- **Color-coded warnings** — turns yellow at 75% and red at 90% context usage
- **Hover tooltip** with a full breakdown of input, output, cache read, and cache creation tokens
- **Auto-updates** whenever your Claude Code session changes, with a polling fallback every 10 seconds
- **Click to refresh** manually at any time

## How It Works

Claude Code stores session transcripts as JSONL files under `~/.claude/projects/`. The extension watches those files for changes and reads the token usage from the most recently active session.

Context used is calculated as `input_tokens + cache_read_input_tokens` — both count against the context window.

## Requirements

[Claude Code](https://claude.ai/code) must be installed and have at least one active session.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `claudeTokenStatus.contextWindowSize` | `200000` | Fallback token limit if the model cannot be detected |
| `claudeTokenStatus.refreshInterval` | `10` | Polling interval in seconds |

## Status Bar Display

| Display | Meaning |
|---|---|
| `✨ 56k / 200k` | 56k tokens used of 200k context window |
| `✨ Claude: --` | No Claude Code session found |

Colors:
- **Default** — under 75% used
- **Yellow** — 75–89% used
- **Red** — 90%+ used
