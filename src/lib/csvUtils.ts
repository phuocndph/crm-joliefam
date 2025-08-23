/**
 * Shared CSV parsing utilities for consistent handling between preview and import
 */

/**
 * Parse a CSV line properly handling quoted values
 */
export function parseCsvLine(line: string): string[] {
  const result = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      // Handle escaped quotes
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++ // Skip next quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  
  result.push(current.trim())
  return result
}

/**
 * Parse Vietnamese currency format correctly
 * Examples:
 * - "120,000" -> 120000 (thousands separator)
 * - "1.456.000" -> 1456000 (thousands separator with dots)
 * - "1.456.000,50" -> 1456000.50 (Vietnamese format)
 * - "120,50" -> 120.50 (decimal format)
 */
export function parseVietnameseCurrency(value: string | number): number | null {
  if (!value && value !== 0) return null
  
  let cleaned = value.toString().trim()
  
  // Remove currency symbols and extra spaces
  cleaned = cleaned.replace(/[₫VNĐ\s]/g, '')
  
  if (!cleaned) return null
  
  // Handle Vietnamese format: 1.234.567,89 (dots for thousands, comma for decimal)
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Format: 1.234.567,89 -> 1234567.89
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // Format could be: 120,000 (thousands) or 120,50 (decimal)
    const commaIndex = cleaned.lastIndexOf(',')
    const afterComma = cleaned.substring(commaIndex + 1)
    
    // Improved logic: Check if it's likely a decimal based on patterns
    // If after comma is exactly 2 digits and before comma has no thousands pattern, likely decimal
    // If after comma is 3+ digits or before comma looks like thousands (3+ digits), likely thousands separator
    const beforeComma = cleaned.substring(0, commaIndex)
    
    if (afterComma.length === 2 && beforeComma.length <= 3 && !beforeComma.includes('.')) {
      // Likely decimal: 120,50 -> 120.50
      cleaned = cleaned.replace(',', '.')
    } else {
      // Likely thousands separator: 120,000 or 1.234,000 -> 120000 or 1234000
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes('.')) {
    // Could be thousands separator (1.234.567) or decimal (1234.56)
    const dotCount = (cleaned.match(/\./g) || []).length
    if (dotCount > 1) {
      // Multiple dots = thousands separators: 1.234.567 -> 1234567
      cleaned = cleaned.replace(/\./g, '')
    } else {
      // Single dot - check if it's likely thousands separator or decimal
      const parts = cleaned.split('.')
      const afterDot = parts[1]
      
      // If after dot is exactly 3 digits, likely thousands separator
      if (afterDot && afterDot.length === 3 && /^\d{3}$/.test(afterDot)) {
        // Format: 123.000 -> 123000
        cleaned = cleaned.replace('.', '')
      }
      // Otherwise keep as decimal point
    }
  }
  
  // Remove any remaining non-digit characters except decimal point
  cleaned = cleaned.replace(/[^.\d]/g, '')
  
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? null : parsed
}

/**
 * Format number as Vietnamese currency for display
 */
export function formatVietnameseCurrency(value: number | null): string {
  if (value === null || value === undefined) return ''
  return value.toLocaleString('vi-VN')
}
