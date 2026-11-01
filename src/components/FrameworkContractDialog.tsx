import { contractDateLabel } from "@/lib/contract-calculation";
import { savedSellerValue } from "@/lib/contract-document";
import { useRef, useState } from "react";
import { OnlineStampSignature } from "@/components/OnlineStampSignature";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Printer, FileDown, FileText, Save, Loader2 } from "lucide-react";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { useUpdateContract } from "@/hooks/useContracts";
import { useToast } from "@/hooks/use-toast";
import { exportElementToPDF } from "@/lib/pdfUtils";
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

const defaultArticles = [
  {
    title: "ĐIỀU 1: PHẠM VI HỢP TÁC",
    content: `Bên A đồng ý cung cấp cho Bên B các sản phẩm/dịch vụ theo từng đơn hàng cụ thể được hai bên thống nhất trong quá trình hợp tác.\nChi tiết sản phẩm, số lượng, đơn giá và thời gian giao hàng sẽ được quy định trong từng Hợp đồng kinh tế/Đơn đặt hàng riêng biệt.`,
  },
  {
    title: "ĐIỀU 2: GIÁ CẢ VÀ THANH TOÁN",
    content: `Giá cả sản phẩm/dịch vụ sẽ được thỏa thuận và ghi rõ trong từng đơn hàng cụ thể.\nPhương thức thanh toán: Tiền mặt hoặc chuyển khoản theo thỏa thuận từng đơn hàng.\nThời hạn thanh toán: Theo thỏa thuận cụ thể trong từng Hợp đồng kinh tế/Đơn đặt hàng.`,
  },
  {
    title: "ĐIỀU 3: GIAO NHẬN HÀNG HÓA",
    content: `Bên A có trách nhiệm giao hàng đúng chất lượng, số lượng, chủng loại theo từng đơn hàng.\nĐịa điểm giao hàng: Theo thỏa thuận trong từng đơn hàng cụ thể.\nBên B có trách nhiệm kiểm tra và xác nhận hàng hóa tại thời điểm giao nhận.`,
  },
  {
    title: "ĐIỀU 4: TRÁCH NHIỆM CÁC BÊN",
    content: `Bên A cam kết:\n- Cung cấp sản phẩm/dịch vụ đúng chất lượng, tiêu chuẩn đã thỏa thuận.\n- Bảo hành sản phẩm theo chính sách bảo hành của Bên A.\n- Hỗ trợ kỹ thuật khi Bên B yêu cầu.\n\nBên B cam kết:\n- Thanh toán đúng hạn theo thỏa thuận.\n- Cung cấp đầy đủ thông tin cần thiết để Bên A thực hiện đơn hàng.\n- Phối hợp trong quá trình giao nhận và nghiệm thu.`,
  },
  {
    title: "ĐIỀU 5: THỜI HẠN HIỆU LỰC",
    content: `Hợp đồng có hiệu lực kể từ ngày ký và có thời hạn 12 tháng.\nSau khi hết hạn, nếu hai bên không có ý kiến khác thì hợp đồng tự động gia hạn thêm 12 tháng.\nMỗi bên có quyền chấm dứt hợp đồng bằng cách thông báo bằng văn bản trước 30 ngày.`,
  },
  {
    title: "ĐIỀU 6: ĐIỀU KHOẢN CHUNG",
    content: `Mọi tranh chấp phát sinh từ hợp đồng này sẽ được giải quyết thông qua thương lượng, hòa giải. Trường hợp không thương lượng được, sẽ đưa ra Tòa án có thẩm quyền giải quyết.\nHợp đồng này được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau.\nCác phụ lục, đơn hàng, hợp đồng kinh tế được ký kết trong thời gian hiệu lực là bộ phận không tách rời của hợp đồng này.`,
  },
];

export const FrameworkContractDialog = ({ open, onOpenChange, contract }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { settings: companySettings } = useTemplateSettings();
  const updateContract = useUpdateContract();
  const { toast } = useToast();
  const [frameworkDate, setFrameworkDate] = useState(new Date().toISOString().split("T")[0]);
  const [validityMonths, setValidityMonths] = useState("12");
  const [scope, setScope] = useState("");
  const [additionalTerms, setAdditionalTerms] = useState("");
  const [articles, setArticles] = useState(contract.articles?.length ? contract.articles : defaultArticles);
  const [showOnlineStamp, setShowOnlineStamp] = useState(false);

  if (!contract) return null;

  const formatDate = (d: string) => d ? contractDateLabel(d) : "—";

  const seller = contract.seller_info || {};
  const buyer = contract.buyer_info || {};
  const sellerName = savedSellerValue(seller, "company_name", companySettings.companyName);
  const sellerRep = seller.representative || "...";
  const sellerPos = seller.position || "Giám đốc";
  const sellerAddr = savedSellerValue(seller, "address", companySettings.address);
  const sellerPhone = savedSellerValue(seller, "phone", companySettings.phone);
  const sellerTax = savedSellerValue(seller, "tax_code", companySettings.taxCode);
  const sellerBank = savedSellerValue(seller, "bank_info", companySettings.bankInfo);
  
  const buyerName = buyer.company_name || contract.customers?.company || contract.customers?.name || "—";
  const buyerRep = buyer.representative || "...";
  const buyerPos = buyer.position || "";
  const buyerAddr = buyer.address || "";
  const buyerPhone = buyer.phone || "";
  const buyerTax = buyer.tax_code || "";

  const isStandaloneFramework = contract.contract_number?.startsWith("HDNT-");
  const frameworkNumber = isStandaloneFramework ? contract.contract_number : `HDNT-${contract.contract_number}`;

  const handleArticleChange = (idx: number, field: "title" | "content", value: string) => {
    setArticles(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>HĐNT - ${contract.contract_number}</title>
    <style>
      @page { margin: 20mm; }
      body { font-family: 'Times New Roman', Times, serif; padding: 20px; font-size: 13px; line-height: 1.6; color: #000; }
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
      await exportElementToPDF(printRef.current, `HDNT-${contract.contract_number}.pdf`);
      toast({ title: "Đã tải PDF thành công!" });
    } catch {
      toast({ title: "Lỗi tạo PDF", variant: "destructive" });
    }
  };

  const handleDownloadWord = async () => {
    try {
      toast({ title: "Đang tạo file Word..." });
      const noBorder = { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } };
      const font = "Times New Roman";

      const makePartyParagraphs = (label: string, name: string, rep: string, pos: string, addr: string, phone: string, tax: string, bank?: string, hq?: string) => {
        const paras: Paragraph[] = [
          new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 22, font })], spacing: { before: 100 } }),
          new Paragraph({ children: [new TextRun({ text: `Công ty: ${name}`, size: 20, font })] }),
        ];
        
        if (addr) paras.push(new Paragraph({ children: [new TextRun({ text: `Địa chỉ: ${addr}`, size: 20, font })] }));
        paras.push(new Paragraph({ children: [new TextRun({ text: `Đại diện: ${rep}`, size: 20, font }), ...(pos ? [new TextRun({ text: `    Chức vụ: ${pos}`, size: 20, font })] : [])] }));
        if (phone) paras.push(new Paragraph({ children: [new TextRun({ text: `Điện thoại: ${phone}`, size: 20, font })] }));
        if (tax) paras.push(new Paragraph({ children: [new TextRun({ text: `MST: ${tax}`, size: 20, font })] }));
        if (bank) paras.push(new Paragraph({ children: [new TextRun({ text: `Ngân hàng: ${bank}`, size: 20, font })] }));
        return paras;
      };

      const children: any[] = [
        new Paragraph({ children: [new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 24, font })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "Độc lập – Tự do – Hạnh phúc", bold: true, size: 24, font, underline: {} })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "————————", size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "HỢP ĐỒNG NGUYÊN TẮC", bold: true, size: 32, font, color: "1a56db" })], alignment: AlignmentType.CENTER, spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Số: ${frameworkNumber}`, size: 22, font })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: `Ngày ${formatDate(frameworkDate)}`, italics: true, size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
        ...(isStandaloneFramework ? [] : [new Paragraph({ children: [new TextRun({ text: `(Tham chiếu Hợp đồng số: ${contract.contract_number} ngày ${formatDate(contract.contract_date)})`, italics: true, size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } })]),
        ...makePartyParagraphs("BÊN A (Bên cung cấp):", sellerName, sellerRep, sellerPos, sellerAddr, sellerPhone, sellerTax, sellerBank),
        ...makePartyParagraphs("BÊN B (Bên sử dụng):", buyerName, buyerRep, buyerPos, buyerAddr, buyerPhone, buyerTax),
        new Paragraph({ children: [new TextRun({ text: "Hai bên cùng thỏa thuận ký kết Hợp đồng Nguyên tắc với các điều khoản sau:", bold: true, size: 22, font })], alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } }),
      ];

      // Articles
      articles.forEach((article) => {
        children.push(new Paragraph({ children: [new TextRun({ text: article.title, bold: true, size: 22, font })], spacing: { before: 200 } }));
        const lines = article.content.split("\n");
        lines.forEach(line => {
          children.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, font })], spacing: { after: 40 } }));
        });
      });

      // Scope override
      if (scope) {
        children.push(new Paragraph({ children: [new TextRun({ text: "PHẠM VI BỔ SUNG:", bold: true, size: 22, font })], spacing: { before: 200 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: scope, size: 20, font })] }));
      }

      if (additionalTerms) {
        children.push(new Paragraph({ children: [new TextRun({ text: "ĐIỀU KHOẢN BỔ SUNG:", bold: true, size: 22, font })], spacing: { before: 200 } }));
        additionalTerms.split("\n").forEach(line => {
          children.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, font })], spacing: { after: 40 } }));
        });
      }

      // Signature
      children.push(
        new Paragraph({ text: "", spacing: { before: 400 } }),
        new DocxTable({
          rows: [new DocxTableRow({
            children: [
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "ĐẠI DIỆN BÊN A", bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: sellerRep !== "..." ? sellerRep : "", bold: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                ],
                borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
              }),
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "ĐẠI DIỆN BÊN B", bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: buyerRep !== "..." ? buyerRep : "", bold: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                ],
                borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
              }),
            ],
          })],
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideHorizontal: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 } },
        }),
      );

      const doc = new Document({
        sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } }, children }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `HDNT-${contract.contract_number}.docx`);
      toast({ title: "Đã tải file Word thành công!" });
    } catch (err) {
      console.error("Word export error:", err);
      toast({ title: "Lỗi tạo file Word", variant: "destructive" });
    }
  };

  const PartyInfoBlock = ({ label, name, rep, pos, addr, phone, tax, bank, hq }: { label: string; name: string; rep: string; pos: string; addr: string; phone: string; tax: string; bank?: string; hq?: string }) => (
    <div className="p-3 border rounded">
      <p className="font-bold mb-1">{label}</p>
      <p><strong>Công ty:</strong> {name}</p>
      
      {addr && <p><strong>Địa chỉ:</strong> {addr}</p>}
      <p><strong>Đại diện:</strong> {rep}{pos ? <span className="ml-4"><strong>Chức vụ:</strong> {pos}</span> : null}</p>
      {(phone || tax) && (
        <p>
          {phone && <><strong>ĐT:</strong> {phone}</>}
          {phone && tax && <span className="mx-3">|</span>}
          {tax && <><strong>MST:</strong> {tax}</>}
        </p>
      )}
      {bank && <p><strong>Ngân hàng:</strong> {bank}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hợp đồng Nguyên tắc - {contract.contract_number}</DialogTitle>
        </DialogHeader>

        {/* Editable fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 border rounded-lg bg-muted/30">
          <div>
            <Label>Ngày ký HĐNT</Label>
            <Input type="date" value={frameworkDate} onChange={e => setFrameworkDate(e.target.value)} />
          </div>
          <div>
            <Label>Thời hạn hiệu lực (tháng)</Label>
            <Input type="number" value={validityMonths} onChange={e => setValidityMonths(e.target.value)} min="1" />
          </div>
          <div>
            <Label>Phạm vi hợp tác bổ sung</Label>
            <Textarea value={scope} onChange={e => setScope(e.target.value)} rows={2} placeholder="Nội dung bổ sung (nếu có)..." />
          </div>
          <div className="md:col-span-3">
            <Label>Điều khoản bổ sung</Label>
            <Textarea value={additionalTerms} onChange={e => setAdditionalTerms(e.target.value)} rows={2} placeholder="Điều khoản bổ sung ngoài 6 điều mặc định..." />
          </div>
        </div>

        {/* Editable articles */}
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">Chỉnh sửa nội dung các điều khoản</summary>
          <div className="mt-3 space-y-3 p-3 border rounded-lg bg-muted/20">
            {articles.map((article, idx) => (
              <div key={idx}>
                <Label className="text-xs">{article.title}</Label>
                <Textarea
                  value={article.content}
                  onChange={e => handleArticleChange(idx, "content", e.target.value)}
                  rows={4}
                  className="mt-1 text-xs"
                />
              </div>
            ))}
          </div>
        </details>

        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />In</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadPDF}><FileDown className="h-4 w-4 mr-1" />Xuất PDF</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadWord}><FileText className="h-4 w-4 mr-1" />Xuất Word</Button>
          <Button size="sm" onClick={async () => {
            try {
              await updateContract.mutateAsync({ id: contract.id, articles } as any);
              toast({ title: "Đã lưu thay đổi điều khoản!" });
            } catch (err: any) {
              toast({ title: "Lỗi lưu", description: err.message, variant: "destructive" });
            }
          }} disabled={updateContract.isPending}>
            {updateContract.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Lưu thay đổi
          </Button>
          <div className="border-l mx-1 h-6" />
          <div className="flex items-center gap-2">
            <Switch checked={showOnlineStamp} onCheckedChange={setShowOnlineStamp} />
            <span className="text-xs font-medium">Ký & đóng dấu online</span>
          </div>
        </div>

        {/* Preview */}
        <div ref={printRef} className="bg-white p-6 rounded-lg border space-y-4" style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", lineHeight: 1.6, fontSize: "13px" }}>
          <div className="text-center space-y-1">
            <p className="font-bold text-sm">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="font-bold text-sm" style={{ textDecoration: "underline" }}>Độc lập – Tự do – Hạnh phúc</p>
            <p className="text-xs" style={{ color: "#6b7280" }}>————————</p>
          </div>

          <div className="text-center mt-4">
            <h2 className="text-lg font-bold" style={{ color: "#1a56db" }}>HỢP ĐỒNG NGUYÊN TẮC</h2>
            <p className="text-sm">Số: <strong>{frameworkNumber}</strong></p>
            <p className="text-xs italic">Ngày {formatDate(frameworkDate)}</p>
            {!isStandaloneFramework && <p className="text-xs italic">(Tham chiếu Hợp đồng số: {contract.contract_number} ngày {formatDate(contract.contract_date)})</p>}
          </div>

          <PartyInfoBlock label="BÊN A (Bên cung cấp):" name={sellerName} rep={sellerRep} pos={sellerPos} addr={sellerAddr} phone={sellerPhone} tax={sellerTax} bank={sellerBank} />
          <PartyInfoBlock label="BÊN B (Bên sử dụng):" name={buyerName} rep={buyerRep} pos={buyerPos} addr={buyerAddr} phone={buyerPhone} tax={buyerTax} />

          <p className="font-bold text-center">Hai bên cùng thỏa thuận ký kết Hợp đồng Nguyên tắc với các điều khoản sau:</p>

          {articles.map((article, idx) => (
            <div key={idx}>
              <p className="font-bold mt-4">{article.title}</p>
              <div className="whitespace-pre-wrap text-sm">{article.content}</div>
            </div>
          ))}

          {scope && (
            <div>
              <p className="font-bold mt-4">PHẠM VI BỔ SUNG:</p>
              <p className="whitespace-pre-wrap">{scope}</p>
            </div>
          )}

          {additionalTerms && (
            <div>
              <p className="font-bold mt-4">ĐIỀU KHOẢN BỔ SUNG:</p>
              <p className="whitespace-pre-wrap">{additionalTerms}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-8 mt-8 text-center" style={{ borderTop: "1px solid #e5e7eb" }}>
            <div>
              <p className="font-bold">ĐẠI DIỆN BÊN A</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, đóng dấu)</p>
              <OnlineStampSignature show={showOnlineStamp} sellerRep={sellerRep !== "..." ? sellerRep : undefined} sellerPos={sellerPos !== "..." ? sellerPos : "Giám đốc"} />
              {!showOnlineStamp && <div style={{ height: 80 }}></div>}
              {!showOnlineStamp && sellerRep !== "..." && <p className="font-bold">{sellerRep}</p>}
            </div>
            <div>
              <p className="font-bold">ĐẠI DIỆN BÊN B</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
              <p className="font-bold">{buyerRep !== "..." ? buyerRep : ""}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
