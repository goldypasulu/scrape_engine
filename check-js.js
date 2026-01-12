/**
 * Check for JavaScript errors and network issues
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function checkJsErrors() {
  console.log('🔬 Checking JavaScript errors and network...\n');
  
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
    
    // Collect console messages
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });
    
    // Collect page errors
    const pageErrors = [];
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });
    
    // Collect failed requests
    const failedRequests = [];
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url().substring(0, 80),
        error: request.failure()?.errorText,
      });
    });
    
    // Track important network requests
    const apiRequests = [];
    page.on('response', response => {
      const url = response.url();
      if (url.includes('graphql') || url.includes('/api/') || url.includes('search')) {
        apiRequests.push({
          url: url.substring(0, 100),
          status: response.status(),
        });
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('📡 Navigating to Tokopedia search...');
    await page.goto('https://www.tokopedia.com/search?q=laptop', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    console.log('⏳ Waiting for JS to execute...');
    await new Promise(r => setTimeout(r, 10000));

    // Report
    console.log('\n📋 CONSOLE ERRORS:');
    const errors = consoleLogs.filter(l => l.type === 'error');
    if (errors.length === 0) {
      console.log('  No console errors');
    } else {
      errors.slice(0, 5).forEach(e => console.log('  ❌', e.text.substring(0, 100)));
    }

    console.log('\n📋 PAGE ERRORS:');
    if (pageErrors.length === 0) {
      console.log('  No page errors');
    } else {
      pageErrors.slice(0, 5).forEach(e => console.log('  ❌', e.substring(0, 100)));
    }

    console.log('\n📋 FAILED REQUESTS:');
    if (failedRequests.length === 0) {
      console.log('  No failed requests');
    } else {
      failedRequests.slice(0, 5).forEach(r => console.log('  ❌', r.url, '-', r.error));
    }

    console.log('\n📋 API/GRAPHQL REQUESTS:');
    if (apiRequests.length === 0) {
      console.log('  ⚠️ No API requests found! - THIS IS THE PROBLEM');
      console.log('     Tokopedia uses GraphQL to load products');
      console.log('     If no GraphQL requests, JS is blocked/not executing');
    } else {
      apiRequests.slice(0, 10).forEach(r => console.log(`  ${r.status === 200 ? '✅' : '❌'} [${r.status}]`, r.url));
    }

    // Check if graphql works
    const content = await page.evaluate(() => ({
      bodyLength: document.body.innerText.length,
      hasProducts: document.querySelectorAll('[data-testid="master-product-card"]').length,
      preview: document.body.innerText.substring(0, 200),
    }));

    console.log('\n📄 PAGE STATUS:');
    console.log('  Body length:', content.bodyLength);
    console.log('  Products found:', content.hasProducts);
    console.log('  Preview:', content.preview.substring(0, 100));

    await page.screenshot({ path: 'js-check.png' });
    console.log('\n📸 Screenshot saved');

    console.log('\n👀 Browser open for 30 seconds...');
    await new Promise(r => setTimeout(r, 30000));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

checkJsErrors();
