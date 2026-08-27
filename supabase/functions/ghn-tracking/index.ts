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

// These statuses are terminal from the CRM tracking perspective. A record
// with one of them must not be sent to GHN again by bulk/periodic scans.
const TERMINAL_GHN_STATUSES = new Set([
  'delivered',
  'returned',
  'cancel',
  'cancelled',
  'lost',
  'damage',
]);
const TERMINAL_CRM_ORDER_STATUSES = new Set([
  'delivered',
  'self_delivered',
  'cancelled',
  'returned',
]);

const isTerminalGhnStatus = (status?: string | null) =>
  Boolean(status && TERMINAL_GHN_STATUSES.has(status));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check: require valid Supabase JWT
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: userData, error: authError } = await authClient.auth.getUser(authHeader);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ghnApiKey = Deno.env.get('GHN_API_KEY');
    if (!ghnApiKey) {
      throw new Error('GHN API key not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestBody = await req.json();
    let { action } = requestBody;
    // Older cron/UI callers use `bulk_sync`; keep it as a compatibility alias
    // for the filtered all-tracking path below.
    if (action === 'bulk_sync') action = 'update_all_tracking';
    console.log(`Processing action: ${action}`);

    // ==================== ADDRESS AUTOCOMPLETE (GOONG MAPS) ====================
    if (action === 'address_autocomplete') {
      const goongApiKey = Deno.env.get('GOONG_API_KEY');
      if (!goongApiKey) {
        throw new Error('GOONG_API_KEY not configured');
      }
      const { input } = requestBody;
      if (!input || input.length < 2) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const goongUrl = `https://rsapi.goong.io/Place/AutoComplete?api_key=${goongApiKey}&input=${encodeURIComponent(input)}`;
      const response = await fetch(goongUrl);
      const data = await response.json();
      console.log('Goong autocomplete results:', data?.predictions?.length || 0);
      return new Response(JSON.stringify({
        success: true,
        data: (data?.predictions || []).map((p: any) => ({
          description: p.description,
          place_id: p.place_id,
          main_text: p.structured_formatting?.main_text || '',
          secondary_text: p.structured_formatting?.secondary_text || '',
        }))
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
      console.log('GHN fee request payload:', JSON.stringify({ shop_id: parseInt(String(effectiveShopId)), ...feeData }));
      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee', {
        method: 'POST',
        headers: { 'Token': ghnApiKey, 'Content-Type': 'application/json', 'ShopId': String(effectiveShopId) },
        body: JSON.stringify({ shop_id: parseInt(String(effectiveShopId)), ...feeData }),
      });
      const data = await response.json();
      console.log('GHN fee response:', JSON.stringify(data));
      if (data.code !== 200) {
        const detail = data.code_message_value ? JSON.stringify(data.code_message_value) : '';
        throw new Error(`${data.message || 'Lỗi tính cước GHN'}${detail ? ` - Chi tiết: ${detail}` : ''}`);
      }
      return new Response(JSON.stringify({ success: true, data: data.data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== CREATE ORDER ACTION ====================
    if (action === 'create_order') {
      const { orderData, orderId, orderNumber, shopId } = requestBody;
      const effectiveShopId = shopId || Deno.env.get('GHN_SHOP_ID');
      if (!effectiveShopId) throw new Error('Shop ID not provided');

      console.log('Creating GHN order for:', orderNumber, 'shop:', effectiveShopId);

      const ghnPayload = {
        ...orderData,
        shop_id: parseInt(String(effectiveShopId)),
      };

      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Token': ghnApiKey,
          'ShopId': String(effectiveShopId),
        },
        body: JSON.stringify(ghnPayload),
      });

      const data = await response.json();
      console.log('GHN create response:', JSON.stringify(data));

      if (data.code !== 200) {
        const detail = data.code_message_value ? JSON.stringify(data.code_message_value) : '';
        throw new Error(`${data.message || 'Lỗi tạo đơn GHN'}${detail ? ` - Chi tiết: ${detail}` : ''}`);
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
            // The list endpoint already includes a status. Avoid the much
            // more expensive detail request for orders GHN has finalized.
            if (isTerminalGhnStatus(order.status)) continue;
            try {
              const detailResponse = await fetch(`https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Token': ghnApiKey },
                body: JSON.stringify({ order_code: order.order_code }),
              });
              if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                if (detailData.code === 200 && !isTerminalGhnStatus(detailData.data?.status)) {
                  allOrders.push(detailData.data);
                }
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

      // Fetch detail and logs in parallel
      const [order, logs] = await Promise.all([
        fetchOrderDetail(ghnApiKey, orderCode),
        fetchOrderLogs(ghnApiKey, orderCode),
      ]);
      return new Response(JSON.stringify({ success: true, data: { ...transformOrder(order), rawData: order, logs } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'save_tracking') {
      const { orderCode, managerId } = requestBody;
      if (!orderCode) throw new Error('Order code is required');

      // A manual refresh can come from the page auto-sync as well. Check the
      // linked CRM order before calling GHN so completed/cancelled orders are
      // protected regardless of which UI action initiated the refresh.
      const { data: existingRecord } = await supabase
        .from('ghn_tracking')
        .select('id, order_id, orders(status)')
        .eq('ghn_order_code', orderCode)
        .maybeSingle();
      const linkedOrderStatus = Array.isArray(existingRecord?.orders)
        ? existingRecord.orders[0]?.status
        : existingRecord?.orders?.status;
      if (TERMINAL_CRM_ORDER_STATUSES.has(linkedOrderStatus)) {
        return new Response(JSON.stringify({
          success: true,
          skipped: true,
          message: `Bỏ qua đơn ${orderCode}: đơn CRM đã hoàn tất hoặc đã hủy`,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

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
        expected_delivery_date: normalizeGhnDate(order.leadtime),
        delivered_date: normalizeGhnDate(order.finish_date),
        cod_amount: order.cod_amount,
        ghn_status: order.status,
        ghn_status_text: getStatusText(order.status),
        tracking_url: `https://donhang.ghn.vn/?order_code=${order.order_code}`,
        raw_data: order,
        manager_id: managerId,
        last_updated_at: new Date().toISOString(),
      };

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
      const { managerId, staleBefore } = requestBody;
      let trackingQuery = supabase
        .from('ghn_tracking')
        .select('ghn_order_code, ghn_status, order_id, orders(status)')
        // Select stale candidates first. Terminal GHN statuses are filtered
        // below in the same server invocation; using two `.or()` calls here
        // can overwrite one another in PostgREST query construction.
      if (managerId) trackingQuery = trackingQuery.eq('manager_id', managerId);
      // Page-open refreshes only need records that have not been checked
      // recently. The scheduled job may omit this bound to catch all stale
      // records on its normal hourly run.
      if (staleBefore) trackingQuery = trackingQuery.or(`last_updated_at.is.null,last_updated_at.lt.${staleBefore}`);
      trackingQuery = trackingQuery
        .order('last_updated_at', { ascending: true, nullsFirst: true })
        .limit(500);
      const { data: trackingRecords, error: fetchError } = await trackingQuery;
      if (fetchError) throw new Error(`Database error: ${fetchError.message}`);

      let updateCount = 0, errorCount = 0;

      for (const record of (trackingRecords || []).filter((candidate: any) => {
        if (isTerminalGhnStatus(candidate.ghn_status)) return false;
        const orderStatus = Array.isArray(candidate.orders)
          ? candidate.orders[0]?.status
          : candidate.orders?.status;
        return !TERMINAL_CRM_ORDER_STATUSES.has(orderStatus);
      }).slice(0, 200)) {
        if (isTerminalGhnStatus(record.ghn_status)) continue;
        const orderStatus = Array.isArray(record.orders) ? record.orders[0]?.status : record.orders?.status;
        if (TERMINAL_CRM_ORDER_STATUSES.has(orderStatus)) continue;
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
                   expected_delivery_date: normalizeGhnDate(order.leadtime),
                   delivered_date: normalizeGhnDate(order.finish_date),
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

    // ==================== GET LIVE ORDER DETAIL (for Edit dialog prefill) ====================
    if (action === 'get_order_detail') {
      const { orderCode } = requestBody;
      if (!orderCode) throw new Error('Order code is required');

      const order = await fetchOrderDetail(ghnApiKey, orderCode);

      // Sync snapshot back to DB so các trang khác cũng có dữ liệu mới nhất
      try {
        await supabase
          .from('ghn_tracking')
          .update({
            customer_name: order.to_name ?? undefined,
            customer_phone: order.to_phone ?? undefined,
            customer_address: buildAddress(order),
            package_weight: order.weight ?? undefined,
            cod_amount: order.cod_amount ?? 0,
            ghn_status: order.status,
            ghn_status_text: getStatusText(order.status),
            created_date: order.created_date,
            expected_delivery_date: normalizeGhnDate(order.leadtime),
            delivered_date: normalizeGhnDate(order.finish_date),
            raw_data: order,
            last_updated_at: new Date().toISOString(),
          })
          .eq('ghn_order_code', order.order_code);
      } catch (e) {
        console.warn('get_order_detail: snapshot sync failed', e);
      }

      return new Response(JSON.stringify({ success: true, data: order }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== UPDATE ORDER ACTION ====================
    if (action === 'update_order') {
      const { orderCode, updateData, shopId } = requestBody;
      if (!orderCode) throw new Error('Order code is required');
      const effectiveShopId = shopId || Deno.env.get('GHN_SHOP_ID');
      if (!effectiveShopId) throw new Error('Shop ID not provided');

      console.log('Updating GHN order:', orderCode);

      const ghnPayload = {
        order_code: orderCode,
        ...updateData,
      };

      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Token': ghnApiKey,
          'ShopId': String(effectiveShopId),
        },
        body: JSON.stringify(ghnPayload),
      });

      const data = await response.json();
      console.log('GHN update response:', JSON.stringify(data));

      if (data.code !== 200) {
        const detail = data.code_message_value ? JSON.stringify(data.code_message_value) : '';
        const raw = data.message || 'Lỗi cập nhật đơn GHN';
        // Dịch lỗi phổ biến "Not support change field: X with order status: Y"
        const m = /Not support change field:\s*([^\s]+)\s*with order status:\s*([^\s]+)/i.exec(raw);
        if (m) {
          throw new Error(
            `GHN không cho phép sửa trường "${m[1]}" khi đơn đang ở trạng thái "${m[2]}". ` +
            `Vui lòng huỷ đơn và tạo lại nếu cần điều chỉnh.`
          );
        }
        throw new Error(`${raw}${detail ? ` - Chi tiết: ${detail}` : ''}`);
      }

      // Update tracking record in DB
      const updateFields: Record<string, any> = { last_updated_at: new Date().toISOString() };
      if (updateData.to_name) updateFields.customer_name = updateData.to_name;
      if (updateData.to_phone) updateFields.customer_phone = updateData.to_phone;
      if (updateData.to_address) updateFields.customer_address = updateData.to_address;
      if (updateData.weight) updateFields.package_weight = updateData.weight;

      await supabase.from('ghn_tracking').update(updateFields).eq('ghn_order_code', orderCode);

      return new Response(JSON.stringify({
        success: true,
        message: `Đã cập nhật đơn hàng ${orderCode}`,
        data: data.data,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== UPDATE COD ACTION ====================
    if (action === 'update_cod') {
      const { orderCode, codAmount: newCod, shopId } = requestBody;
      if (!orderCode) throw new Error('Order code is required');
      const effectiveShopId = shopId || Deno.env.get('GHN_SHOP_ID');
      if (!effectiveShopId) throw new Error('Shop ID not provided');

      console.log('Updating COD for order:', orderCode, 'to:', newCod);

      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/updateCOD', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Token': ghnApiKey,
          'ShopId': String(effectiveShopId),
        },
        body: JSON.stringify({ order_code: orderCode, cod_amount: newCod }),
      });

      const data = await response.json();
      console.log('GHN updateCOD response:', JSON.stringify(data));

      if (data.code !== 200) {
        const detail = data.code_message_value ? JSON.stringify(data.code_message_value) : '';
        throw new Error(`${data.message || 'Lỗi cập nhật COD'}${detail ? ` - Chi tiết: ${detail}` : ''}`);
      }

      await supabase.from('ghn_tracking').update({
        cod_amount: newCod,
        last_updated_at: new Date().toISOString(),
      }).eq('ghn_order_code', orderCode);

      return new Response(JSON.stringify({
        success: true,
        message: `Đã cập nhật COD đơn hàng ${orderCode}`,
        data: data.data,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== PRINT A5 ACTION ====================
    if (action === 'print_a5') {
      const { orderCodes } = requestBody;
      if (!orderCodes || !Array.isArray(orderCodes) || orderCodes.length === 0) {
        throw new Error('orderCodes array is required');
      }

      console.log('Generating A5 print token for:', orderCodes);

      const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/a5/gen-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Token': ghnApiKey,
        },
        body: JSON.stringify({ order_codes: orderCodes }),
      });

      const data = await response.json();
      console.log('GHN gen-token response:', JSON.stringify(data));

      if (data.code !== 200) {
        const detail = data.code_message_value ? JSON.stringify(data.code_message_value) : '';
        throw new Error(`${data.message || 'Lỗi tạo phiếu in'}${detail ? ` - Chi tiết: ${detail}` : ''}`);
      }

      const token = data.data?.token;
      if (!token) throw new Error('No token returned from GHN');

      const printUrl = `https://online-gateway.ghn.vn/a5/public-api/printA5?token=${token}`;

      return new Response(JSON.stringify({
        success: true,
        message: `Đã tạo link in phiếu A5 cho ${orderCodes.length} đơn hàng`,
        data: { printUrl, token },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action specified');

  } catch (error) {
    console.error('GHN Tracking Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
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
  if (!toName) return '';
  // Ưu tiên: _<số>p (hoặc P/h/H) ở cuối tên - đây là quy ước user dùng (vd: ..._2588p)
  let m = toName.match(/_(\d{3,5})[pPhH]?\s*$/);
  if (m) return m[1];
  // Fallback: _<số> bất kỳ trong tên
  m = toName.match(/_(\d{3,5})\b/);
  if (m) return m[1];
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

async function fetchOrderLogs(ghnApiKey: string, orderCode: string) {
  try {
    const response = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Token': ghnApiKey },
      body: JSON.stringify({ order_code: orderCode }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (data.code !== 200) return [];
    const order = data.data;
    // GHN detail API log array - normalize field names
    const rawLogs = order?.log || [];
    return rawLogs.map((l: any) => ({
      status: l.status || '',
      updated_date: l.updated_date || l.time || '',
      comment: l.comment || l.description || l.reason || '',
    }));
  } catch {
    return [];
  }
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

// Chuẩn hóa giá trị thời gian từ GHN: có thể là epoch giây/mili-giây hoặc ISO string.
function normalizeGhnDate(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'string') {
    // GHN đôi khi trả "0001-01-01T00:00:00Z" cho field rỗng
    if (value.startsWith('0001-')) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}
