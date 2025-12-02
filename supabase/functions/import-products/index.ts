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
    // Get authorization header from request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authentication required')
    }

    // Create authenticated Supabase client using user's token
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    // Get current user and their manager_id
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('Failed to authenticate user')
    }

    // Get user's role to determine manager_id
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, assigned_by')
      .eq('user_id', user.id)
      .single()

    // For employees/accountants, use their assigned_by (manager's ID), otherwise use their own ID
    const managerId = (roleData?.role === 'employee' || roleData?.role === 'accountant') && roleData.assigned_by
      ? roleData.assigned_by
      : user.id

    console.log('User ID:', user.id)
    console.log('User Role:', roleData?.role)
    console.log('Manager ID:', managerId)

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

    // Parse CSV data properly handling quoted values
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) {
      throw new Error('Google Sheets không có dữ liệu')
    }

    // Helper function to parse CSV line properly
    const parseCsvLine = (line: string): string[] => {
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

    // Parse header
    const headers = parseCsvLine(lines[0]).map(h => h.replace(/"/g, '').trim())
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

    // Helper function to parse Vietnamese currency format
    const parseVietnameseCurrency = (value: string | number): number | null => {
      if (!value && value !== 0) return null
      
      let cleaned = value.toString().trim()
      
      // Remove currency symbols and extra spaces
      cleaned = cleaned.replace(/[₫VNĐ\s]/g, '')
      
      if (!cleaned) return null
      
      // Handle Vietnamese format with both dots and commas
      if (cleaned.includes('.') && cleaned.includes(',')) {
        // Check if comma is followed by 3 digits (thousands separator, not decimal)
        const commaIndex = cleaned.lastIndexOf(',')
        const afterComma = cleaned.substring(commaIndex + 1)
        
        if (afterComma.length === 3 && /^\d{3}$/.test(afterComma)) {
          // Format: 1.450,000 or 1.234.567,890 -> both are thousands separators
          cleaned = cleaned.replace(/[.,]/g, '')
        } else {
          // Format: 1.234.567,89 (comma is decimal) -> 1234567.89
          cleaned = cleaned.replace(/\./g, '').replace(',', '.')
        }
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
      cleaned = cleaned.replace(/[^\d.]/g, '')
      
      const parsed = parseFloat(cleaned)
      return isNaN(parsed) ? null : parsed
    }

    // Parse data rows using column mapping if provided
    const products = []
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]).map(v => v.replace(/"/g, '').trim())
      
      if (values.length > 0 && values[0]) { // Skip empty rows
        const product: any = {
          price_list_id: priceListId,
          tenant_id: 'default',
          manager_id: managerId // CRITICAL: Include manager_id for RLS validation
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
                product.cost_price = parseVietnameseCurrency(value)
                break
              case 'price':
                product.price = parseVietnameseCurrency(value)
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
                product.cost_price = parseVietnameseCurrency(value)
                break
              case 'Giá bán':
                product.price = parseVietnameseCurrency(value)
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

    // Remove duplicates within the same import based on SKU
    const uniqueProducts = new Map()
    products.forEach(product => {
      if (product.sku && !uniqueProducts.has(product.sku)) {
        uniqueProducts.set(product.sku, product)
      }
    })
    const deduplicatedProducts = Array.from(uniqueProducts.values())
    
    // Sort products: first by category, then by SKU (ascending) to maintain consistent order
    deduplicatedProducts.sort((a, b) => {
      // Primary sort: category (alphabetical)
      const categoryCompare = (a.category || '').localeCompare(b.category || '', 'vi', { numeric: true });
      if (categoryCompare !== 0) return categoryCompare;
      
      // Secondary sort: SKU (alphabetical/numerical)
      return (a.sku || '').localeCompare(b.sku || '', 'vi', { numeric: true });
    });
    
    console.log(`After deduplication and sorting: ${deduplicatedProducts.length} unique products`)

    // Use upsert approach to handle existing products gracefully
    const { data, error } = await supabase
      .from('products')
      .upsert(deduplicatedProducts, { 
        onConflict: 'sku,price_list_id',
        ignoreDuplicates: false 
      })
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