import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import AttendanceWorkspaceV2 from "@/components/AttendanceWorkspaceV2";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useEmployeePermissions } from "@/hooks/useEmployeePermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { listProductionWorkers } from "@/lib/production-execution";
import type { ProductionWorker } from "@/integrations/supabase/production-execution-types";
import { AlertTriangle, FlaskConical, Loader2, Settings2, ShieldCheck } from "lucide-react";

export default function ProductionAttendanceV2Page() {
  const { user, isReady: authReady } = useAuthReady();
  const { role, loading: roleLoading } = useUserRole(user);
  const { hasPermission, loading: permissionLoading } = useEmployeePermissions(user, role);
  const canView = hasPermission("production_view") || hasPermission("production_operations") || hasPermission("production_manage");
  const canManage = hasPermission("production_manage");
  const canOperate = hasPermission("production_operations");
  const canApproveAttendance = hasPermission("production_attendance_approve") || canManage;
  const [ready, setReady] = useState(false);
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);
  const [showTestFixtures, setShowTestFixtures] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);

  const checkWorkspace = useCallback(async () => {
    try {
      setWorkers(await listProductionWorkers());
      setWorkerError(null);
    } catch (error) {
      setWorkerError(error instanceof Error ? error.message : "Không thể kiểm tra dữ liệu nhân sự.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!roleLoading && !permissionLoading && canView) void checkWorkspace();
    if (!roleLoading && !permissionLoading && !canView) setReady(true);
  }, [canView, checkWorkspace, permissionLoading, roleLoading]);

  const isTestFixture = (worker: ProductionWorker) => /^(HARDEN-|PAYTEST-)/i.test(worker.employee_code) || worker.display_name === "Hardening Smoke";
  const testFixtureCount = workers.filter(isTestFixture).length;
  const visibleWorkers = showTestFixtures ? workers : workers.filter((worker) => !isTestFixture(worker));

  if (!authReady || roleLoading || permissionLoading || !ready) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) return <Alert variant="destructive"><ShieldCheck className="h-4 w-4" /><AlertTitle>Phiên đăng nhập đã hết hạn</AlertTitle><AlertDescription className="space-y-3"><p>Đăng nhập lại để sử dụng bảng chấm công.</p><Button asChild variant="outline" size="sm"><Link to="/auth">Đăng nhập</Link></Button></AlertDescription></Alert>;
  if (!canView) return <Alert variant="destructive"><ShieldCheck className="h-4 w-4" /><AlertTitle>Không có quyền truy cập</AlertTitle><AlertDescription>Cần quyền Sản xuất - Xem, Vận hành hoặc Quản lý để sử dụng bảng chấm công.</AlertDescription></Alert>;

  return <div className="min-w-0 space-y-3">
    <div className="flex items-center justify-between gap-2">
      <h1 className="min-w-0 text-lg font-semibold tracking-tight sm:text-xl">Chấm công xưởng</h1>
      <div className="flex shrink-0 items-center gap-1">
        <Button asChild variant="outline" size="sm" className="h-11 w-11 px-0 sm:w-auto sm:px-3 lg:h-9"><Link to="/payroll-settings?tab=workers" aria-label="Thiết lập nhân sự và lương" title="Thiết lập nhân sự và lương"><Settings2 className="h-4 w-4" /><span className="hidden sm:inline">Thiết lập lương</span></Link></Button>
        {testFixtureCount > 0 && <Button variant={showTestFixtures ? "secondary" : "ghost"} size="sm" className="h-11 w-11 px-0 sm:w-auto sm:px-3 lg:h-9" aria-pressed={showTestFixtures} aria-label={`${showTestFixtures ? "Ẩn" : "Hiện"} ${testFixtureCount} nhân sự kiểm thử`} title={`${showTestFixtures ? "Đang hiện" : "Đang ẩn"} ${testFixtureCount} nhân sự kiểm thử. Bấm để ${showTestFixtures ? "ẩn" : "hiện"}.`} onClick={() => setShowTestFixtures((current) => !current)}><FlaskConical className="h-4 w-4" /><span className="hidden sm:inline">Kiểm thử ({testFixtureCount})</span></Button>}
      </div>
    </div>
    {workerError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Không thể tải danh sách nhân sự</AlertTitle><AlertDescription>{workerError}</AlertDescription></Alert>}
    <AttendanceWorkspaceV2 workers={visibleWorkers} canRecord={canOperate || canManage} canApproveAttendance={canApproveAttendance} canReverse={canManage} canConfirmDay={canOperate || canManage} canManageDayClosure={canManage} canSetDayStatus={canManage} />
  </div>;
}
