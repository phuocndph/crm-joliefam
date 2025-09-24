import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, Filter, Download, Settings, BarChart3, UserPlus, Edit, Trash2, TrendingUp } from "lucide-react";
import CreateCustomerCareForm from "@/components/CreateCustomerCareForm";
import CreateAssigneeForm from "@/components/CreateAssigneeForm";
import EditCustomerCareDialog from "@/components/EditCustomerCareDialog";
import { DeleteCustomerDialog } from "@/components/DeleteCustomerDialog";
import AISettingsForm from "@/components/AISettingsForm";
import AINextActionCell from "@/components/AINextActionCell";
import PredictiveAnalyticsCell from "@/components/PredictiveAnalyticsCell";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCustomers } from "@/hooks/useCustomers";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { format } from "date-fns";

const CustomerCare = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedSource, setSelectedSource] = useState("all");
  const [assignees, setAssignees] = useState<any[]>([]);
  const [assigneeDialogOpen, setAssigneeDialogOpen] = useState(false);
  const [selectedCustomerForAssignee, setSelectedCustomerForAssignee] = useState<any>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("customers");
  
  // Bulk selection state
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<'status' | 'source' | 'assignee' | null>(null);
  
  // New state for inline editing
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [purchaseStatusDialogOpen, setPurchaseStatusDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [careDateDialogOpen, setCareDateDialogOpen] = useState(false);
  const [selectedCustomerForEdit, setSelectedCustomerForEdit] = useState<any>(null);
  const [notesText, setNotesText] = useState("");
  const [selectedCareDate, setSelectedCareDate] = useState<Date | undefined>(undefined);
  const { toast } = useToast();
  
  // Get current user and check permissions
  const [user, setUser] = useState<any>(null);
  const { role: userRole } = useUserRole(user);
  const { hasPermission } = useEmployeePermissions(user, userRole);
  
  // Use customers hook for data fetching with fresh data
  const { data: customersData = [], isLoading: loading, refetch: refetchCustomers } = useCustomers();

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getCurrentUser();
  }, []);

  // Enhanced customers data with purchase statistics
  const [enhancedCustomers, setEnhancedCustomers] = useState<any[]>([]);

  const fetchEnhancedCustomerData = async () => {
    if (!customersData) return;
    
    try {
      // Fetch orders to get real purchase data
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, customer_id, total_amount, status, created_at, payment_date, manager_id')
        .neq('status', 'cancelled')
        .not('total_amount', 'is', null)
        .not('manager_id', 'is', null); // Only get orders with assigned managers

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
      }

      // Fetch assignees
      const { data: assigneesData, error: assigneesError } = await supabase
        .from('assignees')
        .select('id, name');

      if (!assigneesError && assigneesData) {
        setAssignees(assigneesData);
      }

      // Calculate real purchase statistics for each customer and auto-assign based on orders
      if (customersData && ordersData) {
        const ordersByCustomer = ordersData.reduce((acc: any, order: any) => {
          if (!acc[order.customer_id]) {
            acc[order.customer_id] = {
              count: 0,
              totalSpent: 0,
              lastPurchase: null,
              assignedManager: null // Track manager from orders
            };
          }
          
          acc[order.customer_id].count += 1;
          acc[order.customer_id].totalSpent += Number(order.total_amount) || 0;
          
          // Use order creation date as the actual purchase time
          const purchaseDate = order.created_at;
          if (!acc[order.customer_id].lastPurchase || new Date(purchaseDate) > new Date(acc[order.customer_id].lastPurchase)) {
            acc[order.customer_id].lastPurchase = purchaseDate;
          }
          
          // Track manager from most recent order with manager_id
          if (order.manager_id) {
            if (!acc[order.customer_id].assignedManager || 
                new Date(purchaseDate) > new Date(acc[order.customer_id].lastManagerAssignment || '1970-01-01')) {
              acc[order.customer_id].assignedManager = order.manager_id;
              acc[order.customer_id].lastManagerAssignment = purchaseDate;
            }
          }
          
          return acc;
        }, {});

        // Deduplicate customers by name and consolidate data
        const customersByName = customersData.reduce((acc: any, customer: any) => {
          const customerName = customer.name.toLowerCase().trim();
          
          if (!acc[customerName]) {
            acc[customerName] = [];
          }
          acc[customerName].push(customer);
          return acc;
        }, {});

        // For each group of customers with the same name, merge into the most recent one
        const deduplicatedCustomers = Object.values(customersByName).map((duplicates: any) => {
          if (duplicates.length === 1) {
            const customer = duplicates[0];
            const orderStats = ordersByCustomer[customer.id] || {
              count: 0,
              totalSpent: 0,
              lastPurchase: null
            };

            return {
              ...customer,
              purchase_count: orderStats.count,
              total_spent: orderStats.totalSpent,
              last_purchase_date: orderStats.lastPurchase,
              // Auto-assign manager from orders if customer doesn't have one
              manager_id: customer.manager_id || orderStats.assignedManager
            };
          }

          // Sort by created_at to get the most recent customer record
          const sortedDuplicates = duplicates.sort((a: any, b: any) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          
          const mostRecentCustomer = sortedDuplicates[0];
          
          // Aggregate order statistics from all duplicate customer IDs
          let totalCount = 0;
          let totalSpent = 0;
          let latestPurchase = null;
          let processedOrderIds = new Set(); // Track processed orders to avoid double counting
          
          duplicates.forEach((customer: any) => {
            // Get orders for this specific customer ID to avoid double counting
            const customerOrders = ordersData?.filter(order => order.customer_id === customer.id) || [];
            
            customerOrders.forEach((order: any) => {
              if (!processedOrderIds.has(order.id)) {
                processedOrderIds.add(order.id);
                totalCount += 1;
                totalSpent += Number(order.total_amount) || 0;
                
                const orderDate = order.created_at;
                if (!latestPurchase || new Date(orderDate) > new Date(latestPurchase)) {
                  latestPurchase = orderDate;
                }
              }
            });
          });

          // Merge contact information from all duplicates
          const allPhones = duplicates.flatMap((c: any) => {
            if (Array.isArray(c.phones)) return c.phones;
            if (c.phone) return [{ number: c.phone, type: 'primary' }];
            return [];
          }).filter((phone: any, index: number, arr: any[]) => 
            arr.findIndex(p => p.number === phone.number) === index
          );

          const allAddresses = duplicates.flatMap((c: any) => {
            if (Array.isArray(c.addresses)) return c.addresses;
            if (c.address) return [{ address: c.address, type: 'primary' }];
            return [];
          }).filter((addr: any, index: number, arr: any[]) => 
            arr.findIndex(a => a.address === addr.address) === index
          );

          const allTags = duplicates.flatMap((c: any) => c.tags || [])
            .filter((tag: string, index: number, arr: string[]) => arr.indexOf(tag) === index);

          const allAutoTags = duplicates.flatMap((c: any) => c.auto_tags || [])
            .filter((tag: string, index: number, arr: string[]) => arr.indexOf(tag) === index);

          return {
            ...mostRecentCustomer,
            phones: allPhones,
            addresses: allAddresses,
            tags: allTags,
            auto_tags: allAutoTags,
            email: mostRecentCustomer.email || duplicates.find((c: any) => c.email)?.email || null,
            phone: mostRecentCustomer.phone || duplicates.find((c: any) => c.phone)?.phone || null,
            address: mostRecentCustomer.address || duplicates.find((c: any) => c.address)?.address || null,
            company: mostRecentCustomer.company || duplicates.find((c: any) => c.company)?.company || null,
            notes: [mostRecentCustomer.notes, ...duplicates.slice(1).map((c: any) => c.notes)]
              .filter(Boolean).join('; '),
            purchase_count: totalCount,
            total_spent: totalSpent,
            last_purchase_date: latestPurchase
          };
        });

        setEnhancedCustomers(deduplicatedCustomers);
      } else {
        setEnhancedCustomers(customersData || []);
      }
    } catch (error) {
      console.error('Error fetching enhanced data:', error);
      setEnhancedCustomers(customersData || []);
    }
  };

  useEffect(() => {
    fetchEnhancedCustomerData();
  }, [customersData]);

  const handleCustomerAdded = () => {
    refetchCustomers(); // Refresh the list when a new customer is added
  };

  const handleStatusUpdate = async (customerId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ current_status: status })
        .eq('id', customerId);

      if (error) throw error;

      refetchCustomers();
      setStatusDialogOpen(false);
      setSelectedCustomerForEdit(null);
      
      toast({
        title: "Thành công",
        description: "Đã cập nhật trạng thái",
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật trạng thái",
        variant: "destructive",
      });
    }
  };

  const handleSourceUpdate = async (customerId: string, source: string) => {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ tags: [source] })
        .eq('id', customerId);

      if (error) throw error;

      refetchCustomers();
      setSourceDialogOpen(false);
      setSelectedCustomerForEdit(null);
      
      toast({
        title: "Thành công",
        description: "Đã cập nhật nguồn",
      });
    } catch (error) {
      console.error('Error updating source:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật nguồn",
        variant: "destructive",
      });
    }
  };

  const handleNotesUpdate = async (customerId: string, notes: string) => {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ notes: notes })
        .eq('id', customerId);

      if (error) throw error;

      refetchCustomers();
      setNotesDialogOpen(false);
      setSelectedCustomerForEdit(null);
      setNotesText("");
      
      toast({
        title: "Thành công",
        description: "Đã cập nhật ghi chú",
      });
    } catch (error) {
      console.error('Error updating notes:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật ghi chú",
        variant: "destructive",
      });
    }
  };

  const handleAssigneeUpdate = async (customerId: string, assigneeId: string) => {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ manager_id: assigneeId })
        .eq('id', customerId);

      if (error) throw error;

      // Refetch data to update the display
      refetchCustomers();
      setAssigneeDialogOpen(false);
      setSelectedCustomerForAssignee(null);
      
      toast({
        title: "Thành công",
        description: "Đã cập nhật người phụ trách",
      });
    } catch (error) {
      console.error('Error updating assignee:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật người phụ trách",
        variant: "destructive",
      });
    }
  };

  const handleCareDateUpdate = async (customerId: string, careDate: Date) => {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ last_care_date: careDate.toISOString() })
        .eq('id', customerId);

      if (error) throw error;

      refetchCustomers();
      setCareDateDialogOpen(false);
      setSelectedCustomerForEdit(null);
      setSelectedCareDate(undefined);
      
      toast({
        title: "Thành công",
        description: "Đã cập nhật ngày chăm sóc",
      });
    } catch (error) {
      console.error('Error updating care date:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật ngày chăm sóc",
        variant: "destructive",
      });
    }
  };

  const handleEditCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setEditDialogOpen(true);
  };

  // Bulk selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allCustomerIds = enhancedCustomers
        .filter(customer => {
          // Apply same filters as displayed customers
          const matchesSearch = searchTerm === "" || 
            customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (customer.phone && customer.phone.includes(searchTerm));
          
          const matchesStatus = selectedStatus === "all" || 
            (customer.current_status || 'waiting-payment') === selectedStatus;
          
          const matchesSource = selectedSource === "all" ||
            (customer.tags && customer.tags.includes(selectedSource));
          
          return matchesSearch && matchesStatus && matchesSource;
        })
        .map(customer => customer.id);
      setSelectedCustomerIds(new Set(allCustomerIds));
    } else {
      setSelectedCustomerIds(new Set());
    }
  };

  const handleSelectCustomer = (customerId: string, checked: boolean) => {
    console.log('Select customer:', customerId, checked);
    const newSelected = new Set(selectedCustomerIds);
    if (checked) {
      newSelected.add(customerId);
    } else {
      newSelected.delete(customerId);
    }
    console.log('New selected customers:', Array.from(newSelected));
    setSelectedCustomerIds(newSelected);
  };

  // Bulk update handlers
  const handleBulkStatusUpdate = async (status: string) => {
    console.log('Bulk status update:', status, 'for customers:', Array.from(selectedCustomerIds));
    try {
      const { error } = await supabase
        .from('customers')
        .update({ current_status: status })
        .in('id', Array.from(selectedCustomerIds));

      if (error) throw error;
      
      refetchCustomers();
      setSelectedCustomerIds(new Set());
      setBulkActionDialogOpen(false);
      setBulkActionType(null);
      
      toast({
        title: "Thành công",
        description: `Đã cập nhật trạng thái cho ${selectedCustomerIds.size} khách hàng`,
      });
    } catch (error) {
      console.error('Error bulk updating status:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật trạng thái hàng loạt",
        variant: "destructive",
      });
    }
  };

  const handleBulkSourceUpdate = async (source: string) => {
    console.log('Bulk source update:', source, 'for customers:', Array.from(selectedCustomerIds));
    try {
      const { error } = await supabase
        .from('customers')
        .update({ tags: [source] })
        .in('id', Array.from(selectedCustomerIds));

      if (error) throw error;
      
      refetchCustomers();
      setSelectedCustomerIds(new Set());
      setBulkActionDialogOpen(false);
      setBulkActionType(null);
      
      toast({
        title: "Thành công",
        description: `Đã cập nhật nguồn cho ${selectedCustomerIds.size} khách hàng`,
      });
    } catch (error) {
      console.error('Error bulk updating source:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật nguồn hàng loạt",
        variant: "destructive",
      });
    }
  };

  const handleBulkAssigneeUpdate = async (assigneeId: string) => {
    console.log('Bulk assignee update:', assigneeId, 'for customers:', Array.from(selectedCustomerIds));
    try {
      const { error } = await supabase
        .from('customers')
        .update({ manager_id: assigneeId })
        .in('id', Array.from(selectedCustomerIds));

      if (error) throw error;
      
      refetchCustomers();
      setSelectedCustomerIds(new Set());
      setBulkActionDialogOpen(false);
      setBulkActionType(null);
      
      toast({
        title: "Thành công",
        description: `Đã cập nhật người phụ trách cho ${selectedCustomerIds.size} khách hàng`,
      });
    } catch (error) {
      console.error('Error bulk updating assignee:', error);
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật người phụ trách hàng loạt",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setDeleteDialogOpen(true);
  };

  const handleEditSubmit = () => {
    setEditDialogOpen(false);
    setSelectedCustomer(null);
    refetchCustomers(); // Refresh the list
    toast({
      title: "Thành công",
      description: "Đã cập nhật thông tin khách hàng",
    });
  };

  const handleDeleteConfirm = () => {
    setDeleteDialogOpen(false);
    setSelectedCustomer(null);
    refetchCustomers(); // Refresh the list
    toast({
      title: "Thành công",
      description: "Đã xóa khách hàng",
    });
  };

  const handleStatusClick = (status: string) => {
    setSelectedStatus(status);
    setActiveTab("customers");
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-primary">
          Hệ Thống Chăm Sóc Khách Hàng Joliefam
        </h1>
        <p className="text-muted-foreground">
          Quản lý và chăm sóc khách hàng thông minh với AI
        </p>
      </div>

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Khách Hàng
          </TabsTrigger>
          <TabsTrigger value="statistics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Thống Kê
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Import
          </TabsTrigger>
          <TabsTrigger value="ai-settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Cài Đặt AI
          </TabsTrigger>
        </TabsList>

        {/* Customer List Tab */}
        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Danh Sách Khách Hàng
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      refetchCustomers();
                      toast({ title: "Đã làm mới dữ liệu" });
                    }}
                  >
                    Làm mới
                  </Button>
                  <CreateCustomerCareForm onSuccess={handleCustomerAdded} />
                  <CreateAssigneeForm onSuccess={handleCustomerAdded} />
                  <Select defaultValue="all">
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Chọn người phụ trách" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="me">Được phân cho tôi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Total customers and bulk actions */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Tổng: <span className="font-medium">{enhancedCustomers.length} khách hàng</span>
                  {selectedCustomerIds.size > 0 && (
                    <span className="ml-2 text-primary font-medium">
                      ({selectedCustomerIds.size} đã chọn)
                    </span>
                  )}
                </p>
                
                {selectedCustomerIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <Select onValueChange={(value) => {
                      console.log('Bulk action selected:', value, 'for customers:', Array.from(selectedCustomerIds));
                      setBulkActionType(value as 'status' | 'source' | 'assignee');
                      setBulkActionDialogOpen(true);
                    }}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Thao tác hàng loạt" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="status">Cập nhật trạng thái</SelectItem>
                        <SelectItem value="source">Cập nhật nguồn</SelectItem>
                        <SelectItem value="assignee">Cập nhật người phụ trách</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedCustomerIds(new Set())}
                    >
                      Bỏ chọn tất cả
                    </Button>
                  </div>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Chọn tình trạng" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="waiting-payment">Chờ thanh toán tiền</SelectItem>
                    <SelectItem value="waiting-deposit">Chờ thanh toán cọc</SelectItem>
                    <SelectItem value="sent-sample">Đã gửi mẫu</SelectItem>
                    <SelectItem value="sent-quote">Đã gửi báo giá</SelectItem>
                    <SelectItem value="waiting-response">Chờ phản hồi khách hàng</SelectItem>
                    <SelectItem value="ordered">Đã đặt hàng</SelectItem>
                    <SelectItem value="paid">Đã thanh toán xong</SelectItem>
                    <SelectItem value="see-notes">Xem ở ghi chú</SelectItem>
                    <SelectItem value="no-response">Khách không phản hồi</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Tất cả nguồn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả nguồn</SelectItem>
                    <SelectItem value="zalo">Zalo</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="phone">Điện thoại</SelectItem>
                    <SelectItem value="referral">Giới thiệu</SelectItem>
                    <SelectItem value="walk-in">Ghé thăm trực tiếp</SelectItem>
                  </SelectContent>
                </Select>

                <Select>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Tất cả nguồn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả nguồn</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="direct">Trực tiếp</SelectItem>
                  </SelectContent>
                </Select>

                <Select>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="today">Hôm nay</SelectItem>
                    <SelectItem value="week">Tuần này</SelectItem>
                    <SelectItem value="month">Tháng này</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent>
              {/* Customer Table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                     <TableRow>
                        <TableHead className="w-12">
                          <input 
                            type="checkbox" 
                            className="rounded"
                            checked={selectedCustomerIds.size > 0 && selectedCustomerIds.size === enhancedCustomers.filter(customer => {
                              const matchesSearch = searchTerm === "" || 
                                customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
                                (customer.phone && customer.phone.includes(searchTerm));
                              
                              const matchesStatus = selectedStatus === "all" || 
                                (customer.current_status || 'waiting-payment') === selectedStatus;
                              
                              const matchesSource = selectedSource === "all" ||
                                (customer.tags && customer.tags.includes(selectedSource));
                              
                              return matchesSearch && matchesStatus && matchesSource;
                            }).length}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                          />
                        </TableHead>
                       <TableHead>Khách Hàng</TableHead>
                       <TableHead>Phụ Trách</TableHead>
                        <TableHead>Nguồn</TableHead>
                        <TableHead>Trạng Thái</TableHead>
                        <TableHead>Ngày Chăm Sóc Gần Nhất</TableHead>
                        <TableHead>Số Ngày Chưa Liên Hệ</TableHead>
                       <TableHead>Ghi Chú</TableHead>
                       <TableHead>Hành Động Tiếp Theo</TableHead>
                       <TableHead>Trạng Thái Mua Hàng</TableHead>
                       <TableHead>Thao Tác</TableHead>
                     </TableRow>
                  </TableHeader>
                  <TableBody>
                     {loading ? (
                         <TableRow>
                           <TableCell colSpan={10} className="text-center py-12">
                           <div className="flex items-center justify-center">
                             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                             <span className="ml-2">Đang tải...</span>
                           </div>
                         </TableCell>
                       </TableRow>
                     ) : enhancedCustomers.length === 0 ? (
                         <TableRow>
                           <TableCell colSpan={10} className="text-center py-12">
                           <div className="flex flex-col items-center gap-2">
                             <Users className="h-12 w-12 text-muted-foreground" />
                             <p className="text-muted-foreground font-medium">
                               Không có khách hàng nào
                             </p>
                             <p className="text-sm text-muted-foreground">
                               Hãy thêm khách hàng đầu tiên của bạn
                             </p>
                           </div>
                         </TableCell>
                       </TableRow>
                      ) : (
                        enhancedCustomers
                         .filter(customer => {
                           // Filter by search term
                           const matchesSearch = searchTerm === "" || 
                             customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
                             (customer.phone && customer.phone.includes(searchTerm));
                           
                           // Filter by status
                           const matchesStatus = selectedStatus === "all" || 
                             (customer.current_status || 'waiting-payment') === selectedStatus;
                           
                           // Filter by source
                           const matchesSource = selectedSource === "all" ||
                             (customer.tags && customer.tags.includes(selectedSource));
                           
                           return matchesSearch && matchesStatus && matchesSource;
                         })
                         .map((customer, index) => (
                         <TableRow key={customer.id}>
                           <TableCell>
                             <input 
                               type="checkbox" 
                               className="rounded"
                               checked={selectedCustomerIds.has(customer.id)}
                               onChange={(e) => handleSelectCustomer(customer.id, e.target.checked)}
                             />
                           </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{customer.name}</div>
                              {customer.email && (
                                <div className="text-sm text-muted-foreground">
                                  {customer.email}
                                </div>
                              )}
                              {customer.phone && (
                                <div className="text-sm text-muted-foreground">
                                  {customer.phone}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div 
                              className="cursor-pointer"
                              onClick={() => {
                                setSelectedCustomerForAssignee(customer);
                                setAssigneeDialogOpen(true);
                              }}
                            >
                              {(() => {
                                const assignee = assignees.find(a => a.id === customer.manager_id);
                                return assignee ? (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-colors">
                                    {assignee.name}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100 transition-colors">
                                    Chưa phân công
                                  </Badge>
                                );
                              })()}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div 
                              className="cursor-pointer"
                              onClick={() => {
                                setSelectedCustomerForEdit(customer);
                                setSourceDialogOpen(true);
                              }}
                            >
                              <Badge variant="secondary" className="hover:bg-secondary/80 transition-colors">
                                {customer.tags && customer.tags.length > 0 ? (
                                  customer.tags[0] === 'zalo' ? 'Zalo' :
                                  customer.tags[0] === 'facebook' ? 'Facebook' :
                                  customer.tags[0] === 'website' ? 'Website' :
                                  customer.tags[0] === 'phone' ? 'Điện thoại' :
                                  customer.tags[0] === 'referral' ? 'Giới thiệu' :
                                  customer.tags[0] === 'walk-in' ? 'Ghé thăm trực tiếp' :
                                  customer.tags[0]
                                ) : "Chưa xác định"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div 
                              className="cursor-pointer"
                              onClick={() => {
                                setSelectedCustomerForEdit(customer);
                                setStatusDialogOpen(true);
                              }}
                            >
                              {(() => {
                                const status = customer.current_status || 'waiting-payment';
                                const getStatusConfig = (status: string) => {
                                  switch (status) {
                                    case 'waiting-payment':
                                      return { text: 'Chờ thanh toán tiền', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
                                    case 'waiting-deposit':
                                      return { text: 'Chờ thanh toán cọc', className: 'bg-orange-50 text-orange-700 border-orange-200' };
                                    case 'sent-sample':
                                      return { text: 'Đã gửi mẫu', className: 'bg-blue-50 text-blue-700 border-blue-200' };
                                    case 'sent-quote':
                                      return { text: 'Đã gửi báo giá', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
                                    case 'waiting-response':
                                      return { text: 'Chờ phản hồi khách hàng', className: 'bg-purple-50 text-purple-700 border-purple-200' };
                                    case 'ordered':
                                      return { text: 'Đã đặt hàng', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
                                    case 'paid':
                                      return { text: 'Đã thanh toán xong', className: 'bg-green-50 text-green-700 border-green-200' };
                                    case 'see-notes':
                                      return { text: 'Xem ở ghi chú', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
                                    case 'no-response':
                                      return { text: 'Khách không phản hồi', className: 'bg-red-50 text-red-700 border-red-200' };
                                    default:
                                      return { text: 'Chờ thanh toán tiền', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
                                  }
                                };
                                const config = getStatusConfig(status);
                                return (
                                  <Badge variant="outline" className={`${config.className} hover:opacity-80 transition-opacity`}>
                                    {config.text}
                                  </Badge>
                                );
                              })()}
                            </div>
                           </TableCell>
                           <TableCell>
                             <div 
                               className="text-sm space-y-0.5 cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors"
                               onClick={() => {
                                 setSelectedCustomerForEdit(customer);
                                 setSelectedCareDate(customer.last_care_date ? new Date(customer.last_care_date) : new Date());
                                 setCareDateDialogOpen(true);
                               }}
                             >
                               <div className="font-medium">
                                 {customer.last_care_date ? format(new Date(customer.last_care_date), 'dd/MM/yyyy') : 'Chưa có'}
                               </div>
                               <div className="text-muted-foreground text-xs">
                                 {customer.last_care_date ? format(new Date(customer.last_care_date), 'HH:mm') : ''}
                               </div>
                             </div>
                           </TableCell>
                           <TableCell>
                             <div className="text-sm">
                               {(() => {
                                 if (!customer.last_care_date) {
                                   return <span className="text-muted-foreground">Chưa có dữ liệu</span>;
                                 }
                                 const daysSince = Math.floor((new Date().getTime() - new Date(customer.last_care_date).getTime()) / (1000 * 60 * 60 * 24));
                                 const color = daysSince > 7 ? 'text-red-600 font-medium' : daysSince > 3 ? 'text-yellow-600 font-medium' : 'text-green-600 font-medium';
                                 return <span className={color}>{daysSince} ngày</span>;
                               })()}
                             </div>
                           </TableCell>
                              <TableCell className="max-w-xs">
                                <div 
                                  className="whitespace-pre-wrap text-sm break-words cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors"
                                  onClick={() => {
                                    setSelectedCustomerForEdit(customer);
                                    setNotesText(customer.notes || "");
                                    setNotesDialogOpen(true);
                                  }}
                                >
                                  {customer.notes || "Không có ghi chú"}
                                </div>
                              </TableCell>
                            <TableCell>
                              <AINextActionCell customer={customer} />
                            </TableCell>
                           <TableCell>
                             <div 
                               className="cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors"
                               onClick={() => {
                                 setSelectedCustomerForEdit(customer);
                                 setPurchaseStatusDialogOpen(true);
                               }}
                             >
                               {customer.last_purchase_date ? (
                                 <div className="text-sm">
                                   <div className="text-green-600 font-medium">Đã mua hàng</div>
                                   <div className="text-xs text-muted-foreground">
                                     {format(new Date(customer.last_purchase_date), 'dd/MM/yyyy')}
                                   </div>
                                 </div>
                               ) : (
                                 <div className="text-sm text-muted-foreground">
                                   Chưa có đơn hàng
                                 </div>
                               )}
                             </div>
                           </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleEditCustomer(customer)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleDeleteCustomer(customer)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics" className="space-y-4">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{enhancedCustomers.length}</div>
                <p className="text-sm text-muted-foreground">Tổng khách hàng</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {enhancedCustomers.filter(c => {
                    const createdDate = new Date(c.created_at);
                    const today = new Date();
                    const diffTime = Math.abs(today.getTime() - createdDate.getTime());
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays <= 30;
                  }).length}
                </div>
                <p className="text-sm text-muted-foreground">Khách hàng mới (30 ngày)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {enhancedCustomers.filter(c => c.manager_id).length}
                </div>
                <p className="text-sm text-muted-foreground">Đã phân công</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {enhancedCustomers.filter(c => !c.manager_id).length}
                </div>
                <p className="text-sm text-muted-foreground">Chưa phân công</p>
              </CardContent>
            </Card>
          </div>

          {/* Status Statistics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Distribution Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Phân Bố Trạng Thái Khách Hàng
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(() => {
                     const statusCounts = enhancedCustomers.reduce((acc, customer) => {
                      const status = customer.current_status || 'waiting-payment';
                      acc[status] = (acc[status] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>);

                     const statusLabels = {
                       'waiting-payment': 'Chờ thanh toán tiền',
                       'waiting-deposit': 'Chờ thanh toán cọc',
                       'sent-sample': 'Đã gửi mẫu',
                       'sent-quote': 'Đã gửi báo giá',
                       'waiting-response': 'Chờ phản hồi khách hàng',
                       'ordered': 'Đã đặt hàng',
                       'paid': 'Đã thanh toán xong',
                       'see-notes': 'Xem ở ghi chú',
                       'no-response': 'Khách không phản hồi',
                       // Fallback cho các trạng thái cũ
                       'contacted': 'Đã liên hệ',
                       'negotiating': 'Đang đàm phán',
                       'closed-deal': 'Đã chốt deal',
                       'lost': 'Mất khách',
                       'follow-up': 'Theo dõi',
                     };

                     const statusColors = {
                       'waiting-payment': 'bg-yellow-500',
                       'waiting-deposit': 'bg-orange-500',
                       'sent-sample': 'bg-blue-500',
                       'sent-quote': 'bg-purple-500',
                       'waiting-response': 'bg-indigo-500',
                       'ordered': 'bg-green-500',
                       'paid': 'bg-emerald-500',
                       'see-notes': 'bg-gray-500',
                       'no-response': 'bg-red-500',
                       // Fallback cho các trạng thái cũ
                       'contacted': 'bg-blue-500',
                       'negotiating': 'bg-purple-500',
                       'closed-deal': 'bg-green-500',
                       'lost': 'bg-red-500',
                       'follow-up': 'bg-orange-500',
                     };

                     const total = enhancedCustomers.length;

                     return Object.entries(statusCounts).map(([status, count]) => {
                       const percentage = total > 0 ? ((Number(count) / total) * 100).toFixed(1) : '0';
                       return (
                         <div 
                           key={status} 
                           className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                           onClick={() => handleStatusClick(status)}
                         >
                           <div className="flex items-center gap-3">
                             <div className={`w-4 h-4 rounded-full ${statusColors[status as keyof typeof statusColors] || 'bg-gray-500'}`}></div>
                             <span className="font-medium">
                               {statusLabels[status as keyof typeof statusLabels] || status}
                             </span>
                           </div>
                           <div className="flex items-center gap-2">
                             <span className="font-bold">{String(count)}</span>
                             <span className="text-sm text-muted-foreground">({percentage}%)</span>
                           </div>
                         </div>
                       );
                     });
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Assignee Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Phân Bố Theo Nhân Viên Phụ Trách
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(() => {
                    const assigneeCounts = enhancedCustomers.reduce((acc, customer) => {
                      const assigneeId = customer.manager_id;
                      if (assigneeId) {
                        const assignee = assignees.find(a => a.id === assigneeId);
                        const assigneeName = assignee?.name || 'Không xác định';
                        acc[assigneeName] = (acc[assigneeName] || 0) + 1;
                      } else {
                        acc['Chưa phân công'] = (acc['Chưa phân công'] || 0) + 1;
                      }
                      return acc;
                    }, {} as Record<string, number>);

                    const total = enhancedCustomers.length;

                     return Object.entries(assigneeCounts)
                       .sort(([, a], [, b]) => Number(b) - Number(a))
                       .map(([assignee, count], index) => {
                         const percentage = total > 0 ? ((Number(count) / total) * 100).toFixed(1) : '0';
                         const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-gray-500'];
                         const colorClass = colors[index % colors.length];
                         
                         return (
                           <div key={assignee} className="flex items-center justify-between p-3 rounded-lg border">
                             <div className="flex items-center gap-3">
                               <div className={`w-4 h-4 rounded-full ${colorClass}`}></div>
                               <span className="font-medium">{String(assignee)}</span>
                             </div>
                             <div className="flex items-center gap-2">
                               <span className="font-bold">{String(count)}</span>
                               <span className="text-sm text-muted-foreground">({percentage}%)</span>
                             </div>
                           </div>
                         );
                       });
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Chi Tiết Trạng Thái Khách Hàng
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(() => {
                  const statusCounts = enhancedCustomers.reduce((acc, customer) => {
                    const status = customer.current_status || 'waiting-payment';
                    acc[status] = (acc[status] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);

                   const statusDetails = [
                     { key: 'waiting-payment', label: 'Chờ thanh toán tiền', color: 'border-yellow-200 bg-yellow-50', icon: '💰' },
                     { key: 'waiting-deposit', label: 'Chờ thanh toán cọc', color: 'border-orange-200 bg-orange-50', icon: '💸' },
                     { key: 'sent-sample', label: 'Đã gửi mẫu', color: 'border-blue-200 bg-blue-50', icon: '📦' },
                     { key: 'sent-quote', label: 'Đã gửi báo giá', color: 'border-purple-200 bg-purple-50', icon: '📄' },
                     { key: 'waiting-response', label: 'Chờ phản hồi khách hàng', color: 'border-indigo-200 bg-indigo-50', icon: '⏳' },
                     { key: 'ordered', label: 'Đã đặt hàng', color: 'border-green-200 bg-green-50', icon: '✅' },
                     { key: 'paid', label: 'Đã thanh toán xong', color: 'border-emerald-200 bg-emerald-50', icon: '💯' },
                     { key: 'see-notes', label: 'Xem ở ghi chú', color: 'border-gray-200 bg-gray-50', icon: '📝' },
                     { key: 'no-response', label: 'Khách không phản hồi', color: 'border-red-200 bg-red-50', icon: '❌' },
                   ];

                  return statusDetails.map(({ key, label, color, icon }) => {
                    const count = statusCounts[key] || 0;
                    return (
                      <Card 
                        key={key} 
                        className={`${color} border-2 cursor-pointer hover:shadow-md transition-shadow`}
                        onClick={() => handleStatusClick(key)}
                      >
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl mb-2">{icon}</div>
                          <div className="text-2xl font-bold mb-1">{count}</div>
                          <p className="text-sm font-medium">{label}</p>
                        </CardContent>
                      </Card>
                    );
                  });
                })()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import Tab */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Import Khách Hàng
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
                <Download className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Import dữ liệu khách hàng</h3>
                <p className="text-muted-foreground mb-4">
                  Kéo thả file Excel hoặc CSV vào đây để import dữ liệu khách hàng
                </p>
                <Button>Chọn file</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Settings Tab */}
        <TabsContent value="ai-settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Cài Đặt AI Chăm Sóc Khách Hàng
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AISettingsForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      {selectedCustomer && (
        <EditCustomerCareDialog
          customer={selectedCustomer}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSuccess={handleEditSubmit}
        />
      )}

      {/* Delete Dialog */}
      {selectedCustomer && (
        <DeleteCustomerDialog
          customer={selectedCustomer}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {/* Assignee Selection Dialog */}
      <Dialog open={assigneeDialogOpen} onOpenChange={setAssigneeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chọn người phụ trách</DialogTitle>
            <DialogDescription>
              Chọn người phụ trách cho khách hàng: {selectedCustomerForAssignee?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {assignees.map((assignee) => (
              <Button
                key={assignee.id}
                variant={selectedCustomerForAssignee?.manager_id === assignee.id ? "default" : "outline"}
                className="justify-start"
                onClick={() => handleAssigneeUpdate(selectedCustomerForAssignee?.id, assignee.id)}
              >
                {assignee.name}
              </Button>
            ))}
            <Button
              variant="outline"
              className="justify-start text-muted-foreground"
              onClick={() => handleAssigneeUpdate(selectedCustomerForAssignee?.id, '')}
            >
              Bỏ phân công
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Selection Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chọn trạng thái</DialogTitle>
            <DialogDescription>
              Chọn trạng thái cho khách hàng: {selectedCustomerForEdit?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {[
              { key: 'waiting-payment', label: 'Chờ thanh toán tiền' },
              { key: 'waiting-deposit', label: 'Chờ thanh toán cọc' },
              { key: 'sent-sample', label: 'Đã gửi mẫu' },
              { key: 'sent-quote', label: 'Đã gửi báo giá' },
              { key: 'waiting-response', label: 'Chờ phản hồi khách hàng' },
              { key: 'ordered', label: 'Đã đặt hàng' },
              { key: 'paid', label: 'Đã thanh toán xong' },
              { key: 'see-notes', label: 'Xem ở ghi chú' },
              { key: 'no-response', label: 'Khách không phản hồi' }
            ].map((status) => (
              <Button
                key={status.key}
                variant={selectedCustomerForEdit?.current_status === status.key ? "default" : "outline"}
                className="justify-start"
                onClick={() => handleStatusUpdate(selectedCustomerForEdit?.id, status.key)}
              >
                {status.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Source Selection Dialog */}
      <Dialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chọn nguồn</DialogTitle>
            <DialogDescription>
              Chọn nguồn cho khách hàng: {selectedCustomerForEdit?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {[
              { key: 'zalo', label: 'Zalo' },
              { key: 'facebook', label: 'Facebook' },
              { key: 'website', label: 'Website' },
              { key: 'phone', label: 'Điện thoại' },
              { key: 'referral', label: 'Giới thiệu' },
              { key: 'walk-in', label: 'Ghé thăm trực tiếp' }
            ].map((source) => (
              <Button
                key={source.key}
                variant={selectedCustomerForEdit?.tags?.[0] === source.key ? "default" : "outline"}
                className="justify-start"
                onClick={() => handleSourceUpdate(selectedCustomerForEdit?.id, source.key)}
              >
                {source.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase Status Dialog */}
      <Dialog open={purchaseStatusDialogOpen} onOpenChange={setPurchaseStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trạng thái mua hàng</DialogTitle>
            <DialogDescription>
              Thông tin mua hàng của khách hàng: {selectedCustomerForEdit?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="text-sm space-y-2">
              <div>
                <span className="font-medium">Số đơn hàng:</span> {selectedCustomerForEdit?.purchase_count || 0}
              </div>
              <div>
                <span className="font-medium">Tổng chi tiêu:</span> {Number(selectedCustomerForEdit?.total_spent || 0).toLocaleString("vi-VN")} VNĐ
              </div>
              {selectedCustomerForEdit?.last_purchase_date && (
                <div>
                  <span className="font-medium">Mua lần cuối:</span> {format(new Date(selectedCustomerForEdit.last_purchase_date), 'dd/MM/yyyy')}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notes Edit Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa ghi chú</DialogTitle>
            <DialogDescription>
              Ghi chú cho khách hàng: {selectedCustomerForEdit?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Nhập ghi chú..."
              className="min-h-[120px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={() => handleNotesUpdate(selectedCustomerForEdit?.id, notesText)}>
              Lưu
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Care Date Edit Dialog */}
      <Dialog open={careDateDialogOpen} onOpenChange={setCareDateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa ngày chăm sóc</DialogTitle>
            <DialogDescription>
              Cập nhật ngày chăm sóc gần nhất cho khách hàng: {selectedCustomerForEdit?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedCareDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedCareDate ? format(selectedCareDate, "dd/MM/yyyy") : <span>Chọn ngày</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedCareDate}
                  onSelect={setSelectedCareDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCareDateDialogOpen(false)}>
              Hủy
            </Button>
            <Button 
              onClick={() => selectedCareDate && handleCareDateUpdate(selectedCustomerForEdit?.id, selectedCareDate)}
              disabled={!selectedCareDate}
            >
              Lưu
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Dialog */}
      <Dialog open={bulkActionDialogOpen} onOpenChange={setBulkActionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {bulkActionType === 'status' && 'Cập nhật trạng thái hàng loạt'}
              {bulkActionType === 'source' && 'Cập nhật nguồn hàng loạt'}
              {bulkActionType === 'assignee' && 'Cập nhật người phụ trách hàng loạt'}
            </DialogTitle>
            <DialogDescription>
              Thực hiện thao tác cho {selectedCustomerIds.size} khách hàng đã chọn
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {bulkActionType === 'status' && [
              { key: 'waiting-payment', label: 'Chờ thanh toán tiền' },
              { key: 'waiting-deposit', label: 'Chờ thanh toán cọc' },
              { key: 'sent-sample', label: 'Đã gửi mẫu' },
              { key: 'sent-quote', label: 'Đã gửi báo giá' },
              { key: 'waiting-response', label: 'Chờ phản hồi khách hàng' },
              { key: 'ordered', label: 'Đã đặt hàng' },
              { key: 'paid', label: 'Đã thanh toán xong' },
              { key: 'see-notes', label: 'Xem ở ghi chú' },
              { key: 'no-response', label: 'Khách không phản hồi' }
            ].map((status) => (
              <Button
                key={status.key}
                variant="outline"
                className="justify-start"
                onClick={() => handleBulkStatusUpdate(status.key)}
              >
                {status.label}
              </Button>
            ))}

            {bulkActionType === 'source' && [
              { key: 'zalo', label: 'Zalo' },
              { key: 'facebook', label: 'Facebook' },
              { key: 'website', label: 'Website' },
              { key: 'phone', label: 'Điện thoại' },
              { key: 'referral', label: 'Giới thiệu' },
              { key: 'walk-in', label: 'Ghé thăm trực tiếp' }
            ].map((source) => (
              <Button
                key={source.key}
                variant="outline"
                className="justify-start"
                onClick={() => handleBulkSourceUpdate(source.key)}
              >
                {source.label}
              </Button>
            ))}

            {bulkActionType === 'assignee' && (
              <>
                {assignees.map((assignee) => (
                  <Button
                    key={assignee.id}
                    variant="outline"
                    className="justify-start"
                    onClick={() => handleBulkAssigneeUpdate(assignee.id)}
                  >
                    {assignee.name}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  className="justify-start text-muted-foreground"
                  onClick={() => handleBulkAssigneeUpdate('')}
                >
                  Bỏ phân công
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerCare;