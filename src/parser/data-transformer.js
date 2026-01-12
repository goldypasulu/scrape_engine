/**
 * Data Transformer - HARDENED VERSION
 * 
 * Fixes:
 * 1. Price range handling ("Rp10.000 - Rp20.000" → returns minPrice)
 * 2. All functions have explicit null checks
 * 3. NaN protection on all numeric returns
 * 4. Graceful handling of malformed data
 */

import { parserLogger as logger } from '../utils/logger.js';

/**
 * Safe number validation - prevents NaN from propagating
 */
function safeNumber(value, defaultValue = null) {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)) {
    return value;
  }
  return defaultValue;
}

/**
 * Parse Indonesian price format to integer
 * 
 * HANDLES EDGE CASES:
 * - Price ranges: "Rp10.000 - Rp20.000" → returns 10000 (minimum price)
 * - Abbreviated: "Rp50rb" → 50000, "Rp1,5jt" → 1500000
 * - Free items: "Gratis" → 0
 * - Empty/null: → null
 * 
 * @param {string} priceString 
 * @returns {number|null}
 */
export function parsePrice(priceString) {
  try {
    if (!priceString || typeof priceString !== 'string') return null;

    const text = priceString.trim().toLowerCase();
    
    // Handle "Gratis" (free) items
    if (text.includes('gratis') || text === 'free' || text === '0') {
      return 0;
    }

    // Handle price ranges: "Rp10.000 - Rp20.000" or "Rp10.000-Rp20.000"
    // Strategy: Return the MINIMUM price (first number)
    if (text.includes('-') && (text.match(/rp/gi) || []).length >= 2) {
      const parts = text.split(/\s*-\s*/);
      if (parts.length >= 2) {
        const minPrice = parsePrice(parts[0]); // Recursive call on first part
        if (minPrice !== null) {
          logger.debug({ original: priceString, parsed: minPrice }, 'Parsed price range (using min)');
          return minPrice;
        }
      }
    }

    // Handle "rb" (ribu = thousand) suffix: "50rb", "1,5rb"
    if (text.includes('rb')) {
      const match = text.match(/([\d.,]+)\s*rb/i);
      if (match) {
        const num = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        const result = Math.round(num * 1000);
        return safeNumber(result);
      }
    }

    // Handle "jt" or "juta" (million) suffix: "1,5jt", "2 juta"
    if (text.includes('jt') || text.includes('juta')) {
      const match = text.match(/([\d.,]+)\s*(?:jt|juta)/i);
      if (match) {
        const num = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        const result = Math.round(num * 1000000);
        return safeNumber(result);
      }
    }

    // Standard Indonesian format: "Rp1.234.567" or "Rp 1.234.567"
    // Extract first contiguous number sequence after removing currency symbol
    const withoutCurrency = text.replace(/rp\s*/gi, '');
    
    // Match the first price (handles cases like "Rp10.000 (10% off)")
    const priceMatch = withoutCurrency.match(/^([\d.]+)/);
    if (priceMatch) {
      const cleaned = priceMatch[1].replace(/\./g, ''); // Remove thousand separators
      const result = parseInt(cleaned, 10);
      return safeNumber(result);
    }

    // Fallback: try to extract any number
    const anyNumber = text.match(/\d+/);
    if (anyNumber) {
      return safeNumber(parseInt(anyNumber[0], 10));
    }

    return null;
  } catch (error) {
    logger.debug({ priceString, error: error.message }, 'parsePrice error');
    return null;
  }
}

/**
 * Extract rating as float
 * 
 * HANDLES EDGE CASES:
 * - No rating (new product): → null
 * - Various formats: "4.8", "4,8", "4.8/5", "Rating: 4.8"
 * - Invalid ratings (>5 or <0): → null
 * 
 * @param {string} ratingString 
 * @returns {number|null}
 */
export function parseRating(ratingString) {
  try {
    if (!ratingString || typeof ratingString !== 'string') return null;

    const text = ratingString.trim();
    if (text === '' || text === '-') return null;

    // Replace comma with dot for European format
    const normalized = text.replace(',', '.');
    
    // Extract first decimal number
    const match = normalized.match(/(\d+\.?\d*)/);
    
    if (match) {
      const rating = parseFloat(match[1]);
      
      // Validate: ratings should be between 0 and 5
      if (Number.isNaN(rating) || rating < 0 || rating > 5) {
        return null;
      }
      
      // Round to 1 decimal place
      return Math.round(rating * 10) / 10;
    }

    return null;
  } catch (error) {
    logger.debug({ ratingString, error: error.message }, 'parseRating error');
    return null;
  }
}

/**
 * Parse sold count
 * 
 * HANDLES EDGE CASES:
 * - New product (no sales): → null (not 0, to distinguish from actual 0 sales)
 * - Abbreviated: "1rb+ terjual" → 1000
 * - Various formats: "100+", "Terjual 500", "500 terjual"
 * 
 * @param {string} soldString 
 * @returns {number|null}
 */
export function parseSoldCount(soldString) {
  try {
    if (!soldString || typeof soldString !== 'string') return null;

    const text = soldString.trim().toLowerCase();
    if (text === '' || text === '-') return null;

    // Handle "rb" (ribu = thousand): "1rb+", "2,5rb terjual"
    if (text.includes('rb')) {
      const match = text.match(/([\d.,]+)\s*rb/);
      if (match) {
        const num = parseFloat(match[1].replace(',', '.'));
        return safeNumber(Math.round(num * 1000));
      }
    }

    // Handle "jt" (juta = million): "1jt+ terjual"
    if (text.includes('jt')) {
      const match = text.match(/([\d.,]+)\s*jt/);
      if (match) {
        const num = parseFloat(match[1].replace(',', '.'));
        return safeNumber(Math.round(num * 1000000));
      }
    }

    // Standard number: "100+", "terjual 500"
    const match = text.match(/(\d+)/);
    if (match) {
      return safeNumber(parseInt(match[1], 10));
    }

    return null;
  } catch (error) {
    logger.debug({ soldString, error: error.message }, 'parseSoldCount error');
    return null;
  }
}

/**
 * Parse rating count (number of reviews)
 * 
 * Examples:
 *   "(1.234)" → 1234
 *   "1234 ulasan" → 1234
 *   "1rb ulasan" → 1000
 * 
 * @param {string} ratingCountString 
 * @returns {number|null}
 */
export function parseRatingCount(ratingCountString) {
  try {
    if (!ratingCountString || typeof ratingCountString !== 'string') return null;

    const text = ratingCountString.trim().toLowerCase();
    if (text === '' || text === '-') return null;

    // Handle "rb" abbreviation
    if (text.includes('rb')) {
      const match = text.match(/([\d.,]+)\s*rb/);
      if (match) {
        const num = parseFloat(match[1].replace(',', '.'));
        return safeNumber(Math.round(num * 1000));
      }
    }

    // Remove parentheses and extract number
    const cleaned = text.replace(/[()]/g, '');
    const match = cleaned.match(/([\d.]+)/);
    if (match) {
      const num = parseInt(match[1].replace(/\./g, ''), 10);
      return safeNumber(num);
    }

    return null;
  } catch (error) {
    logger.debug({ ratingCountString, error: error.message }, 'parseRatingCount error');
    return null;
  }
}

/**
 * Parse discount percentage
 * 
 * Examples:
 *   "50%" → 50
 *   "- 25%" → 25
 *   "Diskon 30%" → 30
 * 
 * @param {string} discountString 
 * @returns {number|null}
 */
export function parseDiscount(discountString) {
  try {
    if (!discountString || typeof discountString !== 'string') return null;

    const match = discountString.match(/(\d+)\s*%/);
    if (match) {
      const discount = parseInt(match[1], 10);
      // Validate: discounts should be between 0 and 100
      if (discount >= 0 && discount <= 100) {
        return discount;
      }
    }

    return null;
  } catch (error) {
    logger.debug({ discountString, error: error.message }, 'parseDiscount error');
    return null;
  }
}

/**
 * Clean and normalize text content
 * 
 * @param {string} text 
 * @returns {string|null}
 */
export function cleanText(text) {
  try {
    if (!text || typeof text !== 'string') return null;

    const cleaned = text
      .trim()
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .replace(/[\n\r\t]/g, ' ') // Remove newlines/tabs
      .replace(/\u00A0/g, ' ')   // Remove non-breaking spaces
      .trim();

    return cleaned || null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract city from location string
 * 
 * Examples:
 *   "Jakarta Selatan" → "Jakarta Selatan"
 *   "Kota Jakarta Selatan" → "Jakarta Selatan"
 *   "Kab. Bandung" → "Bandung"
 * 
 * @param {string} locationString 
 * @returns {string|null}
 */
export function parseLocation(locationString) {
  try {
    if (!locationString || typeof locationString !== 'string') return null;

    let cleaned = cleanText(locationString);
    if (!cleaned) return null;
    
    // Remove common Indonesian administrative prefixes
    const prefixes = ['Kota ', 'Kab. ', 'Kabupaten ', 'Kec. ', 'Kecamatan '];
    for (const prefix of prefixes) {
      if (cleaned.startsWith(prefix)) {
        cleaned = cleaned.substring(prefix.length);
      }
    }

    return cleaned || null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse product URL - ensure it's absolute and valid
 * 
 * @param {string} url 
 * @param {string} baseUrl 
 * @returns {string|null}
 */
export function parseProductUrl(url, baseUrl = 'https://www.tokopedia.com') {
  try {
    if (!url || typeof url !== 'string') return null;

    let cleanUrl = url.trim();
    
    // Handle relative URLs
    if (cleanUrl.startsWith('/')) {
      cleanUrl = baseUrl + cleanUrl;
    }

    // Validate URL format
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return null;
    }

    // Remove tracking parameters (optional, keeps URL clean)
    try {
      const urlObj = new URL(cleanUrl);
      // Keep only essential parameters
      const essentialParams = ['product_id', 'shop_id'];
      const newParams = new URLSearchParams();
      
      for (const key of essentialParams) {
        if (urlObj.searchParams.has(key)) {
          newParams.set(key, urlObj.searchParams.get(key));
        }
      }
      
      // If we removed params, use clean URL
      if (newParams.toString()) {
        return `${urlObj.origin}${urlObj.pathname}?${newParams.toString()}`;
      }
      
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return cleanUrl;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Transform raw product data into clean output format
 * Each field has independent error handling
 * 
 * @param {Object} rawProduct 
 * @returns {Object}
 */
export function transformProduct(rawProduct) {
  if (!rawProduct || typeof rawProduct !== 'object') {
    return null;
  }

  const transformed = {
    name: null,
    price: null,
    priceMin: null,
    priceMax: null,
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

  // Each field wrapped in try-catch for resilience
  try { transformed.name = cleanText(rawProduct.name); } catch {}
  try { transformed.price = parsePrice(rawProduct.price); } catch {}
  try { transformed.originalPrice = parsePrice(rawProduct.originalPrice); } catch {}
  try { transformed.discount = parseDiscount(rawProduct.discount); } catch {}
  try { transformed.rating = parseRating(rawProduct.rating); } catch {}
  try { transformed.ratingCount = parseRatingCount(rawProduct.ratingCount); } catch {}
  try { transformed.soldCount = parseSoldCount(rawProduct.soldCount); } catch {}
  try { transformed.shopName = cleanText(rawProduct.shopName); } catch {}
  try { transformed.shopLocation = parseLocation(rawProduct.shopLocation); } catch {}
  try { transformed.productUrl = parseProductUrl(rawProduct.productUrl); } catch {}
  try { transformed.imageUrl = rawProduct.imageUrl || null; } catch {}
  
  if (rawProduct.scrapedAt) {
    transformed.scrapedAt = rawProduct.scrapedAt;
  }

  return transformed;
}

/**
 * Validate product data completeness
 * 
 * @param {Object} product 
 * @returns {Object} - { isValid, missingFields, warnings }
 */
export function validateProduct(product) {
  const requiredFields = ['name', 'price'];
  const optionalFields = ['rating', 'soldCount', 'shopLocation'];
  const missingFields = [];
  const warnings = [];

  if (!product || typeof product !== 'object') {
    return { isValid: false, missingFields: requiredFields, warnings: ['Product is null or invalid'] };
  }

  // Check required fields
  for (const field of requiredFields) {
    if (product[field] === null || product[field] === undefined) {
      missingFields.push(field);
    }
  }

  // Check optional fields and add warnings
  for (const field of optionalFields) {
    if (product[field] === null || product[field] === undefined) {
      warnings.push(`Missing optional field: ${field}`);
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}

export default {
  parsePrice,
  parseRating,
  parseSoldCount,
  parseRatingCount,
  parseDiscount,
  cleanText,
  parseLocation,
  parseProductUrl,
  transformProduct,
  validateProduct,
  safeNumber,
};
