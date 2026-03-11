import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateContract } from "@/hooks/useContracts";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

export const EditContractDialog = ({ open, onOpenChange, contract }: Props) => {
  const updateContract = useUpdateContract();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    title: "",
    total_amount: 0,
    deposit_percentage: 70,
    deposit_amount: 0,
    status: "draft",
    contract_date: "",
    start_date: "",
    end_date: "",
    notes: "",
  });

  useEffect(() => {
    if (contract) {
      setFormData({
        title: contract.title || "",
        total_amount: contract.total_amount || 0,
        deposit_percentage: contract.deposit_percentage || 70,
        deposit_amount: contract.deposit_amount || 0,
        status: contract.status || "draft",
        contract_date: contract.contract_date?.slice(0, 10) || "",
        start_date: contract.start_date?.slice(0, 10) || "",
        end_date: contract.end_date?.slice(0, 10) || "",
        notes: contract.notes || "",
      });
    }
  }, [contract]);

  useEffect(() => {
    const deposit = (formData.total_amount * formData.deposit_percentage) / 100;
    setFormData(prev => ({ ...prev, deposit_amount: deposit }));
  }, [formData.total_amount, formData.deposit_percentage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateContract.mutateAsync({
        id: contract.id,
        title: formData.title,
        total_amount: formData.total_amount,
        deposit_percentage: formData.deposit_percentage,
        deposit_amount: formData.deposit_amount,
        status: formData.status,
        contract_date: formData.contract_date,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        notes: formData.notes || null,
      });
      toast({ title: "Cập nhật hợp đồng thành công!" });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Lỗi cập nhật", description: error.message, variant: "destructive" });
    }
  };

  const formatCurrency = (val: number) => val.toLocaleString("vi-VN") + " ₫";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa hợp đồng {contract?.contract_number}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div>
            <Label>Tiêu đề</Label>
            <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} />
          </div>

          <div>
            <Label>Trạng thái</Label>
            <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Nháp</SelectItem>
                <SelectItem value="active">Đang hiệu lực</SelectItem>
                <SelectItem value="completed">Hoàn thành</SelectItem>
                <SelectItem value="cancelled">Đã hủy</SelectItem>
              </SelectContent>
            </Select>
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
            <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={3} />
          </div>

          <Button type="submit" className="w-full" disabled={updateContract.isPending}>
            {updateContract.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Lưu thay đổi
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
