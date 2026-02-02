import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFabricTransactions, useUpdateTransaction, useFabricInventory, useUpdateInventory } from "@/hooks/useFabrics";
import { ArrowUp, ArrowDown, RefreshCw, Edit } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FabricTransactionsTableProps {
  warehouseFilter?: string;
}

export const FabricTransactionsTable = ({ warehouseFilter }: FabricTransactionsTableProps) => {
  const { data: allTransactions = [] } = useFabricTransactions();
  const { data: inventory = [] } = useFabricInventory();
  
  // Filter transactions by warehouse if filter is provided
  const transactions = warehouseFilter 
    ? allTransactions.filter(transaction => {
        const warehouseName = transaction.warehouses?.name?.toLowerCase() || '';
        if (warehouseFilter === 'hanoi') {
          return warehouseName.includes('hà nội') || warehouseName.includes('hanoi');
        } else if (warehouseFilter === 'bacninh') {
          return warehouseName.includes('bắc ninh') || warehouseName.includes('bac ninh');
        }
        return warehouseName.includes(warehouseFilter.toLowerCase());
      })
    : allTransactions;
  const updateTransaction = useUpdateTransaction();
  const updateInventory = useUpdateInventory();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    quantity: 0,
    packages_count: 0,
    supplier_name: '',
    notes: ''
  });

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'inbound':
        return <ArrowUp className="h-4 w-4 text-green-600" />;
      case 'outbound':
        return <ArrowDown className="h-4 w-4 text-red-600" />;
      case 'transfer_in':
        return <ArrowUp className="h-4 w-4 text-blue-600" />;
      case 'transfer_out':
        return <ArrowDown className="h-4 w-4 text-orange-600" />;
      default:
        return <RefreshCw className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTransactionTypeText = (type: string) => {
    switch (type) {
      case 'inbound':
        return 'Nhập kho';
      case 'outbound':
        return 'Xuất kho';
      case 'transfer_in':
        return 'Chuyển vào';
      case 'transfer_out':
        return 'Chuyển ra';
      default:
        return 'Điều chỉnh';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'inbound':
        return 'bg-green-100 text-green-800';
      case 'outbound':
        return 'bg-red-100 text-red-800';
      case 'transfer_in':
        return 'bg-blue-100 text-blue-800';
      case 'transfer_out':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Format number function
  const formatNumber = (num: number) => {
    if (num % 1 === 0) {
      return num.toLocaleString('vi-VN');
    }
    return num.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  };

  // Format quantity with sign based on transaction type
  const formatQuantityWithSign = (quantity: number, type: string) => {
    const absQuantity = Math.abs(quantity);
    const formattedNum = formatNumber(absQuantity);
    
    if (type === 'transfer_in' || type === 'inbound') {
      return `+${formattedNum}m`;
    } else if (type === 'transfer_out' || type === 'outbound') {
      return `-${formattedNum}m`;
    }
    return `${formattedNum}m`;
  };

  const handleEditClick = (transaction: any) => {
    setSelectedTransaction(transaction);
    setEditForm({
      quantity: Math.abs(transaction.quantity), // Take absolute value for editing
      packages_count: transaction.packages_count || 0,
      supplier_name: transaction.supplier_name || '',
      notes: transaction.notes || ''
    });
    setShowEditDialog(true);
  };

  const handleEditSubmit = async () => {
    if (!selectedTransaction || editForm.quantity <= 0) {
      toast({ title: "Lỗi", description: "Vui lòng nhập số lượng hợp lệ", variant: "destructive" });
      return;
    }

    try {
      const oldQuantity = selectedTransaction.quantity;
      const newQuantity = selectedTransaction.transaction_type === 'transfer_out' ? -editForm.quantity : editForm.quantity;
      const quantityDifference = newQuantity - oldQuantity;

      // Update transaction
      await updateTransaction.mutateAsync({
        id: selectedTransaction.id,
        fabric_variant_id: selectedTransaction.fabric_variant_id,
        warehouse_id: selectedTransaction.warehouse_id,
        transaction_type: selectedTransaction.transaction_type,
        quantity: newQuantity,
        packages_count: editForm.packages_count,
        supplier_name: editForm.supplier_name,
        notes: editForm.notes,
        unit_price: selectedTransaction.unit_price,
        total_amount: selectedTransaction.total_amount,
        reference_number: selectedTransaction.reference_number,
        recipient_name: selectedTransaction.recipient_name,
        transaction_date: selectedTransaction.transaction_date
      });

      // Update inventory based on quantity difference
      const existingInventory = inventory.find(item => 
        item.fabric_variant_id === selectedTransaction.fabric_variant_id && 
        item.warehouse_id === selectedTransaction.warehouse_id
      );

      if (existingInventory) {
        const newStock = existingInventory.current_stock + quantityDifference;
        
        // For inbound transactions, set packages_count directly from the edit form
        // For other transaction types, calculate the difference
        let newPackagesCount;
        if (selectedTransaction.transaction_type === 'inbound') {
          newPackagesCount = editForm.packages_count;
        } else {
          newPackagesCount = existingInventory.packages_count + (editForm.packages_count - (selectedTransaction.packages_count || 0));
        }
        
        await updateInventory.mutateAsync({
          fabric_variant_id: selectedTransaction.fabric_variant_id,
          warehouse_id: selectedTransaction.warehouse_id,
          current_stock: newStock,
          packages_count: Math.max(0, newPackagesCount),
          reserved_stock: existingInventory.reserved_stock,
          minimum_stock: existingInventory.minimum_stock,
          maximum_stock: existingInventory.maximum_stock
        });
      }

      setShowEditDialog(false);
      setSelectedTransaction(null);
      setEditForm({ quantity: 0, packages_count: 0, supplier_name: '', notes: '' });
    } catch (error) {
      console.error('Error updating transaction:', error);
      toast({ title: "Lỗi", description: "Có lỗi xảy ra khi cập nhật giao dịch", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lịch sử giao dịch vải</CardTitle>
        <p className="text-sm text-muted-foreground">
          Theo dõi chi tiết các giao dịch nhập/xuất kho và chuyển kho
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày giao dịch</TableHead>
                <TableHead>Loại giao dịch</TableHead>
                <TableHead>Mã vải</TableHead>
                <TableHead>Kho</TableHead>
                <TableHead>Số kiện</TableHead>
                <TableHead className="text-right">Số lượng (m)</TableHead>
                <TableHead>Nhà cung cấp/Ghi chú</TableHead>
                <TableHead className="text-center">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="text-sm">
                    {new Date(transaction.transaction_date).toLocaleString('vi-VN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {getTransactionIcon(transaction.transaction_type)}
                      <Badge className={getTransactionColor(transaction.transaction_type)}>
                        {getTransactionTypeText(transaction.transaction_type)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {transaction.fabric_variants?.variant_name || 'N/A'}
                  </TableCell>
                  <TableCell>
                    {transaction.warehouses?.name || 'N/A'}
                  </TableCell>
                  <TableCell>
                    {formatNumber(transaction.packages_count || 0)}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${
                    transaction.quantity > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatQuantityWithSign(transaction.quantity, transaction.transaction_type)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {transaction.supplier_name || transaction.notes || '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditClick(transaction)}
                      className="h-8 w-8 p-0"
                      title="Sửa giao dịch"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Chưa có giao dịch nào
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Edit Transaction Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Sửa giao dịch</DialogTitle>
              <DialogDescription>
                Cập nhật thông tin giao dịch. Tồn kho sẽ được điều chỉnh theo số lượng mới.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                <div className="font-medium">Thông tin giao dịch:</div>
                <div>Loại: {selectedTransaction && getTransactionTypeText(selectedTransaction.transaction_type)}</div>
                <div>Mã vải: {selectedTransaction?.fabric_variants?.variant_name}</div>
                <div>Kho: {selectedTransaction?.warehouses?.name}</div>
                <div>Ngày: {selectedTransaction && new Date(selectedTransaction.transaction_date).toLocaleString('vi-VN')}</div>
              </div>
              
              <div className="space-y-2">
                <Label>Số lượng (mét)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                  placeholder="Nhập số lượng"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Số kiện</Label>
                <Input
                  type="number"
                  value={editForm.packages_count || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, packages_count: parseInt(e.target.value) || 0 }))}
                  placeholder="Nhập số kiện"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Nhà cung cấp</Label>
                <Input
                  value={editForm.supplier_name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, supplier_name: e.target.value }))}
                  placeholder="Tên nhà cung cấp"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Input
                  value={editForm.notes}
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Ghi chú"
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                  Hủy
                </Button>
                <Button onClick={handleEditSubmit} disabled={updateTransaction.isPending}>
                  {updateTransaction.isPending ? "Đang cập nhật..." : "Cập nhật"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};