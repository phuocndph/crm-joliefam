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

    const { googleSheetsUrl, priceListId } = await req.json()

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

    // Parse CSV data
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) {
      throw new Error('Google Sheets không có dữ liệu')
    }

    // Parse header
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
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

    // Parse data rows
    const products = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim())
      
      if (values.length >= headers.length && values[0]) { // Skip empty rows
        const product: any = {
          price_list_id: priceListId,
          tenant_id: 'default'
        }

        // Use header positions to map values
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
              product.cost_price = value ? parseFloat(value.replace(/[^\d.]/g, '')) : null
              break
            case 'Giá bán':
              product.price = value ? parseFloat(value.replace(/[^\d.]/g, '')) : null
              break
            case 'Mô tả':
              product.description = value
              break
          }
        })

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