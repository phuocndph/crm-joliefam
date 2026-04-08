import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Module-level catalog cache — keyed by priceListId, persists across warm invocations
const CATALOG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const catalogCacheMap = new Map<string, { products: any[]; timestamp: number }>();

// Category filter extraction — maps Vietnamese keywords to DB category patterns
function extractCategoryFilters(request: string): string[] {
  const norm = request.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd');
  
  const patterns: string[] = [];
  const mapping: [RegExp, string[]][] = [
    [/\bga\s*chun\b|\bgachun\b|\bga\s*chu\b/, ['Ga chun']],
    [/\bga\s*phu\b|\bga\s*tam\s*phu\b|\bga\b(?!\s*chun)/, ['Ga chun', 'Ga tấm phủ', 'ga phủ']],
    [/\bvo\s*chan\b|\bchan\s*he\b|\bchan\s*dong\b|\bchan\b/, ['chăn', 'Chăn']],
    [/\bvo\s*goi\s*om\b|\bgoi\s*om\b/, ['gối ôm', 'Gối ôm']],
    [/\bvo\s*goi\b|\bgoi\s*nam\b|\bgoi\b(?!\s*om)(?!\s*trang)/, ['gối', 'Gối']],
    [/\bbvn\b|\bbao\s*ve\s*nem\b|\bbao\s*ve\b/, ['Bảo vệ']],
    [/\bdem\b|\bdệm\b|\bnệm\b|\bnem\b/, ['Đệm', 'đệm']],
    [/\btopper\b/, ['Topper', 'topper']],
    [/\bkhan\b/, ['Khăn', 'khăn']],
    [/\btam\s*trang\s*tri\b/, ['Trang Trí', 'trang trí']],
    [/\bgoi\s*trang\s*tri\b/, ['gối trang trí', 'Gối trang trí', 'Trang Trí']],
    [/\bvay\b|\bváy\b/, ['Váy', 'váy']],
    [/\bao\s*choang\b/, ['Áo choàng', 'áo choàng']],
    [/\bruot\s*chan\b/, ['Ruột chăn', 'ruột chăn']],
    [/\bruot\s*goi\b/, ['Ruột gối', 'ruột gối']],
    [/\brem\b/, ['rem', 'rèm', 'Rem']],
    [/\bbo\s*\d+\s*mon\b|\bbo\s*combo\b|\bcombo\b|\bbo\b/, ['Bộ']],
  ];

  for (const [regex, cats] of mapping) {
    if (regex.test(norm)) {
      patterns.push(...cats);
    }
  }

  // Deduplicate
  return [...new Set(patterns)];
}

function filterProductsByCategory(products: any[], patterns: string[]): any[] {
  if (patterns.length === 0) return products;
  
  const filtered = products.filter(p => {
    const cat = (p.category || '').toLowerCase();
    const name = (p.name || '').toLowerCase();
    return patterns.some(pat => {
      const lp = pat.toLowerCase();
      return cat.includes(lp) || name.includes(lp);
    });
  });

  // Fallback: if too few results, return full catalog
  if (filtered.length < 30) {
    console.log(`Category filter too narrow (${filtered.length} results), using full catalog`);
    return products;
  }
  
  return filtered;
}

const ORDER_ITEMS_SYSTEM_PROMPT = `Bạn là trợ lý chuyên trích xuất danh sách sản phẩm/dịch vụ từ đơn hàng, báo giá, hóa đơn Việt Nam.

QUY TẮC QUAN TRỌNG:
1. Đọc KỸ từng dòng sản phẩm, KHÔNG gộp hay bỏ sót dòng nào.
2. "name" = chỉ tên sản phẩm/dịch vụ chính xác, KHÔNG kèm kích thước/quy cách.
3. "specifications" = chỉ kích thước vật lý (dài x rộng x cao, mm, cm, m...). KHÔNG ghi quy cách, chất liệu, mô tả kỹ thuật.
4. "quantity" = số lượng CHÍNH XÁC từ dữ liệu gốc (số nguyên hoặc số thập phân). KHÔNG đoán, KHÔNG mặc định 1 nếu có số liệu rõ ràng.
5. "price" = đơn giá CHÍNH XÁC (số nguyên, đơn vị VNĐ). Chuyển đổi: "120.000" hoặc "120,000" = 120000. KHÔNG nhầm thành tiền với đơn giá.
6. KHÔNG tính thành tiền (quantity × price) vào trường price. Price chỉ là ĐƠN GIÁ.
7. Nếu có cột "Thành tiền" riêng, BỎ QUA cột đó, chỉ lấy cột "Đơn giá".

Trả về JSON thuần (không markdown, không giải thích, không bọc code block):
{"items": [{"name":"tên SP","specifications":"quy cách","quantity":1,"price":0}]}

Nếu không tìm thấy sản phẩm nào: {"items": []}`;


const BUYER_INFO_SYSTEM_PROMPT = `Bạn là trợ lý phân tích thông tin doanh nghiệp Việt Nam. Luôn trả về kết quả dưới dạng JSON với cấu trúc sau (không markdown, không giải thích thêm):
{
  "company_name": "tên công ty/cá nhân",
  "representative": "người đại diện",
  "position": "chức vụ (mặc định Giám đốc)",
  "address": "địa chỉ",
  "tax_code": "mã số thuế",
  "phone": "số điện thoại",
  "bank_name": "tên ngân hàng",
  "bank_account": "số tài khoản",
  "bank_holder": "chủ tài khoản"
}
Nếu không tìm thấy trường nào thì để chuỗi rỗng "". Chỉ trả JSON thuần, không bọc trong code block.`;

async function callAI(messages: any[], hasImage = false, modelOverride?: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const BEEKNOEE_API_KEY = Deno.env.get("BEEKNOEE_API_KEY");

  if (!LOVABLE_API_KEY && !BEEKNOEE_API_KEY) {
    throw new Error("No AI API key configured");
  }

  const model = modelOverride || "google/gemini-3-flash-preview";
  const payload = { model, messages };

  // Try Lovable AI first (supports vision)
  if (LOVABLE_API_KEY) {
    try {
      const controller = new AbortController();
      const timeout = hasImage ? 90000 : 55000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        console.log("AI response from: Lovable");
        return parseAIResponse(await response.json());
      }

      const errText = await response.text();
      console.warn(`Lovable AI failed (${response.status}): ${errText.substring(0, 200)}`);

      if (response.status === 429 && !BEEKNOEE_API_KEY) {
        return { error: "Rate limit exceeded", status: 429 };
      }
    } catch (e) {
      console.warn("Lovable AI error:", e instanceof Error ? e.message : e);
    }
  }

  // Fallback to Beeknoee with model chain
  if (BEEKNOEE_API_KEY) {
    console.log(`Falling back to Beeknoee API (hasImage: ${hasImage})...`);
    
    // Vision-capable models only when image is present
    const models = hasImage
      ? [
          { name: "gemini-2.5-flash", timeout: 90000 },
        ]
      : [
          { name: "gemini-2.5-flash", timeout: 55000 },
          { name: "glm-4.7-flash", timeout: 30000 },
          { name: "glm-4.5-flash", timeout: 30000 },
          { name: "openai/gpt-oss-120b", timeout: 30000 },
        ];
    
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const { name: model, timeout } of models) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          const response = await fetch("https://platform.beeknoee.com/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${BEEKNOEE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, model }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            console.log(`AI response from: Beeknoee (${model})`);
            return parseAIResponse(await response.json());
          }

          const errText = await response.text();
          console.warn(`Beeknoee ${model} failed (${response.status}): ${errText.substring(0, 150)}`);
          if (response.status === 429) {
            await new Promise(r => setTimeout(r, 3000));
          }
        } catch (e) {
          console.warn(`Beeknoee ${model} error:`, e instanceof Error ? e.message : e);
        }
      }
      if (attempt === 0) {
        console.log("All models failed on first attempt, retrying after 5s...");
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  throw new Error("All AI providers failed");
}

function parseAIResponse(result: any) {
  const content = result.choices?.[0]?.message?.content || "";
  const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    console.error("Failed to parse AI response:", content);
    return { raw: content };
  }
}

// Helper: Convert Vietnamese text to URL slug
function toSlug(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Helper: Scrape masothue.com using Firecrawl for representative info
async function scrapeMasothue(taxCode: string, companyName: string): Promise<{ representative: string; phone: string; address: string }> {
  const result = { representative: "", phone: "", address: "" };
  
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) {
    console.log("FIRECRAWL_API_KEY not configured, skipping masothue.com");
    return result;
  }

  const slug = toSlug(companyName);
  const url = `https://masothue.com/${taxCode}-${slug}`;
  console.log("Scraping masothue.com via Firecrawl:", url);

  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["html"],
        onlyMainContent: false,
        waitFor: 2000,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.log("Firecrawl error:", resp.status, errText);
      return result;
    }

    const data = await resp.json();
    const html = data?.data?.html || data?.html || "";
    console.log("Firecrawl HTML length:", html.length);

    if (!html) return result;

    // Extract representative
    const repMatch = html.match(/fa-user[\s\S]*?Người đại diện[\s\S]*?itemprop="name"[^>]*>([^<]+)</i) 
      || html.match(/Người đại diện<\/td>\s*<td[^>]*>[\s\S]*?itemprop="name"[^>]*>([^<]+)</i)
      || html.match(/Người đại diện[\s\S]{0,300}?<a[^>]*>([^<]+)<\/a>/i);
    if (repMatch?.[1]) {
      result.representative = repMatch[1].trim();
      console.log("masothue.com found representative:", result.representative);
    }
    
    // Extract phone
    const phoneMatch = html.match(/itemprop="telephone"[^>]*>\s*([^<]+)</i)
      || html.match(/fa-phone[\s\S]{0,300}?<a[^>]*>([^<]+)<\/a>/i);
    if (phoneMatch?.[1]) {
      result.phone = phoneMatch[1].trim();
    }
    
    // Extract address from masothue
    const addrMatch = html.match(/itemprop="address"[^>]*>([^<]+)</i);
    if (addrMatch?.[1]) {
      result.address = addrMatch[1].trim();
    }
  } catch (e) {
    console.log("Firecrawl masothue.com scrape failed:", e);
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, data } = await req.json();

    // ==================== TAX CODE LOOKUP ====================
    if (type === "tax_code") {
      const taxCode = data.toString().trim();
      console.log("Looking up tax code:", taxCode);

      let company_name = "";
      let representative = "";
      let address = "";
      let phone = "";
      let foundTaxCode = taxCode;

      // === Step 1: escodata.net ===
      try {
        console.log("Step 1: Trying escodata.net...");
        const escoResponse = await fetch(`https://escodata.net/api-mst/${taxCode}.htm`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (escoResponse.ok) {
          const escoResult = await escoResponse.json();
          if (escoResult.error === 0 && escoResult.data) {
            const d = escoResult.data;
            company_name = d.ten || d.name || "";
            representative = d.daidien || "";
            address = d.dc || d.address || "";
            phone = d.dt || "";
            foundTaxCode = d.mst || d.id || taxCode;
            console.log("escodata.net found:", company_name, "rep:", representative);
          }
        }
      } catch (e) {
        console.log("escodata.net failed:", e);
      }

      // === Step 2: If missing representative and we have company name, try masothue.com ===
      if (company_name && !representative) {
        console.log("Step 2: Missing representative, trying masothue.com enrichment...");
        const mstData = await scrapeMasothue(taxCode, company_name);
        if (mstData.representative) representative = mstData.representative;
        if (!phone && mstData.phone) phone = mstData.phone;
        if (!address && mstData.address) address = mstData.address;
      }

      // === Step 3: If Step 1 failed entirely, try VietQR then masothue.com ===
      if (!company_name) {
        console.log("Step 3: Falling back to VietQR...");
        let vietqrResponse: Response | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
          vietqrResponse = await fetch(`https://api.vietqr.io/v2/business/${taxCode}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });
          if (vietqrResponse.status !== 429) break;
        }

        if (vietqrResponse?.ok) {
          const result = await vietqrResponse.json();
          if (result.code === "00" && result.data) {
            company_name = result.data.name || "";
            address = result.data.address || "";
            foundTaxCode = result.data.id || taxCode;
          }
        }

        // Try masothue.com enrichment with VietQR company name
        if (company_name && !representative) {
          console.log("Enriching VietQR data with masothue.com...");
          const mstData = await scrapeMasothue(taxCode, company_name);
          if (mstData.representative) representative = mstData.representative;
          if (!phone && mstData.phone) phone = mstData.phone;
          if (!address && mstData.address) address = mstData.address;
        }
      }

      // Return result or error
      if (company_name) {
        return new Response(JSON.stringify({
          company_name,
          representative,
          position: representative ? "Giám đốc" : "",
          address,
          tax_code: foundTaxCode,
          phone,
          bank_name: "", bank_account: "", bank_holder: "",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ error: "Không tìm thấy doanh nghiệp với MST: " + taxCode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

    // ==================== PARSE BUYER TEXT ====================
    } else if (type === "parse_text") {
      const parsed = await callAI([
        { role: "system", content: BUYER_INFO_SYSTEM_PROMPT },
        { role: "user", content: `Phân tích đoạn text sau và trích xuất thông tin doanh nghiệp/cá nhân. Text:\n"""\n${data}\n"""` },
      ]);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== PARSE BUYER IMAGE ====================
    } else if (type === "parse_image") {
      const { base64, mimeType } = data;
      if (!base64) {
        return new Response(JSON.stringify({ error: "No image data" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsed = await callAI([
        { role: "system", content: BUYER_INFO_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType || "image/png"};base64,${base64}` } },
            { type: "text", text: "Phân tích hình ảnh này và trích xuất tất cả thông tin doanh nghiệp/cá nhân." },
          ],
        },
      ], true);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Vui lòng thử lại sau." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== PARSE ORDER TEXT ====================
    } else if (type === "parse_order_text") {
      const parsed = await callAI([
        { role: "system", content: ORDER_ITEMS_SYSTEM_PROMPT },
        { role: "user", content: `Trích xuất danh sách sản phẩm/dịch vụ từ đoạn text sau:\n"""\n${data}\n"""` },
      ]);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== PARSE ORDER IMAGE ====================
    } else if (type === "parse_order_image") {
      const { base64, mimeType } = data;
      if (!base64) {
        return new Response(JSON.stringify({ error: "No image data" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsed = await callAI([
        { role: "system", content: ORDER_ITEMS_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType || "image/png"};base64,${base64}` } },
            { type: "text", text: "Trích xuất danh sách sản phẩm/dịch vụ từ hình ảnh này (bảng báo giá, đơn hàng, hóa đơn)." },
          ],
        },
      ], true);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== PARSE ORDER FILE (Excel/PDF) ====================
    } else if (type === "parse_order_file") {
      const { base64, mimeType, fileName } = data;
      if (!base64) {
        return new Response(JSON.stringify({ error: "No file data" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isExcel = mimeType?.includes("spreadsheet") || mimeType?.includes("excel") || 
                      fileName?.endsWith(".xlsx") || fileName?.endsWith(".xls") || fileName?.endsWith(".csv");
      const isPdf = mimeType === "application/pdf" || fileName?.endsWith(".pdf");

      let messages: any[];
      if (isPdf) {
        messages = [
          { role: "system", content: ORDER_ITEMS_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
              { type: "text", text: "Trích xuất danh sách sản phẩm/dịch vụ từ file PDF này." },
            ],
          },
        ];
      } else if (isExcel) {
        // Parse Excel/CSV server-side using SheetJS, then send as text to AI
        try {
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const workbook = XLSX.read(bytes, { type: "array" });
          
          // Convert all sheets to CSV text
          let csvText = "";
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            if (csv.trim()) {
              csvText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
            }
          }
          
          if (!csvText.trim()) {
            return new Response(JSON.stringify({ error: "File Excel trống, không có dữ liệu" }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          
          console.log("Parsed Excel to CSV text, length:", csvText.length);
          messages = [
            { role: "system", content: ORDER_ITEMS_SYSTEM_PROMPT },
            { role: "user", content: `Trích xuất danh sách sản phẩm/dịch vụ từ file Excel "${fileName || "file.xlsx"}":\n"""\n${csvText}\n"""` },
          ];
        } catch (parseErr) {
          console.error("Excel parse error:", parseErr);
          return new Response(JSON.stringify({ error: "Không thể đọc file Excel. Vui lòng kiểm tra file." }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: "Định dạng file không được hỗ trợ" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const parsed = await callAI(messages, isPdf);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== AI QUOTE FILL ====================
    } else if (type === "ai_quote_fill") {
      const { request, imageBase64, imageMimeType, priceListId } = data;
      if (!request && !imageBase64) {
        return new Response(JSON.stringify({ error: "Missing request or image" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use module-level catalog cache keyed by priceListId (TTL 5 min)
      const authHeader = req.headers.get("Authorization");
      const cacheKey = priceListId || "__all__";
      const cached = catalogCacheMap.get(cacheKey);
      let productListText: string;
      
      if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_TTL) {
        productListText = cached.text;
        console.log(`AI Quote Fill: using cached catalog for priceList=${cacheKey} (${cached.count} products)`);
      } else {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authHeader || "" } },
        });

        let query = supabase
          .from("products")
          .select("id, name, specifications, description, price")
          .eq("in_stock", true);
        
        if (priceListId) {
          query = query.eq("price_list_id", priceListId);
        }
        
        const { data: products, error: dbError } = await query.order("category");

        if (dbError) {
          console.error("Failed to fetch products:", dbError);
          return new Response(JSON.stringify({ error: "Không thể tải bảng giá" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        productListText = (products || []).map((p: any) => 
          `${p.id}|${p.name}|${p.specifications || ''}|${p.description || ''}|${p.price || 0}`
        ).join("\n");
        
        catalogCacheMap.set(cacheKey, { text: productListText, count: (products || []).length, timestamp: Date.now() });
        console.log(`AI Quote Fill: fetched ${(products || []).length} products for priceList=${cacheKey}, cached`);
      }

      const aiQuoteFillPrompt = `Bạn là chuyên gia báo giá sản phẩm nội thất phòng ngủ Việt Nam. Nhân viên gõ nhanh, không dấu, viết tắt — bạn phải hiểu đúng ý.

## BẢNG GIÁ (ID|Tên|Quy cách|Mô tả|Giá)
${productListText}

## QUAN TRỌNG — TOÀN BỘ BẢNG GIÁ
Bảng giá trên chứa TẤT CẢ danh mục sản phẩm: ga chun, ga phủ, vỏ chăn, chăn hè, chăn đông, vỏ gối nằm, vỏ gối ôm, ruột gối, ruột gối ôm, tấm trang trí, gối trang trí (vỏ + ruột), bảo vệ nệm, đệm, topper, áo choàng tắm, rèm, bộ combo, v.v.
KHÔNG được tự giới hạn vào vài loại SP — phải tìm kiếm TOÀN BỘ bảng giá.

## CÁCH SO KHỚP SẢN PHẨM
1. Đọc KỸ tên tất cả sản phẩm trong bảng giá
2. So khớp từ khóa từ yêu cầu khách với TÊN sản phẩm
3. Dùng CẢ 3 cột Tên + Quy cách + Mô tả để xác định đúng sản phẩm
4. Khi có nhiều SP tên giống, phân biệt bằng: chất liệu (T200/T250/T300...), mẫu (trơn/sọc), kích thước
5. Khi kích thước khách yêu cầu KHÔNG có trong bảng giá → tìm SP có kích thước LỚN HƠN gần nhất để lấy GIÁ và matchedProductId
   - NHƯNG customName và specifications PHẢI ghi đúng kích thước KHÁCH YÊU CẦU, KHÔNG được làm tròn
   - Ghi note giải thích: "Giá theo SP [kích thước bảng giá], khách yêu cầu [kích thước thực]"
   VD: yêu cầu ga 160x200x12cm, bảng có 15cm → matchedProductId = SP 15cm, nhưng ghi "160x200x12cm" trong specifications và customName
   VD: bảo vệ nệm yêu cầu trên 10cm → lấy giá của 25cm
   VD: chăn → lấy kích thước gần sát nhất trong bảng giá (lớn hơn hoặc bằng)
6. KHÔNG được hoán đổi Trơn↔Sọc nếu khách đã ghi rõ
7. Phải verify: đúng loại? đúng chất liệu? đúng trơn/sọc? đúng kích thước?

## HIỂU TIẾNG VIỆT KHÔNG DẤU
- trang/tran/trắng = TRƠN (màu trắng = mẫu trơn trong ngành ga gối)
- soc/sọc = SỌC
- chan/chần = CHẦN (kiểu may), KHÔNG phải trơn/sọc
- chan he/chăn hè = Vỏ chăn (KHÔNG chần, mỏng)
- chan dong/chăn đông = Vỏ chăn chần (dày)
- ga phu/ga tấm phủ = ga phủ giường
- bvn/bao ve nem = bảo vệ nệm
- tam trang tri/tấm trang trí = tấm trang trí (phụ kiện trang trí giường)
- goi trang tri/gối trang trí = mặc định "Vỏ gối trang trí" (trừ khi nói rõ "ruột")
- "gối" không nói rõ loại → mặc định "Vỏ gối"
- LTH = T225 = cùng loại vải
- hai mat/2 mat = ghi vào note, KHÔNG ảnh hưởng matching

## SUY LUẬN CHẤT LIỆU
1. Nếu SP ghi rõ chất liệu (T250, T300, T225, LTH...) → dùng đúng chất liệu đó
2. Nếu SP KHÔNG ghi chất liệu → suy luận từ các SP KHÁC trong cùng báo giá:
   - Nếu tất cả SP khác dùng cùng 1 chất liệu → áp dụng chất liệu đó cho SP thiếu
   - Nếu có NHIỀU chất liệu khác nhau → xác định theo VỊ TRÍ/NGỮ CẢNH: SP nằm gần (trước/sau) SP nào thì dùng chất liệu của SP đó
3. Khi mẫu (trơn/sọc) chỉ ghi 1 lần → áp dụng cho tất cả SP cùng nhóm chất liệu
4. CHỈ KHI không có bất kỳ chất liệu nào trong TOÀN BỘ yêu cầu → mới dùng T250 làm mặc định

VD1: "ga chun t250 trắng 1m8, vỏ chăn trắng 2.0x2.2, vỏ gối 50x70 x2"
→ Tất cả = T250 trơn (vì chỉ có 1 chất liệu T250, "trắng"=trơn)

VD2: "ga chun t300 sọc 1m8 x1, ga chun t250 trắng 1m6 x1, vỏ chăn sọc 2.0x2.2"
→ vỏ chăn sọc → gần "ga t300 sọc" hơn (cùng mẫu sọc) → T300 sọc

VD3: "ga chun t250 trắng 1m8, vỏ chăn 2.0x2.2, vỏ gối 50x70 x2, ga chun t300 sọc 1m6"
→ vỏ chăn + vỏ gối nằm giữa → gần ga T250 hơn → T250 trơn

## CHUẨN HÓA KÍCH THƯỚC
- Số thập phân < 10 = mét: 1.6→160, 2.0→200, 2.2→220
- "1m6"/"1m8" = 160/180
- 14p/14f/14cm/14 phan = chiều cao 14cm
- T200/T225/T250/T300/T350/T400/LTH = chất liệu, KHÔNG PHẢI kích thước

## GIÁ & SỐ LƯỢNG
- Giá khách ghi → dùng giá khách. Không ghi → lấy từ bảng giá
- "x4 cai"/"x2"/"4 cái" → số lượng. Mặc định = 1

## HÌNH ẢNH
Nếu có ảnh: phân tích ảnh trích xuất SP, SL, kích thước, vải, mẫu. Kết hợp text nếu có.

## VÍ DỤ
Input: "ga chun t250 trắng tinh 1m8x2mx25p x1, vỏ chăn trắng 2.0x2.2 x1, vỏ gối 50x70 x2, tấm trang trí 1m6 x1"
Phân tích: ga chun có chất liệu T250 trơn → vỏ chăn + vỏ gối không ghi chất liệu → suy luận T250 trơn theo ga chun. "tấm trang trí" → tìm riêng trong bảng giá.
Output:
{"items":[
  {"matchedProductId":"UUID-ga-chun-t250-tron-180x200x25","customName":"Ga chun T250 trơn 180x200x25cm","quantity":1,"price":258000,"specifications":"180 x 200 x 25cm","note":""},
  {"matchedProductId":"UUID-vo-chan-t250-tron-200x220","customName":"Vỏ chăn T250 trơn 200x220","quantity":1,"price":350000,"specifications":"200 x 220cm","note":"Chất liệu T250 trơn suy luận từ ga chun"},
  {"matchedProductId":"UUID-vo-goi-t250-tron-50x70","customName":"Vỏ gối T250 trơn 50x70","quantity":2,"price":65000,"specifications":"50 x 70cm","note":"Chất liệu T250 trơn suy luận từ ga chun"},
  {"matchedProductId":"UUID-tam-trang-tri-160","customName":"Tấm Trang Trí 160 : 50x235","quantity":1,"price":210000,"specifications":"50 x 235cm","note":"Kích thước giường 160"}
]}

VÍ DỤ 2 (kích thước không chuẩn):
Input: "ga chun t250 trắng 160x200x12cm x1, bảo vệ nệm 1m6x2m 12cm x1"
Phân tích: ga 12cm không có trong bảng → lấy giá SP 15cm. BVN 12cm (trên 10cm) → lấy giá SP 25cm. NHƯNG ghi kích thước ĐÚNG 12cm trong customName/specifications.
Output:
{"items":[
  {"matchedProductId":"UUID-ga-chun-t250-tron-160x200x15","customName":"Ga chun T250 trơn 160x200x12cm","quantity":1,"price":240000,"specifications":"160 x 200 x 12cm","note":"Giá theo SP 15cm, khách yêu cầu 12cm"},
  {"matchedProductId":"UUID-bvn-160x200x25","customName":"Bảo vệ nệm 160x200x12cm","quantity":1,"price":320000,"specifications":"160 x 200 x 12cm","note":"Giá theo SP 25cm, khách yêu cầu 12cm (trên 10cm)"}
]}

## OUTPUT — JSON thuần túy, KHÔNG markdown, KHÔNG backtick
⚠️ matchedProductId PHẢI là UUID chính xác từ CỘT ĐẦU TIÊN của bảng giá (dạng xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). TUYỆT ĐỐI KHÔNG tự tạo ID, KHÔNG viết tắt, KHÔNG bịa UUID. Copy nguyên văn UUID từ bảng giá.

{"items":[{"matchedProductId":"uuid-chính-xác-từ-bảng-giá","customName":"tên SP với kích thước ĐÚNG của khách","quantity":1,"price":208000,"specifications":"kích thước CHÍNH XÁC theo khách, KHÔNG làm tròn","note":"ghi chú nếu cần"}]}
- matchedProductId = UUID chính xác từ cột đầu tiên bảng giá (SP có kích thước LỚN HƠN gần nhất nếu kích thước khách không khớp). KHÔNG ĐƯỢC tự nghĩ ra.
- customName = tên SP với kích thước ĐÚNG của khách (VD: "Ga chun T250 trơn 160x200x12cm" chứ KHÔNG PHẢI "160x200x15cm")
- specifications = kích thước CHÍNH XÁC theo yêu cầu khách, KHÔNG làm tròn, KHÔNG copy kích thước bảng giá
- note = khi kích thước khách khác bảng giá: "Giá theo SP [kích thước bảng giá], khách yêu cầu [kích thước thực]"
- Không tìm thấy: {"items":[]}
- Thiếu info quan trọng: {"clarification":"câu hỏi cụ thể"}`;


      // Build user message - multimodal if image present
      let userContent: any;
      if (imageBase64) {
        const parts: any[] = [];
        parts.push({
          type: "image_url",
          image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}` }
        });
        const textPart = request 
          ? `Phân tích hình ảnh trên kết hợp với yêu cầu bổ sung:\n"""\n${request}\n"""`
          : `Phân tích hình ảnh trên để trích xuất danh sách sản phẩm và so khớp với bảng giá.`;
        parts.push({ type: "text", text: textPart });
        userContent = parts;
      } else {
        userContent = `Yêu cầu khách hàng:\n"""\n${request}\n"""`;
      }

      const hasImage = !!imageBase64;
      // Use faster model for text-only, vision model for images
      const quoteModel = hasImage ? undefined : "google/gemini-2.5-flash";
      const parsed = await callAI([
        { role: "system", content: aiQuoteFillPrompt },
        { role: "user", content: userContent },
      ], hasImage, quoteModel);
      
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate matchedProductId — warn if AI returned fake IDs
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (parsed.items && Array.isArray(parsed.items)) {
        for (const item of parsed.items) {
          if (item.matchedProductId && !UUID_REGEX.test(item.matchedProductId)) {
            console.warn(`⚠️ AI returned fake ID: "${item.matchedProductId}" for "${item.customName}"`);
          }
        }
      }

      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("lookup-tax-code error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
