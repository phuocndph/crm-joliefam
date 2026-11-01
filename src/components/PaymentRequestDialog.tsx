import { contractDateLabel } from "@/lib/contract-calculation";
import { usePaymentRequestContract } from "@/hooks/useContracts";
import { savedSellerValue } from "@/lib/contract-document";
import { paymentRequestCurrency, paymentRequestDateValid, paymentRequestField, paymentRequestFinancialView, paymentRequestLabels, paymentRequestProse, paymentRequestToday } from "@/lib/payment-request";
import { useRef, useState, useEffect, useMemo } from "react";
import { OnlineStampSignature } from "@/components/OnlineStampSignature";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Printer, FileDown, FileText, Save, RotateCcw, RefreshCw } from "lucide-react";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { useToast } from "@/hooks/use-toast";
import { exportElementToPDF } from "@/lib/pdfUtils";
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { syncContractNumberInOverrides } from "@/lib/contractUtils";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";

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
  const contractQuery = usePaymentRequestContract(contract?.id, open);
  const financial = paymentRequestFinancialView(contract, contractQuery.data);
  const currentContract = contractQuery.data?.id === contract?.id ? contractQuery.data : contract;
  const [showOnlineStamp, setShowOnlineStamp] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const actionLock = useRef(false);
  const dirty = useRef(false);
  const session = useRef({ id: '', open: false });
  const localProse = useRef<{ id: string; value: unknown } | null>(null);

  const { defaults, previousDefaults } = useMemo(() => {
    const seller = currentContract?.seller_info || {};
    const buyer = currentContract?.buyer_info || {};
    const sellerName = savedSellerValue(seller, "company_name", companySettings.companyName);
    const sellerBank = savedSellerValue(seller, "bank_info", companySettings.bankInfo);
    const sellerTaxCode = paymentRequestField(savedSellerValue(seller, "tax_code", companySettings.taxCode), 'tax');
    const sellerAddress = paymentRequestField(savedSellerValue(seller, "address", companySettings.address), 'address');
    const sellerPhone = paymentRequestField(savedSellerValue(seller, "phone", companySettings.phone), 'phone');
    const sellerRep = seller.representative || "";
    const sellerPos = seller.position || "Giám đốc";
    const buyerName = buyer.company_name || currentContract?.customers?.company || currentContract?.customers?.name || "...";
    const buyerAddress = paymentRequestField(String(buyer.address || currentContract?.customers?.address || ""), 'address');
    const buyerRep = buyer.representative || "";
    const buyerPos = buyer.position || "";

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

    const introLead = `Căn cứ Hợp đồng số ${contract?.contract_number || ""} ký ngày ${contract?.contract_date ? contractDateLabel(contract.contract_date) : ""} giữa hai bên về việc cung cấp hàng hóa, ${sellerName} kính đề nghị Quý Công ty `;
    const oldIntroLead = `Căn cứ Hợp đồng số ${contract?.contract_number || ""} ký ngày ${contract?.contract_date ? new Date(contract.contract_date).toLocaleDateString("vi-VN") : ""} giữa hai bên về việc cung cấp hàng hóa, ${sellerName} kính đề nghị Quý Công ty `;
    const closing = `Kính đề nghị Quý Công ty/Đơn vị sắp xếp thanh toán đúng hạn theo thông tin nêu trên.${sellerPhone ? ` Mọi thắc mắc xin vui lòng liên hệ theo số điện thoại: ${sellerPhone} để được hỗ trợ.` : ""}`;
    return { defaults: {
      company_header: sellerName.toUpperCase(),
      document_number: "",
      request_date: paymentRequestToday(),
      title: "ĐỀ NGHỊ THANH TOÁN",
      subtitle: `V/v: Đề nghị thanh toán theo Hợp đồng số ${contract?.contract_number || ""}`,
      recipient: `Kính gửi: ${buyerName}`,
      recipient_address: buyerAddress ? `Địa chỉ: ${buyerAddress}` : "",
      recipient_rep: buyerRep ? `Người đại diện: ${buyerRep}${buyerPos ? ` – Chức vụ: ${buyerPos}` : ""}` : "",
      seller_block_title: "Đơn vị đề nghị thanh toán:",
      seller_block_text: sellerBlockLines,
      intro: `${introLead}thanh toán số tiền còn lại sau khi nhận hàng theo điều khoản thanh toán đã thỏa thuận tại hợp đồng, cụ thể như sau:`,
      table_title: "I. BẢNG CHI TIẾT THANH TOÁN",
      bank_title: "II. THÔNG TIN CHUYỂN KHOẢN",
      bank_text: bankLines,
      notes_title: "III. GHI CHÚ",
      notes: "",
      closing,
      closing2: "Trân trọng./",
      sign_label_a: sellerName.toUpperCase(),
      sign_label_b: "XÁC NHẬN BÊN MUA",
      sign_caption_a: "(Ký, đóng dấu)",
      sign_caption_b: "(Ký, đóng dấu)",
      sign_name_a: sellerRep,
      sign_name_b: buyerRep,
    }, previousDefaults: {
      intro: [
        `${introLead}thanh toán phần giá trị còn lại theo điều khoản giao nhận và thanh toán của hợp đồng, sau khi trừ các khoản đã thanh toán theo chứng từ thu, cụ thể như sau:`,
        `${oldIntroLead}thanh toán số tiền theo bảng chi tiết dưới đây:`,
      ],
      closing: [closing],
    } };
  }, [contract, currentContract, companySettings]);

  const [state, setState] = useState<any>(defaults);

  useEffect(() => () => { session.current.open = false; }, []);

  useEffect(() => {
    if (!open || !contract) { session.current.open = false; return; }
    const newSession = !session.current.open || session.current.id !== contract.id;
    if (newSession) localProse.current = null;
    session.current = { id: contract.id, open: true };
    if (newSession || !dirty.current) {
      const saved = localProse.current?.id === contract.id ? localProse.current.value : currentContract.document_overrides?.[FORM_KEY];
      const synced = syncContractNumberInOverrides(saved, contract.contract_number);
      setState(paymentRequestProse(defaults, synced, previousDefaults));
      dirty.current = false;
    }
  }, [open, contract, currentContract, defaults, previousDefaults]);

  if (!contract) return null;

  const set = (k: string, v: string) => { dirty.current = true; setState((s: any) => ({ ...s, [k]: v })); };

  const formatCurrency = paymentRequestCurrency;
  const dateParts = formatDateParts(state.request_date);
  const disabled = !financial.ready || contractQuery.isFetching || contractQuery.isPending || contractQuery.isError || !paymentRequestDateValid(state.request_date) || Boolean(action);

  const preflight = async () => {
    if (!open || !paymentRequestDateValid(state.request_date)) throw new Error('Ngày đề nghị chưa hợp lệ.');
    const refreshed = await contractQuery.refetch();
    if (!session.current.open || session.current.id !== contract.id) throw new Error('Biểu mẫu đã đóng hoặc chuyển sang hợp đồng khác.');
    if (refreshed.error || !refreshed.data) throw new Error('Không tải được điều khoản thanh toán của hợp đồng. Vui lòng thử lại.');
    const fresh = paymentRequestFinancialView(contract, refreshed.data);
    if (!fresh.ready) throw new Error(fresh.reason);
    if (fresh.fingerprint !== financial.fingerprint) throw new Error('Số tiền đã thay đổi. Biểu mẫu đã được cập nhật; vui lòng kiểm tra lại trước khi tiếp tục.');
    return { source: refreshed.data, financial: fresh };
  };

  const runAction = async (name: string, perform: (fresh: Awaited<ReturnType<typeof preflight>>) => Promise<void> | void) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setAction(name);
    try { await perform(await preflight()); }
    catch (error) { toast({ title: 'Chưa thể ' + name.toLowerCase(), description: error instanceof Error ? error.message : 'Vui lòng đối chiếu lại dữ liệu.', variant: 'destructive' }); }
    finally { actionLock.current = false; setAction(null); }
  };

  const handleSave = () => runAction('Lưu', async fresh => {
    const submitted = { ...state, calculation_version: 3, calculation_basis: 'contract_terms', phase: 'remaining',
      row1_label: paymentRequestLabels.total, row1_amount: fresh.financial.total,
      row2_label: paymentRequestLabels.advance, row2_amount: fresh.financial.advance,
      row3_label: paymentRequestLabels.remaining, amount: fresh.financial.remaining };
    const next = { ...(fresh.source.document_overrides as Record<string, unknown> || {}), [FORM_KEY]: submitted };
      if (isLocalBackend()) await localApi.updateContract(contract.id, { document_overrides: next });
      else {
        const { error } = await supabase.from("contracts").update({ document_overrides: next }).eq("id", contract.id);
        if (error) throw error;
      }
    localProse.current = { id: contract.id, value: submitted };
    dirty.current = false;
    qc.invalidateQueries({ queryKey: ["contracts"] });
    toast({ title: "Đã lưu nội dung biểu mẫu" });
  });

  const handleRestore = () => {
    dirty.current = true;
    setState(defaults);
    toast({ title: "Đã đặt lại bản nháp", description: 'Bấm Lưu để giữ nội dung mới.' });
  };

  const handlePrint = async () => {
    if (actionLock.current || !printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) { toast({ title: 'Trình duyệt đã chặn cửa sổ in', variant: 'destructive' }); return; }
    let printed = false;
    await runAction('In', () => {
    const content = printRef.current;
    if (!content) throw new Error('Chưa tải được bản xem trước.');
    win.document.write(`<html><head><title>DNTT - ${contract.contract_number}</title>
    <style>@page{margin:20mm}body{font-family:'Times New Roman',serif;padding:20px;font-size:13px;line-height:1.6}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:6px 8px}th{background:#f0f0f0}</style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.print();
    printed = true;
    });
    if (!printed) win.close();
  };

  const handleDownloadPDF = () => runAction('Xuất PDF', async () => {
    if (!printRef.current) return;
    try {
      toast({ title: "Đang tạo PDF..." });
      await exportElementToPDF(printRef.current, `DNTT-${contract.contract_number}.pdf`);
      toast({ title: "Đã tải PDF thành công!" });
    } catch { toast({ title: "Lỗi tạo PDF", variant: "destructive" }); }
  });

  const handleDownloadWord = () => runAction('Xuất Word', async () => {
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
        mkRow("1", paymentRequestLabels.total, financial.total),
        mkRow("2", paymentRequestLabels.advance, financial.advance),
        mkRow("3", paymentRequestLabels.remaining, financial.remaining, true, "1a56db"),
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
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Đề nghị Thanh toán - {contract.contract_number}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Thanh toán sau khi nhận hàng theo hợp đồng</p>
            <Button size="sm" variant="outline" disabled={Boolean(action) || contractQuery.isFetching} onClick={() => contractQuery.refetch()}><RefreshCw className="mr-1 h-4 w-4" />Làm mới số tiền</Button>
          </div>
          <p className="text-xs text-muted-foreground">Số tiền đề nghị sau khi nhận hàng = tổng giá trị hợp đồng − tạm ứng theo hợp đồng. Biểu mẫu được lập theo điều khoản thanh toán đã thỏa thuận.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label htmlFor="payment-total">{paymentRequestLabels.total}</Label><Input id="payment-total" readOnly value={formatCurrency(financial.total)} /></div>
            <div><Label htmlFor="payment-advance">{paymentRequestLabels.advance}</Label><Input id="payment-advance" readOnly value={formatCurrency(financial.advance)} /></div>
            <div><Label htmlFor="payment-remaining">{paymentRequestLabels.remaining}</Label><Input id="payment-remaining" readOnly value={formatCurrency(financial.remaining)} className="font-semibold text-primary" /></div>
          </div>
          {(contractQuery.isFetching || contractQuery.isPending || contractQuery.isError || !financial.ready) && <p role="status" className="text-sm">{contractQuery.isFetching || contractQuery.isPending ? 'Đang tải điều khoản thanh toán của hợp đồng…' : contractQuery.isError ? 'Không tải được hợp đồng. Vui lòng làm mới số tiền.' : financial.reason}</p>}
        </div>
        <fieldset disabled={Boolean(action)}>
        <Accordion type="single" collapsible defaultValue="basic" className="mb-4">
          <AccordionItem value="basic">
            <AccordionTrigger>Thông tin cơ bản</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-1">
                <div><Label htmlFor="payment-number">Số công văn</Label><Input id="payment-number" value={state.document_number} onChange={e => set("document_number", e.target.value)} placeholder="VD: 01/ĐNTT" /></div>
                <div><Label htmlFor="payment-date">Ngày đề nghị</Label><Input id="payment-date" type="date" value={state.request_date} onChange={e => set("request_date", e.target.value)} />{!paymentRequestDateValid(state.request_date) && <p className="text-sm text-destructive">Vui lòng nhập ngày đề nghị hợp lệ.</p>}</div>
                <div className="md:col-span-2"><Label htmlFor="payment-notes">Ghi chú</Label><Textarea id="payment-notes" value={state.notes} onChange={e => set("notes", e.target.value)} rows={2} /></div>
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
        </fieldset>

        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <Button size="sm" onClick={handleSave} disabled={disabled}><Save className="h-4 w-4 mr-1" />{action === 'Lưu' ? "Đang lưu..." : "Lưu"}</Button>
          <Button size="sm" variant="outline" onClick={handleRestore} disabled={Boolean(action)}><RotateCcw className="h-4 w-4 mr-1" />Đặt lại bản nháp</Button>
          <div className="border-l mx-1 h-6" />
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={disabled}><Printer className="h-4 w-4 mr-1" />In</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadPDF} disabled={disabled}><FileDown className="h-4 w-4 mr-1" />Xuất PDF</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadWord} disabled={disabled}><FileText className="h-4 w-4 mr-1" />Xuất Word</Button>
          <div className="border-l mx-1 h-6" />
          <div className="flex items-center gap-2">
            <Switch checked={showOnlineStamp} onCheckedChange={setShowOnlineStamp} disabled={Boolean(action)} />
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
              <tr><td className="border border-gray-400 p-2 text-center">1</td><td className="border border-gray-400 p-2">{paymentRequestLabels.total}</td><td className="border border-gray-400 p-2 text-right">{formatCurrency(financial.total)}</td></tr>
              <tr><td className="border border-gray-400 p-2 text-center">2</td><td className="border border-gray-400 p-2">{paymentRequestLabels.advance}</td><td className="border border-gray-400 p-2 text-right">{formatCurrency(financial.advance)}</td></tr>
              <tr><td className="border border-gray-400 p-2 text-center font-bold">3</td><td className="border border-gray-400 p-2 font-bold">{paymentRequestLabels.remaining}</td><td className="border border-gray-400 p-2 text-right font-bold" style={{ color: "#1a56db" }}>{formatCurrency(financial.remaining)}</td></tr>
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
