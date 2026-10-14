import {useEffect,useRef} from 'react'
import {ensureStationSync,reconcileStationPrintJobs} from '../../lib/badgePrintWorkflow'
import type {BridgeConfig} from '../../lib/printBridge'

export function usePrintReconciliation(eventId:string,config:BridgeConfig,connected:boolean,onChange:()=>void,onError:(message:string)=>void){
  const callbacks=useRef({onChange,onError});callbacks.current={onChange,onError}
  useEffect(()=>{
    if(!connected||!eventId)return
    let disposed=false,running=false
    const run=async()=>{
      if(running)return;running=true
      try{await ensureStationSync(config,eventId);const changed=await reconcileStationPrintJobs(config);if(!disposed&&changed)callbacks.current.onChange()}
      catch(error){if(!disposed)callbacks.current.onError(error instanceof Error?error.message:'No se pudo sincronizar la cola de esta estación.')}
      finally{running=false}
    }
    void run();const timer=window.setInterval(()=>void run(),5000)
    return()=>{disposed=true;window.clearInterval(timer)}
  },[config,eventId,connected])
}
