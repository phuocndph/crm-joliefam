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
  leadtime?: string;
  finish_date?: string;
  cod_amount: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ghnApiKey = Deno.env.get('GHN_API_KEY');
    if (!ghnApiKey) {
      throw new Error('GHN API key not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestBody = await req.json();
    const { action } = requestBody;
    console.log(`Processing action: ${action}`);

    // ==================== LOCATION ACTIONS ====================
    if (action === 'get_provinces') {
      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/master-data/province', {
        method: 'GET',
        headers: { 'Token': ghnApiKey, 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      return new Response(JSON.stringify({ success: true, data: data.data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_districts') {
      const { provinceId } = requestBody;
      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/master-data/district', {
        method: 'POST',
        headers: { 'Token': ghnApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ province_id: provinceId }),
      });
      const data = await response.json();
      return new Response(JSON.stringify({ success: true, data: data.data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'get_wards') {
      const { districtId } = requestBody;
      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/master-data/ward', {
        method: 'POST',
        headers: { 'Token': ghnApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ district_id: districtId }),
      });
      const data = await response.json();
      return new Response(JSON.stringify({ success: true, data: data.data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== SHOP ACTION ====================
    if (action === 'get_shops') {
      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/shop/all', {
        method: 'POST',
        headers: { 'Token': ghnApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ offset: 0, limit: 50, client_phone: "" }),
      });
      const data = await response.json();
      return new Response(JSON.stringify({ success: true, data: data.data?.shops || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== SERVICES ACTION ====================
    if (action === 'get_services') {
      const { fromDistrictId, toDistrictId, shopId } = requestBody;
      const effectiveShopId = shopId || Deno.env.get('GHN_SHOP_ID');
      if (!effectiveShopId) throw new Error('Shop ID not provided');
      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services', {
        method: 'POST',
        headers: { 'Token': ghnApiKey, 'Content-Type': 'application/json', 'ShopId': String(effectiveShopId) },
        body: JSON.stringify({ shop_id: parseInt(String(effectiveShopId)), from_district: fromDistrictId, to_district: toDistrictId }),
      });
      const data = await response.json();
      console.log('GHN services response:', JSON.stringify(data));
      return new Response(JSON.stringify({ success: true, data: data.data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== CALCULATE FEE ACTION ====================
    if (action === 'calculate_fee') {
      const { feeData, shopId } = requestBody;
      const effectiveShopId = shopId || Deno.env.get('GHN_SHOP_ID');
      if (!effectiveShopId) throw new Error('Shop ID not provided');
      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee', {
        method: 'POST',
        headers: { 'Token': ghnApiKey, 'Content-Type': 'application/json', 'ShopId': String(effectiveShopId) },
        body: JSON.stringify({ shop_id: parseInt(String(effectiveShopId)), ...feeData }),
      });
      const data = await response.json();
      console.log('GHN fee response:', JSON.stringify(data));
      if (data.code !== 200) throw new Error(data.message || 'Cannot calculate fee');
      return new Response(JSON.stringify({ success: true, data: data.data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== CREATE ORDER ACTION ====================
    if (action === 'create_order') {
      const ghnShopId = Deno.env.get('GHN_SHOP_ID');
      if (!ghnShopId) throw new Error('GHN_SHOP_ID not configured');

      const { orderData, orderId, orderNumber } = requestBody;
      console.log('Creating GHN order for:', orderNumber);

      const ghnPayload = {
        ...orderData,
        shop_id: parseInt(ghnShopId),
      };

      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Token': ghnApiKey,
          'ShopId': ghnShopId,
        },
        body: JSON.stringify(ghnPayload),
      });

      const data = await response.json();
      console.log('GHN create response:', JSON.stringify(data));

      if (data.code !== 200) {
        throw new Error(data.message || 'GHN API error');
      }

      const orderCode = data.data?.order_code;
      if (!orderCode) throw new Error('No order code returned from GHN');

      // Save tracking record
      const trackingData = {
        ghn_order_code: orderCode,
        internal_order_code: orderNumber,
        order_id: orderId,
        customer_name: orderData.to_name,
        customer_phone: orderData.to_phone,
        customer_address: orderData.to_address,
        cod_amount: orderData.cod_amount || 0,
        ghn_status: 'ready_to_pick',
        ghn_status_text: 'Sẵn sàng lấy hàng',
        tracking_url: `https://donhang.ghn.vn/?order_code=${orderCode}`,
        raw_data: data.data,
        last_updated_at: new Date().toISOString(),
      };

      const { error: dbError } = await supabase.from('ghn_tracking').insert(trackingData);
      if (dbError) {
        console.error('DB save error:', dbError);
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Đã tạo đơn GHN: ${orderCode}`,
        data: { order_code: orderCode, ...data.data },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== EXISTING ACTIONS ====================
    if (action === 'fetch_all_orders') {
      let allOrders: GHNOrder[] = [];
      let offset = 0;
      const limit = 50;
      let hasMore = true;

      while (hasMore && offset < 500) {
        try {
          const response = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Token': ghnApiKey },
            body: JSON.stringify({ offset, limit, client_id: null }),
          });

          if (!response.ok) break;
          const data = await response.json();
          if (data.code !== 200) break;

          const orders = data.data?.orders || data.data || [];
          if (orders.length === 0) { hasMore = false; break; }

          for (const order of orders) {
            try {
              const detailResponse = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Token': ghnApiKey },
                body: JSON.stringify({ order_code: order.order_code }),
              });
              if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                if (detailData.code === 200) allOrders.push(detailData.data);
              }
            } catch (error) {
              console.error(`Error getting details for ${order.order_code}:`, error);
            }
          }

          hasMore = orders.length === limit;
          offset += limit;
        } catch (error) {
          console.error('Error in batch fetch:', error);
          break;
        }
      }

      const transformedOrders = allOrders.map(order => transformOrder(order));

      return new Response(JSON.stringify({
        success: true,
        message: `Đã lấy ${allOrders.length} đơn hàng từ GHN`,
        data: transformedOrders,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'track_order') {
      const { orderCode } = requestBody;
      if (!orderCode) throw new Error('Order code is required');

      const order = await fetchOrderDetail(ghnApiKey, orderCode);
      return new Response(JSON.stringify({ success: true, data: transformOrder(order) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'save_tracking') {
      const { orderCode, managerId } = requestBody;
      if (!orderCode) throw new Error('Order code is required');

      const order = await fetchOrderDetail(ghnApiKey, orderCode);
      const extractedOrderNumber = extractOrderNumber(order.to_name);

      const trackingData = {
        ghn_order_code: order.order_code,
        internal_order_code: extractedOrderNumber,
        customer_name: order.to_name,
        customer_name_raw: order.to_name,
        customer_phone: order.to_phone,
        customer_address: buildAddress(order),
        package_weight: order.weight,
        created_date: order.created_date,
        expected_delivery_date: order.leadtime,
        delivered_date: order.finish_date,
        cod_amount: order.cod_amount,
        ghn_status: order.status,
        ghn_status_text: getStatusText(order.status),
        tracking_url: `https://donhang.ghn.vn/?order_code=${order.order_code}`,
        raw_data: order,
        manager_id: managerId,
        last_updated_at: new Date().toISOString(),
      };

      const { data: existingRecord } = await supabase
        .from('ghn_tracking').select('id').eq('ghn_order_code', order.order_code).single();

      const result = existingRecord
        ? await supabase.from('ghn_tracking').update(trackingData).eq('ghn_order_code', order.order_code)
        : await supabase.from('ghn_tracking').insert(trackingData);

      if (result.error) throw new Error(`Database error: ${result.error.message}`);

      return new Response(JSON.stringify({
        success: true,
        message: `Đã ${existingRecord ? 'cập nhật' : 'thêm'} tracking cho đơn hàng ${orderCode}`,
        data: transformOrder(order),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update_all_tracking') {
      const { managerId } = requestBody;
      const { data: trackingRecords, error: fetchError } = await supabase
        .from('ghn_tracking').select('ghn_order_code').eq('manager_id', managerId);
      if (fetchError) throw new Error(`Database error: ${fetchError.message}`);

      let updateCount = 0, errorCount = 0;

      for (const record of trackingRecords || []) {
        try {
          const response = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Token': ghnApiKey },
            body: JSON.stringify({ order_code: record.ghn_order_code }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.code === 200) {
              const order = data.data;
              const { error: updateError } = await supabase
                .from('ghn_tracking')
                .update({
                  ghn_status: order.status,
                  ghn_status_text: getStatusText(order.status),
                  expected_delivery_date: order.leadtime,
                  delivered_date: order.finish_date,
                  raw_data: order,
                  last_updated_at: new Date().toISOString(),
                })
                .eq('ghn_order_code', record.ghn_order_code);
              if (!updateError) updateCount++; else errorCount++;
            }
          }
        } catch {
          errorCount++;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Đã cập nhật ${updateCount} đơn hàng${errorCount > 0 ? `, ${errorCount} lỗi` : ''}`,
        data: { updateCount, errorCount },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action specified');

  } catch (error) {
    console.error('GHN Tracking Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

// ==================== HELPER FUNCTIONS ====================

async function fetchOrderDetail(ghnApiKey: string, orderCode: string) {
  const response = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Token': ghnApiKey },
    body: JSON.stringify({ order_code: orderCode }),
  });
  if (!response.ok) throw new Error(`GHN API error: ${response.statusText}`);
  const data = await response.json();
  if (data.code !== 200) throw new Error(data.message || 'Order not found');
  return data.data;
}

function extractOrderNumber(toName: string): string {
  const patterns = [/_(\d+)/, /(\d{4,})/, /\b(\d+)\b/];
  for (const pattern of patterns) {
    const match = toName.match(pattern);
    if (match) return match[1];
  }
  return '';
}

function buildAddress(order: any): string {
  return `${order.to_address}${order.to_ward_name ? ', ' + order.to_ward_name : ''}${order.to_district_name ? ', ' + order.to_district_name : ''}${order.to_province_name ? ', ' + order.to_province_name : ''}`;
}

function transformOrder(order: any) {
  return {
    orderCode: order.order_code,
    orderNumber: extractOrderNumber(order.to_name),
    status: order.status,
    statusText: getStatusText(order.status),
    customerName: order.to_name,
    customerPhone: order.to_phone,
    customerAddress: buildAddress(order),
    weight: order.weight,
    createdDate: order.created_date,
    expectedDeliveryTime: order.leadtime,
    deliveredDate: order.finish_date,
    codAmount: order.cod_amount,
    trackingUrl: `https://donhang.ghn.vn/?order_code=${order.order_code}`,
  };
}

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
    'lost': 'Hàng bị thất lạc',
  };
  return statusMap[status] || status;
}
