import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Eye, Edit, Trash2, MoreVertical, Calendar, User, CheckCircle, XCircle,
  Copy, Calculator, FileSignature, FileText,
} from "lucide-react";

interface Props {
  quotes: any[];
  statusLabels: Record<string, { label: string; color: string }>;
  canApprove: boolean;
  canSupplement: boolean;
  canManage: boolean;
  canEditDetails: boolean;
  onView: (q: any) => void;
  onEdit: (q: any) => void;
  onDelete: (q: any) => void;
  onDuplicate: (q: any) => void;
  onApprove: (q: any) => void;
  onReject: (q: any) => void;
  onSupplement: (q: any) => void;
  onEditDetails: (q: any) => void;
  onToContract: (q: any) => void;
}

const fmt = (n?: number) => (n || 0).toLocaleString("vi-VN") + "đ";
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");

const statusBorder: Record<string, string> = {
  draft: "border-l-gray-400",
  sent: "border-l-blue-500",
  approved: "border-l-sidebar-primary",
  rejected: "border-l-red-500",
  expired: "border-l-orange-500",
};

export const MobileQuoteList: React.FC<Props> = ({
  quotes, statusLabels, canApprove, canSupplement, canManage,
  canEditDetails,
  onView, onEdit, onDelete, onDuplicate, onApprove, onReject,
  onSupplement, onEditDetails, onToContract,
}) => {
  if (!quotes || quotes.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground flex flex-col items-center gap-2">
        <FileText className="h-8 w-8 text-muted-foreground" />
        Không có báo giá
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {quotes.map((q) => {
        const s = statusLabels[q.status] || { label: q.status, color: "bg-gray-100 text-gray-800" };
        return (
          <Card
            key={q.id}
            onClick={() => onView(q)}
            className={cn(
              "p-3 space-y-2 border-l-4 cursor-pointer active:bg-muted/50 transition-colors",
              statusBorder[q.status] || "border-l-muted",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">
                  {q.quote_number || `QUOTE-${q.id.slice(0, 8)}`}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {q.customerName}
                </div>
              </div>
              <Badge className={cn("text-[10px] whitespace-nowrap", s.color)}>{s.label}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs pt-1 border-t border-border/60">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground">Giá trị</span>
                <span className="font-semibold">{fmt(q.total_amount)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground justify-end">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{q.responsible}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>Tạo: {fmtDate(q.quoteDate || q.created_at)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground justify-end">
                <span>HH: {fmtDate(q.expiryDate)}</span>
              </div>
            </div>

            <div
              className="flex items-center gap-1.5 pt-1 border-t border-border/60"
              onClick={(e) => e.stopPropagation()}
            >
              <Button size="sm" variant="outline" className="flex-1 h-9 gap-1" onClick={() => onView(q)}>
                <Eye className="h-3.5 w-3.5" /> Xem
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-9 gap-1" onClick={() => onEdit(q)}>
                <Edit className="h-3.5 w-3.5" /> Sửa
              </Button>
              {canApprove && q.status === "draft" && (
                <Button
                  size="sm"
                  variant="default"
                  className="flex-1 h-9 gap-1"
                  onClick={() => onApprove(q)}
                >
                  <CheckCircle className="h-3.5 w-3.5" /> Duyệt
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover z-[100]">
                  <DropdownMenuItem onClick={() => onDuplicate(q)}>
                    <Copy className="h-4 w-4 mr-2" /> Nhân bản
                  </DropdownMenuItem>
                  {canSupplement && (
                    <DropdownMenuItem onClick={() => onSupplement(q)}>
                      <Calculator className="h-4 w-4 mr-2" /> Báo giá phụ
                    </DropdownMenuItem>
                  )}
                  {canApprove && q.status === "draft" && (
                    <DropdownMenuItem onClick={() => onReject(q)} className="text-orange-600">
                      <XCircle className="h-4 w-4 mr-2" /> Từ chối
                    </DropdownMenuItem>
                  )}
                  {canEditDetails && (
                    <DropdownMenuItem onClick={() => onEditDetails(q)}>
                      <Calendar className="h-4 w-4 mr-2" /> Sửa ngày & trạng thái
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onToContract(q)} className="text-primary">
                    <FileSignature className="h-4 w-4 mr-2" /> Tạo hợp đồng
                  </DropdownMenuItem>
                  {canManage && (
                    <DropdownMenuItem onClick={() => onDelete(q)} className="text-red-600 focus:text-red-600">
                      <Trash2 className="h-4 w-4 mr-2" /> Xóa
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default MobileQuoteList;