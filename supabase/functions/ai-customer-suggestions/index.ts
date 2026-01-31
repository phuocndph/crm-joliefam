import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { customer, action_type = 'next_action' } = await req.json()

    const supabaseClient = createClient(
      'https://kmxfljxsmnozvvgypdei.supabase.co',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Get the Gemini API key
    const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY')
    if (!geminiApiKey) {
      throw new Error('Google Gemini API key not configured')
    }

    // Prepare customer context for AI
    const customerContext = {
      name: customer.name,
      phone: customer.phone || 'Không có',
      email: customer.email || 'Không có',
      current_status: customer.current_status || 'waiting-payment',
      notes: customer.notes || 'Không có ghi chú',
      tags: customer.tags || [],
      auto_tags: customer.auto_tags || [],
      purchase_count: customer.purchase_count || 0,
      total_spent: customer.total_spent || 0,
      last_purchase_date: customer.last_purchase_date || null,
      created_at: customer.created_at,
      updated_at: customer.updated_at
    }

    // Create AI prompt based on action type
    let prompt = ''
    
    if (action_type === 'next_action') {
      prompt = `
Dựa vào thông tin khách hàng sau và tình trạng hiện tại, hãy đưa ra gợi ý hành động tiếp theo phù hợp để chăm sóc khách hàng hiệu quả:

Thông tin khách hàng:
- Tên: ${customerContext.name}
- Điện thoại: ${customerContext.phone}
- Email: ${customerContext.email}
- Trạng thái hiện tại: ${customerContext.current_status}
- Ghi chú: ${customerContext.notes}
- Nguồn: ${customerContext.tags.join(', ')}
- Lịch sử: ${customerContext.auto_tags.join(', ')}
- Số lần mua: ${customerContext.purchase_count}
- Tổng chi tiêu: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(customerContext.total_spent)}
- Ngày mua gần nhất: ${customerContext.last_purchase_date || 'Chưa có'}
- Ngày tạo: ${new Date(customerContext.created_at).toLocaleDateString('vi-VN')}

Hãy phân tích tình hình và đưa ra 1 hành động tiếp theo cụ thể, ngắn gọn (tối đa 50 ký tự), phù hợp với tình trạng hiện tại. Chỉ trả về text hành động, không giải thích thêm.

Ví dụ: "Gọi xác nhận thanh toán", "Follow up báo giá", "Gửi mẫu sản phẩm", "Chăm sóc sau bán"
`
    }

    // Call Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 100,
        }
      })
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const data = await response.json()
    const aiSuggestion = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Liên hệ tư vấn'

    // Log the AI suggestion for debugging
    console.log('AI Suggestion for customer:', customer.name, ':', aiSuggestion)

    return new Response(
      JSON.stringify({ 
        suggestion: aiSuggestion,
        action_type,
        customer_id: customer.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in ai-customer-suggestions function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        suggestion: 'Liên hệ tư vấn' // Fallback suggestion
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})