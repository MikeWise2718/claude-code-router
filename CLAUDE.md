# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Important:** Also read `README_mike.md` for local fork setup and fixes.

**Specs:** See `specs/` folder for planned features and implementation details.

## Project Overview

Claude Code Router is a tool that routes Claude Code requests to different LLM providers. It uses a Monorepo architecture with five main packages:

- **core** (`@musistudio/llms`): Core LLM API transformation server and transformer framework
- **server** (`@CCR/server`): Server handling API routing, agents, and stream processing
- **shared** (`@CCR/shared`): Shared constants, utilities, and preset management
- **cli** (`@CCR/cli`): Command-line tool providing the `ccr` command
- **ui** (`@CCR/ui`): Web management interface (React + Vite)

## Build Commands

```bash
pnpm build           # Build all packages (in dependency order)
pnpm build:core      # Build core LLM framework
pnpm build:shared    # Build shared utilities
pnpm build:server    # Build server
pnpm build:cli       # Build CLI
pnpm build:ui        # Build UI
pnpm build:docs      # Build documentation site
```

### Development mode

```bash
pnpm dev:core        # Develop core (nodemon)
pnpm dev:server      # Develop server (ts-node)
pnpm dev:cli         # Develop CLI (ts-node)
pnpm dev:ui          # Develop UI (Vite)
pnpm dev:docs        # Develop documentation site
```

### Publish

```bash
pnpm release         # Build and publish all packages
pnpm release:npm     # Publish to npm only
pnpm release:docker  # Build and push Docker image only
```

## Core Architecture

### 1. Package Dependencies

```
cli → server → core → shared
ui (standalone)
```

The core package (`@musistudio/llms`) provides:
- Fastify-based server framework
- Request/response transformation pipeline
- Built-in transformers for different providers
- SSE stream handling utilities

### 2. Routing System (packages/server/src/utils/router.ts)

The routing logic determines which model a request should be sent to:

- **Default routing**: Uses `Router.default` configuration
- **Project-level routing**: Checks `~/.claude/projects/<project-id>/claude-code-router.json`
- **Custom routing**: Loads custom JavaScript router function via `CUSTOM_ROUTER_PATH`
- **Built-in scenario routing**:
  - `background`: Background tasks (typically lightweight models)
  - `think`: Thinking-intensive tasks (Plan Mode)
  - `longContext`: Long context (exceeds `longContextThreshold` tokens)
  - `webSearch`: Web search tasks
  - `image`: Image-related tasks

Token calculation uses `tiktoken` (cl100k_base) to estimate request size.

### 3. Transformer System

Transformers adapt requests/responses to different provider API differences:

- Built-in transformers: `anthropic`, `deepseek`, `gemini`, `openrouter`, `groq`, `maxtoken`, `tooluse`, `reasoning`, `enhancetool`, etc.
- Custom transformers: Load external plugins via `transformers` array in `config.json`

Transformer configuration supports:
- Global application (provider level)
- Model-specific application
- Option passing (e.g., `max_tokens` parameter for `maxtoken`)

### 4. Agent System (packages/server/src/agents/)

Agents are pluggable feature modules that can:
- Detect whether to handle a request (`shouldHandle`)
- Modify requests (`reqHandler`)
- Provide custom tools (`tools`)

Agent tool call flow:
1. Detect and mark agents in `preHandler` hook
2. Add agent tools to the request
3. Intercept tool call events in `onSend` hook
4. Execute agent tool and initiate new LLM request
5. Stream results back

### 5. SSE Stream Processing

The server uses custom Transform streams to handle Server-Sent Events:
- `SSEParserTransform`: Parses SSE text stream into event objects
- `SSESerializerTransform`: Serializes event objects into SSE text stream
- `rewriteStream`: Intercepts and modifies stream data (for agent tool calls)

### 6. Configuration Management

Configuration file location: `~/.claude-code-router/config.json`

Key features:
- Supports environment variable interpolation (`$VAR_NAME` or `${VAR_NAME}`)
- JSON5 format (supports comments)
- Automatic backups (keeps last 3 backups)
- Hot reload requires service restart (`ccr restart`)

### 7. Logging System

Two separate logging systems:

**Server-level logs** (pino):
- Location: `~/.claude-code-router/logs/ccr-*.log`
- Configuration: `LOG_LEVEL` (fatal/error/warn/info/debug/trace)

**Application-level logs**:
- Location: `~/.claude-code-router/claude-code-router.log`
- Content: Routing decisions, business logic events

## CLI Commands

```bash
ccr start      # Start server
ccr stop       # Stop server
ccr restart    # Restart server
ccr status     # Show status
ccr code       # Execute claude command
ccr model      # Interactive model selection and configuration
ccr preset     # Manage presets (export, install, list, info, delete)
ccr activate   # Output shell environment variables (for integration)
ccr ui         # Open Web UI
ccr statusline # Integrated statusline (reads JSON from stdin)
```

## Subagent Routing

Use special tags in subagent prompts to specify models:
```
<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>
Please help me analyze this code...
```

## Preset System

Presets are stored in `~/.claude-code-router/presets/<preset-name>/manifest.json`

Core preset functions located in `packages/shared/src/preset/`:
- `export.ts`: Export configuration as preset (auto-sanitizes sensitive data)
- `install.ts`: Install and validate presets
- `merge.ts`: Merge preset with existing config (handles conflicts)
- `sensitiveFields.ts`: Detect and sanitize sensitive fields

CLI preset handlers in `packages/cli/src/utils/preset/`.

## Development Notes

1. **Node.js version**: Requires >= 20.0.0
2. **Package manager**: Uses pnpm >= 8.0.0 (monorepo depends on workspace protocol)
3. **TypeScript**: All packages use TypeScript; UI package uses ESM
4. **Build tools**:
   - core/cli/server/shared: esbuild
   - ui: Vite + TypeScript
5. **Code comments**: All comments in code MUST be written in English
6. **Documentation**: When implementing new features, add documentation to the docs project instead of creating standalone md files

## Configuration Example Locations

- Main configuration example: Complete example in README.md
- Custom router example: `custom-router.example.js`
