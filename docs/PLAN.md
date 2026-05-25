# Gmail Agent Platform — Plan de Proyecto

**Versión:** 1.0  
**Fecha:** 2026-05-23  
**Objetivo general:** Construir una plataforma de agentes IA que gestione automáticamente una cuenta Gmail personal, extraiga inteligencia financiera de los correos, y entregue resúmenes accionables vía Telegram.

---

## Resultado esperado al finalizar

- [ ] Todos los correos entrantes se clasifican y se actúa sobre ellos automáticamente
- [ ] Un resumen diario llega a las 7am por Telegram
- [ ] Las compras y gastos reportados por banco se consolidan en un balance mensual
- [ ] Los tiquetes aéreos generan una notificación inmediata
- [ ] El histórico de correos no leídos fue procesado una única vez
- [ ] Un dashboard web permite consultar el estado del sistema e informes financieros
- [ ] Todo corre en un VPS en contenedores Docker, preparado para migrar a Kubernetes

---

## Pre-requisitos — Configuración externa

Estas tareas deben completarse **antes de escribir código**. Son credenciales y servicios externos que el sistema necesita.

### PR-1 — Gmail API

**Objetivo:** Obtener credenciales OAuth2 para que el sistema lea y modifique tu Gmail.

> **Nota:** Google migró a una nueva interfaz llamada "Google Auth Platform". Los pasos a continuación reflejan esta nueva UI.

**Paso 1 — Crear proyecto**
1. Ir a [https://console.cloud.google.com](https://console.cloud.google.com)
2. Hacer clic en el selector de proyecto (arriba al centro) → **"Proyecto nuevo"**
3. Nombre: `Agente de Gmail` → Crear
4. Asegurarse de que el nuevo proyecto quede seleccionado

**Paso 2 — Habilitar APIs**
1. Menú lateral → **APIs y servicios → Biblioteca**
2. Buscar `Gmail API` → Habilitar
3. Buscar `Cloud Pub/Sub API` → Habilitar

**Paso 3 — Configurar Google Auth Platform (pantalla de consentimiento)**

Ir a **APIs y servicios → Credenciales → "Configurar pantalla de consentimiento"**, o directamente desde el menú lateral buscar **"Google Auth Platform"**.

Se abre un asistente de 4 pasos:

- **Paso 1 — Información de la app:**
  - Nombre de la aplicación: `Gmail Agent`
  - Correo electrónico de asistencia: `fpabon10@gmail.com`
  - Clic en **Siguiente**

- **Paso 2 — Público:**
  - Seleccionar **"Externo"**
  - Clic en **Siguiente**

- **Paso 3 — Información de contacto:**
  - Email: `fpabon10@gmail.com`
  - Clic en **Siguiente**

- **Paso 4 — Finalizar:**
  - Clic en **Crear**

**Paso 4 — Agregar usuario de prueba**
1. En el menú lateral de Google Auth Platform → **"Público"**
2. Sección "Usuarios de prueba" → **"Add users"**
3. Agregar: `fpabon10@gmail.com` → Guardar

**Paso 5 — Crear credenciales OAuth**
1. En el menú lateral de Google Auth Platform → **"Clientes"**
2. Clic en **"Crear cliente"**
3. Tipo de aplicación: **Aplicación de escritorio**
4. Nombre: `gmail-agent-local`
5. Clic en **Crear**
6. **Descargar el JSON** → guardar como `credentials.json` en lugar seguro

**Paso 6 — Crear tema Pub/Sub** *(se configura al desplegar en VPS)*
1. Menú lateral → **Pub/Sub → Temas → Crear tema**
2. Nombre: `gmail-notifications`
3. La suscripción Push se configura en Fase 7 cuando el VPS esté activo

**Checklist PR-1:**
- [x] Proyecto "Agente de Gmail" creado en Google Cloud Console
- [x] Gmail API habilitada
- [x] Cloud Pub/Sub API habilitada
- [x] Google Auth Platform configurado (marca + público externo)
- [x] Email `fpabon10@gmail.com` agregado como usuario de prueba
- [x] Credenciales OAuth2 descargadas (`credentials.json`)
- [x] Tema `gmail-notifications` creado en Pub/Sub

---

### PR-2 — Telegram Bot

**Objetivo:** Crear un bot de Telegram que envíe los resúmenes y alertas.

**Pasos:**

1. Abrir Telegram y buscar **@BotFather**
2. Enviar `/newbot`
3. Nombre del bot: `Gmail Agent` (o el que prefieras)
4. Username del bot: debe terminar en `bot`, ej: `fpabon_gmail_agent_bot`
5. BotFather entregará un **token** — formato: `1234567890:ABCdef...` — guardarlo
6. Para obtener tu **Chat ID**:
   - Enviar cualquier mensaje al bot recién creado
   - Abrir en el navegador: `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
   - Buscar el campo `"id"` dentro de `"chat"` — ese es tu Chat ID
7. Verificar enviando un mensaje de prueba:
   ```
   https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>&text=Hola
   ```

**Checklist PR-2:**
- [x] Bot creado con @BotFather
- [x] Token del bot guardado de forma segura
- [x] Chat ID personal obtenido
- [x] Mensaje de prueba enviado y recibido correctamente

---

### PR-3 — VPS Hetzner

**Objetivo:** Servidor donde correrá el sistema 24/7.

> **Decisiones tomadas:** Rocky Linux 9 (familia Red Hat, compatible con experiencia OpenShift), Regular Performance (mejor precio/rendimiento), Europa (Nuremberg o Helsinki, -$1.00/mes vs USA). SSH key tipo ed25519.

**Pasos:**

1. Crear cuenta en [https://www.hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Entrar al proyecto **Default** → **Create Server**
   - **Location:** Nuremberg o Helsinki (eu-central)
   - **Image:** Rocky Linux 9
   - **Type:** Shared Resources → **Regular Performance** → 4GB RAM, 2 vCPUs
   - **SSH key:** agregar llave pública ed25519
     - Generar en PC: `ssh-keygen -t ed25519 -C "fpabon10@gmail.com"`
     - Copiar con: `cat ~/.ssh/id_ed25519.pub`
3. Clic en **Create & Buy now** → anotar la IP pública asignada
4. Conectarse al servidor:
   ```bash
   ssh root@TU-IP
   ```
5. Instalar dependencias (Rocky Linux usa `dnf`, no `apt`):
   ```bash
   dnf update -y
   dnf install -y dnf-plugins-core git curl
   dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
   dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
   systemctl enable --now docker
   ```
6. Verificar instalación:
   ```bash
   docker --version
   docker compose version
   ```
7. (Opcional pero recomendado) Apuntar un dominio o subdominio a esa IP para HTTPS

**Checklist PR-3:**
- [x] Cuenta Hetzner creada y verificada
- [x] Servidor Rocky Linux 9, Regular Performance (CPX22), Nuremberg creado — IP: `178.105.173.245`
- [x] Llave SSH ed25519 agregada y acceso SSH funcionando
- [x] Docker y Docker Compose instalados en el VPS
- [x] IP del servidor anotada

---

## Fase 1 — Fundación del Proyecto

**Objetivo:** Tener el esqueleto del proyecto corriendo localmente con todos los servicios de infraestructura activos.

**Duración estimada:** 2-3 días

### Entregables

**1.1 — Monorepo configurado**
- [ ] Repositorio git inicializado
- [ ] pnpm workspaces configurado con los 8 packages
- [ ] TypeScript base compartido (tsconfig raíz)
- [ ] ESLint + Prettier configurados
- [ ] Estructura de carpetas creada:
  ```
  gmail-agent/
  ├── packages/
  │   ├── shared/
  │   ├── email-ingestion/
  │   ├── classifier-agent/
  │   ├── summary-agent/
  │   ├── notifier-service/
  │   ├── financial-service/
  │   ├── historical-processor/
  │   └── dashboard/
  ├── prisma/
  ├── infrastructure/
  └── .env.example
  ```

**1.2 — Infraestructura local con Docker Compose**
- [ ] `docker-compose.yml` con PostgreSQL y Redis corriendo
- [ ] PostgreSQL accesible en puerto 5432
- [ ] Redis accesible en puerto 6379
- [ ] Variables de entorno documentadas en `.env.example`

**1.3 — Base de datos**
- [ ] Schema Prisma definido con todas las tablas:
  - `emails`
  - `transactions`
  - `daily_summaries`
  - `monthly_reports`
  - `classification_rules`
  - `process_logs`
- [ ] Migración inicial ejecutada correctamente
- [ ] Prisma Client generado

**1.4 — Contratos del sistema (package `shared`)**
- [ ] Interface `NotificationProvider` definida
- [ ] Tipos base: `ClassificationResult`, `Transaction`, `EmailAction`
- [ ] Enum `EmailAction`: `PERSONAL | SUMMARY | ARCHIVE | UNCLASSIFIED`
- [ ] Compilación del package `shared` sin errores

**Criterio de éxito de Fase 1:**
> Ejecutar `docker compose up` levanta PostgreSQL y Redis. Ejecutar `pnpm build` en el monorepo compila sin errores. Las tablas existen en la base de datos.

---

## Fase 2 — Gmail + Agente Clasificador

**Objetivo:** El sistema puede leer correos de Gmail, clasificarlos con IA y registrar las acciones en base de datos.

**Duración estimada:** 3-4 días

### Entregables

**2.1 — Gmail OAuth2 + lectura de correos**
- [ ] Flujo OAuth2 implementado (genera y guarda refresh token)
- [ ] Función para leer correos de la bandeja de entrada
- [ ] Función para leer metadatos: remitente, asunto, etiquetas, snippet
- [ ] Función para marcar como leído
- [ ] Función para archivar
- [ ] Función para obtener etiquetas existentes del usuario

**2.2 — Email Ingestion Service**
- [ ] Worker que hace polling cada 5 minutos (fallback)
- [ ] Webhook endpoint para recibir push de Gmail Pub/Sub
- [ ] Cola BullMQ `email:new` publicando emails nuevos
- [ ] Deduplicación (no procesar el mismo email dos veces)
- [ ] Logs de ingesta en tabla `process_logs`

**2.3 — Agente Clasificador**
- [ ] Integración con Claude API (Haiku para clasificación)
- [ ] Sistema de reglas rápidas (sin llamada a Claude):
  - Remitentes conocidos → acción directa
  - Etiquetas Gmail ya aplicadas → acción directa
- [ ] Prompt del sistema con esquema de clasificación completo
- [ ] Clasificación devuelve: `{ action, category, confidence, reasoning }`
- [ ] Si `confidence < 0.7` → marcado como `UNCLASSIFIED`
- [ ] Acciones ejecutadas automáticamente en Gmail post-clasificación
- [ ] Resultados guardados en tabla `emails`

**2.4 — Clasificación especial: Bancos**
- [ ] Claude analiza contenido completo del email bancario
- [ ] Subclasificación: `marketing | extracto_mensual | transaccion | fraude | otro`
- [ ] `marketing` → ARCHIVE
- [ ] `extracto_mensual` → SUMMARY
- [ ] `transaccion` → PERSONAL + publicar en cola `transaction:new`
- [ ] `fraude` → PERSONAL (prioridad máxima) + cola `notification:urgent`

**2.5 — Clasificación especial: Aerolíneas**
- [ ] Claude detecta si es tiquete/reserva confirmada
- [ ] Extrae: origen, destino, fecha, número de reserva, aerolínea
- [ ] Publica en cola `notification:urgent` con datos del vuelo

**Criterio de éxito de Fase 2:**
> Enviar un email de prueba a la cuenta de Gmail → en menos de 10 minutos aparece en la tabla `emails` con clasificación asignada y acción ejecutada. El log muestra el razonamiento de Claude.

---

## Fase 3 — Notificaciones + Resumen Diario

**Objetivo:** Telegram recibe alertas inmediatas y el resumen diario de las 7am.

**Duración estimada:** 2 días

### Entregables

**3.1 — Notifier Service**
- [ ] Interface `NotificationProvider` implementada
- [ ] `TelegramProvider` implementado:
  - [ ] `sendText(chatId, message)`
  - [ ] `sendRich(chatId, blocks)` — con formato Markdown de Telegram
  - [ ] `isAvailable()` — health check del bot
- [ ] Proveedor activo configurable por variable de entorno: `NOTIFICATION_PROVIDER=telegram`
- [ ] Cola BullMQ `notification:send` consumida
- [ ] Cola BullMQ `notification:urgent` consumida con prioridad alta
- [ ] Reintentos automáticos ante fallas de envío

**3.2 — Alerta inmediata de tiquetes aéreos**
- [ ] Mensaje enviado al detectar tiquete, formato:
  ```
  ✈️ TIQUETE CONFIRMADO
  Vuelo: Avianca AV123
  Ruta: BOG → MDE
  Fecha: 15 Jun 2026 · 08:30
  Reserva: #ABC123
  ```
- [ ] Mensaje enviado en menos de 2 minutos desde la llegada del correo

**3.3 — Alerta inmediata bancaria crítica**
- [ ] Mensaje enviado ante fraude/bloqueo detectado
- [ ] Incluye banco, tipo de alerta, y enlace al email si disponible

**3.4 — Resumen diario (cron 7:00am)**
- [ ] Cron configurado con zona horaria correcta
- [ ] Consulta emails del día anterior clasificados
- [ ] Claude genera texto conciso del resumen
- [ ] Estructura del mensaje:
  ```
  📬 Resumen · Martes 23 May

  🔴 Para ver personalmente (3)
  • Bancolombia: Alerta movimiento $450.000
  • DIAN: Notificación vencimiento
  • Anny Camargo: mensaje personal

  📋 Novedades (8)
  • MercadoLibre: Pedido #123 enviado
  • Uber: Recibo viaje $18.500
  • Spotify: Cobro mensual $17.900
  • [+5 más]

  ❓ Sin clasificar (2) — requiere ajuste de reglas

  💰 Gastos hoy: $486.400 COP
  ```
- [ ] Guardado en tabla `daily_summaries`
- [ ] Enviado correctamente por Telegram

**Criterio de éxito de Fase 3:**
> A las 7am llega un mensaje de Telegram con el resumen del día. Enviar un email con confirmación de vuelo genera una notificación en menos de 2 minutos.

---

## Fase 4 — Extracción Financiera y Balance

**Objetivo:** Los correos de bancos y pagos alimentan un registro financiero consultable, con balance mensual automático.

**Duración estimada:** 3-4 días

### Entregables

**4.1 — Extractor de transacciones**
- [ ] Claude (Sonnet) extrae de emails de transacción:
  - Banco emisor
  - Monto original y moneda
  - Monto en COP (con tasa de cambio del día)
  - Tipo de cuenta: `cuenta_ahorros | tarjeta_credito | pse | transferencia | nequi`
  - Comercio/destinatario
  - Fecha de la transacción
  - Tipo: `compra | pago | transferencia | retiro | recarga`
- [ ] Aplica a: Bancos + PSE + PayPal + PayU + ePayco + Wompi + Nequi + Global66
- [ ] Tasa de cambio obtenida de API gratuita (exchangerate-api.com)
- [ ] Transacciones guardadas en tabla `transactions`
- [ ] Transacciones duplicadas detectadas y descartadas

**4.2 — Financial Service API**
- [ ] `GET /financial/transactions` — lista paginada y filtrable
- [ ] `GET /financial/balance/:year/:month` — balance mensual calculado
- [ ] `GET /financial/balance/:year` — balance anual con desglose mensual
- [ ] `GET /financial/summary/by-bank` — agrupado por banco
- [ ] `GET /financial/summary/by-type` — agrupado por tipo de cuenta

**4.3 — Balance mensual automático (cron 1ro de cada mes, 7:00am)**
- [ ] Cálculo de totales por banco
- [ ] Cálculo de totales por tipo de cuenta/origen
- [ ] Cálculo de totales por categoría de gasto
- [ ] Guardado pre-calculado en tabla `monthly_reports`
- [ ] Mensaje Telegram con resumen financiero:
  ```
  📊 Balance Mayo 2026

  💳 Total gastado: $3.450.000 COP

  Por banco:
  • BBVA: $1.200.000 (35%)
  • Bancolombia: $980.000 (28%)
  • PSE: $820.000 (24%)
  • Nequi: $450.000 (13%)

  Por origen:
  • Tarjeta crédito: $1.200.000
  • Cuenta ahorros: $980.000
  • PSE: $820.000
  • Billeteras digitales: $450.000

  Top categorías:
  • Compras online: $1.100.000
  • Transporte: $680.000
  • Entretenimiento: $420.000

  Ver detalle completo en el dashboard →
  ```

**Criterio de éxito de Fase 4:**
> Recibir un email de alerta de compra de BBVA → aparece en `transactions` con monto, moneda, equivalente COP y tipo de cuenta. El endpoint `/financial/balance/2026/05` devuelve datos correctos y agrupados.

---

## Fase 5 — Procesador Histórico

**Objetivo:** Procesar todos los correos no leídos históricos una única vez, con reporte de resultados.

**Duración estimada:** 1-2 días

**Nota:** Se ejecuta manualmente una sola vez. Puede pausarse y reanudarse.

### Entregables

**5.1 — Job de procesamiento histórico**
- [ ] Leer todos los correos no leídos (bandeja + archivados)
- [ ] Procesar en lotes de 50 emails (respeta rate limits de Gmail API y Claude)
- [ ] Progreso guardado en base de datos (reanudable si falla a mitad)
- [ ] No genera notificaciones Telegram durante el proceso
- [ ] Clasificación y extracción financiera aplicada igual que en tiempo real

**5.2 — Reporte de proceso**
- [ ] Al finalizar, genera reporte en base de datos:
  - Total emails procesados
  - Desglose por acción (archivados / resumen / personal / sin clasificar)
  - Total transacciones extraídas
  - Errores encontrados
- [ ] Reporte enviado por Telegram al completar:
  ```
  ✅ Proceso histórico completado

  📧 Emails procesados: 4.823
  📁 Archivados: 3.201 (66%)
  📋 En resumen: 891 (18%)
  🔴 Personales: 412 (9%)
  ❓ Sin clasificar: 319 (7%)

  💰 Transacciones extraídas: 1.247
  ⚠️ Errores: 12 (ver dashboard)
  ```

**Criterio de éxito de Fase 5:**
> Ejecutar el job histórico procesa al menos 100 emails sin errores, el progreso se guarda correctamente, y al finalizar llega el reporte por Telegram.

---

## Fase 6 — Dashboard Web

**Objetivo:** Panel web para monitorear agentes, revisar clasificaciones, y consultar informes financieros.

**Duración estimada:** 4-5 días

### Entregables

**6.1 — Estado del sistema**
- [ ] Tarjetas de estado por servicio: email-ingestion, classifier, summary, notifier
- [ ] Último email procesado (tiempo transcurrido)
- [ ] Contadores del día: clasificados, archivados, personales, sin clasificar
- [ ] Alertas visuales ante servicios caídos

**6.2 — Log de emails**
- [ ] Tabla paginada con todos los emails procesados
- [ ] Filtros: por fecha, clasificación, categoría, banco
- [ ] Vista detalle: asunto, remitente, clasificación de Claude, razonamiento
- [ ] Indicador visual de emails sin clasificar (requieren revisión)

**6.3 — Dashboard financiero**
- [ ] Gráfica de gastos por mes (últimos 12 meses)
- [ ] Desglose del mes actual por banco
- [ ] Desglose del mes actual por tipo de cuenta
- [ ] Tabla de transacciones con filtros: banco, tipo, fecha, monto
- [ ] Selector de mes para ver balance histórico
- [ ] Comparación entre dos meses seleccionados

**6.4 — Informes financieros**
- [ ] Vista de informe mensual completo
- [ ] Informe anual con totales por mes
- [ ] Exportar a CSV (transacciones filtradas)

**6.5 — Configuración**
- [ ] Ver y editar número de Telegram destino
- [ ] Ver estado de conexión Gmail
- [ ] Ver conteo de emails sin clasificar (para afinar reglas)

**Criterio de éxito de Fase 6:**
> Acceder al dashboard desde el navegador, navegar a finanzas, seleccionar un mes y ver el desglose de gastos por banco correctamente graficado.

---

## Fase 7 — Despliegue en VPS

**Objetivo:** El sistema corre 24/7 en el VPS, con HTTPS y reinicio automático ante fallos.

**Duración estimada:** 1-2 días

### Entregables

**7.1 — Docker Compose producción**
- [ ] `docker-compose.prod.yml` con configuración de producción
- [ ] Todas las variables sensibles en `.env` (no en el repositorio)
- [ ] Volúmenes persistentes para PostgreSQL y Redis
- [ ] Política de reinicio automático: `restart: unless-stopped`

**7.2 — HTTPS con Caddy**
- [ ] Caddy configurado como reverse proxy
- [ ] Certificado SSL automático (Let's Encrypt)
- [ ] Dashboard accesible por HTTPS en dominio configurado
- [ ] Webhook de Gmail apuntando al endpoint correcto

**7.3 — Gmail Push Notifications activo**
- [ ] Suscripción Pub/Sub apuntando al endpoint del VPS
- [ ] Emails nuevos llegan en menos de 1 minuto (no solo polling)

**7.4 — Monitoreo básico**
- [ ] Logs de todos los servicios accesibles vía `docker compose logs`
- [ ] Health check endpoints en cada servicio
- [ ] Dashboard muestra si algún servicio está caído

**Criterio de éxito de Fase 7:**
> Recibir un email en Gmail → llega notificación en Telegram en menos de 2 minutos → el dashboard en HTTPS muestra el email clasificado. Reiniciar el VPS → todos los servicios vuelven solos.

---

## Resumen de Checkpoints Globales

| # | Checkpoint | Fase |
|---|---|---|
| C1 | Credenciales Gmail, Telegram y VPS listas | Pre-requisitos |
| C2 | Monorepo compila, DB y Redis corren en Docker | Fase 1 |
| C3 | Un email nuevo se clasifica y registra en DB | Fase 2 |
| C4 | Telegram recibe resumen diario a las 7am | Fase 3 |
| C5 | Tiquete aéreo genera notificación inmediata | Fase 3 |
| C6 | Transacciones bancarias se extraen y guardan en COP | Fase 4 |
| C7 | `/financial/balance/:year/:month` devuelve datos correctos | Fase 4 |
| C8 | Histórico procesado y reporte recibido por Telegram | Fase 5 |
| C9 | Dashboard muestra estado, logs y gráficas financieras | Fase 6 |
| C10 | Sistema corre en VPS con HTTPS, sin intervención manual | Fase 7 |

---

## Decisiones técnicas registradas

| Decisión | Elección | Razón |
|---|---|---|
| Lenguaje | TypeScript + Node.js | Stack principal del proyecto |
| Base de datos | PostgreSQL + Prisma | Consultas financieras complejas |
| Queue | BullMQ + Redis | TypeScript-native, reintentos, prioridades |
| IA clasificación | Claude Haiku | Costo-eficiencia en volumen |
| IA extracción financiera | Claude Sonnet | Mayor precisión requerida |
| Notificaciones | Interface + Adapters | Intercambiable sin cambiar código |
| Proveedor inicial | Telegram | Gratuito, sin aprobaciones externas |
| VPS | Hetzner Regular Performance 4GB, Rocky Linux 9 | Familia Red Hat (compatible con experiencia OpenShift), mejor precio/rendimiento, Europa |
| Dashboard | Next.js 14 + shadcn/ui | TypeScript nativo, componentes listos |
| Monorepo | pnpm workspaces | Gestión de dependencias entre packages |

---

*Este documento se actualiza a medida que cada fase se completa.*
