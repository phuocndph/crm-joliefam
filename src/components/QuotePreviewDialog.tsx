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
  const includeVAT = quoteData.includeVAT || false;
  const vatRate = quoteData.vatRate || 8;
  const payment1 = quoteData.payment1 || 0;
  const payment2 = quoteData.payment2 || 0;
  
  // Calculate totals based on items
  const subtotal = items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
  const vatAmount = includeVAT ? Math.round(subtotal * vatRate / 100) : 0;
  const totalWithVat = subtotal + vatAmount;
  const firstPayment = payment1 || Math.round(totalWithVat * 0.3); // Use payment1 or 30% default
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
          item.sku || item.name || 'GACLTH-100x10F-S',
          item.specifications || 'Ga may bo chun quanh đệm, vải được tính trừ co theo nhà sản xuất',
          item.description || 'Vải T225 40% Cotton 35% Polyester 25% Lụa, mật độ sợi 225 sợi/inch vuông. Vải ít nhăn, không xù, không bai màu',
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

      // Totals section with Times New Roman font - conditional VAT display
      const totalsData = [
        ['TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT', formatCurrency(subtotal)],
        ...(includeVAT ? [
          [`GTGT (${vatRate}%)`, formatCurrency(vatAmount)],
          ['TỔNG TIỀN ĐÃ BAO GỒM GTGT', formatCurrency(totalWithVat)]
        ] : []),
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
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;
      
      // Helper function to add new page if needed
      const checkNewPage = (requiredSpace: number = 10) => {
        if (yPos + requiredSpace > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
          return true;
        }
        return false;
      };
      
      // Helper function to draw line
      const drawLine = (y: number, startX: number = margin, endX: number = pageWidth - margin) => {
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.1);
        pdf.line(startX, y, endX, y);
      };
      
      // Helper function to wrap text
      const wrapText = (text: string, maxWidth: number, fontSize: number = 10) => {
        pdf.setFontSize(fontSize);
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const textWidth = pdf.getTextWidth(testLine);
          
          if (textWidth > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        
        if (currentLine) {
          lines.push(currentLine);
        }
        
        return lines;
      };
      
      // HEADER SECTION
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(220, 47, 47);
      pdf.text('CÔNG TY TNHH GIA LỘC HƯNG PHÁT', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Địa chỉ: Số 49 đường Đông Quan, Phường Đông Vệ, Thành phố Thanh Hóa', pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;
      pdf.text('Điện thoại: 0975.888.999', pageWidth / 2, yPos, { align: 'center' });
      yPos += 12;
      
      // Horizontal line
      drawLine(yPos);
      yPos += 8;
      
      // TITLE
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(25, 118, 210);
      pdf.text('BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;
      
      // QUOTE INFORMATION
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(0, 0, 0);
      
      const quoteNumber = quote.quote_number || 'N/A';
      const createdDate = new Date(quote.created_at).toLocaleDateString('vi-VN');
      
      pdf.text(`Số báo giá: ${quoteNumber}`, margin, yPos);
      pdf.text(`Ngày tạo: ${createdDate}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;
      
      if (expiryDate) {
        pdf.text(`Ngày hết hạn: ${expiryDate}`, pageWidth - margin, yPos, { align: 'right' });
        yPos += 8;
      }
      yPos += 5;
      
      // CUSTOMER INFORMATION BOX
      checkNewPage(30);
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.3);
      pdf.rect(margin, yPos, pageWidth - 2 * margin, 25);
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('THÔNG TIN KHÁCH HÀNG', margin + 3, yPos + 6);
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      let customerY = yPos + 12;
      
      if (customerName) {
        pdf.text(`Khách hàng: ${customerName}`, margin + 3, customerY);
        customerY += 5;
      }
      
      if (phone || email) {
        const contactInfo = [phone && `SĐT: ${phone}`, email && `Email: ${email}`].filter(Boolean).join(' - ');
        pdf.text(contactInfo, margin + 3, customerY);
        customerY += 5;
      }
      
      if (address) {
        const addressLines = wrapText(`Địa chỉ: ${address}`, pageWidth - 2 * margin - 6, 10);
        addressLines.forEach((line) => {
          pdf.text(line, margin + 3, customerY);
          customerY += 4;
        });
      }
      
      yPos += 30;
      
      // ITEMS TABLE
      checkNewPage(40);
      const tableStartY = yPos;
      const colWidths = [15, 60, 25, 25, 25, 30]; // STT, Sản phẩm, Quy cách, Số lượng, Đơn giá, Thành tiền
      const colX = [margin];
      for (let i = 1; i < colWidths.length; i++) {
        colX.push(colX[i - 1] + colWidths[i - 1]);
      }
      
      // Table header
      pdf.setFillColor(240, 240, 240);
      pdf.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.1);
      
      // Header borders
      for (let i = 0; i <= colWidths.length; i++) {
        const x = i === 0 ? margin : colX[i - 1] + colWidths[i - 1];
        pdf.line(x, yPos, x, yPos + 8);
      }
      drawLine(yPos);
      drawLine(yPos + 8);
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      
      const headers = ['STT', 'SẢN PHẨM', 'QUY CÁCH', 'SL', 'ĐƠN GIÁ', 'THÀNH TIỀN'];
      headers.forEach((header, index) => {
        const centerX = colX[index] + colWidths[index] / 2;
        pdf.text(header, centerX, yPos + 5.5, { align: 'center' });
      });
      
      yPos += 8;
      
      // Table rows
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      
      items.forEach((item, index) => {
        const rowHeight = Math.max(8, Math.ceil(item.name.length / 25) * 4 + 4);
        
        checkNewPage(rowHeight + 5);
        
        // Row background (alternating)
        if (index % 2 === 1) {
          pdf.setFillColor(248, 248, 248);
          pdf.rect(margin, yPos, pageWidth - 2 * margin, rowHeight, 'F');
        }
        
        // Row borders
        for (let i = 0; i <= colWidths.length; i++) {
          const x = i === 0 ? margin : colX[i - 1] + colWidths[i - 1];
          pdf.line(x, yPos, x, yPos + rowHeight);
        }
        drawLine(yPos + rowHeight);
        
        // Cell content
        const cellY = yPos + rowHeight / 2 + 1.5;
        
        // STT
        pdf.text((index + 1).toString(), colX[0] + colWidths[0] / 2, cellY, { align: 'center' });
        
        // Sản phẩm (with text wrapping)
        const productLines = wrapText(item.name, colWidths[1] - 4, 9);
        productLines.forEach((line, lineIndex) => {
          pdf.text(line, colX[1] + 2, yPos + 6 + lineIndex * 4);
        });
        
        // Quy cách
        const specs = item.specifications || '';
        if (specs) {
          const specLines = wrapText(specs, colWidths[2] - 4, 8);
          pdf.setFontSize(8);
          specLines.forEach((line, lineIndex) => {
            pdf.text(line, colX[2] + 2, yPos + 6 + lineIndex * 3);
          });
          pdf.setFontSize(9);
        }
        
        // Số lượng
        pdf.text(item.quantity.toString(), colX[3] + colWidths[3] / 2, cellY, { align: 'center' });
        
        // Đơn giá
        pdf.text(formatCurrency(item.price), colX[4] + colWidths[4] - 2, cellY, { align: 'right' });
        
        // Thành tiền
        pdf.text(formatCurrency(item.total), colX[5] + colWidths[5] - 2, cellY, { align: 'right' });
        
        yPos += rowHeight;
      });
      
      // Table footer border
      drawLine(yPos, margin, pageWidth - margin);
      yPos += 3;
      
      // TOTAL SECTION
      pdf.setFillColor(240, 240, 240);
      pdf.rect(colX[4], yPos, colWidths[4] + colWidths[5], 8, 'F');
      pdf.setDrawColor(0, 0, 0);
      pdf.rect(colX[4], yPos, colWidths[4] + colWidths[5], 8);
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('TỔNG CỘNG:', colX[4] + 2, yPos + 5.5);
      pdf.text(formatCurrency(subtotal), colX[5] + colWidths[5] - 2, yPos + 5.5, { align: 'right' });
      yPos += 15;
      
      // TERMS AND CONDITIONS
      checkNewPage(35);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('ĐIỀU KIỆN & ĐIỀU KHOẢN:', margin, yPos);
      yPos += 8;
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const terms = [
        '• Báo giá có hiệu lực trong 30 ngày kể từ ngày lập',
        '• Thanh toán: 50% đặt cọc, 50% trước khi giao hàng', 
        '• Thời gian giao hàng: 7-10 ngày làm việc sau khi nhận đặt cọc',
        '• Giá đã bao gồm VAT 10%',
        '• Công ty chịu trách nhiệm bảo hành sản phẩm trong 12 tháng'
      ];
      
      terms.forEach((term) => {
        pdf.text(term, margin, yPos);
        yPos += 5;
      });
      yPos += 10;
      
      // SIGNATURE SECTION
      checkNewPage(25);
      drawLine(yPos - 2);
      yPos += 5;
      
      const signatureY = yPos;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      
      // Company signature
      pdf.text('ĐẠI DIỆN CÔNG TY', margin + 40, signatureY, { align: 'center' });
      pdf.text('KHÁCH HÀNG', pageWidth - margin - 40, signatureY, { align: 'center' });
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text('(Ký và ghi rõ họ tên)', margin + 40, signatureY + 20, { align: 'center' });
      pdf.text('(Ký và đóng dấu xác nhận)', pageWidth - margin - 40, signatureY + 20, { align: 'center' });
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text('GIÁM ĐỐC', margin + 40, signatureY + 30, { align: 'center' });
      
      // Save PDF
      const fileName = `BaoGia_${quoteNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      toast({
        title: "Xuất PDF thành công",
        description: `Đã xuất báo giá ${quoteNumber} thành file PDF chuyên nghiệp`,
      });
      
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({
        title: "Lỗi xuất PDF",
        description: "Có lỗi xảy ra khi xuất file PDF. Vui lòng thử lại.",
        variant: "destructive",
      });
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
            {/* Header Layout như mẫu */}
            <div className="flex items-start justify-between mb-6">
              {/* Logo bên trái */}
              <div className="w-24 h-24">
                <img 
                  src={templateSettings.logoUrl} 
                  alt="Company Logo" 
                  className="w-full h-full object-contain border border-gray-300"
                />
              </div>
              
              {/* Thông tin công ty ở giữa */}
              <div className="flex-1 text-center px-8">
                <h1 className="text-2xl font-bold mb-3" style={{ color: templateSettings.companyTitleColor }}>
                  {templateSettings.companyTitle}
                </h1>
                <div className="text-sm space-y-1">
                  <p>Địa chỉ: {templateSettings.address}</p>
                  <p>Điện thoại: {templateSettings.phone}</p>
                  <p>MST: {templateSettings.taxCode}</p>
                  <p>Trụ sở: {templateSettings.headquarters}</p>
                  <p>STK: {templateSettings.bankInfo}</p>
                </div>
              </div>
              
              {/* Trống bên phải để cân bằng */}
              <div className="w-24"></div>
            </div>
            
            {/* Tiêu đề chính */}
            <div className="text-center mb-4">
              <h2 className="text-3xl font-bold" style={{ color: templateSettings.quoteTitleColor }}>
                BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN
              </h2>
            </div>
            
            {/* Ngày tháng */}
            <div className="text-center mb-8">
              <p className="italic text-base">Hà Nội ngày {currentDate.getDate()} tháng {currentDate.getMonth() + 1} năm {currentDate.getFullYear()}</p>
            </div>

            {/* Thông tin khách hàng và báo giá - 2 cột như mẫu */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              {/* Cột trái - Thông tin khách hàng */}
              <div>
                <h3 className="font-bold text-lg mb-4 text-blue-600 border-b border-blue-300 pb-2">
                  THÔNG TIN KHÁCH HÀNG:
                </h3>
                <div className="space-y-2">
                  <p><strong>Tên KH:</strong> {customerName}</p>
                </div>
              </div>
              
              {/* Cột phải - Thông tin báo giá */}
              <div>
                <h3 className="font-bold text-lg mb-4 text-blue-600 border-b border-blue-300 pb-2">
                  THÔNG TIN BÁO GIÁ:
                </h3>
                <div className="space-y-2">
                  <p><strong>Số báo giá:</strong> {quote.quoteNumber || 'BG-20250717-082'}</p>
                  <p><strong>Ngày báo giá:</strong> {currentDate.toLocaleDateString('vi-VN')}</p>
                  <p><strong>Ngày hết hạn:</strong> {expiryDate}</p>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <Table className="border-collapse border border-gray-400">
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
                     <TableRow key={index} className="bg-white">
                       <TableCell className="border border-gray-400 text-center">{index + 1}</TableCell>
                       <TableCell className="border border-gray-400">{item.name || item.sku}</TableCell>
                       <TableCell className="border border-gray-400 text-sm">{item.specifications}</TableCell>
                       <TableCell className="border border-gray-400 text-sm">{item.description}</TableCell>
                       <TableCell className="border border-gray-400 text-center">{item.quantity}</TableCell>
                       <TableCell className="border border-gray-400 text-right">{formatCurrency(item.price)}</TableCell>
                       <TableCell className="border border-gray-400 text-right font-semibold">{formatCurrency(item.total)}</TableCell>
                       <TableCell className="border border-gray-400"></TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
              </Table>
            </div>

            {/* Phần tổng tiền với style như mẫu - conditional VAT display */}
            <div className="mb-6">
              <table className="w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="border border-black bg-red-100 p-3 font-bold text-red-600">TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT</td>
                    <td className="border border-black bg-red-100 p-3 text-right font-bold">{formatCurrency(subtotal)}</td>
                  </tr>
                  {includeVAT && (
                    <>
                      <tr>
                        <td className="border border-black bg-red-100 p-3 font-bold text-red-600">GTGT ({vatRate}%)</td>
                        <td className="border border-black bg-red-100 p-3 text-right font-bold">{formatCurrency(vatAmount)}</td>
                      </tr>
                      <tr>
                        <td className="border border-black bg-red-100 p-3 font-bold text-red-600">TỔNG TIỀN ĐÃ BAO GỒM GTGT</td>
                        <td className="border border-black bg-red-100 p-3 text-right font-bold">{formatCurrency(totalWithVat)}</td>
                      </tr>
                    </>
                  )}
                  <tr>
                    <td className="border border-black bg-red-100 p-3 font-bold text-red-600">THANH TOÁN LẦN 1</td>
                    <td className="border border-black bg-red-100 p-3 text-right font-bold">{formatCurrency(firstPayment)}</td>
                  </tr>
                  <tr>
                    <td className="border border-black bg-red-100 p-3 font-bold text-red-600">CÒN LẠI</td>
                    <td className="border border-black bg-red-100 p-3 text-right font-bold">{formatCurrency(remaining)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Điều khoản */}
            <div className="mb-8">
              <div className="space-y-1 text-sm">
                <p>1. Báo giá có hiệu lực trong 15 ngày kể từ ngày lập.</p>
                <p>2. Thanh toán: 50% trước khi sản xuất, 50% trước khi giao hàng.</p>
                <p>3. Thời gian giao hàng: 7-10 ngày làm việc sau khi nhận đặt cọc.</p>
                <p>4. Chất lượng sản phẩm được đảm bảo theo tiêu chuẩn.</p>
              </div>
            </div>

            {/* Chữ ký - Layout như mẫu */}
            <div className="grid grid-cols-2 gap-16 mt-16">
              <div className="text-center">
                <p className="font-bold text-lg mb-12">ĐẠI DIỆN CÔNG TY</p>
                <div className="h-16 mb-4"></div>
              </div>
              <div className="text-center">
                <p className="font-bold text-lg mb-12">KHÁCH HÀNG</p>
                <div className="h-16 mb-4"></div>
              </div>
            </div>
            
            {/* Footer note nếu có */}
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