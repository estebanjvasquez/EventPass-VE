import {
  ArrowRight,
  BellRing,
  Check,
  LayoutDashboard,
  QrCode,
  ScanLine,
  ShieldCheck,
  Ticket,
  WifiOff,
} from 'lucide-react'

const features = [
  {
    icon: ShieldCheck,
    title: 'Verificación de comprobante',
    body: 'El asistente carga su pago (Zelle, Pago Móvil, Binance) y tú lo confirmas o rechazas desde el panel.',
  },
  {
    icon: BellRing,
    title: 'Recordatorios automáticos',
    body: 'Avisos de pago en los días 3, 7 y 9. Las plazas no pagadas se liberan solas al vencer el plazo.',
  },
  {
    icon: QrCode,
    title: 'Credencial con QR',
    body: 'Al confirmar el pago se genera una credencial con código QR única, lista para imprimir o guardar.',
  },
  {
    icon: ScanLine,
    title: 'Check-in en el evento',
    body: 'Lee el QR el día del evento y registra la asistencia en segundos desde cualquier teléfono.',
  },
  {
    icon: WifiOff,
    title: 'Funciona sin internet',
    body: 'El check-in opera offline y sincroniza al volver la conexión. Pensado para cortes de luz e internet.',
  },
  {
    icon: LayoutDashboard,
    title: 'Panel administrativo',
    body: 'Configura tipos de entrada, métodos de pago, branding y reportes. Todo desde un solo lugar.',
  },
]

const plans = [
  {
    name: 'Arranque',
    price: 49,
    tagline: 'Para tu primer evento profesional.',
    features: [
      '1 evento activo',
      'Hasta 200 registros',
      'Recordatorios automáticos',
      'Panel admin básico',
      'Exportación CSV',
    ],
    highlight: false,
  },
  {
    name: 'Profesional',
    price: 99,
    tagline: 'Lo que la mayoría necesita.',
    features: [
      'Eventos ilimitados',
      'Hasta 1.000 registros/mes',
      'Credencial con QR + check-in',
      'Mapa de asientos',
      'Reportes y soporte por WhatsApp',
    ],
    highlight: true,
  },
  {
    name: 'Asociación',
    price: 179,
    tagline: 'Para gremios y multi-evento.',
    features: [
      'Registros ilimitados',
      'Dominio propio o embed',
      'Branding completo',
      'Roles de equipo',
      'Soporte prioritario',
    ],
    highlight: false,
  },
]

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/70 bg-[#fafafa]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <a href="#top" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-emerald-400">
            <Ticket className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-zinc-900">
            EventPass <span className="text-emerald-600">VE</span>
          </span>
        </a>
        <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-600 md:flex">
          <a href="#caracteristicas" className="transition-colors hover:text-zinc-900">
            Características
          </a>
          <a href="#planes" className="transition-colors hover:text-zinc-900">
            Planes
          </a>
        </nav>
        <a
          href="#contacto"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-transform active:scale-[0.98]"
        >
          Solicitar demo
        </a>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section id="top" className="mx-auto max-w-6xl px-5 pt-16 pb-20 md:pt-24">
      <div className="grid items-center gap-14 md:grid-cols-12">
        <div className="animate-float-up md:col-span-7">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Hecho para el mercado venezolano
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-zinc-900 sm:text-5xl md:text-6xl">
            Registro de eventos sin
            <span className="text-emerald-600"> WhatsApp ni Excel</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-600">
            Tus asistentes se inscriben, cargan su comprobante y reciben su
            credencial con QR. Tú verificas pagos y haces check-in desde un
            panel — incluso sin internet en el evento.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#contacto"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
            >
              Solicitar demo
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#planes"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition-colors hover:border-zinc-400"
            >
              Ver planes
            </a>
          </div>
          <p className="mt-6 text-sm text-zinc-500">
            Desde <span className="font-semibold text-zinc-700">$49/mes</span> · Prueba de 14 días · Pago por Zelle o Binance
          </p>
        </div>

        <div className="md:col-span-5">
          <CredentialMock />
        </div>
      </div>
    </section>
  )
}

function CredentialMock() {
  return (
    <div className="animate-float-up relative mx-auto max-w-sm" style={{ animationDelay: '120ms' }}>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-600">
              Credencial
            </p>
            <p className="mt-1 text-lg font-bold text-zinc-900">Congreso Anual 2026</p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-emerald-400">
            <Ticket className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-3">
            <Field label="Asistente" value="Olivia Sterling" />
            <Field label="Tipo" value="Ponente" />
            <Field label="Estado" value="Confirmado" accent />
          </div>
          <div className="col-span-1">
            <div className="grid aspect-square w-full place-items-center rounded-xl border border-zinc-200 bg-zinc-50">
              <QrCode className="h-14 w-14 text-zinc-900" strokeWidth={1.4} />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-5 hidden rounded-xl border border-zinc-200 bg-white px-4 py-3 sm:block">
        <div className="flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-medium text-zinc-800">Check-in: 312 / 340</span>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{label}</p>
      <p className={`text-sm font-semibold ${accent ? 'text-emerald-600' : 'text-zinc-900'}`}>
        {value}
      </p>
    </div>
  )
}

function Features() {
  return (
    <section id="caracteristicas" className="border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Todo el ciclo del evento, automatizado
          </h2>
          <p className="mt-4 text-lg text-zinc-600">
            Desde la inscripción hasta el check-in. Menos trabajo manual, menos
            errores y una experiencia profesional para tus asistentes.
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-white p-7 transition-colors hover:bg-zinc-50">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <h3 className="mt-5 text-base font-semibold text-zinc-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="planes" className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          Planes claros, en dólares
        </h2>
        <p className="mt-4 text-lg text-zinc-600">
          Sin contratos forzosos. Cambia de plan cuando tu organización crezca.
        </p>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col rounded-2xl border p-7 ${
              plan.highlight
                ? 'border-emerald-600 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className={`text-lg font-semibold ${plan.highlight ? 'text-white' : 'text-zinc-900'}`}>
                {plan.name}
              </h3>
              {plan.highlight && (
                <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-900">
                  Más vendido
                </span>
              )}
            </div>
            <p className={`mt-1 text-sm ${plan.highlight ? 'text-zinc-300' : 'text-zinc-500'}`}>
              {plan.tagline}
            </p>
            <div className="mt-6 flex items-baseline gap-1">
              <span className={`text-4xl font-extrabold tracking-tight ${plan.highlight ? 'text-white' : 'text-zinc-900'}`}>
                ${plan.price}
              </span>
              <span className={`text-sm ${plan.highlight ? 'text-zinc-400' : 'text-zinc-500'}`}>/mes</span>
            </div>

            <ul className="mt-7 space-y-3 border-t pt-6 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check
                    className={`mt-0.5 h-4 w-4 shrink-0 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-600'}`}
                    strokeWidth={2.5}
                  />
                  <span className={plan.highlight ? 'text-zinc-200' : 'text-zinc-700'}>{f}</span>
                </li>
              ))}
            </ul>

            <a
              href="#contacto"
              className={`mt-8 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-transform active:scale-[0.98] ${
                plan.highlight
                  ? 'bg-emerald-500 text-zinc-900'
                  : 'bg-zinc-900 text-white'
              }`}
            >
              Empezar
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}

function CallToAction() {
  return (
    <section id="contacto" className="border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid items-center gap-10 rounded-3xl bg-zinc-900 p-10 md:grid-cols-12 md:p-14">
          <div className="md:col-span-8">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              ¿Listo para tu próximo evento?
            </h2>
            <p className="mt-4 max-w-xl text-lg text-zinc-300">
              Agenda una demo de 30 minutos. Te mostramos el flujo completo con
              tu evento real y te ayudamos a configurarlo.
            </p>
          </div>
          <div className="md:col-span-4 md:justify-self-end">
            <a
              href="mailto:estebanjvasquez@gmail.com?subject=Demo%20EventPass%20VE"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-zinc-900 transition-transform active:scale-[0.98]"
            >
              Solicitar demo
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-zinc-200">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-900 text-emerald-400">
            <Ticket className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-zinc-900">EventPass VE</span>
        </div>
        <p className="text-sm text-zinc-500">
          © {new Date().getFullYear()} EventPass VE · Hecho en Venezuela
        </p>
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div className="min-h-[100dvh]">
      <Header />
      <main>
        <Hero />
        <Features />
        <Pricing />
        <CallToAction />
      </main>
      <Footer />
    </div>
  )
}
