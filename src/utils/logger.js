/**
 * Structured Logger using Pino
 * Fast, JSON-structured logging for production use
 */

import pino from 'pino';
import { config } from '../config/index.js';

const transport = config.logging.pretty
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export const logger = pino({
  level: config.logging.level,
  transport,
  base: {
    service: 'scrape-engine',
  },
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

/**
 * Create a child logger with additional context
 * @param {Object} context - Additional fields to include in all logs
 */
export function createChildLogger(context) {
  return logger.child(context);
}

/**
 * Log job processing events
 */
export const jobLogger = logger.child({ component: 'job' });

/**
 * Log browser/scraper events
 */
export const scraperLogger = logger.child({ component: 'scraper' });

/**
 * Log parser events
 */
export const parserLogger = logger.child({ component: 'parser' });

/**
 * Log queue events
 */
export const queueLogger = logger.child({ component: 'queue' });

export default logger;
