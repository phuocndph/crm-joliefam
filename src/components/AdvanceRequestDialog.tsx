import { useRef, useState, useEffect, useMemo } from "react";
import { OnlineStampSignature } from "@/components/OnlineStampSignature";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Printer, FileDown, FileText, Save, RotateCcw } from "lucide-react";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { useToast } from "@/hooks/use-toast";
import { exportElementToPDF } from "@/lib/pdfUtils";
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";
import { numberToVietnameseCurrency } from "@/lib/numberToText";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { syncContractNumberInOverrides } from "@/lib/contractUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

const FORM_KEY = "advance_request";

export const AdvanceRequestDialog = ({ open, onOpenChange, contract }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { settings: companySettings } = useTemplateSettings();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showOnlineStamp, setShowOnlineStamp] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaults = useMemo(() => {
    const seller = contract?.seller_info || {};
    const buyer = contract?.buyer_info || {};
    const totalAmount = contract?.total_amount || 0;
    const depositAmount = contract?.deposit_amount || 0;
    const sellerName = companySettings.companyName || seller.company_name || "";
    const sellerBank = companySettings.bankInfo || seller.bank_info || "";
    const sellerTaxCode = companySettings.taxCode || seller.tax_code || "";
    const sellerAddress = companySettings.address || seller.address || "";
    const buyerName = buyer.company_name || contract?.customers?.company || contract?.customers?.name || "—";
    const bankLines = [
      `- Đơn vị thụ hưởng: ${sellerName}`,
      sellerTaxCode ? `- Mã số thuế: ${sellerTaxCode}` : "",
      sellerAddress ? `- Địa chỉ: ${sellerAddress}` : "",
      sellerBank ? `- Ngân hàng: ${sellerBank}` : "",
    ].filter(Boolean).join("\n");
    return {
      title: "ĐỀ NGHỊ TẠM ỨNG",
      subtitle: `(Theo Hợp đồng số: ${contract?.contract_number || ""})`,
      request_date: new Date().toISOString().split("T")[0],
      recipient: `Kính gửi: ${buyerName}`,
      intro: `Căn cứ Hợp đồng số ${contract?.contract_number || ""} ngày ${contract?.contract_date ? new Date(contract.contract_date).toLocaleDateString("vi-VN") : ""} giữa ${buyerName} và ${sellerName}, chúng tôi đề nghị Quý công ty tạm ứng theo nội dung sau:`,
      row1_label: "Tổng giá trị Hợp đồng",
      row1_amount: totalAmount,
      row2_label: "Số tiền đề nghị tạm ứng",
      amount: depositAmount,
      bank_info_text: bankLines,
      bank_info_title: "Thông tin chuyển khoản:",
      additional_notes: "",
      closing: "Kính đề nghị Quý công ty xem xét và chuyển khoản tạm ứng theo thông tin trên. Trân trọng!",
      signature_label: sellerName.toUpperCase(),
      signature_caption: "(Ký, đóng dấu)",
    };
  }, [contract, companySettings]);

  const [state, setState] = useState(defaults);

  useEffect(() => {
    if (!contract) return;
    const saved = contract.document_overrides?.[FORM_KEY];
    const synced = syncContractNumberInOverrides(saved, contract.contract_number);
    setState({ ...defaults, ...(synced || {}) });
  }, [contract, defaults]);

  if (!contract) return null;

  const set = (k: string, v: any) => setState(s => ({ ...s, [k]: v }));

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("vi-VN") : "—";
  const amountText = state.amount > 0 ? numberToVietnameseCurrency(state.amount) : "";

  const handleSave = async () => {
    setSaving(true);
    const next = { ...(contract.document_overrides || {}), [FORM_KEY]: state };
    const { error } = await supabase.from("contracts").update({ document_overrides: next }).eq("id", contract.id);
    setSaving(false);
    if (error) { toast({ title: "Lỗi lưu", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["contracts"] });
    toast({ title: "Đã lưu nội dung biểu mẫu" });
  };

  const handleRestore = async () => {
    const next = { ...(contract.document_overrides || {}) };
    delete next[FORM_KEY];
    const { error } = await supabase.from("contracts").update({ document_overrides: next }).eq("id", contract.id);
    if (error) { toast({ title: "Lỗi", description: error.message, variant: "destructive" }); return; }
    setState(defaults);
    qc.invalidateQueries({ queryKey: ["contracts"] });
    toast({ title: "Đã khôi phục mặc định" });
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>ĐNTU - ${contract.contract_number}</title>
    <style>
      @page { margin: 20mm; }
      body { font-family: 'Times New Roman', Times, serif; padding: 20px; font-size: 13px; line-height: 1.6; color: #000; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 6px 8px; }
      th { background: #f0f0f0; }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
    </style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    try {
      toast({ title: "Đang tạo PDF..." });
      await exportElementToPDF(printRef.current, `DNTU-${contract.contract_number}.pdf`);
      toast({ title: "Đã tải PDF thành công!" });
    } catch {
      toast({ title: "Lỗi tạo PDF", variant: "destructive" });
    }
  };

  const handleDownloadWord = async () => {
    try {
      toast({ title: "Đang tạo file Word..." });
      const borderStyle = {
        top: { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 },
        right: { style: BorderStyle.SINGLE, size: 1 },
      };
      const font = "Times New Roman";

      const tableRows = [
        new DocxTableRow({
          children: ["STT", "Nội dung", "Số tiền (VNĐ)"].map((text, i) =>
            new DocxTableCell({
              children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 22, font })], alignment: AlignmentType.CENTER })],
              borders: borderStyle,
              width: { size: i === 1 ? 55 : i === 0 ? 10 : 35, type: WidthType.PERCENTAGE },
            })
          ),
        }),
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "1", size: 22, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: state.row1_label, size: 22, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(state.row1_amount), size: 22, font })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        }),
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "2", size: 22, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: state.row2_label, bold: true, size: 22, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(state.amount), bold: true, size: 22, font, color: "1a56db" })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        }),
      ];

      const children: any[] = [
        new Paragraph({ children: [new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 26, font })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "Độc lập – Tự do – Hạnh phúc", bold: true, size: 26, font, underline: {} })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "————————", size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
        new Paragraph({ children: [new TextRun({ text: state.title, bold: true, size: 32, font, color: "1a56db" })], alignment: AlignmentType.CENTER, spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: state.subtitle, italics: true, size: 22, font })], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
        new Paragraph({ children: [new TextRun({ text: `Ngày ${formatDate(state.request_date)}`, italics: true, size: 22, font })], alignment: AlignmentType.RIGHT, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: state.recipient, bold: true, size: 24, font })], spacing: { after: 200 } }),
        ...state.intro.split("\n").map(line => new Paragraph({ children: [new TextRun({ text: line, size: 22, font })], spacing: { after: 100 } })),
        new DocxTable({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
      ];

      if (amountText) {
        children.push(new Paragraph({ children: [new TextRun({ text: `Bằng chữ: ${amountText}`, italics: true, size: 22, font })], spacing: { before: 100, after: 200 } }));
      }

      children.push(new Paragraph({ children: [new TextRun({ text: state.bank_info_title, bold: true, size: 22, font })], spacing: { before: 200 } }));
      state.bank_info_text.split("\n").forEach((line: string) => {
        children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22, font })] }));
      });

      if (state.additional_notes) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: "Ghi chú:", bold: true, size: 22, font })], spacing: { before: 200 } }),
          new Paragraph({ children: [new TextRun({ text: state.additional_notes, size: 22, font })], spacing: { after: 200 } }),
        );
      }

      children.push(
        new Paragraph({ children: [new TextRun({ text: state.closing, size: 22, font })], spacing: { before: 200, after: 300 } }),
        new Paragraph({ children: [new TextRun({ text: state.signature_label, bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: state.signature_caption, italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
      );

      const doc = new Document({
        sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } }, children }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `DNTU-${contract.contract_number}.docx`);
      toast({ title: "Đã tải file Word thành công!" });
    } catch (err) {
      console.error("Word export error:", err);
      toast({ title: "Lỗi tạo file Word", variant: "destructive" });
    }
  };

  const seller = contract.seller_info || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Đề nghị Tạm ứng - {contract.contract_number}</DialogTitle>
        </DialogHeader>

        <Accordion type="single" collapsible defaultValue="basic" className="mb-4">
          <AccordionItem value="basic">
            <AccordionTrigger>Thông tin cơ bản</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-1">
                <div><Label>Ngày đề nghị</Label><Input type="date" value={state.request_date} onChange={e => set("request_date", e.target.value)} /></div>
                <div><Label>Số tiền tạm ứng</Label><CurrencyInput value={state.amount} onChange={v => set("amount", v)} /></div>
                <div><Label>Tổng giá trị HĐ</Label><CurrencyInput value={state.row1_amount} onChange={v => set("row1_amount", v)} /></div>
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="content">
            <AccordionTrigger>Chỉnh sửa nội dung văn bản</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-3 p-1">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tiêu đề</Label><Input value={state.title} onChange={e => set("title", e.target.value)} /></div>
                  <div><Label>Phụ đề</Label><Input value={state.subtitle} onChange={e => set("subtitle", e.target.value)} /></div>
                </div>
                <div><Label>Kính gửi</Label><Input value={state.recipient} onChange={e => set("recipient", e.target.value)} /></div>
                <div><Label>Đoạn mở đầu</Label><Textarea value={state.intro} onChange={e => set("intro", e.target.value)} rows={3} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nhãn dòng 1 (bảng)</Label><Input value={state.row1_label} onChange={e => set("row1_label", e.target.value)} /></div>
                  <div><Label>Nhãn dòng 2 (bảng)</Label><Input value={state.row2_label} onChange={e => set("row2_label", e.target.value)} /></div>
                </div>
                <div><Label>Tiêu đề khối chuyển khoản</Label><Input value={state.bank_info_title} onChange={e => set("bank_info_title", e.target.value)} /></div>
                <div><Label>Thông tin chuyển khoản (mỗi dòng 1 mục)</Label><Textarea value={state.bank_info_text} onChange={e => set("bank_info_text", e.target.value)} rows={5} /></div>
                <div><Label>Ghi chú</Label><Textarea value={state.additional_notes} onChange={e => set("additional_notes", e.target.value)} rows={2} /></div>
                <div><Label>Câu kết</Label><Textarea value={state.closing} onChange={e => set("closing", e.target.value)} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tên ký (bên dưới)</Label><Input value={state.signature_label} onChange={e => set("signature_label", e.target.value)} /></div>
                  <div><Label>Chú thích ký</Label><Input value={state.signature_caption} onChange={e => set("signature_caption", e.target.value)} /></div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <Button size="sm" onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Đang lưu..." : "Lưu"}</Button>
          <Button size="sm" variant="outline" onClick={handleRestore}><RotateCcw className="h-4 w-4 mr-1" />Khôi phục mặc định</Button>
          <div className="border-l mx-1 h-6" />
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />In</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadPDF}><FileDown className="h-4 w-4 mr-1" />Xuất PDF</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadWord}><FileText className="h-4 w-4 mr-1" />Xuất Word</Button>
          <div className="border-l mx-1 h-6" />
          <div className="flex items-center gap-2">
            <Switch checked={showOnlineStamp} onCheckedChange={setShowOnlineStamp} />
            <span className="text-xs font-medium">Ký & đóng dấu online</span>
          </div>
        </div>

        <div ref={printRef} className="bg-white p-6 rounded-lg border space-y-4" style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", lineHeight: 1.6, fontSize: "13px" }}>
          <div className="text-center space-y-1">
            <p className="font-bold" style={{ fontSize: "14px" }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="font-bold" style={{ fontSize: "14px", textDecoration: "underline" }}>Độc lập – Tự do – Hạnh phúc</p>
            <p className="text-xs" style={{ color: "#6b7280" }}>————————</p>
          </div>

          <div className="text-center mt-4">
            <h2 className="text-lg font-bold" style={{ color: "#1a56db" }}>{state.title}</h2>
            <p className="text-sm italic">{state.subtitle}</p>
          </div>

          <p className="text-right italic">Ngày {formatDate(state.request_date)}</p>

          <p><strong>{state.recipient}</strong></p>
          <p className="whitespace-pre-wrap">{state.intro}</p>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th className="border border-gray-400 p-2 text-center w-16">STT</th>
                <th className="border border-gray-400 p-2 text-left">Nội dung</th>
                <th className="border border-gray-400 p-2 text-right w-44">Số tiền (VNĐ)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 p-2 text-center">1</td>
                <td className="border border-gray-400 p-2">{state.row1_label}</td>
                <td className="border border-gray-400 p-2 text-right">{formatCurrency(state.row1_amount)}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 text-center">2</td>
                <td className="border border-gray-400 p-2 font-bold">{state.row2_label}</td>
                <td className="border border-gray-400 p-2 text-right font-bold" style={{ color: "#1a56db" }}>{formatCurrency(state.amount)}</td>
              </tr>
            </tbody>
          </table>

          {amountText && <p className="italic">Bằng chữ: {amountText}</p>}

          <div className="space-y-1 mt-4">
            <p className="font-bold">{state.bank_info_title}</p>
            <p className="whitespace-pre-wrap">{state.bank_info_text}</p>
          </div>

          {state.additional_notes && (
            <div className="mt-2">
              <p className="font-bold">Ghi chú:</p>
              <p className="whitespace-pre-wrap">{state.additional_notes}</p>
            </div>
          )}

          <p className="mt-4 whitespace-pre-wrap">{state.closing}</p>

          <div className="flex justify-end pt-8 mt-8" style={{ borderTop: "1px solid #e5e7eb" }}>
            <div className="text-center" style={{ width: "40%" }}>
              <p className="font-bold">{state.signature_label}</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>{state.signature_caption}</p>
              <OnlineStampSignature show={showOnlineStamp} sellerRep={seller.representative} sellerPos="Giám đốc" />
              {!showOnlineStamp && <div style={{ height: 80 }}></div>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
