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

## Fixes in this Fork

### DeepSeek Thinking Transformer (deepseek-reasoner model)

**Problem:** DeepSeek v3.2 API requires all assistant messages to have a `reasoning_content` field, even if empty. Without this, multi-turn conversations with the `deepseek-reasoner` model would fail.

**Fix:** Added `deepseek-thinking` transformer in `packages/core/src/transformer/deepseek-thinking.transformer.ts`

The transformer:
- Adds empty `reasoning_content: ""` to assistant messages that are missing it (request transformation)
- Ensures `reasoning_content` exists in responses for history preservation (response transformation)
- Only applies to the `deepseek-reasoner` model

See: https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
