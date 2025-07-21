import React, { useState } from "react";
import { Plus, Search, Filter, Eye, Edit, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CreateQuoteForm } from "@/components/CreateQuoteForm";
import { useToast } from "@/hooks/use-toast";

// Mock data for quotes
const mockQuotes = [
  {
    id: "1",
    quoteNumber: "BG-20250721-001",
    customerName: "Công ty TNHH ABC",
    customerEmail: "contact@abc.com",
    totalAmount: 50000000,
    status: "draft",
    quoteDate: "21/07/2025",
    expiryDate: "20/08/2025",
    responsible: "Nguyễn Văn A",
  },
  {
    id: "2",
    quoteNumber: "BG-20250720-002",
    customerName: "Công ty Cổ phần XYZ",
    customerEmail: "sales@xyz.com",
    totalAmount: 75000000,
    status: "sent",
    quoteDate: "20/07/2025",
    expiryDate: "19/08/2025",
    responsible: "Trần Thị B",
  },
  {
    id: "3",
    quoteNumber: "BG-20250719-003",
    customerName: "Doanh nghiệp 123",
    customerEmail: "info@123.com",
    totalAmount: 30000000,
    status: "approved",
    quoteDate: "19/07/2025",
    expiryDate: "18/08/2025",
    responsible: "Lê Văn C",
  },
  {
    id: "4",
    quoteNumber: "BG-20250718-004",
    customerName: "Công ty DEF",
    customerEmail: "contact@def.com",
    totalAmount: 25000000,
    status: "expired",
    quoteDate: "18/07/2025",
    expiryDate: "17/07/2025",
    responsible: "Phạm Thị D",
  },
];

const statusLabels = {
  draft: { label: "Nháp", color: "bg-gray-100 text-gray-800" },
  sent: { label: "Đã gửi", color: "bg-blue-100 text-blue-800" },
  approved: { label: "Đã duyệt", color: "bg-green-100 text-green-800" },
  rejected: { label: "Từ chối", color: "bg-red-100 text-red-800" },
  expired: { label: "Hết hạn", color: "bg-orange-100 text-orange-800" },
};

export default function QuotesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [quotes, setQuotes] = useState(mockQuotes);
  const { toast } = useToast();

  const filteredQuotes = quotes.filter(
    (quote) =>
      quote.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.customerEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateQuote = (data: any) => {
    console.log("Creating quote:", data);
    
    // Add new quote to the list
    const newQuote = {
      id: (quotes.length + 1).toString(),
      quoteNumber: data.quoteNumber,
      customerName: data.customerName,
      customerEmail: data.email || "",
      totalAmount: 0,
      status: "draft" as const,
      quoteDate: data.quoteDate.toLocaleDateString("vi-VN"),
      expiryDate: data.expiryDate.toLocaleDateString("vi-VN"),
      responsible: data.responsible || "Chưa phân công",
    };

    setQuotes([newQuote, ...quotes]);
    setShowCreateForm(false);
    
    toast({
      title: "Thành công",
      description: "Báo giá đã được tạo thành công",
    });
  };

  const handleDeleteQuote = (quoteId: string) => {
    setQuotes(quotes.filter(q => q.id !== quoteId));
    toast({
      title: "Đã xóa",
      description: "Báo giá đã được xóa",
      variant: "destructive",
    });
  };

  const stats = [
    {
      title: "Tổng báo giá",
      value: quotes.length.toString(),
      icon: FileText,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Đã gửi",
      value: quotes.filter(q => q.status === "sent").length.toString(),
      icon: FileText,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Đã duyệt",
      value: quotes.filter(q => q.status === "approved").length.toString(),
      icon: FileText,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Tổng giá trị",
      value: (quotes.reduce((sum, q) => sum + q.totalAmount, 0) / 1000000).toFixed(0) + "M",
      icon: FileText,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý Báo giá</h1>
          <p className="text-muted-foreground">Tạo và quản lý báo giá cho khách hàng</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Tạo báo giá mới
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-lg font-bold text-foreground">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách Báo giá</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Tìm kiếm theo tên khách hàng, số báo giá..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
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
                  <TableHead>Số báo giá</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Giá trị</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead>Hết hạn</TableHead>
                  <TableHead>Phụ trách</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {searchTerm ? "Không tìm thấy báo giá nào" : "Chưa có báo giá nào"}
                        </p>
                        {!searchTerm && (
                          <Button onClick={() => setShowCreateForm(true)} variant="outline" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Tạo báo giá đầu tiên
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredQuotes.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell className="font-medium">{quote.quoteNumber}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{quote.customerName}</div>
                          <div className="text-sm text-muted-foreground">{quote.customerEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell>{quote.totalAmount.toLocaleString()} ₫</TableCell>
                      <TableCell>
                        <Badge className={statusLabels[quote.status].color}>
                          {statusLabels[quote.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell>{quote.quoteDate}</TableCell>
                      <TableCell>{quote.expiryDate}</TableCell>
                      <TableCell>{quote.responsible}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <FileText className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              Xem chi tiết
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => handleDeleteQuote(quote.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Quote Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto p-0">
          <CreateQuoteForm 
            onClose={() => setShowCreateForm(false)}
            onSubmit={handleCreateQuote}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}