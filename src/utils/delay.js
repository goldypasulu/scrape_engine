/**
 * Delay Utilities
 * Human-like timing functions for natural interaction patterns
 */

/**
 * Sleep for a fixed duration
 * @param {number} ms - Milliseconds to wait
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Random delay between min and max milliseconds
 * @param {number} min - Minimum delay in ms
 * @param {number} max - Maximum delay in ms
 */
export function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return sleep(delay);
}

/**
 * Random integer between min and max (inclusive)
 * @param {number} min 
 * @param {number} max 
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Human-like delay using Gaussian distribution
 * More likely to wait near the center of the range
 * @param {number} mean - Center of the distribution
 * @param {number} stdDev - Standard deviation
 */
export function gaussianDelay(mean = 1500, stdDev = 500) {
  // Box-Muller transform for Gaussian distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  
  // Clamp to reasonable range (0.5x to 2x mean)
  const delay = Math.max(mean * 0.5, Math.min(mean * 2, mean + z * stdDev));
  return sleep(Math.round(delay));
}

/**
 * Short delay for micro-interactions (typing, clicking)
 * Range: 50-150ms
 */
export function microDelay() {
  return randomDelay(50, 150);
}

/**
 * Medium delay between actions
 * Range: 300-800ms
 */
export function actionDelay() {
  return randomDelay(300, 800);
}

/**
 * Human-like delay between page interactions
 * Range: 800-2500ms
 */
export function humanDelay() {
  return randomDelay(800, 2500);
}

/**
 * Long pause to mimic reading content
 * Range: 2000-5000ms
 */
export function readingPause() {
  return randomDelay(2000, 5000);
}

/**
 * Very long pause for rate limiting protection
 * Range: 5000-10000ms
 */
export function longPause() {
  return randomDelay(5000, 10000);
}

/**
 * Type text with human-like delays between keystrokes
 * @param {Page} page - Puppeteer page object
 * @param {string} selector - Input selector
 * @param {string} text - Text to type
 */
export async function humanType(page, selector, text) {
  await page.click(selector);
  await microDelay();
  
  for (const char of text) {
    await page.keyboard.type(char, { delay: randomInt(50, 150) });
    
    // Occasionally pause like a human would
    if (Math.random() < 0.1) {
      await randomDelay(100, 300);
    }
  }
}

export default {
  sleep,
  randomDelay,
  randomInt,
  gaussianDelay,
  microDelay,
  actionDelay,
  humanDelay,
  readingPause,
  longPause,
  humanType,
};
