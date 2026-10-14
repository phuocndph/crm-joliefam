import { Children, forwardRef, isValidElement } from "react";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { DialogFooter, DialogHeader, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Payroll forms share one scrollable body while their title and actions remain visible. */
export const PayrollDialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(
  ({ className, children, ...props }, ref) => {
    const nodes = Children.toArray(children);
    const isHeader = (node: typeof nodes[number]) => isValidElement(node) && node.type === DialogHeader;
    const isFooter = (node: typeof nodes[number]) => isValidElement(node) && node.type === DialogFooter;
    return <DialogPortal><DialogOverlay />
      <DialogPrimitive.Content ref={ref} {...props} className={cn(
        "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-lg sm:max-h-[90dvh] [&_input]:min-h-11 sm:[&_input]:min-h-10 [&_button:not([role=switch])]:min-h-11 sm:[&_button:not([role=switch])]:min-h-9 [&_button[role=combobox]]:min-h-11 sm:[&_button[role=combobox]]:min-h-10",
        className,
      )}>
        <div className="shrink-0 border-b px-4 py-4 pr-14 text-left sm:px-6 [&>div]:text-left">{nodes.filter(isHeader)}</div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">{nodes.filter((node) => !isHeader(node) && !isFooter(node))}</div>
        {nodes.some(isFooter) && <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6 [&>div]:gap-2 [&>div]:space-x-0">{nodes.filter(isFooter)}</div>}
        <DialogPrimitive.Close aria-label="Đóng biểu mẫu" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-5 w-5" /><span className="sr-only">Đóng</span></DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>;
  },
);
PayrollDialogContent.displayName = "PayrollDialogContent";
