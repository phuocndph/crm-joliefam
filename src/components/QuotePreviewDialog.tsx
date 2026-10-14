import React, { useState, useEffect } from "react";
import { Download, Printer, X, Calculator, FileDown, ImageOff } from "lucide-react";
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

import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { transformImageUrl } from "@/lib/imageUrl";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { QuoteSupplementDialog } from './QuoteSupplementDialog';
import { fetchQuoteData } from '@/hooks/useQuotes';
import { isLocalBackend, localAdminUser } from '@/lib/runtime-config';

interface QuotePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: any;
}

export function QuotePreviewDialog({ open, onOpenChange, quote }: QuotePreviewDialogProps) {
  const [showSupplement, setShowSupplement] = useState(false);
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [showQuoteSupplementDialog, setShowQuoteSupplementDialog] = useState(false);
  const [logoError, setLogoError] = useState(false);
  // Egress optimization: quote_data is no longer in list query — fetch on open
  const [quoteDataRaw, setQuoteDataRaw] = useState<string | null>(null);
  
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();
  const { role: userRole } = useUserRole(user);
  const { hasPermission } = useEmployeePermissions(user, userRole);
  
  // Use template settings from Supabase
  const { settings: templateSettings, refetch: refetchTemplateSettings } = useTemplateSettings();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  // Refetch template settings when dialog opens, reset state when closes
  useEffect(() => {
    let cancelled = false;

    if (open) {
      refetchTemplateSettings();
      setLogoError(false);
      // Fetch heavy quote_data JSONB only when dialog opens
      if (quote?.id) {
        if (quote.quote_data) {
          setQuoteDataRaw(typeof quote.quote_data === 'string' ? quote.quote_data : JSON.stringify(quote.quote_data));
        } else {
          fetchQuoteData(quote.id).then((data) => {
            if (!cancelled) setQuoteDataRaw(data);
          });
        }
      }
    } else {
      // Reset all internal states when dialog closes to prevent overlay conflicts
      setShowSupplement(false);
      setShowTemplateSettings(false);
      setShowQuoteSupplementDialog(false);
      setQuoteDataRaw(null);
    }

    return () => {
      cancelled = true;
    };
  }, [open, quote?.id, refetchTemplateSettings]);

  // Safety cleanup: ensure pointer-events are restored when dialog unmounts or closes
  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = '';
    };
  }, []);

  if (!quote) return null;

  // The list query uses snake_case while some legacy callers use camelCase.
  // Normalize once so every part of the preview refers to the same quote.
  const quoteNumber = quote.quote_number || quote.quoteNumber || `QUOTE-${quote.id?.slice(0, 8) || 'N/A'}`;

  // Parse customer info - prioritize quote.customerName from hook
  const notes = quote.notes || '';
  const customerName = quote.customerName || notes.match(/Khách hàng:\s*(.+)/)?.[1] || 'NGUYEN DUC PHUOC';
  const phone = quote.customerPhone || notes.match(/Điện thoại:\s*(.+)/)?.[1] || '';
  const email = notes.match(/Email:\s*(.+)/)?.[1] || '';
  const address = quote.customerAddress || notes.match(/Địa chỉ:\s*(.+)/)?.[1] || '';
  const expiryDate = (() => {
    const value = quote.expiryDate || notes.match(/Ngày hết hạn:\s*(.+)/)?.[1];
    if (!value) return '-';
    if (typeof value === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('vi-VN');
  })();

  // Parse items with real data
  let items: any[] = [];
  try {
    items = quote.items
      ? (typeof quote.items === 'string' ? JSON.parse(quote.items) : quote.items)
      : [];
  } catch (error) {
    console.error('Could not parse quote items:', error);
  }
  
  // Parse quote data for VAT and payment info (fetched on-demand)
  let quoteData: Record<string, any> = {};
  try {
    const rawQuoteData = quoteDataRaw ?? quote.quote_data;
    quoteData = rawQuoteData
      ? (typeof rawQuoteData === 'string' ? JSON.parse(rawQuoteData) : rawQuoteData)
      : {};
  } catch (error) {
    console.error('Could not parse quote data:', error);
  }
  
  // Ensure all item totals are correctly calculated
  const correctedItems = items.map((item: any) => ({
    ...item,
    total: (item.quantity || 1) * (item.price || 0) // Recalculate to ensure accuracy
  }));
  
  // Calculate totals based on corrected items
  const rawSubtotal = correctedItems.reduce((sum: number, item: any) => sum + item.total, 0);
  
  // Get saved quote data
  const includeVAT = quoteData.includeVAT || false;
  const vatRate = quoteData.vatRate || 8;
  
  // Subtotal is always the pre-VAT amount (TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT)
  const subtotal = rawSubtotal;
  
  // Calculate VAT amount based on whether VAT is included
  let vatAmount = 0;
  if (includeVAT) {
    // Calculate VAT from subtotal (subtotal is "TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT")
    vatAmount = Math.round(subtotal * vatRate / 100);
  }

  const payment1 = quoteData.payment1 || 0;
  const payment2 = quoteData.payment2 || 0;
  const totalWithVat = subtotal + vatAmount;
  
  // Check if payment settings exist in quote data (meaning payment plan was configured)
  // A payment plan exists if payment1 is explicitly set (even if 0)
  const hasPaymentPlan = 'payment1' in quoteData;
  const firstPayment = hasPaymentPlan ? payment1 : 0;
  const remaining = hasPaymentPlan ? totalWithVat - firstPayment : totalWithVat;

  // Current date for display
  const currentDate = new Date();
  const quoteDate = quote.created_at ? new Date(quote.created_at) : currentDate;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN').format(amount);
  };

  const handleExportExcel = async () => {
    try {
      // Keep the spreadsheet generator out of the initial route bundle.
      const ExcelJS = await import('exceljs');
      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Báo giá');
      
      // Set page setup for printing
      // Set column widths first
      worksheet.getColumn('A').width = 7.14;
      worksheet.getColumn('B').width = 22.86;
      worksheet.getColumn('C').width = 32;
      worksheet.getColumn('D').width = 42.85;
      worksheet.getColumn('E').width = 12.86;
      worksheet.getColumn('F').width = 12.86;
      worksheet.getColumn('G').width = 17.29;
      worksheet.getColumn('H').width = 19.71;  // Cột hình ảnh
      worksheet.getColumn('I').width = 18.14;

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
            ext: { width: 205, height: 126 }
          });
        }
      } catch (logoError) {
        console.warn('Could not load logo:', logoError);
      }

      // Company header - Row 1 (next to logo)
      worksheet.mergeCells('C1:H1');
      const companyCell = worksheet.getCell('C1');
      companyCell.value = templateSettings.companyTitle;
      companyCell.font = { name: 'Times New Roman', bold: true, size: 16, color: { argb: templateSettings.companyTitleColor.replace('#', 'FF') } };
      companyCell.alignment = { vertical: 'middle', horizontal: 'left' };

      // Company details - Row 2-6
      worksheet.mergeCells('C2:H2');
      const addressCell = worksheet.getCell('C2');
      addressCell.value = `Địa chỉ: ${templateSettings.address}`;
      addressCell.font = { name: 'Times New Roman', size: 10 };
      addressCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

      worksheet.mergeCells('C3:H3');
      const phoneCell = worksheet.getCell('C3');
      phoneCell.value = `Điện thoại: ${templateSettings.phone}`;
      phoneCell.font = { name: 'Times New Roman', size: 10 };
      phoneCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('C4:H4');
      const mstCell = worksheet.getCell('C4');
      mstCell.value = `MST: ${templateSettings.taxCode}`;
      mstCell.font = { name: 'Times New Roman', size: 10 };
      mstCell.alignment = { vertical: 'middle', horizontal: 'left' };

      worksheet.mergeCells('C5:H5');
      const officeCell = worksheet.getCell('C5');
      officeCell.value = `Trụ sở: ${templateSettings.headquarters}`;
      officeCell.font = { name: 'Times New Roman', size: 10 };
      officeCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

      worksheet.mergeCells('C6:H6');
      const bankCell = worksheet.getCell('C6');
      bankCell.value = `STK: ${templateSettings.bankInfo}`;
      bankCell.font = { name: 'Times New Roman', size: 10 };
      bankCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

      // Empty row
      let currentRow = 8;

      // Quote title - merge from A to I
      worksheet.mergeCells(`A${currentRow}:I${currentRow}`);
      const titleCell = worksheet.getCell(`A${currentRow}`);
      titleCell.value = 'BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN';
      titleCell.font = { name: 'Times New Roman', bold: true, size: 18, color: { argb: templateSettings.quoteTitleColor.replace('#', 'FF') } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow += 2;

      // Date info on row 9 - merge from A to I (dynamic date from quote)
      const exportQuoteDate = quote.created_at ? new Date(quote.created_at) : currentDate;
      worksheet.mergeCells(`A9:I9`);
      const dateCell = worksheet.getCell(`A9`);
      dateCell.value = `Hà Nội ngày ${exportQuoteDate.getDate()} tháng ${exportQuoteDate.getMonth() + 1} năm ${exportQuoteDate.getFullYear()}`;
      dateCell.font = { name: 'Times New Roman', size: 12, italic: true };
      dateCell.alignment = { horizontal: 'center' };

      currentRow += 2;

      // Customer info in column B
      const customerInfoCell = worksheet.getCell(`B${currentRow}`);
      customerInfoCell.value = 'THÔNG TIN KHÁCH HÀNG:';
      customerInfoCell.font = { name: 'Times New Roman', bold: true, size: 12, color: { argb: 'FF0066CC' } };

      // Quote info starting from column H
      const quoteInfoCell = worksheet.getCell(`H${currentRow}`);
      quoteInfoCell.value = 'THÔNG TIN BÁO GIÁ:';
      quoteInfoCell.font = { name: 'Times New Roman', bold: true, size: 12, color: { argb: 'FF0066CC' } };

      currentRow++;
      
      // Customer details in column B
      const customerNameCell = worksheet.getCell(`B${currentRow}`);
      customerNameCell.value = `Tên KH: ${customerName}`;
      customerNameCell.font = { name: 'Times New Roman', size: 10 };

      // Quote details from column H
      const quoteNumberCell = worksheet.getCell(`H${currentRow}`);
      quoteNumberCell.value = `Số báo giá: ${quoteNumber}`;
      quoteNumberCell.font = { name: 'Times New Roman', size: 10 };

      currentRow++;
      
      // Quote date from column H
      const quoteDateCell = worksheet.getCell(`H${currentRow}`);
      quoteDateCell.value = `Ngày báo giá: ${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
      quoteDateCell.font = { name: 'Times New Roman', size: 10 };

      currentRow++;
      
      // Expiry date from column H
      const expiryDateCell = worksheet.getCell(`H${currentRow}`);
      expiryDateCell.value = `Ngày hết hạn: ${expiryDate || '31/7/2025'}`;
      expiryDateCell.font = { name: 'Times New Roman', size: 10 };

      currentRow += 2;

      // Table headers with Times New Roman font and blue color #0070C0
      const headers = ['STT', 'SẢN PHẨM', 'QUY CÁCH (CM)', 'CHẤT LIỆU', 'SỐ LƯỢNG', 'ĐƠN GIÁ', 'THÀNH TIỀN', 'HÌNH ẢNH', 'Ghi Chú'];
      
      headers.forEach((header, index) => {
        const cell = worksheet.getCell(`${String.fromCharCode(65 + index)}${currentRow}`);
        cell.value = header;
        cell.font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0070C0' }
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

      // Track starting row for formulas
      const itemsStartRow = currentRow;

      // Quote items with Times New Roman font and images - use corrected items
      for (let index = 0; index < correctedItems.length; index++) {
        const item = correctedItems[index];
        
        // Set values for each column
        const cellA = worksheet.getCell(`A${currentRow}`);
        cellA.value = index + 1;
        cellA.font = { name: 'Times New Roman', size: 10 };
        cellA.alignment = { horizontal: 'center', vertical: 'middle' };
        cellA.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        const cellB = worksheet.getCell(`B${currentRow}`);
        cellB.value = item.name || item.sku || '';
        cellB.font = { name: 'Times New Roman', size: 10 };
        cellB.alignment = { wrapText: true, vertical: 'middle' };
        cellB.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        const cellC = worksheet.getCell(`C${currentRow}`);
        cellC.value = item.specifications || '';
        cellC.font = { name: 'Times New Roman', size: 10 };
        cellC.alignment = { wrapText: true, vertical: 'middle' };
        cellC.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        const cellD = worksheet.getCell(`D${currentRow}`);
        cellD.value = item.description || '';
        cellD.font = { name: 'Times New Roman', size: 10 };
        cellD.alignment = { wrapText: true, vertical: 'middle' };
        cellD.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        const cellE = worksheet.getCell(`E${currentRow}`);
        cellE.value = item.quantity || 1;
        cellE.font = { name: 'Times New Roman', size: 10 };
        cellE.alignment = { horizontal: 'center', vertical: 'middle' };
        cellE.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        const cellF = worksheet.getCell(`F${currentRow}`);
        cellF.value = item.price || 0;
        cellF.font = { name: 'Times New Roman', size: 10 };
        cellF.alignment = { horizontal: 'center', vertical: 'middle' };
        cellF.numFmt = '#,##0';
        cellF.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Column G: THÀNH TIỀN = SỐ LƯỢNG * ĐƠN GIÁ (Formula)
        const cellG = worksheet.getCell(`G${currentRow}`);
        cellG.value = { formula: `E${currentRow}*F${currentRow}` };
        cellG.font = { name: 'Times New Roman', size: 10 };
        cellG.alignment = { horizontal: 'center', vertical: 'middle' };
        cellG.numFmt = '#,##0';
        cellG.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Column H: HÌNH ẢNH
        const cellH = worksheet.getCell(`H${currentRow}`);
        cellH.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Column I: Ghi chú
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = '';
        cellI.font = { name: 'Times New Roman', size: 10 };
        cellI.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Add image if available - moved to column H
        if (item.selectedImage) {
          try {
            const imageResponse = await fetch(item.selectedImage);
            if (imageResponse.ok) {
              const imageBlob = await imageResponse.blob();
              const imageArrayBuffer = await imageBlob.arrayBuffer();
              
              const imageId = workbook.addImage({
                buffer: imageArrayBuffer,
                extension: 'png',
              });
              
              // Add image to cell H (column index 7) with proper sizing and positioning
              worksheet.addImage(imageId, {
                tl: { col: 7.1, row: currentRow - 0.9 },
                ext: { width: 132, height: 106 }
              });
            }
          } catch (imageError) {
            console.warn('Could not load product image:', imageError);
          }
        }
        
        // Set row height for product content
        worksheet.getRow(currentRow).height = 84.75;
        
        currentRow++;
      }
      
      // Track items end row for SUM formula
      const itemsEndRow = currentRow - 1;

      currentRow++;

      // Totals section with Excel formulas
      // Helper function to add total row with merge A-D for label, E-I for value
      const addTotalRow = (label: string, valueOrFormula: string | number | { formula: string }, isFormula: boolean = false) => {
        // Merge A-D for label (4 columns)
        worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
        const labelCell = worksheet.getCell(`A${currentRow}`);
        labelCell.value = label;
        labelCell.font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FFC00000' } };
        labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
        labelCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Merge E-I for value (5 columns)
        worksheet.mergeCells(`E${currentRow}:I${currentRow}`);
        const valueCell = worksheet.getCell(`E${currentRow}`);
        valueCell.value = isFormula ? valueOrFormula : valueOrFormula;
        valueCell.font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FFC00000' } };
        valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
        valueCell.numFmt = '#,##0';
        valueCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        
        return currentRow++;
      };

      // Row 1: TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT = SUM(G items)
      const subtotalRow = currentRow;
      addTotalRow('TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT', { formula: `SUM(G${itemsStartRow}:G${itemsEndRow})` }, true);

      let vatRow = 0;
      let totalWithVatRow = 0;
      
      if (includeVAT) {
        // Row 2: GTGT = Subtotal * vatRate% (use column E for formulas now)
        vatRow = currentRow;
        addTotalRow(`GTGT (${vatRate}%)`, { formula: `E${subtotalRow}*${vatRate}/100` }, true);
        
        // Row 3: TỔNG TIỀN ĐÃ BAO GỒM GTGT = Subtotal + VAT
        totalWithVatRow = currentRow;
        addTotalRow('TỔNG TIỀN ĐÃ BAO GỒM GTGT', { formula: `E${subtotalRow}+E${vatRow}` }, true);
      }

      // Row 4: THANH TOÁN LẦN 1 (editable value) - ensure it's a number
      const payment1Row = currentRow;
      const safeFirstPayment = typeof firstPayment === 'number' && !isNaN(firstPayment) ? firstPayment : 0;
      addTotalRow('THANH TOÁN LẦN 1', safeFirstPayment, false);

      // Row 5: CÒN LẠI = Total - Payment1 (use column E for formulas now)
      const totalRefRow = includeVAT ? totalWithVatRow : subtotalRow;
      addTotalRow('CÒN LẠI', { formula: `E${totalRefRow}-E${payment1Row}` }, true);

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

      // Generate and download file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Format filename: BG-{SốBáoGiá}-{TênKH}-{dd-mm-yyyy}.xlsx
      const today = new Date();
      const formattedDate = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;
      const safeQuoteNumber = (quote.quote_number || quote.quoteNumber || 'KHONG-SO').replace(/[\\/:*?"<>|]/g, '').trim();
      const safeCustomerName = customerName.replace(/[\\/:*?"<>|]/g, '').trim();
      a.download = `BG-${safeQuoteNumber}-${safeCustomerName}-${formattedDate}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Xuất Excel thành công",
        description: `Đã xuất báo giá ${quoteNumber} với logo, màu sắc và định dạng đầy đủ`,
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
              <title>Báo giá ${quoteNumber}</title>
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
      // Create a more compatible PDF approach for Vietnamese
      const printContent = document.getElementById('quote-preview');
      if (!printContent) {
        toast({
          title: "Lỗi",
          description: "Không tìm thấy nội dung báo giá",
          variant: "destructive",
        });
        return;
      }

      // Template settings already available from hook
      
      // Create a clean print version
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast({
          title: "Lỗi", 
          description: "Không thể mở cửa sổ in",
          variant: "destructive",
        });
        return;
      }

      // Create clean HTML content for printing/PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Báo giá ${quote.quote_number}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              font-size: 13px;
              line-height: 1.4;
              color: #333;
              background: white;
              margin: 0;
              padding: 20px;
            }
            
            .header {
              background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
              color: white;
              padding: 25px;
              margin: -20px -20px 30px -20px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            
            .company-info {
              flex: 1;
            }
            
            .company-name {
              font-size: 24px;
              font-weight: 700;
              margin-bottom: 5px;
            }
            
            .company-details {
              font-size: 12px;
              opacity: 0.9;
            }
            
            .logo-section {
              width: 120px;
              height: 80px;
              background: rgba(255,255,255,0.1);
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
            }
            
            .logo-section img {
              max-width: 110px;
              max-height: 70px;
              object-fit: contain;
            }
            
            .quote-title {
              text-align: center;
              background: #f8fafc;
              padding: 15px;
              margin: 20px 0;
              border-radius: 8px;
              border-left: 4px solid #3b82f6;
            }
            
            .quote-number {
              font-size: 20px;
              font-weight: 600;
              color: #1e40af;
            }
            
            .info-section {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin: 30px 0;
            }
            
            .info-box {
              background: #f8fafc;
              padding: 20px;
              border-radius: 8px;
              border: 1px solid #e2e8f0;
            }
            
            .info-title {
              font-weight: 600;
              color: #1e40af;
              margin-bottom: 10px;
              font-size: 14px;
            }
            
            .info-item {
              margin: 5px 0;
              font-size: 12px;
            }
            
            .table-container {
              margin: 30px 0;
              border-radius: 8px;
              overflow: hidden;
              border: 1px solid #e2e8f0;
            }
            
            table {
              width: 100%;
              border-collapse: collapse;
              background: white;
            }
            
            th {
              background: #1e40af;
              color: white;
              padding: 12px 8px;
              text-align: center;
              font-weight: 600;
              font-size: 12px;
            }
            
            td {
              padding: 12px 8px;
              border-bottom: 1px solid #e2e8f0;
              font-size: 12px;
            }
            
            tr:nth-child(even) {
              background: #f8fafc;
            }
            
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-medium { font-weight: 500; }
            
            .total-section {
              margin: 20px 0;
              text-align: right;
            }
            
            .total-row {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 20px;
              margin: 5px 0;
              padding: 5px 0;
            }
            
            .total-label {
              font-weight: 500;
            }
            
            .total-amount {
              font-weight: 600;
              min-width: 120px;
            }
            
            .final-total {
              background: #1e40af;
              color: white;
              padding: 10px;
              border-radius: 6px;
              font-size: 16px;
              font-weight: 700;
            }
            
            .terms {
              margin: 30px 0;
              background: #f8fafc;
              padding: 20px;
              border-radius: 8px;
              border-left: 4px solid #059669;
            }
            
            .terms-title {
              font-weight: 600;
              color: #059669;
              margin-bottom: 10px;
            }
            
            .terms li {
              margin: 8px 0;
              font-size: 12px;
            }
            
            .signature-section {
              margin-top: 40px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 40px;
            }
            
            .signature-box {
              text-align: center;
              padding: 20px;
            }
            
            .signature-title {
              font-weight: 600;
              margin-bottom: 40px;
              color: #1e40af;
            }
            
            .signature-line {
              border-bottom: 1px solid #333;
              margin: 10px 0;
              height: 40px;
            }
            
            .signature-note {
              font-size: 11px;
              color: #666;
              margin-top: 5px;
            }
            
            @media print {
              body { 
                margin: 0; 
                padding: 15px; 
                font-size: 12px;
              }
              .header { 
                margin: -15px -15px 20px -15px; 
                padding: 20px;
              }
              @page { 
                margin: 1cm; 
                size: A4;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <div class="company-name">${templateSettings.companyName || 'CÔNG TY ABC'}</div>
              <div class="company-details">
                ${templateSettings.address || 'Địa chỉ công ty'}<br>
                ĐT: ${templateSettings.phone || '0123456789'} | Email: contact@company.com
              </div>
            </div>
            <div class="logo-section">
              ${templateSettings.logoUrl ? `<img src="${templateSettings.logoUrl}" style="max-width: 205px; max-height: 126px;" alt="Logo">` : 'LOGO'}
            </div>
          </div>

          <div class="quote-title">
            <div class="quote-number">BẢNG BÁO GIÁ SỐ: ${quote.quote_number || 'N/A'}</div>
            <div style="font-size: 12px; color: #666; margin-top: 5px;">
              Ngày tạo: ${new Date(quote.created_at).toLocaleDateString('vi-VN')}
            </div>
          </div>

          <div class="info-section">
            <div class="info-box">
              <div class="info-title">THÔNG TIN KHÁCH HÀNG</div>
              <div class="info-item"><strong>Tên:</strong> ${customerName}</div>
              <div class="info-item"><strong>Số điện thoại:</strong> ${phone}</div>
              <div class="info-item"><strong>Địa chỉ:</strong> ${address}</div>
              <div class="info-item"><strong>Email:</strong> ${email}</div>
            </div>
            
            <div class="info-box">
              <div class="info-title">THÔNG TIN BÁO GIÁ</div>
              <div class="info-item"><strong>Mã báo giá:</strong> ${quote.quote_number}</div>
              <div class="info-item"><strong>Ngày tạo:</strong> ${new Date(quote.created_at).toLocaleDateString('vi-VN')}</div>
              <div class="info-item"><strong>Hiệu lực đến:</strong> ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('vi-VN')}</div>
              <div class="info-item"><strong>Trạng thái:</strong> ${quote.status || 'Draft'}</div>
            </div>
          </div>

          <div class="table-container">
            <table>
               <thead>
                <tr>
                  <th style="width: 5%">STT</th>
                  <th style="width: 18%">SẢN PHẨM</th>
                  <th style="width: 12%">HÌNH ẢNH</th>
                  <th style="width: 13%">QUY CÁCH</th>
                  <th style="width: 18%">CHẤT LƯỢNG</th>
                  <th style="width: 8%">SỐ LƯỢNG</th>
                  <th style="width: 12%">ĐƠN GIÁ</th>
                  <th style="width: 12%">THÀNH TIỀN</th>
                  <th style="width: 8%">GHI CHÚ</th>
                </tr>
              </thead>
              <tbody>
                 ${correctedItems.map((item, index) => `
                  <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>${item.name || item.sku || ''}</td>
                    <td class="text-center">
                      ${item.selectedImage ? `<img src="${item.selectedImage}" style="width: 60px; height: 45px; object-fit: cover; border-radius: 4px;" alt="Sản phẩm">` : '<div style="width: 60px; height: 45px; background: #f3f4f6; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #9ca3af;">Không có ảnh</div>'}
                    </td>
                    <td>${item.specifications || ''}</td>
                    <td>${item.category || item.description || ''}</td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-right">${parseFloat(item.price).toLocaleString('vi-VN')}</td>
                    <td class="text-right font-medium">${item.total.toLocaleString('vi-VN')}</td>
                    <td>${item.notes || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="total-section">
            <div class="total-row">
              <div class="total-label">TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT:</div>
              <div class="total-amount">${subtotal.toLocaleString('vi-VN')}</div>
            </div>
            ${includeVAT ? `
              <div class="total-row">
                <div class="total-label">GTGT (${vatRate}%):</div>
                <div class="total-amount">${vatAmount.toLocaleString('vi-VN')}</div>
              </div>
              <div class="total-row">
                <div class="total-label">TỔNG TIỀN ĐÃ BAO GỒM GTGT:</div>
                <div class="total-amount">${totalWithVat.toLocaleString('vi-VN')}</div>
              </div>
            ` : ''}
            <div class="total-row">
              <div class="total-label">THANH TOÁN LẦN 1:</div>
              <div class="total-amount">${firstPayment.toLocaleString('vi-VN')}</div>
            </div>
            <div class="total-row final-total">
              <div>CÒN LẠI:</div>
              <div>${remaining.toLocaleString('vi-VN')}</div>
            </div>
          </div>

          ${templateSettings.terms && templateSettings.terms.length > 0 ? `
            <div class="terms">
              <div class="terms-title">ĐIỀU KHOẢN & ĐIỀU KIỆN</div>
              <ul>
                ${templateSettings.terms.map(term => term.trim() ? `<li>${term}</li>` : '').join('')}
              </ul>
            </div>
          ` : ''}

          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-title">ĐẠI DIỆN CÔNG TY</div>
              <div class="signature-line"></div>
              <div class="signature-note">(Ký tên & đóng dấu)</div>
            </div>
            <div class="signature-box">
              <div class="signature-title">KHÁCH HÀNG</div>
              <div class="signature-line"></div>
              <div class="signature-note">(Ký tên xác nhận)</div>
            </div>
          </div>

          ${templateSettings.footerNote ? `
            <div style="text-align: center; margin-top: 30px; font-size: 11px; color: #666; font-style: italic;">
              ${templateSettings.footerNote}
            </div>
          ` : ''}
        </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // Wait for content to load then trigger print dialog
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };

      toast({
        title: "Thành công",
        description: "Đã mở cửa sổ in. Chọn 'Lưu dưới dạng PDF' để xuất tệp PDF.",
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
    <>
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val);
      if (!val) {
        document.body.style.pointerEvents = '';
      }
    }}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold text-primary">
            Xem trước báo giá #{quoteNumber}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Primary Actions */}
            <div className="flex flex-wrap gap-2">
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
              
              {userRole === 'admin' && (
                <Button onClick={() => setShowTemplateSettings(true)} variant="outline" size="sm">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Cài đặt
                </Button>
              )}
              
              {hasPermission('quote_supplement') && (
                <Button 
                  onClick={() => setShowQuoteSupplementDialog(true)} 
                  variant="outline" 
                  size="sm"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Phụ lục
                </Button>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto rounded-lg bg-slate-100/80 p-2 sm:p-4">
          <div className="mx-auto max-w-5xl bg-white shadow-sm ring-1 ring-slate-200" id="quote-preview" style={{ fontFamily: 'Times New Roman, serif' }}>
          <div className="p-4 sm:p-8">
            <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:gap-6">
              <div className="mx-auto h-24 w-24 shrink-0 sm:mx-0 sm:h-28 sm:w-28">
                <img 
                  src={logoError ? '/placeholder.svg' : (templateSettings.logoUrl || '/placeholder.svg')}
                  alt="Logo công ty"
                  className="h-full w-full object-contain rounded-md border border-slate-200 bg-white p-1"
                  onError={(e) => {
                    console.error('Logo load error, using fallback');
                    setLogoError(true);
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
              </div>
              
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h1 className="mb-2 text-lg font-bold tracking-tight sm:text-xl" style={{ color: templateSettings.companyTitleColor }}>
                  {templateSettings.companyTitle}
                </h1>
                <div className="space-y-0.5 text-xs leading-5 text-slate-600 sm:text-sm">
                  <p><span className="font-medium text-slate-700">Địa chỉ:</span> {templateSettings.address}</p>
                  <p><span className="font-medium text-slate-700">Điện thoại:</span> {templateSettings.phone} <span className="mx-1 text-slate-300">|</span> <span className="font-medium text-slate-700">MST:</span> {templateSettings.taxCode}</p>
                  <p><span className="font-medium text-slate-700">Trụ sở:</span> {templateSettings.headquarters}</p>
                  <p><span className="font-medium text-slate-700">STK:</span> {templateSettings.bankInfo}</p>
                </div>
              </div>
            </div>
            
            <div className="py-5 text-center">
              <h2 className="text-xl font-bold tracking-wide sm:text-2xl" style={{ color: templateSettings.quoteTitleColor }}>
                BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN
              </h2>
              <p className="mt-1 text-sm italic text-slate-500">Hà Nội ngày {quoteDate.getDate()} tháng {quoteDate.getMonth() + 1} năm {quoteDate.getFullYear()}</p>
            </div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                  THÔNG TIN KHÁCH HÀNG:
                </h3>
                <div className="space-y-1.5 text-sm text-slate-700">
                  <p><strong className="font-semibold text-slate-900">Tên KH:</strong> {customerName}</p>
                  {phone && <p><strong className="font-semibold text-slate-900">Điện thoại:</strong> {phone}</p>}
                  {address && <p><strong className="font-semibold text-slate-900">Địa chỉ:</strong> {address}</p>}
                </div>
              </div>
              
              <div className="rounded-md border border-slate-200 bg-slate-50/60 p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                  THÔNG TIN BÁO GIÁ:
                </h3>
                <div className="space-y-1.5 text-sm text-slate-700">
                  <p><strong className="font-semibold text-slate-900">Số báo giá:</strong> {quoteNumber}</p>
                  <p><strong className="font-semibold text-slate-900">Ngày báo giá:</strong> {quoteDate.toLocaleDateString('vi-VN')}</p>
                  <p><strong>Ngày hết hạn:</strong> {expiryDate}</p>
                </div>
              </div>
            </div>

            <div className="mb-6 overflow-x-auto rounded-md border border-slate-200">
              <Table className="min-w-[980px] table-fixed border-collapse">
                <TableHeader>
                  <TableRow className="bg-slate-100 hover:bg-slate-100">
                    <TableHead className="w-12 border-b border-slate-200 px-2 py-2 text-center text-[11px] font-bold text-slate-600">STT</TableHead>
                    <TableHead className="w-[16%] border-b border-slate-200 px-2 py-2 text-left text-[11px] font-bold text-slate-600">SẢN PHẨM</TableHead>
                    <TableHead className="w-[13%] border-b border-slate-200 px-2 py-2 text-left text-[11px] font-bold text-slate-600">QUY CÁCH</TableHead>
                    <TableHead className="w-[23%] border-b border-slate-200 px-2 py-2 text-left text-[11px] font-bold text-slate-600">CHẤT LIỆU / MÔ TẢ</TableHead>
                    <TableHead className="w-16 border-b border-slate-200 px-2 py-2 text-center text-[11px] font-bold text-slate-600">SL</TableHead>
                    <TableHead className="w-[11%] border-b border-slate-200 px-2 py-2 text-right text-[11px] font-bold text-slate-600">ĐƠN GIÁ</TableHead>
                    <TableHead className="w-[12%] border-b border-slate-200 px-2 py-2 text-right text-[11px] font-bold text-slate-600">THÀNH TIỀN</TableHead>
                    <TableHead className="w-24 border-b border-slate-200 px-2 py-2 text-center text-[11px] font-bold text-slate-600">ẢNH</TableHead>
                    <TableHead className="w-20 border-b border-slate-200 px-2 py-2 text-left text-[11px] font-bold text-slate-600">GHI CHÚ</TableHead>
                  </TableRow>
                </TableHeader>
                 <TableBody>
                   {correctedItems.map((item: any, index: number) => (
                     <TableRow key={index} className="align-top even:bg-slate-50/60">
                       <TableCell className="border-b border-slate-200 px-2 py-3 text-center text-sm text-slate-500">{index + 1}</TableCell>
                       <TableCell className="border-b border-slate-200 px-2 py-3 text-sm font-medium leading-5 text-slate-900 break-words">{item.name || item.sku}</TableCell>
                       <TableCell className="border-b border-slate-200 px-2 py-3 text-xs leading-5 text-slate-600 break-words">{item.specifications || '-'}</TableCell>
                       <TableCell className="border-b border-slate-200 px-2 py-3 text-xs leading-5 text-slate-600"><span className="line-clamp-3">{item.description || item.category || '-'}</span></TableCell>
                       <TableCell className="border-b border-slate-200 px-2 py-3 text-center text-sm text-slate-700">{item.quantity}</TableCell>
                       <TableCell className="border-b border-slate-200 px-2 py-3 text-right text-xs tabular-nums text-slate-700">{formatCurrency(item.price)}</TableCell>
                       <TableCell className="border-b border-slate-200 px-2 py-3 text-right text-xs font-semibold tabular-nums text-slate-900">{formatCurrency(item.total)}</TableCell>
                       <TableCell className="border-b border-slate-200 px-2 py-3 text-center">
                         {item.selectedImage ? (
                           <img 
                             src={transformImageUrl(item.selectedImage, { width: 120, quality: 70 })} 
                             alt="Sản phẩm"
                             className="mx-auto h-12 w-16 rounded object-cover ring-1 ring-slate-200"
                             loading="lazy"
                           />
                         ) : (
                           <div className="mx-auto flex h-12 w-16 flex-col items-center justify-center rounded bg-slate-100 text-slate-400">
                             <ImageOff className="h-4 w-4" />
                             <span className="mt-0.5 text-[9px]">Không có</span>
                           </div>
                         )}
                       </TableCell>
                       <TableCell className="border-b border-slate-200 px-2 py-3 text-xs text-slate-500">-</TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
              </Table>
            </div>

            <div className="mb-7 flex justify-end">
              <table className="w-full max-w-xl border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-600">TỔNG TRƯỚC VAT</td>
                    <td className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(subtotal)}</td>
                  </tr>
                  {includeVAT && (
                    <>
                      <tr>
                         <td className="border-b border-slate-200 px-3 py-2 text-slate-600">GTGT ({vatRate}%)</td>
                         <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums text-slate-700">{formatCurrency(vatAmount)}</td>
                      </tr>
                      <tr>
                         <td className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700">TỔNG ĐÃ BAO GỒM VAT</td>
                         <td className="border-b border-slate-200 px-3 py-2 text-right font-bold tabular-nums text-slate-900">{formatCurrency(totalWithVat)}</td>
                      </tr>
                    </>
                   )}
                   {hasPaymentPlan && (
                     <>
                       <tr>
                         <td className="border-b border-slate-200 px-3 py-2 text-slate-600">THANH TOÁN LẦN 1</td>
                         <td className="border-b border-slate-200 px-3 py-2 text-right tabular-nums text-slate-700">{formatCurrency(firstPayment)}</td>
                       </tr>
                       <tr>
                         <td className="px-3 py-2 font-bold text-slate-700">CÒN LẠI</td>
                         <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-900">{formatCurrency(remaining)}</td>
                       </tr>
                     </>
                   )}
                 </tbody>
               </table>
             </div>

            <div className="mb-8 border-t border-slate-200 pt-4">
              <div className="space-y-1 text-xs leading-5 text-slate-600 sm:text-sm">
                <p>1. Báo giá có hiệu lực trong 15 ngày kể từ ngày lập.</p>
                <p>2. Thanh toán: 50% trước khi sản xuất, 50% trước khi giao hàng.</p>
                <p>3. Thời gian giao hàng: 7-10 ngày làm việc sau khi nhận đặt cọc.</p>
                <p>4. Chất lượng sản phẩm được đảm bảo theo tiêu chuẩn.</p>
              </div>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-8 sm:gap-16">
              <div className="text-center">
                <p className="mb-12 text-sm font-bold sm:text-base">ĐẠI DIỆN CÔNG TY</p>
                <div className="h-16 mb-4"></div>
              </div>
              <div className="text-center">
                <p className="mb-12 text-sm font-bold sm:text-base">KHÁCH HÀNG</p>
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
        </div>
      </DialogContent>
    </Dialog>

    {/* QuoteSupplementDialog rendered OUTSIDE parent Dialog to prevent nested dialog issues */}
    <QuoteSupplementDialog
      open={showQuoteSupplementDialog}
      onOpenChange={(val) => {
        setShowQuoteSupplementDialog(val);
        if (!val) {
          // Ensure pointer-events are restored after closing nested dialog
          document.body.style.pointerEvents = '';
        }
      }}
      quote={quote}
    />
    </>
  );
}
