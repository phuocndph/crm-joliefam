import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  base64: string | null;
  title?: string;
  loading?: boolean;
}

export const PreviewPdfDialog = ({ open, onOpenChange, base64, title, loading }: Props) => {
  const src = base64 ? `data:application/pdf;base64,${base64}` : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle>{title || "Xem trước hoá đơn"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden bg-muted">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tải PDF...
            </div>
          ) : src ? (
            <iframe src={src} className="w-full h-full border-0" title="invoice-preview" />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Không có dữ liệu PDF để hiển thị
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};