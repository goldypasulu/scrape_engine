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
      '[class*="product-card"]',
      '[class*="ProductCard"]',
    ],
  },

  // Product name
  productName: {
    primary: 'div[data-testid="spnSRPProdName"]',
    fallbacks: [
      'span[data-testid="spnSRPProdName"]',
      '[class*="product-title"]',
      '[class*="ProductTitle"]',
    ],
  },

  // Product price
  productPrice: {
    primary: 'div[data-testid="spnSRPProdPrice"]',
    fallbacks: [
      'span[data-testid="spnSRPProdPrice"]',
      '[class*="product-price"]',
      '[class*="ProductPrice"]',
    ],
  },

  // Product rating
  productRating: {
    primary: 'div[data-testid="spnSRPProdRating"]',
    fallbacks: [
      'span[data-testid="spnSRPProdRating"]',
      '[class*="product-rating"]',
      '[class*="rating-text"]',
    ],
  },

  // Shop location
  shopLocation: {
    primary: 'span[data-testid="spnSRPProdLocation"]',
    fallbacks: [
      'div[data-testid="spnSRPProdLocation"]',
      '[class*="shop-location"]',
      '[class*="ShopLocation"]',
    ],
  },

  // Shop name
  shopName: {
    primary: 'span[data-testid="spnSRPProdShop"]',
    fallbacks: [
      'div[data-testid="spnSRPProdShop"]',
      '[class*="shop-name"]',
    ],
  },

  // Product image
  productImage: {
    primary: 'img[data-testid="imgSRPProdMain"]',
    fallbacks: [
      'img[data-testid="master-product-card-image"]',
      '[class*="product-image"] img',
    ],
  },

  // Sold count
  soldCount: {
    primary: 'span[data-testid="spnSRPProdSold"]',
    fallbacks: [
      'div[data-testid="spnSRPProdSold"]',
      '[class*="sold-count"]',
    ],
  },

  // Product link
  productLink: {
    primary: 'a[data-testid="lnkProductCard"]',
    fallbacks: [
      'a[data-testid="master-product-card-link"]',
      'a[href*="/product/"]',
    ],
  },

  // Search results container
  searchResults: {
    primary: 'div[data-testid="divSRPContentProducts"]',
    fallbacks: [
      '[class*="search-result"]',
      '[class*="product-list"]',
    ],
  },

  // Pagination / Load more
  loadMore: {
    primary: 'button[data-testid="btnSRPLoadMore"]',
    fallbacks: [
      '[class*="load-more"]',
      'button[class*="pagination"]',
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
