import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

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

    console.log(`Extracting document: ${fileName || storagePath}`);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: fileData, error: downloadError } = await adminClient.storage
      .from("knowledge-files")
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message || "No data"}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    console.log(`File size: ${uint8Array.length} bytes`);

    let extractedText = "";
    const lowerName = (fileName || storagePath || "").toLowerCase();

    if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
      extractedText = new TextDecoder().decode(uint8Array);
    } else if (lowerName.endsWith(".docx")) {
      extractedText = await extractTextFromDOCX(uint8Array);
    } else if (lowerName.endsWith(".pdf")) {
      extractedText = await extractTextFromPDF(uint8Array);
    } else {
      try {
        extractedText = new TextDecoder().decode(uint8Array);
      } catch {
        extractedText = "[Không thể đọc nội dung file này]";
      }
    }

    // If extraction got meaningful text, optionally clean with AI
    if (extractedText.length > 100 && (lowerName.endsWith(".pdf") || lowerName.endsWith(".docx"))) {
      extractedText = await cleanWithAI(extractedText, lowerName);
    }

    // Final cleanup
    extractedText = extractedText
      .replace(/\x00/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!extractedText || extractedText.length < 10) {
      extractedText = "[Không thể tự động đọc nội dung file này. File có thể được mã hóa hoặc chứa hình ảnh. Vui lòng nhập nội dung thủ công.]";
    }

    console.log(`Extraction complete: ${extractedText.length} chars`);

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

async function extractTextFromDOCX(data: Uint8Array): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(data);
    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) {
      console.error("DOCX: word/document.xml not found in archive");
      return "";
    }
    const docXml = await docXmlFile.async("string");

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, "text/xml");

    const textParts: string[] = [];
    const paragraphs = xmlDoc.getElementsByTagName("w:p");
    for (let i = 0; i < paragraphs.length; i++) {
      const runs = paragraphs[i].getElementsByTagName("w:t");
      let paragraphText = "";
      for (let j = 0; j < runs.length; j++) {
        paragraphText += runs[j].textContent || "";
      }
      if (paragraphText.trim()) {
        textParts.push(paragraphText);
      }
    }

    console.log(`DOCX extracted ${textParts.length} paragraphs, total chars: ${textParts.join("\n").length}`);
    return textParts.join("\n");
  } catch (err) {
    console.error("DOCX extraction error:", err);
    return "";
  }
}

async function extractTextFromPDF(data: Uint8Array): Promise<string> {
  let text = extractTextFromPDFRegex(data);
  console.log(`PDF regex extraction got ${text.length} chars`);

  if (text.length < 100) {
    console.log("Regex insufficient, using AI Gateway to extract PDF text...");
    text = await extractPDFWithAI(data);
  }

  return text;
}

// Safe base64 encoding that avoids stack overflow
function uint8ArrayToBase64(data: Uint8Array): string {
  const chunkSize = 8192;
  let base64 = "";
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
    let binaryStr = "";
    for (let j = 0; j < chunk.length; j++) {
      binaryStr += String.fromCharCode(chunk[j]);
    }
    base64 += btoa(binaryStr);
  }
  return base64;
}

async function extractPDFWithAI(data: Uint8Array): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const BEEKNOEE_API_KEY = Deno.env.get("BEEKNOEE_API_KEY");

  if (!LOVABLE_API_KEY && !BEEKNOEE_API_KEY) {
    console.error("No AI API key available for PDF extraction");
    return "[Không có API key để đọc PDF]";
  }

  try {
    if (data.length > 5 * 1024 * 1024) {
      console.log(`Large PDF: ${(data.length / 1024 / 1024).toFixed(1)}MB, may take longer...`);
    }

    const base64 = uint8ArrayToBase64(data);
    console.log(`Base64 encoded: ${base64.length} chars`);

    const pdfMessages = [
      {
        role: "system",
        content: "Bạn là công cụ trích xuất văn bản từ PDF. Hãy đọc file PDF được gửi và trả về TOÀN BỘ nội dung text trong file. Giữ nguyên cấu trúc, tiêu đề, đoạn văn. Chỉ trả về nội dung thuần túy, KHÔNG thêm giải thích hay bình luận.",
      },
      {
        role: "user",
        content: [
          { type: "file", file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${base64}` } },
          { type: "text", text: "Hãy trích xuất toàn bộ nội dung text từ file PDF này. Trả về nội dung thuần túy." },
        ],
      },
    ];

    // Try Lovable AI first
    if (LOVABLE_API_KEY) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: pdfMessages }),
      });

      if (response.ok) {
        const result = await response.json();
        const content = result.choices?.[0]?.message?.content || "";
        console.log(`Lovable AI PDF extraction got ${content.length} chars`);
        return content;
      }

      const errText = await response.text();
      console.warn(`Lovable AI PDF extraction failed (${response.status}): ${errText.substring(0, 200)}`);
    }

    // Fallback to Beeknoee with model chain
    if (BEEKNOEE_API_KEY) {
      const models = ["glm-4.7-flash", "glm-4.5-flash", "gpt-oss-120b"];
      for (const model of models) {
        try {
          console.log(`Trying Beeknoee ${model} for PDF extraction...`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 25000);
          const response = await fetch("https://platform.beeknoee.com/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${BEEKNOEE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: pdfMessages }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const result = await response.json();
            const content = result.choices?.[0]?.message?.content || "";
            console.log(`Beeknoee ${model} PDF extraction got ${content.length} chars`);
            return content;
          }

          const errText = await response.text();
          console.warn(`Beeknoee ${model} PDF failed (${response.status}): ${errText.substring(0, 150)}`);
          if (response.status === 429) await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.warn(`Beeknoee ${model} PDF error:`, e instanceof Error ? e.message : e);
        }
      }
    }

    return "[Không thể đọc PDF qua AI]";
  } catch (err) {
    console.error("AI PDF extraction failed:", err);
    return "[Lỗi khi đọc PDF qua AI]";
  }
}

function extractTextFromPDFRegex(data: Uint8Array): string {
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

async function cleanWithAI(rawText: string, fileName: string): Promise<string> {
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const BEEKNOEE_API_KEY = Deno.env.get("BEEKNOEE_API_KEY");
    if (!LOVABLE_API_KEY && !BEEKNOEE_API_KEY) return rawText;

    const fileType = fileName.endsWith(".pdf") ? "PDF" : "DOCX";
    const cleanMessages = [
      { role: "system", content: "Bạn là công cụ xử lý văn bản. Nhiệm vụ: nhận đoạn text thô được trích xuất từ file, làm sạch và trả về nội dung có cấu trúc. Giữ nguyên toàn bộ nội dung, chỉ sửa lỗi format. Trả về nội dung thuần túy, KHÔNG thêm giải thích." },
      { role: "user", content: `Làm sạch đoạn text sau được trích xuất từ file ${fileType}:\n\n${rawText.substring(0, 25000)}` },
    ];

    // Try Lovable AI first
    if (LOVABLE_API_KEY) {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: cleanMessages }),
      });
      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        return aiData.choices?.[0]?.message?.content || rawText;
      }
      console.warn(`Lovable cleanWithAI failed (${aiResponse.status})`);
      await aiResponse.text();
    }

    // Fallback to Beeknoee with model chain
    if (BEEKNOEE_API_KEY) {
      const models = ["glm-4.7-flash", "glm-4.5-flash", "gpt-oss-120b"];
      for (const model of models) {
        try {
          console.log(`Trying Beeknoee ${model} for text cleaning...`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 25000);
          const aiResponse = await fetch("https://platform.beeknoee.com/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${BEEKNOEE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: cleanMessages }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            return aiData.choices?.[0]?.message?.content || rawText;
          }
          console.warn(`Beeknoee ${model} clean failed (${aiResponse.status})`);
          if (aiResponse.status === 429) await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.warn(`Beeknoee ${model} clean error:`, e instanceof Error ? e.message : e);
        }
      }
    }

    return rawText;
  } catch {
    return rawText;
  }
}
