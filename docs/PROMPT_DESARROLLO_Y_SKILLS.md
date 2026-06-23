# Prompt de Desarrollo & Skills Necesarios

---

## PARTE 1: PROMPT PARA DEVELOPMENT

### Contexto General del Proyecto

```
PROYECTO: Sistema de Registro y Gestión de Eventos

DESCRIPCIÓN:
Desarrollar una plataforma web integral para gestionar registros de eventos 
con validación de pagos, generación de credenciales y check-in.

FLUJO PRINCIPAL:
1. Usuario llena formulario online y recibe email de preconfirmación
2. Usuario carga comprobante de pago con límite de 10 días
3. Sistema envía recordatorios automáticos cada 2-3 días
4. Organizador verifica manualmente comprobantes en panel admin
5. Sistema libera plaza si no se completa pago en 10 días
6. Credenciales con QR se generan y envían al usuario
7. App móvil permite check-in leyendo código QR

ARQUITECTURA:
- Frontend: React 18 + Vite + Tailwind CSS + Shadcn/ui
- Backend: Node.js + Express + Prisma + PostgreSQL
- Caché: Redis (para job queues y sesiones)
- Email: SendGrid (envío masivo)
- Almacenamiento: AWS S3 (comprobantes)
- Job Scheduler: Bull (recordatorios automáticos)
- PDF/QR: React-pdf + qrcode.react

STACK COMPLETO:
- Autenticación: JWT + Refresh tokens
- Base de datos: PostgreSQL 15+
- ORM: Prisma
- Task Queue: Bull + Redis
- Validación: Zod
- Testing: Jest + Supertest
- API Docs: Swagger/OpenAPI
- Hosting: AWS (EC2 + RDS) o DigitalOcean
- CI/CD: GitHub Actions

MÓDULOS A DESARROLLAR:
1. Formulario de Registro Dinámico
   - Validación en tiempo real
   - Soporte para múltiples tipos de eventos
   - Selección de asiento (para foros)
   
2. Portal de Pago (Usuario)
   - Carga de comprobante con drag & drop
   - Selección de método de pago
   - Visualización de detalles
   
3. Panel Administrativo
   - Dashboard con estadísticas
   - Gestión de registros pendientes
   - Verificación de comprobantes
   - Mapa de asientos interactivo
   - Registros manuales (CSV + formulario)
   - Reportes y exportación
   
4. Sistema de Notificaciones
   - Emails: preconfirmación, recordatorios, confirmación, rechazo
   - Plantillas customizables
   - Job queue automático con Bull
   
5. Generación de Credenciales
   - PDF dinámico con datos del evento
   - Código QR único por usuario
   - Descarga + envío por email
   
6. App Check-in (PWA)
   - Lectura de código QR
   - Validación de credencial
   - Registro de asistencia
   - Soporte offline

CARACTERÍSTICAS ESPECIALES:
- Timeout automático: liberar plaza si no paga en 10 días
- Recordatorios automáticos: días 3, 7, 9
- Mapa de asientos: visualización y precios dinámicos
- Múltiples tipos de eventos: cada tipo puede tener campos diferentes
- Auditoría completa: logging de todas las acciones admin
- Exportación de datos: registros, reportes, lista de asistentes

CONSIDERACIONES CRÍTICAS:
- Seguridad: HTTPS, CSRF tokens, rate limiting
- Performance: caché de Redis, CDN para PDFs
- Escalabilidad: job queues para evitar bloqueos
- Confiabilidad: retry de emails fallidos, backups de BD
- UX: responsive design, validaciones clara, feedback inmediato

HITOS DEL PROYECTO:
- Sprint 1 (Semanas 1-2): MVP básico (registro + admin + email)
- Sprint 2 (Semanas 3-4): Automatización (recordatorios, timeouts)
- Sprint 3 (Semanas 5-6): Avanzadas (mapa asientos, reportes)
- Sprint 4 (Semanas 7-8): Check-in + deployment

ESTRUCTURA DEL REPOSITORIO:
```
/root
├── backend/
│   ├── src/
│   │   ├── config/ (BD, email, auth)
│   │   ├── models/ (Prisma schema)
│   │   ├── routes/ (API endpoints)
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middlewares/
│   │   ├── jobs/ (Bull jobs para recordatorios)
│   │   ├── utils/
│   │   └── main.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── tests/
│   ├── .env.example
│   ├── package.json
│   └── docker-compose.yml
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── form/ (registro)
│   │   │   ├── payment/ (carga comprobante)
│   │   │   ├── admin/ (panel administrativo)
│   │   │   └── checkin/ (app móvil)
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/ (API calls)
│   │   ├── store/ (Zustand state)
│   │   ├── utils/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   ├── .env.example
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── docs/
│   ├── ARQUITECTURA.md
│   ├── API.md
│   ├── MANUAL_USUARIO.md
│   └── MANUAL_ADMIN.md
└── README.md
```

DEPENDENCIAS CRÍTICAS (No cambiar):
- Validación de email único (crítico para evitar duplicados)
- Timeout de 10 días (requisito funcional)
- Recordatorios en días 3, 7, 9 (configurables pero estos son default)
- QR con formato estándar (para lectura universal)
- PostgreSQL para persistencia (no SQLite)

DECISIONES DE DISEÑO YA TOMADAS:
✓ TypeScript (type safety)
✓ Prisma ORM (migrations fáciles, type-safe)
✓ Redis para cache y job queues (escalable)
✓ SendGrid para emails (confiable)
✓ AWS S3 para archivos (seguro, escalable)
✓ Shadcn/ui para componentes (accesibilidad)
✓ Tailwind CSS (utility-first, consistente)
✓ React Query para fetch (caché inteligente)
✓ JWT para auth (stateless)

OBJETIVOS DE CALIDAD:
- 80%+ cobertura de tests
- Lighthouse score 85+
- Tiempo respuesta < 200ms (p95)
- Disponibilidad 99.5%
- WCAG 2.1 AA compliance

NO INCLUIR:
- Pagos directos (solo validación de comprobante)
- Integración con Stripe/PayPal (fuera de scope)
- Autenticación social (email/password solo)
- Multi-idioma (español latino)
- Mobile app nativa (PWA es suficiente)

DESPUÉS DEL MVP:
Posibles features futuras (NO en scope actual):
- Integración con sistemas de pago en línea
- Generación de reportes PDF complejos
- Inteligencia artificial para detección de fraude
- Integración con CRM
- APIs para terceros
```

### Instrucciones Específicas por Sprint

#### SPRINT 1 PROMPT (Semanas 1-2)

```
FOCO: Establecer base sólida del proyecto

TAREAS EXACTAS (en orden):
1. Setup del repositorio
   - Inicializar Git con main + develop branches
   - Crear estructura de carpetas
   - Configurar .gitignore, .env.example

2. Backend Base
   - Node.js + Express + TypeScript
   - Prisma schema inicial (Events, Registrations, Users, PaymentMethods)
   - PostgreSQL local (Docker compose)
   - Configuración de variables de entorno
   - Autenticación JWT básica

3. Base de Datos
   - Schema completo con relaciones correctas
   - Migration inicial
   - Seeds de ejemplo

4. Frontend Base
   - React + Vite + TypeScript
   - Tailwind CSS + Shadcn/ui
   - Layout base con navegación
   - Zustand store (auth)
   - React Query configurado

5. Formulario de Registro
   - Component con React Hook Form + Zod
   - Campos: nombre, email, teléfono, tipo evento
   - Validación en tiempo real
   - Integración con backend

6. API de Registro
   - POST /registrations (crear registro)
   - Validación de email único
   - Reserva de plaza
   - Respuesta clara (éxito/error)

7. Email Service
   - SendGrid API key configurada
   - Template de preconfirmación
   - Envío automático al registrarse

8. Admin Básico
   - Login de admin
   - Listado de registros pendientes
   - Vista simple de detalles
   - Botones: Confirmar / Rechazar

9. Admin API
   - GET /admin/registrations
   - PATCH /registrations/:id (confirmar/rechazar)
   - Validación de permisos

10. Testing
    - Tests unitarios de validación
    - Tests de integración de registro
    - Tests de email sending

CRITERIOS DE ACEPTACIÓN:
□ Usuario puede registrarse completamente
□ Email de preconfirmación llega
□ Admin ve registros y puede confirmar
□ Base de datos persiste correctamente
□ No hay errores en consola
□ Tests pasen 100%
```

#### SPRINT 2 PROMPT (Semanas 3-4)

```
FOCO: Automatización completa del flujo

TAREAS (en orden):
1. Redis + Bull Setup
   - Redis local (Docker)
   - Bull queues configuradas
   - Conexión estable

2. Portal de Pago
   - Página con link único de pago
   - Formulario de carga de comprobante
   - Drag & drop de archivos
   - Selección de método de pago
   - Validación de tipo de archivo (solo images/PDF)

3. S3 Setup
   - AWS S3 bucket configurado
   - Políticas de seguridad
   - Backend endpoint para upload

4. Comprobante API
   - POST /registrations/:id/payment-proof (upload)
   - Validación de tamaño (max 5MB)
   - Guardar en S3
   - Cambiar estado a "pendiente verificación"

5. Sistema de Recordatorios
   - Job con Bull para recordatorios
   - Calcular días faltantes
   - Enviar email en días 3, 7, 9
   - Plantilla de email dinámico

6. Timeout Automático
   - Job para revisar registros vencidos
   - Cambiar estado a "cancelado"
   - Liberar plaza
   - Enviar email de notificación

7. Credencial PDF
   - Componente React que genera PDF
   - Incluir: datos usuario, evento, QR único
   - Descargable
   - Envío por email

8. Admin Mejorado
   - Vista de comprobantes pendientes
   - Vista previa de imagen
   - Filtros por estado
   - Búsqueda por nombre/email

9. Email Log
   - Registrar envíos de email
   - UI para ver estado de emails
   - Retry manual

10. Testing
    - Tests de job scheduling
    - Tests de timeout
    - Tests de PDF generation

CRITERIOS DE ACEPTACIÓN:
□ Recordatorios se envían automáticamente
□ Plazas se liberan en timeout
□ PDF con QR se genera correctamente
□ Admin ve estado de comprobantes
□ Todos los emails llegan
□ Jobs funcionan sin interrupciones
```

#### SPRINT 3 PROMPT (Semanas 5-6)

```
FOCO: Características avanzadas y reportes

TAREAS (en orden):
1. Tipos de Eventos
   - Modelo para tipos de evento
   - CRUD en admin
   - Campos dinámicos por tipo
   - Validación según tipo

2. Mapa de Asientos
   - Componente Konva.js o alternativa
   - Renderizar asientos en grid
   - Estados: disponible, reservado, confirmado
   - Click para reservar
   - Admin: click para ver usuario

3. Precios Dinámicos
   - Precio puede variar por tipo de asiento
   - Admin puede configurar
   - Frontend muestra precio al seleccionar

4. CSV Import
   - Endpoint para upload de CSV
   - Parsear CSV
   - Validar datos
   - Crear registros batch
   - Confirmar pago automático

5. Reportes
   - Dashboard con gráficos
   - Tasa de conversión
   - Método de pago más usado
   - Ingresos proyectados vs confirmados
   - Exportación a Excel

6. Admin Avanzado
   - Exportar registros a CSV
   - Filtros complejos
   - Bulk actions (confirmar varios)
   - Anotaciones en registros

7. Auditoría
   - Logging de todas las acciones
   - Quién confirmó qué y cuándo
   - Vista de auditoría en admin

8. Testing
    - Tests de importación CSV
    - Tests de reportes
    - Tests de mapa de asientos

CRITERIOS DE ACEPTACIÓN:
□ Mapa de asientos funciona y es responsive
□ CSV import sin errores
□ Reportes muestran datos correctos
□ Admin puede hacer todas las operaciones
□ Exportación a Excel funciona
```

#### SPRINT 4 PROMPT (Semanas 7-8)

```
FOCO: Check-in y producción

TAREAS (en orden):
1. PWA Setup
   - Service worker configurado
   - Offline support
   - Install banner

2. Lectura de QR
   - Componente para lectura QR
   - Usar cámara web
   - Procesar QR scaneado
   - Feedback visual

3. Check-in Endpoint
   - GET /check-in/scan/:qrcode
   - Validar credencial
   - Registrar asistencia
   - Retornar estado

4. Check-in UI
   - Pantalla de lectura
   - Mostrar resultado (éxito/error)
   - Historial de escans
   - Offline sync

5. Infraestructura
   - AWS EC2 setup
   - RDS PostgreSQL
   - Configuración de environment
   - Backups automáticos

6. Deployment
   - CI/CD en GitHub Actions
   - Build automático
   - Tests antes de deploy
   - Rollback procedures

7. Seguridad
   - Audit de seguridad
   - HTTPS/SSL
   - Rate limiting
   - CORS configurado

8. Testing Final
   - E2E tests de flujo completo
   - Load testing
   - Testing de offline mode

9. Documentación
   - Manual de usuario
   - Manual de admin
   - Guía de troubleshooting
   - API documentation

10. Training
    - Grabación de video
    - Sesión viva de training
    - Q&A

CRITERIOS DE ACEPTACIÓN:
□ Check-in lee QR correctamente
□ Sistema online 24/7
□ Offline funciona después de sync
□ Backups funcionan
□ 0 critical bugs
□ Cliente trained y ready
```

---

## PARTE 2: SKILLS A INSTALAR

### Skills Principales (Requeridas)

1. **design-taste-frontend**
   - Uso: Diseño de interfaz de usuario consistente
   - Cuándo usar: Al crear componentes UI, maquetación
   - Comando: `/design-taste-frontend`

2. **code-review**
   - Uso: Revisar código en PRs
   - Cuándo usar: Antes de mergear a main
   - Comando: `/code-review`

3. **verify**
   - Uso: Verificar que las features funcionen en vivo
   - Cuándo usar: Después de completar feature importante
   - Comando: `/verify`

4. **claude-api**
   - Uso: Referencia de modelos, pricing, features
   - Cuándo usar: Si necesitas usar IA para validaciones
   - Comando: `/claude-api`

### Skills Secundarias (Opcionales pero Recomendadas)

5. **data:sql-queries**
   - Uso: Generar queries complejas de SQL
   - Cuándo usar: Para reportes, análisis de datos
   - Comando: `/data:sql-queries`

6. **data:build-dashboard**
   - Uso: Crear dashboards de datos
   - Cuándo usar: Para reportes administrativos
   - Comando: `/data:build-dashboard`

7. **design:design-system**
   - Uso: Mantener consistencia de diseño
   - Cuándo usar: Al escalar componentes UI
   - Comando: `/design:design-system`

8. **update-config**
   - Uso: Configurar hooks y settings
   - Cuándo usar: Para setup inicial del proyecto
   - Comando: `/update-config`

9. **schedule**
   - Uso: Agendar tareas recurrentes
   - Cuándo usar: Para deployments, backups
   - Comando: `/schedule`

10. **security-review**
    - Uso: Auditoría de seguridad
    - Cuándo usar: Antes de ir a producción
    - Comando: `/security-review`

### Installation Instructions

```bash
# Verificar skills disponibles
claude --list-skills

# No necesitan instalación, usar directamente
# Ejemplo:
/design-taste-frontend
/code-review --comment
/verify
```

---

## PARTE 3: VARIABLES DE ENTORNO REQUERIDAS

### Backend (.env)

```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/event_registration_db

# JWT
JWT_SECRET=tu_super_secret_key_aqui_minimo_32_caracteres
JWT_REFRESH_SECRET=otro_secret_key_minimo_32_caracteres
JWT_EXPIRY=24h

# Email
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@tudominio.com

# AWS S3
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1
AWS_S3_BUCKET=event-registration-bucket

# Redis
REDIS_URL=redis://localhost:6379

# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173

# Stripe (futuro)
# STRIPE_SECRET_KEY=sk_test_xxx
```

### Frontend (.env)

```
VITE_API_URL=http://localhost:3001/api
VITE_APP_NAME=Sistema Registro Eventos
VITE_ENVIRONMENT=development
```

---

## PARTE 4: COMANDOS DE DESARROLLO

```bash
# Backend
npm install
npm run dev           # Inicia servidor + hot reload
npm run build         # Build para producción
npm test              # Ejecutar tests
npm run migrate       # Ejecutar migrations
npm run seed          # Seed de base de datos

# Frontend
npm install
npm run dev           # Inicia dev server
npm run build         # Build para producción
npm run lint          # Linting
npm test              # Tests
npm run preview       # Preview de build

# Docker (para DB)
docker-compose up     # Inicia PostgreSQL + Redis
docker-compose down   # Detiene servicios
```

---

## PARTE 5: PROCESO DE DESARROLLO RECOMENDADO

1. **Crear rama feature**
   ```bash
   git checkout -b feature/nombre-feature
   ```

2. **Desarrollar**
   ```bash
   npm run dev          # Backend + Frontend
   ```

3. **Test local**
   ```bash
   npm test
   /verify
   ```

4. **Code review**
   ```bash
   /code-review --fix
   ```

5. **Commit**
   ```bash
   git add .
   git commit -m "feat: descripción clara"
   ```

6. **Push y PR**
   ```bash
   git push origin feature/nombre-feature
   # Crear PR en GitHub
   ```

7. **Merge a main después de aprobación**
   ```bash
   # CI/CD automático

8. **Deploy a producción**
   ```bash
   # Automático via GitHub Actions
   ```

---

## PARTE 6: TESTING STRATEGY

### Unit Tests
- Validadores (Zod schemas)
- Servicios de negocio
- Funciones auxiliares

### Integration Tests
- Endpoints de API
- Base de datos
- Email sending

### E2E Tests
- Flujo completo de registro
- Admin confirma pago
- Check-in en evento

### Load Testing
- 1000+ registros simultáneos
- Lectura de QR bajo carga

---

## DOCUMENTACIÓN POR COMPLETAR

- [ ] ARQUITECTURA.md - Diseño técnico detallado
- [ ] API.md - Documentación de endpoints
- [ ] MANUAL_USUARIO.md - Guía para usuarios finales
- [ ] MANUAL_ADMIN.md - Guía para organizadores
- [ ] DEPLOYMENT.md - Guía de deployment
- [ ] TROUBLESHOOTING.md - Solución de problemas
- [ ] SECURITY.md - Consideraciones de seguridad

---

## CONTACTO & ESCALAMIENTO

Si durante desarrollo:
- Encuentras bloqueadores: contacta al PO
- Necesitas cambiar requirements: documenta en issue
- Requerimientos de seguridad adicionales: escalona al equipo de seguridad
- Performance issues: contacta al DevOps
