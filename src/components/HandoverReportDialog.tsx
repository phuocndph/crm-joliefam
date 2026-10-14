import { useRef, useState, useEffect, useMemo } from "react";
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

interface HandoverItem { name: string; specifications: string; quantity: string; status: string; }

export const HandoverReportDialog = ({ open, onOpenChange, contract }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { settings: companySettings } = useTemplateSettings();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showOnlineStamp, setShowOnlineStamp] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaults = useMemo(() => {
    const seller = contract?.seller_info || {};
    const buyer = contract?.buyer_info || {};
    const items = Array.isArray(contract?.items) ? contract.items : [];
    const sellerName = companySettings.companyName || seller.company_name || "";
    const sellerAddr = companySettings.address || seller.address || "...";
    const buyerName = buyer.company_name || contract?.customers?.company || contract?.customers?.name || "—";
    const partyToText = (label: string, name: string, rep: string, pos: string, addr: string, phone: string, tax: string) => {
      const lines = [
        `Công ty: ${name}`,
        `Đại diện: ${rep || "..."}${pos ? `    Chức vụ: ${pos}` : ""}`,
      ];
      if (addr) lines.push(`Địa chỉ: ${addr}`);
      if (phone) lines.push(`Điện thoại: ${phone}`);
      if (tax) lines.push(`MST: ${tax}`);
      return lines.join("\n");
    };
    return {
      title: "BIÊN BẢN BÀN GIAO",
      subtitle: `(Kèm theo Hợp đồng số: ${contract?.contract_number || ""})`,
      handover_date: new Date().toISOString().split("T")[0],
      intro1: `Hôm nay, ngày {ngày_bàn_giao}, tại ${sellerAddr}`,
      intro2: `Căn cứ Hợp đồng số ${contract?.contract_number || ""} ngày ${contract?.contract_date ? new Date(contract.contract_date).toLocaleDateString("vi-VN") : ""}, hai bên tiến hành bàn giao như sau:`,
      party_a_label: "BÊN GIAO (Bên A):",
      party_a_text: partyToText("A", sellerName, seller.representative || "...", seller.position || "Giám đốc", sellerAddr, companySettings.phone || seller.phone || "", companySettings.taxCode || seller.tax_code || ""),
      party_b_label: "BÊN NHẬN (Bên B):",
      party_b_text: partyToText("B", buyerName, buyer.representative || "...", buyer.position || "", buyer.address || "", buyer.phone || "", buyer.tax_code || ""),
      items_title: "I. NỘI DUNG BÀN GIAO:",
      items: items.map((it: any) => ({
        name: it.name || "",
        specifications: it.specifications || it.description || "",
        quantity: String(it.quantity || 1),
        status: "Đạt",
      })) as HandoverItem[],
      conclusion_title: "II. KẾT LUẬN:",
      conclusion: "Hàng hóa đạt yêu cầu chất lượng theo hợp đồng. Hai bên thống nhất nghiệm thu đạt.",
      notes_title: "III. GHI CHÚ:",
      notes: "",
      footer_note: "Biên bản được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau.",
      sign_label_a: "BÊN GIAO (BÊN A)",
      sign_label_b: "BÊN NHẬN (BÊN B)",
      sign_caption_a: "(Ký, đóng dấu)",
      sign_caption_b: "(Ký, ghi rõ họ tên)",
      sign_name_a: seller.representative && seller.representative !== "..." ? seller.representative : "",
      sign_name_b: buyer.representative && buyer.representative !== "..." ? buyer.representative : "",
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
  const setItem = (i: number, k: keyof HandoverItem, v: string) =>
    setState((s: any) => ({ ...s, items: s.items.map((it: HandoverItem, idx: number) => idx === i ? { ...it, [k]: v } : it) }));
  const addItem = () => setState((s: any) => ({ ...s, items: [...s.items, { name: "", specifications: "", quantity: "1", status: "Đạt" }] }));
  const removeItem = (i: number) => setState((s: any) => ({ ...s, items: s.items.filter((_: any, idx: number) => idx !== i) }));

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("vi-VN") : "—";
  const intro1Resolved = state.intro1.replace("{ngày_bàn_giao}", formatDate(state.handover_date));

  const handleSave = async () => {
    setSaving(true);
    const next = { ...(contract.document_overrides || {}), [FORM_KEY]: state };
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
    qc.invalidateQueries({ queryKey: ["contracts"] });
    toast({ title: "Đã lưu nội dung biểu mẫu" });
  };

  const handleRestore = async () => {
    const next = { ...(contract.document_overrides || {}) };
    delete next[FORM_KEY];
    try {
      if (isLocalBackend()) await localApi.updateContract(contract.id, { document_overrides: next });
      else {
        const { error } = await supabase.from("contracts").update({ document_overrides: next }).eq("id", contract.id);
        if (error) throw error;
      }
    } catch (error) {
      toast({ title: "Lỗi", description: error instanceof Error ? error.message : "Không thể khôi phục biên bản", variant: "destructive" });
      return;
    }
    setState(defaults);
    qc.invalidateQueries({ queryKey: ["contracts"] });
    toast({ title: "Đã khôi phục mặc định" });
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
        children: ["TT", "Tên sản phẩm", "Kích thước", "SL", "Tình trạng"].map(text =>
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
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.status || "Đạt", size: 20, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
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
        new Paragraph({ children: [new TextRun({ text: intro1Resolved, size: 20, font })], spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: state.intro2, size: 20, font })], spacing: { after: 200 } }),
        ...partyToParas(state.party_a_label, state.party_a_text),
        ...partyToParas(state.party_b_label, state.party_b_text),
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
                  new Paragraph({ children: [new TextRun({ text: state.sign_name_a || "", bold: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                ],
                borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
              }),
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: state.sign_label_b, bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: state.sign_caption_b, italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: state.sign_name_b || "", bold: true, size: 20, font })], alignment: AlignmentType.CENTER }),
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

  const seller = contract.seller_info || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Biên bản Bàn giao - {contract.contract_number}</DialogTitle>
        </DialogHeader>

        <Accordion type="single" collapsible defaultValue="basic" className="mb-4">
          <AccordionItem value="basic">
            <AccordionTrigger>Thông tin cơ bản</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-1">
                <div><Label>Ngày bàn giao</Label><Input type="date" value={state.handover_date} onChange={e => set("handover_date", e.target.value)} /></div>
                <div className="md:col-span-2"><Label>Kết luận</Label><Textarea value={state.conclusion} onChange={e => set("conclusion", e.target.value)} rows={2} /></div>
                <div className="md:col-span-3"><Label>Ghi chú</Label><Textarea value={state.notes} onChange={e => set("notes", e.target.value)} rows={2} /></div>
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
                <div><Label>Câu mở 1 (dùng {`{ngày_bàn_giao}`} để chèn ngày)</Label><Textarea value={state.intro1} onChange={e => set("intro1", e.target.value)} rows={2} /></div>
                <div><Label>Câu mở 2</Label><Textarea value={state.intro2} onChange={e => set("intro2", e.target.value)} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nhãn Bên A</Label><Input value={state.party_a_label} onChange={e => set("party_a_label", e.target.value)} /></div>
                  <div><Label>Nhãn Bên B</Label><Input value={state.party_b_label} onChange={e => set("party_b_label", e.target.value)} /></div>
                  <div><Label>Thông tin Bên A</Label><Textarea value={state.party_a_text} onChange={e => set("party_a_text", e.target.value)} rows={5} /></div>
                  <div><Label>Thông tin Bên B</Label><Textarea value={state.party_b_text} onChange={e => set("party_b_text", e.target.value)} rows={5} /></div>
                </div>
                <div><Label>Tiêu đề mục bàn giao</Label><Input value={state.items_title} onChange={e => set("items_title", e.target.value)} /></div>
                <div><Label>Tiêu đề mục kết luận</Label><Input value={state.conclusion_title} onChange={e => set("conclusion_title", e.target.value)} /></div>
                <div><Label>Tiêu đề mục ghi chú</Label><Input value={state.notes_title} onChange={e => set("notes_title", e.target.value)} /></div>
                <div><Label>Câu kết</Label><Textarea value={state.footer_note} onChange={e => set("footer_note", e.target.value)} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Nhãn ký A</Label><Input value={state.sign_label_a} onChange={e => set("sign_label_a", e.target.value)} /></div>
                  <div><Label>Nhãn ký B</Label><Input value={state.sign_label_b} onChange={e => set("sign_label_b", e.target.value)} /></div>
                  <div><Label>Chú thích ký A</Label><Input value={state.sign_caption_a} onChange={e => set("sign_caption_a", e.target.value)} /></div>
                  <div><Label>Chú thích ký B</Label><Input value={state.sign_caption_b} onChange={e => set("sign_caption_b", e.target.value)} /></div>
                  <div><Label>Tên người ký A</Label><Input value={state.sign_name_a} onChange={e => set("sign_name_a", e.target.value)} /></div>
                  <div><Label>Tên người ký B</Label><Input value={state.sign_name_b} onChange={e => set("sign_name_b", e.target.value)} /></div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="items">
            <AccordionTrigger>Danh sách hàng bàn giao ({state.items.length})</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 p-1">
                {state.items.map((it: HandoverItem, i: number) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input className="col-span-4" placeholder="Tên" value={it.name} onChange={e => setItem(i, "name", e.target.value)} />
                    <Input className="col-span-4" placeholder="Kích thước" value={it.specifications} onChange={e => setItem(i, "specifications", e.target.value)} />
                    <Input className="col-span-1" placeholder="SL" value={it.quantity} onChange={e => setItem(i, "quantity", e.target.value)} />
                    <Input className="col-span-2" placeholder="Tình trạng" value={it.status} onChange={e => setItem(i, "status", e.target.value)} />
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
            <p className="font-bold text-sm">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="font-bold text-sm" style={{ textDecoration: "underline" }}>Độc lập – Tự do – Hạnh phúc</p>
            <p className="text-xs" style={{ color: "#6b7280" }}>————————</p>
          </div>

          <div className="text-center mt-4">
            <h2 className="text-lg font-bold" style={{ color: "#1a56db" }}>{state.title}</h2>
            <p className="text-sm italic">{state.subtitle}</p>
          </div>

          <p className="whitespace-pre-wrap">{intro1Resolved}</p>
          <p className="whitespace-pre-wrap">{state.intro2}</p>

          <div className="p-3 border rounded">
            <p className="font-bold mb-1">{state.party_a_label}</p>
            <p className="whitespace-pre-wrap">{state.party_a_text}</p>
          </div>
          <div className="p-3 border rounded">
            <p className="font-bold mb-1">{state.party_b_label}</p>
            <p className="whitespace-pre-wrap">{state.party_b_text}</p>
          </div>

          <p className="font-bold mt-4">{state.items_title}</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th className="border border-gray-400 p-2 text-center w-10">TT</th>
                <th className="border border-gray-400 p-2 text-left">Tên sản phẩm</th>
                <th className="border border-gray-400 p-2 text-left">Kích thước</th>
                <th className="border border-gray-400 p-2 text-center w-12">SL</th>
                <th className="border border-gray-400 p-2 text-center">Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((item: HandoverItem, i: number) => (
                <tr key={i}>
                  <td className="border border-gray-400 p-2 text-center">{i + 1}</td>
                  <td className="border border-gray-400 p-2">{item.name || "—"}</td>
                  <td className="border border-gray-400 p-2">{item.specifications || "—"}</td>
                  <td className="border border-gray-400 p-2 text-center">{item.quantity || 1}</td>
                  <td className="border border-gray-400 p-2 text-center">{item.status || "Đạt"}</td>
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

          <div className="grid grid-cols-2 gap-8 pt-8 mt-8 text-center" style={{ borderTop: "1px solid #e5e7eb" }}>
            <div>
              <p className="font-bold">{state.sign_label_a}</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>{state.sign_caption_a}</p>
              <OnlineStampSignature show={showOnlineStamp} sellerRep={seller.representative} sellerPos="Giám đốc" />
              {!showOnlineStamp && <div style={{ height: 80 }}></div>}
              {state.sign_name_a && !showOnlineStamp && <p className="font-bold">{state.sign_name_a}</p>}
            </div>
            <div>
              <p className="font-bold">{state.sign_label_b}</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>{state.sign_caption_b}</p>
              <div style={{ height: 80 }}></div>
              {state.sign_name_b && <p className="font-bold">{state.sign_name_b}</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
