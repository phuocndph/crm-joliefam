import React, { useState, useEffect } from "react";
import { Search, Plus, FileText, Eye, Edit, Trash2, Filter, MoreHorizontal, Users, UserCheck, Building2, Calendar, Phone, MapPin, ShoppingCart, DollarSign, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateCustomerForm } from "@/components/CreateCustomerForm";
import { EditCustomerDialog } from "@/components/EditCustomerDialog";
import { DeleteCustomerDialog } from "@/components/DeleteCustomerDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

interface CustomerPhone {
  number: string;
  label: string;
  isPrimary: boolean;
}

interface CustomerAddress {
  address: string;
  label: string;
  isPrimary: boolean;
}

interface Customer {
  id: string;
  customer_code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  phones: CustomerPhone[];
  addresses: CustomerAddress[];
  company: string | null;
  notes: string | null;
  tags: string[] | null;
  auto_tags: string[] | null;
  purchase_count: number;
  last_purchase_date: string | null;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

interface CustomerOrder {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
  delivery_date: string | null;
  payment_date: string | null;
}

export default function CustomerManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [filterTag, setFilterTag] = useState("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const { toast } = useToast();

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch = 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.customer_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone?.includes(searchTerm) ||
      customer.phones?.some(p => p.number.includes(searchTerm));

    const matchesFilter = filterTag === "all" || 
      customer.auto_tags?.includes(filterTag) || 
      customer.tags?.includes(filterTag);

    return matchesSearch && matchesFilter;
  });

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    switch (sortBy) {
      case "customer_code":
        return (a.customer_code || "").localeCompare(b.customer_code || "");
      case "name":
        return a.name.localeCompare(b.name);
      case "purchase_count":
        return b.purchase_count - a.purchase_count;
      case "total_spent":
        return b.total_spent - a.total_spent;
      case "last_purchase":
        return new Date(b.last_purchase_date || 0).getTime() - new Date(a.last_purchase_date || 0).getTime();
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Parse JSON fields and ensure proper structure
      const formattedCustomers = data?.map(customer => {
        const phonesParsed = Array.isArray(customer.phones) ? customer.phones as unknown as CustomerPhone[] : [];
        const addressesParsed = Array.isArray(customer.addresses) ? customer.addresses as unknown as CustomerAddress[] : [];
        const tagsParsed = Array.isArray(customer.tags) ? customer.tags as string[] : [];
        const autoTagsParsed = Array.isArray(customer.auto_tags) ? customer.auto_tags as string[] : [];
        
        return {
          ...customer,
          phones: phonesParsed,
          addresses: addressesParsed,
          tags: tagsParsed,
          auto_tags: autoTagsParsed,
          purchase_count: customer.purchase_count || 0,
          total_spent: customer.total_spent || 0,
        } as Customer;
      }) || [];
      
      setCustomers(formattedCustomers);
    } catch (error) {
      console.error('Error loading customers:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách khách hàng",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCustomerOrders = async (customerId: string) => {
    try {
      setOrdersLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, status, payment_status, created_at, delivery_date, payment_date')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomerOrders(data || []);
    } catch (error) {
      console.error('Error loading customer orders:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải danh sách đơn hàng",
        variant: "destructive",
      });
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      loadCustomerOrders(selectedCustomer.id);
    }
  }, [selectedCustomer]);

  const handleCreateCustomer = () => {
    loadCustomers();
    setShowCreateForm(false);
    toast({
      title: "Thành công",
      description: "Khách hàng đã được tạo thành công",
    });
  };

  const handleEditCustomer = () => {
    loadCustomers();
    setCustomerToEdit(null);
    toast({
      title: "Thành công",
      description: "Thông tin khách hàng đã được cập nhật",
    });
  };

  const handleDeleteCustomer = () => {
    loadCustomers();
    setCustomerToDelete(null);
    toast({
      title: "Thành công",
      description: "Khách hàng đã được xóa thành công",
    });
  };

  const getCustomerTags = (customer: Customer) => {
    const allTags = [...(customer.auto_tags || []), ...(customer.tags || [])];
    return [...new Set(allTags)]; // Remove duplicates
  };

  const getTagColor = (tag: string) => {
    const tagColors: { [key: string]: string } = {
      "Đặt Mẫu": "bg-blue-100 text-blue-800",
      "Đã Mua": "bg-green-100 text-green-800",
      "Đã Mua lần 2": "bg-yellow-100 text-yellow-800",
      "Đã Mua lần 3": "bg-orange-100 text-orange-800",
      "KHTT": "bg-purple-100 text-purple-800",
    };
    return tagColors[tag] || "bg-gray-100 text-gray-800";
  };

  const getMonthsSinceLastPurchase = (lastPurchaseDate: string | null) => {
    if (!lastPurchaseDate) return null;
    const now = new Date();
    const lastPurchase = new Date(lastPurchaseDate);
    const diffInMonths = (now.getFullYear() - lastPurchase.getFullYear()) * 12 + 
                        (now.getMonth() - lastPurchase.getMonth());
    return diffInMonths;
  };

  // Calculate stats
  const stats = [
    {
      title: "Tổng khách hàng",
      value: customers.length,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Khách hàng VIP (KHTT)",
      value: customers.filter(c => c.auto_tags?.includes("KHTT")).length,
      icon: Star,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "Tổng doanh thu",
      value: `${customers.reduce((sum, c) => sum + c.total_spent, 0).toLocaleString("vi-VN")} VNĐ`,
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Khách hàng mới (tháng này)",
      value: customers.filter(c => {
        const createdDate = new Date(c.created_at);
        const now = new Date();
        return createdDate.getMonth() === now.getMonth() && createdDate.getFullYear() === now.getFullYear();
      }).length,
      icon: UserCheck,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
  ];

  const allTags = ["Đặt Mẫu", "Đã Mua", "Đã Mua lần 2", "Đã Mua lần 3", "KHTT"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý Khách hàng</h1>
          <p className="text-muted-foreground">
            Quản lý thông tin chi tiết và theo dõi lịch sử mua hàng của khách hàng
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Thêm khách hàng
        </Button>
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
                <div className={`p-3 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search, Filter and Sort */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách Khách hàng</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Tìm kiếm theo tên, mã KH, email, SĐT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Sắp xếp theo" />
                </SelectTrigger>
                <SelectContent className="bg-white z-50">
                  <SelectItem value="created_at">Ngày tạo mới nhất</SelectItem>
                  <SelectItem value="customer_code">Mã khách hàng</SelectItem>
                  <SelectItem value="name">Tên khách hàng</SelectItem>
                  <SelectItem value="purchase_count">Số lần mua</SelectItem>
                  <SelectItem value="total_spent">Tổng tiền</SelectItem>
                  <SelectItem value="last_purchase">Mua gần nhất</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterTag} onValueChange={setFilterTag}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Lọc theo tag" />
                </SelectTrigger>
                <SelectContent className="bg-white z-50">
                  <SelectItem value="all">Tất cả</SelectItem>
                  {allTags.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã KH</TableHead>
                  <TableHead>Tên khách hàng</TableHead>
                  <TableHead>Liên hệ</TableHead>
                  <TableHead>Công ty</TableHead>
                  <TableHead>Tình trạng</TableHead>
                  <TableHead>Số lần mua</TableHead>
                  <TableHead>Tổng tiền</TableHead>
                  <TableHead>Mua lần cuối</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : sortedCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {searchTerm ? "Không tìm thấy khách hàng nào" : "Chưa có khách hàng nào"}
                        </p>
                        {!searchTerm && (
                          <Button onClick={() => setShowCreateForm(true)} variant="outline" className="gap-2">
                            <Plus className="h-4 w-4" />
                            Thêm khách hàng đầu tiên
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">
                        {customer.customer_code || `KH-${customer.id.slice(0, 8)}`}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{customer.name}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {getCustomerTags(customer).map((tag, index) => (
                              <Badge key={index} className={`text-xs ${getTagColor(tag)}`}>
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {customer.phones?.length > 0 ? (
                            customer.phones.map((phone, index) => (
                              <div key={index} className="text-sm flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {phone.number} {phone.isPrimary && <span className="text-xs text-muted-foreground">(Chính)</span>}
                              </div>
                            ))
                          ) : customer.phone ? (
                            <div className="text-sm flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {customer.phone}
                            </div>
                          ) : null}
                          {customer.email && (
                            <div className="text-sm text-muted-foreground">{customer.email}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{customer.company || "-"}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {customer.purchase_count > 0 ? (
                            <>
                              <div className="text-sm font-medium text-green-600">
                                Đã mua {customer.purchase_count} lần
                              </div>
                              {customer.last_purchase_date && (
                                <div className="text-xs text-muted-foreground">
                                  {getMonthsSinceLastPurchase(customer.last_purchase_date)} tháng trước
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground">Chưa mua</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={customer.purchase_count > 0 ? "default" : "secondary"}>
                          {customer.purchase_count}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {customer.total_spent.toLocaleString("vi-VN")} VNĐ
                      </TableCell>
                      <TableCell>
                        {customer.last_purchase_date ? (
                          <div className="text-sm">
                            {format(new Date(customer.last_purchase_date), "dd/MM/yyyy", { locale: vi })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Mở menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white z-50">
                            <DropdownMenuItem
                              onClick={() => setSelectedCustomer(customer)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Xem chi tiết
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setCustomerToEdit(customer)}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setCustomerToDelete(customer)}
                              className="text-red-600"
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

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết khách hàng</DialogTitle>
            <DialogDescription>
              Thông tin và lịch sử mua hàng của {selectedCustomer?.name}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCustomer && (
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Thông tin cá nhân</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Mã khách hàng:</label>
                      <p className="text-sm text-muted-foreground">
                        {selectedCustomer.customer_code || `KH-${selectedCustomer.id.slice(0, 8)}`}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Số điện thoại:</label>
                      <div className="space-y-1">
                        {selectedCustomer.phones?.length > 0 ? (
                          selectedCustomer.phones.map((phone, index) => (
                            <div key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                              <Phone className="h-3 w-3" />
                              {phone.number} 
                              <Badge variant="outline" className="text-xs">
                                {phone.label} {phone.isPrimary && "(Chính)"}
                              </Badge>
                            </div>
                          ))
                        ) : selectedCustomer.phone ? (
                          <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">Chưa có</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Địa chỉ:</label>
                      <div className="space-y-1">
                        {selectedCustomer.addresses?.length > 0 ? (
                          selectedCustomer.addresses.map((addr, index) => (
                            <div key={index} className="text-sm text-muted-foreground">
                              <div className="flex items-start gap-2">
                                <MapPin className="h-3 w-3 mt-1" />
                                <div>
                                  <div>{addr.address}</div>
                                  <Badge variant="outline" className="text-xs mt-1">
                                    {addr.label} {addr.isPrimary && "(Chính)"}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : selectedCustomer.address ? (
                          <p className="text-sm text-muted-foreground">{selectedCustomer.address}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">Chưa có</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Email:</label>
                      <p className="text-sm text-muted-foreground">
                        {selectedCustomer.email || "Chưa có"}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Công ty:</label>
                      <p className="text-sm text-muted-foreground">
                        {selectedCustomer.company || "Chưa có"}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Thống kê mua hàng</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {selectedCustomer.purchase_count}
                        </div>
                        <div className="text-sm text-muted-foreground">Tổng đơn hàng</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {selectedCustomer.total_spent.toLocaleString("vi-VN")}
                        </div>
                        <div className="text-sm text-muted-foreground">Tổng tiền (VNĐ)</div>
                      </div>
                    </div>
                    {selectedCustomer.last_purchase_date && (
                      <div>
                        <label className="text-sm font-medium">Mua lần cuối:</label>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(selectedCustomer.last_purchase_date), "dd/MM/yyyy HH:mm", { locale: vi })}
                          <span className="ml-2 text-xs">
                            ({getMonthsSinceLastPurchase(selectedCustomer.last_purchase_date)} tháng trước)
                          </span>
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium">Phân loại khách hàng:</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {getCustomerTags(selectedCustomer).map((tag, index) => (
                          <Badge key={index} className={getTagColor(tag)}>
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Orders List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Lịch sử đơn hàng ({customerOrders.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {ordersLoading ? (
                    <div className="text-center py-8">Đang tải đơn hàng...</div>
                  ) : customerOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Khách hàng chưa có đơn hàng nào
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {customerOrders.map((order) => (
                        <div key={order.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <div className="font-medium">
                                Đơn hàng #{order.order_number}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Ngày tạo: {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                              </div>
                              {order.delivery_date && (
                                <div className="text-sm text-muted-foreground">
                                  Ngày giao: {format(new Date(order.delivery_date), "dd/MM/yyyy", { locale: vi })}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <Badge variant={order.status === 'delivered' ? 'default' : 'secondary'}>
                                  {order.status === 'pending' ? 'Chờ xử lý' :
                                   order.status === 'processing' ? 'Đang xử lý' :
                                   order.status === 'shipped' ? 'Đã giao' :
                                   order.status === 'delivered' ? 'Hoàn thành' :
                                   order.status === 'cancelled' ? 'Đã hủy' : order.status}
                                </Badge>
                                <Badge variant={order.payment_status === 'paid' ? 'default' : 'secondary'}>
                                  {order.payment_status === 'pending' ? 'Chưa thanh toán' :
                                   order.payment_status === 'paid' ? 'Đã thanh toán' :
                                   order.payment_status === 'partial' ? 'Thanh toán 1 phần' : order.payment_status}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold">
                                {order.total_amount.toLocaleString("vi-VN")} VNĐ
                              </div>
                              {order.payment_date && (
                                <div className="text-sm text-muted-foreground">
                                  TT: {format(new Date(order.payment_date), "dd/MM/yyyy", { locale: vi })}
                                </div>
                              )}
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

      {/* Create Customer Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-2xl">
          <CreateCustomerForm 
            onClose={() => setShowCreateForm(false)}
            onSubmit={handleCreateCustomer}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      {customerToEdit && (
        <EditCustomerDialog
          customer={customerToEdit}
          open={!!customerToEdit}
          onOpenChange={(open) => !open && setCustomerToEdit(null)}
          onSubmit={handleEditCustomer}
        />
      )}

      {/* Delete Customer Dialog */}
      {customerToDelete && (
        <DeleteCustomerDialog
          customer={customerToDelete}
          open={!!customerToDelete}
          onOpenChange={(open) => !open && setCustomerToDelete(null)}
          onConfirm={handleDeleteCustomer}
        />
      )}
    </div>
  );
}