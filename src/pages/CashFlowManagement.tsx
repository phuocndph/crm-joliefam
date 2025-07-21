import React, { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, Calendar, Plus, Filter, Search, Eye, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateFinanceRecordForm } from "@/components/CreateFinanceRecordForm";
import { EditFinanceRecordDialog } from "@/components/EditFinanceRecordDialog";
import { DeleteFinanceRecordDialog } from "@/components/DeleteFinanceRecordDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

interface FinanceRecord {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  date: string;
  created_at: string;
}

export default function CashFlowManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FinanceRecord | null>(null);
  const [recordToEdit, setRecordToEdit] = useState<FinanceRecord | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<FinanceRecord | null>(null);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const filteredRecords = financeRecords.filter(
    (record) =>
      record.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const loadFinanceRecords = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('finance_data')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setFinanceRecords(data || []);
    } catch (error) {
      console.error('Error loading finance records:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải dữ liệu dòng tiền",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinanceRecords();
  }, []);

  const handleCreateRecord = () => {
    loadFinanceRecords();
    setShowCreateForm(false);
    toast({
      title: "Thành công",
      description: "Bản ghi dòng tiền đã được tạo thành công",
    });
  };

  const handleEditRecord = () => {
    loadFinanceRecords();
    setRecordToEdit(null);
    toast({
      title: "Thành công",
      description: "Bản ghi đã được cập nhật",
    });
  };

  const handleDeleteRecord = async () => {
    if (!recordToDelete) return;
    
    try {
      const { error } = await supabase
        .from('finance_data')
        .delete()
        .eq('id', recordToDelete.id);

      if (error) throw error;

      loadFinanceRecords();
      setRecordToDelete(null);
      toast({
        title: "Thành công",
        description: "Bản ghi đã được xóa",
      });
    } catch (error) {
      console.error('Error deleting record:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa bản ghi",
        variant: "destructive",
      });
    }
  };

  // Calculate stats
  const currentMonth = new Date();
  const lastMonth = subMonths(currentMonth, 1);
  
  const currentMonthStart = startOfMonth(currentMonth);
  const currentMonthEnd = endOfMonth(currentMonth);
  const lastMonthStart = startOfMonth(lastMonth);
  const lastMonthEnd = endOfMonth(lastMonth);

  const currentMonthRecords = financeRecords.filter(record => {
    const recordDate = new Date(record.date);
    return recordDate >= currentMonthStart && recordDate <= currentMonthEnd;
  });

  const lastMonthRecords = financeRecords.filter(record => {
    const recordDate = new Date(record.date);
    return recordDate >= lastMonthStart && recordDate <= lastMonthEnd;
  });

  const totalIncome = financeRecords.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0);
  const totalExpense = financeRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + r.amount, 0);
  const netFlow = totalIncome - totalExpense;

  const currentMonthIncome = currentMonthRecords.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0);
  const currentMonthExpense = currentMonthRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + r.amount, 0);
  const currentMonthNet = currentMonthIncome - currentMonthExpense;

  const lastMonthIncome = lastMonthRecords.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0);
  const lastMonthExpense = lastMonthRecords.filter(r => r.type === 'expense').reduce((sum, r) => sum + r.amount, 0);
  const lastMonthNet = lastMonthIncome - lastMonthExpense;

  const stats = [
    {
      title: "Tổng thu nhập",
      value: `${totalIncome.toLocaleString()} ₫`,
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
      change: currentMonthIncome > lastMonthIncome ? "tăng" : "giảm",
      changePercent: lastMonthIncome > 0 ? Math.abs(((currentMonthIncome - lastMonthIncome) / lastMonthIncome) * 100).toFixed(1) : "0",
    },
    {
      title: "Tổng chi phí",
      value: `${totalExpense.toLocaleString()} ₫`,
      icon: TrendingDown,
      color: "text-red-600",
      bgColor: "bg-red-50",
      change: currentMonthExpense > lastMonthExpense ? "tăng" : "giảm",
      changePercent: lastMonthExpense > 0 ? Math.abs(((currentMonthExpense - lastMonthExpense) / lastMonthExpense) * 100).toFixed(1) : "0",
    },
    {
      title: "Dòng tiền ròng",
      value: `${netFlow.toLocaleString()} ₫`,
      icon: DollarSign,
      color: netFlow >= 0 ? "text-green-600" : "text-red-600",
      bgColor: netFlow >= 0 ? "bg-green-50" : "bg-red-50",
      change: currentMonthNet > lastMonthNet ? "tăng" : "giảm",
      changePercent: lastMonthNet !== 0 ? Math.abs(((currentMonthNet - lastMonthNet) / Math.abs(lastMonthNet)) * 100).toFixed(1) : "0",
    },
    {
      title: "Tháng này",
      value: `${currentMonthNet.toLocaleString()} ₫`,
      icon: Calendar,
      color: currentMonthNet >= 0 ? "text-green-600" : "text-red-600",
      bgColor: currentMonthNet >= 0 ? "bg-green-50" : "bg-red-50",
      change: currentMonthNet > lastMonthNet ? "tăng" : "giảm",
      changePercent: lastMonthNet !== 0 ? Math.abs(((currentMonthNet - lastMonthNet) / Math.abs(lastMonthNet)) * 100).toFixed(1) : "0",
    },
  ];

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'income':
        return { label: 'Thu nhập', color: 'bg-green-100 text-green-800' };
      case 'expense':
        return { label: 'Chi phí', color: 'bg-red-100 text-red-800' };
      default:
        return { label: type, color: 'bg-gray-100 text-gray-800' };
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Quản lý Dòng tiền</h2>
        <div className="flex items-center space-x-2">
          <Button onClick={() => setShowCreateForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Thêm giao dịch
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`h-8 w-8 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                <span className={stat.change === "tăng" ? "text-green-600" : "text-red-600"}>
                  {stat.change === "tăng" ? "↗" : "↘"} {stat.changePercent}%
                </span>
                <span className="ml-1">so với tháng trước</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Finance Records Table */}
      <Card className="animate-scale-in">
        <CardHeader>
          <CardTitle>Lịch sử Dòng tiền</CardTitle>
          <CardDescription>
            Quản lý thu chi và theo dõi dòng tiền doanh nghiệp
          </CardDescription>
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm giao dịch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Lọc
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Mô tả</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Số tiền</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <span className="ml-2">Đang tải...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <DollarSign className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {searchTerm ? "Không tìm thấy giao dịch nào" : "Chưa có giao dịch nào"}
                        </p>
                        {!searchTerm && (
                          <Button onClick={() => setShowCreateForm(true)} variant="outline" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Thêm giao dịch đầu tiên
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record) => {
                    const typeConfig = getTypeConfig(record.type);
                    return (
                      <TableRow key={record.id} className="hover-scale">
                        <TableCell>{format(new Date(record.date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>
                          <div className="font-medium">{record.description || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={typeConfig.color}>
                            {typeConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={record.type === 'income' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                            {record.type === 'income' ? '+' : '-'}{record.amount.toLocaleString()} ₫
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <DollarSign className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-white z-50">
                              <DropdownMenuItem onClick={() => setSelectedRecord(record)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Xem chi tiết
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setRecordToEdit(record)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Chỉnh sửa
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => setRecordToDelete(record)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Xóa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Thêm giao dịch mới</DialogTitle>
            <DialogDescription>
              Thêm bản ghi thu chi vào dòng tiền
            </DialogDescription>
          </DialogHeader>
          <CreateFinanceRecordForm 
            onClose={() => setShowCreateForm(false)}
            onSubmit={handleCreateRecord}
          />
        </DialogContent>
      </Dialog>

      {recordToEdit && (
        <EditFinanceRecordDialog 
          record={recordToEdit}
          open={!!recordToEdit}
          onOpenChange={(open) => !open && setRecordToEdit(null)}
          onSubmit={handleEditRecord}
        />
      )}

      {recordToDelete && (
        <DeleteFinanceRecordDialog
          record={recordToDelete}
          open={!!recordToDelete}
          onOpenChange={(open) => !open && setRecordToDelete(null)}
          onConfirm={handleDeleteRecord}
        />
      )}

      {/* Record Detail Dialog */}
      {selectedRecord && (
        <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Chi tiết giao dịch</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Ngày giao dịch</label>
                <p className="text-base">{format(new Date(selectedRecord.date), 'dd/MM/yyyy')}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Loại giao dịch</label>
                <div className="mt-1">
                  <Badge className={getTypeConfig(selectedRecord.type).color}>
                    {getTypeConfig(selectedRecord.type).label}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Số tiền</label>
                <p className={`text-lg font-semibold ${selectedRecord.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedRecord.type === 'income' ? '+' : '-'}{selectedRecord.amount.toLocaleString()} ₫
                </p>
              </div>
              {selectedRecord.description && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Mô tả</label>
                  <p className="text-base">{selectedRecord.description}</p>
                </div>
              )}
              <div className="pt-4 border-t">
                <div>
                  <label className="text-sm font-medium text-gray-500">Ngày tạo</label>
                  <p className="text-base">{format(new Date(selectedRecord.created_at), 'dd/MM/yyyy HH:mm')}</p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}