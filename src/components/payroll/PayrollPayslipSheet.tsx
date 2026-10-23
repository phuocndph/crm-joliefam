import type { RefObject } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatPayrollDecimal as decimal, type ExactPayrollRow, type PayrollReconciliation } from '@/lib/payroll-reconciliation';

const itemLabels: Record<string, string> = {
  DAY_PAY: 'Lương ngày công', HOURLY_PAY: 'Lương theo giờ', PIECE_RATE: 'Lương sản lượng',
  OVERTIME_PAY: 'Lương tăng ca', MEAL_ALLOWANCE: 'Phụ cấp ăn ca', SOCIAL_INSURANCE: 'Bảo hiểm xã hội',
  FIXED_ALLOWANCE: 'Phụ cấp cố định', FIXED_DEDUCTION: 'Khấu trừ cố định', ALLOWANCE: 'Phụ cấp',
  BONUS: 'Thưởng', SALES_COMMISSION: 'Hoa hồng', OTHER_ALLOWANCE: 'Khoản cộng khác',
  SALARY_ADVANCE: 'Tạm ứng', PENALTY: 'Phạt', OTHER_DEDUCTION: 'Khoản trừ khác',
};
const sourceLabels: Record<string, string> = {
  ATTENDANCE: 'Phiếu chấm công', PRODUCTION_ENTRY: 'Phiếu sản lượng', OVERTIME: 'Phiếu tăng ca',
  DAY_STATUS: 'Trạng thái ngày công', SOCIAL_INSURANCE_VERSION: 'Cấu hình bảo hiểm',
  WORKER_PAYROLL_PROFILE: 'Hồ sơ tính lương', PAYROLL_ADJUSTMENT: 'Khoản điều chỉnh',
};
const runLabels: Record<string, string> = { PREVIEW: 'Bản tính thử', LOCKED: 'Đã khóa', SUPERSEDED: 'Bản đã thay thế' };
const fallback = (labels: Record<string, string>, value: unknown) => labels[String(value)] || `Khác (${String(value || 'chưa có mã')})`;

export default function PayrollPayslipSheet({ row, data, onClose, triggerRef }: {
  row: ExactPayrollRow | undefined;
  data: PayrollReconciliation | undefined;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement>;
}) {
  const items = row && data ? data.items.filter(item => item.worker_id === row.worker_id) : [];
  const exceptions = row && data ? data.exceptions.filter(item => item.worker_id === row.worker_id) : [];
  return <Sheet open={!!row && !!data} onOpenChange={open => { if (!open) onClose(); }}>
    <SheetContent side="right" className="flex h-[100dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl [&>button]:min-h-12 [&>button]:min-w-12 [&>button]:right-1 [&>button]:top-1" onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus(); }}>
      <SheetHeader className="shrink-0 border-b px-5 pb-4 pt-5 pr-14 text-left">
        <SheetTitle>Phiếu lương chi tiết</SheetTitle>
        <SheetDescription>{row?.worker_name} · {row?.employee_code}<span className="mt-1 block">Kỳ {String(data?.run.period_start || '')} → {String(data?.run.period_end || '')} · {fallback(runLabels, data?.run.status)}</span></SheetDescription>
      </SheetHeader>
      {row && data && <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <p className="text-sm text-muted-foreground">Kết quả của lần tính #{String(data.run.run_number)}. Khóa bảng lương chưa xác nhận đã chi trả.</p>
        <dl className="divide-y rounded-lg border px-4">
          {([
            ['Lương chính', row.main_pay], ['Sản lượng & tăng ca', row.output_overtime],
            ['Khoản thu khác', row.other_earnings], ['Tổng thu nhập', row.gross_amount],
            ['Khấu trừ', row.deductions_amount], ['Sau khấu trừ', row.net_amount],
          ] as const).map(([label, value]) => <div className="flex items-start justify-between gap-4 py-3" key={label}><dt className="text-sm">{label}</dt><dd className="text-right font-medium tabular-nums">{decimal(value)} ₫</dd></div>)}
        </dl>
        <div className="rounded-lg bg-primary/5 p-4"><p className="text-sm font-medium">Thanh toán theo bản tính</p><p className="mt-1 break-all text-3xl font-bold tabular-nums">{decimal(row.payment_amount)} ₫</p><p className="mt-2 text-sm">Chênh lệch với bản trước: {decimal(row.payment_delta)}{row.payment_delta!==null?' ₫':' (chưa có bản so sánh)'}</p></div>
        {row.change_status==='REMOVED' && <p className="rounded border p-3 text-sm">Nhân sự có ở bản trước; không có khoản thanh toán trong bản này.</p>}
        {row.missing_verified_bank && <p className="text-sm text-amber-700">Chưa có tài khoản ngân hàng đã xác minh cho kỳ này.</p>}
        {row.identity_source==='LEGACY_UNSNAPSHOTTED' && <p className="text-sm text-amber-700">Bản cũ: định danh nhân sự đang tham chiếu thông tin hiện tại.</p>}
        {data.freshness.status==='STALE' && <p role="alert" className="text-sm text-amber-700">Đầu vào đã thay đổi. Phiếu này là kết quả bản tính cũ; cần tính thử lại.</p>}
        {data.freshness.status==='UNVERIFIABLE' && <p role="alert" className="text-sm text-amber-700">Bản cũ thiếu dấu nguồn để xác nhận còn hiệu lực.</p>}
        {!!exceptions.length && <section className="space-y-2" aria-label="Ngoại lệ phiếu lương"><h3 className="font-semibold">Ngoại lệ cần xem</h3>{exceptions.map(item => <div key={String(item.id)} className="rounded border p-3 text-sm"><Badge variant={item.resolved_at?'outline':item.severity==='BLOCKING'?'destructive':'secondary'}>{item.resolved_at?'Đã xử lý':item.severity==='BLOCKING'?'Chặn khóa':item.severity==='WARNING'?'Cảnh báo':'Thông tin'}</Badge><p className="mt-2">{String(item.message || item.code)}</p><p className="mt-1 text-xs text-muted-foreground">Mã: {String(item.code)}</p></div>)}</section>}
        <section className="space-y-3" aria-label="Nguồn tính lương"><h3 className="font-semibold">Các khoản và nguồn tính</h3>{!items.length && <p className="text-sm text-muted-foreground">Không có khoản tính lương trong bản này.</p>}{items.map(item => <div key={String(item.id)} className="space-y-2 rounded-lg border p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium">{fallback(itemLabels, item.item_type)}</p><p className="font-semibold tabular-nums">{item.item_direction==='DEDUCTION'?'Trừ':item.item_direction==='EARNING'?'Cộng':fallback({}, item.item_direction)} · {decimal(item.amount_precise)} ₫</p></div><p className="text-muted-foreground">{fallback(sourceLabels, item.source_type)}</p><p>Số lượng {decimal(item.quantity)} × đơn giá {decimal(item.unit_rate)} × hệ số {decimal(item.multiplier)}</p><details><summary className="flex min-h-12 cursor-pointer items-center font-medium">Chi tiết dữ liệu nguồn</summary><div className="space-y-2 text-xs text-muted-foreground"><p className="break-all">Mã nguồn: {String(item.source_id || '—')}</p><p className="break-words">Công thức lưu trong bản tính: {String(item.formula || '—')}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">{JSON.stringify(item.details, null, 2)}</pre></div></details></div>)}</section>
      </div>}
      <SheetFooter className="shrink-0 border-t bg-background p-4"><SheetClose asChild><Button variant="outline" className="min-h-12 w-full sm:w-auto">Đóng phiếu lương</Button></SheetClose></SheetFooter>
    </SheetContent>
  </Sheet>;
}
