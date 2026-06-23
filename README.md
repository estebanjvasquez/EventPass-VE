# EventPass VE

Plataforma SaaS de gestión de registros para eventos — diseñada para el mercado venezolano.

## ¿Qué es EventPass VE?

Sistema integral que automatiza el ciclo completo de un evento:

- Registro online con validación en tiempo real
- Carga y verificación manual de comprobante de pago
- Recordatorios automáticos y timeout de plazas
- Generación de credenciales con código QR
- Panel administrativo con mapa de asientos
- App de check-in offline-ready

## Modelo de Negocio

SaaS en USD — tres planes:

| Plan | Precio | Eventos | Registros |
|------|--------|---------|-----------|
| Arranque | $49/mes | 1 activo | 200 |
| Profesional | $99/mes | Ilimitados | 1,000/mes |
| Asociación | $179/mes | Ilimitados | Ilimitados |

## Stack Técnico

- **Frontend:** React 18 + TypeScript + Tailwind CSS + Shadcn/ui
- **Backend:** Node.js + Express + Prisma + PostgreSQL
- **Jobs:** Bull + Redis
- **Email:** SendGrid / Gmail SMTP
- **Hosting:** DigitalOcean (São Paulo)
- **Storage:** DigitalOcean Spaces

## Estructura del Repositorio

```
EventPass-VE/
├── docs/           ← Análisis, propuestas, presupuestos
├── backend/        ← API REST (Node.js)
├── frontend/       ← Aplicación React
└── infra/          ← Configuración DigitalOcean, Docker
```

## Documentación

Ver carpeta `docs/` para análisis técnico, propuestas de cliente y presupuestos.

## Estado

`En planificación` — documentación completa, desarrollo por iniciar.
