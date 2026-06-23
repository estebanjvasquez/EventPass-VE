# Presupuesto Detallado: Sistema de Registro para Eventos

**Fecha de Estimación:** Junio 2026
**Duración del Proyecto:** 8 semanas
**Total de Horas:** 320 horas
**Tarifa Horaria Promedio:** $60 USD/hora

---

## SECCIÓN 1: COSTO DE DESARROLLO

### 1.1 Recursos Humanos

| Rol | Horas | Tarifa/h | Subtotal |
|-----|-------|----------|----------|
| Full Stack Engineer (1) | 160 | $75 | $12,000 |
| Backend Engineer (1) | 90 | $70 | $6,300 |
| Frontend Engineer (1) | 50 | $65 | $3,250 |
| DevOps/Infrastructure | 20 | $80 | $1,600 |
| **TOTAL HORAS DE DESARROLLO** | **320** | | **$23,150** |

**Notas sobre tarifas:**
- Varían según experiencia, región y contexto
- Full Stack más caro por mayor responsabilidad
- Pueden reducirse si es equipo interno
- Incluye meetings, code reviews, documentación

---

## SECCIÓN 2: INFRAESTRUCTURA (Año 1)

### 2.1 Hosting Backend

**Opción A: AWS (Recomendado para escala)**
- EC2 t3.medium: $40/mes × 12 = $480
- RDS PostgreSQL (db.t3.small): $50/mes × 12 = $600
- S3 (almacenamiento de comprobantes): $50/mes × 12 = $600
- CloudFront CDN: $25/mes × 12 = $300
- **Subtotal AWS:** $1,980/año

**Opción B: DigitalOcean (Más económico)**
- App Platform (256MB RAM): $12/mes × 12 = $144
- PostgreSQL Managed (db-s-1vcpu-1gb): $60/mes × 12 = $720
- Spaces (almacenamiento de archivos): $5/mes × 12 = $60
- **Subtotal DigitalOcean:** $924/año

**Opción Recomendada:** AWS (mejor escalabilidad)
**Costo Anual:** $1,980

### 2.2 Frontend Hosting

**Vercel o Netlify (recomendado para React)**
- Plan Pro: $20/mes × 12 = $240
- Incluye: SSL, CDN, builds ilimitados

**Costo Anual:** $240

### 2.3 Base de Datos: Backup & Redundancia

**AWS RDS Backup:**
- Snapshots automáticos: Incluido
- Backups incrementales: Incluido
- **Costo Anual:** $0 (incluido en RDS)

### 2.4 Dominio & SSL

**Dominio .com/.com.co:**
- Registración anual: $12
- SSL (Let's Encrypt): $0 (gratis)
- **Costo Anual:** $12

### 2.5 Email Service

**SendGrid (para envío masivo de emails)**
- Plan básico: 100 emails/día gratis
- Plan Essentials (si excedes): $19.95/mes × 12 = $240
- Supongamos 10 eventos/mes, 500 registros c/u = 5,000 emails/mes = necesita plan pago
- **Estimado Anual:** $240

*Alternativa: Mailgun - $35/mes = $420/año para garantizar entrega confiable*

**Costo Anual Recomendado:** $240 (SendGrid) - $420 (Mailgun)

### 2.6 Redis / Cache

**AWS ElastiCache (Redis):**
- cache.t3.micro: $25/mes × 12 = $300
- O incluido en algunos planes de host

**Costo Anual:** $300

### 2.7 Monitoreo & Logging

**Sentry (error tracking):**
- Plan Starter: $29/mes × 12 = $348

**DataDog (infrastructure monitoring):**
- Plan Pro: $35/mes × 12 = $420

**Cloudflare (DDoS + analytics):** $20/mes × 12 = $240

**Costo Anual Total Monitoreo:** $1,008

### 2.8 Documentación & APIs

**Swagger/OpenAPI:** $0 (open source)
**GitHub Pro:** $21/mes × 12 = $252

**Costo Anual:** $252

---

## SECCIÓN 3: HERRAMIENTAS & SOFTWARE

### 3.1 Licencias de Desarrollo

| Herramienta | Costo Anual | Notas |
|------------|-----------|-------|
| GitHub Pro (2 desarrolladores) | $252 | O GitHub Enterprise $231/user/mes |
| VS Code | $0 | Gratis (open source) |
| Figma (diseño) | $0 | Opcional, usar open source si no |
| Postman | $156 | Team plan, $13/mes |
| **Subtotal** | **$408** | |

### 3.2 Librerías & Frameworks (Desarrollo)

Todas las principales son **open source gratuitas:**
- React, Node.js, PostgreSQL, Prisma, Express
- Costo: $0

---

## SECCIÓN 4: TESTING & QA

| Ítem | Costo |
|-----|-------|
| Testing Manual (incluido en dev) | $0 |
| Automated Testing (Jest, Cypress) | $0 (open source) |
| Load Testing (JMeter/Artillery) | $0 (open source) |
| Staging Environment | Incluido en AWS |
| **Subtotal** | **$0** |

---

## SECCIÓN 5: SEGURIDAD & COMPLIANCE

| Ítem | Costo Anual |
|-----|-----------|
| SSL Certificate | $0 (Let's Encrypt) |
| 2FA/MFA (TOTP) | $0 (open source) |
| Security Audit Inicial | $500 (one-time) |
| Penetration Testing | $1,500 (one-time, recomendado) |
| **Subtotal Año 1** | **$2,000** |
| **Subtotal Años Siguientes** | **$500** |

---

## SECCIÓN 6: CAPACITACIÓN & DOCUMENTACIÓN

| Ítem | Costo |
|-----|-------|
| Manual de usuario (incluido) | $0 |
| Training session (3 horas) | $300 |
| Video tutorial (grabado) | $200 |
| Documentación técnica | Incluido |
| **Subtotal** | **$500** |

---

## RESUMEN DE COSTOS - AÑO 1

### Desarrollo (One-time)
- Recursos Humanos: **$23,150**
- Security Audit: **$500**
- Penetration Testing: **$1,500**
- **SUBTOTAL DESARROLLO:** **$25,150**

### Infraestructura & Operaciones (Anual)
- Hosting Backend (AWS): **$1,980**
- Hosting Frontend (Vercel): **$240**
- Email Service: **$240**
- Redis/Cache: **300**
- Monitoreo: **$1,008**
- GitHub/Tools: **$408**
- Capacitación: **$500**
- **SUBTOTAL INFRAESTRUCTURA:** **$4,676**

### **TOTAL AÑO 1: $29,826**

---

## DESGLOSE MENSUAL (Año 1)

**Primer mes (todas las herramientas + dev):**
- Desarrollo: $23,150 / 8 semanas ≈ $2,894/semana
- Infraestructura: ~$400
- **Total Mes 1:** ~$3,294

**Meses 2-12 (solo operaciones):**
- Hosting + Herramientas: **$389/mes**
- Maintenance (10% horas): **$600-800/mes** (opcional)
- **Total Meses 2-12:** **$989-1,189/mes**

---

## AÑOS POSTERIORES (Año 2+)

### Infraestructura Recurrente
| Concepto | Costo Anual |
|----------|-----------|
| AWS Hosting | $1,980 |
| Frontend Hosting | $240 |
| Email Service | $240 |
| Redis | $300 |
| Monitoreo | $1,008 |
| Herramientas | $408 |
| Mantenimiento (estimado 5%) | $1,500 |
| **TOTAL ANUAL** | **$5,676** |

---

## ESCENARIOS DE COSTO

### ESCENARIO 1: Startup (Presupuesto Ajustado)

**Reducciones posibles:**
- Usar team interno (reduce tarifas)
- DigitalOcean en lugar de AWS: **-$1,056**
- Monitoreo básico (solo Sentry): **-$672**
- Training online en lugar de presencial: **-$200**

**Nuevo Total Año 1:** ~**$27,000**

### ESCENARIO 2: Enterprise (Premium)

**Adiciones:**
- Arquitectura multi-region: **+$2,000**
- Redundancia de BD (RDS Multi-AZ): **+$600**
- Equipo 24/7 on-call: **+$5,000**
- Compliance auditing anual: **+$2,000**

**Nuevo Total Año 1:** ~**$39,000**

---

## OPCIONES DE PAYMENT

### Opción 1: Pago Inicial (Recomendado)
- 50% al inicio: **$14,913**
- 50% al completar MVP (Semana 2): **$14,913**
- **Total:** $29,826

### Opción 2: Pagos Mensuales
- Semanas 1-2: 25% = **$7,456**
- Semanas 3-4: 25% = **$7,456**
- Semanas 5-6: 25% = **$7,456**
- Semanas 7-8: 25% = **$7,456**
- **Total:** $29,826

### Opción 3: Pago Escalonado por Features
- MVP (Semanas 1-2): 35% = **$10,439**
- Automatización (Semanas 3-4): 30% = **$8,948**
- Avanzadas (Semanas 5-6): 20% = **$5,965**
- Check-in & Deploy (Semanas 7-8): 15% = **$4,474**
- **Total:** $29,826

---

## DESGLOSE POR COMPONENTE (si se implementa por fases)

| Componente | Costo Desarrollo | % |
|-----------|----------------|---|
| Registro + Admin Básico | $8,000 | 27% |
| Automatización de Recordatorios | $4,500 | 15% |
| Generación de Credenciales | $3,500 | 12% |
| Mapa de Asientos | $4,000 | 13% |
| Check-in App | $5,000 | 17% |
| Testing + Deployment | $2,650 | 9% |
| Infraestructura | $4,676 | - |
| **TOTAL** | **$29,826** | **100%** |

---

## COSTOS OCULTOS A CONSIDERAR

1. **Cambios en Requirements:** +15-20% si hay scope creep
2. **API de Terceros (si se integran):** $100-500/mes
3. **Compliance/Legales (GDPR, protección de datos):** $1,000-2,000
4. **Mantenimiento post-deployment:** 5-10% del desarrollo/año
5. **Escalabilidad en el futuro:** Puede requerir re-arquitectura

---

## RETORNO DE INVERSIÓN (ROI)

**Supuestos:**
- 20 eventos/año
- 500 registros/evento en promedio
- 10,000 registros/año
- Comisión de sistema: $1-2 por registro
- O venta del sistema: $100-500/mes por cliente

**Ingresos Potenciales:**
- Modelo comisión: $10,000-20,000/año
- Modelo SaaS: $1,200-6,000/año (12-60 clientes)

**Break-even:**
- ~2-3 años si es SaaS multicliente
- ~2-4 meses si es solución única con buena comisión

---

## GARANTÍA & SOPORTE POST-LANZAMIENTO

**Incluido en el presupuesto:**
- 30 días de soporte técnico (bugs críticos)
- Documentación completa
- 1 sesión de training

**Soporte Extendido (opcional):**
- Plan mensual: $300/mes (bugs + features menores)
- Plan horario: $50/hora (ad-hoc)

---

## NOTAS FINALES

1. **Este presupuesto es una estimación** basada en desarrollo remoto, tarifa media Latam/EEUU
2. **Puede variar** según ubicación geográfica del equipo
3. **Infraestructura puede reducirse** si usas alternativas más baratas
4. **Tiempo de desarrollo puede optimizarse** con equipo senior
5. **Recomendamos presupuestar +20%** para contingencias

---

## PRÓXIMOS PASOS

1. [ ] Revisar y validar presupuesto con stakeholders
2. [ ] Acordar modelo de pago (inicial, mensual, escalonado)
3. [ ] Asignar recursos del equipo
4. [ ] Iniciar infraestructura en Semana 1
5. [ ] Establecer hitos de entrega

---

## CONTACTO PARA ACLARACIONES

Para preguntas sobre este presupuesto:
- Revisar documento PLAN_TRABAJO.md para detalles de horas
- Consultar ANÁLISIS_SISTEMA_REGISTRO_EVENTOS.md para features
- Contactar directamente para variables específicas
