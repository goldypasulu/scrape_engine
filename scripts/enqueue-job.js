#!/usr/bin/env node
/**
 * Job Enqueue Script
 * CLI tool to add scraping jobs to the queue
 * 
 * Usage:
 *   npm run enqueue -- --keyword "iphone 15"
 *   npm run enqueue -- --keyword "iphone 15" --pages 10
 *   npm run enqueue -- --url "https://www.tokopedia.com/search?q=laptop"
 *   npm run enqueue -- --bulk keywords.json
 */

import { enqueueScrapeJob, enqueueBulkJobs, getJobCounts, closeQueue } from '../src/queue/producer.js';
import { closeConnection } from '../src/queue/connection.js';
import { logger } from '../src/utils/logger.js';
import { readFileSync } from 'fs';

function showHelp() {
  console.log(`
Tokopedia Scrape Engine - Job Enqueue Tool

Usage:
  npm run enqueue -- [options]

Options:
  --keyword, -k <keyword>    Search keyword to scrape
  --url, -u <url>            Direct URL to scrape
  --pages, -p <number>       Maximum pages to scrape (default: 5)
  --bulk, -b <file>          JSON file with multiple keywords
  --priority <number>        Job priority (lower = higher priority)
  --delay <ms>               Delay before processing (milliseconds)
  --help, -h                 Show this help message

Examples:
  npm run enqueue -- -k "iphone 15"
  npm run enqueue -- -k "laptop gaming" -p 10
  npm run enqueue -- -u "https://www.tokopedia.com/search?q=laptop"
  npm run enqueue -- --bulk keywords.json

Bulk file format (keywords.json):
  {
    "jobs": [
      { "keyword": "iphone 15", "maxPages": 5 },
      { "keyword": "samsung galaxy", "maxPages": 3 },
      { "url": "https://www.tokopedia.com/search?q=laptop" }
    ]
  }
`);
}

function parseArgs(args) {
  const parsed = {
    keyword: null,
    url: null,
    maxPages: 5,
    bulkFile: null,
    priority: 0,
    delay: 0,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--keyword':
      case '-k':
        parsed.keyword = next;
        i++;
        break;
      case '--url':
      case '-u':
        parsed.url = next;
        i++;
        break;
      case '--pages':
      case '-p':
        parsed.maxPages = parseInt(next, 10) || 5;
        i++;
        break;
      case '--bulk':
      case '-b':
        parsed.bulkFile = next;
        i++;
        break;
      case '--priority':
        parsed.priority = parseInt(next, 10) || 0;
        i++;
        break;
      case '--delay':
        parsed.delay = parseInt(next, 10) || 0;
        i++;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  try {
    // Handle bulk jobs
    if (args.bulkFile) {
      logger.info({ file: args.bulkFile }, 'Loading bulk jobs from file');

      const content = readFileSync(args.bulkFile, 'utf-8');
      const data = JSON.parse(content);

      if (!data.jobs || !Array.isArray(data.jobs)) {
        throw new Error('Bulk file must contain a "jobs" array');
      }

      const jobs = await enqueueBulkJobs(data.jobs);
      logger.info({ jobCount: jobs.length }, 'Bulk jobs enqueued successfully');

      // Show queue status
      const counts = await getJobCounts();
      logger.info({ counts }, 'Queue status');

      await cleanup();
      return;
    }

    // Handle single job
    if (!args.keyword && !args.url) {
      console.error('Error: Either --keyword or --url is required');
      console.log('Use --help for usage information');
      process.exit(1);
    }

    const jobData = {
      keyword: args.keyword,
      url: args.url,
      maxPages: args.maxPages,
    };

    const options = {
      priority: args.priority,
      delay: args.delay,
    };

    const job = await enqueueScrapeJob(jobData, options);

    logger.info(
      { 
        jobId: job.id,
        keyword: args.keyword,
        url: args.url,
        maxPages: args.maxPages,
      },
      'Job enqueued successfully'
    );

    // Show queue status
    const counts = await getJobCounts();
    logger.info({ counts }, 'Queue status');

    await cleanup();

  } catch (error) {
    logger.error({ error: error.message }, 'Failed to enqueue job');
    await cleanup();
    process.exit(1);
  }
}

async function cleanup() {
  await closeQueue();
  await closeConnection();
}

main();
