import { InvoiceDraftDialog } from "@/components/einvoice/InvoiceDraftDialog";
import { isLocalBackend } from "@/lib/runtime-config";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export function CreateEInvoiceDialog({
  open,
  onOpenChange,
  contract,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: { id: string } | null;
}) {
  if (isLocalBackend())
    return (
      <InvoiceDraftDialog
        open={open}
        onOpenChange={onOpenChange}
        contractId={contract?.id}
      />
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nháp hóa đơn</DialogTitle>
        </DialogHeader>
        <p>
          Workspace cần backend local đã cập nhật. Không ký/phát hành trong giao
          diện này.
        </p>
      </DialogContent>
    </Dialog>
  );
}
