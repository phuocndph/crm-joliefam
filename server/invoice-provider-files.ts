import type { PoolClient } from "pg";
import type { ContractPrincipal } from "./contract-policy.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  digest,
  parseInvoiceFiles,
  type InvoiceInput,
} from "./invoice-import.js";
import { invoiceFail } from "./invoice-money.js";
/** A received ZIP is evidence, never an assertion that its XML/signature is authentic. */
export async function persistInvoiceProviderFiles(
  db: PoolClient,
  p: ContractPrincipal,
  companyId: string,
  invoiceId: string,
  input: InvoiceInput,
  files: unknown,
  root: string,
) {
  if (!Array.isArray(files)) return;
  if (files.length > 200) invoiceFail("Nguồn có quá nhiều tệp.");
  await mkdir(root, { recursive: true });
  let total = 0;
  for (const item of files) {
    if (
      !item ||
      typeof item.data_base64 !== "string" ||
      item.data_base64.length > 22 * 1024 * 1024
    )
      invoiceFail("Tệp nguồn không hợp lệ.");
    const bytes = Buffer.from(item.data_base64, "base64");
    total += bytes.length;
    if (bytes.length > 15 * 1024 * 1024 || total > 40 * 1024 * 1024)
      invoiceFail("Tệp nguồn vượt giới hạn.");
    const media = String(item.media_type),
      name = String(item.name)
        .replace(/[^\p{L}\p{N}._-]/gu, "_")
        .slice(0, 180);
    if (
      !["application/xml", "application/pdf", "application/zip"].includes(media)
    )
      invoiceFail("Loại tệp nguồn không hỗ trợ.");
    if (media === "application/xml") {
      const parsed = await parseInvoiceFiles([
        {
          name: name.endsWith(".xml") ? name : name + ".xml",
          data_base64: item.data_base64,
        },
      ]);
      if (parsed.invoices.length !== 1)
        invoiceFail("XML nguồn không có đúng một hóa đơn.");
      const xml = parsed.invoices[0];
      if (
        [
          "seller_tax_code",
          "buyer_tax_code",
          "template_code",
          "invoice_series",
          "invoice_number",
        ].some(
          (k) =>
            String(xml[k as keyof InvoiceInput] ?? "") !==
            String(input[k as keyof InvoiceInput] ?? ""),
        )
      )
        invoiceFail("XML nguồn không khớp định danh hóa đơn Viettel.", 409);
    }
    if (
      media === "application/pdf" &&
      !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
    )
      invoiceFail("PDF nguồn không hợp lệ.");
    const hash = digest(bytes);
    if (
      (
        await db.query(
          "select 1 from local_invoice_files where company_id=$1 and invoice_id=$2 and sha256=$3 and media_type=$4",
          [companyId, invoiceId, hash, media],
        )
      ).rowCount
    )
      continue;
    const id = randomUUID(),
      key = randomUUID();
    await writeFile(path.join(root, key), bytes, { flag: "wx", mode: 0o600 });
    await db.query(
      "insert into local_invoice_files(id,company_id,invoice_id,storage_key,name,media_type,sha256,size_bytes,source,original,actor_id)values($1,$2,$3,$4,$5,$6,$7,$8,'VIETTEL',true,$9)",
      [id, companyId, invoiceId, key, name, media, hash, bytes.length, p.actor],
    );
  }
}
