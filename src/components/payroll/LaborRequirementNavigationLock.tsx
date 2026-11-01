import {useEffect} from 'react';
import {useBlocker} from 'react-router-dom';

/** Keep the editor mounted; its own close/discard controls release the lock. */
export default function LaborRequirementNavigationLock({locked}:{locked:boolean}){
 const blocker=useBlocker(locked);
 useEffect(()=>{if(blocker.state==='blocked')blocker.reset();},[blocker]);
 return null;
}
