import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import { ROUTING_STATE_FILE } from "./constants";

/**
 * A single routing history entry
 */
export interface RoutingHistoryEntry {
  timestamp: string;
  model: string;
  provider: string;
  scenario: string;
  inputTokens: number;
  reason: string;
}

/**
 * Routing state structure for visual feedback
 */
export interface RoutingState {
  lastUpdated: string;
  lastRequest: {
    model: string;
    provider: string;
    scenario: string;
    inputTokens: number;
    timestamp: string;
    reason: string;
  } | null;
  session: {
    startTime: string;
    requestCount: number;
    modelBreakdown: Record<string, number>;
  };
  history: RoutingHistoryEntry[];
}

// Maximum history entries to keep
const MAX_HISTORY_ENTRIES = 100;

/**
 * Parse a route string like "provider,model" into parts
 */
export function parseRouteString(route: string): { provider: string; model: string } | null {
  if (!route) return null;
  const parts = route.split(",");
  if (parts.length >= 2) {
    return { provider: parts[0], model: parts.slice(1).join(",") };
  }
  return null;
}

/**
 * Create initial empty routing state
 */
export function createInitialRoutingState(): RoutingState {
  return {
    lastUpdated: new Date().toISOString(),
    lastRequest: null,
    session: {
      startTime: new Date().toISOString(),
      requestCount: 0,
      modelBreakdown: {},
    },
    history: [],
  };
}

/**
 * Ensure the directory for the state file exists
 */
async function ensureStateDirectory(): Promise<void> {
  const dir = dirname(ROUTING_STATE_FILE);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Read the current routing state from disk
 * Returns initial state if file doesn't exist or is invalid
 */
export async function readRoutingState(): Promise<RoutingState> {
  try {
    const content = await readFile(ROUTING_STATE_FILE, "utf-8");
    return JSON.parse(content) as RoutingState;
  } catch {
    return createInitialRoutingState();
  }
}

/**
 * Write routing state to disk (non-blocking fire-and-forget)
 */
export async function writeRoutingState(state: RoutingState): Promise<void> {
  try {
    await ensureStateDirectory();
    await writeFile(ROUTING_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    // Silently fail - state tracking should not break the main flow
    console.error("Failed to write routing state:", error);
  }
}

/**
 * Update routing state after a routing decision
 * This is the main function to call from the router
 */
export async function updateRoutingState(
  routeString: string,
  scenario: string,
  inputTokens: number,
  reason: string = "Default routing"
): Promise<void> {
  const parsed = parseRouteString(routeString);
  if (!parsed) return;

  const state = await readRoutingState();
  const now = new Date().toISOString();

  // Create history entry
  const historyEntry: RoutingHistoryEntry = {
    timestamp: now,
    model: parsed.model,
    provider: parsed.provider,
    scenario,
    inputTokens,
    reason,
  };

  // Update last request
  state.lastRequest = {
    model: parsed.model,
    provider: parsed.provider,
    scenario,
    inputTokens,
    timestamp: now,
    reason,
  };

  // Add to history (keep last MAX_HISTORY_ENTRIES)
  state.history = state.history || [];
  state.history.push(historyEntry);
  if (state.history.length > MAX_HISTORY_ENTRIES) {
    state.history = state.history.slice(-MAX_HISTORY_ENTRIES);
  }

  // Update session stats
  state.session.requestCount++;
  const modelKey = `${parsed.provider}/${parsed.model}`;
  state.session.modelBreakdown = state.session.modelBreakdown || {};
  state.session.modelBreakdown[modelKey] = (state.session.modelBreakdown[modelKey] || 0) + 1;

  state.lastUpdated = now;

  // Fire and forget - don't await in the main request flow
  writeRoutingState(state).catch(() => {});
}

/**
 * Initialize/reset routing state (call on server start)
 */
export async function initializeRoutingState(): Promise<void> {
  const initialState = createInitialRoutingState();
  await writeRoutingState(initialState);
}

/**
 * Get the path to the routing state file
 */
export function getRoutingStateFilePath(): string {
  return ROUTING_STATE_FILE;
}

/**
 * Get routing history entries
 * @param limit Maximum number of entries to return (default: all)
 * @returns Array of history entries, most recent last
 */
export async function getRoutingHistory(limit?: number): Promise<RoutingHistoryEntry[]> {
  const state = await readRoutingState();
  const history = state.history || [];
  if (limit && limit > 0) {
    return history.slice(-limit);
  }
  return history;
}
