import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const statusOptions = [
  { value: "draft", label: "Nháp" },
  { value: "sent", label: "Đã gửi" },
  { value: "approved", label: "Đã duyệt" },
  { value: "rejected", label: "Từ chối" },
  { value: "expired", label: "Hết hạn" },
];

interface EditQuoteDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: any | null;
  onUpdate: () => void;
}

export function EditQuoteDetailsDialog({
  open,
  onOpenChange,
  quote,
  onUpdate,
}: EditQuoteDetailsDialogProps) {
  const [createdDate, setCreatedDate] = useState<Date | undefined>(undefined);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (quote) {
      setCreatedDate(new Date(quote.created_at));
      setStatus(quote.status);
    }
  }, [quote]);

  const handleSave = async () => {
    if (!quote || !createdDate) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('quotes')
        .update({
          created_at: createdDate.toISOString(),
          status: status,
        })
        .eq('id', quote.id);

      if (error) throw error;

      // Invalidate all related query caches to ensure data consistency
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quotes'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
        queryClient.invalidateQueries({ queryKey: ['customer-care'] }),
      ]);

      // Force a small delay to ensure database update is complete
      await new Promise(resolve => setTimeout(resolve, 100));

      toast({
        title: "Thành công",
        description: "Thông tin báo giá đã được cập nhật và đồng bộ hóa với tất cả dữ liệu liên quan",
      });
      
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating quote details:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật thông tin báo giá",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa thông tin báo giá</DialogTitle>
          <DialogDescription>
            Cập nhật ngày báo giá và trạng thái của báo giá {quote?.quote_number}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="created-date">Ngày báo giá</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !createdDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {createdDate ? format(createdDate, "PPP", { locale: vi }) : <span>Chọn ngày</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={createdDate}
                  onSelect={setCreatedDate}
                  initialFocus
                  locale={vi}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="status">Trạng thái</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn trạng thái" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={loading || !createdDate}>
            {loading ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}