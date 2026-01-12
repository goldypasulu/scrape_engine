/**
 * Redis/BullMQ Connection
 * Centralized connection management for the job queue
 */

import IORedis from 'ioredis';
import { config } from '../config/index.js';
import { queueLogger as logger } from '../utils/logger.js';

let connectionInstance = null;

/**
 * Get Redis connection for BullMQ
 * Uses singleton pattern to share connection across queue components
 */
export function getConnection() {
  if (connectionInstance) {
    return connectionInstance;
  }

  const options = {
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error({ retryCount: times }, 'Redis connection failed after max retries');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 500, 5000);
      logger.warn({ retryCount: times, delay }, 'Retrying Redis connection');
      return delay;
    },
  };

  // Add password if provided
  if (config.redis.password) {
    options.password = config.redis.password;
  }

  connectionInstance = new IORedis(options);

  connectionInstance.on('connect', () => {
    logger.info({ host: config.redis.host, port: config.redis.port }, 'Redis connected');
  });

  connectionInstance.on('error', (error) => {
    logger.error({ error: error.message }, 'Redis connection error');
  });

  connectionInstance.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return connectionInstance;
}

/**
 * Close Redis connection
 */
export async function closeConnection() {
  if (connectionInstance) {
    await connectionInstance.quit();
    connectionInstance = null;
    logger.info('Redis connection closed');
  }
}

/**
 * Create a new connection (for workers that need separate connections)
 */
export function createConnection() {
  const options = {
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };

  if (config.redis.password) {
    options.password = config.redis.password;
  }

  return new IORedis(options);
}

export default {
  getConnection,
  closeConnection,
  createConnection,
};
