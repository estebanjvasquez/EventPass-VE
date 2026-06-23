# Análisis Técnico Completo: Sistema de Registro para Eventos

## Índice
1. [Descripción General](#descripción-general)
2. [Flujo del Sistema](#flujo-del-sistema)
3. [Funcionalidades Principales](#funcionalidades-principales)
4. [Diseño Técnico](#diseño-técnico)
5. [Arquitectura de Datos](#arquitectura-de-datos)
6. [Módulos del Sistema](#módulos-del-sistema)

---

## Descripción General

Sistema integral de gestión de registros para eventos que automatiza el proceso desde la inscripción inicial hasta la verificación de asistencia, con validación de pagos, generación de credenciales y análisis en tiempo real.

**Objetivos principales:**
- Automatizar flujo de registros y pagos
- Reducir carga administrativa del organizador
- Prevenir fraudes mediante verificación manual de comprobantes
- Generar análisis e insights del evento
- Facilitar check-in en el evento

---

## Flujo del Sistema

### FASE 1: REGISTRO INICIAL (Público)
**Duración:** Instantánea

1. Usuario accede a formulario online
2. Ingresa datos: nombre, email, teléfono, tipo de evento (opcional: selecciona asiento)
3. Sistema valida:
   - Email válido y no duplicado
   - Plazas disponibles para tipo de evento/asiento
4. Sistema reserva plaza por 10 días
5. Sistema genera token de pago con vencimiento
6. Envía email preconfirmación con:
   - Datos del evento
   - Métodos de pago aceptados
   - Link único para carga de comprobante
   - Tiempo límite (10 días)
   - Monto a pagar

### FASE 2: CARGA DE COMPROBANTE (Usuario)
**Duración:** Hasta 10 días

1. Usuario recibe email con link único
2. Usuario accede a portal de carga:
   - Visualiza sus datos
   - Visualiza métodos de pago aceptados
   - Carga comprobante (imagen/PDF)
   - Selecciona método de pago usado
3. Sistema guarda comprobante como "Pendiente Verificación"
4. Sistema inicia ciclo de recordatorios automáticos:
   - Día 3: "Faltan 7 días para completar tu registro"
   - Día 7: "Faltan 3 días para completar tu registro"
   - Día 9: "Último aviso: Faltan 24 horas"

### FASE 3: VERIFICACIÓN MANUAL (Admin)
**Duración:** Variable (responsabilidad del organizador)

1. Organizador accede a panel administrativo
2. Ve lista de "Comprobantes Pendientes" con:
   - Nombre del usuario
   - Email
   - Método de pago declarado
   - Monto registrado
   - Comprobante adjunto (vista previa)
   - Fecha de carga
3. Organizador verifica en su banco/sistema de pagos
4. Organizador marca como:
   - **"Confirmado"** → Registro activado, credencial generada
   - **"Rechazado"** → Plaza liberada, email notificación al usuario

### FASE 4: NOTIFICACIONES FINALES
**Duración:** Instantánea

- Si **Confirmado**: Email con credencial adjunta (PDF con código QR)
- Si **Rechazado**: Email con explicación y opción de reintentar o cancel

### FASE 5: EVENTO & CHECK-IN
**Duración:** Día del evento

1. Usuario imprime credencial (PDF descargable)
2. Organizador puede:
   - Cargar registros manuales (registro en sitio)
   - Confirmar pago manual (registros sin sistema)
   - Usar app móvil para check-in (Lee QR de credenciales)
3. Sistema registra asistencia

---

## Funcionalidades Principales

### FORMULARIO DE REGISTRO (Público)

**Campos según tipo de evento:**

**Todos los eventos:**
- Nombre (requerido)
- Email (requerido, validado, único)
- Teléfono (requerido)
- Cédula/Pasaporte (opcional)
- Género (opcional)
- Profesión/Cargo (opcional)
- Empresa/Institución (opcional)

**Eventos tipo FORO/CONFERENCIA (con asientos):**
- Seleccionar asiento en mapa interactivo
- Seleccionar si requiere credencial especial (VIP, Exponente, etc.)

**Eventos tipo TALLER:**
- Fecha/Horario si hay múltiples sesiones
- Nivel de experiencia (básico, intermedio, avanzado)

**Eventos tipo SOCIAL:**
- Acompañantes (número de personas)

### PANEL ADMINISTRATIVO

**Dashboard Principal:**
- Resumen rápido del evento
- Total de plazas: [TOTAL] - Confirmadas: [N] - Pendientes: [N] - Disponibles: [N]
- Gráfico de estado (pie chart)
- Últimas actividades (registros, confirmaciones, rechazos)

**Submódulos:**

1. **Gestión de Eventos**
   - Crear nuevo evento
   - Editar evento (mientras esté activo)
   - Configurar tipos de eventos permitidos
   - Configurar métodos de pago aceptados
   - Establecer período de registro
   - Deactivar/Archivar evento

2. **Registros Pendientes**
   - Lista filtrable de registros sin confirmar
   - Vista de comprobante (imagen expandible)
   - Búsqueda por: nombre, email, fecha
   - Acciones: Confirmar / Rechazar / Pedir Más Información
   - Anotaciones internas

3. **Registros Confirmados**
   - Lista de pagos verificados
   - Información del usuario
   - Descarga de credencial
   - Historial de verificación

4. **Registros Manuales (Día del Evento)**
   - Cargar CSV con registros in-situ
   - Formulario rápido de registro manual
   - Confirmar pago inmediatamente
   - Imprimir credenciales batch

5. **Mapa de Asientos** (si aplica)
   - Vista visual de asientos disponibles
   - Código de colores: Disponible (verde), Reservado (amarillo), Confirmado (azul)
   - Click para ver detalles del usuario en ese asiento
   - Opción de liberar asiento manualmente

6. **Reportes**
   - Tasa de conversión (registrados vs confirmados)
   - Registros por día
   - Métodos de pago más usados
   - Ingresos proyectados vs confirmados
   - Lista de asistentes (exportable)
   - Auditoría de acciones

7. **Configuración del Evento**
   - Métodos de pago aceptados (con banco/cuenta)
   - Precios por tipo de asiento (si aplica)
   - Período de registro (fecha inicio, fecha fin, timeout de pago)
   - Plantillas de email (preconfirmación, recordatorios, confirmación)
   - Configuración de credencial: ¿Incluir QR? ¿Incluir logo? Campos adicionales
   - Opciones de privacidad: lista pública de asistentes

---

## Diseño Técnico

### Stack Tecnológico Recomendado

**Frontend:**
- **Framework:** React 18+ (Vite para build rápido)
- **UI Components:** Shadcn/ui + Tailwind CSS
- **Gráficos:** Recharts o Chart.js
- **Mapas de asientos:** Konva.js o SeatGeek API
- **Generación PDF/QR:** React-pdf, qrcode.react
- **Validación:** React Hook Form + Zod
- **State:** Zustand (ligero) o Redux Toolkit (si crece)
- **HTTP Client:** TanStack Query (React Query)
- **Autenticación:** NextAuth.js o Auth0

**Backend:**
- **Runtime:** Node.js 20+
- **Framework:** Express.js o Fastify
- **ORM:** Prisma (recomendado por tipo safety)
- **Base Datos:** PostgreSQL 15+ (relacional, JSONB para flexibilidad)
- **Caché:** Redis (para sesiones, rate limiting, tokens)
- **Email:** SendGrid o Nodemailer
- **Task Scheduler:** Bull (Redis Queue) para recordatorios automáticos
- **Autenticación:** JWT + Refresh tokens
- **Validación:** Zod o Joi
- **API Documentation:** Swagger/OpenAPI
- **Testing:** Jest + Supertest

**Infraestructura:**
- **Hosting:** AWS (EC2/RDS) o DigitalOcean (AppPlatform)
- **CDN:** CloudFront o Bunny CDN (para PDFs)
- **Almacenamiento de Comprobantes:** AWS S3 o MinIO (self-hosted)
- **CI/CD:** GitHub Actions o GitLab CI
- **Monitoreo:** Sentry (errores), DataDog (infraestructura)

**Móvil (Check-in):**
- **React Native** (iOS/Android simultaneamente) o
- **PWA** (Progressive Web App) con web camera para QR
- **Lectura QR:** react-qr-code-reader o expo-camera

---

## Arquitectura de Datos

### Modelos Principales

```
EVENT
├── id, uuid, name, description
├── eventType (FORUM, WORKSHOP, SOCIAL)
├── startDate, endDate
├── registrationDeadline
├── paymentTimeout (días: 10)
├── totalSlots, confirmedSlots, pendingSlots
├── createdBy (organizador)
├── paymentMethods (rel. N-to-N)
├── createdAt, updatedAt

REGISTRATION
├── id, uuid, eventId
├── firstName, lastName, email, phone, cedula
├── registrationDate
├── status (PENDING_PAYMENT, PAYMENT_SUBMITTED, CONFIRMED, REJECTED)
├── paymentData
│   ├── method (BANCO_A, BANCO_B, etc.)
│   ├── amount, currency
│   ├── comprobantePath (S3 URL)
│   ├── submittedAt, confirmedAt
│   └── rejectionReason
├── seatId (si aplica)
├── attendanceStatus (NO_ATTENDANCE, CHECKED_IN)
├── credentialToken (único, para acceso a credencial)
├── paymentDeadline
├── createdAt, updatedAt

SEAT (si aplica)
├── id, uuid, eventId
├── row, column, seatNumber
├── price
├── status (AVAILABLE, RESERVED, CONFIRMED)
├── registrationId (FK)

PAYMENT_METHOD
├── id, name, bankAccount, bankCode, accountHolder
├── eventId (para permitir múltiples métodos)

ADMIN_ACTION (auditoría)
├── id, eventId, userId, action
├── registrationId, details
├── timestamp

EMAIL_LOG
├── id, registrationId, emailType, status
├── sentAt, deliveredAt, openedAt
└── timestamp
```

---

## Módulos del Sistema

### Módulo 1: Registro Público (User-facing)
- Formulario dinámico según tipo de evento
- Validación en tiempo real
- Selecci´on de asiento (mapas interactivos)
- Confirmación y pre-registro

### Módulo 2: Portal de Pago
- Visualización de datos y métodos de pago
- Carga de comprobante (drag & drop)
- Selección de método usado
- Estado del registro en tiempo real

### Módulo 3: Panel Administrativo
- Autenticación multi-organizador
- Dashboard de estadísticas
- Gestión de registros pendientes
- Verific de comprobantes
- Mapa de asientos
- Registros manuales (día evento)
- Reportes y exportación

### Módulo 4: Sistema de Notificaciones
- Motor de emails (preconfirmación, recordatorios, confirmación)
- Personalización de templates
- Planificación con Bull (job queues)
- Retry automático en fallos

### Módulo 5: Generación de Credenciales
- Renderización dinámica de PDFs
- Generación de códigos QR únicos
- Descarga/email de credenciales
- Customización por evento

### Módulo 6: Check-in (Móvil/Web)
- Escáner de QR
- Validación de credencial
- Registro de asistencia
- Sincronización offline

### Módulo 7: Reportes & Análisis
- Dashboards dinámicos
- Exportación a Excel/CSV
- Gráficos de conversión
- Auditoría de acciones

---

## Fases de Implementación

### SPRINT 1 (Semanas 1-2): MVP Básico
- Formulario de registro
- Modelo de datos
- Email básico de preconfirmación
- Panel admin: ver pendientes
- Confirmación manual de pagos

### SPRINT 2 (Semanas 3-4): Automatización
- Recordatorios automáticos
- Timeout automático de plazas
- Plantillas de email editables
- Credenciales con PDF

### SPRINT 3 (Semanas 5-6): Características Avanzadas
- Mapa de asientos
- Múltiples tipos de eventos
- Registros manuales (batch)
- Reportes

### SPRINT 4 (Semanas 7-8): Check-in & Pulido
- App móvil de check-in (PWA/React Native)
- Sincronización offline
- Testing completo
- Optimización y deploym

---

## Consideraciones de Seguridad

1. **Validación de inputs** en frontend y backend
2. **HTTPS obligatorio** en todas las conexiones
3. **Protección CSRF** mediante tokens
4. **Rate limiting** en endpoints de carga
5. **Encriptación de datos sensibles** (cédula, comprobante)
6. **Autenticación multi-factor** para admin (TOTP/2FA)
7. **Logs de auditoría** de todas las acciones admin
8. **Sanitización de archivos** antes de guardar (escaneador antivirus)
9. **Tokens de pago** con vencimiento
10. **Validación de referrer** en links de email

---

## Estimaciones de Esfuerzo

*Ver documento separado "PLAN_TRABAJO.md"*

---

## Costos Estimados

*Ver documento separado "PRESUPUESTO.md"*
