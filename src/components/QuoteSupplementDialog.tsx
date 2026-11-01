import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Printer, Search, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { isLocalBackend } from '@/lib/runtime-config';
import { localApi } from '@/lib/local-api';
import { quoteDisplayItems, quoteContactSnapshot } from '@/lib/quote-calculation';
import { escapeQuoteHtml } from '@/lib/quote-document';

interface ProductCostRow {
  id: string;
  sku?: string | null;
  cost_price?: number | null;
  price_list_id?: string | null;
}

interface QuoteSupplementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Record<string, unknown> | null;
  onUpdate?: () => void;
}

export function QuoteSupplementDialog({ open, onOpenChange, quote, onUpdate }: QuoteSupplementDialogProps) {
  const { settings: templateSettings, refetch: refetchTemplateSettings } = useTemplateSettings();
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<ProductCostRow[]>([]);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loadProductsData = useCallback(async () => {
    if (!quote) return;
    try {
      let quoteItems: Array<Record<string, unknown>> = [];
      try {
        quoteItems = quoteDisplayItems(quote.items);
      } catch (error) {
        console.error('Error parsing quote items:', error);
        return;
      }

      if (quoteItems.length === 0) {
        setProducts([]);
        return;
      }

      const productIds = quoteItems
        .map((item: Record<string, unknown>) => item.originalProductId)
        .filter((id: unknown) => id);

      const productSkus = quoteItems
        .map((item: Record<string, unknown>) => item.sku)
        .filter((sku: unknown) => sku);

      if (isLocalBackend()) {
        const allLocalProducts = await localApi.catalogProducts({});
        const matched = Array.isArray(allLocalProducts)
          ? allLocalProducts.filter((p) => productIds.includes(p.id) || (p.sku && productSkus.includes(p.sku)))
          : [];
        setProducts(matched);
        return;
      }

      let productsData: ProductCostRow[] = [];

      if (productIds.length > 0) {
        const { data: idData, error: idError } = await supabase
          .from('products')
          .select('id, sku, cost_price, price_list_id')
          .in('id', productIds);

        if (!idError && idData && idData.length > 0) {
          productsData = idData;
        }
      }

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
    } catch (error) {
      console.error('Error loading products data:', error);
      setProducts([]);
    }
  }, [quote]);

  useEffect(() => {
    if (open && quote) {
      refetchTemplateSettings();
      loadProductsData();
    }
  }, [open, quote, refetchTemplateSettings, loadProductsData]);

  if (!quote) return null;

  let quoteData: Record<string, unknown> = {};
  try {
    quoteData = quote.quote_data
      ? (typeof quote.quote_data === 'string' ? JSON.parse(quote.quote_data) : quote.quote_data)
      : {};
  } catch {
    quoteData = {};
  }

  const customerInfo = {
    name: quoteContactSnapshot(quote, quoteData, 'customerName', /(?:^|\n)Khách hàng:[ \t]*([^\r\n]*)/, 'Không có tên'),
    company: String(quote.customerCompany || ''),
    address: quoteContactSnapshot(quote, quoteData, 'customerAddress', /(?:^|\n)Địa chỉ:[ \t]*([^\r\n]*)/),
    phone: quoteContactSnapshot(quote, quoteData, 'customerPhone', /(?:^|\n)Điện thoại:[ \t]*([^\r\n]*)/),
    email: quoteContactSnapshot(quote, quoteData, 'customerEmail', /(?:^|\n)Email:[ \t]*([^\r\n]*)/),
  };

  const cleanPrefix = (value: unknown, pattern: RegExp) =>
    typeof value === 'string' ? value.trim().replace(pattern, '').trim() : '';

  const companyName = templateSettings.companyTitle || templateSettings.companyName || 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT';
  const companyAddress = cleanPrefix(templateSettings.address, /^(?:địa\s*chỉ|trụ\s*sở)\s*[:：-]\s*/iu);
  const companyPhone = cleanPrefix(templateSettings.phone, /^(?:điện\s*thoại|sđt|đt|tel)\s*[:：-]\s*/iu);
  const companyTaxCode = cleanPrefix(templateSettings.taxCode, /^(?:mã\s*số\s*thuế|mst)\s*[:：-]\s*/iu);

  let quoteItems: Array<Record<string, unknown>> = [];
  try {
    quoteItems = quoteDisplayItems(quote.items);
  } catch (error) {
    console.error('Error parsing quote items:', error);
    quoteItems = [];
  }

  const filteredItems = quoteItems.filter((item: Record<string, unknown>) =>
    String(item.name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(item.sku ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCostPrice = (item: Record<string, unknown>): number => {
    let product = products.find(p => p.id === item.originalProductId);
    if (!product && item.sku) {
      product = products.find(p => p.sku === item.sku);
    }
    return Number(product?.cost_price ?? 0);
  };

  const calculations = filteredItems.reduce<{ totalRevenue: number; totalCost: number; totalProfit: number }>((acc, item) => {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
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
    return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
  };

  const pushToOrdersFlow = async () => {
    if (!quote || quote.status !== 'approved') {
      toast({
        title: "Lỗi",
        description: "Chỉ có thể đẩy sang đơn hàng cho báo giá đã được duyệt",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingOrder(true);

    try {
      if (isLocalBackend()) {
        const result = await localApi.approveQuote(String(quote.id));
        await Promise.all(['quotes', 'quotes-infinite', 'quotes-stats', 'orders', 'orders-infinite', 'orders-stats'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
        toast({ title: 'Đã kiểm tra liên kết đơn hàng', description: `Đơn ${String(result.order.order_number || '')} được giữ nguyên dữ liệu vận hành; không ghi nhận tiền thu từ kế hoạch.` });
        onUpdate?.();
        return;
      }

      const { data: existingOrders, error: findError } = await supabase
        .from('orders')
        .select('*')
        .eq('quote_id', quote.id);

      if (findError) throw findError;

      if (existingOrders && existingOrders.length > 0) {
        const order = existingOrders[0];
        const orderTotal = Number(quote.include_vat ? quote.total_amount : quote.subtotal);

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            total_amount: orderTotal,
            items: quote.items,
            notes: `Được cập nhật từ báo giá ${quote.quote_number} (${new Date().toLocaleString('vi-VN')})`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id);

        if (updateError) throw updateError;

        toast({
          title: "Thành công",
          description: `Đã cập nhật đơn hàng ${order.order_number} từ báo giá`,
        });
      } else {
        const orderTotal = Number(quote.include_vat ? quote.total_amount : quote.subtotal);
        const orderNumber = `ORD-${Date.now()}`;
        const { error: createError } = await supabase
          .from('orders')
          .insert({
            order_number: orderNumber,
            customer_id: String(quote.customer_id || ''),
            manager_id: String(quote.manager_id || ''),
            assignee_id: quote.assignee_id ? String(quote.assignee_id) : null,
            total_amount: orderTotal,
            status: 'pending',
            items: quote.items as never,
            notes: null,
            tenant_id: 'default',
            quote_id: String(quote.id || ''),
          });

        if (createError) throw createError;

        toast({
          title: "Thành công",
          description: `Đã tạo đơn hàng mới ${orderNumber} từ báo giá`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onUpdate?.();
    } catch (error: unknown) {
      toast({
        title: "Lỗi",
        description: (error instanceof Error ? error.message : "") || "Không thể đẩy báo giá sang đơn hàng",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const quoteCode = String(quote.quote_number || quote.quoteNumber || `QUOTE-${String(quote.id || '').slice(0, 8) || 'N/A'}`);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Phụ lục báo giá - ${escapeQuoteHtml(quoteCode)}</title>
            <style>
              body { font-family: "Times New Roman", serif; margin: 20px; color: #0f172a; font-size: 13px; }
              .header { text-align: center; margin-bottom: 20px; }
              .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
              .info-card { border: 1px solid #cbd5e1; padding: 10px 12px; border-radius: 4px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
              th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
              th { background-color: #f8fafc; font-weight: bold; }
              .text-right { text-align: right; }
              .totals { margin-top: 12px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>PHỤ LỤC BÁO GIÁ (NỘI BỘ)</h2>
              <p>Số báo giá: ${escapeQuoteHtml(quoteCode)}</p>
            </div>

            <div class="info-grid">
              <div class="info-card">
                <strong>Đơn vị cung cấp:</strong>
                <p>${escapeQuoteHtml(companyName)}</p>
                ${companyAddress ? `<p>Địa chỉ: ${escapeQuoteHtml(companyAddress)}</p>` : ''}
                ${companyPhone ? `<p>Điện thoại: ${escapeQuoteHtml(companyPhone)}</p>` : ''}
              </div>
              <div class="info-card">
                <strong>Khách hàng:</strong>
                <p>Tên KH: ${escapeQuoteHtml(customerInfo.name)}</p>
                ${customerInfo.phone ? `<p>Điện thoại: ${escapeQuoteHtml(customerInfo.phone)}</p>` : ''}
                ${customerInfo.address ? `<p>Địa chỉ: ${escapeQuoteHtml(customerInfo.address)}</p>` : ''}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Tên sản phẩm</th>
                  <th>Mã SP</th>
                  <th class="text-right">SL</th>
                  <th class="text-right">Giá bán</th>
                  <th class="text-right">Giá vốn</th>
                  <th class="text-right">Doanh thu</th>
                  <th class="text-right">Chi phí</th>
                  <th class="text-right">Lợi nhuận</th>
                </tr>
              </thead>
              <tbody>
                ${filteredItems.map((item: Record<string, unknown>, index: number) => {
                  const quantity = Number(item.quantity || 0);
                  const price = Number(item.price || 0);
                  const costPrice = getCostPrice(item);
                  const revenue = quantity * price;
                  const totalCost = quantity * costPrice;
                  const profit = revenue - totalCost;
                  return `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${escapeQuoteHtml(item.name || '')}</td>
                      <td>${escapeQuoteHtml(item.sku || '-')}</td>
                      <td class="text-right">${escapeQuoteHtml(quantity)}</td>
                      <td class="text-right">${escapeQuoteHtml(formatCurrency(price))}</td>
                      <td class="text-right">${escapeQuoteHtml(formatCurrency(costPrice))}</td>
                      <td class="text-right">${escapeQuoteHtml(formatCurrency(revenue))}</td>
                      <td class="text-right">${escapeQuoteHtml(formatCurrency(totalCost))}</td>
                      <td class="text-right"><strong>${escapeQuoteHtml(formatCurrency(profit))}</strong></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>

            <div class="totals">
              <table style="width: 360px; margin-left: auto;">
                <tr>
                  <td><strong>Tổng doanh thu:</strong></td>
                  <td class="text-right"><strong>${escapeQuoteHtml(formatCurrency(calculations.totalRevenue))}</strong></td>
                </tr>
                <tr>
                  <td><strong>Tổng chi phí:</strong></td>
                  <td class="text-right"><strong>${escapeQuoteHtml(formatCurrency(calculations.totalCost))}</strong></td>
                </tr>
                <tr>
                  <td><strong>Tổng lợi nhuận dự kiến:</strong></td>
                  <td class="text-right"><strong>${escapeQuoteHtml(formatCurrency(calculations.totalProfit))}</strong></td>
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
      <DialogContent className="flex h-[min(90dvh,calc(100dvh-1rem))] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="flex-shrink-0 border-b border-border bg-card px-4 py-3 pr-14 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-left">
              <DialogTitle className="text-base font-semibold text-foreground sm:text-lg">
                Phụ lục báo giá #{quoteCode}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Bảng tính chi phí giá vốn và lợi nhuận dự kiến nội bộ ({filteredItems.length} dòng sản phẩm)
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {quote?.status === 'approved' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={pushToOrdersFlow}
                  disabled={isUpdatingOrder}
                  className="h-8 px-3 text-xs font-medium"
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isUpdatingOrder ? 'animate-spin' : ''}`} />
                  {isUpdatingOrder ? 'Đang xử lý...' : 'Đồng bộ đơn hàng'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-8 px-3 text-xs font-medium"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                In phụ lục
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Đơn vị cung cấp
              </h3>
              <div className="space-y-0.5 text-xs leading-5 text-foreground sm:text-sm">
                <p className="font-semibold">{companyName}</p>
                {companyAddress && <p className="text-muted-foreground">Địa chỉ: {companyAddress}</p>}
                <p className="text-muted-foreground">
                  Điện thoại: {companyPhone || '-'}
                  {companyTaxCode ? ` | MST: ${companyTaxCode}` : ''}
                </p>
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Khách hàng
              </h3>
              <div className="space-y-0.5 text-xs leading-5 text-foreground sm:text-sm">
                <p className="font-semibold">{customerInfo.name}</p>
                {customerInfo.phone && <p className="text-muted-foreground">Điện thoại: {customerInfo.phone}</p>}
                {customerInfo.address && <p className="text-muted-foreground">Địa chỉ: {customerInfo.address}</p>}
                {customerInfo.email && <p className="text-muted-foreground">Email: {customerInfo.email}</p>}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm theo tên hoặc mã sản phẩm..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs sm:text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <Table disableWrapper className="min-w-[780px] w-full">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-9 w-10 px-2 text-center text-xs font-semibold">STT</TableHead>
                  <TableHead className="h-9 px-2.5 text-xs font-semibold">Sản phẩm</TableHead>
                  <TableHead className="h-9 w-28 px-2 text-xs font-semibold">Mã SP</TableHead>
                  <TableHead className="h-9 w-16 px-2 text-right text-xs font-semibold">SL</TableHead>
                  <TableHead className="h-9 w-28 px-2 text-right text-xs font-semibold">Giá bán</TableHead>
                  <TableHead className="h-9 w-28 px-2 text-right text-xs font-semibold">Giá vốn</TableHead>
                  <TableHead className="h-9 w-32 px-2 text-right text-xs font-semibold">Doanh thu</TableHead>
                  <TableHead className="h-9 w-32 px-2 text-right text-xs font-semibold">Chi phí</TableHead>
                  <TableHead className="h-9 w-32 px-2.5 text-right text-xs font-semibold">Lợi nhuận</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-xs text-muted-foreground">
                      {searchTerm ? "Không tìm thấy sản phẩm phù hợp" : "Chưa có sản phẩm nào"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item: Record<string, unknown>, index: number) => {
                    const quantity = Number(item.quantity || 0);
                    const price = Number(item.price || 0);
                    const costPrice = getCostPrice(item);
                    const revenue = quantity * price;
                    const totalCost = quantity * costPrice;
                    const profit = revenue - totalCost;

                    return (
                      <TableRow key={index} className="even:bg-muted/15">
                        <TableCell className="px-2 py-2 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="px-2.5 py-2 text-xs font-medium sm:text-sm">{String(item.name || '-')}</TableCell>
                        <TableCell className="px-2 py-2 text-xs text-muted-foreground">{String(item.sku || '-')}</TableCell>
                        <TableCell className="px-2 py-2 text-right text-xs tabular-nums">{quantity}</TableCell>
                        <TableCell className="px-2 py-2 text-right text-xs tabular-nums whitespace-nowrap">{formatCurrency(price)}</TableCell>
                        <TableCell className="px-2 py-2 text-right text-xs tabular-nums whitespace-nowrap text-muted-foreground">{formatCurrency(costPrice)}</TableCell>
                        <TableCell className="px-2 py-2 text-right text-xs font-medium tabular-nums whitespace-nowrap">{formatCurrency(revenue)}</TableCell>
                        <TableCell className="px-2 py-2 text-right text-xs tabular-nums whitespace-nowrap text-muted-foreground">{formatCurrency(totalCost)}</TableCell>
                        <TableCell className={`px-2.5 py-2 text-right text-xs font-semibold tabular-nums whitespace-nowrap ${profit < 0 ? 'text-destructive' : 'text-foreground'}`}>
                          {formatCurrency(profit)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-sm rounded-md border border-border bg-muted/20 p-3 text-xs sm:text-sm">
              <div className="flex justify-between border-b border-border/70 py-1.5">
                <span className="text-muted-foreground">Tổng doanh thu (trước thuế):</span>
                <span className="font-medium tabular-nums">{formatCurrency(calculations.totalRevenue)}</span>
              </div>
              <div className="flex justify-between border-b border-border/70 py-1.5">
                <span className="text-muted-foreground">Tổng chi phí giá vốn:</span>
                <span className="font-medium tabular-nums">{formatCurrency(calculations.totalCost)}</span>
              </div>
              <div className="flex justify-between pt-2 font-semibold">
                <span>Lợi nhuận gộp dự kiến:</span>
                <span className={`tabular-nums ${calculations.totalProfit < 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {formatCurrency(calculations.totalProfit)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
