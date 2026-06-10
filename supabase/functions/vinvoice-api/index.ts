import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_URL = Deno.env.get("VINVOICE_API_URL") || "https://api-vinvoice.viettel.vn";
const USERNAME = Deno.env.get("VINVOICE_USERNAME") || "";
const PASSWORD = Deno.env.get("VINVOICE_PASSWORD") || "";
const TAX_CODE = Deno.env.get("VINVOICE_TAX_CODE") || "";

// In-memory token cache (~50min)
let tokenCache: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now()) return tokenCache.token;
  if (!USERNAME || !PASSWORD) throw new Error("Thiếu VINVOICE_USERNAME / VINVOICE_PASSWORD");
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const text = await res.text();
  let body: any; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok || !body?.access_token) {
    throw new Error(body?.message || body?.error || `Login failed (${res.status}): ${text}`);
  }
  tokenCache = { token: body.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return body.access_token;
}

const authHeader = (token: string) => ({
  "Content-Type": "application/json",
  "Cookie": `access_token=${token}`,
  "Authorization": `Bearer ${token}`,
});

async function callViettel(path: string, method: "GET" | "POST", body?: any) {
  const token = await getToken();
  const url = `${API_URL}${path}`;
  console.log(`[viettel] ${method} ${path}`, body ? JSON.stringify(body).slice(0, 300) : "");
  const res = await fetch(url, {
    method,
    headers: authHeader(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  console.log(`[viettel] ← ${res.status}`, text.slice(0, 300));
  return { status: res.status, ok: res.ok, data, raw: text };
}

function mapContractToInvoice(contract: any, options: any) {
  const sellerInfo = contract.seller_info || {};
  const buyerInfo = contract.buyer_info || {};
  const items = (contract.items || []) as any[];
  const vatRate = contract.vat_rate || 0;

  const itemInfo = items.map((item: any, idx: number) => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unit_price || item.price) || 0;
    const amount = qty * price;
    const vatAmount = amount * (vatRate / 100);
    return {
      lineNumber: idx + 1,
      itemCode: item.sku || item.code || `SP${idx + 1}`,
      itemName: item.name || item.product_name || `Sản phẩm ${idx + 1}`,
      unitName: item.unit || "Cái",
      unitPrice: price,
      quantity: qty,
      itemTotalAmountWithoutTax: amount,
      taxPercentage: vatRate,
      taxAmount: vatAmount,
      discount: 0, itemDiscount: 0,
    };
  });

  const subtotal = Number(contract.subtotal) || itemInfo.reduce((s, i) => s + i.itemTotalAmountWithoutTax, 0);
  const vatAmount = Number(contract.vat_amount) || subtotal * (vatRate / 100);
  const totalWithVat = subtotal + vatAmount;

  return {
    generalInvoiceInfo: {
      invoiceType: options.invoiceType || "01GTKT",
      templateCode: options.templateCode || "",
      invoiceSeries: options.invoiceSeries || "",
      currencyCode: options.currency || "VND",
      adjustmentType: options.adjustmentType || "1",
      paymentStatus: true,
      cusGetInvoiceRight: options.cusGetInvoiceRight !== false,
      invoiceNote: contract.title || options.note || "",
      paymentMethodName: options.paymentMethod || "TM/CK",
      originalInvoiceId: options.originalInvoiceId,
      additionalReferenceDesc: options.additionalReferenceDesc,
      originalInvoiceIssueDate: options.originalInvoiceIssueDate,
    },
    sellerInfo: {
      sellerLegalName: sellerInfo.company_name || sellerInfo.name || "",
      sellerTaxCode: TAX_CODE,
      sellerAddressLine: sellerInfo.address || "",
      sellerPhoneNumber: sellerInfo.phone || "",
      sellerEmail: sellerInfo.email || "",
      sellerBankName: sellerInfo.bank_name || "",
      sellerBankAccount: sellerInfo.bank_account || "",
    },
    buyerInfo: {
      buyerLegalName: buyerInfo.company_name || buyerInfo.name || "",
      buyerTaxCode: buyerInfo.tax_code || "",
      buyerAddressLine: buyerInfo.address || "",
      buyerPhoneNumber: buyerInfo.phone || "",
      buyerEmail: buyerInfo.email || "",
      buyerName: buyerInfo.representative || buyerInfo.name || "",
    },
    payments: [{ paymentMethodName: options.paymentMethod || "TM/CK" }],
    itemInfo,
    summarizeInfo: {
      sumOfTotalLineAmountWithoutTax: subtotal,
      totalAmountWithoutTax: subtotal,
      totalTaxAmount: vatAmount,
      totalAmountWithTax: totalWithVat,
      totalAmountWithTaxInWords: "",
      discountAmount: 0,
      taxPercentage: vatRate,
    },
    taxBreakdowns: vatRate > 0
      ? [{ taxPercentage: vatRate, taxableAmount: subtotal, taxAmount: vatAmount }]
      : [],
  };
}

async function logAction(supabase: any, params: {
  einvoice_id?: string | null;
  action: string;
  request?: any;
  response?: any;
  status?: string;
  error_message?: string;
  user_id?: string;
  manager_id?: string | null;
}) {
  try {
    await supabase.from("einvoice_actions").insert({
      einvoice_id: params.einvoice_id || null,
      action: params.action,
      request: params.request || null,
      response: params.response || null,
      status: params.status || null,
      error_message: params.error_message || null,
      created_by: params.user_id || null,
      manager_id: params.manager_id || null,
    });
  } catch (e) { console.error("logAction failed:", e); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ success: false, error: "Missing Authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ success: false, error: "Unauthorized" }, 401);

    // Resolve manager_id from user_roles
    const { data: roleRow } = await supabase.from("user_roles").select("role, assigned_by").eq("user_id", user.id).maybeSingle();
    const role = roleRow?.role;
    const managerId = role === "manager" ? user.id : (roleRow?.assigned_by || user.id);

    const { action, ...params } = await req.json();

    // ---------- CONFIG STATUS ----------
    if (action === "config_status") {
      return json({
        success: true,
        status: {
          VINVOICE_API_URL: !!API_URL,
          VINVOICE_USERNAME: !!USERNAME,
          VINVOICE_PASSWORD: !!PASSWORD,
          VINVOICE_TAX_CODE: !!TAX_CODE,
        },
      });
    }

    // ---------- LOGIN TEST ----------
    if (action === "login") {
      try {
        tokenCache = null;
        const token = await getToken();
        return json({
          success: true,
          token_preview: token.slice(0, 12) + "..." + token.slice(-6),
          token_length: token.length,
          tax_code: TAX_CODE,
        });
      } catch (e: any) {
        return json({ success: false, error: e.message });
      }
    }

    // ---------- GET TEMPLATES ----------
    if (action === "get_templates") {
      // Use the correct endpoint: getAllInvoiceTemplates/{MST}
      const r = await callViettel(
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getAllInvoiceTemplates/${TAX_CODE}`,
        "GET"
      );
      return json({ success: r.ok, data: r.data, status: r.status });
    }

    // ---------- SYNC INVOICES ----------
    if (action === "sync_invoices") {
      const { fromDate, toDate, invoiceType } = params;
      // Viettel expects ddMMyyyy or millis depending on endpoint.
      // Use InvoiceUtilsWS/getInvoices/{MST} with POST body
      const reqBody: any = {
        invoiceType: invoiceType || "01GTKT",
        fromDate: fromDate, // expect ms epoch
        toDate: toDate,
        invoiceStatus: null,
        size: 1000,
        offset: 0,
      };
      const r = await callViettel(
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoices/${TAX_CODE}`,
        "POST",
        reqBody
      );
      await logAction(supabase, { action, request: reqBody, response: r.data, status: String(r.status), user_id: user.id, manager_id: managerId });

      if (!r.ok) return json({ success: false, error: r.data?.message || r.raw, raw: r.data });

      const list: any[] = r.data?.invoices || r.data?.data || r.data?.lstInvoice || [];
      let upserted = 0;
      for (const inv of list) {
        const txUuid = inv.transactionUuid || inv.transactionID || inv.invoiceGuid;
        if (!txUuid) continue;
        const record: any = {
          transaction_uuid: txUuid,
          invoice_number: inv.invoiceNo || inv.invoiceNumber || null,
          invoice_type: inv.invoiceType || invoiceType || "01GTKT",
          template_code: inv.templateCode || "",
          invoice_series: inv.invoiceSeries || "",
          status: inv.invoiceStatus == 5 || inv.invoiceStatus === "cancelled" ? "cancelled" : "issued",
          issued_date: inv.issueDate ? new Date(Number(inv.issueDate)).toISOString() : null,
          total_amount: Number(inv.totalAmountWithoutTax || inv.totalAmount || 0),
          vat_amount: Number(inv.totalTaxAmount || 0),
          total_with_vat: Number(inv.totalAmountWithTax || inv.totalAmount || 0),
          buyer_name: inv.buyerLegalName || inv.buyerName || "",
          buyer_tax_code: inv.buyerTaxCode || "",
          response_data: inv,
          last_synced_at: new Date().toISOString(),
          manager_id: managerId ? String(managerId) : null,
        };
        const { error: upErr } = await supabase.from("einvoices").upsert(record, { onConflict: "transaction_uuid" });
        if (!upErr) upserted++;
        else console.error("upsert err:", upErr);
      }
      return json({ success: true, synced: upserted, total: list.length });
    }

    // ---------- DOWNLOAD FILE (PDF/XML) ----------
    if (action === "download_file") {
      const { transactionUuid, fileType, einvoice_id } = params;
      if (!transactionUuid) return json({ success: false, error: "Thiếu transactionUuid" });
      const r = await callViettel(
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile`,
        "POST",
        { supplierTaxCode: TAX_CODE, transactionUuid, fileType: fileType || "PDF" }
      );
      await logAction(supabase, { einvoice_id, action, request: { transactionUuid, fileType }, response: { status: r.status }, status: String(r.status), user_id: user.id, manager_id: managerId });
      if (!r.ok) return json({ success: false, error: r.data?.message || r.raw });
      return json({
        success: true,
        fileType: fileType || "PDF",
        // Viettel returns { fileToBytes: base64, fileName }
        base64: r.data?.fileToBytes || r.data?.fileContent || null,
        fileName: r.data?.fileName || `invoice.${(fileType || "PDF").toLowerCase()}`,
      });
    }

    // ---------- CANCEL INVOICE ----------
    if (action === "cancel_invoice") {
      const { transactionUuid, reason, einvoice_id } = params;
      if (!transactionUuid || !reason) return json({ success: false, error: "Thiếu transactionUuid hoặc lý do" });
      const r = await callViettel(
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/cancelTransactionInvoice/${TAX_CODE}`,
        "POST",
        { supplierTaxCode: TAX_CODE, transactionUuid, additionalReferenceDesc: reason, additionalReferenceDate: Date.now() }
      );
      await logAction(supabase, { einvoice_id, action, request: params, response: r.data, status: String(r.status), user_id: user.id, manager_id: managerId });
      if (!r.ok) return json({ success: false, error: r.data?.message || r.raw });
      if (einvoice_id) {
        await supabase.from("einvoices").update({
          status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason,
        }).eq("id", einvoice_id);
      }
      return json({ success: true, data: r.data });
    }

    // ---------- REPLACE / ADJUST INVOICE ----------
    if (action === "replace_invoice" || action === "adjust_invoice") {
      const { contract, options, original_einvoice_id } = params;
      if (!contract || !original_einvoice_id) return json({ success: false, error: "Thiếu dữ liệu HĐ gốc" });

      const { data: original } = await supabase.from("einvoices").select("*").eq("id", original_einvoice_id).single();
      if (!original) return json({ success: false, error: "Không tìm thấy HĐ gốc" });

      const adjustmentType = action === "replace_invoice" ? "5" : "3";
      const payload = mapContractToInvoice(contract, {
        ...options,
        adjustmentType,
        originalInvoiceId: original.invoice_number,
        additionalReferenceDesc: options?.reason || "Thay thế/điều chỉnh",
        originalInvoiceIssueDate: original.issued_date ? new Date(original.issued_date).getTime() : Date.now(),
      });
      const r = await callViettel(
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${TAX_CODE}`,
        "POST",
        payload
      );
      await logAction(supabase, { einvoice_id: original_einvoice_id, action, request: payload, response: r.data, status: String(r.status), user_id: user.id, manager_id: managerId });
      if (!r.ok) return json({ success: false, error: r.data?.message || r.raw });

      const txUuid = r.data?.result?.transactionUuid || r.data?.transactionUuid;
      const newRecord: any = {
        transaction_uuid: txUuid,
        invoice_number: r.data?.result?.invoiceNo || null,
        invoice_type: options?.invoiceType || "01GTKT",
        template_code: options?.templateCode || "",
        invoice_series: options?.invoiceSeries || "",
        status: "issued",
        issued_date: new Date().toISOString(),
        total_amount: Number(contract.subtotal) || 0,
        vat_amount: Number(contract.vat_amount) || 0,
        total_with_vat: Number(contract.total_amount) || 0,
        buyer_name: contract.buyer_info?.company_name || contract.buyer_info?.name || "",
        buyer_tax_code: contract.buyer_info?.tax_code || "",
        response_data: r.data,
        request_data: payload,
        original_invoice_id: original_einvoice_id,
        invoice_action: action === "replace_invoice" ? "replacement" : "adjustment",
        manager_id: managerId ? String(managerId) : null,
        contract_id: contract.id || null,
      };
      const { data: saved } = await supabase.from("einvoices").insert(newRecord).select().single();

      // Mark original
      await supabase.from("einvoices").update({
        invoice_action: action === "replace_invoice" ? "replaced_by_new" : "adjusted_by_new",
      }).eq("id", original_einvoice_id);

      return json({ success: true, invoice: saved, apiResponse: r.data });
    }

    // ---------- SEND EMAIL ----------
    if (action === "send_email") {
      const { transactionUuid, email, einvoice_id } = params;
      if (!transactionUuid || !email) return json({ success: false, error: "Thiếu transactionUuid hoặc email" });
      const r = await callViettel(
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/sendHtmlMailProcess`,
        "POST",
        { supplierTaxCode: TAX_CODE, lstTransactionUuid: [transactionUuid], paramEmail: email }
      );
      await logAction(supabase, { einvoice_id, action, request: params, response: r.data, status: String(r.status), user_id: user.id, manager_id: managerId });
      if (!r.ok) return json({ success: false, error: r.data?.message || r.raw });
      if (einvoice_id) {
        await supabase.from("einvoices").update({
          email_sent_at: new Date().toISOString(), email_sent_to: email,
        }).eq("id", einvoice_id);
      }
      return json({ success: true, data: r.data });
    }

    // ---------- UPDATE PAYMENT STATUS ----------
    if (action === "update_payment") {
      const { transactionUuid, paid, einvoice_id } = params;
      if (!transactionUuid) return json({ success: false, error: "Thiếu transactionUuid" });
      const r = await callViettel(
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/updatePaymentStatus`,
        "POST",
        { supplierTaxCode: TAX_CODE, transactionUuid, paymentStatus: !!paid }
      );
      await logAction(supabase, { einvoice_id, action, request: params, response: r.data, status: String(r.status), user_id: user.id, manager_id: managerId });
      if (!r.ok) return json({ success: false, error: r.data?.message || r.raw });
      if (einvoice_id) {
        await supabase.from("einvoices").update({ payment_status_synced: true }).eq("id", einvoice_id);
      }
      return json({ success: true });
    }

    // ---------- SEARCH BY UUID ----------
    if (action === "search_by_uuid") {
      const { transactionUuid } = params;
      const r = await callViettel(
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid`,
        "POST",
        { supplierTaxCode: TAX_CODE, transactionUuid }
      );
      return json({ success: r.ok, data: r.data });
    }

    // ---------- CREATE INVOICE (existing) ----------
    if (action === "create_invoice") {
      const { contract, options } = params;
      if (!contract) return json({ success: false, error: "Missing contract data" });
      const payload = mapContractToInvoice(contract, options || {});
      const r = await callViettel(
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${TAX_CODE}`,
        "POST", payload
      );
      const record: any = {
        contract_id: contract.id,
        transaction_uuid: r.data?.result?.transactionUuid || r.data?.transactionUuid || null,
        invoice_number: r.data?.result?.invoiceNo || r.data?.invoiceNo || null,
        invoice_type: options?.invoiceType || "01GTKT",
        template_code: options?.templateCode || "",
        invoice_series: options?.invoiceSeries || "",
        status: r.ok ? "issued" : "error",
        issued_date: new Date().toISOString(),
        total_amount: Number(contract.subtotal) || 0,
        vat_amount: Number(contract.vat_amount) || 0,
        total_with_vat: Number(contract.total_amount) || 0,
        buyer_name: contract.buyer_info?.company_name || contract.buyer_info?.name || "",
        buyer_tax_code: contract.buyer_info?.tax_code || "",
        response_data: r.data,
        request_data: payload,
        manager_id: managerId ? String(managerId) : null,
      };
      const { data: saved } = await supabase.from("einvoices").insert(record).select().single();
      await logAction(supabase, { einvoice_id: saved?.id, action, request: payload, response: r.data, status: String(r.status), user_id: user.id, manager_id: managerId });
      return json({ success: r.ok, invoice: saved, apiResponse: r.data });
    }

    // ---------- CREATE DRAFT (local only) ----------
    if (action === "create_draft") {
      const { contract, options } = params;
      if (!contract) return json({ success: false, error: "Missing contract data" });
      const payload = mapContractToInvoice(contract, options || {});
      const { data: saved, error } = await supabase.from("einvoices").insert({
        contract_id: contract.id || null,
        invoice_type: options?.invoiceType || "01GTKT",
        template_code: options?.templateCode || "",
        invoice_series: options?.invoiceSeries || "",
        status: "draft",
        total_amount: Number(contract.subtotal) || 0,
        vat_amount: Number(contract.vat_amount) || 0,
        total_with_vat: Number(contract.total_amount) || 0,
        buyer_name: contract.buyer_info?.company_name || contract.buyer_info?.name || "",
        buyer_tax_code: contract.buyer_info?.tax_code || "",
        request_data: payload,
        manager_id: managerId ? String(managerId) : null,
      }).select().single();
      if (error) return json({ success: false, error: error.message });
      return json({ success: true, draft: saved });
    }

    if (action === "get_invoices") {
      const { contract_id } = params;
      let q = supabase.from("einvoices").select("*").order("created_at", { ascending: false });
      if (contract_id) q = q.eq("contract_id", contract_id);
      const { data, error } = await q;
      if (error) return json({ success: false, error: error.message });
      return json({ success: true, data });
    }

    return json({ success: false, error: `Unknown action: ${action}` });
  } catch (err: any) {
    console.error("vinvoice-api error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});