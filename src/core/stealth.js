/**
 * Stealth Configuration
 * Puppeteer-extra with stealth plugin for anti-detection
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getRandomUserAgentWithViewport } from '../config/user-agents.js';
import { logger } from '../utils/logger.js';

// Apply stealth plugin with all evasions
const stealth = StealthPlugin();

// Configure stealth evasions (all enabled by default)
// You can disable specific evasions if needed:
// stealth.enabledEvasions.delete('chrome.runtime');

puppeteer.use(stealth);

/**
 * Configure a page with anti-detection measures
 * @param {Page} page - Puppeteer page object
 */
export async function configurePage(page) {
  const { userAgent, viewport } = getRandomUserAgentWithViewport();

  // Set user agent
  await page.setUserAgent(userAgent);

  // Set viewport with slight randomization
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    hasTouch: false,
    isLandscape: true,
    isMobile: false,
  });

  // Override navigator.webdriver (additional layer on top of stealth)
  await page.evaluateOnNewDocument(() => {
    // Override webdriver detection
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Override automation flags
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'id'],
    });

    // Override plugins (appear as normal browser)
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        {
          name: 'Chrome PDF Plugin',
          description: 'Portable Document Format',
          filename: 'internal-pdf-viewer',
        },
        {
          name: 'Chrome PDF Viewer',
          description: '',
          filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
        },
        {
          name: 'Native Client',
          description: '',
          filename: 'internal-nacl-plugin',
        },
      ],
    });

    // Override permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
      }
      return originalQuery(parameters);
    };

    // Add realistic window properties
    Object.defineProperty(window, 'chrome', {
      get: () => ({
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {},
      }),
    });
  });

  // Set extra headers for Indonesian locale
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  });

  logger.debug({ userAgent, viewport }, 'Page configured with anti-detection');

  return page;
}

/**
 * Get the stealth-configured puppeteer instance
 */
export function getPuppeteer() {
  return puppeteer;
}

export default puppeteer;
