# Skills, Herramientas y Dependencias Necesarias

---

## PARTE 1: SKILLS A USAR EN CLAUDE CODE

### Skills Críticas (Usar Regularmente)

#### 1. `/design-taste-frontend`
**Qué es:** Skill especializado en UI/UX que fuerza reglas de diseño consistentes

**Cuándo usar:**
- Crear componentes nuevos
- Revisar diseño de páginas
- Resolver inconsistencias visuales
- Mejorar accesibilidad

**Ejemplo de uso:**
```
/design-taste-frontend

Necesito crear un formulario de registro para eventos.
Campos: nombre, email, teléfono, tipo evento.
Debe ser responsive, validar en tiempo real.
¿Cómo lo estructuro con Shadcn/ui?
```

**Comandos relacionados:**
```bash
/design-taste-frontend  # Sin argumentos
/design-taste-frontend --review  # Revisar existente
```

---

#### 2. `/code-review`
**Qué es:** Revisa código en PRs buscando bugs, eficiencia, reutilización

**Cuándo usar:**
- Antes de mergear a main
- Revisar código de otros developers
- Buscar vulnerabilidades
- Mejorar calidad

**Ejemplo de uso:**
```
/code-review --fix

Revisa el código del formulario de registro.
Busca bugs, seguridad, performance.
```

**Niveles de review:**
```bash
/code-review low      # Bugs críticos solo
/code-review medium   # Bugs + refactoring menor
/code-review high     # Incluir todo
/code-review ultra    # Deep review (cloud multi-agent)
/code-review --comment  # Post como inline comments
/code-review --fix    # Aplica fixes automático
```

---

#### 3. `/verify`
**Qué es:** Ejecuta la app y verifica que funcione

**Cuándo usar:**
- Después de completar feature
- Antes de mergear
- Verificar flujo de usuario
- Testing manual

**Ejemplo de uso:**
```
/verify

Verifica que:
1. Registro funciona end-to-end
2. Email se envía
3. Admin puede confirmar pago
4. Credencial PDF se genera
```

**Qué valida:**
- Funcionamiento en vivo de la app
- UI se renderiza correctamente
- No hay errores en consola
- Flujos críticos completos

---

### Skills de Referencia (Usar cuando Necesites Info)

#### 4. `/claude-api`
**Qué es:** Referencia de Claude API, modelos, precios, features

**Cuándo usar:**
- Preguntar sobre capacidades de Claude
- Pricing y modelo selection
- Caching y batch API
- Tool use y agent creation

**Ejemplo:**
```
/claude-api

¿Qué modelo me recomendas para generar reportes?
¿Hay costo por usar IA en validaciones?
```

---

### Skills Opcionales (Usar si se requieren)

#### 5. `/data:sql-queries`
**Qué es:** Genera queries SQL complejas

**Cuándo usar:**
- Crear reportes complejos
- Análisis de datos
- Migraciones especiales

**Ejemplo:**
```
/data:sql-queries

Necesito una query que muestre:
- Registros por día
- Tasa de conversión
- Ingreso proyectado vs confirmado
```

---

#### 6. `/data:build-dashboard`
**Qué es:** Crea dashboards de datos interactivos

**Cuándo usar:**
- Reportes en tiempo real
- Visualización de métricas
- Admin dashboard

---

#### 7. `/security-review`
**Qué es:** Auditoría de seguridad completa

**Cuándo usar:**
- Antes de lanzar a producción
- Después de Sprint 4
- Validación de HTTPS, JWT, etc.

**Ejemplo:**
```
/security-review

Audita seguridad del sistema:
- Autenticación JWT
- HTTPS/SSL
- Rate limiting
- Validación de inputs
- Manejo de comprobantes
```

---

#### 8. `/schedule`
**Qué es:** Planifica tareas en intervalos

**Cuándo usar:**
- Agendar backups
- Ejecución de jobs periódicos
- Reminders

---

#### 9. `/update-config`
**Qué es:** Configura settings y hooks

**Cuándo usar:**
- Setup inicial
- Configurar permisos
- Variables de entorno

---

## PARTE 2: HERRAMIENTAS DE DESARROLLO (CLI/Local)

### Herramientas Requeridas

```bash
# Node.js & npm
node --version        # v20+ requerido
npm --version         # v10+

# Git
git --version         # v2.40+

# Docker (para BD local)
docker --version      # v24+
docker-compose --version  # v2+

# TypeScript compiler
npx tsc --version

# ESLint (linting)
npx eslint --version
```

### Instalación Inicial

```bash
# Backend setup
cd backend
npm install
npm run migrate:dev
npm run seed
npm run dev

# Frontend setup
cd ../frontend
npm install
npm run dev

# En otra terminal: Base de datos
docker-compose up
```

---

## PARTE 3: DEPENDENCIAS NPM

### Backend (`package.json`)

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "@prisma/client": "^5.0.0",
    "jsonwebtoken": "^9.0.0",
    "@sendgrid/mail": "^7.7.0",
    "bull": "^4.11.0",
    "redis": "^4.6.0",
    "aws-sdk": "^2.1400.0",
    "zod": "^3.22.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.0",
    "express-async-errors": "^3.1.1"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "supertest": "^6.3.0",
    "prisma": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0",
    "tsx": "^3.14.0"
  }
}
```

### Frontend (`package.json`)

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-router-dom": "^6.0.0",
    "zustand": "^4.3.0",
    "@tanstack/react-query": "^4.32.0",
    "react-hook-form": "^7.45.0",
    "zod": "^3.22.0",
    "@hookform/resolvers": "^3.3.0",
    "axios": "^1.4.0",
    "@shadcn/ui": "^0.1.0",
    "tailwindcss": "^3.3.0",
    "qrcode.react": "^1.0.0",
    "@react-pdf/renderer": "^3.1.0",
    "recharts": "^2.10.0",
    "konva": "^9.2.0",
    "react-konva": "^18.2.0",
    "zustand": "^4.3.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^4.4.0",
    "@vitejs/plugin-react": "^4.0.0",
    "tailwindcss": "^3.3.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.45.0"
  }
}
```

---

## PARTE 4: VARIABLES DE ENTORNO

### Backend `.env`

```env
# === DATABASE ===
DATABASE_URL=postgresql://user:password@localhost:5432/event_registration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=event_registration

# === JWT ===
JWT_SECRET=your_super_long_secret_key_minimum_32_characters_1234567890
JWT_REFRESH_SECRET=another_super_long_secret_key_minimum_32_characters_0987654321
JWT_EXPIRY=24h
JWT_REFRESH_EXPIRY=7d

# === SENDGRID (EMAIL) ===
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME="Sistema Registro Eventos"

# === AWS S3 (COMPROBANTES) ===
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
AWS_S3_BUCKET=event-registration-bucket
AWS_S3_URL=https://event-registration-bucket.s3.amazonaws.com

# === REDIS (CACHE & JOBS) ===
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# === APP CONFIG ===
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3001

# === PAYMENT CONFIG ===
PAYMENT_TIMEOUT_DAYS=10
REMINDER_DAYS=3,7,9

# === LOGGING ===
LOG_LEVEL=debug
LOG_FORMAT=json

# === SECURITY ===
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# === SENTRY (ERROR TRACKING) ===
SENTRY_DSN=https://your-sentry-key@sentry.io/xxxx
SENTRY_ENV=development

# === FILE UPLOAD ===
MAX_FILE_SIZE=5242880  # 5MB en bytes
ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf
```

### Frontend `.env`

```env
VITE_API_URL=http://localhost:3001/api
VITE_APP_NAME="Sistema Registro Eventos"
VITE_ENVIRONMENT=development
VITE_VERSION=1.0.0
VITE_LOG_LEVEL=debug
```

---

## PARTE 5: SERVICIOS EXTERNOS REQUERIDOS

### 1. SendGrid (Email)

```
Cuenta: SendGrid (sendgrid.com)
API Key: Necesaria para enviar emails
Plan: Essentials ($20/mes) o Starter (gratis 100/día)
Configuración:
- Crear API key
- Configurar sender domain (SPF + DKIM)
- Verificar email de origen
```

### 2. AWS (S3 + Infraestructura)

```
Servicios necesarios:
- S3: Almacenamiento de comprobantes
- EC2: Servidor backend
- RDS: Base de datos PostgreSQL
- CloudFront: CDN para PDFs
- IAM: Gestión de credenciales

Estimado: $200-300/mes
```

### 3. PostgreSQL (Base de Datos)

```
Opción A: AWS RDS Managed (recomendado)
- db.t3.small: ~$50/mes
- Backups automáticos incluidos

Opción B: Self-hosted (Docker)
- Costo: $0 (si es en tu infraestructura)
- Requiere: gestión manual de backups

Versión mínima: PostgreSQL 14
```

### 4. Redis

```
Opción A: AWS ElastiCache
- cache.t3.micro: ~$25/mes

Opción B: Docker local
- Costo: $0

Necesario para:
- Cache de sesiones
- Bull job queues
- Rate limiting
```

### 5. Dominios y DNS

```
Registro: GoDaddy, Namecheap, etc.
- .com: ~$12/año
- .com.co: ~$20/año

DNS: Cloudflare (gratis)
- CNAME para frontend (Vercel)
- A record para backend (AWS)
```

### 6. Certificado SSL

```
Opción A: Let's Encrypt (recomendado)
- Costo: GRATIS
- Auto-renewal: Automático
- Usado por: Vercel, Nginx

Opción B: AWS Certificate Manager
- Costo: GRATIS
- Para ELB/CloudFront
```

---

## PARTE 6: HERRAMIENTAS DE MONITOREO

### Sentry (Error Tracking)

```
URL: sentry.io
Plan: Developer (gratis) o Team ($49/mes)
Uso: Captura errores en producción
Integración:
- Backend: @sentry/node
- Frontend: @sentry/react
```

### Vercel Analytics

```
URL: vercel.com (incluido en Plan Pro)
Costo: $20/mes
Monitores: Performance, SEO, Core Web Vitals
```

### AWS CloudWatch

```
Incluido en RDS + EC2
Monitores: CPU, memoria, conexiones DB
Alarmas: Puede enviar a SNS/Email
```

---

## PARTE 7: COMANDOS ÚTILES POR FASE

### Setup Inicial (Semana 1)

```bash
# Backend
mkdir event-registration
cd event-registration
npm init -y
npm install express @prisma/client jsonwebtoken @sendgrid/mail bull redis

# Configurar Prisma
npx prisma init
npx prisma migrate dev --name init
npx prisma seed

# Frontend
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router-dom zustand @tanstack/react-query react-hook-form zod
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Desarrollo (Semanas 2-7)

```bash
# Backend: ejecutar en una terminal
npm run dev

# Frontend: ejecutar en otra terminal
npm run dev

# BD local
docker-compose up

# Tests
npm test

# Code quality
npm run lint
npm run format
```

### Deployment (Semana 8)

```bash
# Build
npm run build

# Test build localmente
npm run preview

# Deploy
# Backend: git push (GitHub Actions automático)
# Frontend: Vercel automático

# Verificar salud
curl https://api.yourdomain.com/health
```

---

## PARTE 8: CHECKLIST PRE-DESARROLLO

- [ ] **Node.js v20+** instalado y funcionando
- [ ] **Docker** instalado para PostgreSQL + Redis
- [ ] **GitHub** repo creado y configurado
- [ ] **SendGrid** API key obtenida
- [ ] **AWS** credenciales configuradas
- [ ] **Dominio** registrado y apuntando a nameservers
- [ ] **Variables de entorno** preparadas (.env)
- [ ] **Base de datos** schema diseñado
- [ ] **Equipos** asignados a roles
- [ ] **Reunión de kickoff** programada

---

## PARTE 9: TROUBLESHOOTING RÁPIDO

### Problem: Error de conexión a BD

```bash
# Verificar PostgreSQL está corriendo
docker-compose ps

# Ver logs
docker-compose logs postgres

# Resetear BD
npx prisma migrate reset
```

### Problem: Email no se envía

```bash
# Verificar API key
echo $SENDGRID_API_KEY

# Test de envío
curl --request POST \
  --url https://api.sendgrid.com/v3/mail/send \
  --header "Authorization: Bearer $SENDGRID_API_KEY"
```

### Problem: Jobs no se ejecutan

```bash
# Verificar Redis
redis-cli ping  # debe retornar PONG

# Ver queue en Bull UI
npm install @bull-board/express
```

### Problem: Performance lenta

```bash
# Habilitar Query logging
DATABASE_URL="...?logLevel=query"

# Ver queries lentas
npx prisma studio
```

---

## CONTACTO & SOPORTE

Para preguntas sobre:
- **Setup técnico:** Ver PLAN_TRABAJO.md
- **APIs:** Ver API documentation (Swagger)
- **Problemas:** Revisar logs en Sentry
- **Features:** Referencia ANÁLISIS_SISTEMA_REGISTRO_EVENTOS.md

