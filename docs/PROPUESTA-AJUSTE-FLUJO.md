# Propuesta: Ajuste del flujo de procesamiento de correos

**Fecha:** 2026-05-31  
**Estado:** Borrador — pendiente aprobación

---

## Diagnóstico del estado actual

### Bug confirmado: el action worker no aplica etiquetas
`action.worker.ts` hace dos cosas solamente:
- `markAsRead(id)` — siempre
- `archive(id)` — si la acción es `ARCHIVE`, que solo llama a `removeLabelIds: ['INBOX']`

Nunca se llama a `addLabelIds`. Es decir: el sistema clasifica correctamente pero luego **no etiqueta** el correo en Gmail, solo lo saca del inbox. Los correos aparecen en "Todos los correos" sin etiqueta.

### Casuística no cubierta: correos ya en etiquetas (reglas de Gmail)
El usuario tiene filtros de Gmail que mueven correos a etiquetas automáticamente. Estos correos:
- Ya están archivados (fuera del inbox)
- Pueden estar sin leer
- Nunca los ve el polling worker (busca solo `in:inbox`)
- Nunca se clasifican ni se marcan como leídos

### Sin tabla de etiquetas en BD
No existe un modelo `GmailLabel`. El campo `labels` en `Email` guarda IDs crudos de Gmail (`INBOX`, `Label_1234567`) sin nombre legible ni contexto.

### Sin tabla de reglas/filtros de Gmail
Los filtros que el usuario configuró en Gmail (mover correos de cierto remitente a cierta etiqueta, marcar como leído, etc.) no se leen ni se guardan. El sistema no sabe qué intención tiene el usuario con cada tipo de correo.

---

## Alcance propuesto

### Proceso A — Inbox: clasificar y etiquetar (ajuste al flujo existente)

**Qué cambia:**
1. Al cargar etiquetas del usuario desde Gmail al arrancar, guardarlas en la nueva tabla `gmail_labels`.
2. Después de clasificar, el action worker aplica la etiqueta Gmail correspondiente según `action` + `category`:

| Action | Label Gmail sugerida |
|--------|----------------------|
| `ARCHIVE` | La etiqueta de categoría (ej. `gmail-agent/bancos`) |
| `PERSONAL` | `gmail-agent/personal` |
| `SUMMARY` | `gmail-agent/resúmenes` |
| `UNCLASSIFIED` | `gmail-agent/pendiente` |

3. El correo se marca como leído siempre.
4. Para `ARCHIVE`: se remueve `INBOX` y se agrega la etiqueta de destino.
5. Para `PERSONAL` / `SUMMARY`: se deja en inbox, solo se agrega la etiqueta y se marca leído.
6. Para `UNCLASSIFIED`: se agrega la etiqueta `pendiente`, permanece en inbox sin leer para revisión manual.

**Archivos afectados:**
- `email-ingestion/src/workers/action.worker.ts` — agregar `addLabelId`
- `email-ingestion/src/gmail/client.ts` — nuevo método `applyLabel(id, labelId)`
- `classifier-agent/src/workers/classifier.worker.ts` — incluir `labelId` sugerido en `ClassifiedEmailJob`
- `shared/src/types/index.ts` — añadir campo `labelId?: string` a `ClassifiedEmailJob`
- `prisma/schema.prisma` — nueva tabla `gmail_labels`

---

### Proceso B — Label Scanner: correos ya archivados con etiquetas (nuevo)

**Qué hace:**
- Corre en `email-ingestion`, proceso independiente del polling de inbox.
- Consulta Gmail buscando mensajes no leídos en cada etiqueta de usuario (excluye labels del sistema: `INBOX`, `SENT`, `DRAFT`, `SPAM`, `TRASH`).
- Por cada correo no leído encontrado:
  1. Lo descarga y encola en `email.new` como cualquier otro correo.
  2. El classifier lo analiza normalmente.
  3. El action worker lo marca como leído (sin moverlo — ya está en la etiqueta correcta).
- Deduplicación igual que el polling: Redis SET + check en tabla `emails`.
- Corre cada 15 minutos (configurable).

**Archivos nuevos:**
- `email-ingestion/src/workers/label-scanner.worker.ts`

**Archivos afectados:**
- `email-ingestion/src/main.ts` — arrancar el nuevo worker
- `email-ingestion/src/gmail/client.ts` — método `listUnreadInLabel(labelId)`

---

### Proceso C — Domain Policy Agent: sugerencia de reglas de archivado (nuevo)

**Qué hace:**
- Proceso batch en `classifier-agent`, corre una vez al día (o bajo demanda).
- Agrupa los correos ya clasificados en BD por `senderDomain`.
- Para dominios con ≥ 5 correos clasificados, analiza el patrón:
  - Si ≥ 80% de los correos de un dominio tienen la misma `action` → sugiere una `ClassificationRule`.
  - Si ya existe una regla para ese dominio, la actualiza si cambió el patrón.
- También lee las etiquetas de la tabla `gmail_labels` para incluir la label de destino sugerida en la regla.
- Genera un log en `process_logs` con el resumen de reglas creadas/actualizadas.

**Comportamiento esperado:**
```
dominio: nequi.com.co → 12 correos → 100% ARCHIVE/banco
→ crea ClassificationRule { senderDomain: 'nequi.com.co', action: ARCHIVE, category: 'banco' }

dominio: linkedin.com → 8 correos → 100% ARCHIVE/redes_sociales
→ crea ClassificationRule { senderDomain: 'linkedin.com', action: ARCHIVE, category: 'redes_sociales' }
```

**Archivos nuevos:**
- `classifier-agent/src/workers/domain-policy.worker.ts`

**Archivos afectados:**
- `classifier-agent/src/index.ts` — arrancar el worker / schedule

---

### Proceso E — Inbox Advisor: propuesta de movimiento basada en reglas y etiquetas (nuevo)

**Qué hace:**
- Proceso independiente en `email-ingestion`, corre cada 10 minutos.
- Lee los correos que están en **inbox sin clasificar** (sin etiqueta del sistema / `UNCLASSIFIED` en BD o sin registro).
- Para cada correo, busca en este orden:
  1. **Reglas de Gmail** (tabla `gmail_filters`): ¿hay algún filtro que aplique a este remitente o asunto?
  2. **Etiquetas existentes** (tabla `gmail_labels`): ¿el correo ya tiene una etiqueta del usuario asignada?
  3. **ClassificationRule** en BD: ¿hay una regla por dominio o remitente aprendida?
- Si encuentra una coincidencia con suficiente confianza, **propone** mover el correo a la etiqueta correspondiente publicando en una nueva cola `email.move-proposal`.
- Un worker separado consume esa cola y aplica el movimiento en Gmail (`addLabelIds` + `removeLabelIds: ['INBOX']`) + marca como leído.
- Si no hay coincidencia, lo deja en inbox para que el clasificador Claude lo procese en el siguiente ciclo.

**Diferencia clave con el clasificador Claude:**  
Este proceso no llama a Claude — usa solo las reglas conocidas (filtros Gmail + reglas aprendidas). Es determinístico, rápido y sin costo de tokens. Claude entra solo para los correos que no tienen regla clara.

**Schema nuevo:**
```prisma
model GmailFilter {
  id            String   @id @default(uuid())
  gmailFilterId String   @unique          // ID del filtro en Gmail
  criteria      Json                      // { from, to, subject, query, hasAttachment, ... }
  actions       Json                      // { addLabelIds, removeLabelIds, markRead, markImportant, ... }
  syncedAt      DateTime @default(now())

  @@map("gmail_filters")
}
```

**Archivos nuevos:**
- `email-ingestion/src/workers/inbox-advisor.worker.ts`
- `email-ingestion/src/workers/move-executor.worker.ts`

**Archivos afectados:**
- `email-ingestion/src/gmail/client.ts` — método `listFilters()`, método `moveToLabel(id, addLabelId, removeLabelIds?)`
- `email-ingestion/src/main.ts` — arrancar los nuevos workers
- `prisma/schema.prisma` — agregar modelo `GmailFilter`
- `shared/src/types/index.ts` — nuevo tipo `MoveProposalJob`

---

### Proceso D — Sincronización de etiquetas y filtros Gmail (nuevo, base para todo lo anterior)

**Qué hace:**
- Al arrancar `email-ingestion`, sincroniza:
  1. **Etiquetas Gmail** → tabla `gmail_labels` (nombre, tipo system/user, visibilidad)
  2. **Filtros Gmail** → tabla `gmail_filters` (criterios: remitente, asunto, query; acciones: mover a label, marcar leído, etc.)
- También corre cada hora para capturar cambios que el usuario haga en Gmail.
- `email-ingestion` expone la lista de etiquetas y filtros en BD para que el inbox-advisor y el classifier los consuman.

**Schemas nuevos:**
```prisma
model GmailLabel {
  id          String   @id @default(uuid())
  gmailId     String   @unique
  name        String
  type        String   // "system" | "user"
  isVisible   Boolean  @default(true)
  syncedAt    DateTime @default(now())

  @@map("gmail_labels")
}

model GmailFilter {
  id            String   @id @default(uuid())
  gmailFilterId String   @unique
  criteria      Json     // { from, to, subject, query, hasAttachment }
  actions       Json     // { addLabelIds, removeLabelIds, markRead, markImportant }
  syncedAt      DateTime @default(now())

  @@map("gmail_filters")
}
```

**Archivos nuevos:**
- `email-ingestion/src/workers/label-sync.worker.ts` — sincroniza labels + filters

**Archivos afectados:**
- `email-ingestion/src/gmail/client.ts` — método `listFilters()`
- `prisma/schema.prisma` — agregar modelos `GmailLabel` y `GmailFilter`
- Nueva migración de Prisma

---

## Diagrama del flujo propuesto

```
Startup + cada hora
 └── label-sync.worker → gmail_labels + gmail_filters (tablas BD)   ← NUEVO (D)

Gmail INBOX
 ├── inbox-advisor.worker (cada 10 min)                              ← NUEVO (E)
 │    ├── Busca en gmail_filters si hay regla para el remitente
 │    ├── Busca en ClassificationRule si hay regla aprendida
 │    ├── Si coincide → email.move-proposal
 │    │    └── move-executor.worker → applyLabel + removeInbox + markRead
 │    └── Si no coincide → deja para el polling normal
 │
 └── polling.worker (cada 5 min) — solo los que inbox-advisor no resolvió
      └── → email.new → classifier (Claude)
                             └── email.classified
                                  └── action.worker
                                       ├── markAsRead
                                       ├── applyLabel(labelId)       ← CORREGIDO (A)
                                       └── [ARCHIVE] removeInbox

Gmail Etiquetas de usuario (no leídos)                               ← NUEVO (B)
 └── label-scanner.worker (cada 15 min)
      └── → email.new → classifier (Claude) → email.classified
                                                   └── action.worker
                                                        └── markAsRead
                                                            (sin mover — ya está en su label)

BD — cada día
 └── domain-policy.worker                                            ← NUEVO (C)
      ├── Agrupa emails clasificados por senderDomain
      └── Crea/actualiza ClassificationRule
```

---

## Orden de implementación sugerido

| # | Proceso | Prioridad | Dependencias |
|---|---------|-----------|--------------|
| D | Label-sync: tablas `gmail_labels` + `gmail_filters` | Alta | Base para todo |
| A | Corregir action worker — aplicar etiqueta en Gmail | Alta | D |
| E | Inbox Advisor — mover correos con reglas conocidas | Alta | D |
| B | Label Scanner — clasificar correos ya en etiquetas | Media | D |
| C | Domain Policy Agent — aprender reglas por dominio | Media | A, B |

---

## Decisiones pendientes de confirmación

1. **¿Cómo mapear `action + category` a label Gmail?** (Proceso A)  
   - a) Crear labels fijas del sistema (`gmail-agent/bancos`, `gmail-agent/personal`, etc.) automáticamente al arrancar.
   - b) Usar las etiquetas que ya tiene el usuario en Gmail — el sistema elige la más parecida por nombre.
   - c) Híbrido: el sistema crea las labels si no existen, el usuario puede renombrarlas.
   
   *Recomendación: opción (c)*

2. **¿El inbox-advisor aplica los movimientos automáticamente o los sugiere para aprobación?** (Proceso E)  
   - Automático: más eficiente, riesgo de mover algo incorrecto.
   - Sugiere + aprueba: requiere UI o comando manual.
   
   *Recomendación: automático, con log detallado de cada movimiento aplicado. Se puede desactivar por filtro si hay errores.*

3. **¿El domain policy agent crea reglas automáticamente o solo las sugiere?** (Proceso C)  
   *Recomendación: crear automáticamente con log. El campo `isActive` permite desactivarlas manualmente.*

4. **¿El label scanner procesa TODOS los correos no leídos en labels o solo los recientes?** (Proceso B)  
   *Recomendación: primeros 100 no leídos por label por ciclo, con dedup normal. Así no colapsa en el primer arranque.*
