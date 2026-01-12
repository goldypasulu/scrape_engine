/**
 * HTML Parser using Cheerio - HARDENED VERSION
 * 
 * Fixes:
 * 1. No dynamic CSS classes as primary selectors
 * 2. Per-field try-catch blocks
 * 3. Graceful handling of missing rating/soldCount
 * 4. Detailed error logging per field
 */

import * as cheerio from 'cheerio';
import { SELECTORS, getSelectorVariants } from '../config/selectors.js';
import { 
  parsePrice, 
  parseRating, 
  cleanText, 
  parseSoldCount,
  parseRatingCount,
  parseDiscount,
  parseLocation,
  parseProductUrl,
} from './data-transformer.js';
import { parserLogger as logger } from '../utils/logger.js';

/**
 * Parse product cards from HTML content
 * @param {string} html - Raw HTML content
 * @returns {Array} - Array of parsed product objects
 */
export function parseProductCards(html) {
  if (!html || typeof html !== 'string') {
    logger.warn('Invalid HTML input');
    return [];
  }

  const $ = cheerio.load(html);
  const products = [];
  const parseErrors = [];
  const fieldErrors = {};

  // Try primary selector first, then fallbacks
  const productCardSelectors = getSelectorVariants('productCard');
  let productCards = null;
  let usedSelector = null;

  for (const selector of productCardSelectors) {
    try {
      const cards = $(selector);
      if (cards.length > 0) {
        productCards = cards;
        usedSelector = selector;
        logger.debug({ selector, count: cards.length }, 'Found product cards');
        break;
      }
    } catch (error) {
      logger.debug({ selector, error: error.message }, 'Selector failed');
    }
  }

  if (!productCards || productCards.length === 0) {
    logger.warn('No product cards found with any selector');
    return [];
  }

  productCards.each((index, element) => {
    try {
      const $card = $(element);
      const { product, errors } = extractProductDataSafe($card, $, index);

      // Track field-level errors for analytics
      for (const error of errors) {
        if (!fieldErrors[error.field]) {
          fieldErrors[error.field] = 0;
        }
        fieldErrors[error.field]++;
      }

      // Validate: must have at least name OR price (not both required)
      // This allows new products without ratings to be captured
      if (product.name || product.price !== null) {
        products.push(product);
      } else {
        parseErrors.push({ 
          index, 
          reason: 'missing_required_fields',
          hasName: !!product.name,
          hasPrice: product.price !== null,
        });
      }
    } catch (error) {
      parseErrors.push({ index, reason: error.message });
      logger.debug({ index, error: error.message }, 'Failed to parse product card');
    }
  });

  // Log summary
  if (Object.keys(fieldErrors).length > 0) {
    logger.debug({ fieldErrors }, 'Field extraction errors summary');
  }

  if (parseErrors.length > 0) {
    logger.warn({ 
      errorCount: parseErrors.length, 
      total: productCards.length,
      successRate: `${((products.length / productCards.length) * 100).toFixed(1)}%`,
    }, 'Some products failed to parse');
  }

  logger.info({ 
    parsed: products.length, 
    total: productCards.length,
    usedSelector,
  }, 'Parsed product cards');

  return products;
}

/**
 * Extract data from a single product card with per-field error handling
 * 
 * @param {Cheerio} $card - Cheerio element for the product card
 * @param {CheerioAPI} $ - Cheerio instance
 * @param {number} index - Card index for logging
 * @returns {Object} - { product, errors }
 */
function extractProductDataSafe($card, $, index) {
  const errors = [];
  
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

  // ===== PRODUCT NAME =====
  try {
    const rawName = extractWithFallback($card, $, 'productName', (el) => el.text());
    product.name = cleanText(rawName);
  } catch (error) {
    errors.push({ field: 'name', error: error.message });
  }

  // ===== PRICE (with range handling) =====
  try {
    const priceText = extractWithFallback($card, $, 'productPrice', (el) => el.text());
    product.price = parsePrice(priceText);
    
    // Try to get original price if there's a discount
    const originalPriceText = extractWithFallback($card, $, 'originalPrice', (el) => el.text());
    if (originalPriceText) {
      product.originalPrice = parsePrice(originalPriceText);
    }
  } catch (error) {
    errors.push({ field: 'price', error: error.message });
  }

  // ===== DISCOUNT =====
  try {
    const discountText = extractWithFallback($card, $, 'discount', (el) => el.text());
    product.discount = parseDiscount(discountText);
    
    // Calculate discount from prices if not found
    if (product.discount === null && product.originalPrice && product.price) {
      const calculatedDiscount = Math.round((1 - product.price / product.originalPrice) * 100);
      if (calculatedDiscount > 0 && calculatedDiscount <= 100) {
        product.discount = calculatedDiscount;
      }
    }
  } catch (error) {
    errors.push({ field: 'discount', error: error.message });
  }

  // ===== RATING (graceful null for new products) =====
  try {
    const ratingText = extractWithFallback($card, $, 'productRating', (el) => el.text());
    product.rating = parseRating(ratingText);
    // Note: null is valid for new products without ratings
  } catch (error) {
    errors.push({ field: 'rating', error: error.message });
    // Don't log as error - missing rating is expected for new products
  }

  // ===== RATING COUNT =====
  try {
    const ratingCountText = extractWithFallback($card, $, 'ratingCount', (el) => el.text());
    product.ratingCount = parseRatingCount(ratingCountText);
  } catch (error) {
    // Silent - optional field
  }

  // ===== SOLD COUNT (graceful null for new products) =====
  try {
    const soldText = extractWithFallback($card, $, 'soldCount', (el) => el.text());
    product.soldCount = parseSoldCount(soldText);
    // Note: null is valid for new products without sales
  } catch (error) {
    errors.push({ field: 'soldCount', error: error.message });
    // Don't log as error - missing soldCount is expected for new products
  }

  // ===== SHOP LOCATION =====
  try {
    const locationText = extractWithFallback($card, $, 'shopLocation', (el) => el.text());
    product.shopLocation = parseLocation(locationText);
  } catch (error) {
    errors.push({ field: 'shopLocation', error: error.message });
  }

  // ===== SHOP NAME =====
  try {
    const shopNameText = extractWithFallback($card, $, 'shopName', (el) => el.text());
    product.shopName = cleanText(shopNameText);
  } catch (error) {
    errors.push({ field: 'shopName', error: error.message });
  }

  // ===== PRODUCT URL =====
  try {
    const href = extractWithFallback($card, $, 'productLink', (el) => el.attr('href'));
    product.productUrl = parseProductUrl(href);
  } catch (error) {
    errors.push({ field: 'productUrl', error: error.message });
  }

  // ===== IMAGE URL (handle lazy loading) =====
  try {
    // Try multiple image attributes for lazy-loaded images
    const imageUrl = extractWithFallback($card, $, 'productImage', (el) => {
      return el.attr('data-src') 
        || el.attr('data-lazy-src')
        || el.attr('data-original')
        || el.attr('src');
    });
    
    // Validate image URL
    if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('//'))) {
      product.imageUrl = imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;
    }
  } catch (error) {
    errors.push({ field: 'imageUrl', error: error.message });
  }

  return { product, errors };
}

/**
 * Helper to extract data with fallback selectors
 * Uses ONLY data-testid selectors as primary, class-based as last resort
 * 
 * @param {Cheerio} $card 
 * @param {CheerioAPI} $ 
 * @param {string} fieldName 
 * @param {Function} extractor 
 * @returns {*}
 */
function extractWithFallback($card, $, fieldName, extractor) {
  const selectors = getSelectorVariants(fieldName);

  for (const selector of selectors) {
    // CRITICAL: Skip dynamic CSS class selectors like .css-xxxxx
    if (selector.match(/\.css-[a-z0-9]+/i)) {
      logger.debug({ selector, fieldName }, 'Skipping dynamic CSS class selector');
      continue;
    }

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
      logger.debug({ selector, fieldName, error: error.message }, 'Selector extraction failed');
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
  if (!html) {
    return {
      title: null,
      totalResults: null,
      productCount: 0,
      products: [],
      parsedAt: new Date().toISOString(),
    };
  }

  const $ = cheerio.load(html);

  // Extract page metadata safely
  let title = null;
  let totalResults = null;

  try {
    title = $('title').text()?.trim() || null;
  } catch {}

  try {
    totalResults = extractTotalResults($);
  } catch {}

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
 * Avoids dynamic CSS classes
 * 
 * @param {CheerioAPI} $ 
 */
function extractTotalResults($) {
  // ONLY use data-testid selectors - NO dynamic CSS classes
  const selectors = [
    'div[data-testid="divSRPTotalResult"]',
    '[data-testid*="total"]',
    '[data-testid*="result"]',
    // Structural fallbacks (no class names)
    'header span:contains("hasil")',
    'header span:contains("produk")',
  ];

  for (const selector of selectors) {
    try {
      const el = $(selector);
      if (el.length > 0) {
        const text = el.text();
        // Look for number patterns
        const match = text.match(/([\d.,]+)\s*(?:hasil|produk|result)/i);
        if (match) {
          return parseInt(match[1].replace(/[.,]/g, ''), 10);
        }
        // Fallback: just get the first number
        const numMatch = text.match(/[\d.,]+/);
        if (numMatch) {
          return parseInt(numMatch[0].replace(/[.,]/g, ''), 10);
        }
      }
    } catch {
      // Continue to next selector
    }
  }

  return null;
}

/**
 * Validate HTML content has expected structure
 * Useful for debugging selector issues
 * 
 * @param {string} html 
 * @returns {Object} - Validation results
 */
export function validateHtmlStructure(html) {
  if (!html) {
    return { valid: false, reason: 'Empty HTML' };
  }

  const $ = cheerio.load(html);
  const checks = {
    hasBody: $('body').length > 0,
    hasProductContainer: false,
    productCardCount: 0,
    detectedSelectors: [],
  };

  // Check each selector category
  for (const [fieldName, config] of Object.entries(SELECTORS)) {
    const primary = config.primary;
    const count = $(primary).length;
    if (count > 0) {
      checks.detectedSelectors.push({ field: fieldName, selector: primary, count });
    }
  }

  checks.hasProductContainer = checks.detectedSelectors.some(s => s.field === 'productCard');
  checks.productCardCount = checks.detectedSelectors.find(s => s.field === 'productCard')?.count || 0;

  return {
    valid: checks.hasBody && checks.hasProductContainer,
    checks,
  };
}

export default {
  parseProductCards,
  parsePage,
  validateHtmlStructure,
};
