import type { Express, Request, Response } from "express";
import type { Pool, PoolClient } from "pg";
import type { ContractPrincipal } from "./contract-policy.js";
import type { InvoiceDb } from "./invoice-workspace.js";
import { invoiceFail as fail, invoiceTax } from "./invoice-money.js";
import { ViettelReadAdapter, VIETTEL_SPEC } from "./viettel-read-adapter.js";
import { runInvoiceReadSync } from "./invoice-provider.js";
import { invoiceBusinessDate } from "./invoice-date.js";
import { invoiceReadPreflight } from "./invoice-import.js";
import { providerCheckState, providerDiagnostic, providerFailure, storedProviderDiagnostic, type ProviderDiagnostic } from "./invoice-provider-diagnostics.js";
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
  company: (
    db: InvoiceDb,
    p: ContractPrincipal,
    id: string,
    cap: Cap,
  ) => Promise<Row>;
  companyLock: (db: PoolClient, id: string) => Promise<void>;
  request: (
    db: PoolClient,
    p: ContractPrincipal,
    c: string,
    key: unknown,
    body: unknown,
    fn: () => Promise<unknown>,
  ) => Promise<unknown>;
  audit: (
    db: PoolClient,
    p: ContractPrincipal,
    c: string | null,
    id: string | null,
    action: string,
    reason: string,
    snapshot?: unknown,
  ) => Promise<void>;
};
const base = "/api/invoice-workspace";
const safe = (row: Row | undefined) => ({
  configured: !!(row?.username && row?.password),
  enabled: !!row?.enabled,
  username: String(row?.username ?? ""),
  supplier_tax_code: String(row?.supplier_tax_code ?? ""),
  page_start: Number(row?.page_start ?? 1),
  revision: String(row?.revision ?? 0),
  last_checked_at: row?.last_checked_at ?? null,
  ...providerCheckState(row?.last_check_status, row?.last_check_code),
});
const why = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s || s.length > 2000) fail("Cần lý do từ 1 đến 2.000 ký tự.");
  return s;
};
const date = (v: unknown) => {
  const s = String(v ?? "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    fail("Ngày phải đúng YYYY-MM-DD.");
  return s;
};
export function registerInvoiceProviderRoutes(d: Dependencies) {
  const { app, pool, handler, principal, company, tx } = d;
  const account = async (db: InvoiceDb, id: string) =>
    (
      await db.query(
        "select * from integration_private.invoice_provider_accounts where company_id=$1",
        [id],
      )
    ).rows[0];
  const adapter = async (c: Row) => {
    const a = await account(pool, String(c.id));
    if (!a?.enabled || !a.username || !a.password)
      fail(
        "ACCOUNT_NOT_CONFIGURED: Cấu hình và bật tài khoản API Viettel trước.",
        409,
      );
    if (invoiceTax(a.supplier_tax_code) !== invoiceTax(c.tax_code))
      fail("MST tài khoản không khớp doanh nghiệp.", 409);
    return {
      a,
      settings: {
        username: String(a.username),
        password: String(a.password),
        supplier_tax_code: String(a.supplier_tax_code),
        page_start: Number(a.page_start),
        company_name: String(c.legal_name),
        company_address: String(c.address ?? ""),
      },
    };
  };
  app.get(
    base + "/capabilities",
    handler(async (req, res) => {
      const p = await principal();
      let a;
      const id = String(req.query.company_id ?? "");
      if (id && id !== "legacy") {
        await company(pool, p, id, "view");
        a = await account(pool, id);
      }
      res.json({
        mode: "LOCAL_WORKSPACE",
        sources: {
          VIETTEL: {
            read: true,
            write_draft: false,
            issue: false,
            spec: VIETTEL_SPEC,
            configured: !!(a?.enabled && a.username && a.password),
            ...providerCheckState(a?.last_check_status, a?.last_check_code),
            code: a?.enabled
              ? "ACCOUNT_SAVED_NOT_VERIFIED"
              : "ACCOUNT_NOT_CONFIGURED",
          },
          TAX_PORTAL: {
            read: false,
            file_import: true,
            code: "API_CONTRACT_NOT_VERIFIED",
          },
        },
        message:
          "Đã xác minh đặc tả đọc Viettel; kết nối tài khoản chỉ được xác nhận sau kiểm tra đọc. Hóa đơn đầu vào CQT tiếp nhận qua tệp.",
      });
    }),
  );
  app.get(
    base + "/companies/:id/viettel",
    handler(async (req, res) => {
      await company(
        pool,
        await principal(),
        String(req.params.id),
        "configure",
      );
      res.json(safe(await account(pool, String(req.params.id))));
    }),
  );
  app.put(
    base + "/companies/:id/viettel",
    handler(async (req, res) =>
      res.json(
        await tx(async (db) => {
          const p = await principal(db),
            c = await company(db, p, String(req.params.id), "configure");
          await d.companyLock(db, String(c.id));
          const old = await account(db, String(c.id));
          if (String(old?.revision ?? 0) !== String(req.body.expected_revision))
            fail("Cấu hình đã đổi. Tải lại trước khi lưu.", 409);
          const username = String(req.body.username ?? "").trim(),
            password =
              req.body.password === undefined || req.body.password === ""
                ? String(old?.password ?? "")
                : String(req.body.password),
            enabled = req.body.enabled === true,
            page = Number(req.body.page_start ?? 1),
            tax = invoiceTax(c.tax_code);
          if (
            username.length > 300 ||
            password.length > 2000 ||
            ![0, 1].includes(page) ||
            (enabled && (!username || !password))
          )
            fail("Tên đăng nhập/mật khẩu hoặc chỉ số trang không hợp lệ.");
          const reason = why(req.body.reason);
          await db.query(
            "insert into integration_private.invoice_provider_accounts(company_id,enabled,username,password,supplier_tax_code,page_start,updated_by)values($1,$2,$3,$4,$5,$6,$7)on conflict(company_id)do update set enabled=excluded.enabled,username=excluded.username,password=excluded.password,supplier_tax_code=excluded.supplier_tax_code,page_start=excluded.page_start,revision=integration_private.invoice_provider_accounts.revision+1,updated_by=excluded.updated_by,updated_at=now(),last_checked_at=null,last_check_status=null,last_check_code=null",
            [c.id, enabled, username, password, tax, page, p.actor],
          );
          await d.audit(
            db,
            p,
            String(c.id),
            null,
            "PROVIDER_CONFIGURE",
            reason,
            { provider: "VIETTEL", enabled, page_start: page },
          );
          return safe(await account(db, String(c.id)));
        }),
      ),
    ),
  );
  app.post(
    base + "/companies/:id/viettel/check",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, String(req.params.id), "configure"),
        { a, settings } = await adapter(c);
      const from = date(req.body.from),
        to = date(req.body.to);
      if (from > to || Date.parse(to) - Date.parse(from) > 31 * 86400000)
        fail("Kiểm tra đọc trong tối đa 31 ngày.");
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let diagnostic: ProviderDiagnostic = storedProviderDiagnostic("READ_OK");
      let result: Awaited<ReturnType<ViettelReadAdapter["page"]>> | undefined;
      let responseStatus = 200;
      try {
        result = await Promise.race([
          new ViettelReadAdapter(settings, fetch, false).page({
            company_tax_code: String(c.tax_code), from, to, cursor: null,
            signal: controller.signal,
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              const error = providerFailure("TIMEOUT");
              controller.abort(error);
              reject(error);
            }, 15000);
          }),
        ]);
      } catch (error) {
        const failure = providerDiagnostic(error);
        diagnostic = failure;
        responseStatus = providerFailure(failure.code).status;
      } finally {
        clearTimeout(timer);
      }
      const status = result ? "READ_OK" : "FAILED";
      const saved = await pool.query(
        "update integration_private.invoice_provider_accounts set last_checked_at=now(),last_check_status=$3,last_check_code=$4 where company_id=$1 and revision=$2",
        [c.id, a.revision, status, diagnostic.code],
      ).catch(() => { throw providerFailure("READ_FAILED"); });
      if (saved.rowCount !== 1) {
        const changed = storedProviderDiagnostic("CONFIG_CHANGED");
        return res.status(409).json({ status: "FAILED", code: changed.code, diagnostic: changed, message: `${changed.code}: ${changed.message} ${changed.next_action}` });
      }
      if (!result) return res.status(responseStatus).json({ status, code: diagnostic.code, diagnostic, message: `${diagnostic.code}: ${diagnostic.message} ${diagnostic.next_action}` });
      return res.json({
        status, code: diagnostic.code, diagnostic,
        received: result.invoices.length, complete: result.complete,
        normalization: invoiceReadPreflight(result.invoices),
        note: "Chỉ kiểm tra một trang; chưa nhập dữ liệu và chưa xác nhận đủ tệp gốc.",
      });
    }),
  );
  const run = async (p: ContractPrincipal, c: Row, id: string) => {
    const { settings } = await adapter(c);
    const result = await runInvoiceReadSync(
      pool,
      p,
      id,
      new ViettelReadAdapter(settings),
      { pages: 1, timeout_ms: 30000, storage_root: d.root },
    );
    const job = (
      await pool.query(
        "select *,date_from::text,date_to::text from local_invoice_sync_jobs where id=$1 and actor_id=$2",
        [id, p.actor],
      )
    ).rows[0];
    const outcomes = (
      await pool.query(
        "select count(*)filter(where outcome='NEW')::int new,count(*)filter(where outcome='OBSERVED_UPDATE')::int observed_update,count(*)filter(where outcome='EXISTING')::int existing,count(*)filter(where needs_review)::int needs_review from local_invoice_sync_items where job_id=$1",
        [id],
      )
    ).rows[0];
    return {
      ...result,
      job: {
        ...job,
        last_error: job.last_error == null ? null : storedProviderDiagnostic(job.last_error).code,
        diagnostic: job.last_error == null ? null : storedProviderDiagnostic(job.last_error),
        date_from: invoiceBusinessDate(job.date_from),
        date_to: invoiceBusinessDate(job.date_to),
        outcomes,
      },
    };
  };
  app.post(
    base + "/sync",
    handler(async (req, res) => {
      const p = await principal(),
        c = await company(pool, p, String(req.body.company_id), "import");
      const from = date(req.body.from),
        to = date(req.body.to);
      if (from > to || Date.parse(to) - Date.parse(from) > 92 * 86400000)
        fail("Mỗi lượt đọc tối đa 3 tháng (92 ngày).");
      if (req.body.source !== "VIETTEL")
        fail("API CQT chưa xác minh; dùng nhập tệp.", 409);
      await adapter(c);
      const result = (await tx(async (db) => {
        await d.companyLock(db, String(c.id));
        return d.request(
          db,
          p,
          String(c.id),
          req.body.request_key,
          { source: "VIETTEL", from, to, reason: why(req.body.reason) },
          async () => {
            const job = (
              await db.query(
                "insert into local_invoice_sync_jobs(company_id,actor_id,source,date_from,date_to)values($1,$2,'VIETTEL',$3,$4)returning id",
                [c.id, p.actor, from, to],
              )
            ).rows[0];
            await d.audit(
              db,
              p,
              String(c.id),
              null,
              "SYNC_START",
              why(req.body.reason),
              { job_id: job.id, from, to, source: "VIETTEL" },
            );
            return { job_id: job.id };
          },
        );
      })) as { job_id: string };
      res.json(await run(p, c, result.job_id));
    }),
  );
  app.post(
    base + "/sync-jobs/:id/resume",
    handler(async (req, res) => {
      const p = await principal(),
        job = (
          await pool.query(
            "select *,date_from::text,date_to::text from local_invoice_sync_jobs where id=$1 and actor_id=$2",
            [String(req.params.id), p.actor],
          )
        ).rows[0];
      if (!job) fail("Không có quyền job đồng bộ.", 403);
      const c = await company(pool, p, String(job.company_id), "import");
      res.json(await run(p, c, String(job.id)));
    }),
  );
}
