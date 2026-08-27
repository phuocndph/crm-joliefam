// Advanced search utilities for Vietnamese product search
import { useMemo } from 'react';

export interface SearchableProduct {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  specifications: string | null;
  price: number | null;
}

// Remove Vietnamese accents for better search matching
export const removeAccents = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
};

// Advanced fuzzy matching with Vietnamese support
export const fuzzyMatch = (text: string, pattern: string): boolean => {
  if (!pattern) return true;
  if (!text) return false;
  
  const normalizedText = removeAccents(text.toLowerCase());
  const normalizedPattern = removeAccents(pattern.toLowerCase());
  
  let patternIdx = 0;
  let textIdx = 0;
  
  while (textIdx < normalizedText.length && patternIdx < normalizedPattern.length) {
    if (normalizedText[textIdx] === normalizedPattern[patternIdx]) {
      patternIdx++;
    }
    textIdx++;
  }
  
  return patternIdx === normalizedPattern.length;
};

// Calculate search relevance score with stricter matching
export const calculateSearchScore = (product: SearchableProduct, searchTerm: string): number => {
  if (!searchTerm.trim()) return 0;
  
  const searchWords = searchTerm.toLowerCase().trim().split(/\s+/);
  const productName = removeAccents(product.name.toLowerCase());
  const productSku = removeAccents((product.sku || '').toLowerCase());
  const productCategory = removeAccents((product.category || '').toLowerCase());
  const productDesc = removeAccents((product.description || '').toLowerCase());
  const productSpecs = removeAccents((product.specifications || '').toLowerCase());
  
  let score = 0;
  let matchedWords = 0;
  let exactMatches = 0;
  
  searchWords.forEach(word => {
    const normalizedWord = removeAccents(word);
    let wordScore = 0;
    let hasExactMatch = false;
    
    // Very high priority for exact SKU matches
    if (productSku === normalizedWord) {
      wordScore += 50;
      hasExactMatch = true;
      exactMatches++;
    } else if (productSku.includes(normalizedWord)) {
      wordScore += 25;
    }
    
    // High priority for exact name word matches
    const nameWords = productName.split(/\s+/);
    if (nameWords.includes(normalizedWord)) {
      wordScore += 40;
      hasExactMatch = true;
      exactMatches++;
    } else if (productName.includes(normalizedWord)) {
      // Only partial matches if word is significant length (3+ chars)
      if (normalizedWord.length >= 3) {
        wordScore += 20;
        if (productName.startsWith(normalizedWord)) wordScore += 5;
      }
    }
    
    // Exact word boundary matches (whole words only)
    const wordBoundaryRegex = new RegExp(`\\b${normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (wordBoundaryRegex.test(productName)) {
      wordScore += 15;
      hasExactMatch = true;
    }
    if (wordBoundaryRegex.test(productSku)) {
      wordScore += 18;
      hasExactMatch = true;
    }
    
    // Category matches (only for significant words)
    if (normalizedWord.length >= 3 && productCategory.includes(normalizedWord)) {
      wordScore += 10;
    }
    
    // Description matches (lower priority, only for longer words)
    if (normalizedWord.length >= 4) {
      if (productDesc.includes(normalizedWord)) wordScore += 5;
      if (productSpecs.includes(normalizedWord)) wordScore += 6;
    }
    
    // Only count meaningful matches
    if (wordScore > 0) {
      matchedWords++;
      score += wordScore;
    }
    
    // Penalty for very short words with no exact matches
    if (normalizedWord.length <= 2 && !hasExactMatch) {
      wordScore = Math.max(0, wordScore - 10);
    }
  });
  
  // Require all search words to have some match
  if (matchedWords < searchWords.length) {
    return 0;
  }
  
  // Big bonus for having exact matches for most search words
  const exactMatchRatio = exactMatches / searchWords.length;
  if (exactMatchRatio >= 0.7) {
    score += 30;
  }
  
  // Bonus for matching all search words with high relevance
  if (matchedWords === searchWords.length && searchWords.length > 1) {
    score += 20;
  }
  
  // Bonus for exact complete matches
  const searchPhrase = removeAccents(searchTerm.toLowerCase());
  if (productName === searchPhrase || productSku === searchPhrase) {
    score += 40;
  }
  
  // Penalty for products with too many unrelated words
  const productWordCount = productName.split(/\s+/).length;
  const searchWordCount = searchWords.length;
  if (productWordCount > searchWordCount * 3) {
    score = Math.max(0, score - 10);
  }
  
  return score;
};

// Define the product category hierarchy and order
const CATEGORY_ORDER = [
  'GA CHUN LTH TRẮNG SỌC',
  'GA CHUN T200 TRẮNG TRƠN',
  'GA CHUN T250 TRẮNG TRƠN',
  'GA CHUN T250 TRẮNG SỌC',
  'GA CHUN T300 TRẮNG TRƠN',
  'GA CHUN T300 TRẮNG SỌC',
  'GA CHUN T350 TRẮNG SỌC',
  'GA CHUN T400 TRẮNG TRƠN',
  'GA TẤM PHỦ LTH',
  'GA TẤM PHỦ T200 TRƠN',
  'GA TẤM PHỦ T250 TRƠN',
  'GA TẤM PHỦ T250 SỌC',
  'GA TẤM PHỦ T300 TRƠN',
  'GA TẤM PHỦ T300 SỌC',
  'GA TẤM PHỦ T350 SỌC',
  'GA TẤM PHỦ T400 TRƠN',
  'VỎ GỐI',
  'VỎ CHĂN LTH SỌC',
  'VỎ CHĂN CHẦN LTH SỌC',
  'CHĂN HÈ CHẦN LTH SỌC',
  'VỎ CHĂN T200 TRƠN',
  'VỎ CHĂN CHẦN T200 TRƠN',
  'CHĂN HÈ T200 TRƠN',
  'VỎ CHĂN T250 TRƠN',
  'CHĂN CHẦN T250 TRƠN',
  'CHĂN HÈ T250 TRƠN',
  'VỎ CHĂN T250 SỌC',
  'VỎ CHĂN CHẦN T250 SỌC',
  'CHĂN HÈ T250 SỌC',
  'VỎ CHĂN T300 TRƠN',
  'VỎ CHĂN CHẦN T300 TRƠN',
  'CHĂN HÈ T300 TRƠN',
  'VỎ CHĂN T300 SỌC',
  'VỎ CHĂN CHẦN T300 SỌC',
  'CHĂN HÈ T300 SỌC',
  'VỎ CHĂN T350 SỌC',
  'VỎ CHĂN CHẦN T350 SỌC',
  'CHĂN HÈ T350 SỌC',
  'VỎ CHĂN T400 TRƠN',
  'VỎ CHĂN CHẦN T400 TRƠN',
  'CHĂN HÈ T400 TRƠN',
  'RUỘT CHĂN 10OZ',
  'BVD CHỐNG THẤM',
  'BVD THƯỜNG',
  'RUỘT CHĂN MICROFIBE VẢI BÓNG',
  'ĐỆM LÒ XO ELAN',
  'TOPPER MICROFIBER',
  'TOPPER THƯỜNG',
  'TẤM TRANG TRÍ + GỐI',
  'RUỘT GỐI',
  'KHĂN TẮM + KHĂN MẶT DỆT',
  'KHĂN TẮM + KHĂN MẶT TRƠN',
  'ĐỆM CAO SU TỔNG HỢP',
  'ĐỆM LÒ XO TÚI ĐỘC LẬP VIKOSAN',
  'ĐỆM BÔNG ÉP MIX FOARM',
  'ĐỆM BÔNG ÉP CỨNG'
];

// Function to get category order index
const getCategoryOrderIndex = (category: string | null): number => {
  if (!category) return 9999;
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? 9999 : index;
};

// Enhanced search hook with improved relevance filtering
export const useProductSearch = (products: SearchableProduct[], searchTerm: string, debounceMs = 300) => {
  return useMemo(() => {
    if (!searchTerm.trim()) {
      // When no search, group by category and sort by predefined order
      const grouped = products.reduce((acc, product) => {
        const category = product.category || 'Khác';
        if (!acc[category]) acc[category] = [];
        acc[category].push(product);
        return acc;
      }, {} as Record<string, SearchableProduct[]>);
      
      // Sort categories by predefined order and products within categories by SKU
      Object.keys(grouped).forEach(category => {
        grouped[category].sort((a, b) => {
          const skuA = a.sku || '';
          const skuB = b.sku || '';
          return skuA.localeCompare(skuB, 'vi', { numeric: true });
        });
      });
      
      // Sort all products by category order first, then by SKU
      const sortedProducts = products.sort((a, b) => {
        const categoryOrderA = getCategoryOrderIndex(a.category);
        const categoryOrderB = getCategoryOrderIndex(b.category);
        
        if (categoryOrderA !== categoryOrderB) {
          return categoryOrderA - categoryOrderB;
        }
        
        return (a.sku || '').localeCompare(b.sku || '', 'vi', { numeric: true });
      });
      
      // Create ordered grouped results
      const orderedGrouped: Record<string, SearchableProduct[]> = {};
      CATEGORY_ORDER.forEach(category => {
        if (grouped[category]) {
          orderedGrouped[category] = grouped[category];
        }
      });
      
      // Add any remaining categories not in the predefined order
      Object.keys(grouped).forEach(category => {
        if (!orderedGrouped[category]) {
          orderedGrouped[category] = grouped[category];
        }
      });
      
      return {
        results: sortedProducts,
        groupedResults: orderedGrouped,
        hasSearch: false,
        resultCount: products.length
      };
    }
    
    // When searching, calculate scores and apply relevance threshold
    const scoredProducts = products
      .map(product => ({
        ...product,
        searchScore: calculateSearchScore(product, searchTerm)
      }))
      .filter(product => {
        // Stricter filtering: require higher scores for more precise results
        const minScore = searchTerm.length <= 2 ? 25 : 15; // Much higher threshold
        return product.searchScore >= minScore;
      })
      .sort((a, b) => {
        // Primary sort: by score (descending)
        const scoreDiff = b.searchScore - a.searchScore;
        if (scoreDiff !== 0) return scoreDiff;
        
        // Secondary sort: by category
        const categoryCompare = (a.category || 'Khác').localeCompare(b.category || 'Khác', 'vi');
        if (categoryCompare !== 0) return categoryCompare;
        
        // Tertiary sort: by SKU
        return (a.sku || '').localeCompare(b.sku || '', 'vi', { numeric: true });
      });
    
    // Show all relevant results without limiting
    const topResults = scoredProducts;
    
    // Group search results by category but maintain relevance order within groups
    const groupedResults = topResults.reduce((acc, product) => {
      const category = product.category || 'Khác';
      if (!acc[category]) acc[category] = [];
      acc[category].push(product);
      return acc;
    }, {} as Record<string, SearchableProduct[]>);
    
    return {
      results: topResults,
      groupedResults,
      hasSearch: true,
      resultCount: topResults.length,
      totalMatches: scoredProducts.length // Track total matches before limiting
    };
  }, [products, searchTerm]);
};

// Highlight search terms in text
export const highlightSearchTerms = (text: string, searchTerm: string): string => {
  if (!searchTerm.trim()) return text;
  
  const words = searchTerm.trim().split(/\s+/);
  let result = text;
  
  words.forEach(word => {
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedWord})`, 'gi');
    result = result.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
  });
  
  return result;
};