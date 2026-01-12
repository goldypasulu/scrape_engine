/**
 * Detail Page Scraper
 * Extracts comprehensive product data from Tokopedia product detail pages
 */

import { scraperLogger as logger } from '../utils/logger.js';

/**
 * Scrape detailed product information from a product detail page
 * @param {Page} page - Puppeteer page object
 * @param {string} productUrl - URL of the product detail page
 * @returns {Object} - Product details
 */
export async function scrapeProductDetail(page, productUrl) {
    const startTime = Date.now();
    
    try {
        // Navigate to product page
        await page.goto(productUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });
        
        // Wait for main content to load
        await new Promise(r => setTimeout(r, 3000));
        
        // Scroll slightly to trigger lazy loading
        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise(r => setTimeout(r, 1500));

        // Extract all data in one evaluate call for efficiency
        const productData = await page.evaluate(() => {
            // Helper: find text content safely
            const getText = (selector) => {
                const el = document.querySelector(selector);
                return el ? el.textContent.trim() : null;
            };
            
            // Helper: find via data-testid
            const getByTestId = (testId) => {
                const el = document.querySelector(`[data-testid="${testId}"]`);
                return el ? el.textContent.trim() : null;
            };

            // --- PRODUCT NAME ---
            let name = getByTestId('lblPDPDetailProductName') 
                    || getText('h1') 
                    || document.title.split('|')[0]?.trim();
            
            // --- PRICE ---
            let priceText = getByTestId('lblPDPDetailProductPrice');
            if (!priceText) {
                // Fallback: find Rp text
                const priceWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let node;
                while (node = priceWalker.nextNode()) {
                    const t = node.textContent.trim();
                    if (t.match(/^Rp\s*[\d.]+$/)) {
                        priceText = t;
                        break;
                    }
                }
            }
            const price = priceText ? parseInt(priceText.replace(/\D/g, '')) : 0;

            // --- RATING ---
            let ratingText = getByTestId('lblPDPDetailProductRatingNumber');
            if (!ratingText) {
                // Fallback: look for rating pattern like "4.9"
                const ratingEl = document.querySelector('[class*="rating"]');
                if (ratingEl) ratingText = ratingEl.textContent.trim();
            }
            const rating = ratingText ? parseFloat(ratingText) : null;

            // --- SOLD COUNT ---
            let soldCount = null;
            const bodyText = document.body.innerText;
            
            // Try multiple patterns for sold count
            // Pattern 1: "100+ terjual" or "1,5rb terjual" 
            // Pattern 2: "Terjual 100+"
            const soldPatterns = [
                /(\d+(?:[.,]\d+)?)\s*(rb|ribu)?\+?\s*terjual/i,
                /terjual\s*(\d+(?:[.,]\d+)?)\s*(rb|ribu)?\+?/i,
                /(\d+)\+\s*terjual/i
            ];
            
            for (const pattern of soldPatterns) {
                const match = bodyText.match(pattern);
                if (match) {
                    let numStr = match[1].replace(',', '.');
                    let multiplier = 1;
                    
                    // Check for "rb" or "ribu" (thousands)
                    if (match[2] && (match[2].toLowerCase() === 'rb' || match[2].toLowerCase() === 'ribu')) {
                        multiplier = 1000;
                    }
                    
                    soldCount = Math.round(parseFloat(numStr) * multiplier);
                    break;
                }
            }

            // --- SHOP NAME ---
            let shopName = getByTestId('llbPDPFooterShopName') 
                        || getText('a[data-testid="llbPDPFooterShopName"]');
            if (!shopName) {
                // Fallback: find shop link area
                const shopLinks = document.querySelectorAll('a[href*="/shop/"], a[href*="tokopedia.com/"]');
                for (const link of shopLinks) {
                    const text = link.textContent.trim();
                    // Shop names are usually short, not product names
                    if (text.length > 2 && text.length < 50 && !text.includes('Rp')) {
                        shopName = text;
                        break;
                    }
                }
            }

            // --- SHOP LOCATION ---
            let shopLocation = getByTestId('lblPDPDetailLocation');
            if (!shopLocation) {
                // Fallback: look for city names pattern
                const locationMatch = bodyText.match(/(Jakarta|Bandung|Surabaya|Medan|Tangerang|Bekasi|Depok|Semarang|Palembang|Makassar|Bogor|Yogyakarta)[^\n]*/i);
                if (locationMatch) {
                    shopLocation = locationMatch[0].substring(0, 50).trim();
                }
            }

            return {
                name: name || 'Unknown Product',
                price,
                priceText: priceText || 'N/A',
                rating,
                soldCount,
                shopName: shopName || 'N/A',
                shopLocation: shopLocation || 'N/A'
            };
        });

        const duration = Date.now() - startTime;
        
        return {
            ...productData,
            productUrl,
            scrapedAt: new Date().toISOString(),
            scrapeDuration: duration
        };

    } catch (error) {
        logger.error({ productUrl, error: error.message }, 'Failed to scrape product detail');
        
        // Return partial data on error
        return {
            name: 'Error',
            price: 0,
            priceText: 'N/A',
            rating: null,
            soldCount: null,
            shopName: 'N/A',
            shopLocation: 'N/A',
            productUrl,
            error: error.message,
            scrapedAt: new Date().toISOString()
        };
    }
}

export default {
    scrapeProductDetail
};
