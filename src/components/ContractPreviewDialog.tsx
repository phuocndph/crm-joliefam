import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Download } from "lucide-react";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
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
  const { settings: companySettings } = useTemplateSettings();

  if (!contract) return null;

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("vi-VN") : "—";
  const status = statusMap[contract.status] || statusMap.draft;
  const items = Array.isArray(contract.items) ? contract.items : [];
  const articles = Array.isArray(contract.articles) ? contract.articles : [];
  const legalBasis = Array.isArray(contract.legal_basis) ? contract.legal_basis : [];
  const seller = contract.seller_info || {};
  const buyer = contract.buyer_info || {};

  const subtotal = contract.subtotal || items.reduce((s: number, it: any) => s + (it.price || 0) * (it.quantity || 1), 0);
  const vatAmount = contract.vat_amount || 0;
  const totalAmount = contract.total_amount || subtotal + vatAmount;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>${contract.title} - ${contract.contract_number}</title>
    <style>
      @page { margin: 20mm; }
      body { font-family: 'Times New Roman', Times, serif; padding: 20px; font-size: 13px; line-height: 1.6; color: #000; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 6px 8px; }
      th { background: #f0f0f0; }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
      .mt-4 { margin-top: 16px; }
      .whitespace-pre-wrap { white-space: pre-wrap; }
    </style></head><body>${content.innerHTML}</body></html>`);
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {contract.contract_number}
            <Badge className={status.color}>{status.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />In</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadImage}><Download className="h-4 w-4 mr-1" />Tải ảnh</Button>
        </div>

        <div ref={printRef} className="bg-white p-8 rounded-lg border space-y-5 text-sm" style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", lineHeight: 1.7 }}>
          {/* Header */}
          <div className="text-center space-y-1">
            <p className="font-bold text-sm">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="font-bold text-sm" style={{ textDecoration: "underline" }}>Độc lập – Tự do – Hạnh phúc</p>
            <p className="text-xs text-gray-500 mt-2">————————</p>
          </div>

          <div className="text-center mt-4">
            <h2 className="text-lg font-bold" style={{ color: "#1a56db" }}>{contract.title || "HỢP ĐỒNG KINH TẾ"}</h2>
            <p className="text-sm">Số: <strong>{contract.contract_number}</strong></p>
            {contract.contract_date && <p className="text-xs italic">Ngày {formatDate(contract.contract_date)}</p>}
          </div>

          {/* Legal basis */}
          {legalBasis.length > 0 && (
            <div>
              {legalBasis.map((l: string, i: number) => (
                <p key={i} className="italic text-xs">- {l}</p>
              ))}
            </div>
          )}

          <p className="font-bold text-center">Hai bên cùng thỏa thuận ký kết hợp đồng với các điều khoản sau:</p>

          {/* Party A - Seller */}
          <div className="p-3 border rounded">
            <p className="font-bold mb-1">BÊN A (Bên bán):</p>
            <p><strong>Công ty:</strong> {seller.company_name || companySettings.companyName}</p>
            <p><strong>Địa chỉ:</strong> {seller.address || companySettings.address}</p>
            {(seller.headquarters || companySettings.headquarters) && <p><strong>Trụ sở:</strong> {seller.headquarters || companySettings.headquarters}</p>}
            <p><strong>Điện thoại:</strong> {seller.phone || companySettings.phone}</p>
            {(seller.tax_code || companySettings.taxCode) && <p><strong>Mã số thuế:</strong> {seller.tax_code || companySettings.taxCode}</p>}
            {(seller.bank_info || companySettings.bankInfo) && <p><strong>Ngân hàng:</strong> {seller.bank_info || companySettings.bankInfo}</p>}
          </div>

          {/* Party B - Buyer */}
          <div className="p-3 border rounded">
            <p className="font-bold mb-1">BÊN B (Bên mua):</p>
            <p><strong>Tên:</strong> {contract.customers?.name || "—"}</p>
            {buyer.representative && <p><strong>Đại diện:</strong> {buyer.representative} {buyer.position ? `- ${buyer.position}` : ""}</p>}
            {(contract.customers?.company) && <p><strong>Công ty:</strong> {contract.customers.company}</p>}
            <p><strong>Địa chỉ:</strong> {buyer.address || contract.customers?.address || "—"}</p>
            {buyer.tax_code && <p><strong>Mã số thuế:</strong> {buyer.tax_code}</p>}
            <p><strong>Điện thoại:</strong> {buyer.phone || contract.customers?.phone || "—"}</p>
          </div>

          {/* Articles with product table in first article */}
          {articles.length > 0 ? (
            articles.map((article: any, idx: number) => (
              <div key={idx}>
                <p className="font-bold mt-4">{article.title}</p>
                <div className="whitespace-pre-wrap text-sm">{article.content}</div>

                {/* Insert product table after first article */}
                {idx === 0 && items.length > 0 && (
                  <div className="mt-3">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr style={{ backgroundColor: "#f3f4f6" }}>
                          <th className="border border-gray-400 p-2 text-center w-10">TT</th>
                          <th className="border border-gray-400 p-2 text-left">Tên sản phẩm</th>
                          <th className="border border-gray-400 p-2 text-left">Kích thước/ Quy cách</th>
                          <th className="border border-gray-400 p-2 text-center w-12">SL</th>
                          <th className="border border-gray-400 p-2 text-right w-24">Đơn giá</th>
                          <th className="border border-gray-400 p-2 text-right w-28">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: any, i: number) => (
                          <tr key={i}>
                            <td className="border border-gray-400 p-2 text-center">{item.stt || i + 1}</td>
                            <td className="border border-gray-400 p-2">{item.name || "—"}</td>
                            <td className="border border-gray-400 p-2">{item.specifications || item.description || "—"}</td>
                            <td className="border border-gray-400 p-2 text-center">{item.quantity || 1}</td>
                            <td className="border border-gray-400 p-2 text-right">{formatCurrency(item.price || 0)}</td>
                            <td className="border border-gray-400 p-2 text-right">{formatCurrency((item.price || 0) * (item.quantity || 1))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={5} className="border border-gray-400 p-2 text-right font-bold">TỔNG CỘNG:</td>
                          <td className="border border-gray-400 p-2 text-right font-bold">{formatCurrency(subtotal)}</td>
                        </tr>
                        {contract.include_vat && (
                          <>
                            <tr>
                              <td colSpan={5} className="border border-gray-400 p-2 text-right">VAT ({contract.vat_rate || 8}%):</td>
                              <td className="border border-gray-400 p-2 text-right">{formatCurrency(vatAmount)}</td>
                            </tr>
                            <tr>
                              <td colSpan={5} className="border border-gray-400 p-2 text-right font-bold">TỔNG SAU VAT:</td>
                              <td className="border border-gray-400 p-2 text-right font-bold" style={{ color: "#1a56db" }}>{formatCurrency(totalAmount)}</td>
                            </tr>
                          </>
                        )}
                        {!contract.include_vat && (
                          <tr>
                            <td colSpan={5} className="border border-gray-400 p-2 text-right font-bold">TỔNG GIÁ TRỊ HỢP ĐỒNG:</td>
                            <td className="border border-gray-400 p-2 text-right font-bold" style={{ color: "#1a56db" }}>{formatCurrency(totalAmount)}</td>
                          </tr>
                        )}
                      </tfoot>
                    </table>

                    <div className="mt-2 text-sm">
                      <p><strong>Tiền cọc ({contract.deposit_percentage || 70}%):</strong> {formatCurrency(contract.deposit_amount || 0)}</p>
                      <p><strong>Còn lại:</strong> {formatCurrency(totalAmount - (contract.deposit_amount || 0))}</p>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            /* Fallback: old-style display if no articles */
            <>
              {items.length > 0 && (
                <div>
                  <h3 className="font-bold mb-2">Danh sách sản phẩm / dịch vụ:</h3>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr style={{ backgroundColor: "#f3f4f6" }}>
                        <th className="border p-2">STT</th>
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
                          <td className="border p-2 text-center">{i + 1}</td>
                          <td className="border p-2">{item.name || "—"}</td>
                          <td className="border p-2">{item.specifications || item.description || "—"}</td>
                          <td className="border p-2 text-right">{item.quantity || 1}</td>
                          <td className="border p-2 text-right">{formatCurrency(item.price || 0)}</td>
                          <td className="border p-2 text-right">{formatCurrency((item.price || 0) * (item.quantity || 1))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 p-3 rounded" style={{ backgroundColor: "#f9fafb" }}>
                    <p className="font-bold">Tổng: {formatCurrency(totalAmount)}</p>
                    <p>Đặt cọc ({contract.deposit_percentage || 70}%): {formatCurrency(contract.deposit_amount || 0)}</p>
                    <p>Còn lại: {formatCurrency(totalAmount - (contract.deposit_amount || 0))}</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Notes */}
          {contract.notes && (
            <div>
              <p className="font-bold">Ghi chú:</p>
              <p className="whitespace-pre-wrap">{contract.notes}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-8 mt-8 text-center" style={{ borderTop: "1px solid #e5e7eb" }}>
            <div>
              <p className="font-bold">ĐẠI DIỆN BÊN A</p>
              <p className="text-xs italic text-gray-500 mt-1">(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
            </div>
            <div>
              <p className="font-bold">ĐẠI DIỆN BÊN B</p>
              <p className="text-xs italic text-gray-500 mt-1">(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
