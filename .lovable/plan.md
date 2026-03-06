

# Sua loi tinh doanh thu sai trong bao cao

## Van de

**ReportOverviewDetails.tsx dong 68** van con loi nhan doi doanh thu - cung loi da sua trong ReportSalesDetails nhung chua sua o day:

```typescript
// LOI: item.total da bao gom quantity roi, nhan them quantity = nhan doi
existing.revenue += Number(item.total || item.price || 0) * Number(item.quantity || 1);
```

Khi `item.total` da = `price * quantity`, nhan them `quantity` se ra gia tri gap doi.

## Giai phap

### File: `src/components/reports/ReportOverviewDetails.tsx` (dong 68)

Sua thanh logic giong ReportSalesDetails da fix:

```typescript
existing.revenue += Number(item.total || 0) || (Number(item.price || 0) * Number(item.quantity || 1));
```

Logic: Uu tien dung `item.total` truc tiep (da bao gom quantity). Chi khi `total` = 0 hoac khong co moi tinh `price * quantity`.

Chi thay doi 1 dong duy nhat.

## Cac file khac - Da kiem tra

- **ReportSalesDetails.tsx**: Da fix dung
- **ReportFinancialDetails.tsx**: Khong tinh revenue theo item, dung `order.total_amount` - dung
- **ReportCustomerDetails.tsx**: Dung `order.total_amount` - dung
- **ReportsPage.tsx metricsData**: Dung `order.total_amount` - dung

