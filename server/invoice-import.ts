import { invoiceFinancialProjection,invoiceSourceUnits } from "./invoice-financial.js";
import { providerDecimal, providerDecimalText, providerMappedLines, providerRatesEqual } from "./invoice-provider-decimal.js";
import { SaxesParser } from "saxes";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import {
  calculateInvoiceLines,
  invoiceFail,
  invoiceTax,
  invoiceMinor,
  invoiceDecimal,
} from "./invoice-money.js";
export type InvoiceInput = {
  seller_tax_code: string;
  seller_name: string;
  seller_address: string;
  buyer_tax_code: string;
  buyer_name: string;
  buyer_address: string;
  invoice_number: string;
  template_code: string;
  invoice_series: string;
  issued_date: string;
  currency: string;
  status: string;
  total_amount: string;
  vat_amount: string;
  total_with_vat: string;
  lines: Record<string, unknown>[];
  discrepancy: string[];
  source_identity: string;
  raw: unknown;
};
export type ImportFile = {
  name: string;
  bytes: Buffer;
  media_type: string;
  sha256: string;
};
export const digest = (value: unknown) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
const date = (v: unknown) => {
  const s = String(v ?? "").slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    invoiceFail("Ngày hóa đơn phải đúng YYYY-MM-DD.");
  return s;
};
type Node = { name: string; text: string; children: Node[] };
const child = (n: Node, k: string) => n.children.find((x) => x.name === k);
const text = (n: Node | undefined, k: string) =>
  n ? (child(n, k)?.text.trim() ?? "") : "";
const find = (n: Node | undefined, k: string): Node | undefined =>
  !n
    ? undefined
    : n.name === k
      ? n
      : n.children.map((c) => find(c, k)).find(Boolean);
function xmlInvoice(bytes: Buffer): InvoiceInput {
  const xml = bytes.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    invoiceFail("XML có DTD/entity không được tiếp nhận.");
  const root: Node = { name: "ROOT", text: "", children: [] },
    stack = [root];
  const parser = new SaxesParser({ xmlns: true });
  let count = 0;
  parser.on("opentag", (tag) => {
    if (++count > 50000 || stack.length > 40)
      invoiceFail("XML vượt giới hạn cấu trúc.");
    const node = { name: tag.local, text: "", children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });
  parser.on("text", (value) => {
    stack[stack.length - 1].text += value;
  });
  parser.on("cdata", (value) => {
    stack[stack.length - 1].text += value;
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.on("error", () =>
    invoiceFail(
      "XML không hợp lệ. Hãy xuất XML hóa đơn gốc theo chuẩn HDon/DLHDon.",
    ),
  );
  parser.write(xml).close();
  const sourcePath = (
    target: Node | undefined,
    node: Node = root,
    prefix = "",
  ): string => {
    if (!target) return "";
    const here = node.name === "ROOT" ? prefix : prefix + "/" + node.name;
    if (node === target) return here;
    return (
      node.children
        .map((child) => sourcePath(target, child, here))
        .find(Boolean) ?? ""
    );
  };
  const body = find(root, "DLHDon");
  if (!body)
    invoiceFail(
      "Chưa hỗ trợ cấu trúc XML này. Cần HDon/DLHDon, TTChung, NBan, NMua, TToan.",
    );
  const common = find(body, "TTChung"),
    seller = find(body, "NBan"),
    buyer = find(body, "NMua"),
    payment = find(body, "TToan");
  if (!common || !seller || !buyer || !payment)
    invoiceFail("XML thiếu khối thông tin hóa đơn.");
  const currency = text(common, "DVTTe") || "VND";
  if (["TgTCThue", "TgTThue", "TgTTTBSo"].some((key) => !text(payment, key)))
    invoiceFail("XML thiếu tổng tiền nguồn trước thuế, VAT hoặc tổng thanh toán; cần bổ sung chứng từ đầy đủ, không tự coi số thiếu là 0.");
  const goods = find(body, "DSHHDVu");
  const lines = (goods?.children.filter((n) => n.name === "HHDVu") ?? []).map(
    (n) => ({
      name: text(n, "THHDVu"),
      quantity: text(n, "SLuong") || null,
      unit: text(n, "DVTinh"),
      unit_price: text(n, "DGia") || null,
      vat_rate: text(n, "TSuat") || "KHAC",
      source_line: text(n, "STT"),
    }),
  );
  return normalizeInvoice({
    seller_tax_code: text(seller, "MST"),
    seller_name: text(seller, "Ten"),
    seller_address: text(seller, "DChi"),
    buyer_tax_code: text(buyer, "MST"),
    buyer_name: text(buyer, "Ten"),
    buyer_address: text(buyer, "DChi"),
    invoice_number: text(common, "SHDon"),
    template_code: text(common, "KHMSHDon"),
    invoice_series: text(common, "KHHDon"),
    issued_date: text(common, "NLap"),
    currency,
    status: "unknown",
    total_amount: text(payment, "TgTCThue"),
    vat_amount: text(payment, "TgTThue"),
    total_with_vat: text(payment, "TgTTTBSo"),
    lines,
    raw: {
      format: "VN_HDON_XML",
      content_hash: digest(bytes),
      source_paths: {
        source_lines: sourcePath(goods),
        tax_groups: sourcePath(find(body, "THTTLTSuat")),
        relation_fields:
          sourcePath(find(body, "TTHDLQuan")) ||
          "source fields matched by local name; XML profile review required",
      },
      source_lines: (
        goods?.children.filter((n) => n.name === "HHDVu") ?? []
      ).map((n) => ({
        ...Object.fromEntries(
          n.children.map((c) => [c.name, c.text.trim() || null]),
        ),
        _source_tree: n,
      })),
      tax_groups: (find(body, "THTTLTSuat")?.children ?? []).map((n) => ({
        ...Object.fromEntries(
          n.children.map((c) => [c.name, c.text.trim() || null]),
        ),
        _source_tree: n,
      })),
      relation_fields: {
        template:
          text(find(body, "TTHDLQuan"), "KHMSHDCLQuan") ||
          find(body, "KHMSHDCLQuan")?.text.trim() ||
          null,
        series:
          text(find(body, "TTHDLQuan"), "KHHDCLQuan") ||
          find(body, "KHHDCLQuan")?.text.trim() ||
          null,
        number:
          text(find(body, "TTHDLQuan"), "SHDCLQuan") ||
          find(body, "SHDCLQuan")?.text.trim() ||
          null,
        date:
          text(find(body, "TTHDLQuan"), "NLHDCLQuan") ||
          find(body, "NLHDCLQuan")?.text.trim() ||
          null,
        seller_tax_code: find(body, "MSTCLQuan")?.text.trim() || null,
        kind:
          find(body, "TCHDon")?.text.trim() === "1"
            ? "REPLACES"
            : find(body, "TCHDon")?.text.trim() === "2"
              ? "ADJUSTS"
              : null,
        reason: find(body, "LDDCTThe")?.text.trim() || null,
        profile: "CQT_PUBLIC_READER_FIELDS_REVIEW_REQUIRED",
      },
    },
  });
}
export function normalizeInvoice(raw: Record<string, unknown>): InvoiceInput {
  const isViettel = !!raw.raw && typeof raw.raw === "object" && (raw.raw as Record<string, unknown>).provider === "VIETTEL";
  const sourceDecimal = isViettel ? providerDecimal : invoiceDecimal;
  const currency = String(raw.currency || "VND")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) invoiceFail("Mã tiền tệ không hợp lệ.");
  const discrepancy: string[] = [];
  if (
    raw.raw &&
    typeof raw.raw === "object" &&
    "file_error" in raw.raw &&
    raw.raw.file_error
  )
    discrepancy.push(
      "Chưa tải được tệp gốc từ Viettel; kiểm tra nguồn hoặc bổ sung XML hợp lệ.",
    );
  if(raw.raw && typeof raw.raw === "object" && (raw.raw as Record<string,unknown>).financial_semantics === "PENDING_SOURCE_DELTA_REVIEW" && !invoiceFinancialProjection(raw).known)
    discrepancy.push("Trạng thái phát hành hoặc chiều tăng/giảm/chiết khấu từ nguồn chưa đủ ngữ nghĩa tài chính; giữ tiền nguồn, không cộng dương hoặc chốt kỳ cho đến khi đối soát.");
  const originalLines = Array.isArray(raw.lines) ? raw.lines as Record<string, unknown>[] : [];
  const lines = isViettel ? providerMappedLines(originalLines) : originalLines;
  const header = (value: unknown) => isViettel ? providerDecimalText(value, 6, true) : String(value ?? "");
  const total_amount = header(raw.total_amount),
    vat_amount = header(raw.vat_amount),
    total_with_vat = header(raw.total_with_vat);
  for (const v of [total_amount, vat_amount, total_with_vat])
    invoiceMinor(v, currency);
  const a = invoiceDecimal(total_amount, 6, true),
    b = invoiceDecimal(vat_amount, 6, true),
    c = invoiceDecimal(total_with_vat, 6, true);
  if ((a.n * b.d + b.n * a.d) * c.d !== c.n * a.d * b.d)
    discrepancy.push("Tổng trước thuế + VAT khác tổng nguồn.");
  if (lines.length) {
    try {
      const calc = calculateInvoiceLines(lines, currency, true);
      const facts =
        raw.raw && typeof raw.raw === "object"
          ? (raw.raw as Record<string, unknown>).source_lines
          : null;
      if (Array.isArray(facts))
        for (const [i, fact] of facts.entries()) {
          const expected = calc.lines[i];
          if (!expected) continue;
          for (const [target, keys] of [
            [
              "subtotal",
              [
                "ThTien",
                "itemTotalAmountAfterDiscount",
                "itemTotalAmountWithoutVat",
              ],
            ],
            ["vat_amount", ["TThue", "vatAmount"]],
            ["total", ["TgTien", "itemTotalAmountWithVat"]],
          ] as const) {
            const actual = keys
              .map((k) => fact[k])
              .find((v) => v != null && v !== "");
            if (actual != null) {
              try {
                const x = sourceDecimal(actual, 6, true),
                  y = invoiceDecimal(expected[target], 6, true);
                if (x.n * y.d !== y.n * x.d)
                  discrepancy.push(
                    `Dòng nguồn ${i + 1} ${target} khác tiền kiểm tra; giữ nguyên bằng chứng.`,
                  );
              } catch {
                discrepancy.push(
                  `Dòng nguồn ${i + 1} có số tiền chưa diễn giải được.`,
                );
              }
            }
          }
        }
      const groups =
        raw.raw && typeof raw.raw === "object"
          ? (raw.raw as Record<string, unknown>).tax_groups
          : null;
      if (Array.isArray(groups) && groups.length) {
        let taxable = { n: 0n, d: 1n },
          tax = { n: 0n, d: 1n },
          complete = true;
        for (const [index, group] of groups.entries()) {
          const before = group.vatTaxableAmount ?? group.ThTien,
            vat = group.vatTaxAmount ?? group.TThue;
          if (before == null || vat == null) {
            complete = false;
            continue;
          }
          try {
            const a = sourceDecimal(before, 6, true),
              b = sourceDecimal(vat, 6, true);
            const rate=String(group.TSuat ?? group.vatPercentage ?? "").trim().replace(/%$/,"");
            const sameRate=calc.lines.filter(line=>isViettel ? providerRatesEqual(line.vat_rate, group.TSuat ?? group.vatPercentage) : String(line.vat_rate).trim().replace(/%$/,"")===rate);
            if(!rate || !sameRate.length) discrepancy.push(`Nhóm thuế nguồn ${index+1} chưa khớp mức thuế dòng kiểm tra.`);
            else {
              const beforeMinor=sameRate.reduce((n,line)=>n+invoiceSourceUnits(line.subtotal),0n),vatMinor=sameRate.reduce((n,line)=>n+invoiceSourceUnits(line.vat_amount),0n);
              if(invoiceSourceUnits(before,isViettel)!==beforeMinor || invoiceSourceUnits(vat,isViettel)!==vatMinor)
                discrepancy.push(`Nhóm thuế nguồn ${index+1} mức ${rate} khác tiền kiểm tra theo cùng mức thuế; giữ nguyên bằng chứng.`);
            }
            taxable = {
              n: taxable.n * a.d + a.n * taxable.d,
              d: taxable.d * a.d,
            };
            tax = { n: tax.n * b.d + b.n * tax.d, d: tax.d * b.d };
          } catch {
            complete = false;
            discrepancy.push(
              `Nhóm thuế nguồn ${index + 1} có tiền chưa diễn giải được.`,
            );
          }
        }
        if (complete) {
          const before = invoiceDecimal(total_amount, 6, true),
            vat = invoiceDecimal(vat_amount, 6, true);
          if (
            taxable.n * before.d !== before.n * taxable.d ||
            tax.n * vat.d !== vat.n * tax.d
          )
            discrepancy.push(
              "Tổng nhóm thuế nguồn khác tổng hóa đơn; giữ nguyên bằng chứng.",
            );
        }
      }
      if (
        ["subtotal", "vat_amount", "total"].some((k, i) => {
          const x = invoiceDecimal(calc[k as keyof typeof calc], 6, true),
            y = invoiceDecimal(
              [total_amount, vat_amount, total_with_vat][i],
              6,
              true,
            );
          return x.n * y.d !== y.n * x.d;
        })
      )
        discrepancy.push(
          "Tiền theo dòng khác tổng nguồn; giữ nguyên tổng nguồn.",
        );
    } catch (error) {
      discrepancy.push(
        error instanceof Error ? error.message : "Không tính được dòng nguồn.",
      );
    }
  } else discrepancy.push("Chưa có dòng hóa đơn; bổ sung XML gốc.");
  const seller_tax_code = invoiceTax(raw.seller_tax_code),
    buyer_tax_code = invoiceTax(raw.buyer_tax_code);
  if (!/^\d{10}(\d{3})?$/.test(seller_tax_code))
    discrepancy.push("MST người bán cần xác minh.");
  const status = String(raw.status || "unknown").toLowerCase();
  if (
    !["issued", "draft", "cancelled", "replaced", "adjusted"].includes(
      status,
    ) ||
    status === "replaced" ||
    status === "adjusted"
  )
    discrepancy.push("Trạng thái/quan hệ pháp lý cần xác minh từ nguồn.");
  if (
    !String(raw.invoice_number || "").trim() ||
    !String(raw.invoice_series || "").trim()
  )
    invoiceFail("Thiếu số/ký hiệu hóa đơn; không thể chống trùng an toàn.");
  const row = {
    seller_tax_code,
    seller_name: String(raw.seller_name ?? ""),
    seller_address: String(raw.seller_address ?? ""),
    buyer_tax_code,
    buyer_name: String(raw.buyer_name ?? ""),
    buyer_address: String(raw.buyer_address ?? ""),
    invoice_number: String(raw.invoice_number).trim(),
    template_code: String(raw.template_code ?? "").trim(),
    invoice_series: String(raw.invoice_series).trim(),
    issued_date: date(raw.issued_date),
    currency,
    status,
    total_amount,
    vat_amount,
    total_with_vat,
    lines,
    discrepancy,
    source_identity: "",
    raw: raw.raw ?? raw,
  };
  row.source_identity = digest([
    seller_tax_code,
    row.template_code,
    row.invoice_series,
    row.invoice_number,
  ]);
  return row;
}
const fields = [
  "seller_tax_code",
  "seller_name",
  "seller_address",
  "buyer_tax_code",
  "buyer_name",
  "buyer_address",
  "invoice_number",
  "template_code",
  "invoice_series",
  "issued_date",
  "currency",
  "status",
  "total_amount",
  "vat_amount",
  "total_with_vat",
];
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === ";")) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) invoiceFail("CSV có dấu nháy chưa đóng.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export async function boundedZipEntry(
  entry: JSZip.JSZipObject,
  limit = 15 * 1024 * 1024,
): Promise<Buffer> {
  const stream = (
    entry as unknown as {
      internalStream: (type: string) => {
        on: (name: string, fn: (value?: Buffer) => void) => unknown;
        resume: () => void;
        pause: () => void;
      };
    }
  ).internalStream("nodebuffer");
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0,
      done = false;
    stream.on("data", (chunk) => {
      if (done || !chunk) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        stream.pause();
        reject(
          Object.assign(new Error("Dữ liệu giải nén vượt giới hạn."), {
            status: 422,
          }),
        );
        return;
      }
      chunks.push(chunk);
    });
    stream.on("error", () => {
      if (!done) {
        done = true;
        reject(Object.assign(new Error("ZIP không hợp lệ."), { status: 422 }));
      }
    });
    stream.on("end", () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks));
      }
    });
    stream.resume();
  });
}
export async function boundedZip(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes, {
    checkCRC32: false,
    createFolders: false,
  });
  let total = 0;
  const entries = Object.values(zip.files);
  if (entries.length > 200) invoiceFail("ZIP/XLSX quá 200 mục.");
  for (const entry of entries) {
    const meta = entry as unknown as { _data?: { uncompressedSize: number } };
    const size = meta._data?.uncompressedSize ?? 0;
    total += size;
    if (
      String(
        (entry as unknown as { unsafeOriginalName?: string })
          .unsafeOriginalName ?? entry.name,
      ).includes("..") ||
      entry.name.includes("\\") ||
      entry.name.startsWith("/") ||
      /^[A-Z]:/i.test(entry.name)
    )
      invoiceFail("ZIP có đường dẫn không an toàn.");
    if (total > 40 * 1024 * 1024 || size > 15 * 1024 * 1024)
      invoiceFail("Tệp giải nén vượt giới hạn 40MB/15MB mỗi mục.");
  }
  return zip;
}
export async function parseInvoiceFiles(
  upload: { name: string; data_base64: string }[],
  mapping: Record<string, string> = {},
) {
  if (!Array.isArray(upload) || !upload.length || upload.length > 30)
    invoiceFail("Chọn từ 1 đến 30 tệp.");
  let compressed = 0,
    expanded = 0;
  const files: ImportFile[] = [],
    invoices: InvoiceInput[] = [];
  const receive = async (name: string, bytes: Buffer, nested = false) => {
    if (!name || name.length > 200 || /[\\/]/.test(name) || name.includes(".."))
      invoiceFail("Tên tệp không hợp lệ.");
    expanded += bytes.length;
    if (bytes.length > 15 * 1024 * 1024 || expanded > 40 * 1024 * 1024)
      invoiceFail("Tổng dữ liệu tệp vượt giới hạn.");
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "zip") {
      if (nested) invoiceFail("Không hỗ trợ ZIP lồng nhau.");
      const zip = await boundedZip(bytes);
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        if (entry.name.includes("/"))
          invoiceFail("ZIP chỉ hỗ trợ tệp ở thư mục gốc.");
        await receive(entry.name, await boundedZipEntry(entry), true);
      }
      return;
    }
    if (!["xml", "pdf", "csv", "xlsx"].includes(ext ?? ""))
      invoiceFail(
        `Chưa hỗ trợ ${name}. Dùng XML HDon, PDF gốc, CSV hoặc XLSX có ánh xạ cột.`,
      );
    const media_type =
      ext === "xml"
        ? "application/xml"
        : ext === "pdf"
          ? "application/pdf"
          : ext === "csv"
            ? "text/csv"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (ext === "pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
      invoiceFail("Nội dung PDF không đúng định dạng.");
    files.push({ name, bytes, media_type, sha256: digest(bytes) });
    if (ext === "xml") invoices.push(xmlInvoice(bytes));
    if (ext === "csv" || ext === "xlsx") {
      let rows: string[][];
      if (ext === "csv")
        rows = csvRows(bytes.toString("utf8").replace(/^\uFEFF/, ""));
      else {
        const checkedZip = await boundedZip(bytes);
        let expandedSheet = 0;
        for (const entry of Object.values(checkedZip.files)) {
          if (entry.dir) continue;
          const expanded = await boundedZipEntry(entry);
          if (
            /\.xml$/i.test(entry.name) &&
            /<!DOCTYPE|<!ENTITY/i.test(expanded.toString("utf8"))
          )
            invoiceFail("XLSX có DTD/entity không được tiếp nhận.");
          expandedSheet += expanded.length;
          if (expandedSheet > 40 * 1024 * 1024)
            invoiceFail("XLSX giải nén vượt giới hạn.");
        }
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(bytes as never);
        if (book.worksheets.length !== 1)
          invoiceFail("XLSX cần một sheet danh sách hóa đơn.");
        rows = [];
        book.worksheets[0].eachRow((row) => {
          rows.push(
            (row.values as ExcelJS.CellValue[])
              .slice(1)
              .map((v) =>
                v == null
                  ? ""
                  : typeof v === "object"
                    ? "text" in v
                      ? String(v.text)
                      : invoiceFail(
                          "Ô công thức/ngày Excel cần đổi thành văn bản YYYY-MM-DD.",
                        )
                    : String(v),
              ),
          );
        });
      }
      if (rows.length > 5001 || !rows.length)
        invoiceFail("Danh sách cần tối đa 5.000 hóa đơn.");
      const headers = rows.shift()!.map((x) => x.trim());
      const columns = Object.fromEntries(
        fields.map((f) => [f, headers.indexOf(mapping[f] || f)]),
      );
      if (
        [
          "seller_tax_code",
          "buyer_tax_code",
          "invoice_number",
          "invoice_series",
          "issued_date",
          "total_amount",
          "vat_amount",
          "total_with_vat",
        ].some((f) => columns[f] < 0)
      )
        invoiceFail(
          "Chưa khớp cột. Ánh xạ JSON: seller_tax_code, buyer_tax_code, invoice_number, invoice_series, issued_date, total_amount, vat_amount, total_with_vat → tên cột tệp.",
        );
      for (const row of rows) {
        const raw = Object.fromEntries(
          fields.map((f) => [f, columns[f] < 0 ? "" : (row[columns[f]] ?? "")]),
        );
        invoices.push(
          normalizeInvoice({
            ...raw,
            raw: { format: ext, columns: headers, row },
          }),
        );
      }
    }
  };
  for (const u of upload) {
    if (
      typeof u.data_base64 !== "string" ||
      !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        u.data_base64,
      )
    )
      invoiceFail("Dữ liệu base64 không hợp lệ.");
    const b = Buffer.from(u.data_base64, "base64");
    compressed += b.length;
    if (compressed > 15 * 1024 * 1024) invoiceFail("Tổng tệp nén vượt 15MB.");
    await receive(u.name, b);
  }
  return { files, invoices };
}

/** Pure check-read preflight; normalization readiness never certifies financial/legal completeness. */
export function invoiceReadPreflight(invoices: Record<string, unknown>[]) {
  let ready_count = 0, unsupported_count = 0, needs_review_count = 0;
  for (const invoice of invoices) {
    try { const input = normalizeInvoice(invoice); ready_count++; if (input.discrepancy.length) needs_review_count++; }
    catch { unsupported_count++; }
  }
  return { checked: true as const, ready_count, unsupported_count, needs_review_count };
}
