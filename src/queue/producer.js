/**
 * Job Producer
 * Creates and enqueues scraping jobs to BullMQ
 */

import { Queue } from 'bullmq';
import { getConnection } from './connection.js';
import { config } from '../config/index.js';
import { queueLogger as logger } from '../utils/logger.js';

let queueInstance = null;

/**
 * Get the scrape jobs queue
 */
export function getScrapeQueue() {
  if (queueInstance) {
    return queueInstance;
  }

  queueInstance = new Queue(config.queues.scrapeJobs, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: config.retry.attempts,
      backoff: config.retry.backoff,
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 86400, // Keep failed jobs for 24 hours
        count: 500, // Keep last 500 failed jobs
      },
    },
  });

  logger.info({ queueName: config.queues.scrapeJobs }, 'Scrape queue initialized');

  return queueInstance;
}

/**
 * Enqueue a scraping job
 * @param {Object} data - Job data
 * @param {string} data.keyword - Search keyword
 * @param {string} data.url - Direct URL to scrape (optional, takes precedence over keyword)
 * @param {number} data.maxPages - Maximum pages to scrape (default: 5)
 * @param {Object} options - Job options
 * @returns {Object} - Created job
 */
export async function enqueueScrapeJob(data, options = {}) {
  const { keyword, url, maxPages = config.scraper.maxPagesPerJob } = data;

  if (!keyword && !url) {
    throw new Error('Either keyword or url must be provided');
  }

  const queue = getScrapeQueue();

  const jobData = {
    keyword,
    url,
    maxPages,
    createdAt: new Date().toISOString(),
  };

  const jobOptions = {
    priority: options.priority || 0,
    delay: options.delay || 0,
    ...options,
  };

  const job = await queue.add('scrape-products', jobData, jobOptions);

  logger.info(
    { 
      jobId: job.id, 
      keyword, 
      url: url ? url.substring(0, 50) : null,
      maxPages,
    },
    'Job enqueued'
  );

  return job;
}

/**
 * Enqueue multiple jobs in bulk
 * @param {Array} jobsData - Array of job data objects
 * @returns {Array} - Created jobs
 */
export async function enqueueBulkJobs(jobsData) {
  const queue = getScrapeQueue();

  const jobs = jobsData.map((data) => ({
    name: 'scrape-products',
    data: {
      ...data,
      maxPages: data.maxPages || config.scraper.maxPagesPerJob,
      createdAt: new Date().toISOString(),
    },
  }));

  const createdJobs = await queue.addBulk(jobs);

  logger.info({ jobCount: createdJobs.length }, 'Bulk jobs enqueued');

  return createdJobs;
}

/**
 * Get job by ID
 * @param {string} jobId 
 */
export async function getJob(jobId) {
  const queue = getScrapeQueue();
  return queue.getJob(jobId);
}

/**
 * Get job counts by status
 */
export async function getJobCounts() {
  const queue = getScrapeQueue();
  return queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
}

/**
 * Get failed jobs
 * @param {number} start 
 * @param {number} end 
 */
export async function getFailedJobs(start = 0, end = 20) {
  const queue = getScrapeQueue();
  return queue.getFailed(start, end);
}

/**
 * Retry a failed job
 * @param {string} jobId 
 */
export async function retryJob(jobId) {
  const job = await getJob(jobId);
  if (job) {
    await job.retry();
    logger.info({ jobId }, 'Job retried');
    return true;
  }
  return false;
}

/**
 * Clean old jobs
 */
export async function cleanOldJobs() {
  const queue = getScrapeQueue();
  
  // Clean completed jobs older than 1 hour
  await queue.clean(3600 * 1000, 0, 'completed');
  
  // Clean failed jobs older than 24 hours
  await queue.clean(86400 * 1000, 0, 'failed');
  
  logger.info('Old jobs cleaned');
}

/**
 * Close the queue
 */
export async function closeQueue() {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
    logger.info('Queue closed');
  }
}

export default {
  getScrapeQueue,
  enqueueScrapeJob,
  enqueueBulkJobs,
  getJob,
  getJobCounts,
  getFailedJobs,
  retryJob,
  cleanOldJobs,
  closeQueue,
};
