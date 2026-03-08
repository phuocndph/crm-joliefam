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

    // ===== DETECT WHAT DATA IS NEEDED =====
    const lowerQ = question.toLowerCase().trim();
    
    // Skip data fetching for short conversational messages
    const isConversational = lowerQ.length < 10 && /^(ok|vâng|dạ|ừ|được|hi|hello|xin chào|cảm ơn|thanks|bye|tạm biệt|có|không|rồi|oke|okie|yeah|yes|no|tiếp|next|à|uh|uhm|hmm)$/i.test(lowerQ);

    const wantsCustomers = !isConversational && /khách|kh|customer|chăm sóc|care|theo dõi|trạng thái|liên hệ|điện thoại|phone|email|mã kh|tag/i.test(lowerQ);
    const wantsProducts = !isConversational && /sản phẩm|product|giá|price|hàng|mặt hàng|danh mục|category|sku|tồn kho|stock/i.test(lowerQ);
    const wantsQuotes = !isConversational && /báo giá|quote|bảng giá|đơn giá|quotation|bg/i.test(lowerQ);
    const wantsTransactions = !isConversational && /giao dịch|transaction|thanh toán|payment|thu|chi|doanh thu|revenue|tài chính|finance|lợi nhuận/i.test(lowerQ);
    const wantsOrders = !isConversational && /đơn hàng|order|đơn|giao hàng|delivery|trạng thái đơn/i.test(lowerQ);
    const needsData = wantsCustomers || wantsProducts || wantsQuotes || wantsTransactions || wantsOrders;

    // ===== RUN ALL QUERIES IN PARALLEL (including role) =====
    const searchTerms = question.replace(/[^\w\sÀ-ỹ]/g, "").trim();
    const emptyResult = Promise.resolve({ data: null, count: 0 });

    const [roleResult, docsResult, customersResult, productsResult, quotesResult, transactionsResult, ordersResult] = await Promise.all([
      // Role query
      supabase.rpc("get_user_role", { _user_id: user.id }),

      // Knowledge docs (skip for conversational)
      isConversational ? emptyResult :
        supabase
          .from("knowledge_documents")
          .select("id, title, content, document_type, faq_answer")
          .textSearch("search_vector", searchTerms, { type: "plain" })
          .limit(3),

      // Customers
      wantsCustomers
        ? supabase.from("customers").select("name, phone, company, customer_code, current_status, auto_tags, total_spent", { count: "exact" }).order("updated_at", { ascending: false }).limit(15)
        : emptyResult,

      // Products
      wantsProducts
        ? supabase.from("products").select("name, sku, price, category, in_stock", { count: "exact" }).order("updated_at", { ascending: false }).limit(20)
        : emptyResult,

      // Quotes
      wantsQuotes
        ? supabase.from("quotes").select("quote_number, status, total_amount, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(10)
        : emptyResult,

      // Transactions
      wantsTransactions
        ? supabase.from("transactions").select("type, amount, description, date", { count: "exact" }).order("date", { ascending: false }).limit(15)
        : emptyResult,

      // Orders
      wantsOrders
        ? supabase.from("orders").select("order_number, display_order_number, status, total_amount, payment_status, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(10)
        : emptyResult,
    ]);

    const role = (roleResult.data as string) || "employee";
    const isManagerOrAdmin = role === "admin" || role === "manager";

    // ===== CHECK PROFIT/FINANCIAL RESTRICTION =====
    const wantsProfitData = /lợi nhuận|profit|lãi|margin|giá vốn|cost.?price|chi phí|biên lợi|lời|lỗ|biên độ/i.test(lowerQ);
    
    if (wantsProfitData && !isManagerOrAdmin) {
      const blockedMsg = "Xin lỗi, thông tin về lợi nhuận, giá vốn và chi phí chỉ dành cho tài khoản quản lý.";
      if (useStream) {
        const encoder = new TextEncoder();
        const body = `data: ${JSON.stringify({ sources: [] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: blockedMsg } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(encoder.encode(body), {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" },
        });
      }
      return new Response(JSON.stringify({ answer: blockedMsg, sources: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== BUILD KNOWLEDGE CONTEXT =====
    let knowledgeContext = "";
    let sources: { id: string; title: string; type: string }[] = [];
    let documents = docsResult.data || [];

    // Fallback if text search returned nothing (skip for conversational)
    if (documents.length === 0 && !isConversational) {
      const { data: allDocs } = await supabase
        .from("knowledge_documents")
        .select("id, title, content, document_type, faq_answer")
        .order("created_at", { ascending: false })
        .limit(3);
      documents = allDocs || [];
    }

    for (const doc of documents) {
      let docContent = doc.document_type === "faq"
        ? `[FAQ] ${doc.title}\n${doc.faq_answer || doc.content || ""}`
        : `[${doc.document_type.toUpperCase()}] ${doc.title}\n${(doc.content || "").substring(0, 2000)}`;
      if (knowledgeContext.length + docContent.length > 8000) break;
      knowledgeContext += "\n---\n" + docContent;
      sources.push({ id: doc.id, title: doc.title, type: doc.document_type });
    }

    // ===== BUILD LIVE DATA CONTEXT =====
    let liveDataContext = "";

    // Customers
    const customers = customersResult.data as any[];
    if (customers && customers.length > 0) {
      liveDataContext += `\n📋 KHÁCH HÀNG (${(customersResult as any).count || customers.length} tổng, hiển thị ${customers.length}):\n`;
      for (const c of customers) {
        const tags = (c.auto_tags || []).join(", ");
        let line = `• ${c.customer_code || "?"} - ${c.name}`;
        if (c.phone) line += ` | ${c.phone}`;
        if (c.company) line += ` | ${c.company}`;
        line += ` | ${c.current_status || "N/A"}`;
        if (tags) line += ` | ${tags}`;
        if (c.total_spent) line += ` | ${Number(c.total_spent).toLocaleString("vi-VN")}đ`;
        liveDataContext += line + "\n";
      }
    }

    // Products
    const products = productsResult.data as any[];
    if (products && products.length > 0) {
      liveDataContext += `\n🛍️ SẢN PHẨM (${(productsResult as any).count || products.length} tổng, hiển thị ${products.length}):\n`;
      for (const p of products) {
        let line = `• ${p.sku || "?"} - ${p.name}`;
        if (p.price) line += ` | ${Number(p.price).toLocaleString("vi-VN")}đ`;
        if (isManagerOrAdmin && p.cost_price) line += ` | Vốn: ${Number(p.cost_price).toLocaleString("vi-VN")}đ`;
        if (p.category) line += ` | ${p.category}`;
        line += ` | ${p.in_stock ? "✓" : "✗"}`;
        liveDataContext += line + "\n";
      }
    }

    // Quotes
    const quotes = quotesResult.data as any[];
    if (quotes && quotes.length > 0) {
      liveDataContext += `\n📄 BÁO GIÁ (${(quotesResult as any).count || quotes.length} tổng, hiển thị ${quotes.length}):\n`;
      for (const q of quotes) {
        liveDataContext += `• ${q.quote_number} | ${q.status} | ${Number(q.total_amount || 0).toLocaleString("vi-VN")}đ | ${new Date(q.created_at).toLocaleDateString("vi-VN")}\n`;
      }
    }

    // Transactions
    const transactions = transactionsResult.data as any[];
    if (transactions && transactions.length > 0) {
      let totalIncome = 0, totalExpense = 0;
      liveDataContext += `\n💰 GIAO DỊCH (${(transactionsResult as any).count || transactions.length} tổng, hiển thị ${transactions.length}):\n`;
      for (const t of transactions) {
        const amt = Number(t.amount || 0);
        if (t.type === "income") totalIncome += amt; else totalExpense += amt;
        liveDataContext += `• ${t.type === "income" ? "Thu" : "Chi"}: ${amt.toLocaleString("vi-VN")}đ | ${t.description || ""} | ${new Date(t.date).toLocaleDateString("vi-VN")}\n`;
      }
      liveDataContext += `Tổng thu: ${totalIncome.toLocaleString("vi-VN")}đ | Tổng chi: ${totalExpense.toLocaleString("vi-VN")}đ\n`;
    } else if (wantsTransactions && !isManagerOrAdmin) {
      liveDataContext += `\n💰 Thông tin giao dịch chỉ dành cho tài khoản quản lý.\n`;
    }

    // Orders
    const orders = ordersResult.data as any[];
    if (orders && orders.length > 0) {
      liveDataContext += `\n📦 ĐƠN HÀNG (${(ordersResult as any).count || orders.length} tổng, hiển thị ${orders.length}):\n`;
      for (const o of orders) {
        liveDataContext += `• ${o.display_order_number || o.order_number} | ${o.status} | ${Number(o.total_amount || 0).toLocaleString("vi-VN")}đ | TT: ${o.payment_status || "N/A"} | ${new Date(o.created_at).toLocaleDateString("vi-VN")}\n`;
      }
    }

    // ===== BUILD SYSTEM PROMPT =====
    const roleLabel = isManagerOrAdmin ? "Quản lý" : "Nhân viên";
    const profitRestriction = isManagerOrAdmin ? "" : "\n⚠️ KHÔNG cung cấp thông tin lợi nhuận, giá vốn, chi phí cho nhân viên.";

    const systemPrompt = `Bạn là trợ lý AI CRM cho ${roleLabel}.${profitRestriction}

HƯỚNG DẪN: Trả lời tiếng Việt, ngắn gọn, dựa trên dữ liệu thực tế. Format số tiền VNĐ.

KHO KIẾN THỨC:${knowledgeContext || " (Trống)"}

DỮ LIỆU:${liveDataContext || " (Không có)"}`;

    console.log(`Context: knowledge=${knowledgeContext.length}, liveData=${liveDataContext.length}, system=${systemPrompt.length}`);

    // ===== BUILD MESSAGES (truncate history) =====
    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (chatHistory && Array.isArray(chatHistory)) {
      // Only keep last 4 messages, truncate each to 500 chars
      for (const msg of chatHistory.slice(-4)) {
        messages.push({
          role: msg.role,
          content: (msg.content as string).length > 500
            ? (msg.content as string).substring(0, 500) + "..."
            : msg.content,
        });
      }
    }

    messages.push({ role: "user", content: question });

    // ===== CALL AI =====
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
        console.error("AI Gateway error:", response.status, errorText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Hệ thống đang bận, vui lòng thử lại sau." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI Gateway error: ${response.status}`);
      }

      const encoder = new TextEncoder();
      const sourcesEvent = `data: ${JSON.stringify({ sources })}\n\n`;
      const transformStream = new TransformStream();
      const reader = response.body!.getReader();
      const writer = transformStream.writable.getWriter();

      await writer.write(encoder.encode(sourcesEvent));

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
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Non-streaming fallback
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
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "Xin lỗi, không thể trả lời.";

    // Save history (fire and forget)
    supabase.from("knowledge_chat_history").insert({
      user_id: user.id, question, answer, sources: sources.length > 0 ? sources : null,
    });

    return new Response(
      JSON.stringify({ answer, sources }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("knowledge-chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
