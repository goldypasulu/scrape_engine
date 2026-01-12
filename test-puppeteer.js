/**
 * Simple test to prove Puppeteer works with Tokopedia
 * NO cluster, NO complexity - just pure puppeteer
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function testTokopedia() {
  console.log('🚀 Starting Puppeteer test...');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser so you can SEE it working
    executablePath: process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('📡 Navigating to Tokopedia...');
    await page.goto('https://www.tokopedia.com/search?q=iphone', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    console.log('✅ Page loaded! Current URL:', page.url());

    // Wait for product cards
    console.log('⏳ Waiting for product cards...');
    await page.waitForSelector('[data-testid="master-product-card"]', { timeout: 30000 });

    // Count products
    const productCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-testid="master-product-card"]').length;
    });

    console.log(`🎉 SUCCESS! Found ${productCount} products on page!`);

    // Scroll a bit to load more
    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise(r => setTimeout(r, 2000));

    // Get first 5 product names
    const products = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="master-product-card"]');
      const items = [];
      for (let i = 0; i < Math.min(5, cards.length); i++) {
        const name = cards[i].querySelector('[data-testid="linkProductName"], [data-testid="spnSRPProdName"]');
        const price = cards[i].querySelector('[data-testid="spnSRPProdPrice"]');
        items.push({
          name: name?.textContent?.trim() || 'Unknown',
          price: price?.textContent?.trim() || 'N/A',
        });
      }
      return items;
    });

    console.log('\n📦 Sample Products:');
    products.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name}`);
      console.log(`     Price: ${p.price}\n`);
    });

    // Take screenshot as proof
    await page.screenshot({ path: 'tokopedia-proof.png', fullPage: false });
    console.log('📸 Screenshot saved to: tokopedia-proof.png');

    console.log('\n✅✅✅ TEST PASSED! Puppeteer CAN scrape Tokopedia! ✅✅✅\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testTokopedia();
