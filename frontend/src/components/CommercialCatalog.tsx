import { Link } from 'react-router-dom'

const plans = [
  { name: 'Esencial', description: 'Para organizar el registro y la recepción de tus invitados.', features: ['Registro e invitaciones', 'Credenciales QR y acreditación', 'Control de asistencia'] },
  { name: 'Integral', description: 'Para coordinar distintas áreas de un evento desde un mismo lugar.', features: ['Herramientas según el tipo de evento', 'Agenda, exposición o gestión de invitados', 'Producción, tareas y presupuesto'] },
  { name: 'A medida', description: 'Para preparar una operación con necesidades y acompañamiento específicos.', features: ['Definición del alcance y los módulos', 'Preparación y capacitación del equipo', 'Coordinación de impresión y soporte'] },
]

export default function CommercialCatalog() {
  return <section className="mx-auto max-w-7xl bg-white px-5 py-14 text-zinc-950" id="planes" aria-labelledby="plans-title">
    <h2 id="plans-title" className="text-3xl font-bold">Una opción para cada evento</h2>
    <p className="mt-3 max-w-3xl text-zinc-600">Estas opciones son orientativas. Conversemos sobre tu evento para definir los módulos, el acompañamiento y el alcance que necesitas.</p>
    <div className="mt-6 grid gap-4 md:grid-cols-3">{plans.map(plan => <article className="flex flex-col rounded-2xl border p-6" key={plan.name}>
      <h3 className="text-xl font-bold">{plan.name}</h3>
      <p className="mt-3 text-zinc-600">{plan.description}</p>
      <ul className="my-5 flex-1 space-y-2 text-sm">{plan.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul>
      <Link to="/demo" className="font-semibold text-emerald-700 underline">Conversar sobre mi evento</Link>
    </article>)}</div>
  </section>
}
