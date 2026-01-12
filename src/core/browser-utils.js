/**
 * Browser Utilities
 * Common page interaction helpers
 */

import { randomDelay, actionDelay, humanDelay } from '../utils/delay.js';
import { scraperLogger as logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * CRITICAL: Wait for page to be ready before any operation
 * Fixes "Requesting main frame too early!" error in puppeteer-cluster
 * 
 * @param {Page} page 
 * @param {number} maxRetries 
 * @param {number} delay 
 */
export async function waitForPageReady(page, maxRetries = 10, delay = 300) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Check if mainFrame is available
      const frame = page.mainFrame();
      if (frame) {
        // Also check if we can access the frame's url (more complete check)
        await frame.url();
        return true;
      }
    } catch (err) {
      if (i === maxRetries - 1) {
        logger.error({ attempt: i + 1, maxRetries }, 'Page not ready after max retries');
        return false;
      }
      logger.debug({ attempt: i + 1, maxRetries }, 'Waiting for page to be ready');
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return false;
}

/**
 * Wait for a selector with timeout, returns null if not found
 * @param {Page} page 
 * @param {string} selector 
 * @param {number} timeout 
 */
export async function waitForSelectorSafe(page, selector, timeout = config.timeouts.selector) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    logger.debug({ selector, timeout }, 'Selector not found within timeout');
    return false;
  }
}

/**
 * Click an element with human-like delay
 * @param {Page} page 
 * @param {string} selector 
 */
export async function humanClick(page, selector) {
  await actionDelay();
  
  const element = await page.$(selector);
  if (!element) {
    logger.warn({ selector }, 'Cannot click: element not found');
    return false;
  }

  // Get element bounding box
  const box = await element.boundingBox();
  if (!box) {
    logger.warn({ selector }, 'Cannot click: element not visible');
    return false;
  }

  // Click at random position within element
  const x = box.x + box.width * (0.3 + Math.random() * 0.4);
  const y = box.y + box.height * (0.3 + Math.random() * 0.4);

  await page.mouse.move(x, y, { steps: 10 });
  await actionDelay();
  await page.mouse.click(x, y);

  logger.debug({ selector }, 'Clicked element');
  return true;
}

/**
 * Navigate to URL with retry and wait for load
 * Handles "Requesting main frame too early" error from puppeteer-cluster
 * 
 * @param {Page} page 
 * @param {string} url 
 */
export async function navigateTo(page, url) {
  logger.info({ url }, 'Navigating to URL');
  
  // Wait for page to be ready - handles puppeteer-cluster race condition
  // "Requesting main frame too early!" error occurs when page isn't initialized
  let retries = 0;
  const maxRetries = 5;
  
  while (retries < maxRetries) {
    try {
      // Check if page has mainFrame before proceeding
      const mainFrame = page.mainFrame();
      if (!mainFrame) {
        throw new Error('Main frame not available');
      }
      break;
    } catch (err) {
      retries++;
      if (retries >= maxRetries) {
        throw new Error(`Page not ready after ${maxRetries} attempts: ${err.message}`);
      }
      logger.debug({ attempt: retries }, 'Waiting for page to be ready');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Now safe to navigate
  await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: config.timeouts.navigation,
  });

  // Additional wait for dynamic content
  await humanDelay();
  
  logger.debug({ url }, 'Navigation complete');
}

/**
 * Get page HTML content
 * @param {Page} page 
 */
export async function getPageContent(page) {
  return page.content();
}

/**
 * Take screenshot for debugging
 * @param {Page} page 
 * @param {string} name 
 */
export async function debugScreenshot(page, name) {
  if (config.logging.level === 'debug') {
    const timestamp = Date.now();
    const path = `./debug-${name}-${timestamp}.png`;
    await page.screenshot({ path, fullPage: true });
    logger.debug({ path }, 'Debug screenshot saved');
  }
}

/**
 * Wait for network to be idle
 * @param {Page} page 
 * @param {number} timeout 
 */
export async function waitForNetworkIdle(page, timeout = 5000) {
  try {
    await page.waitForNetworkIdle({ timeout, idleTime: 500 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if page has a specific element
 * @param {Page} page 
 * @param {string} selector 
 */
export async function hasElement(page, selector) {
  const element = await page.$(selector);
  return element !== null;
}

/**
 * Get text content of an element
 * @param {Page} page 
 * @param {string} selector 
 */
export async function getTextContent(page, selector) {
  try {
    return await page.$eval(selector, (el) => el.textContent?.trim());
  } catch {
    return null;
  }
}

/**
 * Count elements matching selector
 * @param {Page} page 
 * @param {string} selector 
 */
export async function countElements(page, selector) {
  const elements = await page.$$(selector);
  return elements.length;
}

export default {
  waitForSelectorSafe,
  humanClick,
  navigateTo,
  getPageContent,
  debugScreenshot,
  waitForNetworkIdle,
  hasElement,
  getTextContent,
  countElements,
};
