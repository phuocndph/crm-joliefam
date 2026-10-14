import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.match(/^Bearer\s+\S+/i)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: "Server configuration is incomplete" }, 500);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const body = await req.json().catch(() => null) as {
      userId?: unknown;
      permissions?: unknown;
      reason?: unknown;
    } | null;
    if (!body || typeof body.userId !== "string" || !Array.isArray(body.permissions)) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return jsonResponse({ error: "Lý do thay đổi quyền là bắt buộc" }, 400);
    }
    const { data, error } = await supabase.rpc("replace_employee_permissions", {
      p_user_id: body.userId,
      p_permissions: body.permissions,
      p_reason: reason,
    });
    if (error) {
      const forbidden = /không có quyền|forbidden/i.test(error.message);
      return jsonResponse({ error: error.message }, forbidden ? 403 : 400);
    }

    return jsonResponse({ success: true, data }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
