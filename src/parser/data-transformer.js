/**
 * Data Transformer
 * Clean and format extracted data into structured output
 */

/**
 * Parse Indonesian price format to integer
 * Examples:
 *   "Rp1.234.567" → 1234567
 *   "Rp 50.000" → 50000
 *   "Rp50rb" → 50000
 * 
 * @param {string} priceString 
 * @returns {number|null}
 */
export function parsePrice(priceString) {
  if (!priceString) return null;

  // Handle "rb" (ribu = thousand) suffix
  if (priceString.toLowerCase().includes('rb')) {
    const match = priceString.match(/[\d.,]+/);
    if (match) {
      const num = parseFloat(match[0].replace(',', '.'));
      return Math.round(num * 1000);
    }
  }

  // Handle "jt" (juta = million) suffix
  if (priceString.toLowerCase().includes('jt')) {
    const match = priceString.match(/[\d.,]+/);
    if (match) {
      const num = parseFloat(match[0].replace(',', '.'));
      return Math.round(num * 1000000);
    }
  }

  // Standard format: remove all non-digit characters
  const cleaned = priceString.replace(/[^\d]/g, '');
  return cleaned ? parseInt(cleaned, 10) : null;
}

/**
 * Extract rating as float
 * Examples:
 *   "4.8" → 4.8
 *   "4.8 rating" → 4.8
 *   "4,8/5" → 4.8
 * 
 * @param {string} ratingString 
 * @returns {number|null}
 */
export function parseRating(ratingString) {
  if (!ratingString) return null;

  // Replace comma with dot for European format
  const normalized = ratingString.replace(',', '.');
  
  // Extract first decimal number
  const match = normalized.match(/(\d+\.?\d*)/);
  
  if (match) {
    const rating = parseFloat(match[1]);
    // Ratings should be between 0 and 5
    if (rating >= 0 && rating <= 5) {
      return Math.round(rating * 10) / 10; // Round to 1 decimal
    }
  }

  return null;
}

/**
 * Parse sold count
 * Examples:
 *   "100+ terjual" → 100
 *   "1rb+ terjual" → 1000
 *   "50jt+ terjual" → 50000000
 *   "Terjual 500" → 500
 * 
 * @param {string} soldString 
 * @returns {number|null}
 */
export function parseSoldCount(soldString) {
  if (!soldString) return null;

  const text = soldString.toLowerCase();

  // Handle "rb" (ribu = thousand)
  if (text.includes('rb')) {
    const match = text.match(/[\d.,]+/);
    if (match) {
      const num = parseFloat(match[0].replace(',', '.'));
      return Math.round(num * 1000);
    }
  }

  // Handle "jt" (juta = million)
  if (text.includes('jt')) {
    const match = text.match(/[\d.,]+/);
    if (match) {
      const num = parseFloat(match[0].replace(',', '.'));
      return Math.round(num * 1000000);
    }
  }

  // Standard number
  const match = text.match(/[\d]+/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Parse discount percentage
 * Examples:
 *   "50%" → 50
 *   "- 25%" → 25
 *   "Diskon 30%" → 30
 * 
 * @param {string} discountString 
 * @returns {number|null}
 */
export function parseDiscount(discountString) {
  if (!discountString) return null;

  const match = discountString.match(/(\d+)\s*%/);
  if (match) {
    const discount = parseInt(match[1], 10);
    // Discounts should be between 0 and 100
    if (discount >= 0 && discount <= 100) {
      return discount;
    }
  }

  return null;
}

/**
 * Clean and normalize text content
 * @param {string} text 
 * @returns {string|null}
 */
export function cleanText(text) {
  if (!text) return null;

  return text
    .trim()
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/[\n\r\t]/g, ' ') // Remove newlines/tabs
    .trim();
}

/**
 * Extract city from location string
 * Examples:
 *   "Jakarta Selatan" → "Jakarta Selatan"
 *   "Kota Jakarta Selatan" → "Jakarta Selatan"
 * 
 * @param {string} locationString 
 * @returns {string|null}
 */
export function parseLocation(locationString) {
  if (!locationString) return null;

  let cleaned = cleanText(locationString);
  
  // Remove common prefixes
  const prefixes = ['Kota ', 'Kab. ', 'Kabupaten '];
  for (const prefix of prefixes) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.substring(prefix.length);
    }
  }

  return cleaned;
}

/**
 * Transform raw product data into clean output format
 * @param {Object} rawProduct 
 * @returns {Object}
 */
export function transformProduct(rawProduct) {
  return {
    name: cleanText(rawProduct.name),
    price: parsePrice(rawProduct.price),
    originalPrice: parsePrice(rawProduct.originalPrice),
    discount: parseDiscount(rawProduct.discount),
    rating: parseRating(rawProduct.rating),
    soldCount: parseSoldCount(rawProduct.soldCount),
    shopName: cleanText(rawProduct.shopName),
    shopLocation: parseLocation(rawProduct.shopLocation),
    productUrl: rawProduct.productUrl,
    imageUrl: rawProduct.imageUrl,
    scrapedAt: rawProduct.scrapedAt || new Date().toISOString(),
  };
}

/**
 * Validate product data completeness
 * @param {Object} product 
 * @returns {Object} - { isValid, missingFields }
 */
export function validateProduct(product) {
  const requiredFields = ['name', 'price'];
  const missingFields = [];

  for (const field of requiredFields) {
    if (product[field] === null || product[field] === undefined) {
      missingFields.push(field);
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

export default {
  parsePrice,
  parseRating,
  parseSoldCount,
  parseDiscount,
  cleanText,
  parseLocation,
  transformProduct,
  validateProduct,
};
