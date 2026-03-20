const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || "info"];

function fmt(level, module, msg, data) {
  const ts = new Date().toISOString();
  const base = `[${ts}] ${level.toUpperCase().padEnd(5)} [${module}] ${msg}`;
  if (data) return `${base} ${JSON.stringify(data)}`;
  return base;
}

export function createLogger(module) {
  return {
    debug: (msg, data) => {
      if (currentLevel <= LEVELS.debug) console.debug(fmt("debug", module, msg, data));
    },
    info: (msg, data) => {
      if (currentLevel <= LEVELS.info) console.info(fmt("info", module, msg, data));
    },
    warn: (msg, data) => {
      if (currentLevel <= LEVELS.warn) console.warn(fmt("warn", module, msg, data));
    },
    error: (msg, data) => {
      if (currentLevel <= LEVELS.error) console.error(fmt("error", module, msg, data));
    },
  };
}
