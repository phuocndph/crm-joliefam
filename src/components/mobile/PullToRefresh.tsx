import React, { useState, useRef, useEffect } from "react";
import { RefreshCw } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  threshold = 100
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isPulling || isRefreshing) return;

    currentY.current = e.touches[0].clientY;
    const distance = Math.max(0, currentY.current - startY.current);
    
    if (distance > 0 && window.scrollY === 0) {
      e.preventDefault();
      setPullDistance(Math.min(distance, threshold * 1.5));
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;

    setIsPulling(false);

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } catch (error) {
        console.error("Refresh failed:", error);
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isPulling, pullDistance, threshold, isRefreshing]);

  const pullProgress = Math.min(pullDistance / threshold, 1);
  const showRefreshIndicator = pullDistance > 20;

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      {/* Pull to refresh indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex items-center justify-center transition-all duration-200 ease-out bg-gradient-card border-b"
        style={{
          transform: `translateY(${pullDistance > 0 ? Math.min(pullDistance - 60, 40) : -60}px)`,
          opacity: showRefreshIndicator ? 1 : 0,
          height: '60px'
        }}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw 
            className={`h-5 w-5 transition-transform duration-200 ${
              isRefreshing ? 'animate-spin' : ''
            }`}
            style={{
              transform: `rotate(${pullProgress * 180}deg)`
            }}
          />
          <span className="text-sm font-medium">
            {isRefreshing 
              ? "Đang tải..." 
              : pullDistance >= threshold 
                ? "Thả để làm mới" 
                : "Kéo để làm mới"
            }
          </span>
        </div>
      </div>

      {/* Content */}
      <div 
        style={{
          transform: `translateY(${pullDistance > 0 ? Math.min(pullDistance, threshold * 1.2) : 0}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s ease-out'
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;