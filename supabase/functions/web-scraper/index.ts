import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { urls, model, prompt, action } = await req.json();

    // Action: list models from Beeknoee
    if (action === "list_models") {
      const apiKey = Deno.env.get("BEEKNOEE_API_KEY");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "BEEKNOEE_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const res = await fetch("https://platform.beeknoee.com/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "URLs array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const beeknoeeKey = Deno.env.get("BEEKNOEE_API_KEY");

    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!beeknoeeKey) {
      return new Response(
        JSON.stringify({ error: "BEEKNOEE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const selectedModel = model || "gemini-2.5-flash-lite";
    const userPrompt = prompt || `Trích xuất tất cả thông tin thành viên/doanh nghiệp từ nội dung sau thành JSON array.
Mỗi phần tử gồm các trường: name (Họ tên), company (Công ty), profession (Ngành nghề), phone (SĐT), email (Email).
Nếu không có thông tin thì để chuỗi rỗng "".
CHỈ trả về JSON array, KHÔNG markdown, KHÔNG giải thích.`;

    const CONCURRENCY = 5; // Process 5 URLs at a time

    async function processUrl(url: string): Promise<any> {
      let formattedUrl = url.trim();
      if (!formattedUrl) return null;
      if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
      }

      console.log(`Scraping: ${formattedUrl}`);

      try {
        // Step 1: Firecrawl scrape with retry
        let scrapeData: any = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${firecrawlKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url: formattedUrl,
                formats: ["markdown"],
                onlyMainContent: true,
                waitFor: 2000,
              }),
            });

            scrapeData = await scrapeRes.json();
            if (scrapeRes.ok && scrapeData.success) break;
            
            if (attempt === 0) {
              console.log(`Retry scrape for ${formattedUrl}`);
              await new Promise((r) => setTimeout(r, 1000));
            }
          } catch (e) {
            if (attempt === 1) throw e;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

        if (!scrapeData?.success) {
          return {
            url: formattedUrl,
            success: false,
            error: scrapeData?.error || "Scrape failed after retries",
            data: [],
          };
        }

        const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";
        if (!markdown || markdown.length < 10) {
          return {
            url: formattedUrl,
            success: false,
            error: "No content found on page",
            data: [],
          };
        }

        console.log(`Scraped ${markdown.length} chars from ${formattedUrl}`);

        // Step 2: AI extraction via Beeknoee with retry
        let aiData: any = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const aiRes = await fetch("https://platform.beeknoee.com/api/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${beeknoeeKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: selectedModel,
                messages: [
                  {
                    role: "system",
                    content: "Bạn là trợ lý trích xuất dữ liệu. Chỉ trả về JSON array hợp lệ, không markdown, không giải thích.",
                  },
                  {
                    role: "user",
                    content: `${userPrompt}\n\n--- NỘI DUNG TRANG WEB ---\n${markdown.substring(0, 50000)}`,
                  },
                ],
                temperature: 0.1,
              }),
            });

            aiData = await aiRes.json();
            if (aiRes.ok) break;
            
            if (attempt === 0) {
              console.log(`Retry AI for ${formattedUrl}`);
              await new Promise((r) => setTimeout(r, 1000));
            }
          } catch (e) {
            if (attempt === 1) throw e;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

        const content = aiData?.choices?.[0]?.message?.content || "[]";
        let parsed: any[] = [];
        try {
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          console.error("JSON parse error:", e, "Content:", content.substring(0, 200));
        }

        return {
          url: formattedUrl,
          success: true,
          data: Array.isArray(parsed) ? parsed : [],
        };
      } catch (err) {
        console.error(`Error processing ${formattedUrl}:`, err);
        return {
          url: formattedUrl,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
          data: [],
        };
      }
    }

    // Process URLs in parallel batches of CONCURRENCY
    const results: any[] = [];
    const validUrls = urls.filter((u: string) => u.trim().length > 0);
    
    for (let i = 0; i < validUrls.length; i += CONCURRENCY) {
      const batch = validUrls.slice(i, i + CONCURRENCY);
      console.log(`Processing batch ${Math.floor(i / CONCURRENCY) + 1}: ${batch.length} URLs`);
      
      const batchResults = await Promise.allSettled(batch.map((u: string) => processUrl(u)));
      
      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value) {
          results.push(result.value);
        } else if (result.status === "rejected") {
          results.push({ url: "unknown", success: false, error: result.reason?.message || "Unknown", data: [] });
        }
      }
      
      // Small delay between batches
      if (i + CONCURRENCY < validUrls.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Web scraper error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
