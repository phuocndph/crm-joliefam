import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEInvoiceActions } from "@/hooks/useEInvoices";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  einvoice: any | null;
  mode: "replace" | "adjust";
}

export const ReplaceAdjustDialog = ({ open, onOpenChange, einvoice, mode }: Props) => {
  const [reason, setReason] = useState("");
  const [adjustKind, setAdjustKind] = useState<"increase" | "decrease" | "explanation">("increase");
  const { replaceInvoice, adjustInvoice } = useEInvoiceActions();
  const pending = replaceInvoice.isPending || adjustInvoice.isPending;

  const submit = async () => {
    if (!einvoice) return;
    if (!reason.trim()) { toast.error("Vui lòng nhập lý do"); return; }
    const contract = einvoice.request_data || einvoice.response_data?.contract;
    if (!contract) {
      toast.error("HĐ gốc không có dữ liệu chi tiết để dùng lại. Hãy tạo HĐ mới rồi liên kết thủ công.");
      return;
    }
    const options: any = {
      reason,
      templateCode: einvoice.template_code,
      invoiceSeries: einvoice.invoice_series,
      invoiceType: einvoice.invoice_type || "01GTKT",
    };
    if (mode === "adjust") {
      options.adjustmentType = adjustKind === "increase" ? "2" : adjustKind === "decrease" ? "3" : "4";
    }
    const mut = mode === "replace" ? replaceInvoice : adjustInvoice;
    await mut.mutateAsync({
      contract,
      options,
      original_einvoice_id: einvoice.id,
    });
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "replace" ? "Thay thế hoá đơn" : "Điều chỉnh hoá đơn"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            HĐ gốc: <span className="font-medium text-foreground">{einvoice?.invoice_number || "—"}</span>
          </div>
          {mode === "adjust" && (
            <div>
              <Label className="text-xs">Loại điều chỉnh</Label>
              <Select value={adjustKind} onValueChange={(v: any) => setAdjustKind(v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="increase">Điều chỉnh tăng</SelectItem>
                  <SelectItem value="decrease">Điều chỉnh giảm</SelectItem>
                  <SelectItem value="explanation">Điều chỉnh giải thích</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Lý do {mode === "replace" ? "thay thế" : "điều chỉnh"}</Label>
            <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Nhập lý do..." />
          </div>
          <p className="text-xs text-muted-foreground">
            HĐ mới sẽ được phát hành dựa trên dữ liệu HĐ gốc. Để chỉnh sửa chi tiết mặt hàng hoặc khách hàng, hãy tạo HĐ thường rồi liên kết thủ công.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {mode === "replace" ? "Phát hành HĐ thay thế" : "Phát hành HĐ điều chỉnh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
