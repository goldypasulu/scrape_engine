/**
 * Scraping Worker
 * BullMQ worker that processes scraping jobs
 */

import { Worker } from 'bullmq';
import { createConnection } from './connection.js';
import { getCluster, closeCluster, queueTask } from '../core/cluster.js';
import { scrapeProducts } from '../scraper/product-scraper.js';
import { config, logMemoryUsage } from '../config/index.js';
import { jobLogger as logger } from '../utils/logger.js';

let workerInstance = null;
let isShuttingDown = false;

/**
 * Process a single scraping job
 * @param {Job} job - BullMQ job object
 */
async function processJob(job) {
  const startTime = Date.now();
  
  logger.info(
    { 
      jobId: job.id, 
      keyword: job.data.keyword,
      url: job.data.url?.substring(0, 50),
      attempt: job.attemptsMade + 1,
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
        jobId: job.id,
        duration: `${(duration / 1000).toFixed(1)}s`,
        productCount: results.totalProducts,
        pagesScraped: results.pagesScraped,
      },
      'Job completed successfully'
    );

    return results;

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error(
      { 
        jobId: job.id,
        error: error.message,
        stack: error.stack,
        duration: `${(duration / 1000).toFixed(1)}s`,
        attempt: job.attemptsMade + 1,
        maxAttempts: config.retry.attempts,
      },
      'Job failed'
    );

    throw error;
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

  logger.info(
    { 
      concurrency: config.maxWorkers,
      rateLimit: config.rateLimit,
    },
    'Starting scraping worker'
  );

  // Initialize the browser cluster
  await getCluster();

  // Create worker with dedicated connection
  workerInstance = new Worker(
    config.queues.scrapeJobs,
    processJob,
    {
      connection: createConnection(),
      concurrency: config.maxWorkers,
      limiter: config.rateLimit,
      // Lock duration should be longer than expected job time
      lockDuration: config.timeouts.page * 2,
      // Stalled job settings
      stalledInterval: 30000,
      maxStalledCount: 2,
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
    logger.error(
      { 
        jobId: job?.id, 
        error: error.message,
        willRetry: (job?.attemptsMade || 0) < config.retry.attempts,
      },
      'Job failed'
    );
  });

  workerInstance.on('error', (error) => {
    logger.error({ error: error.message }, 'Worker error');
  });

  workerInstance.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Job stalled');
  });

  // Set up periodic memory logging
  const memoryInterval = setInterval(() => {
    if (!isShuttingDown) {
      logMemoryUsage(logger);
    }
  }, 60000);

  // Store interval reference for cleanup
  workerInstance._memoryInterval = memoryInterval;

  logger.info('Worker started and listening for jobs');

  return workerInstance;
}

/**
 * Stop the worker gracefully
 */
export async function stopWorker() {
  if (!workerInstance) {
    return;
  }

  isShuttingDown = true;
  logger.info('Stopping worker...');

  // Clear memory monitoring
  if (workerInstance._memoryInterval) {
    clearInterval(workerInstance._memoryInterval);
  }

  // Close worker (waits for active jobs to complete)
  await workerInstance.close();
  workerInstance = null;

  // Close the browser cluster
  await closeCluster();

  logger.info('Worker stopped');
}

/**
 * Get worker status
 */
export function getWorkerStatus() {
  if (!workerInstance) {
    return { running: false };
  }

  return {
    running: true,
    isShuttingDown,
    concurrency: config.maxWorkers,
  };
}

// Graceful shutdown handlers
function setupShutdownHandlers() {
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutdown signal received');
    await stopWorker();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  process.on('uncaughtException', async (error) => {
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    await stopWorker();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    logger.fatal({ reason, promise }, 'Unhandled rejection');
    await stopWorker();
    process.exit(1);
  });
}

// Auto-setup shutdown handlers when module is imported
setupShutdownHandlers();

export default {
  startWorker,
  stopWorker,
  getWorkerStatus,
};
