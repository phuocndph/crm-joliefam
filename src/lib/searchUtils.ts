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

// One normalized phrase drives membership, scoring and complete-match bonuses.
export const normalizeProductSearch = (value: string): string =>
  removeAccents(value).toLowerCase().trim().replace(/\s+/g, ' ');

const scoreNormalizedProduct = (product: SearchableProduct, phrase: string): number => {
  if (!phrase) return 0;
  const words = phrase.split(' ');
  const name = normalizeProductSearch(product.name), sku = normalizeProductSearch(product.sku || '');
  const category = normalizeProductSearch(product.category || ''), description = normalizeProductSearch(product.description || ''), specifications = normalizeProductSearch(product.specifications || '');
  const nameWords = name.split(/\s+/);
  let score = 0, exactMatches = 0;
  for (const word of words) {
    let wordScore = 0;
    if (sku === word) { wordScore += 50; exactMatches++; }
    else if (sku.includes(word)) wordScore += 25;
    if (nameWords.includes(word)) { wordScore += 40; exactMatches++; }
    else if (word.length >= 2 && nameWords.some(part => part.startsWith(word))) wordScore += 25;
    else if (word.length >= 3 && name.includes(word)) wordScore += 20;
    const escaped = word.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');
    const boundary = new RegExp('\\b' + escaped + '\\b', 'i');
    if (boundary.test(name)) wordScore += 15;
    if (boundary.test(sku)) wordScore += 18;
    if (word.length >= 3 && category.includes(word)) wordScore += 10;
    if (word.length >= 4) {
      if (description.includes(word)) wordScore += 5;
      if (specifications.includes(word)) wordScore += 6;
    }
    // Every token must match; ranking never discards an otherwise valid name/SKU match.
    if (wordScore === 0) return 0;
    score += wordScore;
  }
  if (exactMatches / words.length >= 0.7) score += 30;
  if (words.length > 1) score += 20;
  if (name === phrase) score += 40;
  if (sku === phrase) score += 10000;
  return score;
};

export const calculateSearchScore = (product: SearchableProduct, searchTerm: string): number =>
  scoreNormalizedProduct(product, normalizeProductSearch(searchTerm));

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
export const searchProducts = (products: SearchableProduct[], searchTerm: string) => {
    const phrase = normalizeProductSearch(searchTerm);
    if (!phrase) {
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
      const sortedProducts = [...products].sort((a, b) => {
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
        searchScore: scoreNormalizedProduct(product, phrase)
      }))
      .filter(product => product.searchScore > 0)
      .sort((a, b) => {
        const exactSkuDiff = Number(normalizeProductSearch(b.sku || '') === phrase) - Number(normalizeProductSearch(a.sku || '') === phrase);
        if (exactSkuDiff) return exactSkuDiff;
        // Primary sort: by score (descending)
        const scoreDiff = b.searchScore - a.searchScore;
        if (scoreDiff !== 0) return scoreDiff;
        
        // Secondary sort: by category
        const categoryCompare = (a.category || 'Khác').localeCompare(b.category || 'Khác', 'vi');
        if (categoryCompare !== 0) return categoryCompare;
        
        // Tertiary sort: by SKU
        return (a.sku || '').localeCompare(b.sku || '', 'vi', { numeric: true }) || a.id.localeCompare(b.id);
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
};

export const useProductSearch = (products: SearchableProduct[], searchTerm: string) =>
  useMemo(() => searchProducts(products, searchTerm), [products, searchTerm]);

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