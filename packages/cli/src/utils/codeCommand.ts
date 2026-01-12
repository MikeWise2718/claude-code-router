import { spawn, type StdioOptions } from "child_process";
import {getSettingsPath, readConfigFile} from ".";
import {
  decrementReferenceCount,
  incrementReferenceCount,
  closeService,
} from "./processCheck";
import { quote } from 'shell-quote';
import minimist from "minimist";
import { createEnvVariables } from "./createEnvVariables";
import { version } from "../../package.json";

/**
 * Parse a route string like "provider,model" into parts
 */
function parseRoute(route: string | undefined): { provider: string; model: string } | null {
  if (!route) return null;
  const parts = route.split(",");
  if (parts.length >= 2) {
    return { provider: parts[0], model: parts.slice(1).join(",") };
  }
  return null;
}

/**
 * Print startup banner showing CCR is active and routing configuration
 */
function printStartupBanner(
  config: any,
  presetConfig?: PresetConfig | null,
  presetName?: string
) {
  // Skip banner if disabled in config
  if (config?.VisualFeedback?.startupBanner === false) {
    return;
  }

  const port = config?.PORT || 3456;
  const router = presetConfig?.router || config?.Router || {};

  // Parse default route
  const defaultRoute = parseRoute(router.default);
  const defaultDisplay = defaultRoute
    ? `${defaultRoute.model} @ ${defaultRoute.provider}`
    : "not configured";

  // Build additional routes summary
  const additionalRoutes: string[] = [];
  if (router.background) {
    const r = parseRoute(router.background);
    if (r) additionalRoutes.push(`background: ${r.model}`);
  }
  if (router.think) {
    const r = parseRoute(router.think);
    if (r) additionalRoutes.push(`think: ${r.model}`);
  }
  if (router.longContext) {
    const r = parseRoute(router.longContext);
    const threshold = router.longContextThreshold || 60000;
    if (r) additionalRoutes.push(`longContext(>${threshold}): ${r.model}`);
  }
  if (router.webSearch) {
    const r = parseRoute(router.webSearch);
    if (r) additionalRoutes.push(`webSearch: ${r.model}`);
  }

  // Calculate box width
  const lines: string[] = [];
  lines.push(`CCR v${version} Active`);
  lines.push(`Default: ${defaultDisplay}`);
  if (presetName) {
    lines.push(`Preset: ${presetName}`);
  }
  lines.push(`Port: ${port}`);
  if (additionalRoutes.length > 0) {
    lines.push(`Routes: ${additionalRoutes.join(", ")}`);
  }

  const maxLen = Math.max(...lines.map(l => l.length));
  const boxWidth = maxLen + 4;

  // Print box
  console.log("\n" + "\u2500".repeat(boxWidth));
  for (const line of lines) {
    console.log(`  ${line}`);
  }
  console.log("\u2500".repeat(boxWidth) + "\n");
}

export interface PresetConfig {
  noServer?: boolean;
  claudeCodeSettings?: {
    env?: Record<string, any>;
    statusLine?: any;
    [key: string]: any;
  };
  provider?: string;
  router?: Record<string, any>;
  StatusLine?: any;  // Preset's StatusLine configuration
  [key: string]: any;
}

export async function executeCodeCommand(
  args: string[] = [],
  presetConfig?: PresetConfig | null,
  envOverrides?: Record<string, string>,
  presetName?: string  // Preset name for statusline command
) {
  // Set environment variables using shared function
  const config = await readConfigFile();
  const env = await createEnvVariables();

  // Apply environment variable overrides (from preset's provider configuration)
  if (envOverrides) {
    Object.assign(env, envOverrides);
  }

  // Build settingsFlag
  let settingsFlag: ClaudeSettingsFlag = {
    env: env as ClaudeSettingsFlag['env']
  };

  // Add statusLine configuration
  // Priority: preset.StatusLine > global config.StatusLine
  const statusLineConfig = presetConfig?.StatusLine || config?.StatusLine;

  if (statusLineConfig?.enabled) {
    // If using preset, pass preset name to statusline command
    const statuslineCommand = presetName
      ? `ccr statusline ${presetName}`
      : "ccr statusline";

    settingsFlag.statusLine = {
      type: "command",
      command: statuslineCommand,
      padding: 0,
    }
  }

  // Merge claudeCodeSettings from preset into settingsFlag
  if (presetConfig?.claudeCodeSettings) {
    settingsFlag = {
      ...settingsFlag,
      ...presetConfig.claudeCodeSettings,
      // Deep merge env
      env: {
        ...settingsFlag.env,
        ...presetConfig.claudeCodeSettings.env,
      } as ClaudeSettingsFlag['env']
    };
  }

  // Non-interactive mode for automation environments
  if (config.NON_INTERACTIVE_MODE) {
    settingsFlag.env = {
      ...settingsFlag.env,
      CI: "true",
      FORCE_COLOR: "0",
      NODE_NO_READLINE: "1",
      TERM: "dumb"
    }
  }

  const settingsFile = await getSettingsPath(`${JSON.stringify(settingsFlag)}`)

  args.push('--settings', settingsFile);

  // Increment reference count when command starts
  incrementReferenceCount();

  // Print startup banner
  printStartupBanner(config, presetConfig, presetName);

  // Execute claude command
  const claudePath = config?.CLAUDE_PATH || process.env.CLAUDE_PATH || "claude";

  const joinedArgs = args.length > 0 ? quote(args) : "";

  const stdioConfig: StdioOptions = config.NON_INTERACTIVE_MODE
    ? ["pipe", "inherit", "inherit"] // Pipe stdin for non-interactive
    : "inherit"; // Default inherited behavior

  const argsObj = minimist(args)
  const argsArr = []
  for (const [argsObjKey, argsObjValue] of Object.entries(argsObj)) {
    if (argsObjKey !== '_' && argsObj[argsObjKey]) {
      const prefix = argsObjKey.length === 1 ? '-' : '--';
      // For boolean flags, don't append the value
      if (argsObjValue === true) {
        argsArr.push(`${prefix}${argsObjKey}`);
      } else {
        argsArr.push(`${prefix}${argsObjKey} ${JSON.stringify(argsObjValue)}`);
      }
    }
  }
  const claudeProcess = spawn(
    claudePath,
    argsArr,
    {
      env: {
        ...process.env,
      },
      stdio: stdioConfig,
      shell: true,
    }
  );

  // Close stdin for non-interactive mode
  if (config.NON_INTERACTIVE_MODE) {
    claudeProcess.stdin?.end();
  }

  claudeProcess.on("error", (error) => {
    console.error("Failed to start claude command:", error.message);
    console.log(
      "Make sure Claude Code is installed: npm install -g @anthropic-ai/claude-code"
    );
    decrementReferenceCount();
    process.exit(1);
  });

  claudeProcess.on("close", (code) => {
    decrementReferenceCount();
    closeService();
    process.exit(code || 0);
  });
}
