import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { QuotePreviewDialog } from "@/components/QuotePreviewDialog";
import { QuoteSupplementDialog } from "@/components/QuoteSupplementDialog";
import { QuoteTemplateSettings } from "@/components/QuoteTemplateSettings";
import CreateAssigneeForm from "@/components/CreateAssigneeForm";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  Plus,
  FileText,
  Eye,
  Edit,
  Trash2,
  Filter,
  MoreHorizontal,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Settings,
  Calculator,
} from "lucide-react";

const statusLabels = {
  draft: { label: "Nháp", color: "bg-gray-100 text-gray-800" },
  sent: { label: "Đã gửi", color: "bg-blue-100 text-blue-800" },
  approved: { label: "Đã duyệt", color: "bg-green-100 text-green-800" },
  rejected: { label: "Từ chối", color: "bg-red-100 text-red-800" },
  expired: { label: "Hết hạn", color: "bg-orange-100 text-orange-800" },
};

export default function QuotesPage() {
  const [user, setUser] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [supplementQuote, setSupplementQuote] = useState<any>(null);
  const [editingQuote, setEditingQuote] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { role: userRole } = useUserRole(user);
  const { hasPermission } = useEmployeePermissions(user, userRole);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  useEffect(() => {
    // Chỉ tải khi đã xác định được vai trò và người dùng
    if (!userRole) return;
    loadQuotes();
  }, [userRole, user]);

  const loadQuotes = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('quotes')
        .select(`
          *,
          customers (
            name,
            email,
            phone,
            address,
            company
          ),
          assignees (
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (userRole === 'manager' && user?.id) {
        query = query.eq('manager_id', user.id.toString());
      }

      const { data, error } = await query;

      if (error) throw error;
      
      const formattedQuotes = data?.map(quote => {
        // Extract customer name from notes if no customer_id
        let customerName = 'Không có tên';
        if (quote.customers?.name) {
          customerName = quote.customers.name;
        } else if (quote.notes) {
          const customerMatch = quote.notes.match(/Khách hàng:\s*(.+)/);
          if (customerMatch && customerMatch[1].trim()) {
            customerName = customerMatch[1].trim();
          }
        }

        // Extract other info from notes
        const extractFromNotes = (pattern: RegExp) => {
          if (!quote.notes) return '';
          const match = quote.notes.match(pattern);
          return match && match[1] ? match[1].trim() : '';
        };

        return {
          ...quote,
          customerName,
          customerEmail: quote.customers?.email || extractFromNotes(/Email:\s*([^\n\r]+)/),
          customerPhone: quote.customers?.phone || extractFromNotes(/Điện thoại:\s*([^\n\r]+)/),
          customerAddress: quote.customers?.address || extractFromNotes(/Địa chỉ:\s*([^\n\r]+)/),
          customerCompany: quote.customers?.company || '',
          quoteDate: quote.created_at,
          expiryDate: extractFromNotes(/Ngày hết hạn:\s*(.+)/) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          responsible: quote.assignees?.name || 'Chưa phân công',
          totalAmount: quote.total_amount || 0
        };
      }) || [];
      
      setQuotes(formattedQuotes);
    } catch (error) {
      console.error('Error loading quotes:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách báo giá",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredQuotes = quotes.filter(
    (quote) =>
      quote.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quote_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateQuote = async () => {
    setShowCreateForm(false);
    await loadQuotes();
    toast({
      title: "Thành công",
      description: "Báo giá đã được tạo thành công",
    });
  };

  const handleEditQuote = async () => {
    setEditingQuote(null);
    await loadQuotes();
    toast({
      title: "Thành công",
      description: "Báo giá đã được cập nhật thành công",
    });
  };

  const handleDeleteQuote = async (quoteId: string) => {
    try {
      const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId);

      if (error) throw error;

      setQuotes(quotes.filter((quote) => quote.id !== quoteId));
      toast({
        title: "Thành công",
        description: "Báo giá đã được xóa thành công",
      });
    } catch (error) {
      console.error('Error deleting quote:', error);
      toast({
        title: "Lỗi",
        description: "Không thể xóa báo giá",
        variant: "destructive",
      });
    }
  };

  const handleApproveQuote = async (quote: any) => {
    try {
      // Determine responsible manager for this quote/order
      let managerIdToUse: string | null = quote.manager_id || null;
      // If quote has an existing customer, prefer that customer's manager
      if (!managerIdToUse && quote.customer_id) {
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('manager_id')
          .eq('id', quote.customer_id)
          .maybeSingle();
        managerIdToUse = (existingCustomer as any)?.manager_id || null;
      }
      // Fallback: if current user is a manager, use their id
      if (!managerIdToUse && userRole === 'manager' && user?.id) {
        managerIdToUse = user.id.toString();
      }

      // Update quote status to approved
      const { error: quoteError } = await supabase
        .from('quotes')
        .update({ status: 'approved' })
        .eq('id', quote.id);

      if (quoteError) throw quoteError;

      // Create or update customer
      let customerId = quote.customer_id;
      if (!customerId) {
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .insert({
            name: quote.customerName,
            email: quote.customerEmail || null,
            phone: quote.customerPhone || null,
            address: quote.customerAddress || null,
            company: quote.customerCompany || null,
            tenant_id: 'default',
            manager_id: managerIdToUse,
          })
          .select('id')
          .single();

        if (customerError) throw customerError;
        customerId = customerData.id;
      }

      // Create order from approved quote
      const orderNumber = `ORD-${Date.now()}`;
      const { error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          customer_id: customerId,
          manager_id: managerIdToUse,
          assignee_id: quote.assignee_id, // Copy assignee from quote
          total_amount: quote.total_amount,
          status: 'pending',
          items: typeof quote.items === 'string' ? JSON.parse(quote.items) : quote.items,
          notes: `Được tạo từ báo giá ${quote.quote_number}`,
          tenant_id: 'default',
        });

      if (orderError) throw orderError;

      await loadQuotes();
      
      // Also invalidate orders cache since we created a new order
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      
      toast({
        title: "Thành công",
        description: `Báo giá đã được duyệt và đơn hàng ${orderNumber} đã được tạo`,
      });
    } catch (error) {
      console.error('Error approving quote:', error);
      toast({
        title: "Lỗi",
        description: "Không thể duyệt báo giá",
        variant: "destructive",
      });
    }
  };

  const handleRejectQuote = async (quoteId: string) => {
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ status: 'rejected' })
        .eq('id', quoteId);

      if (error) throw error;

      await loadQuotes();
      toast({
        title: "Thành công",
        description: "Báo giá đã được từ chối",
      });
    } catch (error) {
      console.error('Error rejecting quote:', error);
      toast({
        title: "Lỗi",
        description: "Không thể từ chối báo giá",
        variant: "destructive",
      });
    }
  };

  // Calculate stats
  const stats = [
    {
      title: "Tổng báo giá",
      value: quotes.length,
      icon: FileText,
      color: "text-blue-600",
    },
    {
      title: "Đã gửi",
      value: quotes.filter((q) => q.status === "sent").length,
      icon: Clock,
      color: "text-yellow-600",
    },
    {
      title: "Được duyệt",
      value: quotes.filter((q) => q.status === "approved").length,
      icon: CheckCircle,
      color: "text-green-600",
    },
    {
      title: "Tổng giá trị",
      value: `${quotes
        .reduce((sum, quote) => sum + (quote.total_amount || 0), 0)
        .toLocaleString("vi-VN")} VNĐ`,
      icon: AlertCircle,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-subtle rounded-lg border p-6 shadow-soft">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">Quản lý Báo giá</h1>
            <p className="text-muted-foreground">
              Tạo và quản lý báo giá cho khách hàng
            </p>
          </div>
          <div className="flex gap-2">
            <CreateAssigneeForm onSuccess={loadQuotes} />
            <Button 
              variant="outline" 
              onClick={() => setShowTemplateSettings(true)} 
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Cài đặt Template
            </Button>
            <Button onClick={() => setShowCreateForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Tạo báo giá mới
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color}`} />
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
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : filteredQuotes.length === 0 ? (
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
                    <TableRow key={quote.id} className="hover:bg-muted/60 transition-colors">
                      <TableCell className="font-medium">
                        {quote.quote_number || `QUOTE-${quote.id.slice(0, 8)}`}
                      </TableCell>
                      <TableCell>{quote.customerName}</TableCell>
                      <TableCell>
                        {(quote.total_amount || 0).toLocaleString("vi-VN")} VNĐ
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={statusLabels[quote.status]?.color || "bg-gray-100 text-gray-800"}
                        >
                          {statusLabels[quote.status]?.label || quote.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(quote.created_at).toLocaleDateString("vi-VN")}
                      </TableCell>
                      <TableCell>
                        {new Date(quote.expiryDate).toLocaleDateString("vi-VN")}
                      </TableCell>
                      <TableCell>{quote.responsible}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Mở menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setSelectedQuote(quote)}
                              className="hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Xem
                            </DropdownMenuItem>
                            {hasPermission('quote_supplement') && (
                              <DropdownMenuItem
                                onClick={() => setSupplementQuote(quote)}
                                className="hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                <Calculator className="mr-2 h-4 w-4" />
                                Báo giá phụ
                              </DropdownMenuItem>
                            )}
                            {quote.status === 'draft' && (
                              <DropdownMenuItem
                                onClick={() => handleApproveQuote(quote)}
                                className="text-green-600 hover:bg-green-600 hover:text-white transition-colors"
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Duyệt báo giá
                              </DropdownMenuItem>
                            )}
                            {quote.status === 'draft' && (
                              <DropdownMenuItem
                                onClick={() => handleRejectQuote(quote.id)}
                                className="text-orange-600 hover:bg-orange-600 hover:text-white transition-colors"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Từ chối
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => setEditingQuote(quote)}
                              className="hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteQuote(quote.id)}
                              className="text-red-600 hover:bg-red-600 hover:text-white transition-colors"
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

      {/* Edit Quote Dialog */}
      <Dialog open={!!editingQuote} onOpenChange={(open) => !open && setEditingQuote(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto p-0">
          <CreateQuoteForm 
            onClose={() => setEditingQuote(null)}
            onSubmit={handleEditQuote}
            initialData={editingQuote}
          />
        </DialogContent>
      </Dialog>

      {/* Quote Preview Dialog */}
      <QuotePreviewDialog 
        open={!!selectedQuote}
        onOpenChange={(open) => !open && setSelectedQuote(null)}
        quote={selectedQuote}
      />

      {/* Quote Supplement Dialog */}
        <QuoteSupplementDialog
          open={!!supplementQuote}
          onOpenChange={(open) => !open && setSupplementQuote(null)}
          quote={supplementQuote}
          onUpdate={loadQuotes}
        />

      {/* Template Settings Dialog */}
      <QuoteTemplateSettings
        open={showTemplateSettings}
        onOpenChange={setShowTemplateSettings}
      />
    </div>
  );
}