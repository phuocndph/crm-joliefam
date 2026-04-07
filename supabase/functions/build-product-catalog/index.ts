import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Category grouping rules - map raw categories to high-level groups
const CATEGORY_GROUPS: Record<string, string[]> = {
  "GA CHUN KS": ["ga chun ks"],
  "GA TẤM PHỦ": ["ga tấm phủ", "ga tam phu"],
  "CHĂN HÈ": ["chăn hè", "chan he"],
  "VỎ GỐI": ["vỏ gối", "vo goi"],
  "RUỘT GỐI": ["ruột gối", "ruot goi"],
  "BẢO VỆ NỆM": ["bảo vệ nệm", "bao ve nem"],
  "ĐỆM": ["đệm", "dem", "nệm"],
  "BỘ CHĂN GA": ["bộ chăn ga", "bộ cotton", "bộ 4 món", "bộ 5 món"],
  "RÈM": ["rèm", "rem", "cửa rèm", "met cua rem"],
  "GỐI ÔM": ["gối ôm", "goi om"],
  "ÁO CHOÀNG": ["áo choàng"],
  "KHĂN": ["khăn"],
  "PHỤ KIỆN": [],  // fallback
};

// Fabric type extraction
const FABRIC_PATTERNS: [RegExp, string][] = [
  [/\bLTH\b/i, "LTH/T225"],
  [/\bT225\b/i, "LTH/T225"],
  [/\bT200\b/i, "T200"],
  [/\bT250\b/i, "T250"],
  [/\bT300\b/i, "T300"],
  [/\bT350\b/i, "T350"],
  [/\bT400\b/i, "T400"],
  [/\bKS\b/i, "KS"],
  [/\bTencel\b/i, "Tencel"],
  [/\bMCR\b/i, "Micro"],
  [/\bTici\b/i, "Tici"],
  [/\bCotton\b/i, "Cotton"],
  [/\bSỌC\b/i, "SỌC"],
  [/\bTRƠN\b/i, "TRƠN"],
];

function detectGroup(name: string, category: string): string {
  const combined = `${category} ${name}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd');
  
  for (const [group, keywords] of Object.entries(CATEGORY_GROUPS)) {
    if (group === "PHỤ KIỆN") continue;
    for (const kw of keywords) {
      const normKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
      if (combined.includes(normKw)) return group;
    }
  }
  return "PHỤ KIỆN";
}

function detectFabric(name: string, category: string): string {
  const combined = `${category} ${name}`;
  const fabrics: string[] = [];
  for (const [pattern, label] of FABRIC_PATTERNS) {
    if (pattern.test(combined) && !fabrics.includes(label)) {
      fabrics.push(label);
    }
  }
  return fabrics.length > 0 ? fabrics.join(" ") : "Khác";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Get auth context
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Use service role to read all products and write to storage
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is authenticated
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch all products
    const allProducts: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, specifications, category")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allProducts.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    console.log(`Fetched ${allProducts.length} products`);

    // Group products: group → fabric → products
    const grouped: Record<string, Record<string, any[]>> = {};
    
    for (const p of allProducts) {
      const group = detectGroup(p.name || "", p.category || "");
      const fabric = detectFabric(p.name || "", p.category || "");
      
      if (!grouped[group]) grouped[group] = {};
      if (!grouped[group][fabric]) grouped[group][fabric] = [];
      
      grouped[group][fabric].push(p);
    }

    // Build compact catalog text
    const lines: string[] = [];
    lines.push(`# CATALOG (${allProducts.length} SP) - ${new Date().toISOString().split('T')[0]}`);
    lines.push(`# LTH = T225 (cùng loại vải)`);
    lines.push("");

    for (const [group, fabrics] of Object.entries(grouped)) {
      lines.push(`=== ${group} ===`);
      for (const [fabric, products] of Object.entries(fabrics)) {
        lines.push(`[${fabric}]`);
        for (const p of products) {
          // Compact format: id | name | price | specs
          const price = p.price ? `${Math.round(p.price)}đ` : "?đ";
          const specs = p.specifications || "-";
          lines.push(`${p.id}|${p.name}|${price}|${specs}`);
        }
      }
      lines.push("");
    }

    const catalogText = lines.join("\n");
    console.log(`Catalog built: ${catalogText.length} chars, ${allProducts.length} products`);

    // Save to storage
    const catalogData = {
      text: catalogText,
      productCount: allProducts.length,
      builtAt: new Date().toISOString(),
      groups: Object.keys(grouped),
    };

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload("catalog/product-catalog.json", JSON.stringify(catalogData), {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw uploadError;
    }

    console.log("Catalog saved to storage");

    return new Response(JSON.stringify({ 
      success: true, 
      productCount: allProducts.length,
      catalogLength: catalogText.length,
      groups: Object.keys(grouped),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("build-product-catalog error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
