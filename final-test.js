/**
 * Final test - wait for JavaScript to fully load products
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function testTokopediaFinal() {
  console.log('🚀 Starting FINAL test...');
  
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
  });

  try {
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('📡 Navigating to Tokopedia...');
    
    // Use networkidle0 for stricter waiting
    await page.goto('https://www.tokopedia.com/search?q=laptop', {
      waitUntil: 'networkidle0', // Wait until no network activity for 500ms
      timeout: 60000,
    });

    console.log('✅ Initial load complete');
    
    // Wait for skeleton loaders to disappear
    console.log('⏳ Waiting for skeleton loaders to disappear...');
    try {
      // Wait for the "Memuat" text to disappear
      await page.waitForFunction(() => {
        return !document.body.innerText.includes('Memuat, mohon tunggu');
      }, { timeout: 30000 });
      console.log('✅ Content loaded!');
    } catch (e) {
      console.log('⚠️ Still showing loading, will continue anyway');
    }

    // Additional wait for lazy content
    await new Promise(r => setTimeout(r, 3000));

    // Scroll a bit to trigger more lazy loading
    console.log('⏬ Scrolling to trigger lazy load...');
    await page.evaluate(() => window.scrollBy(0, 500));
    await new Promise(r => setTimeout(r, 2000));

    // Try different selectors
    const analysis = await page.evaluate(() => {
      const selectors = [
        '[data-testid="master-product-card"]',
        '[data-testid="divSRPContentProducts"] > div',
        '.product-card',
        '[class*="ProductCard"]',
        '[class*="product-card"]',
        'a[href*="/p/"]', // Product links
      ];

      const results = {};
      for (const sel of selectors) {
        try {
          results[sel] = document.querySelectorAll(sel).length;
        } catch {
          results[sel] = 'error';
        }
      }

      // Also get any product-like links
      const productLinks = Array.from(document.querySelectorAll('a[href*="/promo/"]'))
        .concat(Array.from(document.querySelectorAll('a[href*="-i."]')))
        .slice(0, 10)
        .map(a => a.href);

      return { 
        selectors: results, 
        productLinks,
        bodyPreview: document.body.innerText.substring(0, 300),
      };
    });

    console.log('\n📋 Selector Analysis:');
    Object.entries(analysis.selectors).forEach(([sel, count]) => {
      console.log(`  ${sel}: ${count}`);
    });

    console.log('\n🔗 Product-like links found:', analysis.productLinks.length);
    if (analysis.productLinks.length > 0) {
      console.log('  Sample:', analysis.productLinks.slice(0, 3));
    }

    console.log('\n📄 Body preview:', analysis.bodyPreview.substring(0, 150));

    // Take final screenshot
    await page.screenshot({ path: 'final-test.png', fullPage: false });
    console.log('\n📸 Screenshot saved to: final-test.png');

    // Wait a bit so user can see
    console.log('\n👀 Browser open for 20 more seconds...');
    await new Promise(r => setTimeout(r, 20000));

    if (Object.values(analysis.selectors).some(v => v > 0) || analysis.productLinks.length > 0) {
      console.log('\n✅✅✅ CONCLUSION: Tokopedia CAN be scraped! ✅✅✅');
    } else {
      console.log('\n⚠️ No products found - might need different selectors or more wait time');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testTokopediaFinal();
