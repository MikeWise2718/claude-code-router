# CCR Visual Feedback System

**Status:** Phase 1 Implemented
**Author:** Mike
**Created:** 2026-01-12

## Problem Statement

When running `ccr code`, the Claude Code interface is visually identical to running `claude` directly. This creates two problems:

1. **No confirmation CCR is active** - Users can't tell if requests are going through the router
2. **Misleading model display** - Claude Code shows "claude-sonnet-4-..." but CCR may route to DeepSeek, Gemini, or other providers

Users need clear, real-time feedback about:
- Whether CCR is active
- Which model/provider is handling their requests
- What routing scenario triggered (default, background, longContext, etc.)

## Phased Implementation Plan

### Phase 1: Startup Confirmation (Quick Win) - IMPLEMENTED

**Goal:** Immediately know CCR is active when starting a session.

**Scope:**
- Modify `ccr code` to print a startup banner before launching Claude Code
- Show essential routing configuration at a glance

**Implementation:**

1. **Add startup banner in `packages/cli/src/utils/codeCommand.ts`**

   Before spawning the claude process, print:
   ```
   ╭─────────────────────────────────────────────────────╮
   │  CCR v2.0.0 Active                                  │
   │  Default: deepseek-reasoner @ DeepSeek              │
   │  Port: 3456                                         │
   ╰─────────────────────────────────────────────────────╯
   ```

2. **Show routing summary (optional enhancement)**
   ```
   │  Routes: background→haiku, think→opus              │
   ```

3. **Preset indicator** (if using a preset)
   ```
   │  Preset: my-deepseek-config                        │
   ```

**Files to modify:**
- `packages/cli/src/utils/codeCommand.ts` - Add banner printing logic
- `packages/shared/src/index.ts` - May need to export config reading utilities

**Testing:**
- Run `ccr code` and verify banner appears
- Run `claude` directly and verify no banner (to confirm distinction)

**Effort:** Low (1-2 hours)

**Actual Implementation (2026-01-12):**
- Added `printStartupBanner()` function to `packages/cli/src/utils/codeCommand.ts`
- Banner displays: CCR version, default model@provider, preset name (if any), port, additional routes
- Can be disabled via `config.VisualFeedback.startupBanner = false`
- Example output:
  ```
  ────────────────────────────────────────────────
    CCR v2.0.0 Active
    Default: deepseek-reasoner @ deepseek
    Port: 3456
    Routes: background: haiku, think: opus
  ────────────────────────────────────────────────
  ```

---

### Phase 2: Server-Side State Tracking

**Goal:** Track routing decisions so other components can display them.

**Scope:**
- Server writes routing state after each request
- State is queryable via file or endpoint

**Implementation:**

1. **Create state file structure**

   Location: `~/.claude-code-router/routing-state.json`

   ```json
   {
     "lastUpdated": "2026-01-12T10:30:00.000Z",
     "lastRequest": {
       "model": "deepseek-reasoner",
       "provider": "DeepSeek",
       "scenario": "default",
       "inputTokens": 1523,
       "timestamp": "2026-01-12T10:30:00.000Z"
     },
     "session": {
       "startTime": "2026-01-12T10:00:00.000Z",
       "requestCount": 42,
       "modelBreakdown": {
         "deepseek-reasoner": 35,
         "claude-3-5-haiku-20241022": 7
       }
     }
   }
   ```

2. **Write state after routing decision**

   In `packages/server/src/utils/router.ts`, after determining the route:
   - Write to state file (async, non-blocking)
   - Update session statistics

3. **Add state reset on server start**
   - Clear/initialize state file when `ccr start` runs
   - Preserve session stats until explicit reset

**Files to modify:**
- `packages/server/src/utils/router.ts` - Add state writing after routing
- `packages/shared/src/constants.ts` - Add state file path constant
- `packages/cli/src/utils/index.ts` - Initialize state on server start

**New files:**
- `packages/server/src/utils/routingState.ts` - State management utilities

**Testing:**
- Start server, make requests, verify state file updates
- Check state file format matches schema
- Verify non-blocking (doesn't slow down requests)

**Effort:** Medium (3-4 hours)

---

### Phase 3: StatusLine Integration

**Goal:** Real-time model/provider display in Claude Code's status line.

**Scope:**
- Enhance existing `ccr statusline` command
- Read state from Phase 2
- Display concise routing info

**Implementation:**

1. **Enhance `packages/cli/src/utils/statusline.ts`**

   Current statusline likely shows basic info. Enhance to:
   - Read `routing-state.json` from Phase 2
   - Format for display: `CCR | deepseek-reasoner | DeepSeek`

2. **StatusLine format options**

   Compact (default):
   ```
   CCR | deepseek-reasoner
   ```

   Verbose (config option):
   ```
   CCR | deepseek-reasoner @ DeepSeek | default | 42 reqs
   ```

   With scenario indicator:
   ```
   CCR | gemini-2.0-flash | longContext ⚡
   ```

3. **Enable StatusLine by default**

   Currently requires `StatusLine.enabled: true`. Consider:
   - Enable by default when using `ccr code`
   - Or prompt user to enable on first run
   - Document in README_mike.md how to enable

4. **Fallback handling**
   - If state file doesn't exist: show `CCR | starting...`
   - If state file is stale (>60s): show `CCR | idle`

**Files to modify:**
- `packages/cli/src/utils/statusline.ts` - Read and display routing state
- `packages/cli/src/utils/codeCommand.ts` - Consider enabling statusline by default

**Configuration:**
```json
{
  "StatusLine": {
    "enabled": true,
    "format": "compact",
    "showScenario": true,
    "showRequestCount": false
  }
}
```

**Testing:**
- Enable statusline, run `ccr code`, verify display updates
- Test different routing scenarios (background, longContext)
- Verify format options work

**Effort:** Medium (3-4 hours)

---

### Phase 4: Enhanced Debugging & Visibility

**Goal:** Comprehensive tools for understanding and debugging routing behavior.

**Scope:**
- Request history tracking
- Live monitoring command
- Enhanced logging visibility

**Implementation:**

#### 4a. Request History

1. **Extend state file with history**
   ```json
   {
     "history": [
       {
         "timestamp": "...",
         "model": "deepseek-reasoner",
         "provider": "DeepSeek",
         "scenario": "default",
         "inputTokens": 1523,
         "trigger": null
       },
       {
         "timestamp": "...",
         "model": "gemini-2.0-flash",
         "provider": "Google",
         "scenario": "longContext",
         "inputTokens": 45000,
         "trigger": "exceeded 32k threshold"
       }
     ]
   }
   ```

2. **CLI command to view history**
   ```bash
   ccr history        # Show last 10 routing decisions
   ccr history -n 50  # Show last 50
   ccr history --json # Output as JSON for scripting
   ```

#### 4b. Live Monitor

1. **Add `ccr monitor` command**
   - Watches state file for changes
   - Displays real-time routing decisions
   - Useful for debugging routing rules

   ```bash
   $ ccr monitor
   [10:30:01] default     → deepseek-reasoner @ DeepSeek (1.5k tokens)
   [10:30:15] background  → claude-3-5-haiku @ Anthropic (0.8k tokens)
   [10:30:32] longContext → gemini-2.0-flash @ Google (45k tokens)
   ^C to exit
   ```

#### 4c. Routing Explanation

1. **Add `ccr explain` command**
   - Show why last request was routed where it went
   - Useful for debugging custom routers

   ```bash
   $ ccr explain
   Last request routed to: gemini-2.0-flash @ Google
   Scenario: longContext
   Reason: Input tokens (45,230) exceeded longContextThreshold (32,000)

   Routing evaluation order:
   1. Custom router: not configured
   2. Project config: not found
   3. Subagent tag: not present
   4. Image detection: no images
   5. Web search: not detected
   6. Long context: TRIGGERED (45,230 > 32,000)
   ```

**New files:**
- `packages/cli/src/commands/history.ts`
- `packages/cli/src/commands/monitor.ts`
- `packages/cli/src/commands/explain.ts`

**Files to modify:**
- `packages/cli/src/cli.ts` - Register new commands
- `packages/server/src/utils/router.ts` - Log routing evaluation steps

**Effort:** High (8-12 hours total for all 4a/4b/4c)

---

### Phase 5: Web UI Integration (Optional)

**Goal:** Visual routing dashboard in the CCR web UI.

**Scope:**
- Real-time routing display in web UI
- Historical charts and statistics
- Configuration testing/preview

**Implementation:**

1. **Dashboard page in `packages/ui/`**
   - Real-time routing feed (WebSocket or polling)
   - Model usage pie chart
   - Scenario breakdown over time

2. **Routing tester**
   - Input sample request characteristics
   - Preview which model would be selected
   - Test custom router functions

3. **Configuration editor**
   - Visual editor for routing rules
   - Validation and testing built-in

**Effort:** High (depends on UI complexity)

---

## Implementation Order Recommendation

| Phase | Effort | Value | Priority |
|-------|--------|-------|----------|
| Phase 1: Startup Banner | Low | High | Do first |
| Phase 2: State Tracking | Medium | High | Foundation for Phase 3 |
| Phase 3: StatusLine | Medium | Very High | Primary UX improvement |
| Phase 4a: History | Low | Medium | Nice to have |
| Phase 4b: Monitor | Medium | Medium | Debugging aid |
| Phase 4c: Explain | Medium | High | Debugging aid |
| Phase 5: Web UI | High | Medium | Optional enhancement |

**Recommended path:**
1. Start with **Phase 1** - immediate value, low effort
2. Implement **Phase 2 + 3 together** - they're tightly coupled
3. Add **Phase 4c (explain)** - very useful for understanding routing
4. Add **Phase 4a/4b** as needed for debugging
5. **Phase 5** only if web UI is actively used

## Configuration Schema (Final State)

```json
{
  "StatusLine": {
    "enabled": true,
    "format": "compact",
    "showScenario": true,
    "showRequestCount": false,
    "showProvider": true
  },
  "VisualFeedback": {
    "startupBanner": true,
    "historySize": 100,
    "stateFilePath": "~/.claude-code-router/routing-state.json"
  }
}
```

## Rollback / Disable

Each phase should be independently disableable:

- **Phase 1**: `"startupBanner": false` in config
- **Phase 2**: State file can be ignored; no impact if not read
- **Phase 3**: `"StatusLine.enabled": false` (existing mechanism)
- **Phase 4**: Commands simply won't exist if not implemented; no config needed

## Open Questions

1. **Multiple sessions**: If user runs multiple `ccr code` sessions simultaneously, how should state be tracked? Options:
   - Single state file (shows last request across all sessions)
   - Session-specific state files (more complex)
   - For Phase 1-3, single file is probably fine

2. **State file location**: Should it be in temp directory (cleared on reboot) or config directory (persists)?
   - Recommend: temp directory for state, config directory for history

3. **StatusLine refresh rate**: How often does Claude Code poll the statusline command?
   - Need to verify current behavior
   - May need to document or make configurable

4. **Performance**: State file writes must not slow down request handling
   - Use async writes
   - Consider debouncing for rapid requests
