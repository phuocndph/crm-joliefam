import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { invoiceRequest } from "@/lib/invoice-workspace-api";
import { isLocalBackend } from "@/lib/runtime-config";
import { Link } from "react-router-dom";
export function ContractInvoiceSummary({ contractId }: { contractId: string }) {
  const query = useQuery({
    queryKey: ["invoice-workspace", "contract-summary", contractId],
    queryFn: () =>
      invoiceRequest<{
        total: string;
        reserved: string;
        invoiced: string;
        remaining: string;
        rows: Record<string, unknown>[];
        hidden_count: number;
        contract_snapshot_value: string;
        remaining_to_invoice: string;
        cash_receipts: {
          known: boolean;
          amount: string | null;
          basis: string;
          reason: string;
        };
        invoice_settlement_allocated: string | null;
        remaining_after_receipts: string | null;
        due_receivable: { known: boolean; reason: string };
        effective_contract_value: { known: boolean; reason: string };
        dossiers: {
          invoice_id: string;
          missing_xml: boolean;
          missing_pdf: boolean;
          missing_business: boolean;
          checklist_missing: boolean;
          checklist_unassessed: boolean;
          lineage: { id: string; invoice_id: string; original_id: string; kind: string }[];
        }[];
      }>("/contracts/" + encodeURIComponent(contractId) + "/summary"),
    enabled: isLocalBackend() && !!contractId,
  });
  if (!isLocalBackend()) return null;
  return (
    <section className="my-3 space-y-2 rounded border p-3 print:hidden">
      <h3 className="font-semibold">Hóa đơn & thanh toán</h3>
      {query.isLoading ? (
        <p className="text-sm">Đang tải phân bổ hóa đơn…</p>
      ) : query.isError ? (
        <div role="alert" className="text-sm">
          {query.error.message}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
          >
            Thử lại
          </Button>
        </div>
      ) : (
        query.data && (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p>Hợp đồng: {query.data.total} VND</p>
              <p>Đã phân bổ: {query.data.invoiced} VND</p>
              <p>Nháp giữ chỗ: {query.data.reserved} VND</p>
              <p>Còn để lập hóa đơn: {query.data.remaining_to_invoice} VND</p>
              <p>
                Đã thu theo chứng từ:{" "}
                {query.data.cash_receipts.known
                  ? query.data.cash_receipts.amount + " VND"
                  : "Chưa xác định đầy đủ"}
              </p>
              <p>
                Tiền đã chia cho hợp đồng:{" "}
                {query.data.invoice_settlement_allocated == null ? "Chưa xác định; cần đối soát" : query.data.invoice_settlement_allocated + " VND"}
              </p>
              <p>
                Số dư sau thu:{" "}
                {query.data.remaining_after_receipts == null
                  ? "Chưa xác định"
                  : query.data.remaining_after_receipts + " VND"}
              </p>
            </div>
            <p className="text-xs">{query.data.cash_receipts.reason}</p>
            <p className="text-xs">
              Đến hạn thu: chưa xác định. {query.data.due_receivable.reason}
            </p>
            <p className="text-xs">
              {query.data.effective_contract_value.reason}
            </p>
            {query.data.dossiers.some(
              (d) =>
                d.missing_xml ||
                d.missing_pdf ||
                d.missing_business ||
                d.checklist_missing ||
                d.checklist_unassessed,
            ) && (
              <p className="text-sm text-amber-700">
                Có hóa đơn thiếu XML/PDF, hồ sơ nghiệp vụ hoặc mục chưa đánh
                giá. Mở sổ hóa đơn để xem checklist và chuỗi điều chỉnh/thay
                thế.
              </p>
            )}
            {query.data.rows.map((r) => (
              <p key={String(r.id)} className="text-sm">
                {String(r.invoice_number ?? "Nháp CRM")} · {String(r.amount)}{" "}
                {String(r.currency)} · {r.reservation ? "Giữ chỗ" : "Phân bổ"} ·{" "}
                {String(r.review_state)}
              </p>
            ))}
            {query.data.dossiers.some((d) => d.lineage.length > 0) && (
              <details className="rounded border p-2 text-sm">
                <summary>Quan hệ điều chỉnh / thay thế đã đối chiếu</summary>
                {query.data.dossiers.filter((d) => d.lineage.length > 0).map((d) => (
                  <div key={d.invoice_id} className="mt-2">
                    <p className="font-medium">
                      {String(query.data.rows.find((r) => r.invoice_id === d.invoice_id)?.invoice_number ?? "Hóa đơn đã liên kết")} · {d.lineage.length} quan hệ
                    </p>
                    {d.lineage.map((r) => (
                      <p key={r.id}>
                        {r.invoice_id === d.invoice_id
                          ? r.kind === "REPLACES" ? "Thay thế hóa đơn gốc" : "Điều chỉnh hóa đơn gốc"
                          : r.kind === "REPLACES" ? "Đã có hóa đơn thay thế" : "Đã có hóa đơn điều chỉnh"}
                      </p>
                    ))}
                  </div>
                ))}
              </details>
            )}
            {query.data.hidden_count > 0 && (
              <p className="text-sm">
                Một số chi tiết cần quyền doanh nghiệp hóa đơn tương ứng.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Hóa đơn/giữ chỗ và tiền đã thu là hai sự kiện riêng. Tiền thu được
              đối chiếu từ chứng từ, không tính lại vào sổ tiền.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link
                to={
                  "/einvoices?" +
                  new URLSearchParams({
                    contract_id: contractId,
                    ...(query.data.rows[0]?.company_id
                      ? { company_id: String(query.data.rows[0].company_id) }
                      : {}),
                  })
                }
              >
                Mở hóa đơn & hồ sơ của hợp đồng
              </Link>
            </Button>
          </>
        )
      )}
    </section>
  );
}
