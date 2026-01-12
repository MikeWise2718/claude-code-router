import { getRoutingHistory, readRoutingState, RoutingHistoryEntry } from "@CCR/shared";

// ANSI color codes
const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  orange: "\x1b[38;2;255;165;0m",
  cyan: "\x1b[38;2;0;255;255m",
  magenta: "\x1b[38;2;218;112;214m",
  green: "\x1b[38;2;144;238;144m",
  yellow: "\x1b[38;2;255;215;0m",
  gray: "\x1b[38;2;128;128;128m",
  white: "\x1b[38;2;255;255;255m",
};

/**
 * Format tokens for display (e.g., 45000 -> "45k")
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

/**
 * Format timestamp for display (e.g., "10:30:01")
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Get color for scenario type
 */
function getScenarioColor(scenario: string): string {
  switch (scenario) {
    case "background":
      return COLORS.green;
    case "think":
      return COLORS.magenta;
    case "longContext":
      return COLORS.yellow;
    case "webSearch":
      return COLORS.cyan;
    default:
      return COLORS.white;
  }
}

/**
 * Display a single history entry
 */
function displayEntry(entry: RoutingHistoryEntry): void {
  const time = formatTime(entry.timestamp);
  const scenario = entry.scenario.padEnd(12);
  const model = entry.model;
  const tokens = formatTokens(entry.inputTokens);
  const reason = entry.reason;

  const scenarioColor = getScenarioColor(entry.scenario);

  console.log(
    `${COLORS.gray}[${time}]${COLORS.reset} ` +
      `${scenarioColor}${scenario}${COLORS.reset} → ` +
      `${COLORS.cyan}${model}${COLORS.reset} ` +
      `${COLORS.dim}(${tokens} tok)${COLORS.reset}` +
      `${COLORS.gray}  ${reason}${COLORS.reset}`
  );
}

/**
 * Display session summary
 */
async function displaySummary(): Promise<void> {
  const state = await readRoutingState();

  console.log("");
  console.log(`${COLORS.orange}Session Summary${COLORS.reset}`);
  console.log(`${COLORS.dim}${"─".repeat(50)}${COLORS.reset}`);
  console.log(`  Started: ${COLORS.white}${new Date(state.session.startTime).toLocaleString()}${COLORS.reset}`);
  console.log(`  Total requests: ${COLORS.white}${state.session.requestCount}${COLORS.reset}`);

  if (Object.keys(state.session.modelBreakdown).length > 0) {
    console.log(`  Model breakdown:`);
    for (const [modelKey, count] of Object.entries(state.session.modelBreakdown)) {
      const [provider, model] = modelKey.split("/");
      console.log(`    ${COLORS.cyan}${model}${COLORS.reset} ${COLORS.dim}@ ${provider}${COLORS.reset}: ${count} requests`);
    }
  }
}

/**
 * Handle the history command
 */
export async function handleHistoryCommand(args: string[]): Promise<void> {
  // Parse arguments
  let limit = 10; // Default to last 10 entries
  let showSummary = false;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-n" || arg === "--limit") {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        limit = parseInt(nextArg, 10);
        i++;
      }
    } else if (arg === "-a" || arg === "--all") {
      limit = 0; // 0 means all entries
    } else if (arg === "-s" || arg === "--summary") {
      showSummary = true;
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`
Usage: ccr history [options]

Options:
  -n, --limit <N>  Show last N entries (default: 10)
  -a, --all        Show all history entries
  -s, --summary    Show session summary
  --json           Output as JSON
  -h, --help       Show this help

Examples:
  ccr history           # Show last 10 routing decisions
  ccr history -n 20     # Show last 20 entries
  ccr history -a        # Show all entries
  ccr history -s        # Show summary only
  ccr history --json    # Output as JSON for scripting
`);
      return;
    }
  }

  // Get history
  const history = await getRoutingHistory(limit || undefined);

  if (jsonOutput) {
    const state = await readRoutingState();
    console.log(JSON.stringify({
      history,
      session: state.session,
    }, null, 2));
    return;
  }

  if (history.length === 0) {
    console.log(`${COLORS.yellow}No routing history available.${COLORS.reset}`);
    console.log(`${COLORS.dim}History is recorded when requests are routed through CCR.${COLORS.reset}`);
    return;
  }

  // Display header
  console.log(`${COLORS.orange}CCR Routing History${COLORS.reset} ${COLORS.dim}(last ${history.length} entries)${COLORS.reset}`);
  console.log(`${COLORS.dim}${"─".repeat(80)}${COLORS.reset}`);

  // Display entries
  for (const entry of history) {
    displayEntry(entry);
  }

  // Display summary if requested
  if (showSummary) {
    await displaySummary();
  }
}
