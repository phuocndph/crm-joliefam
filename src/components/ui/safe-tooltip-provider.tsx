import React from 'react';
import { TooltipProvider } from './tooltip';

interface SafeTooltipProviderProps {
  children: React.ReactNode;
}

export const SafeTooltipProvider: React.FC<SafeTooltipProviderProps> = ({ children }) => {
  try {
    return <TooltipProvider delayDuration={0}>{children}</TooltipProvider>;
  } catch (error) {
    console.error('TooltipProvider failed, rendering without tooltip support:', error);
    return <>{children}</>;
  }
};
