import { invoiceFail, invoiceTax } from "./invoice-money.js";
import { boundedZip, boundedZipEntry } from "./invoice-import.js";
import { providerMappedDecimal, providerMappedRate } from "./invoice-provider-decimal.js";
import type { InvoiceReadTransport } from "./invoice-provider.js";
import { providerAbortFailure, providerDiagnostic, providerFailure } from "./invoice-provider-diagnostics.js";
export const VIETTEL_API_BASE =
  "https://api-vinvoice.viettel.vn/services/einvoiceapplication/api/";
export const VIETTEL_SPEC =
  "https://sme.viettel.vn/mediafile/sme/sme-sinvoice/20261026/tailieu_mo_ta_webservice_hoadondientu_doitac_v2.54_public-528984db.docx";
// Preserve numeric lexemes before JSON.parse so large totals/IDs never pass through IEEE-754.
function providerJson(source: string): Record<string, unknown> {
  let out = "",
    i = 0,
    quoted = false,
    escaped = false;
  while (i < source.length) {
    const c = source[i];
    if (quoted) {
      out += c;
      i++;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') {
      quoted = true;
      out += c;
      i++;
      continue;
    }
    if (c === "-" || /\d/.test(c)) {
      const match = source
        .slice(i)
        .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        out += JSON.stringify(match[0]);
        i += match[0].length;
        continue;
      }
    }
    out += c;
    i++;
  }
  const value = JSON.parse(out);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw providerFailure("INVALID_RESPONSE");
  return value;
}
type Settings = {
  username: string;
  password: string;
  supplier_tax_code: string;
  page_start: number;
  company_name: string;
  company_address: string;
};
export type ViettelHttp = (url: string, init: RequestInit) => Promise<Response>;
/** All endpoints are fixed read operations documented in official S-Invoice v2.54 (26/10/2026). */
export class ViettelReadAdapter implements InvoiceReadTransport {
  constructor(
    private settings: Settings,
    private http: ViettelHttp = fetch,
    private includeFiles = true,
  ) {}
  private async call(endpoint: string, body: unknown, signal: AbortSignal) {
    let response: Response;
    try {
      response = await this.http(VIETTEL_API_BASE + endpoint, {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization:
          "Basic " +
          Buffer.from(
            this.settings.username + ":" + this.settings.password,
          ).toString("base64"),
      },
      body: JSON.stringify(body),
      });
    } catch {
      throw providerAbortFailure(signal);
    }
    if (!response.ok)
      throw providerFailure(response.status === 401 || response.status === 403 ? "AUTH_OR_API_PERMISSION_REQUIRED" : "HTTP_ERROR", response.status);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try { reader = response.body?.getReader(); }
    catch { throw providerAbortFailure(signal); }
    if (!reader) throw providerFailure("INVALID_RESPONSE");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      let part: ReadableStreamReadResult<Uint8Array>;
      try { part = await reader!.read(); }
      catch { throw providerAbortFailure(signal); }
      if (part.done) break;
      size += part.value.length;
      if (size > 24 * 1024 * 1024) {
        await reader!.cancel().catch(() => undefined);
        throw providerFailure("INVALID_RESPONSE");
      }
      chunks.push(part.value);
    }
    let value: Record<string, unknown>;
    try {
      value = providerJson(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw providerFailure("INVALID_RESPONSE");
    }
    if (value!.errorCode != null && String(value!.errorCode) !== "")
      throw providerFailure("PROVIDER_REJECTED");
    return value!;
  }
  private bytes(value: unknown) {
    if (
      typeof value === "string" &&
      value.length <= 22 * 1024 * 1024 &&
      /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
    )
      return Buffer.from(value, "base64");
    if (
      Array.isArray(value) &&
      value.length <= 15 * 1024 * 1024 &&
      value.every(
        (v) =>
          /^-?\d+$/.test(String(v)) && Number(v) >= -128 && Number(v) <= 255,
      )
    )
      return Buffer.from(value.map((v) => (Number(v) + 256) % 256));
    throw providerFailure("SOURCE_FILE_INVALID");
  }
  async page(input: Parameters<InvoiceReadTransport["page"]>[0]) {
    if (
      invoiceTax(input.company_tax_code) !==
      invoiceTax(this.settings.supplier_tax_code)
    )
      invoiceFail("MST cấu hình không khớp doanh nghiệp.", 403);
    let checkpoint;
    try { checkpoint = input.cursor
      ? JSON.parse(input.cursor)
      : {
          page: this.settings.page_start,
          seen: [],
          total: null,
          identities: {},
        }; } catch { throw providerFailure("PAGINATION_UNVERIFIED"); }
    if (
      !checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint) ||
      !Number.isInteger(checkpoint.page) ||
      checkpoint.page < 0 ||
      checkpoint.page > 100000 ||
      !Array.isArray(checkpoint.seen) || checkpoint.seen.some((id: unknown) => typeof id !== "string") ||
      (checkpoint.identities != null && (typeof checkpoint.identities !== "object" || Array.isArray(checkpoint.identities)))
    )
      throw providerFailure("PAGINATION_UNVERIFIED");
    const size = 25,
      response = await this.call(
        "InvoiceAPI/InvoiceUtilsWS/getInvoicesAll/" +
          encodeURIComponent(this.settings.supplier_tax_code),
        {
          supplierTaxCode: this.settings.supplier_tax_code,
          startDate: input.from.slice(0, 10),
          endDate: input.to.slice(0, 10),
          rowPerPage: size,
          pageNum: checkpoint.page,
          getAll: false,
        },
        input.signal,
      );
    if (!Array.isArray(response.invoices) || response.invoices.length > size)
      throw providerFailure("SOURCE_SCHEMA_UNSUPPORTED");
    const totalValue = response.totalRows ?? response.totalRow;
    const total = typeof totalValue === "string" && /^\d+$/.test(totalValue) ? Number(totalValue) : NaN;
    if (!Number.isSafeInteger(total) || total < 0 || total > 50000)
      throw providerFailure("SOURCE_SCHEMA_UNSUPPORTED");
    if (checkpoint.total !== null && checkpoint.total !== total)
      throw providerFailure("PAGINATION_UNVERIFIED");
    const mapped = [];
    let pageBytes = 0;
    const seen = new Set<string>(checkpoint.seen);
    const identities: Record<string, string> = checkpoint.identities ?? {};
    let progress = 0;
    for (const raw of response.invoices as Record<string, unknown>[]) {
      if (
        !raw || typeof raw !== "object" || Array.isArray(raw) ||
        typeof raw.invoiceId !== "string" || !raw.invoiceId.trim() ||
        typeof raw.invoiceNumber !== "string" || typeof raw.invoiceSeri !== "string" ||
        !String(raw.invoiceNumber ?? "") ||
        !String(raw.invoiceSeri ?? "")
      )
        throw providerFailure("SOURCE_SCHEMA_UNSUPPORTED");
      const id = String(raw.invoiceId);
      const identity = JSON.stringify([
        raw.supplierTaxCode ?? this.settings.supplier_tax_code,
        raw.templateCode,
        raw.invoiceSeri,
        raw.invoiceNumber,
        raw.invoiceNo,
      ]);
      if (seen.has(id)) {
        if (identities[id] && identities[id] !== identity)
          throw providerFailure("PAGINATION_UNVERIFIED");
        continue;
      }
      identities[id] = identity;
      seen.add(id);
      progress++;
      let products: Record<string, unknown> = {};
      if (raw.listProduct != null && typeof raw.listProduct !== "string") throw providerFailure("SOURCE_SCHEMA_UNSUPPORTED");
      if (typeof raw.listProduct === "string" && raw.listProduct.trim()) {
        try {
          products = providerJson(raw.listProduct);
        } catch {
          throw providerFailure("SOURCE_SCHEMA_UNSUPPORTED");
        }
      }
      if (products.itemInfo != null && (!Array.isArray(products.itemInfo) || products.itemInfo.some((line: unknown) => !line || typeof line !== "object" || Array.isArray(line)))) throw providerFailure("SOURCE_SCHEMA_UNSUPPORTED");
      const lines = Array.isArray(products.itemInfo)
        ? products.itemInfo.map((line: Record<string, unknown>) => ({
            name: line.itemName,
            quantity: line.quantity == null ? null : providerMappedDecimal(String(line.quantity), 6, true),
            unit: line.unitName ?? "",
            unit_price: line.unitPrice == null ? null : providerMappedDecimal(String(line.unitPrice)),
            vat_rate: providerMappedRate(String(line.vatPercentage ?? "UNKNOWN_SOURCE_RATE")),
            source_line: line.lineNumber,
          }))
        : [];
      let issuedDate = String(raw.issueDateStr ?? "").slice(0, 10);
      if (!issuedDate && raw.issueDate != null && Number.isFinite(Number(raw.issueDate)) && Math.abs(Number(raw.issueDate)) <= 8640000000000000 - 7 * 3600000)
        issuedDate = new Date(Number(raw.issueDate) + 7 * 3600000)
          .toISOString()
          .slice(0, 10);
      const adjustment = String(raw.adjustmentType ?? ""),
        state = String(raw.state ?? "");
      const status =
        state === "1" && adjustment === "1"
          ? "issued"
          : state === "1" && ["3", "5", "9", "11"].includes(adjustment)
            ? "adjusted"
            : "unknown";
      const files: { name: string; media_type: string; data_base64: string }[] =
        [];
      let file_error: string | null = null;
      if (this.includeFiles && state === "1") {
        try {
          if (!raw.invoiceNo)
            invoiceFail(
              "Nguồn thiếu invoiceNo nguyên bản; không tự ghép ký hiệu và số.",
            );
          const result = await this.call(
            "InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile",
            {
              supplierTaxCode: this.settings.supplier_tax_code,
              invoiceNo: String(raw.invoiceNo ?? ""),
              templateCode: raw.templateCode,
              fileType: "ZIP",
              startDate: input.from.slice(0, 10),
              endDate: input.to.slice(0, 10),
            },
            input.signal,
          );
          const bytes = this.bytes(result.fileToBytes);
          pageBytes += bytes.length;
          if (pageBytes > 40 * 1024 * 1024)
            invoiceFail(
              "Tệp trong trang vượt 40MB; danh sách vẫn được giữ, nhập XML riêng.",
            );
          const zip = await boundedZip(bytes);
          files.push({
            name: "viettel-" + id + ".zip",
            media_type: "application/zip",
            data_base64: bytes.toString("base64"),
          });
          let expanded = 0;
          for (const entry of Object.values(zip.files)) {
            if (entry.dir) continue;
            const data = await boundedZipEntry(entry);
            expanded += data.length;
            pageBytes += data.length;
            if (pageBytes > 40 * 1024 * 1024)
              invoiceFail("Tệp trong trang vượt 40MB; nhập XML riêng.");
            if (expanded > 40 * 1024 * 1024)
              invoiceFail("ZIP nguồn quá giới hạn.");
            const ext = entry.name.split(".").pop()?.toLowerCase();
            if (ext === "xml" || ext === "pdf")
              files.push({
                name: "viettel-" + id + "-" + files.length + "." + ext,
                media_type:
                  ext === "xml" ? "application/xml" : "application/pdf",
                data_base64: data.toString("base64"),
              });
          }
        } catch (error) {
          files.length = 0;
          if (input.signal.aborted) throw providerAbortFailure(input.signal);
          const diagnostic = providerDiagnostic(error);
          if (diagnostic.code === "TIMEOUT") throw providerFailure("TIMEOUT");
          file_error = diagnostic.code === "READ_FAILED" ? "SOURCE_FILE_INVALID" : diagnostic.code;
        }
      }
      mapped.push({
        provider_id: id,
        seller_tax_code: raw.supplierTaxCode ?? this.settings.supplier_tax_code,
        seller_name: this.settings.company_name,
        seller_address: this.settings.company_address,
        buyer_tax_code: raw.buyerTaxCode ?? "",
        buyer_name: raw.buyerUnitName ?? raw.buyerName ?? "",
        buyer_address: raw.buyerAddress ?? "",
        invoice_number: String(raw.invoiceNumber),
        invoice_series: String(raw.invoiceSeri),
        template_code: String(raw.templateCode ?? ""),
        issued_date: issuedDate,
        currency: String(raw.currency ?? "VND"),
        status,
        total_amount: providerMappedDecimal(String(raw.totalBeforeTax ?? ""), 6, true),
        vat_amount: providerMappedDecimal(String(raw.taxAmount ?? ""), 6, true),
        total_with_vat: providerMappedDecimal(String(raw.total ?? ""), 6, true),
        lines,
        source_files: files,
        raw: {
          provider: "VIETTEL",
          spec: "2.54",
          provider_id: id,
          full_invoice_no: raw.invoiceNo ?? null,
          source_lines: products.itemInfo ?? [],
          tax_groups:
            raw.invoiceTaxBreakdowns ?? products.invoiceTaxBreakdowns ?? [],
          relation_fields: {
            full_number: raw.originalInvoiceId ?? raw.originalInvoiceID ?? null,
            date: raw.originalInvoiceIssueDate ?? null,
            template: raw.originalTemplateCode ?? null,
            series: raw.originalInvoiceSeri ?? null,
            kind: adjustment === "3"
              ? "REPLACES"
              : ["5", "9"].includes(adjustment)
                ? "ADJUSTS"
                : null,
            profile: "VIETTEL_2.54_ORIGINAL_FULL_NUMBER",
          },
          source_record: raw,
          file_error,
          original_reference:
            raw.originalInvoiceId ?? raw.originalInvoiceID ?? null,
          adjustment_type: adjustment,
          financial_semantics: ["5","9","11"].includes(adjustment) || state !== "1" ? "PENDING_SOURCE_DELTA_REVIEW" : "ISSUED_SOURCE",
          source_state: state,
          source_delta_flags: (Array.isArray(products.itemInfo) ? products.itemInfo : []).map((line: Record<string,unknown>) => line.isIncreaseItem ?? null),
        },
      });
    }
    if (!progress && seen.size < total)
      throw providerFailure("PAGINATION_UNVERIFIED");
    const complete = seen.size === total;
    if (seen.size > total)
      throw providerFailure("PAGINATION_UNVERIFIED");
    if (input.signal.aborted) throw providerAbortFailure(input.signal);
    return {
      invoices: mapped,
      next_cursor: complete
        ? null
        : JSON.stringify({
            page: checkpoint.page + 1,
            seen: [...seen],
            total,
            identities,
          }),
      complete,
    };
  }
}
