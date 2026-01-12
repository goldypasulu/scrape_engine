/**
 * Analysis: Why Puppeteer Chrome can't load Tokopedia?
 * Comparing automation Chrome vs normal Chrome
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function analyzeIssue() {
  console.log('🔍 ANALYSIS: Why Puppeteer Chrome fails but normal Chrome works?\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled', // Hide automation
    ],
    defaultViewport: null,
  });

  try {
    const page = await browser.newPage();
    
    // Set realistic headers
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Check detection markers BEFORE navigating
    console.log('📋 Detection Analysis BEFORE navigation:\n');
    
    const detectionCheck = await page.evaluate(() => {
      return {
        webdriver: navigator.webdriver,
        webdriverType: typeof navigator.webdriver,
        platform: navigator.platform,
        languages: navigator.languages,
        plugins: navigator.plugins.length,
        hasChrome: !!window.chrome,
        hasChromeRuntime: !!(window.chrome && window.chrome.runtime),
        userAgent: navigator.userAgent,
        vendor: navigator.vendor,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: navigator.deviceMemory,
      };
    });

    console.log('  navigator.webdriver:', detectionCheck.webdriver, `(type: ${detectionCheck.webdriverType})`);
    console.log('  navigator.platform:', detectionCheck.platform);
    console.log('  navigator.plugins:', detectionCheck.plugins);
    console.log('  window.chrome:', detectionCheck.hasChrome);
    console.log('  chrome.runtime:', detectionCheck.hasChromeRuntime);
    console.log('  hardwareConcurrency:', detectionCheck.hardwareConcurrency);
    console.log('  deviceMemory:', detectionCheck.deviceMemory);

    // Navigate to Tokopedia
    console.log('\n📡 Navigating to Tokopedia...');
    
    const response = await page.goto('https://www.tokopedia.com/search?q=iphone', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    console.log('\n📊 Response Analysis:');
    console.log('  Status:', response.status());
    console.log('  URL:', response.url());
    
    // Get response headers
    const headers = response.headers();
    console.log('  Content-Type:', headers['content-type']);
    console.log('  Server:', headers['server']);
    
    // Wait and check for JavaScript errors
    await new Promise(r => setTimeout(r, 5000));

    // Check what Tokopedia sees about our browser
    const browserFingerprint = await page.evaluate(() => {
      // Check for common anti-bot detections
      const checks = {
        // WebDriver detection
        webdriver1: navigator.webdriver,
        webdriver2: 'webdriver' in navigator,
        webdriver3: navigator.__proto__.hasOwnProperty('webdriver'),
        
        // Chrome detection
        chromeObj: !!window.chrome,
        chromeRuntime: !!(window.chrome && window.chrome.runtime),
        chromeRuntimeId: !!(window.chrome && window.chrome.runtime && window.chrome.runtime.id),
        
        // CDP detection
        _phantom: !!window._phantom,
        callPhantom: !!window.callPhantom,
        __selenium_evaluate: !!document.__selenium_evaluate,
        __selenium_unwrapped: !!document.__selenium_unwrapped,
        __driver_evaluate: !!document.__driver_evaluate,
        __webdriver_evaluate: !!document.__webdriver_evaluate,
        
        // Permission quirks
        permissionsQuery: typeof navigator.permissions !== 'undefined',
        
        // Canvas fingerprint check
        canvas: (() => {
          try {
            const canvas = document.createElement('canvas');
            return canvas.toDataURL().length > 0;
          } catch {
            return false;
          }
        })(),
        
        // WebGL
        webgl: (() => {
          try {
            const canvas = document.createElement('canvas');
            return !!canvas.getContext('webgl');
          } catch {
            return false;
          }
        })(),
        
        // Plugins
        pluginCount: navigator.plugins.length,
        pluginNames: Array.from(navigator.plugins).map(p => p.name),
        
        // Screen
        screenSize: `${screen.width}x${screen.height}`,
        colorDepth: screen.colorDepth,
        
        // Timezone
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        
        // Connection info
        connection: navigator.connection ? {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
        } : null,
      };
      
      return checks;
    });

    console.log('\n🔎 Browser Fingerprint Analysis:');
    console.log('  WebDriver checks:');
    console.log('    - navigator.webdriver:', browserFingerprint.webdriver1);
    console.log('    - "webdriver" in navigator:', browserFingerprint.webdriver2);
    console.log('    - __proto__.hasOwnProperty:', browserFingerprint.webdriver3);
    
    console.log('  Chrome checks:');
    console.log('    - window.chrome:', browserFingerprint.chromeObj);
    console.log('    - chrome.runtime:', browserFingerprint.chromeRuntime);
    console.log('    - chrome.runtime.id:', browserFingerprint.chromeRuntimeId);
    
    console.log('  Automation markers:');
    console.log('    - _phantom:', browserFingerprint._phantom);
    console.log('    - __selenium_evaluate:', browserFingerprint.__selenium_evaluate);
    console.log('    - __webdriver_evaluate:', browserFingerprint.__webdriver_evaluate);
    
    console.log('  Plugins:', browserFingerprint.pluginCount, browserFingerprint.pluginNames);
    console.log('  Screen:', browserFingerprint.screenSize, 'depth:', browserFingerprint.colorDepth);
    console.log('  Timezone:', browserFingerprint.timezone);

    // Check page content
    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        hasProducts: document.body.innerText.includes('Rp'),
        hasError: document.body.innerText.includes('Error') || document.body.innerText.includes('error'),
        hasCaptcha: document.body.innerText.toLowerCase().includes('captcha') || 
                    document.body.innerText.toLowerCase().includes('verify'),
        hasBlocked: document.body.innerText.toLowerCase().includes('blocked') || 
                    document.body.innerText.toLowerCase().includes('denied'),
        bodyLength: document.body.innerText.length,
        bodyPreview: document.body.innerText.substring(0, 500),
      };
    });

    console.log('\n📄 Page Content Analysis:');
    console.log('  Title:', pageContent.title);
    console.log('  Has prices (Rp):', pageContent.hasProducts);
    console.log('  Has error text:', pageContent.hasError);
    console.log('  Has captcha:', pageContent.hasCaptcha);
    console.log('  Is blocked:', pageContent.hasBlocked);
    console.log('  Body length:', pageContent.bodyLength);
    console.log('  Preview:', pageContent.bodyPreview.substring(0, 200));

    // Take screenshot
    await page.screenshot({ path: 'analysis-screenshot.png', fullPage: false });
    console.log('\n📸 Screenshot saved to: analysis-screenshot.png');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📝 CONCLUSION:');
    
    if (browserFingerprint.webdriver1 === true) {
      console.log('❌ DETECTED: navigator.webdriver is TRUE - Tokopedia knows this is automation!');
    } else if (browserFingerprint.webdriver1 === undefined || browserFingerprint.webdriver1 === false) {
      console.log('✅ OK: navigator.webdriver is hidden');
    }
    
    if (!browserFingerprint.chromeRuntime) {
      console.log('⚠️ WARNING: chrome.runtime is missing - might trigger detection');
    }
    
    if (browserFingerprint.pluginCount === 0) {
      console.log('⚠️ WARNING: No plugins detected - real Chrome has plugins');
    }
    
    if (pageContent.hasCaptcha || pageContent.hasBlocked) {
      console.log('❌ BLOCKED: Tokopedia is showing captcha or blocking');
    }
    
    console.log('='.repeat(60));
    
    console.log('\n👀 Browser open for 30 seconds for inspection...');
    await new Promise(r => setTimeout(r, 30000));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
    console.log('Done!');
  }
}

analyzeIssue();
