export function commercialStatusLabel(state:string){
  return ({trial:'Prueba de 14 días',active:'Contrato vigente',legacy:'Condiciones anteriores preservadas',event_only:'Contrato por evento',read_only:'Sólo lectura; renovación pendiente',suspended:'Suspendida'} as Record<string,string>)[state]??'Consultando'
}
