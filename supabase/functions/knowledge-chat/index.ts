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

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GOOGLE_GEMINI_API_KEY is not configured");
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

    const { question, chatHistory } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: "Question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all knowledge documents accessible to this user
    const { data: documents, error: docError } = await supabase
      .from("knowledge_documents")
      .select("id, title, content, document_type, faq_answer")
      .order("created_at", { ascending: false });

    if (docError) {
      console.error("Error fetching documents:", docError);
      throw new Error("Failed to fetch knowledge documents");
    }

    // Build context from documents, limit to ~30k chars
    let context = "";
    const sources: { id: string; title: string; type: string }[] = [];
    const MAX_CONTEXT = 30000;

    for (const doc of documents || []) {
      let docContent = "";
      if (doc.document_type === "faq") {
        docContent = `[FAQ] ${doc.title}\nCâu trả lời: ${doc.faq_answer || doc.content || ""}`;
      } else {
        docContent = `[${doc.document_type.toUpperCase()}] ${doc.title}\n${doc.content || ""}`;
      }

      if (context.length + docContent.length > MAX_CONTEXT) {
        // Add truncated version
        const remaining = MAX_CONTEXT - context.length;
        if (remaining > 200) {
          context += "\n\n---\n" + docContent.substring(0, remaining) + "...(cắt bớt)";
          sources.push({ id: doc.id, title: doc.title, type: doc.document_type });
        }
        break;
      }

      context += "\n\n---\n" + docContent;
      sources.push({ id: doc.id, title: doc.title, type: doc.document_type });
    }

    // Build messages for Gemini
    const systemPrompt = `Bạn là trợ lý AI hỗ trợ nhân viên bán hàng trả lời câu hỏi của khách hàng. 

HƯỚNG DẪN:
- Chỉ trả lời dựa trên nội dung tài liệu được cung cấp bên dưới
- Nếu không tìm thấy thông tin liên quan trong tài liệu, hãy nói rõ: "Tôi không tìm thấy thông tin này trong kho kiến thức. Vui lòng liên hệ quản lý để được hỗ trợ."
- Trả lời bằng tiếng Việt, ngắn gọn, chuyên nghiệp
- Nếu có nhiều tài liệu liên quan, tổng hợp thông tin từ tất cả
- Đưa ra câu trả lời mà nhân viên có thể gửi trực tiếp cho khách hàng

KHO KIẾN THỨC:
${context || "(Chưa có tài liệu nào trong kho kiến thức)"}`;

    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add chat history for context
    if (chatHistory && Array.isArray(chatHistory)) {
      for (const msg of chatHistory.slice(-6)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: question });

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiBody = {
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : m.role === "system" ? "user" : "user",
        parts: [{ text: m.role === "system" ? `[System Instructions]\n${m.content}` : m.content }],
      })),
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const answer =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Xin lỗi, tôi không thể trả lời câu hỏi này.";

    // Save chat history
    await supabase.from("knowledge_chat_history").insert({
      user_id: user.id,
      question,
      answer,
      sources: sources.length > 0 ? sources : null,
    });

    return new Response(
      JSON.stringify({ answer, sources }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("knowledge-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
