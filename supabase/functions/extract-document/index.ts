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

    const { fileUrl, fileName } = await req.json();
    if (!fileUrl) {
      return new Response(JSON.stringify({ error: "fileUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the file from storage
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status}`);
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    let extractedText = "";
    const lowerName = (fileName || "").toLowerCase();

    if (lowerName.endsWith(".pdf")) {
      // Simple PDF text extraction - extract readable text strings
      extractedText = extractTextFromPDF(uint8Array);
    } else if (lowerName.endsWith(".docx")) {
      // DOCX is a ZIP containing XML
      extractedText = await extractTextFromDOCX(uint8Array);
    } else if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
      extractedText = new TextDecoder().decode(uint8Array);
    } else {
      // Try as plain text
      try {
        extractedText = new TextDecoder().decode(uint8Array);
      } catch {
        extractedText = "[Không thể đọc nội dung file này]";
      }
    }

    // Clean up extracted text
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
  // Simple PDF text extraction by finding text between BT and ET markers
  const text = new TextDecoder("latin1").decode(data);
  const textParts: string[] = [];

  // Extract text from PDF streams
  const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
  let match;
  while ((match = streamRegex.exec(text)) !== null) {
    const stream = match[1];
    // Look for text showing operators: Tj, TJ, '
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(stream)) !== null) {
      textParts.push(tjMatch[1]);
    }

    // TJ arrays
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

async function extractTextFromDOCX(data: Uint8Array): Promise<string> {
  // DOCX files are ZIP archives containing word/document.xml
  // Use a simple approach: find XML text content
  try {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(data);
    
    // Try to find readable text patterns in the DOCX
    const textParts: string[] = [];
    
    // Look for <w:t> tags which contain text in DOCX XML
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
    
    // Fallback: extract any readable text
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 50000);
  } catch {
    return "[Không thể đọc file DOCX. Vui lòng nhập nội dung thủ công.]";
  }
}
