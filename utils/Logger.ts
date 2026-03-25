/**
 * utils/Logger.ts — Structured logger for the framework
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',
  info: '\x1b[34m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

export class Logger {
  constructor(private readonly name: string) {}

  debug(message: string): void { this.log('debug', message); }
  info(message: string): void { this.log('info', message); }
  warn(message: string): void { this.log('warn', message); }
  error(message: string): void { this.log('error', message); }

  private log(level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[LOG_LEVEL]) return;

    const color = COLORS[level];
    const reset = '\x1b[0m';
    const ts = new Date().toISOString().split('T')[1].substring(0, 12);

    console.log(
      `${color}[${ts}] [${level.toUpperCase()}] [${this.name}]${reset} ${message}`
    );
  }
}
