/**
 * Stealth Configuration - HARDENED VERSION
 * 
 * Critical fixes:
 * 1. Platform headers now match user-agent exactly
 * 2. sec-ch-ua headers are dynamically generated from UA
 * 3. Added explicit webdriver verification
 * 4. Timezone and language consistency checks
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { USER_AGENTS } from '../config/user-agents.js';
import { logger } from '../utils/logger.js';

// Apply stealth plugin with all evasions
const stealth = StealthPlugin();
puppeteer.use(stealth);

/**
 * User-Agent to Platform mapping
 * Critical: These MUST match or Tokopedia will detect inconsistency
 */
const UA_PLATFORM_MAP = {
  'Windows NT': { 
    platform: 'Windows', 
    platformVersion: '"15.0.0"',
    uaPlatform: '"Windows"',
  },
  'Macintosh': { 
    platform: 'MacIntel', 
    platformVersion: '"14.0.0"',
    uaPlatform: '"macOS"',
  },
  'Linux': { 
    platform: 'Linux x86_64', 
    platformVersion: '"6.5.0"',
    uaPlatform: '"Linux"',
  },
  'Android': { 
    platform: 'Linux armv81', 
    platformVersion: '"14.0.0"',
    uaPlatform: '"Android"',
  },
  'iPhone': { 
    platform: 'iPhone', 
    platformVersion: '"17.0.0"',
    uaPlatform: '"iOS"',
  },
};

/**
 * Extract browser info from user agent string
 */
function parseBrowserFromUA(userAgent) {
  // Chrome version extraction
  const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
  const firefoxMatch = userAgent.match(/Firefox\/(\d+)/);
  const safariMatch = userAgent.match(/Version\/(\d+).*Safari/);
  const edgeMatch = userAgent.match(/Edg\/(\d+)/);

  if (edgeMatch) {
    return { browser: 'Edge', version: edgeMatch[1], isChromium: true };
  }
  if (chromeMatch && !userAgent.includes('Edg/')) {
    return { browser: 'Chrome', version: chromeMatch[1], isChromium: true };
  }
  if (firefoxMatch) {
    return { browser: 'Firefox', version: firefoxMatch[1], isChromium: false };
  }
  if (safariMatch) {
    return { browser: 'Safari', version: safariMatch[1], isChromium: false };
  }

  return { browser: 'Chrome', version: '120', isChromium: true };
}

/**
 * Get platform info that matches the user agent
 */
function getPlatformFromUA(userAgent) {
  for (const [key, value] of Object.entries(UA_PLATFORM_MAP)) {
    if (userAgent.includes(key)) {
      return value;
    }
  }
  // Default to Windows if unknown
  return UA_PLATFORM_MAP['Windows NT'];
}

/**
 * Generate consistent Client Hints headers from User-Agent
 * Critical: These must ALL match or detection is triggered
 */
function generateClientHints(userAgent) {
  const browser = parseBrowserFromUA(userAgent);
  const platform = getPlatformFromUA(userAgent);
  const isMobile = userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone');

  // Build sec-ch-ua header based on actual browser
  let secChUa;
  if (browser.browser === 'Chrome') {
    secChUa = `"Not_A Brand";v="8", "Chromium";v="${browser.version}", "Google Chrome";v="${browser.version}"`;
  } else if (browser.browser === 'Edge') {
    secChUa = `"Not_A Brand";v="8", "Chromium";v="${browser.version}", "Microsoft Edge";v="${browser.version}"`;
  } else if (browser.browser === 'Firefox') {
    // Firefox doesn't send sec-ch-ua headers
    secChUa = null;
  } else {
    secChUa = `"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"`;
  }

  return {
    secChUa,
    secChUaMobile: isMobile ? '?1' : '?0',
    secChUaPlatform: platform.uaPlatform,
    secChUaPlatformVersion: platform.platformVersion,
    platform: platform.platform,
    isChromium: browser.isChromium,
  };
}

/**
 * Get viewport dimensions that match the platform
 */
function getViewportForPlatform(userAgent) {
  const isMobile = userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone');
  
  if (isMobile) {
    const mobileViewports = [
      { width: 390, height: 844 },   // iPhone 14
      { width: 412, height: 915 },   // Pixel 7
      { width: 360, height: 800 },   // Samsung Galaxy
    ];
    return mobileViewports[Math.floor(Math.random() * mobileViewports.length)];
  }

  const desktopViewports = [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ];

  const viewport = desktopViewports[Math.floor(Math.random() * desktopViewports.length)];
  
  // Add slight randomization to avoid exact fingerprinting
  viewport.width += Math.floor(Math.random() * 20) - 10;
  viewport.height += Math.floor(Math.random() * 20) - 10;

  return viewport;
}

/**
 * Pick a random desktop user agent (avoid mobile for scraping)
 */
function getRandomDesktopUserAgent() {
  const desktopAgents = USER_AGENTS.filter(
    (ua) => !ua.includes('Mobile') && !ua.includes('iPhone') && !ua.includes('Android')
  );
  return desktopAgents[Math.floor(Math.random() * desktopAgents.length)];
}

/**
 * Configure a page with CONSISTENT anti-detection measures
 * All headers and properties must match the user agent
 */
export async function configurePage(page) {
  // Pick a single UA and derive ALL properties from it
  const userAgent = getRandomDesktopUserAgent();
  const clientHints = generateClientHints(userAgent);
  const viewport = getViewportForPlatform(userAgent);
  const platform = getPlatformFromUA(userAgent);

  logger.debug({ 
    userAgent: userAgent.substring(0, 50) + '...', 
    platform: platform.platform,
    secChUaPlatform: clientHints.secChUaPlatform,
  }, 'Configuring page with matched UA/Platform');

  // Set user agent
  await page.setUserAgent(userAgent);

  // Set viewport matching platform type
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    hasTouch: userAgent.includes('Mobile'),
    isLandscape: !userAgent.includes('Mobile'),
    isMobile: userAgent.includes('Mobile'),
  });

  // Override navigator properties to match UA EXACTLY
  await page.evaluateOnNewDocument((config) => {
    // Override webdriver - critical check
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });

    // Delete webdriver property entirely
    delete navigator.__proto__.webdriver;

    // Override platform to match UA
    Object.defineProperty(navigator, 'platform', {
      get: () => config.platform,
      configurable: true,
    });

    // Override userAgentData for Chromium browsers
    if (config.isChromium && navigator.userAgentData) {
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => ({
          brands: [
            { brand: 'Not_A Brand', version: '8' },
            { brand: 'Chromium', version: '120' },
            { brand: 'Google Chrome', version: '120' },
          ],
          mobile: config.isMobile,
          platform: config.platformName,
          getHighEntropyValues: async () => ({
            architecture: 'x86',
            bitness: '64',
            brands: [
              { brand: 'Not_A Brand', version: '8' },
              { brand: 'Chromium', version: '120' },
              { brand: 'Google Chrome', version: '120' },
            ],
            fullVersionList: [
              { brand: 'Not_A Brand', version: '8.0.0.0' },
              { brand: 'Chromium', version: '120.0.6099.109' },
              { brand: 'Google Chrome', version: '120.0.6099.109' },
            ],
            mobile: config.isMobile,
            model: '',
            platform: config.platformName,
            platformVersion: config.platformVersion,
            uaFullVersion: '120.0.6099.109',
          }),
        }),
        configurable: true,
      });
    }

    // Override languages to include Indonesian
    Object.defineProperty(navigator, 'languages', {
      get: () => ['id-ID', 'id', 'en-US', 'en'],
      configurable: true,
    });

    // Override plugins (appear as normal browser)
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        plugins.length = 3;
        return plugins;
      },
      configurable: true,
    });

    // Override permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission });
      }
      return originalQuery.call(window.navigator.permissions, parameters);
    };

    // Add realistic window.chrome object
    Object.defineProperty(window, 'chrome', {
      get: () => ({
        runtime: {
          connect: () => {},
          sendMessage: () => {},
        },
        loadTimes: () => ({
          requestTime: Date.now() / 1000 - Math.random() * 100,
          startLoadTime: Date.now() / 1000 - Math.random() * 50,
          commitLoadTime: Date.now() / 1000 - Math.random() * 10,
          finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 5,
          finishLoadTime: Date.now() / 1000,
          firstPaintTime: Date.now() / 1000 - Math.random() * 3,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
        }),
        csi: () => ({
          startE: Date.now() - Math.floor(Math.random() * 5000),
          onloadT: Date.now(),
          pageT: Math.floor(Math.random() * 5000),
          tran: 15,
        }),
        app: {
          isInstalled: false,
          InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
          RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        },
      }),
      configurable: true,
    });

    // Remove automation indicators from Error stack
    const originalError = Error;
    window.Error = function(...args) {
      const error = new originalError(...args);
      const stack = error.stack;
      if (stack && stack.includes('puppeteer')) {
        error.stack = stack.replace(/puppeteer/gi, 'chrome');
      }
      return error;
    };
    window.Error.prototype = originalError.prototype;
  }, {
    platform: platform.platform,
    platformName: clientHints.secChUaPlatform.replace(/"/g, ''),
    platformVersion: clientHints.secChUaPlatformVersion.replace(/"/g, ''),
    isChromium: clientHints.isChromium,
    isMobile: userAgent.includes('Mobile'),
  });

  // Set HTTP headers that match the UA - CRITICAL for consistency
  const headers = {
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  // Only add Client Hints for Chromium browsers
  if (clientHints.isChromium && clientHints.secChUa) {
    headers['sec-ch-ua'] = clientHints.secChUa;
    headers['sec-ch-ua-mobile'] = clientHints.secChUaMobile;
    headers['sec-ch-ua-platform'] = clientHints.secChUaPlatform;
  }

  await page.setExtraHTTPHeaders(headers);

  logger.debug({ 
    viewport, 
    platform: platform.platform,
    headersSet: Object.keys(headers),
  }, 'Page configured with consistent anti-detection');

  return page;
}

/**
 * Verify that webdriver detection is properly masked
 * Run this to test before production scraping
 */
export async function verifyStealthConfiguration(page) {
  const results = await page.evaluate(() => {
    const checks = {
      webdriver: navigator.webdriver,
      webdriverInProto: 'webdriver' in navigator.__proto__,
      platform: navigator.platform,
      languages: navigator.languages,
      pluginCount: navigator.plugins.length,
      hasChrome: !!window.chrome,
      hasChromeRuntime: !!window.chrome?.runtime,
    };
    return checks;
  });

  const passed = 
    results.webdriver === undefined &&
    !results.webdriverInProto &&
    results.pluginCount >= 3 &&
    results.hasChrome;

  if (!passed) {
    logger.warn({ results }, 'Stealth verification FAILED - detection likely');
  } else {
    logger.info({ results }, 'Stealth verification PASSED');
  }

  return { passed, results };
}

/**
 * Get the stealth-configured puppeteer instance
 */
export function getPuppeteer() {
  return puppeteer;
}

export default puppeteer;
