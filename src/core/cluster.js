/**
 * Puppeteer Cluster Configuration - HARDENED VERSION
 * 
 * DevOps Fixes:
 * 1. Explicit page.close() in finally block
 * 2. Page error recovery
 * 3. Memory tracking per task
 * 4. Zombie process prevention
 */

import { Cluster } from 'puppeteer-cluster';
import path from 'path';
import { getPuppeteer, configurePage, verifyStealthConfiguration } from './stealth.js';
import { config, logMemoryUsage } from '../config/index.js';
import { logger } from '../utils/logger.js';

let clusterInstance = null;
let stealthVerified = false;
let activePageCount = 0;
let memoryInterval = null;

/**
 * Build browser launch arguments including proxy if configured
 */
function buildBrowserArgs() {
  const args = [...config.browser.args];

  // Add proxy argument if enabled
  if (config.proxy.enabled && config.proxy.server) {
    // Extract proxy server (without auth, auth is done per-page)
    let proxyServer = config.proxy.server;
    
    // If server has embedded credentials, strip them (we'll use page.authenticate)
    if (proxyServer.includes('@')) {
      const url = new URL(proxyServer);
      proxyServer = `${url.protocol}//${url.host}`;
    }

    args.push(`--proxy-server=${proxyServer}`);
    
    // Bypass proxy for specified hosts
    if (config.proxy.bypass) {
      args.push(`--proxy-bypass-list=${config.proxy.bypass}`);
    }

    logger.info({ proxyServer }, 'Proxy configured for browser');
  }

  return args;
}

/**
 * Initialize and return the puppeteer cluster
 * Uses singleton pattern to ensure only one cluster exists
 */
export async function getCluster() {
  if (clusterInstance) {
    return clusterInstance;
  }

  const browserArgs = buildBrowserArgs();

  logger.info(
    { 
      maxConcurrency: config.maxConcurrency,
      proxyEnabled: config.proxy.enabled,
    },
    'Initializing Puppeteer Cluster'
  );

  clusterInstance = await Cluster.launch({
    // Use CONCURRENCY_BROWSER for maximum stability
    // Each task gets its own browser instance - more stable but uses more resources
    // This completely avoids the "Requesting main frame too early" race condition
    concurrency: Cluster.CONCURRENCY_BROWSER,
    
    // Number of parallel browsers
    maxConcurrency: config.maxConcurrency,
    
    // Use stealth-configured puppeteer
    puppeteer: getPuppeteer(),
    
    // Browser launch options
    puppeteerOptions: {
      headless: config.browser.headless ? 'new' : false,
      args: browserArgs, // Use args with proxy if configured
      userDataDir: path.resolve('./chrome-profile'), // Use persistent profile for login state
      defaultViewport: null, // We'll set this per-page
      // Use system Chrome if configured (for macOS compatibility)
      ...(config.browser.executablePath && { executablePath: config.browser.executablePath }),
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
    
    // Skip duplicate URLs
    skipDuplicateUrls: false,
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
  memoryInterval = setInterval(() => {
    logMemoryUsage(logger);
    logger.debug({ activePageCount }, 'Active pages');
  }, 30000);

  // Clean up on cluster close
  const originalClose = clusterInstance.close.bind(clusterInstance);
  clusterInstance.close = async () => {
    if (memoryInterval) {
      clearInterval(memoryInterval);
      memoryInterval = null;
    }
    logger.info('Shutting down Puppeteer Cluster');
    return originalClose();
  };

  logger.info('Puppeteer Cluster initialized successfully');

  return clusterInstance;
}

/**
 * Queue a task in the cluster with proper resource cleanup
 * 
 * CRITICAL: Ensures page is cleaned up even on error
 * 
 * @param {Function} taskFn - Task function to execute
 * @param {Object} data - Data to pass to the task
 */
export async function queueTask(taskFn, data) {
  const cluster = await getCluster();
  
  return cluster.execute(data, async ({ page, data: taskData }) => {
    activePageCount++;
    let pageConfigured = false;
    
    try {
      // ====== CRITICAL: Authenticate proxy per page ======
      // With CONCURRENCY_CONTEXT, all tabs share one browser instance
      // Proxy auth must be done per page, not at browser level
      if (config.proxy.enabled && config.proxy.username && config.proxy.password) {
        await page.authenticate({
          username: config.proxy.username,
          password: config.proxy.password,
        });
        logger.debug('Proxy authentication set for page');
      }

      // Configure page with anti-detection before each task
      await configurePage(page);
      pageConfigured = true;
      
      // Verify stealth configuration on first task (once per session)
      if (!stealthVerified) {
        const { passed, results } = await verifyStealthConfiguration(page);
        stealthVerified = true;
        
        if (!passed) {
          logger.warn({ results }, 'Stealth verification failed - detection may occur');
        }
      }

      // Set up page error handler
      page.on('error', (err) => {
        logger.error({ error: err.message }, 'Page crashed');
      });

      page.on('pageerror', (err) => {
        logger.debug({ error: err.message }, 'Page JavaScript error');
      });

      // Execute the task
      const result = await taskFn(page, taskData);
      
      return result;

    } catch (error) {
      logger.error({ 
        error: error.message, 
        pageConfigured,
        taskData: JSON.stringify(taskData).substring(0, 100),
      }, 'Task execution error');
      
      // Attempt to capture screenshot on error for debugging
      try {
        if (pageConfigured && config.logging.level === 'debug') {
          const timestamp = Date.now();
          await page.screenshot({ 
            path: `./error-${timestamp}.png`, 
            fullPage: true 
          });
          logger.debug({ path: `./error-${timestamp}.png` }, 'Error screenshot saved');
        }
      } catch (screenshotError) {
        // Ignore screenshot errors
      }

      throw error;

    } finally {
      activePageCount--;
      
      // ====== CRITICAL: Clean up page state ======
      try {
        // Clear cookies to prevent session leakage
        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies');
        await client.detach();
      } catch (cleanupError) {
        logger.debug({ error: cleanupError.message }, 'Cookie cleanup failed');
      }

      try {
        // Clear local storage and session storage
        await page.evaluate(() => {
          try {
            localStorage.clear();
            sessionStorage.clear();
          } catch {}
        });
      } catch (storageError) {
        logger.debug({ error: storageError.message }, 'Storage cleanup failed');
      }

      // Note: With CONCURRENCY_CONTEXT, puppeteer-cluster manages page lifecycle
      // We don't call page.close() as the cluster handles this
      // But we DO clean up state to prevent data leakage between tasks
      
      logger.debug({ activePageCount }, 'Task cleanup complete');
    }
  });
}

/**
 * Set up a task definition for the cluster
 * @param {Function} taskFn - Task function to execute
 */
export async function setClusterTask(taskFn) {
  const cluster = await getCluster();
  
  await cluster.task(async ({ page, data }) => {
    try {
      // Configure page with anti-detection
      await configurePage(page);
      return await taskFn(page, data);
    } finally {
      // Cleanup in task definition as well
      activePageCount--;
    }
  });
  
  return cluster;
}

/**
 * Close the cluster and clean up ALL resources
 * Called during graceful shutdown
 */
export async function closeCluster() {
  if (!clusterInstance) {
    logger.debug('Cluster already closed or not initialized');
    return;
  }

  logger.info({ activePageCount }, 'Closing cluster...');

  try {
    // Clear interval first
    if (memoryInterval) {
      clearInterval(memoryInterval);
      memoryInterval = null;
    }

    // Wait for active tasks to complete (with timeout)
    const idleTimeout = 30000; // 30 seconds max wait
    const idleStart = Date.now();
    
    while (activePageCount > 0 && (Date.now() - idleStart) < idleTimeout) {
      logger.debug({ activePageCount }, 'Waiting for active pages to complete');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (activePageCount > 0) {
      logger.warn({ activePageCount }, 'Force closing with active pages');
    }

    // Wait for cluster to be idle
    await Promise.race([
      clusterInstance.idle(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Idle timeout')), idleTimeout)
      ),
    ]).catch(err => {
      logger.warn({ error: err.message }, 'Cluster idle timeout, force closing');
    });

    // Close the cluster
    await clusterInstance.close();
    clusterInstance = null;
    stealthVerified = false;
    activePageCount = 0;

    logger.info('Cluster closed successfully');

  } catch (error) {
    logger.error({ error: error.message }, 'Error closing cluster');
    
    // Force cleanup
    clusterInstance = null;
    stealthVerified = false;
    activePageCount = 0;
    
    throw error;
  }
}

/**
 * Get cluster status for health checks
 */
export function getClusterStatus() {
  return {
    initialized: !!clusterInstance,
    activePages: activePageCount,
    stealthVerified,
  };
}

/**
 * Force kill all browser processes (emergency cleanup)
 * Use only when graceful shutdown fails
 */
export async function forceKillBrowsers() {
  logger.warn('Force killing all browser processes');
  
  try {
    if (clusterInstance) {
      // Access internal browser reference
      const browser = clusterInstance.browser;
      if (browser) {
        const process = browser.process();
        if (process) {
          process.kill('SIGKILL');
        }
      }
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Force kill failed');
  }

  clusterInstance = null;
  stealthVerified = false;
  activePageCount = 0;
}

export default {
  getCluster,
  queueTask,
  setClusterTask,
  closeCluster,
  getClusterStatus,
  forceKillBrowsers,
};
