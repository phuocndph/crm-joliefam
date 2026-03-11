import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeleteContract } from "@/hooks/useContracts";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

export const DeleteContractDialog = ({ open, onOpenChange, contract }: Props) => {
  const deleteContract = useDeleteContract();
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      await deleteContract.mutateAsync(contract.id);
      toast({ title: "Đã xóa hợp đồng" });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Lỗi xóa hợp đồng", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xóa hợp đồng</DialogTitle>
          <DialogDescription>
            Bạn có chắc muốn xóa hợp đồng <strong>{contract?.contract_number}</strong>? Hành động này không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteContract.isPending}>
            {deleteContract.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Xóa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
