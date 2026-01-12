# Mike's Notes for Claude Code Router

## Running from this Fork

### 1. Run Locally (Development Mode)

```bash
# Install dependencies first (if not done)
pnpm install

# Option A: Dev mode with ts-node (no build needed)
pnpm dev:cli

# Option B: Build and run directly
pnpm build
node dist/cli.js start
```

### 2. Install Globally from this Fork

```bash
# Build everything first
pnpm build

# Link globally (makes 'ccr' available everywhere)
npm link
```

This creates a symlink from your global npm bin to `dist/cli.js` in this directory. Now `ccr` will run your patched version from anywhere.

**After making code changes**, run `pnpm build` again for the global `ccr` to pick them up.

To **unlink** later (revert to npm version):

```bash
npm unlink -g @musistudio/claude-code-router
npm install -g @musistudio/claude-code-router
```

## Features in this Fork

### Startup Banner

When running `ccr code`, a startup banner is displayed showing:
- CCR version and confirmation it's active
- Default routing model and provider
- Preset name (if using a preset)
- Port number
- Additional configured routes (background, think, longContext, webSearch)

Example:
```
────────────────────────────────────────────────
  CCR v2.0.0 Active
  Default: deepseek-reasoner @ deepseek
  Port: 3456
  Routes: background: haiku, think: opus
────────────────────────────────────────────────
```

To disable the banner, add to your config:
```json
{
  "VisualFeedback": {
    "startupBanner": false
  }
}
```

### Routing State Tracking

The server tracks routing decisions in a state file that can be read by other tools (like the statusline in Phase 3).

**Location:** `$TMPDIR/claude-code-router/routing-state.json` (e.g., `/tmp/claude-code-router/routing-state.json` on Linux/Mac)

**State file structure:**
```json
{
  "lastUpdated": "2026-01-12T10:30:00.000Z",
  "lastRequest": {
    "model": "deepseek-reasoner",
    "provider": "deepseek",
    "scenario": "default",
    "inputTokens": 1523,
    "timestamp": "2026-01-12T10:30:00.000Z"
  },
  "session": {
    "startTime": "2026-01-12T10:00:00.000Z",
    "requestCount": 42,
    "modelBreakdown": {
      "deepseek/deepseek-reasoner": 35,
      "anthropic/claude-3-5-haiku": 7
    }
  }
}
```

The state file is:
- Initialized when the server starts
- Updated after each routing decision (non-blocking/async)
- Useful for debugging which model handled your requests

## Fixes in this Fork

### DeepSeek Thinking Transformer (deepseek-reasoner model)

**Problem:** DeepSeek v3.2 API requires all assistant messages to have a `reasoning_content` field, even if empty. Without this, multi-turn conversations with the `deepseek-reasoner` model would fail.

**Fix:** Added `deepseek-thinking` transformer in `packages/core/src/transformer/deepseek-thinking.transformer.ts`

The transformer:
- Adds empty `reasoning_content: ""` to assistant messages that are missing it (request transformation)
- Ensures `reasoning_content` exists in responses for history preservation (response transformation)
- Only applies to the `deepseek-reasoner` model

See: https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
