import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GHNTrackingData {
  OrderCode: string;
  Status: string;
  StatusText: string;
  CustomerName: string;
  CustomerPhone: string;
  CustomerAddress: string;
  Weight: number;
  CreatedDate: string;
  ExpectedDeliveryTime: string;
  DeliveredDate?: string;
  COD: number;
  TrackingUrl: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const ghnApiKey = Deno.env.get('GHN_API_KEY');
    if (!ghnApiKey) {
      throw new Error('GHN API key not configured');
    }

    const { action, orderCode, orderId } = await req.json();

    if (action === 'track') {
      // Track single order by GHN order code
      const ghnResponse = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Token': ghnApiKey,
        },
        body: JSON.stringify({
          order_code: orderCode
        })
      });

      if (!ghnResponse.ok) {
        throw new Error(`GHN API error: ${ghnResponse.statusText}`);
      }

      const ghnData = await ghnResponse.json();
      
      if (ghnData.code !== 200) {
        throw new Error(`GHN API error: ${ghnData.message}`);
      }

      const orderData = ghnData.data;
      
      // Update tracking data in database
      const { error: updateError } = await supabaseClient
        .from('ghn_tracking')
        .upsert({
          order_id: orderId,
          ghn_order_code: orderData.order_code,
          ghn_status: orderData.status,
          ghn_status_text: getStatusText(orderData.status),
          customer_name: orderData.to_name,
          customer_phone: orderData.to_phone,
          customer_address: `${orderData.to_address}, ${orderData.to_ward_name}, ${orderData.to_district_name}, ${orderData.to_province_name}`,
          package_weight: orderData.weight,
          created_date: orderData.created_date,
          expected_delivery_date: orderData.expected_delivery_time,
          delivered_date: orderData.delivered_date,
          cod_amount: orderData.cod_amount,
          tracking_url: `https://tracking.ghn.dev/?order_code=${orderData.order_code}`,
          raw_data: orderData,
          tenant_id: 'default'
        }, {
          onConflict: 'ghn_order_code'
        });

      if (updateError) {
        throw updateError;
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          data: {
            orderCode: orderData.order_code,
            status: orderData.status,
            statusText: getStatusText(orderData.status),
            customerName: orderData.to_name,
            customerPhone: orderData.to_phone,
            customerAddress: `${orderData.to_address}, ${orderData.to_ward_name}, ${orderData.to_district_name}, ${orderData.to_province_name}`,
            weight: orderData.weight,
            createdDate: orderData.created_date,
            expectedDeliveryTime: orderData.expected_delivery_time,
            deliveredDate: orderData.delivered_date,
            codAmount: orderData.cod_amount,
            trackingUrl: `https://tracking.ghn.dev/?order_code=${orderData.order_code}`
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );

    } else if (action === 'sync_from_ghn') {
      // Sync data directly from GHN API using customer names that contain order codes
      // Extract GHN order codes from customer names (pattern: customer_name_XXXX)
      
      const { data: customers, error: customersError } = await supabaseClient
        .from('customers')
        .select('id, name')
        .like('name', '%_%');

      if (customersError) {
        throw customersError;
      }

      const results = [];
      
      for (const customer of customers) {
        // Extract GHN order code from customer name (e.g., "hà thu _3203 hoan" -> "3203")
        const nameMatch = customer.name.match(/_(\d+)/);
        if (!nameMatch) continue;
        
        const ghnOrderCode = nameMatch[1];
        
        try {
          // Check if tracking record already exists
          const { data: existingTracking } = await supabaseClient
            .from('ghn_tracking')
            .select('id')
            .eq('ghn_order_code', ghnOrderCode)
            .maybeSingle();

          // Get order info for this customer if exists
          const { data: orderData } = await supabaseClient
            .from('orders')
            .select('id')
            .eq('customer_id', customer.id)
            .maybeSingle();

          // Fetch data from GHN API
          const ghnResponse = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Token': ghnApiKey,
            },
            body: JSON.stringify({
              order_code: ghnOrderCode
            })
          });

          if (!ghnResponse.ok) {
            results.push({
              customerName: customer.name,
              ghnOrderCode,
              status: 'error',
              message: `GHN API error: ${ghnResponse.statusText}`,
              updated: false
            });
            continue;
          }

          const ghnData = await ghnResponse.json();
          
          if (ghnData.code !== 200) {
            results.push({
              customerName: customer.name,
              ghnOrderCode,
              status: 'error', 
              message: `GHN API error: ${ghnData.message}`,
              updated: false
            });
            continue;
          }

          const trackingData = ghnData.data;
          
          const trackingRecord = {
            order_id: orderData?.id || null,
            ghn_order_code: trackingData.order_code,
            ghn_status: trackingData.status,
            ghn_status_text: getStatusText(trackingData.status),
            customer_name: trackingData.to_name,
            customer_phone: trackingData.to_phone,
            customer_address: `${trackingData.to_address}, ${trackingData.to_ward_name}, ${trackingData.to_district_name}, ${trackingData.to_province_name}`,
            package_weight: trackingData.weight,
            created_date: trackingData.created_date,
            expected_delivery_date: trackingData.expected_delivery_time,
            delivered_date: trackingData.delivered_date,
            cod_amount: trackingData.cod_amount,
            tracking_url: `https://tracking.ghn.dev/?order_code=${trackingData.order_code}`,
            raw_data: trackingData,
            tenant_id: 'default'
          };

          if (existingTracking) {
            // Update existing record
            const { error: updateError } = await supabaseClient
              .from('ghn_tracking')
              .update(trackingRecord)
              .eq('id', existingTracking.id);

            if (updateError) {
              console.error(`Error updating tracking ${ghnOrderCode}:`, updateError);
              results.push({
                customerName: customer.name,
                ghnOrderCode,
                status: 'error',
                message: updateError.message,
                updated: false
              });
            } else {
              results.push({
                customerName: customer.name,
                ghnOrderCode,
                status: 'updated',
                message: 'Đã cập nhật thông tin tracking',
                updated: true
              });
            }
          } else {
            // Create new record
            const { error: insertError } = await supabaseClient
              .from('ghn_tracking')
              .insert(trackingRecord);

            if (insertError) {
              console.error(`Error creating tracking ${ghnOrderCode}:`, insertError);
              results.push({
                customerName: customer.name,
                ghnOrderCode,
                status: 'error',
                message: insertError.message,
                updated: false
              });
            } else {
              results.push({
                customerName: customer.name,
                ghnOrderCode,
                status: 'created',
                message: 'Đã tạo bản ghi tracking mới',
                updated: true
              });
            }
          }
          
        } catch (error) {
          console.error(`Error processing customer ${customer.name}:`, error);
          results.push({
            customerName: customer.name,
            ghnOrderCode,
            status: 'error',
            message: error.message,
            updated: false
          });
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Đã xử lý ${customers.length} khách hàng, đồng bộ thành công ${results.filter(r => r.updated).length} đơn hàng`,
          results 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );

    } else if (action === 'bulk_sync') {
      // Sync multiple orders that already have GHN tracking records
      const { data: trackingRecords, error: trackingError } = await supabaseClient
        .from('ghn_tracking')
        .select('*')
        .not('ghn_order_code', 'like', 'PENDING_%');

      if (trackingError) {
        throw trackingError;
      }

      const results = [];
      
      for (const tracking of trackingRecords) {
        try {
          const ghnResponse = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Token': ghnApiKey,
            },
            body: JSON.stringify({
              order_code: tracking.ghn_order_code
            })
          });

          if (ghnResponse.ok) {
            const ghnData = await ghnResponse.json();
            if (ghnData.code === 200) {
              const orderData = ghnData.data;
              
              // Update tracking data
              await supabaseClient
                .from('ghn_tracking')
                .update({
                  ghn_status: orderData.status,
                  ghn_status_text: getStatusText(orderData.status),
                  expected_delivery_date: orderData.expected_delivery_time,
                  delivered_date: orderData.delivered_date,
                  raw_data: orderData,
                  updated_at: new Date().toISOString()
                })
                .eq('ghn_order_code', tracking.ghn_order_code);

              results.push({
                orderCode: tracking.ghn_order_code,
                status: orderData.status,
                statusText: getStatusText(orderData.status),
                updated: true
              });
            } else {
              results.push({
                orderCode: tracking.ghn_order_code,
                error: ghnData.message || 'GHN API error',
                updated: false
              });
            }
          } else {
            results.push({
              orderCode: tracking.ghn_order_code,
              error: `HTTP ${ghnResponse.status}: ${ghnResponse.statusText}`,
              updated: false
            });
          }
        } catch (error) {
          console.error(`Error updating order ${tracking.ghn_order_code}:`, error);
          results.push({
            orderCode: tracking.ghn_order_code,
            error: error.message,
            updated: false
          });
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Đã cập nhật ${results.filter(r => r.updated).length}/${trackingRecords.length} đơn hàng`,
          results 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    throw new Error('Invalid action specified');

  } catch (error) {
    console.error('GHN Tracking Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});

function getStatusText(status: string): string {
  const statusMap: { [key: string]: string } = {
    'ready_to_pick': 'Chờ lấy hàng',
    'picking': 'Đang lấy hàng',
    'cancel': 'Đã hủy',
    'money_collect_picking': 'Đang thu tiền người gửi',
    'picked': 'Đã lấy hàng',
    'storing': 'Hàng nhập kho',
    'transporting': 'Đang luân chuyển',
    'sorting': 'Đang phân loại',
    'delivering': 'Đang giao hàng',
    'money_collect_delivering': 'Đang thu tiền người nhận',
    'delivered': 'Đã giao hàng',
    'delivery_fail': 'Giao hàng thất bại',
    'waiting_to_return': 'Đang chờ trả hàng',
    'return': 'Trả hàng',
    'return_transporting': 'Đang luân chuyển trả hàng',
    'return_sorting': 'Đang phân loại trả hàng',
    'returning': 'Đang trả hàng',
    'return_fail': 'Trả hàng thất bại',
    'returned': 'Đã trả hàng',
    'exception': 'Đơn hàng ngoại lệ',
    'damage': 'Hàng bị hư hỏng',
    'lost': 'Hàng bị thất lạc'
  };
  
  return statusMap[status] || status;
}