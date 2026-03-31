type DebugConfig = {
  global: boolean;
  local: Record<string, boolean>;
  log: Record<string, boolean>;
};

type DebugMeta = {
  id?: string;
  on?: boolean;
};

const logConfiguration: DebugConfig = {
  global: false,
  local: {},
  log: {},
};

export function debugLog({
  global,
  local,
  log,
}: {
  global?: boolean;
  local?: Record<string, boolean>;
  log?: Record<string, boolean>;
} = {}): void {
  if (typeof global === "boolean") logConfiguration.global = global;

  if (local) {
    Object.entries(local).forEach(([key, value]) => {
      if (typeof value === "boolean") logConfiguration.local[key] = value;
    });
  }

  if (log) {
    Object.entries(log).forEach(([key, value]) => {
      if (typeof value === "boolean") logConfiguration.log[key] = value;
    });
  }
}

export function getLogConfiguration(): DebugConfig {
  return {
    global: logConfiguration.global,
    local: { ...logConfiguration.local },
    log: { ...logConfiguration.log },
  };
}

function loggingIsOn(scope?: string, id?: string): boolean {
  if (!logConfiguration.global) return false;
  if (scope && logConfiguration.local[scope] === false) return false;
  if (id && logConfiguration.log[id] === false) return false;
  return true;
}

function parseArgs(metaOrMsg: unknown, rest: unknown[]) {
  if (metaOrMsg && typeof metaOrMsg === "object" && !Array.isArray(metaOrMsg)) {
    return {
      meta: metaOrMsg as DebugMeta,
      args: rest,
    };
  }

  return {
    meta: null,
    args: [metaOrMsg, ...rest],
  };
}

export function debugFor(scope?: string) {
  const prefix = scope ? `[UBC Workday - Schedule Tool:${scope}]` : "[UBC Workday - Schedule Tool]";

  const log =
    (consoleMethod: "log" | "warn" | "error") =>
    (metaOrMsg?: unknown, ...rest: unknown[]) => {
      const { meta, args } = parseArgs(metaOrMsg, rest);

      if (meta?.on === false) return;
      if (meta?.on !== true && !loggingIsOn(scope, meta?.id)) return;

      console[consoleMethod](prefix, ...args);
    };

  return {
    log: log("log"),
    warn: log("warn"),
    error: log("error"),
    on: () => debugLog({ local: { [scope ?? "global"]: true } }),
    off: () => debugLog({ local: { [scope ?? "global"]: false } }),
  };
}
