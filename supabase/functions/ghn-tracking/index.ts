import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GHNOrder {
  order_code: string;
  status: string;
  to_name: string;
  to_phone: string;
  to_address: string;
  to_ward_name?: string;
  to_district_name?: string;
  to_province_name?: string;
  weight: number;
  created_date: string;
  leadtime?: string;  // GHN API uses 'leadtime' for expected delivery
  finish_date?: string;  // GHN API uses 'finish_date' for actual delivery
  cod_amount: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ghnApiKey = Deno.env.get('GHN_API_KEY');
    if (!ghnApiKey) {
      throw new Error('GHN API key not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestBody = await req.json();
    const { action } = requestBody;
    console.log(`Processing action: ${action}`);

    if (action === 'fetch_all_orders') {
      // Fetch all orders from GHN system
      let allOrders: GHNOrder[] = [];
      let offset = 0;
      const limit = 50;
      let hasMore = true;

      console.log('Starting to fetch orders from GHN...');

      while (hasMore && offset < 500) { // Safety limit
        try {
          console.log(`Fetching batch - offset: ${offset}, limit: ${limit}`);
          
          const response = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Token': ghnApiKey,
            },
            body: JSON.stringify({
              offset: offset,
              limit: limit,
              client_id: null
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`GHN API error: ${response.status} - ${errorText}`);
            break;
          }

          const data = await response.json();
          console.log(`GHN Response code: ${data.code}, message: ${data.message || 'OK'}`);
          
          if (data.code !== 200) {
            console.error(`GHN API error: ${data.message}`);
            break;
          }

          const orders = data.data?.orders || data.data || [];
          console.log(`Found ${orders.length} orders in this batch`);
          
          if (orders.length === 0) {
            hasMore = false;
            break;
          }

          // Get detailed information for each order
          for (const order of orders) {
            try {
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
                  allOrders.push(detailData.data);
                }
              }
            } catch (error) {
              console.error(`Error getting details for order ${order.order_code}:`, error);
            }
          }

          hasMore = orders.length === limit;
          offset += limit;
          
        } catch (error) {
          console.error('Error in batch fetch:', error);
          break;
        }
      }

      console.log(`Successfully fetched ${allOrders.length} orders from GHN`);

      // Transform data for frontend
      const transformedOrders = allOrders.map(order => {
        // Extract order number from customer name - improved regex patterns
        let extractedOrderNumber = '';
        
        // Try multiple patterns: _3203, 3203, or any number sequence
        const patterns = [
          /_(\d+)/,           // Pattern like "hà thu _3203 hoan"
          /(\d{4,})/,         // Any 4+ digit number
          /\b(\d+)\b/         // Any standalone number
        ];
        
        for (const pattern of patterns) {
          const match = order.to_name.match(pattern);
          if (match) {
            extractedOrderNumber = match[1];
            break;
          }
        }
        
        console.log(`Order ${order.order_code}: Customer name "${order.to_name}" → Extracted order number: "${extractedOrderNumber}"`);
        
        return {
          orderCode: order.order_code,
          orderNumber: extractedOrderNumber,
          status: order.status,
          statusText: getStatusText(order.status),
          customerName: order.to_name,
          customerPhone: order.to_phone,
          customerAddress: `${order.to_address}${order.to_ward_name ? ', ' + order.to_ward_name : ''}${order.to_district_name ? ', ' + order.to_district_name : ''}${order.to_province_name ? ', ' + order.to_province_name : ''}`,
          weight: order.weight,
          createdDate: order.created_date,
          expectedDeliveryTime: order.leadtime,  // Use correct GHN field
          deliveredDate: order.finish_date,      // Use correct GHN field
          codAmount: order.cod_amount,
          trackingUrl: `https://donhang.ghn.vn/?order_code=${order.order_code}`
        };
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Đã lấy ${allOrders.length} đơn hàng từ GHN`,
          data: transformedOrders
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );

    } else if (action === 'track_order') {
      // Track single order by order code  
      const { orderCode } = requestBody;
      
      if (!orderCode) {
        throw new Error('Order code is required');
      }

      const response = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Token': ghnApiKey,
        },
        body: JSON.stringify({
          order_code: orderCode
        })
      });

      if (!response.ok) {
        throw new Error(`GHN API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.code !== 200) {
        throw new Error(data.message || 'Order not found');
      }

      const order = data.data;
      
      // Extract order number from customer name - improved regex patterns
      let extractedOrderNumber = '';
      
      const patterns = [
        /_(\d+)/,           // Pattern like "hà thu _3203 hoan"
        /(\d{4,})/,         // Any 4+ digit number
        /\b(\d+)\b/         // Any standalone number
      ];
      
      for (const pattern of patterns) {
        const match = order.to_name.match(pattern);
        if (match) {
          extractedOrderNumber = match[1];
          break;
        }
      }
      
      console.log(`Track order ${order.order_code}: Customer name "${order.to_name}" → Extracted order number: "${extractedOrderNumber}"`);
      
      const transformedOrder = {
        orderCode: order.order_code,
        orderNumber: extractedOrderNumber,
        status: order.status,
        statusText: getStatusText(order.status),
        customerName: order.to_name,
        customerPhone: order.to_phone,
        customerAddress: `${order.to_address}${order.to_ward_name ? ', ' + order.to_ward_name : ''}${order.to_district_name ? ', ' + order.to_district_name : ''}${order.to_province_name ? ', ' + order.to_province_name : ''}`,
        weight: order.weight,
        createdDate: order.created_date,
        expectedDeliveryTime: order.leadtime,  // Use correct GHN field
        deliveredDate: order.finish_date,      // Use correct GHN field
        codAmount: order.cod_amount,
        trackingUrl: `https://donhang.ghn.vn/?order_code=${order.order_code}`
      };

      return new Response(
        JSON.stringify({ 
          success: true, 
          data: transformedOrder
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );

    } else if (action === 'save_tracking') {
      // Save order tracking to database
      const { orderCode, userId, managerId } = requestBody;
      
      if (!orderCode) {
        throw new Error('Order code is required');
      }

      // First get order details from GHN
      const response = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Token': ghnApiKey,
        },
        body: JSON.stringify({
          order_code: orderCode
        })
      });

      if (!response.ok) {
        throw new Error(`GHN API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.code !== 200) {
        throw new Error(data.message || 'Order not found');
      }

      const order = data.data;
      
      // Extract order number from customer name - improved regex patterns
      let extractedOrderNumber = '';
      
      const patterns = [
        /_(\d+)/,           // Pattern like "hà thu _3203 hoan"
        /(\d{4,})/,         // Any 4+ digit number
        /\b(\d+)\b/         // Any standalone number
      ];
      
      for (const pattern of patterns) {
        const match = order.to_name.match(pattern);
        if (match) {
          extractedOrderNumber = match[1];
          break;
        }
      }
      
      console.log(`Save tracking ${order.order_code}: Customer name "${order.to_name}" → Extracted order number: "${extractedOrderNumber}"`);
      
      // Prepare data for database
      const trackingData = {
        ghn_order_code: order.order_code,
        internal_order_code: extractedOrderNumber,
        customer_name: order.to_name,
        customer_name_raw: order.to_name,
        customer_phone: order.to_phone,
        customer_address: `${order.to_address}${order.to_ward_name ? ', ' + order.to_ward_name : ''}${order.to_district_name ? ', ' + order.to_district_name : ''}${order.to_province_name ? ', ' + order.to_province_name : ''}`,
        package_weight: order.weight,
        created_date: order.created_date,
        expected_delivery_date: order.leadtime,    // Use correct GHN field
        delivered_date: order.finish_date,         // Use correct GHN field
        cod_amount: order.cod_amount,
        ghn_status: order.status,
        ghn_status_text: getStatusText(order.status),
        tracking_url: `https://donhang.ghn.vn/?order_code=${order.order_code}`,
        raw_data: order,
        manager_id: managerId,
        last_updated_at: new Date().toISOString()
      };

      // Check if record exists
      const { data: existingRecord } = await supabase
        .from('ghn_tracking')
        .select('id')
        .eq('ghn_order_code', order.order_code)
        .single();

      let result;
      if (existingRecord) {
        // Update existing record
        result = await supabase
          .from('ghn_tracking')
          .update(trackingData)
          .eq('ghn_order_code', order.order_code);
      } else {
        // Insert new record
        result = await supabase
          .from('ghn_tracking')
          .insert(trackingData);
      }

      if (result.error) {
        throw new Error(`Database error: ${result.error.message}`);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Đã ${existingRecord ? 'cập nhật' : 'thêm'} tracking cho đơn hàng ${orderCode}`,
          data: {
            orderCode: order.order_code,
            orderNumber: extractedOrderNumber,
            status: order.status,
            statusText: getStatusText(order.status),
            customerName: order.to_name,
            customerPhone: order.to_phone,
            customerAddress: trackingData.customer_address,
            weight: order.weight,
            createdDate: order.created_date,
            expectedDeliveryTime: order.leadtime,    // Use correct GHN field
            deliveredDate: order.finish_date,        // Use correct GHN field
            codAmount: order.cod_amount,
            trackingUrl: trackingData.tracking_url
          }
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );

    } else if (action === 'update_all_tracking') {
      // Update all tracking records in database
      const { managerId } = requestBody;
      
      // Get all tracking records for this manager
      const { data: trackingRecords, error: fetchError } = await supabase
        .from('ghn_tracking')
        .select('ghn_order_code')
        .eq('manager_id', managerId);

      if (fetchError) {
        throw new Error(`Database error: ${fetchError.message}`);
      }

      let updateCount = 0;
      let errorCount = 0;

      // Update each record
      for (const record of trackingRecords || []) {
        try {
          const response = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Token': ghnApiKey,
            },
            body: JSON.stringify({
              order_code: record.ghn_order_code
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.code === 200) {
              const order = data.data;
              
              // Update tracking data
              const updateData = {
                ghn_status: order.status,
                ghn_status_text: getStatusText(order.status),
                expected_delivery_date: order.leadtime,     // Use correct GHN field
                delivered_date: order.finish_date,          // Use correct GHN field
                raw_data: order,
                last_updated_at: new Date().toISOString()
              };

              const { error: updateError } = await supabase
                .from('ghn_tracking')
                .update(updateData)
                .eq('ghn_order_code', record.ghn_order_code);

              if (!updateError) {
                updateCount++;
              } else {
                errorCount++;
                console.error(`Update error for ${record.ghn_order_code}:`, updateError);
              }
            }
          }
        } catch (error) {
          errorCount++;
          console.error(`Error updating ${record.ghn_order_code}:`, error);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Đã cập nhật ${updateCount} đơn hàng${errorCount > 0 ? `, ${errorCount} lỗi` : ''}`,
          data: { updateCount, errorCount }
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
    'ready_to_pick': 'Sẵn sàng lấy hàng',
    'picking': 'Đang lấy hàng',
    'cancel': 'Đã hủy',
    'money_collect_picking': 'Đang thu tiền người gửi',
    'picked': 'Đã lấy hàng',
    'storing': 'Đang lưu kho',
    'transporting': 'Đang vận chuyển',
    'sorting': 'Đang phân loại',
    'delivering': 'Đang giao hàng',
    'money_collect_delivering': 'Đang thu tiền người nhận',
    'delivered': 'Đã giao hàng',
    'delivery_fail': 'Giao hàng thất bại',
    'waiting_to_return': 'Đang chờ trả hàng',
    'return': 'Trả hàng',
    'return_transporting': 'Đang vận chuyển trả hàng',
    'return_sorting': 'Đang phân loại trả hàng',
    'returning': 'Đang trả hàng',
    'return_fail': 'Trả hàng thất bại',
    'returned': 'Hoàn hàng thành công',
    'exception': 'Đơn hàng ngoại lệ',
    'damage': 'Hàng bị hư hỏng',
    'lost': 'Hàng bị thất lạc'
  };
  
  return statusMap[status] || status;
}