import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useQuotes, useDeleteQuote } from "@/hooks/useQuotes";
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
import { EditQuoteDetailsDialog } from "@/components/EditQuoteDetailsDialog";
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
  Calendar,
  Copy,
} from "lucide-react";

const statusLabels = {
  draft: { label: "Nháp", color: "bg-gray-100 text-gray-800" },
  sent: { label: "Đã gửi", color: "bg-blue-100 text-blue-800" },
  approved: { label: "Đã duyệt", color: "bg-green-100 text-green-800" },
  rejected: { label: "Từ chối", color: "bg-red-100 text-red-800" },
  expired: { label: "Hết hạn", color: "bg-orange-100 text-orange-800" },
};

export default function QuotesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [supplementQuote, setSupplementQuote] = useState<any>(null);
  const [editingQuote, setEditingQuote] = useState<any>(null);
  const [editingQuoteDetails, setEditingQuoteDetails] = useState<any>(null);
  const { toast } = useToast();
  const { role: userRole } = useUserRole(user);
  const { hasPermission } = useEmployeePermissions(user, userRole);
  const queryClient = useQueryClient();
  
  // Use React Query for quotes with real-time updates
  const { data: quotes = [], isLoading: loading, refetch: refetchQuotes } = useQuotes({ 
    managerId: userRole === 'manager' ? user?.id : 'all' 
  });
  const deleteQuoteMutation = useDeleteQuote();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  useEffect(() => {
    // Check for create parameter and auto-open form
    if (searchParams.get('create') === 'true') {
      setShowCreateForm(true);
      // Remove the parameter from URL
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Real-time subscription is now handled in useQuotes hook

  const filteredQuotes = quotes
    .filter(
      (quote) =>
        quote.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.quote_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.status.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      // Draft quotes first
      if (a.status === 'draft' && b.status !== 'draft') return -1;
      if (b.status === 'draft' && a.status !== 'draft') return 1;
      // Then sort by creation date (newest first)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const handleCreateQuote = async () => {
    setShowCreateForm(false);
    await refetchQuotes();
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    toast({
      title: "Thành công",
      description: "Báo giá đã được tạo thành công",
    });
  };

  const handleEditQuote = async () => {
    setEditingQuote(null);
    await refetchQuotes();
    
    // Invalidate orders cache to refresh orders page if needed
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    
    toast({
      title: "Thành công", 
      description: "Báo giá đã được cập nhật và tự động đẩy sang đơn hàng",
    });
  };

  const handleDeleteQuote = async (quoteId: string) => {
    try {
      await deleteQuoteMutation.mutateAsync(quoteId);
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
      const { data: orderData, error: orderError } = await supabase
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
          quote_id: quote.id, // Link directly to quote
          created_at: quote.quoteDate || quote.created_at, // Use quote date as order creation date
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      // Transfer payment information from quote to order if exists
      const quoteData = quote.quote_data ? JSON.parse(quote.quote_data) : {};
      const payment1 = quoteData.payment1 || 0;
      
      if (payment1 > 0) {
        // Create payment record
        const { error: paymentError } = await supabase
          .from('order_payments')
          .insert({
            order_id: orderData.id,
            payment_amount: payment1,
            payment_date: new Date().toISOString().split('T')[0],
            payment_type: 'deposit',
            payment_method: 'cash',
            notes: `Cọc từ báo giá ${quote.quote_number} - tự động tạo`
          });
        
        if (paymentError) {
          console.error('Error creating payment record:', paymentError);
        } else {
          // Create corresponding transaction record
          const { error: transactionError } = await supabase
            .from('transactions')
            .insert({
              amount: payment1,
              date: new Date().toISOString(),
              type: 'income',
              description: `Cọc đơn hàng ${orderNumber}`,
              category: 'order_payment',
              payment_type: 'deposit',
              order_id: orderData.id,
              manager_id: managerIdToUse,
              tenant_id: 'default'
            });

          if (transactionError) {
            console.error('Error creating transaction record:', transactionError);
          } else {
            // Update order payment status
            await supabase
              .from('orders')
              .update({
                payment_status: payment1 >= quote.total_amount ? 'paid' : 'partial',
                payment_date: payment1 >= quote.total_amount ? new Date().toISOString().split('T')[0] : null
              })
              .eq('id', orderData.id);
          }
        }
      }

      await refetchQuotes();
      
      // Also invalidate orders cache since we created a new order
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
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

      await refetchQuotes();
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
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

  const handleDuplicateQuote = async (quote: any) => {
    try {
      // Generate new quote number
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const newQuoteNumber = `BG-${dateStr}-${randomSuffix}`;

      // Copy data from original quote (exclude auto-generated fields)
      const duplicate = {
        quote_number: newQuoteNumber,
        customer_id: quote.customer_id,
        manager_id: quote.manager_id,
        assignee_id: quote.assignee_id,
        price_list_id: quote.price_list_id,
        items: quote.items,
        total_amount: quote.total_amount,
        subtotal: quote.subtotal,
        vat_amount: quote.vat_amount,
        include_vat: quote.include_vat,
        vat_rate: quote.vat_rate,
        notes: quote.notes 
          ? `[Nhân bản từ ${quote.quote_number}] ${quote.notes}` 
          : `Nhân bản từ ${quote.quote_number}`,
        quote_data: quote.quote_data,
        status: 'draft',
        tenant_id: 'default',
      };

      const { data: newQuote, error } = await supabase
        .from('quotes')
        .insert(duplicate)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Quote duplicated successfully:', newQuote);

      // Force immediate UI update - invalidate ALL quote queries
      await queryClient.invalidateQueries({ 
        queryKey: ['quotes'],
        refetchType: 'all'
      });

      toast({
        title: "Nhân bản thành công",
        description: `Đã tạo báo giá mới: ${newQuoteNumber}`,
      });
    } catch (error) {
      console.error('Error duplicating quote:', error);
      toast({
        title: "Lỗi",
        description: "Không thể nhân bản báo giá",
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
            <CreateAssigneeForm onSuccess={refetchQuotes} />
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
                         {new Date(quote.quoteDate || quote.created_at).toLocaleDateString("vi-VN")}
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
                            <DropdownMenuItem
                              onClick={() => handleDuplicateQuote(quote)}
                              className="hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Nhân bản
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
                              onClick={() => setEditingQuoteDetails(quote)}
                              className="hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              <Calendar className="mr-2 h-4 w-4" />
                              Sửa ngày & trạng thái
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
          onUpdate={refetchQuotes}
        />

      {/* Edit Quote Details Dialog */}
      <EditQuoteDetailsDialog
        open={!!editingQuoteDetails}
        onOpenChange={(open) => !open && setEditingQuoteDetails(null)}
        quote={editingQuoteDetails}
        onUpdate={refetchQuotes}
      />

      {/* Template Settings Dialog */}
      <QuoteTemplateSettings
        open={showTemplateSettings}
        onOpenChange={setShowTemplateSettings}
      />
    </div>
  );
}