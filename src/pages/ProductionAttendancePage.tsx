import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import FactoryAttendancePanel from "@/components/FactoryAttendancePanel";
import type { ProductionWorker } from "@/integrations/supabase/production-execution-types";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { listProductionWorkers } from "@/lib/production-execution";
import { AlertTriangle, CalendarCheck2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { isLocalBackend } from "@/lib/runtime-config";

function errorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { code?: string; message?: unknown };
    const message = typeof value.message === "string" ? value.message : "";
    const missingRpc = value.code === "42883"
      || value.code === "PGRST202"
      || message.includes("list_factory_attendance_workers");
    if (missingRpc) {
      return "Cơ sở dữ liệu chưa có bản cập nhật phân quyền phạm vi nhân sự cho bảng chấm công. Hãy cập nhật đầy đủ phần chấm công xưởng rồi tải lại.";
    }
    if (message) return message;
  }
  if (error instanceof Error) return error.message;
  return "Không thể tải danh sách nhân sự.";
}

export default function ProductionAttendancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || undefined;
  const returnCandidate=searchParams.get("returnTo")||"";
  const returnTo=/^\/payroll-settings(?:\?|$)/.test(returnCandidate)?returnCandidate:null;
  const { user, isReady: authReady } = useAuthReady();
  const { role, loading: roleLoading } = useUserRole(user);
  const { hasPermission, loading: permissionLoading } = useEmployeePermissions(user, role);
  const canView = hasPermission("production_view")
    || hasPermission("production_operations")
    || hasPermission("production_manage");
  const canManage = hasPermission("production_manage");
  const canOperate = hasPermission("production_operations");
  const canApproveAttendance = hasPermission("production_attendance_approve") || canManage;
  const canManageWorkers = hasPermission("production_worker_manage") || canManage;
  const canViewRates = hasPermission("payroll_rate_view");
  const canManageRates = hasPermission("payroll_rate_manage");
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.has("order")) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setWorkers(await listProductionWorkers());
    } catch (error) {
      setWorkers([]);
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!roleLoading && !permissionLoading && canView) void loadWorkers();
    if (!roleLoading && !permissionLoading && !canView) setLoading(false);
  }, [canView, loadWorkers, permissionLoading, roleLoading]);

  if (!authReady || roleLoading || permissionLoading || loading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!user) {
    return (
      <Alert variant="destructive">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Phiên đăng nhập đã hết hạn</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Đăng nhập lại để sử dụng bảng chấm công xưởng.</p>
          <Button asChild variant="outline" size="sm"><Link to="/auth">Đăng nhập</Link></Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!canView) {
    return (
      <Alert variant="destructive">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Không có quyền truy cập</AlertTitle>
        <AlertDescription>Cần quyền Sản xuất - Xem, Vận hành hoặc Quản lý để sử dụng bảng chấm công xưởng.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
            <CalendarCheck2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">Chấm công xưởng</h1>{isLocalBackend() && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">SQL cục bộ</span>}</div>
            <p className="text-sm text-muted-foreground">Chấm công theo ngày, giờ hoặc sản lượng.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/production-attendance-v2">Mở bảng chấm công mới</Link></Button>
          <Button variant="outline" size="icon" onClick={() => void loadWorkers()} aria-label="Tải lại dữ liệu chấm công" title="Tải lại dữ liệu chấm công"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Không thể tải danh sách nhân sự</AlertTitle>
          <AlertDescription className="space-y-3"><p>{loadError}</p><Button variant="outline" size="sm" onClick={() => void loadWorkers()}>Thử tải lại</Button></AlertDescription>
        </Alert>
      ) : (<>
        {returnTo&&<Button asChild variant="outline" className="mb-3"><Link to={returnTo}>← Trở lại đối soát lương</Link></Button>}
      <FactoryAttendancePanel
          workers={workers}
          canRecord={canOperate || canManage}
          canApproveAttendance={canApproveAttendance}
          canReverse={canManage}
          canConfirmDay={canOperate || canManage}
          canManageDayClosure={canManage}
          canManageWorkers={canManageWorkers}
          canViewRates={canViewRates}
          canManageRates={canManageRates}
          initialTab={initialTab}
          onWorkersChanged={loadWorkers}
        />
      </>)}
    </div>
  );
}
