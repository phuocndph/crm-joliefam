import type { InvoiceDb } from "./invoice-workspace.js";
import type { ContractPrincipal } from "./contract-policy.js";
import { requireContract } from "./contract-policy.js";
import { digest } from "./invoice-import.js";
import { invoiceMinor, invoiceAmount, invoiceFail } from "./invoice-money.js";
import { invoiceBusinessDate } from "./invoice-date.js";
type Row = Record<string, unknown>;
export const checklistItems = [
  "XML",
  "PDF",
  "CONTRACT_OR_COST",
  "APPENDIX",
  "DELIVERY",
  "ACCEPTANCE",
  "PAYMENT_EVIDENCE",
] as const;
export async function invoiceSourcePermission(
  db: InvoiceDb,
  p: ContractPrincipal,
  permission: string,
) {
  if (["admin", "manager"].includes(p.role)) return true;
  return !!(
    await db.query(
      "select 1 from local_employee_permissions where user_id=$1 and enabled and permission_type=$2",
      [p.actor, permission],
    )
  ).rowCount;
}
/** Cash access follows the same module rights as the canonical money routes. */
export async function invoiceCashPermission(db: InvoiceDb, p: ContractPrincipal, type: string) {
  const rights = type === "ORDER_PAYMENT" ? ["orders", "cash_flow", "transactions"] : type === "TRANSACTION" ? ["transactions"] : [];
  for (const permission of rights) if (await invoiceSourcePermission(db, p, permission)) return true;
  return false;
}
/** Does not require a current allocation: immutable snapshots must recheck their stored sources too. */
export async function invoiceCashSource(db: InvoiceDb, p: ContractPrincipal, invoice: Row, type: string, id: string, lock = false) {
  if (!(await invoiceCashPermission(db, p, type))) invoiceFail("Không có quyền đọc nguồn tiền.", 403);
  if ((type === "ORDER_PAYMENT" && invoice.direction !== "OUT") || (type === "TRANSACTION" && invoice.direction !== "IN")) invoiceFail("Nguồn tiền khác chiều hóa đơn.", 409);
  const source = (await db.query(type === "ORDER_PAYMENT"
    ? `select p.*,o.manager_id,o.tenant_id from local_order_payments p join local_orders o on o.id=p.order_id where p.id=$1 and not exists(select 1 from local_projection_tombstones t where (t.source_table='order_payments' and t.source_key=p.id) or (t.source_table='orders' and t.source_key=o.id))${lock ? " for update of p,o" : ""}`
    : `select * from local_transactions where id=$1 and type='expense' and coalesce(category,'')<>'order_payment' and order_id is null and not exists(select 1 from local_projection_tombstones t where t.source_table='transactions' and t.source_key=local_transactions.id)${lock ? " for update" : ""}`, [id])).rows[0];
  if (!source) invoiceFail("Nguồn tiền không còn tồn tại/hợp lệ; không được xuất dữ liệu lưu cũ.", 409);
  requireContract(p, source);
  if (source.tenant_id !== invoice.tenant_id) invoiceFail("Nguồn tiền khác đơn vị.", 403);
  if (invoice.currency !== "VND") invoiceFail("Nguồn tiền chỉ hỗ trợ VND.", 409);
  return source;
}
/** Returns only a bounded legal/business snapshot after checking source ownership and module rights. */
export async function invoiceBusinessSource(
  db: InvoiceDb,
  p: ContractPrincipal,
  invoice: Row,
  type: string,
  id: string,
  lock = false,
) {
  let row: Row = {},
    owner: Row = {},
    label = "",
    date: unknown,
    amount: unknown = null,
    currency: unknown = null,
    party = "",
    tax = "",
    state = "",
    internal = false;
  const table = (
    {
      CONTRACT: "local_contracts",
      BUSINESS_TRANSACTION: "local_business_transactions",
      PRODUCTION_SHIPMENT: "local_production_shipments",
      INVENTORY_DOCUMENT: "local_inventory_documents",
      CONTRACT_DOCUMENT: "local_contracts",
    } as Record<string, string>
  )[type];
  if (!table) invoiceFail("Nguồn chứng từ không hỗ trợ.");
  const permission =
    type === "BUSINESS_TRANSACTION"
      ? "cost_transactions"
      : type === "PRODUCTION_SHIPMENT"
        ? "production_view"
        : type === "INVENTORY_DOCUMENT"
          ? "inventory_view"
          : "contracts";
  if (!(await invoiceSourcePermission(db, p, permission)))
    invoiceFail("Không có quyền đọc nguồn chứng từ.", 403);
  row = (
    await db.query(
      `select * from ${table} where id::text=$1${lock ? " for update" : ""}`,
      [id],
    )
  ).rows[0];
  if (!row) invoiceFail("Chứng từ nguồn không tồn tại.", 404);
  owner = row;
  if (type === "PRODUCTION_SHIPMENT")
    owner = (
      await db.query("select * from local_orders where id=$1", [row.order_id])
    ).rows[0];
  if (type === "INVENTORY_DOCUMENT") {
    if (invoice.tenant_id !== "local-tenant")
      invoiceFail("Chứng từ kho chưa có pháp nhân/tenant để xác minh.", 403);
  } else {
    if (!owner || owner.tenant_id !== invoice.tenant_id)
      invoiceFail("Nguồn khác đơn vị.", 403);
    requireContract(p, owner);
  }
  if (type === "CONTRACT" || type === "CONTRACT_DOCUMENT") {
    const buyer = (row.buyer_info ?? {}) as Row;
    label = String(row.contract_number);
    date = row.contract_date;
    party = String(buyer.company_name ?? buyer.name ?? "");
    tax = String(buyer.tax_code ?? "");
    state = String(row.status);
    if (type === "CONTRACT") {
      amount = row.total_amount;
      currency = "VND";
    } else {
      internal = true;
      if (!(row.document_overrides as Row | undefined)?.handover_report)
        invoiceFail("Hợp đồng chưa có biên bản bàn giao nội bộ.", 404);
      label += " · Biên bản bàn giao nội bộ";
    }
  } else if (type === "BUSINESS_TRANSACTION") {
    label = String(row.transaction_number);
    date = row.transaction_date;
    party = String(row.counterparty_name_snapshot ?? "");
    state = String(row.status);
    if (state === "CONFIRMED") {
      amount = row.total_amount;
      currency = row.currency_code;
    }
  } else if (type === "PRODUCTION_SHIPMENT") {
    label = String(row.shipment_number);
    date = row.delivered_at ?? row.dispatched_at;
    party = String(row.recipient_name ?? "");
    state = String(row.status);
  } else {
    label = String(row.document_number);
    date = row.transaction_at;
    party = String(row.counterparty_name ?? "");
    state = String(
      row.status,
    ); /* Warehouse valuation is not a counterparty payable or invoice price. */
  }
  if (["cancelled", "VOIDED", "CANCELLED"].includes(state))
    invoiceFail("Nguồn đã hủy, không dùng làm bằng chứng hiện hành.", 409);
  const snapshot = {
    source_type: type,
    source_id: id,
    manager_id: owner?.manager_id ?? null,
    tenant_id: owner?.tenant_id ?? "local-tenant",
    label,
    date: invoiceBusinessDate(date),
    counterparty: party,
    tax_code: tax,
    state,
    amount: amount == null ? null : String(amount),
    currency: currency == null ? null : String(currency),
    internal_editable: internal,
    document:
      type === "CONTRACT_DOCUMENT"
        ? (row.document_overrides as Row).handover_report
        : null,
    external_reference: row.external_reference ?? row.carrier_reference ?? null,
  };
  return {
    snapshot,
    revision: digest(row),
    amount: amount == null ? null : String(amount),
    currency: currency == null ? null : String(currency),
    internal,
  };
}
export async function invoiceBusinessLinks(
  db: InvoiceDb,
  p: ContractPrincipal,
  row: Row,
) {
  const rows = (
    await db.query(
      "select * from local_invoice_business_links where invoice_id=$1 order by created_at",
      [row.id],
    )
  ).rows;
  const visible = [];
  for (const link of rows) {
    if (link.source_type === "EXTERNAL") {
      visible.push({ ...link, stale: false });
      continue;
    }
    try {
      const source = await invoiceBusinessSource(
        db,
        p,
        row,
        link.source_type,
        link.source_id,
      );
      visible.push({
        ...link,
        verification_state: link.source_type === "INVENTORY_DOCUMENT" && (link.source_snapshot?.company_association as Row | undefined)?.company_id !== row.company_id ? "UNVERIFIED_ASSOCIATION" : link.verification_state,
        current_snapshot: source.snapshot,
        stale: source.revision !== link.source_revision,
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 409
      )
        visible.push({ ...link, stale: true, source_unavailable: true });
      /* Never expose denied source snapshots or counts. */
    }
  }
  return visible;
}
export async function invoicePaymentReadModel(
  db: InvoiceDb,
  row: Row,
  p?: ContractPrincipal,
) {
  const allocations = (
    await db.query(
      "select * from local_invoice_payment_allocations where invoice_id=$1",
      [row.id],
    )
  ).rows;
  let sum = 0n,
    invalid = false,
    denied = p ? !(await invoiceCashPermission(db,p,row.direction === "OUT" ? "ORDER_PAYMENT" : "TRANSACTION")) : true;
  if (denied) invalid=true;
  for (const a of allocations) {
    let source;
    try {
      if (!p) throw new Error("Thiếu danh tính đọc nguồn tiền.");
      source = await invoiceCashSource(db, p, row, String(a.source_type), String(a.source_id));
    } catch {
      invalid = true;
      denied = true;
    }
    if (!source || a.currency !== row.currency || digest(source) !== a.source_revision)
      invalid = true;
    if (source) {
      const sourceUsed = (await db.query("select coalesce(sum(amount),0)::text amount from local_invoice_payment_allocations where source_type=$1 and source_id=$2", [a.source_type,a.source_id])).rows[0].amount;
      if (invoiceMinor(sourceUsed,"VND") > invoiceMinor(source.payment_amount ?? source.amount,"VND")) invalid = true;
      const splits = (await db.query("select s.*,c.order_id,c.tenant_id,c.manager_id,c.status,c.total_amount from local_invoice_contract_payment_splits s left join local_contracts c on c.id=s.contract_id where s.payment_allocation_id=$1", [a.id])).rows;
      let splitSum=0n;
      for (const split of splits) {
        try { requireContract(p!,split); } catch { denied=true; invalid=true; }
        if (a.source_type !== "ORDER_PAYMENT" || split.order_id !== source.order_id || split.tenant_id !== row.tenant_id || split.manager_id !== source.manager_id || split.status === "cancelled" || split.currency !== "VND" || split.source_revision !== digest(source)) invalid=true;
        const contractSplitTotal=(await db.query("select coalesce(sum(amount),0)::text amount from local_invoice_contract_payment_splits where contract_id=$1",[split.contract_id])).rows[0].amount;
        if(!(await db.query("select 1 from local_invoice_contract_allocations where invoice_id=$1 and contract_id=$2",[row.id,split.contract_id])).rowCount)invalid=true;
        if(invoiceMinor(contractSplitTotal,"VND")>invoiceMinor(split.total_amount,"VND"))invalid=true;
        splitSum += invoiceMinor(split.amount,"VND");
      }
      if (splitSum > invoiceMinor(a.amount,"VND")) invalid=true;
    }
    if (source && a.source_type === "ORDER_PAYMENT") {
      const linked = (
        await db.query(
          "select c.*,a.source_revision allocated_revision from local_invoice_contract_allocations a join local_contracts c on c.id=a.contract_id where a.invoice_id=$1 and c.order_id=$2",
          [row.id, source.order_id],
        )
      ).rows;
      if (
        !linked.length ||
        linked.some(
          (c) =>
            c.status === "cancelled" ||
            c.tenant_id !== row.tenant_id ||
            c.manager_id !== source.manager_id ||
            digest(
              Object.fromEntries(
                Object.entries(c).filter(([k]) => k !== "allocated_revision"),
              ),
            ) !== c.allocated_revision,
        )
      )
        invalid = true;
    }
    sum += invoiceMinor(a.amount, String(row.currency));
  }
  const total = invoiceMinor(row.total_with_vat, String(row.currency));
  const relation = await db.query(
    "select 1 from local_invoice_relations where (invoice_id=$1 or original_id=$1) limit 1",
    [row.id],
  );
  if (
    relation.rowCount ||
    ["adjusted", "replaced", "cancelled"].includes(String(row.status)) ||
    (allocations.length > 0 && total <= 0n) ||
    sum > total
  )
    invalid = true;
  return {
    state: invalid
      ? "NEEDS_RECONCILIATION"
      : sum === 0n
        ? "NONE"
        : sum < total
          ? "PARTIAL"
          : "FULL",
    allocated: denied ? null : invoiceAmount(sum, String(row.currency)),
    remaining: denied ? null : invoiceAmount(total - sum, String(row.currency)),
    currency: row.currency,
    source_valid: !invalid,
    denied,
    reason: invalid
      ? "Nguồn tiền/tiền tệ/quan hệ điều chỉnh cần đối soát."
      : "Theo phân bổ chứng từ thu/chi; không suy ra đã đến hạn.",
  };
}
export async function invoiceDossier(
  db: InvoiceDb,
  p: ContractPrincipal,
  row: Row,
) {
  const links = await invoiceBusinessLinks(db, p, row),
    files = (
      await db.query(
        "select id,media_type,purpose,original from local_invoice_files where invoice_id=$1",
        [row.id],
      )
    ).rows,
    contracts = (
      await db.query(
        "select * from local_invoice_contract_allocations where invoice_id=$1",
        [row.id],
      )
    ).rows;
  const assessments = (
      await db.query(
        "select * from local_invoice_checklist where invoice_id=$1",
        [row.id],
      )
    ).rows,
    payment = await invoicePaymentReadModel(db, row, p);
  let validContract = false;
  for (const c of contracts) {
    try {
      const current = await invoiceBusinessSource(
        db,
        p,
        row,
        "CONTRACT",
        c.contract_id,
      );
      if (
        current.revision === c.source_revision &&
        current.snapshot.state !== "draft"
      )
        validContract = true;
    } catch {
      /* Not valid/visible evidence. */
    }
  }
  const presence: Record<string, boolean> = {
    XML: files.some(
      (f) =>
        f.original &&
        f.purpose === "INVOICE_ORIGINAL" &&
        f.media_type === "application/xml",
    ),
    PDF: files.some(
      (f) =>
        f.original &&
        f.purpose === "INVOICE_ORIGINAL" &&
        f.media_type === "application/pdf",
    ),
    CONTRACT_OR_COST:
      validContract ||
      links.some((l) => !l.stale && ["CONTRACT", "COST"].includes(l.kind) &&
        (l.source_type !== "BUSINESS_TRANSACTION" || (l.current_snapshot as Row | undefined)?.state === "CONFIRMED")),
    APPENDIX: links.some((l) => !l.stale && l.kind === "APPENDIX"),
    DELIVERY: links.some(
      (l) =>
        !l.stale &&
        l.kind === "DELIVERY" &&
        (l.source_type === "EXTERNAL" ||
          (l.current_snapshot as Row | undefined)?.state === "DELIVERED"),
    ),
    ACCEPTANCE: links.some(
      (l) =>
        !l.stale &&
        l.kind === "ACCEPTANCE" &&
        l.verification_state !== "INTERNAL_EDITABLE",
    ),
    PAYMENT_EVIDENCE: payment.state !== "NONE" && payment.source_valid,
  };
  const checklist = checklistItems.map((item) => {
    const a = assessments.find((r) => r.item === item);
    return {
      item,
      assessment: a?.assessment ?? "NOT_ASSESSED",
      present: presence[item],
      reason: a?.reason ?? null,
      reviewed_by: a?.reviewed_by ?? null,
      reviewed_at: a?.reviewed_at ?? null,
      missing: a?.assessment === "REQUIRED" && !presence[item],
    };
  });
  return {
    business_links: links,
    payment,
    checklist,
    missing_xml: !presence.XML,
    missing_pdf: !presence.PDF,
    missing_business: !presence.CONTRACT_OR_COST,
    checklist_unassessed: checklist.some(
      (c) => c.assessment === "NOT_ASSESSED",
    ),
    checklist_missing: checklist.some((c) => c.missing),
  };
}
export async function invoiceContractCash(db: InvoiceDb, c: Row, p: ContractPrincipal) {
  const unknown = (reason: string) => ({
    known: false,
    amount: null,
    basis: "UNKNOWN",
    reason,
  });
  if (!(await invoiceCashPermission(db,p,"ORDER_PAYMENT"))) return unknown("Không có quyền đọc nguồn tiền.");
  if (!c.order_id) return unknown("Chưa có đơn hàng có chứng từ thu.");
  const order = (
    await db.query("select * from local_orders o where id=$1 and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=o.id)", [c.order_id])
  ).rows[0];
  if (
    !order ||
    order.manager_id !== c.manager_id ||
    order.tenant_id !== c.tenant_id
  )
    return unknown("Đơn hàng không khớp người phụ trách/đơn vị.");
  try { requireContract(p,order); } catch { return unknown("Không có quyền nguồn tiền của đơn hàng."); }
  const count = (
    await db.query(
      "select count(*)::int n from local_contracts where order_id=$1",
      [c.order_id],
    )
  ).rows[0].n;
  if (count === 1) {
    const total = (
      await db.query(
        "select coalesce(sum(payment_amount),0)::text amount from local_order_payments p where order_id=$1 and not exists(select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=p.id)",
        [c.order_id],
      )
    ).rows[0].amount;
    return {
      known: true,
      amount: String(total),
      basis: "UNIQUE_CONTRACT_ORDER_RECEIPTS",
      reason: "Chứng từ thu đơn hàng; loại giao dịch phản chiếu.",
    };
  }
  const splits = (
    await db.query(
      "select s.*,a.invoice_id,a.amount allocation_amount,a.currency allocation_currency,a.source_id,a.source_revision allocation_revision from local_invoice_contract_payment_splits s join local_invoice_payment_allocations a on a.id=s.payment_allocation_id join local_contracts c on c.id=s.contract_id where c.order_id=$1 and a.source_type='ORDER_PAYMENT'",
      [c.order_id],
    )
  ).rows;
  if (!splits.length)
    return unknown("Đơn hàng có nhiều hợp đồng; cần chia khoản thu rõ ràng.");
  let total = 0n;
  for (const s of splits) {
    const source = (
      await db.query(
        "select p.*,o.manager_id,o.tenant_id from local_order_payments p join local_orders o on o.id=p.order_id where p.id=$1 and p.order_id=$2 and not exists(select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=p.id)",
        [s.source_id, c.order_id],
      )
    ).rows[0];
    if (
      !source ||
      digest(source) !== s.source_revision ||
      digest(source) !== s.allocation_revision ||
      s.currency !== "VND" || s.allocation_currency !== "VND" || source.tenant_id !== c.tenant_id || source.manager_id !== c.manager_id
    )
      return unknown(
        "Phần chia khoản thu đã thay đổi hoặc nguồn không còn hợp lệ; cần đối soát.",
      );
    const invoice=(await db.query("select * from local_einvoices where id=$1",[s.invoice_id])).rows[0];
    if (!invoice || !(await invoicePaymentReadModel(db,invoice,p)).source_valid) return unknown("Phân bổ tiền/phần chia không còn hợp lệ; cần đối soát.");
    if (s.contract_id === c.id) total += invoiceMinor(s.amount, "VND");
  }
  const receiptTotal = (
    await db.query(
      "select coalesce(sum(payment_amount),0)::text amount from local_order_payments p where order_id=$1 and not exists(select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=p.id)",
      [c.order_id],
    )
  ).rows[0].amount;
  const splitTotal = (
    await db.query(
      "select coalesce(sum(s.amount),0)::text amount from local_invoice_contract_payment_splits s join local_contracts c on c.id=s.contract_id where c.order_id=$1",
      [c.order_id],
    )
  ).rows[0].amount;
  const covered =
    invoiceMinor(receiptTotal, "VND") === invoiceMinor(splitTotal, "VND");
  return {
    known: covered,
    allocated_known: true,
    amount: invoiceAmount(total, "VND"),
    basis: covered
      ? "EXPLICIT_CONTRACT_PAYMENT_SPLITS"
      : "EXPLICIT_CONTRACT_PAYMENT_SPLITS_PARTIAL",
    reason:
      "Chỉ phần thu đã phân chia rõ; tổng thu toàn hợp đồng chưa xác định nếu còn khoản chưa chia.",
  };
}
