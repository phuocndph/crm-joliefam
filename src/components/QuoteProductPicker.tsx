import React, { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { normalizeProductSearch, useProductSearch, type SearchableProduct } from '@/lib/searchUtils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface QuoteProductPickerProps {
  products: SearchableProduct[];
  ready: boolean;
  initialSearch: string;
  onSelect: (product: SearchableProduct) => void;
  onClose: () => void;
  onRestoreFocus: () => void;
}

export function QuoteProductPicker({ products, ready, initialSearch, onSelect, onClose, onRestoreFocus }: QuoteProductPickerProps) {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [history, setHistory] = useState<string[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem('product_search_history') || '[]'); return Array.isArray(saved) ? saved.filter(value => typeof value === 'string').slice(0, 10) : []; } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [active, setActive] = useState<{ results: SearchableProduct[]; id: string } | null>(null);
  const debouncedSearch = useDebounce(searchTerm, 300);
  const query = normalizeProductSearch(searchTerm);
  const pending = query !== normalizeProductSearch(debouncedSearch);
  const result = useProductSearch(products, debouncedSearch);
  const available = ready && !pending;
  const visible = available ? result.hasSearch ? result.results : Object.values(result.groupedResults).flat() : [];
  const activeIndex = active?.results === result.results && available ? visible.findIndex(product => product.id === active.id) : -1;
  const listId = useId();
  const activeElement = useRef<HTMLButtonElement | null>(null);
  const listViewport = useRef<HTMLDivElement | null>(null);
  const selectionLock = useRef(false);
  const context = { products, query, available, results: result.results };
  const latestContext = useRef(context);
  latestContext.current = context;

  useEffect(() => {
    const viewport = listViewport.current, option = activeElement.current;
    if (!viewport || !option) return;
    const bounds = viewport.getBoundingClientRect(), selected = option.getBoundingClientRect();
    if (selected.top < bounds.top) viewport.scrollTop -= bounds.top - selected.top;
    else if (selected.bottom > bounds.bottom) viewport.scrollTop += selected.bottom - bounds.bottom;
  }, [activeIndex, result.results]);
  useEffect(() => {
    if (!query || searchTerm.trim().length <= 2) return;
    const timer = setTimeout(() => {
      setHistory(previous => {
        const next = [searchTerm.trim(), ...previous.filter(value => value !== searchTerm.trim())].slice(0, 10);
        try { localStorage.setItem('product_search_history', JSON.stringify(next)); } catch { /* Search remains usable when storage is unavailable. */ }
        return next;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [searchTerm, query]);

  const choose = (product: SearchableProduct) => {
    // Obsolete DOM callbacks must never accept a prior query or prior catalog option.
    if (selectionLock.current || latestContext.current !== context || !available || !visible.some(row => row.id === product.id)) return;
    const current = products.find(row => row.id === product.id);
    if (!current) return;
    selectionLock.current = true;
    onSelect(current);
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); setShowHistory(false);
    if (event.key === 'Enter') { if (!event.repeat && activeIndex >= 0) choose(visible[activeIndex]); return; }
    if (!visible.length) return;
    const next = event.key === 'ArrowDown' ? (activeIndex + 1) % visible.length : (activeIndex < 0 ? visible.length - 1 : (activeIndex - 1 + visible.length) % visible.length);
    setActive({ results: result.results, id: visible[next].id });
  };
  const renderOption = (product: SearchableProduct) => {
    const index = visible.findIndex(row => row.id === product.id);
    return <button key={product.id} id={listId + '-option-' + index} type="button" role="option" aria-selected={index === activeIndex} tabIndex={-1}
      ref={index === activeIndex ? activeElement : undefined}
      className={'grid w-full grid-cols-[8rem_minmax(12rem,1fr)_minmax(10rem,1fr)_7rem] border-b border-gray-300 text-left text-sm transition-colors hover:bg-blue-50 ' + (index === activeIndex ? 'bg-blue-100 ring-2 ring-inset ring-blue-500' : '')}
      onMouseMove={() => setActive({ results: result.results, id: product.id })}
      onClick={() => choose(product)} onKeyDown={handleKeyDown}>
      <span className="border-r border-gray-300 p-3 font-mono font-semibold text-blue-600">{product.sku || 'NO-SKU'}</span>
      <span className="border-r border-gray-300 p-3 font-medium">{product.name}{result.hasSearch && <span className="mt-1 block text-xs font-normal text-gray-500">{product.category || 'Khác'}</span>}</span>
      <span className="border-r border-gray-300 p-3 text-xs text-gray-600">{product.description || product.specifications || '-'}</span>
      <span className="p-3 text-right font-mono font-bold text-green-600">{(product.price || 0).toLocaleString()}đ</span>
    </button>;
  };

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex h-[min(52rem,92dvh)] max-h-[92dvh] w-[95vw] min-w-0 max-w-[95vw] flex-col overflow-clip p-4 sm:p-6"
      onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
      <DialogHeader className="min-w-0 shrink-0 pr-6"><DialogTitle className="flex items-center gap-2 text-left"><Search className="h-5 w-5 shrink-0" />Chọn sản phẩm từ danh sách</DialogTitle><DialogDescription className="sr-only">Tìm sản phẩm theo tên hoặc mã. Dùng phím mũi tên và Enter để chọn; bảng kết quả có thể cuộn ngang.</DialogDescription></DialogHeader>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <div className="relative min-w-0 shrink-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input autoFocus role="combobox" aria-label="Tìm kiếm theo tên, mã sản phẩm" aria-autocomplete="list" aria-expanded={available && visible.length > 0}
            aria-controls={listId} aria-activedescendant={activeIndex >= 0 ? listId + '-option-' + activeIndex : undefined}
            placeholder="Tìm kiếm theo tên, mã sản phẩm..." value={searchTerm}
            onChange={event => { setSearchTerm(event.target.value); setActive(null); }} onKeyDown={handleKeyDown}
            onFocus={() => setShowHistory(true)} onBlur={() => setShowHistory(false)} className="h-12 border-2 pl-10 text-base focus:border-blue-500" />
          {showHistory && history.length > 0 && !searchTerm && <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-white shadow-lg">
            <p className="border-b bg-gray-50 p-2 text-sm text-gray-600">Tìm kiếm gần đây:</p>
            {history.map(term => <button key={term} type="button" className="block w-full break-words px-3 py-2 text-left text-sm hover:bg-gray-100" onMouseDown={event => event.preventDefault()} onClick={() => { setSearchTerm(term); setActive(null); setShowHistory(false); }}>{term}</button>)}
          </div>}
        </div>
        <p role="status" className="min-w-0 shrink-0 break-words text-sm text-blue-700 [overflow-wrap:anywhere]">{!ready ? 'Danh mục đã thay đổi. Vui lòng mở lại danh sách sản phẩm.' : pending ? 'Đang tìm sản phẩm…' : result.hasSearch ? 'Hiển thị ' + result.resultCount + ' sản phẩm phù hợp nhất cho “' + searchTerm.trim() + '”' : 'Hiển thị ' + result.resultCount + ' sản phẩm'}</p>
        <div ref={listViewport} className="min-h-0 min-w-0 max-w-full flex-1 overflow-auto rounded-lg border border-gray-300 bg-white" tabIndex={0} aria-label="Kết quả sản phẩm, có thể cuộn ngang">
          <div className="min-w-[40rem]">
            <div className="grid grid-cols-[8rem_minmax(12rem,1fr)_minmax(10rem,1fr)_7rem] border-b bg-gray-50 text-sm font-semibold text-gray-800" aria-hidden="true">
              <span className="p-3">Mã SP</span><span className="p-3">Tên sản phẩm</span><span className="p-3">Mô tả</span><span className="p-3 text-right">Đơn giá</span>
            </div>
            <div id={listId} role="listbox" aria-label="Sản phẩm" aria-busy={!available}>
              {available && (result.hasSearch ? visible.map(renderOption) : Object.entries(result.groupedResults).map(([category, rows]) => <div key={category} role="group" aria-label={category}>
                <div className="sticky top-0 z-10 border-b bg-gray-100 px-4 py-3 text-sm font-semibold text-red-600">{category} ({rows.length})</div>{rows.map(renderOption)}
              </div>))}
            </div>
          </div>
        </div>
        {available && !visible.length && <p className="py-8 text-center text-gray-500">{query ? 'Không tìm thấy sản phẩm nào với từ khóa “' + searchTerm.trim() + '”' : 'Chưa có sản phẩm trong bảng giá này'}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}

