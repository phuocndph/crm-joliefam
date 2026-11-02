import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { GhnDirectorySearch } from './GhnDirectorySearch';
import { GhnAddressModeSwitch } from './GhnAddressModeSwitch';
import { createAddressGeneration, filterGhnDirectory, ghnAddressSuggestionQuery, matchDistrict, matchDistrictTail, matchProvince, matchProvinceTail, matchWard, matchWardTail, type AddressLevel, type GhnProvince, type GhnDistrict, type GhnWard } from '@/lib/ghn-address-match';

export type GhnReceiverAddress = { address: string; provinceId: string; districtId: string; wardCode: string; districts: GhnDistrict[]; wards: GhnWard[] };
type Hints = { level: AddressLevel; candidates: { id: string; label: string }[]; province?: GhnProvince; district?: GhnDistrict; districts?: GhnDistrict[]; wards?: GhnWard[] };
type AddressSuggestion = { place_id: string; description: string; main_text: string; secondary_text: string };
type Props = {
  initial: GhnReceiverAddress;
  provinces: GhnProvince[];
  read: <T>(action: string, body: Record<string, unknown>) => Promise<T>;
  onCancel: () => void;
  onCommit: (address: GhnReceiverAddress) => void;
  onSwitchMode?: (draft:GhnReceiverAddress)=>void;
};
const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Không tải được danh mục địa chỉ GHN.';

/** Mounted only while editing. Nothing leaves this transaction before Done. */
export function GhnReceiverAddressDialog({ initial, provinces, read, onCancel, onCommit,onSwitchMode }: Props) {
  const [draft, setDraft] = useState<GhnReceiverAddress>(() => ({ ...initial }));
  const [recognize, setRecognize] = useState(onSwitchMode&&initial.provinceId?false:!initial.provinceId || !initial.districtId || !initial.wardCode);
  const [recognitionRevision, setRecognitionRevision] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [restoreRetry,setRestoreRetry]=useState(0),[restoreFailed,setRestoreFailed]=useState(false);
  const [hints, setHints] = useState<Hints | null>(null);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null), [providerError, setProviderError] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]), [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false), [searchBusy, setSearchBusy] = useState(false), [searchError, setSearchError] = useState('');
  const [searchDone, setSearchDone] = useState(false), [searchIndex, setSearchIndex] = useState(0), [searchRetry, setSearchRetry] = useState(0), [statusRetry, setStatusRetry] = useState(0);
  const [composing, setComposing] = useState(false);
  // Only text deliberately edited here may be sent again on a later focus.
  // Prefilled addresses and a selected suggestion never opt in implicitly.
  const userSearchAddress = useRef<string | null>(null);
  const searchGeneration = useRef(createAddressGeneration());
  const generation = useRef(createAddressGeneration()), mounted = useRef(true);
  const content = useRef<HTMLDivElement>(null);
  const streetInput = useRef<HTMLInputElement>(null);
  const current = (token: number) => mounted.current && generation.current.current(token);
  useEffect(() => { const session=generation.current, searchSession=searchGeneration.current; mounted.current = true; return () => { mounted.current = false; session.next(); searchSession.next(); }; }, []);
  const closeSearch = () => { searchGeneration.current.next(); setSearchQuery(''); setSuggestions([]); setSearchOpen(false); setSearchBusy(false); setSearchError(''); setSearchDone(false); setSearchIndex(0); };
  const reopenSearch = () => {
    if (composing || !mounted.current || userSearchAddress.current !== draft.address || draft.address.trim().length < 3) return;
    setSearchQuery(draft.address); setSearchOpen(true);
  };
  const retryProviderStatus = () => {
    // Keyboard activation leaves focus on this button. Move it before the
    // loading/ready state disables or removes the button and blurs the widget.
    streetInput.current?.focus();
    searchGeneration.current.next(); setSuggestions([]); setSearchBusy(false); setSearchError(''); setSearchDone(false);
    reopenSearch();
    setStatusRetry(previous => previous + 1);
  };
  useEffect(() => {
    let active = true;
    setProviderConfigured(null); setProviderError('');
    void read<{ configured: boolean }>('address_autocomplete_status', {}).then(value => {
      if (active && mounted.current) setProviderConfigured(value?.configured === true);
    }).catch(() => { if (active && mounted.current) setProviderError('Không kiểm tra được dịch vụ gợi ý địa chỉ. Bạn vẫn có thể nhập và chọn địa chỉ GHN bên dưới.'); });
    return () => { active = false; };
  }, [read, statusRetry]);
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 3 || !searchOpen || composing || providerConfigured !== true) return;
    const token = searchGeneration.current.next(); let active = true;
    const fresh = () => active && mounted.current && searchGeneration.current.current(token);
    setSearchBusy(true); setSearchError(''); setSearchDone(false); setSuggestions([]); setSearchIndex(0);
    const timer = setTimeout(() => {
      void read<AddressSuggestion[]>('address_autocomplete', { input: searchQuery.trim() }).then(rows => {
        if (!fresh()) return;
        setSuggestions(Array.isArray(rows) ? rows.slice(0, 8) : []); setSearchDone(true);
      }).catch(cause => { if (fresh()) { setSearchError(cause instanceof Error ? cause.message : 'Không tải được gợi ý địa chỉ.'); setSearchDone(true); } }).finally(() => { if (fresh()) setSearchBusy(false); });
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [searchQuery, searchOpen, composing, providerConfigured, searchRetry, read]);
  useEffect(() => {
    if (searchOpen) content.current?.querySelector<HTMLElement>(`[data-address-option="${searchIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [searchIndex, searchOpen]);
  const invalidate = () => { const token = generation.current.next(); setBusy(false); setRecognize(false); setError('');setRestoreFailed(false); setHints(null); setNotice(''); return token; };
  const cancel = () => { generation.current.next(); searchGeneration.current.next(); mounted.current = false; onCancel(); };
  const changeAddress = (address: string, lookup = true) => {
    closeSearch();
    userSearchAddress.current = lookup ? address : null;
    invalidate();
    setDraft({ address, provinceId: '', districtId: '', wardCode: '', districts: [], wards: [] });
    setRecognize(true);
    setRecognitionRevision(previous => previous + 1);
    if (lookup) { setSearchQuery(address); setSearchOpen(address.trim().length >= 3); }
  };
  const selectProvince = (provinceId: string) => {
    closeSearch();
    const token = invalidate();
    setDraft(previous => ({ ...previous, provinceId, districtId: '', wardCode: '', districts: [], wards: [] }));
    if (!provinceId) return;
    setBusy(true);
    void read<GhnDistrict[]>('get_districts', { provinceId: Number(provinceId) }).then(districts => {
      if (!current(token)) return;
      setDraft(previous => previous.provinceId === provinceId ? { ...previous, districts } : previous);
      if (!districts.length) setError('GHN chưa có quận/huyện cho tỉnh đã chọn.');
    }).catch(cause => { if (current(token)) setError(message(cause)); }).finally(() => { if (current(token)) setBusy(false); });
  };
  const selectDistrict = (districtId: string) => {
    closeSearch();
    const token = invalidate();
    setDraft(previous => ({ ...previous, districtId, wardCode: '', wards: [] }));
    if (!districtId) return;
    setBusy(true);
    void read<GhnWard[]>('get_wards', { districtId: Number(districtId) }).then(wards => {
      if (!current(token)) return;
      setDraft(previous => previous.districtId === districtId ? { ...previous, wards } : previous);
      if (!wards.length) setError('GHN chưa có phường/xã cho quận đã chọn.');
    }).catch(cause => { if (current(token)) setError(message(cause)); }).finally(() => { if (current(token)) setBusy(false); });
  };
  const selectWard = (wardCode: string) => { closeSearch(); invalidate(); setDraft(previous => ({ ...previous, wardCode })); };
  const browse = () => { closeSearch(); if (recognize) invalidate(); };

  // A mode switch can interrupt a directory request after its parent ID was
  // selected. Restore that catalog without restarting address recognition.
  const restoreEnabled=Boolean(onSwitchMode);
  useEffect(()=>{
    if(!restoreEnabled||!initial.provinceId)return;
    const missingDistricts=!initial.districts.length;
    const missingWards=Boolean(initial.districtId&&!initial.wards.length);
    if(!missingDistricts&&!missingWards)return;
    const token=generation.current.next();let active=true;
    const fresh=()=>active&&current(token);
    setBusy(true);setError('');setRestoreFailed(false);
    void(async()=>{
      const districts=missingDistricts?await read<GhnDistrict[]>('get_districts',{provinceId:Number(initial.provinceId)}):initial.districts;
      if(!fresh())return;
      const districtValid=Boolean(initial.districtId&&districts.some(row=>String(row.DistrictID)===initial.districtId));
      setDraft(previous=>({...previous,districts,...(initial.districtId&&!districtValid?{districtId:'',wardCode:'',wards:[]}:{})}));
      if(!districts.length){setError('GHN chưa có quận/huyện cho tỉnh đã chọn.');setRestoreFailed(true);return;}
      if(initial.districtId&&!districtValid){setError('Quận/huyện đã chọn không còn trong danh mục. Vui lòng chọn lại.');return;}
      if(!districtValid||!missingWards)return;
      const wards=await read<GhnWard[]>('get_wards',{districtId:Number(initial.districtId)});
      if(!fresh())return;
      setDraft(previous=>({...previous,wards,wardCode:wards.some(row=>row.WardCode===initial.wardCode)?initial.wardCode:''}));
      if(!wards.length){setError('GHN chưa có phường/xã cho quận đã chọn.');setRestoreFailed(true);}
      else if(initial.wardCode&&!wards.some(row=>row.WardCode===initial.wardCode))setError('Phường/xã đã chọn không còn trong danh mục. Vui lòng chọn lại.');
    })().catch(cause=>{if(fresh()){setError(message(cause));setRestoreFailed(true);}}).finally(()=>{if(fresh())setBusy(false);});
    return()=>{active=false;};
  },[restoreEnabled,initial.provinceId,initial.districtId,initial.wardCode,initial.districts,initial.wards,read,restoreRetry]);

  useEffect(() => {
    if (!recognize || composing || !draft.address.trim() || !provinces.length) return;
    const token = generation.current.next(); let active = true;
    const fresh = () => active && current(token);
    setBusy(true); setError(''); setHints(null); setNotice('Đang nhận diện theo danh mục GHN…');
    const missing = (level: string) => setNotice('Chưa xác định chắc chắn ' + level + '. Vui lòng chọn trong danh mục GHN bên dưới.');
    const timer = setTimeout(() => {
      void (async () => {
        const text = draft.address;
        const pt = matchProvinceTail(text, provinces), pe = matchProvince(text, provinces);
        const p = pt.kind === 'unique' && pe.kind !== 'ambiguous' ? pt : pe;
        if (p.kind !== 'unique' || (pt.kind === 'unique' && pe.kind === 'unique' && pt.value.ProvinceID !== pe.value.ProvinceID)) {
          const query = ghnAddressSuggestionQuery(text, 'province');
          setHints(query ? { level: 'province', candidates: filterGhnDirectory(query, provinces, 'province', row => row.ProvinceName, row => row.NameExtension || []).map(row => ({ id: String(row.ProvinceID), label: row.ProvinceName })) } : null);
          missing('tỉnh/thành'); return;
        }
        const districts = await read<GhnDistrict[]>('get_districts', { provinceId: p.value.ProvinceID });
        if (!fresh()) return;
        const dt = pt.kind === 'unique' ? matchDistrictTail(pt.rest, districts) : { kind: 'missing' as const }, de = matchDistrict(text, districts);
        const d = dt.kind === 'unique' && de.kind !== 'ambiguous' ? dt : de;
        if (d.kind !== 'unique' || (dt.kind === 'unique' && de.kind === 'unique' && dt.value.DistrictID !== de.value.DistrictID)) {
          const query = ghnAddressSuggestionQuery(pt.kind === 'unique' ? pt.rest : text, 'district');
          setHints(query ? { level: 'district', province: p.value, districts, candidates: filterGhnDirectory(query, districts, 'district', row => row.DistrictName, row => row.NameExtension || []).map(row => ({ id: String(row.DistrictID), label: row.DistrictName })) } : null);
          if (pe.kind === 'unique') setDraft(previous => ({ ...previous, provinceId: String(p.value.ProvinceID), districts }));
          missing('quận/huyện'); return;
        }
        const wards = await read<GhnWard[]>('get_wards', { districtId: d.value.DistrictID });
        if (!fresh()) return;
        const wt = dt.kind === 'unique' ? matchWardTail(dt.rest, wards) : { kind: 'missing' as const }, we = matchWard(text, wards);
        const w = wt.kind === 'unique' && we.kind !== 'ambiguous' ? wt : we;
        if (w.kind !== 'unique' || (wt.kind === 'unique' && we.kind === 'unique' && wt.value.WardCode !== we.value.WardCode)) {
          const query = ghnAddressSuggestionQuery(dt.kind === 'unique' ? dt.rest : text, 'ward');
          setHints(query ? { level: 'ward', province: p.value, district: d.value, districts, wards, candidates: filterGhnDirectory(query, wards, 'ward', row => row.WardName, row => row.NameExtension || []).map(row => ({ id: row.WardCode, label: row.WardName })) } : null);
          if (pe.kind === 'unique' && de.kind === 'unique') setDraft(previous => ({ ...previous, provinceId: String(p.value.ProvinceID), districtId: String(d.value.DistrictID), districts, wards }));
          missing('phường/xã'); return;
        }
        const completeTail = pt.kind === 'unique' && dt.kind === 'unique' && wt.kind === 'unique';
        const completeExplicit = pe.kind === 'unique' && de.kind === 'unique' && we.kind === 'unique';
        if (!completeTail && !completeExplicit) { missing('đủ ba cấp địa chỉ'); return; }
        setDraft(previous => ({ ...previous, provinceId: String(p.value.ProvinceID), districtId: String(d.value.DistrictID), wardCode: w.value.WardCode, districts, wards }));
        setNotice('Đã nhận diện đủ ba cấp. Kiểm tra rồi bấm Xong để áp dụng.');
      })().catch(cause => { if (fresh()) setError(message(cause)); }).finally(() => { if (fresh()) { setBusy(false); setRecognize(false); } });
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [draft.address, recognize, recognitionRevision, provinces, read, composing]);

  const applyHint = (id: string) => {
    if (!hints) return;
    if (hints.level === 'province') { selectProvince(id); return; }
    const hint = hints;
    closeSearch();
    invalidate();
    setDraft(previous => ({ ...previous, provinceId: String(hint.province!.ProvinceID), districts: hint.districts || [], districtId: hint.level === 'ward' ? String(hint.district!.DistrictID) : '', wards: hint.wards || [], wardCode: hint.level === 'ward' ? id : '' }));
    if (hint.level === 'district') selectDistrict(id);
  };
  const streetValid = draft.address.trim().length >= 3 && draft.address.trim().length <= 500 && !/^\s*(?:ngày hết hạn|ngay het han|email|mã số thuế|ma so thue)\s*:/i.test(draft.address);
  const valid = streetValid && provinces.some(row => String(row.ProvinceID) === draft.provinceId) && draft.districts.some(row => String(row.DistrictID) === draft.districtId) && draft.wards.some(row => row.WardCode === draft.wardCode);
  const commit = () => { if (!valid || busy || composing || !mounted.current) return; generation.current.next(); searchGeneration.current.next(); mounted.current = false; onCommit({ ...draft }); };
  const expanded = searchOpen && searchQuery.trim().length >= 3 && providerConfigured === true && !composing;
  return <Dialog open onOpenChange={value => { if (!value) cancel(); }}><DialogContent ref={content} className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto p-5 sm:p-7" aria-describedby="ghn-address-dialog-help" onEscapeKeyDown={event => {
    if (expanded) { event.preventDefault(); closeSearch(); return; }
    const active = content.current?.ownerDocument.activeElement;
    if (active && content.current?.contains(active) && active.matches('[data-ghn-directory-combobox="true"][aria-expanded="true"]')) event.preventDefault();
  }}><DialogHeader><DialogTitle>Địa chỉ nhận</DialogTitle></DialogHeader>
    {onSwitchMode&&<GhnAddressModeSwitch mode="OLD3" onChange={mode=>{if(mode==='NEW2'){generation.current.next();searchGeneration.current.next();mounted.current=false;onSwitchMode({...draft});}}}/>}
    {onSwitchMode&&!provinces.length&&<p role="status" className="text-xs text-muted-foreground">Chưa có danh mục địa chỉ cũ. Bạn có thể chuyển sang địa chỉ mới.</p>}
    <div className="space-y-5 rounded-xl border bg-muted/20 p-4 sm:p-5"><h3 className="font-semibold">Bên nhận</h3><div id="ghn-address-widget" className="space-y-2 border-t pt-4" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeSearch(); }}><Label htmlFor="ghn-street">Địa chỉ nhận *</Label><div id="ghn-address-anchor" className="relative"><Input ref={streetInput} autoFocus id="ghn-street" role="combobox" aria-autocomplete="list" autoComplete="off" aria-expanded={expanded} aria-controls={expanded ? 'ghn-address-options' : undefined} aria-activedescendant={expanded && suggestions[searchIndex] ? `ghn-address-option-${searchIndex}` : undefined} value={draft.address} maxLength={500} placeholder="Nhập số nhà, tên đường hoặc dán địa chỉ của khách…" aria-invalid={!streetValid} aria-describedby="ghn-address-dialog-help ghn-address-provider-status" onChange={event => changeAddress(event.target.value)} onFocus={reopenSearch} onClick={reopenSearch} onCompositionStart={() => { searchGeneration.current.next(); setComposing(true); }} onCompositionEnd={() => setComposing(false)} onKeyDown={event => {
      if (composing || event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); closeSearch(); return; }
      if (expanded && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setSearchIndex(previous => Math.max(0, Math.min(suggestions.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1)))); }
      if (event.key === 'Enter' && expanded) { event.preventDefault(); if (suggestions[searchIndex]) changeAddress(suggestions[searchIndex].description, false); }
    }}/>
      {expanded && <div id="ghn-address-options" role="listbox" aria-label="Gợi ý địa chỉ đầy đủ từ Goong" className="absolute inset-x-0 top-full z-30 mt-1 max-h-[min(16rem,35dvh)] overflow-y-auto rounded-lg border bg-background p-1 shadow-lg">
        {suggestions.map((row, index) => <div key={row.place_id} id={`ghn-address-option-${index}`} data-address-option={index} role="option" aria-selected={index === searchIndex} className={'min-h-12 cursor-pointer rounded-md px-3 py-2 text-sm ' + (index === searchIndex ? 'bg-orange-50 text-orange-950 dark:bg-orange-950 dark:text-orange-50' : 'hover:bg-muted')} onMouseDown={event => event.preventDefault()} onMouseMove={() => setSearchIndex(index)} onClick={() => changeAddress(row.description, false)}><span className="block font-medium break-words">{row.main_text}</span><span className="block text-xs text-muted-foreground break-words">{row.secondary_text || row.description}</span></div>)}
        {searchBusy && <p role="status" className="p-3 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Đang tìm địa chỉ…</p>}
        {searchDone && !searchBusy && !suggestions.length && !searchError && <p className="p-3 text-sm text-muted-foreground">Không tìm thấy địa chỉ phù hợp. Gõ thêm hoặc chọn danh mục GHN bên dưới.</p>}
        {searchError && <div role="alert" className="p-3 text-sm"><p className="text-destructive">{searchError}</p><Button size="sm" variant="outline" type="button" className="mt-2" onClick={() => setSearchRetry(previous => previous + 1)}>Thử lại gợi ý</Button></div>}
      </div>}</div>
      <p id="ghn-address-dialog-help" className="text-xs text-muted-foreground">Chọn một địa chỉ gợi ý, kiểm tra tỉnh/quận/phường GHN rồi bấm Xong. Địa chỉ thiếu cấp hoặc chưa khớp cần chọn thủ công.</p>
      <div id="ghn-address-provider-status" className={providerError ? 'rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm' : providerConfigured === false ? 'rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100' : 'text-xs text-muted-foreground'} aria-live="polite" aria-busy={providerConfigured === null && !providerError}>
        {providerError ? <><p className="font-medium">Chưa kiểm tra được gợi ý địa chỉ</p><p className="mt-1">{providerError}</p></> : providerConfigured === false ? <><p className="font-medium">Chưa bật gợi ý địa chỉ</p><p className="mt-1">Quản trị viên cần cấu hình Goong tại Cài đặt API → Goong để tìm số nhà, tên đường và địa chỉ đầy đủ. Khóa GHN không thay thế khóa Goong.</p><p className="mt-1">Bạn vẫn có thể nhập địa chỉ và chọn tỉnh, quận, phường GHN bên dưới.</p></> : providerConfigured === true ? 'Gợi ý bởi Goong · Nội dung bạn gõ được gửi tới Goong để tìm địa chỉ.' : <p><Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>Đang kiểm tra dịch vụ gợi ý…</p>}
        {providerConfigured !== true && <Button size="sm" variant="outline" type="button" className="mt-2" disabled={providerConfigured === null && !providerError} onClick={retryProviderStatus}>Kiểm tra lại gợi ý</Button>}
      </div></div>
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">{busy && <Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>}{notice}</div>
      {hints && hints.candidates.length > 0 && <div className="space-y-2 rounded-md border bg-background p-3" aria-label="Gợi ý danh mục GHN"><p className="text-xs text-muted-foreground">{hints.level === 'province' ? 'Tỉnh/thành GHN' : hints.level === 'district' ? 'Quận/huyện thuộc ' + hints.province?.ProvinceName : 'Phường/xã thuộc ' + hints.district?.DistrictName}</p><div className="flex max-h-36 flex-wrap gap-2 overflow-auto">{hints.candidates.slice(0, 12).map(row => <Button key={row.id} type="button" size="sm" variant="outline" onClick={() => applyHint(row.id)}>{row.label}</Button>)}</div>{hints.candidates.length > 12 && <p className="text-xs">Gõ thêm để thu hẹp {hints.candidates.length} kết quả.</p>}</div>}
      <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="ghn-province">Tỉnh - Thành phố *</Label><GhnDirectorySearch id="ghn-province" label="Tỉnh - Thành phố" value={draft.provinceId} options={provinces.map(row => ({ value: String(row.ProvinceID), label: row.ProvinceName, aliases: row.NameExtension }))} onSearch={browse} onChange={selectProvince}/></div><div className="space-y-2"><Label htmlFor="ghn-district">Quận - Huyện GHN *</Label><GhnDirectorySearch id="ghn-district" label="Quận - Huyện GHN" value={draft.districtId} parentKey={draft.provinceId} options={draft.districts.map(row => ({ value: String(row.DistrictID), label: row.DistrictName, aliases: row.NameExtension }))} loading={busy} disabled={!draft.provinceId} onSearch={browse} onChange={selectDistrict}/></div><div className="space-y-2"><Label htmlFor="ghn-ward">Phường - Xã GHN *</Label><GhnDirectorySearch id="ghn-ward" label="Phường - Xã GHN" value={draft.wardCode} parentKey={draft.districtId} options={draft.wards.map(row => ({ value: row.WardCode, label: row.WardName, aliases: row.NameExtension }))} loading={busy} disabled={!draft.districtId} onSearch={browse} onChange={selectWard}/></div></div>
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>{restoreFailed&&<Button type="button" size="sm" variant="outline" onClick={()=>setRestoreRetry(value=>value+1)}>Tải lại danh mục</Button>}</div>}
    </div><div className="flex justify-end gap-3 border-t pt-4"><Button type="button" variant="outline" onClick={cancel}>Hủy</Button><Button type="button" className="bg-orange-600 text-white hover:bg-orange-700" disabled={!valid || busy || composing} onClick={commit}>Xong</Button></div>
  </DialogContent></Dialog>;
}
