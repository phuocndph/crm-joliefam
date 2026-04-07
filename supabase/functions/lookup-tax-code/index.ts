import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function callAI(messages: any[]) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const BEEKNOEE_API_KEY = Deno.env.get("BEEKNOEE_API_KEY");

  if (!LOVABLE_API_KEY && !BEEKNOEE_API_KEY) {
    throw new Error("No AI API key configured");
  }

  const payload = { model: "google/gemini-3-flash-preview", messages };

  // Try Lovable AI first
  if (LOVABLE_API_KEY) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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
      console.warn("Lovable AI error:", e);
    }
  }

  // Fallback to Beeknoee with model chain
  if (BEEKNOEE_API_KEY) {
    console.log("Falling back to Beeknoee API with model chain...");
    const models = ["gemini-2.5-flash", "glm-4.7-flash", "glm-4.5-flash", "gpt-oss-120b"];
    for (const model of models) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
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
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        console.warn(`Beeknoee ${model} error:`, e instanceof Error ? e.message : e);
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
      ]);
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
      ]);
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

      const parsed = await callAI(messages);
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ==================== AI QUOTE FILL ====================
    } else if (type === "ai_quote_fill") {
      const { products, request } = data;
      if (!products || !request) {
        return new Response(JSON.stringify({ error: "Missing products or request" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const productListText = products.map((p: any, i: number) => 
        `[${i+1}] ID: ${p.id} | Tên: ${p.name} | Giá: ${p.price} | Quy cách: ${p.specifications || "không có"} | Mô tả: ${p.description || "không có"}`
      ).join("\n");

      const aiQuoteFillPrompt = `Bạn là trợ lý chọn sản phẩm cho báo giá. Dựa trên yêu cầu khách hàng, hãy chọn sản phẩm phù hợp nhất từ danh sách bảng giá.

QUY TẮC SO KHỚP THÔNG MINH:
1. Nếu sản phẩm khớp chính xác tên + kích thước → lấy trực tiếp, "note" để trống ""
2. Nếu kích thước KHÔNG KHỚP chính xác (ví dụ: khách yêu cầu 12cm nhưng bảng giá chỉ có 10cm và 15cm):
   - Lấy sản phẩm có kích thước LỚN HƠN gần nhất (15cm) để tính giá
   - "customName" = tên sản phẩm đã SỬA theo yêu cầu thực tế của khách (ghi 12cm thay vì 15cm)
   - "note" = giải thích lý do (VD: "Khách yêu cầu 12cm, lấy giá sản phẩm 15cm")
3. Nếu không tìm thấy sản phẩm nào phù hợp → bỏ qua, KHÔNG đoán
4. "matchedProductId" = ID sản phẩm GỐC trong bảng giá (để lấy giá chính xác)
5. "price" = NẾU khách ghi rõ giá trong yêu cầu (VD: "giá 500k", "đơn giá 1.200.000") → dùng giá khách ghi.
   NẾU khách KHÔNG ghi giá → lấy đơn giá từ sản phẩm gốc đã chọn. KHÔNG TỰ NGHĨ RA GIÁ.
6. "quantity" = số lượng theo yêu cầu khách
7. BẮT BUỘC: "specifications" PHẢI là quy cách THEO YÊU CẦU THỰC TẾ CỦA KHÁCH, KHÔNG ĐƯỢC copy quy cách gốc từ bảng giá.
   VD: Khách yêu cầu "160x200x12cm" → specifications = "160x200x12cm" (DÙ sản phẩm gốc ghi "160x200x15cm")
   VD: Khách yêu cầu "1m8" → specifications phải ghi kích thước tương ứng "180x200x..." theo yêu cầu

8. SUY LUẬN LOẠI VẢI: Nếu đơn hàng có GA/DRAP loại vải cụ thể (VD: T225, T250, KS, Lụa, Tencel...),
   thì TẤT CẢ sản phẩm phụ kiện khác (vỏ gối, gối ôm, ga trải...) trong cùng đơn PHẢI theo CÙNG loại vải đó,
   TRỪ KHI khách ghi rõ loại vải riêng cho từng sản phẩm.
   VD: "2 bộ ga T225 1m8, 4 vỏ gối" → vỏ gối PHẢI là vỏ gối T225 (không phải T250 hay KS).

9. PHÂN BIỆT SẢN PHẨM CHÍNH XÁC:
   - "Vỏ gối" ≠ "Ruột gối" — vỏ gối là bao bọc bên ngoài (theo loại vải), ruột gối là phần lõi bông bên trong
   - "Ga giường" ≠ "Ga trải" — chú ý tên chính xác trong bảng giá
   - Nếu khách chỉ nói "gối" mà không rõ vỏ hay ruột → mặc định là "VỎ GỐI" (phổ biến hơn trong báo giá)
   - Chỉ chọn "ruột gối" khi khách ghi RÕ RÀNG: "ruột gối", "lõi gối", "gối bông", "gối ruột"

10. NẾU KHÔNG XÁC ĐỊNH ĐƯỢC loại vải, loại sản phẩm cụ thể, hoặc kích thước mà không thể suy luận từ ngữ cảnh →
    KHÔNG đoán. Trả về: {"items": [], "clarification": "Mô tả chi tiết những gì cần khách bổ sung thông tin"}
    VD: Khách nói "2 bộ ga 1m8, 4 gối" mà không nói loại vải → clarification: "Vui lòng cho biết loại vải (T225, T250, KS, Tencel...) cho đơn hàng này"

11. MAPPING TÊN VẢI TƯƠNG ĐƯƠNG:
    - "LTH" = "T225" — đây là CÙNG MỘT loại vải, tên gọi khác nhau
    - Khi khách nói "LTH" → tìm sản phẩm có tên chứa "T225" trong bảng giá
    - Khi khách nói "T225" → cũng có thể match sản phẩm tên "LTH" nếu có
    - VD: "Ga chun LTH trắng sọc 160x200x20cm" → tìm "Ga chun ks T225 trắng sọc 160x200x20cm"

DANH SÁCH SẢN PHẨM BẢNG GIÁ:
${productListText}

Trả về JSON thuần (không markdown, không giải thích):
{"items": [{"matchedProductId":"id-sản-phẩm-gốc","customName":"tên đã sửa theo yêu cầu","quantity":1,"price":0,"specifications":"quy cách THEO YÊU CẦU KHÁCH","note":"ghi chú nếu không khớp 100%"}]}

Nếu không tìm thấy sản phẩm nào phù hợp: {"items": []}
Nếu thiếu thông tin quan trọng: {"items": [], "clarification": "câu hỏi cần bổ sung"}`;
      const parsed = await callAI([
        { role: "system", content: aiQuoteFillPrompt },
        { role: "user", content: `Yêu cầu khách hàng:\n"""\n${request}\n"""` },
      ]);
      
      if (parsed.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
