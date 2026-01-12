/**
 * Test dengan user profile - simulasi browser session asli
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { execSync } from 'child_process';

puppeteer.use(StealthPlugin());

async function testWithProfile() {
  console.log('🚀 Testing dengan profile browser...\n');
  
  // Create temporary profile directory
  const tempProfile = '/tmp/puppeteer-tokopedia-test';
  try {
    execSync(`rm -rf ${tempProfile}`, { stdio: 'ignore' });
  } catch {}
  
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: tempProfile, // Use dedicated profile
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--lang=id-ID,id,en',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--enable-automation'], // Remove automation flag
    defaultViewport: null,
  });

  try {
    const page = await browser.newPage();
    
    // Override webdriver completely
    await page.evaluateOnNewDocument(() => {
      // Delete webdriver from navigator prototype
      delete Object.getPrototypeOf(navigator).webdriver;
      
      // Override getter to return undefined
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
      
      // Remove automation-related properties
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
            { name: 'Native Client', filename: 'internal-nacl-plugin' },
          ];
          plugins.length = 3;
          return plugins;
        },
      });
    });

    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set extra headers like real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    });

    console.log('📡 Navigating to Tokopedia...');
    
    await page.goto('https://www.tokopedia.com', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    
    console.log('✅ Homepage loaded');
    await new Promise(r => setTimeout(r, 3000));
    
    // Now search
    console.log('🔍 Searching for "iphone"...');
    await page.goto('https://www.tokopedia.com/search?q=iphone', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.log('⏳ Waiting for content...');
    await new Promise(r => setTimeout(r, 10000)); // Wait longer

    // Check webdriver detection
    const detection = await page.evaluate(() => ({
      webdriver: navigator.webdriver,
      webdriverInProto: 'webdriver' in navigator,
      protoOwn: Object.getPrototypeOf(navigator).hasOwnProperty('webdriver'),
    }));
    
    console.log('\n📋 Detection Check:');
    console.log('  webdriver:', detection.webdriver);
    console.log('  "webdriver" in navigator:', detection.webdriverInProto);
    console.log('  prototype hasOwnProperty:', detection.protoOwn);

    // Check content
    const content = await page.evaluate(() => ({
      title: document.title,
      hasRp: document.body.innerText.includes('Rp'),
      bodyLength: document.body.innerText.length,
      preview: document.body.innerText.substring(0, 300),
      productCards: document.querySelectorAll('[data-testid="master-product-card"]').length,
    }));

    console.log('\n📄 Page Content:');
    console.log('  Title:', content.title);
    console.log('  Has prices:', content.hasRp);
    console.log('  Body length:', content.bodyLength);
    console.log('  Product cards:', content.productCards);
    console.log('  Preview:', content.preview.substring(0, 150));

    await page.screenshot({ path: 'profile-test.png', fullPage: false });
    console.log('\n📸 Screenshot saved');

    if (content.hasRp || content.productCards > 0) {
      console.log('\n✅✅✅ SUCCESS! Products found! ✅✅✅');
    } else {
      console.log('\n⚠️ Still not loading products...');
    }

    console.log('\n👀 Browser open for 60 seconds...');
    await new Promise(r => setTimeout(r, 60000));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
    execSync(`rm -rf ${tempProfile}`, { stdio: 'ignore' });
  }
}

testWithProfile();
