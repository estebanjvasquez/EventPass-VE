import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'

// Carga diferida por ruta: cada página es su propio chunk. Así el visitante
// público no descarga el panel admin ni el escáner QR (html5-qrcode), que solo
// hacen falta en el check-in.
const Landing = lazy(() => import('./pages/Landing'))
const RegistroEvento = lazy(() => import('./pages/RegistroEvento'))
const RegistroPrograma = lazy(() => import('./pages/RegistroPrograma'))
const CargarComprobante = lazy(() => import('./pages/CargarComprobante'))
const CredencialEvento = lazy(() => import('./pages/CredencialEvento'))
const CrearCuenta = lazy(() => import('./pages/CrearCuenta'))
const Bienvenida = lazy(() => import('./pages/Bienvenida'))
const DefinirClave = lazy(() => import('./pages/DefinirClave'))
const RecuperarClave = lazy(() => import('./pages/RecuperarClave'))
const Login = lazy(() => import('./pages/admin/Login'))
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'))
const CheckinEvento = lazy(() => import('./pages/admin/CheckinEvento'))
const AcreditacionEvento = lazy(() => import('./pages/admin/AcreditacionEvento'))
const EventosAdmin = lazy(() => import('./pages/admin/EventosAdmin'))
const ProgramasAdmin = lazy(() => import('./pages/admin/ProgramasAdmin'))
const ProgramaAccesosAdmin = lazy(() => import('./pages/admin/ProgramaAccesosAdmin'))
const PuntosAccesoAdmin = lazy(() => import('./pages/admin/PuntosAccesoAdmin'))
const StandsAdmin = lazy(() => import('./pages/admin/StandsAdmin'))
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
        <Route path="/p/:programId/registro" element={<RegistroPrograma />} />
        <Route path="/comprobante/:token" element={<CargarComprobante />} />
        <Route path="/credencial/:token" element={<CredencialEvento />} />
        <Route path="/crear-cuenta" element={<CrearCuenta />} />
        <Route path="/bienvenida" element={<Bienvenida />} />
        <Route path="/definir-clave" element={<DefinirClave />} />
        <Route path="/recuperar-clave" element={<RecuperarClave />} />
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
        <Route path="/admin/puntos-acceso" element={<RequireAuth><PuntosAccesoAdmin /></RequireAuth>} />
        <Route
          path="/admin/acreditacion"
          element={
            <RequireAuth>
              <AcreditacionEvento />
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
        <Route path="/admin/programas" element={<RequireAuth><ProgramasAdmin /></RequireAuth>} />
        <Route path="/admin/programas/:programId/accesos" element={<RequireAuth><ProgramaAccesosAdmin /></RequireAuth>} />
        <Route path="/admin/programs" element={<Navigate to="/admin/programas" replace />} />
        <Route path="/admin/stands/:eventId" element={<RequireAuth><StandsAdmin /></RequireAuth>} />
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
