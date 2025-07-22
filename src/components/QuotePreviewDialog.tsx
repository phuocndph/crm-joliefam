import React, { useState, useEffect } from "react";
import { Download, Printer, X } from "lucide-react";
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
import { getTemplateSettings } from './QuoteTemplateSettings';

interface QuotePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: any;
}

export function QuotePreviewDialog({ open, onOpenChange, quote }: QuotePreviewDialogProps) {
  const { toast } = useToast();
  const [templateSettings, setTemplateSettings] = useState(getTemplateSettings());

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

  // Parse items
  const items = quote.items ? JSON.parse(quote.items) : [];
  
  // Calculate totals
  const subtotal = items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
  const vatRate = 8; // Default VAT rate
  const vatAmount = (subtotal * vatRate) / 100;
  const totalWithVat = subtotal + vatAmount;
  const firstPayment = totalWithVat * 0.3; // 30% deposit
  const remaining = totalWithVat - firstPayment;

  // Current date for display
  const currentDate = new Date();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN').format(amount);
  };

  const handleExportExcel = async () => {
    try {
      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Báo giá');
      
      // Set page setup for printing
      worksheet.pageSetup = {
        orientation: 'portrait',
        fitToPage: true,
        fitToHeight: 1,
        fitToWidth: 1,
        paperSize: 9, // A4
        margins: {
          left: 0.75,
          right: 0.75,
          top: 1.0,
          bottom: 1.0,
          header: 0.3,
          footer: 0.3
        }
      };

      // Add logo (if available)
      try {
        const logoPath = templateSettings.logoUrl;
        const logoResponse = await fetch(logoPath);
        
        if (logoResponse.ok) {
          const logoBlob = await logoResponse.blob();
          const logoArrayBuffer = await logoBlob.arrayBuffer();
          
          const logoId = workbook.addImage({
            buffer: logoArrayBuffer,
            extension: 'png',
          });
          
          // Add logo to worksheet (A1:A4)
          worksheet.addImage(logoId, {
            tl: { col: 0, row: 0 },
            ext: { width: 100, height: 80 }
          });
        }
      } catch (logoError) {
        console.warn('Could not load logo:', logoError);
      }

      // Company header - Row 1 (next to logo)
      worksheet.mergeCells('B1:H1');
      const companyCell = worksheet.getCell('B1');
      companyCell.value = templateSettings.companyTitle;
      companyCell.font = { name: 'Times New Roman', bold: true, size: 16, color: { argb: templateSettings.companyTitleColor.replace('#', 'FF') } };
      companyCell.alignment = { vertical: 'middle', horizontal: 'left' };

      // Company details - Row 2-6
      worksheet.mergeCells('B2:H2');
      const addressCell = worksheet.getCell('B2');
      addressCell.value = `Địa chỉ: ${templateSettings.address}`;
      addressCell.font = { name: 'Times New Roman', size: 10 };
      addressCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

      worksheet.mergeCells('B3:H3');
      const phoneCell = worksheet.getCell('B3');
      phoneCell.value = `Điện thoại: ${templateSettings.phone}`;
      phoneCell.font = { name: 'Times New Roman', size: 10 };
      phoneCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('B4:H4');
      const mstCell = worksheet.getCell('B4');
      mstCell.value = `MST: ${templateSettings.taxCode}`;
      mstCell.font = { name: 'Times New Roman', size: 10 };
      mstCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('B5:H5');
      const officeCell = worksheet.getCell('B5');
      officeCell.value = `Trụ sở: ${templateSettings.headquarters}`;
      officeCell.font = { name: 'Times New Roman', size: 10 };
      officeCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

      worksheet.mergeCells('B6:H6');
      const bankCell = worksheet.getCell('B6');
      bankCell.value = `STK: ${templateSettings.bankInfo}`;
      bankCell.font = { name: 'Times New Roman', size: 10 };
      bankCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

      // Empty row
      let currentRow = 8;

      // Quote title
      worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
      const titleCell = worksheet.getCell(`A${currentRow}`);
      titleCell.value = 'BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN';
      titleCell.font = { name: 'Times New Roman', bold: true, size: 18, color: { argb: templateSettings.quoteTitleColor.replace('#', 'FF') } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow += 2;

      // Date info
      worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
      const dateCell = worksheet.getCell(`A${currentRow}`);
      dateCell.value = `Hà Nội ngày ${currentDate.getDate()} tháng ${currentDate.getMonth() + 1} năm ${currentDate.getFullYear()}`;
      dateCell.font = { name: 'Times New Roman', size: 12, italic: true };
      dateCell.alignment = { horizontal: 'center' };

      currentRow += 2;

      // Customer and Quote info headers
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      const customerHeaderCell = worksheet.getCell(`A${currentRow}`);
      customerHeaderCell.value = 'THÔNG TIN KHÁCH HÀNG:';
      customerHeaderCell.font = { name: 'Times New Roman', bold: true, size: 12, color: { argb: 'FF0066CC' } };
      customerHeaderCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' }
      };
      customerHeaderCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      const quoteHeaderCell = worksheet.getCell(`E${currentRow}`);
      quoteHeaderCell.value = 'THÔNG TIN BÁO GIÁ:';
      quoteHeaderCell.font = { name: 'Times New Roman', bold: true, size: 12, color: { argb: 'FF0066CC' } };
      quoteHeaderCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' }
      };
      quoteHeaderCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      currentRow++;
      
      // Customer details
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      const customerNameCell = worksheet.getCell(`A${currentRow}`);
      customerNameCell.value = `Tên KH: ${customerName}`;
      customerNameCell.font = { name: 'Times New Roman', size: 10 };
      customerNameCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      const quoteNumberCell = worksheet.getCell(`E${currentRow}`);
      quoteNumberCell.value = `Số báo giá: ${quote.quoteNumber || 'BG-20250717-082'}`;
      quoteNumberCell.font = { name: 'Times New Roman', size: 10 };
      quoteNumberCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      currentRow++;
      
      // Empty cell for customer side, quote date on right
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      const emptyCell1 = worksheet.getCell(`A${currentRow}`);
      emptyCell1.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      const quoteDateCell = worksheet.getCell(`E${currentRow}`);
      quoteDateCell.value = `Ngày báo giá: ${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
      quoteDateCell.font = { name: 'Times New Roman', size: 10 };
      quoteDateCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      currentRow++;
      
      // Empty cell for customer side, expiry date on right
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      const emptyCell2 = worksheet.getCell(`A${currentRow}`);
      emptyCell2.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      const expiryDateCell = worksheet.getCell(`E${currentRow}`);
      expiryDateCell.value = `Ngày hết hạn: ${expiryDate || '31/7/2025'}`;
      expiryDateCell.font = { name: 'Times New Roman', size: 10 };
      expiryDateCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      currentRow += 2;

      // Table headers with Times New Roman font
      const headers = ['STT', 'SẢN PHẨM', 'QUY CÁCH (CM)', 'CHẤT LIỆU', 'SỐ LƯỢNG', 'ĐƠN GIÁ', 'THÀNH TIỀN', 'Ghi Chú'];
      
      headers.forEach((header, index) => {
        const cell = worksheet.getCell(`${String.fromCharCode(65 + index)}${currentRow}`);
        cell.value = header;
        cell.font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FF000000' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF2CC' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'medium' },
          left: { style: 'medium' },
          bottom: { style: 'medium' },
          right: { style: 'medium' }
        };
      });

      currentRow++;

      // Quote items with Times New Roman font
      items.forEach((item: any, index: number) => {
        const rowData = [
          index + 1,
          item.name || 'Ga chun ks T225 sọc 100x200x15cm',
          item.specifications || 'Ga may bo chun quanh đệm, vải được tính trừ co theo nhà sản xuất',
          item.category || 'Vải T225 40% Cotton 35% Polyester 25% Lụa, mật độ sợi 225 sợi/inch vuông. Vải ít nhăn, không xù, không bai màu',
          item.quantity || 144,
          item.price || 140000,
          item.total || 20160000,
          ''
        ];

        rowData.forEach((value, colIndex) => {
          const cell = worksheet.getCell(`${String.fromCharCode(65 + colIndex)}${currentRow}`);
          cell.value = value;
          cell.font = { name: 'Times New Roman', size: 10 };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          
          if (colIndex === 0 || colIndex === 4) { // STT và Số lượng
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (colIndex >= 5) { // Đơn giá và Thành tiền
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
            if (typeof value === 'number') {
              cell.numFmt = '#,##0';
            }
          } else if (colIndex >= 1 && colIndex <= 3) { // Text columns
            cell.alignment = { wrapText: true, vertical: 'middle' };
          }
        });
        
        currentRow++;
      });

      currentRow++;

      // Totals section with Times New Roman font
      const totalsData = [
        ['TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT', formatCurrency(subtotal)],
        [`GTGT (${vatRate}%)`, formatCurrency(vatAmount)],
        ['TỔNG TIỀN ĐÃ BAO GỒM GTGT', formatCurrency(totalWithVat)],
        ['THANH TOÁN LẦN 1', formatCurrency(firstPayment)],
        ['CÒN LẠI', formatCurrency(remaining)]
      ];

      totalsData.forEach(([label, value]) => {
        worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
        const labelCell = worksheet.getCell(`A${currentRow}`);
        labelCell.value = label;
        labelCell.font = { name: 'Times New Roman', bold: true, size: 11 };
        labelCell.alignment = { horizontal: 'right', vertical: 'middle' };

        const valueCell = worksheet.getCell(`G${currentRow}`);
        valueCell.value = value;
        valueCell.font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FFDC143C' } };
        valueCell.alignment = { horizontal: 'right', vertical: 'middle' };

        currentRow++;
      });

      currentRow += 2;

      // Terms with Times New Roman font
      templateSettings.terms.forEach((term, index) => {
        worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
        const termCell = worksheet.getCell(`A${currentRow}`);
        termCell.value = `${index + 1}. ${term}`;
        termCell.font = { name: 'Times New Roman', size: 10 };
        currentRow++;
      });

      currentRow += 2;

      // Signature section
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      const companySignatureHeaderCell = worksheet.getCell(`A${currentRow}`);
      companySignatureHeaderCell.value = 'ĐẠI DIỆN CÔNG TY';
      companySignatureHeaderCell.font = { name: 'Times New Roman', bold: true, size: 12 };
      companySignatureHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      const customerSignatureHeaderCell = worksheet.getCell(`E${currentRow}`);
      customerSignatureHeaderCell.value = 'KHÁCH HÀNG';
      customerSignatureHeaderCell.font = { name: 'Times New Roman', bold: true, size: 12 };
      customerSignatureHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };

      currentRow += 4; // Space for signature

      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      const directorCell = worksheet.getCell(`A${currentRow}`);
      directorCell.value = 'GIÁM ĐỐC';
      directorCell.font = { name: 'Times New Roman', bold: true, size: 11 };
      directorCell.alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      const customerSignatureCell = worksheet.getCell(`E${currentRow}`);
      customerSignatureCell.value = 'Ký tên và đóng dấu xác nhận';
      customerSignatureCell.font = { name: 'Times New Roman', size: 10 };
      customerSignatureCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Column widths
      worksheet.getColumn(1).width = 8;   // STT
      worksheet.getColumn(2).width = 35;  // SẢN PHẨM
      worksheet.getColumn(3).width = 25;  // QUY CÁCH
      worksheet.getColumn(4).width = 30;  // CHẤT LIỆU
      worksheet.getColumn(5).width = 12;  // SỐ LƯỢNG
      worksheet.getColumn(6).width = 15;  // ĐƠN GIÁ
      worksheet.getColumn(7).width = 18;  // THÀNH TIỀN
      worksheet.getColumn(8).width = 12;  // Ghi Chú

      // Generate and download file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BaoGia_${quote.quoteNumber}_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Xuất Excel thành công",
        description: `Đã xuất báo giá ${quote.quoteNumber} với logo, màu sắc và định dạng đầy đủ`,
      });
    } catch (error) {
      console.error('Excel export error:', error);
      toast({
        title: "Lỗi xuất Excel", 
        description: "Có lỗi xảy ra khi xuất file Excel",
        variant: "destructive",
      });
    }
  };

  const handlePrint = () => {
    const printContent = document.getElementById('quote-preview');
    if (printContent) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Báo giá ${quote.quoteNumber}</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #333; padding: 8px; text-align: left; }
                th { background-color: #f0f0f0; font-weight: bold; }
                .header { text-align: center; margin-bottom: 30px; }
                .company-title { font-size: 24px; font-weight: bold; color: #d32f2f; }
                .quote-title { font-size: 20px; font-weight: bold; color: #1976d2; }
                .info-section { display: inline-block; width: 45%; margin: 10px; padding: 15px; border: 1px solid #ccc; }
                .total-row { background-color: #f5f5f5; font-weight: bold; }
                @media print { 
                  @page { margin: 1cm; }
                  body { margin: 0; }
                }
              </style>
            </head>
            <body>
              ${printContent.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
        printWindow.close();
      }
    }
  };

  const handleExportPDF = async () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      pdf.setFont('helvetica');
      
      pdf.setFontSize(16);
      pdf.setTextColor(220, 47, 47);
      pdf.text('CÔNG TY TNHH GIA LỘC HƯNG PHÁT', 20, 20);
      
      pdf.setFontSize(18);
      pdf.setTextColor(25, 118, 210);
      pdf.text('BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN', 105, 50, { align: 'center' });
      
      pdf.save(`BaoGia_${quote.quoteNumber}_${new Date().toISOString().split('T')[0]}.pdf`);
      
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Có lỗi khi xuất PDF. Vui lòng thử lại.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-screen overflow-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>Xem trước báo giá</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handlePrint} variant="outline" size="sm">
                <Printer className="h-4 w-4 mr-2" />
                In
              </Button>
              <Button onClick={handleExportPDF} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Xuất PDF
              </Button>
              <Button onClick={handleExportExcel} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Xuất Excel với Logo & Màu sắc
              </Button>
              <Button onClick={() => onOpenChange(false)} variant="ghost" size="sm">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="bg-white" id="quote-preview" style={{ fontFamily: 'Times New Roman, serif' }}>
          <div className="p-8 max-w-5xl mx-auto">
            <div className="text-center mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="w-32 h-20 bg-black rounded flex items-center justify-center overflow-hidden">
                  <img 
                    src={templateSettings.logoUrl} 
                    alt="Company Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-right">
                  <h1 className="text-2xl font-bold mb-2" style={{ color: templateSettings.companyTitleColor }}>
                    {templateSettings.companyTitle}
                  </h1>
                  <p className="text-sm text-gray-600">Hà Nội ngày {currentDate.getDate()} tháng {currentDate.getMonth() + 1} năm {currentDate.getFullYear()}</p>
                </div>
              </div>
              
              <div className="text-left text-sm mb-6 space-y-1">
                <p>Địa chỉ: {templateSettings.address}</p>
                <p>Điện thoại: {templateSettings.phone}</p>
                <p>MST: {templateSettings.taxCode}</p>
                <p>Trụ sở: {templateSettings.headquarters}</p>
                <p>STK: {templateSettings.bankInfo}</p>
              </div>
              
              <h2 className="text-3xl font-bold mb-8" style={{ color: templateSettings.quoteTitleColor }}>
                BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                <h3 className="font-bold text-lg mb-4 text-blue-800 border-b border-blue-200 pb-2">
                  THÔNG TIN KHÁCH HÀNG:
                </h3>
                <div className="space-y-3 text-base">
                  <p><strong className="text-gray-900 w-28 inline-block">Tên KH:</strong> {customerName}</p>
                </div>
              </div>
              
              <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                <h3 className="font-bold text-lg mb-4 text-green-800 border-b border-green-200 pb-2">
                  THÔNG TIN BÁO GIÁ:
                </h3>
                <div className="space-y-3 text-base">
                  <p><strong className="text-gray-900 w-28 inline-block">Số báo giá:</strong> {quote.quoteNumber || 'BG-20250717-082'}</p>
                  <p><strong>Ngày báo giá:</strong> {currentDate.toLocaleDateString('vi-VN')}</p>
                  <p><strong>Ngày hết hạn:</strong> {expiryDate}</p>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <Table className="border border-gray-300">
                <TableHeader>
                  <TableRow className="bg-yellow-200">
                    <TableHead className="border border-gray-300 text-center font-bold">STT</TableHead>
                    <TableHead className="border border-gray-300 text-center font-bold">SẢN PHẨM</TableHead>
                    <TableHead className="border border-gray-300 text-center font-bold">QUY CÁCH (CM)</TableHead>
                    <TableHead className="border border-gray-300 text-center font-bold">CHẤT LIỆU</TableHead>
                    <TableHead className="border border-gray-300 text-center font-bold">SỐ LƯỢNG</TableHead>
                    <TableHead className="border border-gray-300 text-center font-bold">ĐƠN GIÁ</TableHead>
                    <TableHead className="border border-gray-300 text-center font-bold">THÀNH TIỀN</TableHead>
                    <TableHead className="border border-gray-300 text-center font-bold">Ghi Chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item: any, index: number) => (
                    <TableRow key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <TableCell className="border border-gray-300 text-center">{index + 1}</TableCell>
                      <TableCell className="border border-gray-300">{item.name || 'Bao ve nem chan bong 100x200'}</TableCell>
                      <TableCell className="border border-gray-300 text-sm">{item.specifications || 'Bao may bo chun quanh đệm, vải được tính trừ co theo nhà sản xuất'}</TableCell>
                      <TableCell className="border border-gray-300 text-sm">{item.category || 'Vải T225 40% Cotton 35% Polyester 25% Lụa, mật độ sợi 225 sợi/inch vuông. Vải ít nhăn, không xù, không bai màu'}</TableCell>
                      <TableCell className="border border-gray-300 text-center">{item.quantity || 1}</TableCell>
                      <TableCell className="border border-gray-300 text-right">{formatCurrency(item.price || 180000)}</TableCell>
                      <TableCell className="border border-gray-300 text-right font-semibold">{formatCurrency(item.total || 180000)}</TableCell>
                      <TableCell className="border border-gray-300"></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mb-8">
              <div className="flex justify-end">
                <div className="w-96 border border-gray-300">
                  <div className="bg-orange-100 border-b border-gray-300 p-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-base">TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT:</span>
                      <span className="font-bold text-base" style={{ color: templateSettings.companyTitleColor }}>{formatCurrency(subtotal)}</span>
                    </div>
                  </div>
                  <div className="bg-orange-100 border-b border-gray-300 p-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">GTGT (8%):</span>
                      <span className="font-bold" style={{ color: templateSettings.companyTitleColor }}>{formatCurrency(vatAmount)}</span>
                    </div>
                  </div>
                  <div className="bg-orange-200 border-b border-gray-300 p-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-base">TỔNG TIỀN ĐÃ BAO GỒM GTGT:</span>
                      <span className="font-bold text-lg" style={{ color: templateSettings.companyTitleColor }}>{formatCurrency(totalWithVat)}</span>
                    </div>
                  </div>
                  <div className="bg-yellow-100 border-b border-gray-300 p-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">THANH TOÁN LẦN 1:</span>
                      <span className="font-bold" style={{ color: templateSettings.companyTitleColor }}>{formatCurrency(firstPayment)}</span>
                    </div>
                  </div>
                  <div className="bg-yellow-200 p-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-base">CÒN LẠI:</span>
                      <span className="font-bold text-lg" style={{ color: templateSettings.companyTitleColor }}>{formatCurrency(remaining)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <div className="space-y-2 text-sm">
                {templateSettings.terms.map((term, index) => (
                  <p key={index}>{index + 1}. {term}</p>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-12 mt-12">
              <div className="text-center">
                <p className="font-bold mb-8">ĐẠI DIỆN CÔNG TY</p>
                <div className="mb-8 h-16"></div>
                <p className="font-bold">GIÁM ĐỐC</p>
              </div>
              <div className="text-center">
                <p className="font-bold mb-8">KHÁCH HÀNG</p>
                <div className="mb-8 h-16"></div>
                <p className="text-sm">Ký tên và đóng dấu xác nhận</p>
              </div>
            </div>

            {/* Footer Note */}
            {templateSettings.footerNote && (
              <div className="text-center mt-8 pt-4 border-t border-gray-300">
                <p className="text-sm italic text-gray-600">{templateSettings.footerNote}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}