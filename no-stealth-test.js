/**
 * Test TANPA stealth plugin - lihat apakah ini penyebab masalah
 */

import puppeteer from 'puppeteer'; // Regular puppeteer, NO stealth

async function testWithoutStealth() {
  console.log('🧪 Testing WITHOUT stealth plugin...\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: null,
  });

  try {
    const page = await browser.newPage();
    
    // Track errors
    page.on('pageerror', error => {
      console.log('❌ Page Error:', error.message.substring(0, 80));
    });

    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('📡 Navigating to Tokopedia...');
    await page.goto('https://www.tokopedia.com/search?q=laptop', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    console.log('⏳ Waiting 15 seconds for content...');
    await new Promise(r => setTimeout(r, 15000));

    const content = await page.evaluate(() => ({
      bodyLength: document.body.innerText.length,
      hasRp: document.body.innerText.includes('Rp'),
      products: document.querySelectorAll('[data-testid="master-product-card"]').length,
      preview: document.body.innerText.substring(0, 300),
    }));

    console.log('\n📄 Result:');
    console.log('  Body length:', content.bodyLength);
    console.log('  Has prices (Rp):', content.hasRp);
    console.log('  Product cards:', content.products);
    console.log('  Preview:', content.preview.substring(0, 150));

    if (content.hasRp && content.products > 0) {
      console.log('\n✅✅✅ SUCCESS! Products loaded WITHOUT stealth plugin! ✅✅✅');
      console.log('  ---> CONCLUSION: Stealth plugin is BREAKING Tokopedia!');
    } else if (content.hasRp) {
      console.log('\n⚠️ Has prices but no product cards - different selector needed');
    } else {
      console.log('\n⚠️ Still not working - might be other issue');
    }

    await page.screenshot({ path: 'no-stealth-test.png' });
    console.log('📸 Screenshot saved');

    console.log('\n👀 Browser open for 30 seconds...');
    await new Promise(r => setTimeout(r, 30000));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testWithoutStealth();
