/**
 * Manual Scraper Runner
 * Usage: node manual-run.js "keyword" [pages]
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { scrapeProducts } from './src/scraper/product-scraper.js';
import { logger } from './src/utils/logger.js';

// Get args
const keyword = process.argv[2] || 'laptop';
const maxPages = parseInt(process.argv[3]) || 1;

// Config (System Chrome on Mac)
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function run() {
    console.log(`🚀 Starting Scraper for "${keyword}" (Max Pages: ${maxPages})...`);
    console.log('   Using Authenticated Profile...\n');
    
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: CHROME_PATH,
        userDataDir: path.resolve('./chrome-profile'),
        args: ['--window-size=1366,768'],
        defaultViewport: { width: 1366, height: 768 }
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const result = await scrapeProducts(page, {
            keyword,
            maxPages
        });

        console.log('\n✅ DONE!');
        console.log(`📦 Total Products: ${result.totalProducts}`);
        
        // Save result
        // (scrapeProducts might not save file, it just returns data. Let's save it here)
        // Actually product-scraper.js logic we pasted DOES NOT save to file, it returns object to worker.
        // So we need to save it here.
        
        const fs = await import('fs');
        const filename = `result_${keyword.replace(/\s+/g,'_')}.json`;
        fs.writeFileSync(filename, JSON.stringify(result.products, null, 2));
        console.log(`💾 Saved to: ${filename}`);

    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        await browser.close();
    }
}

run();
