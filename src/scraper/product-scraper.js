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
export async function scrapeProducts(page, jobData) {
  const { url, keyword, maxPages = config.scraper.maxPagesPerJob } = jobData;
  
  const startTime = Date.now();
  const allProducts = [];
  let currentPage = 1;
  let currentUrl = url || buildSearchUrl(keyword);

  logger.info({ url: currentUrl, keyword, maxPages }, 'Starting product scrape');

  while (currentPage <= maxPages) {
    logger.info({ currentPage, maxPages, url: currentUrl }, 'Scraping page');

    try {
      // Navigate to page with retry
      await retryWithBackoff(
        async () => {
          await navigateTo(page, currentUrl);
        },
        {
          ...RetryStrategies.fast,
          onRetry: async (error) => {
            if (error.message.includes('net::')) {
              await longPause();
            }
          },
        }
      );

      // Wait for product cards to appear
      const hasProducts = await waitForSelectorSafe(
        page,
        SELECTORS.productCard.primary,
        config.timeouts.selector
      );

      if (!hasProducts) {
        logger.warn({ currentPage }, 'No product cards found on page');
        
        // Try fallback selectors
        for (const fallback of SELECTORS.productCard.fallbacks) {
          if (await waitForSelectorSafe(page, fallback, 5000)) {
            logger.info({ fallback }, 'Found products with fallback selector');
            break;
          }
        }
      }

      // Human-like delay before scrolling
      await humanDelay();

      // Scroll to load all lazy-loaded products
      const scrollStats = await autoScroll(page, {
        targetSelector: SELECTORS.productCard.primary,
        maxScrolls: 30,
        minItems: 20, // Try to load at least 20 items
      });

      logger.info(
        { currentPage, itemCount: scrollStats.itemCount, scrollCount: scrollStats.scrollCount },
        'Scroll completed'
      );

      // Extract HTML content
      const html = await getPageContent(page);

      // Parse products using cheerio
      const products = parseProductCards(html);
      
      logger.info(
        { currentPage, productsFound: products.length },
        'Products extracted from page'
      );

      // Add page metadata
      products.forEach((product) => {
        product.sourcePage = currentPage;
        product.sourceUrl = currentUrl;
        product.keyword = keyword;
      });

      allProducts.push(...products);

      // Check for next page
      const hasNextPage = await checkNextPage(page);
      
      if (!hasNextPage || currentPage >= maxPages) {
        logger.info({ currentPage, reason: hasNextPage ? 'max_pages' : 'no_next_page' }, 'Stopping pagination');
        break;
      }

      // Get next page URL
      currentUrl = await getNextPageUrl(page, currentUrl, currentPage + 1);
      currentPage++;

      // Human-like delay between pages
      await humanDelay();
      await humanDelay(); // Extra delay between pages

    } catch (error) {
      logger.error(
        { currentPage, error: error.message, stack: error.stack },
        'Error scraping page'
      );

      if (isRetryableError(error)) {
        await longPause();
        // Don't increment page, try again
        continue;
      }

      // Non-retryable error, move to next page
      currentPage++;
    }
  }

  const duration = Date.now() - startTime;

  const result = {
    success: true,
    keyword,
    totalProducts: allProducts.length,
    pagesScraped: currentPage,
    duration,
    products: allProducts,
    scrapedAt: new Date().toISOString(),
  };

  logger.info(
    { 
      totalProducts: allProducts.length, 
      pagesScraped: currentPage,
      duration: `${(duration / 1000).toFixed(1)}s`,
    },
    'Scraping completed'
  );

  return result;
}

/**
 * Build Tokopedia search URL from keyword
 * @param {string} keyword 
 * @param {number} page 
 */
export function buildSearchUrl(keyword, page = 1) {
  const encodedKeyword = encodeURIComponent(keyword);
  const baseUrl = 'https://www.tokopedia.com/search';
  
  if (page > 1) {
    return `${baseUrl}?q=${encodedKeyword}&page=${page}`;
  }
  
  return `${baseUrl}?q=${encodedKeyword}`;
}

/**
 * Check if there's a next page
 * @param {Page} page 
 */
async function checkNextPage(page) {
  try {
    // Check for "Load More" button or pagination
    const selectors = [
      SELECTORS.loadMore.primary,
      ...SELECTORS.loadMore.fallbacks,
      'a[data-testid="btnSRPNextPage"]',
      'button[aria-label="Next page"]',
    ];

    for (const selector of selectors) {
      const element = await page.$(selector);
      if (element) {
        const isDisabled = await page.evaluate((el) => {
          return el.disabled || el.classList.contains('disabled');
        }, element);
        
        if (!isDisabled) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Get the URL for the next page
 * @param {Page} page 
 * @param {string} currentUrl 
 * @param {number} nextPage 
 */
async function getNextPageUrl(page, currentUrl, nextPage) {
  // Try to get next page link from the page
  try {
    const nextLink = await page.$eval(
      'a[data-testid="btnSRPNextPage"]',
      (el) => el.href
    );
    if (nextLink) return nextLink;
  } catch {
    // Fall through to URL manipulation
  }

  // Build URL with page parameter
  const url = new URL(currentUrl);
  url.searchParams.set('page', nextPage.toString());
  return url.toString();
}

export default {
  scrapeProducts,
  buildSearchUrl,
};
