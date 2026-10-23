import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ProfileReviewPanel from "@/components/ProfileReviewPanel";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRole } from "@/hooks/useUserRole";
import { isLocalBackend } from "@/lib/runtime-config";
import { ShieldCheck } from "lucide-react";

export default function ProfileReviewPage() {
  const { user, isReady: authReady } = useAuthReady();
  const { role, loading: roleLoading } = useUserRole(user);
  if (!isLocalBackend()) {
    return (
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Chức năng chỉ có trên bản local</AlertTitle>
        <AlertDescription>
          Duyệt hồ sơ nhân sự đang được xử lý trên PostgreSQL local.
        </AlertDescription>
      </Alert>
    );
  }
  if (!authReady || roleLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted-foreground">
        Đang kiểm tra quyền...
      </div>
    );
  }
  if (role !== "admin" && role !== "manager") {
    return (
      <Alert variant="destructive">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Bạn chưa được phân quyền duyệt hồ sơ</AlertTitle>
        <AlertDescription>
          Hồ sơ sẽ do quản lý hoặc quản trị viên xác nhận. Nếu cần cấp quyền,
          liên hệ quản trị viên hệ thống.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="min-w-0 space-y-3">
      <ProfileReviewPanel />
    </div>
  );
}
