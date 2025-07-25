import React, { useState, useEffect } from "react";
import { Search, Plus, FileText, Eye, Edit, Trash2, Filter, MoreHorizontal, Users, UserCheck, Building2, Calendar, Phone, MapPin, ShoppingCart, DollarSign, Clock, Star, ArrowRight, ExternalLink, CreditCard } from "lucide-react";
import { CreatePaymentForm } from "@/components/CreatePaymentForm";
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
import { getOrderDisplayNumber } from "@/lib/orderUtils";

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
  // Thêm fields cho group data
  grouped_ids?: string[];
  order_count?: number;
  quote_count?: number;
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

interface CustomerQuote {
  id: string;
  quote_number: string;
  total_amount: number;
  status: string;
  created_at: string;
  notes: string;
}

// Component wrapper để tính toán payment info
function PaymentWrapper({ order, onClose, onSubmit }: { order: any, onClose: () => void, onSubmit: () => void }) {
  const [paymentInfo, setPaymentInfo] = useState<{totalPaid: number, remainingAmount: number} | null>(null);
  
  useEffect(() => {
    const fetchPaymentInfo = async () => {
      try {
        const { data } = await supabase
          .from('order_payments')
          .select('payment_amount')
          .eq('order_id', order.id);
        
        const totalPaid = data?.reduce((sum, payment) => sum + (payment.payment_amount || 0), 0) || 0;
        const remainingAmount = (order.total_amount || 0) - totalPaid;
        
        setPaymentInfo({ totalPaid, remainingAmount });
      } catch (error) {
        console.error('Error fetching payment info:', error);
        setPaymentInfo({ totalPaid: 0, remainingAmount: order.total_amount || 0 });
      }
    };
    
    fetchPaymentInfo();
  }, [order.id, order.total_amount]);
  
  if (!paymentInfo) {
    return <div className="text-center py-4">Đang tải thông tin thanh toán...</div>;
  }
  
  return (
    <CreatePaymentForm
      orderId={order.id}
      orderNumber={getOrderDisplayNumber(order)}
      totalAmount={order.total_amount || 0}
      totalPaid={paymentInfo.totalPaid}
      remainingAmount={paymentInfo.remainingAmount}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
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
  const [customerQuotes, setCustomerQuotes] = useState<CustomerQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);
  const [orderToPayment, setOrderToPayment] = useState<any>(null);
  const { toast } = useToast();

  // Group customers by name and aggregate data
  const groupedCustomers = React.useMemo(() => {
    const grouped = customers.reduce((acc, customer) => {
      const key = customer.name.trim().toLowerCase();
      if (!acc[key]) {
        acc[key] = {
          ...customer,
          grouped_ids: [customer.id],
          order_count: customer.purchase_count,
          quote_count: 0,
        };
      } else {
        // Merge data for same name customers
        acc[key].grouped_ids!.push(customer.id);
        acc[key].purchase_count += customer.purchase_count;
        acc[key].total_spent += customer.total_spent;
        acc[key].order_count! += customer.purchase_count;
        
        // Use latest customer data for other fields
        if (new Date(customer.created_at) > new Date(acc[key].created_at)) {
          acc[key].customer_code = customer.customer_code;
          acc[key].email = customer.email;
          acc[key].phone = customer.phone;
          acc[key].address = customer.address;
          acc[key].company = customer.company;
          acc[key].phones = customer.phones;
          acc[key].addresses = customer.addresses;
        }
        
        // Merge tags
        const allTags = [...(acc[key].tags || []), ...(customer.tags || [])];
        const allAutoTags = [...(acc[key].auto_tags || []), ...(customer.auto_tags || [])];
        acc[key].tags = [...new Set(allTags)];
        acc[key].auto_tags = [...new Set(allAutoTags)];
        
        // Latest purchase date
        if (customer.last_purchase_date && 
            (!acc[key].last_purchase_date || 
             new Date(customer.last_purchase_date) > new Date(acc[key].last_purchase_date))) {
          acc[key].last_purchase_date = customer.last_purchase_date;
        }
      }
      return acc;
    }, {} as Record<string, Customer>);
    
    return Object.values(grouped);
  }, [customers]);

  const filteredCustomers = groupedCustomers.filter((customer) => {
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
      
      // Load customers và orders để tính toán tổng hợp
      const [customersResult, ordersResult, quotesResult] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('orders')
          .select('customer_id, total_amount, status, created_at, payment_date')
          .neq('status', 'cancelled'),
        supabase
          .from('quotes')
          .select('id, quote_number, total_amount, status, created_at, notes')
          .order('created_at', { ascending: false })
      ]);

      if (customersResult.error) throw customersResult.error;
      if (ordersResult.error) throw ordersResult.error;
      if (quotesResult.error) throw quotesResult.error;
      
      console.log('Orders data:', ordersResult.data); // Debug log
      console.log('Customers data:', customersResult.data); // Debug log
      
      // Calculate order statistics for each customer
      const ordersByCustomer = (ordersResult.data || []).reduce((acc, order) => {
        if (!order.customer_id) return acc;
        if (!acc[order.customer_id]) {
          acc[order.customer_id] = {
            count: 0,
            totalSpent: 0,
            lastPurchase: null
          };
        }
        acc[order.customer_id].count += 1;
        acc[order.customer_id].totalSpent += order.total_amount || 0;
        
        const orderDate = new Date(order.payment_date || order.created_at);
        if (!acc[order.customer_id].lastPurchase || orderDate > new Date(acc[order.customer_id].lastPurchase)) {
          acc[order.customer_id].lastPurchase = order.payment_date || order.created_at;
        }
        
        return acc;
      }, {} as Record<string, { count: number; totalSpent: number; lastPurchase: string | null }>);
      
      console.log('Orders by customer:', ordersByCustomer); // Debug log
      
      // Parse JSON fields and ensure proper structure
      const formattedCustomers = customersResult.data?.map(customer => {
        const phonesParsed = Array.isArray(customer.phones) ? customer.phones as unknown as CustomerPhone[] : [];
        const addressesParsed = Array.isArray(customer.addresses) ? customer.addresses as unknown as CustomerAddress[] : [];
        const tagsParsed = Array.isArray(customer.tags) ? customer.tags as string[] : [];
        const autoTagsParsed = Array.isArray(customer.auto_tags) ? customer.auto_tags as string[] : [];
        
        // Get order statistics for this customer
        const orderStats = ordersByCustomer[customer.id] || { count: 0, totalSpent: 0, lastPurchase: null };
        
        // Count quotes for this customer name
        const customerQuotes = quotesResult.data?.filter(quote => {
          if (!quote.notes) return false;
          const customerMatch = quote.notes.match(/Khách hàng:\s*(.+)/);
          return customerMatch && customerMatch[1].trim().toLowerCase() === customer.name.toLowerCase();
        }) || [];
        
        // Update customer with calculated stats
        const updatedCustomer = {
          ...customer,
          phones: phonesParsed,
          addresses: addressesParsed,
          tags: tagsParsed,
          auto_tags: autoTagsParsed,
          purchase_count: Math.max(orderStats.count, customer.purchase_count || 0),
          total_spent: Math.max(orderStats.totalSpent, customer.total_spent || 0),
          last_purchase_date: orderStats.lastPurchase || customer.last_purchase_date,
          quote_count: customerQuotes.length,
        } as Customer;
        
        console.log(`Customer ${customer.name}:`, {
          id: customer.id,
          orderStats,
          finalStats: {
            purchase_count: updatedCustomer.purchase_count,
            total_spent: updatedCustomer.total_spent,
            last_purchase_date: updatedCustomer.last_purchase_date
          }
        }); // Debug log
        
        return updatedCustomer;
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

  const loadCustomerDetails = async (customer: Customer) => {
    try {
      setOrdersLoading(true);
      
      // Load orders và quotes cho customer này và tất cả customers cùng tên
      const customerIds = customer.grouped_ids || [customer.id];
      const customerName = customer.name.trim();
      
      const [ordersResult, quotesResult] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, total_amount, status, payment_status, created_at, delivery_date, payment_date')
          .in('customer_id', customerIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('quotes')
          .select('id, quote_number, total_amount, status, created_at, notes')
          .order('created_at', { ascending: false })
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (quotesResult.error) throw quotesResult.error;
      
      // Filter quotes by customer name from notes
      const customerQuotes = quotesResult.data?.filter(quote => {
        if (!quote.notes) return false;
        const customerMatch = quote.notes.match(/Khách hàng:\s*(.+)/);
        return customerMatch && customerMatch[1].trim().toLowerCase() === customerName.toLowerCase();
      }) || [];
      
      setCustomerOrders(ordersResult.data || []);
      setCustomerQuotes(customerQuotes);
    } catch (error) {
      console.error('Error loading customer details:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải chi tiết khách hàng",
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
      loadCustomerDetails(selectedCustomer);
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

  const handlePaymentAdded = () => {
    toast({
      title: "Thành công",
      description: "Thanh toán đã được thêm thành công",
    });
    setOrderToPayment(null);
    // Reload customer details if there's a selected customer
    if (selectedCustomer) {
      loadCustomerDetails(selectedCustomer);
    }
  };

  const calculateRemainingAmount = async (orderId: string, totalAmount: number) => {
    try {
      const { data } = await supabase
        .from('order_payments')
        .select('payment_amount')
        .eq('order_id', orderId);
      
      const totalPaid = data?.reduce((sum, payment) => sum + (payment.payment_amount || 0), 0) || 0;
      return totalAmount - totalPaid;
    } catch {
      return totalAmount;
    }
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

  // Calculate stats với grouped customers
  const stats = [
    {
      title: "Tổng khách hàng",
      value: groupedCustomers.length,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Khách hàng VIP (KHTT)",
      value: groupedCustomers.filter(c => c.auto_tags?.includes("KHTT")).length,
      icon: Star,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "Tổng doanh thu",
      value: `${groupedCustomers.reduce((sum, c) => sum + c.total_spent, 0).toLocaleString("vi-VN")} VNĐ`,
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "Khách hàng mới (tháng này)",
      value: groupedCustomers.filter(c => {
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
                    <TableCell colSpan={8} className="text-center py-8">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : sortedCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
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
                       <TableCell>
                        <div className="space-y-1">
                          {(customer.purchase_count || 0) > 0 ? (
                            <>
                              <div className="text-sm font-medium text-green-600">
                                Đã mua {customer.purchase_count || 0} lần
                              </div>
                              {customer.last_purchase_date && (
                                <div className="text-xs text-muted-foreground">
                                  {getMonthsSinceLastPurchase(customer.last_purchase_date) || 0} tháng trước
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground">Chưa mua</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={(customer.purchase_count || 0) > 0 ? "default" : "secondary"}>
                          {customer.purchase_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {(customer.total_spent || 0).toLocaleString("vi-VN")} VNĐ
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
                             <div className="space-y-2 flex-1">
                               <div className="font-medium">
                                 Đơn hàng #{getOrderDisplayNumber(order)}
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
                             <div className="text-right space-y-2">
                               <div className="text-lg font-bold">
                                 {order.total_amount.toLocaleString("vi-VN")} VNĐ
                               </div>
                               {order.payment_date && (
                                 <div className="text-sm text-muted-foreground">
                                   TT: {format(new Date(order.payment_date), "dd/MM/yyyy", { locale: vi })}
                                 </div>
                               )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    // Load order details
                                    const { data, error } = await supabase
                                      .from('orders')
                                      .select('*')
                                      .eq('id', order.id)
                                      .single();
                                    
                                    if (!error && data) {
                                      setSelectedOrderDetail(data);
                                    }
                                  }}
                                  className="gap-2"
                                >
                                  <Eye className="h-3 w-3" />
                                  Xem chi tiết
                                </Button>
                             </div>
                           </div>
                         </div>
                       ))}
                     </div>
                  )}
                </CardContent>
              </Card>

              {/* Quotes List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Lịch sử báo giá ({customerQuotes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {ordersLoading ? (
                    <div className="text-center py-8">Đang tải báo giá...</div>
                  ) : customerQuotes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Khách hàng chưa có báo giá nào
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {customerQuotes.map((quote) => (
                        <div key={quote.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <div className="font-medium">
                                Báo giá #{quote.quote_number}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Ngày tạo: {format(new Date(quote.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                              </div>
                              <Badge variant={quote.status === 'approved' ? 'default' : 'secondary'}>
                                {quote.status === 'draft' ? 'Nháp' :
                                 quote.status === 'sent' ? 'Đã gửi' :
                                 quote.status === 'approved' ? 'Đã duyệt' :
                                 quote.status === 'rejected' ? 'Từ chối' : quote.status}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold">
                                {(quote.total_amount || 0).toLocaleString("vi-VN")} VNĐ
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

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrderDetail} onOpenChange={(open) => !open && setSelectedOrderDetail(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết đơn hàng</DialogTitle>
            <DialogDescription>
              Thông tin chi tiết đơn hàng #{selectedOrderDetail ? getOrderDisplayNumber(selectedOrderDetail) : ''}
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrderDetail && (
            <div className="space-y-6">
              {/* Order Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Thông tin đơn hàng</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Mã đơn hàng:</label>
                      <p className="text-sm text-muted-foreground">{getOrderDisplayNumber(selectedOrderDetail)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Trạng thái:</label>
                      <Badge className="ml-2">
                        {selectedOrderDetail.status === 'pending' ? 'Chờ xử lý' :
                         selectedOrderDetail.status === 'processing' ? 'Đang xử lý' :
                         selectedOrderDetail.status === 'shipped' ? 'Đã giao' :
                         selectedOrderDetail.status === 'delivered' ? 'Hoàn thành' :
                         selectedOrderDetail.status === 'cancelled' ? 'Đã hủy' : selectedOrderDetail.status}
                      </Badge>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Thanh toán:</label>
                      <Badge className="ml-2">
                        {selectedOrderDetail.payment_status === 'pending' ? 'Chưa thanh toán' :
                         selectedOrderDetail.payment_status === 'paid' ? 'Đã thanh toán' :
                         selectedOrderDetail.payment_status === 'partial' ? 'Thanh toán 1 phần' : selectedOrderDetail.payment_status}
                      </Badge>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Ngày tạo:</label>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(selectedOrderDetail.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Products Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Sản phẩm</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">STT</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Tên sản phẩm</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">SKU</th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">Số lượng</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-gray-900">Đơn giá</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-gray-900">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(() => {
                          let itemsToDisplay = selectedOrderDetail.items;
                          
                          if (typeof selectedOrderDetail.items === 'string') {
                            try {
                              itemsToDisplay = JSON.parse(selectedOrderDetail.items);
                            } catch (error) {
                              return (
                                <tr>
                                  <td colSpan={6} className="px-4 py-8 text-center text-red-500">
                                    Lỗi định dạng dữ liệu sản phẩm
                                  </td>
                                </tr>
                              );
                            }
                          }
                          
                          if (Array.isArray(itemsToDisplay) && itemsToDisplay.length > 0) {
                            return itemsToDisplay.map((item: any, index: number) => (
                              <tr key={index} className="border-b last:border-b-0">
                                <td className="px-4 py-3 text-center">{index + 1}</td>
                                <td className="px-4 py-3 font-medium">{item.name || `Sản phẩm ${index + 1}`}</td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">{item.sku || '-'}</td>
                                <td className="px-4 py-3 text-center">{item.quantity || 1}</td>
                                <td className="px-4 py-3 text-right">{(item.price || 0).toLocaleString("vi-VN")} VNĐ</td>
                                <td className="px-4 py-3 text-right font-medium">
                                  {((item.quantity || 1) * (item.price || 0)).toLocaleString("vi-VN")} VNĐ
                                </td>
                              </tr>
                            ));
                          }
                          
                          return (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                                Không có thông tin sản phẩm
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Summary */}
              <Card>
                <CardContent className="p-6">
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-medium text-center">Tổng kết tài chính</h4>
                      <Button 
                        onClick={() => setOrderToPayment(selectedOrderDetail)}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <CreditCard className="h-4 w-4" />
                        Thêm thanh toán
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center py-2 border-b border-red-200">
                        <span className="font-medium">TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT:</span>
                        <span className="font-bold text-lg">
                          {(selectedOrderDetail.total_amount || 0).toLocaleString("vi-VN")} VNĐ
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-red-200">
                        <span className="font-medium">GTGT (0%):</span>
                        <span className="font-bold text-lg">0 VNĐ</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-red-200">
                        <span className="font-medium">TỔNG TIỀN ĐÃ BAO GỒM GTGT:</span>
                        <span className="font-bold text-lg text-red-600">
                          {(selectedOrderDetail.total_amount || 0).toLocaleString("vi-VN")} VNĐ
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!orderToPayment} onOpenChange={(open) => !open && setOrderToPayment(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Thêm thanh toán
            </DialogTitle>
            <DialogDescription className="text-base">
              Thêm thanh toán cho đơn hàng <span className="font-semibold text-primary">#{orderToPayment ? getOrderDisplayNumber(orderToPayment) : ''}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {orderToPayment && (
              <PaymentWrapper 
                order={orderToPayment}
                onClose={() => setOrderToPayment(null)}
                onSubmit={handlePaymentAdded}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}