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

  const handleExportExcel = async () => {
    try {
      // Tạo workbook mới
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([]);
      
      // Cấu trúc layout Excel theo yêu cầu
      const companyInfo = {
        name: 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT',
        address: 'Số 21 Ngõ 562 Đường Lĩnh Nam, Phường Lĩnh Nam, Quận Hoàng Mai, Thành Phố Hà Nội, Việt Nam.',
        phone: '0828686866',
        taxCode: '0123456789',
        bankAccount: 'Ngân hàng TMCP đầu tư và phát triển Việt Nam ( BIDV) – Chi nhánh Hà Nội. / 2110199996'
      };
      
      const currentDate = new Date();
      const formattedDate = `${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
      
      // LAYOUT CHÍNH XÁC theo hình mẫu với spacing đúng
      XLSX.utils.sheet_add_aoa(ws, [
        [companyInfo.name], // Row 1
        [''], // Row 2: Empty
        [`Địa chỉ: ${companyInfo.address.replace('Số 21 Ngõ 562 Đường Lĩnh Nam, Phường Lĩnh Nam, Quận Hoàng Mai, Thành Phố Hà Nội, Việt Nam.', 'Số 21 Ngõ 562 Đường Lĩnh Nam, Phường Lĩnh Nam, Quận Hoàng Mai, Thành Phố Hà Nội, Việt Nam.')}`], // Row 3
        [''], // Row 4: Empty
        [`Điện thoại: ${companyInfo.phone}`, '', '', '', '', `MST: ${companyInfo.taxCode}`], // Row 5
        [''], // Row 6: Empty  
        [`Trụ sở: Số 21 Ngõ 562 đường Lĩnh Nam, Phường Lĩnh Nam, Quận Hoàng Mai, Hà Nội`], // Row 7
        [`STK: Ngân hàng TMCP đầu tư và phát triển Việt Nam ( BIDV) – Chi nhánh Hà Nội. / 2110199996`], // Row 8
        [''], // Row 9: Empty
        ['BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN'], // Row 10
        [''], // Row 11: Empty
        [''], // Row 12: Empty
        [`Hà Nội ngày ${currentDate.getDate()} tháng ${currentDate.getMonth() + 1} năm ${currentDate.getFullYear()}`], // Row 13
        [''], // Row 14: Empty
        [''], // Row 15: Empty
        ['THÔNG TIN KHÁCH HÀNG:', '', '', '', '', 'THÔNG TIN BÁO GIÁ:'], // Row 16
        [''], // Row 17: Empty
        [`Tên KH: ${customerName}`, '', '', '', '', `Số báo giá: ${quote.quoteNumber || 'BG-20250717-082'}`], // Row 18
        ['', '', '', '', '', `Ngày báo giá: ${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`], // Row 19
        ['', '', '', '', '', `Ngày hết hạn: ${expiryDate || '31/7/2025'}`], // Row 20
        [''], // Row 21: Empty
        [''], // Row 22: Empty
        ['STT', 'SẢN PHẨM', 'QUY CÁCH (CM)', 'CHẤT LIỆU', 'SỐ LƯỢNG', 'ĐƠN GIÁ', 'THÀNH TIỀN', 'Ghi Chú'] // Row 23: Header
      ], { origin: 'A1' });
      
      // Thêm dữ liệu sản phẩm từ Row 24 (sau header Row 23)
      let currentRow = 24;
      items.forEach((item: any, index: number) => {
        XLSX.utils.sheet_add_aoa(ws, [[
          index + 1, // STT
          item.name || 'Ga chun ks T225 sọc 100x200x15cm',
          item.specifications || 'Ga may bo chun quanh đệm , vải được tính trừ co theo nhà sản xuất',
          item.category || 'Vải T225 40% Cotton 35% Polyester 25% Lụa , mật độ sợi 225 sợi / inch vuông . Vải ít nhăn , không xù , không bai màu',
          item.quantity || 144,
          item.price || 140000,
          item.total || (item.quantity * item.price),
          '' // Ghi chú
        ]], { origin: `A${currentRow}` });
        currentRow++;
      });
      
      // Tổng cộng và tính toán
      currentRow += 2;
      XLSX.utils.sheet_add_aoa(ws, [
        ['', '', '', '', '', 'TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT', subtotal],
        ['', '', '', '', '', `GTGT (${vatRate}%)`, vatAmount],
        ['', '', '', '', '', 'TỔNG TIỀN ĐÃ BAO GỒM GTGT', totalWithVat],
        ['', '', '', '', '', 'THANH TOÁN LẦN 1', firstPayment],
        ['', '', '', '', '', 'CÒN LẠI', remaining]
      ], { origin: `A${currentRow}` });
      
      // Điều khoản
      currentRow += 7;
      XLSX.utils.sheet_add_aoa(ws, [
        ['1. Bảo giá có hiệu lực trong 15 ngày kể từ ngày lập.'],
        ['2. Thanh toán: 30% trước khi sản xuất, 70% trước khi giao hàng.'],
        ['3. Thời gian giao hàng: 7-10 ngày sau khi sản xuất hoàn tất cọc.'],
        ['4. Chất lượng sản phẩm được đảm bảo theo tiêu chuẩn.']
      ], { origin: `A${currentRow}` });
      
      // Chữ ký
      currentRow += 6;
      XLSX.utils.sheet_add_aoa(ws, [
        ['ĐẠI DIỆN CÔNG TY', '', '', '', '', 'KHÁCH HÀNG'],
        [''],
        ['GIÁM ĐỐC', '', '', '', '', 'Ký tên và đóng dấu xác nhận']
      ], { origin: `A${currentRow}` });
      
      // Merge cells theo cấu trúc yêu cầu
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // A1:G1 - Company name
        { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }, // A2:G2 - Address
        { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } }, // A3:C3 - Phone
        { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } }, // A4:G4 - Bank info
        { s: { r: 5, c: 0 }, e: { r: 5, c: 6 } }, // A6:G6 - Quote title
        { s: { r: 7, c: 0 }, e: { r: 7, c: 6 } }, // A8:G8 - Date
        { s: { r: 9, c: 0 }, e: { r: 9, c: 3 } }, // A10:D10 - Customer info header
        { s: { r: 10, c: 0 }, e: { r: 10, c: 3 } }, // A11:D11 - Customer name
      ];
      
      // Set column widths theo yêu cầu
      ws['!cols'] = [
        { wch: 5 },   // A: STT (width=5)
        { wch: 25 },  // B: SẢN PHẨM (width=25)
        { wch: 30 },  // C: QUY CÁCH (width=30)
        { wch: 35 },  // D: CHẤT LIỆU (width=35)
        { wch: 12 },  // E: SỐ LƯỢNG (width=12)
        { wch: 15 },  // F: ĐƠN GIÁ (width=15)
        { wch: 18 },  // G: THÀNH TIỀN (width=18)
        { wch: 15 }   // H: Ghi Chú (width=15)
      ];
      
      // Áp dụng formatting chính xác
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      
      for (let row = 0; row <= range.e.r; row++) {
        for (let col = 0; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          if (!ws[cellAddress]) continue;
          
          // Base styling với border
          ws[cellAddress].s = {
            alignment: { vertical: "center", wrapText: true },
            font: { name: "Arial", size: 10 },
            border: {
              top: { style: "thin", color: { rgb: "000000" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "000000" } },
              right: { style: "thin", color: { rgb: "000000" } }
            }
          };
          
          // Specific styling cho từng section
          if (row === 0) {
            // Company name - Arial 14pt, bold, căn giữa
            ws[cellAddress].s = {
              ...ws[cellAddress].s,
              font: { name: "Arial", size: 14, bold: true },
              alignment: { horizontal: "center", vertical: "center" },
              fill: { fgColor: { rgb: "E6E6FA" } } // Light purple background
            };
          } else if (row === 1) {
            // Address - Arial 11pt, căn giữa
            ws[cellAddress].s = {
              ...ws[cellAddress].s,
              font: { name: "Arial", size: 11 },
              alignment: { horizontal: "center", vertical: "center" }
            };
          } else if (row === 2) {
            // Phone & Tax - Arial 10pt
            ws[cellAddress].s = {
              ...ws[cellAddress].s,
              font: { name: "Arial", size: 10 }
            };
          } else if (row === 5) {
            // Quote title - Arial 16pt, bold, căn giữa
            ws[cellAddress].s = {
              ...ws[cellAddress].s,
              font: { name: "Arial", size: 16, bold: true },
              alignment: { horizontal: "center", vertical: "center" },
              fill: { fgColor: { rgb: "ADD8E6" } } // Light blue background
            };
          } else if (row === 7) {
            // Date - căn giữa
            ws[cellAddress].s = {
              ...ws[cellAddress].s,
              alignment: { horizontal: "center", vertical: "center" }
            };
          } else if (row === 14) {
            // Product table header - Arial 11pt, border đậm
            ws[cellAddress].s = {
              ...ws[cellAddress].s,
              font: { name: "Arial", size: 11, bold: true },
              alignment: { horizontal: "center", vertical: "center" },
              fill: { fgColor: { rgb: "FFFF99" } }, // Yellow background
              border: {
                top: { style: "thick", color: { rgb: "000000" } },
                bottom: { style: "thick", color: { rgb: "000000" } },
                left: { style: "thick", color: { rgb: "000000" } },
                right: { style: "thick", color: { rgb: "000000" } }
              }
            };
          } else if (row >= 15 && row < 15 + items.length) {
            // Product data rows
            if (col === 0 || col === 4) {
              // STT và SỐ LƯỢNG - căn giữa
              ws[cellAddress].s = {
                ...ws[cellAddress].s,
                alignment: { horizontal: "center", vertical: "center" }
              };
            } else if (col === 5 || col === 6) {
              // ĐƠN GIÁ và THÀNH TIỀN - căn phải, number format
              ws[cellAddress].s = {
                ...ws[cellAddress].s,
                alignment: { horizontal: "right", vertical: "center" },
                numFmt: "#,##0"
              };
            } else if (col === 2 || col === 3) {
              // QUY CÁCH và CHẤT LIỆU - text wrapping
              ws[cellAddress].s = {
                ...ws[cellAddress].s,
                alignment: { vertical: "center", wrapText: true }
              };
            }
          }
          
          // Number formatting cho các cột tiền tệ
          if ((col === 4 || col === 5 || col === 6) && row >= 15) {
            ws[cellAddress].s = {
              ...ws[cellAddress].s,
              numFmt: "#,##0"
            };
          }
        }
      }
      
      // Row height auto-fit cho text dài
      ws['!rows'] = [];
      for (let i = 0; i <= range.e.r; i++) {
        if (i >= 15 && i < 15 + items.length) {
          ws['!rows'][i] = { hpt: 40 }; // Taller rows for product data
        } else {
          ws['!rows'][i] = { hpt: 25 }; // Standard height
        }
      }
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Báo Giá');
      
      // Export file với WrapText và Merge & Center
      XLSX.writeFile(wb, `BaoGia_${quote.quoteNumber || 'BG-' + new Date().toISOString().split('T')[0]}.xlsx`);
      
    } catch (error) {
      console.error('Error exporting Excel:', error);
      alert('Có lỗi khi xuất Excel. Vui lòng thử lại.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chi tiết báo giá</DialogTitle>
        </DialogHeader>
        
        <div className="max-w-5xl w-full max-h-[95vh] overflow-y-auto">
          {/* Action buttons */}
          <div className="flex items-center justify-between p-6 border-b print:hidden">
            <h2 className="text-xl font-bold text-gray-900">Xem trước báo giá</h2>
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={handleExportExcel}>
                <Download className="w-4 h-4 mr-2" />
                Xuất Excel với Logo & Màu sắc
              </Button>
              <Button variant="outline" onClick={handleExportPDF}>
                <Download className="w-4 h-4 mr-2" />
                Xuất PDF
              </Button>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                In
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Quote content */}
          <div className="p-2 bg-white min-h-screen" id="quote-preview">
            {/* Header with logo and company info */}
            <div className="mb-8">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start space-x-8">
                  <div className="flex-shrink-0">
                    <img 
                      src="/lovable-uploads/6b66a50f-3a2e-4f5a-bad8-950cf55392fa.png" 
                      alt="Company Logo" 
                      className="object-contain bg-white p-4 rounded-lg border border-gray-300 shadow-md"
                      style={{ width: '300px', height: '180px' }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl font-bold text-red-600 mb-3 leading-tight">
                      XƯỞNG SẢN XUẤT CHĂN GA GỐI NỆM JOLIE'FAM
                    </h1>
                    <div className="text-sm text-gray-700 space-y-1.5 leading-relaxed">
                      <p><strong className="text-gray-900">Địa chỉ:</strong> Số 551 Linh Nam - Hoàng Mai - Hà Nội</p>
                      <p><strong className="text-gray-900">Điện thoại:</strong> 0828686866 / Công Minh</p>
                      <p><strong className="text-gray-900">MST:</strong> 0108652480 / Công ty TNHH Gia Lộc Hùng Phát</p>
                      <p><strong className="text-gray-900">Trụ sở:</strong> Số 21 Ngõ 562 đường Linh Nam, Phường Linh Nam, Quận Hoàng Mai, Hà Nội</p>
                      <p><strong className="text-gray-900">STK Ngân Hàng:</strong> MBbank (Ngân hàng quân đội) / 3798686868888 / Phan Văn Phúc</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quote title */}
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-blue-600 mb-2">Báo giá sản phẩm</h2>
              <p className="text-right text-lg font-medium text-gray-700">
                Hà Nội ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
              </p>
            </div>

            {/* Customer and quote info */}
            <div className="grid grid-cols-2 gap-12 mb-8">
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                <h3 className="font-bold text-lg mb-4 text-blue-800 border-b border-blue-200 pb-2">
                  THÔNG TIN KHÁCH HÀNG:
                </h3>
                <div className="space-y-3 text-base">
                  <p><strong className="text-gray-900 w-20 inline-block">Tên KH:</strong> {customerName}</p>
                  <p><strong className="text-gray-900 w-20 inline-block">SĐT:</strong> {phone}</p>
                  <p><strong className="text-gray-900 w-20 inline-block">EMAIL:</strong> {email}</p>
                  <p><strong className="text-gray-900 w-20 inline-block">Địa chỉ:</strong> {address}</p>
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