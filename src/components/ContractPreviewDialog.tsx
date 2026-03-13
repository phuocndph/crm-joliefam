import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Download, FileText, FileDown, ClipboardCheck, Receipt } from "lucide-react";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, AlignmentType, BorderStyle, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import { HandoverReportDialog } from "@/components/HandoverReportDialog";
import { PaymentRequestDialog } from "@/components/PaymentRequestDialog";
import { numberToVietnameseCurrency } from "@/lib/numberToText";

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
  const { toast } = useToast();
  const [showHandover, setShowHandover] = useState(false);
  const [showPaymentRequest, setShowPaymentRequest] = useState(false);

  if (!contract) return null;

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatCurrencyNoSymbol = (val: number) => (val || 0).toLocaleString("vi-VN");
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
  const depositAmount = contract.deposit_amount || 0;
  const depositPercentage = contract.deposit_percentage || 0;
  const depositMode = seller.deposit_mode || (depositPercentage > 0 ? "percent" : "amount");
  const remainingAmount = totalAmount - depositAmount;

  // Generate dynamic payment terms for Điều 3
  const generatePaymentTermsHTML = () => {
    if (!depositAmount || depositAmount <= 0) {
      // No deposit - single payment
      return (
        <div className="space-y-1">
          <p>- Bên B thanh toán toàn bộ giá trị hợp đồng sau khi Bên A hoàn thành giao hàng và lắp đặt. Số tiền {formatCurrencyNoSymbol(totalAmount)}đ ({numberToVietnameseCurrency(totalAmount)} ./.)</p>
          <p>- Hình thức thanh toán: Tiền mặt hoặc chuyển khoản.</p>
        </div>
      );
    }
    
    const dot1Text = depositMode === "percent"
      ? `Bên B thanh toán ${depositPercentage}% giá trị hợp đồng ngay khi ký hợp đồng. Số tiền ${formatCurrencyNoSymbol(depositAmount)}đ (${numberToVietnameseCurrency(depositAmount)} ./.)`
      : `Bên B thanh toán ${formatCurrencyNoSymbol(depositAmount)}đ giá trị hợp đồng ngay khi ký hợp đồng. Số tiền ${formatCurrencyNoSymbol(depositAmount)}đ (${numberToVietnameseCurrency(depositAmount)} ./.)`;
    
    const remainingPct = depositMode === "percent" ? (100 - depositPercentage) : 0;
    const dot2Text = depositMode === "percent"
      ? `Bên B thanh toán ${remainingPct}% còn lại sau khi Bên A hoàn thành giao hàng và lắp đặt. Số tiền ${formatCurrencyNoSymbol(remainingAmount)}đ (Bằng chữ: ${numberToVietnameseCurrency(remainingAmount)} ./.)`
      : `Bên B thanh toán số tiền còn lại sau khi Bên A hoàn thành giao hàng và lắp đặt. Số tiền ${formatCurrencyNoSymbol(remainingAmount)}đ (Bằng chữ: ${numberToVietnameseCurrency(remainingAmount)} ./.)`;

    return (
      <div className="space-y-1">
        <p>- Đợt 1: {dot1Text}</p>
        <p>- Đợt 2: {dot2Text}</p>
        <p>- Hình thức thanh toán: Tiền mặt hoặc chuyển khoản.</p>
      </div>
    );
  };

  // Generate payment terms text lines for Word export
  const generatePaymentTermsLines = (): string[] => {
    if (!depositAmount || depositAmount <= 0) {
      return [
        `- Bên B thanh toán toàn bộ giá trị hợp đồng sau khi Bên A hoàn thành giao hàng và lắp đặt. Số tiền ${formatCurrencyNoSymbol(totalAmount)}đ (${numberToVietnameseCurrency(totalAmount)} ./.)`,
        "- Hình thức thanh toán: Tiền mặt hoặc chuyển khoản.",
      ];
    }
    const dot1 = depositMode === "percent"
      ? `- Đợt 1: Bên B thanh toán ${depositPercentage}% giá trị hợp đồng ngay khi ký hợp đồng. Số tiền ${formatCurrencyNoSymbol(depositAmount)}đ (${numberToVietnameseCurrency(depositAmount)} ./.)`
      : `- Đợt 1: Bên B thanh toán ${formatCurrencyNoSymbol(depositAmount)}đ giá trị hợp đồng ngay khi ký hợp đồng. Số tiền ${formatCurrencyNoSymbol(depositAmount)}đ (${numberToVietnameseCurrency(depositAmount)} ./.)`;
    const remainingPct = depositMode === "percent" ? (100 - depositPercentage) : 0;
    const dot2 = depositMode === "percent"
      ? `- Đợt 2: Bên B thanh toán ${remainingPct}% còn lại sau khi Bên A hoàn thành giao hàng và lắp đặt. Số tiền ${formatCurrencyNoSymbol(remainingAmount)}đ (Bằng chữ: ${numberToVietnameseCurrency(remainingAmount)} ./.)`
      : `- Đợt 2: Bên B thanh toán số tiền còn lại sau khi Bên A hoàn thành giao hàng và lắp đặt. Số tiền ${formatCurrencyNoSymbol(remainingAmount)}đ (Bằng chữ: ${numberToVietnameseCurrency(remainingAmount)} ./.)`;
    return [dot1, dot2, "- Hình thức thanh toán: Tiền mặt hoặc chuyển khoản."];
  };

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

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    try {
      toast({ title: "Đang tạo PDF..." });
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      const margin = 10;
      // Fit everything on a single page: calculate page height based on content aspect ratio
      const pdfWidth = 210; // A4 width in mm
      const contentWidth = pdfWidth - margin * 2;
      const contentHeight = (imgHeight * contentWidth) / imgWidth;
      const pdfHeight = contentHeight + margin * 2;

      const pdf = new jsPDF("p", "mm", [pdfWidth, pdfHeight]);
      pdf.addImage(imgData, "JPEG", margin, margin, contentWidth, contentHeight);

      pdf.save(`${contract.contract_number}.pdf`);
      toast({ title: "Đã tải PDF thành công!" });
    } catch (err) {
      console.error("PDF export error:", err);
      toast({ title: "Lỗi tạo PDF", variant: "destructive" });
    }
  };

  const handleDownloadWord = async () => {
    try {
      toast({ title: "Đang tạo file Word..." });

      const sellerName = seller.company_name || companySettings.companyName;
      const sellerAddress = seller.address || companySettings.address;
      const sellerPhone = seller.phone || companySettings.phone;
      const sellerTaxCode = seller.tax_code || companySettings.taxCode;
      const sellerBank = seller.bank_info || companySettings.bankInfo;
      const sellerHQ = seller.headquarters || companySettings.headquarters;

      const buyerName = buyer.company_name || contract.customers?.company || contract.customers?.name || "—";
      const buyerAddress = buyer.address || contract.customers?.address || "—";
      const buyerPhone = buyer.phone || contract.customers?.phone || "—";
      const buyerBankName = buyer.bank_name || "";
      const buyerBankAccount = buyer.bank_account || "";
      const buyerBankHolder = buyer.bank_holder || "";

      const borderStyle = {
        top: { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 },
        right: { style: BorderStyle.SINGLE, size: 1 },
      };

      // Build product table rows
      const headerRow = new DocxTableRow({
        children: ["TT", "Tên sản phẩm", "Kích thước", "SL", "Đơn giá", "Thành tiền"].map((text, idx) =>
          new DocxTableCell({
            children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, font: "Times New Roman" })], alignment: AlignmentType.CENTER })],
            borders: borderStyle,
            width: idx === 0 ? { size: 600, type: WidthType.DXA } : idx === 3 ? { size: 700, type: WidthType.DXA } : { size: 1800, type: WidthType.DXA },
          })
        ),
      });

      const itemRows = items.map((item: any, i: number) =>
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(i + 1), size: 20, font: "Times New Roman" })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.name || "—", size: 20, font: "Times New Roman" })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.specifications || item.description || "—", size: 20, font: "Times New Roman" })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(item.quantity || 1), size: 20, font: "Times New Roman" })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(item.price || 0), size: 20, font: "Times New Roman" })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency((item.price || 0) * (item.quantity || 1)), size: 20, font: "Times New Roman" })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        })
      );

      // Total row
      const totalRow = new DocxTableRow({
        children: [
          new DocxTableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "TỔNG GIÁ TRỊ HỢP ĐỒNG:", bold: true, size: 20, font: "Times New Roman" })], alignment: AlignmentType.LEFT })],
            columnSpan: 5, borders: borderStyle,
          }),
          new DocxTableCell({
            children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(totalAmount), bold: true, size: 20, font: "Times New Roman" })], alignment: AlignmentType.LEFT })],
            borders: borderStyle,
          }),
        ],
      });

      const tableRows = [headerRow, ...itemRows, totalRow];

      // Add VAT rows if applicable
      if (contract.include_vat) {
        const subtotalRow = new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "TỔNG CỘNG:", bold: true, size: 20, font: "Times New Roman" })], alignment: AlignmentType.LEFT })], columnSpan: 5, borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(subtotal), bold: true, size: 20, font: "Times New Roman" })], alignment: AlignmentType.LEFT })], borders: borderStyle }),
          ],
        });
        const vatRow = new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: `VAT (${contract.vat_rate || 8}%):`, size: 20, font: "Times New Roman" })], alignment: AlignmentType.LEFT })], columnSpan: 5, borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(vatAmount), size: 20, font: "Times New Roman" })], alignment: AlignmentType.LEFT })], borders: borderStyle }),
          ],
        });
        // Replace totalRow with subtotal + vat + total
        tableRows.pop();
        tableRows.push(subtotalRow, vatRow, totalRow);
      }

      // Build document sections
      const children: any[] = [
        new Paragraph({ children: [new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 24, font: "Times New Roman" })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "Độc lập – Tự do – Hạnh phúc", bold: true, size: 24, font: "Times New Roman", underline: {} })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "————————", size: 20, font: "Times New Roman" })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: contract.title || "HỢP ĐỒNG KINH TẾ", bold: true, size: 32, font: "Times New Roman", color: "1a56db" })], alignment: AlignmentType.CENTER, spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Số: ${contract.contract_number}`, size: 22, font: "Times New Roman" })], alignment: AlignmentType.CENTER }),
      ];

      if (contract.contract_date) {
        children.push(new Paragraph({ children: [new TextRun({ text: `Ngày ${formatDate(contract.contract_date)}`, italics: true, size: 20, font: "Times New Roman" })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
      }

      // Legal basis
      legalBasis.forEach((l: string) => {
        children.push(new Paragraph({ children: [new TextRun({ text: `- ${l}`, italics: true, size: 20, font: "Times New Roman" })], spacing: { after: 40 } }));
      });

      children.push(new Paragraph({ children: [new TextRun({ text: "Hai bên cùng thỏa thuận ký kết hợp đồng với các điều khoản sau:", bold: true, size: 22, font: "Times New Roman" })], alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } }));

      // Party A
      children.push(
        new Paragraph({ children: [new TextRun({ text: "BÊN A (Bên bán):", bold: true, size: 22, font: "Times New Roman" })], spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Công ty: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: sellerName, size: 20, font: "Times New Roman" })] }),
        new Paragraph({ children: [new TextRun({ text: "Địa chỉ: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: sellerAddress, size: 20, font: "Times New Roman" })] }),
      );
      if (sellerHQ) children.push(new Paragraph({ children: [new TextRun({ text: "Trụ sở: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: sellerHQ, size: 20, font: "Times New Roman" })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: "Điện thoại: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: sellerPhone, size: 20, font: "Times New Roman" })] }));
      if (sellerTaxCode) children.push(new Paragraph({ children: [new TextRun({ text: "Mã số thuế: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: sellerTaxCode, size: 20, font: "Times New Roman" })] }));
      if (sellerBank) children.push(new Paragraph({ children: [new TextRun({ text: "Ngân hàng: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: sellerBank, size: 20, font: "Times New Roman" })] }));

      // Party B
      children.push(
        new Paragraph({ children: [new TextRun({ text: "BÊN B (Bên mua):", bold: true, size: 22, font: "Times New Roman" })], spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Công ty/Cá nhân: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: buyerName, size: 20, font: "Times New Roman" })] }),
      );
      if (buyer.representative) children.push(new Paragraph({ children: [new TextRun({ text: "Đại diện: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: `${buyer.representative}${buyer.position ? ` - ${buyer.position}` : ""}`, size: 20, font: "Times New Roman" })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: "Địa chỉ: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: buyerAddress, size: 20, font: "Times New Roman" })] }));
      if (buyer.tax_code) children.push(new Paragraph({ children: [new TextRun({ text: "Mã số thuế: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: buyer.tax_code, size: 20, font: "Times New Roman" })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: "Điện thoại: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: buyerPhone, size: 20, font: "Times New Roman" })] }));
      if (buyerBankName) children.push(new Paragraph({ children: [new TextRun({ text: "Ngân hàng: ", bold: true, size: 20, font: "Times New Roman" }), new TextRun({ text: `${buyerBankName}${buyerBankAccount ? ` - STK: ${buyerBankAccount}` : ""}${buyerBankHolder ? ` - Chủ TK: ${buyerBankHolder}` : ""}`, size: 20, font: "Times New Roman" })], spacing: { after: 200 } }));

      // Articles
      if (articles.length > 0) {
        articles.forEach((article: any, idx: number) => {
          children.push(new Paragraph({ children: [new TextRun({ text: article.title, bold: true, size: 22, font: "Times New Roman" })], spacing: { before: 200 } }));

          // Split content by newlines
          const lines = (article.content || "").split("\n");
          lines.forEach((line: string) => {
            children.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, font: "Times New Roman" })], spacing: { after: 40 } }));
          });

          // Insert product table after first article
          if (idx === 0 && items.length > 0) {
            children.push(
              new DocxTable({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
              new Paragraph({ children: [
                new TextRun({ text: `Tổng giá trị hợp đồng là: ${(totalAmount || 0).toLocaleString("vi-VN")} đồng`, bold: true, size: 20, font: "Times New Roman" }),
              ], spacing: { before: 100 } }),
              new Paragraph({ children: [
                new TextRun({ text: `(Bằng chữ: `, size: 20, font: "Times New Roman" }),
                new TextRun({ text: `${numberToVietnameseCurrency(totalAmount)} ./.)`, italics: true, size: 20, font: "Times New Roman" }),
              ], spacing: { after: 60 } }),
              new Paragraph({ children: [new TextRun({ text: "Lưu ý:", bold: true, size: 20, font: "Times New Roman" })], spacing: { before: 60 } }),
              new Paragraph({ children: [new TextRun({ text: contract.include_vat ? "- Tổng giá trị trên đã bao gồm thuế GTGT;" : "- Tổng giá trị trên chưa bao gồm thuế GTGT;", size: 20, font: "Times New Roman" })] }),
              new Paragraph({ children: [new TextRun({ text: seller.include_shipping !== false ? "- Tổng giá trị trên đã bao gồm chi phí vận chuyển đến chân công trình của bên B;" : "- Tổng giá trị trên chưa bao gồm chi phí vận chuyển;", size: 20, font: "Times New Roman" })] }),
              new Paragraph({ children: [new TextRun({ text: "- Đơn giá trên sẽ không thay đổi trong suốt thời gian hai bên thực hiện hợp đồng.", size: 20, font: "Times New Roman" })], spacing: { after: 60 } }),
              new Paragraph({ children: [new TextRun({ text: `Tiền cọc (${contract.deposit_percentage || 70}%): ${formatCurrency(contract.deposit_amount || 0)}`, bold: true, size: 20, font: "Times New Roman" })], spacing: { before: 100 } }),
              new Paragraph({ children: [new TextRun({ text: `Còn lại: ${formatCurrency(totalAmount - (contract.deposit_amount || 0))}`, bold: true, size: 20, font: "Times New Roman" })], spacing: { after: 200 } }),
            );
          }
        });
      }

      // Notes
      if (contract.notes) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: "Ghi chú:", bold: true, size: 20, font: "Times New Roman" })], spacing: { before: 200 } }),
          new Paragraph({ children: [new TextRun({ text: contract.notes, size: 20, font: "Times New Roman" })] }),
        );
      }

      // Signature section (text only, no borders)
      const noBorder = { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } };
      children.push(
        new Paragraph({ text: "", spacing: { before: 400 } }),
        new DocxTable({
          rows: [
            new DocxTableRow({
              children: [
                new DocxTableCell({
                  children: [
                    new Paragraph({ children: [new TextRun({ text: "ĐẠI DIỆN BÊN A", bold: true, size: 22, font: "Times New Roman" })], alignment: AlignmentType.CENTER }),
                    new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font: "Times New Roman" })], alignment: AlignmentType.CENTER }),
                    new Paragraph({ text: "", spacing: { after: 100 } }),
                    new Paragraph({ text: "", spacing: { after: 100 } }),
                    new Paragraph({ text: "", spacing: { after: 100 } }),
                  ],
                  borders: noBorder,
                  width: { size: 50, type: WidthType.PERCENTAGE },
                }),
                new DocxTableCell({
                  children: [
                    new Paragraph({ children: [new TextRun({ text: "ĐẠI DIỆN BÊN B", bold: true, size: 22, font: "Times New Roman" })], alignment: AlignmentType.CENTER }),
                    new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font: "Times New Roman" })], alignment: AlignmentType.CENTER }),
                    new Paragraph({ text: "", spacing: { after: 100 } }),
                    new Paragraph({ text: "", spacing: { after: 100 } }),
                    new Paragraph({ text: "", spacing: { after: 100 } }),
                  ],
                  borders: noBorder,
                  width: { size: 50, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideHorizontal: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 } },
        }),
      );

      const doc = new Document({
        sections: [{
          properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } },
          children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${contract.contract_number}.docx`);
      toast({ title: "Đã tải file Word thành công!" });
    } catch (err) {
      console.error("Word export error:", err);
      toast({ title: "Lỗi tạo file Word", variant: "destructive" });
    }
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

        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />In</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadImage}><Download className="h-4 w-4 mr-1" />Tải ảnh</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadPDF}><FileDown className="h-4 w-4 mr-1" />Xuất PDF</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadWord}><FileText className="h-4 w-4 mr-1" />Xuất Word</Button>
          <div className="border-l mx-1 h-6" />
          <Button size="sm" variant="outline" onClick={() => setShowHandover(true)}><ClipboardCheck className="h-4 w-4 mr-1" />BB Bàn giao</Button>
          <Button size="sm" variant="outline" onClick={() => setShowPaymentRequest(true)}><Receipt className="h-4 w-4 mr-1" />Đề nghị TT</Button>
        </div>

        <HandoverReportDialog open={showHandover} onOpenChange={setShowHandover} contract={contract} />
        <PaymentRequestDialog open={showPaymentRequest} onOpenChange={setShowPaymentRequest} contract={contract} />

        <div ref={printRef} className="bg-white p-8 rounded-lg border space-y-5 text-sm" style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", lineHeight: 1.7 }}>
          {/* Header */}
          <div className="text-center space-y-1">
            <p className="font-bold text-sm">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="font-bold text-sm" style={{ textDecoration: "underline" }}>Độc lập – Tự do – Hạnh phúc</p>
            <p className="text-xs mt-2" style={{ color: "#6b7280" }}>————————</p>
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
            <p><strong>Công ty/Cá nhân:</strong> {buyer.company_name || contract.customers?.company || contract.customers?.name || "—"}</p>
            {buyer.representative && <p><strong>Đại diện:</strong> {buyer.representative} {buyer.position ? `- ${buyer.position}` : ""}</p>}
            <p><strong>Địa chỉ:</strong> {buyer.address || contract.customers?.address || "—"}</p>
            {buyer.tax_code && <p><strong>Mã số thuế:</strong> {buyer.tax_code}</p>}
            <p><strong>Điện thoại:</strong> {buyer.phone || contract.customers?.phone || "—"}</p>
            {buyer.bank_name && (
              <p><strong>Ngân hàng:</strong> {buyer.bank_name}{buyer.bank_account ? ` - STK: ${buyer.bank_account}` : ""}{buyer.bank_holder ? ` - Chủ TK: ${buyer.bank_holder}` : ""}</p>
            )}
          </div>

          {/* Articles with product table in first article */}
          {articles.length > 0 ? (
            articles.map((article: any, idx: number) => (
              <div key={idx}>
                <p className="font-bold mt-4">{article.title}</p>
                <div className="whitespace-pre-wrap text-sm">{article.content}</div>

                {idx === 0 && items.length > 0 && (
                  <div className="mt-3">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr style={{ backgroundColor: "#f3f4f6" }}>
                          <th className="border border-gray-400 p-2 text-center w-10">TT</th>
                          <th className="border border-gray-400 p-2 text-left">Tên sản phẩm</th>
                          <th className="border border-gray-400 p-2 text-left">Kích thước</th>
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

                    <div className="mt-3 text-sm space-y-1">
                      <p><strong>Tổng giá trị hợp đồng là: {(totalAmount || 0).toLocaleString("vi-VN")} đồng</strong></p>
                      <p>(Bằng chữ: <em>{numberToVietnameseCurrency(totalAmount)} ./.</em>)</p>
                      <p className="mt-2 font-bold">Lưu ý:</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {contract.include_vat && <li>Tổng giá trị trên đã bao gồm thuế GTGT;</li>}
                        {!contract.include_vat && <li>Tổng giá trị trên chưa bao gồm thuế GTGT;</li>}
                        {seller.include_shipping !== false
                          ? <li>Tổng giá trị trên đã bao gồm chi phí vận chuyển đến chân công trình của bên B;</li>
                          : <li>Tổng giá trị trên chưa bao gồm chi phí vận chuyển;</li>
                        }
                        <li>Đơn giá trên sẽ không thay đổi trong suốt thời gian hai bên thực hiện hợp đồng.</li>
                      </ul>
                    </div>

                    <div className="mt-2 text-sm">
                      <p><strong>Tiền cọc ({contract.deposit_percentage || 70}%):</strong> {formatCurrency(contract.deposit_amount || 0)}</p>
                      <p><strong>Còn lại:</strong> {formatCurrency(totalAmount - (contract.deposit_amount || 0))}</p>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
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
                  <div className="mt-3 text-sm space-y-1">
                    <p><strong>Tổng giá trị hợp đồng là: {(totalAmount || 0).toLocaleString("vi-VN")} đồng</strong></p>
                    <p>(Bằng chữ: <em>{numberToVietnameseCurrency(totalAmount)} ./.</em>)</p>
                    <p className="mt-2 font-bold">Lưu ý:</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {contract.include_vat && <li>Tổng giá trị trên đã bao gồm thuế GTGT;</li>}
                      {!contract.include_vat && <li>Tổng giá trị trên chưa bao gồm thuế GTGT;</li>}
                      {seller.include_shipping !== false
                        ? <li>Tổng giá trị trên đã bao gồm chi phí vận chuyển đến chân công trình của bên B;</li>
                        : <li>Tổng giá trị trên chưa bao gồm chi phí vận chuyển;</li>
                      }
                      <li>Đơn giá trên sẽ không thay đổi trong suốt thời gian hai bên thực hiện hợp đồng.</li>
                    </ul>
                  </div>
                  <div className="mt-2 p-3 rounded" style={{ backgroundColor: "#f9fafb" }}>
                    <p>Đặt cọc ({contract.deposit_percentage || 70}%): {formatCurrency(contract.deposit_amount || 0)}</p>
                    <p>Còn lại: {formatCurrency(totalAmount - (contract.deposit_amount || 0))}</p>
                  </div>
                </div>
              )}
            </>
          )}

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
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
            </div>
            <div>
              <p className="font-bold">ĐẠI DIỆN BÊN B</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
