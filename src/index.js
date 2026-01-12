/**
 * Tokopedia Scrape Engine
 * Main entry point and API exports
 */

// Configuration
export { config, logMemoryUsage } from './config/index.js';
export { SELECTORS, getSelectorVariants } from './config/selectors.js';
export { getRandomUserAgent, getRandomDesktopUserAgent } from './config/user-agents.js';

// Core
export { getPuppeteer, configurePage, verifyStealthConfiguration } from './core/stealth.js';
export { 
  getCluster, 
  queueTask, 
  closeCluster, 
  getClusterStatus,
  forceKillBrowsers,
} from './core/cluster.js';
export * as browserUtils from './core/browser-utils.js';

// Scraper
export { autoScroll, scrollToElement, scrollToTop, scrollUntilItemCount } from './scraper/auto-scroll.js';
export { scrapeProducts, buildSearchUrl } from './scraper/product-scraper.js';
export * as domSelector from './scraper/dom-selector.js';

// Parser
export { parseProductCards, parsePage, validateHtmlStructure } from './parser/html-parser.js';
export * as dataTransformer from './parser/data-transformer.js';

// Queue
export { 
  getConnection, 
  closeConnection, 
  closeAllConnections,
  checkConnectionHealth,
  getConnectionStats,
} from './queue/connection.js';
export { 
  enqueueScrapeJob, 
  enqueueBulkJobs, 
  getJob,
  getJobCounts,
  getFailedJobs,
  closeQueue,
} from './queue/producer.js';
export { 
  startWorker, 
  stopWorker, 
  getWorkerStatus,
  getActiveJobs,
} from './queue/worker.js';

// Utils
export * as delay from './utils/delay.js';
export { logger, createChildLogger } from './utils/logger.js';
export * as retry from './utils/retry.js';

// Main function to start the engine
import { startWorker } from './queue/worker.js';
import { logger } from './utils/logger.js';

/**
 * Start the scraping engine
 * This will initialize the browser cluster and start processing jobs from the queue
 */
export async function startEngine() {
  logger.info('Starting Tokopedia Scrape Engine...');
  
  try {
    await startWorker();
    logger.info('Engine started successfully');
  } catch (error) {
    logger.fatal({ error: error.message }, 'Failed to start engine');
    throw error;
  }
}

// If running directly, start the engine
if (process.argv[1] && process.argv[1].includes('index.js')) {
  startEngine().catch((error) => {
    console.error('Failed to start:', error);
    process.exit(1);
  });
}
