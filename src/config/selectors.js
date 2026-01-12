/**
 * Stable DOM Selectors for Tokopedia
 * 
 * IMPORTANT: Do NOT use dynamic CSS classes (e.g., .css-123xyz)
 * Use data-testid attributes which are stable across deployments
 * 
 * Each selector has a primary (data-testid) and fallback options
 */

export const SELECTORS = {
  // Product listing page
  productCard: {
    primary: 'div[data-testid="master-product-card"]',
    fallbacks: [
      'div[data-testid="divSRPContentProducts"] > div',
      // Class pattern matching as LAST resort only
      '[class*="product-card"]',
      '[class*="ProductCard"]',
    ],
  },

  // Product name
  productName: {
    primary: 'div[data-testid="spnSRPProdName"]',
    fallbacks: [
      'span[data-testid="spnSRPProdName"]',
      '[data-testid*="ProdName"]',
      '[class*="product-title"]',
    ],
  },

  // Product price (current/sale price)
  productPrice: {
    primary: 'div[data-testid="spnSRPProdPrice"]',
    fallbacks: [
      'span[data-testid="spnSRPProdPrice"]',
      '[data-testid*="ProdPrice"]',
      '[class*="product-price"]',
    ],
  },

  // Original price (before discount)
  originalPrice: {
    primary: 'div[data-testid="spnSRPProdSlashPrice"]',
    fallbacks: [
      'span[data-testid="spnSRPProdSlashPrice"]',
      '[data-testid*="SlashPrice"]',
      '[class*="original-price"]',
      '[class*="slash-price"]',
    ],
  },

  // Discount percentage
  discount: {
    primary: 'div[data-testid="spnSRPProdDiscount"]',
    fallbacks: [
      'span[data-testid="spnSRPProdDiscount"]',
      '[data-testid*="Discount"]',
      '[class*="discount-badge"]',
    ],
  },

  // Product rating (star value)
  productRating: {
    primary: 'div[data-testid="spnSRPProdRating"]',
    fallbacks: [
      'span[data-testid="spnSRPProdRating"]',
      '[data-testid*="ProdRating"]',
      '[class*="rating-text"]',
    ],
  },

  // Rating count (number of reviews)
  ratingCount: {
    primary: 'div[data-testid="spnSRPProdReview"]',
    fallbacks: [
      'span[data-testid="spnSRPProdReview"]',
      '[data-testid*="Review"]',
      '[class*="review-count"]',
    ],
  },

  // Shop location
  shopLocation: {
    primary: 'span[data-testid="spnSRPProdLocation"]',
    fallbacks: [
      'div[data-testid="spnSRPProdLocation"]',
      '[data-testid*="Location"]',
      '[class*="shop-location"]',
    ],
  },

  // Shop name
  shopName: {
    primary: 'span[data-testid="spnSRPProdShop"]',
    fallbacks: [
      'div[data-testid="spnSRPProdShop"]',
      '[data-testid*="ProdShop"]',
      '[class*="shop-name"]',
    ],
  },

  // Product image
  productImage: {
    primary: 'img[data-testid="imgSRPProdMain"]',
    fallbacks: [
      'img[data-testid="master-product-card-image"]',
      '[data-testid*="img"] img',
      '[class*="product-image"] img',
    ],
  },

  // Sold count
  soldCount: {
    primary: 'span[data-testid="spnSRPProdSold"]',
    fallbacks: [
      'div[data-testid="spnSRPProdSold"]',
      '[data-testid*="Sold"]',
      '[class*="sold-count"]',
    ],
  },

  // Product link
  productLink: {
    primary: 'a[data-testid="lnkProductCard"]',
    fallbacks: [
      'a[data-testid="master-product-card-link"]',
      'a[href*="/product/"]',
      'a[href*="-i."]', // Tokopedia product URL pattern
    ],
  },

  // Search results container
  searchResults: {
    primary: 'div[data-testid="divSRPContentProducts"]',
    fallbacks: [
      '[data-testid*="ContentProducts"]',
      '[class*="search-result"]',
    ],
  },

  // Pagination / Load more
  loadMore: {
    primary: 'button[data-testid="btnSRPLoadMore"]',
    fallbacks: [
      '[data-testid*="LoadMore"]',
      '[class*="load-more"]',
    ],
  },

  // Total results count
  totalResults: {
    primary: 'div[data-testid="divSRPTotalResult"]',
    fallbacks: [
      '[data-testid*="TotalResult"]',
      '[data-testid*="total"]',
    ],
  },
};

/**
 * Get all selector variants for a field
 * Returns array with primary first, then fallbacks
 */
export function getSelectorVariants(fieldName) {
  const field = SELECTORS[fieldName];
  if (!field) return [];
  return [field.primary, ...(field.fallbacks || [])];
}

/**
 * Build a combined CSS selector string for querySelectorAll
 */
export function getCombinedSelector(fieldName) {
  return getSelectorVariants(fieldName).join(', ');
}

export default SELECTORS;
