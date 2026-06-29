import { Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import RegistroEvento from './pages/RegistroEvento'
import Login from './pages/admin/Login'
import AdminPanel from './pages/admin/AdminPanel'
import RequireAuth from './components/RequireAuth'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/registro" element={<RegistroEvento />} />
      <Route path="/e/:eventId" element={<RegistroEvento />} />
      <Route path="/admin/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminPanel />
          </RequireAuth>
        }
      />
    </Routes>
  )
}

export default App
