import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { normalizeGhnAddress } from '@/lib/ghn-address-match';

type Option = { value: string; label: string; aliases?: readonly string[] | null };

/** A single inline combobox keeps focus inside the dialog without a portal. */
export function GhnDirectorySearch({ id, label, value, options, disabled, loading, parentKey = '', onSearch, onChange }: {
  id: string; label: string; value: string; options: Option[]; disabled?: boolean; loading?: boolean;
  parentKey?: string; onSearch: () => void; onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false), [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find(row => row.value === value);
  useEffect(() => { setQuery(''); setExpanded(false); setActiveIndex(0); }, [value, parentKey, disabled, loading]);
  const normalized = normalizeGhnAddress(query);
  const matches = options.filter(row => [row.label, ...(row.aliases || [])].some(name => {
    const text = normalizeGhnAddress(name);
    return text.startsWith(normalized) || text.replace(/^(?:thanh pho|tinh|quan|huyen|thi xa|phuong|xa|thi tran)\s+/, '').startsWith(normalized);
  }));
  const choose = (row: Option) => { setQuery(''); setExpanded(false); setActiveIndex(0); onChange(row.value); };
  useEffect(() => {
    if (expanded) root.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [expanded, activeIndex]);
  return <div ref={root} className="space-y-1.5" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setExpanded(false); setQuery(''); } }}>
    <Input id={id} className="min-h-11 text-base" role="combobox" data-ghn-directory-combobox="true" aria-label={label} aria-describedby={id + '-help'}
      aria-autocomplete="list" aria-expanded={expanded && !disabled && !loading} aria-controls={id + '-options'}
      aria-activedescendant={expanded && matches[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
      placeholder={loading ? 'Đang tải…' : 'Chọn hoặc tìm ' + label.toLowerCase()} value={expanded ? query : selected?.label || ''} disabled={disabled || loading}
      autoComplete="off" onFocus={() => { setExpanded(true); setQuery(''); setActiveIndex(0); }}
      onClick={() => { if (!expanded) { setExpanded(true); setActiveIndex(0); } }}
      onChange={event => { onSearch(); setExpanded(true); setQuery(event.target.value); setActiveIndex(0); }}
      onKeyDown={event => {
        if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setExpanded(false); setQuery(''); return; }
        if (event.key === 'Tab') { setExpanded(false); setQuery(''); return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setExpanded(true);
          setActiveIndex(previous => !expanded ? 0 : Math.max(0, Math.min(matches.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1))));
        }
        if (event.key === 'Enter' && expanded) { event.preventDefault(); if (matches[activeIndex]) choose(matches[activeIndex]); }
      }} />
    <p id={id + '-help'} className="text-xs text-muted-foreground">{loading ? 'Đang tải danh mục GHN…' : disabled ? 'Chọn cấp địa chỉ phía trước.' : expanded ? 'Gõ tên có dấu / không dấu · ↑ ↓ để chọn · Enter xác nhận.' : ''}</p>
    {expanded && !disabled && !loading && <div id={id + '-options'} role="listbox" className="max-h-48 overflow-y-auto rounded-md border bg-background p-1" aria-label={'Kết quả tìm ' + label}>
      {matches.map((row, index) => <div id={`${id}-option-${index}`} role="option" aria-selected={row.value === value} data-option-index={index} key={row.value}
        className={'flex min-h-11 cursor-pointer items-center rounded px-2 py-2 text-base ' + (index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}
        onMouseDown={event => event.preventDefault()} onMouseMove={() => setActiveIndex(index)} onClick={() => choose(row)}>{row.label}</div>)}
      {!matches.length && <p className="p-2 text-sm text-muted-foreground">Không có tên phù hợp trong danh mục GHN.</p>}
    </div>}
  </div>;
}
