import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomers } from "@/hooks/useCustomers";
import { useCreateContract } from "@/hooks/useContracts";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";

interface Props {
  onSuccess: () => void;
}

const generateFrameworkNumber = () => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
  return `HDNT-${dateStr}-${rand}`;
};

const defaultArticles = [
  { title: "ĐIỀU 1: PHẠM VI HỢP TÁC", content: "Bên A đồng ý cung cấp cho Bên B các sản phẩm/dịch vụ theo từng đơn hàng cụ thể được hai bên thống nhất trong quá trình hợp tác.\nChi tiết sản phẩm, số lượng, đơn giá và thời gian giao hàng sẽ được quy định trong từng Hợp đồng kinh tế/Đơn đặt hàng riêng biệt." },
  { title: "ĐIỀU 2: GIÁ CẢ VÀ THANH TOÁN", content: "Giá cả sản phẩm/dịch vụ sẽ được thỏa thuận và ghi rõ trong từng đơn hàng cụ thể.\nPhương thức thanh toán: Tiền mặt hoặc chuyển khoản theo thỏa thuận từng đơn hàng.\nThời hạn thanh toán: Theo thỏa thuận cụ thể trong từng Hợp đồng kinh tế/Đơn đặt hàng." },
  { title: "ĐIỀU 3: GIAO NHẬN HÀNG HÓA", content: "Bên A có trách nhiệm giao hàng đúng chất lượng, số lượng, chủng loại theo từng đơn hàng.\nĐịa điểm giao hàng: Theo thỏa thuận trong từng đơn hàng cụ thể.\nBên B có trách nhiệm kiểm tra và xác nhận hàng hóa tại thời điểm giao nhận." },
  { title: "ĐIỀU 4: TRÁCH NHIỆM CÁC BÊN", content: "Bên A cam kết:\n- Cung cấp sản phẩm/dịch vụ đúng chất lượng, tiêu chuẩn đã thỏa thuận.\n- Bảo hành sản phẩm theo chính sách bảo hành của Bên A.\n- Hỗ trợ kỹ thuật khi Bên B yêu cầu.\n\nBên B cam kết:\n- Thanh toán đúng hạn theo thỏa thuận.\n- Cung cấp đầy đủ thông tin cần thiết để Bên A thực hiện đơn hàng.\n- Phối hợp trong quá trình giao nhận và nghiệm thu." },
  { title: "ĐIỀU 5: THỜI HẠN HIỆU LỰC", content: "Hợp đồng có hiệu lực kể từ ngày ký và có thời hạn 12 tháng.\nSau khi hết hạn, nếu hai bên không có ý kiến khác thì hợp đồng tự động gia hạn thêm 12 tháng.\nMỗi bên có quyền chấm dứt hợp đồng bằng cách thông báo bằng văn bản trước 30 ngày." },
  { title: "ĐIỀU 6: ĐIỀU KHOẢN CHUNG", content: "Mọi tranh chấp phát sinh từ hợp đồng này sẽ được giải quyết thông qua thương lượng, hòa giải. Trường hợp không thương lượng được, sẽ đưa ra Tòa án có thẩm quyền giải quyết.\nHợp đồng này được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau.\nCác phụ lục, đơn hàng, hợp đồng kinh tế được ký kết trong thời gian hiệu lực là bộ phận không tách rời của hợp đồng này." },
];

export const CreateFrameworkContractForm = ({ onSuccess }: Props) => {
  const { data: customers } = useCustomers();
  const { settings: companySettings } = useTemplateSettings();
  const createContract = useCreateContract();
  const { toast } = useToast();

  const [contractNumber] = useState(generateFrameworkNumber());
  const [contractDate, setContractDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [sellerRep, setSellerRep] = useState("​");
  const [sellerPos, setSellerPos] = useState("Giám đốc");
  const [articles, setArticles] = useState(defaultArticles);
  const [lookingUpTax, setLookingUpTax] = useState(false);

  const [buyerInfo, setBuyerInfo] = useState({
    company_name: "", representative: "", position: "Giám đốc",
    address: "", tax_code: "", phone: "",
  });

  // Auto-fill buyer from customer
  useEffect(() => {
    if (customerId && customers) {
      const c = customers.find((cust: any) => cust.id === customerId);
      if (c) {
        setBuyerInfo(prev => ({
          ...prev,
          company_name: c.company || c.name || "",
          address: c.address || "",
          phone: c.phone || "",
        }));
      }
    }
  }, [customerId, customers]);

  const handleTaxLookup = async () => {
    if (!buyerInfo.tax_code.trim()) return;
    setLookingUpTax(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-tax-code", {
        body: { type: "tax_code", data: buyerInfo.tax_code.trim() }
      });
      if (error) throw error;
      if (data && !data.error) {
        setBuyerInfo(prev => ({
          ...prev,
          company_name: data.company_name || prev.company_name,
          representative: data.representative || prev.representative,
          position: data.position || prev.position,
          address: data.address || prev.address,
          phone: data.phone || prev.phone,
        }));
        toast({ title: "Đã tìm thấy thông tin doanh nghiệp!" });
      }
    } catch { /* ignore */ }
    setLookingUpTax(false);
  };

  const handleArticleChange = (idx: number, field: "title" | "content", value: string) => {
    setArticles(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const addArticle = () => {
    setArticles(prev => [...prev, { title: `ĐIỀU ${prev.length + 1}: `, content: "" }]);
  };

  const removeArticle = (idx: number) => {
    setArticles(prev => prev.filter((_, i) => i !== idx));
  };

  const moveArticle = (idx: number, dir: -1 | 1) => {
    setArticles(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const resetArticles = () => setArticles(defaultArticles);

  const handleSubmit = async () => {
    if (!buyerInfo.company_name.trim()) {
      toast({ title: "Vui lòng nhập tên công ty Bên B", variant: "destructive" });
      return;
    }

    try {
      const user = (await supabase.auth.getUser()).data.user;
      await createContract.mutateAsync({
        contract_number: contractNumber,
        title: "HỢP ĐỒNG NGUYÊN TẮC",
        status: "active",
        contract_date: contractDate,
        customer_id: customerId || null,
        total_amount: 0,
        deposit_amount: 0,
        notes,
        manager_id: user?.id,
        seller_info: {
          company_name: companySettings.companyName,
          address: companySettings.address,
          phone: companySettings.phone,
          tax_code: companySettings.taxCode,
          bank_info: companySettings.bankInfo,
          representative: sellerRep,
          position: sellerPos,
        },
        buyer_info: buyerInfo,
        articles: articles,
        legal_basis: [
          "Căn cứ Luật Thương mại số 36/2005/QH11 ngày 14/06/2005;",
          "Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015;",
          "Căn cứ vào nhu cầu và khả năng của hai bên.",
        ],
      } as any);

      toast({ title: "Đã tạo Hợp đồng Nguyên tắc thành công!" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Lỗi tạo hợp đồng", description: err.message, variant: "destructive" });
    }
  };

  const filteredCustomers = customers?.filter((c: any) =>
    !customerSearch || c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.company?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch)
  ) || [];

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Mã hợp đồng</Label>
          <Input value={contractNumber} readOnly className="bg-muted" />
        </div>
        <div>
          <Label>Ngày ký</Label>
          <Input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} />
        </div>
      </div>

      {/* Seller info */}
      <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
        <h3 className="font-semibold text-sm">BÊN A (Bên cung cấp)</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Công ty</Label>
            <Input value={companySettings.companyName || ""} readOnly className="bg-muted text-xs" />
          </div>
          <div>
            <Label className="text-xs">Địa chỉ</Label>
            <Input value={companySettings.address || ""} readOnly className="bg-muted text-xs" />
          </div>
          <div>
            <Label className="text-xs">Người đại diện</Label>
            <Input value={sellerRep} onChange={e => setSellerRep(e.target.value)} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Chức vụ</Label>
            <Input value={sellerPos} onChange={e => setSellerPos(e.target.value)} className="text-xs" />
          </div>
        </div>
      </div>

      {/* Buyer info */}
      <div className="p-4 border rounded-lg space-y-3">
        <h3 className="font-semibold text-sm">BÊN B (Bên sử dụng)</h3>
        
        {/* Customer search */}
        <div>
          <Label className="text-xs">Chọn từ khách hàng CRM</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Chọn khách hàng hoặc nhập trực tiếp bên dưới" />
            </SelectTrigger>
            <SelectContent>
              <div className="p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Tìm khách hàng..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    className="pl-7 text-xs h-8"
                  />
                </div>
              </div>
              {filteredCustomers.slice(0, 20).map((c: any) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.name} {c.company ? `(${c.company})` : ""} {c.phone ? `- ${c.phone}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Tên công ty *</Label>
            <Input value={buyerInfo.company_name} onChange={e => setBuyerInfo(p => ({ ...p, company_name: e.target.value }))} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Người đại diện</Label>
            <Input value={buyerInfo.representative} onChange={e => setBuyerInfo(p => ({ ...p, representative: e.target.value }))} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Chức vụ</Label>
            <Input value={buyerInfo.position} onChange={e => setBuyerInfo(p => ({ ...p, position: e.target.value }))} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Địa chỉ</Label>
            <Input value={buyerInfo.address} onChange={e => setBuyerInfo(p => ({ ...p, address: e.target.value }))} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Điện thoại</Label>
            <Input value={buyerInfo.phone} onChange={e => setBuyerInfo(p => ({ ...p, phone: e.target.value }))} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Mã số thuế</Label>
            <div className="flex gap-1">
              <Input value={buyerInfo.tax_code} onChange={e => setBuyerInfo(p => ({ ...p, tax_code: e.target.value }))} className="text-xs" />
              <Button size="sm" variant="outline" onClick={handleTaxLookup} disabled={lookingUpTax} className="shrink-0">
                {lookingUpTax ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Articles */}
      <details>
        <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
          Chỉnh sửa nội dung các điều khoản ({articles.length} điều)
        </summary>
        <div className="mt-3 space-y-4 p-3 border rounded-lg bg-muted/20">
          {articles.map((article, idx) => (
            <div key={idx} className="space-y-1 p-2 border rounded bg-background">
              <div className="flex items-center gap-1">
                <Input
                  value={article.title}
                  onChange={e => handleArticleChange(idx, "title", e.target.value)}
                  className="text-xs font-semibold flex-1 h-8"
                />
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => moveArticle(idx, -1)} disabled={idx === 0}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => moveArticle(idx, 1)} disabled={idx === articles.length - 1}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => removeArticle(idx)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Textarea
                value={article.content}
                onChange={e => handleArticleChange(idx, "content", e.target.value)}
                rows={4}
                className="text-xs"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={addArticle}>
              <Plus className="h-3 w-3 mr-1" /> Thêm điều khoản
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={resetArticles}>
              <RotateCcw className="h-3 w-3 mr-1" /> Khôi phục mặc định
            </Button>
          </div>
        </div>
      </details>

      {/* Notes */}
      <div>
        <Label>Ghi chú</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Ghi chú thêm..." />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button onClick={handleSubmit} disabled={createContract.isPending}>
          {createContract.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Tạo HĐ Nguyên tắc
        </Button>
      </div>
    </div>
  );
};
