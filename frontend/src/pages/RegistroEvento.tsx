import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  RefreshCw,
  Ticket,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useTenant } from "../lib/useTenant";
import { resolvePublicEventBrand } from "../lib/eventBranding";
import PurchaseSummary from "../components/PurchaseSummary";
import ParticipantAccessLink from "../components/ParticipantAccessLink";
import { type TicketCategory } from "../lib/participant";
import { trackVisit } from '../lib/campaignAttribution';
import type { PublicRegistrationState } from '../lib/eventPresentation';

type EventRow = {
  id: string;
  organization_id: string;
  name: string;
  event_type: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  registration_deadline: string | null;
  config: Record<string, unknown>;
  organizations: { name: string | null } | null;
};

type PublicSession = {
  id: string; name: string; description: string | null; session_type: string;
  starts_at: string; ends_at: string; stage_name: string | null; capacity: number | null;
  reserved: number; registration_policy: 'included' | 'optional_free' | 'optional_paid';
  price: number; currency: string; track: string | null; allow_overlap: boolean;
  eligible_category_ids: string[];
};

type Seat = {
  id: string;
  row_label: string | null;
  column_number: number | null;
  seat_number: string | null;
  price: number | null;
  status: "available" | "reserved" | "confirmed";
};

const schema = z.object({
  first_name: z.string().min(2, "Ingresa tu nombre"),
  last_name: z.string().optional(),
  email: z.string().email("Correo inválido"),
  phone: z.string().min(7, "Teléfono inválido"),
  cedula: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;
type CreatedRegistration = {
  registration_id: string;
  credential_token: string;
  payment_required: boolean;
};
type NotificationStatus = "idle" | "sending" | "accepted" | "failed";

export default function RegistroEvento() {
  const { eventId } = useParams();
  const { tenant, loading: tenantLoading } = useTenant();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [categories,setCategories] = useState<TicketCategory[]>([]);
  const [categoryId,setCategoryId] = useState('');
  const [sessions,setSessions] = useState<PublicSession[]>([]);
  const [selectedSessionIds,setSelectedSessionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [registrationState, setRegistrationState] = useState<PublicRegistrationState | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [credentialToken, setCredentialToken] = useState<string | null>(null);
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [createdRegistration, setCreatedRegistration] =
    useState<CreatedRegistration | null>(null);
  const [notificationStatus, setNotificationStatus] =
    useState<NotificationStatus>("idle");
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (tenantLoading) return;
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError(null);
      let query = supabase
        .from("events")
        .select(
          "id, organization_id, name, event_type, description, start_date, end_date, registration_deadline, config, organizations(name)",
        )
        .eq("status", "published");
      // Aísla por organización cuando se resuelve un tenant por subdominio.
      if (tenant) query = query.eq("organization_id", tenant.id);
      query = eventId
        ? query.eq("id", eventId)
        : query.order("created_at", { ascending: false });
      const { data, error } = await query.limit(1).maybeSingle();
      if (!active) return;
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      const ev = data as unknown as EventRow | null;
      setEvent(ev);
      setRegistrationState(null);
      setCategories([]); setCategoryId('');
      setSessions([]); setSelectedSessionIds([]);
      if (ev) {
        const availability = await supabase.rpc('get_public_event_registration_state', { p_event_id: ev.id });
        if (!active) return;
        if (availability.error) { setLoadError('No se pudo validar la disponibilidad del registro.'); setLoading(false); return; }
        setRegistrationState(availability.data as unknown as PublicRegistrationState);
        const catalog = await supabase.rpc('get_public_event_session_catalog',{p_event_id:ev.id});
        if (!active) return;
        if (catalog.error) { setLoadError('No se pudo consultar el programa disponible.'); setLoading(false); return; }
        setSessions((catalog.data??[]) as PublicSession[]);
      }
      if (ev?.config?.ticket_categories_enabled === true) {
        const result=await supabase.rpc('get_public_ticket_categories',{p_event_id:ev.id});
        if (!active) return;
        if (result.error) { setLoadError('No se pudieron consultar las entradas disponibles. Inténtalo de nuevo.'); setLoading(false); return; }
        setCategories((result.data??[]) as TicketCategory[]);
      }
      if (
        ev?.config?.public_seat_selection_enabled === true &&
        ev.config?.seat_assignment_mode === "attendee"
      ) {
        const { data: seatData } = await supabase
          .from("seats")
          .select("id, row_label, column_number, seat_number, price, status")
          .eq("event_id", ev.id)
          .order("row_label", { ascending: true })
          .order("column_number", { ascending: true });
        if (active) setSeats((seatData ?? []) as Seat[]);
      }
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [eventId, tenant, tenantLoading]);

  useEffect(() => {
    if (!event?.id) return;
    void trackVisit(event.id, null, 'form');
  }, [event?.id]);

  async function reloadSeats(evId: string) {
    const { data } = await supabase
      .from("seats")
      .select("id, row_label, column_number, seat_number, price, status")
      .eq("event_id", evId)
      .order("row_label", { ascending: true })
      .order("column_number", { ascending: true });
    setSeats((data ?? []) as Seat[]);
  }

  async function sendRegistrationEmail(registration: CreatedRegistration) {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) {
      setNotificationStatus("failed");
      setNotificationError("El servicio de correo no está configurado.");
      return;
    }
    setNotificationStatus("sending");
    setNotificationError(null);
    try {
      const response = await fetch(
        `${apiUrl}${registration.payment_required ? "/api/registrations/notify" : "/api/registrations/confirm-notify"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registration_id: registration.registration_id,
            credential_token: registration.credential_token,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        status?: string;
      } | null;
      if (!response.ok || body?.status !== "accepted")
        throw new Error(body?.error ?? "El proveedor no aceptó el correo.");
      setNotificationStatus("accepted");
    } catch (emailError) {
      setNotificationStatus("failed");
      setNotificationError(
        emailError instanceof Error
          ? emailError.message
          : "No se pudo enviar el correo.",
      );
    }
  }

  async function onSubmit(values: FormValues) {
    if (!event || registrationState?.available !== true) return;
    setSubmitError(null);
    if (event.config.ticket_categories_enabled === true && !categoryId) { setSubmitError('Selecciona una categoría de entrada disponible.'); return; }
    if (event.event_type === 'workshop' && sessions.length > 0 && chosenSessions.length === 0) { setSubmitError('Selecciona al menos una sesión del taller.'); return; }

    const hasSeats =
      event.config?.public_seat_selection_enabled === true &&
      event.config?.seat_assignment_mode === "attendee" &&
      seats.length > 0;
    if (hasSeats && !selectedSeat) {
      setSubmitError("Selecciona un asiento disponible.");
      return;
    }

    const visitId = await trackVisit(event.id, null, 'form');
    const { data, error } = await supabase.rpc("register_event_session_purchase", {
      p_event_id: event.id,
      p_seat_id: hasSeats ? selectedSeat : null,
      p_first_name: values.first_name,
      p_last_name: values.last_name || "",
      p_email: values.email,
      p_phone: values.phone,
      p_cedula: values.cedula || "",
      p_category_id: categoryId || null,
      p_session_ids: selectedSessionIds,
      p_visit_id: visitId,
    });
    if (error) {
      if (error.code === "23505") {
        setSubmitError(
          "Ya existe un registro con ese correo para este evento.",
        );
      } else {
        setSubmitError(error.message);
        // Si el asiento fue tomado por otra persona, refresca el mapa.
        if (hasSeats) {
          setSelectedSeat(null);
          await reloadSeats(event.id);
        }
      }
      return;
    }

    const registration = Array.isArray(data)
      ? (data[0] as CreatedRegistration | undefined)
      : undefined;
    setCredentialToken(registration?.credential_token ?? null);
    setPaymentRequired(registration?.payment_required === true);
    setCreatedRegistration(registration ?? null);
    setDone(true);
    if (registration) await sendRegistrationEmail(registration);
  }

  const brand = resolvePublicEventBrand(event);
  const color = brand.color;
  const name = brand.name;
  const logoUrl = brand.logo_url;
  const category = categories.find(item=>item.id===categoryId);
  const seat = seats.find(item=>item.id===selectedSeat);
  const eligible = (session: PublicSession) => session.eligible_category_ids.length===0 || (!!categoryId && session.eligible_category_ids.includes(categoryId));
  const chosenSessions = sessions.filter(item=>eligible(item) && (item.registration_policy==='included'||selectedSessionIds.includes(item.id)));
  const baseAmount = category?Number(category.price):event?.config.registration_mode==='free'?0:seat?.price??(event?.config.price!=null?Number(event.config.price):0);
  const sessionAmount = chosenSessions.reduce((sum,item)=>sum+(item.registration_policy==='optional_paid'?Number(item.price):0),0);
  const totalAmount = Number(baseAmount??0)+sessionAmount;
  const snapshot = {event_name:event?.name,starts_at:event?.start_date,timezone:typeof event?.config.timezone==='string'?event.config.timezone:'America/Caracas',venue:String(event?.config.venue_name??event?.config.location??''),category:category?.name,benefits:[...(category?.benefits??[]),...chosenSessions.map(item=>`${item.name}${item.registration_policy==='included'?' · incluida':''}`)],amount:totalAmount,currency:category?.currency??chosenSessions.find(item=>item.registration_policy==='optional_paid')?.currency??String(event?.config.currency??'USD'),seat:seat?.seat_number};
  const isFree = totalAmount===0;

  function toggleSession(session: PublicSession) {
    if (selectedSessionIds.includes(session.id)) { setSelectedSessionIds(current=>current.filter(id=>id!==session.id)); return }
    const conflict = sessions.find(other=>selectedSessionIds.includes(other.id) && !session.allow_overlap && !other.allow_overlap && new Date(session.starts_at)<new Date(other.ends_at) && new Date(other.starts_at)<new Date(session.ends_at))
    if (conflict) { setSubmitError(`“${session.name}” se cruza con “${conflict.name}”. Elige solo una.`); return }
    setSubmitError(null); setSelectedSessionIds(current=>[...current,session.id])
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <header className="border-b border-zinc-200/70 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-5 py-4">
          {logoUrl ? (
            <span className="flex h-11 w-28 shrink-0 items-center justify-center rounded-lg bg-white p-1.5">
              <img
                src={logoUrl}
                alt={name}
                className="h-full w-full object-contain"
              />
            </span>
          ) : (
            <span
              className="grid h-9 w-9 place-items-center rounded-lg text-emerald-400"
              style={{ backgroundColor: color ?? "#18181b" }}
            >
              <Ticket className="h-5 w-5 text-white" strokeWidth={2.2} />
            </span>
          )}
          <span className="text-lg font-semibold tracking-tight text-zinc-900">
            {tenant ? (
              name
            ) : (
              <>
                EventPass <span className="text-emerald-600">VE</span>
              </>
            )}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        {event && !done && <ParticipantAccessLink eventId={event.id}/>}
        {loading && <SkeletonForm />}

        {!loading && loadError && (
          <Notice title="No pudimos cargar el evento" body={loadError} />
        )}

        {!loading && !loadError && !event && (
          <Notice
            title="No hay un evento disponible"
            body="Aún no hay un evento publicado para registro. Vuelve más tarde."
          />
        )}

        {!loading && event && !done && registrationState?.available === false && (
          <Notice title="Registro no disponible" body={registrationState.reason ?? "El organizador todavía está preparando este registro."} />
        )}

        {!loading &&
          event &&
          !done &&
          registrationState?.available !== false && event.config?.registration_mode === "invitation" && (
            <Notice
              title="Registro por invitación"
              body="Este evento no admite registros públicos. Solicita tu invitación al organizador."
            />
          )}

        {!loading &&
          event &&
          !done &&
          registrationState?.available === true && event.config?.registration_mode !== "invitation" && (
            <div className="animate-float-up">
              <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
                {event.organizations?.name ?? "Registro"}
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
                {event.name}
              </h1>
              {event.start_date && (
                <p className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-600">
                  <CalendarDays className="h-4 w-4 text-zinc-400" />
                  {new Date(event.start_date).toLocaleDateString("es-VE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
              {event.description && (
                <p className="mt-4 max-w-xl leading-relaxed text-zinc-600">
                  {event.description}
                </p>
              )}
              {event.config?.public_floorplan_visible === true && (
                <Link
                  to={`/expo/${event.id}/plano`}
                  target="_blank"
                  className="mt-5 inline-flex text-sm font-semibold text-emerald-700 underline underline-offset-4"
                >
                  Consultar plano público del evento
                </Link>
              )}

              <form
                onSubmit={handleSubmit(onSubmit)}
                className="mt-10 grid gap-5 sm:grid-cols-2"
              >
                {event.config.ticket_categories_enabled === true && <fieldset className="space-y-3 sm:col-span-2"><legend className="font-semibold">Selecciona tu entrada</legend>{categories.length===0 && <p>No hay categorías disponibles para venta en este momento.</p>}{categories.map(item=><label key={item.id} className="block rounded-xl border p-4"><input type="radio" name="ticket-category" required checked={categoryId===item.id} disabled={item.remaining===0} value={item.id} onChange={()=>{setCategoryId(item.id);setSelectedSessionIds(current=>current.filter(id=>{const session=sessions.find(value=>value.id===id);return !!session&&(session.eligible_category_ids.length===0||session.eligible_category_ids.includes(item.id))}))}}/><span className="ml-2 font-semibold">{item.name} · {Number(item.price)===0?'Gratuito':`${item.price} ${item.currency}`}</span><p className="mt-2 text-sm">{item.description}</p>{item.benefits.length>0&&<p className="mt-1 text-sm">{item.benefits.join(' · ')}</p>}<p className="mt-2 text-sm text-zinc-500">{item.remaining===0?'Agotada':item.remaining==null?'Sujeta al aforo del evento':`${item.remaining} cupos disponibles`}</p></label>)}<p className="text-sm text-zinc-600">El precio de la entrada sustituye al del asiento; no se suman.</p></fieldset>}
                {sessions.length>0 && <fieldset className="space-y-3 sm:col-span-2"><legend className="font-semibold">Elige tus sesiones</legend><p className="text-sm text-zinc-600">Las actividades incluidas se reservan automáticamente. Puedes añadir actividades opcionales según tu entrada.</p>{sessions.map(item=>{const allowed=eligible(item);const remaining=item.capacity==null?null:Math.max(item.capacity-item.reserved,0);const included=item.registration_policy==='included';const checked=included?allowed:selectedSessionIds.includes(item.id);const disabled=!allowed||remaining===0;return <label key={item.id} className={`block rounded-xl border p-4 ${disabled?'bg-zinc-50 text-zinc-500':'cursor-pointer hover:border-emerald-400'}`}><div className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={checked} disabled={included||disabled} onChange={()=>toggleSession(item)}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{item.name}</span><span className="text-sm font-semibold">{item.registration_policy==='optional_paid'?`${item.price} ${item.currency}`:included?'Incluida':'Gratuita'}</span></div><p className="mt-1 text-sm">{new Date(item.starts_at).toLocaleString('es-VE',{dateStyle:'medium',timeStyle:'short'})}{item.stage_name?` · ${item.stage_name}`:''}{item.track?` · ${item.track}`:''}</p>{item.description&&<p className="mt-2 text-sm">{item.description}</p>}<p className="mt-2 text-xs">{!allowed?(categoryId?'Tu entrada no habilita esta sesión.':'Selecciona una entrada para validar el acceso.'):remaining===0?'Cupo agotado':remaining==null?'Cupo sujeto al aforo general':`${remaining} cupos disponibles`}</p></div></div></label>})}</fieldset>}
                <FieldText
                  label="Nombre"
                  error={errors.first_name?.message}
                  {...register("first_name")}
                />
                <FieldText
                  label="Apellido"
                  error={errors.last_name?.message}
                  {...register("last_name")}
                />
                <FieldText
                  label="Correo electrónico"
                  type="email"
                  error={errors.email?.message}
                  {...register("email")}
                />
                <FieldText
                  label="Teléfono"
                  error={errors.phone?.message}
                  {...register("phone")}
                />
                <div className="sm:col-span-2">
                  <FieldText
                    label="Cédula o pasaporte (opcional)"
                    error={errors.cedula?.message}
                    {...register("cedula")}
                  />
                </div>

                {seats.length > 0 && (
                  <div className="sm:col-span-2">
                    <SeatPicker
                      seats={seats}
                      selected={selectedSeat}
                      onSelect={setSelectedSeat}
                    />
                  </div>
                )}

                {submitError && (
                  <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {submitError}
                  </p>
                )}

                <div className="sm:col-span-2"><PurchaseSummary snapshot={snapshot}/></div>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || (event.config.ticket_categories_enabled === true && !categoryId) || (event.event_type === 'workshop' && sessions.length > 0 && chosenSessions.length === 0)}
                    style={color ? { backgroundColor: color } : undefined}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    {isSubmitting
                      ? "Enviando…"
                      : isFree
                        ? "Confirmar mi registro"
                        : "Reservar mi plaza"}
                    {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                  </button>
                  <p className="mt-3 text-xs text-zinc-500">
                    {isFree
                      ? "Tu registro quedará confirmado inmediatamente y recibirás tu credencial."
                      : "Recibirás un correo con los datos de pago y el plazo para completar tu registro."}
                  </p>
                </div>
              </form>
            </div>
          )}

        {done && (
          <div className="animate-float-up rounded-2xl border border-emerald-200 bg-white p-8 text-center">
            <ParticipantAccessLink token={credentialToken} eventId={event?.id}/>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <h2 className="mt-5 text-2xl font-bold text-zinc-900">
              {paymentRequired ? "¡Plaza reservada!" : "¡Registro confirmado!"}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-zinc-600">
              {paymentRequired
                ? "Tu plaza está reservada mientras completas el pago."
                : "Tu acceso está confirmado. Puedes abrir ahora tu credencial y presentarla en el ingreso."}
            </p>
            {notificationStatus === "sending" && (
              <p role="status" className="mt-4 text-sm text-zinc-600">
                Enviando el correo de confirmación…
              </p>
            )}
            {notificationStatus === "accepted" && (
              <p
                role="status"
                className="mt-4 text-sm font-medium text-emerald-700"
              >
                Correo aceptado para envío. Revisa también la carpeta de spam.
              </p>
            )}
            {notificationStatus === "failed" && (
              <div className="mx-auto mt-4 max-w-lg rounded-lg border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-900">
                <p className="font-semibold">
                  Tu registro sí quedó guardado, pero el correo no pudo
                  enviarse.
                </p>
                <p className="mt-1">{notificationError}</p>
                {createdRegistration && (
                  <button
                    type="button"
                    onClick={() =>
                      void sendRegistrationEmail(createdRegistration)
                    }
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-white px-3 py-2 font-semibold"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reintentar correo
                  </button>
                )}
              </div>
            )}
            {paymentRequired && credentialToken && (
              <Link
                to={`/comprobante/${credentialToken}`}
                className="mt-5 inline-flex rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
              >
                Cargar comprobante ahora
              </Link>
            )}
            {!paymentRequired && credentialToken && (
              <Link
                to={`/credencial/${credentialToken}`}
                className="mt-5 inline-flex rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"
              >
                Ver mi credencial
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function SeatPicker({
  seats,
  selected,
  onSelect,
}: {
  seats: Seat[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const rows = new Map<string, Seat[]>();
  for (const s of seats) {
    const key = s.row_label ?? "—";
    const list = rows.get(key) ?? [];
    list.push(s);
    rows.set(key, list);
  }
  const selectedSeat = seats.find((s) => s.id === selected);

  return (
    <div>
      <span className="text-sm font-medium text-zinc-800">
        Elige tu asiento
      </span>
      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4">
        <div className="mx-auto mb-4 w-full rounded bg-zinc-900 py-1.5 text-center text-xs font-medium uppercase tracking-widest text-zinc-300">
          Escenario
        </div>
        <div className="flex flex-col gap-2">
          {[...rows.entries()].map(([label, rowSeats]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-5 text-xs font-semibold text-zinc-400">
                {label}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {rowSeats.map((s) => {
                  const available = s.status === "available";
                  const isSelected = s.id === selected;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!available}
                      onClick={() => onSelect(s.id)}
                      title={`${s.seat_number ?? ""}${s.price ? ` · $${s.price}` : ""}`}
                      className={`grid h-8 w-8 place-items-center rounded-md border text-[10px] font-semibold transition-colors ${
                        isSelected
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : available
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-500"
                            : "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-300"
                      }`}
                    >
                      {s.column_number}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {selectedSeat
          ? `Seleccionado: ${selectedSeat.seat_number}${selectedSeat.price ? ` · $${selectedSeat.price}` : ""}`
          : "Toca un asiento disponible (verde)."}
      </p>
    </div>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

function FieldText({ label, error, ...props }: FieldProps) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-800">{label}</span>
      <input
        {...props}
        className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8">
      <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
      <p className="mt-2 text-sm text-zinc-600">{body}</p>
    </div>
  );
}

function SkeletonForm() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-32 rounded bg-zinc-200" />
      <div className="mt-3 h-9 w-2/3 rounded bg-zinc-200" />
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-zinc-200" />
        ))}
      </div>
    </div>
  );
}
