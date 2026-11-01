import type { CalculatedQuoteItem } from './quote-calculation';

/** Escape untrusted text in both HTML text nodes and quoted attributes. */
export function escapeQuoteHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Only web images and local relative paths may reach quote documents or image fetches. */
export function safeQuoteImageUrl(value: unknown): string {
  if (typeof value !== 'string' || Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return '';
  const url = value.trim();
  if (!url || /\\/.test(url) || /%(?![0-9a-f]{2})/i.test(url) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(url)) return '';
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
  if (absolute && !/^https?:\/\//i.test(url)) return '';
  if (!absolute && (/^\/\//.test(url) || /^[?#]/.test(url))) return '';
  try {
    const parsed = new URL(url, 'https://quote-local.invalid/');
    return ['http:', 'https:'].includes(parsed.protocol) ? url : '';
  } catch { return ''; }
}

export interface QuotePdfDocumentInput {
  quoteNumber: string;
  createdDate: string;
  expiryDate: string;
  status: string;
  customerName: string;
  phone: string;
  address: string;
  email: string;
  templateSettings: { companyName: string; address: string; phone: string; logoUrl: string; terms: string[]; footerNote: string };
  correctedItems: CalculatedQuoteItem[];
  subtotal: number;
  includeVAT: boolean;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
  firstPayment: number;
  payment2: number;
  remaining: number;
}

/** The PDF popup uses the same fixed layout; every dynamic value is escaped at its sink. */
export function buildQuotePdfHtml(input: QuotePdfDocumentInput): string {
  const { quoteNumber, createdDate, expiryDate, status, customerName, phone, address, email, templateSettings, correctedItems, subtotal, includeVAT, vatRate, vatAmount, totalWithVat, firstPayment, payment2, remaining } = input;
  const logoUrl = safeQuoteImageUrl(templateSettings.logoUrl);
  return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Báo giá ${escapeQuoteHtml(quoteNumber)}</title>
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
              background: #f8fafc;
              color: #0f172a;
              border-bottom: 1px solid #cbd5e1;
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
              border: 1px solid #cbd5e1;
            }
            
            .quote-number {
              font-size: 20px;
              font-weight: 600;
              color: #0f172a;
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
              color: #334155;
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
              background: #f1f5f9;
              color: #1e293b;
              border-bottom: 1px solid #cbd5e1;
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
              background: #f1f5f9;
              color: #0f172a;
              border-top: 1px solid #cbd5e1;
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
              border: 1px solid #e2e8f0;
            }
            
            .terms-title {
              font-weight: 600;
              color: #334155;
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
              color: #0f172a;
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
              <div class="company-name">${escapeQuoteHtml(templateSettings.companyName || 'CÔNG TY ABC')}</div>
              <div class="company-details">
                ${escapeQuoteHtml(templateSettings.address || 'Địa chỉ công ty')}<br>
                ĐT: ${escapeQuoteHtml(templateSettings.phone || '0123456789')} | Email: contact@company.com
              </div>
            </div>
            <div class="logo-section">
              ${logoUrl ? `<img src="${escapeQuoteHtml(logoUrl)}" style="max-width: 205px; max-height: 126px;" alt="Logo">` : 'LOGO'}
            </div>
          </div>

          <div class="quote-title">
            <div class="quote-number">BẢNG BÁO GIÁ SỐ: ${escapeQuoteHtml(quoteNumber || 'N/A')}</div>
            <div style="font-size: 12px; color: #666; margin-top: 5px;">
              Ngày tạo: ${escapeQuoteHtml(createdDate)}
            </div>
          </div>

          <div class="info-section">
            <div class="info-box">
              <div class="info-title">THÔNG TIN KHÁCH HÀNG</div>
              <div class="info-item"><strong>Tên:</strong> ${escapeQuoteHtml(customerName)}</div>
              <div class="info-item"><strong>Số điện thoại:</strong> ${escapeQuoteHtml(phone)}</div>
              <div class="info-item"><strong>Địa chỉ:</strong> ${escapeQuoteHtml(address)}</div>
              <div class="info-item"><strong>Email:</strong> ${escapeQuoteHtml(email)}</div>
            </div>
            
            <div class="info-box">
              <div class="info-title">THÔNG TIN BÁO GIÁ</div>
              <div class="info-item"><strong>Mã báo giá:</strong> ${escapeQuoteHtml(quoteNumber)}</div>
              <div class="info-item"><strong>Ngày tạo:</strong> ${escapeQuoteHtml(createdDate)}</div>
              <div class="info-item"><strong>Hiệu lực đến:</strong> ${escapeQuoteHtml(expiryDate)}</div>
              <div class="info-item"><strong>Trạng thái:</strong> ${escapeQuoteHtml(status || 'Draft')}</div>
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
                    <td>${escapeQuoteHtml(item.name || item.sku || '')}</td>
                    <td class="text-center">
                      ${safeQuoteImageUrl(item.selectedImage) ? `<img src="${escapeQuoteHtml(safeQuoteImageUrl(item.selectedImage))}" style="width: 60px; height: 45px; object-fit: cover; border-radius: 4px;" alt="Sản phẩm">` : '<span style="color: #94a3b8;">-</span>'}
                    </td>
                    <td>${escapeQuoteHtml(item.specifications || '')}</td>
                    <td>${escapeQuoteHtml(item.category || item.description || '')}</td>
                    <td class="text-center">${escapeQuoteHtml(item.quantity)}</td>
                    <td class="text-right">${escapeQuoteHtml(item.price.toLocaleString('vi-VN'))}</td>
                    <td class="text-right font-medium">${escapeQuoteHtml(item.total.toLocaleString('vi-VN'))}</td>
                    <td>${escapeQuoteHtml(item.notes || '')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="total-section">
            <div class="total-row">
              <div class="total-label">TỔNG GIÁ TRỊ ĐƠN HÀNG CHƯA BAO GỒM GTGT:</div>
              <div class="total-amount">${escapeQuoteHtml(subtotal.toLocaleString('vi-VN'))}</div>
            </div>
            ${includeVAT ? `
              <div class="total-row">
                <div class="total-label">GTGT (${escapeQuoteHtml(vatRate)}%):</div>
                <div class="total-amount">${escapeQuoteHtml(vatAmount.toLocaleString('vi-VN'))}</div>
              </div>
              <div class="total-row">
                <div class="total-label">TỔNG TIỀN ĐÃ BAO GỒM GTGT:</div>
                <div class="total-amount">${escapeQuoteHtml(totalWithVat.toLocaleString('vi-VN'))}</div>
              </div>
            ` : ''}
            <div class="total-row">
              <div class="total-label">THANH TOÁN LẦN 1:</div>
              <div class="total-amount">${escapeQuoteHtml(firstPayment.toLocaleString('vi-VN'))}</div>
            </div>
            ${payment2 > 0 ? `<div class="total-row"><div class="total-label">DỰ KIẾN THANH TOÁN LẦN 2:</div><div class="total-amount">${escapeQuoteHtml(payment2.toLocaleString('vi-VN'))}</div></div>` : ''}
            <div class="total-row final-total">
              <div>THANH TOÁN LẦN 2:</div>
              <div>${escapeQuoteHtml(remaining.toLocaleString('vi-VN'))}</div>
            </div>
          </div>

          ${templateSettings.terms && templateSettings.terms.length > 0 ? `
            <div class="terms">
              <div class="terms-title">ĐIỀU KHOẢN & ĐIỀU KIỆN</div>
              <ul>
                ${templateSettings.terms.map(term => term.trim() ? `<li>${escapeQuoteHtml(term)}</li>` : '').join('')}
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
              ${escapeQuoteHtml(templateSettings.footerNote)}
            </div>
          ` : ''}
        </body>
        </html>
      `;
}
