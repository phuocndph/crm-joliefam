import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileDown, Printer, FileSpreadsheet, Search, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getTemplateSettings } from "./QuoteTemplateSettings";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface QuoteSupplementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: any;
  onUpdate?: () => void;
}

export function QuoteSupplementDialog({ open, onOpenChange, quote, onUpdate }: QuoteSupplementDialogProps) {
  const [templateSettings, setTemplateSettings] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && quote) {
      loadTemplateSettings();
      loadProductsData();
    }
  }, [open, quote]);

  const loadTemplateSettings = async () => {
    try {
      // Get template settings from QuoteTemplateSettings
      const settings = getTemplateSettings();
      setTemplateSettings(settings);
    } catch (error) {
      console.error('Error loading template settings:', error);
      // Fallback to default settings if error occurs
      setTemplateSettings(getTemplateSettings());
    }
  };

  const loadProductsData = async () => {
    try {
      // Parse quote items to get product IDs or SKUs
      let quoteItems = [];
      try {
        quoteItems = quote.items ? JSON.parse(quote.items) : [];
      } catch (error) {
        console.error('Error parsing quote items:', error);
        return;
      }

      if (quoteItems.length === 0) {
        setProducts([]);
        return;
      }

      // Extract unique product IDs (if available) or SKUs for matching
      const productIds = quoteItems
        .map((item: any) => item.id)
        .filter((id: any) => id);
      
      const productSkus = quoteItems
        .map((item: any) => item.sku)
        .filter((sku: any) => sku);

      let productsData = [];

      // Try to fetch by product IDs first
      if (productIds.length > 0) {
        const { data: idData, error: idError } = await supabase
          .from('products')
          .select('id, sku, cost_price, price_list_id')
          .in('id', productIds);

        if (!idError && idData && idData.length > 0) {
          productsData = idData;
        }
      }

      // If no data from IDs, try to fetch by SKUs
      if (productsData.length === 0 && productSkus.length > 0) {
        const { data: skuData, error: skuError } = await supabase
          .from('products')
          .select('id, sku, cost_price, price_list_id')
          .in('sku', productSkus);

        if (!skuError && skuData) {
          productsData = skuData;
        }
      }

      setProducts(productsData || []);
      console.log('Loaded products data:', productsData);
    } catch (error) {
      console.error('Error loading products data:', error);
      setProducts([]);
    }
  };

  if (!quote) return null;

  // Parse customer information
  const customerInfo = {
    name: quote.customerName || 'Không có tên',
    company: quote.customerCompany || '',
    address: quote.customerAddress || '',
    phone: quote.customerPhone || '',
    email: quote.customerEmail || '',
  };

  // Parse quote items
  let quoteItems = [];
  try {
    quoteItems = quote.items ? JSON.parse(quote.items) : [];
  } catch (error) {
    console.error('Error parsing quote items:', error);
    quoteItems = [];
  }

  // Filter items based on search term
  const filteredItems = quoteItems.filter((item: any) =>
    item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper function to get cost price from products data
  const getCostPrice = (item: any): number => {
    // Try to match by product ID first
    let product = products.find(p => p.id === item.id);
    
    // If not found, try to match by SKU
    if (!product && item.sku) {
      product = products.find(p => p.sku === item.sku);
    }
    
    return product?.cost_price || 0;
  };

  // Calculate totals with cost price and profit
  const calculations = filteredItems.reduce((acc: any, item: any) => {
    const quantity = item.quantity || 0;
    const price = item.price || 0;
    const costPrice = getCostPrice(item);
    
    const revenue = quantity * price;
    const totalCost = quantity * costPrice;
    const profit = revenue - totalCost;
    
    acc.totalRevenue += revenue;
    acc.totalCost += totalCost;
    acc.totalProfit += profit;
    
    return acc;
  }, { totalRevenue: 0, totalCost: 0, totalProfit: 0 });

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(amount);
  };

  const updateCorrespondingOrder = async () => {
    if (!quote || quote.status !== 'approved') {
      toast({
        title: "Lỗi",
        description: "Chỉ có thể cập nhật đơn hàng cho báo giá đã được duyệt",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingOrder(true);
    
    try {
      // Find the order created from this quote
      const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .ilike('notes', `%${quote.quote_number}%`)
        .limit(1);

      if (orderError) throw orderError;

      if (!orders || orders.length === 0) {
        toast({
          title: "Lỗi",
          description: "Không tìm thấy đơn hàng tương ứng với báo giá này",
          variant: "destructive",
        });
        return;
      }

      const order = orders[0];
      
      // Update the order with the new quote data - this will trigger real-time updates
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          total_amount: quote.total_amount,
          items: quote.items,
          notes: `Được tạo từ báo giá ${quote.quote_number} (đã cập nhật lúc ${new Date().toLocaleString('vi-VN')})`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      // No need to manually invalidate queries - real-time updates will handle this
      toast({
        title: "Thành công",
        description: `Đơn hàng ${order.order_number} đã được cập nhật tự động theo báo giá phụ`,
      });

      onUpdate?.();
      
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast({
        title: "Lỗi",
        description: error.message || "Không thể cập nhật đơn hàng",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Báo giá phụ - ${quote.quote_number}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              .company-info { margin-bottom: 20px; }
              .customer-info { margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              .text-right { text-align: right; }
              .totals { margin-top: 20px; }
              .profit-positive { color: green; }
              .profit-negative { color: red; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>BÁO GIÁ PHỤ</h2>
              <p>Số: ${quote.quote_number || `QUOTE-${quote.id.slice(0, 8)}`}</p>
            </div>
            
            <div class="company-info">
              <h3>Thông tin công ty:</h3>
              <p>${templateSettings.companyName}</p>
              <p>${templateSettings.companyAddress}</p>
              <p>Điện thoại: ${templateSettings.companyPhone}</p>
              <p>Email: ${templateSettings.companyEmail}</p>
            </div>
            
            <div class="customer-info">
              <h3>Thông tin khách hàng:</h3>
              <p>Tên: ${customerInfo.name}</p>
              ${customerInfo.company ? `<p>Công ty: ${customerInfo.company}</p>` : ''}
              ${customerInfo.address ? `<p>Địa chỉ: ${customerInfo.address}</p>` : ''}
              ${customerInfo.phone ? `<p>Điện thoại: ${customerInfo.phone}</p>` : ''}
              ${customerInfo.email ? `<p>Email: ${customerInfo.email}</p>` : ''}
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Tên sản phẩm</th>
                  <th>Mã SP</th>
                  <th>Số lượng</th>
                  <th>Giá bán</th>
                  <th>Giá gốc</th>
                  <th>Doanh thu</th>
                  <th>Chi phí</th>
                  <th>Lợi nhuận</th>
                </tr>
              </thead>
              <tbody>
                ${filteredItems.map((item: any, index: number) => {
                  const quantity = item.quantity || 0;
                  const price = item.price || 0;
                  const costPrice = getCostPrice(item);
                  const revenue = quantity * price;
                  const totalCost = quantity * costPrice;
                  const profit = revenue - totalCost;
                  
                  return `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${item.name || ''}</td>
                      <td>${item.sku || ''}</td>
                      <td class="text-right">${quantity}</td>
                      <td class="text-right">${formatCurrency(price)}</td>
                      <td class="text-right">${formatCurrency(costPrice)}</td>
                      <td class="text-right">${formatCurrency(revenue)}</td>
                      <td class="text-right">${formatCurrency(totalCost)}</td>
                      <td class="text-right ${profit >= 0 ? 'profit-positive' : 'profit-negative'}">${formatCurrency(profit)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
            
            <div class="totals">
              <table style="width: 50%; margin-left: auto;">
                <tr>
                  <td><strong>Tổng doanh thu:</strong></td>
                  <td class="text-right"><strong>${formatCurrency(calculations.totalRevenue)}</strong></td>
                </tr>
                <tr>
                  <td><strong>Tổng chi phí:</strong></td>
                  <td class="text-right"><strong>${formatCurrency(calculations.totalCost)}</strong></td>
                </tr>
                <tr class="${calculations.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}">
                  <td><strong>Tổng lợi nhuận:</strong></td>
                  <td class="text-right"><strong>${formatCurrency(calculations.totalProfit)}</strong></td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Báo giá phụ - {quote.quote_number || `QUOTE-${quote.id.slice(0, 8)}`}</span>
            <div className="flex gap-2">
              {quote?.status === 'approved' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={updateCorrespondingOrder}
                  disabled={isUpdatingOrder}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isUpdatingOrder ? 'animate-spin' : ''}`} />
                  {isUpdatingOrder ? 'Đang cập nhật...' : 'Cập nhật đơn hàng'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                In
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Company Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Thông tin công ty</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">{templateSettings.companyName}</p>
                <p>{templateSettings.companyAddress}</p>
                <p>Điện thoại: {templateSettings.companyPhone}</p>
                <p>Email: {templateSettings.companyEmail}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Thông tin khách hàng</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">{customerInfo.name}</p>
                {customerInfo.company && <p>Công ty: {customerInfo.company}</p>}
                {customerInfo.address && <p>Địa chỉ: {customerInfo.address}</p>}
                {customerInfo.phone && <p>Điện thoại: {customerInfo.phone}</p>}
                {customerInfo.email && <p>Email: {customerInfo.email}</p>}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Tìm kiếm sản phẩm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Quote Items Table */}
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">STT</TableHead>
                  <TableHead>Tên sản phẩm</TableHead>
                  <TableHead>Mã SP</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead className="text-right">Giá bán</TableHead>
                  <TableHead className="text-right">Giá gốc</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Chi phí</TableHead>
                  <TableHead className="text-right">Lợi nhuận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? "Không tìm thấy sản phẩm nào" : "Chưa có sản phẩm nào"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item: any, index: number) => {
                    const quantity = item.quantity || 0;
                    const price = item.price || 0;
                    const costPrice = getCostPrice(item);
                    const revenue = quantity * price;
                    const totalCost = quantity * costPrice;
                    const profit = revenue - totalCost;

                    return (
                      <TableRow key={index}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{item.name || ''}</TableCell>
                        <TableCell>{item.sku || ''}</TableCell>
                        <TableCell className="text-right">{quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(price)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(costPrice)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(revenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(totalCost)}</TableCell>
                        <TableCell className={`text-right font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(profit)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Summary */}
          <div className="flex justify-end">
            <div className="w-80 space-y-2">
              <div className="flex justify-between py-2 border-b">
                <span className="font-medium">Tổng doanh thu:</span>
                <span className="font-medium">{formatCurrency(calculations.totalRevenue)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="font-medium">Tổng chi phí:</span>
                <span className="font-medium">{formatCurrency(calculations.totalCost)}</span>
              </div>
              <div className={`flex justify-between py-2 font-bold text-lg ${calculations.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                <span>Tổng lợi nhuận:</span>
                <span>{formatCurrency(calculations.totalProfit)}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}