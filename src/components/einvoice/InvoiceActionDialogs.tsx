import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useEInvoiceActions } from "@/hooks/useEInvoices";
import { Loader2 } from "lucide-react";

export const CancelInvoiceDialog = ({ open, onOpenChange, invoice }: { open: boolean; onOpenChange: (v: boolean) => void; invoice: any }) => {
  const [reason, setReason] = useState("");
  const { cancelInvoice } = useEInvoiceActions();
  const handle = async () => {
    if (!reason.trim()) return;
    await cancelInvoice.mutateAsync({ transactionUuid: invoice.transaction_uuid, reason, einvoice_id: invoice.id });
    onOpenChange(false); setReason("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Huỷ hoá đơn {invoice?.invoice_number}</DialogTitle>
          <DialogDescription>Nhập lý do huỷ. Thao tác này sẽ huỷ HĐ trên Viettel S-Invoice.</DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Lý do huỷ..." rows={4} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
          <Button variant="destructive" onClick={handle} disabled={!reason.trim() || cancelInvoice.isPending}>
            {cancelInvoice.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Xác nhận huỷ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const SendEmailDialog = ({ open, onOpenChange, invoice }: { open: boolean; onOpenChange: (v: boolean) => void; invoice: any }) => {
  const [email, setEmail] = useState(invoice?.email_sent_to || invoice?.response_data?.buyerEmail || "");
  const { sendEmail } = useEInvoiceActions();
  const handle = async () => {
    if (!email.trim()) return;
    await sendEmail.mutateAsync({ transactionUuid: invoice.transaction_uuid, email, einvoice_id: invoice.id });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gửi email HĐ {invoice?.invoice_number}</DialogTitle>
          <DialogDescription>Viettel sẽ gửi link HĐ điện tử cho khách qua email.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Email người nhận</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="khachhang@email.com" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
          <Button onClick={handle} disabled={!email.trim() || sendEmail.isPending}>
            {sendEmail.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Gửi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const SyncInvoicesDialog = ({ open, onOpenChange, mode = "issued" }: { open: boolean; onOpenChange: (v: boolean) => void; mode?: "issued" | "drafts" }) => {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const [from, setFrom] = useState(fmt(monthAgo));
  const [to, setTo] = useState(fmt(today));
  const [invoiceType, setInvoiceType] = useState("01GTKT");
  const { syncInvoices, syncDrafts } = useEInvoiceActions();
  const mut = mode === "drafts" ? syncDrafts : syncInvoices;

  const handle = async () => {
    if (!from || !to) {
      const { toast } = await import("sonner");
      toast.error("Vui lòng chọn ngày bắt đầu và ngày kết thúc");
      return;
    }
    const fromMs = new Date(from + "T00:00:00").getTime();
    const toMs = new Date(to + "T23:59:59").getTime();
    await mut.mutateAsync({ fromDate: fromMs, toDate: toMs, invoiceType });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "drafts" ? "Đồng bộ HĐ nháp từ Viettel" : "Đồng bộ HĐ từ Viettel"}</DialogTitle>
          <DialogDescription>
            {mode === "drafts"
              ? "Kéo danh sách HĐ nháp (chưa phát hành) trên S-Invoice về app."
              : "Kéo danh sách hoá đơn đã phát hành trên S-Invoice về app."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Từ ngày</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label>Đến ngày</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="space-y-1 col-span-2">
            <Label>Loại HĐ</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3" value={invoiceType} onChange={e => setInvoiceType(e.target.value)}>
              <option value="01GTKT">01GTKT - HĐ GTGT</option>
              <option value="02GTTT">02GTTT - HĐ bán hàng</option>
              <option value="07KPTQ">07KPTQ - HĐ khác</option>
              <option value="03XKNB">03XKNB - Phiếu xuất kho</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
          <Button onClick={handle} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Đồng bộ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};