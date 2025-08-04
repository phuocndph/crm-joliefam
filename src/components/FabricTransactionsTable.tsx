import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useFabricTransactions } from "@/hooks/useFabrics";
import { ArrowUp, ArrowDown, RefreshCw } from "lucide-react";

export const FabricTransactionsTable = () => {
  const { data: transactions = [] } = useFabricTransactions();

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
                <TableHead className="text-right">Số lượng (m)</TableHead>
                <TableHead>Nhà cung cấp/Ghi chú</TableHead>
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
                  <TableCell className={`text-right font-medium ${
                    transaction.quantity > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {transaction.quantity > 0 ? '+' : ''}{transaction.quantity.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {transaction.supplier_name || transaction.notes || '-'}
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Chưa có giao dịch nào
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};