import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isNavigationSearchShortcut, searchNavigationItems, type NavigationItem } from '@/lib/navigation-catalog';
import type { NavigationFavoriteResult } from '@/hooks/useNavigationFavorites';
import { NavigationItemRow } from './NavigationItemRow';

type Props = {
  items: readonly NavigationItem[];
  pathname: string;
  favoriteIds: readonly string[];
  onToggleFavorite: (id: NavigationItem['id']) => NavigationFavoriteResult;
  onNavigate?: () => void;
  enableShortcut?: boolean;
  compact?: boolean;
  responsiveCompact?: boolean;
};

export function NavigationSearch({ items, pathname, favoriteIds, onToggleFavorite, onNavigate, enableShortcut = true, compact = false, responsiveCompact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resultNodes = useRef(new Map<string, HTMLDivElement>());
  const navigate = useNavigate();
  const results = useMemo(() => searchNavigationItems(items, query), [items, query]);
  useEffect(() => {
    if (!enableShortcut) return;
    const handler = (event: KeyboardEvent) => {
      if (!isNavigationSearchShortcut(event)) return;
      event.preventDefault(); setOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enableShortcut]);
  useEffect(() => { setSelectedIndex(0); }, [query]);
  useEffect(() => {
    setSelectedIndex(index => Math.max(0, Math.min(index, results.length - 1)));
  }, [results.length]);
  useEffect(() => {
    const item = results[selectedIndex];
    if (item) resultNodes.current.get(item.id)?.scrollIntoView({ block: 'nearest' });
  }, [results, selectedIndex]);
  const close = () => { setOpen(false); setQuery(''); setSelectedIndex(0); onNavigate?.(); };
  const selectResult = (index: number) => {
    const item = results[index];
    if (!item) return;
    navigate(item.path);
    close();
  };

  return <>
    <Button type="button" variant="outline" className={compact ? 'h-9 w-9 p-0' : responsiveCompact ? 'h-9 w-9 p-0 lg:h-10 lg:w-auto lg:min-w-0 lg:justify-start lg:gap-2 lg:px-3 text-muted-foreground' : 'h-10 min-w-0 justify-start gap-2 text-muted-foreground'} onClick={() => setOpen(true)} aria-label="Tìm chức năng">
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!compact && <><span className={responsiveCompact ? 'hidden min-w-0 flex-1 truncate text-left lg:block' : 'min-w-0 flex-1 truncate text-left'}>Tìm chức năng</span><kbd className={responsiveCompact ? 'hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] lg:inline' : 'hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] sm:inline'}>Ctrl K</kbd></>}
    </Button>
    <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) { setQuery(''); setSelectedIndex(0); } }}>
      <DialogContent className="max-h-[min(32rem,85vh)] max-w-xl overflow-hidden p-4">
        <DialogHeader><DialogTitle>Tìm chức năng</DialogTitle></DialogHeader>
        <Input
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setSelectedIndex(index => Math.min(index + 1, results.length - 1)); }
            if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setSelectedIndex(index => Math.max(index - 1, 0)); }
            if (event.key === 'Enter' && results.length) { event.preventDefault(); selectResult(selectedIndex); }
            if (event.key === 'Escape') { event.preventDefault(); close(); }
          }}
          placeholder="Nhập tên chức năng…"
          aria-label="Tìm chức năng"
          aria-controls="navigation-search-results"
          aria-describedby="navigation-search-selection"
        />
        <p id="navigation-search-selection" className="sr-only" aria-live="polite">{results[selectedIndex] ? `Đang chọn ${results[selectedIndex].label}. Nhấn Enter để mở.` : 'Không có kết quả để chọn.'}</p>
        <div id="navigation-search-results" className="max-h-[55vh] space-y-1 overflow-y-auto pr-1" role="list">
          {results.length ? results.map((item, index) => <NavigationItemRow id={`navigation-result-${item.id}`} rowRef={node => { if (node) resultNodes.current.set(item.id, node); else resultNodes.current.delete(item.id); }} key={item.id} item={item} active={pathname === item.path} favorite={favoriteIds.includes(item.id)} onToggleFavorite={onToggleFavorite} onNavigate={close} className={index === selectedIndex ? 'ring-1 ring-primary/50' : undefined} />) : <p role="status" aria-live="polite" className="px-2 py-6 text-sm text-muted-foreground">Không có chức năng phù hợp trong quyền truy cập của bạn.</p>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
