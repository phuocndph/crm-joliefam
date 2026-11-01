import { normalizeQuoteFilters, quoteReadError } from '@/lib/quote-filters';
import { useAssignees } from '@/hooks/useAssignees';
import { formatQuoteDate, quoteCalendarDate, quoteCalendarDateIso, resolveQuoteDates } from '@/lib/quote-dates';
import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useDeleteQuote, fetchQuoteData } from "@/hooks/useQuotes";
import { useInfiniteQuotes } from "@/hooks/useInfiniteQuotes";
import { useQuotesStats } from "@/hooks/useQuotesStats";
import { useDebounce } from "@/hooks/useDebounce";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
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
  Sparkles,
  Calculator,
  Calendar,
  Copy,
  FileSignature,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileQuoteList } from "@/components/MobileQuoteList";
import { isLocalBackend, localAdminUser } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";

const QuotePreviewDialog = lazy(() => import("@/components/QuotePreviewDialog").then(m => ({ default: m.QuotePreviewDialog })));

const statusLabels = {
  draft: { label: "Nháp", color: "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100" },
  sent: { label: "Đã gửi", color: "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-100" },
  approved: { label: "Đã duyệt", color: "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50" },
  rejected: { label: "Từ chối", color: "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-50" },
  expired: { label: "Hết hạn", color: "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50" },
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
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [quoteFilters, setQuoteFilters] = useState(() => normalizeQuoteFilters());
  const [filterDraft, setFilterDraft] = useState(() => normalizeQuoteFilters());
  const [filterError, setFilterError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const { data: filterAssignees = [], isLoading: assigneesLoading, isError: assigneesError, refetch: retryAssignees } = useAssignees();
  const activeFilterCount = [quoteFilters.status, quoteFilters.assigneeId, quoteFilters.dateFrom, quoteFilters.dateTo].filter(Boolean).length;
  const applyFilters = () => {
    try { setQuoteFilters(normalizeQuoteFilters(filterDraft)); setFilterError(''); setFilterOpen(false); }
    catch (error) { setFilterError(quoteReadError(error)); }
  };
  const clearFilters = () => { setQuoteFilters(normalizeQuoteFilters()); setFilterDraft(normalizeQuoteFilters()); setSearchTerm(''); setFilterError(''); };
  const debouncedSearch = useDebounce(searchTerm, 350);
  const managerFilter = userRole === 'manager' ? user?.id : 'all';

  // Server-side paginated quotes (egress optimization)
  const {
    data: quotesPages,
    isLoading: loading,
    refetch: refetchQuotes,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage, isError: quotesError, error: quotesErrorDetail, isFetchNextPageError,
  } = useInfiniteQuotes({ ...quoteFilters, managerId: managerFilter, search: debouncedSearch });

  const quotes = (quotesPages?.pages || []).flat();
  const sentinelRef = useInfiniteScroll(hasNextPage && !quotesError, isFetchingNextPage, fetchNextPage);

  // Lightweight stats (separate query so they reflect ALL quotes, not just loaded pages)
  const { data: statsData, isLoading: statsLoading, isError: statsError, error: statsErrorDetail, refetch: retryStats } = useQuotesStats({ ...quoteFilters, managerId: managerFilter, search: debouncedSearch });
  const statsReady = Boolean(statsData && !statsError);
  const listReadError = quotesError && !isFetchNextPageError;
  const hasActiveQuery = Boolean(debouncedSearch.trim() || activeFilterCount);

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

  // Membership and order are authoritative in the query, including across page boundaries.
  const filteredQuotes = quotes;

  const handleCreateQuote = async () => {
    setShowCreateForm(false);
    await refetchQuotes();
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
    queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
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
    queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
    queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
    
    toast({
      title: "Thành công", 
      description: "Bản nháp báo giá đã được cập nhật. Duyệt báo giá để tạo đơn hàng.",
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
      if (isLocalBackend()) {
        const result = await localApi.approveQuote(quote.id);
        await refetchQuotes();
        queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
        queryClient.invalidateQueries({ queryKey: ['orders-infinite'], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['orders-stats'], refetchType: 'all' });
        toast({ title: "Thành công", description: `Báo giá đã được duyệt và tạo đơn hàng ${String(result.order.order_number || '')} trên local.` });
        return;
      }
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
          notes: null,
          tenant_id: 'default',
          quote_id: quote.id, // Link directly to quote
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      // Transfer payment information from quote to order if exists
      // Egress optimization: quote_data is no longer in list query — fetch on-demand
      const quoteDataRaw = await fetchQuoteData(quote.id);
      const quoteData = quoteDataRaw ? JSON.parse(quoteDataRaw) : {};
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
      queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
      queryClient.invalidateQueries({ queryKey: ['orders'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['orders-infinite'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['orders-stats'], refetchType: 'all' });
      
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
      if (isLocalBackend()) {
        await localApi.updateQuote(quoteId, { status: 'rejected' });
        await refetchQuotes();
        queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
        toast({ title: "Thành công", description: "Báo giá đã được từ chối trên local." });
        return;
      }

      const { error } = await supabase
        .from('quotes')
        .update({ status: 'rejected' })
        .eq('id', quoteId);

      if (error) throw error;

      await refetchQuotes();
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
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

      // Egress optimization: fetch quote_data on-demand (not in list query)
      const quoteDataRaw = await fetchQuoteData(quote.id);

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
        quote_data: quoteDataRaw,
        status: 'draft',
        tenant_id: 'default',
      };

      if (isLocalBackend()) {
        await localApi.createQuote({ ...duplicate, idempotency_key: crypto.randomUUID() });
        await queryClient.invalidateQueries({ queryKey: ['quotes'], refetchType: 'all' });
        await queryClient.invalidateQueries({ queryKey: ['quotes-infinite'], refetchType: 'all' });
        await queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
        toast({ title: "Nhân bản thành công", description: `Đã tạo báo giá mới: ${newQuoteNumber}` });
        return;
      }

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

  // Calculate stats from lightweight stats query (covers all quotes, not just loaded pages)
  const stats = [
    {
      title: "Tổng báo giá",
      value: statsLoading ? 'Đang tải…' : statsReady ? statsData.total : 'Chưa xác định',
      icon: FileText,
      color: "text-blue-600",
    },
    {
      title: "Đã gửi",
      value: statsLoading ? 'Đang tải…' : statsReady ? statsData.sent : 'Chưa xác định',
      icon: Clock,
      color: "text-yellow-600",
    },
    {
      title: "Được duyệt",
      value: statsLoading ? 'Đang tải…' : statsReady ? statsData.approved : 'Chưa xác định',
      icon: CheckCircle,
      color: "text-green-600",
    },
    {
      title: "Giá trị đã duyệt",
      value: statsLoading ? "Đang tải…" : statsReady ? `${statsData.totalValue.toLocaleString("vi-VN")} VNĐ` : "Chưa xác định",
      icon: AlertCircle,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-subtle rounded-lg border p-4 sm:p-6 shadow-soft">
        <div className="flex min-w-0 flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="text-3xl font-bold text-foreground">Quản lý Báo giá</h1>
            <p className="text-muted-foreground">
              Tạo và quản lý báo giá cho khách hàng
            </p>
          </div>
          <div className="flex min-w-0 w-full flex-wrap gap-2 xl:w-auto xl:justify-end">
            <Button onClick={() => setShowCreateForm(true)} className="w-full gap-2 sm:w-auto">
              <Plus className="h-4 w-4" />
              Tạo báo giá mới
            </Button>
            <CreateAssigneeForm onSuccess={refetchQuotes} />
            {(userRole === 'manager' || userRole === 'admin') && (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/ai-settings')} 
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Cài đặt AI
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowTemplateSettings(true)} 
                  className="gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Cài đặt mẫu
                </Button>
              </>
            )}
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

      {statsError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm"><span>Không tải được thống kê. {quoteReadError(statsErrorDetail)}</span><Button type="button" variant="outline" size="sm" onClick={() => void retryStats()}>Thử lại thống kê</Button></div>}
      {/* Search and Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách Báo giá</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Tìm số báo giá, thông tin khách hàng đã lưu..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Popover open={filterOpen} onOpenChange={open => { setFilterOpen(open); if (open) { setFilterDraft(quoteFilters); setFilterError(''); } }}>
              <PopoverTrigger asChild><Button type="button" variant="outline" className="gap-2"><Filter className="h-4 w-4" />Lọc{activeFilterCount > 0 && ` (${activeFilterCount})`}</Button></PopoverTrigger>
              <PopoverContent align="end" className="max-h-[var(--radix-popover-content-available-height)] w-80 space-y-3 overflow-y-auto">
                <h3 className="font-semibold">Lọc báo giá</h3>
                <label className="block space-y-1 text-sm"><span>Trạng thái</span><select aria-label="Lọc trạng thái" className="h-10 w-full rounded-md border bg-background px-2" value={filterDraft.status} onChange={event => { const value = event.target.value; setFilterDraft(previous => ({ ...previous, status: value })); }}><option value="">Tất cả trạng thái</option>{Object.entries(statusLabels).map(([value, status]) => <option key={value} value={value}>{status.label}</option>)}</select></label>
                <label className="block space-y-1 text-sm"><span>Người phụ trách</span><select aria-label="Lọc người phụ trách" className="h-10 w-full rounded-md border bg-background px-2" value={filterDraft.assigneeId} onChange={event => { const value = event.target.value; setFilterDraft(previous => ({ ...previous, assigneeId: value })); }}><option value="">Tất cả người phụ trách</option><option value="__unassigned__">Chưa phân công</option>{filterAssignees.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
                {assigneesLoading && <p className="text-xs text-muted-foreground">Đang tải người phụ trách…</p>}
                {assigneesError && <div role="alert" className="text-xs text-destructive">Không tải được người phụ trách. <Button type="button" variant="link" size="sm" onClick={() => void retryAssignees()}>Thử lại</Button></div>}
                <label className="block space-y-1 text-sm"><span>Ngày báo giá từ</span><Input aria-label="Ngày báo giá từ" type="date" value={filterDraft.dateFrom} onChange={event => { const value = event.target.value; setFilterDraft(previous => ({ ...previous, dateFrom: value })); }} /></label>
                <label className="block space-y-1 text-sm"><span>Ngày báo giá đến</span><Input aria-label="Ngày báo giá đến" type="date" value={filterDraft.dateTo} onChange={event => { const value = event.target.value; setFilterDraft(previous => ({ ...previous, dateTo: value })); }} /></label>
                {filterError && <p role="alert" className="text-sm text-destructive">{filterError}</p>}
                <div className="flex justify-between gap-2"><Button type="button" variant="outline" onClick={clearFilters}>Xóa tất cả</Button><Button type="button" onClick={applyFilters}>Áp dụng</Button></div>
              </PopoverContent>
            </Popover>
            {hasActiveQuery && <Button type="button" variant="ghost" onClick={clearFilters}>Xóa bộ lọc và tìm kiếm</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {listReadError && <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm"><span>Không tải được danh sách báo giá. {quoteReadError(quotesErrorDetail)}</span><Button type="button" variant="outline" size="sm" onClick={() => void refetchQuotes()}>Thử lại danh sách</Button></div>}
          <div className="rounded-md border">
            {isMobile ? (
              <div className="p-2">
                {loading ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">Đang tải...</div>
                ) : listReadError && quotes.length === 0 ? null : filteredQuotes.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">{hasActiveQuery ? 'Không tìm thấy báo giá phù hợp' : 'Chưa có báo giá nào'}</div>
                ) : (
                  <MobileQuoteList
                    quotes={filteredQuotes}
                    statusLabels={statusLabels}
                    canApprove={userRole === 'manager' || userRole === 'admin' || hasPermission('quote_approval')}
                    canSupplement={hasPermission('quote_supplement')}
                    canManage={userRole === 'manager' || userRole === 'admin'}
                    canEditDetails={userRole === 'manager' || userRole === 'admin' || hasPermission('quote_approval')}
                    onView={(q) => setSelectedQuote(q)}
                    onEdit={async (q) => {
                      const quoteDataRaw = await fetchQuoteData(q.id);
                      setEditingQuote({ ...q, quote_data: quoteDataRaw });
                    }}
                    onDelete={(q) => handleDeleteQuote(q.id)}
                    onDuplicate={(q) => handleDuplicateQuote(q)}
                    onApprove={(q) => handleApproveQuote(q)}
                    onReject={(q) => handleRejectQuote(q.id)}
                    onSupplement={(q) => setSupplementQuote(q)}
                    onEditDetails={(q) => setEditingQuoteDetails(q)}
                    onToContract={(q) => {
                      const items = Array.isArray(q.items) ? q.items : [];
                      const params = new URLSearchParams({
                        from_quote: q.id,
                        customer_id: q.customer_id || '',
                        total: String(q.total_amount || 0),
                        title: `HĐ từ báo giá ${q.quote_number}`,
                        items: JSON.stringify(items),
                      });
                      window.location.href = `/contracts?${params.toString()}`;
                    }}
                  />
                )}
              </div>
            ) : (
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
                ) : listReadError && quotes.length === 0 ? null : filteredQuotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {hasActiveQuery ? "Không tìm thấy báo giá phù hợp" : "Chưa có báo giá nào"}
                        </p>
                        {!hasActiveQuery && (
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
                        <button
                          type="button"
                          onClick={() => setSelectedQuote(quote)}
                          className="text-left font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs cursor-pointer"
                          title="Xem trước báo giá"
                        >
                          {quote.quote_number || `QUOTE-${quote.id.slice(0, 8)}`}
                        </button>
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
                        <Popover>
                          <PopoverTrigger asChild>
                            <button disabled={isLocalBackend() && quote.status === 'approved'} className="text-left hover:underline cursor-pointer text-sm px-1 py-0.5 rounded hover:bg-muted transition-colors disabled:cursor-default disabled:no-underline">
                              {formatQuoteDate(resolveQuoteDates(quote).quoteDate)}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={quoteCalendarDate(resolveQuoteDates(quote).quoteDate)}
                              onSelect={async (date) => {
                                if (!date) return;
                                const adjustedDate = quoteCalendarDateIso(date);
                                if (isLocalBackend()) {
                                  await localApi.updateQuote(quote.id, { created_at: adjustedDate });
                                  queryClient.invalidateQueries({ queryKey: ['quotes'] });
                                  queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
                                  queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
                                  toast({ title: "Đã cập nhật ngày tạo local" });
                                  return;
                                }
                                const { data: updated, error } = await supabase
                                  .from('quotes')
                                  .update({ created_at: adjustedDate })
                                  .eq('id', quote.id)
                                  .select();
                                if (error || !updated?.length) {
                                  toast({ title: "Lỗi", description: "Không thể cập nhật ngày tạo", variant: "destructive" });
                                } else {
                                  queryClient.invalidateQueries({ queryKey: ['quotes'] });
                                  toast({ title: "Đã cập nhật ngày tạo" });
                                }
                              }}
                              initialFocus
                              locale={vi}
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button disabled={isLocalBackend() && quote.status === 'approved'} className="text-left hover:underline cursor-pointer text-sm px-1 py-0.5 rounded hover:bg-muted transition-colors disabled:cursor-default disabled:no-underline">
                              {formatQuoteDate(resolveQuoteDates(quote).expiryDate)}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={quoteCalendarDate(resolveQuoteDates(quote).expiryDate)}
                              onSelect={async (date) => {
                                if (!date) return;
                                const currentNotes = quote.notes || '';
                                const expiryDateStr = format(date, "dd/MM/yyyy");
                                let updatedNotes = currentNotes;
                                if (/(?:^|\r?\n)Ngày hết hạn:[ \t]*[^\r\n]*/.test(currentNotes)) {
                                  updatedNotes = currentNotes.replace(/(^|\r?\n)Ngày hết hạn:[ \t]*[^\r\n]*/, (_line, prefix) => `${prefix}Ngày hết hạn: ${expiryDateStr}`);
                                } else {
                                  updatedNotes = currentNotes + `\nNgày hết hạn: ${expiryDateStr}`;
                                }
                                if (isLocalBackend()) {
                                  await localApi.updateQuote(quote.id, { notes: updatedNotes });
                                  queryClient.invalidateQueries({ queryKey: ['quotes'] });
                                  queryClient.invalidateQueries({ queryKey: ['quotes-infinite'] });
                                  queryClient.invalidateQueries({ queryKey: ['quotes-stats'] });
                                  toast({ title: "Đã cập nhật ngày hết hạn local" });
                                  return;
                                }
                                const { data: updated, error } = await supabase
                                  .from('quotes')
                                  .update({ notes: updatedNotes })
                                  .eq('id', quote.id)
                                  .select();
                                if (error || !updated?.length) {
                                  toast({ title: "Lỗi", description: "Không thể cập nhật ngày hết hạn", variant: "destructive" });
                                } else {
                                  queryClient.invalidateQueries({ queryKey: ['quotes'] });
                                  toast({ title: "Đã cập nhật ngày hết hạn" });
                                }
                              }}
                              initialFocus
                              locale={vi}
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
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
                            {(userRole === 'manager' || userRole === 'admin' || hasPermission('quote_approval')) && ['draft', 'sent'].includes(quote.status) && (
                              <DropdownMenuItem
                                onClick={() => handleApproveQuote(quote)}
                                className="text-green-600 hover:bg-green-600 hover:text-white transition-colors"
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Duyệt báo giá
                              </DropdownMenuItem>
                            )}
                            {(userRole === 'manager' || userRole === 'admin' || hasPermission('quote_approval')) && ['draft', 'sent'].includes(quote.status) && (
                              <DropdownMenuItem
                                onClick={() => handleRejectQuote(quote.id)}
                                className="text-orange-600 hover:bg-orange-600 hover:text-white transition-colors"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Từ chối
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              disabled={isLocalBackend() && quote.status === 'approved'}
                              onClick={async () => {
                                // Egress optimization: fetch heavy quote_data only when editing
                                const quoteDataRaw = await fetchQuoteData(quote.id);
                                setEditingQuote({ ...quote, quote_data: quoteDataRaw });
                              }}
                              className="hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              {isLocalBackend() && quote.status === 'approved' ? 'Đã duyệt — nhân bản để sửa' : 'Sửa'}
                            </DropdownMenuItem>
                            {(userRole === 'manager' || userRole === 'admin' || hasPermission('quote_approval')) && (
                              <DropdownMenuItem
                                disabled={isLocalBackend() && quote.status === 'approved'}
                                onClick={() => setEditingQuoteDetails(quote)}
                                className="hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                <Calendar className="mr-2 h-4 w-4" />
                                Sửa ngày & trạng thái
                              </DropdownMenuItem>
                            )}
                            {(userRole === 'manager' || userRole === 'admin') && (
                              <DropdownMenuItem
                                disabled={isLocalBackend() && quote.status === 'approved'}
                                onClick={() => handleDeleteQuote(quote.id)}
                                className="text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Xóa
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                const items = Array.isArray(quote.items) ? quote.items : [];
                                const params = new URLSearchParams({
                                  from_quote: quote.id,
                                  customer_id: quote.customer_id || '',
                                  total: String(quote.total_amount || 0),
                                  title: `HĐ từ báo giá ${quote.quote_number}`,
                                  items: JSON.stringify(items),
                                });
                                window.location.href = `/contracts?${params.toString()}`;
                              }}
                              className="text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                            >
                              <FileSignature className="mr-2 h-4 w-4" />
                              Tạo hợp đồng
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            )}
          </div>
          {isFetchNextPageError && <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm"><span>Không tải được trang tiếp theo. Các báo giá đã tải được giữ nguyên. {quoteReadError(quotesErrorDetail)}</span><Button type="button" variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>Thử tải thêm</Button></div>}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-10 flex items-center justify-center">
            {isFetchingNextPage && (
              <span className="text-sm text-muted-foreground">Đang tải thêm...</span>
            )}
            {!hasNextPage && !quotesError && quotes.length > 0 && (
              <span className="text-xs text-muted-foreground">Đã tải hết</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Quote Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="flex w-[96vw] min-w-0 max-w-7xl h-[92dvh] max-h-[92dvh] flex-col overflow-clip p-0 gap-0 [&>button.absolute]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Tạo báo giá mới</DialogTitle>
            <DialogDescription>Nhập khách hàng, sản phẩm và kế hoạch thanh toán để tạo báo giá.</DialogDescription>
          </DialogHeader>
          <CreateQuoteForm 
            onClose={() => setShowCreateForm(false)}
            onSubmit={handleCreateQuote}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Quote Dialog */}
      <Dialog open={!!editingQuote} onOpenChange={(open) => !open && setEditingQuote(null)}>
        <DialogContent className="flex w-[96vw] min-w-0 max-w-7xl h-[92dvh] max-h-[92dvh] flex-col overflow-clip p-0 gap-0 [&>button.absolute]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Chỉnh sửa báo giá</DialogTitle>
            <DialogDescription>Điều chỉnh thông tin và sản phẩm, sau đó lưu báo giá.</DialogDescription>
          </DialogHeader>
          <CreateQuoteForm 
            onClose={() => setEditingQuote(null)}
            onSubmit={handleEditQuote}
            initialData={editingQuote}
          />
        </DialogContent>
      </Dialog>

      {/* Quote Preview Dialog */}
      {selectedQuote && (() => {
        const selectedIdx = filteredQuotes.findIndex((q) => q.id === selectedQuote.id);
        const prevQuote = selectedIdx > 0 ? filteredQuotes[selectedIdx - 1] : null;
        const nextQuote = selectedIdx >= 0 && selectedIdx < filteredQuotes.length - 1 ? filteredQuotes[selectedIdx + 1] : null;
        const posLabel = selectedIdx >= 0 ? `${selectedIdx + 1}/${filteredQuotes.length}` : undefined;
        return (
        <Suspense fallback={null}>
          <QuotePreviewDialog 
            open 
            onOpenChange={(open) => !open && setSelectedQuote(null)} 
            quote={selectedQuote}
            onPrevQuote={prevQuote ? () => setSelectedQuote(prevQuote) : undefined}
            onNextQuote={nextQuote ? () => setSelectedQuote(nextQuote) : undefined}
            positionLabel={posLabel}
            onEdit={async (q) => {
              setSelectedQuote(null);
              const quoteDataRaw = q.quote_data ?? (await fetchQuoteData(String(q.id)));
              setEditingQuote({ ...q, quote_data: quoteDataRaw });
            }}
            onEditDetails={(q) => {
              setSelectedQuote(null);
              setEditingQuoteDetails(q);
            }}
            onDuplicate={async (q) => {
              setSelectedQuote(null);
              await handleDuplicateQuote(q);
            }}
            onApprove={async (q) => {
              setSelectedQuote(null);
              await handleApproveQuote(q);
            }}
            onReject={async (q) => {
              setSelectedQuote(null);
              await handleRejectQuote(String(q.id));
            }}
            onToContract={(q) => {
              const items = Array.isArray(q.items) ? q.items : [];
              const params = new URLSearchParams({
                from_quote: String(q.id || ''),
                customer_id: String(q.customer_id || ''),
                total: String(q.total_amount || 0),
                title: `HĐ từ báo giá ${String(q.quote_number || '')}`,
                items: JSON.stringify(items),
              });
              window.location.href = `/contracts?${params.toString()}`;
            }}
          />
        </Suspense>
        );
      })()}

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
