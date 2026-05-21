import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Phone, MessageSquare, Edit, User } from "lucide-react";

const statusMap: Record<string, { text: string; cls: string }> = {
  "waiting-payment": { text: "Chờ thanh toán", cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  "waiting-deposit": { text: "Chờ cọc", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  "sent-sample": { text: "Đã gửi mẫu", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  "sent-quote": { text: "Đã gửi báo giá", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "waiting-response": { text: "Chờ phản hồi", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  ordered: { text: "Đã đặt hàng", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  paid: { text: "Đã TT xong", cls: "bg-sidebar-primary/15 text-sidebar-primary border-sidebar-primary/30" },
  "see-notes": { text: "Xem ghi chú", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  "no-response": { text: "Không phản hồi", cls: "bg-red-50 text-red-700 border-red-200" },
};

interface Props {
  customers: any[];
  assignees: any[];
  onView: (c: any) => void;
  onEditNotes: (c: any) => void;
  onEditStatus: (c: any) => void;
  onEditAssignee: (c: any) => void;
}

const daysSince = (d?: string) => {
  if (!d) return "—";
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
  return `${diff} ngày`;
};

export const MobileCareList: React.FC<Props> = ({
  customers, assignees, onView, onEditNotes, onEditStatus, onEditAssignee,
}) => {
  if (!customers?.length) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground flex flex-col items-center gap-2">
        <Users className="h-8 w-8" />
        Không có khách hàng
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {customers.map((c) => {
        const status = c.current_status || "waiting-payment";
        const cfg = statusMap[status] || statusMap["waiting-payment"];
        const assignee = assignees.find((a) => a.id === c.assignee_id);
        const phone = c.phone || c.phones?.[0]?.number;
        return (
          <Card
            key={c.id}
            onClick={() => onView(c)}
            className="p-3 space-y-2 border-l-4 border-l-blue-400 cursor-pointer active:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{c.name}</div>
                {phone && <div className="text-xs text-muted-foreground mt-0.5">{phone}</div>}
              </div>
              <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>{cfg.text}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs pt-1 border-t border-border/60">
              <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{assignee?.name || "Chưa phân công"}</span>
              </div>
              <div className="text-right text-muted-foreground">
                Chưa LH: <span className="font-medium text-foreground">{daysSince(c.last_contact_date || c.updated_at)}</span>
              </div>
              {c.next_action && (
                <div className="col-span-2 text-muted-foreground line-clamp-1">
                  → {c.next_action}
                </div>
              )}
              {c.notes && (
                <div className="col-span-2 text-muted-foreground line-clamp-2">
                  {c.notes}
                </div>
              )}
            </div>

            <div
              className="flex items-center gap-1.5 pt-1 border-t border-border/60"
              onClick={(e) => e.stopPropagation()}
            >
              {phone && (
                <Button asChild size="sm" variant="outline" className="flex-1 h-9 gap-1">
                  <a href={`tel:${phone}`}><Phone className="h-3.5 w-3.5" /> Gọi</a>
                </Button>
              )}
              <Button size="sm" variant="outline" className="flex-1 h-9 gap-1" onClick={() => onEditNotes(c)}>
                <MessageSquare className="h-3.5 w-3.5" /> Ghi chú
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-9 gap-1" onClick={() => onEditStatus(c)}>
                <Edit className="h-3.5 w-3.5" /> Trạng thái
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default MobileCareList;