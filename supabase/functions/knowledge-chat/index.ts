import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

// Parse Vietnamese date patterns from question
function parseDateRange(question: string): { start: string; end: string } | null {
  const q = question.toLowerCase().trim();
  const currentYear = new Date().getFullYear();

  // Pattern: "từ dd/mm/yyyy đến dd/mm/yyyy" or "dd/mm/yyyy đến dd/mm/yyyy"
  const rangeMatch = q.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:đến|tới|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (rangeMatch) {
    const [, d1, m1, y1, d2, m2, y2] = rangeMatch;
    const year1 = y1 ? parseInt(y1) : (y2 ? parseInt(y2) : currentYear);
    const year2 = y2 ? parseInt(y2) : year1;
    const start = `${year1}-${m1.padStart(2, "0")}-${d1.padStart(2, "0")}`;
    const end = `${year2}-${m2.padStart(2, "0")}-${d2.padStart(2, "0")}`;
    return { start, end };
  }

  // Pattern: "tháng X/yyyy" or "tháng X năm yyyy" or "tháng X"
  const monthMatch = q.match(/tháng\s+(\d{1,2})(?:\s*[\/\-]\s*|\s+năm\s+)?(\d{4})?/);
  if (monthMatch) {
    const month = parseInt(monthMatch[1]);
    const year = monthMatch[2] ? parseInt(monthMatch[2]) : currentYear;
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
    return { start, end };
  }

  // Pattern: "ngày dd/mm" or "ngày dd/mm/yyyy"
  const dayMatch = q.match(/ngày\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (dayMatch) {
    const [, d, m, y] = dayMatch;
    const year = y ? parseInt(y) : currentYear;
    const date = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return { start: date, end: date };
  }

  return null;
}

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

    // Parse date range from question
    const dateRange = parseDateRange(question);

    // Detect intent
    const wantsCustomers = /khách|customer|chăm sóc|liên hệ|phone|email|mã kh/i.test(lowerQ);
    const wantsProducts = /sản phẩm|product|giá|hàng|mặt hàng|sku|tồn kho/i.test(lowerQ);
    const wantsQuotes = /báo giá|quote|bảng giá|đơn giá|bg/i.test(lowerQ);
    const wantsOrders = /đơn hàng|order|đơn|giao hàng|delivery/i.test(lowerQ);
    const wantsTransactions = /giao dịch|transaction|thanh toán|thu|chi|doanh thu|tài chính|revenue/i.test(lowerQ);
    const wantsRevenueSummary = /doanh thu|revenue|tổng thu|tổng chi|thu chi|báo cáo tài|tổng kết/i.test(lowerQ);

    // Parallel fetch - only what's needed
    const searchTerms = question.replace(/[^\w\sÀ-ỹ]/g, "").trim();
    const empty = Promise.resolve({ data: null, count: 0 });

    // Skip knowledge docs search for data-specific queries with dates
    const skipDocs = !!dateRange && (wantsTransactions || wantsOrders);

    const [docsResult, dataResult] = await Promise.all([
      // Knowledge docs
      skipDocs ? empty : supabase
        .from("knowledge_documents")
        .select("id, title, content, document_type, faq_answer")
        .textSearch("search_vector", searchTerms, { type: "plain" })
        .limit(3),

      // Fetch the PRIMARY data type needed with date filtering
      wantsTransactions || wantsRevenueSummary
        ? (() => {
            let q = supabase.from("transactions").select("type, amount, description, date", { count: "exact" });
            if (dateRange) {
              q = q.gte("date", dateRange.start).lte("date", dateRange.end + "T23:59:59");
            } else {
              q = q.order("date", { ascending: false }).limit(10);
            }
            return q;
          })()
        : wantsOrders
        ? (() => {
            let q = supabase.from("orders").select("order_number, display_order_number, status, total_amount, payment_status, created_at", { count: "exact" });
            if (dateRange) {
              q = q.gte("created_at", dateRange.start).lte("created_at", dateRange.end + "T23:59:59");
            } else {
              q = q.order("created_at", { ascending: false }).limit(8);
            }
            return q;
          })()
        : wantsCustomers
        ? supabase.from("customers").select("name, phone, company, customer_code, current_status, total_spent", { count: "exact" }).order("updated_at", { ascending: false }).limit(10)
        : wantsProducts
        ? supabase.from("products").select("name, sku, price, category, in_stock", { count: "exact" }).order("updated_at", { ascending: false }).limit(10)
        : wantsQuotes
        ? (() => {
            let q = supabase.from("quotes").select("quote_number, status, total_amount, created_at", { count: "exact" });
            if (dateRange) {
              q = q.gte("created_at", dateRange.start).lte("created_at", dateRange.end + "T23:59:59");
            } else {
              q = q.order("created_at", { ascending: false }).limit(8);
            }
            return q;
          })()
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

    // Build live data context with aggregation
    let dataCtx = "";
    const rows = dataResult.data as any[];
    const dateLabel = dateRange ? ` (${dateRange.start} → ${dateRange.end})` : "";

    if (rows?.length) {
      const total = (dataResult as any).count || rows.length;

      if ((wantsTransactions || wantsRevenueSummary) && rows.length > 0) {
        // Aggregate transactions server-side
        let totalIncome = 0;
        let totalExpense = 0;
        let incomeCount = 0;
        let expenseCount = 0;
        for (const t of rows) {
          if (t.type === "income") {
            totalIncome += Number(t.amount || 0);
            incomeCount++;
          } else {
            totalExpense += Number(t.amount || 0);
            expenseCount++;
          }
        }
        const net = totalIncome - totalExpense;
        const fmt = (n: number) => n.toLocaleString("vi-VN");

        dataCtx = `\nTỔNG HỢP GIAO DỊCH${dateLabel} (${total} giao dịch):`;
        dataCtx += `\n- Tổng thu: ${fmt(totalIncome)}đ (${incomeCount} giao dịch)`;
        dataCtx += `\n- Tổng chi: ${fmt(totalExpense)}đ (${expenseCount} giao dịch)`;
        dataCtx += `\n- Chênh lệch (thu - chi): ${fmt(net)}đ`;

        // Also show top 5 recent items for detail
        if (rows.length > 0) {
          const topRows = rows.slice(0, 5);
          dataCtx += "\nChi tiết gần nhất:";
          for (const t of topRows) {
            dataCtx += `\n  ${t.type === "income" ? "Thu" : "Chi"} ${fmt(Number(t.amount || 0))}đ ${t.description || ""}`;
          }
        }
      } else if (wantsCustomers) {
        dataCtx = `\nKHÁCH HÀNG (${total}):\n` + rows.map((c: any) =>
          `${c.customer_code || "?"} ${c.name} ${c.phone || ""} ${c.current_status || ""} ${c.total_spent ? Number(c.total_spent).toLocaleString("vi-VN") + "đ" : ""}`
        ).join("\n");
      } else if (wantsProducts) {
        dataCtx = `\nSẢN PHẨM (${total}):\n` + rows.map((p: any) =>
          `${p.sku || "?"} ${p.name} ${p.price ? Number(p.price).toLocaleString("vi-VN") + "đ" : ""} ${p.category || ""} ${p.in_stock ? "✓" : "✗"}`
        ).join("\n");
      } else if (wantsOrders) {
        // Aggregate orders if date range
        if (dateRange) {
          let totalAmount = 0;
          const statusCount: Record<string, number> = {};
          for (const o of rows) {
            totalAmount += Number(o.total_amount || 0);
            const s = o.status || "unknown";
            statusCount[s] = (statusCount[s] || 0) + 1;
          }
          dataCtx = `\nTỔNG HỢP ĐƠN HÀNG${dateLabel} (${total} đơn):`;
          dataCtx += `\n- Tổng giá trị: ${totalAmount.toLocaleString("vi-VN")}đ`;
          for (const [status, count] of Object.entries(statusCount)) {
            dataCtx += `\n- ${status}: ${count} đơn`;
          }
          // Show top 5
          const topOrders = rows.slice(0, 5);
          dataCtx += "\nChi tiết:";
          for (const o of topOrders) {
            dataCtx += `\n  ${o.display_order_number || o.order_number} ${o.status} ${Number(o.total_amount || 0).toLocaleString("vi-VN")}đ TT:${o.payment_status || "?"}`;
          }
        } else {
          dataCtx = `\nĐƠN HÀNG (${total}):\n` + rows.map((o: any) =>
            `${o.display_order_number || o.order_number} ${o.status} ${Number(o.total_amount || 0).toLocaleString("vi-VN")}đ TT:${o.payment_status || "?"}`
          ).join("\n");
        }
      } else if (wantsQuotes) {
        dataCtx = `\nBÁO GIÁ (${total}):\n` + rows.map((q: any) =>
          `${q.quote_number} ${q.status} ${Number(q.total_amount || 0).toLocaleString("vi-VN")}đ`
        ).join("\n");
      }
    } else if (dateRange && (wantsTransactions || wantsOrders)) {
      dataCtx = `\nKhông có dữ liệu trong khoảng${dateLabel}.`;
    }

    const profitNote = isManagerOrAdmin ? "" : " Không tiết lộ giá vốn/lợi nhuận.";
    const systemPrompt = `Trợ lý AI CRM (${isManagerOrAdmin ? "Quản lý" : "NV"}).${profitNote} Trả lời tiếng Việt, ngắn gọn, chính xác. Dữ liệu đã được tổng hợp sẵn - trả lời dựa trên dữ liệu được cung cấp, không đoán.${knowledgeCtx ? "\n\nTài liệu:" + knowledgeCtx : ""}${dataCtx ? "\n\n" + dataCtx : ""}`;

    console.log(`ctx: kb=${knowledgeCtx.length} data=${dataCtx.length} total=${systemPrompt.length} dateRange=${JSON.stringify(dateRange)}`);

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
