/**
 * Retry Utilities with Exponential Backoff
 */

import { sleep, randomInt } from './delay.js';
import { logger } from './logger.js';

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    jitter = true,
    onRetry = null,
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        logger.error(
          { attempt, maxAttempts, error: error.message },
          'All retry attempts exhausted'
        );
        throw error;
      }

      // Calculate delay with exponential backoff
      let delay = Math.min(initialDelay * Math.pow(factor, attempt - 1), maxDelay);
      
      // Add jitter to prevent thundering herd
      if (jitter) {
        delay = delay + randomInt(0, delay * 0.3);
      }

      logger.warn(
        { attempt, maxAttempts, delay, error: error.message },
        'Retrying after error'
      );

      if (onRetry) {
        await onRetry(error, attempt, delay);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Predefined retry strategies
 */
export const RetryStrategies = {
  // Aggressive retry for transient errors
  fast: {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000,
    factor: 2,
  },
  
  // Standard retry for most operations
  standard: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 15000,
    factor: 2,
  },
  
  // Conservative retry for rate-limited operations
  conservative: {
    maxAttempts: 5,
    initialDelay: 5000,
    maxDelay: 60000,
    factor: 2,
  },
};

/**
 * Check if an error is retryable
 * @param {Error} error 
 */
export function isRetryableError(error) {
  const retryableMessages = [
    'net::ERR_CONNECTION_RESET',
    'net::ERR_CONNECTION_REFUSED',
    'net::ERR_TIMED_OUT',
    'Navigation timeout',
    'Timeout exceeded',
    'socket hang up',
    'ECONNRESET',
    'ETIMEDOUT',
    'Protocol error',
    'Target closed',
  ];

  const errorMessage = error.message || '';
  return retryableMessages.some((msg) => errorMessage.includes(msg));
}

export default {
  retryWithBackoff,
  RetryStrategies,
  isRetryableError,
};
