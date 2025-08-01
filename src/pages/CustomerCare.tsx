import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search, Filter, Download, Settings, BarChart3, UserPlus, Edit, Trash2 } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const { toast } = useToast();

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching customers:', error);
        toast({
          title: "Lỗi",
          description: "Không thể tải danh sách khách hàng",
          variant: "destructive",
        });
        return;
      }

      setCustomers(data || []);
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
      <Tabs defaultValue="customers" className="w-full">
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
                    <SelectValue placeholder="Tất cả trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="new">Mới</SelectItem>
                    <SelectItem value="contacted">Đã liên hệ</SelectItem>
                    <SelectItem value="qualified">Đủ điều kiện</SelectItem>
                    <SelectItem value="proposal">Đề xuất</SelectItem>
                    <SelectItem value="negotiation">Đàm phán</SelectItem>
                    <SelectItem value="closed-won">Thành công</SelectItem>
                    <SelectItem value="closed-lost">Thất bại</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="website">Website</SelectItem>
                    <SelectItem value="social">Mạng xã hội</SelectItem>
                    <SelectItem value="referral">Giới thiệu</SelectItem>
                    <SelectItem value="ads">Quảng cáo</SelectItem>
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
                      <TableHead>Theo Dõi</TableHead>
                      <TableHead>Điểm</TableHead>
                      <TableHead>Ghi Chú</TableHead>
                      <TableHead>Hành Động</TableHead>
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
                      customers.map((customer, index) => (
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
                            <Badge variant="outline">
                              {customer.manager_id ? "Đã phân công" : "Chưa phân công"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {customer.tags && customer.tags.length > 0 ? customer.tags[0] : "Chưa xác định"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="default">
                              Mới
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(customer.created_at), 'dd/MM/yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(customer.updated_at), 'dd/MM/yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              Theo dõi
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-center">
                              <Badge variant="secondary">
                                -/5
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {customer.notes || "Không có ghi chú"}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-muted-foreground">
                              Chưa có hành động
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Thống Kê Chăm Sóc Khách Hàng
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                    <div className="text-2xl font-bold">0%</div>
                    <p className="text-sm text-muted-foreground">Tỷ lệ chuyển đổi</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-sm text-muted-foreground">Tương tác trung bình</p>
                  </CardContent>
                </Card>
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