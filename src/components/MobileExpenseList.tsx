import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Eye, Edit, Trash2, MoreVertical, Wallet } from "lucide-react";

interface Props {
  expenses: any[];
  formatCurrency: (n?: number | null) => string;
  formatSafeDate: (d?: string) => string;
  onView: (e: any) => void;
  onEdit: (e: any) => void;
  onDelete: (e: any) => void;
}

export const MobileExpenseList: React.FC<Props> = ({ expenses, formatCurrency, formatSafeDate, onView, onEdit, onDelete }) => {
  if (!expenses?.length) {
    return (
      <div className="text-center py-10 text-sm text-muted-foreground flex flex-col items-center gap-2">
        <Wallet className="h-8 w-8" />
        Chưa có chi phí
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {expenses.map((e) => (
        <Card key={e.id} className="p-3 space-y-2 border-l-4 border-l-orange-500 cursor-pointer active:bg-muted/50" onClick={() => onView(e)}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs text-muted-foreground">{e.expense_code}</div>
              <div className="font-semibold line-clamp-2 mt-0.5">{e.description || "—"}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatSafeDate(e.expense_date)} · {e.person_name || "—"}
              </div>
            </div>
            <div className="text-right shrink-0">
              <Badge variant="secondary" className="text-[10px] mb-1">{e.category}</Badge>
              <div className="text-red-600 font-bold">-{formatCurrency(e.amount)}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/60" onClick={(ev) => ev.stopPropagation()}>
            <Button size="sm" variant="outline" className="flex-1 h-9 gap-1" onClick={() => onView(e)}>
              <Eye className="h-3.5 w-3.5" /> Xem
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-9 gap-1" onClick={() => onEdit(e)}>
              <Edit className="h-3.5 w-3.5" /> Sửa
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-9 w-9 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover z-[100]">
                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => onDelete(e)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Xóa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default MobileExpenseList;