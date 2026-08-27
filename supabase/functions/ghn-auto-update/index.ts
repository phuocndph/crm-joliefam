import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Keep the scheduled scanner on the same production gateway as the manual
// tracking function. The dev gateway can return different order state and
// causes needless retries for production orders.
const GHN_API_BASE = 'https://online-gateway.ghn.vn/shiip/public-api';
const GHN_TOKEN = Deno.env.get('GHN_TOKEN') || Deno.env.get('GHN_API_KEY') || '';
const SHOP_ID = Deno.env.get('GHN_SHOP_ID') || '';

interface GHNOrder {
  order_code: string;
  status: string;
  status_text: string;
  payment_type_id: number;
  customer_name: string;
  customer_phone: string;
  to_address: string;
  from_name: string;
  from_phone: string;
  weight: number;
  created_date: string;
  expected_delivery_time: string;
  delivered_date?: string;
  cod_amount: number;
  shipping_order_id: string;
  detail?: any;
}

// GHN statuses in this set are terminal. Terminal orders must never be
// selected by the periodic scanner again. `return` is intentionally not
// terminal because GHN may still transition it to `returned`.
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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get('GHN_CRON_SECRET');
  const suppliedSecret = req.headers.get('x-ghn-cron-secret');
  if (!cronSecret || suppliedSecret !== cronSecret) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting auto-update of GHN tracking data...');

    // Get only tracking records that are not in a terminal status. Keep the
    // null branch so records created before GHN returned a status are still
    // eligible for their first sync.
    const staleBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: trackingRecords, error: fetchError } = await supabaseClient
      .from('ghn_tracking')
      .select('id, ghn_order_code, ghn_status, last_updated_at, orders(status)')
      .or(`last_updated_at.is.null,last_updated_at.lt.${staleBefore}`)
      .order('last_updated_at', { ascending: true, nullsFirst: true })
      .limit(500);

    if (fetchError) {
      console.error('Error fetching tracking records:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch tracking records' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const activeTrackingRecords = (trackingRecords || []).filter((record: any) => {
      if (TERMINAL_GHN_STATUSES.has(record.ghn_status)) return false;
      const orderStatus = Array.isArray(record.orders) ? record.orders[0]?.status : record.orders?.status;
      return !TERMINAL_CRM_ORDER_STATUSES.has(orderStatus);
    }).slice(0, 200);

    if (activeTrackingRecords.length === 0) {
      console.log('No incomplete tracking records found');
      return new Response(
        JSON.stringify({ success: true, message: 'No incomplete tracking records to update' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${activeTrackingRecords.length} incomplete tracking records to update`);

    // Check if GHN credentials are configured
    if (!GHN_TOKEN || !SHOP_ID) {
      console.error('GHN_TOKEN or GHN_SHOP_ID not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'GHN credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Update each tracking record
    for (const record of activeTrackingRecords) {
      try {
        // Fetch order details from GHN
        const response = await fetch(`${GHN_API_BASE}/v2/shipping-order/detail`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Token': GHN_TOKEN,
            'ShopId': SHOP_ID.toString()
          },
          body: JSON.stringify({
            order_code: record.ghn_order_code
          })
        });

        const result = await response.json();

        if (result.code === 200 && result.data) {
          const orderData: GHNOrder = result.data;

          // Update the tracking record
          const { error: updateError } = await supabaseClient
            .from('ghn_tracking')
            .update({
              ghn_status: orderData.status,
              ghn_status_text: getStatusText(orderData.status),
              customer_name: orderData.customer_name,
              customer_phone: orderData.customer_phone,
              customer_address: orderData.to_address,
              package_weight: orderData.weight,
              created_date: orderData.created_date,
              expected_delivery_date: normalizeGhnDate((orderData as any).leadtime ?? orderData.expected_delivery_time),
              delivered_date: normalizeGhnDate((orderData as any).finish_date ?? orderData.delivered_date),
              cod_amount: orderData.cod_amount,
              raw_data: orderData,
              tracking_url: `https://donhang.ghn.vn/?order_code=${orderData.order_code}`,
              last_updated_at: new Date().toISOString()
            })
            .eq('id', record.id);

          if (updateError) {
            errorCount++;
            errors.push(`${record.ghn_order_code}: ${updateError.message}`);
            console.error(`Error updating ${record.ghn_order_code}:`, updateError);
          } else {
            updatedCount++;
            console.log(`Updated ${record.ghn_order_code} successfully`);
          }
        } else {
          errorCount++;
          errors.push(`${record.ghn_order_code}: ${result.message || 'Unknown error from GHN API'}`);
          console.error(`Error from GHN API for ${record.ghn_order_code}:`, result);
        }
      } catch (error: any) {
        errorCount++;
        errors.push(`${record.ghn_order_code}: ${error.message || 'Network error'}`);
        console.error(`Network error for ${record.ghn_order_code}:`, error);
      }

      // Add a small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const message = `Auto-update completed: ${updatedCount} updated, ${errorCount} errors`;
    console.log(message);

    if (errors.length > 0) {
      console.log('Errors:', errors);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message,
        updated: updatedCount,
        errors: errorCount,
        details: errors.length > 0 ? errors : undefined
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Auto-update error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getStatusText(status: string): string {
  const statusMap: { [key: string]: string } = {
    'ready_to_pick': 'Chờ lấy hàng',
    'picking': 'Đang lấy hàng', 
    'picked': 'Đã lấy hàng',
    'storing': 'Đang lưu kho',
    'transporting': 'Đang vận chuyển',
    'sorting': 'Đang phân loại',
    'delivering': 'Đang giao hàng',
    'delivered': 'Đã giao hàng',
    'delivery_fail': 'Giao hàng thất bại',
    'waiting_to_return': 'Chờ trả hàng',
    'return': 'Trả hàng',
    'returned': 'Đã trả hàng',
    'exception': 'Ngoại lệ',
    'damage': 'Hư hỏng',
    'lost': 'Thất lạc',
    'cancel': 'Đã hủy'
  };
  
  return statusMap[status] || status;
}

function normalizeGhnDate(value: any): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'string') {
    if (value.startsWith('0001-')) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}
