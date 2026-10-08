import QRCode from 'qrcode'

export type BadgeField = 'full_name' | 'first_name' | 'last_name' | 'company' | 'job_title' | 'identification' | 'participation_type' | 'event_name' | 'organization_name' | 'seat' | 'qr'
export type BadgeElement = {
  id: string
  kind: 'field' | 'text' | 'image' | 'rect'
  field?: BadgeField
  text?: string
  src?: string
  x: number
  y: number
  width: number
  height: number
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  color?: string
  backgroundColor?: string
  align?: 'left' | 'center' | 'right'
  radius?: number
  rotation?: number
}
export type BadgeLayout = { version: 1; elements: BadgeElement[] }
export type BadgeTemplateV2 = {
  id?: string
  participation_type: string
  name: string
  size_key: string
  primary_color: string
  background_color: string
  text_color: string
  header_text: string
  footer_text: string
  show_company: boolean
  show_job_title: boolean
  show_identification: boolean
  show_qr: boolean
  width_mm: number
  height_mm: number
  dpi: number
  double_sided: boolean
  layout: BadgeLayout
  back_layout: BadgeLayout
  template_status: 'draft' | 'published' | 'archived'
  version: number
}
export type BadgeRenderData = {
  first_name: string
  last_name?: string | null
  company?: string | null
  job_title?: string | null
  cedula?: string | null
  participation_type: string
  event_name: string
  organization_name: string
  seat_label?: string | null
  credential_token: string
  logo_url?: string | null
}

const id = () => crypto.randomUUID()
export function defaultBadgeLayout(width = 100, height = 60, color = '#047857'): BadgeLayout {
  return { version: 1, elements: [
    { id:id(),kind:'rect',x:0,y:0,width,height:7,backgroundColor:color },
    { id:id(),kind:'rect',x:0,y:height-2,width,height:2,backgroundColor:color },
    { id:id(),kind:'field',field:'organization_name',x:5,y:10,width:90,height:5,fontSize:3.4,fontWeight:'bold',color,align:'center' },
    { id:id(),kind:'field',field:'event_name',x:5,y:15,width:90,height:4,fontSize:2.7,color:'#52525b',align:'center' },
    { id:id(),kind:'field',field:'full_name',x:5,y:22,width:65,height:12,fontSize:7,fontWeight:'bold',color:'#18181b',align:'left' },
    { id:id(),kind:'field',field:'participation_type',x:5,y:36,width:42,height:6,fontSize:3.2,fontWeight:'bold',color:'#ffffff',backgroundColor:color,align:'center',radius:1.5 },
    { id:id(),kind:'field',field:'company',x:5,y:44,width:64,height:5,fontSize:3.3,fontWeight:'bold',color:'#27272a' },
    { id:id(),kind:'field',field:'job_title',x:5,y:50,width:64,height:4,fontSize:2.8,color:'#52525b' },
    { id:id(),kind:'field',field:'qr',x:73,y:24,width:22,height:22 },
  ] }
}

export function normalizeBadgeLayout(template: BadgeTemplateV2): BadgeLayout {
  if (template.layout?.elements?.length) return template.layout
  return defaultBadgeLayout(Number(template.width_mm || 100),Number(template.height_mm || 60),template.primary_color)
}

export const BADGE_FIELD_LABELS: Record<BadgeField,string> = {
  full_name:'Nombre completo',first_name:'Nombre',last_name:'Apellido',company:'Empresa',job_title:'Cargo',identification:'Identificación',participation_type:'Tipo de participante',event_name:'Evento',organization_name:'Organización',seat:'Asiento',qr:'Código QR'
}

function fieldValue(field: BadgeField | undefined, data: BadgeRenderData) {
  if (!field) return ''
  const values: Record<BadgeField,string> = {
    full_name:`${data.first_name} ${data.last_name ?? ''}`.trim(),first_name:data.first_name,last_name:data.last_name ?? '',company:data.company ?? '',job_title:data.job_title ?? '',identification:data.cedula ?? '',participation_type:data.participation_type,event_name:data.event_name,organization_name:data.organization_name,seat:data.seat_label ? `Asiento ${data.seat_label}` : '',qr:''
  }
  return values[field]
}

const mmToPx = (mm:number,dpi:number) => Math.round(mm*dpi/25.4)
async function loadImage(src:string) {
  const image = new Image()
  image.crossOrigin='anonymous'
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('No se pudo cargar una imagen de la plantilla.'));image.src=src})
  return image
}

export async function renderBadgePng(template: BadgeTemplateV2,data: BadgeRenderData,side:'front'|'back'='front') {
  const dpi=Math.min(Math.max(Number(template.dpi)||300,150),600)
  const width=Number(template.width_mm)||100
  const height=Number(template.height_mm)||60
  const scale=dpi/25.4
  const canvas=document.createElement('canvas')
  canvas.width=mmToPx(width,dpi);canvas.height=mmToPx(height,dpi)
  const ctx=canvas.getContext('2d')
  if(!ctx) throw new Error('El navegador no pudo preparar la credencial.')
  ctx.fillStyle=template.background_color||'#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height)
  const layout=side==='back'?template.back_layout:normalizeBadgeLayout(template)
  for(const element of layout.elements){
    const x=element.x*scale,y=element.y*scale,w=element.width*scale,h=element.height*scale
    ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate((element.rotation??0)*Math.PI/180);ctx.translate(-(x+w/2),-(y+h/2))
    if(element.kind==='rect'){
      ctx.fillStyle=element.backgroundColor||template.primary_color;ctx.beginPath();ctx.roundRect(x,y,w,h,(element.radius??0)*scale);ctx.fill()
    } else if(element.kind==='image'&&element.src){
      try{const image=await loadImage(element.src);ctx.drawImage(image,x,y,w,h)}catch{/* La vista continua aunque falle un recurso externo. */}
    } else if(element.field==='qr'){
      const value=`${window.location.origin}/credencial/${encodeURIComponent(data.credential_token)}`
      const qrUrl=await QRCode.toDataURL(value,{errorCorrectionLevel:'M',margin:0,width:Math.max(Math.round(Math.min(w,h)),128)})
      const image=await loadImage(qrUrl);ctx.drawImage(image,x,y,w,h)
    } else {
      const value=element.kind==='text'?(element.text??''):fieldValue(element.field,data)
      if(value){
        if(element.backgroundColor){ctx.fillStyle=element.backgroundColor;ctx.beginPath();ctx.roundRect(x,y,w,h,(element.radius??0)*scale);ctx.fill()}
        let fontPx=(element.fontSize??3.5)*scale
        const weight=element.fontWeight==='bold'?700:400
        ctx.font=`${weight} ${fontPx}px Arial, sans-serif`
        while(fontPx>6&&ctx.measureText(value).width>w-4*scale){fontPx-=1;ctx.font=`${weight} ${fontPx}px Arial, sans-serif`}
        ctx.fillStyle=element.color||template.text_color||'#18181b';ctx.textBaseline='middle';ctx.textAlign=element.align??'left'
        const tx=element.align==='center'?x+w/2:element.align==='right'?x+w-1.5*scale:x+1.5*scale
        ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillText(value,tx,y+h/2);ctx.restore()
      }
    }
    ctx.restore()
  }
  return canvas.toDataURL('image/png')
}

export async function renderBadgeSides(template: BadgeTemplateV2,data: BadgeRenderData) {
  const front=await renderBadgePng(template,data,'front')
  if(!template.double_sided)return [front]
  const back=await renderBadgePng(template,data,'back')
  return [front,back]
}
