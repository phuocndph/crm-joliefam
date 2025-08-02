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

    const { action, orderCode, orderId, orderCodes } = await req.json();

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
      // Sync data from GHN API using provided order codes
      if (!orderCodes || !Array.isArray(orderCodes)) {
        throw new Error('orderCodes array is required');
      }

      const results = [];
      
      for (const ghnOrderCode of orderCodes) {
        try {
          // Check if tracking record already exists
          const { data: existingTracking } = await supabaseClient
            .from('ghn_tracking')
            .select('id')
            .eq('ghn_order_code', ghnOrderCode)
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
              ghnOrderCode,
              status: 'error', 
              message: `GHN API error: ${ghnData.message}`,
              updated: false
            });
            continue;
          }

          const trackingData = ghnData.data;
          
          const trackingRecord = {
            order_id: null, // No order linking for independent sync
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
                ghnOrderCode,
                status: 'error',
                message: updateError.message,
                updated: false
              });
            } else {
              results.push({
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
                ghnOrderCode,
                status: 'error',
                message: insertError.message,
                updated: false
              });
            } else {
              results.push({
                ghnOrderCode,
                status: 'created',
                message: 'Đã tạo bản ghi tracking mới',
                updated: true
              });
            }
          }
          
        } catch (error) {
          console.error(`Error processing order code ${ghnOrderCode}:`, error);
          results.push({
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
          message: `Đã xử lý ${orderCodes.length} mã đơn hàng, đồng bộ thành công ${results.filter(r => r.updated).length} đơn hàng`,
          results 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );

    } else if (action === 'bulk_sync') {
      // Sync all orders from the orders table that have GHN order codes
      const { data: orders, error: ordersError } = await supabaseClient
        .from('orders')
        .select('id, order_number, items')
        .not('items', 'is', null);

      if (ordersError) {
        throw ordersError;
      }

      const results = [];
      
      for (const order of orders) {
        // Extract GHN order code from items JSON
        let ghnOrderCode = null;
        if (order.items && Array.isArray(order.items)) {
          for (const item of order.items) {
            if (item.ghn_order_code) {
              ghnOrderCode = item.ghn_order_code;
              break;
            }
          }
        }
        
        if (!ghnOrderCode) {
          console.log(`No GHN order code found for order ${order.order_number}`);
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
              order_code: ghnOrderCode
            })
          });

          if (ghnResponse.ok) {
            const ghnData = await ghnResponse.json();
            if (ghnData.code === 200) {
              const orderData = ghnData.data;
              
              // Check if tracking record exists
              const { data: existingTracking } = await supabaseClient
                .from('ghn_tracking')
                .select('id')
                .eq('ghn_order_code', ghnOrderCode)
                .maybeSingle();

              const trackingRecord = {
                order_id: order.id,
                ghn_order_code: orderData.order_code,
                ghn_status: orderData.status,
                ghn_status_text: getStatusText(orderData.status),
                customer_name: orderData.to_name,
                customer_phone: orderData.to_phone,
                customer_address: `${orderData.to_address}, ${orderData.to_ward_name || ''}, ${orderData.to_district_name || ''}, ${orderData.to_province_name || ''}`,
                package_weight: orderData.weight,
                created_date: orderData.created_date,
                expected_delivery_date: orderData.expected_delivery_time,
                delivered_date: orderData.delivered_date,
                cod_amount: orderData.cod_amount,
                tracking_url: `https://tracking.ghn.dev/?order_code=${orderData.order_code}`,
                raw_data: orderData,
                tenant_id: 'default'
              };

              if (existingTracking) {
                // Update existing record
                await supabaseClient
                  .from('ghn_tracking')
                  .update(trackingRecord)
                  .eq('id', existingTracking.id);
              } else {
                // Create new record
                await supabaseClient
                  .from('ghn_tracking')
                  .insert(trackingRecord);
              }

              results.push({
                orderCode: ghnOrderCode,
                orderNumber: order.order_number,
                status: orderData.status,
                statusText: getStatusText(orderData.status),
                updated: true
              });
            } else {
              results.push({
                orderCode: ghnOrderCode,
                orderNumber: order.order_number,
                error: ghnData.message || 'GHN API error',
                updated: false
              });
            }
          } else {
            results.push({
              orderCode: ghnOrderCode,
              orderNumber: order.order_number,
              error: `HTTP ${ghnResponse.status}: ${ghnResponse.statusText}`,
              updated: false
            });
          }
        } catch (error) {
          console.error(`Error updating order ${order.order_number} (${ghnOrderCode}):`, error);
          results.push({
            orderCode: ghnOrderCode,
            orderNumber: order.order_number,
            error: error.message,
            updated: false
          });
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Đã đồng bộ ${results.filter(r => r.updated).length}/${orders.length} đơn hàng từ hệ thống`,
          results 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );

    } else if (action === 'fetch_all_orders') {
      // Fetch all orders from GHN system
      let allOrders = [];
      let offset = 0;
      const limit = 50;
      let hasMore = true;

      while (hasMore) {
        try {
          console.log(`Fetching orders from GHN - offset: ${offset}, limit: ${limit}`);
          
          const ghnResponse = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/list`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Token': ghnApiKey,
            },
            body: JSON.stringify({
              offset: offset,
              limit: limit
            })
          });

          console.log(`GHN API Response Status: ${ghnResponse.status}`);

          if (!ghnResponse.ok) {
            const errorText = await ghnResponse.text();
            console.error(`GHN API error: ${ghnResponse.status} - ${errorText}`);
            throw new Error(`GHN API error: ${ghnResponse.statusText}`);
          }

          const ghnData = await ghnResponse.json();
          console.log(`GHN API Response:`, JSON.stringify(ghnData, null, 2));
          
          if (ghnData.code !== 200) {
            console.error(`GHN API error: ${ghnData.message}`);
            throw new Error(`GHN API error: ${ghnData.message}`);
          }

          const orders = ghnData.data?.orders || ghnData.data || [];
          console.log(`Found ${orders.length} orders in this batch`);
          allOrders.push(...orders);
          
          // Check if we have more data
          hasMore = orders.length === limit;
          offset += limit;
          
          // Safety break to avoid infinite loop
          if (offset > 500) { // Reduced limit for safety
            console.log('Reached maximum offset limit');
            break;
          }
        } catch (error) {
          console.error('Error fetching orders from GHN:', error);
          // Return error response instead of throwing
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Lỗi khi lấy dữ liệu từ GHN: ${error.message}`,
              details: error.message
            }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400 
            }
          );
        }
      }

      console.log(`Fetched ${allOrders.length} orders from GHN`);

      // Process each order to get detailed information and save to database
      const results = [];
      
      for (const order of allOrders) {
        try {
          // Get detailed order information
          const detailResponse = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Token': ghnApiKey,
            },
            body: JSON.stringify({
              order_code: order.order_code
            })
          });

          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            if (detailData.code === 200) {
              const orderData = detailData.data;
              
              // Check if tracking record exists
              const { data: existingTracking } = await supabaseClient
                .from('ghn_tracking')
                .select('id')
                .eq('ghn_order_code', orderData.order_code)
                .maybeSingle();

              const trackingRecord = {
                order_id: null, // No local order mapping initially
                ghn_order_code: orderData.order_code,
                ghn_status: orderData.status,
                ghn_status_text: getStatusText(orderData.status),
                customer_name: orderData.to_name,
                customer_phone: orderData.to_phone,
                customer_address: `${orderData.to_address}, ${orderData.to_ward_name || ''}, ${orderData.to_district_name || ''}, ${orderData.to_province_name || ''}`,
                package_weight: orderData.weight,
                created_date: orderData.created_date,
                expected_delivery_date: orderData.expected_delivery_time,
                delivered_date: orderData.delivered_date,
                cod_amount: orderData.cod_amount,
                tracking_url: `https://tracking.ghn.dev/?order_code=${orderData.order_code}`,
                raw_data: orderData,
                tenant_id: 'default'
              };

              if (existingTracking) {
                // Update existing record
                await supabaseClient
                  .from('ghn_tracking')
                  .update(trackingRecord)
                  .eq('id', existingTracking.id);
                
                results.push({
                  orderCode: orderData.order_code,
                  status: orderData.status,
                  statusText: getStatusText(orderData.status),
                  action: 'updated'
                });
              } else {
                // Create new record
                await supabaseClient
                  .from('ghn_tracking')
                  .insert(trackingRecord);
                
                results.push({
                  orderCode: orderData.order_code,
                  status: orderData.status,
                  statusText: getStatusText(orderData.status),
                  action: 'created'
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error processing order ${order.order_code}:`, error);
          results.push({
            orderCode: order.order_code,
            error: error.message,
            action: 'error'
          });
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Đã lấy ${allOrders.length} đơn hàng từ GHN. Đồng bộ thành công ${results.filter(r => r.action !== 'error').length} đơn hàng`,
          totalFetched: allOrders.length,
          totalSynced: results.filter(r => r.action !== 'error').length,
          results: results.slice(0, 20) // Only return first 20 results to avoid large response
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