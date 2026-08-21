# QA operativo onsite — fases 1 a 5

Este checklist acompaña el despliegue `59bb7af` y separa lo que puede probarse
en preview de lo que necesita un dispositivo o impresora real.

## Automatizado / preview

- [x] `npm run lint`
- [x] `npm run build`
- [x] `/`, `/admin/login`, `/manifest.webmanifest` y `/sw.js` responden HTTP 200.
- [x] La pantalla `/admin/equipo-operativo` se carga como chunk independiente.
- [x] Las RPC de check-in e ingreso manual exigen `checkin.perform`.
- [x] La inserción de `badge_print_logs` exige `badges.print`.
- [x] Acreditación muestra historial inicial/reimpresión y motivo.
- [x] Check-in muestra estado sin conexión y no confirma falsamente una lectura.

## Prueba autenticada requerida

1. Crear un punto de acceso y asignar un miembro con alcance específico.
2. Confirmar que ese miembro puede validar en su punto y recibe denegación en otro.
3. Revocar el alcance y repetir: la RPC debe responder `42501`.
4. Imprimir una acreditación, reimprimir con motivo y verificar el historial.
5. Repetir con cámara bloqueada y usar ingreso manual.

## Prueba presencial pendiente

- Dos teléfonos con conectividad intermitente y recuperación de red.
- Permiso de cámara denegado/concedido en Android y iOS.
- Impresora térmica y tamaño de etiqueta configurado en el diálogo del navegador.
- Doble escaneo, pase no autorizado, participante pendiente y salida/reingreso.

Estas pruebas no se marcan como aprobadas sin un dispositivo y una sesión de
evento reales; el frontend muestra el estado y el error accionable para que el
operador pueda recuperarse sin perder el flujo.
