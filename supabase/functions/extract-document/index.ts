import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import JSZip from "https://esm.sh/jszip@3.10.1";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.6.0";

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

    // Parse using DOMParser
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
  try {
    const doc = await getDocument(data).promise;
    const textParts: string[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(" ");
      if (pageText.trim()) {
        textParts.push(pageText);
      }
    }

    console.log(`PDF extracted ${doc.numPages} pages, total chars: ${textParts.join("\n").length}`);
    return textParts.join("\n");
  } catch (err) {
    console.error("PDF extraction with pdfjs failed, trying regex fallback:", err);
    return extractTextFromPDFRegex(data);
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
    if (!LOVABLE_API_KEY) return rawText;

    const fileType = fileName.endsWith(".pdf") ? "PDF" : "DOCX";
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
            content: `Làm sạch đoạn text sau được trích xuất từ file ${fileType}:\n\n${rawText.substring(0, 25000)}`,
          },
        ],
      }),
    });

    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      return aiData.choices?.[0]?.message?.content || rawText;
    }
    return rawText;
  } catch {
    return rawText;
  }
}
