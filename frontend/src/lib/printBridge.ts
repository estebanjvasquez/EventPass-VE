const BRIDGE_URL_KEY='eventosfacil.printBridgeUrl'
const BRIDGE_TOKEN_KEY='eventosfacil.printBridgeToken'
const PRINTER_KEY='eventosfacil.printerName'
const STATION_KEY='eventosfacil.stationLabel'
const PROFILE_KEY='eventosfacil.printProfile'

export type PrintCalibration={name:string;offsetXmm:number;offsetYmm:number;scalePercent:number;duplexMode:'simplex'|'long-edge'|'short-edge';copies:number}
export type BridgeConfig={url:string;token:string;printer:string;station:string;profile:PrintCalibration}
export type BridgePrinter={name:string;isDefault:boolean;offline?:boolean;statusCode?:number;jobCount?:number}
export type BridgeJob={id:string;status:'queued'|'printing'|'spooled'|'failed'|'cancelled';error?:string;payloadHash?:string;priority?:number;test?:boolean}

const defaultProfile:PrintCalibration={name:'Perfil local',offsetXmm:0,offsetYmm:0,scalePercent:100,duplexMode:'simplex',copies:1}
export function loadBridgeConfig():BridgeConfig{let profile=defaultProfile;try{profile={...defaultProfile,...JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}')}}catch{/* Conserva valores seguros. */}return{url:localStorage.getItem(BRIDGE_URL_KEY)||'http://127.0.0.1:18181',token:localStorage.getItem(BRIDGE_TOKEN_KEY)||'',printer:localStorage.getItem(PRINTER_KEY)||'',station:localStorage.getItem(STATION_KEY)||'Mostrador principal',profile}}
export function saveBridgeConfig(config:BridgeConfig){localStorage.setItem(BRIDGE_URL_KEY,config.url.replace(/\/$/,''));localStorage.setItem(BRIDGE_TOKEN_KEY,config.token);localStorage.setItem(PRINTER_KEY,config.printer);localStorage.setItem(STATION_KEY,config.station);localStorage.setItem(PROFILE_KEY,JSON.stringify(config.profile))}
async function request<T>(config:BridgeConfig,path:string,init?:RequestInit):Promise<T>{
  const controller=new AbortController()
  const timeout=window.setTimeout(()=>controller.abort(),8000)
  try{
    const response=await fetch(`${config.url.replace(/\/$/,'')}${path}`,{...init,signal:controller.signal,headers:{'Content-Type':'application/json','X-Bridge-Token':config.token,...init?.headers}})
    if(!response.ok){const value=await response.json().catch(()=>({error:`Bridge respondió ${response.status}`})) as {error?:string};throw new Error(value.error||`Bridge respondió ${response.status}`)}
    return response.json() as Promise<T>
  }catch(error){
    if(error instanceof DOMException&&error.name==='AbortError')throw new Error('El bridge no respondió en 8 segundos. Reinicia el servicio local.')
    if(error instanceof TypeError)throw new Error('No se pudo comunicar con el bridge local. Verifica que la ventana siga abierta.')
    throw error
  }finally{window.clearTimeout(timeout)}
}
export async function bridgeHealth(config:BridgeConfig){return request<{ok:boolean;version:string;queue:number;uptimeSeconds?:number}>(config,'/v1/health')}
export async function bridgePrinters(config:BridgeConfig){return request<{printers:BridgePrinter[]}>(config,'/v1/printers')}
export async function submitBridgeJob(config:BridgeConfig,input:{cloudJobId:string;printer:string;title:string;pngDataUrls:string[];widthMm:number;heightMm:number;copies?:number;priority?:number;test?:boolean}){return request<BridgeJob>(config,'/v1/jobs',{method:'POST',body:JSON.stringify({...input,copies:input.copies??config.profile.copies,profile:config.profile})})}
export async function getBridgeJob(config:BridgeConfig,id:string){return request<BridgeJob>(config,`/v1/jobs/${encodeURIComponent(id)}`)}
export async function cancelBridgeJob(config:BridgeConfig,id:string){return request<BridgeJob>(config,`/v1/jobs/${encodeURIComponent(id)}/cancel`,{method:'POST'})}
export async function prioritizeBridgeJob(config:BridgeConfig,id:string){return request<BridgeJob>(config,`/v1/jobs/${encodeURIComponent(id)}/prioritize`,{method:'POST'})}
