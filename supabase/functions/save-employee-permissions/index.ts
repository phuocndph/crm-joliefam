import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(authHeader);
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { userId, permissions } = await req.json();

    if (!userId || !Array.isArray(permissions)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { data: callerRole, error: callerRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .maybeSingle();
    const { data: targetRole, error: targetRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('role, assigned_by')
      .eq('user_id', userId)
      .maybeSingle();
    const canManage = callerRole?.role === 'admin'
      || (callerRole?.role === 'manager'
        && targetRole?.role === 'employee'
        && targetRole.assigned_by === caller.id);
    if (callerRoleError || targetRoleError || !targetRole || !canManage) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Saving permissions for user:', userId);
    console.log('Permissions to save:', permissions);

    // Delete existing permissions
    const { error: deleteError } = await supabaseAdmin
      .from('employee_permissions')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      throw deleteError;
    }

    // Insert only enabled permissions
    const allowedPermissionTypes = new Set([
      'dashboard', 'customers', 'products', 'quotes', 'orders', 'cash_flow',
      'transactions', 'reports', 'user_management', 'quote_supplement',
      'customer_care', 'fabric_management', 'ghn_tracking', 'quote_approval',
      'knowledge_base', 'contracts', 'shipping_companies',
      'cost_transactions', 'cost_categories', 'cost_centers', 'cost_objects',
      'transaction_types', 'cost_transaction_confirm', 'cost_transaction_void', 'cost_audit',
      'inventory_view', 'inventory_items', 'inventory_documents', 'inventory_confirm',
      'inventory_adjustment', 'inventory_opening', 'inventory_cost_view', 'inventory_audit',
      'bom_view', 'bom_manage', 'bom_approve', 'cutting_profiles', 'cutting_approve',
      'production_view', 'production_manage', 'production_release', 'production_complete', 'production_operations', 'production_worker_manage',
    ]);
    const enabledPermissions = permissions
      .filter((permission: unknown): permission is { enabled: boolean; permission_type: string } => {
        if (!permission || typeof permission !== 'object') return false;
        const candidate = permission as { enabled?: unknown; permission_type?: unknown };
        return candidate.enabled === true
          && typeof candidate.permission_type === 'string'
          && allowedPermissionTypes.has(candidate.permission_type);
      })
      .map((permission) => ({
        user_id: userId,
        permission_type: permission.permission_type,
        enabled: true
      }));

    console.log('Enabled permissions to insert:', enabledPermissions);

    if (enabledPermissions.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('employee_permissions')
        .insert(enabledPermissions);

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error saving permissions:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
