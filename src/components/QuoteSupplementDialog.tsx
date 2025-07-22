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
import { FileDown, Printer, FileSpreadsheet, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface QuoteSupplementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: any;
}

export function QuoteSupplementDialog({ open, onOpenChange, quote }: QuoteSupplementDialogProps) {
  const [templateSettings, setTemplateSettings] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (open && quote) {
      loadTemplateSettings();
      loadProductsData();
    }
  }, [open, quote]);

  const loadTemplateSettings = async () => {
    try {
      const { data } = await supabase
        .from('quotes')
        .select('*')
        .limit(1)
        .single();
      
      setTemplateSettings({
        companyName: "CÔNG TY TNHH ABC",
        companyAddress: "123 Đường ABC, Quận 1, TP.HCM",
        companyPhone: "028 1234 5678",
        companyEmail: "info@company.com",
        companyTax: "0123456789",
        companyBank: "Ngân hàng Vietcombank - Chi nhánh ABC",
        companyAccount: "0123456789",
        ...data
      });
    } catch (error) {
      console.error('Error loading template settings:', error);
    }
  };

  const loadProductsData = async () => {
    try {
      // Parse quote items to get product IDs and price list IDs
      let quoteItems = [];
      try {
        quoteItems = quote.items ? JSON.parse(quote.items) : [];
      } catch (error) {
        console.error('Error parsing quote items:', error);
        return;
      }

      // Extract unique product IDs and price list IDs
      const productIds = quoteItems
        .map((item: any) => item.product_id)
        .filter((id: any) => id);
      
      const priceListIds = quoteItems
        .map((item: any) => item.price_list_id)
        .filter((id: any) => id);

      if (productIds.length === 0) {
        setProducts([]);
        return;
      }

      // Fetch products from database with cost_price
      const { data: productsData, error } = await supabase
        .from('products')
        .select('id, cost_price, price_list_id')
        .in('id', productIds);

      if (error) throw error;

      setProducts(productsData || []);
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
    const product = products.find(p => p.id === item.product_id);
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