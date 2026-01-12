/**
 * Human-Like Auto Scroll
 * Critical for loading lazy-loaded content on infinite scroll pages
 * 
 * This implementation mimics human scrolling behavior with:
 * - Variable scroll distances (NOT full viewport jumps)
 * - Smooth scrolling animation
 * - Random pauses between scrolls
 * - Occasional longer "reading" pauses
 * - Smart detection when no more content loads
 */

import { randomInt, randomDelay, sleep } from '../utils/delay.js';
import { config } from '../config/index.js';
import { scraperLogger as logger } from '../utils/logger.js';

/**
 * Perform human-like scrolling to load lazy content
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
    targetSelector = null, // Optional: stop when this selector count doesn't increase
    minItems = 0, // Minimum items to load before stopping
  } = options;

  logger.info({ maxScrolls, scrollIncrement, scrollDelay }, 'Starting auto-scroll');

  let previousHeight = 0;
  let scrollCount = 0;
  let noNewContentCount = 0;
  let previousItemCount = 0;
  const maxNoNewContent = 3; // Stop after 3 consecutive no-content checks

  // Get initial state
  const initialHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);

  logger.debug({ initialHeight, viewportHeight }, 'Initial page state');

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

    // Random delay between scrolls
    await randomDelay(scrollDelay.min, scrollDelay.max);

    // Occasionally pause longer (mimics human reading)
    if (Math.random() < pauseProbability) {
      logger.debug({ scrollCount }, 'Taking reading pause');
      await randomDelay(pauseDuration.min, pauseDuration.max);
    }

    // Occasionally scroll up slightly (very human-like)
    if (Math.random() < 0.05) {
      const scrollUp = randomInt(50, 150);
      await page.evaluate((distance) => {
        window.scrollBy({ top: -distance, behavior: 'smooth' });
      }, scrollUp);
      await randomDelay(300, 600);
    }

    // Wait for potential lazy-load to complete
    await sleep(500);

    // Check current state
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    const currentScroll = await page.evaluate(
      () => window.scrollY + window.innerHeight
    );

    // Check if we've reached the bottom
    const atBottom = currentScroll >= currentHeight - 100;

    // Check if target selector count increased
    let currentItemCount = 0;
    if (targetSelector) {
      currentItemCount = await page.evaluate((selector) => {
        return document.querySelectorAll(selector).length;
      }, targetSelector);
    }

    // Determine if new content loaded
    const heightIncreased = currentHeight > previousHeight;
    const itemsIncreased = targetSelector ? currentItemCount > previousItemCount : false;
    const hasNewContent = heightIncreased || itemsIncreased;

    if (!hasNewContent && atBottom) {
      noNewContentCount++;
      logger.debug(
        { noNewContentCount, maxNoNewContent, currentHeight },
        'No new content detected'
      );

      if (noNewContentCount >= maxNoNewContent) {
        logger.info(
          { scrollCount, reason: 'no_new_content' },
          'Stopping scroll: no new content after multiple attempts'
        );
        break;
      }

      // Wait a bit longer in case content is still loading
      await randomDelay(1500, 2500);
    } else {
      noNewContentCount = 0;
    }

    // Check minimum items requirement
    if (targetSelector && currentItemCount >= minItems && minItems > 0) {
      logger.info(
        { scrollCount, itemCount: currentItemCount, minItems },
        'Stopping scroll: minimum items reached'
      );
      break;
    }

    previousHeight = currentHeight;
    previousItemCount = currentItemCount;
    scrollCount++;

    // Log progress periodically
    if (scrollCount % 10 === 0) {
      logger.debug(
        { scrollCount, currentHeight, itemCount: currentItemCount },
        'Scroll progress'
      );
    }
  }

  // Get final stats
  const finalHeight = await page.evaluate(() => document.body.scrollHeight);
  const finalItemCount = targetSelector
    ? await page.evaluate(
        (selector) => document.querySelectorAll(selector).length,
        targetSelector
      )
    : null;

  const stats = {
    scrollCount,
    initialHeight,
    finalHeight,
    heightIncrease: finalHeight - initialHeight,
    itemCount: finalItemCount,
  };

  logger.info(stats, 'Auto-scroll completed');

  return stats;
}

/**
 * Scroll to reveal a specific element
 * @param {Page} page 
 * @param {string} selector 
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
 * @param {Page} page 
 */
export async function scrollToTop(page) {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  await randomDelay(500, 1000);
}

export default {
  autoScroll,
  scrollToElement,
  scrollToTop,
};
