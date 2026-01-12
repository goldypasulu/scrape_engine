/**
 * HTML Parser using Cheerio
 * Fast DOM parsing outside the browser context
 */

import * as cheerio from 'cheerio';
import { SELECTORS, getSelectorVariants } from '../config/selectors.js';
import { parsePrice, parseRating, cleanText, parseSoldCount } from './data-transformer.js';
import { parserLogger as logger } from '../utils/logger.js';

/**
 * Parse product cards from HTML content
 * @param {string} html - Raw HTML content
 * @returns {Array} - Array of parsed product objects
 */
export function parseProductCards(html) {
  const $ = cheerio.load(html);
  const products = [];
  const errors = [];

  // Try primary selector first, then fallbacks
  const productCardSelectors = getSelectorVariants('productCard');
  let productCards = null;

  for (const selector of productCardSelectors) {
    const cards = $(selector);
    if (cards.length > 0) {
      productCards = cards;
      logger.debug({ selector, count: cards.length }, 'Found product cards with selector');
      break;
    }
  }

  if (!productCards || productCards.length === 0) {
    logger.warn('No product cards found with any selector');
    return [];
  }

  productCards.each((index, element) => {
    try {
      const $card = $(element);
      const product = extractProductData($card, $, index);

      // Validate: must have at least name or price
      if (product.name || product.price !== null) {
        products.push(product);
      } else {
        errors.push({ index, reason: 'missing_required_fields' });
      }
    } catch (error) {
      errors.push({ index, reason: error.message });
      logger.debug({ index, error: error.message }, 'Failed to parse product card');
    }
  });

  if (errors.length > 0) {
    logger.warn({ errorCount: errors.length, total: productCards.length }, 'Some products failed to parse');
  }

  logger.info({ parsed: products.length, total: productCards.length }, 'Parsed product cards');

  return products;
}

/**
 * Extract data from a single product card
 * @param {Cheerio} $card - Cheerio element for the product card
 * @param {CheerioAPI} $ - Cheerio instance
 * @param {number} index - Card index for logging
 * @returns {Object} - Product data
 */
function extractProductData($card, $, index) {
  const product = {
    name: null,
    price: null,
    originalPrice: null,
    discount: null,
    rating: null,
    ratingCount: null,
    soldCount: null,
    shopName: null,
    shopLocation: null,
    productUrl: null,
    imageUrl: null,
    scrapedAt: new Date().toISOString(),
  };

  // Product Name
  product.name = extractWithFallback($card, $, 'productName', (el) => {
    return cleanText(el.text());
  });

  // Price (convert to integer)
  const priceText = extractWithFallback($card, $, 'productPrice', (el) => el.text());
  product.price = parsePrice(priceText);

  // Rating
  const ratingText = extractWithFallback($card, $, 'productRating', (el) => el.text());
  product.rating = parseRating(ratingText);

  // Shop Location
  product.shopLocation = extractWithFallback($card, $, 'shopLocation', (el) => {
    return cleanText(el.text());
  });

  // Shop Name
  product.shopName = extractWithFallback($card, $, 'shopName', (el) => {
    return cleanText(el.text());
  });

  // Sold Count
  const soldText = extractWithFallback($card, $, 'soldCount', (el) => el.text());
  product.soldCount = parseSoldCount(soldText);

  // Product URL
  product.productUrl = extractWithFallback($card, $, 'productLink', (el) => {
    return el.attr('href');
  });

  // Image URL (handle lazy loading)
  product.imageUrl = extractWithFallback($card, $, 'productImage', (el) => {
    return el.attr('data-src') || el.attr('src');
  });

  return product;
}

/**
 * Helper to extract data with fallback selectors
 * @param {Cheerio} $card 
 * @param {CheerioAPI} $ 
 * @param {string} fieldName 
 * @param {Function} extractor 
 * @returns {*}
 */
function extractWithFallback($card, $, fieldName, extractor) {
  const selectors = getSelectorVariants(fieldName);

  for (const selector of selectors) {
    try {
      const el = $card.find(selector).first();
      if (el.length > 0) {
        const value = extractor(el);
        if (value !== null && value !== undefined && value !== '') {
          return value;
        }
      }
    } catch (error) {
      // Invalid selector or extraction failed, try next
    }
  }

  return null;
}

/**
 * Parse products from a full page document
 * @param {string} html 
 * @returns {Object} - Parsed page with products and metadata
 */
export function parsePage(html) {
  const $ = cheerio.load(html);

  // Extract page metadata
  const title = $('title').text();
  const totalResults = extractTotalResults($);

  const products = parseProductCards(html);

  return {
    title,
    totalResults,
    productCount: products.length,
    products,
    parsedAt: new Date().toISOString(),
  };
}

/**
 * Extract total results count from page
 * @param {CheerioAPI} $ 
 */
function extractTotalResults($) {
  try {
    // Common patterns for result count
    const selectors = [
      'div[data-testid="divSRPTotalResult"]',
      '.css-tjikma', // This might change, use as fallback
      '[class*="search-result-count"]',
    ];

    for (const selector of selectors) {
      const el = $(selector);
      if (el.length > 0) {
        const text = el.text();
        const match = text.match(/[\d.,]+/);
        if (match) {
          return parseInt(match[0].replace(/[.,]/g, ''), 10);
        }
      }
    }
  } catch {
    // Unable to extract
  }

  return null;
}

export default {
  parseProductCards,
  parsePage,
};
