import { useRef, useState, useEffect, useMemo } from "react";
import { OnlineStampSignature } from "@/components/OnlineStampSignature";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Printer, FileDown, FileText, Save, RotateCcw } from "lucide-react";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { useToast } from "@/hooks/use-toast";
import { exportElementToPDF } from "@/lib/pdfUtils";
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { syncContractNumberInOverrides } from "@/lib/contractUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

const FORM_KEY = "payment_request";

const formatDateParts = (d: string) => {
  if (!d) return { day: "...", month: "...", year: "..." };
  const date = new Date(d);
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    year: String(date.getFullYear()),
  };
};

export const PaymentRequestDialog = ({ open, onOpenChange, contract }: Props) => {
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
    const remainingAmount = totalAmount - depositAmount;
    const sellerName = companySettings.companyName || seller.company_name || "";
    const sellerBank = companySettings.bankInfo || seller.bank_info || "";
    const sellerTaxCode = companySettings.taxCode || seller.tax_code || "";
    const sellerAddress = companySettings.address || seller.address || "";
    const sellerPhone = companySettings.phone || seller.phone || "";
    const sellerRep = seller.representative || "";
    const sellerPos = seller.position || "Giám đốc";
    const buyerName = buyer.company_name || contract?.customers?.company || contract?.customers?.name || "...";
    const buyerAddress = buyer.address || contract?.customers?.address || "";
    const buyerRep = buyer.representative || "";
    const buyerPos = buyer.position || "";
    const depositPct = contract?.deposit_percentage || 70;

    const sellerBlockLines = [
      `- Tên đơn vị: ${sellerName}`,
      sellerTaxCode ? `- Mã số thuế: ${sellerTaxCode}` : "",
      sellerAddress ? `- Địa chỉ: ${sellerAddress}` : "",
      sellerRep ? `- Người đại diện: ${sellerRep} – Chức vụ: ${sellerPos}` : "",
      sellerPhone ? `- Điện thoại: ${sellerPhone}` : "",
    ].filter(Boolean).join("\n");

    const bankLines = [
      `- Đơn vị thụ hưởng: ${sellerName}`,
      sellerTaxCode ? `- Mã số thuế: ${sellerTaxCode}` : "",
      sellerBank ? `- Ngân hàng: ${sellerBank}` : "",
      `- Nội dung chuyển khoản: Thanh toán HĐ số ${contract?.contract_number || ""}`,
    ].filter(Boolean).join("\n");

    return {
      company_header: sellerName.toUpperCase(),
      document_number: "",
      request_date: new Date().toISOString().split("T")[0],
      title: "ĐỀ NGHỊ THANH TOÁN",
      subtitle: `V/v: Đề nghị thanh toán theo Hợp đồng số ${contract?.contract_number || ""}`,
      recipient: `Kính gửi: ${buyerName}`,
      recipient_address: buyerAddress ? `Địa chỉ: ${buyerAddress}` : "",
      recipient_rep: buyerRep ? `Người đại diện: ${buyerRep}${buyerPos ? ` – Chức vụ: ${buyerPos}` : ""}` : "",
      seller_block_title: "Đơn vị đề nghị thanh toán:",
      seller_block_text: sellerBlockLines,
      intro: `Căn cứ Hợp đồng số ${contract?.contract_number || ""} ký ngày ${contract?.contract_date ? new Date(contract.contract_date).toLocaleDateString("vi-VN") : ""} giữa hai bên về việc cung cấp hàng hóa, ${sellerName} kính đề nghị Quý Công ty thanh toán số tiền theo bảng chi tiết dưới đây:`,
      table_title: "I. BẢNG CHI TIẾT THANH TOÁN",
      row1_label: "Tổng giá trị Hợp đồng",
      row1_amount: totalAmount,
      row2_label: `Đã thanh toán đợt 1 (Đặt cọc ${depositPct}%)`,
      row2_amount: depositAmount,
      row3_label: "Số tiền đề nghị thanh toán đợt này",
      phase: "remaining" as "deposit" | "remaining" | "full" | "custom",
      amount: remainingAmount,
      bank_title: "II. THÔNG TIN CHUYỂN KHOẢN",
      bank_text: bankLines,
      notes_title: "III. GHI CHÚ",
      notes: "",
      closing: `Kính đề nghị Quý Công ty/Đơn vị sắp xếp thanh toán đúng hạn theo thông tin nêu trên.${sellerPhone ? ` Mọi thắc mắc xin vui lòng liên hệ theo số điện thoại: ${sellerPhone} để được hỗ trợ.` : ""}`,
      closing2: "Trân trọng./",
      sign_label_a: sellerName.toUpperCase(),
      sign_label_b: "XÁC NHẬN BÊN MUA",
      sign_caption_a: "(Ký, đóng dấu)",
      sign_caption_b: "(Ký, đóng dấu)",
      sign_name_a: sellerRep,
      sign_name_b: buyerRep,
    };
  }, [contract, companySettings]);

  const [state, setState] = useState<any>(defaults);

  useEffect(() => {
    if (!contract) return;
    const saved = contract.document_overrides?.[FORM_KEY];
    const synced = syncContractNumberInOverrides(saved, contract.contract_number);
    setState({ ...defaults, ...(synced || {}) });
  }, [contract, defaults]);

  if (!contract) return null;

  const set = (k: string, v: any) => setState((s: any) => ({ ...s, [k]: v }));

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("vi-VN") : ".../.../...";
  const dateParts = formatDateParts(state.request_date);

  const phases = [
    { value: "deposit", label: `Đợt 1 - Đặt cọc (${contract.deposit_percentage || 70}%)`, amount: contract.deposit_amount || 0 },
    { value: "remaining", label: `Đợt 2 - Còn lại (${100 - (contract.deposit_percentage || 70)}%)`, amount: (contract.total_amount || 0) - (contract.deposit_amount || 0) },
    { value: "full", label: "Toàn bộ giá trị hợp đồng", amount: contract.total_amount || 0 },
    { value: "custom", label: "Số khác (tự nhập)", amount: state.amount },
  ];
  const onPhaseChange = (v: string) => {
    const p = phases.find(x => x.value === v);
    if (!p) return;
    setState((s: any) => ({ ...s, phase: v, amount: v === "custom" ? s.amount : p.amount }));
  };

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
    win.document.write(`<html><head><title>DNTT - ${contract.contract_number}</title>
    <style>@page{margin:20mm}body{font-family:'Times New Roman',serif;padding:20px;font-size:13px;line-height:1.6}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px 8px}th{background:#f0f0f0}</style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    try {
      toast({ title: "Đang tạo PDF..." });
      await exportElementToPDF(printRef.current, `DNTT-${contract.contract_number}.pdf`);
      toast({ title: "Đã tải PDF thành công!" });
    } catch { toast({ title: "Lỗi tạo PDF", variant: "destructive" }); }
  };

  const handleDownloadWord = async () => {
    try {
      toast({ title: "Đang tạo file Word..." });
      const borderStyle = { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } };
      const noBorder = { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } };
      const font = "Times New Roman";
      const sz = 22;

      const headerTable = new DocxTable({
        rows: [new DocxTableRow({
          children: [
            new DocxTableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: state.company_header, bold: true, size: 26, font })], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [new TextRun({ text: state.document_number ? `Số: ${state.document_number}` : "Số: .../ĐNTT", size: sz, font })], alignment: AlignmentType.CENTER }),
              ],
              borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
            }),
            new DocxTableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 26, font })], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [new TextRun({ text: "Độc lập – Tự do – Hạnh phúc", bold: true, size: 26, font })], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [new TextRun({ text: `Hà Nội, ngày ${dateParts.day} tháng ${dateParts.month} năm ${dateParts.year}`, italics: true, size: sz, font })], alignment: AlignmentType.CENTER, spacing: { before: 80 } }),
              ],
              borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
            }),
          ],
        })],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideHorizontal: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 } },
      });

      const mkRow = (no: string, label: string, amount: number, bold = false, color?: string) => new DocxTableRow({
        children: [
          new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: no, size: sz, font, bold })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
          new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, size: sz, font, bold })] })], borders: borderStyle }),
          new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(amount), size: sz, font, bold, color })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
        ],
      });
      const paymentTableRows = [
        new DocxTableRow({
          children: ["STT", "Nội dung", "Thành tiền (VNĐ)"].map((text, i) =>
            new DocxTableCell({
              children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: sz, font })], alignment: AlignmentType.CENTER })],
              borders: borderStyle, width: { size: i === 0 ? 10 : i === 1 ? 55 : 35, type: WidthType.PERCENTAGE },
            })
          ),
        }),
        mkRow("1", state.row1_label, state.row1_amount),
        mkRow("2", state.row2_label, state.row2_amount),
        mkRow("3", state.row3_label, state.amount, true, "1a56db"),
      ];

      const children: any[] = [
        headerTable,
        new Paragraph({ spacing: { before: 300 } }),
        new Paragraph({ children: [new TextRun({ text: state.title, bold: true, size: 32, font })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: state.subtitle, italics: true, size: sz, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: state.recipient, bold: true, size: sz + 2, font })] }),
      ];
      if (state.recipient_address) children.push(new Paragraph({ children: [new TextRun({ text: state.recipient_address, size: sz, font })] }));
      if (state.recipient_rep) children.push(new Paragraph({ children: [new TextRun({ text: state.recipient_rep, size: sz, font })] }));

      children.push(new Paragraph({ children: [new TextRun({ text: state.seller_block_title, bold: true, size: sz, font })], spacing: { before: 200 } }));
      state.seller_block_text.split("\n").forEach((l: string) => children.push(new Paragraph({ children: [new TextRun({ text: l, size: sz, font })] })));

      children.push(
        new Paragraph({ children: [new TextRun({ text: state.intro, size: sz, font })], spacing: { before: 200, after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: state.table_title, bold: true, size: sz + 2, font })] }),
        new DocxTable({ rows: paymentTableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({ children: [new TextRun({ text: state.bank_title, bold: true, size: sz + 2, font })], spacing: { before: 200 } }),
      );
      state.bank_text.split("\n").forEach((l: string) => children.push(new Paragraph({ children: [new TextRun({ text: l, size: sz, font })] })));

      if (state.notes) {
        children.push(new Paragraph({ children: [new TextRun({ text: state.notes_title, bold: true, size: sz + 2, font })], spacing: { before: 200 } }));
        state.notes.split("\n").forEach((l: string) => children.push(new Paragraph({ children: [new TextRun({ text: l, size: sz, font })] })));
      }

      children.push(
        new Paragraph({ children: [new TextRun({ text: state.closing, size: sz, font })], spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: state.closing2, size: sz, font })], spacing: { after: 300 } }),
        new DocxTable({
          rows: [new DocxTableRow({
            children: [
              new DocxTableCell({
                children: [new Paragraph({ text: "" })],
                borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
              }),
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: state.sign_label_a, bold: true, size: sz, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: state.sign_caption_a, italics: true, size: 18, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: state.sign_name_a || "", bold: true, size: sz, font })], alignment: AlignmentType.CENTER }),
                ],
                borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
              }),
            ],
          })],
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideHorizontal: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 } },
        }),
      );

      const doc = new Document({ sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } }, children }] });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `DNTT-${contract.contract_number}.docx`);
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
          <DialogTitle>Đề nghị Thanh toán - {contract.contract_number}</DialogTitle>
        </DialogHeader>

        <Accordion type="single" collapsible defaultValue="basic" className="mb-4">
          <AccordionItem value="basic">
            <AccordionTrigger>Thông tin cơ bản</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-1">
                <div><Label>Số công văn</Label><Input value={state.document_number} onChange={e => set("document_number", e.target.value)} placeholder="VD: 01/ĐNTT" /></div>
                <div><Label>Ngày đề nghị</Label><Input type="date" value={state.request_date} onChange={e => set("request_date", e.target.value)} /></div>
                <div>
                  <Label>Đợt thanh toán</Label>
                  <Select value={state.phase} onValueChange={onPhaseChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover z-[100]">
                      {phases.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Số tiền đề nghị</Label><CurrencyInput value={state.amount} onChange={v => set("amount", v)} /></div>
                <div className="md:col-span-4"><Label>Ghi chú</Label><Textarea value={state.notes} onChange={e => set("notes", e.target.value)} rows={2} /></div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="content">
            <AccordionTrigger>Chỉnh sửa nội dung văn bản</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-3 p-1">
                <div><Label>Tên công ty (header)</Label><Input value={state.company_header} onChange={e => set("company_header", e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tiêu đề</Label><Input value={state.title} onChange={e => set("title", e.target.value)} /></div>
                  <div><Label>Phụ đề</Label><Input value={state.subtitle} onChange={e => set("subtitle", e.target.value)} /></div>
                </div>
                <div><Label>Kính gửi</Label><Input value={state.recipient} onChange={e => set("recipient", e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Địa chỉ người nhận</Label><Input value={state.recipient_address} onChange={e => set("recipient_address", e.target.value)} /></div>
                  <div><Label>Đại diện người nhận</Label><Input value={state.recipient_rep} onChange={e => set("recipient_rep", e.target.value)} /></div>
                </div>
                <div><Label>Tiêu đề khối đề nghị</Label><Input value={state.seller_block_title} onChange={e => set("seller_block_title", e.target.value)} /></div>
                <div><Label>Thông tin đơn vị đề nghị (mỗi dòng 1 mục)</Label><Textarea value={state.seller_block_text} onChange={e => set("seller_block_text", e.target.value)} rows={5} /></div>
                <div><Label>Đoạn mở đầu</Label><Textarea value={state.intro} onChange={e => set("intro", e.target.value)} rows={3} /></div>
                <div><Label>Tiêu đề bảng</Label><Input value={state.table_title} onChange={e => set("table_title", e.target.value)} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Nhãn dòng 1</Label><Input value={state.row1_label} onChange={e => set("row1_label", e.target.value)} /></div>
                  <div><Label>Số tiền dòng 1</Label><CurrencyInput value={state.row1_amount} onChange={v => set("row1_amount", v)} /></div>
                  <div></div>
                  <div><Label>Nhãn dòng 2</Label><Input value={state.row2_label} onChange={e => set("row2_label", e.target.value)} /></div>
                  <div><Label>Số tiền dòng 2</Label><CurrencyInput value={state.row2_amount} onChange={v => set("row2_amount", v)} /></div>
                  <div></div>
                  <div className="col-span-2"><Label>Nhãn dòng 3 (đề nghị thanh toán)</Label><Input value={state.row3_label} onChange={e => set("row3_label", e.target.value)} /></div>
                </div>
                <div><Label>Tiêu đề khối chuyển khoản</Label><Input value={state.bank_title} onChange={e => set("bank_title", e.target.value)} /></div>
                <div><Label>Thông tin chuyển khoản</Label><Textarea value={state.bank_text} onChange={e => set("bank_text", e.target.value)} rows={5} /></div>
                <div><Label>Tiêu đề ghi chú</Label><Input value={state.notes_title} onChange={e => set("notes_title", e.target.value)} /></div>
                <div><Label>Câu kết 1</Label><Textarea value={state.closing} onChange={e => set("closing", e.target.value)} rows={2} /></div>
                <div><Label>Câu kết 2</Label><Input value={state.closing2} onChange={e => set("closing2", e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nhãn ký</Label><Input value={state.sign_label_a} onChange={e => set("sign_label_a", e.target.value)} /></div>
                  <div><Label>Chú thích ký</Label><Input value={state.sign_caption_a} onChange={e => set("sign_caption_a", e.target.value)} /></div>
                  <div className="col-span-2"><Label>Tên người ký</Label><Input value={state.sign_name_a} onChange={e => set("sign_name_a", e.target.value)} /></div>
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

        <div ref={printRef} className="bg-white p-6 rounded-lg border" style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", lineHeight: 1.7, fontSize: "13px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
            <tbody>
              <tr>
                <td style={{ width: "45%", textAlign: "center", verticalAlign: "top", border: "none", padding: "0 8px" }}>
                  <p style={{ fontWeight: "bold", fontSize: "14px", marginBottom: 4 }}>{state.company_header}</p>
                  <p style={{ fontSize: "13px" }}>{state.document_number ? `Số: ${state.document_number}` : "Số: .../ĐNTT"}</p>
                </td>
                <td style={{ width: "55%", textAlign: "center", verticalAlign: "top", border: "none", padding: "0 8px" }}>
                  <p style={{ fontWeight: "bold", fontSize: "14px", marginBottom: 0 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                  <p style={{ fontWeight: "bold", fontSize: "14px", borderBottom: "2px solid #000", display: "inline-block", paddingBottom: 2, marginBottom: 6 }}>Độc lập – Tự do – Hạnh phúc</p>
                  <p style={{ fontSize: "13px", fontStyle: "italic", marginTop: 6 }}>Hà Nội, ngày {dateParts.day} tháng {dateParts.month} năm {dateParts.year}</p>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="text-center" style={{ margin: "20px 0 12px" }}>
            <h2 style={{ fontWeight: "bold", fontSize: "16px", color: "#000", marginBottom: 4 }}>{state.title}</h2>
            <p style={{ fontSize: "13px", fontStyle: "italic" }}>{state.subtitle}</p>
          </div>

          <div style={{ marginTop: 16 }}>
            <p><strong>{state.recipient}</strong></p>
            {state.recipient_address && <p style={{ paddingLeft: 60 }}>{state.recipient_address}</p>}
            {state.recipient_rep && <p style={{ paddingLeft: 60 }}>{state.recipient_rep}</p>}
          </div>

          <div style={{ marginTop: 12 }}>
            <p><strong>{state.seller_block_title}</strong></p>
            <p style={{ paddingLeft: 20, whiteSpace: "pre-wrap" }}>{state.seller_block_text}</p>
          </div>

          <p style={{ marginTop: 12, textAlign: "justify", whiteSpace: "pre-wrap" }}>{state.intro}</p>

          <p className="font-bold" style={{ marginTop: 16, marginBottom: 8 }}>{state.table_title}</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th className="border border-gray-400 p-2 text-center" style={{ width: "10%" }}>STT</th>
                <th className="border border-gray-400 p-2 text-left" style={{ width: "55%" }}>Nội dung</th>
                <th className="border border-gray-400 p-2 text-right" style={{ width: "35%" }}>Thành tiền (VNĐ)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-gray-400 p-2 text-center">1</td><td className="border border-gray-400 p-2">{state.row1_label}</td><td className="border border-gray-400 p-2 text-right">{formatCurrency(state.row1_amount)}</td></tr>
              <tr><td className="border border-gray-400 p-2 text-center">2</td><td className="border border-gray-400 p-2">{state.row2_label}</td><td className="border border-gray-400 p-2 text-right">{formatCurrency(state.row2_amount)}</td></tr>
              <tr><td className="border border-gray-400 p-2 text-center font-bold">3</td><td className="border border-gray-400 p-2 font-bold">{state.row3_label}</td><td className="border border-gray-400 p-2 text-right font-bold" style={{ color: "#1a56db" }}>{formatCurrency(state.amount)}</td></tr>
            </tbody>
          </table>

          <p className="font-bold" style={{ marginTop: 16, marginBottom: 8 }}>{state.bank_title}</p>
          <p style={{ paddingLeft: 20, whiteSpace: "pre-wrap" }}>{state.bank_text}</p>

          {state.notes && (
            <div style={{ marginTop: 16 }}>
              <p className="font-bold" style={{ marginBottom: 4 }}>{state.notes_title}</p>
              <p className="whitespace-pre-wrap" style={{ paddingLeft: 20 }}>{state.notes}</p>
            </div>
          )}

          <p style={{ marginTop: 16, textAlign: "justify", whiteSpace: "pre-wrap" }}>{state.closing}</p>
          <p style={{ marginTop: 4 }}>{state.closing2}</p>

          <div className="flex justify-end" style={{ marginTop: 32 }}>
            <div className="text-center" style={{ width: "45%" }}>
              <p style={{ fontWeight: "bold" }}>{state.sign_label_a}</p>
              <p style={{ fontSize: "11px", fontStyle: "italic", color: "#6b7280" }}>{state.sign_caption_a}</p>
              <OnlineStampSignature show={showOnlineStamp} sellerRep={state.sign_name_a} sellerPos="Giám đốc" />
              {!showOnlineStamp && <div style={{ height: 80 }}></div>}
              {state.sign_name_a && !showOnlineStamp && <p style={{ fontWeight: "bold", fontSize: "13px" }}>{state.sign_name_a}</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
