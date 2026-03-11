import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, data } = await req.json();

    if (type === "tax_code") {
      // Use VietQR.io real API for accurate tax code lookup
      const taxCode = data.toString().trim();
      console.log("Looking up tax code via VietQR:", taxCode);

      let response: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
        response = await fetch(`https://api.vietqr.io/v2/business/${taxCode}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (response.status !== 429) break;
        console.log(`VietQR rate limited, retry ${attempt + 1}...`);
      }

      if (!response || !response.ok) {
        const status = response?.status || 500;
        console.error("VietQR API error:", status);
        return new Response(JSON.stringify({ error: "Không thể tra cứu MST. Vui lòng thử lại sau." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await response.json();
      console.log("VietQR response:", JSON.stringify(result));

      if (result.code === "00" && result.data) {
        const d = result.data;
        const baseInfo = {
          company_name: d.name || "",
          representative: d.representative || "",
          position: d.representative ? "Giám đốc" : "",
          address: d.address || "",
          tax_code: d.id || taxCode,
          phone: "",
          bank_name: "",
          bank_account: "",
          bank_holder: "",
        };

        // If representative is missing, try AI to supplement
        if (!baseInfo.representative && baseInfo.company_name) {
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (LOVABLE_API_KEY) {
            try {
              console.log("VietQR missing representative, using AI to supplement...");
              const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "google/gemini-3-flash-preview",
                  messages: [
                    {
                      role: "system",
                      content: `Bạn là trợ lý tra cứu thông tin doanh nghiệp Việt Nam. Cho biết tên công ty và MST, hãy tìm thông tin người đại diện pháp luật và chức vụ. Trả về JSON thuần (không markdown):
{"representative": "tên người đại diện", "position": "chức vụ"}
Nếu không biết chắc chắn thì để chuỗi rỗng "".`
                    },
                    {
                      role: "user",
                      content: `Công ty: ${baseInfo.company_name}\nMST: ${taxCode}\nĐịa chỉ: ${baseInfo.address}\n\nTìm thông tin người đại diện pháp luật và chức vụ.`
                    },
                  ],
                }),
              });

              if (aiResponse.ok) {
                const aiResult = await aiResponse.json();
                const content = aiResult.choices?.[0]?.message?.content || "";
                try {
                  const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
                  const parsed = JSON.parse(cleaned);
                  if (parsed.representative) baseInfo.representative = parsed.representative;
                  if (parsed.position) baseInfo.position = parsed.position;
                  console.log("AI supplemented representative:", parsed);
                } catch {
                  console.log("AI response not parseable, skipping supplement");
                }
              }
            } catch (e) {
              console.log("AI supplement failed, returning base info:", e);
            }
          }
        }

        return new Response(JSON.stringify(baseInfo), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        return new Response(JSON.stringify({ error: "Không tìm thấy doanh nghiệp với MST: " + taxCode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

    } else if (type === "parse_text") {
      // Use AI for text parsing
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

      const prompt = `Phân tích đoạn text sau và trích xuất thông tin doanh nghiệp/cá nhân. Text:
"""
${data}
"""

Trích xuất các trường thông tin có trong text.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `Bạn là trợ lý phân tích thông tin doanh nghiệp Việt Nam. Luôn trả về kết quả dưới dạng JSON với cấu trúc sau (không markdown, không giải thích thêm):
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
Nếu không tìm thấy trường nào thì để chuỗi rỗng "". Chỉ trả JSON thuần, không bọc trong code block.`
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || "";

      let parsed: any = {};
      try {
        const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse AI response:", content);
        parsed = { raw: content };
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (type === "parse_image") {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

      const { base64, mimeType } = data;
      if (!base64) {
        return new Response(JSON.stringify({ error: "No image data" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `Bạn là trợ lý phân tích thông tin doanh nghiệp Việt Nam từ hình ảnh. Luôn trả về kết quả dưới dạng JSON với cấu trúc sau (không markdown, không giải thích thêm):
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
Nếu không tìm thấy trường nào thì để chuỗi rỗng "". Chỉ trả JSON thuần, không bọc trong code block.`
            },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mimeType || "image/png"};base64,${base64}` } },
                { type: "text", text: "Phân tích hình ảnh này và trích xuất tất cả thông tin doanh nghiệp/cá nhân: tên công ty, MST, địa chỉ, SĐT, ngân hàng, người đại diện, chức vụ." },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Vui lòng thử lại sau." }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || "";
      let parsed: any = {};
      try {
        const cleaned = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse AI image response:", content);
        parsed = { raw: content };
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("lookup-tax-code error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
