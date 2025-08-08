import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChangePasswordRequest {
  action: 'change_own' | 'reset_user';
  currentPassword?: string; // Required for 'change_own'
  newPassword: string;
  targetUserId?: string; // Required for 'reset_user'
}

// Password strength validation
const validatePasswordStrength = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Mật khẩu phải có ít nhất 8 ký tự');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 chữ cái thường');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 chữ cái hoa');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 chữ số');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 ký tự đặc biệt');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Generate strong password
const generateStrongPassword = (): string => {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  let password = '';
  
  // Ensure at least one character from each category
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest with random characters
  const allChars = lowercase + uppercase + numbers + special;
  for (let i = 4; i < 12; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the user from the Authorization header
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the JWT and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Special endpoint for generating password
    if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/generate')) {
      const generatedPassword = generateStrongPassword();
      return new Response(
        JSON.stringify({ password: generatedPassword }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, currentPassword, newPassword, targetUserId }: ChangePasswordRequest = await req.json();

    // Validate password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      return new Response(
        JSON.stringify({ error: 'Mật khẩu không đủ mạnh', details: validation.errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current user role
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role, assigned_by')
      .eq('user_id', user.id)
      .single();

    if (!userRole) {
      return new Response(
        JSON.stringify({ error: 'User role not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'change_own') {
      // User changing their own password
      if (!currentPassword) {
        return new Response(
          JSON.stringify({ error: 'Current password is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify current password by attempting to sign in
      const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: user.email!,
        password: currentPassword
      });

      if (signInError) {
        return new Response(
          JSON.stringify({ error: 'Mật khẩu hiện tại không đúng' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
      );

      if (updateError) {
        console.error('Error updating password:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update password' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ message: 'Đổi mật khẩu thành công' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'reset_user') {
      // Admin/Manager resetting another user's password
      if (!targetUserId) {
        return new Response(
          JSON.stringify({ error: 'Target user ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get target user role
      const { data: targetUserRole } = await supabaseAdmin
        .from('user_roles')
        .select('role, assigned_by')
        .eq('user_id', targetUserId)
        .single();

      if (!targetUserRole) {
        return new Response(
          JSON.stringify({ error: 'Target user not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check permissions
      let canReset = false;
      let resetType = '';

      if (userRole.role === 'admin') {
        canReset = true;
        resetType = 'admin_reset';
      } else if (userRole.role === 'manager' && targetUserRole.role === 'employee' && targetUserRole.assigned_by === user.id) {
        canReset = true;
        resetType = 'manager_reset';
      }

      if (!canReset) {
        return new Response(
          JSON.stringify({ error: 'Bạn không có quyền reset mật khẩu cho người dùng này' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reset password
      const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUserId,
        { password: newPassword }
      );

      if (resetError) {
        console.error('Error resetting password:', resetError);
        return new Response(
          JSON.stringify({ error: 'Failed to reset password' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log the password reset
      await supabaseAdmin
        .from('password_reset_logs')
        .insert({
          admin_user_id: user.id,
          target_user_id: targetUserId,
          reset_type: resetType
        });

      return new Response(
        JSON.stringify({ message: 'Reset mật khẩu thành công' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    console.error('Error in change-password function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};

serve(handler);