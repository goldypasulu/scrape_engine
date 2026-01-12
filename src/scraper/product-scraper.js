/**
 * Product Scraper
 * Main scraping logic for Tokopedia product pages
 */

import { autoScroll } from './auto-scroll.js';
import { navigateTo, getPageContent, waitForSelectorSafe } from '../core/browser-utils.js';
import { parseProductCards } from '../parser/html-parser.js';
import { SELECTORS } from '../config/selectors.js';
import { config } from '../config/index.js';
import { humanDelay, longPause } from '../utils/delay.js';
import { retryWithBackoff, RetryStrategies, isRetryableError } from '../utils/retry.js';
import { scraperLogger as logger } from '../utils/logger.js';

/**
 * Scrape products from a search URL
 * @param {Page} page - Puppeteer page object
 * @param {Object} jobData - Job data from queue
 * @returns {Object} - Scraping results
 */
/**
 * Scrape products from a search URL
 * @param {Page} page - Puppeteer page object
 * @param {Object} jobData - Job data from queue
 * @returns {Object} - Scraping results
 */
export async function scrapeProducts(page, jobData) {
  const { url, keyword, maxPages = config.scraper.maxPagesPerJob } = jobData;
  const startTime = Date.now();
  
  // Use keyword to build URL if url is not provided
  const targetUrl = url || `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(keyword)}`;

  logger.info({ targetUrl, keyword, maxPages }, 'Starting optimized product scrape');

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (err) {
    logger.error({ err }, 'Navigation failed');
    throw err;
  }

  // --- HYBRID PAGINATION (Scroll + Click) ---
  const allProducts = [];
  let keepGoing = true;
  let totalScrolls = 0;
  const startTimeLoop = Date.now();

  while (keepGoing) {
      // Safety timeout (e.g. 5 minutes max per job)
      if (Date.now() - startTimeLoop > 300000) {
          logger.warn('Job time limit reached.');
          break;
      }

      // 1. Scroll Phase (Trigger auto-loads)
      logger.info({ totalScrolls }, 'Cycling scroll to trigger auto-load');
      
      const initialHeight = await page.evaluate(() => document.body.scrollHeight);
      
      // Scroll 5 times to trigger lazy loads
      for (let i = 0; i < 5; i++) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await new Promise(r => setTimeout(r, 2000));
      }
      
      await new Promise(r => setTimeout(r, 2000)); // Stabilize

      // 2. Button Phase (Look for "Muat Lebih Banyak")
      const buttonFound = await page.evaluate(async () => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => 
              (b.textContent.includes('Muat') && b.textContent.includes('Lebih')) || 
              b.textContent.toLowerCase().includes('load more')
          );
          
          if (btn && btn.offsetParent !== null) {
              btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
              return true;
          }
          return false;
      });

      if (buttonFound) {
            logger.info('Found Load More button. Clicking...');
           
           try {
              const [btn] = await page.$x("//button[contains(., 'Muat') or contains(., 'Load')]");
              if (btn) {
                  await btn.click();
                  await new Promise(r => setTimeout(r, 5000)); // Wait for content load
              }
           } catch (e) {
               logger.warn({ error: e.message }, 'Failed to click Load More button');
               // Don't stop, maybe just a glitch, try scrolling again
           }
      } else {
          // Check if we reached bottom
          const finalHeight = await page.evaluate(() => document.body.scrollHeight);
          if (Math.abs(finalHeight - initialHeight) < 100) { // Height stuck
             logger.info('Page height unchanging. Assuming end of results.');
             keepGoing = false;
          }
      }
      
      totalScrolls++;
      // Limit total cycles (each cycle is ~15-20s, 20 cycles ~ 5-6 mins)
      if (totalScrolls > 25) { 
          logger.info('Max scroll cycles reached');
          keepGoing = false; 
      }
  }

  // --- TEXT NODE EXTRACTION (Proven Strategy) ---
  logger.info('Extracting products from DOM...');
  
  const products = await page.evaluate(() => {
      const items = [];
      const processedNodes = new Set();
      
      const findLink = (el) => {
           while(el && el.tagName !== 'BODY') {
               if(el.tagName === 'A') return el;
               el = el.parentElement;
           }
           return null;
      };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;

      while(node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (text.match(/^Rp\s*[\d.]+/)) {
              const el = node.parentElement;
              let link = findLink(el);
              
              if (!link) {
                 let parent = el.parentElement; 
                 // Heuristic: search siblings/parents for link
                 for(let i=0; i<5; i++) {
                     if(!parent) break;
                     const l = parent.querySelector('a');
                     if(l) { link = l; break; }
                     parent = parent.parentElement;
                 }
              }

              if (link && !processedNodes.has(link.href)) {
                  processedNodes.add(link.href);
                  // Filter valid product links
                  if (link.href.includes('tautan.tokopedia.com') || link.href.includes('tokopedia.com/')) {
                      let name = link.textContent.trim();
                      if(name.length > 200) name = name.substring(0, 200) + '...';
                      
                      const cleanPrice = parseInt(text.replace(/\D/g, ''));
                      
                      items.push({
                          name: name.split('\n').filter(l => l.length > 5)[0] || name,
                          priceText: text,
                          price: cleanPrice,
                          productUrl: link.href,
                          shopName: 'N/A', // Hard to get reliably with generic strategy
                          rating: null,
                          soldCount: null
                      });
                  }
              }
          }
      }
      return items;
  });

  // Deduplicate and cleanup
  const uniqueMap = new Map();
  products.forEach(p => {
      if (p.price > 100) { // Filter zero/bad prices
        uniqueMap.set(p.productUrl, p);
      }
  });
  
  const finalProducts = Array.from(uniqueMap.values());
  const duration = Date.now() - startTime;

  logger.info(
    { 
      totalProducts: finalProducts.length, 
      duration: `${(duration / 1000).toFixed(1)}s`,
    },
    'Scraping completed successfully'
  );

  return {
    success: true,
    keyword,
    totalProducts: finalProducts.length,
    pagesScraped: 1, // We treat infinite scroll as 1 massive page
    duration,
    products: finalProducts,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Build Tokopedia search URL from keyword
 */
export function buildSearchUrl(keyword) {
  return `https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(keyword)}`;
}

export default {
  scrapeProducts,
  buildSearchUrl,
};
