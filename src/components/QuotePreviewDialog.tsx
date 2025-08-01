import React, { useState, useEffect } from "react";
import { Download, Printer, X, Calculator, FileDown } from "lucide-react";
import html2canvas from 'html2canvas';
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import * as ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { getTemplateSettings } from './QuoteTemplateSettings';
import { QuoteSupplementDialog } from './QuoteSupplementDialog';

interface QuotePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: any;
}

export function QuotePreviewDialog({ open, onOpenChange, quote }: QuotePreviewDialogProps) {
  const [showQuoteSupplementDialog, setShowQuoteSupplementDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();
  const { role: userRole } = useUserRole(user);
  const { hasPermission } = useEmployeePermissions(user, userRole);
  const [templateSettings, setTemplateSettings] = useState(getTemplateSettings());

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  // Load template settings when dialog opens
  useEffect(() => {
    if (open) {
      setTemplateSettings(getTemplateSettings());
    }
  }, [open]);

  if (!quote) return null;

  // Parse customer info from notes
  const notes = quote.notes || '';
  const customerName = notes.match(/Khách hàng:\s*(.+)/)?.[1] || 'NGUYEN DUC PHUOC';
  const phone = notes.match(/Điện thoại:\s*(.+)/)?.[1] || '';
  const email = notes.match(/Email:\s*(.+)/)?.[1] || '';
  const address = notes.match(/Địa chỉ:\s*(.+)/)?.[1] || '';
  const expiryDate = notes.match(/Ngày hết hạn:\s*(.+)/)?.[1] || '21/08/2025';

  // Parse items with real data
  const items = quote.items ? JSON.parse(quote.items) : [
    {
      name: "Bao ve nem chan bong 100x200",
      specifications: "Bao may bo chun quanh đệm, vải được tính trừ co theo nhà sản xuất",
      category: "Vải T225 40% Cotton 35% Polyester 25% Lụa, mật độ sợi 225 sợi/inch vuông. Vải ít nhăn, không xù, không bai màu",
      quantity: 1,
      price: 180000,
      total: 180000
    }
  ];
  
  // Parse quote data for VAT and payment info
  const quoteData = quote.quote_data ? JSON.parse(quote.quote_data) : {};
  
  // Calculate totals based on items
  const subtotal = items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
  
  // Auto-detect VAT: check if there's a difference between subtotal and total_amount
  // indicating VAT has been included
  const quoteTotalAmount = quote.total_amount || subtotal;
  const hasVAT = quoteTotalAmount > subtotal;
  const includeVAT = quoteData.includeVAT || hasVAT;
  const vatRate = quoteData.vatRate || 8;
  
  // Calculate VAT amount based on whether VAT is included
  let vatAmount = 0;
  if (includeVAT) {
    if (hasVAT && quoteTotalAmount > subtotal) {
      // VAT amount is the difference between total and subtotal
      vatAmount = quoteTotalAmount - subtotal;
    } else {
      // Calculate VAT from subtotal
      vatAmount = Math.round(subtotal * vatRate / 100);
    }
  }
  
  const payment1 = quoteData.payment1 || 0;
  const payment2 = quoteData.payment2 || 0;
  const totalWithVat = subtotal + vatAmount;
  const firstPayment = payment1 || Math.round(totalWithVat * 0.3); // Use payment1 or 30% default
  const remaining = totalWithVat - firstPayment;

  // Current date for display
  const currentDate = new Date();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN').format(amount);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const quoteContent = document.getElementById('quote-preview')?.innerHTML;
    if (!quoteContent) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Báo giá ${quote.quote_number}</title>
          <style>
            @media print {
              body { margin: 0; padding: 20px; font-family: 'Times New Roman', serif; font-size: 12px; }
              .no-print { display: none !important; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #000; padding: 8px; text-align: left; }
              .text-center { text-align: center; }
              .text-right { text-align: right; }
              .font-bold { font-weight: bold; }
              .bg-gray-50 { background-color: #f9f9f9; }
              .bg-blue-50 { background-color: #eff6ff; }
              .rounded-lg { border-radius: 8px; }
              .p-6 { padding: 24px; }
              .mb-8 { margin-bottom: 32px; }
              .space-y-2 > * + * { margin-top: 8px; }
            }
          </style>
        </head>
        <body>${quoteContent}</body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const handleExportPDF = () => {
    handlePrint();
  };

  const handleDirectSavePDF = async () => {
    setIsExporting(true);
    try {
      toast({
        title: "Đang tạo PDF...",
        description: "Vui lòng đợi trong giây lát",
      });

      const previewElement = document.getElementById('quote-preview');
      if (!previewElement) {
        throw new Error('Không tìm thấy nội dung để xuất PDF');
      }

      const canvas = await html2canvas(previewElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: previewElement.scrollWidth,
        height: previewElement.scrollHeight,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`BaoGia_${quote.quote_number || 'N/A'}_${new Date().toISOString().split('T')[0]}.pdf`);

      toast({
        title: "Xuất PDF thành công",
        description: `Đã lưu báo giá ${quote.quote_number || 'N/A'} thành file PDF`,
      });

    } catch (error) {
      console.error('Error saving PDF:', error);
      toast({
        title: "Lỗi lưu PDF",
        description: "Có lỗi xảy ra khi lưu file PDF. Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Báo giá');
      
      // Set column widths
      worksheet.getColumn('A').width = 7.14;
      worksheet.getColumn('B').width = 22.86;
      worksheet.getColumn('C').width = 42;
      worksheet.getColumn('D').width = 52.85;
      worksheet.getColumn('E').width = 12.86;
      worksheet.getColumn('F').width = 12.86;
      worksheet.getColumn('G').width = 17.29;
      worksheet.getColumn('H').width = 18.14;

      // Add headers and data (simplified version)
      let currentRow = 1;

      // Company header
      worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
      const companyCell = worksheet.getCell(`A${currentRow}`);
      companyCell.value = templateSettings.companyTitle;
      companyCell.font = { name: 'Times New Roman', bold: true, size: 16 };
      companyCell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow += 2;

      // Quote title
      worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
      const titleCell = worksheet.getCell(`A${currentRow}`);
      titleCell.value = 'BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN';
      titleCell.font = { name: 'Times New Roman', bold: true, size: 18 };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow += 3;

      // Table headers
      const headers = ['STT', 'SẢN PHẨM', 'QUY CÁCH', 'CHẤT LIỆU', 'SỐ LƯỢNG', 'ĐƠN GIÁ', 'THÀNH TIỀN', 'GHI CHÚ'];
      
      headers.forEach((header, index) => {
        const cell = worksheet.getCell(`${String.fromCharCode(65 + index)}${currentRow}`);
        cell.value = header;
        cell.font = { name: 'Times New Roman', bold: true, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      currentRow++;

      // Quote items
      items.forEach((item: any, index: number) => {
        const rowData = [
          index + 1,
          item.name || item.sku || '',
          item.specifications || '',
          item.description || 'Vải T225 40% Cotton 35% Polyester 25% Lụa',
          item.quantity || 1,
          item.price || 0,
          item.total || 0,
          ''
        ];

        rowData.forEach((value, colIndex) => {
          const cell = worksheet.getCell(`${String.fromCharCode(65 + colIndex)}${currentRow}`);
          cell.value = value;
          cell.font = { name: 'Times New Roman', size: 10 };
          
          if (colIndex === 0 || colIndex === 4) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (colIndex >= 5) {
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            if (typeof value === 'number') {
              cell.numFmt = '#,##0';
            }
          }
        });
        
        currentRow++;
      });

      // Generate and download file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BaoGia_${quote.quote_number}_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Xuất Excel thành công",
        description: `Đã xuất báo giá ${quote.quote_number} ra file Excel`,
      });
    } catch (error) {
      console.error('Excel export error:', error);
      toast({
        title: "Lỗi xuất Excel",
        description: "Có lỗi xảy ra khi xuất file Excel. Vui lòng thử lại.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold text-primary">
            Xem trước báo giá #{quote?.quote_number || 'N/A'}
          </DialogTitle>
        </DialogHeader>
        
        {/* Enhanced Toolbar */}
        <div className="flex-shrink-0 bg-muted/30 rounded-lg p-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Primary Actions */}
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={handleDirectSavePDF} 
                variant="default" 
                size="sm"
                disabled={isExporting}
                className="font-medium"
              >
                <FileDown className="w-4 h-4 mr-2" />
                {isExporting ? "Đang xuất..." : "Lưu PDF"}
              </Button>
              <Button 
                onClick={handlePrint} 
                variant="secondary" 
                size="sm"
                className="font-medium"
              >
                <Printer className="w-4 h-4 mr-2" />
                In báo giá
              </Button>
            </div>

            {/* Secondary Actions */}
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button onClick={handleExportExcel} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Excel
              </Button>
              
              {hasPermission('quote_supplement') && (
                <Button 
                  onClick={() => setShowQuoteSupplementDialog(true)} 
                  variant="outline" 
                  size="sm"
                >
                  <Calculator className="w-4 h-4 mr-2" />
                  Phụ lục
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* Preview Content - Scrollable */}
        <div className="flex-1 overflow-auto">
          <div className="bg-white" id="quote-preview" style={{ fontFamily: 'Times New Roman, serif' }}>
            <div className="p-8 max-w-5xl mx-auto">
              {/* Professional Header */}
              <div className="mb-8">
                <div className="flex items-start justify-between gap-8 mb-6">
                  {/* Company Info Section */}
                  <div className="flex-1">
                    {/* Logo Container - Optimized size */}
                    <div className="w-24 h-16 mb-4 flex items-center">
                      <img 
                        src={templateSettings.logoUrl} 
                        alt="Company Logo" 
                        className="max-w-full max-h-full object-contain border border-gray-200 rounded-sm p-1"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                          if (nextElement) {
                            nextElement.style.display = 'flex';
                          }
                        }}
                      />
                      <div className="w-24 h-16 bg-gradient-to-br from-slate-100 to-slate-200 border border-gray-200 rounded-sm flex items-center justify-center text-xs text-gray-500 font-medium" style={{ display: 'none' }}>
                        LOGO
                      </div>
                    </div>
                    
                    {/* Company Title */}
                    <h1 className="text-2xl font-bold mb-3" style={{ color: '#1a365d' }}>
                      {templateSettings.companyTitle || 'CÔNG TY TNHH ABC'}
                    </h1>
                    
                    {/* Company Details */}
                    <div className="space-y-1 text-sm leading-relaxed">
                      <p><span className="font-medium text-gray-700">Địa chỉ:</span> {templateSettings.address || 'Địa chỉ công ty'}</p>
                      <p><span className="font-medium text-gray-700">Điện thoại:</span> {templateSettings.phone || '0123456789'}</p>
                      <p><span className="font-medium text-gray-700">MST:</span> {templateSettings.taxCode || '0123456789'}</p>
                      <p><span className="font-medium text-gray-700">STK:</span> {templateSettings.bankInfo || 'Thông tin ngân hàng'}</p>
                    </div>
                  </div>
                  
                  {/* Quote Title Section */}
                  <div className="flex-1 text-right">
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-600 p-6 rounded-lg shadow-sm">
                      <h2 className="text-xl font-bold mb-2" style={{ color: '#1a365d' }}>
                        BẢNG BÁO GIÁ
                      </h2>
                      <div className="space-y-2 text-sm">
                        <p><span className="font-medium text-gray-700">Số báo giá:</span> <span className="font-bold text-blue-700">{quote.quote_number || 'BG-001'}</span></p>
                        <p><span className="font-medium text-gray-700">Ngày tạo:</span> {new Date(quote.created_at || new Date()).toLocaleDateString('vi-VN')}</p>
                        <p><span className="font-medium text-gray-700">Hết hạn:</span> {expiryDate}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Information Section */}
              <div className="mb-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Customer Info */}
                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <h3 className="text-lg font-bold mb-4 text-gray-800 border-b border-gray-300 pb-2">
                      THÔNG TIN KHÁCH HÀNG
                    </h3>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-medium text-gray-700">Tên khách hàng:</span> <span className="font-semibold">{customerName}</span></p>
                      {phone && <p><span className="font-medium text-gray-700">Điện thoại:</span> {phone}</p>}
                      {email && <p><span className="font-medium text-gray-700">Email:</span> {email}</p>}
                      {address && <p><span className="font-medium text-gray-700">Địa chỉ:</span> {address}</p>}
                    </div>
                  </div>

                  {/* Additional Quote Info */}
                  <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                    <h3 className="text-lg font-bold mb-4 text-blue-800 border-b border-blue-300 pb-2">
                      CHI TIẾT BÁO GIÁ
                    </h3>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-medium text-gray-700">Ngày báo giá:</span> {currentDate.toLocaleDateString('vi-VN')}</p>
                      <p><span className="font-medium text-gray-700">Người tạo:</span> {user?.email || 'Admin'}</p>
                      <p><span className="font-medium text-gray-700">Trạng thái:</span> <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">Chờ phê duyệt</span></p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Table with Professional Design */}
              <div className="mb-8">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow className="bg-gradient-to-r from-slate-100 to-slate-200 border-b-2 border-slate-300">
                        <TableHead className="border-r border-slate-300 text-center font-bold text-slate-700 py-4 text-sm">STT</TableHead>
                        <TableHead className="border-r border-slate-300 text-center font-bold text-slate-700 py-4 text-sm">SẢN PHẨM</TableHead>
                        <TableHead className="border-r border-slate-300 text-center font-bold text-slate-700 py-4 text-sm">QUY CÁCH</TableHead>
                        <TableHead className="border-r border-slate-300 text-center font-bold text-slate-700 py-4 text-sm">CHẤT LIỆU</TableHead>
                        <TableHead className="border-r border-slate-300 text-center font-bold text-slate-700 py-4 text-sm">SỐ LƯỢNG</TableHead>
                        <TableHead className="border-r border-slate-300 text-center font-bold text-slate-700 py-4 text-sm">ĐƠN GIÁ</TableHead>
                        <TableHead className="border-r border-slate-300 text-center font-bold text-slate-700 py-4 text-sm">THÀNH TIỀN</TableHead>
                        <TableHead className="text-center font-bold text-slate-700 py-4 text-sm">GHI CHÚ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item: any, index: number) => (
                        <TableRow key={index} className="hover:bg-gray-50 transition-colors">
                          <TableCell className="border-r border-gray-200 text-center py-4 font-medium text-slate-600">{index + 1}</TableCell>
                          <TableCell className="border-r border-gray-200 py-4 font-medium text-slate-800">{item.name || item.sku}</TableCell>
                          <TableCell className="border-r border-gray-200 py-4 text-sm text-slate-600">{item.specifications || '-'}</TableCell>
                          <TableCell className="border-r border-gray-200 py-4 text-sm text-slate-600 leading-relaxed">{item.description || 'Vải T225 40% Cotton 35% Polyester 25% Lụa'}</TableCell>
                          <TableCell className="border-r border-gray-200 text-center py-4 font-medium text-slate-700">{item.quantity}</TableCell>
                          <TableCell className="border-r border-gray-200 text-right py-4 font-medium text-slate-700">{formatCurrency(item.price)}</TableCell>
                          <TableCell className="border-r border-gray-200 text-right py-4 font-bold text-blue-700">{formatCurrency(item.total)}</TableCell>
                          <TableCell className="py-4 text-sm text-slate-500">-</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Enhanced Totals Section */}
              <div className="mb-8">
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200 shadow-sm">
                  <h3 className="text-lg font-bold mb-4 text-blue-800 border-b border-blue-300 pb-2">
                    TỔNG KẾT GIÁ TRỊ
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-blue-200">
                      <span className="font-medium text-gray-700">Tổng giá trị chưa bao gồm GTGT:</span>
                      <span className="font-bold text-lg text-blue-700">{formatCurrency(subtotal)} VNĐ</span>
                    </div>
                    {includeVAT && (
                      <>
                        <div className="flex justify-between items-center py-2 border-b border-blue-200">
                          <span className="font-medium text-gray-700">GTGT ({vatRate}%):</span>
                          <span className="font-bold text-lg text-blue-700">{formatCurrency(vatAmount)} VNĐ</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-blue-200">
                          <span className="font-medium text-gray-700">Tổng tiền đã bao gồm GTGT:</span>
                          <span className="font-bold text-xl text-blue-800">{formatCurrency(totalWithVat)} VNĐ</span>
                        </div>
                      </>
                    )}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                      <div className="flex justify-between items-center py-1">
                        <span className="font-medium text-amber-800">Thanh toán lần 1 (30%):</span>
                        <span className="font-bold text-lg text-amber-700">{formatCurrency(firstPayment)} VNĐ</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="font-medium text-amber-800">Còn lại:</span>
                        <span className="font-bold text-lg text-amber-700">{formatCurrency(remaining)} VNĐ</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Terms and Conditions */}
              <div className="mb-8">
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                  <h3 className="text-lg font-bold mb-4 text-gray-800 border-b border-gray-300 pb-2">
                    ĐIỀU KHOẢN VÀ ĐIỀU KIỆN
                  </h3>
                  <div className="space-y-2 text-sm leading-relaxed">
                    {templateSettings.terms.map((term: string, index: number) => (
                      <p key={index} className="flex">
                        <span className="font-medium text-gray-600 mr-2">{index + 1}.</span>
                        <span className="text-gray-700">{term}</span>
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              {/* Signature Section */}
              <div className="grid grid-cols-2 gap-16 mt-16">
                <div className="text-center">
                  <p className="font-bold text-lg mb-12 text-gray-800">ĐẠI DIỆN CÔNG TY</p>
                  <div className="h-16 mb-4 border-b border-gray-300"></div>
                  <p className="font-semibold text-gray-700">GIÁM ĐỐC</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-lg mb-12 text-gray-800">KHÁCH HÀNG</p>
                  <div className="h-16 mb-4 border-b border-gray-300"></div>
                  <p className="text-sm text-gray-600">Ký tên và đóng dấu xác nhận</p>
                </div>
              </div>
              
              {/* Footer note if available */}
              {templateSettings.footerNote && (
                <div className="text-center mt-8 pt-4 border-t border-gray-300">
                  <p className="text-sm italic text-gray-600">{templateSettings.footerNote}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dialogs */}
        {showQuoteSupplementDialog && (
          <QuoteSupplementDialog
            open={showQuoteSupplementDialog}
            onOpenChange={setShowQuoteSupplementDialog}
            quote={quote}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}