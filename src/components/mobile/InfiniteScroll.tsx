import React, { useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";

interface InfiniteScrollProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  children: React.ReactNode;
  threshold?: number;
}

export const InfiniteScroll: React.FC<InfiniteScrollProps> = ({
  hasMore,
  loading,
  onLoadMore,
  children,
  threshold = 200
}) => {
  const observerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onLoadMore);

  // Update the callback ref when onLoadMore changes
  useEffect(() => {
    callbackRef.current = onLoadMore;
  }, [onLoadMore]);

  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [target] = entries;
    if (target.isIntersecting && hasMore && !loading) {
      callbackRef.current();
    }
  }, [hasMore, loading]);

  useEffect(() => {
    const element = observerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      threshold: 0,
      rootMargin: `${threshold}px`
    });

    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [handleObserver, threshold]);

  return (
    <div>
      {children}
      
      {/* Loading indicator and trigger element */}
      <div 
        ref={observerRef}
        className="flex items-center justify-center py-6"
      >
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Đang tải thêm...</span>
          </div>
        )}
        
        {!hasMore && !loading && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Đã hiển thị tất cả dữ liệu
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InfiniteScroll;