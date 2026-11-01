import type { PoolClient } from "pg";
import type { InvoiceDb } from "./invoice-workspace.js";
import { digest, type InvoiceInput } from "./invoice-import.js";
import { invoiceFinancialProjection,invoiceSourceMatchesCanonical } from "./invoice-financial.js";
import { invoiceBusinessDate } from "./invoice-date.js";
type Row = Record<string, unknown>;
/** Identity review alone never confirms that a relation may change financial totals. */
export async function requireFinancialRelation(db: InvoiceDb, relation: Row) {
  const fail=():never=>{throw Object.assign(new Error("Quan hệ mới được đối chiếu định danh; trạng thái phát hành hoặc chiều tăng/giảm tài chính chưa đủ xác minh. Chưa thể chốt kỳ/loại hóa đơn gốc; cần đối soát nguồn."),{status:409});};
  if(!relation.verified)return fail();
  const invoice=(await db.query("select * from local_einvoices where id=$1",[relation.invoice_id])).rows[0];
  const receipt=(await db.query("select snapshot from local_invoice_audit where invoice_id=$1 and action='VERIFY_SOURCE_RELATION' and snapshot->>'original_id'=$2 and snapshot->>'kind'=$3 order by created_at desc,id desc limit 1",[relation.invoice_id,relation.original_id,relation.kind])).rows[0];
  const evidence=invoice ? (await invoiceRelationCandidates(db,invoice)).find(e=>e.id===receipt?.snapshot?.evidence_id) : undefined;
  if(!evidence||evidence.kind!==relation.kind||evidence.resolution!=="EXACT_CANDIDATE"||evidence.candidate_ids[0]!==relation.original_id)return fail();
  const observations=(await db.query("select id,payload from local_invoice_observations where invoice_id=$1 order by observed_at desc,id desc",[relation.invoice_id])).rows;
  const selected=observations.find(o=>o.id===evidence.observation_id),latest=observations.find(o=>o.payload?.raw?.provider==="VIETTEL");
  if(!selected||!latest||selected.payload?.raw?.provider!=="VIETTEL")return fail();
  if(!invoiceSourceMatchesCanonical(selected.payload,invoice)||!invoiceSourceMatchesCanonical(latest.payload,invoice))return fail();
  const selectedRaw=selected.payload.raw,latestRaw=latest.payload.raw;
  if(String(selectedRaw.provider_id)!==String(latestRaw.provider_id)||digest(selectedRaw.relation_fields)!==digest(latestRaw.relation_fields))return fail();
  const projection=invoiceFinancialProjection(selected.payload),current=invoiceFinancialProjection(latest.payload);
  if(!projection.known||!current.known||JSON.stringify(projection)!==JSON.stringify(current))return fail();
  const type=String(selected.payload.raw.source_record.adjustmentType);
  if(type!==String(latest.payload.raw.source_record.adjustmentType))return fail();
  if((relation.kind==="REPLACES"&&type!=="3")||(relation.kind==="ADJUSTS"&&type!=="9"))return fail();
  return projection;
}
/** Evidence is owned by one immutable observation; no computed defaults are source facts. */
export async function captureInvoiceEvidence(
  db: PoolClient,
  observationId: string,
  invoiceId: string,
  input: InvoiceInput,
) {
  const raw = (input.raw ?? {}) as Row,
    spec =
      raw.provider === "VIETTEL"
        ? "VIETTEL_2.54"
        : raw.format === "VN_HDON_XML"
          ? "VN_HDON_XML_PUBLIC_READER"
          : "USER_DECLARED";
  for (const [type, key, path] of [
    [
      "LINE",
      "source_lines",
      spec === "VIETTEL_2.54"
        ? "listProduct.itemInfo"
        : "HDon/DLHDon/NDHDon/DSHHDVu/HHDVu",
    ],
    [
      "TAX_GROUP",
      "tax_groups",
      spec === "VIETTEL_2.54"
        ? "invoiceTaxBreakdowns"
        : "HDon/DLHDon/NDHDon/TToan/THTTLTSuat",
    ],
  ] as const) {
    const rows = Array.isArray(raw[key]) ? (raw[key] as Row[]) : [];
    for (const [i, row] of rows.entries())
      await db.query(
        "insert into local_invoice_source_evidence(observation_id,invoice_id,evidence_type,ordinal,payload,source_path,spec,content_hash)values($1,$2,$3,$4,$5::jsonb,$6,$7,$8)",
        [
          observationId,
          invoiceId,
          type,
          i,
          JSON.stringify(row),
          String((raw.source_paths as Row | undefined)?.[key] ?? path) +
            "/" +
            i,
          spec,
          digest(row),
        ],
      );
  }
  const relation = raw.relation_fields as Row | undefined;
  if (
    relation &&
    Object.values(relation).some(Boolean) &&
    (relation.full_number || relation.number)
  )
    await db.query(
      "insert into local_invoice_source_evidence(observation_id,invoice_id,evidence_type,ordinal,payload,source_path,spec,content_hash)values($1,$2,'RELATION',0,$3::jsonb,$4,$5,$6)",
      [
        observationId,
        invoiceId,
        JSON.stringify(relation),
        spec === "VIETTEL_2.54"
          ? "originalInvoiceId/adjustmentType"
          : String(
              (raw.source_paths as Row | undefined)?.relation_fields ??
                "source relation fields; profile review required",
            ),
        spec,
        digest(relation),
      ],
    );
}
export async function invoiceRelationCandidates(db: InvoiceDb, row: Row) {
  const evidence = (
    await db.query(
      "select * from local_invoice_source_evidence where invoice_id=$1 and evidence_type='RELATION' order by id",
      [row.id],
    )
  ).rows;
  const out = [];
  for (const e of evidence) {
    const raw = e.payload as Row;
    let matches: Row[] = [];
    if (
      ["REPLACES", "ADJUSTS"].includes(String(raw.kind)) &&
      (!raw.seller_tax_code ||
        String(raw.seller_tax_code).replace(/[-\s]/g, "") ===
          row.seller_tax_code)
    ) {
      if (raw.full_number) {
        matches = (
          await db.query(
            "select distinct i.* from local_einvoices i join local_invoice_observations o on o.invoice_id=i.id where i.company_id=$1 and i.id<>$2 and i.seller_tax_code=$3 and i.direction=$4 and i.currency=$5 and o.payload->'raw'->>'full_invoice_no'=$6",
            [
              row.company_id,
              row.id,
              raw.seller_tax_code || row.seller_tax_code,
              row.direction,
              row.currency,
              String(raw.full_number),
            ],
          )
        ).rows.filter(
          (r) =>
            (!raw.template || raw.template === r.template_code) &&
            (!raw.series || raw.series === r.invoice_series) &&
            (!raw.date ||
              invoiceBusinessDate(r.issued_date) ===
                String(raw.date).slice(0, 10)),
        );
      } else if (raw.template && raw.series && raw.number && raw.date) {
        matches = (
          await db.query(
            "select * from local_einvoices where company_id=$1 and id<>$2 and seller_tax_code=$3 and direction=$4 and currency=$5 and template_code=$6 and invoice_series=$7 and invoice_number=$8",
            [
              row.company_id,
              row.id,
              raw.seller_tax_code || row.seller_tax_code,
              row.direction,
              row.currency,
              raw.template,
              raw.series,
              raw.number,
            ],
          )
        ).rows.filter(
          (r) =>
            invoiceBusinessDate(r.issued_date) ===
            String(raw.date).slice(0, 10),
        );
      }
    }
    out.push({
      ...e,
      resolution:
        matches.length === 1
          ? "EXACT_CANDIDATE"
          : matches.length
            ? "AMBIGUOUS"
            : "UNRESOLVED",
      candidate_ids: matches.map((r) => r.id),
      kind: raw.kind ?? null,
    });
  }
  const targets = new Set(out.flatMap((e) => e.candidate_ids)),
    kinds = new Set(out.map((e) => e.kind).filter(Boolean));
  if (
    targets.size > 1 ||
    kinds.size > 1 ||
    (out.length > 1 && out.some((e) => e.resolution !== "EXACT_CANDIDATE"))
  )
    for (const e of out) e.resolution = "CONFLICTING_EVIDENCE";
  return out;
}
