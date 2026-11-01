import type { Express, Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import type { InvoiceDb } from "./invoice-workspace.js";
import type { ContractPrincipal } from "./contract-policy.js";
import { requireContract } from "./contract-policy.js";
import {
  invoiceFail as fail,
  invoiceMinor,
  invoiceAmount,
  invoiceDecimal,
} from "./invoice-money.js";
import {
  invoiceBusinessSource,
  invoiceDossier,
  checklistItems,
  invoiceCashSource,
  invoiceSourcePermission,
} from "./invoice-dossier.js";
import { invoiceRelationCandidates } from "./invoice-evidence.js";
import { digest } from "./invoice-import.js";
import { invoiceBusinessDate } from "./invoice-date.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
type Row = Record<string, unknown>;
type Cap =
  "view" | "import" | "draft" | "link" | "review" | "configure" | "files";
type Dependencies = {
  app: Express;
  pool: Pool;
  root: string;
  principal: (db?: InvoiceDb) => Promise<ContractPrincipal>;
  handler: (
    fn: (req: Request, res: Response) => Promise<unknown>,
  ) => (req: Request, res: Response) => Promise<void>;
  tx: <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T>;
  load: (
    db: InvoiceDb,
    p: ContractPrincipal,
    id: string,
    cap: Cap,
    lock?: boolean,
  ) => Promise<Row>;
  locked: (
    db: PoolClient,
    p: ContractPrincipal,
    id: string,
    cap: Cap,
  ) => Promise<Row>;
  audit: (
    db: PoolClient,
    p: ContractPrincipal,
    c: string | null,
    id: string | null,
    action: string,
    reason: string,
    snapshot?: unknown,
  ) => Promise<void>;
  expected: (row: Row, value: unknown) => void;
  reason: (value: unknown) => string;
  requireCompany: (
    db: InvoiceDb,
    p: ContractPrincipal,
    row: Row,
    cap?: Cap,
  ) => Promise<void>;
};
const base = "/api/invoice-workspace/invoices/:id";
export function registerInvoiceDossierRoutes(d: Dependencies) {
  const { app, pool, principal, handler, tx } = d;
  app.get(
    base + "/dossier",
    handler(async (req, res) => {
      const p = await principal(),
        row = await d.load(pool, p, String(req.params.id), "view");
      res.json(await invoiceDossier(pool, p, row));
    }),
  );
  app.get(
    base + "/relation-candidates",
    handler(async (req, res) => {
      const p = await principal(),
        row = await d.load(pool, p, String(req.params.id), "view"),
        items = await invoiceRelationCandidates(pool, row);
      for (const item of items) {
        const ids = [];
        for (const id of item.candidate_ids) {
          try {
            await d.load(pool, p, String(id), "view");
            ids.push(id);
          } catch {
            /* Scope before showing candidates. */
          }
        }
        item.candidate_ids = ids;
        if (item.resolution !== "CONFLICTING_EVIDENCE")
          item.resolution =
            ids.length === 1
              ? "EXACT_CANDIDATE"
              : ids.length
                ? "AMBIGUOUS"
                : "UNRESOLVED";
      }
      res.json(items);
    }),
  );
  app.post(
    [base + "/relations", base + "/relations/verify"],
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await d.locked(db, p, String(req.params.id), "review");
          d.expected(row, req.body.expected_revision);
          const evidence = (await invoiceRelationCandidates(db, row)).find(
            (e) => e.id === req.body.evidence_id,
          );
          if (
            !evidence ||
            evidence.resolution !== "EXACT_CANDIDATE" ||
            evidence.candidate_ids[0] !== req.body.original_id
          )
            fail(
              "Chưa có bằng chứng nguồn phân giải duy nhất. Giữ chờ đối chiếu, nhập thêm hóa đơn gốc nếu thiếu.",
              409,
            );
          const original = await d.load(
            db,
            p,
            String(req.body.original_id),
            "review",
            true,
          );
          if (
            original.company_id !== row.company_id ||
            original.seller_tax_code !== row.seller_tax_code ||
            original.direction !== row.direction ||
            original.currency !== row.currency
          )
            fail("Nguồn quan hệ khác doanh nghiệp/bên bán/chiều/tiền tệ.", 409);
          if (
            (
              await db.query(
                "with recursive chain(id)as(select original_id from local_invoice_relations where invoice_id=$1 union select r.original_id from local_invoice_relations r join chain c on r.invoice_id=c.id)select 1 from chain where id=$2",
                [original.id, row.id],
              )
            ).rowCount
          )
            fail("Quan hệ tạo vòng.", 409);
          await db.query(
            "insert into local_invoice_relations(invoice_id,original_id,kind,verified,reason,created_by)values($1,$2,$3,true,$4,$5)on conflict(invoice_id,original_id)do nothing",
            [
              row.id,
              original.id,
              evidence.kind,
              d.reason(req.body.reason),
              p.actor,
            ],
          );
          await db.query(
            "update local_einvoices set revision=revision+1,review_state='needs_review',updated_at=now() where id=any($1::text[])",
            [[row.id, original.id]],
          );
          await d.audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "VERIFY_SOURCE_RELATION",
            d.reason(req.body.reason),
            {
              evidence_id: evidence.id,
              original_id: original.id,
              kind: evidence.kind,
            },
          );
          return { success: true };
        }),
      ),
    ),
  );
  app.post(
    base + "/checklist",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await d.locked(db, p, String(req.params.id), "review");
          d.expected(row, req.body.expected_revision);
          if (
            !checklistItems.includes(req.body.item) ||
            !["REQUIRED", "NOT_APPLICABLE"].includes(req.body.assessment)
          )
            fail("Mục checklist/trạng thái không hợp lệ.");
          const reason = d.reason(req.body.reason);
          await db.query(
            "insert into local_invoice_checklist(invoice_id,item,assessment,reason,reviewed_by)values($1,$2,$3,$4,$5)on conflict(invoice_id,item)do update set assessment=excluded.assessment,reason=excluded.reason,reviewed_by=excluded.reviewed_by,reviewed_at=now()",
            [row.id, req.body.item, req.body.assessment, reason, p.actor],
          );
          await db.query(
            "update local_einvoices set revision=revision+1,review_state='needs_review',updated_at=now() where id=$1",
            [row.id],
          );
          await d.audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "ASSESS_CHECKLIST",
            reason,
            { item: req.body.item, assessment: req.body.assessment },
          );
          return { success: true };
        }),
      ),
    ),
  );
  app.get(
    base + "/business-sources",
    handler(async (req, res) => {
      const p = await principal(),
        row = await d.load(pool, p, String(req.params.id), "link"),
        type = String(req.query.type ?? "CONTRACT");
      const table = (
        {
          CONTRACT: "local_contracts",
          BUSINESS_TRANSACTION: "local_business_transactions",
          PRODUCTION_SHIPMENT: "local_production_shipments",
          INVENTORY_DOCUMENT: "local_inventory_documents",
          CONTRACT_DOCUMENT: "local_contracts",
        } as Record<string, string>
      )[type];
      if (!table) fail("Nguồn không hỗ trợ.");
      const candidates = (
          await pool.query(
            `select id::text from ${table} order by created_at desc limit 300`,
          )
        ).rows,
        visible = [];
      for (const c of candidates) {
        try {
          const source = await invoiceBusinessSource(pool, p, row, type, c.id),
            s = source.snapshot;
          const why = [];
          if (
            s.tax_code &&
            String(s.tax_code).replace(/[-\s]/g, "") ===
              String(
                row.direction === "OUT"
                  ? row.buyer_tax_code
                  : row.seller_tax_code,
              )
          )
            why.push("Khớp MST đối tác");
          if (
            s.date &&
            Math.abs(
              Date.parse(String(s.date)) -
                Date.parse(invoiceBusinessDate(row.issued_date)),
            ) <=
              31 * 86400000
          )
            why.push("Ngày trong 31 ngày");
          if (
            s.amount &&
            s.currency === row.currency &&
            invoiceMinor(s.amount, String(row.currency)) ===
              invoiceMinor(row.total_with_vat, String(row.currency))
          )
            why.push("Khớp tổng và tiền tệ");
          if (
            String(req.query.search ?? "") &&
            !JSON.stringify(s)
              .toLowerCase()
              .includes(String(req.query.search).toLowerCase())
          )
            continue;
          visible.push({
            ...source,
            id: c.id,
            source_type: type,
            reasons: why.length
              ? why
              : ["Chưa có tín hiệu khớp; cần kiểm tra tham chiếu và pháp nhân"],
            score: why.length,
          });
        } catch {
          /* ACL and unavailable source before ranking/count. */
        }
      }
      visible.sort((a, b) => b.score - a.score);
      res.json(visible.slice(0, 100));
    }),
  );
  app.post(
    base + "/business-links",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await d.locked(db, p, String(req.params.id), "link");
          d.expected(row, req.body.expected_revision);
          if (!row.company_id) fail("Cần gắn doanh nghiệp.");
          const b = req.body,
            reason = d.reason(b.reason),
            type = String(b.source_type),
            kind = String(b.kind),
            axis = String(b.axis ?? "EVIDENCE");
          if (
            ![
              "CONTRACT",
              "COST",
              "APPENDIX",
              "DELIVERY",
              "ACCEPTANCE",
              "OTHER",
            ].includes(kind) ||
            !["EVIDENCE", "OBLIGATION", "FULFILMENT"].includes(axis)
          )
            fail(
              "Loại/chiều phân bổ không hợp lệ; tiền thu dùng tab Thanh toán.",
            );
          let source,
            id = String(b.source_id ?? ""),
            fileId: string | null = null;
          if (type === "EXTERNAL") {
            await d.requireCompany(db, p, row, "review");
            if (
              !String(b.reference ?? "").trim() ||
              !invoiceBusinessDate(b.document_date) ||
              !String(b.counterparty ?? "").trim() ||
              !b.file_id
            )
              fail("Hồ sơ ngoài cần tệp, tham chiếu, ngày và đối tác.");
            const file = (
              await db.query(
                "select * from local_invoice_files where id=$1 and invoice_id=$2 and purpose='BUSINESS_ATTACHMENT'",
                [b.file_id, row.id],
              )
            ).rows[0];
            if (!file) fail("Tệp hồ sơ ngoài không thuộc hóa đơn.", 403);
            await d.requireCompany(db, p, row, "files");
            fileId = file.id;
            id = digest([
              row.company_id,
              kind,
              String(b.reference).trim(),
              invoiceBusinessDate(b.document_date),
              String(b.counterparty).trim(),
            ]);
            const snapshot = {
              label: String(b.reference).trim(),
              date: invoiceBusinessDate(b.document_date),
              counterparty: String(b.counterparty).trim(),
              amount:
                b.document_total == null ? null : String(b.document_total),
              currency: b.currency == null ? null : String(b.currency),
              external_reviewed: true,
              file_id: fileId,
            };
            source = {
              snapshot,
              revision: digest(snapshot),
              amount: snapshot.amount,
              currency: snapshot.currency,
              internal: false,
            };
          } else {
            source = await invoiceBusinessSource(db, p, row, type, id, true);
            if (source.revision !== b.source_revision)
              fail("Chứng từ đã đổi. Tải lại nguồn trước khi gắn.", 409);
          }
          if(type === "INVENTORY_DOCUMENT"){
            await d.requireCompany(db,p,row,"review");
            if(b.association_company_id !== row.company_id || !String(b.association_evidence ?? "").trim()) fail("Phiếu kho chưa có pháp nhân chuẩn. Cần xác nhận rõ doanh nghiệp và căn cứ liên hệ của chứng từ.",409);
            Object.assign(source.snapshot,{company_association:{company_id:row.company_id,evidence:String(b.association_evidence).trim(),confirmed_by:p.actor,reason}});
          }
          const allowedKinds: Record<string, string[]> = {
            CONTRACT: ["CONTRACT"],
            BUSINESS_TRANSACTION: ["COST", "OTHER"],
            PRODUCTION_SHIPMENT: ["DELIVERY", "OTHER"],
            INVENTORY_DOCUMENT: ["OTHER"],
            CONTRACT_DOCUMENT: ["DELIVERY", "OTHER"],
            EXTERNAL: [
              "CONTRACT",
              "COST",
              "APPENDIX",
              "DELIVERY",
              "ACCEPTANCE",
              "OTHER",
            ],
          };
          if (!allowedKinds[type]?.includes(kind))
            fail(
              "Loại hồ sơ không phù hợp bản chất nguồn; nghiệm thu/phụ lục ngoài cần tệp đã được người kiểm tra xác nhận.",
              409,
            );
          if (type === "CONTRACT" && (source.snapshot as Row).state === "draft")
            fail("Hợp đồng nháp chưa phải hồ sơ nghĩa vụ hiện hành.", 409);
          if (type === "PRODUCTION_SHIPMENT") {
            const shipment = (
              await db.query(
                "select order_id from local_production_shipments where id::text=$1",
                [id],
              )
            ).rows[0];
            const orderSource = (row.source_snapshot ?? {}) as Row;
            const linked = (
              await db.query(
                "select 1 from local_invoice_contract_allocations a join local_contracts c on c.id=a.contract_id where a.invoice_id=$1 and c.order_id=$2",
                [row.id, shipment.order_id],
              )
            ).rowCount;
            if (
              !linked &&
              !(
                orderSource.type === "ORDER" &&
                orderSource.source_id === shipment.order_id
              )
            )
              fail(
                "Lô giao không thuộc đơn hàng của hóa đơn/hợp đồng đang phân bổ.",
                409,
              );
          }
          if (axis === "FULFILMENT" && type !== "EXTERNAL")
            fail(
              "Nguồn này chưa có cơ sở giá trị giao nhận; chỉ liên kết bằng chứng. Dùng hồ sơ giao nhận ngoài đã kiểm tra giá trị nếu cần phân bổ.",
              409,
            );
          if (type === "CONTRACT" && axis !== "EVIDENCE")
            fail(
              "Phân bổ hợp đồng dùng mục Hợp đồng chuẩn; không tạo bản phân bổ thứ hai.",
              409,
            );
          if (
            axis === "OBLIGATION" &&
            type === "BUSINESS_TRANSACTION" &&
            row.direction !== "IN"
          )
            fail("Chứng từ chi phí chỉ làm nghĩa vụ đầu vào.");
          if (axis !== "EVIDENCE") {
            if (
              !source.amount ||
              !source.currency ||
              source.currency !== row.currency ||
              source.internal
            )
              fail(
                "Nguồn chưa có giá trị tiền xác minh cùng tiền tệ; chỉ gắn bằng chứng.",
                409,
              );
            const amount = invoiceMinor(b.amount, String(row.currency));
            const exact = invoiceDecimal(b.amount, 6),
              canonicalAmount = invoiceDecimal(
                invoiceAmount(amount, String(row.currency)),
                6,
              );
            if (exact.n * canonicalAmount.d !== canonicalAmount.n * exact.d)
              fail("Phân bổ phải đúng đơn vị nhỏ nhất của tiền tệ.");
            if (amount <= 0n) fail("Giá trị phân bổ phải dương.");
            await db.query(
              "select pg_advisory_xact_lock(hashtextextended('invoice-document:'||$1,0))",
              [type + ":" + id + ":" + axis],
            );
            const used = (
                await db.query(
                  "select coalesce(sum(amount),0)::text amount from local_invoice_business_links where source_type=$1 and source_id=$2 and axis=$3",
                  [type, id, axis],
                )
              ).rows[0].amount,
              invoiceUsed = (
                await db.query(
                  "select coalesce(sum(amount),0)::text amount from local_invoice_business_links where invoice_id=$1 and axis=$2",
                  [row.id, axis],
                )
              ).rows[0].amount,
              canonical =
                axis === "OBLIGATION"
                  ? (
                      await db.query(
                        "select coalesce(sum(amount),0)::text amount from local_invoice_contract_allocations where invoice_id=$1",
                        [row.id],
                      )
                    ).rows[0].amount
                  : "0";
            if (
              amount + invoiceMinor(used, String(row.currency)) >
                invoiceMinor(source.amount, String(row.currency)) ||
              amount +
                invoiceMinor(invoiceUsed, String(row.currency)) +
                invoiceMinor(canonical, String(row.currency)) >
                invoiceMinor(row.total_with_vat, String(row.currency))
            )
              fail("Phân bổ vượt nguồn/hóa đơn trong cùng trục.", 409);
          }
          const result = (
            await db.query(
              "insert into local_invoice_business_links(invoice_id,company_id,kind,source_type,source_id,source_revision,source_snapshot,verification_state,axis,amount,currency,file_id,reference,document_date,counterparty,reason,created_by)values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)returning id",
              [
                row.id,
                row.company_id,
                kind,
                type,
                id,
                source.revision,
                JSON.stringify(source.snapshot),
                source.internal
                  ? "INTERNAL_EDITABLE"
                  : type === "EXTERNAL"
                    ? "EXTERNAL_REVIEWED"
                    : "REVIEWED_ASSOCIATION",
                axis,
                axis === "EVIDENCE" ? null : b.amount,
                axis === "EVIDENCE" ? null : row.currency,
                fileId,
                source.snapshot.label,
                source.snapshot.date || null,
                source.snapshot.counterparty,
                reason,
                p.actor,
              ],
            )
          ).rows[0];
          await db.query(
            "update local_einvoices set revision=revision+1,review_state='needs_review',updated_at=now() where id=$1",
            [row.id],
          );
          await d.audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "LINK_BUSINESS_DOCUMENT",
            reason,
            { ...result, type, id, axis },
          );
          return result;
        }),
      ),
    ),
  );
  app.delete(
    base + "/business-links/:linkId",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await d.locked(db, p, String(req.params.id), "link");
          d.expected(row, req.body.expected_revision);
          const removed = (
            await db.query(
              "delete from local_invoice_business_links where id=$1 and invoice_id=$2 returning id",
              [req.params.linkId, row.id],
            )
          ).rows[0];
          if (!removed) fail("Không tìm thấy liên kết.", 404);
          await db.query(
            "update local_einvoices set revision=revision+1,review_state='needs_review',updated_at=now() where id=$1",
            [row.id],
          );
          await d.audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "REMOVE_BUSINESS_DOCUMENT",
            d.reason(req.body.reason),
            removed,
          );
          return { success: true };
        }),
      ),
    ),
  );
  app.post(
    base + "/business-attachments",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await d.locked(db, p, String(req.params.id), "files");
          d.expected(row, req.body.expected_revision);
          await d.requireCompany(db, p, row, "link");
          if (!row.company_id) fail("Cần gắn doanh nghiệp.");
          const b = req.body;
          if (
            typeof b.data_base64 !== "string" ||
            b.data_base64.length > 22 * 1024 * 1024
          )
            fail("Tệp quá giới hạn.");
          const bytes = Buffer.from(b.data_base64, "base64"),
            name = path.basename(String(b.name ?? "")).replace(/[\\/]/g, "_");
          if (!name || bytes.length > 15 * 1024 * 1024 || !bytes.length)
            fail("Tệp không hợp lệ.");
          let media = "application/octet-stream";
          if (/\.pdf$/i.test(name)) {
            if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
              fail("PDF không hợp lệ.");
            media = "application/pdf";
          } else if (/\.xml$/i.test(name)) {
            if (/<!DOCTYPE|<!ENTITY/i.test(bytes.toString("utf8")))
              fail("XML DTD/entity không được tiếp nhận.");
            media = "application/xml";
          } else if (!/\.(png|jpe?g|docx|xlsx)$/i.test(name))
            fail("Hồ sơ hỗ trợ PDF/XML/PNG/JPG/DOCX/XLSX.");
          const hash = digest(bytes),
            same = (
              await db.query(
                "select id,purpose from local_invoice_files where invoice_id=$1 and sha256=$2 and media_type=$3",
                [row.id, hash, media],
              )
            ).rows[0];
          if (same) {
            if (same.purpose !== "BUSINESS_ATTACHMENT")
              fail(
                "Tệp đã được lưu ở mục hóa đơn gốc; không đổi mục đích bằng bản sao.",
                409,
              );
            return same;
          }
          const id = randomUUID(),
            key = randomUUID();
          await mkdir(d.root, { recursive: true });
          await writeFile(path.join(d.root, key), bytes, {
            flag: "wx",
            mode: 0o600,
          });
          await db.query(
            "insert into local_invoice_files(id,company_id,invoice_id,storage_key,name,media_type,sha256,size_bytes,source,original,actor_id,purpose)values($1,$2,$3,$4,$5,$6,$7,$8,'USER_BUSINESS_ATTACHMENT',false,$9,'BUSINESS_ATTACHMENT')",
            [
              id,
              row.company_id,
              row.id,
              key,
              name,
              media,
              hash,
              bytes.length,
              p.actor,
            ],
          );
          await db.query(
            "update local_einvoices set revision=revision+1,updated_at=now() where id=$1",
            [row.id],
          );
          await d.audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "ADD_BUSINESS_ATTACHMENT",
            d.reason(b.reason),
            { id, sha256: hash },
          );
          return { id, sha256: hash };
        }),
      ),
    ),
  );
  const splitEditorState = async (db: PoolClient, p: ContractPrincipal, row: Row, allocationId: string) => {
    const allocation=(await db.query("select * from local_invoice_payment_allocations where id=$1 and invoice_id=$2 for update",[allocationId,row.id])).rows[0];
    if(!allocation || allocation.source_type!=="ORDER_PAYMENT" || allocation.currency!=="VND")fail("Không có khoản thu đơn hàng VND đã phân bổ phù hợp.",404);
    const persisted=(await db.query("select * from local_invoice_contract_payment_splits where payment_allocation_id=$1 order by contract_id",[allocation.id])).rows;
    if(persisted.length && !(await invoiceSourcePermission(db,p,"contracts")))fail("Không còn quyền đọc toàn bộ phần chia đã lưu.",403);
    const contracts=new Map<string,Row>();
    // Check EVERY old line before returning any DTO or accepting a replacement.
    for(const split of persisted){
      const contract=(await db.query("select * from local_contracts where id=$1",[split.contract_id])).rows[0];
      if(!contract)fail("Hợp đồng của phần chia đã lưu không còn tồn tại; cần đối soát.",409);
      requireContract(p,contract);
      if(contract.tenant_id!==row.tenant_id)fail("Không còn quyền nguồn của phần chia đã lưu.",403);
      contracts.set(String(contract.id),contract);
    }
    const payment=await invoiceCashSource(db,p,row,"ORDER_PAYMENT",String(allocation.source_id),true),currentRevision=digest(payment),issues:string[]=[];
    // Keep the canonical lock order: invoice/allocation, source payment/order, sorted contracts.
    for(const id of [...contracts.keys()].sort()){
      const current=(await db.query("select * from local_contracts where id=$1 for update",[id])).rows[0];
      if(!current)fail("Nguồn phần chia đã lưu không còn tồn tại.",409);
      requireContract(p,current);
      if(current.tenant_id!==row.tenant_id)fail("Không còn quyền nguồn của phần chia đã lưu.",403);
      contracts.set(id,current);
    }
    const allocationExact=invoiceDecimal(allocation.amount,6),allocationMinor=invoiceMinor(allocation.amount,"VND");
    if(allocationExact.n!==allocationMinor*allocationExact.d||allocationMinor<=0n)issues.push("Khoản phân bổ không còn là số nguyên đồng hợp lệ.");
    const invoiceUsed=(await db.query("select coalesce(sum(amount),0)::text amount from local_invoice_payment_allocations where invoice_id=$1",[row.id])).rows[0].amount;
    if(invoiceMinor(invoiceUsed,"VND")>invoiceMinor(row.total_with_vat,"VND"))issues.push("Tổng phân bổ tiền vượt hóa đơn hiện hành.");
    const linkedOrder=(await db.query("select 1 from local_invoice_contract_allocations a join local_contracts c on c.id=a.contract_id where a.invoice_id=$1 and c.order_id=$2 and c.tenant_id=$3 and c.manager_id=$4 and c.status<>'cancelled' limit 1",[row.id,payment.order_id,row.tenant_id,payment.manager_id])).rowCount;
    if(!linkedOrder)issues.push("Khoản thu chưa có hợp đồng hiện hành của đúng đơn hàng phân bổ vào hóa đơn.");
    if(allocation.source_revision!==currentRevision)issues.push("Nguồn thu/phân bổ đã đổi; đối soát khoản phân bổ trước.");
    const sourceUsed=(await db.query("select coalesce(sum(amount),0)::text amount from local_invoice_payment_allocations where source_type='ORDER_PAYMENT' and source_id=$1",[allocation.source_id])).rows[0].amount;
    if(invoiceMinor(sourceUsed,"VND")>invoiceMinor(payment.payment_amount,"VND"))issues.push("Phân bổ vượt phiếu thu hiện hành.");
    if(row.currency!=="VND"||row.direction!=="OUT"||row.is_draft)issues.push("Hóa đơn không còn phù hợp để chia khoản thu.");
    let sum=0n;
    const saved=[];
    for(const split of persisted){
      const contract=contracts.get(String(split.contract_id))!;
      const linked=(await db.query("select source_revision from local_invoice_contract_allocations where invoice_id=$1 and contract_id=$2",[row.id,contract.id])).rows[0];
      if(contract.manager_id!==payment.manager_id)fail("Không còn quyền nguồn của phần chia đã lưu.",403);
      if(contract.order_id!==payment.order_id||contract.status==="cancelled"||!linked||linked.source_revision!==digest(contract))issues.push("Hợp đồng đã lưu/đơn hàng hoặc phân bổ hóa đơn đã đổi; cần đối soát.");
      const exact=invoiceDecimal(split.amount,6),n=invoiceMinor(split.amount,"VND");
      if(exact.n!==n*exact.d||n<=0n||split.currency!=="VND"||split.source_revision!==currentRevision)issues.push("Phần chia đã lưu có số tiền/phiên bản cần đối soát.");
      const total=(await db.query("select coalesce(sum(amount),0)::text amount from local_invoice_contract_payment_splits where contract_id=$1",[contract.id])).rows[0].amount;
      if(invoiceMinor(total,"VND")>invoiceMinor(contract.total_amount,"VND"))issues.push("Phần chia đã lưu vượt giá trị hợp đồng.");
      sum+=n;saved.push({contract_id:String(contract.id),contract_number:String(contract.contract_number),amount:String(split.amount)});
    }
    if(sum>invoiceMinor(allocation.amount,"VND"))issues.push("Tổng phần chia đã lưu vượt khoản phân bổ.");
    return {allocation,payment,dto:{invoice_revision:String(row.revision),allocation_id:String(allocation.id),allocation_amount:String(allocation.amount),currency:"VND" as const,source_revision:currentRevision,splits:saved,total:invoiceAmount(sum,"VND"),remaining:invoiceAmount(invoiceMinor(allocation.amount,"VND")-sum,"VND"),editable:issues.length===0,stale:issues.length>0,reasons:[...new Set(issues)]}};
  };
  app.get(base+"/payments/:allocationId/contract-splits",handler(async(req,res)=>res.json(await tx(async db=>{
    const p=await principal(db),row=await d.load(db,p,String(req.params.id),"link",true);
    return (await splitEditorState(db,p,row,String(req.params.allocationId))).dto;
  }))));
  app.post(
    base + "/payments/:allocationId/contract-splits",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await d.locked(db, p, String(req.params.id), "link");
          const state=await splitEditorState(db,p,row,String(req.params.allocationId));
          d.expected(row, req.body.expected_revision);
          if(!state.dto.editable)fail(state.dto.reasons.join(" "),409);
          const a=state.allocation,payment=state.payment;
          if(req.body.source_revision!==state.dto.source_revision)fail("Nguồn thu đã đổi; tải lại danh sách chia.",409);
          if (!Array.isArray(req.body.splits) || req.body.splits.length > 50)
            fail("Danh sách chia không hợp lệ.");
          if(req.body.clear === true ? req.body.splits.length!==0 : req.body.splits.length===0)
            fail("Danh sách rỗng không được lưu. Dùng thao tác xóa toàn bộ có xác nhận.");
          if(req.body.clear===true && !state.dto.splits.length)fail("Khoản thu chưa có phần chia đã lưu để xóa.",409);
          if(req.body.splits.length && !(await invoiceSourcePermission(db,p,"contracts")))fail("Không có quyền hợp đồng.",403);
          const why=d.reason(req.body.reason);
          let sum = 0n;
          const seen = new Set<string>(),
            checked = [];
          for (const s of [...req.body.splits].sort((a, b) =>
            String(a.contract_id).localeCompare(String(b.contract_id)),
          )) {
            if (seen.has(s.contract_id)) fail("Hợp đồng trùng.");
            seen.add(s.contract_id);
            const c = (
              await db.query(
                "select * from local_contracts where id=$1 for update",
                [s.contract_id],
              )
            ).rows[0];
            if (
              !c ||
              c.order_id !== payment.order_id ||
              c.tenant_id !== row.tenant_id || c.status === "cancelled" || c.manager_id !== payment.manager_id
            )
              fail("Hợp đồng khác đơn hàng/đơn vị.", 403);
            requireContract(p, c);
            const linked=(await db.query("select source_revision from local_invoice_contract_allocations where invoice_id=$1 and contract_id=$2",[row.id,c.id])).rows[0];
            if(!linked || linked.source_revision!==digest(c))
              fail("Chỉ chia khoản thu cho hợp đồng đang được phân bổ vào hóa đơn.",409);
            const n = invoiceMinor(s.amount, "VND");
            const exact = invoiceDecimal(s.amount, 6);
            if (exact.n !== n * exact.d)
              fail("Phần chia VND phải nguyên đồng.");
            if (n <= 0n) fail("Phần chia phải dương.");
            sum += n;
            const other = (
              await db.query(
                "select coalesce(sum(amount),0)::text amount from local_invoice_contract_payment_splits where contract_id=$1 and payment_allocation_id<>$2",
                [c.id, a.id],
              )
            ).rows[0].amount;
            if (
              n + invoiceMinor(other, "VND") >
              invoiceMinor(c.total_amount, "VND")
            )
              fail(
                "Phần chia khoản thu vượt giá trị hợp đồng; cần đối soát tiền thừa.",
                409,
              );
            checked.push({ contract_id: c.id, amount: String(s.amount) });
          }
          if (sum > invoiceMinor(a.amount, "VND"))
            fail("Phần chia vượt khoản thu đã phân bổ.", 409);
          await db.query(
            "delete from local_invoice_contract_payment_splits where payment_allocation_id=$1",
            [a.id],
          );
          for (const s of checked)
            await db.query(
              "insert into local_invoice_contract_payment_splits(payment_allocation_id,contract_id,amount,currency,source_revision,reason,created_by)values($1,$2,$3,'VND',$4,$5,$6)",
              [
                a.id,
                s.contract_id,
                s.amount,
                digest(payment),
                d.reason(req.body.reason),
                p.actor,
              ],
            );
          await db.query(
            "update local_einvoices set revision=revision+1,updated_at=now() where id=$1",
            [row.id],
          );
          await d.audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            req.body.clear===true ? "CLEAR_CONTRACT_RECEIPT_SPLITS" : "SPLIT_CONTRACT_RECEIPT",
            why,
            {clear:req.body.clear===true,before:state.dto.splits,after:checked},
          );
          return { success: true };
        }),
      ),
    ),
  );
}
