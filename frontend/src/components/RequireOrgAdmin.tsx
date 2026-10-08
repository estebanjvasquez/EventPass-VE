import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { resolveActiveOrg } from "../lib/activeOrg";
import { supabase } from "../lib/supabase";

export default function RequireOrgAdmin({children}:{children:ReactNode}){
  const [state,setState]=useState<"loading"|"allowed"|"denied">("loading");
  useEffect(()=>{let active=true;void Promise.all([resolveActiveOrg(),supabase.rpc("is_platform_admin")]).then(([organization,platform])=>{if(!active)return;setState(platform.data===true||organization?.role==="owner"||organization?.role==="admin"?"allowed":"denied")});return()=>{active=false}},[]);
  if(state==="loading")return <div className="grid min-h-64 place-items-center text-sm text-zinc-500">Comprobando permisos…</div>;
  if(state==="denied")return <div className="grid min-h-[60dvh] place-items-center p-5 text-center"><section className="max-w-md rounded-2xl border bg-white p-7"><h1 className="text-xl font-bold">Acceso administrativo requerido</h1><p className="mt-2 text-sm text-zinc-600">Este módulo configura recursos compartidos de la organización y está disponible para propietarios y administradores.</p><Link to="/admin/acreditacion" className="mt-5 inline-flex rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Ir a acreditación</Link></section></div>;
  return children;
}
