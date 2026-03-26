import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getVinvoiceToken(): Promise<string> {
  const apiUrl = Deno.env.get("VINVOICE_API_URL") || "https://api-vinvoice.viettel.vn";
  const username = Deno.env.get("VINVOICE_USERNAME");
  const password = Deno.env.get("VINVOICE_PASSWORD");

  if (!username || !password) throw new Error("Missing VINVOICE credentials");

  const res = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error("No access_token in login response");
  return data.access_token;
}

async function createInvoice(token: string, invoiceData: any) {
  const apiUrl = Deno.env.get("VINVOICE_API_URL") || "https://api-vinvoice.viettel.vn";
  const taxCode = Deno.env.get("VINVOICE_TAX_CODE");

  const res = await fetch(
    `${apiUrl}/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${taxCode}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `access_token=${token}`,
      },
      body: JSON.stringify(invoiceData),
    }
  );

  const text = await res.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { raw: text }; }
  return { status: res.status, data: result };
}

async function getInvoiceFile(token: string, body: any) {
  const apiUrl = Deno.env.get("VINVOICE_API_URL") || "https://api-vinvoice.viettel.vn";
  const taxCode = Deno.env.get("VINVOICE_TAX_CODE");

  const res = await fetch(
    `${apiUrl}/services/einvoiceapplication/api/InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `access_token=${token}`,
      },
      body: JSON.stringify({ supplierTaxCode: taxCode, ...body }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Get file failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data;
}

function mapContractToInvoice(contract: any, options: any) {
  const taxCode = Deno.env.get("VINVOICE_TAX_CODE") || "";
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
      discount: 0,
      itemDiscount: 0,
      isIncreaseItem: null,
      batchNo: null,
      expireDate: null,
    };
  });

  const subtotal = Number(contract.subtotal) || itemInfo.reduce((s: number, i: any) => s + i.itemTotalAmountWithoutTax, 0);
  const vatAmount = Number(contract.vat_amount) || subtotal * (vatRate / 100);
  const totalWithVat = subtotal + vatAmount;

  return {
    generalInvoiceInfo: {
      invoiceType: options.invoiceType || "01GTKT",
      templateCode: options.templateCode || "",
      invoiceSeries: options.invoiceSeries || "",
      currencyCode: "VND",
      adjustmentType: "1",
      paymentStatus: true,
      cusGetInvoiceRight: true,
      invoiceNote: contract.title || "",
      paymentMethodName: options.paymentMethod || "TM/CK",
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
    payments: [
      {
        paymentMethodName: options.paymentMethod || "TM/CK",
      },
    ],
    itemInfo,
    summarizeInfo: {
      sumOfTotalLineAmountWithoutTax: subtotal,
      totalAmountWithoutTax: subtotal,
      totalTaxAmount: vatAmount,
      totalAmountWithTax: totalWithVat,
      totalAmountWithTaxInWords: "", // Could add number-to-words here
      discountAmount: 0,
      taxPercentage: vatRate,
    },
    taxBreakdowns: vatRate > 0
      ? [{ taxPercentage: vatRate, taxableAmount: subtotal, taxAmount: vatAmount }]
      : [],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { action, ...params } = await req.json();

    if (action === "login") {
      const token = await getVinvoiceToken();
      return new Response(JSON.stringify({ success: true, token: "***" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_invoice") {
      const { contract, options } = params;
      if (!contract) throw new Error("Missing contract data");

      const token = await getVinvoiceToken();
      const invoicePayload = mapContractToInvoice(contract, options || {});
      const result = await createInvoice(token, invoicePayload);

      // Save to einvoices table
      const einvoiceRecord: any = {
        contract_id: contract.id,
        transaction_uuid: result.data?.result?.transactionUuid || result.data?.transactionUuid || null,
        invoice_number: result.data?.result?.invoiceNo || result.data?.invoiceNo || null,
        invoice_type: options?.invoiceType || "01GTKT",
        template_code: options?.templateCode || "",
        invoice_series: options?.invoiceSeries || "",
        status: result.status === 200 ? "issued" : "error",
        issued_date: new Date().toISOString(),
        total_amount: Number(contract.subtotal) || Number(contract.total_amount) || 0,
        vat_amount: Number(contract.vat_amount) || 0,
        total_with_vat: Number(contract.total_amount) || 0,
        buyer_name: contract.buyer_info?.company_name || contract.buyer_info?.name || "",
        buyer_tax_code: contract.buyer_info?.tax_code || "",
        response_data: result.data,
        request_data: invoicePayload,
      };

      const { data: savedInvoice, error: saveError } = await supabase
        .from("einvoices")
        .insert(einvoiceRecord)
        .select()
        .single();

      if (saveError) {
        console.error("Save einvoice error:", saveError);
      }

      return new Response(
        JSON.stringify({
          success: result.status === 200,
          invoice: savedInvoice,
          apiResponse: result.data,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_invoice_file") {
      const { transactionUuid, fileType } = params;
      const token = await getVinvoiceToken();
      const fileData = await getInvoiceFile(token, {
        transactionUuid,
        fileType: fileType || "PDF",
      });
      return new Response(JSON.stringify({ success: true, data: fileData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_draft") {
      const { contract, options } = params;
      if (!contract) throw new Error("Missing contract data");

      const token = await getVinvoiceToken();
      const invoicePayload = mapContractToInvoice(contract, options || {});
      const apiUrl = Deno.env.get("VINVOICE_API_URL") || "https://api-vinvoice.viettel.vn";
      const taxCode = Deno.env.get("VINVOICE_TAX_CODE");

      const res = await fetch(
        `${apiUrl}/services/einvoiceapplication/api/InvoiceAPI/InvoiceWS/createInvoice/${taxCode}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `access_token=${token}`,
          },
          body: JSON.stringify(invoicePayload),
        }
      );

      const text = await res.text();
      let result;
      try { result = JSON.parse(text); } catch { result = { raw: text }; }

      // Save as draft
      const einvoiceRecord: any = {
        contract_id: contract.id || null,
        transaction_uuid: result?.result?.transactionUuid || result?.transactionUuid || null,
        invoice_type: options?.invoiceType || "01GTKT",
        template_code: options?.templateCode || "",
        invoice_series: options?.invoiceSeries || "",
        status: "draft",
        total_amount: Number(contract.subtotal) || 0,
        vat_amount: Number(contract.vat_amount) || 0,
        total_with_vat: Number(contract.total_amount) || 0,
        buyer_name: contract.buyer_info?.company_name || contract.buyer_info?.name || "",
        buyer_tax_code: contract.buyer_info?.tax_code || "",
        response_data: result,
        request_data: invoicePayload,
      };

      const { data: savedDraft, error: saveError } = await supabase
        .from("einvoices")
        .insert(einvoiceRecord)
        .select()
        .single();

      if (saveError) console.error("Save draft error:", saveError);

      return new Response(
        JSON.stringify({ success: true, draft: savedDraft, apiResponse: result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get_invoices") {
      const { contract_id } = params;
      let query = supabase
        .from("einvoices")
        .select("*")
        .order("created_at", { ascending: false });

      if (contract_id) query = query.eq("contract_id", contract_id);

      const { data, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error("vinvoice-api error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
