/**
 * Scraping Worker - HARDENED VERSION
 * BullMQ worker with proper graceful shutdown patterns
 * 
 * DevOps Fixes:
 * 1. Proper Redis connection cleanup
 * 2. Shutdown timeout to prevent hanging
 * 3. Error classification for smart retry
 * 4. Health check endpoint data
 * 5. Zombie process prevention
 */

import { Worker } from 'bullmq';
import { createConnection, closeConnection } from './connection.js';
import { getCluster, closeCluster, queueTask, getClusterStatus, forceKillBrowsers } from '../core/cluster.js';
import { scrapeProducts } from '../scraper/product-scraper.js';
import { config, logMemoryUsage } from '../config/index.js';
import { jobLogger as logger } from '../utils/logger.js';

let workerInstance = null;
let workerConnection = null;
let isShuttingDown = false;
let shutdownPromise = null;
let memoryInterval = null;

// Track active jobs for graceful shutdown
const activeJobs = new Map();

/**
 * Error classification for smart retry behavior
 */
const ErrorTypes = {
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  BANNED: 'banned',
  CAPTCHA: 'captcha',
  RATE_LIMITED: 'rate_limited',
  SELECTOR: 'selector',
  UNKNOWN: 'unknown',
};

/**
 * Classify error for retry strategy
 */
function classifyError(error) {
  const message = error.message?.toLowerCase() || '';
  
  if (message.includes('timeout') || message.includes('navigation timeout')) {
    return ErrorTypes.TIMEOUT;
  }
  if (message.includes('net::') || message.includes('econnrefused') || message.includes('econnreset')) {
    return ErrorTypes.NETWORK;
  }
  if (message.includes('403') || message.includes('blocked') || message.includes('banned')) {
    return ErrorTypes.BANNED;
  }
  if (message.includes('captcha') || message.includes('challenge')) {
    return ErrorTypes.CAPTCHA;
  }
  if (message.includes('429') || message.includes('too many requests') || message.includes('rate limit')) {
    return ErrorTypes.RATE_LIMITED;
  }
  if (message.includes('selector') || message.includes('element not found')) {
    return ErrorTypes.SELECTOR;
  }
  
  return ErrorTypes.UNKNOWN;
}

/**
 * Get retry delay based on error type
 */
function getRetryDelay(errorType, attemptsMade) {
  const baseDelay = config.retry.backoff.delay;
  
  switch (errorType) {
    case ErrorTypes.RATE_LIMITED:
      // Exponential backoff with longer delays for rate limits
      return Math.min(baseDelay * Math.pow(3, attemptsMade), 300000); // Max 5 min
    case ErrorTypes.BANNED:
      // Very long delay for bans
      return Math.min(baseDelay * Math.pow(4, attemptsMade), 600000); // Max 10 min
    case ErrorTypes.TIMEOUT:
    case ErrorTypes.NETWORK:
      // Standard exponential backoff
      return Math.min(baseDelay * Math.pow(2, attemptsMade), 60000); // Max 1 min
    case ErrorTypes.CAPTCHA:
      // Longer delay for captcha
      return Math.min(baseDelay * Math.pow(3, attemptsMade), 180000); // Max 3 min
    default:
      return baseDelay * Math.pow(2, attemptsMade);
  }
}

/**
 * Process a single scraping job
 * @param {Job} job - BullMQ job object
 */
async function processJob(job) {
  // Check if we're shutting down
  if (isShuttingDown) {
    throw new Error('Worker is shutting down, job will be retried');
  }

  const startTime = Date.now();
  const jobId = job.id;
  
  // Track active job
  activeJobs.set(jobId, { startTime, data: job.data });
  
  logger.info(
    { 
      jobId, 
      keyword: job.data.keyword,
      url: job.data.url?.substring(0, 50),
      attempt: job.attemptsMade + 1,
      maxAttempts: config.retry.attempts,
      activeJobs: activeJobs.size,
    },
    'Processing job'
  );

  try {
    // Update progress
    await job.updateProgress(10);

    // Execute scraping task in the cluster
    const results = await queueTask(
      async (page, data) => {
        return scrapeProducts(page, data);
      },
      job.data
    );

    // Update progress
    await job.updateProgress(100);

    const duration = Date.now() - startTime;

    logger.info(
      { 
        jobId,
        duration: `${(duration / 1000).toFixed(1)}s`,
        productCount: results.totalProducts,
        pagesScraped: results.pagesScraped,
      },
      'Job completed successfully'
    );

    return results;

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorType = classifyError(error);
    const willRetry = job.attemptsMade + 1 < config.retry.attempts;
    
    logger.error(
      { 
        jobId,
        error: error.message,
        errorType,
        stack: error.stack,
        duration: `${(duration / 1000).toFixed(1)}s`,
        attempt: job.attemptsMade + 1,
        maxAttempts: config.retry.attempts,
        willRetry,
      },
      'Job failed'
    );

    // Update job with error classification for custom backoff
    try {
      await job.updateData({
        ...job.data,
        lastError: {
          type: errorType,
          message: error.message,
          attempt: job.attemptsMade + 1,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (updateError) {
      logger.debug({ error: updateError.message }, 'Failed to update job data');
    }

    // Throw UnrecoverableError for certain error types to skip retries
    if (errorType === ErrorTypes.BANNED && job.attemptsMade >= 1) {
      // After 2 failed attempts due to ban, stop retrying this URL
      const { UnrecoverableError } = await import('bullmq');
      throw new UnrecoverableError(`Banned after ${job.attemptsMade + 1} attempts: ${error.message}`);
    }

    throw error;

  } finally {
    // Remove from active jobs tracking
    activeJobs.delete(jobId);
  }
}

/**
 * Start the scraping worker
 */
export async function startWorker() {
  if (workerInstance) {
    logger.warn('Worker already running');
    return workerInstance;
  }

  if (isShuttingDown) {
    throw new Error('Cannot start worker during shutdown');
  }

  logger.info(
    { 
      concurrency: config.maxWorkers,
      rateLimit: config.rateLimit,
    },
    'Starting scraping worker'
  );

  // Initialize the browser cluster first
  await getCluster();

  // Create dedicated connection for this worker
  workerConnection = createConnection();

  // Create worker
  workerInstance = new Worker(
    config.queues.scrapeJobs,
    processJob,
    {
      connection: workerConnection,
      concurrency: config.maxWorkers,
      limiter: config.rateLimit,
      // Lock duration should be longer than expected job time
      lockDuration: config.timeouts.page * 2,
      // Stalled job settings
      stalledInterval: 30000,
      maxStalledCount: 2,
      // Custom backoff strategy
      settings: {
        backoffStrategy: (attemptsMade, type, err, job) => {
          const lastError = job?.data?.lastError;
          const errorType = lastError?.type || ErrorTypes.UNKNOWN;
          return getRetryDelay(errorType, attemptsMade);
        },
      },
    }
  );

  // Worker event handlers
  workerInstance.on('completed', (job, result) => {
    logger.info(
      { 
        jobId: job.id, 
        productCount: result?.totalProducts || 0,
      },
      'Job completed'
    );
  });

  workerInstance.on('failed', (job, error) => {
    const errorType = classifyError(error);
    logger.error(
      { 
        jobId: job?.id, 
        error: error.message,
        errorType,
        willRetry: (job?.attemptsMade || 0) < config.retry.attempts,
      },
      'Job failed'
    );
  });

  workerInstance.on('error', (error) => {
    logger.error({ error: error.message }, 'Worker error');
  });

  workerInstance.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Job stalled - will be reprocessed');
  });

  workerInstance.on('closing', () => {
    logger.info('Worker is closing...');
  });

  workerInstance.on('closed', () => {
    logger.info('Worker closed');
  });

  workerInstance.on('drained', () => {
    logger.debug('Queue drained - no more jobs');
  });

  // Set up periodic memory logging
  memoryInterval = setInterval(() => {
    if (!isShuttingDown) {
      logMemoryUsage(logger);
      logger.debug({ 
        activeJobs: activeJobs.size,
        cluster: getClusterStatus(),
      }, 'Worker status');
    }
  }, 60000);

  logger.info('Worker started and listening for jobs');

  return workerInstance;
}

/**
 * Stop the worker gracefully with timeout
 * 
 * @param {number} timeout - Maximum time to wait for graceful shutdown (ms)
 */
export async function stopWorker(timeout = 30000) {
  // Prevent multiple shutdown calls
  if (shutdownPromise) {
    return shutdownPromise;
  }

  if (!workerInstance) {
    logger.debug('Worker not running');
    return;
  }

  isShuttingDown = true;
  logger.info({ activeJobs: activeJobs.size, timeout }, 'Stopping worker gracefully...');

  shutdownPromise = (async () => {
    const shutdownStart = Date.now();

    try {
      // Step 1: Clear intervals
      if (memoryInterval) {
        clearInterval(memoryInterval);
        memoryInterval = null;
      }

      // Step 2: Pause the worker (stop accepting new jobs)
      if (workerInstance) {
        await workerInstance.pause();
        logger.debug('Worker paused');
      }

      // Step 3: Wait for active jobs with timeout
      const waitForActiveJobs = async () => {
        while (activeJobs.size > 0) {
          const elapsed = Date.now() - shutdownStart;
          if (elapsed >= timeout) {
            logger.warn({ 
              activeJobs: activeJobs.size,
              elapsed: `${(elapsed / 1000).toFixed(1)}s`,
            }, 'Shutdown timeout reached, force closing');
            break;
          }
          logger.debug({ activeJobs: activeJobs.size }, 'Waiting for active jobs');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      };

      await Promise.race([
        waitForActiveJobs(),
        new Promise(resolve => setTimeout(resolve, timeout)),
      ]);

      // Step 4: Close the worker
      if (workerInstance) {
        await Promise.race([
          workerInstance.close(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Worker close timeout')), 10000)
          ),
        ]).catch(err => {
          logger.warn({ error: err.message }, 'Worker close timeout, forcing');
        });
        workerInstance = null;
      }

      // Step 5: Close the browser cluster
      try {
        await closeCluster();
      } catch (clusterError) {
        logger.error({ error: clusterError.message }, 'Error closing cluster');
        // Try force kill as last resort
        await forceKillBrowsers();
      }

      // Step 6: Close Redis connection
      if (workerConnection) {
        try {
          await Promise.race([
            workerConnection.quit(),
            new Promise(resolve => setTimeout(resolve, 5000)),
          ]);
        } catch (redisError) {
          logger.warn({ error: redisError.message }, 'Redis connection close error');
          workerConnection.disconnect();
        }
        workerConnection = null;
      }

      // Also close the shared connection
      try {
        await closeConnection();
      } catch {}

      const shutdownDuration = Date.now() - shutdownStart;
      logger.info({ duration: `${(shutdownDuration / 1000).toFixed(1)}s` }, 'Worker stopped');

    } catch (error) {
      logger.error({ error: error.message, stack: error.stack }, 'Error during shutdown');
      
      // Emergency cleanup
      try {
        await forceKillBrowsers();
      } catch {}
      
      workerInstance = null;
      workerConnection = null;
      
    } finally {
      isShuttingDown = false;
      shutdownPromise = null;
      activeJobs.clear();
    }
  })();

  return shutdownPromise;
}

/**
 * Get worker status for health checks
 */
export function getWorkerStatus() {
  if (!workerInstance) {
    return { 
      running: false, 
      isShuttingDown,
    };
  }

  return {
    running: true,
    isShuttingDown,
    concurrency: config.maxWorkers,
    activeJobs: activeJobs.size,
    activeJobIds: Array.from(activeJobs.keys()),
    cluster: getClusterStatus(),
    uptime: workerInstance.opts?.connection ? 'connected' : 'disconnected',
  };
}

/**
 * Get active jobs (for monitoring)
 */
export function getActiveJobs() {
  return Array.from(activeJobs.entries()).map(([id, data]) => ({
    id,
    ...data,
    runningFor: Date.now() - data.startTime,
  }));
}

// ============================================
// GRACEFUL SHUTDOWN HANDLERS
// ============================================

let shutdownInProgress = false;

async function gracefulShutdown(signal) {
  if (shutdownInProgress) {
    logger.warn({ signal }, 'Shutdown already in progress');
    return;
  }

  shutdownInProgress = true;
  logger.info({ signal }, 'Shutdown signal received');

  try {
    await stopWorker(30000); // 30 second timeout
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message }, 'Shutdown failed');
    process.exit(1);
  }
}

function setupShutdownHandlers() {
  // Handle SIGTERM (Docker/Kubernetes)
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  
  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    shutdownInProgress = true;
    
    try {
      await stopWorker(10000); // Shorter timeout for crashes
    } catch {}
    
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    logger.fatal({ reason: String(reason) }, 'Unhandled rejection');
    shutdownInProgress = true;
    
    try {
      await stopWorker(10000);
    } catch {}
    
    process.exit(1);
  });

  // Handle beforeExit (cleanup chance)
  process.on('beforeExit', async (code) => {
    if (!shutdownInProgress && workerInstance) {
      logger.warn({ code }, 'Process exiting, cleaning up');
      await stopWorker(5000);
    }
  });
}

// Auto-setup shutdown handlers when module is imported
setupShutdownHandlers();

export default {
  startWorker,
  stopWorker,
  getWorkerStatus,
  getActiveJobs,
};
