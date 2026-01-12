#!/usr/bin/env node
/**
 * Worker Startup Script
 * Starts the scraping worker to process jobs from the queue
 * 
 * Usage:
 *   npm run worker
 *   node scripts/start-worker.js
 *   node scripts/start-worker.js --dry-run
 */

import { startWorker, stopWorker, getWorkerStatus } from '../src/queue/worker.js';
import { getJobCounts } from '../src/queue/producer.js';
import { logger } from '../src/utils/logger.js';
import { getCluster, closeCluster } from '../src/core/cluster.js';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

async function main() {
  if (isDryRun) {
    logger.info('Running in dry-run mode - testing initialization only');
    
    try {
      // Test cluster initialization
      logger.info('Testing cluster initialization...');
      const cluster = await getCluster();
      logger.info('✓ Cluster initialized successfully');
      
      // Test queue connection
      logger.info('Testing queue connection...');
      const counts = await getJobCounts();
      logger.info({ counts }, '✓ Queue connection successful');
      
      // Clean up
      await closeCluster();
      
      logger.info('Dry run completed successfully');
      process.exit(0);
      
    } catch (error) {
      logger.error({ error: error.message }, 'Dry run failed');
      process.exit(1);
    }
  }

  logger.info('='.repeat(50));
  logger.info('Tokopedia Scrape Engine - Worker');
  logger.info('='.repeat(50));

  try {
    // Display initial queue status
    const counts = await getJobCounts();
    logger.info({ counts }, 'Current queue status');

    // Start the worker
    await startWorker();

    // Keep the process running
    logger.info('Worker is running. Press Ctrl+C to stop.');

    // Periodically log status
    setInterval(async () => {
      try {
        const status = getWorkerStatus();
        const counts = await getJobCounts();
        logger.info({ status, queueCounts: counts }, 'Worker status');
      } catch (error) {
        // Ignore errors in status logging
      }
    }, 300000); // Every 5 minutes

  } catch (error) {
    logger.fatal({ error: error.message, stack: error.stack }, 'Worker startup failed');
    process.exit(1);
  }
}

main();
