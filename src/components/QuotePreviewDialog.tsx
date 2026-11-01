import { formatQuoteDate, quoteDateHeading, quoteDocumentTerms, resolveQuoteDates } from '@/lib/quote-dates';
import React, { useState, useEffect } from "react";
import { Download, Printer, X, Calculator, FileDown, ImageOff, Edit, Copy, CheckCircle, XCircle, FileSignature, MoreHorizontal, Settings, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import html2canvas from 'html2canvas';
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { buildQuotePdfHtml, escapeQuoteHtml, safeQuoteImageUrl } from '@/lib/quote-document';
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { QuoteSupplementDialog } from './QuoteSupplementDialog';
import { QuoteTemplateSettings } from './QuoteTemplateSettings';
import { OnlineStampSignature } from './OnlineStampSignature';
import { fetchQuoteData } from '@/hooks/useQuotes';
import { isLocalBackend, localAdminUser } from '@/lib/runtime-config';
import { calculateQuote, assertSavedQuoteFinancials, quoteContactSnapshot, type CalculatedQuoteItem } from '@/lib/quote-calculation';

interface QuotePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Record<string, unknown> | null;
  onEdit?: (quote: Record<string, unknown>) => void;
  onEditDetails?: (quote: Record<string, unknown>) => void;
  onDuplicate?: (quote: Record<string, unknown>) => void;
  onApprove?: (quote: Record<string, unknown>) => void;
  onReject?: (quote: Record<string, unknown>) => void;
  onToContract?: (quote: Record<string, unknown>) => void;
  onPrevQuote?: () => void;
  onNextQuote?: () => void;
  positionLabel?: string;
}

export function QuotePreviewDialog({ open, onOpenChange, quote, onEdit, onEditDetails, onDuplicate, onApprove, onReject, onToContract, onPrevQuote, onNextQuote, positionLabel }: QuotePreviewDialogProps) {
  const [showSupplement, setShowSupplement] = useState(false);
  const [showTemplateSettings, setShowTemplateSettings] = useState(false);
  const [showQuoteSupplementDialog, setShowQuoteSupplementDialog] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; title: string } | null>(null);
  // Egress optimization: quote_data is no longer in list query — fetch on open
  const [quoteDataRaw, setQuoteDataRaw] = useState<string | null>(null);
  
  const [user, setUser] = useState<User | null>(null);
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
          fetchQuoteData(String(quote.id)).then((data) => {
            if (!cancelled) setQuoteDataRaw(data);
          });
        }
      }
    } else {
      // Reset all internal states when dialog closes to prevent overlay conflicts
      setShowSupplement(false);
      setShowTemplateSettings(false);
      setShowQuoteSupplementDialog(false);
      setZoomedImage(null);
      setQuoteDataRaw(null);
    }

    return () => {
      cancelled = true;
    };
  }, [open, quote?.id, quote?.quote_data, refetchTemplateSettings]);

  // Safety cleanup: ensure pointer-events are restored when dialog unmounts or closes
  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = '';
    };
  }, []);

  useEffect(() => {
    if (!open || showTemplateSettings || showQuoteSupplementDialog || Boolean(zoomedImage)) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      if (event.key === 'ArrowLeft' && onPrevQuote) {
        event.preventDefault();
        onPrevQuote();
      } else if (event.key === 'ArrowRight' && onNextQuote) {
        event.preventDefault();
        onNextQuote();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, showTemplateSettings, showQuoteSupplementDialog, zoomedImage, onPrevQuote, onNextQuote]);

  if (!quote) return null;

  // The list query uses snake_case while some legacy callers use camelCase.
  // Normalize once so every part of the preview refers to the same quote.
  const quoteNumber = String(quote.quote_number || quote.quoteNumber || `QUOTE-${String(quote.id || '').slice(0, 8) || 'N/A'}`);

  // Parse customer info - prioritize quote.customerName from hook
  const notes = String(quote.notes || '');


  // Parse items with real data
  let items: unknown[] = [];
  try {
    items = quote.items
      ? (typeof quote.items === 'string' ? JSON.parse(quote.items) : quote.items)
      : [];
  } catch (error) {
    console.error('Could not parse quote items:', error);
  }
  
  // Parse quote data for VAT and payment info (fetched on-demand)
  let quoteData: Record<string, unknown> = {};
  try {
    const rawQuoteData = quoteDataRaw ?? quote.quote_data;
    quoteData = rawQuoteData
      ? (typeof rawQuoteData === 'string' ? JSON.parse(rawQuoteData) : rawQuoteData)
      : {};
  } catch (error) {
    console.error('Could not parse quote data:', error);
  }
  const customerName = quoteContactSnapshot(quote, quoteData, 'customerName', /(?:^|\n)Khách hàng:[ \t]*([^\r\n]*)/, 'Không có tên');
  const phone = quoteContactSnapshot(quote, quoteData, 'customerPhone', /(?:^|\n)Điện thoại:[ \t]*([^\r\n]*)/);
  const email = quoteContactSnapshot(quote, quoteData, 'customerEmail', /(?:^|\n)Email:[ \t]*([^\r\n]*)/);
  const address = quoteContactSnapshot(quote, quoteData, 'customerAddress', /(?:^|\n)Địa chỉ:[ \t]*([^\r\n]*)/);
  
  // Ensure all item totals are correctly calculated
  const includeVAT = Boolean(quote.include_vat ?? quoteData.includeVAT ?? false);
  const vatRate = Number(quote.vat_rate ?? quoteData.vatRate ?? 8);
  const payment1 = Number(quoteData.payment1 ?? 0), payment2 = Number(quoteData.payment2 ?? 0);
  let calculationError = '';
  let calculation = { items: [] as CalculatedQuoteItem[], subtotal: 0, vatAmount: 0, total: 0, remaining: 0 };
  try {
    const calculated = calculateQuote({ items, includeVAT, vatRate, payment1, payment2 });
    calculation = calculated;
    assertSavedQuoteFinancials(quote, calculated, quoteData);
  }
  catch (error) { calculationError = (error as Error).message; }
  const correctedItems = calculation.items;
  const { subtotal, vatAmount, total: totalWithVat, remaining } = calculation;
  const firstPayment = payment1;
  const hasPaymentPlan = 'payment1' in quoteData || 'payment2' in quoteData;
  const quoteTitle = String(quoteData.title || quote.title || 'BẢNG BÁO GIÁ ĐỒ VẢI KHÁCH SẠN');
  const responsibleName = typeof quote.responsible === 'string' && quote.responsible.trim() && quote.responsible !== 'Chưa phân công'
    ? quote.responsible.trim()
    : '';

  const savedDates = resolveQuoteDates(quote, quoteData);
  const quoteDate = formatQuoteDate(savedDates.quoteDate);
  const expiryDate = formatQuoteDate(savedDates.expiryDate);
  const dateHeading = quoteDateHeading(savedDates.quoteDate);
  const documentTerms = quoteDocumentTerms(savedDates.expiryDate, templateSettings.terms);

  const readThreeDigits = (n: number, showZeroHundred: boolean): string => {
    const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    const hundred = Math.floor(n / 100);
    const ten = Math.floor((n % 100) / 10);
    const unit = n % 10;
    const parts: string[] = [];
    if (hundred > 0 || showZeroHundred) {
      parts.push(`${digits[hundred]} trăm`);
    }
    if (ten > 1) {
      parts.push(`${digits[ten]} mươi`);
      if (unit === 1) parts.push('mốt');
      else if (unit === 4) parts.push('tư');
      else if (unit === 5) parts.push('lăm');
      else if (unit > 0) parts.push(digits[unit]);
    } else if (ten === 1) {
      parts.push('mười');
      if (unit === 5) parts.push('lăm');
      else if (unit > 0) parts.push(digits[unit]);
    } else if (unit > 0) {
      if (hundred > 0 || showZeroHundred) parts.push('lẻ');
      parts.push(digits[unit]);
    }
    return parts.join(' ');
  };

  const formatAmountInVietnameseWords = (amount: number): string => {
    const rounded = Math.round(Math.abs(amount));
    if (!Number.isFinite(rounded) || rounded === 0) return 'Không đồng';
    const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ'];
    const groups: number[] = [];
    let temp = rounded;
    while (temp > 0) {
      groups.push(temp % 1000);
      temp = Math.floor(temp / 1000);
    }
    const textParts: string[] = [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const grp = groups[i];
      if (grp === 0) continue;
      const showZeroHundred = i < groups.length - 1;
      const grpText = readThreeDigits(grp, showZeroHundred);
      textParts.push(units[i] ? `${grpText} ${units[i]}` : grpText);
    }
    const full = textParts.join(' ').trim();
    return (amount < 0 ? 'Âm ' : '') + full.charAt(0).toUpperCase() + full.slice(1) + ' đồng chẵn.';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN').format(amount);
  };

  const cleanFieldPrefix = (value: unknown, pattern: RegExp): string => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    return raw.replace(pattern, '').trim();
  };

  const displayCompanyAddress = cleanFieldPrefix(templateSettings.address, /^(?:địa\s*chỉ|trụ\s*sở)\s*[:：-]\s*/iu);
  const displayCompanyHeadquarters = cleanFieldPrefix(templateSettings.headquarters, /^(?:trụ\s*sở|địa\s*chỉ)\s*[:：-]\s*/iu);
  const displayCompanyPhone = cleanFieldPrefix(templateSettings.phone, /^(?:điện\s*thoại|sđt|đt|tel)\s*[:：-]\s*/iu);
  const displayCompanyTaxCode = cleanFieldPrefix(templateSettings.taxCode, /^(?:mã\s*số\s*thuế|mst)\s*[:：-]\s*/iu);
  const displayCompanyBankInfo = cleanFieldPrefix(templateSettings.bankInfo, /^(?:số\s*tài\s*khoản|stk|tài\s*khoản)\s*[:：-]\s*/iu);
  const hasAnyProductImage = correctedItems.some((item) => Boolean(safeQuoteImageUrl(item.selectedImage)));
  const hasAnyItemNotes = correctedItems.some((item) => Boolean(typeof item.notes === 'string' && item.notes.trim()));
  const totalQuantity = correctedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const normalizeAddressKey = (val: string) =>
    val.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const showSeparateHeadquarters = Boolean(
    displayCompanyHeadquarters &&
    normalizeAddressKey(displayCompanyHeadquarters).slice(0, 24) !== normalizeAddressKey(displayCompanyAddress).slice(0, 24)
  );

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
        const logoPath = safeQuoteImageUrl(templateSettings.logoUrl);
        if (!logoPath) throw new Error('Ảnh logo không hợp lệ');
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
      companyCell.font = { name: 'Times New Roman', bold: true, size: 16, color: { argb: 'FF0F172A' } };
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
      if (calculationError) throw new Error(calculationError);
      titleCell.value = quoteTitle;
      titleCell.font = { name: 'Times New Roman', bold: true, size: 18, color: { argb: 'FF0F172A' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

      currentRow += 2;

      // Date info on row 9 - merge from A to I (dynamic date from quote)
      worksheet.mergeCells(`A9:I9`);
      const dateCell = worksheet.getCell(`A9`);
      dateCell.value = dateHeading;
      dateCell.font = { name: 'Times New Roman', size: 12, italic: true };
      dateCell.alignment = { horizontal: 'center' };

      currentRow += 2;

      // Customer info in column B
      const customerInfoCell = worksheet.getCell(`B${currentRow}`);
      customerInfoCell.value = 'THÔNG TIN KHÁCH HÀNG:';
      customerInfoCell.font = { name: 'Times New Roman', bold: true, size: 12, color: { argb: 'FF1E293B' } };

      // Quote info starting from column H
      const quoteInfoCell = worksheet.getCell(`H${currentRow}`);
      quoteInfoCell.value = 'THÔNG TIN BÁO GIÁ:';
      quoteInfoCell.font = { name: 'Times New Roman', bold: true, size: 12, color: { argb: 'FF1E293B' } };

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
      quoteDateCell.value = `Ngày báo giá: ${quoteDate}`;
      quoteDateCell.font = { name: 'Times New Roman', size: 10 };

      currentRow++;
      
      // Expiry date from column H
      const expiryDateCell = worksheet.getCell(`H${currentRow}`);
      expiryDateCell.value = `Ngày hết hạn: ${expiryDate}`;
      expiryDateCell.font = { name: 'Times New Roman', size: 10 };

      currentRow += 2;

      // Table headers with Times New Roman font and blue color #0070C0
      const headers = ['STT', 'SẢN PHẨM', 'QUY CÁCH (CM)', 'CHẤT LIỆU', 'SỐ LƯỢNG', 'ĐƠN GIÁ', 'THÀNH TIỀN', 'HÌNH ẢNH', 'Ghi Chú'];
      
      headers.forEach((header, index) => {
        const cell = worksheet.getCell(`${String.fromCharCode(65 + index)}${currentRow}`);
        cell.value = header;
        cell.font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FF0F172A' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' }
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
        cellG.value = { formula: `ROUND(E${currentRow}*F${currentRow},0)`, result: item.total };
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
        const imageUrl = safeQuoteImageUrl(item.selectedImage);
        if (imageUrl) {
          try {
            const imageResponse = await fetch(imageUrl);
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
        labelCell.font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FF0F172A' } };
        labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
        labelCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // Merge E-I for value (5 columns)
        worksheet.mergeCells(`E${currentRow}:I${currentRow}`);
        const valueCell = worksheet.getCell(`E${currentRow}`);
        valueCell.value = isFormula ? valueOrFormula : valueOrFormula;
        valueCell.font = { name: 'Times New Roman', bold: true, size: 11, color: { argb: 'FF0F172A' } };
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
        addTotalRow(`GTGT (${vatRate}%)`, { formula: `ROUND(E${subtotalRow}*${vatRate}/100,0)` }, true);
        
        // Row 3: TỔNG TIỀN ĐÃ BAO GỒM GTGT = Subtotal + VAT
        totalWithVatRow = currentRow;
        addTotalRow('TỔNG TIỀN ĐÃ BAO GỒM GTGT', { formula: `E${subtotalRow}+E${vatRow}` }, true);
      }

      // Row 4: THANH TOÁN LẦN 1 (editable value) - ensure it's a number
      const payment1Row = currentRow;
      const safeFirstPayment = typeof firstPayment === 'number' && !isNaN(firstPayment) ? firstPayment : 0;
      addTotalRow('THANH TOÁN LẦN 1', safeFirstPayment, false);
      const payment2Row = payment2 > 0 ? addTotalRow('DỰ KIẾN THANH TOÁN LẦN 2', payment2, false) : 0;

      // Row 5: THANH TOÁN LẦN 2 = Total - Payment1 (use column E for formulas now)
      const totalRefRow = includeVAT ? totalWithVatRow : subtotalRow;
      const remainingFormula = payment2Row > 0 ? `E${totalRefRow}-E${payment1Row}-E${payment2Row}` : `E${totalRefRow}-E${payment1Row}`;
      addTotalRow('THANH TOÁN LẦN 2', { formula: remainingFormula }, true);

      if (typeof formatAmountInVietnameseWords === 'function') {
        const amountForWords = typeof remaining === 'number' && !isNaN(remaining)
          ? remaining
          : (includeVAT ? totalWithVat : subtotal) - safeFirstPayment - (typeof payment2 === 'number' && !isNaN(payment2) ? payment2 : 0);
        worksheet.mergeCells(`A${currentRow}:I${currentRow}`);
        const amountWordsCell = worksheet.getCell(`A${currentRow}`);
        amountWordsCell.value = `Bằng chữ: ${formatAmountInVietnameseWords(amountForWords)}`;
        amountWordsCell.font = { name: 'Times New Roman', italic: true, size: 11, color: { argb: 'FF0F172A' } };
        amountWordsCell.alignment = { horizontal: 'right', vertical: 'middle' };
        currentRow++;
      }

      currentRow += 2;

      // Terms with Times New Roman font
      documentTerms.forEach((term, index) => {
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
      const safeQuoteNumber = String(quote.quote_number || quote.quoteNumber || 'KHONG-SO').replace(/[\\/:*?"<>|]/g, '').trim();
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
        const headStyles = typeof document.querySelectorAll === 'function'
          ? Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
              .map((el) => el.outerHTML || '')
              .join('\n')
          : '';
        printWindow.document.write(`
          <html>
            <head>
              <meta charset="UTF-8" />
              <title>Báo giá ${escapeQuoteHtml(quoteNumber)}</title>
              ${headStyles}
              <style>
                body { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 16px; color: #0f172a; background: #ffffff; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #cbd5e1; padding: 6px 8px; }
                th { background-color: #f8fafc; font-weight: bold; color: #334155; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                @media print {
                  @page { margin: 1cm; size: A4; }
                  body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
              </style>
            </head>
            <body>
              <div>
                ${printContent.innerHTML}
              </div>
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
      const htmlContent = buildQuotePdfHtml({
        quoteNumber, createdDate: quoteDate, expiryDate,
        status: String(quote.status || ''), customerName, phone, address, email, templateSettings: { ...templateSettings, terms: documentTerms }, correctedItems,
        subtotal, includeVAT, vatRate, vatAmount, totalWithVat, firstPayment, payment2, remaining,
      });

      // Register before writing/closing: a local-only document can finish loading immediately.
      printWindow.onload = () => {
        setTimeout(() => { printWindow.print(); }, 500);
      };
      printWindow.document.write(htmlContent);
      printWindow.document.close();

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


  const statusTextMap: Record<string, string> = {
    draft: 'Nháp',
    sent: 'Đã gửi',
    approved: 'Đã duyệt',
    rejected: 'Từ chối',
    expired: 'Hết hạn',
  };
  const quoteStatusKey = String(quote.status || 'draft');
  const quoteStatusLabel = statusTextMap[quoteStatusKey] || quoteStatusKey;
  const canEditQuote = !(isLocalBackend() && quoteStatusKey === 'approved');
  const canApproveQuote = (userRole === 'manager' || userRole === 'admin' || hasPermission('quote_approval')) && ['draft', 'sent'].includes(quoteStatusKey);

  const handleExportImage = async () => {
    try {
      const previewEl = document.getElementById('quote-preview');
      if (!previewEl) return;
      const canvas = await html2canvas(previewEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const safeQuoteNum = String(quote.quote_number || quote.quoteNumber || 'KHONG-SO').replace(/[\\/:*?"<>|]/g, '').trim();
      a.href = dataUrl;
      a.download = `BG-${safeQuoteNum}.png`;
      a.click();
      toast({
        title: "Đã tải ảnh báo giá",
        description: `Đã xuất ảnh PNG báo giá #${quoteNumber} để gửi nhanh cho khách.`,
      });
    } catch {
      toast({
        title: "Lỗi xuất ảnh",
        description: "Không thể tạo ảnh báo giá. Vui lòng thử lại.",
        variant: "destructive",
      });
    }
  };

  const handleCopySummary = async () => {
    const finalAmount = formatCurrency(includeVAT ? totalWithVat : subtotal);
    const lines = [
      `BÁO GIÁ #${quoteNumber}`,
      `Khách hàng: ${customerName}${phone ? ` - ${phone}` : ''}`,
      `Ngày báo giá: ${quoteDate} (Hiệu lực đến: ${expiryDate})`,
      `Số lượng mặt hàng: ${correctedItems.length} sản phẩm`,
      `Tổng thanh toán${includeVAT ? ` (đã gồm VAT ${vatRate}%)` : ''}: ${finalAmount} VNĐ`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast({
        title: "Đã sao chép tóm tắt báo giá",
        description: `Đã chép thông tin báo giá #${quoteNumber} vào bộ nhớ tạm.`,
      });
    } catch {
      toast({
        title: "Không thể sao chép",
        description: "Trình duyệt không cho phép truy cập bộ nhớ tạm.",
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
      <DialogContent className="flex h-[min(92dvh,calc(100dvh-1rem))] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="flex-shrink-0 border-b border-border bg-card px-4 py-3 pr-14 sm:px-6">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base font-semibold text-foreground sm:text-lg">
                  Xem trước báo giá #{quoteNumber}
                </DialogTitle>
                {(onPrevQuote || onNextQuote) && (
                  <div className="inline-flex items-center rounded border border-border bg-background">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={onPrevQuote}
                      disabled={!onPrevQuote}
                      className="h-6 w-6 rounded-none border-r border-border"
                      title="Báo giá trước"
                      aria-label="Báo giá trước"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    {positionLabel && (
                      <span className="px-1.5 text-[11px] tabular-nums text-muted-foreground">
                        {positionLabel}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={onNextQuote}
                      disabled={!onNextQuote}
                      className="h-6 w-6 rounded-none border-l border-border"
                      title="Báo giá tiếp theo"
                      aria-label="Báo giá tiếp theo"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                <span className="rounded border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground">
                  {quoteStatusLabel}
                </span>
                <span className="rounded border border-border bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
                  {correctedItems.length} mục ({totalQuantity} SP)
                </span>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {formatCurrency(includeVAT ? totalWithVat : subtotal)} đ
                </span>
              </div>
              <DialogDescription className="sr-only">
                Xem chi tiết nội dung, bảng tính và in hoặc xuất Excel cho báo giá #{quoteNumber}.
              </DialogDescription>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                onClick={handlePrint}
                disabled={Boolean(calculationError)}
                variant="default"
                size="sm"
                className="h-8 px-3 text-xs font-medium"
                title="In báo giá hoặc chọn Lưu dưới dạng PDF"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                In / PDF
              </Button>

              {!calculationError && (
                <Button
                  onClick={handleExportImage}
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs font-medium"
                  title="Tải ảnh PNG báo giá để gửi nhanh qua Zalo"
                >
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                  Tải ảnh
                </Button>
              )}

              <Button
                onClick={handleExportExcel}
                disabled={Boolean(calculationError)}
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs font-medium"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Excel
              </Button>

              {onEdit && canEditQuote && (
                <Button
                  onClick={() => onEdit({ ...quote, quote_data: quoteDataRaw ?? quote.quote_data })}
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs font-medium"
                >
                  <Edit className="mr-1.5 h-3.5 w-3.5" />
                  Sửa
                </Button>
              )}

              {hasPermission('quote_supplement') && (
                <Button
                  onClick={() => setShowQuoteSupplementDialog(true)}
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs font-medium"
                >
                  <Calculator className="mr-1.5 h-3.5 w-3.5" />
                  Phụ lục
                </Button>
              )}

              {(onApprove || onDuplicate || onToContract || userRole === 'admin') && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs font-medium"
                      aria-label="Thao tác khác"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5 sm:mr-1" />
                      <span className="hidden sm:inline">Khác</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={handleCopySummary}>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Sao chép tóm tắt
                    </DropdownMenuItem>
                    {!calculationError && (
                      <DropdownMenuItem onClick={handleExportPDF}>
                        <FileDown className="mr-2 h-3.5 w-3.5" />
                        Xuất bản in PDF
                      </DropdownMenuItem>
                    )}
                    {onApprove && canApproveQuote && !calculationError && (
                      <DropdownMenuItem onClick={() => onApprove(quote)}>
                        <CheckCircle className="mr-2 h-3.5 w-3.5" />
                        Duyệt báo giá
                      </DropdownMenuItem>
                    )}
                    {onReject && canApproveQuote && (
                      <DropdownMenuItem onClick={() => onReject(quote)} className="text-destructive focus:text-destructive">
                        <XCircle className="mr-2 h-3.5 w-3.5" />
                        Từ chối báo giá
                      </DropdownMenuItem>
                    )}
                    {onEditDetails && canApproveQuote && canEditQuote && (
                      <DropdownMenuItem onClick={() => onEditDetails(quote)}>
                        <Calendar className="mr-2 h-3.5 w-3.5" />
                        Sửa ngày & trạng thái
                      </DropdownMenuItem>
                    )}
                    {onDuplicate && (
                      <DropdownMenuItem onClick={() => onDuplicate(quote)}>
                        <Copy className="mr-2 h-3.5 w-3.5" />
                        Nhân bản báo giá
                      </DropdownMenuItem>
                    )}
                    {onToContract && !calculationError && (
                      <DropdownMenuItem onClick={() => onToContract(quote)}>
                        <FileSignature className="mr-2 h-3.5 w-3.5" />
                        Tạo hợp đồng
                      </DropdownMenuItem>
                    )}
                    {userRole === 'admin' && (
                      <>
                        {(onApprove || onDuplicate || onToContract) && <DropdownMenuSeparator />}
                        <DropdownMenuItem onClick={() => setShowTemplateSettings(true)}>
                          <Settings className="mr-2 h-3.5 w-3.5" />
                          Cài đặt mẫu in
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </DialogHeader>

        {calculationError && (
          <div className="flex-shrink-0 border-b border-destructive/20 bg-destructive/10 px-4 py-2.5 sm:px-6">
            <p role="alert" className="text-xs font-medium text-destructive sm:text-sm">
              Báo giá cũ có dữ liệu chưa hợp lệ: {calculationError} Vui lòng kiểm tra hoặc nhân bản để sửa; chưa thể xuất/in.
            </p>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-2 sm:p-4">
          <div
            className="mx-auto max-w-5xl rounded-md border border-border bg-white font-sans text-slate-900 shadow-xs print:border-0 print:shadow-none"
            id="quote-preview"
          >
            <div className="p-4 sm:p-6">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-3.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="mx-auto h-16 w-16 shrink-0 sm:mx-0 sm:h-20 sm:w-20">
                  <img
                    src={logoError ? '/placeholder.svg' : (safeQuoteImageUrl(templateSettings.logoUrl) || '/placeholder.svg')}
                    alt="Logo công ty"
                    className="h-full w-full rounded border border-slate-200 bg-white object-contain p-1"
                    onError={(e) => {
                      setLogoError(true);
                      e.currentTarget.src = '/placeholder.svg';
                    }}
                  />
                </div>

                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <h1 className="mb-1 text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                    {templateSettings.companyTitle || templateSettings.companyName}
                  </h1>
                  <div className="space-y-0.5 text-xs leading-5 text-slate-600">
                    {displayCompanyAddress && (
                      <p>
                        <span className="font-semibold text-slate-700">Địa chỉ:</span> {displayCompanyAddress}
                      </p>
                    )}
                    {showSeparateHeadquarters && (
                      <p>
                        <span className="font-semibold text-slate-700">Trụ sở:</span> {displayCompanyHeadquarters}
                      </p>
                    )}
                    <p>
                      <span className="font-semibold text-slate-700">Điện thoại:</span> {displayCompanyPhone || '-'}
                      {displayCompanyTaxCode && (
                        <>
                          <span className="mx-2 text-slate-300">|</span>
                          <span className="font-semibold text-slate-700">MST:</span> {displayCompanyTaxCode}
                        </>
                      )}
                    </p>
                    {displayCompanyBankInfo && (
                      <p>
                        <span className="font-semibold text-slate-700">STK:</span> {displayCompanyBankInfo}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 py-3 text-center sm:flex-row sm:items-baseline sm:justify-between sm:text-left">
                <h2 className="text-base font-bold tracking-wide text-slate-900 sm:text-lg">
                  {quoteTitle}
                </h2>
                <p className="text-xs italic text-slate-500">{dateHeading}</p>
              </div>

              <div className="mb-4 grid gap-2.5 sm:grid-cols-2">
                <div className="rounded border border-slate-200 bg-slate-50/50 px-3 py-2.5">
                  <h3 className="mb-1.5 border-b border-slate-200/80 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Thông tin khách hàng
                  </h3>
                  <div className="space-y-0.5 text-xs leading-5 text-slate-700 sm:text-[13px]">
                    <p><strong className="font-semibold text-slate-900">Tên KH:</strong> {customerName}</p>
                    {phone && <p><strong className="font-semibold text-slate-900">Điện thoại:</strong> {phone}</p>}
                    {address && <p><strong className="font-semibold text-slate-900">Địa chỉ:</strong> {address}</p>}
                    {email && <p><strong className="font-semibold text-slate-900">Email:</strong> {email}</p>}
                  </div>
                </div>

                <div className="rounded border border-slate-200 bg-slate-50/50 px-3 py-2.5">
                  <h3 className="mb-1.5 border-b border-slate-200/80 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Thông tin báo giá
                  </h3>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs leading-5 text-slate-700 sm:grid-cols-2 sm:text-[13px]">
                    <p className={responsibleName ? '' : 'sm:col-span-2'}><strong className="font-semibold text-slate-900">Số báo giá:</strong> {quoteNumber}</p>
                    {responsibleName && (
                      <p><strong className="font-semibold text-slate-900">Phụ trách:</strong> {responsibleName}</p>
                    )}
                    <p><strong className="font-semibold text-slate-900">Ngày báo giá:</strong> {quoteDate}</p>
                    <p><strong className="font-semibold text-slate-900">Ngày hết hạn:</strong> {expiryDate}</p>
                  </div>
                </div>
              </div>

              <div className="mb-4 overflow-x-auto rounded border border-slate-200">
                <Table disableWrapper className="min-w-[680px] w-full table-fixed border-collapse">
                  <TableHeader>
                    <TableRow className="bg-slate-100/90 hover:bg-slate-100/90">
                      <TableHead className="h-8 w-10 border-b border-slate-200 px-2 py-1.5 text-center text-[11px] font-bold text-slate-700">STT</TableHead>
                      <TableHead className="h-8 w-[24%] border-b border-slate-200 px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-700">SẢN PHẨM</TableHead>
                      <TableHead className="h-8 w-[14%] border-b border-slate-200 px-2 py-1.5 text-left text-[11px] font-bold text-slate-700">QUY CÁCH</TableHead>
                      <TableHead className="h-8 border-b border-slate-200 px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-700">CHẤT LIỆU / MÔ TẢ</TableHead>
                      <TableHead className="h-8 w-12 border-b border-slate-200 px-2 py-1.5 text-center text-[11px] font-bold text-slate-700">SL</TableHead>
                      <TableHead className="h-8 w-24 border-b border-slate-200 px-2 py-1.5 text-right text-[11px] font-bold text-slate-700">ĐƠN GIÁ</TableHead>
                      <TableHead className="h-8 w-28 border-b border-slate-200 px-2.5 py-1.5 text-right text-[11px] font-bold text-slate-700">THÀNH TIỀN</TableHead>
                      {hasAnyProductImage && (
                        <TableHead className="h-8 w-16 border-b border-slate-200 px-2 py-1.5 text-center text-[11px] font-bold text-slate-700">ẢNH</TableHead>
                      )}
                      {hasAnyItemNotes && (
                        <TableHead className="h-8 w-20 border-b border-slate-200 px-2 py-1.5 text-left text-[11px] font-bold text-slate-700">GHI CHÚ</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {correctedItems.map((item, index: number) => (
                      <TableRow key={index} className="align-middle even:bg-slate-50/50 hover:bg-slate-50/80">
                        <TableCell className="border-b border-slate-200 px-2 py-1.5 text-center text-xs tabular-nums text-slate-500">{index + 1}</TableCell>
                        <TableCell className="border-b border-slate-200 px-2.5 py-1.5 text-xs font-medium leading-4 text-slate-900 break-words sm:text-[13px] sm:leading-5">
                          <span>{item.name || item.sku}</span>
                          {item.name && item.sku && item.sku !== item.name && (
                            <span className="ml-1.5 inline-block rounded border border-slate-200 bg-slate-50 px-1.5 py-0 text-[10px] font-normal text-slate-600">
                              {item.sku}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="border-b border-slate-200 px-2 py-1.5 text-xs leading-4 text-slate-600 break-words">{item.specifications || '-'}</TableCell>
                        <TableCell className="border-b border-slate-200 px-2.5 py-1.5 text-xs leading-4 text-slate-600">
                          <span className="line-clamp-2">{item.description || item.category || '-'}</span>
                        </TableCell>
                        <TableCell className="border-b border-slate-200 px-2 py-1.5 text-center text-xs font-medium tabular-nums text-slate-800">{item.quantity}</TableCell>
                        <TableCell className="border-b border-slate-200 px-2 py-1.5 text-right text-xs tabular-nums text-slate-700 whitespace-nowrap">{formatCurrency(item.price)}</TableCell>
                        <TableCell className="border-b border-slate-200 px-2.5 py-1.5 text-right text-xs font-semibold tabular-nums text-slate-900 whitespace-nowrap">{formatCurrency(item.total)}</TableCell>
                        {hasAnyProductImage && (
                          <TableCell className="border-b border-slate-200 px-2 py-1.5 text-center">
                            {safeQuoteImageUrl(item.selectedImage) ? (
                              <button
                                type="button"
                                onClick={() => setZoomedImage({ url: safeQuoteImageUrl(item.selectedImage), title: String(item.name || item.sku || 'Ảnh sản phẩm') })}
                                className="mx-auto block rounded border border-slate-200 p-0.5 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                title="Bấm để phóng to ảnh sản phẩm"
                              >
                                <img
                                  src={transformImageUrl(safeQuoteImageUrl(item.selectedImage), { width: 120, quality: 70 })}
                                  alt="Sản phẩm"
                                  className="h-9 w-12 rounded-xs object-cover"
                                  loading="lazy"
                                />
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </TableCell>
                        )}
                        {hasAnyItemNotes && (
                          <TableCell className="border-b border-slate-200 px-2 py-1.5 text-xs text-slate-500">{item.notes || '-'}</TableCell>
                        )}
                      </TableRow>
                    ))}
                    {correctedItems.length > 1 && (
                      <TableRow className="bg-slate-50/80 font-semibold hover:bg-slate-50/80">
                        <TableCell colSpan={4} className="px-2.5 py-1.5 text-right text-xs text-slate-600">
                          Cộng ({correctedItems.length} mục):
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-center text-xs font-bold tabular-nums text-slate-900">
                          {totalQuantity}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs text-slate-500">
                          -
                        </TableCell>
                        <TableCell className="px-2.5 py-1.5 text-right text-xs font-bold tabular-nums text-slate-900 whitespace-nowrap">
                          {formatCurrency(subtotal)}
                        </TableCell>
                        {hasAnyProductImage && <TableCell className="px-2 py-1.5" />}
                        {hasAnyItemNotes && <TableCell className="px-2 py-1.5" />}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="order-2 lg:order-1 lg:col-span-7">
                  <div className="rounded border border-slate-200 bg-slate-50/40 p-3">
                    <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Điều khoản & ghi chú báo giá
                    </h4>
                    <div className="space-y-1 text-xs leading-5 text-slate-600">
                      {documentTerms.map((term, index) => <p key={index}>{index + 1}. {term}</p>)}
                    </div>
                  </div>
                </div>

                <div className="order-1 lg:order-2 lg:col-span-5">
                  <table className="w-full border-collapse rounded border border-slate-200 text-xs sm:text-[13px]">
                    <tbody>
                      <tr>
                        <td className="border-b border-slate-200 bg-slate-50/70 px-3 py-1.5 font-medium text-slate-600">TỔNG TRƯỚC VAT</td>
                        <td className="border-b border-slate-200 bg-slate-50/70 px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(subtotal)}</td>
                      </tr>
                      {includeVAT && (
                        <>
                          <tr>
                            <td className="border-b border-slate-200 px-3 py-1.5 text-slate-600">GTGT ({vatRate}%)</td>
                            <td className="border-b border-slate-200 px-3 py-1.5 text-right tabular-nums text-slate-700">{formatCurrency(vatAmount)}</td>
                          </tr>
                          <tr className="bg-slate-100/80">
                            <td className="border-b border-slate-200 px-3 py-2 font-bold text-slate-900">TỔNG ĐÃ BAO GỒM VAT</td>
                            <td className="border-b border-slate-200 px-3 py-2 text-right font-bold tabular-nums text-slate-900">{formatCurrency(totalWithVat)}</td>
                          </tr>
                        </>
                      )}
                      {hasPaymentPlan && (firstPayment > 0 || payment2 > 0) && (
                        <>
                          {firstPayment > 0 && (
                            <tr>
                              <td className="border-b border-slate-200 px-3 py-1.5 text-slate-600">THANH TOÁN LẦN 1</td>
                              <td className="border-b border-slate-200 px-3 py-1.5 text-right tabular-nums text-slate-700">{formatCurrency(firstPayment)}</td>
                            </tr>
                          )}
                          {payment2 > 0 && (
                            <tr>
                              <td className="border-b border-slate-200 px-3 py-1.5 text-slate-600">DỰ KIẾN THANH TOÁN LẦN 2</td>
                              <td className="border-b border-slate-200 px-3 py-1.5 text-right tabular-nums text-slate-700">{formatCurrency(payment2)}</td>
                            </tr>
                          )}
                          <tr>
                            <td className="px-3 py-1.5 font-semibold text-slate-800">THANH TOÁN LẦN 2</td>
                            <td className="px-3 py-1.5 text-right font-bold tabular-nums text-slate-900">{formatCurrency(remaining)}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                  <p className="mt-1.5 text-right text-[11px] italic text-slate-600">
                    Bằng chữ: <span className="font-medium text-slate-800">{formatAmountInVietnameseWords(remaining)}</span>
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-200 pt-4 sm:gap-12">
                <div className="text-center">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-800 sm:text-sm">ĐẠI DIỆN CÔNG TY</p>
                  {(templateSettings.stampUrl || templateSettings.signatureUrl) ? (
                    <OnlineStampSignature
                      show={true}
                      editable={false}
                      sellerRep={String((templateSettings as unknown as Record<string, unknown>).directorName || '').trim() || undefined}
                    />
                  ) : (
                    <div className="h-16"></div>
                  )}
                </div>
                <div className="text-center">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-800 sm:text-sm">KHÁCH HÀNG</p>
                  <div className="h-16"></div>
                </div>
              </div>

              {templateSettings.footerNote && (
                <div className="mt-4 border-t border-slate-200 pt-2.5 text-center">
                  <p className="text-xs italic text-slate-500">{templateSettings.footerNote}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <QuoteTemplateSettings
      open={showTemplateSettings}
      onOpenChange={(val) => {
        setShowTemplateSettings(val);
        if (!val) {
          refetchTemplateSettings();
          document.body.style.pointerEvents = '';
        }
      }}
    />

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

    <Dialog open={Boolean(zoomedImage)} onOpenChange={(val) => !val && setZoomedImage(null)}>
      <DialogContent className="max-w-2xl p-4">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm font-semibold text-foreground">
            {zoomedImage?.title || 'Ảnh sản phẩm'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Xem phóng to ảnh minh họa sản phẩm trong báo giá.
          </DialogDescription>
        </DialogHeader>
        {zoomedImage && (
          <div className="flex max-h-[75dvh] items-center justify-center overflow-hidden rounded border border-border bg-muted/20 p-2">
            <img
              src={zoomedImage.url}
              alt={zoomedImage.title}
              className="max-h-[70dvh] w-auto object-contain"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
