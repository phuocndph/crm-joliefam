import { useRef, useState, useEffect, useMemo, useReducer } from "react";
import { createHandoverDefaults, loadHandoverReport, convertHandoverReport, resolveHandoverReport, isLegacyHandover, handoverTemplateVersion, handoverToday, handoverFieldValue, createHandoverSession, handoverEditorReducer, type HandoverItem, type HandoverReportState } from "@/lib/handover-report";
import { OnlineStampSignature } from "@/components/OnlineStampSignature";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Printer, FileDown, FileText, Save, RotateCcw, Plus, Trash2 } from "lucide-react";
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

const FORM_KEY = "handover_report";

export const HandoverReportDialog = ({ open, onOpenChange, contract }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { settings: companySettings } = useTemplateSettings();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showOnlineStamp, setShowOnlineStamp] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaults = useMemo(() => createHandoverDefaults(contract, companySettings), [contract, companySettings]);
  const [session, dispatch] = useReducer(handoverEditorReducer, defaults, createHandoverSession);
  const state = session.report;
  const contractKey = String(contract?.id ?? contract?.contract_number ?? "");

  useEffect(() => {
    if (!contract) return;
    const saved = contract.document_overrides?.[FORM_KEY];
    const synced = syncContractNumberInOverrides(saved, contract.contract_number);
    dispatch({ type: "hydrate", contractKey, open, report: loadHandoverReport(defaults, synced), sourceKey: JSON.stringify(saved ?? null) });
  }, [open, contract, contractKey, defaults]);

  if (!contract) return null;

  const edit = (update: (report: HandoverReportState) => HandoverReportState) => dispatch({ type: "edit", update });
  const set = <K extends keyof HandoverReportState>(k: K, v: HandoverReportState[K]) => edit(s => ({ ...s, [k]: v }));
  const setItem = (i: number, k: keyof HandoverItem, v: string) =>
    edit(s => ({ ...s, items: s.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }));
  const addItem = () => edit(s => ({ ...s, items: [...s.items, { name: "", specifications: "", quantity: "1", status: handoverTemplateVersion(s) === 3 ? "" : "Đạt" }] }));
  const removeItem = (i: number) => edit(s => ({ ...s, items: s.items.filter((_, idx) => idx !== i) }));

  const legacy = isLegacyHandover(state);
  const version = handoverTemplateVersion(state);
  const resolved = resolveHandoverReport(state);
  const buyerAddress = handoverFieldValue(contract.buyer_info?.address, "address");
  const onlineStampVisible = version === 1 && showOnlineStamp && Boolean(companySettings.stampUrl || companySettings.signatureUrl);

  const handleSave = async () => {
    setSaving(true);
    const submitted = state;
    const next = { ...(contract.document_overrides || {}), [FORM_KEY]: submitted };
    try {
      if (isLocalBackend()) await localApi.updateContract(contract.id, { document_overrides: next });
      else {
        const { error } = await supabase.from("contracts").update({ document_overrides: next }).eq("id", contract.id);
        if (error) throw error;
      }
    } catch (error) {
      setSaving(false);
      toast({ title: "Lỗi lưu", description: error instanceof Error ? error.message : "Không thể lưu biên bản", variant: "destructive" });
      return;
    }
    setSaving(false);
    dispatch({ type: "saved", contractKey, submitted });
    qc.invalidateQueries({ queryKey: ["contracts"] });
    toast({ title: "Đã lưu nội dung biểu mẫu" });
  };

  const handleRestore = () => {
    edit(() => defaults);
    setShowOnlineStamp(false);
    toast({ title: "Đã đặt lại bản nháp", description: "Chưa thay đổi biên bản đã lưu. Bấm Lưu để áp dụng." });
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>BBBG - ${contract.contract_number}</title>
    <style>
      @page { margin: 20mm; }
      body { font-family: 'Times New Roman', Times, serif; padding: 20px; font-size: 13px; line-height: 1.6; color: #000; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 6px 8px; }
      th { background: #f0f0f0; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
      .whitespace-pre-wrap { white-space: pre-wrap; }
    </style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    try {
      toast({ title: "Đang tạo PDF..." });
      await exportElementToPDF(printRef.current, `BBBG-${contract.contract_number}.pdf`);
      toast({ title: "Đã tải PDF thành công!" });
    } catch {
      toast({ title: "Lỗi tạo PDF", variant: "destructive" });
    }
  };

  const handleDownloadWord = async () => {
    try {
      toast({ title: "Đang tạo file Word..." });
      const borderStyle = {
        top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 },
      };
      const noBorder = { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } };
      const font = "Times New Roman";

      const headerRow = new DocxTableRow({
        children: ["TT", "Tên sản phẩm", resolved.specifications_header, "SL", resolved.status_header].map(text =>
          new DocxTableCell({
            children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, font })], alignment: AlignmentType.CENTER })],
            borders: borderStyle,
          })
        ),
      });
      const itemRows = state.items.map((item: HandoverItem, i: number) =>
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(i + 1), size: 20, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.name || "—", size: 20, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.specifications || "—", size: 20, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.quantity || "1", size: 20, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.status || resolved.status_fallback, size: 20, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
          ],
        })
      );

      const partyToParas = (label: string, text: string) => [
        new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 22, font })], spacing: { before: 100 } }),
        ...text.split("\n").map(line => new Paragraph({ children: [new TextRun({ text: line, size: 20, font })] })),
      ];

      const children: any[] = [
        new Paragraph({ children: [new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 24, font })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "Độc lập – Tự do – Hạnh phúc", bold: true, size: 24, font, underline: {} })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "————————", size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: state.title, bold: true, size: 32, font, color: "1a56db" })], alignment: AlignmentType.CENTER, spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: state.subtitle, italics: true, size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        ...resolved.eventLines.map(text => new Paragraph({ children: [new TextRun({ text, size: 20, font })], spacing: { after: 100 } })),
        new Paragraph({ children: [new TextRun({ text: state.intro2, size: 20, font })], spacing: { after: 200 } }),
        ...partyToParas(state.party_a_label, resolved.party_a_text),
        ...partyToParas(state.party_b_label, resolved.party_b_text),
        new Paragraph({ children: [new TextRun({ text: state.items_title, bold: true, size: 22, font })], spacing: { before: 200 } }),
        new DocxTable({ rows: [headerRow, ...itemRows], width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({ children: [new TextRun({ text: state.conclusion_title, bold: true, size: 22, font })], spacing: { before: 200 } }),
        ...state.conclusion.split("\n").map((l: string) => new Paragraph({ children: [new TextRun({ text: l, size: 20, font })] })),
      ];

      if (state.notes) {
        children.push(new Paragraph({ children: [new TextRun({ text: state.notes_title, bold: true, size: 22, font })], spacing: { before: 100 } }));
        state.notes.split("\n").forEach((l: string) => children.push(new Paragraph({ children: [new TextRun({ text: l, size: 20, font })] })));
      }

      children.push(
        new Paragraph({ children: [new TextRun({ text: state.footer_note, italics: true, size: 20, font })], spacing: { before: 200, after: 200 } }),
        new DocxTable({
          rows: [new DocxTableRow({
            children: [
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: state.sign_label_a, bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: state.sign_caption_a, italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: resolved.sign_name_a || "", bold: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  ...(resolved.sign_role_a ? [new Paragraph({ children: [new TextRun({ text: resolved.sign_role_a, size: 20, font })], alignment: AlignmentType.CENTER })] : []),
                ],
                borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
              }),
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: state.sign_label_b, bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: state.sign_caption_b, italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: resolved.sign_name_b || "", bold: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  ...(resolved.sign_role_b ? [new Paragraph({ children: [new TextRun({ text: resolved.sign_role_b, size: 20, font })], alignment: AlignmentType.CENTER })] : []),
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
      saveAs(blob, `BBBG-${contract.contract_number}.docx`);
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
          <DialogTitle>Biên bản giao nhận hàng hóa - {contract.contract_number}</DialogTitle>
        </DialogHeader>

        {legacy && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p>Đang dùng mẫu đã lưu trước đây. Nội dung, thông tin giao nhận và người ký đã lưu được giữ nguyên. Chuyển sang mẫu mới để dùng phần ký trống và nội dung ghi nhận giao nhận.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => { edit(s => convertHandoverReport(s, defaults)); setShowOnlineStamp(false); }}>Dùng mẫu bàn giao mới</Button>
          </div>
        )}
        {session.dirty && <p role="status" className="text-sm text-amber-700">Có thay đổi chưa lưu. Biên bản đã lưu chỉ thay đổi khi bấm Lưu.</p>}
        {!legacy && session.legacyReport && <Button size="sm" variant="outline" className="self-start" onClick={() => dispatch({ type: "back" })}>Quay lại mẫu đã lưu</Button>}

        <Accordion type="single" collapsible defaultValue="basic" className="mb-4">
          <AccordionItem value="basic">
            <AccordionTrigger>Thông tin giao nhận</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-1">
                <div>
                  <Label htmlFor="handover-date">Ngày giao nhận thực tế</Label>
                  <div className="flex gap-2"><Input id="handover-date" type="date" value={state.handover_date} onChange={e => set("handover_date", e.target.value)} /><Button variant="outline" size="sm" className="shrink-0" onClick={() => set("handover_date", handoverToday())}>Hôm nay</Button></div>
                </div>
                {version !== 1 && <>
                  <div><Label htmlFor="handover-time">Giờ giao nhận (tùy chọn)</Label><Input id="handover-time" type="time" value={state.handover_time} onChange={e => set("handover_time", e.target.value)} /></div>
                  <div className="md:col-span-3">
                    <Label htmlFor="handover-location">Địa điểm giao nhận thực tế</Label>
                    <Input id="handover-location" value={state.handover_location} onChange={e => set("handover_location", e.target.value)} placeholder="Kho, xưởng hoặc địa chỉ nơi hai bên giao nhận" />
                    {buyerAddress && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Button size="sm" variant="outline" onClick={() => set("handover_location", buyerAddress)}>Dùng địa chỉ bên nhận</Button><span>Chỉ sử dụng khi trùng với nơi giao nhận thực tế.</span></div>}
                  </div>
                </>}
                <div className="md:col-span-3"><Label htmlFor="handover-conclusion">Ghi nhận giao nhận</Label><Textarea id="handover-conclusion" value={state.conclusion} onChange={e => set("conclusion", e.target.value)} rows={2} /></div>
                <div className="md:col-span-3"><Label htmlFor="handover-notes">Ghi chú và nội dung cần xử lý</Label><Textarea id="handover-notes" value={state.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Ghi rõ hàng thiếu, chênh lệch, lỗi hoặc nội dung hai bên cần xử lý (nếu có)" /></div>
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
                {version === 1 && <div><Label>Câu mở 1 (dùng {`{ngày_bàn_giao}`} để chèn ngày)</Label><Textarea value={state.intro1} onChange={e => set("intro1", e.target.value)} rows={2} /></div>}
                <div><Label>Câu mở 2</Label><Textarea value={state.intro2} onChange={e => set("intro2", e.target.value)} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nhãn bên giao</Label><Input value={state.party_a_label} onChange={e => set("party_a_label", e.target.value)} /></div>
                  <div><Label>Nhãn bên nhận</Label><Input value={state.party_b_label} onChange={e => set("party_b_label", e.target.value)} /></div>
                  <div><Label>Thông tin bên giao</Label><Textarea value={state.party_a_text} onChange={e => set("party_a_text", e.target.value)} rows={5} /></div>
                  <div><Label>Thông tin bên nhận</Label><Textarea value={state.party_b_text} onChange={e => set("party_b_text", e.target.value)} rows={5} /></div>
                </div>
                <div><Label>Tiêu đề mục bàn giao</Label><Input value={state.items_title} onChange={e => set("items_title", e.target.value)} /></div>
                <div><Label>Tiêu đề mục ghi nhận giao nhận</Label><Input value={state.conclusion_title} onChange={e => set("conclusion_title", e.target.value)} /></div>
                <div><Label>Tiêu đề mục ghi chú</Label><Input value={state.notes_title} onChange={e => set("notes_title", e.target.value)} /></div>
                <div><Label>Câu kết</Label><Textarea value={state.footer_note} onChange={e => set("footer_note", e.target.value)} rows={2} /></div>
                {legacy && <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nhãn ký A</Label><Input value={state.sign_label_a} onChange={e => set("sign_label_a", e.target.value)} /></div>
                  <div><Label>Nhãn ký B</Label><Input value={state.sign_label_b} onChange={e => set("sign_label_b", e.target.value)} /></div>
                  <div><Label>Chú thích ký A</Label><Input value={state.sign_caption_a} onChange={e => set("sign_caption_a", e.target.value)} /></div>
                  <div><Label>Chú thích ký B</Label><Input value={state.sign_caption_b} onChange={e => set("sign_caption_b", e.target.value)} /></div>
                </div>}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="items">
            <AccordionTrigger>Hàng hóa giao nhận ({state.items.length})</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 p-1">
                <p className="text-xs text-muted-foreground">Đối chiếu và chỉnh số lượng, tình trạng theo hàng thực giao.</p>
                {state.items.map((it: HandoverItem, i: number) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input className="col-span-4" placeholder="Tên" value={it.name} onChange={e => setItem(i, "name", e.target.value)} />
                    <Input className="col-span-4" placeholder="Quy cách / kích thước" value={it.specifications} onChange={e => setItem(i, "specifications", e.target.value)} />
                    <Input className="col-span-1" placeholder="SL" value={it.quantity} onChange={e => setItem(i, "quantity", e.target.value)} />
                    <Input className="col-span-2" aria-label={`Tình trạng dòng ${i + 1}`} placeholder="Tình trạng thực tế" value={it.status} onChange={e => setItem(i, "status", e.target.value)} />
                    <Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-4 w-4 mr-1" />Thêm dòng</Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <Button size="sm" onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Đang lưu..." : "Lưu"}</Button>
          <Button size="sm" variant="outline" onClick={handleRestore}><RotateCcw className="h-4 w-4 mr-1" />Đặt lại bản nháp</Button>
          <div className="border-l mx-1 h-6" />
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />In</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadPDF}><FileDown className="h-4 w-4 mr-1" />Xuất PDF</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadWord}><FileText className="h-4 w-4 mr-1" />Xuất Word</Button>
          {version === 1 && <div className="flex items-center gap-2">
            <Switch checked={showOnlineStamp} onCheckedChange={setShowOnlineStamp} />
            <span className="text-xs font-medium">Chèn ảnh ký & con dấu đã cấu hình</span>
          </div>}
        </div>

        <div ref={printRef} className="bg-white p-6 rounded-lg border space-y-4" style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", lineHeight: 1.6, fontSize: "13px" }}>
          <div className="text-center space-y-1">
            <p className="font-bold text-sm">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="font-bold text-sm" style={{ textDecoration: "underline" }}>Độc lập – Tự do – Hạnh phúc</p>
            <p className="text-xs" style={{ color: "#6b7280" }}>————————</p>
          </div>

          <div className="text-center mt-4">
            <h2 className="text-lg font-bold" style={{ color: "#1a56db" }}>{state.title}</h2>
            <p className="text-sm italic">{state.subtitle}</p>
          </div>

          {resolved.eventLines.map((line, index) => <p key={index} className="whitespace-pre-wrap">{line}</p>)}
          <p className="whitespace-pre-wrap">{state.intro2}</p>

          <div className="p-3 border rounded">
            <p className="font-bold mb-1">{state.party_a_label}</p>
            <p className="whitespace-pre-wrap">{resolved.party_a_text}</p>
          </div>
          <div className="p-3 border rounded">
            <p className="font-bold mb-1">{state.party_b_label}</p>
            <p className="whitespace-pre-wrap">{resolved.party_b_text}</p>
          </div>

          <p className="font-bold mt-4">{state.items_title}</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th className="border border-gray-400 p-2 text-center w-10">TT</th>
                <th className="border border-gray-400 p-2 text-left">Tên sản phẩm</th>
                <th className="border border-gray-400 p-2 text-left">{resolved.specifications_header}</th>
                <th className="border border-gray-400 p-2 text-center w-12">SL</th>
                <th className="border border-gray-400 p-2 text-center">{resolved.status_header}</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((item: HandoverItem, i: number) => (
                <tr key={i}>
                  <td className="border border-gray-400 p-2 text-center">{i + 1}</td>
                  <td className="border border-gray-400 p-2">{item.name || "—"}</td>
                  <td className="border border-gray-400 p-2">{item.specifications || "—"}</td>
                  <td className="border border-gray-400 p-2 text-center">{item.quantity || 1}</td>
                  <td className="border border-gray-400 p-2 text-center">{item.status || resolved.status_fallback}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="font-bold mt-4">{state.conclusion_title}</p>
          <p className="whitespace-pre-wrap">{state.conclusion}</p>

          {state.notes && (
            <>
              <p className="font-bold mt-4">{state.notes_title}</p>
              <p className="whitespace-pre-wrap">{state.notes}</p>
            </>
          )}

          <p className="italic text-xs mt-4">{state.footer_note}</p>

          <div className="grid grid-cols-2 gap-8 pt-8 mt-8 text-center" style={{ borderTop: "1px solid #e5e7eb", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, textAlign: "center" }}>
            <div>
              <p className="font-bold">{state.sign_label_a}</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>{state.sign_caption_a}</p>
              {onlineStampVisible ? <OnlineStampSignature show sellerRep={resolved.sign_name_a} sellerPos="" /> : <><div style={{ height: 80 }}></div>{resolved.sign_name_a && <p className="font-bold">{resolved.sign_name_a}</p>}</>}
              {resolved.sign_role_a && <p className="text-xs">{resolved.sign_role_a}</p>}
            </div>
            <div>
              <p className="font-bold">{state.sign_label_b}</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>{state.sign_caption_b}</p>
              <div style={{ height: 80 }}></div>
              {resolved.sign_name_b && <p className="font-bold">{resolved.sign_name_b}</p>}
              {resolved.sign_role_b && <p className="text-xs">{resolved.sign_role_b}</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
