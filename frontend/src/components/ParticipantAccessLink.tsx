import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
export default function ParticipantAccessLink({ token, eventId, programId }: { token?: string | null; eventId?: string; programId?: string }) {
  const navigate = useNavigate();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string | null>(null);
  async function open() {
    if (!token) return;
    setBusy(true); setError(null);
    try {
      const result = await supabase.rpc('create_registration_access',{p_credential_token:token});
      if (result.error || typeof result.data !== 'string') { setError(result.error?.message ?? 'No se pudo abrir el registro.'); return; }
      sessionStorage.setItem('participant_access',result.data);
      navigate('/mi-registro');
    } catch { setError('No se pudo conectar. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }
  const params = eventId ? `?evento=${encodeURIComponent(eventId)}` : programId ? `?programa=${encodeURIComponent(programId)}` : '';
  return <div className="mt-4 text-sm">{token && <button type="button" disabled={busy} onClick={()=>void open()} className="mr-4 font-semibold text-emerald-700 underline disabled:opacity-50">{busy?'Abriendo…':'Consultar mi registro'}</button>}<Link to={`/recuperar-registro${params}`} className="font-semibold text-emerald-700 underline">Recuperar mi credencial</Link>{error && <p role="alert" className="mt-2 text-red-700">{error}</p>}</div>;
}
