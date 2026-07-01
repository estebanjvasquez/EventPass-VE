import { Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import RegistroEvento from './pages/RegistroEvento'
import CargarComprobante from './pages/CargarComprobante'
import CredencialEvento from './pages/CredencialEvento'
import Login from './pages/admin/Login'
import AdminPanel from './pages/admin/AdminPanel'
import CheckinEvento from './pages/admin/CheckinEvento'
import EventosAdmin from './pages/admin/EventosAdmin'
import RequireAuth from './components/RequireAuth'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/registro" element={<RegistroEvento />} />
      <Route path="/e/:eventId" element={<RegistroEvento />} />
      <Route path="/comprobante/:token" element={<CargarComprobante />} />
      <Route path="/credencial/:token" element={<CredencialEvento />} />
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
    </Routes>
  )
}

export default App
