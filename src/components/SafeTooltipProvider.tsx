import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type Props = React.ComponentProps<typeof TooltipProvider>;

/**
 * Workaround for rare cases where TooltipProvider crashes the tree (e.g. duplicate React -> invalid hook call).
 * If it crashes, we render children without tooltips instead of a blank screen.
 */
export function SafeTooltipProvider({ children, ...props }: Props) {
  return (
    <ErrorBoundary fallback={<>{children}</>}>
      <TooltipProvider {...props}>{children}</TooltipProvider>
    </ErrorBoundary>
  );
}
