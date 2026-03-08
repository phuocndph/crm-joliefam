import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

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
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    const lowerQ = question.toLowerCase().trim();

    // Conversational → skip ALL data, call AI immediately
    const isConversational = lowerQ.length < 15 && /^(ok|vâng|dạ|ừ|được|hi|hello|xin chào|cảm ơn|thanks|bye|tạm biệt|có|không|rồi|oke|okie|yeah|yes|no|tiếp|next|à|uh|uhm|hmm|tốt|good|great|ok rồi|được rồi|hiểu rồi|cảm ơn bạn|thank you)$/i.test(lowerQ);

    if (isConversational) {
      const msgs: any[] = [
        { role: "system", content: "Bạn là trợ lý AI CRM. Trả lời tiếng Việt, thân thiện, ngắn gọn." },
      ];
      if (chatHistory?.length) {
        for (const m of chatHistory.slice(-2)) {
          msgs.push({ role: m.role, content: (m.content as string).substring(0, 200) });
        }
      }
      msgs.push({ role: "user", content: question });

      return await callAI(LOVABLE_API_KEY, msgs, [], useStream, corsHeaders);
    }

    // Get role first (lightweight query)
    const { data: roleData } = await supabase.rpc("get_user_role", { _user_id: user.id });
    const role = (roleData as string) || "employee";
    const isManagerOrAdmin = role === "admin" || role === "manager";

    // Check profit restriction
    const wantsProfitData = /lợi nhuận|profit|lãi|margin|giá vốn|cost.?price|chi phí|biên lợi|lời|lỗ/i.test(lowerQ);
    if (wantsProfitData && !isManagerOrAdmin) {
      const blockedMsg = "Xin lỗi, thông tin về lợi nhuận và giá vốn chỉ dành cho tài khoản quản lý.";
      return sendBlockedResponse(blockedMsg, useStream, corsHeaders);
    }

    // Detect intent - pick at most 1-2 data types
    const wantsCustomers = /khách|customer|chăm sóc|liên hệ|phone|email|mã kh/i.test(lowerQ);
    const wantsProducts = /sản phẩm|product|giá|hàng|mặt hàng|sku|tồn kho/i.test(lowerQ);
    const wantsQuotes = /báo giá|quote|bảng giá|đơn giá|bg/i.test(lowerQ);
    const wantsOrders = /đơn hàng|order|đơn|giao hàng|delivery/i.test(lowerQ);
    const wantsTransactions = /giao dịch|transaction|thanh toán|thu|chi|doanh thu|tài chính/i.test(lowerQ);

    // Parallel fetch - only what's needed (no fallback queries)
    const searchTerms = question.replace(/[^\w\sÀ-ỹ]/g, "").trim();
    const empty = Promise.resolve({ data: null, count: 0 });

    const [docsResult, dataResult] = await Promise.all([
      // Knowledge docs
      supabase
        .from("knowledge_documents")
        .select("id, title, content, document_type, faq_answer")
        .textSearch("search_vector", searchTerms, { type: "plain" })
        .limit(3),

      // Fetch only the PRIMARY data type needed (pick first match)
      wantsCustomers
        ? supabase.from("customers").select("name, phone, company, customer_code, current_status, total_spent", { count: "exact" }).order("updated_at", { ascending: false }).limit(10)
        : wantsProducts
        ? supabase.from("products").select("name, sku, price, category, in_stock", { count: "exact" }).order("updated_at", { ascending: false }).limit(10)
        : wantsOrders
        ? supabase.from("orders").select("order_number, display_order_number, status, total_amount, payment_status, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(8)
        : wantsQuotes
        ? supabase.from("quotes").select("quote_number, status, total_amount, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(8)
        : wantsTransactions
        ? supabase.from("transactions").select("type, amount, description, date", { count: "exact" }).order("date", { ascending: false }).limit(10)
        : empty,
    ]);

    // Build knowledge context (max 4000 chars)
    let knowledgeCtx = "";
    const sources: { id: string; title: string; type: string }[] = [];
    for (const doc of (docsResult.data || [])) {
      const text = doc.document_type === "faq"
        ? `Q: ${doc.title}\nA: ${doc.faq_answer || doc.content || ""}`
        : `${doc.title}: ${(doc.content || "").substring(0, 1500)}`;
      if (knowledgeCtx.length + text.length > 4000) break;
      knowledgeCtx += "\n" + text;
      sources.push({ id: doc.id, title: doc.title, type: doc.document_type });
    }

    // Build live data context (compact)
    let dataCtx = "";
    const rows = dataResult.data as any[];
    if (rows?.length) {
      const total = (dataResult as any).count || rows.length;
      if (wantsCustomers) {
        dataCtx = `\nKHÁCH HÀNG (${total}):\n` + rows.map((c: any) =>
          `${c.customer_code||"?"} ${c.name} ${c.phone||""} ${c.current_status||""} ${c.total_spent ? Number(c.total_spent).toLocaleString("vi-VN")+"đ" : ""}`
        ).join("\n");
      } else if (wantsProducts) {
        dataCtx = `\nSẢN PHẨM (${total}):\n` + rows.map((p: any) =>
          `${p.sku||"?"} ${p.name} ${p.price ? Number(p.price).toLocaleString("vi-VN")+"đ" : ""} ${p.category||""} ${p.in_stock?"✓":"✗"}`
        ).join("\n");
      } else if (wantsOrders) {
        dataCtx = `\nĐƠN HÀNG (${total}):\n` + rows.map((o: any) =>
          `${o.display_order_number||o.order_number} ${o.status} ${Number(o.total_amount||0).toLocaleString("vi-VN")}đ TT:${o.payment_status||"?"}`
        ).join("\n");
      } else if (wantsQuotes) {
        dataCtx = `\nBÁO GIÁ (${total}):\n` + rows.map((q: any) =>
          `${q.quote_number} ${q.status} ${Number(q.total_amount||0).toLocaleString("vi-VN")}đ`
        ).join("\n");
      } else if (wantsTransactions) {
        dataCtx = `\nGIAO DỊCH (${total}):\n` + rows.map((t: any) =>
          `${t.type==="income"?"Thu":"Chi"} ${Number(t.amount||0).toLocaleString("vi-VN")}đ ${t.description||""}`
        ).join("\n");
      }
    }

    const profitNote = isManagerOrAdmin ? "" : " Không tiết lộ giá vốn/lợi nhuận.";
    const systemPrompt = `Trợ lý AI CRM (${isManagerOrAdmin?"Quản lý":"NV"}).${profitNote} Trả lời tiếng Việt, ngắn gọn.${knowledgeCtx ? "\n\nTài liệu:" + knowledgeCtx : ""}${dataCtx ? "\n\nDữ liệu:" + dataCtx : ""}`;

    console.log(`ctx: kb=${knowledgeCtx.length} data=${dataCtx.length} total=${systemPrompt.length}`);

    const messages: any[] = [{ role: "system", content: systemPrompt }];
    if (chatHistory?.length) {
      for (const msg of chatHistory.slice(-4)) {
        messages.push({
          role: msg.role,
          content: (msg.content as string).length > 300 ? (msg.content as string).substring(0, 300) + "..." : msg.content,
        });
      }
    }
    messages.push({ role: "user", content: question });

    return await callAI(LOVABLE_API_KEY, messages, sources, useStream, corsHeaders);

  } catch (error) {
    console.error("knowledge-chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function callAI(apiKey: string, messages: any[], sources: any[], useStream: boolean, cors: Record<string, string>) {
  const response = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, stream: !!useStream, max_tokens: 500 }),
  });

  if (!response.ok) {
    const t = await response.text();
    console.error("AI error:", response.status, t);
    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Hệ thống đang bận, vui lòng thử lại sau." }), {
        status: 429, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "Hết quota AI, vui lòng liên hệ quản trị." }), {
        status: 402, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    throw new Error(`AI error: ${response.status}`);
  }

  if (useStream) {
    const encoder = new TextEncoder();
    const transformStream = new TransformStream();
    const reader = response.body!.getReader();
    const writer = transformStream.writable.getWriter();
    await writer.write(encoder.encode(`data: ${JSON.stringify({ sources })}\n\n`));
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { writer.close(); break; }
          await writer.write(value);
        }
      } catch (e) { writer.abort(e); }
    })();
    return new Response(transformStream.readable, {
      headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    });
  }

  const data = await response.json();
  return new Response(
    JSON.stringify({ answer: data.choices?.[0]?.message?.content || "Xin lỗi, không thể trả lời.", sources }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
}

function sendBlockedResponse(msg: string, useStream: boolean, cors: Record<string, string>) {
  if (useStream) {
    const encoder = new TextEncoder();
    const body = `data: ${JSON.stringify({ sources: [] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: msg } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(encoder.encode(body), {
      headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
    });
  }
  return new Response(JSON.stringify({ answer: msg, sources: [] }), { headers: { ...cors, "Content-Type": "application/json" } });
}
