/**
 * Minimal leveled logger with per-subsystem tags. Wraps `console` so we have a
 * single choke point for log level, and later for an in-game console overlay.
 */

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  Silent = 4,
}

let globalLevel: LogLevel = import.meta.env?.DEV ? LogLevel.Debug : LogLevel.Info;

export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export function getLogLevel(): LogLevel {
  return globalLevel;
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(subTag: string): Logger;
}

export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;
  return {
    debug(...args) {
      if (globalLevel <= LogLevel.Debug) console.debug(prefix, ...args);
    },
    info(...args) {
      if (globalLevel <= LogLevel.Info) console.info(prefix, ...args);
    },
    warn(...args) {
      if (globalLevel <= LogLevel.Warn) console.warn(prefix, ...args);
    },
    error(...args) {
      if (globalLevel <= LogLevel.Error) console.error(prefix, ...args);
    },
    child(subTag) {
      return createLogger(`${tag}:${subTag}`);
    },
  };
}

export const log = createLogger('voxelia');
