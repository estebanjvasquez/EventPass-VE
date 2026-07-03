import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'

// Carga diferida por ruta: cada página es su propio chunk. Así el visitante
// público no descarga el panel admin ni el escáner QR (html5-qrcode), que solo
// hacen falta en el check-in.
const Landing = lazy(() => import('./pages/Landing'))
const RegistroEvento = lazy(() => import('./pages/RegistroEvento'))
const CargarComprobante = lazy(() => import('./pages/CargarComprobante'))
const CredencialEvento = lazy(() => import('./pages/CredencialEvento'))
const CrearCuenta = lazy(() => import('./pages/CrearCuenta'))
const Bienvenida = lazy(() => import('./pages/Bienvenida'))
const Login = lazy(() => import('./pages/admin/Login'))
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'))
const CheckinEvento = lazy(() => import('./pages/admin/CheckinEvento'))
const EventosAdmin = lazy(() => import('./pages/admin/EventosAdmin'))
const AsientosAdmin = lazy(() => import('./pages/admin/AsientosAdmin'))
const SuscripcionAdmin = lazy(() => import('./pages/admin/SuscripcionAdmin'))
const SuperAdmin = lazy(() => import('./pages/admin/SuperAdmin'))

function PageFallback() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa]">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600" />
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/registro" element={<RegistroEvento />} />
        <Route path="/e/:eventId" element={<RegistroEvento />} />
        <Route path="/comprobante/:token" element={<CargarComprobante />} />
        <Route path="/credencial/:token" element={<CredencialEvento />} />
        <Route path="/crear-cuenta" element={<CrearCuenta />} />
        <Route path="/bienvenida" element={<Bienvenida />} />
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminPanel />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/checkin"
          element={
            <RequireAuth>
              <CheckinEvento />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/eventos"
          element={
            <RequireAuth>
              <EventosAdmin />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/asientos/:eventId"
          element={
            <RequireAuth>
              <AsientosAdmin />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/suscripcion"
          element={
            <RequireAuth>
              <SuscripcionAdmin />
            </RequireAuth>
          }
        />
        <Route
          path="/superadmin"
          element={
            <RequireAuth>
              <SuperAdmin />
            </RequireAuth>
          }
        />
      </Routes>
    </Suspense>
  )
}

export default App
