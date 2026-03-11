import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomers } from "@/hooks/useCustomers";
import { useCreateContract, generateContractNumber } from "@/hooks/useContracts";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface CreateContractFormProps {
  onSuccess: () => void;
  prefillData?: {
    customer_id?: string;
    quote_id?: string;
    order_id?: string;
    items?: any[];
    total_amount?: number;
    title?: string;
  };
}

export const CreateContractForm = ({ onSuccess, prefillData }: CreateContractFormProps) => {
  const { data: customers } = useCustomers();
  const createContract = useCreateContract();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    contract_number: generateContractNumber(),
    customer_id: prefillData?.customer_id || "",
    quote_id: prefillData?.quote_id || "",
    order_id: prefillData?.order_id || "",
    title: prefillData?.title || "",
    total_amount: prefillData?.total_amount || 0,
    deposit_percentage: 70,
    deposit_amount: 0,
    contract_date: new Date().toISOString().slice(0, 10),
    start_date: "",
    end_date: "",
    notes: "",
    items: prefillData?.items || [],
    terms: [
      "Đặt cọc 70% giá trị hợp đồng khi ký.",
      "Thanh toán 30% còn lại khi hoàn thành lắp đặt.",
      "Bảo hành sản phẩm 24 tháng.",
      "Hợp đồng có hiệu lực kể từ ngày ký."
    ],
  });

  useEffect(() => {
    const deposit = (formData.total_amount * formData.deposit_percentage) / 100;
    setFormData(prev => ({ ...prev, deposit_amount: deposit }));
  }, [formData.total_amount, formData.deposit_percentage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_id) {
      toast({ title: "Vui lòng chọn khách hàng", variant: "destructive" });
      return;
    }

    try {
      await createContract.mutateAsync({
        contract_number: formData.contract_number,
        customer_id: formData.customer_id,
        quote_id: formData.quote_id || null,
        order_id: formData.order_id || null,
        title: formData.title,
        total_amount: formData.total_amount,
        deposit_amount: formData.deposit_amount,
        deposit_percentage: formData.deposit_percentage,
        contract_date: formData.contract_date,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        notes: formData.notes || null,
        items: formData.items,
        terms: formData.terms,
        status: "draft",
      });
      toast({ title: "Tạo hợp đồng thành công!" });
      onSuccess();
    } catch (error: any) {
      toast({ title: "Lỗi tạo hợp đồng", description: error.message, variant: "destructive" });
    }
  };

  const formatCurrency = (val: number) => val.toLocaleString("vi-VN") + " ₫";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Mã hợp đồng</Label>
          <Input value={formData.contract_number} onChange={e => setFormData(p => ({ ...p, contract_number: e.target.value }))} />
        </div>
        <div>
          <Label>Khách hàng *</Label>
          <Select value={formData.customer_id} onValueChange={v => setFormData(p => ({ ...p, customer_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Chọn khách hàng" /></SelectTrigger>
            <SelectContent>
              {customers?.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name} {c.company ? `- ${c.company}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Tiêu đề hợp đồng</Label>
        <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} placeholder="VD: Hợp đồng cung cấp rèm cửa" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Tổng giá trị</Label>
          <Input type="number" value={formData.total_amount} onChange={e => setFormData(p => ({ ...p, total_amount: Number(e.target.value) }))} />
          <p className="text-xs text-muted-foreground mt-1">{formatCurrency(formData.total_amount)}</p>
        </div>
        <div>
          <Label>% Đặt cọc</Label>
          <Input type="number" value={formData.deposit_percentage} onChange={e => setFormData(p => ({ ...p, deposit_percentage: Number(e.target.value) }))} />
        </div>
        <div>
          <Label>Tiền cọc</Label>
          <Input value={formatCurrency(formData.deposit_amount)} disabled className="bg-muted" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Ngày ký</Label>
          <Input type="date" value={formData.contract_date} onChange={e => setFormData(p => ({ ...p, contract_date: e.target.value }))} />
        </div>
        <div>
          <Label>Ngày bắt đầu</Label>
          <Input type="date" value={formData.start_date} onChange={e => setFormData(p => ({ ...p, start_date: e.target.value }))} />
        </div>
        <div>
          <Label>Ngày kết thúc</Label>
          <Input type="date" value={formData.end_date} onChange={e => setFormData(p => ({ ...p, end_date: e.target.value }))} />
        </div>
      </div>

      <div>
        <Label>Ghi chú</Label>
        <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Ghi chú thêm..." />
      </div>

      <Button type="submit" className="w-full" disabled={createContract.isPending}>
        {createContract.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Tạo hợp đồng
      </Button>
    </form>
  );
};
