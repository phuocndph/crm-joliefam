import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronRight, MoreVertical } from "lucide-react";

interface MobileCardProps {
  title: string;
  subtitle?: string;
  description?: string;
  status?: {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  };
  value?: {
    amount: string;
    unit?: string;
  };
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "destructive";
  }>;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export const MobileCard: React.FC<MobileCardProps> = ({
  title,
  subtitle,
  description,
  status,
  value,
  actions,
  onClick,
  className,
  children
}) => {
  return (
    <Card 
      className={cn(
        "w-full transition-all duration-200",
        onClick && "cursor-pointer hover:shadow-md active:scale-98",
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{title}</h3>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          
          <div className="flex items-center gap-2 ml-3">
            {status && (
              <Badge variant={status.variant} className="text-xs">
                {status.label}
              </Badge>
            )}
            {value && (
              <div className="text-right">
                <div className="font-bold text-lg">
                  {value.amount}
                  {value.unit && <span className="text-sm text-muted-foreground ml-1">{value.unit}</span>}
                </div>
              </div>
            )}
            {onClick && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
        
        {description && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {description}
          </p>
        )}
      </CardHeader>
      
      {(children || actions) && (
        <CardContent className="pt-0">
          {children}
          
          {actions && actions.length > 0 && (
            <div className="flex gap-2 mt-3">
              {actions.map((action, index) => (
                <Button
                  key={index}
                  variant={action.variant || "outline"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick();
                  }}
                  className="flex-1"
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default MobileCard;