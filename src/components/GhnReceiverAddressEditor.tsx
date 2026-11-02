import {useState} from 'react';
import {GhnReceiverAddressDialog,type GhnReceiverAddress} from './GhnReceiverAddressDialog';
import {GhnNewReceiverAddressDialog,type GhnNewReceiver} from './GhnNewReceiverAddressDialog';
import type {GhnAddressMode} from './GhnAddressModeSwitch';
import type {GhnProvince} from '@/lib/ghn-address-match';

export type GhnReceiverAddressSelection={mode:'OLD3';value:GhnReceiverAddress}|{mode:'NEW2';value:GhnNewReceiver};
type Props={initialMode:GhnAddressMode;oldAddress:GhnReceiverAddress;newAddress:GhnNewReceiver;provinces:GhnProvince[];read:<T>(action:string,body?:Record<string,unknown>)=>Promise<T>;onCancel:()=>void;onCommit:(selection:GhnReceiverAddressSelection)=>void};

/** One edit transaction. Switching systems never changes the committed address. */
export function GhnReceiverAddressEditor({initialMode,oldAddress,newAddress,provinces,read,onCancel,onCommit}:Props){
  const [mode,setMode]=useState(initialMode);
  const [oldDraft,setOldDraft]=useState(()=>({...oldAddress}));
  const [newDraft,setNewDraft]=useState(()=>({...newAddress}));
  const switchFromOld=(value:GhnReceiverAddress)=>{
    setOldDraft(value);
    setNewDraft(previous=>previous.address===value.address?previous:{address:value.address,provinceId:'',wardId:'',provinceName:'',wardName:''});
    setMode('NEW2');
  };
  const switchFromNew=(value:GhnNewReceiver)=>{
    setNewDraft(value);
    setOldDraft(previous=>previous.address===value.address?previous:{address:value.address,provinceId:'',districtId:'',wardCode:'',districts:[],wards:[]});
    setMode('OLD3');
  };
  return mode==='OLD3'
    ?<GhnReceiverAddressDialog initial={oldDraft} provinces={provinces} read={read} onSwitchMode={switchFromOld} onCancel={onCancel} onCommit={value=>onCommit({mode:'OLD3',value})}/>
    :<GhnNewReceiverAddressDialog initial={newDraft} read={read} onSwitchMode={switchFromNew} onCancel={onCancel} onCommit={value=>onCommit({mode:'NEW2',value})}/>;
}
