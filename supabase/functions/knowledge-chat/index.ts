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

    // ===== GET USER ROLE =====
    const { data: userRole } = await supabase.rpc("get_user_role", { _user_id: user.id });
    const role = userRole || "employee";
    const isManagerOrAdmin = role === "admin" || role === "manager";
    console.log(`User role: ${role}, isManagerOrAdmin: ${isManagerOrAdmin}`);

    // ===== CHECK PROFIT/FINANCIAL RESTRICTION =====
    const wantsProfitData = /lợi nhuận|profit|lãi|margin|giá vốn|cost.?price|chi phí|biên lợi|lời|lỗ|biên độ/i.test(question.toLowerCase());
    
    if (wantsProfitData && !isManagerOrAdmin) {
      const blockedMsg = "Xin lỗi, thông tin về lợi nhuận, giá vốn và chi phí chỉ dành cho tài khoản quản lý. Vui lòng liên hệ quản lý của bạn nếu cần thông tin này.";
      
      // Save to history
      await supabase.from("knowledge_chat_history").insert({
        user_id: user.id,
        question,
        answer: blockedMsg,
        sources: null,
      });

      if (useStream) {
        const encoder = new TextEncoder();
        const body = `data: ${JSON.stringify({ sources: [] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: blockedMsg } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(encoder.encode(body), {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      return new Response(
        JSON.stringify({ answer: blockedMsg, sources: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== FETCH KNOWLEDGE DOCUMENTS =====
    let knowledgeContext = "";
    let sources: { id: string; title: string; type: string }[] = [];

    const searchTerms = question.replace(/[^\w\sÀ-ỹ]/g, "").trim();
    
    const { data: searchDocs } = await supabase
      .from("knowledge_documents")
      .select("id, title, content, document_type, faq_answer")
      .textSearch("search_vector", searchTerms, { type: "plain" })
      .limit(5);

    let documents = searchDocs || [];
    if (documents.length === 0) {
      const { data: allDocs } = await supabase
        .from("knowledge_documents")
        .select("id, title, content, document_type, faq_answer")
        .order("created_at", { ascending: false })
        .limit(10);
      documents = allDocs || [];
    }

    for (const doc of documents) {
      let docContent = "";
      if (doc.document_type === "faq") {
        docContent = `[FAQ] ${doc.title}\nCâu trả lời: ${doc.faq_answer || doc.content || ""}`;
      } else {
        docContent = `[${doc.document_type.toUpperCase()}] ${doc.title}\n${doc.content || ""}`;
      }
      if (knowledgeContext.length + docContent.length > 15000) break;
      knowledgeContext += "\n---\n" + docContent;
      sources.push({ id: doc.id, title: doc.title, type: doc.document_type });
    }

    // ===== FETCH LIVE DATA (respects RLS) =====
    const lowerQ = question.toLowerCase();
    let liveDataContext = "";

    // Detect which data the question is about
    const wantsCustomers = /khách|kh|customer|chăm sóc|care|theo dõi|trạng thái|liên hệ|điện thoại|phone|email|mã kh|tag/i.test(lowerQ);
    const wantsProducts = /sản phẩm|product|giá|price|hàng|mặt hàng|danh mục|category|sku|tồn kho|stock/i.test(lowerQ);
    const wantsQuotes = /báo giá|quote|bảng giá|đơn giá|quotation|bg/i.test(lowerQ);
    const wantsTransactions = /giao dịch|transaction|thanh toán|payment|thu|chi|doanh thu|revenue|tài chính|finance/i.test(lowerQ);
    const wantsOrders = /đơn hàng|order|đơn|giao hàng|delivery|trạng thái đơn/i.test(lowerQ);
    
    // If question is general or unclear, include summary of all
    const isGeneral = !wantsCustomers && !wantsProducts && !wantsQuotes && !wantsTransactions && !wantsOrders;

    // --- CUSTOMERS ---
    if (wantsCustomers || isGeneral) {
      try {
        const { data: customers, count } = await supabase
          .from("customers")
          .select("name, phone, email, company, customer_code, current_status, auto_tags, notes, total_spent, purchase_count, last_care_date, last_purchase_date", { count: "exact" })
          .order("updated_at", { ascending: false })
          .limit(wantsCustomers ? 30 : 10);

        if (customers && customers.length > 0) {
          liveDataContext += `\n\n📋 DỮ LIỆU KHÁCH HÀNG (${count || customers.length} khách, hiển thị ${customers.length}):\n`;
          for (const c of customers) {
            const tags = [...(c.auto_tags || [])].join(", ");
            const status = c.current_status || "N/A";
            let line = `• ${c.customer_code || "?"} - ${c.name}`;
            if (c.phone) line += ` | SĐT: ${c.phone}`;
            if (c.company) line += ` | CTY: ${c.company}`;
            line += ` | Trạng thái: ${status}`;
            if (tags) line += ` | Tags: ${tags}`;
            if (c.total_spent) line += ` | Tổng chi: ${Number(c.total_spent).toLocaleString("vi-VN")}đ`;
            if (c.purchase_count) line += ` | Số lần mua: ${c.purchase_count}`;
            if (c.notes) {
              // Extract closing score and next action from notes
              const scoreMatch = c.notes.match(/Điểm đánh giá:\s*(\d+)/);
              const actionMatch = c.notes.match(/Hành động tiếp theo:\s*(.+?)(?:\n|$)/);
              if (scoreMatch) line += ` | Điểm: ${scoreMatch[1]}/10`;
              if (actionMatch) line += ` | HĐ tiếp: ${actionMatch[1].trim()}`;
            }
            liveDataContext += line + "\n";
          }
        }
      } catch (e) {
        console.error("Error fetching customers:", e);
      }
    }

    // --- PRODUCTS ---
    if (wantsProducts || isGeneral) {
      try {
        const { data: products, count } = await supabase
          .from("products")
          .select("name, sku, price, cost_price, category, description, specifications, in_stock", { count: "exact" })
          .order("updated_at", { ascending: false })
          .limit(wantsProducts ? 50 : 15);

        if (products && products.length > 0) {
          liveDataContext += `\n\n🛍️ DỮ LIỆU SẢN PHẨM (${count || products.length} SP, hiển thị ${products.length}):\n`;
          for (const p of products) {
            let line = `• ${p.sku || "?"} - ${p.name}`;
            if (p.price) line += ` | Giá: ${Number(p.price).toLocaleString("vi-VN")}đ`;
            if (p.cost_price) line += ` | Giá vốn: ${Number(p.cost_price).toLocaleString("vi-VN")}đ`;
            if (p.category) line += ` | DM: ${p.category}`;
            if (p.specifications) line += ` | QC: ${p.specifications}`;
            if (p.description) line += ` | Mô tả: ${p.description.substring(0, 100)}`;
            line += ` | ${p.in_stock ? "Còn hàng" : "Hết hàng"}`;
            liveDataContext += line + "\n";
          }
        }
      } catch (e) {
        console.error("Error fetching products:", e);
      }
    }

    // --- QUOTES ---
    if (wantsQuotes || isGeneral) {
      try {
        const { data: quotes, count } = await supabase
          .from("quotes")
          .select("quote_number, status, total_amount, items, created_at, notes, include_vat, vat_amount, subtotal", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(wantsQuotes ? 20 : 5);

        if (quotes && quotes.length > 0) {
          liveDataContext += `\n\n📄 DỮ LIỆU BÁO GIÁ (${count || quotes.length} BG, hiển thị ${quotes.length}):\n`;
          for (const q of quotes) {
            let line = `• ${q.quote_number} | Trạng thái: ${q.status} | Tổng: ${Number(q.total_amount || 0).toLocaleString("vi-VN")}đ`;
            if (q.include_vat) line += ` (VAT: ${Number(q.vat_amount || 0).toLocaleString("vi-VN")}đ)`;
            line += ` | Ngày: ${new Date(q.created_at).toLocaleDateString("vi-VN")}`;
            if (q.items && Array.isArray(q.items)) {
              const itemNames = q.items.slice(0, 3).map((it: any) => it.name || "?").join(", ");
              line += ` | SP: ${itemNames}`;
              if (q.items.length > 3) line += `... (+${q.items.length - 3})`;
            }
            liveDataContext += line + "\n";
          }
        }
      } catch (e) {
        console.error("Error fetching quotes:", e);
      }
    }

    // --- TRANSACTIONS ---
    if (wantsTransactions || isGeneral) {
      try {
        const { data: transactions, count } = await supabase
          .from("transactions")
          .select("type, amount, description, category, date, payment_type", { count: "exact" })
          .order("date", { ascending: false })
          .limit(wantsTransactions ? 30 : 10);

        if (transactions && transactions.length > 0) {
          liveDataContext += `\n\n💰 DỮ LIỆU GIAO DỊCH (${count || transactions.length} GD, hiển thị ${transactions.length}):\n`;
          let totalIncome = 0, totalExpense = 0;
          for (const t of transactions) {
            const amt = Number(t.amount || 0);
            if (t.type === "income") totalIncome += amt;
            else totalExpense += amt;
            let line = `• ${t.type === "income" ? "Thu" : "Chi"}: ${amt.toLocaleString("vi-VN")}đ`;
            if (t.description) line += ` | ${t.description}`;
            if (t.category) line += ` | DM: ${t.category}`;
            line += ` | Ngày: ${new Date(t.date).toLocaleDateString("vi-VN")}`;
            liveDataContext += line + "\n";
          }
          liveDataContext += `Tổng thu: ${totalIncome.toLocaleString("vi-VN")}đ | Tổng chi: ${totalExpense.toLocaleString("vi-VN")}đ\n`;
        }
      } catch (e) {
        console.error("Error fetching transactions:", e);
      }
    }

    // --- ORDERS ---
    if (wantsOrders || isGeneral) {
      try {
        const { data: orders, count } = await supabase
          .from("orders")
          .select("order_number, display_order_number, status, total_amount, payment_status, delivery_date, delivered_date, notes, created_at", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(wantsOrders ? 20 : 5);

        if (orders && orders.length > 0) {
          liveDataContext += `\n\n📦 DỮ LIỆU ĐƠN HÀNG (${count || orders.length} ĐH, hiển thị ${orders.length}):\n`;
          for (const o of orders) {
            let line = `• ${o.display_order_number || o.order_number} | TT: ${o.status} | Tổng: ${Number(o.total_amount || 0).toLocaleString("vi-VN")}đ`;
            line += ` | Thanh toán: ${o.payment_status || "N/A"}`;
            if (o.delivery_date) line += ` | Giao: ${new Date(o.delivery_date).toLocaleDateString("vi-VN")}`;
            line += ` | Ngày tạo: ${new Date(o.created_at).toLocaleDateString("vi-VN")}`;
            liveDataContext += line + "\n";
          }
        }
      } catch (e) {
        console.error("Error fetching orders:", e);
      }
    }

    // ===== BUILD SYSTEM PROMPT =====
    const systemPrompt = `Bạn là trợ lý AI hỗ trợ nhân viên bán hàng. Bạn có quyền truy cập vào kho kiến thức VÀ dữ liệu thực tế của hệ thống CRM.

HƯỚNG DẪN:
- Trả lời dựa trên dữ liệu thực tế từ hệ thống khi có
- Kết hợp với tài liệu kiến thức khi cần giải thích chính sách, quy trình
- Nếu không tìm thấy thông tin, nói rõ: "Tôi không tìm thấy thông tin này. Vui lòng liên hệ quản lý."
- Trả lời bằng tiếng Việt, ngắn gọn, chuyên nghiệp
- Có thể tổng hợp, phân tích, so sánh dữ liệu khi được hỏi
- Khi trả lời về số liệu, ghi rõ nguồn (ví dụ: "Theo dữ liệu hệ thống...")
- Format số tiền theo VNĐ, ngày theo dd/mm/yyyy

KHO KIẾN THỨC:
${knowledgeContext || "(Chưa có tài liệu)"}

DỮ LIỆU HỆ THỐNG:
${liveDataContext || "(Không có dữ liệu phù hợp)"}`;

    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (chatHistory && Array.isArray(chatHistory)) {
      for (const msg of chatHistory.slice(-6)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: question });

    console.log(`Context size: knowledge=${knowledgeContext.length}, liveData=${liveDataContext.length}, total system prompt=${systemPrompt.length}`);

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
        console.error("AI Gateway stream error:", response.status, errorText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Hệ thống đang bận, vui lòng thử lại sau ít phút." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Đã hết quota AI, vui lòng liên hệ quản trị viên." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI Gateway error: ${response.status}`);
      }

      const encoder = new TextEncoder();
      const sourcesEvent = `data: ${JSON.stringify({ sources })}\n\n`;
      
      const transformStream = new TransformStream({
        start(controller) {
          controller.enqueue(encoder.encode(sourcesEvent));
        },
        transform(chunk, controller) {
          controller.enqueue(chunk);
        },
      });

      response.body!.pipeTo(transformStream.writable);

      return new Response(transformStream.readable, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
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
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Hệ thống đang bận, vui lòng thử lại sau ít phút." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Đã hết quota AI, vui lòng liên hệ quản trị viên." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "Xin lỗi, tôi không thể trả lời câu hỏi này.";

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
