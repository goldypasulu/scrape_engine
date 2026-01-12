/**
 * Configuration Loader
 * Centralizes all environment-aware settings with sensible defaults
 */

import 'dotenv/config';

function getEnvInt(key, defaultValue) {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBool(key, defaultValue) {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const config = {
  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: getEnvInt('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // Concurrency settings
  // Start conservative to avoid CPU spikes
  maxConcurrency: getEnvInt('MAX_CONCURRENCY', 2),
  maxWorkers: getEnvInt('MAX_WORKERS', 3),

  // Scroll behavior - tuned for human-like interaction
  scroll: {
    delayMin: getEnvInt('SCROLL_DELAY_MIN', 800),
    delayMax: getEnvInt('SCROLL_DELAY_MAX', 2000),
    incrementMin: getEnvInt('SCROLL_INCREMENT_MIN', 300),
    incrementMax: getEnvInt('SCROLL_INCREMENT_MAX', 700),
    maxScrolls: getEnvInt('MAX_SCROLLS', 50),
    pauseProbability: 0.15,  // 15% chance of longer pause
    pauseMin: 2000,
    pauseMax: 5000,
  },

  // Timeouts
  timeouts: {
    page: getEnvInt('PAGE_TIMEOUT', 60000),
    navigation: getEnvInt('NAVIGATION_TIMEOUT', 30000),
    selector: 10000,
  },

  // Rate limiting
  rateLimit: {
    max: getEnvInt('RATE_LIMIT_MAX', 10),
    duration: getEnvInt('RATE_LIMIT_DURATION', 60000),
  },

  // Scraper settings
  scraper: {
    maxPagesPerJob: getEnvInt('MAX_PAGES_PER_JOB', 5),
  },

  // Retry policy
  retry: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: getEnvBool('LOG_PRETTY', true),
  },

  // Browser settings
  browser: {
    headless: getEnvBool('HEADLESS', true),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
      '--disable-dev-shm-usage',
    ],
  },

  // Queue names
  queues: {
    scrapeJobs: 'scrape-jobs',
  },
};

// Memory monitoring utility
export function logMemoryUsage(logger) {
  const usage = process.memoryUsage();
  logger.info({
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
  }, 'Memory usage');
}

export default config;
