import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, Filter, Download, Settings, BarChart3, UserPlus, Edit, Trash2, TrendingUp } from "lucide-react";
import CreateCustomerCareForm from "@/components/CreateCustomerCareForm";
import CreateAssigneeForm from "@/components/CreateAssigneeForm";
import EditCustomerCareDialog from "@/components/EditCustomerCareDialog";
import { DeleteCustomerDialog } from "@/components/DeleteCustomerDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const CustomerCare = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedSource, setSelectedSource] = useState("all");
  const [customers, setCustomers] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("customers");
  const { toast } = useToast();

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      
      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (customersError) {
        console.error('Error fetching customers:', customersError);
        toast({
          title: "Lỗi",
          description: "Không thể tải danh sách khách hàng",
          variant: "destructive",
        });
        return;
      }

      // Fetch assignees using raw query to bypass type restrictions
      const { data: assigneesData, error: assigneesError } = await supabase
        .from('assignees' as any)
        .select('id, name');

      if (!assigneesError && assigneesData) {
        setAssignees(assigneesData);
      } else {
        console.log('Could not fetch assignees:', assigneesError);
        setAssignees([]);
      }

      setCustomers(customersData || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleCustomerAdded = () => {
    fetchCustomers(); // Refresh the list when a new customer is added
  };

  const handleEditCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setEditDialogOpen(true);
  };

  const handleDeleteCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setDeleteDialogOpen(true);
  };

  const handleEditSubmit = () => {
    setEditDialogOpen(false);
    setSelectedCustomer(null);
    fetchCustomers(); // Refresh the list
    toast({
      title: "Thành công",
      description: "Đã cập nhật thông tin khách hàng",
    });
  };

  const handleDeleteConfirm = () => {
    setDeleteDialogOpen(false);
    setSelectedCustomer(null);
    fetchCustomers(); // Refresh the list
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

              {/* Total customers */}
              <p className="text-sm text-muted-foreground">
                Tổng: <span className="font-medium">{customers.length} khách hàng</span>
              </p>

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
                        <input type="checkbox" className="rounded" />
                      </TableHead>
                      <TableHead>Khách Hàng</TableHead>
                      <TableHead>Phụ Trách</TableHead>
                      <TableHead>Nguồn</TableHead>
                      <TableHead>Trạng Thái</TableHead>
                      <TableHead>Thời Gian</TableHead>
                      <TableHead>Ngày Cập Nhật</TableHead>
                      <TableHead>Lịch Sử Mua</TableHead>
                      <TableHead>Tổng Đơn/Giá Trị</TableHead>
                      <TableHead>Ghi Chú</TableHead>
                      <TableHead>Trạng Thái Mua Hàng</TableHead>
                      <TableHead>Thao Tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-12">
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <span className="ml-2">Đang tải...</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : customers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-12">
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
                       customers
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
                            <input type="checkbox" className="rounded" />
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{customer.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {customer.email || "Chưa có email"}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {customer.phone || "Chưa có SĐT"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const assignee = assignees.find(a => a.id === customer.manager_id);
                              return assignee ? (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                  {assignee.name}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                  Chưa phân công
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
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
                          </TableCell>
                          <TableCell>
                            <Badge variant="default">
                              {customer.current_status === 'waiting-payment' && 'Chờ thanh toán tiền'}
                              {customer.current_status === 'waiting-deposit' && 'Chờ thanh toán cọc'}
                              {customer.current_status === 'sent-sample' && 'Đã gửi mẫu'}
                              {customer.current_status === 'sent-quote' && 'Đã gửi báo giá'}
                              {customer.current_status === 'waiting-response' && 'Chờ phản hồi khách hàng'}
                              {customer.current_status === 'ordered' && 'Đã đặt hàng'}
                              {customer.current_status === 'paid' && 'Đã thanh toán xong'}
                              {customer.current_status === 'see-notes' && 'Xem ở ghi chú'}
                              {customer.current_status === 'no-response' && 'Khách không phản hồi'}
                              {!customer.current_status && 'Chờ thanh toán tiền'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(customer.created_at), 'dd/MM/yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(customer.updated_at), 'dd/MM/yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            {customer.auto_tags && customer.auto_tags.length > 0 ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {customer.auto_tags[0]}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                                Liên hệ lần đầu
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-center">
                              <Badge variant="secondary">
                                {customer.purchase_count > 0 ? `${customer.purchase_count} đơn` : "0 đơn"}
                              </Badge>
                              {customer.total_spent > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(customer.total_spent)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {customer.notes || "Không có ghi chú"}
                          </TableCell>
                          <TableCell>
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
                <div className="text-2xl font-bold">{customers.length}</div>
                <p className="text-sm text-muted-foreground">Tổng khách hàng</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {customers.filter(c => {
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
                  {customers.filter(c => c.manager_id).length}
                </div>
                <p className="text-sm text-muted-foreground">Đã phân công</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {customers.filter(c => !c.manager_id).length}
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
                    const statusCounts = customers.reduce((acc, customer) => {
                      const status = customer.current_status || 'waiting-payment';
                      acc[status] = (acc[status] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>);

                    const statusLabels = {
                      'waiting-payment': 'Chờ thanh toán tiền',
                      'waiting-deposit': 'Chờ thanh toán cọc',
                      'sample-sent': 'Đã gửi mẫu',
                      'quote-sent': 'Đã gửi báo giá',
                      'waiting-response': 'Chờ phản hồi khách hàng',
                      'ordered': 'Đã đặt hàng',
                      'paid': 'Đã thanh toán xong',
                      'check-notes': 'Xem ở ghi chú',
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
                      'sample-sent': 'bg-blue-500',
                      'quote-sent': 'bg-purple-500',
                      'waiting-response': 'bg-indigo-500',
                      'ordered': 'bg-green-500',
                      'paid': 'bg-emerald-500',
                      'check-notes': 'bg-gray-500',
                      'no-response': 'bg-red-500',
                      // Fallback cho các trạng thái cũ
                      'contacted': 'bg-blue-500',
                      'negotiating': 'bg-purple-500',
                      'closed-deal': 'bg-green-500',
                      'lost': 'bg-red-500',
                      'follow-up': 'bg-orange-500',
                    };

                    const total = customers.length;

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
                    const assigneeCounts = customers.reduce((acc, customer) => {
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

                    const total = customers.length;

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
                  const statusCounts = customers.reduce((acc, customer) => {
                    const status = customer.current_status || 'waiting-payment';
                    acc[status] = (acc[status] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);

                  const statusDetails = [
                    { key: 'waiting-payment', label: 'Chờ thanh toán tiền', color: 'border-yellow-200 bg-yellow-50', icon: '💰' },
                    { key: 'waiting-deposit', label: 'Chờ thanh toán cọc', color: 'border-orange-200 bg-orange-50', icon: '💸' },
                    { key: 'sample-sent', label: 'Đã gửi mẫu', color: 'border-blue-200 bg-blue-50', icon: '📦' },
                    { key: 'quote-sent', label: 'Đã gửi báo giá', color: 'border-purple-200 bg-purple-50', icon: '📄' },
                    { key: 'waiting-response', label: 'Chờ phản hồi khách hàng', color: 'border-indigo-200 bg-indigo-50', icon: '⏳' },
                    { key: 'ordered', label: 'Đã đặt hàng', color: 'border-green-200 bg-green-50', icon: '✅' },
                    { key: 'paid', label: 'Đã thanh toán xong', color: 'border-emerald-200 bg-emerald-50', icon: '💯' },
                    { key: 'check-notes', label: 'Xem ở ghi chú', color: 'border-gray-200 bg-gray-50', icon: '📝' },
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
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">Tự động phân loại khách hàng</h3>
                  <p className="text-muted-foreground mb-4">
                    Sử dụng AI để tự động phân loại và gán điểm cho khách hàng mới
                  </p>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="auto-classify" className="rounded" />
                    <label htmlFor="auto-classify">Bật tự động phân loại</label>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Gợi ý tương tác</h3>
                  <p className="text-muted-foreground mb-4">
                    AI sẽ gợi ý thời điểm và cách thức tương tác tối ưu với khách hàng
                  </p>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="interaction-suggestions" className="rounded" />
                    <label htmlFor="interaction-suggestions">Bật gợi ý tương tác</label>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Phân tích cảm xúc</h3>
                  <p className="text-muted-foreground mb-4">
                    Phân tích cảm xúc từ tin nhắn và cuộc gọi để hiểu rõ hơn về khách hàng
                  </p>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="sentiment-analysis" className="rounded" />
                    <label htmlFor="sentiment-analysis">Bật phân tích cảm xúc</label>
                  </div>
                </div>
              </div>
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
    </div>
  );
};

export default CustomerCare;