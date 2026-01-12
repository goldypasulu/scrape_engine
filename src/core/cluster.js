/**
 * Puppeteer Cluster Configuration
 * Manages browser pool with concurrency control
 */

import { Cluster } from 'puppeteer-cluster';
import { getPuppeteer, configurePage } from './stealth.js';
import { config, logMemoryUsage } from '../config/index.js';
import { logger } from '../utils/logger.js';

let clusterInstance = null;

/**
 * Initialize and return the puppeteer cluster
 * Uses singleton pattern to ensure only one cluster exists
 */
export async function getCluster() {
  if (clusterInstance) {
    return clusterInstance;
  }

  logger.info(
    { maxConcurrency: config.maxConcurrency },
    'Initializing Puppeteer Cluster'
  );

  clusterInstance = await Cluster.launch({
    // Use CONCURRENCY_CONTEXT for isolated browser contexts
    // More efficient than CONCURRENCY_BROWSER while maintaining isolation
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    
    // Number of parallel browser contexts
    maxConcurrency: config.maxConcurrency,
    
    // Use stealth-configured puppeteer
    puppeteer: getPuppeteer(),
    
    // Browser launch options
    puppeteerOptions: {
      headless: config.browser.headless ? 'new' : false,
      args: config.browser.args,
      defaultViewport: null, // We'll set this per-page
    },

    // Retry configuration
    retryLimit: config.retry.attempts,
    retryDelay: config.retry.backoff.delay,
    
    // Task timeout
    timeout: config.timeouts.page,

    // Monitor performance
    monitor: false, // Set to true for debugging
    
    // Sample data for monitoring
    sameCookiesPerTask: false,
  });

  // Set up cluster event handlers
  clusterInstance.on('taskerror', (err, data, willRetry) => {
    if (willRetry) {
      logger.warn(
        { error: err.message, data, willRetry },
        'Task error, will retry'
      );
    } else {
      logger.error(
        { error: err.message, data },
        'Task failed permanently'
      );
    }
  });

  // Log memory usage periodically
  const memoryInterval = setInterval(() => {
    logMemoryUsage(logger);
  }, 30000);

  // Clean up on cluster close
  const originalClose = clusterInstance.close.bind(clusterInstance);
  clusterInstance.close = async () => {
    clearInterval(memoryInterval);
    logger.info('Shutting down Puppeteer Cluster');
    return originalClose();
  };

  logger.info('Puppeteer Cluster initialized successfully');

  return clusterInstance;
}

/**
 * Queue a task in the cluster
 * @param {Function} taskFn - Task function to execute
 * @param {Object} data - Data to pass to the task
 */
export async function queueTask(taskFn, data) {
  const cluster = await getCluster();
  return cluster.execute(data, async ({ page, data: taskData }) => {
    // Configure page with anti-detection before each task
    await configurePage(page);
    return taskFn(page, taskData);
  });
}

/**
 * Set up a task definition for the cluster
 * @param {Function} taskFn - Task function to execute
 */
export async function setClusterTask(taskFn) {
  const cluster = await getCluster();
  
  await cluster.task(async ({ page, data }) => {
    // Configure page with anti-detection
    await configurePage(page);
    return taskFn(page, data);
  });
  
  return cluster;
}

/**
 * Close the cluster and clean up resources
 */
export async function closeCluster() {
  if (clusterInstance) {
    await clusterInstance.idle();
    await clusterInstance.close();
    clusterInstance = null;
    logger.info('Cluster closed');
  }
}

export default {
  getCluster,
  queueTask,
  setClusterTask,
  closeCluster,
};
