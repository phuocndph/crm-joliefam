import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Filter, Download, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Transaction {
  id: string;
  amount: number;
  type: string;
  category: string | null;
  description: string | null;
  date: string;
  created_at: string;
  updated_at: string;
}

const TransactionManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch transactions
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false });
      
      if (error) throw error;
      return data as Transaction[];
    },
  });

  // Calculate statistics
  const stats = {
    totalIncome: transactions
      .filter(t => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0),
    totalExpense: transactions
      .filter(t => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0),
    totalTransactions: transactions.length,
    netFlow: 0
  };
  stats.netFlow = stats.totalIncome - stats.totalExpense;

  // Filter transactions
  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch = 
      transaction.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.category?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || transaction.type === typeFilter;
    const matchesCategory = categoryFilter === "all" || transaction.category === categoryFilter;
    
    return matchesSearch && matchesType && matchesCategory;
  });

  // Get unique categories
  const categories = [...new Set(transactions.map(t => t.category).filter(Boolean))];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
  };

  const getTypeColor = (type: string) => {
    return type === "income" ? "text-green-600" : "text-red-600";
  };

  const getTypeBadge = (type: string) => {
    return type === "income" ? (
      <Badge variant="secondary" className="bg-green-100 text-green-800">
        <TrendingUp className="w-3 h-3 mr-1" />
        Thu nhập
      </Badge>
    ) : (
      <Badge variant="secondary" className="bg-red-100 text-red-800">
        <TrendingDown className="w-3 h-3 mr-1" />
        Chi phí
      </Badge>
    );
  };

  const exportTransactions = () => {
    const csvContent = [
      ["Ngày", "Loại", "Danh mục", "Mô tả", "Số tiền"],
      ...filteredTransactions.map(t => [
        format(new Date(t.date), "dd/MM/yyyy"),
        t.type === "income" ? "Thu nhập" : "Chi phí",
        t.category || "",
        t.description || "",
        t.amount.toString()
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `giao-dich-${format(new Date(), "dd-MM-yyyy")}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Quản lý Giao dịch</h1>
          <p className="text-muted-foreground">Theo dõi và quản lý tất cả giao dịch thu chi</p>
        </div>
        <Button onClick={exportTransactions}>
          <Download className="w-4 h-4 mr-2" />
          Xuất Excel
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng Thu nhập</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.totalIncome)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng Chi phí</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.totalExpense)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dòng tiền ròng</CardTitle>
            <TrendingUp className={`h-4 w-4 ${stats.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(stats.netFlow)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tổng Giao dịch</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTransactions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Bộ lọc và Tìm kiếm</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm theo mô tả hoặc danh mục..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Loại giao dịch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả loại</SelectItem>
                <SelectItem value="income">Thu nhập</SelectItem>
                <SelectItem value="expense">Chi phí</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Danh mục" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả danh mục</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category!}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách Giao dịch</CardTitle>
          <CardDescription>
            Hiển thị {filteredTransactions.length} trong tổng số {transactions.length} giao dịch
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      Không có giao dịch nào được tìm thấy
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        {format(new Date(transaction.date), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        {getTypeBadge(transaction.type)}
                      </TableCell>
                      <TableCell>
                        {transaction.category && (
                          <Badge variant="outline">{transaction.category}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{transaction.description}</TableCell>
                      <TableCell className={`text-right font-medium ${getTypeColor(transaction.type)}`}>
                        {transaction.type === "expense" ? "-" : "+"}
                        {formatCurrency(Number(transaction.amount))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TransactionManagement;