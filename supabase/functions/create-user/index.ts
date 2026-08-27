import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    
    if (!serviceRoleKey || !supabaseUrl) {
      throw new Error('Missing required environment variables');
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Authorize before using the service role for any mutation.
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

    const { data: callerRole, error: roleLookupError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .maybeSingle();
    if (roleLookupError || !callerRole || !['admin', 'manager'].includes(callerRole.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, password, firstName, lastName, phone, role } = await req.json();
    const allowedRoles = callerRole.role === 'admin' ? ['admin', 'manager', 'accountant', 'employee'] : ['employee'];
    if (!allowedRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'You are not allowed to create this role' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Creating user account');

    // Create user account
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        phone
      }
    });

    if (userError) {
      console.error('User creation error:', userError);
      throw userError;
    }

    console.log('User created successfully:', userData.user?.id);

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: userData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        phone
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Don't throw here, user is already created
    }

    // Assign role with assigned_by for employees
    const roleData: any = {
      user_id: userData.user.id,
      role
    };

    // If creating an employee and current user is a manager, set assigned_by
    if (role === 'employee' && callerRole.role === 'manager') {
      roleData.assigned_by = caller.id;
    }

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert(roleData);

    if (roleError) {
      console.error('Role assignment error:', roleError);
      // Don't throw here, user is already created
    }

    console.log('User, profile, and role created successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      user: userData.user,
      message: 'User created successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in create-user function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
