import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// Supabase devuelve los errores de enlaces de correo en el fragmento de la URL.
// Los convertimos en una ruta propia para explicar el problema y permitir reintentar.
export default function AuthErrorRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    if (!params.get('error')) return

    const code = params.get('error_code') === 'otp_expired' ? 'otp_expired' : 'auth_error'
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    navigate(`/definir-clave?auth_error=${code}`, { replace: true })
  }, [navigate])

  return null
}
