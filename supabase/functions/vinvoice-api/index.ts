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

// Per-manager in-memory token cache (~50min)
type CachedToken = { token: string; exp: number; apiUrl: string };
const tokenCache = new Map<string, CachedToken>();

type Creds = { apiUrl: string; username: string; password: string; taxCode: string; source: "db" | "env" };

async function loadCreds(supabaseService: any, managerId: string | null): Promise<Creds> {
  if (managerId) {
    const { data } = await supabaseService
      .from("einvoice_settings")
      .select("api_url, username, password, tax_code")
      .eq("manager_id", managerId)
      .maybeSingle();
    if (data && data.username && data.password) {
      return {
        apiUrl: data.api_url || API_URL,
        username: data.username,
        password: data.password,
        taxCode: data.tax_code || TAX_CODE,
        source: "db",
      };
    }
  }
  return { apiUrl: API_URL, username: USERNAME, password: PASSWORD, taxCode: TAX_CODE, source: "env" };
}

async function getToken(creds: Creds, cacheKey: string): Promise<string> {
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.exp > Date.now() && cached.apiUrl === creds.apiUrl) return cached.token;
  if (!creds.username || !creds.password) throw new Error("Chưa cấu hình tài khoản Viettel S-Invoice. Vào tab 'Cấu hình & Kết nối' để thiết lập.");
  const res = await fetch(`${creds.apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: creds.username, password: creds.password }),
  });
  const text = await res.text();
  let body: any; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok || !body?.access_token) {
    throw new Error(body?.message || body?.error || `Login failed (${res.status}): ${text}`);
  }
  tokenCache.set(cacheKey, { token: body.access_token, exp: Date.now() + 50 * 60 * 1000, apiUrl: creds.apiUrl });
  return body.access_token;
}

const authHeader = (token: string) => ({
  "Content-Type": "application/json",
  "Cookie": `access_token=${token}`,
  "Authorization": `Bearer ${token}`,
});

function dateInputToMs(value: any): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+07:00`).getTime();
  if (typeof value === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [dd, mm, yyyy] = value.split("/");
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00+07:00`).getTime();
  }
  return new Date(String(value)).getTime();
}

function toViettelSearchDate(value: any): string {
  const ms = dateInputToMs(value);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + 7 * 60 * 60 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.000+07:00`;
}

function toViettelShortDate(value: any): string {
  if (typeof value === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  const ms = dateInputToMs(value);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + 7 * 60 * 60 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function callViettel(creds: Creds, cacheKey: string, path: string, method: "GET" | "POST", body?: any) {
  const token = await getToken(creds, cacheKey);
  const url = `${creds.apiUrl}${path}`;
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

function mapContractToInvoice(contract: any, options: any, taxCode: string) {
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
      sellerTaxCode: taxCode,
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
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ success: false, error: "Unauthorized" }, 401);

    // Resolve manager_id from user_roles
    const { data: roleRow } = await supabase.from("user_roles").select("role, assigned_by").eq("user_id", user.id).maybeSingle();
    const role = roleRow?.role;
    const managerId: string | null = role === "manager" ? user.id : (roleRow?.assigned_by || user.id);
    const isManagerOrAdmin = role === "admin" || role === "manager";

    const { action, ...params } = await req.json();

    // Lazy-load creds only when action needs them
    let creds: Creds | null = null;
    const cacheKey = String(managerId || "global");
    const ensureCreds = async () => {
      if (!creds) creds = await loadCreds(supabaseService, managerId);
      return creds;
    };

    // ---------- GET SETTINGS (no password) ----------
    if (action === "get_settings") {
      const { data, error } = await supabase
        .from("einvoice_settings_public")
        .select("*")
        .eq("manager_id", String(managerId))
        .maybeSingle();
      if (error) return json({ success: false, error: error.message });
      // Also surface env fallback flag
      return json({
        success: true,
        settings: data,
        env_fallback: {
          available: !!(USERNAME && PASSWORD && TAX_CODE),
          tax_code: TAX_CODE || null,
          username: USERNAME || null,
          api_url: API_URL,
        },
      });
    }

    // ---------- SAVE SETTINGS ----------
    if (action === "save_settings") {
      if (!isManagerOrAdmin) return json({ success: false, error: "Chỉ admin/manager được sửa cấu hình" }, 403);
      const { tax_code, username, password, api_url, default_invoice_type, default_template_code, default_serial } = params;
      if (!tax_code || !username) return json({ success: false, error: "Thiếu MST hoặc username" });

      // Fetch existing to keep password if not provided
      const { data: existing } = await supabaseService
        .from("einvoice_settings")
        .select("password")
        .eq("manager_id", String(managerId))
        .maybeSingle();

      const payload: any = {
        manager_id: String(managerId),
        tax_code: String(tax_code).trim(),
        username: String(username).trim(),
        api_url: (api_url || "https://api-vinvoice.viettel.vn").trim().replace(/\/+$/, ""),
        default_invoice_type: default_invoice_type || "01GTKT",
        default_template_code: default_template_code || null,
        default_serial: default_serial || null,
      };
      if (password && String(password).length > 0) {
        payload.password = String(password);
      } else if (existing?.password) {
        payload.password = existing.password;
      }

      const { error: upErr } = await supabaseService
        .from("einvoice_settings")
        .upsert(payload, { onConflict: "manager_id" });
      if (upErr) return json({ success: false, error: upErr.message });

      // Invalidate token cache for this manager
      tokenCache.delete(cacheKey);
      await logAction(supabase, { action, request: { ...payload, password: payload.password ? "***" : undefined }, status: "ok", user_id: user.id, manager_id: managerId });
      return json({ success: true });
    }

    // ---------- TEST LOGIN (force fresh login + persist status) ----------
    if (action === "test_login") {
      tokenCache.delete(cacheKey);
      try {
        const c = await ensureCreds();
        const token = await getToken(c, cacheKey);
        const now = new Date().toISOString();
        if (c.source === "db" && managerId) {
          await supabaseService.from("einvoice_settings").update({
            last_login_at: now, last_login_status: "success", last_login_error: null,
          }).eq("manager_id", String(managerId));
        }
        return json({
          success: true,
          source: c.source,
          tax_code: c.taxCode,
          username: c.username,
          api_url: c.apiUrl,
          token_preview: token.slice(0, 12) + "..." + token.slice(-6),
          last_login_at: now,
        });
      } catch (e: any) {
        if (managerId) {
          await supabaseService.from("einvoice_settings").update({
            last_login_at: new Date().toISOString(), last_login_status: "error", last_login_error: e.message,
          }).eq("manager_id", String(managerId));
        }
        return json({ success: false, error: e.message });
      }
    }

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
        tokenCache.delete(cacheKey);
        const c = await ensureCreds();
        const token = await getToken(c, cacheKey);
        return json({
          success: true,
          token_preview: token.slice(0, 12) + "..." + token.slice(-6),
          token_length: token.length,
          tax_code: c.taxCode,
        });
      } catch (e: any) {
        return json({ success: false, error: e.message });
      }
    }

    // ---------- GET TEMPLATES ----------
    if (action === "get_templates") {
      // Use the correct endpoint: getAllInvoiceTemplates/{MST}
      const r = await callViettel(await ensureCreds(), cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getAllInvoiceTemplates/${creds!.taxCode}`,
        "GET"
      );
      return json({ success: r.ok, data: r.data, status: r.status });
    }

    // ---------- SYNC INVOICES ----------
    if (action === "sync_invoices") {
      const { fromDate, toDate, invoiceType } = params;
      // Viettel getInvoices requires startDate/endDate (not fromDate/toDate).
      const fromStr = toViettelShortDate(fromDate);
      const toStr = toViettelShortDate(toDate);
      const startDate = toViettelSearchDate(fromDate);
      const endDate = toViettelSearchDate(toDate);

      if (!startDate || !endDate) {
        return json({ success: false, error: "Thiếu hoặc sai định dạng ngày bắt đầu/kết thúc" });
      }

      const c = await ensureCreds();
      const buildBody = (variant: "getInvoices" | "dataControl") => variant === "getInvoices"
        ? {
            invoiceType: invoiceType || "01GTKT",
            startDate,
            endDate,
            invoiceStatus: null,
            rowPerPage: 1000,
            pageNum: 1,
          }
        : {
            supplierTaxCode: c.taxCode,
            fromDate: fromStr,
            toDate: toStr,
          };

      const endpoint = `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoices/${c.taxCode}`;

      let reqBody: any = buildBody("getInvoices");
      let r = await callViettel(c, cacheKey, endpoint, "POST", reqBody);
      console.log("[sync_invoices] primary status=", r.status, "body=", JSON.stringify(reqBody));

      // Fallback endpoint used by Viettel for date-range invoice data.
      if (!r.ok && (r.data?.message === "START_DATE_REQUIRED" || r.data?.message === "END_DATE_REQUIRED")) {
        reqBody = buildBody("dataControl");
        r = await callViettel(c, cacheKey, `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getListInvoiceDataControl`, "POST", reqBody);
        console.log("[sync_invoices] fallback status=", r.status, "body=", JSON.stringify(reqBody));
      }

      await logAction(supabase, { action, request: reqBody, response: r.data, status: String(r.status), user_id: user.id, manager_id: managerId });

      if (!r.ok) {
        const msg = r.data?.data || r.data?.message || r.raw || "Viettel API lỗi không xác định";
        return json({ success: false, error: msg, raw: r.data });
      }

      // Viettel returns invoices under different keys depending on version
      const list: any[] = Array.isArray(r.data?.invoices) ? r.data.invoices
        : Array.isArray(r.data?.lstInvoice) ? r.data.lstInvoice
        : Array.isArray(r.data?.data?.invoices) ? r.data.data.invoices
        : Array.isArray(r.data?.data?.lstInvoice) ? r.data.data.lstInvoice
        : Array.isArray(r.data?.data) ? r.data.data
        : Array.isArray(r.data?.result?.invoices) ? r.data.result.invoices
        : [];
      console.log("[sync_invoices] received", list.length, "invoices");
      let upserted = 0;
      for (const inv of list) {
        const txUuid = inv.transactionUuid || inv.transactionID || inv.invoiceGuid;
        if (!txUuid) continue;
        const invStatus = inv.invoiceStatus;
        // Viettel invoiceStatus: 1=phát hành, 3=nháp, 5=huỷ, 6=đã thay thế, 7=đã điều chỉnh
        const isDraft = invStatus == 3 || invStatus === "draft";
        const mappedStatus = isDraft ? "draft"
          : (invStatus == 5 || invStatus === "cancelled") ? "cancelled"
          : "issued";
        const record: any = {
          transaction_uuid: txUuid,
          invoice_number: inv.invoiceNo || inv.invoiceNumber || null,
          invoice_type: inv.invoiceType || invoiceType || "01GTKT",
          template_code: inv.templateCode || "",
          invoice_series: inv.invoiceSeries || "",
          status: mappedStatus,
          is_draft: isDraft,
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

    // ---------- SYNC DRAFTS (invoiceStatus=3 from Viettel) ----------
    if (action === "sync_drafts") {
      const { fromDate, toDate, invoiceType } = params;
      const startDate = toViettelSearchDate(fromDate);
      const endDate = toViettelSearchDate(toDate);
      if (!startDate || !endDate) return json({ success: false, error: "Thiếu hoặc sai định dạng ngày" });

      const endpoint = `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoices/${(await ensureCreds()).taxCode}`;
      const buildBody = () => ({
        invoiceType: invoiceType || "01GTKT",
        startDate,
        endDate,
        invoiceStatus: 3,
        rowPerPage: 1000,
        pageNum: 1,
      });

      let reqBody: any = buildBody();
      let r = await callViettel(creds!, cacheKey, endpoint, "POST", reqBody);
      console.log("[sync_drafts] primary status=", r.status, "body=", JSON.stringify(reqBody));
      if (!r.ok && (r.data?.message === "START_DATE_REQUIRED" || r.data?.message === "END_DATE_REQUIRED")) {
        return json({ success: false, error: "Viettel không nhận tham số ngày tra cứu HĐ nháp", raw: r.data });
      }
      await logAction(supabase, { action, response: r.data, status: String(r.status), user_id: user.id, manager_id: managerId });
      if (!r.ok) return json({ success: false, error: r.data?.data || r.data?.message || r.raw });

      const list: any[] = Array.isArray(r.data?.invoices) ? r.data.invoices
        : Array.isArray(r.data?.lstInvoice) ? r.data.lstInvoice
        : Array.isArray(r.data?.data) ? r.data.data
        : [];
      let upserted = 0;
      for (const inv of list) {
        const txUuid = inv.transactionUuid || inv.transactionID || inv.invoiceGuid;
        if (!txUuid) continue;
        const record: any = {
          transaction_uuid: txUuid,
          invoice_number: inv.invoiceNo || null,
          invoice_type: inv.invoiceType || invoiceType || "01GTKT",
          template_code: inv.templateCode || "",
          invoice_series: inv.invoiceSeries || "",
          status: "draft",
          is_draft: true,
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
      }
      return json({ success: true, synced: upserted, total: list.length });
    }

    // ---------- DOWNLOAD FILE (PDF/XML) ----------
    if (action === "download_file") {
      const { transactionUuid, fileType, einvoice_id } = params;
      if (!transactionUuid) return json({ success: false, error: "Thiếu transactionUuid" });
      const r = await callViettel(await ensureCreds(), cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile`,
        "POST",
        { supplierTaxCode: creds!.taxCode, transactionUuid, fileType: fileType || "PDF" }
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
      const r = await callViettel(await ensureCreds(), cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/cancelTransactionInvoice/${creds!.taxCode}`,
        "POST",
        { supplierTaxCode: creds!.taxCode, transactionUuid, additionalReferenceDesc: reason, additionalReferenceDate: Date.now() }
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
      await ensureCreds();
      const payload = mapContractToInvoice(contract, {
        ...options,
        adjustmentType,
        originalInvoiceId: original.invoice_number,
        additionalReferenceDesc: options?.reason || "Thay thế/điều chỉnh",
        originalInvoiceIssueDate: original.issued_date ? new Date(original.issued_date).getTime() : Date.now(),
      }, creds!.taxCode);
      const r = await callViettel(await ensureCreds(), cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${creds!.taxCode}`,
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
      const r = await callViettel(await ensureCreds(), cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/sendHtmlMailProcess`,
        "POST",
        { supplierTaxCode: creds!.taxCode, lstTransactionUuid: [transactionUuid], paramEmail: email }
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
      const r = await callViettel(await ensureCreds(), cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/updatePaymentStatus`,
        "POST",
        { supplierTaxCode: creds!.taxCode, transactionUuid, paymentStatus: !!paid }
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
      const r = await callViettel(await ensureCreds(), cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid`,
        "POST",
        { supplierTaxCode: creds!.taxCode, transactionUuid }
      );
      return json({ success: r.ok, data: r.data });
    }

    // ---------- CREATE INVOICE (existing) ----------
    if (action === "create_invoice") {
      const { contract, options } = params;
      if (!contract) return json({ success: false, error: "Missing contract data" });
      await ensureCreds();
      const payload = mapContractToInvoice(contract, options || {}, creds!.taxCode);
      const r = await callViettel(await ensureCreds(), cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${creds!.taxCode}`,
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
      await ensureCreds();
      const payload = mapContractToInvoice(contract, options || {}, creds!.taxCode);
      const { data: saved, error } = await supabase.from("einvoices").insert({
        contract_id: contract.id || null,
        invoice_type: options?.invoiceType || "01GTKT",
        template_code: options?.templateCode || "",
        invoice_series: options?.invoiceSeries || "",
        status: "draft",
        is_draft: true,
        draft_payload: payload,
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

    // ---------- UPDATE DRAFT (local edit) ----------
    if (action === "update_draft") {
      const { einvoice_id, contract, options } = params;
      if (!einvoice_id || !contract) return json({ success: false, error: "Thiếu dữ liệu" });
      await ensureCreds();
      const payload = mapContractToInvoice(contract, options || {}, creds!.taxCode);
      const { error } = await supabase.from("einvoices").update({
        invoice_type: options?.invoiceType || "01GTKT",
        template_code: options?.templateCode || "",
        invoice_series: options?.invoiceSeries || "",
        total_amount: Number(contract.subtotal) || 0,
        vat_amount: Number(contract.vat_amount) || 0,
        total_with_vat: Number(contract.total_amount) || 0,
        buyer_name: contract.buyer_info?.company_name || contract.buyer_info?.name || "",
        buyer_tax_code: contract.buyer_info?.tax_code || "",
        request_data: payload,
        draft_payload: payload,
      }).eq("id", einvoice_id).eq("is_draft", true);
      if (error) return json({ success: false, error: error.message });
      return json({ success: true });
    }

    // ---------- DELETE DRAFT ----------
    if (action === "delete_draft") {
      const { einvoice_id } = params;
      if (!einvoice_id) return json({ success: false, error: "Thiếu einvoice_id" });
      const { data: draft } = await supabase.from("einvoices").select("*").eq("id", einvoice_id).single();
      if (!draft) return json({ success: false, error: "Không tìm thấy bản nháp" });
      if (!draft.is_draft) return json({ success: false, error: "HĐ này không phải bản nháp" });

      // If draft has been pushed to Viettel, try to delete remotely first
      if (draft.transaction_uuid) {
        try {
          await ensureCreds();
          const r = await callViettel(creds!, cacheKey,
            `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/deleteInvoiceDraft/${creds!.taxCode}/${draft.transaction_uuid}`,
            "GET"
          );
          await logAction(supabase, { einvoice_id, action, response: r.data, status: String(r.status), user_id: user.id, manager_id: managerId });
        } catch (e: any) {
          console.warn("Viettel deleteInvoiceDraft failed:", e.message);
        }
      }
      const { error } = await supabase.from("einvoices").delete().eq("id", einvoice_id);
      if (error) return json({ success: false, error: error.message });
      return json({ success: true });
    }

    // ---------- ISSUE DRAFT (createInvoice with stored payload) ----------
    if (action === "issue_draft") {
      const { einvoice_id } = params;
      if (!einvoice_id) return json({ success: false, error: "Thiếu einvoice_id" });
      const { data: draft } = await supabase.from("einvoices").select("*").eq("id", einvoice_id).single();
      if (!draft) return json({ success: false, error: "Không tìm thấy bản nháp" });
      if (!draft.is_draft) return json({ success: false, error: "HĐ này không phải bản nháp" });
      const payload = draft.draft_payload || draft.request_data;
      if (!payload) return json({ success: false, error: "Bản nháp không có dữ liệu để phát hành" });

      await ensureCreds();
      const r = await callViettel(creds!, cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${creds!.taxCode}`,
        "POST", payload
      );
      await logAction(supabase, { einvoice_id, action, request: payload, response: r.data, status: String(r.status), user_id: user.id, manager_id: managerId });
      if (!r.ok) return json({ success: false, error: r.data?.message || r.raw });

      const result = r.data?.result || r.data;
      await supabase.from("einvoices").update({
        status: "issued",
        is_draft: false,
        transaction_uuid: result?.transactionUuid || result?.transactionID || draft.transaction_uuid,
        invoice_number: result?.invoiceNo || result?.invoiceNumber || null,
        reservation_code: result?.reservationCode || null,
        issued_date: new Date().toISOString(),
        response_data: r.data,
      }).eq("id", einvoice_id);
      return json({ success: true, data: r.data });
    }

    // ---------- PREVIEW DRAFT PDF ----------
    if (action === "preview_draft") {
      const { einvoice_id } = params;
      if (!einvoice_id) return json({ success: false, error: "Thiếu einvoice_id" });
      const { data: draft } = await supabase.from("einvoices").select("*").eq("id", einvoice_id).single();
      if (!draft) return json({ success: false, error: "Không tìm thấy HĐ" });
      await ensureCreds();

      // Pushed draft: use transactionUuid; otherwise build a quick draft via getInvoiceFileViewBeforeIssue
      if (draft.transaction_uuid) {
        const r = await callViettel(creds!, cacheKey,
          `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoiceDraftRepresentationFile`,
          "POST",
          { supplierTaxCode: creds!.taxCode, transactionUuid: draft.transaction_uuid, fileType: "PDF" }
        );
        if (!r.ok) return json({ success: false, error: r.data?.message || r.raw });
        return json({ success: true, base64: r.data?.fileToBytes || r.data?.fileContent || null });
      }

      const payload = draft.draft_payload || draft.request_data;
      if (!payload) return json({ success: false, error: "Không có dữ liệu để xem trước" });
      const r = await callViettel(creds!, cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/createInvoiceUsbToken/${creds!.taxCode}`,
        "POST", { ...payload, fileType: "PDF", preview: true }
      );
      // Many tenants don't support this preview path — fall back gracefully
      if (!r.ok) return json({ success: false, error: "Viettel chưa hỗ trợ xem trước nháp local. Vui lòng phát hành để xem." });
      return json({ success: true, base64: r.data?.fileToBytes || r.data?.fileContent || null });
    }

    // ---------- DOWNLOAD MINUTE (biên bản huỷ/điều chỉnh) ----------
    if (action === "download_minute") {
      const { transactionUuid, minuteType, einvoice_id } = params;
      // minuteType: 1 = biên bản huỷ, 2 = biên bản điều chỉnh, 3 = biên bản thay thế
      if (!transactionUuid) return json({ success: false, error: "Thiếu transactionUuid" });
      const r = await callViettel(await ensureCreds(), cacheKey,
        `/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getMinutesOfInvoice`,
        "POST",
        { supplierTaxCode: creds!.taxCode, transactionUuid, type: minuteType || 1, fileType: "PDF" }
      );
      await logAction(supabase, { einvoice_id, action, request: params, response: { status: r.status }, status: String(r.status), user_id: user.id, manager_id: managerId });
      if (!r.ok) return json({ success: false, error: r.data?.message || r.raw });
      return json({
        success: true,
        base64: r.data?.fileToBytes || r.data?.fileContent || null,
        fileName: r.data?.fileName || `bien-ban-${minuteType || 1}.pdf`,
      });
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