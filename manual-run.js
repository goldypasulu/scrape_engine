/**
 * Manual Scraper Runner - INTERLEAVED VERSION
 * 
 * Flow: Scroll → Scrape visible items → Load More → Repeat
 * Each item is saved immediately to file (no data loss on interrupt)
 * 
 * Usage: node manual-run.js "keyword" [maxProducts]
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { scrapeProductDetail } from './src/scraper/detail-scraper.js';

// Get args
const keyword = process.argv[2] || 'laptop';
const maxProducts = process.argv[3] ? parseInt(process.argv[3]) : null; // null = unlimited

// Config
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function run() {
    console.log(`\n🚀 TOKOPEDIA DETAIL SCRAPER (Interleaved Mode)`);
    console.log(`   Keyword: "${keyword}"`);
    console.log(`   Max Products: ${maxProducts || 'Unlimited'}`);
    console.log(`${'='.repeat(50)}\n`);
    
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: CHROME_PATH,
        userDataDir: path.resolve('./chrome-profile'),
        args: ['--window-size=1366,768'],
        defaultViewport: { width: 1366, height: 768 }
    });

    // Prepare output file (will append each item)
    const filename = `result_${keyword.replace(/\s+/g, '_')}_detail.json`;
    const scrapedUrls = new Set(); // Track already scraped URLs
    let totalScraped = 0;

    // Load existing data if file exists (resume mode)
    let existingData = [];
    if (fs.existsSync(filename)) {
        try {
            existingData = JSON.parse(fs.readFileSync(filename, 'utf-8'));
            existingData.forEach(p => scrapedUrls.add(p.productUrl));
            console.log(`📂 Found existing file with ${existingData.length} items. Resuming...`);
        } catch (e) {
            console.log('⚠️ Could not parse existing file. Starting fresh.');
            existingData = [];
        }
    }

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Navigate to search page
        const listingUrl = `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(keyword)}`;
        console.log(`📋 Navigating to: ${listingUrl}\n`);
        await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 3000));

        let keepGoing = true;
        let scrollCycles = 0;
        
        while (keepGoing) {
            // Check max limit
            if (maxProducts && totalScraped >= maxProducts) {
                console.log(`\n🛑 Reached max products limit (${maxProducts})`);
                break;
            }

            // 1. SCROLL to load more items
            console.log(`\n🔄 Scroll cycle ${++scrollCycles}...`);
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(r => setTimeout(r, 1500));
            }
            await new Promise(r => setTimeout(r, 2000));

            // 2. EXTRACT visible product URLs (not yet scraped)
            const newUrls = await page.evaluate((scrapedSet) => {
                const urls = [];
                const findLink = (el) => {
                    while (el && el.tagName !== 'BODY') {
                        if (el.tagName === 'A' && el.href) return el;
                        el = el.parentElement;
                    }
                    return null;
                };
                
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                let node;
                
                while (node = walker.nextNode()) {
                    const text = node.textContent.trim();
                    if (text.match(/^Rp\s*[\d.]+/)) {
                        let el = node.parentElement;
                        let link = findLink(el);
                        
                        if (!link) {
                            let parent = el.parentElement;
                            for (let i = 0; i < 8 && parent; i++) {
                                const a = parent.querySelector('a[href*="tokopedia.com/"]');
                                if (a) { link = a; break; }
                                parent = parent.parentElement;
                            }
                        }
                        
                        if (link && link.href) {
                            const href = link.href.split('?')[0];
                            if (href.startsWith('https://www.tokopedia.com/') &&
                                !href.includes('/shop/') && 
                                !href.includes('/search') &&
                                !href.includes('/discovery') &&
                                !href.includes('/promo') &&
                                !href.includes('/blog/') &&
                                !href.includes('/p/') &&
                                !href.includes('/catalog/') &&
                                href.split('/').length >= 5 &&
                                !scrapedSet.includes(href)) {
                                urls.push(href);
                            }
                        }
                    }
                }
                return [...new Set(urls)]; // Dedupe
            }, Array.from(scrapedUrls));

            console.log(`   Found ${newUrls.length} new products to scrape`);

            // 3. SCRAPE each new product (interleaved)
            for (const productUrl of newUrls) {
                if (maxProducts && totalScraped >= maxProducts) break;
                if (scrapedUrls.has(productUrl)) continue;

                totalScraped++;
                console.log(`[${totalScraped}${maxProducts ? '/' + maxProducts : ''}] ${productUrl.substring(0, 55)}...`);

                try {
                    const productData = await scrapeProductDetail(page, productUrl);
                    productData.keyword = keyword;
                    
                    // IMMEDIATE SAVE (append to array and write)
                    existingData.push(productData);
                    fs.writeFileSync(filename, JSON.stringify(existingData, null, 2));
                    
                    scrapedUrls.add(productUrl);
                    console.log(`   ✅ ${productData.name.substring(0, 35)}... | ${productData.priceText} | ⭐${productData.rating || '-'}`);
                    
                    // Small delay
                    await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
                    
                } catch (err) {
                    console.log(`   ❌ Error: ${err.message}`);
                    scrapedUrls.add(productUrl); // Mark as processed to skip on retry
                }
            }

            // 4. Go back to listing page
            console.log(`   ↩️ Returning to listing page...`);
            await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise(r => setTimeout(r, 2000));

            // Re-scroll to previous position
            for (let i = 0; i < scrollCycles; i++) {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(r => setTimeout(r, 800));
            }
            await new Promise(r => setTimeout(r, 1500));

            // 5. Check for LOAD MORE button
            const loadMoreClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => 
                    (b.textContent.includes('Muat') && b.textContent.includes('Lebih')) || 
                    b.textContent.toLowerCase().includes('load more')
                );
                if (btn && btn.offsetParent !== null) {
                    btn.scrollIntoView({ block: 'center' });
                    btn.click();
                    return true;
                }
                return false;
            });

            if (loadMoreClicked) {
                console.log(`   🔘 Clicked "Load More" button`);
                await new Promise(r => setTimeout(r, 4000));
            }

            // 6. Check if no new items found (end condition)
            if (newUrls.length === 0) {
                // Double check - scroll once more
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(r => setTimeout(r, 2000));
                
                const stillNoNew = await page.evaluate((scrapedSet) => {
                    // Quick check for any unscraped Rp text
                    const allPrices = document.body.innerText.match(/Rp\s*[\d.]+/g) || [];
                    return allPrices.length < 5; // Very few prices visible = end
                }, Array.from(scrapedUrls));
                
                if (stillNoNew && !loadMoreClicked) {
                    console.log(`\n🏁 No more products found. Scraping complete!`);
                    keepGoing = false;
                }
            }

            // Safety: limit cycles to prevent infinite loop
            if (scrollCycles > 100) {
                console.log(`\n🛑 Safety limit reached (100 cycles)`);
                keepGoing = false;
            }
        }

        // Final report
        console.log(`\n${'='.repeat(50)}`);
        console.log('📊 FINAL REPORT');
        console.log(`${'='.repeat(50)}`);
        console.log(`   Keyword: "${keyword}"`);
        console.log(`   Total Scraped: ${existingData.length}`);
        console.log(`   File: ${filename}`);
        console.log(`${'='.repeat(50)}\n`);

    } catch (e) {
        console.error('\n❌ FATAL ERROR:', e);
    } finally {
        console.log('👋 Closing browser...');
        await browser.close();
    }
}

run();
