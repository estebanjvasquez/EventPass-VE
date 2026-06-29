import { Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import RegistroEvento from './pages/RegistroEvento'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/registro" element={<RegistroEvento />} />
      <Route path="/e/:eventId" element={<RegistroEvento />} />
    </Routes>
  )
}

export default App
