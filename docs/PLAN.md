# Gmail Agent Platform — Plan de Proyecto

**Versión:** 2.0  
**Fecha:** 2026-05-31  
**Objetivo:** Plataforma de agentes IA que gestiona automáticamente una cuenta Gmail personal, extrae inteligencia financiera y entrega resúmenes accionables vía Telegram.

---

## Resultado esperado al finalizar

- [ ] Todos los correos entrantes se clasifican, etiquetan y archivan automáticamente
- [ ] Los correos ya etiquetados por reglas de Gmail se marcan como leídos y se clasifican
- [ ] Un resumen diario llega a las 7am por Telegram
- [ ] Las compras y gastos reportados por banco se consolidan en un balance mensual
- [ ] Los tiquetes aéreos generan una notificación inmediata
- [ ] El histórico de correos no leídos fue procesado una única vez
- [ ] Un dashboard web permite consultar el estado del sistema e informes financieros
- [ ] Todo corre en un VPS en contenedores Docker

---

## Pre-requisitos externos

- [x] **Gmail API**: OAuth2 configurado, credenciales descargadas, tema Pub/Sub creado
- [x] **Telegram Bot**: bot creado, token y Chat ID guardados, mensaje de prueba exitoso
- [x] **VPS Hetzner**: Rocky Linux 9, 4GB RAM, Docker instalado — IP: `178.105.173.245`

---

## Fase 1 — Fundación

- [x] **Fase 1 completada**

**Entregables:**
- [x] Monorepo pnpm workspaces con 8 packages
- [x] TypeScript compartido, ESLint, Prettier
- [x] Docker Compose con PostgreSQL (5432) y Redis (6379)
- [x] Schema Prisma con tablas: `emails`, `transactions`, `daily_summaries`, `monthly_reports`, `classification_rules`, `process_logs`
- [x] Migración inicial ejecutada, Prisma Client generado
- [x] Package `shared`: tipos base `ClassificationResult`, `EmailAction`, `EmailJob`, colas BullMQ

**Criterio de éxito:** `docker compose up` levanta todos los servicios. `pnpm build` compila sin errores.

---

## Fase 2 — Gmail + Agente Clasificador

**Objetivo:** El sistema lee correos, los clasifica con IA, los etiqueta en Gmail y aprende reglas de archivado.

- [x] **Fase 2 completada**

---

### 2.1 — Gmail OAuth2 + lectura de correos
- [x] Flujo OAuth2 (`pnpm authorize:gmail` genera y guarda refresh token)
- [x] Leer correos del inbox: metadatos, cuerpo, etiquetas, snippet
- [x] Marcar como leído (`removeLabelIds: ['UNREAD']`)
- [x] Archivar (`removeLabelIds: ['INBOX']`)
- [x] Obtener etiquetas del usuario

---

### 2.2 — Email Ingestion Service
- [x] Polling cada 5 minutos — trae los 200 correos más recientes del inbox
- [x] Webhook `POST /webhook/gmail` para Pub/Sub (tiempo real)
- [x] Cola BullMQ `email.new` con intentos y backoff exponencial
- [x] Deduplicación: Redis SET + check en tabla `emails`
- [x] Logs de procesamiento en tabla `process_logs`

---

### 2.3 — Agente Clasificador (Claude Haiku)
- [x] Integración con Claude API (`claude-haiku-4-5-20251001`)
- [x] Prompt caching en system prompt (reduce costos)
- [x] Reglas rápidas sin Claude: por remitente conocido o etiqueta Gmail
- [x] Clasificación: `{ action, category, confidence, reasoning }`
- [x] `confidence < 0.7` → `UNCLASSIFIED`
- [x] Parser robusto de JSON: extrae JSON aunque Claude lo envuelva en markdown
- [x] Manejo de errores fatales: sin crédito / API key inválida → `UnrecoverableError` (no reintenta)
- [x] Errores transitorios (429, 5xx) → BullMQ reintenta con backoff
- [x] Resultados guardados en tabla `emails`
- [ ] **BUG:** action worker no aplica etiquetas Gmail — solo saca del inbox sin etiquetar *(corregido en 2.7)*

---

### 2.4 — Clasificación especial: Bancos
- [x] Subclasificación: `marketing | extracto_mensual | transaccion | fraude | otro`
- [x] `marketing` → ARCHIVE
- [x] `extracto_mensual` → SUMMARY
- [x] `transaccion` → PERSONAL + cola `transaction.new`
- [x] `fraude` → PERSONAL + cola `notification.urgent` (prioridad máxima)

---

### 2.5 — Clasificación especial: Aerolíneas
- [x] Detecta tiquetes/reservas confirmadas (excluye marketing y recordatorios)
- [x] Extrae: aerolínea, origen, destino, fecha, código de reserva, número de vuelo
- [x] Publica en cola `notification.urgent` con datos del vuelo

---

### 2.6 — Sincronización de etiquetas y filtros Gmail *(NUEVO)*
- [x] Tabla `gmail_labels`: sincroniza todas las etiquetas del usuario al arrancar y cada hora
  - Guarda: `gmailId`, `name`, `type` (system/user), visibilidad
- [x] Tabla `gmail_filters`: sincroniza todos los filtros configurados por el usuario en Gmail
  - Guarda: `gmailFilterId`, `criteria` (from, to, subject, query), `actions` (addLabelIds, markRead, etc.)
- [x] Worker `label-sync.worker.ts` en `email-ingestion`: corre al arrancar + cada hora
- [x] Método `GmailClient.listFilters()` que llama a `users.settings.filters.list`
- [x] Migración Prisma con los dos modelos nuevos

**Criterio:** Al arrancar `email-ingestion`, la tabla `gmail_labels` tiene todas las etiquetas del usuario y `gmail_filters` tiene todos sus filtros. Se puede consultar via Prisma.

---

### 2.7 — Corrección: action worker aplica etiqueta en Gmail *(BUG FIX)*
- [x] Mapeo de `action + category` a etiqueta Gmail de destino:

  | Action | Etiqueta destino |
  |--------|-----------------|
  | `ARCHIVE` + categoría | Etiqueta de la categoría (ej. `Agente/bancos`) |
  | `PERSONAL` | `Agente/personal` |
  | `SUMMARY` | `Agente/resúmenes` |
  | `UNCLASSIFIED` | `Agente/pendiente` |

- [x] Sistema crea las etiquetas `Agente/*` automáticamente si no existen al arrancar
- [x] `ClassifiedEmailJob` incluye `targetLabelName` sugerido (calculado por el classifier)
- [x] `action.worker.ts`: llama `addLabelIds: [labelId]` además del `removeLabelIds` existente
- [x] Para `UNCLASSIFIED`: solo agrega etiqueta, NO remueve de inbox, NO marca como leído

**Criterio:** Un email clasificado como `ARCHIVE/banco` aparece en Gmail con la etiqueta `Agente/bancos` y sale del inbox.

---

### 2.8 — Inbox Advisor: mover correos con reglas conocidas *(NUEVO)*
- [x] Worker `inbox-advisor.worker.ts` en `email-ingestion`, corre cada 10 minutos
- [x] Lee correos del inbox que no tienen registro en la tabla `emails` (no procesados aún)
- [x] Por cada correo, evalúa en orden:
  1. `gmail_filters`: ¿hay un filtro del usuario que aplique a este remitente o asunto?
  2. `classification_rules`: ¿hay una regla aprendida para este dominio o remitente?
- [x] Si hay match → publica en cola `email.move-proposal` con la etiqueta destino
- [x] Worker `move-executor.worker.ts` consume la cola y ejecuta en Gmail:
  - `addLabelIds: [labelId]` + `removeLabelIds: ['INBOX']` + `markAsRead`
  - Registra el email en tabla `emails` con `confidence: 1.0` y la fuente de la regla
- [x] Si no hay match → deja el correo para que el polling lo envíe a Claude
- [x] Nuevo tipo `MoveProposalJob` en package `shared`

**Criterio:** Un correo de un dominio con regla conocida (ej. `linkedin.com`) se mueve automáticamente a su etiqueta en menos de 10 minutos, sin llamar a Claude.

---

### 2.9 — Label Scanner: procesar correos ya archivados en etiquetas *(NUEVO)*
- [x] Worker `label-scanner.worker.ts` en `email-ingestion`, corre cada 15 minutos
- [x] Itera sobre etiquetas de usuario en `gmail_labels` (excluye: `INBOX`, `SENT`, `DRAFT`, `SPAM`, `TRASH`, `UNREAD`, `IMPORTANT`)
- [x] Por cada etiqueta, busca hasta 100 mensajes no leídos
- [x] Deduplicación normal (Redis SET + check en `emails`)
- [x] Encola en `email.new` → el classifier analiza normalmente
- [x] El action worker **solo marca como leído** — no mueve (ya está en la etiqueta correcta)
- [x] Método `GmailClient.listUnreadInLabel(labelId, limit)` 

**Criterio:** Los correos no leídos que Gmail movió automáticamente a etiquetas se clasifican y marcan como leídos en el siguiente ciclo de 15 minutos.

---

### 2.10 — Domain Policy Agent: aprender reglas de archivado *(NUEVO)*
- [x] Worker `domain-policy.worker.ts` en `classifier-agent`, corre una vez al día
- [x] Agrupa emails clasificados en BD por `senderDomain`
- [x] Para dominios con ≥ 5 correos clasificados:
  - Si ≥ 80% tienen la misma `action + category` → crea o actualiza `ClassificationRule`
  - Incluye referencia a la etiqueta de destino en `gmail_labels`
- [x] Si ya existe la regla y el patrón cambió → la actualiza
- [x] Genera entrada en `process_logs` con resumen: cuántas reglas creadas/actualizadas
- [x] El campo `isActive` en `ClassificationRule` permite desactivar reglas manualmente

**Criterio:** Después de 24h de operación, la tabla `classification_rules` tiene entradas para los dominios más frecuentes. Los correos de esos dominios ya no consumen tokens de Claude.

---

### Criterio de éxito de Fase 2 (completa)
> 1. Un email nuevo en inbox aparece clasificado, etiquetado y archivado en Gmail en menos de 10 minutos.
> 2. Los correos en etiquetas del usuario se marcan como leídos automáticamente.
> 3. La tabla `classification_rules` crece sola con el uso.

---

## Fase 3 — Notificaciones + Resumen Diario

**Objetivo:** Telegram recibe alertas inmediatas y el resumen diario de las 7am.

- [x] **Fase 3 completada**

### 3.1 — Notifier Service
- [x] `TelegramProvider`: `sendText`, `sendRich` (Markdown), `isAvailable`
- [x] Cola `notification.send` consumida
- [x] Cola `notification.urgent` consumida con prioridad alta
- [x] Reintentos automáticos ante fallas de envío

### 3.2 — Alerta inmediata: tiquetes aéreos
- [x] Mensaje en menos de 2 minutos desde la llegada del correo:
  ```
  ✈️ TIQUETE CONFIRMADO
  Vuelo: Avianca AV123  |  Ruta: BOG → MDE
  Fecha: 15 Jun 2026 · 08:30  |  Reserva: #ABC123
  ```

### 3.3 — Alerta inmediata: fraude bancario
- [x] Mensaje ante fraude/bloqueo detectado con banco y tipo de alerta

### 3.4 — Resumen diario (cron 7:00am)
- [x] Consulta emails del día anterior
- [x] Claude genera resumen conciso
- [x] Estructura: personales / novedades / sin clasificar / gastos del día
- [x] Guardado en `daily_summaries` y enviado por Telegram

**Criterio:** A las 7am llega el resumen. Un email de tiquete genera notificación en < 2 minutos.

---

## Fase 4 — Extracción Financiera y Balance

**Objetivo:** Los correos de bancos alimentan un registro financiero con balance mensual.

- [x] **Fase 4 completada**

### 4.1 — Extractor de transacciones (Claude Sonnet)
- [x] Extrae: banco, monto, moneda, equivalente COP, tipo de cuenta, comercio, fecha, tipo de movimiento
- [x] Aplica a: Bancos + PSE + Nequi + PayPal + Wompi + Global66
- [x] Tasa de cambio del día desde API gratuita
- [x] Guarda en tabla `transactions`, detecta duplicados

### 4.2 — Financial Service API
- [x] `GET /financial/transactions` — lista paginada y filtrable
- [x] `GET /financial/balance/:year/:month` — balance mensual
- [x] `GET /financial/summary/by-bank` y `by-type`

### 4.3 — Balance mensual (cron 1ro de cada mes, 7:00am)
- [x] Totales por banco, tipo de cuenta, categoría
- [x] Guardado en `monthly_reports`
- [x] Enviado por Telegram

**Criterio:** Email de alerta de compra → aparece en `transactions` con monto COP. Endpoint de balance devuelve datos agrupados.

---

## Fase 5 — Procesador Histórico

**Objetivo:** Procesar todos los correos no leídos históricos una única vez.

- [x] **Fase 5 completada**

- [x] Leer todos los correos no leídos (inbox + archivados) en lotes de 50
- [x] Progreso guardado en BD (reanudable — tabla `historical_jobs` con `lastPageToken`)
- [x] Sin notificaciones Telegram durante el proceso (`source: 'historical'` suprime alertas urgentes)
- [x] Al finalizar: reporte por Telegram con totales (encolados, errores)

**Criterio:** Job histórico procesa ≥ 100 emails sin errores. Progreso reanudable.

---

## Fase 6 — Dashboard Web

**Objetivo:** Panel web para monitorear el sistema y consultar informes financieros.

- [x] **Fase 6 completada**

- [x] Estado en tiempo real de cada servicio (via `process_logs` — último log < 10 min)
- [x] Log de emails: tabla paginada con filtros (acción, categoría, remitente, fecha), vista detalle con razonamiento de Claude
- [x] Dashboard financiero: gráficas de gastos por mes (últimos 6), desglose por banco y tipo
- [x] Informes: mensual con tabla de transacciones, exportar CSV (`GET /api/finance/export`)
- [x] Configuración: estado de env vars, conteo de sin clasificar, reglas activas, historial de jobs

**Criterio:** Dashboard accesible en navegador con gráficas de gastos del mes actual.

---

## Fase 7 — Despliegue en VPS

**Objetivo:** El sistema corre 24/7 en el VPS con HTTPS y reinicio automático.

- [ ] **Fase 7 completada**

- [ ] `docker-compose.prod.yml` con volúmenes persistentes y `restart: unless-stopped`
- [ ] Caddy como reverse proxy con SSL automático (Let's Encrypt)
- [ ] Suscripción Pub/Sub de Gmail apuntando al VPS (emails en < 1 minuto)
- [ ] Health checks en todos los servicios

**Criterio:** Recibir email → notificación Telegram en < 2 minutos → dashboard en HTTPS lo muestra. Reiniciar VPS → todos los servicios vuelven solos.

---

## Checkpoints globales

| # | Checkpoint | Fase | Estado |
|---|-----------|------|--------|
| C1 | Credenciales Gmail, Telegram y VPS listas | Pre-requisitos | ✅ |
| C2 | Monorepo compila, DB y Redis corren | Fase 1 | ✅ |
| C3 | Email clasificado y etiquetado correctamente en Gmail | Fase 2 | ✅ |
| C4 | Correos en etiquetas marcados como leídos automáticamente | Fase 2 | ✅ |
| C5 | Reglas de archivado aprendidas por dominio | Fase 2 | ✅ |
| C6 | Telegram recibe resumen diario a las 7am | Fase 3 | ✅ |
| C7 | Tiquete aéreo genera notificación en < 2 minutos | Fase 3 | ✅ |
| C8 | Transacciones bancarias extraídas con monto en COP | Fase 4 | ✅ |
| C9 | Dashboard con gráficas de gastos del mes | Fase 6 | ✅ |
| C10 | Sistema 24/7 en VPS con HTTPS | Fase 7 | ⬜ |

---

## Decisiones técnicas

| Decisión | Elección | Razón |
|----------|----------|-------|
| Lenguaje | TypeScript + Node.js | Stack principal |
| Base de datos | PostgreSQL + Prisma | Consultas financieras complejas |
| Queue | BullMQ + Redis | Reintentos, prioridades, TypeScript-native |
| IA clasificación | Claude Haiku | Costo-eficiencia en volumen |
| IA extracción financiera | Claude Sonnet | Mayor precisión requerida |
| Notificaciones | Interface + Adapters | Intercambiable sin cambiar código |
| Proveedor inicial | Telegram | Gratuito, sin aprobaciones externas |
| VPS | Hetzner 4GB RAM, Rocky Linux 9, Nuremberg | Familia Red Hat, mejor precio, Europa |
| Dashboard | Next.js 14 + shadcn/ui | TypeScript nativo, componentes listos |
| Monorepo | pnpm workspaces | Gestión de dependencias entre packages |
| Concurrencia Claude | 1 worker simultáneo | Evitar rate limit (50k tokens/min en tier 1) |

---

*Este documento es la fuente única de verdad del proyecto. Se actualiza al completar cada ítem.*
