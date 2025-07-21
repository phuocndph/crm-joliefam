import React, { useState, useEffect } from "react";
import { Search, Plus, Filter, Download, TrendingUp, TrendingDown, CreditCard, Receipt, DollarSign, AlertCircle, Eye, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface Transaction {
  id: string;
  amount: number;
  type: string;
  category: string | null;
  description: string | null;
  date: string;
  order_id: string | null;
  payment_type: string;
  installment_number: number;
  total_installments: number;
  remaining_amount: number;
  created_at: string;
  updated_at: string;
}

interface OrderPayment {
  id: string;
  order_id: string;
  payment_amount: number;
  payment_type: string;
  installment_number: number;
  payment_method: string;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

interface PaymentSummary {
  order_id: string;
  order_number: string;
  total_amount: number;
  payment_status: string;
  final_payment_date: string | null;
  customer_name: string;
  customer_code: string | null;
  total_paid: number;
  remaining_amount: number;
  payment_count: number;
  first_payment_date: string | null;
  last_payment_date: string | null;
}

const TransactionManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orderPayments, setOrderPayments] = useState<OrderPayment[]>([]);
  const [paymentSummaries, setPaymentSummaries] = useState<PaymentSummary[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PaymentSummary | null>(null);
  const [selectedOrderPayments, setSelectedOrderPayments] = useState<OrderPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load transactions
      const { data: transactionsData, error: transactionsError } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false });
      
      if (transactionsError) throw transactionsError;
      setTransactions(transactionsData || []);

      // Load order payments
      const { data: paymentsData, error: paymentsError } = await supabase
        .from("order_payments")
        .select("*")
        .order("payment_date", { ascending: false });
      
      if (paymentsError) throw paymentsError;
      setOrderPayments(paymentsData || []);

      // Load payment summaries
      const { data: summariesData, error: summariesError } = await supabase
        .from("payment_summary")
        .select("*")
        .order("last_payment_date", { ascending: false });
      
      if (summariesError) throw summariesError;
      setPaymentSummaries(summariesData || []);

    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải dữ liệu giao dịch",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadOrderPaymentDetails = async (orderId: string) => {
    try {
      const { data, error } = await supabase
        .from("order_payments")
        .select("*")
        .eq("order_id", orderId)
        .order("payment_date", { ascending: true });
      
      if (error) throw error;
      setSelectedOrderPayments(data || []);
    } catch (error) {
      console.error('Error loading order payments:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải chi tiết thanh toán",
        variant: "destructive",
      });
    }
  };

  // Calculate statistics
  const stats = {
    totalIncome: transactions
      .filter(t => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0),
    totalExpense: transactions
      .filter(t => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0),
    totalTransactions: transactions.length,
    totalOrderPayments: orderPayments.reduce((sum, p) => sum + Number(p.payment_amount), 0),
    pendingPayments: paymentSummaries.filter(p => p.payment_status === 'pending').length,
    partialPayments: paymentSummaries.filter(p => p.payment_status === 'partial').length,
    netFlow: 0
  };
  stats.netFlow = stats.totalIncome - stats.totalExpense;

  // Filter data based on active tab and search
  const getFilteredData = () => {
    switch (activeTab) {
      case "orders":
        return paymentSummaries.filter(summary => 
          summary.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          summary.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          summary.customer_code?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      case "payments":
        return orderPayments.filter(payment => 
          searchTerm === "" || payment.notes?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      default:
        return transactions.filter(transaction => {
          const matchesSearch = 
            transaction.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            transaction.category?.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesType = typeFilter === "all" || transaction.type === typeFilter;
          const matchesCategory = categoryFilter === "all" || transaction.category === categoryFilter;
          
          return matchesSearch && matchesType && matchesCategory;
        });
    }
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined || isNaN(Number(amount))) {
      return "0 VNĐ";
    }
    return Number(amount).toLocaleString("vi-VN") + " VNĐ";
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      case 'pending': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Đã thanh toán';
      case 'partial': return 'Thanh toán 1 phần';
      case 'pending': return 'Chưa thanh toán';
      default: return status;
    }
  };

  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case 'deposit': return 'Đặt cọc';
      case 'installment': return 'Trả góp';
      case 'final': return 'Thanh toán cuối';
      case 'full': return 'Thanh toán toàn bộ';
      default: return type;
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Tiền mặt';
      case 'bank_transfer': return 'Chuyển khoản';
      case 'card': return 'Thẻ';
      case 'other': return 'Khác';
      default: return method;
    }
  };

  const exportTransactions = () => {
    const csvContent = [
      ["Ngày", "Loại", "Danh mục", "Mô tả", "Số tiền"],
      ...transactions.map(t => [
        format(new Date(t.date), "dd/MM/yyyy"),
        t.type === "income" ? "Thu nhập" : "Chi phí",
        t.category || "",
        t.description || "",
        formatCurrency(t.amount)
      ])
    ]
      .map(row => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `giao-dich-${format(new Date(), "dd-MM-yyyy")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredData = getFilteredData();
  const categories = [...new Set(transactions.map(t => t.category).filter(Boolean))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý Giao dịch</h1>
          <p className="text-muted-foreground">
            Theo dõi tất cả giao dịch và thanh toán đơn hàng
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportTransactions} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tổng thu nhập</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalIncome)}</p>
              </div>
              <div className="p-3 rounded-full bg-green-100">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tổng chi phí</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.totalExpense)}</p>
              </div>
              <div className="p-3 rounded-full bg-red-100">
                <TrendingDown className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Thanh toán đơn hàng</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.totalOrderPayments)}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100">
                <CreditCard className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Dòng tiền ròng</p>
                <p className={`text-2xl font-bold ${stats.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(stats.netFlow)}
                </p>
              </div>
              <div className={`p-3 rounded-full ${stats.netFlow >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <DollarSign className={`h-6 w-6 ${stats.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Giao dịch và Thanh toán</CardTitle>
              <CardDescription>Quản lý tất cả giao dịch tài chính và thanh toán đơn hàng</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                {stats.pendingPayments} đơn chưa thanh toán
              </Badge>
              <Badge variant="outline" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                {stats.partialPayments} đơn thanh toán 1 phần
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">Tất cả giao dịch</TabsTrigger>
              <TabsTrigger value="orders">Thanh toán đơn hàng</TabsTrigger>
              <TabsTrigger value="payments">Chi tiết thanh toán</TabsTrigger>
            </TabsList>

            {/* Search and Filters */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder={
                    activeTab === "orders" ? "Tìm kiếm theo khách hàng, mã đơn..." :
                    activeTab === "payments" ? "Tìm kiếm trong ghi chú..." :
                    "Tìm kiếm theo mô tả, danh mục..."
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              {activeTab === "all" && (
                <div className="flex gap-2">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Loại giao dịch" />
                    </SelectTrigger>
                    <SelectContent className="bg-white z-50">
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="income">Thu nhập</SelectItem>
                      <SelectItem value="expense">Chi phí</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Danh mục" />
                    </SelectTrigger>
                    <SelectContent className="bg-white z-50">
                      <SelectItem value="all">Tất cả danh mục</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* All Transactions Tab */}
            <TabsContent value="all" className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead>Danh mục</TableHead>
                      <TableHead>Mô tả</TableHead>
                      <TableHead className="text-right">Số tiền</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">Đang tải...</TableCell>
                      </TableRow>
                    ) : filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <div className="flex flex-col items-center gap-2">
                            <Receipt className="h-8 w-8 text-muted-foreground" />
                            <p className="text-muted-foreground">Không có giao dịch nào</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      (filteredData as Transaction[]).map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell>
                            {format(new Date(transaction.date), "dd/MM/yyyy", { locale: vi })}
                          </TableCell>
                          <TableCell>
                            <Badge className={transaction.type === "income" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                              {transaction.type === "income" ? "Thu nhập" : "Chi phí"}
                            </Badge>
                          </TableCell>
                          <TableCell>{transaction.category || "-"}</TableCell>
                          <TableCell>{transaction.description || "-"}</TableCell>
                          <TableCell className={`text-right font-medium ${transaction.type === "income" ? "text-green-600" : "text-red-600"}`}>
                            {formatCurrency(transaction.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Order Payments Tab */}
            <TabsContent value="orders" className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã đơn hàng</TableHead>
                      <TableHead>Khách hàng</TableHead>
                      <TableHead>Tổng tiền</TableHead>
                      <TableHead>Đã thanh toán</TableHead>
                      <TableHead>Còn lại</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Lần thanh toán</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">Đang tải...</TableCell>
                      </TableRow>
                    ) : filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          <div className="flex flex-col items-center gap-2">
                            <CreditCard className="h-8 w-8 text-muted-foreground" />
                            <p className="text-muted-foreground">Không có đơn hàng nào</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      (filteredData as PaymentSummary[]).map((summary) => (
                        <TableRow key={summary.order_id}>
                          <TableCell className="font-medium">{summary.order_number}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{summary.customer_name}</div>
                              {summary.customer_code && (
                                <div className="text-sm text-muted-foreground">{summary.customer_code}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{formatCurrency(summary.total_amount)}</TableCell>
                          <TableCell className="text-green-600 font-medium">{formatCurrency(summary.total_paid)}</TableCell>
                          <TableCell className="text-red-600 font-medium">{formatCurrency(summary.remaining_amount)}</TableCell>
                          <TableCell>
                            <Badge className={getPaymentStatusColor(summary.payment_status)}>
                              {getPaymentStatusLabel(summary.payment_status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{summary.payment_count}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                setSelectedOrder(summary);
                                loadOrderPaymentDetails(summary.order_id);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Payment Details Tab */}
            <TabsContent value="payments" className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày thanh toán</TableHead>
                      <TableHead>Loại thanh toán</TableHead>
                      <TableHead>Số tiền</TableHead>
                      <TableHead>Phương thức</TableHead>
                      <TableHead>Đợt</TableHead>
                      <TableHead>Ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">Đang tải...</TableCell>
                      </TableRow>
                    ) : filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <div className="flex flex-col items-center gap-2">
                            <Receipt className="h-8 w-8 text-muted-foreground" />
                            <p className="text-muted-foreground">Không có thanh toán nào</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      (filteredData as OrderPayment[]).map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {format(new Date(payment.payment_date), "dd/MM/yyyy HH:mm", { locale: vi })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{getPaymentTypeLabel(payment.payment_type)}</Badge>
                          </TableCell>
                          <TableCell className="font-medium text-green-600">
                            {formatCurrency(payment.payment_amount)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{getPaymentMethodLabel(payment.payment_method)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">Đợt {payment.installment_number}</Badge>
                          </TableCell>
                          <TableCell>{payment.notes || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Order Payment Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết thanh toán đơn hàng</DialogTitle>
            <DialogDescription>
              Lịch sử thanh toán đơn hàng #{selectedOrder?.order_number}
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatCurrency(selectedOrder.total_amount)}
                    </div>
                    <div className="text-sm text-muted-foreground">Tổng tiền đơn hàng</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {formatCurrency(selectedOrder.total_paid)}
                    </div>
                    <div className="text-sm text-muted-foreground">Đã thanh toán</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {formatCurrency(selectedOrder.remaining_amount)}
                    </div>
                    <div className="text-sm text-muted-foreground">Còn lại</div>
                  </CardContent>
                </Card>
              </div>

              {/* Payment History */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Lịch sử thanh toán ({selectedOrder.payment_count} lần)</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedOrderPayments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Chưa có thanh toán nào
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedOrderPayments.map((payment, index) => (
                        <div key={payment.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">Đợt {payment.installment_number}</Badge>
                                <Badge variant="secondary">{getPaymentTypeLabel(payment.payment_type)}</Badge>
                                <Badge variant="outline">{getPaymentMethodLabel(payment.payment_method)}</Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {format(new Date(payment.payment_date), "dd/MM/yyyy HH:mm", { locale: vi })}
                              </div>
                              {payment.notes && (
                                <div className="text-sm text-muted-foreground">
                                  <strong>Ghi chú:</strong> {payment.notes}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-green-600">
                                {formatCurrency(payment.payment_amount)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TransactionManagement;