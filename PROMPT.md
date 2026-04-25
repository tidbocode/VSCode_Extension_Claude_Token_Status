# Claude Token Status — VSCode Extension Spec

## Goal

A VSCode status bar extension that shows how much of the Claude Code context window is currently in use, giving developers a real-time sense of how close they are to the 200k token limit.

---

## Data Source

Claude Code stores session transcripts as JSONL files under:
```
~/.claude/projects/<project-dir>/
```

Each line is a JSON event. The relevant ones are assistant messages containing a `usage` block:
```json
{
  "type": "assistant",
  "message": {
    "usage": {
      "input_tokens": 45200,
      "output_tokens": 1800,
      "cache_read_input_tokens": 120000,
      "cache_creation_input_tokens": 5000
    }
  }
}
```

The **last** such entry in the file represents the current state of the conversation context. The `input_tokens` field is what counts against the context window (it grows as the conversation grows).

**Open question:** Should we scope to the current workspace's session file specifically, or read the most recently modified JSONL across all projects? Scoping is more accurate but requires us to reverse-engineer how Claude Code encodes workspace paths as directory names.

---

## Status Bar Display

**Format:** `$(key) 45.2k / 200k`

**Color coding based on % of context used:**
| Usage     | Color     |
|-----------|-----------|
| < 75%     | Default   |
| 75% – 89% | Warning (yellow) |
| ≥ 90%     | Error (red) |

**Tooltip (on hover):**
```
Claude Code Context Window
─────────────────────────
Input tokens:       45,200
Output tokens:       1,800
Cache read:        120,000
Cache creation:      5,000
─────────────────────────
Total context:     171,000 / 200,000 (85.5%)
```

**When no session is found:** `$(key) Claude: --`

---

## Interactions

- **Click** the status bar item → refresh immediately (manual update)
- **File watcher** on `~/.claude/projects/**/*.jsonl` → auto-update on change
- **Polling fallback** every 10 seconds in case the file watcher misses events

---

## Configuration (contributes.configuration)

| Setting | Default | Description |
|---|---|---|
| `claudeTokenStatus.contextWindowSize` | `200000` | Token limit for the model in use |
| `claudeTokenStatus.refreshInterval` | `10` | Polling interval in seconds |
| `claudeTokenStatus.scope` | `"mostRecent"` | `"mostRecent"` or `"workspace"` — which session to track |

---

## Tech Stack

- **Language:** TypeScript
- **Build:** `tsc` (no bundler for simplicity)
- **VSCode API:** `vscode.StatusBarItem`, `vscode.workspace.createFileSystemWatcher`, `vscode.workspace.getConfiguration`
- **Node stdlib:** `fs`, `path`, `os`
- **No external npm dependencies**

---

## Project File Structure

```
/
├── src/
│   └── extension.ts       # Main activation, status bar, file watching
├── package.json           # Extension manifest + contributes
├── tsconfig.json          # TypeScript config
├── .vscodeignore          # Exclude src/, tsconfig.json from VSIX
├── PROMPT.md              # This file
├── README.md
└── LICENSE
```

---

## Decisions Made

1. **Session scope:** `mostRecent` — always read the most recently modified JSONL across all projects. Simple, no path-encoding logic needed.
2. **Context counting:** `input_tokens + cache_read_input_tokens` — cache-read tokens genuinely occupy the context window, so this gives the accurate fill level. Broken down individually in the tooltip.
3. **Context window size:** Auto-detect from the `model` field in the session's assistant messages, mapped to known limits. Fall back to the configurable default (200k) if unrecognised.
4. **Status bar position:** Right side, priority 100.
5. **Icon:** `$(chip)$(sparkle)` — codicons only in the status bar (no custom images). `chip` ≈ token, `sparkle` ≈ firework burst.

---

## Model → Context Window Map

| Model pattern         | Context window |
|-----------------------|---------------|
| `claude-*` (any)      | 200,000       |

All current Claude models share the 200k window. The map exists so future models with different limits can be added without a config change.

---

## Open Questions

- **Status bar position:** Should it appear to the left or right of other common extensions (e.g., language mode, git branch)?
