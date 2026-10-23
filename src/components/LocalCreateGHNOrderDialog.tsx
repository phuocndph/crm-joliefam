import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localApi, type GhnOrderAttempt } from '@/lib/local-api';
import { captureLocalAuthGuard, getLocalMe, getLocalUserSession, type LocalAuthGuard } from '@/lib/local-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Copy, Loader2, Plus, Printer, RefreshCw, Truck, X } from 'lucide-react';
import type { CreateGHNOrderDialogProps } from './CreateGHNOrderDialog';
import { GhnDirectorySearch } from './GhnDirectorySearch';
import { createAddressGeneration, matchProvince, matchDistrict, matchWard, matchProvinceTail, matchDistrictTail, matchWardTail, filterGhnDirectory, ghnAddressSuggestionQuery, type AddressLevel, type GhnProvince as Province, type GhnDistrict as District, type GhnWard as Ward } from '@/lib/ghn-address-match';
import { buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession, findGhnSelectedQuote, findGhnAutomaticCheapest, ghnServiceChoiceKey, validateGhnCreateItems, type GhnQuoteComparison, type GhnShopQuote } from '@/lib/ghn-quote-comparison';

type Shop={_id:number;name:string;address:string;district_id:number};
type Service={service_id:number;service_type_id:number;short_name:string};
type Item={name:string;quantity:number;weight:number;length:number;width:number;height:number};
const blankItem=():Item=>({name:'',quantity:1,weight:0,length:0,width:0,height:0});
const blankParcel=()=>({weight:0,length:0,width:0,height:0});
const metadataAddress=(value:string)=>/^\s*(?:ngày hết hạn|ngay het han|email|mã số thuế|ma so thue)\s*:/i.test(value);
const unresolved=(attempt:GhnOrderAttempt|null)=>Boolean(attempt && ['IN_FLIGHT','UNKNOWN','REMOTE_CREATED'].includes(attempt.attempt_status));
const read=async<T,>(action:string,body:Record<string,unknown>={},guard?:LocalAuthGuard)=>{
  const result=await localApi.localFunction<{success:boolean;data:T;error?:string}>('ghn-tracking',{action,...body},'POST',guard);
  if(!result.success) throw new Error(result.error||'Không tải được dữ liệu GHN.');
  return result.data;
};
const errorText=(error:unknown)=>error instanceof Error?error.message:'Không xử lý được GHN. Vui lòng thử lại.';
const money=(value:number)=>value.toLocaleString('vi-VN')+' đ';
const storageSet=(key:string,value:string)=>{try{sessionStorage.setItem(key,value);}catch{/* Server recent-attempt recovery remains available. */}};
const validPrintUrl=(value:unknown):value is string=>typeof value==='string'&&/^https:\/\/online-gateway\.ghn\.vn\/a5\/public-api\/printA5\?token=[A-Za-z0-9_-]{8,2048}$/.test(value);
type AttemptSession={epoch:number;open:boolean;scope:string;key:string};
type AddressHints={level:AddressLevel;candidates:{id:string;label:string}[];province?:Province;district?:District;districts?:District[];wards?:Ward[]};
type SelectedQuote={context:string;shopId:string;serviceId:number;serviceType:number;total:number};

export function LocalCreateGHNOrderDialog({open,onOpenChange,order,remainingAmount=0,onSuccess,authGuard}:CreateGHNOrderDialogProps & {authGuard?:LocalAuthGuard}) {
  const navigate=useNavigate();
  const sessionAuth=useRef<LocalAuthGuard|null>(null);
  const authClose=useRef(onOpenChange);authClose.current=onOpenChange;
  const [shops,setShops]=useState<Shop[]>([]),[shopId,setShopId]=useState('');
  const dialogContent=useRef<HTMLDivElement>(null);
  const [provinces,setProvinces]=useState<Province[]>([]),[districts,setDistricts]=useState<District[]>([]),[wards,setWards]=useState<Ward[]>([]);
  const [provinceId,setProvinceId]=useState(''),[districtId,setDistrictId]=useState(''),[wardCode,setWardCode]=useState('');
  const [toName,setToName]=useState(''),[toPhone,setToPhone]=useState(''),[toAddress,setToAddress]=useState('');
  const [items,setItems]=useState<Item[]>([blankItem()]);
  const [parcel,setParcel]=useState(blankParcel);
  const [prefillWarning,setPrefillWarning]=useState('');
  const [pickupConsent,setPickupConsent]=useState('');
  const [discardOpen,setDiscardOpen]=useState(false);
  const pendingDestination=useRef<string|null>(null);
  const initialForm=useRef('');
  const [cod,setCod]=useState(0),[insurance,setInsurance]=useState(0),[payment,setPayment]=useState('2');
  const [note,setNote]=useState(''),[requiredNote,setRequiredNote]=useState('CHOXEMHANGKHONGTHU');
  const [services,setServices]=useState<Service[]>([]),[serviceChoice,setServiceChoice]=useState('');
  const [feeQuote,setFeeQuote]=useState<SelectedQuote|null>(null),[feeBusy,setFeeBusy]=useState(false),[feeError,setFeeError]=useState('');
  const [comparison,setComparison]=useState<{context:string;data:GhnQuoteComparison}|null>(null),[compareBusy,setCompareBusy]=useState(false),[compareError,setCompareError]=useState('');
  const [quoteRevision,setQuoteRevision]=useState(0);
  const [selectionMode,setSelectionMode]=useState<'auto'|'manual'>('auto');
  const selectionIntent=useRef(0),latestMode=useRef(selectionMode);latestMode.current=selectionMode;
  const [manualAddress,setManualAddress]=useState(false),[showAllQuotes,setShowAllQuotes]=useState(false);
  const [dataError,setDataError]=useState(''),[locationError,setLocationError]=useState(''),[serviceError,setServiceError]=useState(''),[error,setError]=useState('');
  const [busy,setBusy]=useState(false),[initializing,setInitializing]=useState(false),[recoveryReady,setRecoveryReady]=useState(false),[dataBusy,setDataBusy]=useState(false);
  const [locationBusy,setLocationBusy]=useState(false),[servicesBusy,setServicesBusy]=useState(false);
  const [attempt,setAttempt]=useState<GhnOrderAttempt|null>(null),[requestKey,setRequestKey]=useState(''),[storageKey,setStorageKey]=useState('');
  const latestAttempt=useRef(attempt);latestAttempt.current=attempt;
  const [printUrl,setPrintUrl]=useState(''),[printError,setPrintError]=useState(''),[printBusy,setPrintBusy]=useState(false),[copyMessage,setCopyMessage]=useState('');
  const attemptSession=useRef<AttemptSession>({epoch:0,open:false,scope:'',key:''});
  const formOwner=useRef(''),initialDefaults=useRef({order,remainingAmount});initialDefaults.current={order,remainingAmount};
  const [reload,setReload]=useState(0);
  const [autoAddress,setAutoAddress]=useState(true),[matchingAddress,setMatchingAddress]=useState(false);
  const [addressMessage,setAddressMessage]=useState(''),[matchRetry,setMatchRetry]=useState(0);
  const [addressHints,setAddressHints]=useState<AddressHints|null>(null);
  const addressGeneration=useRef(createAddressGeneration());
  const districtCache=useRef(new Map<number,Promise<District[]>>()),wardCache=useRef(new Map<number,Promise<Ward[]>>());
  const notified=useRef('');
  const assertSessionAuth=useCallback(()=>{
    try{if(!sessionAuth.current)throw new Error('Phiên đăng nhập chưa sẵn sàng.');sessionAuth.current.assertCurrent();return sessionAuth.current;}
    catch(cause){attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,open:false,key:''};sessionAuth.current=null;authClose.current(false);throw cause;}
  },[]);
  const readForSession=useCallback(async<T,>(action:string,body:Record<string,unknown>={})=>{
    const pinned=assertSessionAuth();
    try{return await read<T>(action,body,pinned);}
    finally{assertSessionAuth();}
  },[assertSessionAuth]);
  const quoteSession=useRef<ReturnType<typeof createGhnQuoteSession>>();
  if(!quoteSession.current)quoteSession.current=createGhnQuoteSession(readForSession);
  const serviceRoute=useRef('');
  const routeKey=JSON.stringify([shopId,districtId]);
  const selectedService=serviceRoute.current===routeKey?services.find(row=>ghnServiceChoiceKey(row)===serviceChoice):undefined;
  const unresolvedAttempt=unresolved(attempt);
  const locked=busy || initializing || unresolvedAttempt;
  // Keep the memo stable for name-only edits, including while a quote is pending
  // or failed. Only physical item fields belong to the quote request lifecycle.
  const quoteItemsKey=JSON.stringify(items.map(row=>({name:'',quantity:row.quantity,weight:row.weight,length:row.length,width:row.width,height:row.height})));
  const quoteInput=useMemo(()=>buildGhnQuoteSnapshot({provinceId,districtId,wardCode,address:toAddress,items:JSON.parse(quoteItemsKey) as Item[],cod,insurance,parcel}),[provinceId,districtId,wardCode,toAddress,quoteItemsKey,cod,insurance,parcel]);
  // This identity excludes the chosen shop/service so comparison rows stay usable
  // while the operator chooses. Every price-affecting input is included.
  const quoteContext=JSON.stringify([open,order?.id,reload,locked,matchingAddress,dataBusy,quoteRevision,selectionMode,quoteInput.snapshot?.key||null]);
  const fee=feeQuote?.context===quoteContext&&feeQuote.shopId===shopId&&feeQuote.serviceId===selectedService?.service_id&&feeQuote.serviceType===selectedService?.service_type_id?feeQuote.total:null;
  const currentComparison=comparison?.context===quoteContext?comparison.data:null;
  const automaticCheapest=findGhnAutomaticCheapest(currentComparison,quoteInput.snapshot?.key);
  // This guard is evaluated during render, before effects/debounce begin after a changed parcel/address.
  const autoSelectionReady=selectionMode==='manual'||Boolean(automaticCheapest&&shopId===String(automaticCheapest.shop._id)&&selectedService?.service_id===automaticCheapest.service.service_id&&selectedService?.service_type_id===automaticCheapest.service.service_type_id);
  const nameError=!toName.trim()||toName.trim().length>100?'Nhập tên người nhận (1–100 ký tự).':'';
  const phoneError=!/^(?:0\d{9}|\+84\d{9})$/.test(toPhone.trim())?'Nhập số điện thoại 10 số bắt đầu bằng 0, hoặc +84 và 9 số.':'';
  const streetError=toAddress.trim().length<3||toAddress.trim().length>500?'Nhập địa chỉ đầy đủ (3–500 ký tự).':metadataAddress(toAddress)?'Nội dung này giống thông tin hồ sơ, không phải địa chỉ nhận hàng. Vui lòng nhập lại.':'';
  const parcelValid=Number.isInteger(parcel.weight)&&parcel.weight>=1&&parcel.weight<=50000&&[parcel.length,parcel.width,parcel.height].every(value=>Number.isInteger(value)&&value>=1&&value<=200);
  const itemPhysicalError=items.some(row=>!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>1000||!Number.isInteger(row.weight)||row.weight<1||row.weight>50000||[row.length,row.width,row.height].some(value=>!Number.isInteger(value)||value<1||value>200));
  const createValidationError=nameError||phoneError||streetError||quoteInput.error||validateGhnCreateItems(items);
  const reviewKey=fee!==null&&autoSelectionReady&&quoteInput.snapshot&&selectedService?JSON.stringify([quoteInput.snapshot.key,shopId,selectedService.service_id,selectedService.service_type_id,fee,payment,cod]):'';
  const pickupConfirmed=Boolean(reviewKey&&pickupConsent===reviewKey);
  useLayoutEffect(()=>{setPickupConsent('');},[reviewKey]);
  const formSignature=JSON.stringify([toName,toPhone,toAddress,provinceId,districtId,wardCode,items,parcel,cod,insurance,payment,note,requiredNote,selectionMode]);

  const currentAttemptSession=useCallback((token:AttemptSession)=>{
    const current=attemptSession.current;
    if(!(current.open&&current.epoch===token.epoch&&current.scope===token.scope&&current.key===token.key))return false;
    if(sessionAuth.current){try{assertSessionAuth();}catch{return false;}}
    return true;
  },[assertSessionAuth]);
  const resetForm=useCallback(()=>{
    const {order,remainingAmount}=initialDefaults.current;
    setShopId('');setProvinceId('');setDistrictId('');setWardCode('');setDistricts([]);setWards([]);setServices([]);setServiceChoice('');setFeeQuote(null);
    const phone=order?.customers?.phone||'',address=order?.customers?.address||'';
    const badPhone=Boolean(phone&&!/^(?:0\d{9}|\+84\d{9})$/.test(phone.trim())),badAddress=metadataAddress(address);
    setToName(order?.customers?.name||'');setToPhone(badPhone?'':phone);setToAddress(badAddress?'':address);
    setPrefillWarning(badPhone||badAddress?'Thông tin khách trong đơn có '+[badPhone?'số điện thoại chưa hợp lệ':'',badAddress?'địa chỉ giống thông tin hồ sơ':''].filter(Boolean).join(' và ')+'. Hãy bổ sung tại đây; dữ liệu khách gốc không bị thay đổi.':'');
    setCod(remainingAmount);setInsurance(Math.min(order?.total_amount||remainingAmount,5000000));setPayment('2');setRequiredNote('CHOXEMHANGKHONGTHU');
    setNote(order?'Đơn hàng '+(order.display_order_number||order.order_number):'');
    setItems([{...blankItem(),name:order?'Đơn hàng '+(order.display_order_number||order.order_number):''}]);
    setParcel(blankParcel());setPickupConsent('');
    initialForm.current=JSON.stringify([order?.customers?.name||'',badPhone?'':phone,badAddress?'':address,'','','',[{...blankItem(),name:order?'Đơn hàng '+(order.display_order_number||order.order_number):''}],blankParcel(),remainingAmount,Math.min(order?.total_amount||remainingAmount,5000000),'2',order?'Đơn hàng '+(order.display_order_number||order.order_number):'','CHOXEMHANGKHONGTHU','auto']);
    setSelectionMode('auto');latestMode.current='auto';setManualAddress(false);setShowAllQuotes(false);
    setError('');setLocationError('');setServiceError('');setPrintUrl('');setPrintError('');setPrintBusy(false);setCopyMessage('');
  },[]);

  useLayoutEffect(()=>{
    // Clear the prior success/draft before paint. Every async continuation below
    // belongs to this open/scope generation, never merely to a mounted component.
    const epoch=attemptSession.current.epoch+1;
    sessionAuth.current=authGuard||null;
    attemptSession.current={epoch,open,scope:order?.id||'standalone',key:''};
    setAttempt(null);setRequestKey('');setStorageKey('');setBusy(false);setInitializing(open);setRecoveryReady(false);
    const owner=JSON.stringify([open,order?.id]);
    if(formOwner.current!==owner){resetForm();formOwner.current=owner;}
    else{setError('');setPrintUrl('');setPrintError('');setPrintBusy(false);setCopyMessage('');}
    return()=>{attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,open:false};};
  },[open,order?.id,reload,resetForm,authGuard]);

  useLayoutEffect(()=>{
    const session=quoteSession.current!;
    selectionIntent.current++;
    session.invalidate(true);
    serviceRoute.current='';setServices([]);setServiceChoice('');
    return()=>session.invalidate(true);
  },[open,order?.id,reload]);
  useLayoutEffect(()=>{
    setSelectionMode('auto');latestMode.current='auto';setManualAddress(false);setShowAllQuotes(false);
  },[open,order?.id]);
  useLayoutEffect(()=>{
    quoteSession.current!.invalidate();
    setFeeQuote(null);setFeeBusy(false);setFeeError('');
    setComparison(null);setCompareBusy(false);setCompareError('');
  },[quoteContext]);

  useLayoutEffect(()=>{
    const generation=addressGeneration.current;
    generation.next();setMatchingAddress(false);setLocationBusy(false);
    setAutoAddress(true);setAddressMessage('');setAddressHints(null);
    districtCache.current.clear();wardCache.current.clear();
    return()=>{generation.next();};
  },[open,order?.id,reload]);
  useLayoutEffect(()=>{
    if(!unresolvedAttempt)return;
    addressGeneration.current.next();setAutoAddress(false);setMatchingAddress(false);setLocationBusy(false);setAddressHints(null);
  },[unresolvedAttempt]);

  const cancelAddressMatch=()=>{
    const token=addressGeneration.current.next();
    quoteSession.current!.invalidate();
    setAutoAddress(false);setMatchingAddress(false);setAddressMessage('');setLocationBusy(false);setAddressHints(null);
    setLocationError('');setFeeQuote(null);setFeeError('');setQuoteRevision(value=>value+1);
    return token;
  };
  const searchAddressDirectory=()=>{
    // Browsing a directory does not change the chosen address or invalidate its
    // fee/services/manual parent load. Only active auto-recognition owns a token
    // that must be cancelled before the user starts searching manually.
    if(matchingAddress){cancelAddressMatch();return;}
    setAutoAddress(false);setAddressHints(null);setAddressMessage('');
  };
  const changeAddress=(value:string)=>{
    cancelAddressMatch();setToAddress(value);setAutoAddress(true);
    setProvinceId('');setDistrictId('');setWardCode('');setDistricts([]);setWards([]);
    setMatchingAddress(Boolean(value.trim())&&provinces.length>0&&!dataBusy);
  };
  const loadDistricts=useCallback((id:number)=>{
    let pending=districtCache.current.get(id);
    if(!pending){pending=readForSession<District[]>('get_districts',{provinceId:id});districtCache.current.set(id,pending);void pending.catch(()=>districtCache.current.delete(id));}
    return pending;
  },[readForSession]);
  const loadWards=useCallback((id:number)=>{
    let pending=wardCache.current.get(id);
    if(!pending){pending=readForSession<Ward[]>('get_wards',{districtId:id});wardCache.current.set(id,pending);void pending.catch(()=>wardCache.current.delete(id));}
    return pending;
  },[readForSession]);
  const selectProvince=(value:string)=>{
    const token=cancelAddressMatch();setProvinceId(value);setDistrictId('');setWardCode('');setDistricts([]);setWards([]);
    if(!value)return;
    setLocationBusy(true);
    void loadDistricts(Number(value)).then(rows=>{
      if(!addressGeneration.current.current(token))return;
      setDistricts(rows);if(!rows.length)setLocationError('GHN chưa có quận/huyện cho tỉnh đã chọn.');
    }).catch(cause=>{if(addressGeneration.current.current(token))setLocationError(errorText(cause));})
      .finally(()=>{if(addressGeneration.current.current(token))setLocationBusy(false);});
  };
  const selectDistrict=(value:string)=>{
    const token=cancelAddressMatch();setDistrictId(value);setWardCode('');setWards([]);
    if(!value)return;
    setLocationBusy(true);
    void loadWards(Number(value)).then(rows=>{
      if(!addressGeneration.current.current(token))return;
      setWards(rows);if(!rows.length)setLocationError('GHN chưa có phường/xã cho quận đã chọn.');
    }).catch(cause=>{if(addressGeneration.current.current(token))setLocationError(errorText(cause));})
      .finally(()=>{if(addressGeneration.current.current(token))setLocationBusy(false);});
  };
  const selectWard=(value:string)=>{
    if(value===wardCode)return;
    cancelAddressMatch();setWardCode(value);
  };
  const applyHint=(id:string)=>{
    const hint=addressHints;if(!hint)return;
    if(hint.level==='province'){selectProvince(id);return;}
    if(!hint.province)return;
    setProvinceId(String(hint.province.ProvinceID));setDistricts(hint.districts||[]);
    if(hint.level==='district'){selectDistrict(id);return;}
    if(!hint.district)return;
    cancelAddressMatch();setDistrictId(String(hint.district.DistrictID));setWards(hint.wards||[]);setWardCode(id);
  };

  useEffect(()=>{
    if(!open) return;
    const token={...attemptSession.current};
    void (async()=>{
      const pinned=authGuard||await captureLocalAuthGuard(getLocalUserSession()?.actor||'local-admin');
      if(!currentAttemptSession(token))return;
      pinned.assertCurrent();sessionAuth.current=pinned;
      const me=await getLocalMe();
      if(!currentAttemptSession(token))return;
      assertSessionAuth();
      if(me.user_id==='local-admin') throw new Error('Cần đăng nhập bằng tài khoản thật để tạo đơn GHN.');
      const scope=me.user_id+':'+(order?.id||'standalone'),key='ghn-create:'+scope;
      const recent=await localApi.recentGhnOrder(order?.id,assertSessionAuth());
      if(!currentAttemptSession(token)) return;
      // Terminal history belongs in the order list, not a new-create dialog.
      // Only unresolved attempts are restored to preserve duplicate protection.
      const restored=unresolved(recent.data)?recent.data:null;
      const next=restored?.request_key||crypto.randomUUID();
      attemptSession.current={...attemptSession.current,key:next};
      setStorageKey(key);setRequestKey(next);storageSet(key,next);setAttempt(restored);setRecoveryReady(true);
      setInitializing(false);
    })().catch(cause=>{if(currentAttemptSession(token)){setError(errorText(cause));setInitializing(false);}});
  },[open,order?.id,reload,currentAttemptSession,assertSessionAuth,authGuard]);

  useEffect(()=>{
    if(!open||!recoveryReady)return;
    let active=true;setDataBusy(true);setDataError('');
    void Promise.all([readForSession<Shop[]>('get_shops'),readForSession<Province[]>('get_provinces')]).then(([loadedShops,loadedProvinces])=>{
      if(!active)return;
      setShops(loadedShops);setProvinces(loadedProvinces);
      setShopId(previous=>loadedShops.some(row=>String(row._id)===previous)?previous:String(loadedShops[0]?._id||''));
      if(!loadedShops.length || !loadedProvinces.length)setDataError('Không có cửa hàng hoặc địa chỉ GHN khả dụng. Kiểm tra Cài đặt API rồi tải lại.');
    }).catch(cause=>{if(active){setShops([]);setProvinces([]);setDataError(errorText(cause));}}).finally(()=>{if(active)setDataBusy(false);});
    return()=>{active=false;};
  },[open,reload,recoveryReady,readForSession]);

  useEffect(()=>{
    if(!open||locked||!autoAddress||!toAddress.trim())return;
    if(dataBusy||!provinces.length){setMatchingAddress(false);setAddressHints(null);setAddressMessage(dataBusy?'Đang tải danh mục GHN để gợi ý địa chỉ…':'Chưa có danh mục GHN. Tải lại cửa hàng / địa chỉ để thử lại.');return;}
    const token=addressGeneration.current.next();let active=true;
    const current=()=>active&&addressGeneration.current.current(token);
    setMatchingAddress(true);setLocationError('');setAddressHints(null);setAddressMessage('Đang nhận diện địa chỉ…');
    const notice=(level:string,kind:'missing'|'ambiguous')=>{setManualAddress(true);setAddressMessage(kind==='ambiguous'
      ?'Có nhiều '+level+' phù hợp. Vui lòng chọn địa chỉ GHN thủ công.'
      :'Chưa nhận diện được '+level+'. Địa chỉ mới hai cấp có thể thiếu quận/huyện GHN; vui lòng chọn các cấp còn thiếu thủ công.');};
    const timer=setTimeout(()=>{
      void (async()=>{
        setProvinceId('');setDistrictId('');setWardCode('');setDistricts([]);setWards([]);setFeeQuote(null);
        const provinceTail=matchProvinceTail(toAddress,provinces),explicitProvince=matchProvince(toAddress,provinces);
        if(provinceTail.kind==='unique'&&explicitProvince.kind==='unique'&&provinceTail.value.ProvinceID!==explicitProvince.value.ProvinceID){notice('tỉnh / thành','ambiguous');return;}
        const province=provinceTail.kind==='unique'&&explicitProvince.kind!=='ambiguous'?provinceTail:explicitProvince;
        if(province.kind!=='unique'){
          const query=ghnAddressSuggestionQuery(toAddress,'province');
          if(query)setAddressHints({level:'province',candidates:filterGhnDirectory(query,provinces,'province',row=>row.ProvinceName,row=>row.NameExtension||[]).map(row=>({id:String(row.ProvinceID),label:row.ProvinceName}))});
          notice('tỉnh / thành',province.kind);return;
        }
        // Bare suffixes are exploratory. Only explicit old-style matches may commit partial IDs.
        if(explicitProvince.kind==='unique')setProvinceId(String(province.value.ProvinceID));
        setLocationBusy(true);
        const loadedDistricts=await loadDistricts(province.value.ProvinceID);
        if(!current())return;
        if(explicitProvince.kind==='unique')setDistricts(loadedDistricts);
        const districtText=provinceTail.kind==='unique'?provinceTail.rest:toAddress;
        const districtTail=provinceTail.kind==='unique'?matchDistrictTail(districtText,loadedDistricts):{kind:'missing' as const};
        const explicitDistrict=matchDistrict(toAddress,loadedDistricts);
        if(districtTail.kind==='unique'&&explicitDistrict.kind==='unique'&&districtTail.value.DistrictID!==explicitDistrict.value.DistrictID){notice('quận / huyện','ambiguous');return;}
        const district=districtTail.kind==='unique'&&explicitDistrict.kind!=='ambiguous'?districtTail:explicitDistrict;
        if(district.kind!=='unique'){
          const query=ghnAddressSuggestionQuery(districtText,'district');
          if(query)setAddressHints({level:'district',province:province.value,districts:loadedDistricts,candidates:filterGhnDirectory(query,loadedDistricts,'district',row=>row.DistrictName,row=>row.NameExtension||[]).map(row=>({id:String(row.DistrictID),label:row.DistrictName}))});
          notice('quận / huyện',district.kind);return;
        }
        if(explicitProvince.kind==='unique'&&explicitDistrict.kind==='unique')setDistrictId(String(district.value.DistrictID));
        const loadedWards=await loadWards(district.value.DistrictID);
        if(!current())return;
        if(explicitProvince.kind==='unique'&&explicitDistrict.kind==='unique')setWards(loadedWards);
        const wardText=districtTail.kind==='unique'?districtTail.rest:toAddress;
        const wardTail=districtTail.kind==='unique'?matchWardTail(wardText,loadedWards):{kind:'missing' as const};
        const explicitWard=matchWard(toAddress,loadedWards);
        if(wardTail.kind==='unique'&&explicitWard.kind==='unique'&&wardTail.value.WardCode!==explicitWard.value.WardCode){notice('phường / xã','ambiguous');return;}
        const ward=wardTail.kind==='unique'&&explicitWard.kind!=='ambiguous'?wardTail:explicitWard;
        if(ward.kind!=='unique'){
          const query=ghnAddressSuggestionQuery(wardText,'ward');
          if(query)setAddressHints({level:'ward',province:province.value,district:district.value,districts:loadedDistricts,wards:loadedWards,candidates:filterGhnDirectory(query,loadedWards,'ward',row=>row.WardName,row=>row.NameExtension||[]).map(row=>({id:row.WardCode,label:row.WardName}))});
          notice('phường / xã',ward.kind);return;
        }
        const completeTail=provinceTail.kind==='unique'&&districtTail.kind==='unique'&&wardTail.kind==='unique';
        const completeExplicit=explicitProvince.kind==='unique'&&explicitDistrict.kind==='unique'&&explicitWard.kind==='unique';
        if(!completeTail&&!completeExplicit){notice('đủ ba cấp địa chỉ','missing');return;}
        setProvinceId(String(province.value.ProvinceID));setDistricts(loadedDistricts);
        setDistrictId(String(district.value.DistrictID));setWards(loadedWards);
        setWardCode(ward.value.WardCode);
        setManualAddress(false);
        setAddressMessage('Đã nhận diện tỉnh / thành, quận / huyện và phường / xã. Vui lòng kiểm tra trước khi tạo vận đơn.');
      })().catch(cause=>{if(current()){setManualAddress(true);setLocationError(errorText(cause));setAddressMessage('Chưa hoàn tất nhận diện. Hãy thử lại hoặc chọn địa chỉ GHN thủ công.');}})
        .finally(()=>{if(current()){setMatchingAddress(false);setLocationBusy(false);setAutoAddress(false);}});
    },650);
    return()=>{active=false;clearTimeout(timer);};
  },[open,locked,dataBusy,autoAddress,provinces,toAddress,matchRetry,reload,loadDistricts,loadWards]);
  useEffect(()=>{
    setServiceError('');setServicesBusy(false);
    if(selectionMode==='auto')return;
    if(!open||locked||!districtId||!shopId||matchingAddress||dataBusy)return;
    const session=quoteSession.current!,token=session.capture();
    let active=true;setServicesBusy(true);
    void session.services(shopId,Number(districtId),token).then(available=>{
      if(!active||!session.current(token))return;
      const sameRoute=serviceRoute.current===routeKey;
      serviceRoute.current=routeKey;setServices(available);
      // A valid manual choice survives weight changes. GHN availability, rather
      // than the former 20 kg heuristic, determines the selectable services.
      setServiceChoice(previous=>sameRoute&&available.some(row=>ghnServiceChoiceKey(row)===previous)?previous:available[0]?ghnServiceChoiceKey(available[0]):'');
      if(!available.length)setServiceError('Không có dịch vụ GHN phù hợp tuyến này. Chọn cửa hàng hoặc địa chỉ khác.');
    }).catch(cause=>{if(active&&session.current(token))setServiceError(errorText(cause));}).finally(()=>{if(active&&session.current(token))setServicesBusy(false);});
    return()=>{active=false;};
  },[open,locked,shopId,districtId,matchingAddress,dataBusy,routeKey,quoteContext,selectionMode]);

  useEffect(()=>{
    setFeeError('');setFeeBusy(false);
    const snapshot=quoteInput.snapshot;
    if(selectionMode==='auto')return;
    if(!open||locked||!shopId||!selectedService||matchingAddress||dataBusy||!snapshot){setFeeQuote(null);return;}
    const session=quoteSession.current!,token=session.capture();let active=true;
    const applyFee=(total:number)=>setFeeQuote({context:quoteContext,shopId,serviceId:selectedService.service_id,serviceType:selectedService.service_type_id,total});
    const cached=session.peekQuote(shopId,selectedService,snapshot);
    if(cached!==undefined){applyFee(cached);return;}
    setFeeQuote(null);
    setFeeBusy(true);
    const timer=setTimeout(()=>{
      void session.quote(shopId,selectedService,snapshot,token).then(total=>{if(active&&session.current(token))applyFee(total);}).catch(cause=>{if(active&&session.current(token))setFeeError(errorText(cause));}).finally(()=>{if(active&&session.current(token))setFeeBusy(false);});
    },400);
    return()=>{active=false;clearTimeout(timer);};
  },[open,locked,shopId,selectedService,matchingAddress,dataBusy,quoteInput,quoteContext,selectionMode]);

  useEffect(()=>{
    // Resolve against the selection in this render, never the pair captured
    // when comparison started. A comparison can repair a failed selected fee.
    const row=findGhnSelectedQuote(currentComparison,quoteInput.snapshot?.key,shopId,selectedService);
    if(!row||locked||matchingAddress||dataBusy)return;
    setFeeQuote({context:quoteContext,shopId,serviceId:row.service.service_id,serviceType:row.service.service_type_id,total:row.total});
    setFeeError('');setFeeBusy(false);
  },[currentComparison,quoteInput.snapshot?.key,shopId,selectedService,quoteContext,locked,matchingAddress,dataBusy]);

  useEffect(()=>{
    const snapshot=quoteInput.snapshot;
    if(selectionMode!=='auto'||!open||locked||attempt||matchingAddress||dataBusy||!snapshot||!shops.length)return;
    const session=quoteSession.current!,token=session.capture(),intent=selectionIntent.current;
    let active=true;
    setCompareBusy(true);setCompareError('');
    const timer=setTimeout(()=>{
      void compareGhnShopQuotes(session,shops,snapshot).then(data=>{
        if(!active||!session.current(token)||selectionIntent.current!==intent||latestMode.current!=='auto')return;
        setComparison({context:quoteContext,data});
        const row=findGhnAutomaticCheapest(data,snapshot.key);
        if(!row)return; // Fail closed on partial/no-success results. Operator may explicitly use manual mode.
        const id=String(row.shop._id);
        serviceRoute.current=JSON.stringify([id,districtId]);
        setShopId(id);setServices(row.services);setServiceChoice(ghnServiceChoiceKey(row.service));setServiceError('');
        setFeeQuote({context:quoteContext,shopId:id,serviceId:row.service.service_id,serviceType:row.service.service_type_id,total:row.total});
        setFeeError('');setFeeBusy(false);
      }).catch(cause=>{if(active&&session.current(token)&&selectionIntent.current===intent)setCompareError(errorText(cause));})
        .finally(()=>{if(active&&session.current(token)&&selectionIntent.current===intent)setCompareBusy(false);});
    },400);
    return()=>{active=false;clearTimeout(timer);};
  },[selectionMode,open,locked,attempt,matchingAddress,dataBusy,quoteInput,quoteContext,shops,districtId]);

  const changeSelectionMode=(mode:'auto'|'manual')=>{
    if(mode===selectionMode)return;
    selectionIntent.current++;latestMode.current=mode;
    quoteSession.current!.invalidate();setSelectionMode(mode);
    setFeeQuote(null);setFeeError('');setFeeBusy(false);setComparison(null);setCompareError('');setCompareBusy(false);
  };

  const compareQuotes=async()=>{
    const snapshot=quoteInput.snapshot;
    if(selectionMode==='auto'||!open||locked||matchingAddress||dataBusy||compareBusy||!snapshot||!shops.length)return;
    const session=quoteSession.current!,token=session.capture();
    setCompareBusy(true);setComparison(null);setCompareError('');
    try{
      const data=await compareGhnShopQuotes(session,shops,snapshot);
      if(session.current(token))setComparison({context:quoteContext,data});
    }catch(cause){if(session.current(token))setCompareError(errorText(cause));}
    finally{if(session.current(token))setCompareBusy(false);}
  };
  const chooseQuote=(row:GhnShopQuote)=>{
    if(selectionMode==='auto'||compareBusy||locked||!currentComparison||row.snapshotKey!==quoteInput.snapshot?.key||!currentComparison.quotes.includes(row))return;
    const id=String(row.shop._id);
    serviceRoute.current=JSON.stringify([id,districtId]);
    setShopId(id);setServices(row.services);setServiceChoice(ghnServiceChoiceKey(row.service));setServiceError('');
    setFeeQuote({context:quoteContext,shopId:id,serviceId:row.service.service_id,serviceType:row.service.service_type_id,total:row.total});setFeeError('');setFeeBusy(false);
  };
  const refreshQuote=()=>{
    if(!open||locked||matchingAddress||dataBusy||feeBusy||compareBusy||!quoteInput.snapshot||!shops.length||(selectionMode==='manual'&&(!shopId||!selectedService)))return;
    // Invalidate synchronously before rendering a new context. Keep the route
    // service cache, address, manual choice and create idempotency key intact.
    quoteSession.current!.invalidate();
    setFeeQuote(null);setFeeError('');setComparison(null);setCompareError('');
    setQuoteRevision(value=>value+1);
  };

  const applyAttempt=(value:GhnOrderAttempt,token:AttemptSession)=>{
    if(!currentAttemptSession(token)||value.request_key!==token.key)return;
    setAttempt(value);setRequestKey(value.request_key);if(storageKey)storageSet(storageKey,value.request_key);
    if(value.attempt_status==='SUCCESS'&&notified.current!==value.request_key){notified.current=value.request_key;onSuccess?.();}
  };
  const checkStatus=async(reconcile=false)=>{
    if(!requestKey||busy||!unresolvedAttempt)return;
    const token={...attemptSession.current};setBusy(true);setError('');
    try{applyAttempt((await localApi.ghnOrderStatus(token.key,reconcile,assertSessionAuth())).data,token);}
    catch(cause){if(currentAttemptSession(token))setError(errorText(cause));}
    finally{if(currentAttemptSession(token))setBusy(false);}
  };
  const submit=async()=>{
    if(createValidationError){setError(createValidationError);return;}
    if(!pickupConfirmed){setError('Xác nhận điểm lấy hàng, thu hộ và bên trả cước trong phần kiểm tra trước khi tạo.');return;}
    if(!recoveryReady||locked||attempt||matchingAddress||compareBusy||dataBusy||feeBusy||!autoSelectionReady||!quoteInput.snapshot||!selectedService||fee===null||!requestKey)return;
    const token={...attemptSession.current};setBusy(true);setError('');
    try{
      const measured=quoteInput.snapshot.feeData;
      const result=await localApi.createGhnOrder({idempotencyKey:requestKey,shopId,orderId:order?.id||null,orderNumber:order?.display_order_number||order?.order_number||'',provinceId:Number(provinceId),orderData:{to_name:toName,to_phone:toPhone,to_address:toAddress,to_district_id:Number(districtId),to_ward_code:wardCode,weight:measured.weight,length:measured.length,width:measured.width,height:measured.height,cod_amount:cod,insurance_value:insurance,cod_failed_amount:0,note,required_note:requiredNote,content:items.map(row=>row.name).join(', '),payment_type_id:Number(payment),service_type_id:selectedService.service_type_id,service_id:selectedService.service_id,items:items.map(row=>({...row,price:0}))}},assertSessionAuth());
      applyAttempt(result.data,token);
    }catch(cause){
      if(!currentAttemptSession(token))return;
      setError(errorText(cause));
      // Only local status is read after a lost response. This never posts another
      // create and the server also blocks unresolved actor/scope attempts.
      try{
        const latest=await localApi.recentGhnOrder(order?.id,assertSessionAuth());
        if(!currentAttemptSession(token))return;
        if(latest.data&&latest.data.request_key===token.key)applyAttempt(latest.data,token);
        else if(unresolved(latest.data)){
          // The server may have recovered an earlier unresolved key. Bind it to
          // this session only after the original request's generation is checked.
          const restored=latest.data!;
          attemptSession.current={...attemptSession.current,key:restored.request_key};
          setBusy(false);
          applyAttempt(restored,{...attemptSession.current});
        }
      }catch{if(currentAttemptSession(token))setRecoveryReady(false);}
    }finally{if(currentAttemptSession(token))setBusy(false);}
  };
  const newAttempt=()=>{
    if(!attempt||!['SUCCESS','REJECTED'].includes(attempt.attempt_status))return;
    attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,key:''};
    setAttempt(null);setBusy(false);setRecoveryReady(false);setInitializing(true);resetForm();setReload(value=>value+1);
  };
  const printAttempt=async()=>{
    if(attempt?.attempt_status!=='SUCCESS'||!attempt.order_code||printBusy)return;
    const token={...attemptSession.current},code=attempt.order_code;
    setPrintBusy(true);setPrintError('');setPrintUrl('');
    try{
      const result=await localApi.printGhnOrder(token.key,assertSessionAuth());
      if(!currentAttemptSession(token)||latestAttempt.current?.attempt_status!=='SUCCESS'||latestAttempt.current.request_key!==token.key||latestAttempt.current.order_code!==code)return;
      if(!result.success||!validPrintUrl(result.data?.printUrl))throw new Error('GHN trả liên kết in không hợp lệ. Vận đơn vẫn đã được lưu; hãy thử in lại.');
      setPrintUrl(result.data.printUrl);
    }catch(cause){if(currentAttemptSession(token))setPrintError(errorText(cause));}
    finally{if(currentAttemptSession(token))setPrintBusy(false);}
  };
  const copyCode=async()=>{
    if(attempt?.attempt_status!=='SUCCESS'||!attempt.order_code)return;
    const token={...attemptSession.current};
    try{await navigator.clipboard.writeText(attempt.order_code);if(currentAttemptSession(token))setCopyMessage('Đã sao chép mã vận đơn.');}
    catch{if(currentAttemptSession(token))setCopyMessage('Chưa sao chép được. Bạn có thể chọn và sao chép mã bên trên.');}
  };
  const updateItem=(index:number,field:keyof Item,value:string|number)=>setItems(previous=>previous.map((row,i)=>i===index?{...row,[field]:value}:row));
  const finishClose=(value:boolean)=>{
    if(!value)attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,open:false,key:''};
    const destination=pendingDestination.current;pendingDestination.current=null;
    setDiscardOpen(false);addressGeneration.current.next();quoteSession.current!.invalidate();setMatchingAddress(false);setPrintUrl('');setPrintError('');setCopyMessage('');onOpenChange(value);
    if(!value&&destination)navigate(destination);
    return true;
  };
  const changeOpen=(value:boolean)=>{
    if(!value&&(busy||unresolvedAttempt)){pendingDestination.current=null;setError('Vận đơn đang xử lý hoặc cần đối soát. Hãy kiểm tra trạng thái trước khi đóng để tránh tạo trùng.');return false;}
    if(!value&&!attempt&&initialForm.current&&initialForm.current!==formSignature){setDiscardOpen(true);return false;}
    return finishClose(value);
  };
  const cancelDiscard=()=>{pendingDestination.current=null;setDiscardOpen(false);};
  const confirmDiscard=()=>{
    if(busy||initializing||unresolvedAttempt){cancelDiscard();setError('Vận đơn đang xử lý hoặc cần đối soát, không thể bỏ bản nháp.');return false;}
    try{assertSessionAuth();}catch{return false;}
    return finishClose(false);
  };
  const openApiSettings=()=>{pendingDestination.current='/api-settings';return changeOpen(false);};
  const reloadAddress=()=>{
    attemptSession.current={...attemptSession.current,epoch:attemptSession.current.epoch+1,key:''};
    cancelAddressMatch();setProvinceId('');setDistrictId('');setWardCode('');setDistricts([]);setWards([]);
    setAutoAddress(true);setReload(value=>value+1);
  };
  const selectClass='flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base disabled:opacity-50';
  const statusMessage=attempt?.attempt_status==='REJECTED'?(attempt.message||'GHN đã từ chối yêu cầu. Kiểm tra thông tin rồi chọn “Tạo đơn mới”.'):attempt?.attempt_status==='REMOTE_CREATED'?'GHN đã có mã vận đơn. CRM đang chờ lưu hoàn tất; tải lại trạng thái để tiếp tục lưu, không tạo lại.':'Chưa xác định GHN đã tạo vận đơn hay chưa. Đối soát theo mã tham chiếu trước khi tạo tiếp. Không tạo lại trên GHN khi chưa kiểm tra.';
  const feePrerequisite=matchingAddress?'Đang nhận diện địa chỉ GHN…':dataBusy?'Đang tải cửa hàng và địa chỉ GHN…':quoteInput.error||(selectionMode==='auto'?(!autoSelectionReady?(compareBusy?'Đang so sánh mọi cửa hàng và dịch vụ…':currentComparison?.failures.length?'Chưa xác định được cửa hàng rẻ nhất vì còn lỗi. Tính lại hoặc chủ động chuyển sang chọn thủ công.':currentComparison&&!currentComparison.quotes.length?'Không có dịch vụ khả dụng cho địa chỉ này.':'Đang chuẩn bị so sánh cước…'):''):!shopId?'Chọn cửa hàng gửi để tính cước.':servicesBusy?'Đang tải dịch vụ GHN…':!selectedService?serviceError||'Chọn dịch vụ GHN để tính cước.':'');
  const selectedShop=shops.find(row=>String(row._id)===shopId);
  const addressSummary=[wards.find(row=>row.WardCode===wardCode)?.WardName,districts.find(row=>String(row.DistrictID)===districtId)?.DistrictName,provinces.find(row=>String(row.ProvinceID)===provinceId)?.ProvinceName].filter(Boolean).join(' · ');

  if(attempt?.attempt_status==='SUCCESS'&&recoveryReady&&!initializing)return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto" aria-describedby="ghn-success-description">
    <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600"/>Tạo vận đơn thành công</DialogTitle></DialogHeader>
    <p id="ghn-success-description" className="text-sm text-muted-foreground">Vận đơn đã được lưu. Sao chép mã hoặc lấy phiếu gửi A5 để in.</p>
    <div className="rounded-lg border bg-muted/30 p-4 text-center space-y-2"><p className="text-sm text-muted-foreground">Mã vận đơn GHN</p><p className="select-all break-all font-mono text-3xl font-bold tracking-wide" aria-label="Mã vận đơn GHN">{attempt.order_code}</p><Button type="button" variant="ghost" size="sm" onClick={()=>void copyCode()}><Copy className="mr-2 h-4 w-4"/>Sao chép mã</Button>{copyMessage&&<p role="status" className="text-xs text-muted-foreground">{copyMessage}</p>}</div>
    <div className="space-y-3"><Button type="button" className="w-full" disabled={printBusy} onClick={()=>void printAttempt()}>{printBusy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Printer className="mr-2 h-4 w-4"/>}{printBusy?'Đang lấy phiếu in…':printError?'Thử in lại phiếu gửi A5':'In phiếu gửi A5'}</Button>
      {printError&&<p role="alert" className="text-sm text-destructive">{printError}</p>}
      {printUrl&&<div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2"><p role="status" className="text-sm">Phiếu in đã sẵn sàng. Mở phiếu để kiểm tra và in từ trình duyệt.</p><Button type="button" asChild className="w-full"><a href={printUrl} target="_blank" rel="noopener noreferrer">Mở phiếu in A5</a></Button></div>}
      {attempt.order_code&&<a className="block text-center text-sm underline" href={'https://donhang.ghn.vn/?order_code='+encodeURIComponent(attempt.order_code)} target="_blank" rel="noopener noreferrer">Xem vận đơn trên GHN</a>}
    </div>
    <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={()=>changeOpen(false)}>Đóng</Button><Button type="button" onClick={newAttempt}>Tạo đơn mới</Button></div>
  </DialogContent></Dialog>;

  return <><Dialog open={open} onOpenChange={changeOpen}><DialogContent ref={dialogContent} onEscapeKeyDown={event=>{
    // Radix listens during document capture, before the inline picker's key handler.
    // Preserve that handler's Escape close while preventing dismissal of this dialog only.
    const active=dialogContent.current?.ownerDocument.activeElement;
    if(active&&dialogContent.current?.contains(active)&&active.matches('[data-ghn-directory-combobox="true"][aria-expanded="true"]'))event.preventDefault();
  }} className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 [&_input:not([type=radio]):not([type=checkbox])]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_button]:min-h-11 [&_label]:text-sm [&>button]:h-11 [&>button]:w-11" aria-describedby="ghn-create-description"><DialogHeader className="shrink-0 border-b p-4 pr-14 sm:px-6"><DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5"/>Tạo vận đơn GHN</DialogTitle></DialogHeader>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" aria-label="Thông tin vận đơn GHN"><div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="min-w-0 space-y-4">
    <p id="ghn-create-description" className="text-sm text-muted-foreground">Nhập địa chỉ và kiện hàng. CRM tự so sánh cước để chọn nơi gửi phù hợp; chỉ tạo vận đơn khi bạn xác nhận.</p>
    {(error||dataError||locationError||serviceError)&&<div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{[error,dataError,locationError,serviceError].filter(Boolean).join(' ')}</div>}
    {initializing&&<p className="flex gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Đang kiểm tra lượt tạo gần nhất…</p>}
    {attempt&&<div role="status" className="rounded-md border bg-muted/40 p-4 space-y-2"><p className="font-medium">{statusMessage}</p><p className="text-sm break-all">Mã tham chiếu: <span className="font-mono">{attempt.reference}</span></p>{attempt.order_code&&<p className="text-lg font-semibold">Mã vận đơn: {attempt.order_code}</p>}<div className="flex flex-wrap gap-2">{unresolved(attempt)&&<><Button variant="outline" disabled={busy} onClick={()=>void checkStatus()}>Tải lại trạng thái</Button>{attempt.attempt_status!=='REMOTE_CREATED'&&<Button variant="outline" disabled={busy} onClick={()=>void checkStatus(true)}>Đối soát GHN</Button>}</>}{attempt.order_code&&<Button variant="outline" asChild><a href={'https://donhang.ghn.vn/?order_code='+encodeURIComponent(attempt.order_code)} target="_blank" rel="noreferrer">Mở trên GHN</a></Button>}{['SUCCESS','REJECTED'].includes(attempt.attempt_status)&&<Button disabled={busy} onClick={newAttempt}>Tạo đơn mới</Button>}</div></div>}
    {prefillWarning&&<p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{prefillWarning}</p>}
    {recoveryReady&&!initializing&&attempt?.attempt_status!=='SUCCESS'&&<fieldset disabled={locked} className="space-y-5 min-w-0">
      <section className="space-y-4 rounded-lg border p-3 sm:p-4" aria-labelledby="ghn-recipient-heading"><h3 id="ghn-recipient-heading" className="font-semibold">1. Người nhận</h3>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="ghn-to-name">Tên người nhận *</Label><Input id="ghn-to-name" value={toName} onChange={event=>setToName(event.target.value)} maxLength={100} aria-invalid={Boolean(nameError)} aria-describedby={nameError?'ghn-name-error':undefined}/>{nameError&&<p id="ghn-name-error" className="text-sm text-destructive">{nameError}</p>}</div><div className="space-y-1.5"><Label htmlFor="ghn-to-phone">Số điện thoại *</Label><Input id="ghn-to-phone" inputMode="tel" value={toPhone} onChange={event=>setToPhone(event.target.value)} aria-invalid={Boolean(phoneError)} aria-describedby={phoneError?'ghn-phone-error':undefined}/>{phoneError&&<p id="ghn-phone-error" className="text-sm text-destructive">{phoneError}</p>}</div></div>
      <div className="space-y-2"><Label htmlFor="ghn-street">Địa chỉ đầy đủ của khách *</Label><Textarea id="ghn-street" rows={2} placeholder="Dán số nhà, đường, phường/xã, quận/huyện, tỉnh/thành…" value={toAddress} onChange={event=>changeAddress(event.target.value)} maxLength={500} aria-invalid={Boolean(streetError)} aria-describedby="ghn-address-help ghn-address-status ghn-street-error"/>{streetError&&<p id="ghn-street-error" className="text-sm text-destructive">{streetError}</p>}<p id="ghn-address-help" className="text-sm text-muted-foreground">Giữ nguyên địa chỉ bạn nhập; nhận diện tỉnh / quận / phường theo danh mục GHN.</p><div id="ghn-address-status" role="status" aria-live="polite" className="text-sm text-muted-foreground">{matchingAddress&&<Loader2 className="mr-1 inline h-4 w-4 animate-spin"/>}{addressMessage}</div>
        {addressHints&&addressHints.candidates.length>0&&<div className="rounded-md border bg-muted/20 p-2 space-y-1" aria-label="Gợi ý địa chỉ GHN"><p className="text-xs text-muted-foreground">{addressHints.level==='province'?'Chọn tỉnh / thành':addressHints.level==='district'?'Chọn quận / huyện tại '+addressHints.province?.ProvinceName:'Chọn phường / xã tại '+addressHints.district?.DistrictName}:</p><div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">{addressHints.candidates.slice(0,12).map(row=><Button type="button" key={row.id} variant="outline" size="sm" onClick={()=>applyHint(row.id)}>{row.label}</Button>)}</div>{addressHints.candidates.length>12&&<p className="text-xs text-muted-foreground">Gõ thêm để thu hẹp {addressHints.candidates.length} kết quả.</p>}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2"><p className="text-sm">{provinceId&&districtId&&wardCode?addressSummary:'Chưa đủ địa chỉ GHN'}</p><Button type="button" size="sm" variant="ghost" aria-expanded={manualAddress} aria-controls="ghn-manual-address" onClick={()=>{if(!manualAddress)searchAddressDirectory();setManualAddress(value=>!value);}}>{manualAddress?'Thu gọn địa chỉ GHN':'Chỉnh địa chỉ GHN'}</Button></div>
        {manualAddress&&<div id="ghn-manual-address" className="grid gap-3 rounded-md border bg-muted/10 p-3 sm:grid-cols-3"><div className="space-y-1.5"><Label htmlFor="ghn-province">Tỉnh / thành *</Label><GhnDirectorySearch id="ghn-province" label="Tỉnh / thành" value={provinceId} options={provinces.map(row=>({value:String(row.ProvinceID),label:row.ProvinceName,aliases:row.NameExtension}))} loading={dataBusy} onSearch={searchAddressDirectory} onChange={selectProvince}/></div><div className="space-y-1.5"><Label htmlFor="ghn-district">Quận / huyện GHN *</Label><GhnDirectorySearch id="ghn-district" label="Quận / huyện GHN" value={districtId} parentKey={provinceId} options={districts.map(row=>({value:String(row.DistrictID),label:row.DistrictName,aliases:row.NameExtension}))} disabled={!provinceId} loading={locationBusy} onSearch={searchAddressDirectory} onChange={selectDistrict}/></div><div className="space-y-1.5"><Label htmlFor="ghn-ward">Phường / xã GHN *</Label><GhnDirectorySearch id="ghn-ward" label="Phường / xã GHN" value={wardCode} parentKey={districtId} options={wards.map(row=>({value:row.WardCode,label:row.WardName,aliases:row.NameExtension}))} disabled={!districtId} loading={locationBusy} onSearch={searchAddressDirectory} onChange={selectWard}/></div></div>}
        {!matchingAddress&&toAddress.trim()&&<Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" disabled={dataBusy||!provinces.length} onClick={()=>{changeAddress(toAddress);setMatchRetry(value=>value+1);}}>Nhận diện lại địa chỉ</Button>}</div>
      </section>
      <section className="space-y-4 rounded-lg border p-3 sm:p-4" aria-labelledby="ghn-parcel-heading"><h3 id="ghn-parcel-heading" className="font-semibold">2. Kiện hàng đã đóng gói</h3>
      <p id="ghn-parcel-help" className="text-sm text-muted-foreground">Cân và đo cả kiện sau khi đóng gói. Đây là thông số kiện gửi, không phải kích thước từng sản phẩm.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([['weight','Khối lượng (g)',50000],['length','Dài (cm)',200],['width','Rộng (cm)',200],['height','Cao (cm)',200]] as const).map(([field,label,max])=><label key={field} className="block space-y-1.5">{label} *<Input id={'ghn-parcel-'+field} type="number" inputMode="numeric" min={1} max={max} value={parcel[field]||''} placeholder="Nhập số đo" aria-invalid={!Number.isInteger(parcel[field])||parcel[field]<1||parcel[field]>max} aria-describedby="ghn-parcel-help ghn-parcel-error" onChange={event=>setParcel(previous=>({...previous,[field]:Number(event.target.value)}))}/></label>)}</div>
      {!parcelValid&&<p id="ghn-parcel-error" className="text-sm text-destructive">Cần đủ khối lượng (1–50.000 g), dài × rộng × cao (1–200 cm), bằng số nguyên.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><h4 className="font-medium">Hàng bên trong kiện</h4><Button type="button" variant="outline" size="sm" disabled={items.length>=100} onClick={()=>setItems(previous=>[...previous,blankItem()])}><Plus className="mr-1 h-4 w-4"/>Thêm sản phẩm</Button></div>
      <p className="text-sm text-muted-foreground">Đơn nội bộ chỉ gợi ý tên kiện. Kiểm tra và khai đúng nội dung, số lượng thực gửi.</p>
      <div className="space-y-3">{items.map((row,index)=><div key={index} className="rounded-md border bg-muted/10 p-3 space-y-3"><div className="grid grid-cols-[minmax(0,1fr)_85px_auto] items-end gap-2"><label className="min-w-0 space-y-1.5">Tên sản phẩm *<Input id={'ghn-item-name-'+index} aria-label={'Tên sản phẩm '+(index+1)} placeholder="Tên sản phẩm" value={row.name} onChange={event=>updateItem(index,'name',event.target.value)} maxLength={200} aria-invalid={!row.name.trim()} aria-describedby={!row.name.trim()?'ghn-item-error-'+index:undefined}/></label><label className="space-y-1.5">Số lượng *<Input aria-label={'Số lượng sản phẩm '+(index+1)} type="number" inputMode="numeric" min={1} max={1000} value={row.quantity||''} aria-invalid={!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>1000} onChange={event=>updateItem(index,'quantity',Number(event.target.value))}/></label>{items.length>1&&<Button className="min-w-11" type="button" size="icon" variant="ghost" aria-label={'Xóa sản phẩm '+(index+1)} onClick={()=>setItems(previous=>previous.filter((_,i)=>i!==index))}><X className="h-4 w-4"/></Button>}</div>{!row.name.trim()&&<p id={'ghn-item-error-'+index} className="text-sm text-destructive">Nhập tên sản phẩm thực gửi.</p>}
      <details open={itemPhysicalError?true:undefined} className="rounded-md border bg-background p-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Thông số từng sản phẩm GHN yêu cầu *</summary><p id={'ghn-item-physical-help-'+index} className="mb-3 text-sm text-muted-foreground">Nhập khối lượng và kích thước của 1 sản phẩm trong dòng này. Không chia đều hoặc tự suy ra từ kiện. GHN có thể dùng thông số này khi tính cước từng dịch vụ.</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([['weight','Khối lượng (g)'],['length','Dài (cm)'],['width','Rộng (cm)'],['height','Cao (cm)']] as const).map(([field,label])=><label key={field} className="block space-y-1.5">{label}<Input aria-label={label+' sản phẩm '+(index+1)} type="number" inputMode="numeric" min={1} max={field==='weight'?50000:200} value={row[field]||''} placeholder="Nhập thực tế" aria-invalid={!Number.isInteger(row[field])||row[field]<1||row[field]>(field==='weight'?50000:200)} aria-describedby={'ghn-item-physical-help-'+index} onChange={event=>updateItem(index,field,Number(event.target.value))}/></label>)}</div></details></div>)}</div>
      </section>
      <section className="space-y-4 rounded-lg border p-3 sm:p-4" aria-labelledby="ghn-payment-heading"><h3 id="ghn-payment-heading" className="font-semibold">3. Thu hộ & người trả cước</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm space-y-1.5 block">Thu hộ COD (đ)<Input id="ghn-cod" type="number" inputMode="numeric" min={0} max={50000000} value={cod} aria-invalid={!Number.isSafeInteger(cod)||cod<0||cod>50000000} aria-describedby="ghn-cod-help" onChange={event=>setCod(Number(event.target.value))}/><span id="ghn-cod-help" className="block text-sm text-muted-foreground">Tiền hàng GHN thu từ người nhận; không bao gồm cước vận chuyển.</span></label><label className="text-sm space-y-1.5 block">Bên trả cước<select id="ghn-payment" className={selectClass} value={payment} onChange={event=>setPayment(event.target.value)}><option value="1">Người gửi trả cước</option><option value="2">Người nhận trả cước</option></select></label><label className="text-sm space-y-1.5 block">Giá trị bảo hiểm (đ)<Input id="ghn-insurance" type="number" inputMode="numeric" min={0} max={5000000} value={insurance} aria-invalid={!Number.isSafeInteger(insurance)||insurance<0||insurance>5000000} onChange={event=>setInsurance(Number(event.target.value))}/></label></div>
      </section>
      <section className="rounded-lg border p-3 sm:p-4 space-y-3" aria-labelledby="ghn-rates-heading" aria-label="So sánh cước cửa hàng GHN">
        <h3 id="ghn-rates-heading" className="font-semibold">4. Cửa hàng gửi & cước</h3>
        <div role="radiogroup" aria-label="Cách chọn cửa hàng gửi" className="grid gap-2 sm:grid-cols-2">
          <label className={'flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm '+(selectionMode==='auto'?'border-primary bg-primary/5':'')}><input type="radio" name="ghn-selection-mode" className="mt-0.5" checked={selectionMode==='auto'} onChange={()=>changeSelectionMode('auto')}/><span><strong className="block">Tự chọn cước thấp nhất</strong><span className="text-xs text-muted-foreground">So sánh toàn bộ {shops.length} cửa hàng đã cấu hình.</span></span></label>
          <label className={'flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm '+(selectionMode==='manual'?'border-primary bg-primary/5':'')}><input type="radio" name="ghn-selection-mode" className="mt-0.5" checked={selectionMode==='manual'} onChange={()=>changeSelectionMode('manual')}/><span><strong className="block">Tôi chọn thủ công</strong><span className="text-xs text-muted-foreground">Giữ cửa hàng và dịch vụ do bạn chọn.</span></span></label>
        </div>
        {selectionMode==='manual'&&<div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span>Cửa hàng gửi</span><select id="ghn-create-shop" aria-label="Cửa hàng gửi" className={selectClass} value={shopId} onChange={event=>setShopId(event.target.value)} disabled={dataBusy||!shops.length}><option value="">{dataBusy?'Đang tải cửa hàng…':'Chọn cửa hàng'}</option>{shops.map(row=><option key={row._id} value={row._id}>{row.name} · {row._id}</option>)}</select></label><label className="space-y-1.5 text-sm"><span>Dịch vụ GHN</span><select className={selectClass} value={serviceChoice} disabled={servicesBusy||!services.length} onChange={event=>setServiceChoice(event.target.value)}><option value="">{servicesBusy?'Đang tải dịch vụ…':'Chọn dịch vụ'}</option>{services.map(row=><option key={ghnServiceChoiceKey(row)} value={ghnServiceChoiceKey(row)}>{row.short_name} · loại {row.service_type_id}</option>)}</select></label></div>}
        {selectedShop&&(selectionMode==='manual'||autoSelectionReady)&&<div className="space-y-1 rounded-md border border-primary/20 bg-primary/5 p-3" aria-label="Cửa hàng và dịch vụ được chọn"><p className="text-sm font-semibold">{selectedShop.name} · {selectedShop._id}</p><p className="text-sm">Lấy hàng tại: {selectedShop.address}</p><p className="text-xs text-muted-foreground">{selectedService?`${selectedService.short_name} · loại ${selectedService.service_type_id} · #${selectedService.service_id}`:'Chưa chọn dịch vụ'}{fee!==null?` · ${money(fee)}`:''}</p></div>}
        <p className="text-xs text-amber-700 dark:text-amber-400">Tự chọn có thể đổi cửa hàng và địa chỉ GHN đến lấy hàng. Hãy kiểm tra điểm lấy hàng trước khi tạo.</p>
        {compareBusy&&<p role="status" className="text-sm">Đang tính cước tất cả cửa hàng và dịch vụ. Chờ hoàn tất để chọn kết quả hoặc tạo vận đơn.</p>}
        {compareError&&<p role="alert" className="text-sm text-destructive">{compareError} Bấm Tính lại cước để thử lại.</p>}
        {currentComparison&&<>
          <p role="status" className="text-sm">{currentComparison.quotes.length?`${currentComparison.quotes.length} báo giá. ${currentComparison.failures.length?'Chỉ có kết quả một phần, chưa xác định thấp nhất toàn bộ. Chế độ tự động chưa cho tạo vận đơn.':selectionMode==='auto'?'Đã tự chọn cước thấp nhất trong các dịch vụ khả dụng.':'Đã so sánh xong; cửa hàng chỉ đổi khi bạn chọn.'}`:'Chưa có báo giá thành công. Kiểm tra kết quả rồi tính lại cước.'}</p>
          {currentComparison.quotes.length>0&&<Button type="button" variant="link" size="sm" className="h-auto p-0" aria-expanded={showAllQuotes} aria-controls="ghn-all-quotes" onClick={()=>setShowAllQuotes(value=>!value)}>{showAllQuotes?'Thu gọn bảng cước':`Xem ${currentComparison.quotes.length} mức cước`}</Button>}
          {showAllQuotes&&currentComparison.quotes.length>0&&<div id="ghn-all-quotes" className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2 pr-3">Cửa hàng / địa chỉ lấy hàng</th><th className="py-2 pr-3">Dịch vụ</th><th className="py-2 pr-3">Tổng cước dự kiến</th>{selectionMode==='manual'&&<th className="py-2">Lựa chọn</th>}</tr></thead><tbody>{currentComparison.quotes.map(row=>{
            const chosen=shopId===String(row.shop._id)&&selectedService?.service_id===row.service.service_id&&selectedService?.service_type_id===row.service.service_type_id;
            return <tr key={`${row.shop._id}:${ghnServiceChoiceKey(row.service)}`} className="border-b align-top"><td className="py-2 pr-3 min-w-40"><p className="font-medium">{row.shop.name} · {row.shop._id}</p><p className="text-xs text-muted-foreground">{row.shop.address}</p></td><td className="py-2 pr-3">{row.service.short_name}<p className="text-xs text-muted-foreground">Loại {row.service.service_type_id} · #{row.service.service_id}</p></td><td className="py-2 pr-3 whitespace-nowrap"><strong>{money(row.total)}</strong>{row.total===currentComparison.quotes[0].total&&<p className="text-xs text-primary">{currentComparison.failures.length?'Thấp nhất đã tính':'Thấp nhất'}</p>}</td>{selectionMode==='manual'&&<td className="py-2"><Button type="button" size="sm" variant={chosen?'secondary':'outline'} disabled={compareBusy||chosen} aria-label={`Chọn cửa hàng ${row.shop._id}, dịch vụ ${row.service.service_id}, loại ${row.service.service_type_id}`} onClick={()=>chooseQuote(row)}>{chosen?'Đang chọn':'Chọn'}</Button></td>}</tr>;
          })}</tbody></table></div>}
          {currentComparison.noServices.map(shop=><p key={shop._id} className="text-sm">{shop.name} · {shop._id} — {shop.address}: Không có dịch vụ loại 2/5 khả dụng cho tuyến này.</p>)}
          {currentComparison.failures.map((row,index)=><p key={`${row.shop._id}:${index}`} className="text-sm text-destructive">{row.shop.name} · {row.shop._id} — {row.shop.address}{row.service?` · ${row.service.short_name}`:''}: {row.message} Bấm Tính lại cước để thử lại.</p>)}
        </>}
        {selectionMode==='manual'&&<Button type="button" variant="outline" size="sm" disabled={compareBusy||matchingAddress||dataBusy||!shops.length||!quoteInput.snapshot} onClick={()=>void compareQuotes()}>{compareBusy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}So sánh cước các cửa hàng</Button>}
      </section>
      <details className="rounded-lg border p-3 sm:p-4"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Tùy chọn giao hàng & cấu hình</summary><div className="mt-4 space-y-4"><label className="text-sm space-y-1.5 block">Lưu ý giao hàng<select className={selectClass} value={requiredNote} onChange={event=>setRequiredNote(event.target.value)}><option value="KHONGCHOXEMHANG">Không cho xem hàng</option><option value="CHOXEMHANGKHONGTHU">Cho xem, không cho thử</option><option value="CHOTHUHANG">Cho thử hàng</option></select></label><label className="text-sm space-y-1.5 block">Ghi chú<Textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={1000} rows={2}/></label><div className="flex flex-wrap items-center gap-3 border-t pt-3"><Button type="button" variant="link" disabled={busy||initializing||unresolvedAttempt} onClick={openApiSettings}>Cài đặt API</Button><Button type="button" size="sm" variant="outline" disabled={busy||initializing||dataBusy||unresolved(attempt)} onClick={reloadAddress}><RefreshCw className="mr-2 h-4 w-4"/>Tải lại cửa hàng / địa chỉ</Button></div></div></details>
    </fieldset>}
    </div>
    {recoveryReady&&!attempt&&<aside id="ghn-review" className="space-y-4 rounded-lg border bg-muted/20 p-4 lg:sticky lg:top-0" aria-label="Kiểm tra trước khi tạo"><h3 className="font-semibold">Kiểm tra trước khi tạo</h3><dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">Người nhận</dt><dd className="break-words font-medium">{toName||'Chưa nhập'} · {toPhone||'Chưa có SĐT'}</dd></div><div><dt className="text-muted-foreground">Kiện đã đóng gói</dt><dd>{parcelValid?`${parcel.weight.toLocaleString('vi-VN')} g · ${parcel.length} × ${parcel.width} × ${parcel.height} cm`:'Chưa đủ số cân / đo'}</dd></div><div><dt className="text-muted-foreground">Thu hộ COD</dt><dd className="font-semibold">{money(cod)}</dd></div><div><dt className="text-muted-foreground">Bên trả cước</dt><dd className="font-semibold">{payment==='2'?'Người nhận trả cước':'Người gửi trả cước'}</dd></div><div className="rounded-md border border-primary/20 bg-primary/5 p-3"><dt className="font-medium">GHN đến lấy hàng tại</dt><dd className="mt-1 break-words">{selectedShop&&(selectionMode==='manual'||autoSelectionReady)?<><strong>{selectedShop.name}</strong><p className="mt-1">{selectedShop.address}</p><p className="mt-1 text-muted-foreground">{selectedService?.short_name}</p></>:'Chờ chọn cửa hàng và dịch vụ'}</dd></div><div><dt className="text-muted-foreground">{selectionMode==='auto'?'Cước thấp nhất dự kiến':'Cước dự kiến'}</dt><dd className="text-xl font-bold text-primary">{feeBusy||compareBusy?'Đang tính…':fee===null||!autoSelectionReady?'Chưa có':money(fee)}</dd></div></dl>
      <Button type="button" className="w-full" size="sm" variant="outline" disabled={locked||matchingAddress||dataBusy||feeBusy||compareBusy||!quoteInput.snapshot||!shops.length||(selectionMode==='manual'&&(!shopId||!selectedService))} onClick={refreshQuote}><RefreshCw className="mr-1 h-4 w-4"/>Tính lại cước</Button>
      {feeError&&<p role="alert" className="text-sm text-destructive">{feeError} Bấm tính lại cước để thử lại.</p>}
      {feePrerequisite&&<p role="status" className="text-sm text-muted-foreground">{feePrerequisite}</p>}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 text-sm"><input id="ghn-pickup-confirm" type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={locked||!reviewKey} checked={pickupConfirmed} onChange={event=>setPickupConsent(event.target.checked?reviewKey:'')}/><span>Tôi đã kiểm tra điểm lấy hàng, COD và bên trả cước.</span></label><p className="text-sm text-muted-foreground">Cước dự kiến; GHN có thể điều chỉnh sau khi cân, đo thực tế.</p>
    </aside>}
    </div></div>
    {recoveryReady?<div className="shrink-0 space-y-2 border-t bg-background p-3 sm:px-6" aria-label="Cước và thao tác vận đơn GHN">
      {!attempt&&<div className="flex items-center justify-between gap-2"><p className="text-sm">Cước: <strong>{feeBusy||compareBusy?'Đang tính…':fee===null||!autoSelectionReady?'Chưa có':money(fee)}</strong></p>{(createValidationError||!pickupConfirmed)&&<Button type="button" size="sm" variant="ghost" disabled={locked} onClick={()=>{
        if(!provinceId||!districtId||!wardCode)setManualAddress(true);
        requestAnimationFrame(()=>{const target=dialogContent.current?.querySelector<HTMLElement>('[aria-invalid="true"]')||dialogContent.current?.querySelector<HTMLElement>(!provinceId?'#ghn-province':!districtId?'#ghn-district':!wardCode?'#ghn-ward':'#ghn-pickup-confirm');target?.scrollIntoView({block:'center',behavior:'smooth'});target?.focus();});
      }}>{createValidationError?'Hoàn tất thông tin':'Kiểm tra & xác nhận'}</Button>}</div>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>changeOpen(false)}>Đóng</Button>{!attempt&&<Button className="min-w-40" disabled={!recoveryReady||locked||matchingAddress||dataBusy||feeBusy||compareBusy||!autoSelectionReady||fee===null||!quoteInput.snapshot||!selectedService||Boolean(createValidationError)||!pickupConfirmed} onClick={()=>void submit()}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{busy?'Đang tạo…':'Tạo vận đơn'}</Button>}</div>
    </div>:<div className="flex shrink-0 justify-end gap-2 border-t p-4 sm:px-6">{!initializing&&<Button type="button" variant="outline" onClick={reloadAddress}>Thử tải lại</Button>}<Button type="button" variant="outline" onClick={()=>changeOpen(false)}>Đóng</Button></div>}
  </DialogContent></Dialog><AlertDialog open={discardOpen} onOpenChange={value=>{if(!value)cancelDiscard();}}><AlertDialogContent className="w-[calc(100%-2rem)] max-w-md"><AlertDialogHeader><AlertDialogTitle>Bỏ bản nháp vận đơn?</AlertDialogTitle><AlertDialogDescription>Thông tin bạn vừa nhập chưa được tạo thành vận đơn. Chọn tiếp tục nhập để giữ lại, hoặc bỏ bản nháp để rời khỏi biểu mẫu.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter className="gap-2"><AlertDialogCancel className="min-h-11" onClick={cancelDiscard}>Tiếp tục nhập</AlertDialogCancel><AlertDialogAction className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={event=>{event.preventDefault();confirmDiscard();}}>Bỏ bản nháp</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
