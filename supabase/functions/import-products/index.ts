import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ProductRow {
  'Mã SP': string
  'Danh mục': string
  'Tên SP': string
  'Quy cách': string
  'Giá gốc': string
  'Giá bán': string
  'Mô tả': string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { googleSheetsUrl, priceListId, columnMapping } = await req.json()

    console.log('Processing Google Sheets URL:', googleSheetsUrl)
    console.log('Price List ID:', priceListId)

    // Extract the spreadsheet ID from Google Sheets URL
    const urlMatch = googleSheetsUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    if (!urlMatch) {
      throw new Error('URL Google Sheets không hợp lệ')
    }

    const spreadsheetId = urlMatch[1]
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`

    console.log('CSV URL:', csvUrl)

    // Fetch CSV data from Google Sheets
    const response = await fetch(csvUrl)
    if (!response.ok) {
      throw new Error('Không thể truy cập Google Sheets. Vui lòng kiểm tra quyền chia sẻ.')
    }

    const csvText = await response.text()
    console.log('CSV data received, length:', csvText.length)

    // Enhanced CSV parsing function that handles quoted values and various formats
    const parseCSVLine = (line: string): string[] => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Escaped quote
            current += '"';
            i++; // Skip next quote
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // Column separator outside of quotes
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      
      result.push(current.trim());
      return result;
    };

    // Enhanced number parsing function for Vietnamese currency format
    const parsePrice = (value: string): number | null => {
      if (!value || value.trim() === '') return null;
      
      // Remove quotes and trim
      let cleanValue = value.replace(/"/g, '').trim();
      console.log('Original price value:', value, '-> Clean value:', cleanValue);
      
      // Handle various currency symbols and text
      cleanValue = cleanValue.replace(/[đĐ$€£¥₫\s]/g, '');
      
      // Remove any non-numeric characters except commas, dots, and minus
      cleanValue = cleanValue.replace(/[^\d.,-]/g, '');
      
      if (!cleanValue) return null;
      
      console.log('After symbol removal:', cleanValue);
      
      // Count separators
      const commaCount = (cleanValue.match(/,/g) || []).length;
      const dotCount = (cleanValue.match(/\./g) || []).length;
      
      let finalValue = cleanValue;
      
      // Vietnamese format prioritization - CRITICAL FIX for millions
      if (dotCount > 1) {
        // Multiple dots like 2.235.000 or 1.234.567.89
        const parts = cleanValue.split('.');
        const lastPart = parts[parts.length - 1];
        
        // Check if this looks like Vietnamese millions format
        // Pattern: X.XXX.000 or XX.XXX.000 etc.
        if (lastPart === '000' || (lastPart.length === 3 && /^\d+$/.test(lastPart))) {
          // This is Vietnamese thousands/millions format: 2.235.000 -> 2235000
          finalValue = cleanValue.replace(/\./g, '');
          console.log('Detected Vietnamese millions format (multi-dot):', finalValue);
        } else if (lastPart.length <= 2 && parts.length > 2) {
          // Has decimal part: 1.234.567.89 -> 1234567.89
          finalValue = parts.slice(0, -1).join('') + '.' + lastPart;
        } else {
          // All are thousands separators: treat as whole number
          finalValue = cleanValue.replace(/\./g, '');
        }
      } else if (dotCount === 1) {
        // Single dot: CRITICAL - Vietnamese thousands/millions detection
        const parts = cleanValue.split('.');
        if (parts.length === 2) {
          const beforeDot = parts[0];
          const afterDot = parts[1];
          
          // ENHANCED Vietnamese format rules for millions:
          // Pattern 1: X.XXX (like 1.430, 2.235) - ALWAYS treat as thousands in Vietnamese context
          // Pattern 2: XXX.00 or XXX.000 - treat as thousands  
          // Pattern 3: XXX.X or XXX.XX - treat as decimal
          
          if (afterDot.length === 3 && /^\d+$/.test(afterDot)) {
            // Vietnamese thousands: 1.430 -> 1430000 (multiply by 1000 for millions)
            // OR if it's actually hundreds of thousands like 1.430 = 1,430,000
            const numberValue = parseInt(beforeDot + afterDot);
            
            // Smart detection: if the number seems too small for the product context, multiply by 1000
            if (numberValue < 10000) { // Numbers like 1430, 2235 etc.
              finalValue = (numberValue * 1000).toString();
              console.log('Detected Vietnamese thousands format, converted to millions:', finalValue);
            } else {
              finalValue = numberValue.toString();
              console.log('Detected Vietnamese thousands format (large):', finalValue);
            }
          } else if (afterDot === '000') {
            // Definitely thousands: 235.000 -> 235000
            finalValue = beforeDot + afterDot;
            console.log('Detected Vietnamese thousands with .000:', finalValue);
          } else if (afterDot.length <= 2) {
            // Decimal: 123.45
            finalValue = cleanValue;
          } else {
            // Long number, treat as concatenated: 123.456789 -> 123456789
            finalValue = beforeDot + afterDot;
          }
        }
      } else if (commaCount === 1) {
        // Single comma: likely decimal in Vietnamese format
        const parts = cleanValue.split(',');
        if (parts.length === 2) {
          const afterComma = parts[1];
          if (afterComma.length <= 2) {
            // Decimal: 123,45 -> 123.45
            finalValue = cleanValue.replace(',', '.');
          } else {
            // Thousands: 123,456 -> 123456
            finalValue = cleanValue.replace(',', '');
          }
        }
      } else if (commaCount > 1) {
        // Multiple commas: remove all (thousands separators)
        finalValue = cleanValue.replace(/,/g, '');
      } else if (commaCount > 0 && dotCount > 0) {
        // Mixed separators: determine which is decimal
        const lastCommaIndex = cleanValue.lastIndexOf(',');
        const lastDotIndex = cleanValue.lastIndexOf('.');
        
        if (lastDotIndex > lastCommaIndex) {
          // US format: 1,234.56
          finalValue = cleanValue.replace(/,/g, '');
        } else {
          // European format: 1.234,56
          finalValue = cleanValue.replace(/\./g, '').replace(',', '.');
        }
      }
      
      console.log('Final processed value:', finalValue);
      
      const parsed = parseFloat(finalValue);
      const result = isNaN(parsed) ? null : parsed;
      console.log('Parsed result:', result);
      
      return result;
    };

    // Parse CSV data
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) {
      throw new Error('Google Sheets không có dữ liệu')
    }

    // Parse header
    const headers = parseCSVLine(lines[0])
    console.log('Headers:', headers)

    // Expected headers - support multiple formats
    const headerMappings = {
      'Mã SP': ['MÃ SP', 'Mã SP'],
      'Danh mục': ['DANH MỤC SẢN PHẨM', 'Danh mục', 'DANH MỤC'],
      'Tên SP': ['TÊN SP', 'Tên SP'],
      'Quy cách': ['QUY CÁCH', 'Quy cách'],
      'Giá gốc': ['ĐƠN GIÁ GỐC', 'Giá gốc', 'ĐƠN GIÁ NHÀ', 'GIÁ GỐC'],
      'Giá bán': ['ĐƠN GIÁ BÁN', 'Giá bán', 'GIÁ BÁN'],
      'Mô tả': ['MÔ TẢ SẢN PHẨM', 'Mô tả', 'MÔ TẢ']
    }
    
    console.log('Header mappings check:')
    headers.forEach((header, index) => {
      console.log(`Column ${index}: "${header}"`)
    })
    
    // Find header positions
    const headerPositions: { [key: string]: number } = {}
    Object.entries(headerMappings).forEach(([standardName, variations]) => {
      for (const variation of variations) {
        const index = headers.findIndex(h => h === variation)
        if (index !== -1) {
          headerPositions[standardName] = index
          break
        }
      }
    })

    // Check if all required headers are found
    const missingHeaders = Object.keys(headerMappings).filter(h => headerPositions[h] === undefined)
    if (missingHeaders.length > 0) {
      console.log('Header positions:', headerPositions)
      console.log('Missing headers:', missingHeaders)
      throw new Error(`Không tìm thấy các cột: ${missingHeaders.join(', ')}. Headers có sẵn: ${headers.join(', ')}`)
    }

    // Parse data rows using column mapping if provided
    const products = []
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])
      
      if (values.length > 0 && values[0]) { // Skip empty rows
        const product: any = {
          price_list_id: priceListId,
          tenant_id: 'default'
        }

        if (columnMapping) {
          // Use custom column mapping from frontend
          Object.entries(columnMapping).forEach(([dbField, columnIndex]) => {
            if (columnIndex === "none") return; // Skip unmapped fields
            const value = values[parseInt(columnIndex)] || ''
            
            switch (dbField) {
              case 'sku':
                product.sku = value
                break
              case 'category':
                product.category = value
                break
              case 'name':
                product.name = value
                break
              case 'specifications':
                product.specifications = value
                break
              case 'cost_price':
                product.cost_price = parsePrice(value)
                break
              case 'price':
                product.price = parsePrice(value)
                break
              case 'description':
                product.description = value
                break
            }
          })
        } else {
          // Fallback to old header mapping method
          Object.entries(headerPositions).forEach(([standardName, position]) => {
            const value = values[position] || ''
            
            switch (standardName) {
              case 'Mã SP':
                product.sku = value
                break
              case 'Danh mục':
                product.category = value
                break
              case 'Tên SP':
                product.name = value
                break
              case 'Quy cách':
                product.specifications = value
                break
              case 'Giá gốc':
                product.cost_price = parsePrice(value)
                break
              case 'Giá bán':
                product.price = parsePrice(value)
                break
              case 'Mô tả':
                product.description = value
                break
            }
          })
        }

        if (product.name && product.sku) { // Only add if has required fields
          products.push(product)
        }
      }
    }

    console.log(`Parsed ${products.length} products`)

    if (products.length === 0) {
      throw new Error('Không tìm thấy sản phẩm hợp lệ trong Google Sheets')
    }

    // Delete existing products for this price list first
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('price_list_id', priceListId)

    if (deleteError) {
      console.error('Delete error:', deleteError)
      throw new Error(`Lỗi khi xóa sản phẩm cũ: ${deleteError.message}`)
    }

    // Insert new products into database
    const { data, error } = await supabase
      .from('products')
      .insert(products)
      .select()

    if (error) {
      console.error('Database error:', error)
      throw new Error(`Lỗi khi lưu sản phẩm: ${error.message}`)
    }

    console.log(`Successfully imported ${data.length} products`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã import thành công ${data.length} sản phẩm`,
        products: data
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Đã xảy ra lỗi không xác định'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})