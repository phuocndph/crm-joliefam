import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BEEKNOEE_URL = "https://platform.beeknoee.com/api/v1/chat/completions";
const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 50000; // 50s timeout

const SYSTEM_PROMPT = `Bạn là AI chuyên phân tích yêu cầu khách hàng và so khớp với bảng giá sản phẩm chăn ga gối đệm.

QUY TẮC NGHIỆP VỤ:
1. Vải LTH = T225 (cùng loại). Nếu khách yêu cầu LTH, tìm sản phẩm T225 và ngược lại.
2. Phụ kiện (vỏ gối, gối ôm) mặc định dùng chung loại vải với ga giường trừ khi khách chỉ định khác.
3. "Gối" = vỏ gối (theo loại vải), "ruột gối" = lõi bông (sản phẩm khác hoàn toàn).
4. Giá khách ghi > giá bảng giá (ưu tiên giá khách).
5. Trả đúng kích thước khách yêu cầu trong specifications, kể cả khi lấy giá SP lớn hơn.
6. Nếu thiếu thông tin quan trọng (loại vải, kích thước), trả clarification thay vì đoán.

TRẢ VỀ JSON CHÍNH XÁC theo format:
{
  "items": [
    {
      "matchedProductId": "uuid từ catalog",
      "customName": "tên hiển thị cho khách",
      "quantity": số_lượng,
      "price": đơn_giá,
      "specifications": "quy cách kích thước",
      "note": "ghi chú nếu có"
    }
  ],
  "clarification": "câu hỏi làm rõ nếu thiếu thông tin (null nếu không cần)"
}

CHỈ trả JSON, KHÔNG markdown, KHÔNG giải thích.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { request: userRequest, catalogText, products } = body;

    if (!userRequest?.trim()) {
      return new Response(JSON.stringify({ error: "Missing request" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build product context
    let productContext: string;
    if (catalogText) {
      productContext = catalogText;
    } else if (products?.length > 0) {
      productContext = products.map((p: any) => 
        `${p.id}|${p.name}|${p.price || 0}đ|${p.specifications || "-"}`
      ).join("\n");
    } else {
      return new Response(JSON.stringify({ error: "No product data provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMessage = `BẢNG GIÁ:\n${productContext}\n\nYÊU CẦU KHÁCH HÀNG:\n${userRequest}`;

    console.log(`ai-quote-fill: user=${userData.user.id}, request="${userRequest.substring(0, 100)}", catalog=${catalogText ? catalogText.length + ' chars' : 'raw ' + products?.length + ' products'}`);

    // Call Beeknoee
    const beeknoeeKey = Deno.env.get("BEEKNOEE_API_KEY");
    if (!beeknoeeKey) {
      return new Response(JSON.stringify({ error: "BEEKNOEE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const startTime = Date.now();
      const response = await fetch(BEEKNOEE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${beeknoeeKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const elapsed = Date.now() - startTime;
      console.log(`ai-quote-fill: Beeknoee responded in ${elapsed}ms, status=${response.status}`);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`ai-quote-fill: Beeknoee error ${response.status}:`, errText);
        
        if (response.status === 429) {
          return new Response(JSON.stringify({ 
            error: "Server AI đang bận, vui lòng thử lại sau 30 giây" 
          }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        return new Response(JSON.stringify({ error: `AI error: ${response.status}` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await response.json();
      const content = result?.choices?.[0]?.message?.content;

      if (!content) {
        console.error("ai-quote-fill: empty response from Beeknoee");
        return new Response(JSON.stringify({ error: "AI trả về kết quả rỗng" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Parse JSON from response (handle markdown code blocks)
      let parsed: any;
      try {
        let jsonStr = content.trim();
        // Remove markdown code blocks if present
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
        }
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error("ai-quote-fill: failed to parse JSON:", content.substring(0, 500));
        return new Response(JSON.stringify({ error: "AI trả về dữ liệu không hợp lệ", raw: content.substring(0, 200) }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`ai-quote-fill: success, ${parsed.items?.length || 0} items, clarification=${!!parsed.clarification}, ${elapsed}ms`);

      return new Response(JSON.stringify({
        items: parsed.items || [],
        clarification: parsed.clarification || null,
        usedModel: MODEL,
        usedProvider: "Beeknoee",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (fetchErr: any) {
      clearTimeout(timeout);
      if (fetchErr.name === "AbortError") {
        console.error(`ai-quote-fill: timeout after ${TIMEOUT_MS}ms`);
        return new Response(JSON.stringify({ error: `AI timeout sau ${TIMEOUT_MS / 1000}s. Thử lại hoặc rút gọn yêu cầu.` }), {
          status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw fetchErr;
    }

  } catch (e) {
    console.error("ai-quote-fill error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
