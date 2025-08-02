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

    } else if (action === 'sync_all_orders') {
      // Sync all orders that don't have tracking yet
      const { data: ordersWithoutTracking, error: ordersError } = await supabaseClient
        .from('orders')
        .select(`
          id, 
          order_number, 
          display_order_number,
          customers(name, phone, company)
        `)
        .is('ghn_tracking', null); // Orders without GHN tracking

      if (ordersError) {
        throw ordersError;
      }

      const results = [];
      
      for (const order of ordersWithoutTracking) {
        // For each order without tracking, we would need a GHN order code
        // Since we can't automatically know the GHN code, we'll create placeholder records
        // that can be updated later with actual GHN codes
        
        try {
          const placeholderData = {
            order_id: order.id,
            ghn_order_code: `PENDING_${order.order_number}`, // Placeholder
            ghn_status: 'unknown',
            ghn_status_text: 'Chưa có mã GHN',
            customer_name: order.customers?.name || 'Chưa có thông tin',
            customer_phone: order.customers?.phone || '',
            customer_address: order.customers?.company || 'Chưa có địa chỉ',
            package_weight: 0,
            created_date: new Date().toISOString(),
            expected_delivery_date: new Date().toISOString(),
            delivered_date: null,
            cod_amount: 0,
            tracking_url: '',
            raw_data: { status: 'placeholder', order_id: order.id },
            tenant_id: 'default'
          };

          const { error: insertError } = await supabaseClient
            .from('ghn_tracking')
            .insert(placeholderData);

          if (insertError) {
            console.error(`Error creating placeholder for order ${order.id}:`, insertError);
            results.push({
              orderId: order.id,
              orderNumber: order.display_order_number || order.order_number,
              status: 'error',
              message: insertError.message,
              updated: false
            });
          } else {
            results.push({
              orderId: order.id,
              orderNumber: order.display_order_number || order.order_number,
              status: 'placeholder_created',
              message: 'Đã tạo bản ghi chờ cập nhật mã GHN',
              updated: true
            });
          }
        } catch (error) {
          console.error(`Error processing order ${order.id}:`, error);
          results.push({
            orderId: order.id,
            orderNumber: order.display_order_number || order.order_number,
            status: 'error',
            message: error.message,
            updated: false
          });
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Đã xử lý ${ordersWithoutTracking.length} đơn hàng`,
          results 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );

    } else if (action === 'bulk_sync') {
      // Sync multiple orders from database that already have tracking
      const { data: orders, error: ordersError } = await supabaseClient
        .from('orders')
        .select('id, order_number, display_order_number, ghn_tracking(*)')
        .not('status', 'eq', 'delivered')
        .not('status', 'eq', 'cancelled');

      if (ordersError) {
        throw ordersError;
      }

      const results = [];
      
      for (const order of orders) {
        if (order.ghn_tracking && order.ghn_tracking.length > 0) {
          const tracking = order.ghn_tracking[0];
          
          // Skip placeholder records
          if (tracking.ghn_order_code.startsWith('PENDING_')) {
            results.push({
              orderId: order.id,
              orderCode: tracking.ghn_order_code,
              status: 'skipped',
              message: 'Chờ cập nhật mã GHN thực',
              updated: false
            });
            continue;
          }
          
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
                  orderId: order.id,
                  orderCode: tracking.ghn_order_code,
                  status: orderData.status,
                  updated: true
                });
              }
            }
          } catch (error) {
            console.error(`Error updating order ${order.id}:`, error);
            results.push({
              orderId: order.id,
              orderCode: tracking.ghn_order_code,
              error: error.message,
              updated: false
            });
          }
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Synced ${results.filter(r => r.updated).length} orders`,
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