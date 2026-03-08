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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

    const { question, chatHistory, stream: useStream } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: "Question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Smart document retrieval using full-text search
    let documents: any[] = [];
    let sources: { id: string; title: string; type: string }[] = [];

    // Try full-text search first
    const searchTerms = question.replace(/[^\w\sÀ-ỹ]/g, "").trim();
    
    const { data: searchDocs, error: searchError } = await supabase
      .from("knowledge_documents")
      .select("id, title, content, document_type, faq_answer")
      .textSearch("search_vector", searchTerms, { type: "plain" })
      .limit(5);

    if (!searchError && searchDocs && searchDocs.length > 0) {
      documents = searchDocs;
      console.log(`Full-text search found ${documents.length} relevant documents`);
    } else {
      // Fallback: fetch all documents (limited)
      console.log("Full-text search returned no results, fetching all documents");
      const { data: allDocs, error: docError } = await supabase
        .from("knowledge_documents")
        .select("id, title, content, document_type, faq_answer")
        .order("created_at", { ascending: false })
        .limit(20);

      if (docError) {
        console.error("Error fetching documents:", docError);
        throw new Error("Failed to fetch knowledge documents");
      }
      documents = allDocs || [];
    }

    // Build context from documents, limit to ~30k chars
    let context = "";
    const MAX_CONTEXT = 30000;

    for (const doc of documents) {
      let docContent = "";
      if (doc.document_type === "faq") {
        docContent = `[FAQ] ${doc.title}\nCâu trả lời: ${doc.faq_answer || doc.content || ""}`;
      } else {
        docContent = `[${doc.document_type.toUpperCase()}] ${doc.title}\n${doc.content || ""}`;
      }

      if (context.length + docContent.length > MAX_CONTEXT) {
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

    if (chatHistory && Array.isArray(chatHistory)) {
      for (const msg of chatHistory.slice(-6)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: question });

    // Streaming mode
    if (useStream) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI Gateway stream error:", response.status, errorText);

        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Hệ thống đang bận, vui lòng thử lại sau ít phút." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Đã hết quota AI, vui lòng liên hệ quản trị viên." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        throw new Error(`AI Gateway error: ${response.status}`);
      }

      // Create a transform stream that prepends sources info as first SSE event
      const encoder = new TextEncoder();
      const sourcesEvent = `data: ${JSON.stringify({ sources })}\n\n`;
      
      const transformStream = new TransformStream({
        start(controller) {
          // Send sources as the first event
          controller.enqueue(encoder.encode(sourcesEvent));
        },
        transform(chunk, controller) {
          controller.enqueue(chunk);
        },
      });

      // Pipe the AI response through our transform
      response.body!.pipeTo(transformStream.writable);

      // Save chat history asynchronously (collect full answer later via client)
      // We'll save from client side after stream completes

      return new Response(transformStream.readable, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Non-streaming mode (fallback)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Hệ thống đang bận, vui lòng thử lại sau ít phút." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Đã hết quota AI, vui lòng liên hệ quản trị viên." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "Xin lỗi, tôi không thể trả lời câu hỏi này.";

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
