import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import { ROUTING_STATE_FILE } from "./constants";

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
  } | null;
  session: {
    startTime: string;
    requestCount: number;
    modelBreakdown: Record<string, number>;
  };
}

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
  inputTokens: number
): Promise<void> {
  const parsed = parseRouteString(routeString);
  if (!parsed) return;

  const state = await readRoutingState();
  const now = new Date().toISOString();

  // Update last request
  state.lastRequest = {
    model: parsed.model,
    provider: parsed.provider,
    scenario,
    inputTokens,
    timestamp: now,
  };

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
