export type GhnAddressMode='OLD3'|'NEW2';

export function GhnAddressModeSwitch({mode,onChange}:{mode:GhnAddressMode;onChange:(mode:GhnAddressMode)=>void}){
  return <div role="radiogroup" aria-label="Hệ địa chỉ" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {([['OLD3','Địa chỉ cũ · 3 cấp'],['NEW2','Địa chỉ mới · 2 cấp']] as const).map(([value,label])=><label key={value} className={'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm '+(mode===value?'border-primary bg-muted/40':'bg-background')}><input type="radio" name="ghn-address-draft-mode" value={value} checked={mode===value} onChange={()=>onChange(value)} className="shrink-0 accent-primary"/><span>{label}</span></label>)}
  </div>;
}
