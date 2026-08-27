import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { customer_id, prediction_types = ['purchase_probability', 'churn_risk', 'optimal_contact_time'] } = await req.json()

    // Get authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const supabaseClient = createClient(
      'https://kmxfljxsmnozvvgypdei.supabase.co',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            authorization: authHeader,
          },
        },
      }
    )

    const geminiApiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY')
    if (!geminiApiKey) {
      throw new Error('Google Gemini API key not configured')
    }

    console.log('Looking for customer:', customer_id)

    // Get customer data with proper authentication
    const { data: customer, error: customerError } = await supabaseClient
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .maybeSingle()

    if (customerError) {
      console.error('Customer query error:', customerError)
      throw new Error(`Database error: ${customerError.message}`)
    }

    if (!customer) {
      throw new Error(`Customer with id ${customer_id} not found`)
    }

    // Get customer order history if available
    const { data: orders } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('customer_id', customer_id)
      .order('created_at', { ascending: false })

    const predictions = []

    for (const predictionType of prediction_types) {
      console.log(`Generating prediction for type: ${predictionType}`)
      
      const prediction = await generatePrediction(customer, orders || [], predictionType, geminiApiKey)
      console.log(`Generated prediction:`, prediction)
      
      // Save prediction to database
      const { data: insertData, error: insertError } = await supabaseClient
        .from('customer_predictions')
        .upsert({
          customer_id,
          prediction_type: predictionType,
          prediction_value: prediction.value,
          confidence_score: prediction.confidence,
          factors: prediction.factors,
          valid_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Valid for 7 days
          tenant_id: 'default',
          manager_id: customer.manager_id
        }, {
          onConflict: 'customer_id,prediction_type'
        })

      if (insertError) {
        console.error(`Failed to insert prediction for ${predictionType}:`, insertError)
      } else {
        console.log(`Successfully inserted prediction for ${predictionType}`)
      }

      // Always add to predictions array regardless of database insert status
      predictions.push({
        type: predictionType,
        ...prediction
      })
    }

    return new Response(
      JSON.stringify({ predictions, customer_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in predictive analytics:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function generatePrediction(customer: any, orders: any[], predictionType: string, geminiApiKey: string) {
  const now = new Date()
  const daysSinceCreated = Math.floor((now.getTime() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24))
  const daysSinceLastUpdate = Math.floor((now.getTime() - new Date(customer.updated_at).getTime()) / (1000 * 60 * 60 * 24))
  
  let prompt = ''
  
  switch (predictionType) {
    case 'purchase_probability':
      prompt = `
Phân tích khả năng mua hàng của khách hàng trong 30 ngày tới:

Thông tin khách hàng:
- Trạng thái: ${customer.current_status}
- Số ngày từ lúc tạo: ${daysSinceCreated}
- Số ngày từ lần cập nhật cuối: ${daysSinceLastUpdate}
- Số lần mua: ${customer.purchase_count || 0}
- Tổng chi tiêu: ${customer.total_spent || 0} VND
- Ghi chú: ${customer.notes || 'Không có'}
- Tags: ${customer.tags?.join(', ') || 'Không có'}

Dựa trên thông tin trên, hãy đánh giá khả năng khách hàng sẽ mua hàng trong 30 ngày tới từ 0-100. 
Trả về CHỈ một số từ 0-100, không giải thích.`
      break

    case 'churn_risk':
      prompt = `
Đánh giá nguy cơ khách hàng bỏ cuộc (churn) trong 30 ngày tới:

Thông tin khách hàng:
- Trạng thái: ${customer.current_status}
- Số ngày từ lúc tạo: ${daysSinceCreated}
- Số ngày từ lần cập nhật cuối: ${daysSinceLastUpdate}
- Số lần mua: ${customer.purchase_count || 0}
- Ghi chú: ${customer.notes || 'Không có'}

Đánh giá nguy cơ bỏ cuộc từ 0-100 (100 = rất có thể bỏ cuộc).
Trả về CHỈ một số từ 0-100, không giải thích.`
      break

    case 'optimal_contact_time':
      prompt = `
Dựa vào thông tin khách hàng và trạng thái hiện tại, đề xuất giờ tối ưu để liên hệ (0-23):

Thông tin khách hàng:
- Trạng thái: ${customer.current_status}
- Nguồn: ${customer.tags?.[0] || 'Không rõ'}
- Ghi chú: ${customer.notes || 'Không có'}

Trả về CHỈ một số từ 9-17 (giờ làm việc), không giải thích.`
      break
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          topK: 10,
          topP: 0.8,
          maxOutputTokens: 50,
        }
      })
    })

    const data = await response.json()
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '50'
    
    // Parse the numeric result
    let value = parseInt(result.match(/\d+/)?.[0] || '50')
    
    // Validate ranges based on prediction type
    if (predictionType === 'optimal_contact_time') {
      value = Math.max(9, Math.min(17, value))
    } else {
      value = Math.max(0, Math.min(100, value))
    }

    // Calculate confidence based on data availability
    let confidence = 70
    if (customer.purchase_count > 0) confidence += 15
    if (customer.notes && customer.notes.length > 50) confidence += 10
    if (daysSinceCreated > 7) confidence += 5

    // Generate factors
    const factors = {
      status_weight: getStatusWeight(customer.current_status),
      activity_recency: daysSinceLastUpdate,
      purchase_history: customer.purchase_count || 0,
      engagement_level: customer.notes ? 'high' : 'low'
    }

    return {
      value,
      confidence: Math.min(100, confidence),
      factors
    }
  } catch (error) {
    console.error('AI prediction error:', error)
    // Return default values
    const defaultValues = {
      purchase_probability: 50,
      churn_risk: 30,
      optimal_contact_time: 14
    }
    
    return {
      value: defaultValues[predictionType as keyof typeof defaultValues] || 50,
      confidence: 30,
      factors: { error: 'AI unavailable, using defaults' }
    }
  }
}

function getStatusWeight(status: string): number {
  const weights: Record<string, number> = {
    'waiting-payment': 85,
    'waiting-deposit': 80,
    'sent-quote': 70,
    'waiting-response': 60,
    'ordered': 95,
    'paid': 100,
    'no-response': 20
  }
  return weights[status] || 50
}