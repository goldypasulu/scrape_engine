/**
 * Human-Like Auto Scroll - HARDENED VERSION
 * 
 * Critical fixes:
 * 1. Primary detection is now DOM element count, NOT scroll height
 * 2. Active wait for new elements with mutation observer
 * 3. Handles lazy-load stalls with retry logic
 * 4. Smart backoff when content stops loading
 */

import { randomInt, randomDelay, sleep } from '../utils/delay.js';
import { config } from '../config/index.js';
import { scraperLogger as logger } from '../utils/logger.js';

/**
 * Wait for new DOM elements to appear after scroll
 * Uses MutationObserver for reliable detection
 * 
 * @param {Page} page 
 * @param {string} selector - CSS selector for items to count
 * @param {number} previousCount - Count before scrolling
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<{newCount: number, increased: boolean}>}
 */
async function waitForNewElements(page, selector, previousCount, timeout = 5000) {
  const startTime = Date.now();
  
  try {
    const result = await page.evaluate(async (sel, prevCount, timeoutMs) => {
      return new Promise((resolve) => {
        const checkCount = () => document.querySelectorAll(sel).length;
        let currentCount = checkCount();
        
        // If already increased, return immediately
        if (currentCount > prevCount) {
          return resolve({ newCount: currentCount, increased: true });
        }

        // Set up mutation observer for DOM changes
        const observer = new MutationObserver(() => {
          currentCount = checkCount();
          if (currentCount > prevCount) {
            observer.disconnect();
            resolve({ newCount: currentCount, increased: true });
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        // Timeout fallback
        setTimeout(() => {
          observer.disconnect();
          resolve({ newCount: checkCount(), increased: checkCount() > prevCount });
        }, timeoutMs);
      });
    }, selector, previousCount, timeout);

    return result;
  } catch (error) {
    logger.debug({ error: error.message }, 'waitForNewElements error');
    const count = await page.evaluate((sel) => document.querySelectorAll(sel).length, selector);
    return { newCount: count, increased: count > previousCount };
  }
}

/**
 * Check if the page has reached the absolute bottom
 * More reliable than just checking scroll height
 */
async function isAtPageBottom(page) {
  return page.evaluate(() => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    
    // Consider "at bottom" if within 100px of the end
    return scrollTop + clientHeight >= scrollHeight - 100;
  });
}

/**
 * Get current scroll metrics
 */
async function getScrollMetrics(page) {
  return page.evaluate(() => ({
    scrollTop: window.pageYOffset || document.documentElement.scrollTop,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    bodyHeight: document.body.scrollHeight,
  }));
}

/**
 * Perform human-like scrolling to load lazy content
 * 
 * CRITICAL: This version prioritizes DOM element count over scroll height
 * to handle lazy-load stalls properly
 * 
 * @param {Page} page - Puppeteer page object
 * @param {Object} options - Scroll configuration
 * @returns {Object} - Scroll statistics
 */
export async function autoScroll(page, options = {}) {
  const {
    maxScrolls = config.scroll.maxScrolls,
    scrollIncrement = {
      min: config.scroll.incrementMin,
      max: config.scroll.incrementMax,
    },
    scrollDelay = {
      min: config.scroll.delayMin,
      max: config.scroll.delayMax,
    },
    pauseProbability = config.scroll.pauseProbability,
    pauseDuration = {
      min: config.scroll.pauseMin,
      max: config.scroll.pauseMax,
    },
    // REQUIRED: Selector for items to count (e.g., product cards)
    itemSelector,
    // Minimum items to load before allowing exit
    minItems = 0,
    // Max consecutive no-new-items before stopping
    maxStallCount = 5,
    // Wait time for new items after each scroll
    itemWaitTimeout = 5000,
  } = options;

  if (!itemSelector) {
    logger.warn('No itemSelector provided - using scroll height only (less reliable)');
  }

  logger.info({ 
    maxScrolls, 
    itemSelector,
    minItems,
    maxStallCount,
  }, 'Starting hardened auto-scroll');

  let scrollCount = 0;
  let stallCount = 0;
  let previousItemCount = 0;
  let previousHeight = 0;

  // Get initial state
  if (itemSelector) {
    previousItemCount = await page.evaluate(
      (sel) => document.querySelectorAll(sel).length, 
      itemSelector
    );
  }
  const initialMetrics = await getScrollMetrics(page);
  previousHeight = initialMetrics.scrollHeight;

  logger.debug({ 
    initialItemCount: previousItemCount, 
    initialHeight: previousHeight,
  }, 'Initial page state');

  while (scrollCount < maxScrolls) {
    // Random scroll distance (variable, not full viewport)
    const scrollDistance = randomInt(scrollIncrement.min, scrollIncrement.max);

    // Perform smooth scroll
    await page.evaluate((distance) => {
      window.scrollBy({
        top: distance,
        behavior: 'smooth',
      });
    }, scrollDistance);

    // Wait for scroll animation to complete
    await sleep(300);

    // Random delay between scrolls (human-like)
    await randomDelay(scrollDelay.min, scrollDelay.max);

    // Occasionally pause longer (mimics human reading) - 15% chance
    if (Math.random() < pauseProbability) {
      logger.debug({ scrollCount }, 'Taking reading pause');
      await randomDelay(pauseDuration.min, pauseDuration.max);
    }

    // Occasionally scroll up slightly (very human-like) - 5% chance
    if (Math.random() < 0.05) {
      const scrollUp = randomInt(50, 150);
      await page.evaluate((distance) => {
        window.scrollBy({ top: -distance, behavior: 'smooth' });
      }, scrollUp);
      await sleep(300);
      await randomDelay(300, 600);
    }

    // ========== CRITICAL: Wait for and detect new items ==========
    let hasNewContent = false;
    let currentItemCount = previousItemCount;

    if (itemSelector) {
      // Wait for new DOM elements using MutationObserver
      const result = await waitForNewElements(
        page, 
        itemSelector, 
        previousItemCount, 
        itemWaitTimeout
      );
      
      currentItemCount = result.newCount;
      hasNewContent = result.increased;

      if (hasNewContent) {
        logger.debug({ 
          scrollCount, 
          newItems: currentItemCount - previousItemCount,
          totalItems: currentItemCount,
        }, 'New items loaded');
      }
    } else {
      // Fallback: check scroll height (less reliable)
      await sleep(1000); // Give time for content to load
      const currentMetrics = await getScrollMetrics(page);
      hasNewContent = currentMetrics.scrollHeight > previousHeight;
      previousHeight = currentMetrics.scrollHeight;
    }

    // Check stall condition
    const atBottom = await isAtPageBottom(page);

    if (!hasNewContent) {
      stallCount++;
      
      logger.debug({ 
        stallCount, 
        maxStallCount, 
        atBottom,
        currentItemCount,
      }, 'No new content detected');

      // If at bottom with no new content, try harder before giving up
      if (atBottom && stallCount >= 2) {
        // Try scrolling to absolute bottom
        await page.evaluate(() => {
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth',
          });
        });
        await sleep(1000);
        
        // Wait longer for lazy content
        if (itemSelector) {
          const result = await waitForNewElements(
            page, 
            itemSelector, 
            previousItemCount, 
            itemWaitTimeout * 2
          );
          if (result.increased) {
            currentItemCount = result.newCount;
            hasNewContent = true;
            stallCount = 0;
            logger.debug({ newItems: result.newCount - previousItemCount }, 'Late items loaded after retry');
          }
        }
      }

      // Exit conditions
      if (stallCount >= maxStallCount) {
        logger.info({ 
          scrollCount, 
          reason: 'max_stall_reached',
          finalItemCount: currentItemCount,
        }, 'Stopping scroll: no new content after multiple attempts');
        break;
      }

      // Extra wait when stalling
      await randomDelay(1500, 2500);
    } else {
      // Reset stall counter on successful content load
      stallCount = 0;
    }

    // Check minimum items requirement
    if (minItems > 0 && currentItemCount >= minItems) {
      logger.info({ 
        scrollCount, 
        itemCount: currentItemCount, 
        minItems,
      }, 'Stopping scroll: minimum items reached');
      break;
    }

    previousItemCount = currentItemCount;
    scrollCount++;

    // Log progress periodically
    if (scrollCount % 5 === 0) {
      const metrics = await getScrollMetrics(page);
      logger.debug({ 
        scrollCount, 
        itemCount: currentItemCount,
        scrollHeight: metrics.scrollHeight,
        scrollPosition: `${Math.round((metrics.scrollTop + metrics.clientHeight) / metrics.scrollHeight * 100)}%`,
      }, 'Scroll progress');
    }
  }

  // Get final stats
  const finalMetrics = await getScrollMetrics(page);
  const finalItemCount = itemSelector 
    ? await page.evaluate((sel) => document.querySelectorAll(sel).length, itemSelector)
    : null;

  const stats = {
    scrollCount,
    initialHeight: initialMetrics.scrollHeight,
    finalHeight: finalMetrics.scrollHeight,
    heightIncrease: finalMetrics.scrollHeight - initialMetrics.scrollHeight,
    initialItemCount: previousItemCount,
    finalItemCount,
    itemsLoaded: finalItemCount ? finalItemCount - (options.itemSelector ? previousItemCount : 0) : null,
    stallsEncountered: stallCount,
  };

  logger.info(stats, 'Hardened auto-scroll completed');

  return stats;
}

/**
 * Scroll to reveal a specific element
 */
export async function scrollToElement(page, selector) {
  const element = await page.$(selector);
  if (!element) {
    logger.debug({ selector }, 'Element not found for scroll');
    return false;
  }

  await page.evaluate((el) => {
    el.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, element);

  await randomDelay(500, 1000);
  return true;
}

/**
 * Scroll to top of page
 */
export async function scrollToTop(page) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  await randomDelay(500, 1000);
}

/**
 * Scroll to load at least N items
 * Convenience wrapper around autoScroll
 */
export async function scrollUntilItemCount(page, itemSelector, targetCount, maxScrolls = 100) {
  logger.info({ itemSelector, targetCount }, 'Scrolling until target item count');
  
  const currentCount = await page.evaluate(
    (sel) => document.querySelectorAll(sel).length, 
    itemSelector
  );

  if (currentCount >= targetCount) {
    logger.info({ currentCount, targetCount }, 'Target already met, no scrolling needed');
    return { scrollCount: 0, finalItemCount: currentCount };
  }

  return autoScroll(page, {
    itemSelector,
    minItems: targetCount,
    maxScrolls,
    maxStallCount: 5,
  });
}

export default {
  autoScroll,
  scrollToElement,
  scrollToTop,
  scrollUntilItemCount,
  waitForNewElements,
};
