import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
async function preference(token:string,share?:boolean) {
  const session=sessionStorage.getItem('participant_access')??''
  const response=await fetch(`${import.meta.env.VITE_API_URL}/api/participant/consent`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session}`},body:JSON.stringify({credential_token:token,...(share===undefined?{}:{share})})})
  const data=await response.json() as {share_with_exhibitors?:boolean;error?:string}
  if(!response.ok)throw new Error(data.error??'No se pudo consultar el permiso.')
  return data
}
export default function ExhibitorConsent({token}:{token:string}) {
  const [allowed,setAllowed]=useState(false)
  const [busy,setBusy]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{let active=true;setBusy(true);void preference(token).then(data=>{if(active)setAllowed(Boolean(data.share_with_exhibitors))}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[token])
  async function change(value:boolean){setBusy(true);setError('');try{await preference(token,value);setAllowed(value)}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el permiso.')}finally{setBusy(false)}}
  return <section className="my-5 rounded-xl border bg-white p-4 text-sm print:hidden"><h2 className="font-semibold">Privacidad al visitar stands</h2><p className="my-2">Los expositores que escaneen tu credencial pueden registrar la visita. Tú decides si además reciben tu nombre, empresa, cargo y correo para contacto profesional. Puedes retirar el permiso aquí; no elimina copias ya descargadas.</p><label className="flex gap-2"><input type="checkbox" disabled={busy||!!error} checked={allowed} onChange={e=>void change(e.target.checked)}/>Autorizo compartir mi perfil con los expositores que escaneen mi credencial.</label>{error&&<p role="alert" className="mt-2 text-red-700">{error} <Link to="/recuperar-registro" className="underline">Verificar mi correo</Link></p>}</section>
}
