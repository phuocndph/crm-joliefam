import {zcrmInvoiceBasis,zcrmInvoiceFragment} from './zcrm-invoice-basis.js';
import { invoiceFinancialProjection,invoiceSourceMatchesCanonical,invoiceSourceUnits,invoiceSourceAmount } from "./invoice-financial.js";
import type { Express, Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { registerInvoiceProviderRoutes } from "./invoice-provider-routes.js";
import { safeProviderObservationPayload, storedProviderDiagnostic } from "./invoice-provider-diagnostics.js";
import { providerMappedLines } from "./invoice-provider-decimal.js";
import { originalBindingTarget, originalInvoiceNumber, prepareOriginalBinding, type OriginalBindingContext, type OriginalBindingProof } from "./invoice-original-binding.js";
import { invoiceBusinessDate, invoiceToday } from "./invoice-date.js";
import { captureInvoiceEvidence, requireFinancialRelation } from "./invoice-evidence.js";
import { registerInvoiceDossierRoutes } from "./invoice-dossier-routes.js";
import {
  invoiceDossier,
  invoiceContractCash,
  invoiceBusinessSource,
  invoiceCashPermission,
  invoiceCashSource,
} from "./invoice-dossier.js";
import {
  contractPrincipal,
  canInvoice,
  requireContract,
  type ContractPrincipal,
} from "./contract-policy.js";
import {
  invoiceFail as fail,
  invoiceTax,
  invoiceMinor,
  invoiceAmount,
  calculateInvoiceLines,
  invoiceDecimal,
} from "./invoice-money.js";
import {
  digest,
  parseInvoiceFiles,
  type InvoiceInput,
} from "./invoice-import.js";
export type InvoiceDb = Pool | PoolClient;
type Row = Record<string, unknown>;
type Capability =
  "view" | "import" | "draft" | "link" | "review" | "configure" | "files";
const capabilities: Capability[] = [
  "view",
  "import",
  "draft",
  "link",
  "review",
  "configure",
  "files",
];
export async function requireInvoiceCompany(
  db: InvoiceDb,
  p: ContractPrincipal,
  row: Row,
  cap: Capability = "view",
) {
  if (!row.company_id) {
    if (!canInvoice(p, row, cap !== "view" && cap !== "files"))
      fail("Hóa đơn không thuộc phạm vi phụ trách.", 403);
    return;
  }
  const grant = (
    await db.query(
      "select 1 from local_invoice_grants g join local_invoice_companies c on c.id=g.company_id where g.company_id=$1 and g.user_id=$2 and g.capability=$3 and c.active",
      [row.company_id, p.actor, cap],
    )
  ).rowCount;
  if (
    !grant ||
    (row.source_owner_restricted &&
      !canInvoice(p, row, cap !== "view" && cap !== "files"))
  )
    fail("Chưa được cấp quyền doanh nghiệp/thao tác này.", 403);
}
const sourceRevision = (row: Row) => digest(row);
const semanticLines = (lines: Row[]) =>
  lines.map((line) =>
    Object.fromEntries(
      ["name", "unit", "quantity", "unit_price", "vat_rate"].map((key) => {
        let value = String(line[key] ?? "").trim();
        if (key === "vat_rate") value = value.replace("%", "");
        if (
          ["quantity", "unit_price", "vat_rate"].includes(key) &&
          /^-?\d+(?:\.\d{1,6})?$/.test(value) &&
          value.length <= 26
        ) {
          const decimal = invoiceDecimal(value, 6, true);
          let n = decimal.n,
            d = decimal.d;
          while (d > 1n && n % 10n === 0n) {
            n /= 10n;
            d /= 10n;
          }
          value = n.toString() + "/" + d.toString();
        }
        return [key, value];
      }),
    ),
  );
const string = (v: unknown) => String(v ?? "").trim();
const reason = (v: unknown) => {
  const s = string(v);
  if (!s || s.length > 2000) fail("Cần lý do từ 1 đến 2.000 ký tự.");
  return s;
};
const expected = (row: Row, value: unknown) => {
  if (typeof value !== "string" || !/^\d+$/.test(value))
    fail("Cần revision đã xem.");
  if (String(row.revision) !== value)
    fail("Hồ sơ đã đổi. Hãy mở lại trước khi lưu.", 409);
};
const companyLock = async (db: PoolClient, id: string) => {
  await db.query(
    "select pg_advisory_xact_lock(hashtextextended('invoice-company:'||$1,0))",
    [id],
  );
};
const audit = async (
  db: PoolClient,
  p: ContractPrincipal,
  company: string | null,
  id: string | null,
  action: string,
  why: string,
  snapshot: unknown = {},
) => {
  await db.query(
    "insert into local_invoice_audit(company_id,invoice_id,actor_id,action,reason,snapshot)values($1,$2,$3,$4,$5,$6::jsonb)",
    [company, id, p.actor, action, why, JSON.stringify(snapshot)],
  );
};
const safeInvoice = (row: Row): Row =>
  Object.fromEntries(
    [
      "id",
      "company_id",
      "manager_id",
      "tenant_id",
      "direction",
      "revision",
      "source_kind",
      "source_owner_restricted",
      "invoice_number",
      "template_code",
      "invoice_series",
      "issued_date",
      "created_at",
      "updated_at",
      "seller_name",
      "seller_tax_code",
      "seller_address",
      "buyer_name",
      "buyer_tax_code",
      "buyer_address",
      "currency",
      "total_amount",
      "vat_amount",
      "total_with_vat",
      "status",
      "is_draft",
      "review_state",
      "discrepancy",
      "internal_notes",
      "missing_xml",
      "contract_count",
    ].map((key) => [
      key,
      key === "revision"
        ? String(row.revision)
        : key === "issued_date"
          ? invoiceBusinessDate(row[key]) || null
          : row[key],
    ]),
  );
const direction = (
  tax: string,
  row: Pick<InvoiceInput, "seller_tax_code" | "buyer_tax_code">,
) =>
  row.seller_tax_code === tax && row.buyer_tax_code !== tax
    ? "OUT"
    : row.buyer_tax_code === tax && row.seller_tax_code !== tax
      ? "IN"
      : "UNASSIGNED";
const validDate = (v: unknown) => {
  const s = string(v);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    fail("Ngày phải đúng YYYY-MM-DD.");
  return s;
};
async function linesWrite(db: PoolClient, id: string, lines: Row[]) {
  await db.query("delete from local_invoice_lines where invoice_id=$1", [id]);
  for (const l of lines)
    await db.query(
      "insert into local_invoice_lines(invoice_id,line_no,name,quantity,unit,unit_price,vat_rate,subtotal,vat_amount,total,source_line)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        id,
        l.line_no,
        l.name,
        l.quantity,
        l.unit,
        l.unit_price,
        l.vat_rate,
        l.subtotal,
        l.vat_amount,
        l.total,
        l.source_line,
      ],
    );
}
export async function ingestInvoice(
  db: PoolClient,
  p: ContractPrincipal,
  company: Row,
  input: InvoiceInput,
  source: string,
  binding?: OriginalBindingContext,
) {
  const boundTarget = binding ? originalBindingTarget(binding, String(company.id), input) : null;
  if (!boundTarget && input.raw && typeof input.raw === "object" && (input.raw as Row).format === "VN_HDON_XML") {
    const existingXml = (await db.query("select i.template_code,i.invoice_series,i.invoice_number,i.seller_tax_code,o.source_identity,o.payload->'raw'->>'content_hash' xml_hash,o.payload->>'invoice_number' xml_number from local_invoice_observations o join local_einvoices i on i.id=o.invoice_id where o.company_id=$1 and o.payload->'raw'->>'format'='VN_HDON_XML' and (o.source_identity=$2 or o.payload->'raw'->>'content_hash'=$3 or (o.payload->>'seller_tax_code'=$4 and o.payload->>'template_code'=$5 and o.payload->>'invoice_series'=$6))", [company.id, input.source_identity, (input.raw as Row).content_hash, input.seller_tax_code, input.template_code, input.invoice_series])).rows;
    const number = originalInvoiceNumber(input.invoice_number);
    if (existingXml.some(row => (row.source_identity === input.source_identity || row.xml_hash === (input.raw as Row).content_hash || (number !== null && originalInvoiceNumber(row.xml_number) === number)) && (row.template_code !== input.template_code || row.invoice_series !== input.invoice_series || row.invoice_number !== input.invoice_number || row.seller_tax_code !== input.seller_tax_code)))
      fail("XML này đã được liên kết với hồ sơ có định danh nguồn khác. Mở hồ sơ đích và đối chiếu lại; không nhập độc lập thành hóa đơn mới.", 409);
  }
  const identity = input.source_identity;
  const observations = (
    await db.query(
      "select distinct invoice_id from local_invoice_observations where company_id=$1 and source=$2 and source_identity=$3",
      [company.id, source, identity],
    )
  ).rows;
  const natural = (
    await db.query(
      "select * from local_einvoices where company_id=$1 and seller_tax_code=$2 and coalesce(template_code,'')=$3 and coalesce(invoice_series,'')=$4 and invoice_number=$5 for update",
      [
        company.id,
        input.seller_tax_code,
        input.template_code,
        input.invoice_series,
        input.invoice_number,
      ],
    )
  ).rows[0];
  if (
    observations.length > 1 ||
    (observations[0] && natural && observations[0].invoice_id !== natural.id) ||
    (boundTarget && (source !== "VIETTEL_FILE" || (natural && natural.id !== boundTarget.id) || observations.some(row => row.invoice_id !== boundTarget.id)))
  )
    fail("Định danh nguồn xung đột; cần đối chiếu thủ công.", 409);
  let invoice =
    boundTarget ?? natural ??
    (observations[0]
      ? (
          await db.query(
            "select * from local_einvoices where id=$1 for update",
            [observations[0].invoice_id],
          )
        ).rows[0]
      : null);
  const hash = digest(input),
    duplicate = (
      await db.query(
        "select 1 from local_invoice_observations where company_id=$1 and source=$2 and source_identity=$3 and content_hash=$4",
        [company.id, source, identity, hash],
      )
    ).rowCount;
  if (duplicate) return { id: invoice.id, outcome: "existing" };
  const dir = direction(String(company.tax_code), input),
    issues = [...input.discrepancy];
  if (dir === "UNASSIGNED")
    issues.push("MST không xác định được một chiều cho doanh nghiệp.");
  if (invoice) {
    await requireInvoiceCompany(db, p, invoice, "import");
    const changes = [
      "currency",
      "status",
      "seller_tax_code",
      "buyer_tax_code",
      "seller_name",
      "buyer_name",
      "seller_address",
      "buyer_address",
      "invoice_number",
      "template_code",
      "invoice_series",
    ].filter(
      (k) =>
        !(boundTarget && (["invoice_number", "template_code"].includes(k) || (k === "status" && input.status === "unknown"))) && String(invoice[k] ?? "") !==
        String(input[k as keyof InvoiceInput] ?? ""),
    );
    for (const k of ["total_amount", "vat_amount", "total_with_vat"] as const) {
      const a = invoiceDecimal(invoice[k], 6, true),
        b = invoiceDecimal(input[k], 6, true);
      if (invoice.currency !== input.currency || a.n * b.d !== b.n * a.d)
        changes.push(k);
    }
    const previousSource = invoice.source_snapshot as InvoiceInput | undefined;
    const previousDate =
      previousSource?.issued_date ?? invoiceBusinessDate(invoice.issued_date);
    if (previousDate !== input.issued_date) changes.push("issued_date");
    if (
      previousSource?.lines?.length &&
      digest(semanticLines(previousSource.raw && typeof previousSource.raw === "object" && (previousSource.raw as Row).provider === "VIETTEL" ? providerMappedLines(previousSource.lines) : previousSource.lines)) !==
        digest(semanticLines(input.raw && typeof input.raw === "object" && (input.raw as Row).provider === "VIETTEL" ? providerMappedLines(input.lines) : input.lines))
    )
      changes.push("lines");
    if (changes.length)
      issues.push("Nguồn mới khác snapshot chuẩn: " + changes.join(", "));
    // Append evidence; never replace source financial snapshot, internal links or review on a no-conflict resync.
    if (issues.length)
      await db.query(
        "update local_einvoices set discrepancy=$2::jsonb,review_state='needs_review',revision=revision+1,updated_at=now() where id=$1",
        [
          invoice.id,
          JSON.stringify([
            ...new Set([
              ...(Array.isArray(invoice.discrepancy)
                ? invoice.discrepancy
                : []),
              ...issues,
            ]),
          ]),
        ],
      );
  } else {
    const id = randomUUID();
    invoice = (
      await db.query(
        `insert into local_einvoices(id,manager_id,tenant_id,company_id,direction,seller_tax_code,seller_name,seller_address,buyer_tax_code,buyer_name,buyer_address,invoice_number,template_code,invoice_series,issued_date,currency,status,is_draft,total_amount,vat_amount,total_with_vat,source_kind,source_snapshot,discrepancy,review_state,is_snapshot_record,local_modified_at)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24::jsonb,'needs_review',false,now())returning *`,
        [
          id,
          p.actor,
          company.tenant_id,
          company.id,
          dir,
          input.seller_tax_code,
          input.seller_name,
          input.seller_address,
          input.buyer_tax_code,
          input.buyer_name,
          input.buyer_address,
          input.invoice_number,
          input.template_code,
          input.invoice_series,
          input.issued_date,
          input.currency,
          input.status,
          input.status === "draft",
          input.total_amount,
          input.vat_amount,
          input.total_with_vat,
          source,
          JSON.stringify(input),
          JSON.stringify(issues),
        ],
      )
    ).rows[0];
    if (input.lines.length) {
      try {
        await linesWrite(
          db,
          id,
          calculateInvoiceLines(input.lines, input.currency, true).lines,
        );
      } catch {
        /* Retain original evidence and explicit discrepancy from normalization. */
      }
    }
  }
  const observation = await db.query(
    "insert into local_invoice_observations(company_id,invoice_id,source,source_identity,content_hash,payload,actor_id)values($1,$2,$3,$4,$5,$6::jsonb,$7)returning id",
    [
      company.id,
      invoice.id,
      source,
      identity,
      hash,
      JSON.stringify(input),
      p.actor,
    ],
  );
  await captureInvoiceEvidence(
    db,
    String(observation.rows[0].id),
    String(invoice.id),
    input,
  );
  await audit(
    db,
    p,
    String(company.id),
    String(invoice.id),
    "RECEIVE",
    source,
    { content_hash: hash, issues },
  );
  return {
    id: invoice.id,
    outcome: boundTarget || natural || observations.length ? "updated" : "new",
  };
}
export function registerInvoiceWorkspace(d: {
  app: Express;
  pool: Pool;
  actor: () => string;
  role: () => string;
  storageRoot: string;
  sendError: (res: Response, error: unknown) => unknown;
  simplePdf: (lines: string[]) => string;
}) {
  const { app, pool } = d,
    root = path.resolve(d.storageRoot, "invoice-originals");
  const principal = (db: InvoiceDb = pool) =>
    contractPrincipal(db, d.actor(), d.role());
  const handler =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        await fn(req, res);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          ["23505", "23514"].includes(String(error.code))
        )
          Object.assign(error, { status: 409 });
        d.sendError(res, error);
      }
    };
  const tx = async <T>(fn: (db: PoolClient) => Promise<T>) => {
    const db = await pool.connect();
    try {
      await db.query("begin");
      const result = await fn(db);
      await db.query("commit");
      return result;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  };
  const company = async (
    db: InvoiceDb,
    p: ContractPrincipal,
    id: string,
    cap: Capability,
  ) => {
    const c = (
      await db.query(
        "select * from local_invoice_companies where id=$1 and active",
        [id],
      )
    ).rows[0];
    if (!c) fail("Chọn doanh nghiệp đang hoạt động.", 404);
    await requireInvoiceCompany(db, p, { company_id: id }, cap);
    return c;
  };
  const load = async (
    db: InvoiceDb,
    p: ContractPrincipal,
    id: string,
    cap: Capability,
    lock = false,
  ) => {
    const row = (
      await db.query(
        `select * from local_einvoices where id=$1${lock ? " for update" : ""}`,
        [id],
      )
    ).rows[0];
    if (!row) fail("Không tìm thấy hóa đơn.", 404);
    await requireInvoiceCompany(db, p, row, cap);
    return row;
  };
  const locked = async (
    db: PoolClient,
    p: ContractPrincipal,
    id: string,
    cap: Capability,
  ) => {
    const first = await load(db, p, id, cap);
    await companyLock(
      db,
      String(first.company_id || "legacy:" + first.manager_id),
    );
    return load(db, p, id, cap, true);
  };
  const request = async (
    db: PoolClient,
    p: ContractPrincipal,
    c: string,
    key: unknown,
    body: unknown,
    fn: () => Promise<unknown>,
  ) => {
    if (typeof key !== "string" || key.length < 8 || key.length > 150)
      fail("Cần mã yêu cầu ổn định từ 8 đến 150 ký tự.");
    const hash = digest(body);
    const old = (
      await db.query(
        "select * from local_invoice_requests where company_id=$1 and actor_id=$2 and request_key=$3",
        [c, p.actor, key],
      )
    ).rows[0];
    if (old) {
      if (old.request_hash !== hash)
        fail("Mã yêu cầu đã dùng với nội dung khác.", 409);
      return { ...old.result, reused: true };
    }
    const result = await fn();
    await db.query(
      "insert into local_invoice_requests(company_id,actor_id,request_key,request_hash,result)values($1,$2,$3,$4,$5::jsonb)",
      [c, p.actor, key, hash, JSON.stringify(result)],
    );
    return result;
  };
  const filePath = (key: string) => {
    if (!/^[a-f0-9-]{36}$/.test(key)) fail("Mã tệp không hợp lệ.");
    return path.join(root, key);
  };
  registerInvoiceProviderRoutes({
    app,
    pool,
    principal,
    handler,
    tx,
    company,
    companyLock,
    request,
    audit,
    root,
  });
  registerInvoiceDossierRoutes({
    app,
    pool,
    root,
    principal,
    handler,
    tx,
    load,
    locked,
    audit,
    expected,
    reason,
    requireCompany: requireInvoiceCompany,
  });
  app.get(
    "/api/invoice-workspace/companies",
    handler(async (_req, res) => {
      const p = await principal();
      res.json(
        (
          await pool.query(
            "select c.*,array_agg(g.capability order by g.capability) capabilities from local_invoice_companies c join local_invoice_grants g on g.company_id=c.id and g.user_id=$1 where c.active group by c.id order by c.legal_name",
            [p.actor],
          )
        ).rows,
      );
    }),
  );
  app.post(
    "/api/invoice-workspace/companies",
    handler(async (req, res) => {
      const p = await principal();
      if (!["admin", "manager"].includes(p.role))
        fail("Chỉ quản trị/quản lý tạo phạm vi doanh nghiệp.", 403);
      const tax = invoiceTax(req.body.tax_code),
        name = string(req.body.legal_name);
      if (!/^\d{10}(\d{3})?$/.test(tax) || !name)
        fail("Cần MST hợp lệ và tên pháp nhân.");
      const result = await tx(async (db) => {
        const c = (
          await db.query(
            "insert into local_invoice_companies(tenant_id,tax_code,legal_name,address,created_by)values($1,$2,$3,$4,$5)returning *",
            [
              string(req.body.tenant_id) || "local-tenant",
              tax,
              name,
              string(req.body.address),
              p.actor,
            ],
          )
        ).rows[0];
        for (const cap of capabilities)
          await db.query(
            "insert into local_invoice_grants(company_id,user_id,capability,created_by)values($1,$2,$3,$2)",
            [c.id, p.actor, cap],
          );
        await audit(
          db,
          p,
          c.id,
          null,
          "CREATE_COMPANY",
          reason(req.body.reason),
          { tax_code: tax, name },
        );
        return c;
      });
      res.status(201).json(result);
    }),
  );
  app.get(
    "/api/invoice-workspace/companies/:id/grants",
    handler(async (req, res) => {
      const p = await principal();
      await company(pool, p, String(req.params.id), "configure");
      res.json(
        (
          await pool.query(
            "select user_id,capability from local_invoice_grants where company_id=$1 order by user_id,capability",
            [req.params.id],
          )
        ).rows,
      );
    }),
  );
  app.post(
    "/api/invoice-workspace/companies/:id/grants",
    handler(async (req, res) => {
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            id = String(req.params.id);
          await company(db, p, id, "configure");
          await companyLock(db, id);
          const user = string(req.body.user_id),
            caps = req.body.capabilities;
          if (
            !user ||
            !Array.isArray(caps) ||
            caps.some((c) => !capabilities.includes(c))
          )
            fail("Danh sách quyền không hợp lệ.");
          if (
            !(
              await db.query(
                "select 1 from local_user_profiles where user_id=$1 and is_active",
                [user],
              )
            ).rowCount
          )
            fail("Tài khoản không tồn tại.");
          if (user === p.actor && !caps.includes("configure"))
            fail("Không tự gỡ quyền cấu hình trong thao tác này.");
          await db.query(
            "delete from local_invoice_grants where company_id=$1 and user_id=$2",
            [id, user],
          );
          for (const cap of new Set(caps))
            await db.query(
              "insert into local_invoice_grants values($1,$2,$3,$4)",
              [id, user, cap, p.actor],
            );
          await audit(db, p, id, null, "GRANT", reason(req.body.reason), {
            user,
            caps,
          });
          return { success: true };
        }),
      );
    }),
  );
  const list = async (req: Request) => {
    const p = await principal(),
      id = string(req.query.company_id),
      legacy = id === "legacy";
    if (!legacy) await company(pool, p, id, "view");
    const values: unknown[] = [legacy ? null : id];
    const clauses = [legacy ? "i.company_id is null" : "i.company_id=$1"];
    if (legacy) {
      values.length = 0;
      const owner =
        p.role === "admin" ? null : p.role === "manager" ? p.actor : p.assigned;
      if (!owner && p.role !== "admin")
        fail("Không có phạm vi hóa đơn cũ.", 403);
      if (owner) {
        values.push(owner);
        clauses.push(`i.manager_id=$${values.length}`);
      }
    } else if (p.role !== "admin") {
      values.push(p.actor, p.assigned);
      clauses.push(
        `(not i.source_owner_restricted or i.manager_id=$${values.length - 1} or i.manager_id=$${values.length})`,
      );
    }
    const add = (sql: string, value: unknown) => {
      values.push(value);
      clauses.push(sql.replace("?", `$${values.length}`));
    };
    if (
      req.query.direction &&
      ["IN", "OUT"].includes(string(req.query.direction))
    )
      add("i.direction=?", req.query.direction);
    if (req.query.period && !req.query.from && !req.query.to) {
      if (!/^\d{4}-\d{2}$/.test(string(req.query.period)))
        fail("Kỳ không hợp lệ.");
      add(
        "to_char(coalesce(i.issued_date,i.created_at) at time zone 'Asia/Ho_Chi_Minh','YYYY-MM')=?",
        req.query.period,
      );
    }
    if (req.query.from)
      add(
        "coalesce(i.issued_date,i.created_at)>=?::timestamptz",
        validDate(req.query.from) + "T00:00:00+07:00",
      );
    if (req.query.to)
      add(
        "coalesce(i.issued_date,i.created_at)<(?::date+1)::timestamp at time zone 'Asia/Ho_Chi_Minh'",
        validDate(req.query.to),
      );
    if (
      req.query.from &&
      req.query.to &&
      string(req.query.from) > string(req.query.to)
    )
      fail("Khoảng ngày không hợp lệ.");
    if (req.query.search)
      add(
        "lower(concat_ws(' ',i.invoice_number,i.invoice_series,i.buyer_name,i.buyer_tax_code,i.seller_name,i.seller_tax_code)) like ?",
        "%" + string(req.query.search).toLowerCase() + "%",
      );
    if (req.query.status === "draft") clauses.push("i.is_draft");
    else if (req.query.status) add("i.review_state=?", req.query.status);
    if (req.query.source) add("i.source_kind=?", req.query.source);
    if (req.query.contract_id) {
      const contract = (
        await pool.query("select * from local_contracts where id=$1", [
          req.query.contract_id,
        ])
      ).rows[0];
      if (!contract) fail("Không tìm thấy hợp đồng thuộc phạm vi.", 404);
      requireContract(p, contract);
      add(
        "exists(select 1 from local_invoice_contract_allocations ca where ca.invoice_id=i.id and ca.contract_id=?)",
        req.query.contract_id,
      );
    }
    const missing =
      "not exists(select 1 from local_invoice_files f where f.invoice_id=i.id and f.original and f.purpose='INVOICE_ORIGINAL' and f.media_type='application/xml')";
    if (req.query.missing_file === "true") clauses.push(missing);
    const where = clauses.join(" and "),
      page = Math.max(1, Math.min(100000, Number(req.query.page) || 1)),
      limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
    const candidates = (
      await pool.query(
        `select i.*,${missing} missing_xml,(select count(*)::int from local_invoice_contract_allocations a where a.invoice_id=i.id) contract_count from local_einvoices i where ${where} order by coalesce(i.issued_date,i.created_at)desc,i.id limit 10001`,
        values,
      )
    ).rows;
    if (candidates.length > 10000)
      fail(
        "Phạm vi hơn 10.000 hóa đơn; chọn kỳ/khoảng ngày hẹp hơn để đối chiếu hồ sơ.",
        422,
      );
    const filtered: Row[] = [];
    for (let offset = 0; offset < candidates.length; offset += 20) {
      const batch = await Promise.all(
        candidates.slice(offset, offset + 20).map(async (row) => {
          const dossier = legacy
            ? {
                payment: {
                  state: "NONE",
                  allocated: "0",
                  remaining: String(row.total_with_vat),
                },
                missing_xml: row.missing_xml,
                missing_pdf: true,
                missing_business: true,
                checklist_unassessed: true,
                checklist_missing: false,
              }
            : await invoiceDossier(pool, p, row);
          return {
            ...safeInvoice(row),
            payment_state: dossier.payment.state,
            payment: dossier.payment,
            missing_pdf: dossier.missing_pdf,
            missing_business: dossier.missing_business,
            checklist_unassessed: dossier.checklist_unassessed,
            checklist_missing: dossier.checklist_missing,
            missing_xml: dossier.missing_xml,
          } as Row;
        }),
      );
      for (const row of batch) {
        if (req.query.unlinked === "true" && !row.missing_business) continue;
        if (req.query.missing_pdf === "true" && !row.missing_pdf) continue;
        if (req.query.missing_business === "true" && !row.missing_business)
          continue;
        if (req.query.checklist === "UNASSESSED" && !row.checklist_unassessed)
          continue;
        if (req.query.checklist === "MISSING" && !row.checklist_missing)
          continue;
        if (
          req.query.payment_state &&
          req.query.payment_state !== row.payment_state
        )
          continue;
        if (
          req.query.queue === "true" &&
          row.review_state === "reviewed" &&
          row.direction !== "UNASSIGNED" &&
          !(row.discrepancy as unknown[]).length &&
          !row.checklist_unassessed &&
          !row.checklist_missing &&
          row.payment_state !== "NEEDS_RECONCILIATION"
        )
          continue;
        filtered.push(row);
      }
    }
    const stats = {
      total: filtered.length,
      incoming: filtered.filter((r) => r.direction === "IN").length,
      outgoing: filtered.filter((r) => r.direction === "OUT").length,
      missing_files: filtered.filter((r) => r.missing_xml).length,
      unlinked: filtered.filter((r) => r.missing_business).length,
    };
    const rows = filtered.slice((page - 1) * limit, page * limit);
    return { rows, stats, page, limit };
  };
  app.get(
    "/api/invoice-workspace/invoices",
    handler(async (req, res) => res.json(await list(req))),
  );
  app.get(
    "/api/invoice-workspace/export",
    handler(async (req, res) => {
      const result = await list(req);
      const quote = (v: unknown) =>
        '"' +
        (/^[=+@-]/.test(String(v ?? "")) ? "'" : "") +
        String(v ?? "").replaceAll('"', '""') +
        '"';
      const headers = [
        "id",
        "direction",
        "invoice_number",
        "invoice_series",
        "issued_date",
        "seller_name",
        "buyer_name",
        "currency",
        "total_amount",
        "vat_amount",
        "total_with_vat",
        "review_state",
        "missing_xml",
        "missing_pdf",
        "missing_business",
        "checklist_unassessed",
        "checklist_missing",
        "payment_state",
        "payment",
        "discrepancy",
      ];
      res.json({
        page: result.page,
        limit: result.limit,
        total: result.stats.total,
        has_more: result.page * result.limit < result.stats.total,
        filename: "hoa-don-trang-" + result.page + ".csv",
        content:
          "\uFEFF" +
          [
            headers.join(","),
            ...result.rows.map((row) =>
              headers
                .map((k) =>
                  quote(
                    typeof row[k] === "object"
                      ? JSON.stringify(row[k])
                      : row[k],
                  ),
                )
                .join(","),
            ),
          ].join("\r\n"),
      });
    }),
  );
  app.get(
    "/api/invoice-workspace/invoices/:id",
    handler(async (req, res) => {
      const p = await principal(),
        row = await load(pool, p, String(req.params.id), "view");
      const id = row.id;
      let canFiles = true;
      try {
        await requireInvoiceCompany(pool, p, row, "files");
      } catch {
        canFiles = false;
      }
      const [
        lines,
        files,
        contracts,
        payments,
        documents,
        history,
        observations,
        relations,
      ] = await Promise.all(
        [
          "select * from local_invoice_lines where invoice_id=$1 order by line_no",
          "select id,name,media_type,sha256,size_bytes,source,original,purpose,received_at from local_invoice_files where invoice_id=$1",
          "select a.*,c.contract_number from local_invoice_contract_allocations a join local_contracts c on c.id=a.contract_id where a.invoice_id=$1",
          "select * from local_invoice_payment_allocations where invoice_id=$1",
          "select * from local_invoice_document_links where invoice_id=$1",
          "select * from local_invoice_audit where invoice_id=$1 order by created_at desc",
          "select id,source,content_hash,observed_at,payload from local_invoice_observations where invoice_id=$1 order by observed_at desc",
          "select * from local_invoice_relations where invoice_id=$1 or original_id=$1",
        ].map((sql) => pool.query(sql, [id])),
      );
      const dossier = await invoiceDossier(pool, p, row),
        visibleContracts = [];
      for (const a of contracts.rows) {
        try {
          await invoiceBusinessSource(pool, p, row, "CONTRACT", a.contract_id);
          visibleContracts.push(a);
        } catch {
          /* Source ACL before detail. */
        }
      }
      const visibleRelations = [];
      for (const relation of relations.rows) {
        try {
          await load(pool, p, String(relation.invoice_id), "view");
          await load(pool, p, String(relation.original_id), "view");
          visibleRelations.push(relation);
        } catch {
          /* Both sides visible. */
        }
      }
      res.json({
        invoice: safeInvoice(row),
        dossier,

        source_evidence: (
          await pool.query(
            "select e.* from local_invoice_source_evidence e where invoice_id=$1 order by observation_id,evidence_type,ordinal",
            [id],
          )
        ).rows,
        draft_source: row.source_kind === "CRM" ? row.source_snapshot : {},
        lines: lines.rows,
        files: canFiles ? files.rows : [],
        contracts: visibleContracts,
        payments: dossier.payment.denied ? [] : payments.rows,
        documents: documents.rows.map((r) => ({
          ...r,
          verification_state: "LEGACY_UNVERIFIED",
        })),
        history: history.rows.map(({ snapshot: _snapshot, reason: _reason, ...event }) => ({ ...event, reason: "Sự kiện đã lưu; chi tiết nguồn được kiểm tra theo quyền hiện tại." })),
        observations: observations.rows.map((observation) => ({ ...observation, payload: safeProviderObservationPayload(observation.payload) })),
        relations: visibleRelations,
      });
    }),
  );
  app.get(
    "/api/invoice-workspace/files/:id",
    handler(async (req, res) => {
      const p = await principal(),
        f = (
          await pool.query("select * from local_invoice_files where id=$1", [
            req.params.id,
          ])
        ).rows[0];
      if (!f) fail("Không tìm thấy tệp.", 404);
      await company(pool, p, f.company_id, "files");
      if (f.invoice_id) await load(pool, p, f.invoice_id, "files");
      const bytes = await readFile(filePath(f.storage_key));
      if (digest(bytes) !== f.sha256)
        fail("Checksum tệp không khớp; cần phục hồi bản lưu.", 409);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      );
      res.send(bytes);
    }),
  );
  app.get(
    "/api/invoice-workspace/unassigned-files",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, string(req.query.company_id), "files");
      res.json(
        (
          await pool.query(
            "select id,name,media_type,sha256,received_at from local_invoice_files where company_id=$1 and invoice_id is null order by received_at desc limit 100",
            [c.id],
          )
        ).rows,
      );
    }),
  );
  app.post(
    "/api/invoice-workspace/invoices/:id/attach-file",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await locked(db, p, String(req.params.id), "import");
          expected(row, req.body.expected_revision);
          const f = (
            await db.query("select * from local_invoice_files where id=$1", [
              req.body.file_id,
            ])
          ).rows[0];
          if (!f || f.company_id !== row.company_id || f.invoice_id)
            fail("Tệp chờ không thuộc doanh nghiệp.", 403);
          if (f.media_type === "application/xml")
            fail(
              "XML phải tiếp nhận qua parser và khớp định danh; không gắn thủ công.",
            );
          const why = reason(req.body.reason);
          const bytes = await readFile(filePath(f.storage_key));
          if (digest(bytes) !== f.sha256) fail("Checksum không khớp.", 409);
          const key = randomUUID(),
            id = randomUUID();
          await writeFile(filePath(key), bytes, { flag: "wx", mode: 0o600 });
          await db.query(
            "insert into local_invoice_files(id,company_id,invoice_id,storage_key,name,media_type,sha256,size_bytes,source,original,actor_id)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            [
              id,
              row.company_id,
              row.id,
              key,
              f.name,
              f.media_type,
              f.sha256,
              f.size_bytes,
              f.source,
              f.original,
              p.actor,
            ],
          );
          await audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "ATTACH_FILE_MANUAL",
            why,
            { file_id: id, unassigned_id: f.id, identity_verified: false },
          );
          await db.query(
            "update local_einvoices set revision=revision+1,updated_at=now() where id=$1",
            [row.id],
          );
          return { success: true };
        }),
      ),
    ),
  );
  app.get(
    "/api/invoice-workspace/users",
    handler(async (req, res) => {
      const p = await principal();
      await company(pool, p, string(req.query.company_id), "configure");
      res.json(
        (
          await pool.query(
            "select user_id,email,concat_ws(' ',last_name,first_name) name from local_user_profiles where is_active and ($1='' or lower(concat_ws(' ',email,last_name,first_name)) like '%'||$1||'%') order by email limit 100",
            [string(req.query.search).toLowerCase()],
          )
        ).rows,
      );
    }),
  );
  app.get(
    "/api/invoice-workspace/invoices/:id/payment-candidates",
    handler(async (req, res) => {
      const p = await principal(),
        row = await load(pool, p, String(req.params.id), "link");
      if (!(await invoiceCashPermission(pool,p,row.direction === "OUT" ? "ORDER_PAYMENT" : "TRANSACTION"))) fail("Không có quyền nguồn tiền.",403);
      if (row.currency !== "VND") return res.json([]);
      const owner =
        p.role === "admin" ? null : p.role === "manager" ? p.actor : p.assigned;
      if (!owner && p.role !== "admin") fail("Không có phạm vi tiền.", 403);
      const rows =
        row.direction === "OUT"
          ? (
              await pool.query(
                `select distinct p.id,p.payment_amount amount,p.payment_date date,coalesce(p.notes,'Phiếu thu đơn hàng') description,'ORDER_PAYMENT' source_type from local_order_payments p join local_orders o on o.id=p.order_id join local_contracts c on c.order_id=o.id join local_invoice_contract_allocations a on a.contract_id=c.id and a.invoice_id=$1 where o.tenant_id=$2 and ($3::text is null or o.manager_id=$3) and not exists(select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=p.id) order by p.payment_date desc limit 100`,
                [row.id, row.tenant_id, owner],
              )
            ).rows
          : (
              await pool.query(
                `select id,amount,date,description,'TRANSACTION' source_type from local_transactions p where type='expense' and coalesce(category,'')<>'order_payment' and order_id is null and tenant_id=$1 and ($2::text is null or manager_id=$2) and not exists(select 1 from local_projection_tombstones t where t.source_table='transactions' and t.source_key=p.id) order by date desc limit 100`,
                [row.tenant_id, owner],
              )
            ).rows;
      res.json(rows);
    }),
  );
  app.post(
    "/api/invoice-workspace/import/preview",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, string(req.body.company_id), "import");
      const key = string(req.body.request_key);
      if (key.length < 8 || key.length > 150) fail("Cần mã yêu cầu ổn định.");
      const why = reason(req.body.reason);
      const source = string(req.body.source) || "TAX_FILE";
      if (!["TAX_FILE", "VIETTEL_FILE", "USER_FILE"].includes(source))
        fail("Nguồn tệp không hợp lệ.");
      const parsed = await parseInvoiceFiles(req.body.files, req.body.mapping);
      const target = req.body.invoice_id
        ? await load(pool, p, string(req.body.invoice_id), "import")
        : null;
      if (target && target.company_id !== c.id)
        fail("Tệp và hóa đơn khác doanh nghiệp.", 403);
      if (!parsed.invoices.length && !target)
        fail(
          "PDF không tự tạo hóa đơn. Chọn hóa đơn để bổ sung tệp hoặc nhập kèm XML/danh sách.",
        );
      const hash = digest({
        source,
        files: parsed.files.map((f) => [f.name, f.sha256]),
        mapping: req.body.mapping,
        target: target?.id,
        reason: why,
      });
      const result = await tx(async (db) => {
        await companyLock(db, c.id);
        await company(db, p, c.id, "import");
        const prior = (
          await db.query(
            "select * from local_invoice_import_jobs where company_id=$1 and actor_id=$2 and request_key=$3",
            [c.id, p.actor, key],
          )
        ).rows[0];
        if (prior) {
          if (prior.request_hash !== hash)
            fail("Mã nhập đã dùng cho tệp/nội dung khác.", 409);
          if (prior.staged_payload.original_binding && target) await requireInvoiceCompany(db, p, await load(db, p, String(target.id), "import"), "files");
          return {
            job_id: prior.id,
            status: prior.status,
            preview: prior.staged_payload.invoices,
            binding: prior.staged_payload.original_binding ?? null,
            result: prior.result,
            reused: true,
          };
        }
        let originalBinding: OriginalBindingProof | null = null;
        if (target && source === "VIETTEL_FILE" && parsed.invoices.some(input => input.seller_tax_code !== target.seller_tax_code || input.invoice_number !== target.invoice_number || input.template_code !== String(target.template_code ?? "") || input.invoice_series !== String(target.invoice_series ?? ""))) {
          const currentTarget = await load(db, p, String(target.id), "import", true);
          await requireInvoiceCompany(db, p, currentTarget, "files");
          originalBinding = (await prepareOriginalBinding(db, String(c.id), currentTarget, parsed.invoices, parsed.files.map(file => ({ media_type: file.media_type, sha256: file.sha256 })), source)).proof;
        }
        await mkdir(root, { recursive: true });
        const staged = [];
        for (const f of parsed.files) {
          const storage_key = randomUUID(),
            id = randomUUID();
          await writeFile(filePath(storage_key), f.bytes, {
            flag: "wx",
            mode: 0o600,
          });
          staged.push({
            id,
            storage_key,
            name: f.name,
            media_type: f.media_type,
            sha256: f.sha256,
            size_bytes: f.bytes.length,
            source,
            original:
              f.media_type === "application/xml" ||
              f.media_type === "application/pdf",
          });
        }
        const payload = {
          invoices: parsed.invoices,
          files: staged,
          source,
          target_id: target?.id ?? null,
          target_revision: originalBinding?.target_revision ?? (target ? String(target.revision) : null),
          original_binding: originalBinding,
          reason: why,
        };
        const job = (
          await db.query(
            "insert into local_invoice_import_jobs(company_id,actor_id,request_key,request_hash,staged_payload,file_ids)values($1,$2,$3,$4,$5::jsonb,$6::jsonb)returning id",
            [
              c.id,
              p.actor,
              key,
              hash,
              JSON.stringify(payload),
              JSON.stringify(staged.map((f) => f.id)),
            ],
          )
        ).rows[0];
        await audit(db, p, c.id, null, "IMPORT_PREVIEW", why, {
          job_id: job.id,
          files: staged.map((f) => ({ name: f.name, sha256: f.sha256 })),
          count: parsed.invoices.length,
          original_binding: originalBinding,
        });
        return {
          job_id: job.id,
          status: "PREVIEW",
          preview: parsed.invoices.map((i) => ({
            ...i,
            direction: direction(c.tax_code, i),
          })),
          files: staged.map(({ storage_key: _, ...f }) => f),
          binding: originalBinding,
        };
      });
      res.json(result);
    }),
  );
  app.post(
    "/api/invoice-workspace/import/:id/commit",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db);
          const before = (
            await db.query(
              "select * from local_invoice_import_jobs where id=$1",
              [req.params.id],
            )
          ).rows[0];
          if (!before || before.actor_id !== p.actor)
            fail("Không tìm thấy bản xem trước.", 404);
          const c = await company(db, p, before.company_id, "import");
          await companyLock(db, c.id);
          const job = (
            await db.query(
              "select *,expires_at>now() fresh from local_invoice_import_jobs where id=$1 for update",
              [before.id],
            )
          ).rows[0];
          if (job.status === "COMMITTED") {
            if (job.staged_payload.original_binding) await requireInvoiceCompany(db, p, await load(db, p, String(job.staged_payload.target_id), "import"), "files");
            return { ...job.result, reused: true };
          }
          if (!job.fresh) fail("Bản xem trước hết hạn; tải lại tệp.", 409);
          const staged = job.staged_payload as {
            invoices: InvoiceInput[];
            files: Row[];
            source: string;
            target_id: string | null;
            target_revision: string | null;
            original_binding?: OriginalBindingProof | null;
            reason: string;
          };
          const target = staged.target_id
            ? await load(db, p, staged.target_id, "import", true)
            : null;
          if (target) expected(target, staged.target_revision);
          let binding: OriginalBindingContext | undefined;
          if (staged.original_binding) {
            if (!target || req.body.confirm_original_binding !== true) fail("Cần xác nhận XML gốc thuộc hồ sơ đích đã đối chiếu.", 422);
            await requireInvoiceCompany(db, p, target, "files");
            binding = await prepareOriginalBinding(db, String(c.id), target, staged.invoices, staged.files, staged.source);
            if (binding.proof.fingerprint !== staged.original_binding.fingerprint) fail("Bằng chứng nguồn đã đổi sau xem trước. Tải lại XML để đối chiếu.", 409);
          }
          if (
            target && !binding &&
            staged.invoices.some(
              (i) =>
                i.seller_tax_code !== target.seller_tax_code ||
                i.invoice_number !== target.invoice_number ||
                i.template_code !== String(target.template_code ?? "") ||
                i.invoice_series !== String(target.invoice_series ?? ""),
            )
          )
            fail(
              "XML/danh sách không khớp định danh hóa đơn đang bổ sung. Đối chiếu nguồn và hồ sơ đích; không nhập lại để bỏ qua chênh lệch định danh.",
              409,
            );
          const result = [];
          for (const input of [...staged.invoices].sort((a, b) =>
            a.source_identity.localeCompare(b.source_identity),
          ))
            result.push(await ingestInvoice(db, p, c, input, staged.source, binding));
          for (const f of staged.files) {
            const bytes = await readFile(filePath(String(f.storage_key)));
            if (digest(bytes) !== f.sha256)
              fail("Tệp staging thay đổi; nhập lại.", 409);
            const xml = staged.invoices.find(
              (i) => (i.raw as Row)?.content_hash === f.sha256,
            );
            const match = xml
              ? await db.query(
                  "select invoice_id from local_invoice_observations where company_id=$1 and source=$2 and source_identity=$3 limit 1",
                  [c.id, staged.source, xml.source_identity],
                )
              : null;
            const invoiceId =
              staged.target_id ??
              match?.rows[0]?.invoice_id ??
              (result.length === 1 ? result[0].id : null);
            const same = (
              await db.query(
                "select id from local_invoice_files where company_id=$1 and invoice_id is not distinct from $2 and sha256=$3 and media_type=$4",
                [c.id, invoiceId, f.sha256, f.media_type],
              )
            ).rowCount;
            if (same) continue;
            await db.query(
              "insert into local_invoice_files(id,company_id,invoice_id,storage_key,name,media_type,sha256,size_bytes,source,original,actor_id)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
              [
                f.id,
                c.id,
                invoiceId,
                f.storage_key,
                f.name,
                f.media_type,
                f.sha256,
                f.size_bytes,
                f.source,
                f.original,
                p.actor,
              ],
            );
          }
          const changedIds = [
            ...new Set([
              ...result.map((r) => r.id),
              ...(staged.target_id ? [staged.target_id] : []),
            ]),
          ];
          if (changedIds.length)
            await db.query(
              "update local_einvoices set revision=revision+1,updated_at=now() where id=any($1::text[])",
              [changedIds],
            );
          const receipt = {
            job_id: job.id,
            results: result,
            files: staged.files.length,
            ...(binding ? { original_binding: binding.proof } : {}),
          };
          if (binding) await audit(db, p, String(c.id), String(target!.id), "BIND_ORIGINAL_XML", staged.reason, { job_id: job.id, ...binding.proof });
          await db.query(
            "update local_invoice_import_jobs set status='COMMITTED',result=$2::jsonb where id=$1",
            [job.id, JSON.stringify(receipt)],
          );
          await audit(
            db,
            p,
            c.id,
            staged.target_id,
            "IMPORT_COMMIT",
            staged.reason,
            receipt,
          );
          return receipt;
        }),
      ),
    ),
  );

  const draftSource = async (
    db: InvoiceDb,
    p: ContractPrincipal,
    type: string,
    id: string,
    lock = false,
  ) => {
    if (!["CONTRACT", "ORDER"].includes(type))
      fail("Nguồn nháp cần là hợp đồng hoặc đơn hàng.");
    const table = type === "CONTRACT" ? "local_contracts" : "local_orders";
    const row = (
      await db.query(
        `select * from ${table} where id=$1${lock ? " for update" : ""}`,
        [id],
      )
    ).rows[0];
    if (!row) fail("Không tìm thấy nguồn nháp.", 404);
    requireContract(p, row);
    if (type === "CONTRACT" && row.status === "cancelled")
      fail("Không lập từ hợp đồng đã hủy.");
    return { row, revision: sourceRevision(row) };
  };
  // Order and linked contracts are aliases for the same obligation. Until source
  // line mapping is verified, choose the contract path and reject competing aliases.
  const sourceAliasGuard = async (
    db: InvoiceDb,
    type: string,
    row: Row,
    exclude = "",
  ) => {
    if (type === "ORDER") {
      if (
        (
          await db.query(
            "select 1 from local_contracts where order_id=$1 limit 1",
            [row.id],
          )
        ).rowCount
      )
        fail(
          "Đơn hàng đã có hợp đồng liên kết. Hãy chọn nguồn hợp đồng để giữ chỗ một lần cho cùng nghĩa vụ.",
          409,
        );
    } else if (row.order_id) {
      if (
        (
          await db.query(
            "select 1 from local_einvoices i where i.id<>$1 and i.status not in ('cancelled','replaced') and ((i.source_snapshot->>'type'='ORDER' and i.source_snapshot->>'source_id'=$2) or (i.source_snapshot->>'type'='CONTRACT' and i.source_snapshot->>'source_id'<>$3 and exists(select 1 from local_contracts c where c.id=i.source_snapshot->>'source_id' and c.order_id=$2))) limit 1",
            [exclude, row.order_id, row.id],
          )
        ).rowCount
      )
        fail(
          "Đơn hàng/hợp đồng khác cùng nguồn đã giữ chỗ hoặc có hóa đơn. Hủy nháp cạnh tranh hoặc đối chiếu ánh xạ dòng trước khi lập thêm.",
          409,
        );
    }
  };
  app.get(
    "/api/invoice-workspace/sources",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, string(req.query.company_id), "draft"),
        type = string(req.query.type) || "CONTRACT";
      if (!["CONTRACT", "ORDER"].includes(type))
        fail("Loại nguồn không hợp lệ.");
      const table = type === "CONTRACT" ? "local_contracts" : "local_orders";
      const owner =
        p.role === "admin" ? null : p.role === "manager" ? p.actor : p.assigned;
      if (!owner && p.role !== "admin") fail("Không có phạm vi chứng từ.", 403);
      const rows = (
        await pool.query(
          `select * from ${table} where ($1::text is null or manager_id=$1) and tenant_id=$2 order by created_at desc limit 100`,
          [owner, c.tenant_id],
        )
      ).rows;
      res.json(
        rows.map((row) => ({
          id: row.id,
          label: type === "CONTRACT" ? row.contract_number : row.order_number,
          total_amount: row.total_amount,
        })),
      );
    }),
  );
  app.get(
    "/api/invoice-workspace/sources/:type/:id",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, string(req.query.company_id), "draft"),
        source = await draftSource(
          pool,
          p,
          String(req.params.type),
          String(req.params.id),
        );
      if (source.row.tenant_id !== c.tenant_id)
        fail("Nguồn khác đơn vị dữ liệu.", 403);
      await sourceAliasGuard(
        pool,
        String(req.params.type),
        source.row,
        string(req.query.exclude_invoice_id),
      );
      const basis=req.params.type==='ORDER'?zcrmInvoiceBasis(source.row):null;
      const items = basis?.lines??(Array.isArray(source.row.items) ? source.row.items : []);
      const used = (await pool.query(
        "select l.source_line,sum(l.quantity)::text quantity,sum(l.subtotal)::text subtotal,sum(l.vat_amount)::text vat_amount from local_invoice_lines l join local_einvoices i on i.id=l.invoice_id where i.id<>$1 and i.source_snapshot->>'source_id'=$2 and i.source_snapshot->>'type'=$3 and i.status not in ('cancelled','replaced') group by l.source_line",
        [string(req.query.exclude_invoice_id),source.row.id,req.params.type],
      )).rows;
      const remainingLines = items.map((item:Row,index:number)=>{
        const key=basis?String(item.source_line):String(index),consumed=used.find(u=>u.source_line===key)??{};
        const remaining=invoiceSourceUnits(item.quantity)-invoiceSourceUnits(consumed.quantity??0);
        if(basis&&remaining<=0n)return null;
        if(basis)return zcrmInvoiceFragment(item as NonNullable<typeof basis>['lines'][number],invoiceSourceAmount(remaining),consumed);
        return {...item,source_line:key,quantity:invoiceSourceAmount(remaining>0n?remaining:0n),unit_price:item.price??item.unit_price,vat_rate:source.row.include_vat===false?'0':source.row.vat_rate??'0'};
      }).filter(Boolean);
      res.json({
        id: source.row.id,
        type: req.params.type,
        revision: source.revision,
        buyer: source.row.buyer_info ?? {},
        lines: remainingLines,
        total_amount: source.row.total_amount,
        warning:
          "Chỉ lấy dòng/phần còn lại đã chọn; snapshot nguồn được kiểm tra lại khi lưu.",
      });
    }),
  );
  const saveDraft = async (
    db: PoolClient,
    p: ContractPrincipal,
    c: Row,
    body: Row,
    id?: string,
  ) => {
    const old = id ? await load(db, p, id, "draft", true) : null;
    if (old) {
      expected(old, body.expected_revision);
      if (old.source_kind !== "CRM" || !old.is_draft || old.status !== "draft")
        fail("Chỉ sửa nháp CRM chưa gửi nguồn.", 409);
      if (
        (
          await db.query(
            "select 1 from local_invoice_payment_allocations where invoice_id=$1",
            [id],
          )
        ).rowCount
      )
        fail("Nháp đang có phân bổ tiền; đối chiếu trước khi sửa.", 409);
      if (
        (
          await db.query(
            "select 1 from local_invoice_business_links where invoice_id=$1 and axis<>'EVIDENCE'",
            [id],
          )
        ).rowCount
      )
        fail(
          "Nháp đang có phân bổ chứng từ; bỏ phân bổ và đối chiếu trước khi sửa.",
          409,
        );
    }
    const why = reason(body.reason),
      currency = string(body.currency) || "VND";
    let buyer = (
      body.buyer && typeof body.buyer === "object" ? body.buyer : {}
    ) as Row;
    let rawLines = body.lines as Row[],
      snapshot: Row = { type: "STANDALONE", reason: why };
    let contract: Row | null = null;
    if (body.source_type && body.source_id) {
      const source = await draftSource(
        db,
        p,
        string(body.source_type),
        string(body.source_id),
        true,
      );
      if (source.revision !== body.source_revision)
        fail("Nguồn đã đổi. Hãy tải lại và chọn dòng.", 409);
      if (source.row.tenant_id !== c.tenant_id) fail("Nguồn khác đơn vị.", 403);
      const obligation =
        body.source_type === "ORDER"
          ? "ORDER:" + source.row.id
          : source.row.order_id
            ? "ORDER:" + source.row.order_id
            : "CONTRACT:" + source.row.id;
      await db.query(
        "select pg_advisory_xact_lock(hashtextextended('invoice-obligation:'||$1,0))",
        [obligation],
      );
      await sourceAliasGuard(
        db,
        string(body.source_type),
        source.row,
        id ?? "",
      );
      if (body.source_type === "CONTRACT") contract = source.row;
      const sourceBuyer = (source.row.buyer_info ?? {}) as Row;
      if (body.source_type === "CONTRACT") {
        const requested = { ...sourceBuyer, ...buyer };
        const legalName = (v: Row) =>
          string(v.company_name ?? v.name)
            .normalize("NFC")
            .replace(/\s+/g, " ")
            .toLocaleUpperCase("vi");
        if (
          invoiceTax(requested.tax_code) !== invoiceTax(sourceBuyer.tax_code) ||
          legalName(requested) !== legalName(sourceBuyer)
        )
          fail(
            "Người mua/MST nháp phải khớp hợp đồng nguồn. Cập nhật hợp đồng và tải lại nguồn trước khi đổi pháp nhân.",
            409,
          );
      }
      buyer = { ...sourceBuyer, ...buyer };
      const basis=body.source_type==='ORDER'?zcrmInvoiceBasis(source.row):null;
      if(basis){
        if(currency!=='VND')fail('Đơn ZCRM phải lập hóa đơn VND.');
        if(!Array.isArray(rawLines)||!rawLines.length)fail('Chọn dòng nguồn.');
        const used=(await db.query("select l.source_line,sum(l.quantity)::text quantity,sum(l.subtotal)::text subtotal,sum(l.vat_amount)::text vat_amount from local_invoice_lines l join local_einvoices i on i.id=l.invoice_id where i.id<>$1 and i.source_snapshot->>'source_id'=$2 and i.source_snapshot->>'type'='ORDER' and i.status not in ('cancelled','replaced') group by l.source_line",[id??'',body.source_id])).rows;
        const seen=new Set<string>();
        rawLines=rawLines.map(line=>{
          const key=String(line.source_line),item=basis.lines.find(l=>l.source_line===key);
          if(!item||seen.has(key))return fail('Dòng nguồn trùng hoặc không hợp lệ.');seen.add(key);
          return zcrmInvoiceFragment(item,line.quantity,used.find(u=>u.source_line===key));
        });
      }else{
      const items = Array.isArray(source.row.items) ? source.row.items : [];
      if (!Array.isArray(rawLines)) fail("Chọn dòng nguồn.");
      const seen = new Set<string>();
      rawLines = rawLines.map((line) => {
        const index = Number(line.source_line);
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= items.length ||
          seen.has(String(index))
        )
          fail("Dòng nguồn trùng hoặc không hợp lệ.");
        seen.add(String(index));
        const item = items[index];
        return {
          name: item.name,
          unit: item.unit ?? "",
          unit_price: item.price ?? item.unit_price,
          vat_rate:
            source.row.include_vat === false
              ? "0"
              : (source.row.vat_rate ?? "0"),
          quantity: line.quantity,
          source_line: String(index),
        };
      });
      for (const line of rawLines) {
        const cap = String(items[Number(line.source_line)].quantity);
        const used = (
          await db.query(
            `select coalesce(sum(l.quantity),0)::text used from local_invoice_lines l join local_einvoices i on i.id=l.invoice_id where i.id<>$1 and i.source_snapshot->>'source_id'=$2 and i.source_snapshot->>'type'=$3 and l.source_line=$4 and i.status not in ('cancelled','replaced')`,
            [id ?? "", body.source_id, body.source_type, line.source_line],
          )
        ).rows[0].used;
        const q = invoiceDecimal(line.quantity),
          capacity = invoiceDecimal(cap),
          consumed = invoiceDecimal(used);
        if (
          q.n <= 0n ||
          q.n * capacity.d * consumed.d + consumed.n * q.d * capacity.d >
            capacity.n * q.d * consumed.d
        )
          fail("Số lượng đã được giữ chỗ/lập hóa đơn vượt phần còn lại.", 409);
      }
      }
      snapshot = {
        type: body.source_type,
        source_id: body.source_id,
        source_revision: source.revision,
        ...(basis?{invoice_basis:basis}:{}),
        source_number: source.row.contract_number ?? source.row.order_number,
        buyer,
        reason: why,
      };
    } else if (!string(body.business_reference))
      fail("Nháp độc lập cần mã/tham chiếu nghiệp vụ và lý do.");
    const calc = calculateInvoiceLines(rawLines, currency);
    if (!string(buyer.company_name ?? buyer.name)) fail("Cần tên người mua.");
    const buyerTax = invoiceTax(buyer.tax_code);
    if (buyerTax === c.tax_code)
      fail("MST hai bên trùng; cần kiểm tra trước khi tạo nháp.");
    const invoiceId = id ?? randomUUID();
    const invoiceDay = body.invoice_date
      ? validDate(body.invoice_date)
      : (old ? invoiceBusinessDate(old.issued_date) : "") || invoiceToday();
    const issuedAt =
      old && invoiceBusinessDate(old.issued_date) === invoiceDay
        ? old.issued_date
        : invoiceDay + "T00:00:00+07:00";
    const fields = [
      c.id,
      c.tenant_id,
      p.actor,
      c.tax_code,
      c.legal_name,
      c.address,
      string(buyer.company_name ?? buyer.name),
      buyerTax,
      string(buyer.address),
      currency,
      calc.subtotal,
      calc.vat_amount,
      calc.total,
      JSON.stringify({
        ...snapshot,
        business_reference: body.business_reference ?? null,
      }),
      string(body.notes),
      issuedAt,
    ];
    if (old)
      await db.query(
        `update local_einvoices set seller_tax_code=$2,seller_name=$3,seller_address=$4,buyer_name=$5,buyer_tax_code=$6,buyer_address=$7,currency=$8,total_amount=$9,vat_amount=$10,total_with_vat=$11,source_snapshot=$12::jsonb,internal_notes=$13,issued_date=$14,review_state='needs_review',revision=revision+1,updated_at=now(),local_modified_at=now(),contract_id=null where id=$15 and company_id=$1`,
        [fields[0], ...fields.slice(3), invoiceId],
      );
    else
      await db.query(
        `insert into local_einvoices(company_id,tenant_id,manager_id,seller_tax_code,seller_name,seller_address,buyer_name,buyer_tax_code,buyer_address,currency,total_amount,vat_amount,total_with_vat,source_snapshot,internal_notes,issued_date,id,source_kind,direction,status,is_draft,invoice_action,is_snapshot_record,local_modified_at)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,'CRM','OUT','draft',true,'local_draft',false,now())`,
        [...fields, invoiceId],
      );
    await linesWrite(db, invoiceId, calc.lines);
    await db.query(
      "delete from local_invoice_contract_allocations where invoice_id=$1",
      [invoiceId],
    );
    if (contract) {
      if (currency !== "VND")
        fail("Hợp đồng hiện tại chỉ xác minh năng lực VND.");
      const used = (
        await db.query(
          "select coalesce(sum(amount),0)::text used from local_invoice_contract_allocations where contract_id=$1",
          [contract.id],
        )
      ).rows[0].used;
      if (
        invoiceMinor(used, currency) + invoiceMinor(calc.total, currency) >
        invoiceMinor(contract.total_amount, currency)
      )
        fail("Giá trị nháp vượt phần hợp đồng còn lại.", 409);
      await db.query(
        "insert into local_invoice_contract_allocations(invoice_id,company_id,contract_id,amount,currency,reservation,source_revision,reason,created_by)values($1,$2,$3,$4,$5,true,$6,$7,$8)",
        [
          invoiceId,
          c.id,
          contract.id,
          calc.total,
          currency,
          sourceRevision(contract),
          why,
          p.actor,
        ],
      );
      await db.query("update local_einvoices set contract_id=$2 where id=$1", [
        invoiceId,
        contract.id,
      ]);
    }
    await audit(
      db,
      p,
      String(c.id),
      invoiceId,
      old ? "EDIT_DRAFT" : "CREATE_DRAFT",
      why,
      { calc, source: snapshot },
    );
    return {
      invoice: safeInvoice(
        (
          await db.query("select * from local_einvoices where id=$1", [
            invoiceId,
          ])
        ).rows[0],
      ),
    };
  };
  app.post(
    "/api/invoice-workspace/drafts",
    handler(async (req, res) => {
      res.status(201).json(
        await tx(async (db) => {
          const p = await principal(db),
            c = await company(db, p, string(req.body.company_id), "draft");
          await companyLock(db, c.id);
          return request(
            db,
            p,
            c.id,
            req.body.request_key,
            { operation: "CREATE_DRAFT", body: req.body },
            () => saveDraft(db, p, c, req.body),
          );
        }),
      );
    }),
  );
  app.patch(
    "/api/invoice-workspace/drafts/:id",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await locked(db, p, String(req.params.id), "draft");
          if (!row.company_id)
            fail("Gắn doanh nghiệp có bằng chứng trước khi sửa nháp cũ.", 409);
          const c = await company(db, p, String(row.company_id), "draft");
          return request(
            db,
            p,
            c.id,
            req.body.request_key,
            { operation: "PATCH_DRAFT", invoice_id: row.id, body: req.body },
            () => saveDraft(db, p, c, req.body, String(row.id)),
          );
        }),
      ),
    ),
  );
  app.post(
    "/api/invoice-workspace/invoices/:id/review",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await locked(db, p, String(req.params.id), "review");
          expected(row, req.body.expected_revision);
          if (!row.company_id || row.direction === "UNASSIGNED")
            fail("Cần xác định doanh nghiệp và chiều hóa đơn.");
          const why = reason(req.body.reason);
          if (!["reviewed", "needs_review"].includes(req.body.state))
            fail("Trạng thái kiểm tra không hợp lệ.");
          if (
            req.body.state === "reviewed" &&
            Array.isArray(row.discrepancy) &&
            row.discrepancy.length &&
            !req.body.acknowledge_discrepancy
          )
            fail("Cần xác nhận rõ các chênh lệch; không tự sửa tiền nguồn.");
          await db.query(
            "update local_einvoices set review_state=$2,revision=revision+1,updated_at=now() where id=$1",
            [row.id, req.body.state],
          );
          await audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "REVIEW",
            why,
            { state: req.body.state, discrepancy: row.discrepancy },
          );
          return { success: true };
        }),
      ),
    ),
  );
  app.post(
    "/api/invoice-workspace/invoices/:id/notes",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await locked(db, p, String(req.params.id), "link");
          expected(row, req.body.expected_revision);
          const why = reason(req.body.reason);
          await db.query(
            "update local_einvoices set internal_notes=$2,revision=revision+1,updated_at=now() where id=$1",
            [row.id, string(req.body.notes)],
          );
          await audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "NOTES",
            why,
            { notes: req.body.notes },
          );
          return { success: true };
        }),
      ),
    ),
  );
  app.post(
    "/api/invoice-workspace/invoices/:id/issue",
    handler(async (req, _res) => {
      await load(pool, await principal(), String(req.params.id), "draft");
      fail("ISSUANCE_DISABLED: CRM không ký/phát hành hóa đơn.", 409);
    }),
  );
  app.post(
    "/api/invoice-workspace/invoices/:id/provider-draft",
    handler(async (req, _res) => {
      await load(pool, await principal(), String(req.params.id), "draft");
      fail(
        "API_CONTRACT_NOT_VERIFIED: Chưa xác minh API ghi nháp Viettel.",
        409,
      );
    }),
  );
  app.post(
    "/api/invoice-workspace/invoices/:id/preview",
    handler(async (req, res) => {
      const row = await load(
        pool,
        await principal(),
        String(req.params.id),
        "view",
      );
      res.json({
        internal_only: true,
        original: false,
        filename: "ban-xem-noi-bo-" + row.id + ".pdf",
        base64: d.simplePdf([
          "CRM - BAN XEM NOI BO / KHONG PHAI CHUNG TU GOC",
          String(row.invoice_number ?? row.id),
          String(row.seller_name ?? ""),
          String(row.buyer_name ?? ""),
          String(row.total_with_vat) + " " + String(row.currency),
          "Khong xac nhan phat hanh hoac tinh hop le thue.",
        ]),
      });
    }),
  );
  app.delete(
    "/api/invoice-workspace/drafts/:id",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await locked(db, p, String(req.params.id), "draft");
          expected(row, req.body.expected_revision);
          if (row.source_kind !== "CRM" || !row.is_draft)
            fail("Chỉ hủy nháp CRM.", 409);
          if (
            (
              await db.query(
                "select 1 from local_invoice_payment_allocations where invoice_id=$1 union all select 1 from local_invoice_business_links where invoice_id=$1 and axis<>'EVIDENCE' limit 1",
                [row.id],
              )
            ).rowCount
          )
            fail(
              "Bỏ phân bổ tiền/chứng từ và đối chiếu trước khi hủy nháp.",
              409,
            );
          const why = reason(req.body.reason);
          await db.query(
            "delete from local_invoice_contract_allocations where invoice_id=$1",
            [row.id],
          );
          await db.query(
            "update local_einvoices set status='cancelled',review_state='needs_review',revision=revision+1,updated_at=now(),local_modified_at=now() where id=$1",
            [row.id],
          );
          await audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "CANCEL_DRAFT",
            why,
          );
          return { success: true };
        }),
      ),
    ),
  );
  const contractCapacity = async (
    db: PoolClient,
    p: ContractPrincipal,
    row: Row,
    id: string,
    amount: string,
  ) => {
    if (row.direction !== "OUT" || row.currency !== "VND")
      fail(
        "Chỉ phân bổ hợp đồng bán hiện tại cho đầu ra VND. Đầu vào dùng hồ sơ chi phí có lý do.",
      );
    const c = (
      await db.query("select * from local_contracts where id=$1 for update", [
        id,
      ])
    ).rows[0];
    if (!c) fail("Không tìm thấy hợp đồng.", 404);
    requireContract(p, c);
    if (c.tenant_id !== row.tenant_id) fail("Hợp đồng khác đơn vị.", 403);
    if (c.status === "cancelled") fail("Hợp đồng đã hủy.");
    const buyer = (c.buyer_info ?? {}) as Row;
    const tax = invoiceTax(buyer.tax_code);
    if (tax && row.buyer_tax_code && tax !== row.buyer_tax_code)
      fail("MST người mua khác hợp đồng.");
    const used = (
      await db.query(
        "select coalesce(sum(amount),0)::text used from local_invoice_contract_allocations where contract_id=$1 and invoice_id<>$2",
        [id, row.id],
      )
    ).rows[0].used;
    if (
      invoiceMinor(used, "VND") + invoiceMinor(amount, "VND") >
      invoiceMinor(c.total_amount, "VND")
    )
      fail("Phân bổ/giữ chỗ vượt giá trị hợp đồng.", 409);
    return c;
  };
  app.post(
    "/api/invoice-workspace/invoices/:id/contracts",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await locked(db, p, String(req.params.id), "link");
          expected(row, req.body.expected_revision);
          if (!row.company_id) fail("Cần gắn doanh nghiệp trước.");
          const why = reason(req.body.reason);
          const allocations = req.body.allocations;
          if (!Array.isArray(allocations) || allocations.length > 50)
            fail("Danh sách phân bổ không hợp lệ.");
          let sum = 0n;
          const checked = [];
          const seen = new Set();
          for (const a of [...allocations].sort((a, b) =>
            string(a.contract_id).localeCompare(string(b.contract_id)),
          )) {
            const amount = invoiceAmount(
              invoiceMinor(a.amount, String(row.currency)),
              String(row.currency),
            );
            if (
              invoiceMinor(amount, String(row.currency)) <= 0n ||
              seen.has(a.contract_id)
            )
              fail("Giá trị phân bổ cần dương và hợp đồng không trùng.");
            seen.add(a.contract_id);
            const c = await contractCapacity(
              db,
              p,
              row,
              string(a.contract_id),
              amount,
            );
            if (a.source_revision !== sourceRevision(c))
              fail("Hợp đồng đã đổi sau khi xem. Tải lại nguồn.", 409);
            sum += invoiceMinor(amount, String(row.currency));
            checked.push({ c, amount });
          }
          if (sum > invoiceMinor(row.total_with_vat, String(row.currency)))
            fail("Tổng phân bổ vượt hóa đơn.", 409);
          const businessUsed = (
            await db.query(
              "select coalesce(sum(amount),0)::text amount from local_invoice_business_links where invoice_id=$1 and axis='OBLIGATION'",
              [row.id],
            )
          ).rows[0].amount;
          if (
            sum + invoiceMinor(businessUsed, String(row.currency)) >
            invoiceMinor(row.total_with_vat, String(row.currency))
          )
            fail("Tổng trục nghĩa vụ hợp đồng/chứng từ vượt hóa đơn.", 409);
          await db.query(
            "delete from local_invoice_contract_allocations where invoice_id=$1",
            [row.id],
          );
          for (const { c, amount } of checked)
            await db.query(
              "insert into local_invoice_contract_allocations(invoice_id,company_id,contract_id,amount,currency,reservation,source_revision,reason,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
              [
                row.id,
                row.company_id,
                c.id,
                amount,
                row.currency,
                row.is_draft,
                sourceRevision(c),
                why,
                p.actor,
              ],
            );
          await db.query(
            "update local_einvoices set contract_id=$2,review_state='needs_review',revision=revision+1,updated_at=now() where id=$1",
            [row.id, checked.length === 1 ? checked[0].c.id : null],
          );
          await audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "ALLOCATE_CONTRACTS",
            why,
            checked.map((x) => ({ contract_id: x.c.id, amount: x.amount })),
          );
          return { success: true };
        }),
      ),
    ),
  );
  app.get(
    "/api/invoice-workspace/contracts",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, string(req.query.company_id), "view"),
        owner =
          p.role === "admin"
            ? null
            : p.role === "manager"
              ? p.actor
              : p.assigned;
      if (!owner && p.role !== "admin") fail("Chưa có phạm vi hợp đồng.", 403);
      res.json(
        (
          await pool.query(
            "select id,contract_number,total_amount,buyer_info->>'company_name' buyer_name from local_contracts where tenant_id=$1 and ($2::text is null or manager_id=$2) and status<>'cancelled' order by created_at desc limit 100",
            [c.tenant_id, owner],
          )
        ).rows,
      );
    }),
  );
  app.get(
    "/api/invoice-workspace/contracts/:id/summary",
    handler(async (req, res) => {
      const p = await principal(),
        c = (
          await pool.query("select * from local_contracts where id=$1", [
            req.params.id,
          ])
        ).rows[0];
      if (!c) fail("Không tìm thấy hợp đồng.", 404);
      requireContract(p, c);
      const rows = (
        await pool.query(
          "select a.*,i.invoice_number,i.invoice_series,i.status,i.review_state,i.company_id,i.manager_id,i.source_owner_restricted from local_invoice_contract_allocations a join local_einvoices i on i.id=a.invoice_id where a.contract_id=$1 order by a.created_at",
          [c.id],
        )
      ).rows;
      const visible = [];
      for (const row of rows) {
        try {
          await requireInvoiceCompany(pool, p, row);
          visible.push(row);
        } catch {
          /* Company-denied details stay private. */
        }
      }
      const totals = (
        await pool.query(
          "select coalesce(sum(amount)filter(where reservation),0)::text reserved,coalesce(sum(amount)filter(where not reservation),0)::text invoiced from local_invoice_contract_allocations where contract_id=$1",
          [c.id],
        )
      ).rows[0];
      const cash = await invoiceContractCash(pool, c, p),
        dossiers = [];
      for (const allocation of visible) {
        const invoice = await load(
          pool,
          p,
          String(allocation.invoice_id),
          "view",
        );
        const lineage = [];
        for (const relation of (
          await pool.query(
            "select * from local_invoice_relations where invoice_id=$1 or original_id=$1",
            [invoice.id],
          )
        ).rows) {
          try {
            await load(pool, p, String(relation.invoice_id), "view");
            await load(pool, p, String(relation.original_id), "view");
            lineage.push(relation);
          } catch {
            /* Both ends visible. */
          }
        }
        dossiers.push({
          invoice_id: invoice.id,
          ...(await invoiceDossier(pool, p, invoice)),
          lineage,
        });
      }
      let settled = 0n, settlementKnown = true;
      for (const dossier of dossiers) {
        if (dossier.payment.denied || !dossier.payment.source_valid) { settlementKnown=false; continue; }
        const linked = (
          await pool.query(
            "select count(*)::int n from local_invoice_contract_allocations where invoice_id=$1",
            [dossier.invoice_id],
          )
        ).rows[0].n;
        if (
          linked === 1 &&
          dossier.payment.source_valid &&
          dossier.payment.allocated != null
        )
          settled += invoiceMinor(dossier.payment.allocated, "VND");
        else
          settled += invoiceMinor(
            (
              await pool.query(
                "select coalesce(sum(s.amount),0)::text amount from local_invoice_contract_payment_splits s join local_invoice_payment_allocations a on a.id=s.payment_allocation_id where a.invoice_id=$1 and s.contract_id=$2",
                [dossier.invoice_id, c.id],
              )
            ).rows[0].amount,
            "VND",
          );
      }
      res.json({
        contract_id: c.id,
        source_revision: sourceRevision(c),
        total: String(c.total_amount),
        ...totals,
        remaining: invoiceAmount(
          invoiceMinor(c.total_amount, "VND") -
            invoiceMinor(totals.reserved, "VND") -
            invoiceMinor(totals.invoiced, "VND"),
          "VND",
        ),
        rows: visible,
        hidden_count: rows.length - visible.length,
        contract_snapshot_value: String(c.total_amount),
        remaining_to_invoice: invoiceAmount(
          invoiceMinor(c.total_amount, "VND") -
            invoiceMinor(totals.reserved, "VND") -
            invoiceMinor(totals.invoiced, "VND"),
          "VND",
        ),
        cash_receipts: cash,
        invoice_settlement_allocated: settlementKnown ? invoiceAmount(settled, "VND") : null,
        invoice_settlement_known: settlementKnown,
        appendix_acceptance_evidence: dossiers.flatMap((d) =>
          d.business_links
            .filter(
              (l) => ["APPENDIX", "ACCEPTANCE"].includes(l.kind) && !l.stale,
            )
            .map((l) => ({
              invoice_id: d.invoice_id,
              kind: l.kind,
              reference: l.reference,
              date: l.document_date,
              amount: l.amount,
              currency: l.currency,
              verification_state: l.verification_state,
            })),
        ),
        remaining_after_receipts:
          cash.known && cash.amount != null
            ? invoiceAmount(
                invoiceMinor(c.total_amount, "VND") -
                  invoiceMinor(cash.amount, "VND"),
                "VND",
              )
            : null,
        due_receivable: {
          known: false,
          reason:
            "Chưa có sổ mốc đến hạn/nghiệm thu xác minh; số dư không phải khoản đã đến hạn.",
          action:
            "Gắn phụ lục/mốc/biên bản có chứng cứ, kế toán kiểm tra kỳ đến hạn.",
        },
        effective_contract_value: {
          known: false,
          reason:
            "Giá trị snapshot hợp đồng; chưa có sổ phụ lục/mốc chuẩn để tự cộng thay đổi.",
        },
        dossiers,
        note: "Tiền đã thu theo chứng từ là sự kiện riêng; số giữ chỗ không phải đã phát hành/đã thu.",
      });
    }),
  );
  const paymentSource = async (
    db: InvoiceDb,
    p: ContractPrincipal,
    row: Row,
    type: string,
    id: string,
    lock = false,
  ) => {
    const payment = await invoiceCashSource(db,p,row,type,id,lock);
    if (type === "ORDER_PAYMENT") {
      const linked=(await db.query("select 1 from local_invoice_contract_allocations a join local_contracts c on c.id=a.contract_id where a.invoice_id=$1 and c.order_id=$2",[row.id,payment.order_id])).rowCount;
      if(!linked)fail("Phiếu thu chưa gắn đơn hàng của hợp đồng phân bổ.",409);
    }
    return payment;
  };
  app.get(
    "/api/invoice-workspace/invoices/:id/payment-source",
    handler(async (req, res) => {
      const p = await principal(),
        row = await load(pool, p, String(req.params.id), "link");
      const payment = await paymentSource(
        pool,
        p,
        row,
        string(req.query.type),
        string(req.query.source_id),
      );
      res.json({
        source_id: payment.id,
        type: req.query.type,
        amount: String(payment.payment_amount ?? payment.amount),
        revision: sourceRevision(payment),
        description: payment.notes ?? payment.description,
        date: payment.payment_date ?? payment.date,
      });
    }),
  );
  app.post(
    "/api/invoice-workspace/invoices/:id/payments",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await locked(db, p, String(req.params.id), "link");
          expected(row, req.body.expected_revision);
          const why = reason(req.body.reason);
          if (row.is_draft || row.direction === "UNASSIGNED")
            fail("Chỉ đối chiếu tiền với hóa đơn nguồn đã xác định chiều.");
          const type = string(req.body.source_type),
            sourceId = string(req.body.source_id),
            payment = await paymentSource(db, p, row, type, sourceId, true);
          if (req.body.source_revision !== sourceRevision(payment))
            fail("Nguồn thanh toán đã đổi. Tải lại.", 409);
          const amount = invoiceMinor(req.body.amount, String(row.currency));
          if (amount <= 0n) fail("Giá trị phân bổ phải dương.");
          const used = (
            await db.query(
              "select coalesce(sum(amount),0)::text used from local_invoice_payment_allocations where source_type=$1 and source_id=$2 and invoice_id<>$3",
              [type, sourceId, row.id],
            )
          ).rows[0].used;
          const totalUsed = (
            await db.query(
              "select coalesce(sum(amount),0)::text used from local_invoice_payment_allocations where invoice_id=$1 and not(source_type=$2 and source_id=$3)",
              [row.id, type, sourceId],
            )
          ).rows[0].used;
          if (
            amount + invoiceMinor(used, "VND") >
              invoiceMinor(payment.payment_amount ?? payment.amount, "VND") ||
            amount + invoiceMinor(totalUsed, "VND") >
              invoiceMinor(row.total_with_vat, "VND")
          )
            fail("Phân bổ vượt số tiền chứng từ/hóa đơn.", 409);
          const existing=(await db.query("select id from local_invoice_payment_allocations where invoice_id=$1 and source_type=$2 and source_id=$3 for update",[row.id,type,sourceId])).rows[0];
          if(existing){
            const splitTotal=(await db.query("select coalesce(sum(amount),0)::text amount from local_invoice_contract_payment_splits where payment_allocation_id=$1",[existing.id])).rows[0].amount;
            if(amount<invoiceMinor(splitTotal,"VND"))fail("Không thể giảm khoản phân bổ dưới tổng đã chia cho hợp đồng. Sửa phần chia trước.",409);
          }
          await db.query(
            "insert into local_invoice_payment_allocations(invoice_id,company_id,source_type,source_id,amount,currency,source_revision,reason,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9)on conflict(invoice_id,source_type,source_id)do update set amount=excluded.amount,source_revision=excluded.source_revision,reason=excluded.reason,created_by=excluded.created_by",
            [
              row.id,
              row.company_id,
              type,
              sourceId,
              invoiceAmount(amount, "VND"),
              "VND",
              sourceRevision(payment),
              why,
              p.actor,
            ],
          );
          await db.query(
            "update local_einvoices set revision=revision+1,updated_at=now() where id=$1",
            [row.id],
          );
          await audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "ALLOCATE_PAYMENT",
            why,
            { type, sourceId, amount: invoiceAmount(amount, "VND") },
          );
          return { success: true };
        }),
      ),
    ),
  );
  app.delete(
    "/api/invoice-workspace/invoices/:id/payments/:allocationId",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await locked(db, p, String(req.params.id), "link");
          expected(row, req.body.expected_revision);
          const why = reason(req.body.reason);
          const stored=(await db.query("select * from local_invoice_payment_allocations where id=$1 and invoice_id=$2 for update",[req.params.allocationId,row.id])).rows[0];
          if(!stored)fail("Không tìm thấy phân bổ.",404);
          await invoiceCashSource(db,p,row,stored.source_type,stored.source_id,true);
          const removed = (
            await db.query(
              "delete from local_invoice_payment_allocations where id=$1 and invoice_id=$2 returning *",
              [req.params.allocationId, row.id],
            )
          ).rows[0];
          if (!removed) fail("Không tìm thấy phân bổ.", 404);
          await db.query(
            "update local_einvoices set revision=revision+1,updated_at=now() where id=$1",
            [row.id],
          );
          await audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "REMOVE_PAYMENT",
            why,
            removed,
          );
          return { success: true };
        }),
      ),
    ),
  );
  app.post(
    "/api/invoice-workspace/invoices/:id/documents",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await locked(db, p, String(req.params.id), "link");
          expected(row, req.body.expected_revision);
          const why = reason(req.body.reason);
          if (
            !["DELIVERY", "ACCEPTANCE", "CONTRACT", "COST", "OTHER"].includes(
              req.body.kind,
            ) ||
            !string(req.body.reference)
          )
            fail("Cần loại và mã hồ sơ.");
          if (!row.company_id) fail("Cần gắn doanh nghiệp.");
          if (req.body.file_id) {
            const f = (
              await db.query("select * from local_invoice_files where id=$1", [
                req.body.file_id,
              ])
            ).rows[0];
            if (
              !f ||
              f.company_id !== row.company_id ||
              (f.invoice_id && f.invoice_id !== row.id)
            )
              fail("Tệp không thuộc hồ sơ hóa đơn.", 403);
          }
          const link = (
            await db.query(
              "insert into local_invoice_document_links(company_id,invoice_id,kind,reference,file_id,reason,created_by)values($1,$2,$3,$4,$5,$6,$7)returning *",
              [
                row.company_id,
                row.id,
                req.body.kind,
                string(req.body.reference),
                req.body.file_id || null,
                why,
                p.actor,
              ],
            )
          ).rows[0];
          await db.query(
            "update local_einvoices set revision=revision+1,updated_at=now() where id=$1",
            [row.id],
          );
          await audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "LINK_DOCUMENT",
            why,
            link,
          );
          return link;
        }),
      ),
    ),
  );
  app.delete(
    "/api/invoice-workspace/invoices/:id/documents/:linkId",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = await locked(db, p, String(req.params.id), "link");
          expected(row, req.body.expected_revision);
          const removed = (
            await db.query(
              "delete from local_invoice_document_links where invoice_id=$1 and id=$2 returning *",
              [row.id, req.params.linkId],
            )
          ).rows[0];
          if (!removed) fail("Không tìm thấy liên kết.", 404);
          await audit(
            db,
            p,
            String(row.company_id),
            String(row.id),
            "UNLINK_DOCUMENT",
            reason(req.body.reason),
            removed,
          );
          await db.query(
            "update local_einvoices set revision=revision+1,updated_at=now() where id=$1",
            [row.id],
          );
          return { success: true };
        }),
      ),
    ),
  );

  app.post(
    "/api/invoice-workspace/adoption/preview",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, string(req.body.company_id), "import");
      const ids = req.body.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 100)
        fail("Chọn tối đa 100 hóa đơn cũ.");
      const result = [];
      for (const id of [...new Set(ids)]) {
        const row = await load(pool, p, string(id), "import");
        if (row.company_id) fail("Hóa đơn đã thuộc doanh nghiệp.", 409);
        const snapshot = (row.request_data ?? row.draft_payload ?? {}) as Row;
        const seller = (snapshot.seller_info ??
          (snapshot.contract as Row)?.seller_info ??
          {}) as Row;
        const sellerTax = invoiceTax(row.seller_tax_code ?? seller.tax_code),
          buyerTax = invoiceTax(row.buyer_tax_code);
        const dir = direction(c.tax_code, {
          seller_tax_code: sellerTax,
          buyer_tax_code: buyerTax,
        });
        result.push({
          id: row.id,
          revision: String(row.revision),
          direction: dir,
          eligible: dir !== "UNASSIGNED",
          seller_tax_code: sellerTax,
          buyer_tax_code: buyerTax,
          evidence_hash: digest([
            row.id,
            row.revision,
            sellerTax,
            buyerTax,
            c.id,
          ]),
        });
      }
      res.json({
        company_id: c.id,
        rows: result,
        warning:
          "Chỉ gắn khi MST chứng minh một chiều; giữ giới hạn người phụ trách cũ.",
      });
    }),
  );
  app.post(
    "/api/invoice-workspace/adoption/commit",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            c = await company(db, p, string(req.body.company_id), "import");
          await companyLock(db, c.id);
          const items = req.body.rows;
          if (!Array.isArray(items) || !items.length || items.length > 100)
            fail("Chọn kết quả xem trước hợp lệ.");
          const why = reason(req.body.reason);
          for (const item of [...items].sort((a, b) =>
            string(a.id).localeCompare(string(b.id)),
          )) {
            const row = await load(db, p, string(item.id), "import", true);
            expected(row, item.revision);
            if (row.company_id) fail("Hóa đơn đã được gắn.", 409);
            const snapshot = (row.request_data ??
              row.draft_payload ??
              {}) as Row;
            const seller = (snapshot.seller_info ??
              (snapshot.contract as Row)?.seller_info ??
              {}) as Row;
            const sellerTax = invoiceTax(
                row.seller_tax_code ?? seller.tax_code,
              ),
              buyerTax = invoiceTax(row.buyer_tax_code),
              dir = direction(c.tax_code, {
                seller_tax_code: sellerTax,
                buyer_tax_code: buyerTax,
              });
            if (
              dir === "UNASSIGNED" ||
              item.evidence_hash !==
                digest([row.id, row.revision, sellerTax, buyerTax, c.id])
            )
              fail("Bằng chứng MST thay đổi hoặc chưa đủ.", 409);
            await db.query(
              "update local_einvoices set company_id=$2,direction=$3,seller_tax_code=$4,source_owner_restricted=true,review_state='needs_review',revision=revision+1,local_modified_at=now() where id=$1",
              [row.id, c.id, dir, sellerTax],
            );
            await audit(db, p, c.id, String(row.id), "ADOPT_LEGACY", why, {
              evidence_hash: item.evidence_hash,
              direction: dir,
              owner_preserved: row.manager_id,
            });
          }
          return { adopted: items.length };
        }),
      ),
    ),
  );
  app.get(
    "/api/invoice-workspace/sync-jobs",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, string(req.query.company_id), "view");
      res.json(
        (
          await pool.query(
            "select j.id,j.date_from::text,j.date_to::text,j.status,j.pages,j.received,j.last_error,j.created_at,j.updated_at,(j.actor_id=$2) can_resume,(select jsonb_build_object('new',count(*)filter(where outcome='NEW'),'observed_update',count(*)filter(where outcome='OBSERVED_UPDATE'),'existing',count(*)filter(where outcome='EXISTING'),'needs_review',count(*)filter(where needs_review))from local_invoice_sync_items s where s.job_id=j.id)outcomes,(select count(*)::int from local_invoice_sync_attempts a where a.job_id=j.id and a.status='FAILED') failed_attempts from local_invoice_sync_jobs j where company_id=$1 order by created_at desc limit 50",
            [c.id, p.actor],
          )
        ).rows.map((row) => ({
          ...row,
          last_error: row.last_error == null ? null : storedProviderDiagnostic(row.last_error).code,
          diagnostic: row.last_error == null ? null : storedProviderDiagnostic(row.last_error),
          date_from: invoiceBusinessDate(row.date_from),
          date_to: invoiceBusinessDate(row.date_to),
        })),
      );
    }),
  );
  const periodSnapshot = async (
    db: InvoiceDb,
    p: ContractPrincipal,
    c: string,
    period: string,
    statusOnly = false,
  ) => {
    const unavailable: {kind:string;reason:string}[]=[];
    const check = async <T>(kind:string,fn:()=>Promise<T>):Promise<T|null>=>{
      try{return await fn();}catch(error){
        const code=Number((error as {status?:unknown})?.status);
        if(!statusOnly||code===403||![404,409,422].includes(code))throw error;
        unavailable.push({kind,reason:"Nguồn không còn tồn tại hoặc cần đối soát; bổ sung hồ sơ trước khi chốt/xuất kỳ."});
        return null;
      }
    };
    if (!/^\d{4}-\d{2}$/.test(period)) fail("Kỳ phải là YYYY-MM.");
    const rows = (
      await db.query(
        "select i.* from local_einvoices i where company_id=$1 and to_char(coalesce(issued_date,created_at) at time zone 'Asia/Ho_Chi_Minh','YYYY-MM')=$2 order by id",
        [c, period],
      )
    ).rows;
    for (const row of rows) await requireInvoiceCompany(db, p, row);
    const ids = rows.map((r) => r.id);
    const sourceObservations=(await db.query("select invoice_id,payload from local_invoice_observations where invoice_id=any($1::text[]) order by observed_at desc,id desc",[ids])).rows;
    const projections=new Map<string,ReturnType<typeof invoiceFinancialProjection>>();
    for(const invoice of rows){
      const source=sourceObservations.find(o=>o.invoice_id===invoice.id && o.payload?.raw?.provider==="VIETTEL");
      if(source){
        let projection=invoiceFinancialProjection(source.payload);
        if(!invoiceSourceMatchesCanonical(source.payload,invoice)){
          projection={known:false,sign:null,total_amount:null,vat_amount:null,total_with_vat:null,reason:"Nguồn mới nhất khác định danh pháp lý/ngày/tiền chính xác của snapshot canonical; cần đối soát, không dùng bằng chứng cũ để thay thế."};
          await check("FINANCIAL_SOURCE_CONFLICT",async()=>fail(projection.reason,409));
        }
        if(source.payload.raw.financial_semantics === "PENDING_SOURCE_DELTA_REVIEW" && !projection.known) await check("FINANCIAL_SEMANTICS",async()=>fail("Nguồn điều chỉnh/chiết khấu hoặc trạng thái phát hành chưa đủ xác minh; chưa thể chốt kỳ. "+projection.reason,409));
        const adjustmentType=String(source.payload.raw.source_record?.adjustmentType);
        if(["3","9"].includes(adjustmentType) && !(await db.query("select 1 from local_invoice_relations where invoice_id=$1 and kind=$2 and verified",[invoice.id,adjustmentType === "3" ? "REPLACES" : "ADJUSTS"])).rowCount)await check("FINANCIAL_RELATION",async()=>fail("Hóa đơn thay thế/điều chỉnh tiền cần đối chiếu quan hệ hóa đơn gốc trước khi chốt kỳ.",409));
        projections.set(String(invoice.id),projection);
      }
    }
    const [allocations, payments, files, documents] = await Promise.all(
      [
        "select * from local_invoice_contract_allocations where invoice_id=any($1::text[]) order by id",
        "select * from local_invoice_payment_allocations where invoice_id=any($1::text[]) order by id",
        "select id,invoice_id,sha256,name,original,purpose,received_at from local_invoice_files where invoice_id=any($1::text[]) order by id",
        "select * from local_invoice_document_links where invoice_id=any($1::text[]) order by id",
      ].map((sql) => db.query(sql, [ids])),
    );
    const lineage=(await db.query("select * from local_invoice_relations where invoice_id=any($1::text[])or original_id=any($1::text[])order by invoice_id,original_id",[ids])).rows;
    const excluded=new Set<string>();
    for(const relation of lineage){
      await check("RELATION_ENDPOINT",()=>load(db,p,String(relation.invoice_id),"view"));
      await check("RELATION_ENDPOINT",()=>load(db,p,String(relation.original_id),"view"));
      const projection=await check("FINANCIAL_RELATION",()=>requireFinancialRelation(db,relation));
      if(projection){
        projections.set(String(relation.invoice_id),projection);
        if(relation.verified && relation.kind === "REPLACES")excluded.add(String(relation.original_id));
      }
    }
    for(const payment of payments.rows){
      const invoice=rows.find(r=>r.id===payment.invoice_id)!;
      await check("PAYMENT_SOURCE",()=>invoiceCashSource(db,p,invoice,String(payment.source_type),String(payment.source_id)));
    }
    for(const allocation of allocations.rows){
      const invoice=rows.find(r=>r.id===allocation.invoice_id)!;
      await check("CONTRACT_SOURCE",()=>invoiceBusinessSource(db,p,invoice,"CONTRACT",String(allocation.contract_id)));
    }
    const financialRows=rows.filter(r=>!excluded.has(String(r.id)));
    return {
      period,
      ...(unavailable.length ? {unavailable} : {}),
      rows: financialRows.map(row=>({...safeInvoice(row),financial_projection:projections.get(String(row.id)) ?? {known:false,reason:"Tổng nguồn chưa có ngữ nghĩa tài chính được xác minh; không suy ra doanh thu/chi phí.",sign:null,total_amount:null,vat_amount:null,total_with_vat:null}})),
      financial_totals: Object.fromEntries([...new Set(financialRows.map(row=>String(row.currency)))].map(currency=>{
        const members=financialRows.filter(row=>row.currency===currency),known=members.every(row=>projections.get(String(row.id))?.known);
        return [currency,{known,total_amount:known?invoiceSourceAmount(members.reduce((n,row)=>n+invoiceSourceUnits(projections.get(String(row.id))!.total_amount),0n)):null,vat_amount:known?invoiceSourceAmount(members.reduce((n,row)=>n+invoiceSourceUnits(projections.get(String(row.id))!.vat_amount),0n)):null,total_with_vat:known?invoiceSourceAmount(members.reduce((n,row)=>n+invoiceSourceUnits(projections.get(String(row.id))!.total_with_vat),0n)):null}];
      })),
      processing: await Promise.all(
        rows.map(async (row) => ({
          invoice_id: row.id,
          ...(await invoiceDossier(db, p, row)),
        })),
      ),
      source_evidence: (
        await db.query(
          "select * from local_invoice_source_evidence where invoice_id=any($1::text[])order by id",
          [ids],
        )
      ).rows,
      lineage,
      allocations: allocations.rows,
      payments: payments.rows,
      files: files.rows,
      documents: documents.rows,
      note: "Snapshot kiểm tra nội bộ; không khẳng định đã phát hành, được khấu trừ, đã thu/chi. Quan hệ thay thế chỉ loại gốc khi có bằng chứng xác minh; điều chỉnh giữ gốc.",
    };
  };
  app.post(
    "/api/invoice-workspace/periods/close",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            c = await company(db, p, string(req.body.company_id), "review");
          await companyLock(db, c.id);
          const period = string(req.body.period);
          if (
            (
              await db.query(
                "select 1 from local_invoice_periods where company_id=$1 and period=$2 and reopened_at is null",
                [c.id, period],
              )
            ).rowCount
          )
            fail("Kỳ đang có snapshot chốt; mở lại có lý do trước.", 409);
          const snapshot = await periodSnapshot(db, p, c.id, period),
            hash = digest(snapshot);
          const row = (
            await db.query(
              "insert into local_invoice_periods(company_id,period,snapshot,content_hash,actor_id,reason)values($1,$2,$3::jsonb,$4,$5,$6)returning id,content_hash,closed_at",
              [
                c.id,
                period,
                JSON.stringify(snapshot),
                hash,
                p.actor,
                reason(req.body.reason),
              ],
            )
          ).rows[0];
          await audit(
            db,
            p,
            c.id,
            null,
            "CLOSE_PERIOD",
            reason(req.body.reason),
            row,
          );
          return row;
        }),
      ),
    ),
  );
  app.get(
    "/api/invoice-workspace/periods",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, string(req.query.company_id), "review"),
        period = string(req.query.period),
        current = await periodSnapshot(pool, p, c.id, period, true);
      const rows = (
        await pool.query(
          "select id,period,content_hash,closed_at,reopened_at,reason,reopen_reason from local_invoice_periods where company_id=$1 and period=$2 order by closed_at desc",
          [c.id, period],
        )
      ).rows;
      res.json({
        rows,
        current_hash: digest(current),
        unavailable: current.unavailable ?? [],
        changed_since_close:
          !!rows[0] &&
          !rows[0].reopened_at &&
          rows[0].content_hash !== digest(current),
      });
    }),
  );
  app.get(
    "/api/invoice-workspace/periods/:id/export",
    handler(async (req, res) => {
      const p = await principal(),
        row = (
          await pool.query("select * from local_invoice_periods where id=$1", [
            req.params.id,
          ])
        ).rows[0];
      if (!row) fail("Không tìm thấy snapshot kỳ.", 404);
      await company(pool, p, row.company_id, "review");
      for (const invoice of row.snapshot.rows)
        await requireInvoiceCompany(pool, p, invoice);
      for (const relation of row.snapshot.lineage ?? []) {
        await load(pool,p,String(relation.invoice_id),"view");
        await load(pool,p,String(relation.original_id),"view");
        await requireFinancialRelation(pool,relation);
      }
      for (const payment of row.snapshot.payments ?? []) {
        const invoice=await load(pool,p,String(payment.invoice_id),"view");
        await invoiceCashSource(pool,p,invoice,String(payment.source_type),String(payment.source_id));
      }
      for (const processing of row.snapshot.processing ?? []) {
        const invoice = await load(
          pool,
          p,
          String(processing.invoice_id),
          "view",
        );
        for (const link of processing.business_links ?? []) {
          if (link.source_type !== "EXTERNAL")
            await invoiceBusinessSource(
              pool,
              p,
              invoice,
              link.source_type,
              link.source_id,
            );
        }
        const current = await invoiceDossier(pool, p, invoice);
        if (current.payment.denied)
          fail("Không còn quyền nguồn tiền trong snapshot kỳ.", 403);
      }
      for (const allocation of row.snapshot.allocations ?? []) {
        const contract = (
          await pool.query("select * from local_contracts where id=$1", [
            allocation.contract_id,
          ])
        ).rows[0];
        if (!contract) fail("Nguồn hợp đồng snapshot không còn tồn tại.", 409);
        requireContract(p, contract);
        const invoice=await load(pool,p,String(allocation.invoice_id),"view");
        await invoiceBusinessSource(pool,p,invoice,"CONTRACT",String(allocation.contract_id));
      }
      res.json({
        filename: "snapshot-hoa-don-" + row.period + "-" + row.id + ".json",
        content: JSON.stringify(row.snapshot, null, 2),
        sha256: row.content_hash,
      });
    }),
  );
  app.post(
    "/api/invoice-workspace/periods/:id/reopen",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            row = (
              await db.query(
                "select * from local_invoice_periods where id=$1",
                [req.params.id],
              )
            ).rows[0];
          if (!row) fail("Không tìm thấy kỳ.", 404);
          await company(db, p, row.company_id, "review");
          await companyLock(db, row.company_id);
          const result = (
            await db.query(
              "update local_invoice_periods set reopened_at=now(),reopened_by=$2,reopen_reason=$3 where id=$1 and reopened_at is null returning id",
              [row.id, p.actor, reason(req.body.reason)],
            )
          ).rows[0];
          if (!result) fail("Kỳ đã được mở lại.", 409);
          await audit(
            db,
            p,
            row.company_id,
            null,
            "REOPEN_PERIOD",
            reason(req.body.reason),
            { id: row.id },
          );
          return result;
        }),
      ),
    ),
  );
  app.post(
    "/api/invoice-workspace/export-documents",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, string(req.body.company_id), "files");
      const ids = req.body.invoice_ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 100)
        fail("Chọn tối đa 100 hóa đơn.");
      const JSZip = (await import("jszip")).default,
        zip = new JSZip();
      let total = 0;
      let fileCount = 0;
      const exportedHashes = new Set<string>();
      const manifest = [];
      for (const id of [...new Set(ids)]) {
        const row = await load(pool, p, string(id), "files");
        if (row.company_id !== c.id) fail("Hồ sơ khác doanh nghiệp.", 403);
        const files = (
          await pool.query(
            "select * from local_invoice_files where invoice_id=$1",
            [id],
          )
        ).rows;
        const fileManifest = [];
        const dossier = await invoiceDossier(pool, p, row);
        if(dossier.payment.denied)fail("Không có quyền xuất nguồn tiền trong hồ sơ.",403);
        const evidence = (
            await pool.query(
              "select * from local_invoice_source_evidence where invoice_id=$1 order by id",
              [row.id],
            )
          ).rows;
        const contractAllocations = (
            await pool.query(
              "select * from local_invoice_contract_allocations where invoice_id=$1 order by id",
              [row.id],
            )
          ).rows,
          visibleContracts = [];
        for (const a of contractAllocations) {
          try {
            const contract = (
              await pool.query("select * from local_contracts where id=$1", [
                a.contract_id,
              ])
            ).rows[0];
            if (!contract) continue;
            requireContract(p, contract);
            visibleContracts.push(a);
          } catch {
            /* Revalidate source ACL before snapshot/export. */
          }
        }
        const paymentAllocations = dossier.payment.denied
          ? []
          : (
              await pool.query(
                "select * from local_invoice_payment_allocations where invoice_id=$1 order by id",
                [row.id],
              )
            ).rows;
        const lineage = (
            await pool.query(
              "select * from local_invoice_relations where invoice_id=$1 or original_id=$1",
              [row.id],
            )
          ).rows,
          visibleLineage = [];
        for (const relation of lineage) {
          try {
            await load(pool, p, String(relation.invoice_id), "view");
            await load(pool, p, String(relation.original_id), "view");
            visibleLineage.push(relation);
          } catch {
            /* Both ends must be visible. */
          }
        }
        const snapshot = {
          invoice: safeInvoice(row),
          dossier,
          source_evidence: evidence,
          contract_allocations: visibleContracts,
          payment_allocations: paymentAllocations,
          contract_payment_splits: dossier.payment.denied
            ? []
            : (
                await pool.query(
                  "select s.* from local_invoice_contract_payment_splits s join local_invoice_payment_allocations a on a.id=s.payment_allocation_id where a.invoice_id=$1",
                  [row.id],
                )
              ).rows,
          lineage: visibleLineage,
          legacy_documents: (
            await pool.query(
              "select * from local_invoice_document_links where invoice_id=$1",
              [row.id],
            )
          ).rows.map((r) => ({
            ...r,
            verification_state: "LEGACY_UNVERIFIED",
          })),
        };
        const snapshotBytes = Buffer.from(JSON.stringify(snapshot, null, 2));
        total += snapshotBytes.length;
        if (total > 40 * 1024 * 1024)
          fail("Bộ hồ sơ quá 40MB; chia phạm vi nhỏ hơn.");
        zip.file(String(id) + "/dossier.json", snapshotBytes);
        fileManifest.push({
          name: "dossier.json",
          sha256: digest(snapshotBytes),
          original: false,
          purpose: "INTERNAL_SNAPSHOT",
          source: "CRM",
          archive_path: String(id) + "/dossier.json",
        });
        for (const f of files) {
          if (++fileCount > 500)
            fail("Bộ hồ sơ quá 500 tệp; chia phạm vi nhỏ hơn.");
          if (!exportedHashes.has(f.sha256)) total += f.size_bytes;
          if (total > 40 * 1024 * 1024)
            fail("Bộ chứng từ quá 40MB; chia phạm vi nhỏ hơn.");
          const bytes = await readFile(filePath(f.storage_key));
          if (digest(bytes) !== f.sha256)
            fail("Checksum chứng từ không khớp.", 409);
          if (!exportedHashes.has(f.sha256))
            zip.file("files/" + f.sha256, bytes);
          exportedHashes.add(f.sha256);
          fileManifest.push({
            name: f.name,
            sha256: f.sha256,
            original: f.original,
            source: f.source,
            purpose: f.purpose,
            archive_path: "files/" + f.sha256,
          });
        }
        manifest.push({
          invoice: safeInvoice(row),
          files: fileManifest,
          missing_xml: !files.some(
            (f) =>
              f.original &&
              f.purpose === "INVOICE_ORIGINAL" &&
              f.media_type === "application/xml",
          ),
          missing_pdf: dossier.missing_pdf,
          checklist: dossier.checklist,
          missing_business: dossier.missing_business,
        });
      }
      zip.file(
        "manifest.json",
        JSON.stringify(
          {
            company: { tax_code: c.tax_code, legal_name: c.legal_name },
            invoices: manifest,
            generated_at: new Date().toISOString(),
            note: "Bộ bằng chứng lưu trong CRM; không xác nhận tính hợp lệ thuế.",
          },
          null,
          2,
        ),
      );
      const bytes = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 3 },
      });
      res.json({
        filename: "ho-so-hoa-don.zip",
        base64: bytes.toString("base64"),
        sha256: digest(bytes),
      });
    }),
  );
}
