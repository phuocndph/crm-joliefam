import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GHN_API_BASE = 'https://dev-online-gateway.ghn.vn/shiip/public-api';
const GHN_TOKEN = Deno.env.get('GHN_TOKEN') || '';
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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting auto-update of GHN tracking data...');

    // Define completed statuses that don't need updates
    const completedStatuses = ['delivered', 'returned', 'cancel', 'lost', 'damage'];

    // Get only tracking records that are not in completed status
    const { data: trackingRecords, error: fetchError } = await supabaseClient
      .from('ghn_tracking')
      .select('*')
      .not('ghn_status', 'in', `(${completedStatuses.map(s => `"${s}"`).join(',')})`);

    if (fetchError) {
      console.error('Error fetching tracking records:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch tracking records' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!trackingRecords || trackingRecords.length === 0) {
      console.log('No incomplete tracking records found');
      return new Response(
        JSON.stringify({ success: true, message: 'No incomplete tracking records to update' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${trackingRecords.length} incomplete tracking records to update`);

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
    for (const record of trackingRecords) {
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