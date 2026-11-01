import type { InvoiceDb } from "./invoice-workspace.js";
import { digest, type InvoiceInput } from "./invoice-import.js";
import { invoiceFail, invoiceTax } from "./invoice-money.js";
import { invoiceBusinessDate } from "./invoice-date.js";
import { invoiceSourceMatchesCanonical, invoiceSourceUnits } from "./invoice-financial.js";

type Row = Record<string, unknown>;
type Identity = { seller_tax_code: string; buyer_tax_code: string; template_code: string; invoice_series: string; invoice_number: string; issued_date: string; currency: string; total_amount: string; vat_amount: string; total_with_vat: string };
export type OriginalBindingProof = {
  kind: "VIETTEL_TT78_EXPLICIT_TYPE";
  target_id: string;
  target_revision: string;
  observation_id: string;
  observation_hash: string;
  xml_sha256: string;
  input_hash: string;
  fingerprint: string;
  api_invoice_type: string;
  api_full_invoice_no: string;
  target_identity: Identity;
  xml_identity: Identity;
  checks: string[];
};
export type OriginalBindingContext = { readonly proof: OriginalBindingProof };
const contexts = new WeakMap<OriginalBindingContext, { target: Row; company: string; input_hash: string }>();
// Staging is JSONB: compare values independently of object-key ordering, without changing XML payloads.
const stableValue = (value: unknown): unknown => Array.isArray(value) ? value.map(stableValue) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stableValue(child)])) : value;
const bindingDigest = (value: unknown) => digest(stableValue(value));
const denied = (): never => invoiceFail("Chưa đủ bằng chứng XML thuộc hóa đơn Viettel đích hoặc có định danh xung đột. Đối chiếu lại nguồn; không tự ghép mã mẫu.", 409);
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
export const originalInvoiceNumber = (value: unknown): string | null => typeof value === "string" && /^\d{1,32}$/.test(value) && BigInt(value) > 0n ? BigInt(value).toString() : null;
const digits = originalInvoiceNumber;
const identity = (row: Row): Identity => Object.fromEntries([
  "seller_tax_code", "buyer_tax_code", "template_code", "invoice_series", "invoice_number", "currency", "total_amount", "vat_amount", "total_with_vat",
].map(key => [key, String(row[key] ?? "")]).concat([["issued_date", invoiceBusinessDate(row.issued_date)]])) as Identity;

/** Called only by the target import route while holding the company lock. No client-supplied proof is trusted. */
export async function prepareOriginalBinding(db: InvoiceDb, companyId: string, target: Row, inputs: InvoiceInput[], files: Row[], source: string): Promise<OriginalBindingContext> {
  if (source !== "VIETTEL_FILE" || target.company_id !== companyId || target.source_kind !== "VIETTEL" || target.is_draft || target.status !== "issued" || target.direction !== "OUT" || inputs.length !== 1) denied();
  const xml = inputs[0], xmlRaw = object(xml.raw), xmlFiles = files.filter(file => file.media_type === "application/xml");
  if (xmlRaw.format !== "VN_HDON_XML" || xmlFiles.length !== 1 || xmlFiles[0].sha256 !== xmlRaw.content_hash || typeof xmlRaw.content_hash !== "string") denied();
  const observation = (await db.query("select id,content_hash,payload from local_invoice_observations where company_id=$1 and invoice_id=$2 and source='VIETTEL' and payload->'raw'->>'provider'='VIETTEL' order by observed_at desc,id desc limit 1", [companyId, target.id])).rows[0];
  if (!observation) denied();
  const payload = object(observation.payload), raw = object(payload.raw), record = object(raw.source_record), stored = object(object(target.source_snapshot).raw);
  if (raw.provider !== "VIETTEL" || raw.spec !== "2.54" || stored.provider !== "VIETTEL" || stored.spec !== "2.54" ||
      typeof raw.provider_id !== "string" || !raw.provider_id || raw.provider_id !== stored.provider_id || payload.source_identity !== raw.provider_id ||
      String(record.invoiceId ?? "") !== raw.provider_id || String(record.state) !== "1" || String(record.adjustmentType) !== "1" ||
      !invoiceSourceMatchesCanonical(payload, target)) denied();
  const apiType = record.invoiceType;
  if (typeof apiType !== "string" || !/^[1-6]$/.test(apiType) || xml.template_code !== apiType ||
      object(stored.source_record).invoiceType !== apiType ||
      typeof record.templateCode !== "string" || !record.templateCode.trim() || record.templateCode !== record.templateCode.trim() || record.templateCode.length > 20 || record.templateCode !== target.template_code ||
      typeof record.supplierTaxCode !== "string" || invoiceTax(record.supplierTaxCode) !== xml.seller_tax_code || xml.seller_tax_code !== target.seller_tax_code ||
      typeof record.buyerTaxCode !== "string" || invoiceTax(record.buyerTaxCode) !== xml.buyer_tax_code || xml.buyer_tax_code !== target.buyer_tax_code ||
      record.invoiceSeri !== xml.invoice_series || xml.invoice_series !== target.invoice_series ||
      typeof record.currency !== "string" || record.currency !== xml.currency || xml.currency !== target.currency) denied();
  const number = digits(xml.invoice_number), fullNo = record.invoiceNo;
  if (!number || digits(record.invoiceNumber) !== number || digits(target.invoice_number) !== number ||
      typeof fullNo !== "string" || fullNo !== raw.full_invoice_no || !fullNo.startsWith(xml.invoice_series) || fullNo.slice(xml.invoice_series.length) !== number) denied();
  const sourceDate = invoiceBusinessDate(payload.issued_date);
  if (!sourceDate || sourceDate !== xml.issued_date || sourceDate !== invoiceBusinessDate(target.issued_date)) denied();
  // Match the adapter's date path, including the documented milliseconds + Vietnam offset fallback.
  if (record.issueDateStr != null && String(record.issueDateStr) !== "") {
    if (String(record.issueDateStr).slice(0, 10) !== sourceDate) denied();
  } else {
    const millis = record.issueDate;
    if (typeof millis !== "string" || !/^-?\d{1,16}$/.test(millis) || !Number.isFinite(Number(millis)) || Math.abs(Number(millis)) > 8640000000000000 - 7 * 3600000 || new Date(Number(millis) + 7 * 3600000).toISOString().slice(0, 10) !== sourceDate) denied();
  }
  try {
    for (const [field, providerField] of [["total_amount", "totalBeforeTax"], ["vat_amount", "taxAmount"], ["total_with_vat", "total"]]) {
      const amount = invoiceSourceUnits(xml[field as keyof InvoiceInput]);
      if (amount !== invoiceSourceUnits(target[field]) || amount !== invoiceSourceUnits(payload[field], true) || amount !== invoiceSourceUnits(record[providerField], true)) denied();
    }
  } catch { denied(); }
  // Company-wide checks deliberately include records hidden by owner ACL; never reveal their identifiers.
  const canonical = (await db.query("select id,invoice_number from local_einvoices where company_id=$1 and seller_tax_code=$2 and coalesce(invoice_series,'')=$3 and id<>$4", [companyId, xml.seller_tax_code, xml.invoice_series, target.id])).rows;
  if (canonical.some(row => digits(row.invoice_number) === number)) denied();
  const observations = (await db.query("select source_identity,payload->'raw'->>'content_hash' xml_hash,payload->>'seller_tax_code' seller,payload->>'invoice_series' series,payload->>'invoice_number' number,payload->'raw'->>'provider_id' provider_id,payload->'raw'->'source_record'->>'invoiceId' record_id,payload->'raw'->>'full_invoice_no' full_no,payload->'raw'->'source_record'->>'invoiceNo' record_full_no from local_invoice_observations where company_id=$1 and invoice_id<>$2 and (source_identity=$3 or source_identity=$5 or payload->'raw'->>'content_hash'=$4 or payload->'raw'->>'provider_id'=$5 or payload->'raw'->'source_record'->>'invoiceId'=$5 or payload->'raw'->>'full_invoice_no'=$6 or payload->'raw'->'source_record'->>'invoiceNo'=$6 or (payload->>'seller_tax_code'=$7 and payload->>'invoice_series'=$8))", [companyId, target.id, xml.source_identity, xmlRaw.content_hash, raw.provider_id, fullNo, xml.seller_tax_code, xml.invoice_series])).rows;
  if (observations.some(row => row.source_identity === xml.source_identity || row.source_identity === raw.provider_id || row.xml_hash === xmlRaw.content_hash || row.provider_id === raw.provider_id || row.record_id === raw.provider_id || row.full_no === fullNo || row.record_full_no === fullNo || (row.seller === xml.seller_tax_code && row.series === xml.invoice_series && digits(row.number) === number))) denied();
  const hashes = files.map(file => String(file.sha256));
  if ((await db.query("select 1 from local_invoice_files where company_id=$1 and sha256=any($2::text[]) and invoice_id is distinct from $3 limit 1", [companyId, hashes, target.id])).rowCount) denied();
  const input_hash = bindingDigest(xml);
  const basis = { kind: "VIETTEL_TT78_EXPLICIT_TYPE" as const, target_id: String(target.id), target_revision: String(target.revision), observation_id: String(observation.id), observation_hash: String(observation.content_hash), xml_sha256: xmlRaw.content_hash as string, input_hash,
    api_invoice_type: apiType as string, api_full_invoice_no: fullNo as string, target_identity: identity(target), xml_identity: identity(xml),
    checks: ["EXPLICIT_API_INVOICE_TYPE", "SELLER_BUYER", "SERIES_NUMERIC_NUMBER_FULL_NO", "BUSINESS_DATE", "CURRENCY_EXACT_HEADERS", "CURRENT_CANONICAL_SOURCE", "NO_COMPETING_IDENTITY_OR_FILE"] };
  const proof: OriginalBindingProof = { ...basis, fingerprint: digest({ ...basis, files: hashes.sort() }) };
  const context = { proof };
  contexts.set(context, { target, company: companyId, input_hash });
  return context;
}
/** Opaque process-owned context cannot be manufactured by JSON from an API caller. */
export function originalBindingTarget(context: OriginalBindingContext, companyId: string, input: InvoiceInput): Row {
  const trusted = contexts.get(context);
  if (!trusted || trusted.company !== companyId || trusted.input_hash !== bindingDigest(input)) return denied();
  return trusted.target;
}
