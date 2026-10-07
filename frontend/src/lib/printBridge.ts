const BRIDGE_URL_KEY='eventosfacil.printBridgeUrl'
const BRIDGE_TOKEN_KEY='eventosfacil.printBridgeToken'
const PRINTER_KEY='eventosfacil.printerName'
const STATION_KEY='eventosfacil.stationLabel'

export type BridgeConfig={url:string;token:string;printer:string;station:string}
export type BridgePrinter={name:string;isDefault:boolean}
export type BridgeJob={id:string;status:'queued'|'printing'|'spooled'|'failed';error?:string;payloadHash?:string}

export function loadBridgeConfig():BridgeConfig{return{url:localStorage.getItem(BRIDGE_URL_KEY)||'http://127.0.0.1:18181',token:localStorage.getItem(BRIDGE_TOKEN_KEY)||'',printer:localStorage.getItem(PRINTER_KEY)||'',station:localStorage.getItem(STATION_KEY)||'Mostrador principal'}}
export function saveBridgeConfig(config:BridgeConfig){localStorage.setItem(BRIDGE_URL_KEY,config.url.replace(/\/$/,''));localStorage.setItem(BRIDGE_TOKEN_KEY,config.token);localStorage.setItem(PRINTER_KEY,config.printer);localStorage.setItem(STATION_KEY,config.station)}
async function request<T>(config:BridgeConfig,path:string,init?:RequestInit):Promise<T>{const response=await fetch(`${config.url.replace(/\/$/,'')}${path}`,{...init,headers:{'Content-Type':'application/json','X-Bridge-Token':config.token,...init?.headers}});if(!response.ok){const value=await response.json().catch(()=>({error:`Bridge respondió ${response.status}`})) as {error?:string};throw new Error(value.error||`Bridge respondió ${response.status}`)}return response.json() as Promise<T>}
export async function bridgeHealth(config:BridgeConfig){return request<{ok:boolean;version:string;queue:number}>(config,'/v1/health')}
export async function bridgePrinters(config:BridgeConfig){return request<{printers:BridgePrinter[]}>(config,'/v1/printers')}
export async function submitBridgeJob(config:BridgeConfig,input:{cloudJobId:string;printer:string;title:string;pngDataUrl:string;widthMm:number;heightMm:number;copies?:number}){return request<BridgeJob>(config,'/v1/jobs',{method:'POST',body:JSON.stringify(input)})}
export async function getBridgeJob(config:BridgeConfig,id:string){return request<BridgeJob>(config,`/v1/jobs/${encodeURIComponent(id)}`)}
