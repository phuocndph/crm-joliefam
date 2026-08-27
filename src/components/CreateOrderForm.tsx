import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Minus, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  category: string | null;
  specifications: string | null;
}

interface OrderItem {
  product: Product;
  quantity: number;
  price: number;
  cost_price: number;
  total: number;
  total_cost: number;
}

interface CreateOrderFormProps {
  onClose: () => void;
  onSubmit: () => void;
}

export function CreateOrderForm({ onClose, onSubmit }: CreateOrderFormProps) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [includeVAT, setIncludeVAT] = useState(false);
  const [vatRate, setVatRate] = useState(8);
  const [notes, setNotes] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoadingData(true);
      
      // Load customers
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id, name, email, company')
        .order('name');
      
      if (customersError) throw customersError;
      setCustomers(customersData || []);

      // Load products
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, price, cost_price, category, specifications')
        .order('name');
      
      if (productsError) throw productsError;
      setProducts(productsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Lỗi",
        description: "Không thể tải dữ liệu",
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const addProduct = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = orderItems.find(item => item.product.id === productId);
    if (existingItem) {
      updateQuantity(productId, existingItem.quantity + 1);
    } else {
      const newItem: OrderItem = {
        product,
        quantity: 1,
        price: product.price || 0,
        cost_price: product.cost_price || 0,
        total: product.price || 0,
        total_cost: product.cost_price || 0,
      };
      setOrderItems([...orderItems, newItem]);
    }
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeProduct(productId);
      return;
    }

    setOrderItems(items =>
      items.map(item =>
        item.product.id === productId
          ? { 
              ...item, 
              quantity: newQuantity, 
              total: item.price * newQuantity,
              total_cost: item.cost_price * newQuantity
            }
          : item
      )
    );
  };

  const updatePrice = (productId: string, newPrice: number) => {
    setOrderItems(items =>
      items.map(item =>
        item.product.id === productId
          ? { 
              ...item, 
              price: newPrice, 
              total: newPrice * item.quantity,
              total_cost: item.cost_price * item.quantity
            }
          : item
      )
    );
  };

  const calculateCostPrice = () => {
    return orderItems.reduce((sum, item) => sum + item.total_cost, 0);
  };

  const removeProduct = (productId: string) => {
    setOrderItems(items => items.filter(item => item.product.id !== productId));
  };

  const calculateSubtotal = () => {
    return orderItems.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const vatAmount = includeVAT ? (subtotal * vatRate) / 100 : 0;
    return subtotal + vatAmount;
  };

  const generateOrderNumber = () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substr(2, 4).toUpperCase();
    return `DH${dateStr}${randomStr}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (orderItems.length === 0) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn ít nhất một sản phẩm",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const defaultDeliveryDate = new Date();
      defaultDeliveryDate.setDate(defaultDeliveryDate.getDate() + 6);
      
      const orderData = {
        order_number: generateOrderNumber(),
        customer_id: selectedCustomer || null,
        total_amount: calculateTotal(),
        cost_price: calculateCostPrice(),
        status: 'pending',
        notes: notes.trim() || null,
        items: JSON.stringify(orderItems),
        tenant_id: "default",
        manager_id: user?.id || null,
        delivery_date: defaultDeliveryDate.toISOString(),
      };

      const { error } = await supabase
        .from("orders")
        .insert([orderData]);

      if (error) throw error;

      // Preserve the financial snapshot for reports when the additive
      // migration is installed. Keep this best-effort so older deployments
      // without the new columns can continue creating orders normally.
      const subtotal = calculateSubtotal();
      const snapshotUpdate = await supabase
        .from("orders")
        .update({
          subtotal,
          vat_amount: includeVAT ? (subtotal * vatRate) / 100 : 0,
          vat_rate: vatRate,
          include_vat: includeVAT,
          cost_price_source: "historical",
          cost_price_is_estimated: false,
        })
        .eq("order_number", orderData.order_number);
      if (snapshotUpdate.error) {
        console.warn("Financial snapshot columns are not available yet:", snapshotUpdate.error.message);
      }

      onSubmit();
    } catch (error) {
      console.error("Error creating order:", error);
      toast({
        title: "Lỗi",
        description: "Không thể tạo đơn hàng",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        <span className="ml-2">Đang tải dữ liệu...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Customer Selection */}
      <div className="space-y-2">
        <Label htmlFor="customer">Khách hàng</Label>
        <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
          <SelectTrigger>
            <SelectValue placeholder="Chọn khách hàng (tùy chọn)" />
          </SelectTrigger>
          <SelectContent className="bg-white z-50">
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                <div className="flex flex-col">
                  <span>{customer.name}</span>
                  {customer.company && (
                    <span className="text-sm text-gray-500">{customer.company}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Product Selection */}
      <div className="space-y-2">
        <Label>Chọn sản phẩm</Label>
        <Select onValueChange={addProduct}>
          <SelectTrigger>
            <SelectValue placeholder="Chọn sản phẩm để thêm vào đơn hàng" />
          </SelectTrigger>
          <SelectContent className="bg-white z-50">
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                <div className="flex justify-between items-center w-full">
                  <span>{product.name}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    {product.price?.toLocaleString()} ₫
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Order Items Table */}
      {orderItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sản phẩm trong đơn hàng</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Số lượng</TableHead>
                  <TableHead>Đơn giá</TableHead>
                  <TableHead>Thành tiền</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderItems.map((item) => (
                  <TableRow key={item.product.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.product.name}</div>
                        {item.product.category && (
                          <Badge variant="secondary" className="text-xs">
                            {item.product.category}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-12 text-center">{item.quantity}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.price}
                        onChange={(e) => updatePrice(item.product.id, Number(e.target.value))}
                        className="w-24"
                        min="0"
                        step="1000"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.total.toLocaleString()} ₫
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeProduct(item.product.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {/* VAT Settings */}
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="includeVAT" 
                  checked={includeVAT} 
                  onCheckedChange={(checked) => setIncludeVAT(checked === true)}
                />
                <Label htmlFor="includeVAT">Bao gồm VAT</Label>
              </div>
              
              {includeVAT && (
                <div className="flex items-center space-x-2">
                  <Label htmlFor="vatRate">Thuế VAT (%):</Label>
                  <Input
                    id="vatRate"
                    type="number"
                    value={vatRate}
                    onChange={(e) => setVatRate(Number(e.target.value))}
                    className="w-20"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                </div>
              )}
            </div>

            {/* Total */}
            <div className="flex justify-end mt-4 pt-4 border-t">
              <div className="text-right space-y-1">
                <div className="text-sm text-muted-foreground">
                  Tổng chưa VAT: {calculateSubtotal().toLocaleString()} ₫
                </div>
                {includeVAT && (
                  <div className="text-sm text-muted-foreground">
                    VAT ({vatRate}%): {(calculateSubtotal() * vatRate / 100).toLocaleString()} ₫
                  </div>
                )}
                <div className="text-lg font-semibold">
                  Tổng cộng: {calculateTotal().toLocaleString()} ₫
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Ghi chú</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ghi chú về đơn hàng..."
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Hủy
        </Button>
        <Button type="submit" disabled={loading || orderItems.length === 0}>
          {loading ? "Đang tạo..." : "Tạo đơn hàng"}
        </Button>
      </div>
    </form>
  );
}
