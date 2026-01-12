/**
 * Resilient DOM Selector Utilities
 * Handles dynamic CSS classes by using stable data-testid attributes
 * with fallback chains and graceful error handling
 */

import { SELECTORS, getSelectorVariants } from '../config/selectors.js';
import { scraperLogger as logger } from '../utils/logger.js';

/**
 * Safely query a single element using selector chain
 * Returns null instead of throwing if not found
 * 
 * @param {Element|Document} root - Root element to search from
 * @param {string} fieldName - Field name from SELECTORS config
 * @param {Object} $ - Cheerio instance (optional, for cheerio context)
 * @returns {Element|null}
 */
export function safeQuerySelector(root, fieldName, $ = null) {
  const selectors = getSelectorVariants(fieldName);
  
  if (selectors.length === 0) {
    logger.warn({ fieldName }, 'No selectors defined for field');
    return null;
  }

  for (const selector of selectors) {
    try {
      // Cheerio context
      if ($ !== null) {
        const result = $(root).find(selector);
        if (result.length > 0) {
          return result.first();
        }
        continue;
      }

      // DOM context
      const result = root.querySelector(selector);
      if (result) {
        return result;
      }
    } catch (error) {
      // Invalid selector syntax, try next
      logger.debug({ selector, error: error.message }, 'Selector failed');
    }
  }

  logger.debug({ fieldName, selectors }, 'No selector matched');
  return null;
}

/**
 * Safely query all elements matching selector chain
 * @param {Element|Document} root 
 * @param {string} fieldName 
 * @param {Object} $ - Cheerio instance (optional)
 * @returns {Array}
 */
export function safeQuerySelectorAll(root, fieldName, $ = null) {
  const selectors = getSelectorVariants(fieldName);
  
  for (const selector of selectors) {
    try {
      // Cheerio context
      if ($ !== null) {
        const result = $(root).find(selector);
        if (result.length > 0) {
          return result.toArray().map((el) => $(el));
        }
        continue;
      }

      // DOM context
      const result = root.querySelectorAll(selector);
      if (result.length > 0) {
        return Array.from(result);
      }
    } catch (error) {
      logger.debug({ selector, error: error.message }, 'Selector failed');
    }
  }

  return [];
}

/**
 * Extract text content safely from an element
 * @param {Element} element 
 * @param {string} fieldName 
 * @param {Object} $ - Cheerio instance (optional)
 * @param {string} defaultValue 
 * @returns {string|null}
 */
export function safeTextContent(element, fieldName, $ = null, defaultValue = null) {
  const el = safeQuerySelector(element, fieldName, $);
  
  if (!el) {
    return defaultValue;
  }

  try {
    // Cheerio context
    if ($ !== null) {
      const text = el.text()?.trim();
      return text || defaultValue;
    }

    // DOM context
    const text = el.textContent?.trim();
    return text || defaultValue;
  } catch (error) {
    logger.debug({ fieldName, error: error.message }, 'Failed to extract text');
    return defaultValue;
  }
}

/**
 * Extract attribute value safely
 * @param {Element} element 
 * @param {string} fieldName 
 * @param {string} attributeName 
 * @param {Object} $ - Cheerio instance (optional)
 * @param {string} defaultValue 
 * @returns {string|null}
 */
export function safeAttribute(element, fieldName, attributeName, $ = null, defaultValue = null) {
  const el = safeQuerySelector(element, fieldName, $);
  
  if (!el) {
    return defaultValue;
  }

  try {
    // Cheerio context
    if ($ !== null) {
      const value = el.attr(attributeName);
      return value || defaultValue;
    }

    // DOM context
    const value = el.getAttribute(attributeName);
    return value || defaultValue;
  } catch (error) {
    logger.debug({ fieldName, attributeName, error: error.message }, 'Failed to extract attribute');
    return defaultValue;
  }
}

/**
 * Safely extract href from a link element
 * @param {Element} element 
 * @param {string} fieldName 
 * @param {Object} $ 
 * @returns {string|null}
 */
export function safeHref(element, fieldName, $ = null) {
  return safeAttribute(element, fieldName, 'href', $, null);
}

/**
 * Safely extract src from an image element
 * @param {Element} element 
 * @param {string} fieldName 
 * @param {Object} $ 
 * @returns {string|null}
 */
export function safeSrc(element, fieldName, $ = null) {
  // Try data-src first (lazy loading)
  const dataSrc = safeAttribute(element, fieldName, 'data-src', $, null);
  if (dataSrc) return dataSrc;
  
  return safeAttribute(element, fieldName, 'src', $, null);
}

/**
 * Count elements matching a field's selectors
 * @param {Element} element 
 * @param {string} fieldName 
 * @param {Object} $ 
 * @returns {number}
 */
export function countElements(element, fieldName, $ = null) {
  const elements = safeQuerySelectorAll(element, fieldName, $);
  return elements.length;
}

export default {
  safeQuerySelector,
  safeQuerySelectorAll,
  safeTextContent,
  safeAttribute,
  safeHref,
  safeSrc,
  countElements,
};
