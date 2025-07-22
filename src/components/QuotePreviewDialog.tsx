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
import * as ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { useToast } from "@/hooks/use-toast";

interface QuotePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: any;
}

export function QuotePreviewDialog({ open, onOpenChange, quote }: QuotePreviewDialogProps) {
  const { toast } = useToast();

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
        const logoPath = '/lovable-uploads/4fde4f06-53d4-4a68-b7a0-47c6f5758e63.png';
        const logoResponse = await fetch(logoPath);
        
        if (logoResponse.ok) {
          const logoBlob = await logoResponse.blob();
          const logoArrayBuffer = await logoBlob.arrayBuffer();
          
          const logoId = workbook.addImage({
            buffer: logoArrayBuffer,
            extension: 'png',
          });
          
          // Add logo to worksheet (A1:C4)
          worksheet.addImage(logoId, {
            tl: { col: 0, row: 0 },
            ext: { width: 120, height: 60 }
          });
        }
      } catch (logoError) {
        console.warn('Could not load logo:', logoError);
      }

      // Company header (next to logo)
      worksheet.mergeCells('D1:H2');
      const companyCell = worksheet.getCell('D1');
      companyCell.value = 'CÔNG TY TNHH GIA LỘC HƯNG PHÁT';
      companyCell.font = { bold: true, size: 16, color: { argb: 'FFDC143C' } };
      companyCell.alignment = { vertical: 'middle', horizontal: 'center' };

      worksheet.mergeCells('D3:H4');
      const addressCell = worksheet.getCell('D3');
      addressCell.value = 'Địa chỉ: Số 21 Ngõ 562 Đường Lĩnh Nam, Phường Lĩnh Nam, Quận Hoàng Mai, Thành Phố Hà Nội, Việt Nam.\nĐiện thoại: 0828686866 | MST: 0123456789';
      addressCell.font = { size: 10, color: { argb: 'FF666666' } };
      addressCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

      // Quote title
      worksheet.mergeCells('A6:H7');
      const titleCell = worksheet.getCell('A6');
      titleCell.value = 'BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN';
      titleCell.font = { bold: true, size: 18, color: { argb: 'FF0066CC' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Date info
      worksheet.mergeCells('G8:H8');
      const dateCell = worksheet.getCell('G8');
      dateCell.value = `Hà Nội ngày ${currentDate.getDate()} tháng ${currentDate.getMonth() + 1} năm ${currentDate.getFullYear()}`;
      dateCell.font = { size: 10 };
      dateCell.alignment = { horizontal: 'right' };

      // Customer and Quote info headers
      let currentRow = 10;
      
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      const customerHeaderCell = worksheet.getCell(`A${currentRow}`);
      customerHeaderCell.value = 'THÔNG TIN KHÁCH HÀNG:';
      customerHeaderCell.font = { bold: true, color: { argb: 'FF0066CC' } };
      customerHeaderCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' }
      };

      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      const quoteHeaderCell = worksheet.getCell(`E${currentRow}`);
      quoteHeaderCell.value = 'THÔNG TIN BÁO GIÁ:';
      quoteHeaderCell.font = { bold: true, color: { argb: 'FF0066CC' } };
      quoteHeaderCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' }
      };

      currentRow++;
      
      // Customer details
      worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
      const customerNameCell = worksheet.getCell(`A${currentRow}`);
      customerNameCell.value = `Tên KH: ${customerName}`;
      customerNameCell.font = { size: 10 };

      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      const quoteNumberCell = worksheet.getCell(`E${currentRow}`);
      quoteNumberCell.value = `Số báo giá: ${quote.quoteNumber}`;
      quoteNumberCell.font = { size: 10 };

      currentRow++;
      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      const quoteDateCell = worksheet.getCell(`E${currentRow}`);
      quoteDateCell.value = `Ngày báo giá: ${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
      quoteDateCell.font = { size: 10 };

      currentRow++;
      worksheet.mergeCells(`E${currentRow}:H${currentRow}`);
      const expiryDateCell = worksheet.getCell(`E${currentRow}`);
      expiryDateCell.value = `Ngày hết hạn: ${expiryDate}`;
      expiryDateCell.font = { size: 10 };

      currentRow += 3;

      // Table headers
      const headers = ['STT', 'SẢN PHẨM', 'QUY CÁCH (CM)', 'CHẤT LIỆU', 'SỐ LƯỢNG', 'ĐƠN GIÁ', 'THÀNH TIỀN', 'Ghi Chú'];
      
      headers.forEach((header, index) => {
        const cell = worksheet.getCell(`${String.fromCharCode(65 + index)}${currentRow}`);
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
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

      // Quote items
      items.forEach((item: any, index: number) => {
        const rowData = [
          index + 1,
          item.name || 'Ga chun ks T225 sọc 100x200x15cm',
          item.specifications || 'Ga may bo chun quanh đệm',
          item.category || 'Vải T225 40% Cotton 35% Polyester 25% Lụa',
          item.quantity || 144,
          item.price || 140000,
          item.total || 20160000,
          ''
        ];

        rowData.forEach((value, colIndex) => {
          const cell = worksheet.getCell(`${String.fromCharCode(65 + colIndex)}${currentRow}`);
          cell.value = value;
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          
          if (colIndex === 0 || colIndex === 4) { // STT và Số lượng
            cell.alignment = { horizontal: 'center' };
          } else if (colIndex >= 5) { // Đơn giá và Thành tiền
            cell.alignment = { horizontal: 'right' };
            if (typeof value === 'number') {
              cell.numFmt = '#,##0';
            }
          } else if (colIndex >= 1 && colIndex <= 3) { // Text columns
            cell.alignment = { wrapText: true };
          }
        });
        
        currentRow++;
      });

      currentRow++;

      // Totals section
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
        labelCell.font = { bold: true };
        labelCell.alignment = { horizontal: 'right' };

        const valueCell = worksheet.getCell(`G${currentRow}`);
        valueCell.value = value;
        valueCell.font = { bold: true, color: { argb: 'FFDC143C' } };
        valueCell.alignment = { horizontal: 'right' };

        currentRow++;
      });

      currentRow += 2;

      // Terms
      const terms = [
        '1. Bảo giá có hiệu lực trong 15 ngày kể từ ngày lập.',
        '2. Thanh toán: 50% trước khi sản xuất, 50% trước khi giao hàng.',
        '3. Thời gian giao hàng: 7-10 ngày làm việc sau khi nhận đặt cọc.',
        '4. Chất lượng sản phẩm được đảm bảo theo tiêu chuẩn.'
      ];

      terms.forEach(term => {
        worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
        const termCell = worksheet.getCell(`A${currentRow}`);
        termCell.value = term;
        termCell.font = { size: 10 };
        currentRow++;
      });

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
        
        <div className="bg-white" id="quote-preview">
          <div className="p-8 max-w-5xl mx-auto">
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

            <div className="mb-8">
              <div className="space-y-2 text-sm">
                <p>1. Bảo giá có hiệu lực trong 15 ngày kể từ ngày lập.</p>
                <p>2. Thanh toán: 30% trước khi sản xuất, 70% trước khi giao hàng.</p>
                <p>3. Thời gian giao hàng: 7-10 ngày sau khi sản xuất hoàn tất cọc.</p>
                <p>4. Chất lượng sản phẩm được đảm bảo theo tiêu chuẩn.</p>
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}