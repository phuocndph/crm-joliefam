import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEInvoiceActions } from "@/hooks/useEInvoices";
import { Download, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  einvoice: any | null;
}

export const DownloadMinuteDialog = ({ open, onOpenChange, einvoice }: Props) => {
  const [type, setType] = useState<"1" | "2" | "3">("1");
  const { downloadMinute } = useEInvoiceActions();

  const submit = async () => {
    if (!einvoice?.transaction_uuid) return;
    await downloadMinute.mutateAsync({
      transactionUuid: einvoice.transaction_uuid,
      minuteType: Number(type) as 1 | 2 | 3,
      einvoice_id: einvoice.id,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Tải biên bản</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            HĐ: <span className="font-medium text-foreground">{einvoice?.invoice_number || "—"}</span>
          </div>
          <div>
            <Label className="text-xs">Loại biên bản</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="1">Biên bản huỷ</SelectItem>
                <SelectItem value="2">Biên bản điều chỉnh</SelectItem>
                <SelectItem value="3">Biên bản thay thế</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
          <Button onClick={submit} disabled={downloadMinute.isPending}>
            {downloadMinute.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
            Tải PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};