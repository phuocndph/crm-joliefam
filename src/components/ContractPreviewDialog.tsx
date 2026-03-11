import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Download } from "lucide-react";
import html2canvas from "html2canvas";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "Nháp", color: "bg-muted text-muted-foreground" },
  active: { label: "Đang hiệu lực", color: "bg-blue-100 text-blue-800" },
  completed: { label: "Hoàn thành", color: "bg-green-100 text-green-800" },
  cancelled: { label: "Đã hủy", color: "bg-red-100 text-red-800" },
};

export const ContractPreviewDialog = ({ open, onOpenChange, contract }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!contract) return null;

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("vi-VN") : "—";
  const status = statusMap[contract.status] || statusMap.draft;
  const items = Array.isArray(contract.items) ? contract.items : [];
  const terms = Array.isArray(contract.terms) ? contract.terms : [];

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>Hợp đồng ${contract.contract_number}</title><style>body{font-family:Arial,sans-serif;padding:40px;font-size:14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.text-right{text-align:right}</style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleDownloadImage = async () => {
    if (!printRef.current) return;
    const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = `${contract.contract_number}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Hợp đồng {contract.contract_number}
            <Badge className={status.color}>{status.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />In</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadImage}><Download className="h-4 w-4 mr-1" />Tải ảnh</Button>
        </div>

        <div ref={printRef} className="bg-white p-6 rounded-lg border space-y-6 text-sm">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-primary">HỢP ĐỒNG CUNG CẤP DỊCH VỤ</h2>
            <p className="text-muted-foreground">Số: {contract.contract_number}</p>
            {contract.title && <p className="font-medium">{contract.title}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-semibold mb-1">Khách hàng:</p>
              <p>{contract.customers?.name || "—"}</p>
              {contract.customers?.company && <p className="text-muted-foreground">{contract.customers.company}</p>}
              {contract.customers?.phone && <p>{contract.customers.phone}</p>}
              {contract.customers?.address && <p>{contract.customers.address}</p>}
            </div>
            <div className="text-right">
              <p><span className="font-semibold">Ngày ký:</span> {formatDate(contract.contract_date)}</p>
              {contract.start_date && <p><span className="font-semibold">Bắt đầu:</span> {formatDate(contract.start_date)}</p>}
              {contract.end_date && <p><span className="font-semibold">Kết thúc:</span> {formatDate(contract.end_date)}</p>}
            </div>
          </div>

          {items.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Danh sách sản phẩm / dịch vụ:</h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="border p-2 text-left">STT</th>
                    <th className="border p-2 text-left">Tên sản phẩm</th>
                    <th className="border p-2 text-left">Quy cách</th>
                    <th className="border p-2 text-right">SL</th>
                    <th className="border p-2 text-right">Đơn giá</th>
                    <th className="border p-2 text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, i: number) => (
                    <tr key={i}>
                      <td className="border p-2">{i + 1}</td>
                      <td className="border p-2">{item.name || "—"}</td>
                      <td className="border p-2">{item.specifications || item.description || "—"}</td>
                      <td className="border p-2 text-right">{item.quantity || 1}</td>
                      <td className="border p-2 text-right">{formatCurrency(item.price || 0)}</td>
                      <td className="border p-2 text-right">{formatCurrency((item.price || 0) * (item.quantity || 1))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-muted/50 p-4 rounded-lg space-y-1">
            <div className="flex justify-between font-semibold text-base">
              <span>Tổng giá trị hợp đồng:</span>
              <span className="text-primary">{formatCurrency(contract.total_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Đặt cọc ({contract.deposit_percentage || 70}%):</span>
              <span>{formatCurrency(contract.deposit_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Còn lại:</span>
              <span>{formatCurrency((contract.total_amount || 0) - (contract.deposit_amount || 0))}</span>
            </div>
          </div>

          {terms.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Điều khoản hợp đồng:</h3>
              <ol className="list-decimal ml-5 space-y-1">
                {terms.map((term: string, i: number) => (
                  <li key={i}>{term}</li>
                ))}
              </ol>
            </div>
          )}

          {contract.notes && (
            <div>
              <h3 className="font-semibold mb-1">Ghi chú:</h3>
              <p className="whitespace-pre-wrap">{contract.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-8 pt-8 text-center">
            <div>
              <p className="font-semibold">BÊN A</p>
              <p className="text-muted-foreground text-xs mt-1">(Ký, ghi rõ họ tên)</p>
            </div>
            <div>
              <p className="font-semibold">BÊN B</p>
              <p className="text-muted-foreground text-xs mt-1">(Ký, ghi rõ họ tên)</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
