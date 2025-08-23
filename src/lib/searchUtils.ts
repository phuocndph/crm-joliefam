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

// Calculate search relevance score
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
  
  searchWords.forEach(word => {
    const normalizedWord = removeAccents(word);
    let wordScore = 0;
    
    // Exact matches in SKU (highest priority)
    if (productSku.includes(normalizedWord)) {
      wordScore += 20;
      if (productSku === normalizedWord) wordScore += 10; // Exact SKU match
    }
    
    // Exact matches in product name
    if (productName.includes(normalizedWord)) {
      wordScore += 15;
      if (productName.startsWith(normalizedWord)) wordScore += 5; // Name starts with word
    }
    
    // Word boundary matches (better than substring)
    const wordBoundaryRegex = new RegExp(`\\b${normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    if (wordBoundaryRegex.test(productName)) wordScore += 10;
    if (wordBoundaryRegex.test(productSku)) wordScore += 12;
    
    // Category matches
    if (productCategory.includes(normalizedWord)) wordScore += 8;
    
    // Description and specifications matches
    if (productDesc.includes(normalizedWord)) wordScore += 5;
    if (productSpecs.includes(normalizedWord)) wordScore += 6;
    
    // Fuzzy matches (lower priority)
    if (fuzzyMatch(productName, normalizedWord)) wordScore += 3;
    if (fuzzyMatch(productSku, normalizedWord)) wordScore += 4;
    
    // Character sequence matches (for partial typing)
    const allText = `${productName} ${productSku} ${productCategory}`.replace(/\s+/g, '');
    if (allText.includes(normalizedWord.replace(/\s+/g, ''))) wordScore += 2;
    
    if (wordScore > 0) {
      matchedWords++;
      score += wordScore;
    }
  });
  
  // Bonus for matching all search words
  if (matchedWords === searchWords.length && searchWords.length > 1) {
    score += 15;
  }
  
  // Bonus for short, exact matches
  if (searchWords.length === 1 && (productSku === removeAccents(searchWords[0]) || productName === removeAccents(searchWords[0]))) {
    score += 25;
  }
  
  return score;
};

// Enhanced search hook with debouncing and sorting
export const useProductSearch = (products: SearchableProduct[], searchTerm: string, debounceMs = 300) => {
  return useMemo(() => {
    if (!searchTerm.trim()) {
      // When no search, group by category and sort by SKU within each category
      const grouped = products.reduce((acc, product) => {
        const category = product.category || 'Khác';
        if (!acc[category]) acc[category] = [];
        acc[category].push(product);
        return acc;
      }, {} as Record<string, SearchableProduct[]>);
      
      // Sort categories and products within categories
      Object.keys(grouped).forEach(category => {
        grouped[category].sort((a, b) => {
          const skuA = a.sku || '';
          const skuB = b.sku || '';
          return skuA.localeCompare(skuB, 'vi', { numeric: true });
        });
      });
      
      return {
        results: products.sort((a, b) => {
          // Sort by category first, then by SKU
          const categoryCompare = (a.category || 'Khác').localeCompare(b.category || 'Khác', 'vi');
          if (categoryCompare !== 0) return categoryCompare;
          return (a.sku || '').localeCompare(b.sku || '', 'vi', { numeric: true });
        }),
        groupedResults: grouped,
        hasSearch: false,
        resultCount: products.length
      };
    }
    
    // When searching, calculate scores and sort by relevance
    const scoredProducts = products
      .map(product => ({
        ...product,
        searchScore: calculateSearchScore(product, searchTerm)
      }))
      .filter(product => product.searchScore > 0)
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
    
    // Group search results by category but maintain relevance order within groups
    const groupedResults = scoredProducts.reduce((acc, product) => {
      const category = product.category || 'Khác';
      if (!acc[category]) acc[category] = [];
      acc[category].push(product);
      return acc;
    }, {} as Record<string, SearchableProduct[]>);
    
    return {
      results: scoredProducts,
      groupedResults,
      hasSearch: true,
      resultCount: scoredProducts.length
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