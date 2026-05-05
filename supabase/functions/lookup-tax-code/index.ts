import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Module-level catalog cache — keyed by priceListId, persists across warm invocations
const DEFAULT_CATALOG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const catalogCacheMap = new Map<string, { products: any[]; timestamp: number }>();

// Module-level AI config cache
const configCache: { data: Record<string, string> | null; timestamp: number } = { data: null, timestamp: 0 };
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes default

function cleanModelName(name?: string | null): string {
  return name?.replace(/^google\//, '').trim() || '';
}

function invalidateAIConfigCache(reason = 'manual') {
  configCache.data = null;
  configCache.timestamp = 0;
  console.log(`AI Config cache invalidated (${reason})`);
}

async function loadAIConfig(supabaseClient: any, options?: { forceRefresh?: boolean }): Promise<Record<string, string>> {
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh && configCache.data && Date.now() - configCache.timestamp < CONFIG_CACHE_TTL) {
    return configCache.data;
  }
  try {
    const { data, error } = await supabaseClient
      .from('ai_config')
      .select('config_key, config_value');
    if (!error && data) {
      const map: Record<string, string> = {};
      for (const row of data) {
        map[row.config_key] = row.config_key.includes('_model')
          ? cleanModelName(row.config_value)
          : row.config_value;
      }
      configCache.data = map;
      configCache.timestamp = Date.now();
      console.log(`AI Config loaded: ${Object.keys(map).length} keys`);
      return map;
    }
  } catch (e) {
    console.warn('Failed to load AI config:', e);
  }
  return configCache.data || {};
}

// ==================== FIND CLOSEST PRODUCT (v2 — segment-scoped) ====================

function removeVietnameseTones(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function extractSizeDimensions(text: string): number[] {
  const normalized = removeVietnameseTones(text);
  const dims: number[] = [];
  const matches = normalized.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/g);
  if (matches) {
    for (const m of matches) {
      const parts = m.split(/x/i).map(Number);
      dims.push(...parts);
    }
  }
  return dims;
}

const PRODUCT_TYPE_KEYWORDS = [
  'chan he', 'chan dong', 'vo chan', 'ga chun', 'ga phu', 'ga goi',
  'vo goi', 'goi trang tri', 'bao ve nem', 'bvn', 'tam trang tri',
  'tham chan', 'tham', 'khan tam', 'khan mat', 'chan', 'ga', 'goi',
  'drap', 'rap', 'nem', 'ruot chan', 'ruot goi', 'ao goi',
];

function getProductType(text: string): string {
  const norm = removeVietnameseTones(text);
  for (const kw of PRODUCT_TYPE_KEYWORDS) {
    if (norm.includes(kw)) return kw;
  }
  return '';
}

const MATERIAL_KEYWORDS = ['t200', 't250', 't300', 't350', 't400', 't500', 'lth', 'tencel', 'mcr', 'modal', 'satin'];

function getMaterial(text: string): string {
  const norm = removeVietnameseTones(text);
  for (const mat of MATERIAL_KEYWORDS) {
    if (norm.includes(mat)) return mat;
  }
  return '';
}

function getPattern(text: string): string {
  const norm = removeVietnameseTones(text);
  if (norm.includes('soc') || norm.includes('ke')) return 'soc';
  if (norm.includes('tron')) return 'tron';
  return '';
}

interface MatchResult {
  product: any;
  score: number;
  matchQuality: 'exact' | 'fallback_size' | 'fallback_product' | 'uncertain';
}

function findClosestProductScoped(
  itemName: string,
  candidates: any[],
  allProducts: any[],
  constraints?: { material?: string; pattern?: string }
): MatchResult | null {
  if (!itemName) return null;

  const itemType = getProductType(itemName);
  const itemMaterial = constraints?.material?.toLowerCase() || getMaterial(itemName);
  const itemPattern = constraints?.pattern === 'sọc' ? 'soc' : (constraints?.pattern === 'trơn' ? 'tron' : getPattern(itemName));
  const itemDims = extractSizeDimensions(itemName);
  const itemNorm = removeVietnameseTones(itemName);

  function scoreProduct(product: any): { score: number; quality: 'exact' | 'fallback_size' | 'fallback_product' | 'uncertain' } {
    const prodName = product.name || '';
    const prodSpec = product.specifications || '';
    const fullText = prodName + ' ' + prodSpec;
    const prodType = getProductType(fullText);
    const prodMaterial = getMaterial(fullText);
    const prodPattern = getPattern(fullText);
    const prodDims = extractSizeDimensions(fullText);
    const prodNorm = removeVietnameseTones(fullText);

    let score = 0;
    let sizeExact = false;

    // Product type match (most important: 15pts)
    if (itemType && prodType && itemType === prodType) {
      score += 15;
    } else if (itemType && prodType) {
      const itemWords = itemNorm.split(/\s+/);
      const prodWords = prodNorm.split(/\s+/);
      const commonWords = itemWords.filter(w => w.length > 2 && prodWords.includes(w));
      score += Math.min(commonWords.length * 2, 6);
    }

    // Material match (10pts) — HARD RULE: mismatched material = heavy penalty
    if (itemMaterial && prodMaterial) {
      if (itemMaterial === prodMaterial || (itemMaterial === 'lth' && prodMaterial === 't225') || (itemMaterial === 't225' && prodMaterial === 'lth')) {
        score += 10;
      } else {
        // HARD PENALTY: different material (e.g. T300 vs T250)
        score -= 20;
      }
    } else if (itemMaterial && !prodMaterial) {
      score -= 5; // product doesn't specify material
    }

    // Pattern match (7pts) — HARD RULE: mismatched pattern = penalty
    if (itemPattern && prodPattern) {
      if (itemPattern === prodPattern) {
        score += 7;
      } else {
        score -= 15; // sọc vs trơn mismatch
      }
    }

    // Size proximity — prefer LARGER or equal sizes (5pts max)
    if (itemDims.length > 0 && prodDims.length > 0) {
      const mainItemDim = Math.max(...itemDims);
      const mainProdDim = Math.max(...prodDims);
      if (mainProdDim === mainItemDim) {
        score += 5;
        sizeExact = true;
      } else if (mainProdDim > mainItemDim) {
        const diff = mainProdDim - mainItemDim;
        score += Math.max(0, 4 - diff / 30);
      } else {
        score += 1;
      }
    }

    let quality: 'exact' | 'fallback_size' | 'fallback_product' | 'uncertain' = 'uncertain';
    if (score >= 30) {
      quality = sizeExact ? 'exact' : 'fallback_size';
    } else if (score >= 15) {
      quality = 'fallback_product';
    }

    return { score, quality };
  }

  // Step 1: Score candidates first
  let bestProduct: any = null;
  let bestScore = -Infinity;
  let bestQuality: 'exact' | 'fallback_size' | 'fallback_product' | 'uncertain' = 'uncertain';

  for (const product of candidates) {
    const { score, quality } = scoreProduct(product);
    if (score > bestScore) {
      bestScore = score;
      bestProduct = product;
      bestQuality = quality;
    }
  }

  // Step 2: If no good match in candidates, try allProducts but with warnings
  if (bestScore < 10 && allProducts.length > candidates.length) {
    console.log(`  findClosestProductScoped: candidates score too low (${bestScore}), trying full catalog for "${itemName}"`);
    for (const product of allProducts) {
      const { score, quality } = scoreProduct(product);
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
        bestQuality = 'fallback_product'; // always fallback when from full catalog
      }
    }
  }

  if (!bestProduct || bestScore < 5) return null;

  // Patch 15: if product name fully contains "type + material + size" key, treat as exact
  try {
    const dimsKey = itemDims.length > 0 ? itemDims.join('x') : '';
    const itemKey = removeVietnameseTones(`${itemType || ''} ${itemMaterial || ''} ${dimsKey}`)
      .replace(/\s+/g, ' ').trim();
    const prodKey = removeVietnameseTones(`${bestProduct.name || ''} ${bestProduct.specifications || ''}`)
      .replace(/\s+/g, ' ').trim();
    if (itemKey && prodKey && itemKey.length >= 6 && prodKey.includes(itemKey)) {
      bestQuality = 'exact';
    }
  } catch (_) { /* ignore */ }

  return { product: bestProduct, score: bestScore, matchQuality: bestQuality };
}

// Legacy wrapper for backward compatibility
function findClosestProduct(itemName: string, allProducts: any[]): any | null {
  const result = findClosestProductScoped(itemName, allProducts, allProducts);
  return result?.product || null;
}

// ==================== SEGMENT-SCOPED CANDIDATE BUILDER ====================

function buildSegmentCandidates(segments: RequestSegment[], allProducts: any[], customTypeToCategory?: Record<string, string[]> | null): Map<number, any[]> {
  const candidateMap = new Map<number, any[]>();
  const effectiveMapping = customTypeToCategory || TYPE_TO_CATEGORY;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const cats = effectiveMapping[seg.type] || TYPE_TO_CATEGORY[seg.type] || [seg.type];

    // Filter by category
    let candidates = allProducts.filter(p => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return cats.some(c => cat.includes(c) || name.includes(c));
    });

    // Narrow by material
    if (seg.needsFabric && seg.material) {
      const matLower = seg.material.toLowerCase();
      const narrowed = candidates.filter(p => {
        const cat = (p.category || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        return cat.includes(matLower) || name.includes(matLower);
      });
      if (narrowed.length > 0) candidates = narrowed;
    }

    // Narrow by pattern
    if (seg.pattern) {
      const patLower = seg.pattern.toLowerCase();
      const narrowed = candidates.filter(p => {
        const cat = (p.category || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        return cat.includes(patLower) || name.includes(patLower);
      });
      if (narrowed.length > 0) candidates = narrowed;
    }

    candidateMap.set(i, candidates);
    console.log(`  Segment ${i} "${seg.type}" (${seg.material} ${seg.pattern}): ${candidates.length} candidates`);
  }

  return candidateMap;
}

// ==================== POST-VALIDATION ====================

interface ValidationResult {
  items: any[];
  warnings: string[];
  segmentMatches: { segmentIdx: number; itemIdx: number; quality: string }[];
}

function validateAndRepairItems(
  items: any[],
  segments: RequestSegment[],
  candidateMap: Map<number, any[]>,
  allProducts: any[],
  validProductIds: Set<string>
): ValidationResult {
  const warnings: string[] = [];
  const segmentMatches: { segmentIdx: number; itemIdx: number; quality: string }[] = [];
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Patch 14: track segments already assigned so 1 item maps to 1 segment when possible
  const usedSegments = new Set<number>();

  // For each item, validate and repair
  for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
    const item = items[itemIdx];
    const id = item.matchedProductId;
    const isValidUUID = id && UUID_REGEX.test(id);
    const existsInCatalog = isValidUUID && validProductIds.has(id);

    // Try to find which segment this item belongs to
    let bestSegIdx = -1;
    if (segments.length > 0) {
      const itemNorm = removeVietnameseTones(item.customName || '');
      const itemType = getProductType(item.customName || '');
      let bestSegScore = -1;
      let bestSegIdxFallback = -1;
      let bestSegScoreFallback = -1;
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        const segNorm = removeVietnameseTones(seg.type);
        const segType = getProductType(seg.type);
        let score = 0;
        
        // Exact type match gets highest priority (weighted by type length to prefer longer/more specific matches)
        if (itemType && segType && itemType === segType) {
          score += 10 + segNorm.length;
        } else if (itemNorm.includes(segNorm)) {
          // Partial text match — but penalize short matches to avoid "chan" matching "chăn hè" etc.
          score += segNorm.length;
        }
        // Material match
        if (seg.material && itemNorm.includes(seg.material.toLowerCase())) score += 3;
        // Size match
        if (seg.size && itemNorm.includes(seg.size)) score += 2;
        // Patch 14: prefer unused segments; fallback to used only if no unused matches
        if (!usedSegments.has(si)) {
          if (score > bestSegScore) {
            bestSegScore = score;
            bestSegIdx = si;
          }
        }
        if (score > bestSegScoreFallback) {
          bestSegScoreFallback = score;
          bestSegIdxFallback = si;
        }
      }
      // If no unused segment matched at all, fall back to the best (used) one
      if (bestSegIdx === -1) {
        bestSegIdx = bestSegIdxFallback;
      } else {
        usedSegments.add(bestSegIdx);
      }
    }

    if (!existsInCatalog) {
      // Need to repair — use segment candidates if available
      const candidates = bestSegIdx >= 0 ? (candidateMap.get(bestSegIdx) || []) : [];
      const constraints = bestSegIdx >= 0 ? { material: segments[bestSegIdx].material, pattern: segments[bestSegIdx].pattern } : undefined;

      console.warn(`⚠️ AI returned invalid/fake ID: "${id}" for "${item.customName}" — finding scoped match (seg=${bestSegIdx}, candidates=${candidates.length})`);

      const match = findClosestProductScoped(item.customName || '', candidates, allProducts, constraints);
      if (match) {
        const oldId = item.matchedProductId;
        item.matchedProductId = match.product.id;
        item.price = match.product.price || item.price;
        item.matchQuality = match.matchQuality;
        item.note = (item.note ? item.note + '. ' : '') + `Auto-match: ${match.product.name} (SP gốc không tìm thấy chính xác)`;
        console.log(`✅ Fixed: "${item.customName}" → ${match.product.name} (${match.product.id}) quality=${match.matchQuality} [was: ${oldId}]`);
      } else {
        item.matchQuality = 'uncertain';
        console.warn(`❌ No match found for "${item.customName}"`);
        warnings.push(`Không tìm thấy SP phù hợp cho "${item.customName}"`);
      }
    } else {
      // ID is valid — check if it belongs to the right segment
      if (bestSegIdx >= 0) {
        const candidates = candidateMap.get(bestSegIdx) || [];
        const isInCandidates = candidates.some(c => c.id === id);
        
        // Check if the item's product type matches the segment type
        const matchedProduct = allProducts.find(p => p.id === id);
        const itemType = getProductType(item.customName || '');
        const segType = getProductType(segments[bestSegIdx].type);
        const productType = matchedProduct ? getProductType(matchedProduct.name + ' ' + (matchedProduct.specifications || '')) : '';
        const typeMatchesSegment = itemType && segType && itemType === segType;
        const productMatchesItem = productType && itemType && productType === itemType;
        
        if (isInCandidates || (productMatchesItem && typeMatchesSegment)) {
          // Product is in candidates OR product type matches both item and segment — trust it
          // Patch 16: sanity check — reject if product type ≠ segment type, or price >5x median of candidates
          let priceOutlier = false;
          if (matchedProduct && candidates.length >= 2) {
            const prices = candidates.map((c: any) => Number(c.price) || 0).filter((p: number) => p > 0).sort((a, b) => a - b);
            if (prices.length >= 2) {
              const median = prices[Math.floor(prices.length / 2)];
              const myPrice = Number(matchedProduct.price) || 0;
              if (median > 0 && myPrice > median * 5) priceOutlier = true;
            }
          }
          const typeMismatchHard = matchedProduct && segType && productType && productType !== segType;

          if (priceOutlier || typeMismatchHard) {
            const seg = segments[bestSegIdx];
            const segCandidates = candidates.length > 0 ? candidates : allProducts;
            const constraints = { material: seg.material, pattern: seg.pattern };
            const match = findClosestProductScoped(item.customName || '', segCandidates, allProducts, constraints);
            if (match && match.product.id !== id) {
              const oldProduct = matchedProduct;
              item.matchedProductId = match.product.id;
              item.price = match.product.price || item.price;
              item.matchQuality = match.matchQuality;
              const reason = priceOutlier ? 'giá bất thường' : 'sai loại sản phẩm';
              item.note = (item.note ? item.note + '. ' : '') + `Sửa (${reason}): ${match.product.name} (thay ${oldProduct?.name || id})`;
              console.warn(`🔧 Sanity-fix [${reason}]: "${item.customName}" ${oldProduct?.name} → ${match.product.name}`);
              warnings.push(`"${item.customName}": AI chọn ${oldProduct?.name || 'SP sai'} (${reason}), đã thay bằng ${match.product.name}`);
            } else {
              item.matchQuality = 'fallback_product';
            }
          } else if (matchedProduct) {
            const constraints = { material: segments[bestSegIdx].material, pattern: segments[bestSegIdx].pattern };
            const result = findClosestProductScoped(item.customName || '', [matchedProduct], allProducts, constraints);
            item.matchQuality = result?.matchQuality || 'exact';
          } else {
            item.matchQuality = 'exact';
          }
        } else {
          // ID valid but NOT in correct segment candidates — likely wrong material/pattern
          const seg = segments[bestSegIdx];
          console.warn(`⚠️ Item "${item.customName}" has valid ID ${id} but NOT in segment ${bestSegIdx} candidates (${seg.type} ${seg.material} ${seg.pattern})`);

          // Re-match within correct candidates
          const segCandidates = candidates.length > 0 ? candidates : allProducts;
          const constraints = { material: seg.material, pattern: seg.pattern };
          const match = findClosestProductScoped(item.customName || '', segCandidates, allProducts, constraints);
          if (match && match.product.id !== id) {
            const oldProduct = allProducts.find(p => p.id === id);
            item.matchedProductId = match.product.id;
            item.price = match.product.price || item.price;
            item.matchQuality = match.matchQuality;
            item.note = (item.note ? item.note + '. ' : '') + `Sửa: ${match.product.name} (thay ${oldProduct?.name || id})`;
            console.log(`🔄 Corrected: "${item.customName}" → ${match.product.name} (was: ${oldProduct?.name})`);
            warnings.push(`"${item.customName}" đã được sửa từ ${oldProduct?.name || 'SP sai'} → ${match.product.name}`);
          } else {
            item.matchQuality = 'fallback_product';
          }
        }
      } else {
        item.matchQuality = 'exact'; // no segment context, trust AI
      }
    }

    if (bestSegIdx >= 0) {
      segmentMatches.push({ segmentIdx: bestSegIdx, itemIdx, quality: item.matchQuality || 'unknown' });
    }
  }

  // Check for missing segments
  if (segments.length > 0) {
    const matchedSegments = new Set(segmentMatches.map(m => m.segmentIdx));
    for (let si = 0; si < segments.length; si++) {
      if (!matchedSegments.has(si)) {
        const seg = segments[si];
        warnings.push(`Thiếu SP cho: ${seg.type} ${seg.material} ${seg.pattern} ${seg.size}`);
      }
    }
    if (items.length < segments.length) {
      warnings.push(`Hệ thống phát hiện ${segments.length} sản phẩm nhưng AI chỉ trả ${items.length}. Có thể thiếu sản phẩm.`);
    }
  }

  return { items, warnings, segmentMatches };
}

// ==================== SEGMENT PARSER ====================

interface RequestSegment {
  type: string;
  rawText: string;
  material: string;
  pattern: string;
  size: string;
  quantity: number;
  note: string;
  needsFabric: boolean;
}

const NAMED_MATERIALS: [RegExp, string][] = [
  [/\blth\b/i, 'LTH'],
  [/\bmcr\b/i, 'MCR'],
  [/\btencel\b/i, 'tencel'],
  [/\btici\b/i, 'tici'],
];

// Ordered product keyword detection (longer matches first)
const PRODUCT_KEYWORDS: [RegExp, string, boolean][] = [
  [/\bga\s*chun\s*chong\s*tham\b/i, 'ga chun chống thấm', false],
  [/\bga\s*chong\s*tham\b/i, 'ga chun chống thấm', false],
  [/\bga\s*ct\b/i, 'ga chun chống thấm', false],
  [/\bbao\s*ve\s*nem\s*chong\s*tham\b/i, 'bảo vệ nệm chống thấm', false],
  [/\bga\s*chun/i, 'ga chun', true],
  [/\bga\s*tam\s*phu/i, 'ga tấm phủ', true],
  [/\bga\s*phu/i, 'ga phủ', true],
  [/\bchan\s*he\s*chan/i, 'chăn hè chần', true],  // MUST be before "chan he"
  [/\bchan\s*he/i, 'chăn hè', true],
  [/\bvo\s*chan\s*chan/i, 'vỏ chăn chần', true],
  [/\bchan\s*dong/i, 'chăn đông', true],
  [/\bvo\s*chan/i, 'vỏ chăn', true],
  [/\bvo\s*goi\s*om/i, 'vỏ gối ôm', true],
  [/\bgoi\s*om/i, 'gối ôm', true],
  [/\bvo\s*goi/i, 'vỏ gối', true],
  [/\bgoi\s*trang\s*tri/i, 'gối trang trí', false],
  [/\btam\s*trang\s*tri/i, 'tấm trang trí', false],
  [/\bbao\s*ve\s*(nem|dem|n[eệ]m|d[eệ]m)/i, 'bảo vệ nệm', false],
  [/\bbvn/i, 'bảo vệ nệm', false],
  [/\bruot\s*chan/i, 'ruột chăn', false],
  [/\bruot\s*goi/i, 'ruột gối', false],
  [/\bao\s*choang/i, 'áo choàng', false],
  [/\bvay\s*(giuong)?/i, 'váy giường', false],
  [/\btopper/i, 'topper', false],
  [/\bkhan\s*(tam)?/i, 'khăn tắm', false],
  [/\bdem\b/i, 'đệm', false],
  [/\bnem\b/i, 'đệm', false],
  [/\brem\b/i, 'rèm', false],
  [/\bga\b/i, 'ga', true],
  [/\bgoi\b(?!\s*trang)/i, 'vỏ gối', true],
  [/\bchan\b/i, 'chăn', true],
  [/\bbo\s*\d+\s*mon/i, 'bộ', true],
  [/\bcombo/i, 'bộ', true],
];

function normalizeVN(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd');
}

// Smart pattern detection: "trang soc" = sọc (white + striped), NOT trơn
function detectPattern(text: string): string {
  const norm = text.toLowerCase();
  // "trang trí" is decoration, not a pattern — must be checked first
  if (/\btrang\s*tri\b/.test(norm)) return '';
  // Check "soc" or "ke" first — these are definitive
  if (/\b(soc|ke)\b/.test(norm)) return 'sọc';
  // "tron" or "trang tinh" = trơn
  if (/\b(tron|trang\s*tinh)\b/.test(norm)) return 'trơn';
  // "trang" alone (without "soc" nearby) = trơn (white = plain)
  if (/\btrang\b/.test(norm) && !/\bsoc\b/.test(norm) && !/\btri\b/.test(norm)) return 'trơn';
  return '';
}

// Detect material from text
function detectMaterial(text: string): string {
  const norm = text.toLowerCase();
  const matMatch = norm.match(/\bt\s*(\d{3})\b/i);
  if (matMatch) return 'T' + matMatch[1];
  for (const [re, name] of NAMED_MATERIALS) {
    if (re.test(norm)) return name;
  }
  return '';
}

// Parse section headers like "Vải T250 trắng sọc:" or "Vải T300 sọc"
interface SectionContext {
  material: string;
  pattern: string;
  startIdx: number;
  endIdx: number;
}

function parseSectionsFromRequest(normText: string): SectionContext[] {
  const sections: SectionContext[] = [];
  
  // Strategy: split by explicit separators FIRST, then find headers within each block
  // This prevents material leakage across separator boundaries (e.g. "---")
  
  // Find separator positions: "---", "- - -", double newline, etc.
  const separatorRegex = /-{2,}|={2,}/g;
  const separatorPositions: number[] = [];
  let sepMatch;
  while ((sepMatch = separatorRegex.exec(normText)) !== null) {
    separatorPositions.push(sepMatch.index);
  }
  
  // Build block boundaries from separators
  const blockBounds: { start: number; end: number }[] = [];
  if (separatorPositions.length === 0) {
    blockBounds.push({ start: 0, end: normText.length });
  } else {
    // Before first separator
    blockBounds.push({ start: 0, end: separatorPositions[0] });
    // Between separators
    for (let i = 0; i < separatorPositions.length; i++) {
      const sepEnd = normText.indexOf('\n', separatorPositions[i]);
      const blockStart = sepEnd >= 0 ? sepEnd + 1 : separatorPositions[i] + 3;
      const blockEnd = i < separatorPositions.length - 1 ? separatorPositions[i + 1] : normText.length;
      blockBounds.push({ start: blockStart, end: blockEnd });
    }
  }
  
  // Within each block, find header "vai t250/t300..." (colon optional)
  const headerRegex = /\b(?:vai\s+)?(?:t\s*\d{3}|lth|mcr|tencel|tici)\b[^:\n]*/gi;
  
  let lastMaterial = '';
  let lastPattern = '';
  
  for (const block of blockBounds) {
    const blockText = normText.substring(block.start, block.end);
    if (blockText.trim().length === 0) continue;
    
    // Try to find a header within this block
    headerRegex.lastIndex = 0;
    const hMatch = headerRegex.exec(blockText);
    
    let material = '';
    let pattern = '';
    let contentStart = block.start; // default: whole block is content
    
    if (hMatch) {
      material = detectMaterial(hMatch[0]);
      pattern = detectPattern(hMatch[0]);
      // Content starts after the header (skip colon if present)
      const afterHeader = hMatch.index + hMatch[0].length;
      const nextChar = blockText[afterHeader];
      contentStart = block.start + afterHeader + (nextChar === ':' ? 1 : 0);
    }
    
    // If no header found in this block, inherit from previous block
    if (!material) material = lastMaterial;
    if (!pattern) pattern = lastPattern;
    
    // Update carry-forward context
    if (material) lastMaterial = material;
    if (pattern) lastPattern = pattern;
    
    sections.push({
      material,
      pattern,
      startIdx: contentStart,
      endIdx: block.end,
    });
  }
  
  // If no sections created at all, use entire text
  if (sections.length === 0) {
    sections.push({
      material: '',
      pattern: '',
      startIdx: 0,
      endIdx: normText.length,
    });
  }
  
  console.log('Normalized text (first 300):', normText.substring(0, 300));
  
  return sections;
}

function parseRequestSegments(request: string): RequestSegment[] {
  const norm = normalizeVN(request);
  const segments: RequestSegment[] = [];

  // Step 0: Parse section headers to get material/pattern context per section
  const sections = parseSectionsFromRequest(norm);
  console.log('Parsed sections:', JSON.stringify(sections));

  // Build a set of header ranges to exclude from product keyword scanning
  const headerRanges: { start: number; end: number }[] = [];
  const headerRegex2 = /\b(?:vai\s+)?(?:t\s*\d{3}|lth|mcr|tencel|tici)\b[^:\n]*:?/gi;
  let hm;
  while ((hm = headerRegex2.exec(norm)) !== null) {
    headerRanges.push({ start: hm.index, end: hm.index + hm[0].length });
  }

  // Find all product keyword positions, excluding those inside headers
  const found: { idx: number; end: number; type: string; needsFabric: boolean }[] = [];
  for (const [regex, type, needsFabric] of PRODUCT_KEYWORDS) {
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    let m;
    while ((m = re.exec(norm)) !== null) {
      // Skip if inside a header range
      const inHeader = headerRanges.some(hr => m!.index >= hr.start && m!.index < hr.end);
      if (inHeader) continue;
      
      const overlaps = found.some(f => m!.index >= f.idx && m!.index < f.end);
      if (!overlaps) {
        found.push({ idx: m.index, end: m.index + m[0].length, type, needsFabric });
      }
    }
  }

  if (found.length === 0) return [];

  found.sort((a, b) => a.idx - b.idx);

  // Global fallback materials & patterns (from entire text, excluding headers)
  const globalMaterials: string[] = [];
  const globalPatterns: string[] = [];
  const matRegex = /\bt\s*(\d{3})\b/gi;
  let matMatch;
  while ((matMatch = matRegex.exec(norm)) !== null) {
    const inHeader = headerRanges.some(hr => matMatch!.index >= hr.start && matMatch!.index < hr.end);
    if (!inHeader) globalMaterials.push('T' + matMatch[1]);
  }
  for (const [re, name] of NAMED_MATERIALS) {
    if (re.test(norm)) globalMaterials.push(name);
  }
  const globalPat = detectPattern(norm);
  if (globalPat) globalPatterns.push(globalPat);

  // Split into chunks per product keyword — extend chunk BEFORE keyword to capture leading qty
  for (let i = 0; i < found.length; i++) {
    const prevEnd = i > 0 ? found[i - 1].end : 0;
    // Also check if prevEnd is inside a header — if so, use header end
    let chunkStart = prevEnd;
    for (const hr of headerRanges) {
      if (chunkStart >= hr.start && chunkStart < hr.end) {
        chunkStart = hr.end;
      }
    }
    // Don't go before the section start of this keyword's section
    const kwSection = sections.find(s => found[i].idx >= s.startIdx && found[i].idx < s.endIdx);
    if (kwSection && chunkStart < kwSection.startIdx) {
      chunkStart = kwSection.startIdx;
    }
    // Extend to just before next keyword or end of text, BUT bounded by section end
    let chunkEnd = i < found.length - 1 ? found[i + 1].idx : norm.length;
    // Don't extend chunk past current keyword's section boundary
    if (kwSection && chunkEnd > kwSection.endIdx) {
      chunkEnd = kwSection.endIdx;
    }
    // Leading text before the keyword (for qty detection)
    const leadingText = norm.substring(chunkStart, found[i].idx).trim();
    const chunk = norm.substring(found[i].idx, chunkEnd).trim();
    
    const fullChunk = (leadingText + ' ' + chunk).trim();

    // Size
    // 3rd dimension MUST have unit (p/f/cm) OR be attached without space.
    // This prevents "1m6x20 x10" being read as 3-dim size instead of "1m6x20" + qty 10.
    const sizeMatch = chunk.match(
      /(\d+\.?\d*)\s*[x×*]\s*(\d+\.?\d*)(?:[x×*](\d+\.?\d*)(p|f|cm)?|\s*[x×*]\s*(\d+\.?\d*)\s*(p|f|cm))?/i
    );
    let size = '';
    if (sizeMatch) {
      const dims = [sizeMatch[1], sizeMatch[2]];
      // Group 3 = attached 3rd dim (e.g. "20x200x10cm"), Group 5 = spaced 3rd dim with required unit (e.g. "20 x 200 x 10cm")
      const dim3 = sizeMatch[3] || sizeMatch[5];
      const unit3 = sizeMatch[4] || sizeMatch[6];
      if (dim3) {
        dims.push(dim3 + (unit3 ? 'cm' : ''));
      }
      size = dims.map(d => {
        const n = parseFloat(d.replace(/cm$/i, ''));
        if (d.match(/cm$/i)) return d;
        if (d.match(/(p|f)$/i)) return n + 'cm';
        return n < 10 ? String(Math.round(n * 100)) : String(Math.round(n));
      }).join('x');
    } else {
      // Fallback: Vietnamese mattress shorthand (1m6 / 1m8 / 2m / 2m2 / d200)
      const VN_SIZE_MAP: Record<string, string> = {
        '1m':   '100x190',
        '1m2':  '120x190',
        '1m4':  '140x200',
        '1m5':  '150x200',
        '1m6':  '160x200',
        '1m8':  '180x200',
        '2m':   '200x220',
        '2m2':  '200x220',
      };
      // Match standalone shorthand: "1m6" / "1 m 6" / "1m" etc.
      const vnMatch = chunk.match(/\b(1\s*m\s*[24568]?|2\s*m\s*2?)\b/i);
      if (vnMatch) {
        const key = vnMatch[1].replace(/\s+/g, '').toLowerCase();
        if (VN_SIZE_MAP[key]) {
          size = VN_SIZE_MAP[key];
        }
      }
      // Round mattress: d200 / D200
      if (!size) {
        const dMatch = chunk.match(/\bd\s*(\d{2,4})\b/i);
        if (dMatch) {
          size = 'D' + dMatch[1];
        }
      }
    }

    // Local material from chunk
    let localMaterial = '';
    // PRIORITY: "chống thấm" overrides any other material
    if (/\bchong\s*tham\b/i.test(chunk)) {
      localMaterial = 'chống thấm';
    } else {
      const localMatMatch = chunk.match(/\bt\s*(\d{3})\b/i);
      if (localMatMatch) localMaterial = 'T' + localMatMatch[1];
      for (const [re, name] of NAMED_MATERIALS) {
        if (re.test(chunk)) { localMaterial = name; break; }
      }
    }

    // Local pattern from chunk (using smart detection)
    const localPattern = detectPattern(chunk);

    // Quantity — check leading text first ("4c Vỏ chăn"), then inside chunk
    // "Nc" means N cái (shorthand), but avoid matching sizes like "12cm"
    let qty = 1;
    const qtyRegexes = [/(\d+)\s*c(?!\s*m)\b/i, /(\d+)\s*(cai|bo|chiec|cap|doi)\b/i];
    const leadingQtyMatch = leadingText.match(qtyRegexes[0]) || leadingText.match(qtyRegexes[1]);
    // Also check for bare leading number: "10 ga chun", "20 ruột gối"
    const leadingBareQtyMatch = !leadingQtyMatch ? leadingText.match(/^(\d+)\s*$/) : null;
    // Also check beginning of fullChunk for "N product_name" pattern
    const fullChunkBareQtyMatch = !leadingQtyMatch && !leadingBareQtyMatch ? fullChunk.match(/^(\d+)\s+\S/) : null;
    // Quantity must come AFTER the size, with explicit "x" or "c" prefix.
    // Strip the size from chunk first to avoid matching size dimensions as quantity.
    const chunkWithoutSize = sizeMatch
      ? chunk.replace(sizeMatch[0], ' ')
      : chunk;
    const chunkQtyMatch = chunkWithoutSize.match(/[x×]\s*(\d+)\s*$/)
      || chunkWithoutSize.match(qtyRegexes[0])
      || chunkWithoutSize.match(qtyRegexes[1]);
    
    
    
    if (leadingQtyMatch) {
      qty = parseInt(leadingQtyMatch[1]) || 1;
    } else if (leadingBareQtyMatch) {
      qty = parseInt(leadingBareQtyMatch[1]) || 1;
    } else if (fullChunkBareQtyMatch) {
      qty = parseInt(fullChunkBareQtyMatch[1]) || 1;
    } else if (chunkQtyMatch) {
      qty = parseInt(chunkQtyMatch[1]) || 1;
    }

    // Note
    let note = '';
    if (/hai\s*mat|2\s*mat/i.test(chunk)) note = 'hai mặt';

    segments.push({
      type: found[i].type,
      rawText: chunk,
      material: localMaterial,
      pattern: localPattern,
      size,
      quantity: qty,
      note,
      needsFabric: found[i].needsFabric,
      _pos: found[i].idx,  // store actual position for section mapping
    } as RequestSegment & { _pos: number });
  }

  // Assign material/pattern from SECTION CONTEXT using stored position (_pos)
  for (const seg of segments) {
    if (!seg.needsFabric) continue;

    // Find which section this segment belongs to using actual position
    const segPos = (seg as any)._pos ?? norm.indexOf(seg.rawText);
    const section = sections.find(s => segPos >= s.startIdx && segPos < s.endIdx);
    
    console.log(`  Section assign: "${seg.type}" pos=${segPos} → section=${section ? `${section.material}/${section.pattern} [${section.startIdx}-${section.endIdx}]` : 'NONE'} (already has material=${seg.material})`);

    if (!seg.material) {
      // If chunk has "chong tham", use it as material override (highest priority)
      if (/\bchong\s*tham\b/i.test(seg.rawText)) {
        seg.material = 'chống thấm';
      } else if (section && section.material) {
        seg.material = section.material;
      } else {
        // Global fallback
        const uniqueMats = [...new Set(globalMaterials)];
        if (uniqueMats.length > 0) seg.material = uniqueMats[0];
      }
    }
    if (!seg.pattern) {
      if (section && section.pattern) {
        seg.pattern = section.pattern;
      } else {
        const uniquePats = [...new Set(globalPatterns)];
        if (uniquePats.length > 0) seg.pattern = uniquePats[0];
      }
    }
  }

  console.log('Parsed segments:', JSON.stringify(segments.map(s => ({
    type: s.type, material: s.material, pattern: s.pattern, size: s.size, qty: s.quantity, fabric: s.needsFabric
  }))));

  return segments;
}

// ==================== DB FILTERING ====================

// Map segment type to DB category search terms
const TYPE_TO_CATEGORY: Record<string, string[]> = {
  'ga chun': ['ga chun'],
  'ga tấm phủ': ['ga tấm phủ', 'ga phủ'],
  'ga phủ': ['ga tấm phủ', 'ga phủ'],
  'ga': ['ga chun', 'ga tấm phủ', 'ga phủ'],
  'chăn hè chần': ['chăn hè'],
  'chăn hè': ['chăn hè'],
  'vỏ chăn chần': ['vỏ chăn chần'],
  'chăn đông': ['vỏ chăn chần'],
  'vỏ chăn': ['vỏ chăn'],
  'chăn': ['chăn'],
  'vỏ gối ôm': ['gối ôm'],
  'gối ôm': ['gối ôm'],
  'vỏ gối': ['gối'],
  'bảo vệ nệm': ['bảo vệ'],
  'khăn tắm': ['khăn'],
  'tấm trang trí': ['trang trí'],
  'gối trang trí': ['gối trang trí', 'trang trí'],
  'ruột chăn': ['ruột chăn'],
  'ruột gối': ['ruột gối'],
  'áo choàng': ['áo choàng'],
  'váy giường': ['váy'],
  'topper': ['topper'],
  'đệm': ['đệm'],
  'rèm': ['rem', 'rèm'],
  'bộ': ['bộ'],
};

// Build dynamic TYPE_TO_CATEGORY from DB config JSON
// Map technical TYPE keys to Vietnamese segment.type strings used by parseRequestSegments
const SEGMENT_TYPE_ALIASES: Record<string, string[]> = {
  'GA_CHUN':         ['ga chun', 'ga'],
  'GA_TAM_PHU':      ['ga tấm phủ', 'ga phủ', 'ga'],
  'CHAN_HE':         ['chăn hè chần', 'chăn hè'],
  'VO_CHAN':         ['vỏ chăn', 'chăn'],
  'VO_CHAN_CHAN':    ['vỏ chăn chần', 'chăn đông'],
  'BAO_VE_NEM':      ['bảo vệ nệm', 'bảo vệ'],
  'VO_GOI':          ['vỏ gối', 'gối'],
  'RUOT_CHAN':       ['ruột chăn'],
  'RUOT_GOI':        ['ruột gối'],
  'TOPPER':          ['topper'],
  'TAM_TRANG_TRI':   ['tấm trang trí'],
  'VAY_GIUONG':      ['váy giường', 'váy'],
  'KHAN':            ['khăn tắm', 'khăn'],
  'DEM':             ['đệm'],
  'DIVAN':           ['divan'],
  'AO_CHOANG_TAM':   ['áo choàng'],
};

function buildTypeToCategory(configJson: string | null): Record<string, string[]> | null {
  if (!configJson) return null;
  try {
    const parsed = JSON.parse(configJson);
    const mapping: Record<string, string[]> = {};
    const typeToCat = parsed?.TYPE_TO_CATEGORY || parsed;
    if (!typeToCat || typeof typeToCat !== 'object') return null;

    for (const key in typeToCat) {
      const entry = typeToCat[key];
      if (!entry || typeof entry !== 'object') continue;

      // 1) Collect main categories from level-1
      const mainCats: string[] = Array.isArray(entry.categories)
        ? entry.categories.map((c: string) => String(c).toLowerCase())
        : [];

      // 2) Collect categories from sub_types (merge into main set)
      const subTypeCats: string[] = [];
      if (entry.sub_types && typeof entry.sub_types === 'object') {
        for (const stKey in entry.sub_types) {
          const st = entry.sub_types[stKey];
          if (st && Array.isArray(st.categories)) {
            for (const c of st.categories) {
              subTypeCats.push(String(c).toLowerCase());
            }
          }
        }
      }

      // Final categories list = union of main + sub_types
      const allCats = [...new Set([...mainCats, ...subTypeCats])];
      if (allCats.length === 0) continue;

      // 3) Build keyword list:
      //    - exact_keywords (level-1)
      //    - fallback_keywords (level-1)
      //    - all keywords inside sub_types
      //    - segment-type aliases for the technical key (VO_GOI → "vỏ gối", "gối")
      const allKeywords: string[] = [];

      if (Array.isArray(entry.exact_keywords)) {
        for (const kw of entry.exact_keywords) allKeywords.push(String(kw).toLowerCase());
      }
      if (Array.isArray(entry.fallback_keywords)) {
        for (const kw of entry.fallback_keywords) allKeywords.push(String(kw).toLowerCase());
      }
      if (entry.sub_types && typeof entry.sub_types === 'object') {
        for (const stKey in entry.sub_types) {
          const st = entry.sub_types[stKey];
          if (st && Array.isArray(st.keywords)) {
            for (const kw of st.keywords) allKeywords.push(String(kw).toLowerCase());
          }
        }
      }

      // Aliases for technical key (so that parseRequestSegments output matches)
      const aliases = SEGMENT_TYPE_ALIASES[key] || [];
      for (const al of aliases) allKeywords.push(al.toLowerCase());

      // Also add the lowercased+spaced version of the key itself
      const keyNorm = key.toLowerCase().replace(/_/g, ' ');
      allKeywords.push(keyNorm);

      // Register all keywords → allCats
      for (const kw of [...new Set(allKeywords)]) {
        if (!kw) continue;
        if (!mapping[kw]) {
          mapping[kw] = allCats;
        } else {
          mapping[kw] = [...new Set([...mapping[kw], ...allCats])];
        }
      }
    }
    console.log(`buildTypeToCategory: built ${Object.keys(mapping).length} keyword mappings from DB config (with sub_types + aliases)`);
    return Object.keys(mapping).length > 0 ? mapping : null;
  } catch (e) {
    console.error('Error parsing TYPE_TO_CATEGORY config:', e);
    return null;
  }
}

function buildSkipCategories(configJson: string | null): string[] {
  if (!configJson) return [];
  try {
    const parsed = JSON.parse(configJson);
    const skipNode = parsed?.SKIP_CATEGORIES;
    if (!skipNode) return [];

    const cats: string[] = Array.isArray(skipNode.categories)
      ? skipNode.categories
      : Array.isArray(skipNode)
        ? skipNode
        : [];

    const normalized = cats
      .map(c => String(c).trim().toLowerCase())
      .filter(c => c.length > 0);

    if (normalized.length > 0) {
      console.log(`buildSkipCategories: ${normalized.length} skip categories loaded:`, normalized);
    }
    return normalized;
  } catch (e) {
    console.error('Error parsing SKIP_CATEGORIES config:', e);
    return [];
  }
}

function filterProductsBySegments(products: any[], segments: RequestSegment[], customTypeToCategory?: Record<string, string[]> | null): any[] {
  if (segments.length === 0) return products;

  const effectiveMapping = customTypeToCategory || TYPE_TO_CATEGORY;
  const resultSet = new Set<string>();
  const results: any[] = [];

  for (const seg of segments) {
    const cats = effectiveMapping[seg.type] || TYPE_TO_CATEGORY[seg.type] || [seg.type];

    // Step 1: Filter by category
    let segProducts = products.filter(p => {
      const cat  = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const id   = (p.id || '').toString().toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return cats.some(c => cat.includes(c) || name.includes(c) || id.includes(c) || desc.includes(c));
    });

    // Step 2: If needs fabric and has material, narrow
    if (seg.needsFabric && seg.material && segProducts.length > 20) {
      const matLower = seg.material.toLowerCase();
      const narrowed = segProducts.filter(p => {
        const cat  = (p.category || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        const id   = (p.id || '').toString().toLowerCase();
        const desc = (p.description || '').toLowerCase();
        return cat.includes(matLower) || name.includes(matLower) || id.includes(matLower) || desc.includes(matLower);
      });
      if (narrowed.length > 0) segProducts = narrowed;
    }

    // Step 3: Narrow by pattern
    if (seg.pattern && segProducts.length > 20) {
      const patLower = seg.pattern.toLowerCase();
      const narrowed = segProducts.filter(p => {
        const cat  = (p.category || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        const id   = (p.id || '').toString().toLowerCase();
        const desc = (p.description || '').toLowerCase();
        return cat.includes(patLower) || name.includes(patLower) || id.includes(patLower) || desc.includes(patLower);
      });
      if (narrowed.length > 0) segProducts = narrowed;
    }

    for (const p of segProducts) {
      if (!resultSet.has(p.id)) {
        resultSet.add(p.id);
        results.push(p);
      }
    }

    console.log(`Segment "${seg.type}" (${seg.material} ${seg.pattern}): ${segProducts.length} products`);
  }

  if (results.length === 0) {
    console.log(`Segment filter returned 0, falling back to category-only`);
    const allCats = segments.flatMap(s => effectiveMapping[s.type] || TYPE_TO_CATEGORY[s.type] || [s.type]);
    const fallback = products.filter(p => {
      const cat  = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const id   = (p.id || '').toString().toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return allCats.some(c => cat.includes(c) || name.includes(c) || id.includes(c) || desc.includes(c));
    });
    if (fallback.length > 0) return fallback;
    console.log(`Fallback also empty, returning full catalog`);
    return products;
  }
  // results has at least 1 — return as-is (no more "if < 5 return all" rule)

  return results;
}

// Legacy extractCategoryFilters — used when no segments detected
function extractCategoryFilters(request: string): { categories: string[]; materials: string[] } {
  const norm = normalizeVN(request);

  const categories: string[] = [];
  const mapping: [RegExp, string[]][] = [
    [/\bga\s*chun\b|\bgachun\b|\bga\s*chu\b/, ['ga chun']],
    [/\bga\s*phu\b|\bga\s*tam\s*phu\b/, ['ga tấm phủ', 'ga phủ']],
    [/\bga\b(?!\s*chun)(?!\s*phu)(?!\s*tam)/, ['ga chun', 'ga tấm phủ', 'ga phủ']],
    [/\bchan\s*he\b/, ['chăn hè chần']],
    [/\bvo\s*chan\s*chan\b/, ['vỏ chăn chần']],
    [/\bchan\s*dong\b/, ['vỏ chăn chần']],
    [/\bvo\s*chan\b(?!\s*chan)/, ['chăn']],
    [/\bchan\b(?!\s*he)(?!\s*dong)/, ['chăn']],
    [/\bvo\s*goi\s*om\b|\bgoi\s*om\b/, ['gối ôm']],
    [/\bvo\s*goi\b|\bgoi\s*nam\b|\bgoi\b(?!\s*om)(?!\s*trang)/, ['gối']],
    [/\bbvn\b|\bbao\s*ve\s*nem\b|\bbao\s*ve\b/, ['bảo vệ']],
    [/\bdem\b|\bnem\b/, ['đệm']],
    [/\btopper\b/, ['topper']],
    [/\bkhan\b/, ['khăn']],
    [/\btam\s*trang\s*tri\b/, ['trang trí']],
    [/\bgoi\s*trang\s*tri\b/, ['gối trang trí', 'trang trí']],
    [/\bvay\b/, ['váy']],
    [/\bao\s*choang\b/, ['áo choàng']],
    [/\bruot\s*chan\b/, ['ruột chăn']],
    [/\bruot\s*goi\b/, ['ruột gối']],
    [/\brem\b/, ['rem', 'rèm']],
    [/\bbo\s*\d+\s*mon\b|\bcombo\b/, ['bộ']],
  ];

  for (const [regex, cats] of mapping) {
    if (regex.test(norm)) categories.push(...cats);
  }

  const materials: string[] = [];
  const matMatch = norm.match(/\bt\s*(\d{3})\b/g);
  if (matMatch) {
    for (const m of matMatch) {
      materials.push(m.replace(/\s/g, '').toUpperCase());
    }
  }
  if (/\blth\b/.test(norm)) materials.push('LTH');
  if (/\bmcr\b/.test(norm)) materials.push('MCR');
  if (/\btencel\b/.test(norm)) materials.push('tencel');
  if (/\btici\b/.test(norm)) materials.push('tici');

  return { categories: [...new Set(categories)], materials: [...new Set(materials)] };
}

function filterProductsByCategory(products: any[], categories: string[], materials: string[]): any[] {
  if (categories.length === 0 && materials.length === 0) return products;

  let filtered = products;
  if (categories.length > 0) {
    filtered = products.filter(p => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return categories.some(pat => cat.includes(pat) || name.includes(pat) || desc.includes(pat));
    });
  }

  if (materials.length > 0 && filtered.length > 100) {
    const materialFiltered = filtered.filter(p => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      return materials.some(mat => cat.includes(mat.toLowerCase()) || name.includes(mat.toLowerCase()) || desc.includes(mat.toLowerCase()));
    });
    if (materialFiltered.length >= 30) filtered = materialFiltered;
  }

  if (filtered.length < 30) {
    console.log(`Category filter too narrow (${filtered.length} results), using full catalog`);
    return products;
  }

  return filtered;
}

const ORDER_ITEMS_SYSTEM_PROMPT = `Bạn là trợ lý chuyên trích xuất danh sách sản phẩm/dịch vụ từ đơn hàng, báo giá, hóa đơn Việt Nam.

QUY TẮC QUAN TRỌNG:
1. Đọc KỸ từng dòng sản phẩm, KHÔNG gộp hay bỏ sót dòng nào.
2. "name" = chỉ tên sản phẩm/dịch vụ chính xác, KHÔNG kèm kích thước/quy cách.
3. "specifications" = chỉ kích thước vật lý (dài x rộng x cao, mm, cm, m...). KHÔNG ghi quy cách, chất liệu, mô tả kỹ thuật.
4. "quantity" = số lượng CHÍNH XÁC từ dữ liệu gốc (số nguyên hoặc số thập phân). KHÔNG đoán, KHÔNG mặc định 1 nếu có số liệu rõ ràng.
5. "price" = đơn giá CHÍNH XÁC (số nguyên, đơn vị VNĐ). Chuyển đổi: "120.000" hoặc "120,000" = 120000. KHÔNG nhầm thành tiền với đơn giá.
6. KHÔNG tính thành tiền (quantity × price) vào trường price. Price chỉ là ĐƠN GIÁ.
7. Nếu có cột "Thành tiền" riêng, BỎ QUA cột đó, chỉ lấy cột "Đơn giá".

Trả về JSON thuần (không markdown, không giải thích, không bọc code block):
{"items": [{"name":"tên SP","specifications":"quy cách","quantity":1,"price":0}]}

Nếu không tìm thấy sản phẩm nào: {"items": []}`;


const BUYER_INFO_SYSTEM_PROMPT = `Bạn là trợ lý phân tích thông tin doanh nghiệp Việt Nam. Luôn trả về kết quả dưới dạng JSON với cấu trúc sau (không markdown, không giải thích thêm):
{
  "company_name": "tên công ty/cá nhân",
  "representative": "người đại diện",
  "position": "chức vụ (mặc định Giám đốc)",
  "address": "địa chỉ",
  "tax_code": "mã số thuế",
  "phone": "số điện thoại",
  "bank_name": "tên ngân hàng",
  "bank_account": "số tài khoản",
  "bank_holder": "chủ tài khoản"
}
Nếu không tìm thấy trường nào thì để chuỗi rỗng "". Chỉ trả JSON thuần, không bọc trong code block.`;

async function callAI(messages: any[], hasImage = false, modelOverride?: string, stepHint?: 'ocr' | 'text') {
  const BEEKNOEE_API_KEY = Deno.env.get("BEEKNOEE_API_KEY");

  if (!BEEKNOEE_API_KEY) {
    throw new Error("No AI API key configured (BEEKNOEE_API_KEY required)");
  }

  const model = cleanModelName(modelOverride) || "gemini-2.5-flash";
  const payload = { model, messages };
  const callStart = Date.now();

  // Direct Beeknoee with model chain (no Lovable AI)
  if (BEEKNOEE_API_KEY) {
    console.log(`Falling back to Beeknoee API (hasImage: ${hasImage}, step: ${stepHint || 'default'})...`);
    
    // Different model orders based on step to avoid 429 concurrent limit
    const fallbackModels = hasImage
      ? [
          { name: "gemini-2.5-flash-lite", timeout: 30000 },
          { name: "gemini-2.5-flash", timeout: 90000 },
        ]
      : [
          { name: "gemini-2.5-flash-lite", timeout: 30000 },
          { name: "gemini-2.5-flash", timeout: 55000 },
        ];
    const models = [
      { name: model, timeout: hasImage ? 45000 : 35000 },
      ...fallbackModels.filter(({ name }) => name !== model),
    ];
    console.log(`Beeknoee model chain: ${models.map(({ name }) => name).join(' -> ')}`);
    
    // Only 1 retry attempt (was 2), with shorter wait
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const { name: model, timeout } of models) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          const response = await fetch("https://platform.beeknoee.com/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${BEEKNOEE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, model }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            console.log(`AI response from: Beeknoee (${model}) (${Date.now() - callStart}ms)`);
            return parseAIResponse(await response.json());
          }

          const errText = await response.text();
          console.warn(`Beeknoee ${model} failed (${response.status}): ${errText.substring(0, 150)}`);
          if (response.status === 429) {
            // Short delay for concurrent limit
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (e) {
          console.warn(`Beeknoee ${model} error:`, e instanceof Error ? e.message : e);
        }
      }
      if (attempt === 0) {
        console.log("All models failed on first attempt, retrying after 2s...");
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  throw new Error("All AI providers failed");
}

function parseAIResponse(result: any) {
  const content = result.choices?.[0]?.message?.content || "";
  const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse AI response:", content);
    return { raw: content };
  }
}

// Helper: Convert Vietnamese text to URL slug
function toSlug(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Helper: Scrape masothue.com using Firecrawl for representative info
async function scrapeMasothue(taxCode: string, companyName: string): Promise<{ representative: string; phone: string; address: string }> {
  const result = { representative: "", phone: "", address: "" };
  
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) {
    console.log("FIRECRAWL_API_KEY not configured, skipping masothue.com");
    return result;
  }

  const slug = toSlug(companyName);
  const url = `https://masothue.com/${taxCode}-${slug}`;
  console.log("Scraping masothue.com via Firecrawl:", url);

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["html"],
        onlyMainContent: false,
        waitFor: 2000,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.log("Firecrawl error:", resp.status, errText);
      return result;
    }

    const data = await resp.json();
    const html = data?.data?.html || data?.html || "";
    console.log("Firecrawl HTML length:", html.length);

    if (!html) return result;

    // Extract representative
    const repMatch = html.match(/fa-user[\s\S]*?Người đại diện[\s\S]*?itemprop="name"[^>]*>([^<]+)</i) 
      || html.match(/Người đại diện<\/td>\s*<td[^>]*>[\s\S]*?itemprop="name"[^>]*>([^<]+)</i)
      || html.match(/Người đại diện[\s\S]{0,300}?<a[^>]*>([^<]+)<\/a>/i);
    if (repMatch?.[1]) {
      result.representative = repMatch[1].trim();
      console.log("masothue.com found representative:", result.representative);
    }
    
    // Extract phone
    const phoneMatch = html.match(/itemprop="telephone"[^>]*>\s*([^<]+)</i)
      || html.match(/fa-phone[\s\S]{0,300}?<a[^>]*>([^<]+)<\/a>/i);
    if (phoneMatch?.[1]) {
      result.phone = phoneMatch[1].trim();
    }
    
    // Extract address from masothue
    const addrMatch = html.match(/itemprop="address"[^>]*>([^<]+)</i);
    if (addrMatch?.[1]) {
      result.address = addrMatch[1].trim();
    }
  } catch (e) {
    console.log("Firecrawl masothue.com scrape failed:", e);
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, data } = await req.json();

    // ==================== TAX CODE LOOKUP ====================
    if (type === "tax_code") {
      const taxCode = data.toString().trim();
      console.log("Looking up tax code:", taxCode);

      let company_name = "";
      let representative = "";
      let address = "";
      let phone = "";
      let foundTaxCode = taxCode;

      // === Step 1: escodata.net ===
      try {
        console.log("Step 1: Trying escodata.net...");
        const escoResponse = await fetch(`https://escodata.net/api-mst/${taxCode}.htm`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (escoResponse.ok) {
          const escoResult = await escoResponse.json();
          if (escoResult.error === 0 && escoResult.data) {
            const d = escoResult.data;
            company_name = d.ten || d.name || "";
            representative = d.daidien || "";
            address = d.dc || d.address || "";
            phone = d.dt || "";
            foundTaxCode = d.mst || d.id || taxCode;
            console.log("escodata.net found:", company_name, "rep:", representative);
          }
        }
      } catch (e) {
        console.log("escodata.net failed:", e);
      }

      // === Step 2: If missing representative and we have company name, try masothue.com ===
      if (company_name && !representative) {
        console.log("Step 2: Missing representative, trying masothue.com enrichment...");
        const mstData = await scrapeMasothue(taxCode, company_name);
        if (mstData.representative) representative = mstData.representative;
        if (!phone && mstData.phone) phone = mstData.phone;
        if (!address && mstData.address) address = mstData.address;
      }

      // === Step 3: If Step 1 failed entirely, try VietQR then masothue.com ===
      if (!company_name) {
        console.log("Step 3: Falling back to VietQR...");
        let vietqrResponse: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
          vietqrResponse = await fetch(`https://api.vietqr.io/v2/business/${taxCode}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });
          if (vietqrResponse.status !== 429) break;
        }

        if (vietqrResponse?.ok) {
          const result = await vietqrResponse.json();
          if (result.code === "00" && result.data) {
            company_name = result.data.name || "";
            address = result.data.address || "";
            foundTaxCode = result.data.id || taxCode;
          }
        }

        // Try masothue.com enrichment with VietQR company name
        if (company_name && !representative) {
          console.log("Enriching VietQR data with masothue.com...");
          const mstData = await scrapeMasothue(taxCode, company_name);
          if (mstData.representative) representative = mstData.representative;
          if (!phone && mstData.phone) phone = mstData.phone;
          if (!address && mstData.address) address = mstData.address;
        }
      }

      // Return result or error
      if (company_name) {
        return new Response(JSON.stringify({
          company_name,
          representative,
          position: representative ? "Giám đốc" : "",
          address,
          tax_code: foundTaxCode,
          phone,
          bank_name: "", bank_account: "", bank_holder: "",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ error: "Không tìm thấy doanh nghiệp với MST: " + taxCode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

    // ==================== LIST MODELS ====================
    } else if (type === "refresh_ai_config") {
      invalidateAIConfigCache('edge-function request');
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ==================== LIST MODELS ====================
    } else if (type === "list_models") {
      const BEEKNOEE_API_KEY = Deno.env.get("BEEKNOEE_API_KEY");
      if (!BEEKNOEE_API_KEY) {
        return new Response(JSON.stringify({ error: "BEEKNOEE_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const resp = await fetch("https://platform.beeknoee.com/api/v1/models", {
          headers: { Authorization: `Bearer ${BEEKNOEE_API_KEY}` },
        });
        if (!resp.ok) {
          const errText = await resp.text();
          console.error("Beeknoee list models error:", resp.status, errText);
          return new Response(JSON.stringify({ error: `Beeknoee API error: ${resp.status}` }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const result = await resp.json();
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("List models error:", err);
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

    // ==================== PARSE BUYER TEXT ====================
    } else if (type === "parse_text") {
      const parsed = await callAI([
        { role: "system", content: BUYER_INFO_SYSTEM_PROMPT },
        { role: "user", content: `Phân tích đoạn text sau và trích xuất thông tin doanh nghiệp/cá nhân. Text:\n"""\n${data}\n"""` },
      ]);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== PARSE BUYER IMAGE ====================
    } else if (type === "parse_image") {
      const { base64, mimeType } = data;
      if (!base64) {
        return new Response(JSON.stringify({ error: "No image data" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsed = await callAI([
        { role: "system", content: BUYER_INFO_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType || "image/png"};base64,${base64}` } },
            { type: "text", text: "Phân tích hình ảnh này và trích xuất tất cả thông tin doanh nghiệp/cá nhân." },
          ],
        },
      ], true);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Vui lòng thử lại sau." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== PARSE ORDER TEXT ====================
    } else if (type === "parse_order_text") {
      const parsed = await callAI([
        { role: "system", content: ORDER_ITEMS_SYSTEM_PROMPT },
        { role: "user", content: `Trích xuất danh sách sản phẩm/dịch vụ từ đoạn text sau:\n"""\n${data}\n"""` },
      ]);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== PARSE ORDER IMAGE ====================
    } else if (type === "parse_order_image") {
      const { base64, mimeType } = data;
      if (!base64) {
        return new Response(JSON.stringify({ error: "No image data" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsed = await callAI([
        { role: "system", content: ORDER_ITEMS_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType || "image/png"};base64,${base64}` } },
            { type: "text", text: "Trích xuất danh sách sản phẩm/dịch vụ từ hình ảnh này (bảng báo giá, đơn hàng, hóa đơn)." },
          ],
        },
      ], true);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== PARSE ORDER FILE (Excel/PDF) ====================
    } else if (type === "parse_order_file") {
      const { base64, mimeType, fileName } = data;
      if (!base64) {
        return new Response(JSON.stringify({ error: "No file data" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isExcel = mimeType?.includes("spreadsheet") || mimeType?.includes("excel") || 
                      fileName?.endsWith(".xlsx") || fileName?.endsWith(".xls") || fileName?.endsWith(".csv");
      const isPdf = mimeType === "application/pdf" || fileName?.endsWith(".pdf");

      let messages: any[];
      if (isPdf) {
        messages = [
          { role: "system", content: ORDER_ITEMS_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
              { type: "text", text: "Trích xuất danh sách sản phẩm/dịch vụ từ file PDF này." },
            ],
          },
        ];
      } else if (isExcel) {
        // Parse Excel/CSV server-side using SheetJS, then send as text to AI
        try {
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const workbook = XLSX.read(bytes, { type: "array" });
          
          // Convert all sheets to CSV text
          let csvText = "";
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            if (csv.trim()) {
              csvText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
            }
          }
          
          if (!csvText.trim()) {
            return new Response(JSON.stringify({ error: "File Excel trống, không có dữ liệu" }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          
          console.log("Parsed Excel to CSV text, length:", csvText.length);
          messages = [
            { role: "system", content: ORDER_ITEMS_SYSTEM_PROMPT },
            { role: "user", content: `Trích xuất danh sách sản phẩm/dịch vụ từ file Excel "${fileName || "file.xlsx"}":\n"""\n${csvText}\n"""` },
          ];
        } catch (parseErr) {
          console.error("Excel parse error:", parseErr);
          return new Response(JSON.stringify({ error: "Không thể đọc file Excel. Vui lòng kiểm tra file." }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: "Định dạng file không được hỗ trợ" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const parsed = await callAI(messages, isPdf);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== AI QUOTE FILL ====================
    } else if (type === "ai_quote_fill") {
      const { request, imageBase64, imageMimeType, priceListId, ocrOnly } = data;
      
      // ===== OCR-ONLY MODE =====
      if (ocrOnly && imageBase64) {
        console.log('AI Quote Fill: OCR-only mode — extracting text from image...');
        const ocrStart = Date.now();
        
        // Load AI config for OCR prompt
        const authHeader = req.headers.get("Authorization");
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const supabaseClient = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authHeader || "" } },
        });
        const aiConfig = await loadAIConfig(supabaseClient, { forceRefresh: true });
        
        const defaultOcrPrompt = `Trích xuất TOÀN BỘ bảng sản phẩm từ ảnh. Trả về dạng text thuần, mỗi sản phẩm 1 dòng theo format:
[tên sản phẩm] [quy cách/kích thước] x[số lượng]
Giữ nguyên số liệu gốc. KHÔNG trả JSON. KHÔNG giải thích.`;
        const ocrPrompt = aiConfig['ai_quote_ocr_prompt'] || defaultOcrPrompt;
        
        const ocrMessages = [
          { role: "system", content: ocrPrompt },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}` } },
              { type: "text", text: "Trích xuất bảng sản phẩm." },
            ],
          },
        ];
        
        const ocrModel = cleanModelName(aiConfig['ai_quote_ocr_model']) || "gemini-2.5-flash-lite";
        const ocrResult = await callAI(ocrMessages, true, ocrModel, 'ocr');
        
        let ocrText = '';
        if (ocrResult?.san_pham && Array.isArray(ocrResult.san_pham)) {
          ocrText = ocrResult.san_pham.map((p: any) =>
            `${p.ten_san_pham || ''} ${p.quy_cach || ''} x${p.so_luong || 1}`.trim()
          ).join('\n');
        } else if (ocrResult?.raw) {
          ocrText = ocrResult.raw;
        } else if (typeof ocrResult === 'string') {
          ocrText = ocrResult;
        }
        
        console.log(`OCR-only done in ${Date.now() - ocrStart}ms, text length: ${ocrText.length}`);
        console.log('OCR text:', ocrText.substring(0, 500));
        
        return new Response(JSON.stringify({ ocrText }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (!request && !imageBase64) {
        return new Response(JSON.stringify({ error: "Missing request or image" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use module-level catalog cache keyed by priceListId
      const authHeader = req.headers.get("Authorization");
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseClient = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader || "" } },
      });

      // Load AI config from DB
      const aiConfig = await loadAIConfig(supabaseClient, { forceRefresh: true });
      const customCacheTtl = aiConfig['ai_quote_cache_ttl'] ? parseInt(aiConfig['ai_quote_cache_ttl']) * 1000 : DEFAULT_CATALOG_CACHE_TTL;

      const cacheKey = priceListId || "__all__";
      const cached = catalogCacheMap.get(cacheKey);
      let allProducts: any[];
      
      if (cached && Date.now() - cached.timestamp < customCacheTtl) {
        allProducts = cached.products;
        console.log(`AI Quote Fill: using cached catalog for priceList=${cacheKey} (${allProducts.length} products)`);
      } else {
        let query = supabaseClient
          .from("products")
          .select("id, name, specifications, description, price, category")
          .eq("in_stock", true);
        
        if (priceListId) {
          query = query.eq("price_list_id", priceListId);
        }
        
        const { data: products, error: dbError } = await query.order("category");

        if (dbError) {
          console.error("Failed to fetch products:", dbError);
          return new Response(JSON.stringify({ error: "Không thể tải bảng giá" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        allProducts = products || [];
        catalogCacheMap.set(cacheKey, { products: allProducts, timestamp: Date.now() });
        console.log(`AI Quote Fill: fetched ${allProducts.length} products for priceList=${cacheKey}, cached`);
      }

      // Build custom TYPE_TO_CATEGORY from DB config
      const customTypeToCategory = buildTypeToCategory(aiConfig['ai_quote_type_categories'] || null);
      const skipCategories = buildSkipCategories(aiConfig['ai_quote_type_categories'] || null);

      // Apply skip filter on the master catalog BEFORE any segment filtering.
      // Products in SKIP_CATEGORIES never reach AI (e.g. "Bộ nhập", "Lẻ", "Tem").
      if (skipCategories.length > 0) {
        const beforeSkip = allProducts.length;
        allProducts = allProducts.filter(p => {
          const cat = (p.category || '').trim().toLowerCase();
          return !skipCategories.some(skip => cat === skip || cat.includes(skip));
        });
        console.log(`AI Quote Fill: skip filter ${beforeSkip} → ${allProducts.length} (removed ${beforeSkip - allProducts.length} products in SKIP_CATEGORIES)`);
      }

      // Use request directly (no more image processing here — OCR is done separately)
      let effectiveRequest = request || '';

      // Step 2: Parse segments from effective request (OCR text or original)
      const segments = parseRequestSegments(effectiveRequest);
      let filteredProducts: any[];
      
      if (segments.length > 0) {
        filteredProducts = filterProductsBySegments(allProducts, segments, customTypeToCategory);
        console.log(`AI Quote Fill: ${allProducts.length} total → ${filteredProducts.length} after segment filter (${segments.length} segments: ${segments.map(s => s.type).join(', ')})${customTypeToCategory ? ' [CUSTOM mapping]' : ''}`);
      } else {
        // Legacy fallback for requests without clear product keywords
        const { categories: catPatterns, materials: matPatterns } = extractCategoryFilters(effectiveRequest);
        filteredProducts = filterProductsByCategory(allProducts, catPatterns, matPatterns);
        console.log(`AI Quote Fill: ${allProducts.length} total → ${filteredProducts.length} after legacy filter (cats: ${catPatterns.join(', ') || 'none'}, mats: ${matPatterns.join(', ') || 'none'})`);
      }

      // Build catalog text (always text-only format now since OCR already extracted text)
      const productListText = filteredProducts.map((p: any) =>
        `${p.id}|${p.name}|${p.specifications || ''}|${p.price || 0}`
      ).join("\n");

      const catalogHeader = "ID|Tên|Quy cách|Giá";

      // Build segment instruction for AI
      let segmentInstruction = '';
      if (segments.length > 0) {
        const segLines = segments.map((s, i) => {
          const parts = [s.type];
          if (s.material) parts.push(s.material);
          if (s.pattern) parts.push(s.pattern);
          if (s.size) parts.push(s.size);
          if (s.note) parts.push(`(${s.note})`);
          if (s.quantity > 1) parts.push(`x${s.quantity}`);
          return `${i + 1}. ${parts.join(' ')}`;
        }).join('\n');
        segmentInstruction = `\n## YÊU CẦU ĐÃ PHÂN TÍCH (${segments.length} sản phẩm):\n${segLines}\nMỗi dòng trên PHẢI có ÍT NHẤT 1 item tương ứng trong kết quả. KHÔNG được bỏ sót dòng nào.\n`;
      }

      // Check for custom prompt from DB config
      const customPromptFromDB = aiConfig['ai_quote_fill_prompt'];
      
      let aiQuoteFillPrompt: string;
      if (customPromptFromDB) {
        aiQuoteFillPrompt = customPromptFromDB
          .replace(/\$\{catalogHeader\}/g, catalogHeader)
          .replace(/\$\{productListText\}/g, productListText)
          .replace(/\$\{segmentInstruction\}/g, segmentInstruction);
        console.log('AI Quote Fill: using CUSTOM prompt from DB');
      } else {
        aiQuoteFillPrompt = `Bạn là chuyên gia báo giá nội thất phòng ngủ VN. Nhân viên gõ nhanh, không dấu, viết tắt.

## BẢNG GIÁ (${catalogHeader})
${productListText}
${segmentInstruction}
## SO KHỚP
1. So khớp từ khóa yêu cầu với TÊN SP. Phân biệt bằng: chất liệu (T200/T250/T300...), mẫu (trơn/sọc), kích thước
2. Kích thước khách KHÔNG có trong bảng → lấy GIÁ & matchedProductId của SP kích thước LỚN HƠN gần nhất. customName/specifications ghi ĐÚNG kích thước KHÁCH, KHÔNG làm tròn. Note: "Giá theo SP [KT bảng giá], khách yêu cầu [KT thực]"
   VD: ga 12cm, bảng có 15cm → matchedProductId=SP 15cm, ghi "12cm". BVN trên 10cm → giá SP 25cm
3. KHÔNG hoán đổi Trơn↔Sọc nếu khách ghi rõ
4. PHÂN BIỆT: "chăn hè" → match "Chăn hè chần" (SP riêng, KHÔNG có từ "vỏ"). "vỏ chăn chần" → match "Vỏ chăn chần bông" (SP riêng, KHÔNG phải chăn hè). Hai loại KHÁC NHAU hoàn toàn.

## TIẾNG VIỆT KHÔNG DẤU
trang/trắng=TRƠN | soc=SỌC | chan he/chăn hè=Chăn hè chần (SP riêng, KHÔNG phải vỏ chăn) | vo chan chan/vỏ chăn chần=Vỏ chăn chần bông (SP riêng, KHÔNG phải chăn hè) | chan dong=Vỏ chăn chần dày
ga phu=ga phủ | bvn=bảo vệ nệm | tam trang tri=tấm trang trí | goi trang tri=Vỏ gối trang trí
"gối" không rõ loại→Vỏ gối | LTH=T225 | hai mat/2 mat→ghi note

## SUY LUẬN CHẤT LIỆU
- SP ghi rõ chất liệu → dùng đúng. SP KHÔNG ghi → suy luận từ SP khác cùng báo giá:
  + 1 chất liệu duy nhất → áp dụng cho tất cả
  + Nhiều chất liệu → theo vị trí gần nhất + cùng mẫu (trơn/sọc)
  + Không có chất liệu nào → mặc định T250

## KÍCH THƯỚC
Số <10 = mét (1.6→160, 2.0→200). "1m6"=160. 14p/14f=14cm. T200/T250...=chất liệu KHÔNG PHẢI kích thước

## GIÁ & SL
Giá khách ghi → dùng giá khách. Không ghi → từ bảng giá. "x2"/"4 cái"→số lượng. Mặc định=1

## OUTPUT — JSON thuần, KHÔNG markdown/backtick
matchedProductId PHẢI là UUID chính xác từ CỘT ĐẦU bảng giá. TUYỆT ĐỐI KHÔNG bịa UUID.
{"items":[{"matchedProductId":"uuid-từ-bảng-giá","customName":"tên SP kích thước ĐÚNG khách","quantity":1,"price":0,"specifications":"KT đúng khách, KHÔNG làm tròn","note":""}]}
Không tìm thấy: {"items":[]}. Thiếu info: {"clarification":"câu hỏi"}`;
      }

      // Step 2b: Call text model (fast, cheap) with filtered catalog — NO image needed
      const userContent = `Yêu cầu khách hàng:\n"""\n${effectiveRequest}\n"""`;

      // Always use text model now (image already processed in Step 1)
      const configTextModel = cleanModelName(aiConfig['ai_quote_text_model'] || '');
      const quoteModel = configTextModel || "gemini-2.5-flash";
      
      const step2Start = Date.now();
      console.log(`AI Quote Fill: Step 2 — text matching, model=${quoteModel}, products=${filteredProducts.length}, request=${effectiveRequest.length} chars`);
      
      // Pass stepHint='text' so Beeknoee uses GLM first (avoids 429 from OCR's gemini)
      const parsed = await callAI([
        { role: "system", content: aiQuoteFillPrompt },
        { role: "user", content: userContent },
      ], false, quoteModel, 'text');
      
      const step2Time = Date.now() - step2Start;
      console.log(`AI Quote Fill: Step 2 took ${step2Time}ms`);
      
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build segment-scoped candidate map for validation
      const candidateMap = segments.length > 0 ? buildSegmentCandidates(segments, allProducts, customTypeToCategory) : new Map();
      const validProductIds = new Set(allProducts.map((p: any) => p.id));
      
      if (parsed.items && Array.isArray(parsed.items)) {
        const validation = validateAndRepairItems(parsed.items, segments, candidateMap, allProducts, validProductIds);
        parsed.items = validation.items;
        if (validation.warnings.length > 0) {
          parsed.warnings = validation.warnings;
          parsed.warning = validation.warnings.join('. ');
          console.warn('Validation warnings:', validation.warnings);
        }
      }

      // Add pipeline metadata for transparency
      // Pipeline metadata removed - OCR is now a separate step

      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== AI QUOTE DEBUG ====================
    } else if (type === "ai_quote_debug") {
      const { request, config } = data;
      if (!request) {
        return new Response(JSON.stringify({ error: "Missing request" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const startTime = Date.now();

      // Use custom config if provided
      const customTypeCategories = config?.typeCategories;
      const customProductKeywords = config?.productKeywords;
      const customMaterialKeywords = config?.materialKeywords;

      // Override globals temporarily if custom keywords provided
      // (parseRequestSegments uses module-level PRODUCT_TYPE_KEYWORDS)

      // Fetch products (filter by priceListId like the real flow)
      const authHeader = req.headers.get("Authorization");
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseClient = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader || "" } },
      });

      // Load DB config (for defaults when no config passed from client)
      const dbConfig = await loadAIConfig(supabaseClient, { forceRefresh: true });

      const priceListIdDebug = config?.priceListId || null;
      let query = supabaseClient
        .from("products")
        .select("id, name, specifications, description, price, category")
        .eq("in_stock", true);
      
      if (priceListIdDebug) {
        query = query.eq("price_list_id", priceListIdDebug);
      }

      const { data: products, error: dbError } = await query.order("category");

      if (dbError) {
        return new Response(JSON.stringify({ error: "DB error: " + dbError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let allProducts = products || [];

      // Build custom TYPE_TO_CATEGORY from DB config
      const customTypeToCategoryDebug = buildTypeToCategory(dbConfig['ai_quote_type_categories'] || null);
      const skipCategoriesDebug = buildSkipCategories(dbConfig['ai_quote_type_categories'] || null);
      if (skipCategoriesDebug.length > 0) {
        allProducts = allProducts.filter(p => {
          const cat = (p.category || '').trim().toLowerCase();
          return !skipCategoriesDebug.some(skip => cat === skip || cat.includes(skip));
        });
      }

      // Parse segments
      const segments = parseRequestSegments(request);
      
      // Filter
      let filteredProducts: any[];
      if (segments.length > 0) {
        filteredProducts = filterProductsBySegments(allProducts, segments, customTypeToCategoryDebug);
      } else {
        const { categories, materials } = extractCategoryFilters(request);
        filteredProducts = filterProductsByCategory(allProducts, categories, materials);
      }

      // Call AI with custom or default model — strip google/ prefix for Beeknoee compatibility
      const textModel = cleanModelName(config?.textModel || dbConfig['ai_quote_text_model'] || '') || "gemini-2.5-flash";
      
      // Build prompt (same as ai_quote_fill)
      const productListText = filteredProducts.map((p: any) => 
        `${p.id}|${p.name}|${p.specifications || ''}|${p.price || 0}`
      ).join("\n");

      const catalogHeader = "ID|Tên|Quy cách|Giá";

      let segmentInstruction = '';
      if (segments.length > 0) {
        const segLines = segments.map((s, i) => {
          const parts = [s.type];
          if (s.material) parts.push(s.material);
          if (s.pattern) parts.push(s.pattern);
          if (s.size) parts.push(s.size);
          if (s.note) parts.push(`(${s.note})`);
          if (s.quantity > 1) parts.push(`x${s.quantity}`);
          return `${i + 1}. ${parts.join(' ')}`;
        }).join('\n');
        segmentInstruction = `\n## YÊU CẦU ĐÃ PHÂN TÍCH (${segments.length} sản phẩm):\n${segLines}\nMỗi dòng trên PHẢI có ÍT NHẤT 1 item tương ứng trong kết quả. KHÔNG được bỏ sót dòng nào.\n`;
      }

      const defaultPrompt = `Bạn là chuyên gia báo giá nội thất phòng ngủ VN.

## BẢNG GIÁ (${catalogHeader})
${productListText}
${segmentInstruction}
## OUTPUT — JSON thuần
{"items":[{"matchedProductId":"uuid","customName":"tên","quantity":1,"price":0,"specifications":"","note":""}]}`;

      // Interpolate custom prompt properly (same as ai_quote_fill flow)
      let systemPrompt: string;
      if (config?.customPrompt) {
        systemPrompt = config.customPrompt
          .replace(/\$\{catalogHeader\}/g, catalogHeader)
          .replace(/\$\{productListText\}/g, productListText)
          .replace(/\$\{segmentInstruction\}/g, segmentInstruction);
        console.log('AI Quote Debug: using CUSTOM prompt with interpolation');
      } else {
        systemPrompt = defaultPrompt;
      }

      const parsed = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: `Yêu cầu khách hàng:\n"""\n${request}\n"""` },
      ], false, textModel);

      const processingTime = Date.now() - startTime;

      // Validate
      let warnings: string[] = [];
      if (parsed.items && Array.isArray(parsed.items)) {
        const candidateMap = segments.length > 0 ? buildSegmentCandidates(segments, allProducts, customTypeToCategoryDebug) : new Map();
        const validProductIds = new Set(allProducts.map((p: any) => p.id));
        const validation = validateAndRepairItems(parsed.items, segments, candidateMap, allProducts, validProductIds);
        parsed.items = validation.items;
        warnings = validation.warnings;
      }

      return new Response(JSON.stringify({
        segments: segments.map(s => ({
          type: s.type, material: s.material, pattern: s.pattern,
          size: s.size, quantity: s.quantity, needsFabric: s.needsFabric, rawText: s.rawText,
        })),
        filtering: {
          totalProducts: allProducts.length,
          filteredProducts: filteredProducts.length,
        },
        aiResponse: parsed,
        warnings,
        modelUsed: textModel,
        processingTime,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("lookup-tax-code error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
