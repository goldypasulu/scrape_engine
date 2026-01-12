/**
 * Debug test - take screenshot of what Tokopedia shows
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function debugTokopedia() {
  console.log('🚀 Starting debug test...');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
    defaultViewport: null,
  });

  try {
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('📡 Navigating to Tokopedia...');
    await page.goto('https://www.tokopedia.com/search?q=iphone', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    console.log('✅ Page loaded! URL:', page.url());
    
    // Wait for page to render
    await new Promise(r => setTimeout(r, 5000));
    
    // Take screenshot
    await page.screenshot({ path: 'debug-screenshot-1.png', fullPage: true });
    console.log('📸 Screenshot 1 saved');

    // Check what's on the page
    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        bodyText: document.body.innerText.substring(0, 500),
        hasProductCards: document.querySelectorAll('[data-testid="master-product-card"]').length,
        hasDivProducts: document.querySelectorAll('[data-testid="divSRPContentProducts"]').length,
        allTestIds: Array.from(document.querySelectorAll('[data-testid]')).slice(0, 20).map(el => el.getAttribute('data-testid')),
      };
    });

    console.log('\n📋 Page Analysis:');
    console.log('  Title:', pageContent.title);
    console.log('  Product cards found:', pageContent.hasProductCards);
    console.log('  Products container:', pageContent.hasDivProducts);
    console.log('  Sample test-ids:', pageContent.allTestIds.slice(0, 10));
    console.log('\n  Body preview:', pageContent.bodyText.substring(0, 200));

    // Scroll and wait
    console.log('\n⏬ Scrolling...');
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 3000));
    
    // Screenshot again
    await page.screenshot({ path: 'debug-screenshot-2.png', fullPage: true });
    console.log('📸 Screenshot 2 saved');

    // Check again
    const afterScroll = await page.evaluate(() => {
      return document.querySelectorAll('[data-testid="master-product-card"]').length;
    });
    console.log('  Products after scroll:', afterScroll);

    console.log('\n👀 Browser will stay open for 30 seconds so you can see...');
    await new Promise(r => setTimeout(r, 30000));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
    console.log('Done!');
  }
}

debugTokopedia();
