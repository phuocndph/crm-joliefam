/** Read-only, checkpointed transport boundary; each received page commits atomically. */
import type { Pool } from "pg";
import { ingestInvoice, requireInvoiceCompany } from "./invoice-workspace.js";
import { normalizeInvoice } from "./invoice-import.js";
import type { ContractPrincipal } from "./contract-policy.js";
import { invoiceFail } from "./invoice-money.js";
import { persistInvoiceProviderFiles } from "./invoice-provider-files.js";
import { invoiceBusinessDate } from "./invoice-date.js";
import { digest } from "./invoice-import.js";
import { providerDiagnostic, providerFailure } from "./invoice-provider-diagnostics.js";
export type InvoiceReadTransport = {
  page: (input: {
    company_tax_code: string;
    from: string;
    to: string;
    cursor: string | null;
    signal: AbortSignal;
  }) => Promise<{
    invoices: Record<string, unknown>[];
    next_cursor: string | null;
    complete: boolean;
  }>;
};
export async function runInvoiceReadSync(
  pool: Pool,
  p: ContractPrincipal,
  jobId: string,
  transport: InvoiceReadTransport,
  limits: { pages?: number; timeout_ms?: number; storage_root?: string } = {},
) {
  const max = Math.max(1, Math.min(limits.pages ?? 20, 100)),
    timeout = Math.max(100, Math.min(limits.timeout_ms ?? 10000, 30000));
  let pages = 0;
  while (pages < max) {
    const db = await pool.connect().catch(() => { throw providerFailure("READ_FAILED"); });
    let job;
    let authorized = false;
    let accessDenied = false;
    try {
      await db.query("begin");
      job = (
        await db.query(
          "select *,date_from::text,date_to::text from local_invoice_sync_jobs where id=$1 for update",
          [jobId],
        )
      ).rows[0];
      if (!job || job.actor_id !== p.actor) {
        accessDenied = true;
        invoiceFail("Không có quyền job đồng bộ.", 403);
      }
      try { await requireInvoiceCompany(
        db,
        p,
        { company_id: job.company_id },
        "import",
      ); } catch {
        accessDenied = true;
        invoiceFail("Không có quyền job đồng bộ.", 403);
      }
      authorized = true;
      await db.query(
        "select pg_advisory_xact_lock(hashtextextended('invoice-company:'||$1,0))",
        [job.company_id],
      );
      const company = (
        await db.query(
          "select * from local_invoice_companies where id=$1 and active",
          [job.company_id],
        )
      ).rows[0];
      if (!company) invoiceFail("Doanh nghiệp không hoạt động.");
      if (job.status === "COMPLETE") {
        await db.query("commit");
        return { complete: true, pages };
      }
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const page = await Promise.race([
        transport.page({
          company_tax_code: company.tax_code,
          from: invoiceBusinessDate(job.date_from),
          to: invoiceBusinessDate(job.date_to),
          cursor: job.cursor,
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const error = providerFailure("TIMEOUT");
            // Settle our timeout first: an abort listener may reject with an untrusted error.
            reject(error);
            controller.abort(error);
          }, timeout);
        }),
      ]).finally(() => clearTimeout(timer));
      if (
        !page || typeof page !== "object" ||
        typeof page.complete !== "boolean" ||
        (page.next_cursor !== null && typeof page.next_cursor !== "string") ||
        !Array.isArray(page.invoices) ||
        page.invoices.length > 500 ||
        (!page.complete &&
          (!page.next_cursor || page.next_cursor === job.cursor))
      )
        throw providerFailure("PAGINATION_UNVERIFIED");
      for (const raw of page.invoices) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.provider_id == null || raw.provider_id === "")
          throw providerFailure("SOURCE_SCHEMA_UNSUPPORTED");
        let input: ReturnType<typeof normalizeInvoice>;
        try { input = normalizeInvoice(raw); }
        catch { throw providerFailure("SOURCE_SCHEMA_UNSUPPORTED"); }
        input.source_identity = String(raw.provider_id);
        const result = await ingestInvoice(db, p, company, input, job.source);
        const review = (
          await db.query(
            "select review_state from local_einvoices where id=$1",
            [result.id],
          )
        ).rows[0];
        await db.query(
          "insert into local_invoice_sync_items(job_id,page_no,source_identity,content_hash,invoice_id,outcome,needs_review)values($1,$2,$3,$4,$5,$6,$7)",
          [
            jobId,
            Number(job.pages) + 1,
            String(raw.provider_id),
            digest(input),
            result.id,
            result.outcome === "new"
              ? "NEW"
              : result.outcome === "updated"
                ? "OBSERVED_UPDATE"
                : "EXISTING",
            review.review_state !== "reviewed",
          ],
        );
        if (raw.source_files && limits.storage_root) {
          try { await persistInvoiceProviderFiles(
            db,
            p,
            String(company.id),
            String(result.id),
            input,
            raw.source_files,
            limits.storage_root,
          ); } catch { throw providerFailure("SOURCE_FILE_INVALID"); }
        }
      }
      await db.query(
        "update local_invoice_sync_jobs set cursor=$2,status=$3,pages=pages+1,received=received+$4,last_error=null,updated_at=now() where id=$1",
        [
          jobId,
          page.next_cursor,
          page.complete ? "COMPLETE" : "INCOMPLETE",
          page.invoices.length,
        ],
      );
      await db.query(
        "insert into local_invoice_sync_attempts(job_id,page_no,status)values($1,$2,'COMPLETE')",
        [jobId, Number(job.pages) + 1],
      );
      await db.query("commit");
      pages++;
      if (page.complete) return { complete: true, pages };
    } catch (error) {
      await db.query("rollback").catch(() => { throw providerFailure("READ_FAILED"); });
      const diagnostic = providerDiagnostic(error);
      if (job && authorized) {
        try { await db.query(
          "insert into local_invoice_sync_attempts(job_id,page_no,status,code)values($1,$2,'FAILED',$3)",
          [
            jobId,
            Number(job.pages) + 1,
            diagnostic.code,
          ],
        );
        await db.query(
          "update local_invoice_sync_jobs set status='INCOMPLETE',last_error=$2,updated_at=now() where id=$1",
          [jobId, diagnostic.code],
        ); } catch { throw providerFailure("READ_FAILED"); }
      }
      if (accessDenied) invoiceFail("Không có quyền job đồng bộ.", 403);
      throw providerFailure(diagnostic.code, diagnostic.http_status);
    } finally {
      db.release();
    }
  }
  return { complete: false, pages, reason: "PAGE_LIMIT_CHECKPOINT_SAVED" };
}
