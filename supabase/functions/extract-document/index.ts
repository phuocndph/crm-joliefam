import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Auth client to verify user
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { storagePath, fileName } = await req.json();
    if (!storagePath) {
      return new Response(JSON.stringify({ error: "storagePath is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to download from private bucket
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: fileData, error: downloadError } = await adminClient.storage
      .from("knowledge-files")
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message || "No data"}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    let extractedText = "";
    const lowerName = (fileName || storagePath || "").toLowerCase();

    if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
      extractedText = new TextDecoder().decode(uint8Array);
    } else if (lowerName.endsWith(".pdf") || lowerName.endsWith(".docx")) {
      // Use AI Gateway to extract text from binary documents
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }

      // Convert to base64 for AI processing
      const base64Content = btoa(String.fromCharCode(...uint8Array.slice(0, 500000)));
      
      // For PDF/DOCX, try basic extraction first, then use AI to clean up
      let rawText = "";
      if (lowerName.endsWith(".pdf")) {
        rawText = extractTextFromPDF(uint8Array);
      } else {
        rawText = extractTextFromDOCX(uint8Array);
      }

      if (rawText.length > 100) {
        // Raw extraction worked, use AI to clean it up
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
                content: "Bạn là công cụ xử lý văn bản. Nhiệm vụ: nhận đoạn text thô được trích xuất từ file, làm sạch và trả về nội dung có cấu trúc. Giữ nguyên toàn bộ nội dung, chỉ sửa lỗi format. Trả về nội dung thuần túy, KHÔNG thêm giải thích.",
              },
              {
                role: "user",
                content: `Làm sạch đoạn text sau được trích xuất từ file ${lowerName.endsWith(".pdf") ? "PDF" : "DOCX"}:\n\n${rawText.substring(0, 25000)}`,
              },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          extractedText = aiData.choices?.[0]?.message?.content || rawText;
        } else {
          extractedText = rawText;
        }
      } else {
        // Raw extraction failed, tell user
        extractedText = "[Không thể tự động đọc nội dung file này. File có thể được mã hóa hoặc chứa hình ảnh. Vui lòng nhập nội dung thủ công bằng cách chỉnh sửa tài liệu.]";
      }
    } else {
      try {
        extractedText = new TextDecoder().decode(uint8Array);
      } catch {
        extractedText = "[Không thể đọc nội dung file này]";
      }
    }

    // Clean up
    extractedText = extractedText
      .replace(/\x00/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!extractedText) {
      extractedText = "[File không chứa nội dung text có thể đọc được. Vui lòng nhập nội dung thủ công.]";
    }

    return new Response(
      JSON.stringify({ content: extractedText.substring(0, 100000) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("extract-document error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractTextFromPDF(data: Uint8Array): string {
  const text = new TextDecoder("latin1").decode(data);
  const textParts: string[] = [];

  const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
  let match;
  while ((match = streamRegex.exec(text)) !== null) {
    const stream = match[1];
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(stream)) !== null) {
      textParts.push(tjMatch[1]);
    }

    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrayRegex.exec(stream)) !== null) {
      const innerRegex = /\(([^)]*)\)/g;
      let innerMatch;
      while ((innerMatch = innerRegex.exec(tjArrMatch[1])) !== null) {
        textParts.push(innerMatch[1]);
      }
    }
  }

  return textParts.join(" ").replace(/\\n/g, "\n").replace(/\\\(/g, "(").replace(/\\\)/g, ")");
}

function extractTextFromDOCX(data: Uint8Array): string {
  try {
    // DOCX is a ZIP file. Look for PK signature and try to find word/document.xml
    const text = new TextDecoder("utf-8", { fatal: false }).decode(data);
    const textParts: string[] = [];

    // Look for <w:t> tags
    const wtRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let match;
    while ((match = wtRegex.exec(text)) !== null) {
      if (match[1].trim()) {
        textParts.push(match[1]);
      }
    }

    if (textParts.length > 0) {
      return textParts.join(" ");
    }

    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 50000);
  } catch {
    return "";
  }
}
