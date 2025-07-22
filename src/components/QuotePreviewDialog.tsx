import React from "react";
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
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

interface QuotePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: any;
}

export function QuotePreviewDialog({ open, onOpenChange, quote }: QuotePreviewDialogProps) {
  if (!quote) return null;

  // Parse customer info from notes
  const notes = quote.notes || '';
  const customerName = notes.match(/Khách hàng:\s*(.+)/)?.[1] || 'N/A';
  const phone = notes.match(/Điện thoại:\s*(.+)/)?.[1] || 'N/A';
  const email = notes.match(/Email:\s*(.+)/)?.[1] || 'N/A';
  const address = notes.match(/Địa chỉ:\s*(.+)/)?.[1] || 'N/A';
  const expiryDate = notes.match(/Ngày hết hạn:\s*(.+)/)?.[1] || 'N/A';

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

  const handlePrint = () => {
    // In document bằng CSS print
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
      // Tạo PDF với jsPDF (không sử dụng eval)
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Cấu hình font và màu sắc
      pdf.setFont('helvetica');
      
      // Header công ty
      pdf.setFontSize(16);
      pdf.setTextColor(220, 47, 47); // Red color
      pdf.text('XƯỞNG SẢN XUẤT CHĂN GA GỐI NỆM JOLIE\'FAM', 20, 20);
      
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Địa chỉ: Số 551 Linh Nam - Hoàng Mai - Hà Nội', 20, 30);
      pdf.text('Điện thoại: 0828686866 / Công Minh', 20, 35);
      pdf.text('MST: 0108652480 / Công ty TNHH Gia Lộc Hùng Phát', 20, 40);
      pdf.text('Trụ sở: Số 21 Ngõ 562 đường Linh Nam, Phường Linh Nam, Quận Hoàng Mai, Hà Nội', 20, 45);
      pdf.text('STK Ngân Hàng: MBbank (Ngân hàng quân đội) / 3798686868888 / Phan Văn Phúc', 20, 50);
      
      // Tiêu đề báo giá
      pdf.setFontSize(18);
      pdf.setTextColor(25, 118, 210); // Blue color
      pdf.text('BÁO GIÁ SẢN PHẨM', 105, 70, { align: 'center' });
      
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      const currentDate = new Date();
      pdf.text(`Hà Nội ngày ${currentDate.getDate()} tháng ${currentDate.getMonth() + 1} năm ${currentDate.getFullYear()}`, 150, 80);
      
      // Thông tin khách hàng
      pdf.setFontSize(12);
      pdf.setTextColor(25, 118, 210);
      pdf.text('THÔNG TIN KHÁCH HÀNG:', 20, 100);
      
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Tên KH: ${customerName}`, 20, 110);
      pdf.text(`SĐT: ${phone}`, 20, 115);
      pdf.text(`EMAIL: ${email}`, 20, 120);
      pdf.text(`Địa chỉ: ${address}`, 20, 125);
      
      // Thông tin báo giá
      pdf.setFontSize(12);
      pdf.setTextColor(25, 118, 210);
      pdf.text('THÔNG TIN BÁO GIÁ:', 110, 100);
      
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Số báo giá: ${quote.quoteNumber}`, 110, 110);
      pdf.text(`Ngày báo giá: ${quote.quoteDate}`, 110, 115);
      pdf.text(`Ngày hết hạn: ${expiryDate}`, 110, 120);
      
      // Bảng sản phẩm
      let yPos = 145;
      
      // Header bảng
      pdf.setFillColor(255, 235, 59); // Yellow background
      pdf.rect(20, yPos, 170, 10, 'F');
      
      pdf.setFontSize(8);
      pdf.setTextColor(0, 0, 0);
      pdf.text('STT', 22, yPos + 7);
      pdf.text('SẢN PHẨM', 35, yPos + 7);
      pdf.text('QUY CÁCH', 75, yPos + 7);
      pdf.text('CHẤT LIỆU', 95, yPos + 7);
      pdf.text('SỐ LƯỢNG', 115, yPos + 7);
      pdf.text('ĐƠN GIÁ', 135, yPos + 7);
      pdf.text('THÀNH TIỀN', 155, yPos + 7);
      
      yPos += 15;
      
      // Dữ liệu sản phẩm
      items.forEach((item: any, index: number) => {
        if (yPos > 250) { // Nếu gần hết trang, tạo trang mới
          pdf.addPage();
          yPos = 20;
        }
        
        pdf.setFontSize(8);
        pdf.text((index + 1).toString(), 22, yPos);
        pdf.text(item.name?.substring(0, 20) || '', 35, yPos);
        pdf.text(item.specifications?.substring(0, 10) || 'N/A', 75, yPos);
        pdf.text(item.category?.substring(0, 10) || 'N/A', 95, yPos);
        pdf.text(item.quantity?.toString() || '0', 115, yPos);
        pdf.text(formatCurrency(item.price), 135, yPos);
        pdf.text(formatCurrency(item.total), 155, yPos);
        
        yPos += 8;
      });
      
      // Tổng cộng
      yPos += 10;
      pdf.setFillColor(245, 245, 245);
      pdf.rect(20, yPos, 170, 8, 'F');
      pdf.setFontSize(9);
      pdf.setTextColor(220, 47, 47);
      pdf.text('TỔNG GIÁ TRỊ CHƯA BAO GỒM GTGT', 25, yPos + 5);
      pdf.text(formatCurrency(subtotal), 155, yPos + 5);
      
      yPos += 12;
      pdf.rect(20, yPos, 170, 8, 'F');
      pdf.text(`GTGT (${vatRate}%)`, 25, yPos + 5);
      pdf.text(formatCurrency(vatAmount), 155, yPos + 5);
      
      yPos += 12;
      pdf.rect(20, yPos, 170, 8, 'F');
      pdf.text('TỔNG TIỀN ĐÃ BAO GỒM GTGT', 25, yPos + 5);
      pdf.text(formatCurrency(totalWithVat), 155, yPos + 5);
      
      yPos += 12;
      pdf.rect(20, yPos, 170, 8, 'F');
      pdf.text('THANH TOÁN LẦN 1', 25, yPos + 5);
      pdf.text(formatCurrency(firstPayment), 155, yPos + 5);
      
      yPos += 12;
      pdf.setFillColor(255, 249, 196);
      pdf.rect(20, yPos, 170, 8, 'F');
      pdf.setFontSize(10);
      pdf.text('CÒN LẠI', 25, yPos + 5);
      pdf.text(formatCurrency(remaining), 155, yPos + 5);
      
      // Điều khoản
      yPos += 20;
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.text('1. Bảng báo giá áp dụng trong vòng 10 ngày', 20, yPos);
      pdf.text('2. Bảng giá chưa bao gồm cước vận chuyển', 20, yPos + 8);
      pdf.text('3. Địa Điểm giao Hàng: Thỏa Thuận', 20, yPos + 16);
      pdf.text('4. Hình thức thanh toán: Đặt cọc trước 30%. 70% còn lại thanh toán khi giao hàng', 20, yPos + 24);
      
      // Chữ ký
      yPos += 40;
      pdf.setFontSize(10);
      pdf.text('ĐẠI DIỆN CÔNG TY', 40, yPos);
      pdf.text('KHÁCH HÀNG', 140, yPos);
      pdf.text('GIÁM ĐỐC', 40, yPos + 20);
      pdf.text('Ký tên và đóng dấu xác nhận', 140, yPos + 20);
      
      // Lưu file
      pdf.save(`BaoGia_${quote.quoteNumber}_${new Date().toISOString().split('T')[0]}.pdf`);
      
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Có lỗi khi xuất PDF. Vui lòng thử lại.');
    }
  };

  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      
      const currentDate = new Date();
      const day = currentDate.getDate();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      
      // Tạo data theo đúng format trong hình ảnh mẫu
      const data = [
        // Row 1: Logo placeholder + Company Name (Red) + Date
        ['LOGO', 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT', '', '', '', '', '', `Hà Nội ngày ${day} tháng ${month} năm ${year}`],
        
        // Row 2-6: Company Details
        ['', 'Địa chỉ: Số 21 Ngõ 562 Đường Lĩnh Nam, Phường Lĩnh Nam, Quận Hoàng Mai, Thành Phố Hà Nội, Việt Nam.', '', '', '', '', '', ''],
        ['', 'Điện thoại: 0828686866', '', '', '', '', '', ''],
        ['', 'MST: 0123456789', '', '', '', '', '', ''],
        ['', 'Trụ sở: Số 21 Ngõ 562 đường Lĩnh Nam, Phường Lĩnh Nam, Quận Hoàng Mai, Hà Nội', '', '', '', '', '', ''],
        ['', 'STK: Ngân hàng TMCP đầu tư và phát triển Việt Nam (BIDV) – Chi nhánh Hà Nội. / 2110199996', '', '', '', '', '', ''],
        
        // Row 7: Empty
        ['', '', '', '', '', '', '', ''],
        
        // Row 8: Title - BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN (Blue, centered)
        ['BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN', '', '', '', '', '', '', ''],
        
        // Row 9: Empty
        ['', '', '', '', '', '', '', ''],
        
        // Row 10-13: Customer Info and Quote Info with light blue backgrounds
        ['THÔNG TIN KHÁCH HÀNG:', '', '', '', 'THÔNG TIN BÁO GIÁ:', '', '', ''],
        [`Tên KH: ${customerName}`, '', '', '', `Số báo giá: ${quote.quoteNumber || 'BG-20250717-082'}`, '', '', ''],
        ['', '', '', '', `Ngày báo giá: ${day}/${month}/${year}`, '', '', ''],
        ['', '', '', '', `Ngày hết hạn: ${expiryDate || '31/7/2025'}`, '', '', ''],
        
        // Row 14: Empty
        ['', '', '', '', '', '', '', ''],
        
        // Row 15: Product Table Header with yellow background
        ['STT', 'SẢN PHẨM', 'QUY CÁCH (CM)', 'CHẤT LIỆU', 'SỐ LƯỢNG', 'ĐƠN GIÁ', 'THÀNH TIỀN', 'Ghi Chú']
      ];
      
      // Add products data
      let productRowCount = 0;
      items.forEach((item: any, index: number) => {
        data.push([
          index + 1,
          item.name || 'Ga chun ks T225 sọc 100x200x15cm',
          item.specifications || 'Ga may bo chun quanh đệm, vải được tính trừ co theo nhà sản xuất',
          item.category || 'Vải T225 40% Cotton 35% Polyester 25% Lụa, mật độ sợi 225 sợi/inch vuông. Vải ít nhăn, không xù, không bai màu',
          item.quantity || 144,
          item.price || 140000,
          item.total || 20160000,
          ''
        ]);
        productRowCount++;
      });
      
      // Add totals section with red text
      data.push(['', '', '', '', '', '', '', '']); // Empty row
      data.push(['', '', '', '', '', 'TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT', formatCurrency(subtotal), '']);
      data.push(['', '', '', '', '', `GTGT (${vatRate}%)`, formatCurrency(vatAmount), '']);
      data.push(['', '', '', '', '', 'TỔNG TIỀN ĐÃ BAO GỒM GTGT', formatCurrency(totalWithVat), '']);
      data.push(['', '', '', '', '', 'THANH TOÁN LẦN 1', formatCurrency(firstPayment), '']);
      data.push(['', '', '', '', '', 'CÒN LẠI', formatCurrency(remaining), '']);
      
      // Add terms
      data.push(['', '', '', '', '', '', '', '']); // Empty row
      data.push(['', '', '', '', '', '', '', '']); // Empty row
      data.push(['1. Bảo giá có hiệu lực trong 15 ngày kể từ ngày lập.', '', '', '', '', '', '', '']);
      data.push(['2. Thanh toán: 50% trước khi sản xuất, 50% trước khi giao hàng.', '', '', '', '', '', '', '']);
      data.push(['3. Thời gian giao hàng: 7-10 ngày làm việc sau khi nhận đặt cọc.', '', '', '', '', '', '', '']);
      data.push(['4. Chất lượng sản phẩm được đảm bảo theo tiêu chuẩn.', '', '', '', '', '', '', '']);
      
      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(data);
      
      // Set column widths theo hình mẫu
      ws['!cols'] = [
        { wch: 8 },   // A: STT/Logo
        { wch: 35 },  // B: SẢN PHẨM
        { wch: 25 },  // C: QUY CÁCH
        { wch: 30 },  // D: CHẤT LIỆU
        { wch: 12 },  // E: SỐ LƯỢNG
        { wch: 15 },  // F: ĐƠN GIÁ
        { wch: 18 },  // G: THÀNH TIỀN
        { wch: 12 }   // H: Ghi Chú
      ];
      
      // Set merges - theo đúng layout trong hình mẫu
      const totalsStartRow = 15 + productRowCount + 1;
      ws['!merges'] = [
        // Company info merges
        { s: { r: 0, c: 1 }, e: { r: 0, c: 6 } }, // Company name
        { s: { r: 1, c: 1 }, e: { r: 1, c: 7 } }, // Address
        { s: { r: 2, c: 1 }, e: { r: 2, c: 7 } }, // Phone
        { s: { r: 3, c: 1 }, e: { r: 3, c: 7 } }, // MST
        { s: { r: 4, c: 1 }, e: { r: 4, c: 7 } }, // Trụ sở
        { s: { r: 5, c: 1 }, e: { r: 5, c: 7 } }, // STK
        
        // Title merge
        { s: { r: 7, c: 0 }, e: { r: 7, c: 7 } }, // BẢNG BÁO GIÁ title
        
        // Customer and quote info merges
        { s: { r: 9, c: 0 }, e: { r: 9, c: 3 } },  // THÔNG TIN KHÁCH HÀNG
        { s: { r: 9, c: 4 }, e: { r: 9, c: 7 } },  // THÔNG TIN BÁO GIÁ
        { s: { r: 10, c: 0 }, e: { r: 10, c: 3 } }, // Tên KH
        { s: { r: 10, c: 4 }, e: { r: 10, c: 7 } }, // Số báo giá
        { s: { r: 11, c: 4 }, e: { r: 11, c: 7 } }, // Ngày báo giá
        { s: { r: 12, c: 4 }, e: { r: 12, c: 7 } }, // Ngày hết hạn
        
        // Totals merges
        { s: { r: totalsStartRow, c: 0 }, e: { r: totalsStartRow, c: 5 } },     // TỔNG GIÁ TRỊ
        { s: { r: totalsStartRow + 1, c: 0 }, e: { r: totalsStartRow + 1, c: 5 } }, // GTGT
        { s: { r: totalsStartRow + 2, c: 0 }, e: { r: totalsStartRow + 2, c: 5 } }, // TỔNG TIỀN
        { s: { r: totalsStartRow + 3, c: 0 }, e: { r: totalsStartRow + 3, c: 5 } }, // THANH TOÁN
        { s: { r: totalsStartRow + 4, c: 0 }, e: { r: totalsStartRow + 4, c: 5 } }, // CÒN LẠI
      ];
      
      // Add sheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Báo Giá');
      
      // Export file with proper naming
      const fileName = `BaoGia_${quote.quoteNumber || 'BG-' + year + String(month).padStart(2, '0') + String(day).padStart(2, '0')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
    } catch (error) {
      console.error('Lỗi xuất Excel:', error);
      alert('Có lỗi khi xuất Excel. Vui lòng thử lại.');
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
        
        <div className="bg-white" id="quote-preview">
          <div className="p-8 max-w-5xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="w-32 h-20 bg-black rounded flex items-center justify-center">
                  <span className="text-yellow-400 font-bold text-lg">Jolie'Fam</span>
                </div>
                <div className="text-right">
                  <h1 className="text-2xl font-bold text-red-600 mb-2">
                    CÔNG TY TNHH GIA LỘC HƯNG PHÁT
                  </h1>
                  <p className="text-sm text-gray-600">Hà Nội ngày {currentDate.getDate()} tháng {currentDate.getMonth() + 1} năm {currentDate.getFullYear()}</p>
                </div>
              </div>
              
              <div className="text-left text-sm mb-6 space-y-1">
                <p>Địa chỉ: Số 21 Ngõ 562 Đường Lĩnh Nam, Phường Lĩnh Nam, Quận Hoàng Mai, Thành Phố Hà Nội, Việt Nam.</p>
                <p>Điện thoại: 0828686866</p>
                <p>MST: 0123456789</p>
                <p>Trụ sở: Số 21 Ngõ 562 đường Lĩnh Nam, Phường Lĩnh Nam, Quận Hoàng Mai, Hà Nội</p>
                <p>STK: Ngân hàng TMCP đầu tư và phát triển Việt Nam (BIDV) – Chi nhánh Hà Nội. / 2110199996</p>
              </div>
              
              <h2 className="text-3xl font-bold text-blue-600 mb-8">
                BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN
              </h2>
            </div>

            {/* Customer and Quote Info */}
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
                  <p><strong className="text-gray-900 w-28 inline-block">Số báo giá:</strong> {quote.quoteNumber}</p>
                  <p><strong>Ngày báo giá:</strong> {quote.quoteDate}</p>
                  <p><strong>Ngày hết hạn:</strong> {expiryDate}</p>
                </div>
              </div>
            </div>

            {/* Products table */}
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
                      <TableCell className="border border-gray-300">{item.name}</TableCell>
                      <TableCell className="border border-gray-300 text-center">{item.specifications}</TableCell>
                      <TableCell className="border border-gray-300">{item.category}</TableCell>
                      <TableCell className="border border-gray-300 text-center">{item.quantity}</TableCell>
                      <TableCell className="border border-gray-300 text-right">{formatCurrency(item.price)}</TableCell>
                      <TableCell className="border border-gray-300 text-right font-semibold">{formatCurrency(item.total)}</TableCell>
                      <TableCell className="border border-gray-300"></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="mb-8">
              <div className="grid grid-cols-2 gap-8">
                <div></div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 px-4 bg-orange-100 border border-orange-200 rounded">
                    <span className="font-semibold">TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT:</span>
                    <span className="font-bold">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 px-4 bg-orange-100 border border-orange-200 rounded">
                    <span className="font-semibold">GTGT (8%):</span>
                    <span className="font-bold">{formatCurrency(vatAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 px-4 bg-orange-200 border border-orange-300 rounded">
                    <span className="font-semibold">TỔNG TIỀN ĐÃ BAO GỒM GTGT:</span>
                    <span className="font-bold text-lg">{formatCurrency(totalWithVat)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 px-4 bg-orange-100 border border-orange-200 rounded">
                    <span className="font-semibold">THANH TOÁN LẦN 1:</span>
                    <span className="font-bold">{formatCurrency(firstPayment)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 px-4 bg-yellow-100 border border-yellow-300 rounded">
                    <span className="font-semibold">CÒN LẠI:</span>
                    <span className="font-bold text-lg">{formatCurrency(remaining)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Terms and conditions */}
            <div className="mb-8">
              <div className="space-y-2 text-sm">
                <p>1. Bảo giá có hiệu lực trong 15 ngày kể từ ngày lập.</p>
                <p>2. Thanh toán: 30% trước khi sản xuất, 70% trước khi giao hàng.</p>
                <p>3. Thời gian giao hàng: 7-10 ngày sau khi sản xuất hoàn tất cọc.</p>
                <p>4. Chất lượng sản phẩm được đảm bảo theo tiêu chuẩn.</p>
              </div>
              
              <div className="mt-6 text-center">
                <p className="italic text-blue-600 font-medium">
                  Cảm ơn Quý khách đã tin tướng và đặng sản phẩm của chúng tôi!
                </p>
              </div>
            </div>

            {/* Signature section */}
            <div className="grid grid-cols-2 gap-12 mt-12">
              <div className="text-center">
                <p className="font-bold mb-8">ĐẠI DIỆN CÔNG TY</p>
                <div className="mb-8 h-16"></div>
                <p className="font-bold">GIÁM ĐỐC</p>
                <p className="text-sm text-gray-600 mt-2">( Đã ký )</p>
              </div>
              <div className="text-center">
                <p className="font-bold mb-8">KHÁCH HÀNG</p>
                <div className="mb-8 h-16"></div>
                <p className="text-sm">Ký tên và đóng dấu xác nhận</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}