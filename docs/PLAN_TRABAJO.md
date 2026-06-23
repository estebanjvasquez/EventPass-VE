# Plan de Trabajo: Sistema de Registro para Eventos

## Duración Total Estimada: 8 semanas (320 horas)

---

## SPRINT 1: MVP Básico (Semanas 1-2) - 80 horas

### Semana 1: Setup & Infraestructura

#### Tareas
1. **Setup del Proyecto**
   - Inicializar repositorio Git
   - Configurar estructura de carpetas frontend/backend
   - Configurar CI/CD (GitHub Actions)
   - Documentación del setup local
   - **Horas:** 8h
   - **Responsable:** Full Stack

2. **Base de Datos & ORM**
   - Diseño e implementación de schema (Prisma)
   - Migrations iniciales
   - Setup de PostgreSQL local + remota
   - **Horas:** 12h
   - **Responsable:** Backend

3. **Autenticación Backend**
   - JWT setup
   - Endpoints de login/logout
   - Middleware de autenticación
   - **Horas:** 10h
   - **Responsable:** Backend

4. **Frontend Setup**
   - React + Vite configurado
   - Tailwind CSS + Shadcn/ui instalados
   - Layout base con navegación
   - **Horas:** 10h
   - **Responsable:** Frontend

5. **Email Service Setup**
   - SendGrid configurado
   - Plantillas base de email
   - **Horas:** 6h
   - **Responsable:** Backend

6. **Documentación API**
   - Swagger/OpenAPI configurado
   - Primeros endpoints documentados
   - **Horas:** 4h
   - **Responsable:** Backend

**Total Semana 1:** 50h

### Semana 2: MVP Registro & Admin

#### Tareas
1. **Formulario de Registro**
   - Component React con validación
   - Integración con backend
   - Validación de email único
   - **Horas:** 12h
   - **Responsable:** Full Stack

2. **Backend: Endpoints de Registro**
   - POST /registrations (crear registro)
   - POST /registrations/validate (validación)
   - GET /events/{id} (obtener detalles)
   - **Horas:** 10h
   - **Responsable:** Backend

3. **Email de Preconfirmación**
   - Template de preconfirmación
   - Envío automático al registrarse
   - Link único de pago (token)
   - **Horas:** 8h
   - **Responsable:** Backend

4. **Panel Admin Básico**
   - Autenticación admin
   - Dashboard con listado de registros
   - Filtros básicos (estado, fecha)
   - **Horas:** 14h
   - **Responsable:** Frontend + Backend

5. **Admin: Confirmar/Rechazar Pago**
   - Endpoints PATCH /registrations/:id
   - UI para confirmación
   - Email de respuesta
   - **Horas:** 6h
   - **Responsable:** Full Stack

**Total Semana 2:** 50h

**Total SPRINT 1:** 100h (ajustado para testing básico)

---

## SPRINT 2: Automatización & Notificaciones (Semanas 3-4) - 80 horas

### Semana 3: Sistema de Recordatorios

#### Tareas
1. **Job Queue Setup (Bull + Redis)**
   - Redis configurado (local + remota)
   - Bull queues configuradas
   - **Horas:** 8h
   - **Responsable:** Backend

2. **Scheduler de Recordatorios**
   - Job para enviar emails cada X horas
   - Lógica de cálculo de días faltantes
   - Plantillas personalizables
   - **Horas:** 12h
   - **Responsable:** Backend

3. **Timeout Automático de Plazas**
   - Job para liberar plazas no pagadas
   - Actualización de estado
   - Email de notificación al usuario
   - **Horas:** 10h
   - **Responsable:** Backend

4. **Portal de Pago (Usuario)**
   - Página para cargar comprobante
   - Drag & drop de archivos
   - Selección de método de pago
   - **Horas:** 12h
   - **Responsable:** Frontend

5. **Backend: Carga de Comprobante**
   - Endpoint POST para recibir archivo
   - Validación de tipo/tamaño
   - Almacenamiento en S3
   - **Horas:** 8h
   - **Responsable:** Backend

**Total Semana 3:** 50h

### Semana 4: Credenciales & Mejoras

#### Tareas
1. **Generación de PDF con QR**
   - Librería react-pdf integrada
   - Generación dinámica de QR
   - Template customizable
   - **Horas:** 14h
   - **Responsable:** Full Stack

2. **Mejora Panel Admin**
   - Vista previa de comprobantes
   - Búsqueda avanzada
   - Exportación básica (CSV)
   - **Horas:** 10h
   - **Responsable:** Frontend

3. **Email Log & Debugging**
   - Registro de envíos de email
   - UI para ver estado de emails
   - Resend de emails fallidos
   - **Horas:** 8h
   - **Responsable:** Backend

4. **Testing Unitario (MVP)**
   - Tests de componentes principales
   - Tests de endpoints críticos
   - **Horas:** 8h
   - **Responsable:** QA/Full Stack

**Total Semana 4:** 40h

**Total SPRINT 2:** 90h

---

## SPRINT 3: Características Avanzadas (Semanas 5-6) - 100 horas

### Semana 5: Múltiples Tipos de Eventos

#### Tareas
1. **Gestión de Tipos de Eventos**
   - Crear/editar tipos de evento
   - Campos dinámicos por tipo
   - Configuración de precios
   - **Horas:** 12h
   - **Responsable:** Full Stack

2. **Mapa de Asientos (Foros)**
   - Componente de mapa interactivo (Konva.js)
   - Seleccionar asiento en registro
   - Visualización en admin (con estados)
   - **Horas:** 18h
   - **Responsable:** Frontend + Backend

3. **Métodos de Pago Dinámicos**
   - Configurar múltiples métodos por evento
   - Mostrar dinámicamente en UI
   - **Horas:** 8h
   - **Responsable:** Full Stack

4. **Registros Manuales (CSV Import)**
   - Upload y parsing de CSV
   - Validación bulk
   - Confirmación inmediata de pago
   - **Horas:** 14h
   - **Responsable:** Backend + Frontend

5. **Reportes Básicos**
   - Dashboard con gráficos (Recharts)
   - Tasa de conversión
   - Métodos de pago más usados
   - **Horas:** 8h
   - **Responsable:** Frontend

**Total Semana 5:** 60h

### Semana 6: Pulido & Reportes Avanzados

#### Tareas
1. **Reportes Avanzados**
   - Exportación a Excel
   - Gráficos de ingresos
   - Auditoría de acciones admin
   - **Horas:** 12h
   - **Responsable:** Backend + Frontend

2. **Personalización de Credenciales**
   - Custom fields en PDF
   - Logo/branding del evento
   - Opciones de formato
   - **Horas:** 10h
   - **Responsable:** Frontend

3. **Mejoras UX/UI**
   - Responsive design
   - Optimización de performance
   - Accesibilidad (WCAG 2.1 AA)
   - **Horas:** 12h
   - **Responsable:** Frontend

4. **Testing de Integración**
   - Flujo completo de registro
   - Emails automáticos
   - **Horas:** 10h
   - **Responsable:** QA/Backend

5. **Documentación para Cliente**
   - Manual de usuario
   - Guía de admin
   - **Horas:** 6h
   - **Responsable:** Full Stack

**Total Semana 6:** 50h

**Total SPRINT 3:** 110h

---

## SPRINT 4: Check-in & Deployment (Semanas 7-8) - 100 horas

### Semana 7: Check-in y Sincronización

#### Tareas
1. **App Check-in (PWA)**
   - Progressive Web App con soporte offline
   - Lector de QR (web camera)
   - Validación de credencial
   - **Horas:** 16h
   - **Responsable:** Frontend

2. **Backend: Check-in Endpoints**
   - POST /check-in/scan (validar QR)
   - GET /attendees (estado de asistencia)
   - Sincronización offline
   - **Horas:** 12h
   - **Responsable:** Backend

3. **Optimización Mobile**
   - Responsive para tablets
   - Touch optimizado
   - **Horas:** 8h
   - **Responsable:** Frontend

4. **Testing End-to-End**
   - Scenarios críticos
   - Teste de carga (load testing)
   - **Horas:** 12h
   - **Responsable:** QA

5. **Seguridad & Hardening**
   - Audit de seguridad
   - Rate limiting
   - CORS configurado
   - **Horas:** 8h
   - **Responsable:** Backend

**Total Semana 7:** 56h

### Semana 8: Deployment & Stabilización

#### Tareas
1. **Infraestructura & Deployment**
   - AWS/DigitalOcean setup
   - SSL/TLS configurado
   - Backups automatizados
   - **Horas:** 12h
   - **Responsable:** DevOps/Backend

2. **Monitoreo & Alertas**
   - Sentry configurado
   - DataDog o alternativa
   - Alertas críticas
   - **Horas:** 8h
   - **Responsable:** Backend

3. **Training al Cliente**
   - Sesión de capacitación
   - Hands-on del panel admin
   - Q&A session
   - **Horas:** 6h
   - **Responsable:** Full Stack

4. **Bugs & Refinamientos**
   - Corrección de issues
   - Mejoras menores
   - **Horas:** 12h
   - **Responsable:** Full Stack

5. **Documentación Final**
   - Guía de operaciones
   - API documentation
   - Troubleshooting guide
   - **Horas:** 6h
   - **Responsable:** Full Stack

**Total Semana 8:** 44h

**Total SPRINT 4:** 100h

---

## Resumen de Horas por Rol

| Rol | Horas | % |
|-----|-------|---|
| Full Stack (1) | 160 | 50% |
| Backend (1) | 90 | 28% |
| Frontend (1) | 50 | 16% |
| DevOps/Infra | 20 | 6% |
| **TOTAL** | **320** | **100%** |

---

## Hitos del Proyecto

- **Fin Semana 2:** MVP funcional (registro + admin básico)
- **Fin Semana 4:** Automatización completa (recordatorios, credenciales)
- **Fin Semana 6:** Todas features core completadas
- **Fin Semana 8:** Sistema listo para producción + training

---

## Riesgos Identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|--------|-----------|
| Retrasos en integración de pagos | Media | Alto | Usar librería estándar, testing temprano |
| Problemas de performance en mapa de asientos | Media | Medio | Usar librería optimizada (Konva.js) |
| Cambios de requirements | Alta | Medio | Validación mensual con cliente |
| Problemas de email delivery | Baja | Alto | Usar SendGrid (deliverability confiable) |
| Retrasos en infraestructura | Baja | Medio | Provisionar temprano (Semana 1) |

---

## Dependencias Externas

1. **Clave API SendGrid** - para envío de emails
2. **AWS S3 Bucket** (o MinIO) - para almacenar comprobantes
3. **Base de Datos PostgreSQL** - hosting en la nube
4. **Dominio** - para emails desde tu dominio
5. **Certificado SSL** - para HTTPS

---

## Criterios de Aceptación por Sprint

### SPRINT 1 MVP
- [ ] Formulario funcional con validación
- [ ] Email de preconfirmación enviado
- [ ] Admin puede confirmar/rechazar pagos
- [ ] Datos persisten en BD

### SPRINT 2 Automatización
- [ ] Recordatorios enviados automáticamente
- [ ] Plazas liberadas en timeout
- [ ] Credenciales con QR generadas
- [ ] Portal de carga funcional

### SPRINT 3 Avanzadas
- [ ] Múltiples tipos de eventos configurables
- [ ] Mapa de asientos visualizado
- [ ] Import CSV funciona
- [ ] Reportes muestran datos correctos

### SPRINT 4 Check-in
- [ ] App check-in lee QR
- [ ] Sistema online durante evento
- [ ] Sincronización funciona
- [ ] Zero critical bugs

---

## Entregables

1. Código fuente en Git (privado)
2. Documentación técnica completa
3. Manual de usuario en español
4. Manual de admin en español
5. API documentation (Swagger)
6. Scripts de backup/restore
7. Guía de troubleshooting
8. Video tutorial (setup + uso)
9. Acceso a ambiente staging + producción
10. Training session grabado
