/**
 * Redis/BullMQ Connection - HARDENED VERSION
 * 
 * DevOps Fixes:
 * 1. Connection health monitoring
 * 2. Reconnection tracking
 * 3. Graceful disconnect
 * 4. Connection pool for workers
 */

import IORedis from 'ioredis';
import { config } from '../config/index.js';
import { queueLogger as logger } from '../utils/logger.js';

let connectionInstance = null;
const activeConnections = new Set();

/**
 * Get Redis connection for BullMQ
 * Uses singleton pattern to share connection across queue components
 */
export function getConnection() {
  if (connectionInstance && connectionInstance.status === 'ready') {
    return connectionInstance;
  }

  // Close stale connection
  if (connectionInstance) {
    try {
      connectionInstance.disconnect();
    } catch {}
    connectionInstance = null;
  }

  const options = createConnectionOptions('shared');
  connectionInstance = new IORedis(options);
  
  setupConnectionEvents(connectionInstance, 'shared');
  activeConnections.add(connectionInstance);

  return connectionInstance;
}

/**
 * Create connection options
 */
function createConnectionOptions(name = 'default') {
  const options = {
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: true,
    enableOfflineQueue: true,
    connectTimeout: 10000,
    disconnectTimeout: 5000,
    commandTimeout: 5000,
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error({ retryCount: times, name }, 'Redis connection failed after max retries');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 500, 5000);
      logger.warn({ retryCount: times, delay, name }, 'Retrying Redis connection');
      return delay;
    },
    reconnectOnError: (err) => {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      if (targetErrors.some(e => err.message.includes(e))) {
        logger.warn({ error: err.message, name }, 'Reconnecting due to error');
        return true;
      }
      return false;
    },
  };

  // Add password if provided
  if (config.redis.password) {
    options.password = config.redis.password;
  }

  return options;
}

/**
 * Set up connection event handlers
 */
function setupConnectionEvents(connection, name) {
  connection.on('connect', () => {
    logger.info({ 
      host: config.redis.host, 
      port: config.redis.port,
      name,
    }, 'Redis connecting...');
  });

  connection.on('ready', () => {
    logger.info({ name }, 'Redis connection ready');
  });

  connection.on('error', (error) => {
    logger.error({ error: error.message, name }, 'Redis connection error');
  });

  connection.on('close', () => {
    logger.warn({ name }, 'Redis connection closed');
  });

  connection.on('reconnecting', (delay) => {
    logger.debug({ delay, name }, 'Redis reconnecting');
  });

  connection.on('end', () => {
    logger.info({ name }, 'Redis connection ended');
    activeConnections.delete(connection);
  });
}

/**
 * Close the shared Redis connection
 */
export async function closeConnection() {
  if (connectionInstance) {
    try {
      logger.debug('Closing shared Redis connection...');
      await Promise.race([
        connectionInstance.quit(),
        new Promise(resolve => setTimeout(resolve, 5000)),
      ]);
    } catch (error) {
      logger.warn({ error: error.message }, 'Error closing Redis connection');
      connectionInstance.disconnect();
    }
    
    activeConnections.delete(connectionInstance);
    connectionInstance = null;
    logger.info('Shared Redis connection closed');
  }
}

/**
 * Create a new connection (for workers that need dedicated connections)
 * These connections are tracked for cleanup during shutdown
 */
export function createConnection() {
  const connectionName = `worker-${Date.now()}`;
  const options = createConnectionOptions(connectionName);
  const connection = new IORedis(options);
  
  setupConnectionEvents(connection, connectionName);
  activeConnections.add(connection);

  // Add disconnect handler to remove from tracking
  const originalDisconnect = connection.disconnect.bind(connection);
  connection.disconnect = () => {
    activeConnections.delete(connection);
    return originalDisconnect();
  };

  const originalQuit = connection.quit.bind(connection);
  connection.quit = async () => {
    activeConnections.delete(connection);
    return originalQuit();
  };

  return connection;
}

/**
 * Close all active connections
 * Called during graceful shutdown
 */
export async function closeAllConnections() {
  logger.info({ count: activeConnections.size }, 'Closing all Redis connections');

  const closePromises = [];
  
  for (const connection of activeConnections) {
    closePromises.push(
      Promise.race([
        connection.quit().catch(() => connection.disconnect()),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]).catch(() => {
        try { connection.disconnect(); } catch {}
      })
    );
  }

  await Promise.allSettled(closePromises);
  
  activeConnections.clear();
  connectionInstance = null;
  
  logger.info('All Redis connections closed');
}

/**
 * Check connection health
 */
export async function checkConnectionHealth() {
  try {
    const connection = getConnection();
    
    if (connection.status !== 'ready') {
      return { healthy: false, status: connection.status };
    }

    // Ping test
    const start = Date.now();
    await connection.ping();
    const latency = Date.now() - start;

    return { 
      healthy: true, 
      status: connection.status,
      latency,
      activeConnections: activeConnections.size,
    };
  } catch (error) {
    return { 
      healthy: false, 
      error: error.message,
      activeConnections: activeConnections.size,
    };
  }
}

/**
 * Get connection stats for monitoring
 */
export function getConnectionStats() {
  return {
    sharedConnection: connectionInstance ? {
      status: connectionInstance.status,
      mode: connectionInstance.mode,
    } : null,
    activeConnections: activeConnections.size,
  };
}

export default {
  getConnection,
  closeConnection,
  createConnection,
  closeAllConnections,
  checkConnectionHealth,
  getConnectionStats,
};
