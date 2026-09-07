# Juntos Internal Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que os dois membros criem, editem, excluam e acompanhem compromissos persistentes, incluindo recorrência semanal, na Agenda e na linha do tempo real.

**Architecture:** Next.js expõe um BFF autenticado no mesmo domínio; Fastify autentica a sessão e o store PostgreSQL resolve a associação dentro de transações. Eventos são séries versionadas, com ocorrências calculadas somente para o intervalo solicitado; uma revisão por espaço permite polling sem reenviar conteúdo inalterado. O frontend preserva o formulário em conflitos e atualiza as leituras sem recarregar a página.

**Tech Stack:** Node.js >=22, TypeScript, Next.js 16.3.4, React 19, Fastify 5, PostgreSQL, pg, Zod 4, Vitest, Testing Library, @js-temporal/polyfill.

**Spec:** `docs/superpowers/specs/2026-09-03-agenda-cardapio-casal-design.md`; pré-requisito `docs/superpowers/plans/2026-09-04-juntos-identity-invitations.md` concluído e validado.

## Global Constraints

- “A entrada será uma linha do tempo do dia.”
- “A tela não terá painéis de resumo adicionais.”
- “No celular, a navegação inferior terá quatro destinos: Início, Agenda, Comidas e Compras.”
- “A interface conversará somente com serviços autenticados do próprio aplicativo.”
- “Toda entidade compartilhada carregará a identificação do espaço do casal.”
- “As consultas e alterações validarão essa identificação no servidor.”
- “Operações destrutivas pedirão confirmação.”
- “Nenhuma falha de sincronização será apresentada como sucesso.”
- “Respeito à preferência de movimento reduzido.”
- “Segredos de produção configurados somente nos painéis da Vercel e do Render.”
- Browser não envia `spaceId`, `userId` ou autor. `SessionService.authenticate(token): Promise<PublicUser | null>` permanece intacto; somente `authenticated.user.id` chega ao store.
- Preservar cookies protegidos, proteção de origem, cabeçalhos internos, `Cache-Control: no-store`, limite de corpo 16 KiB e exclusão de `/api/*` do service worker.
- Autenticação: 5/15min; mutações: 120/15min; leituras privadas: 600/15min; chave confiável `x-juntos-client-id`. Um polling por página, 30 segundos, pausado quando hidden/offline.
- Datas de apresentação e recorrência usam `America/Sao_Paulo`, explicitamente indicada no formulário. Instantes de ocorrências carregam offset; não usar timezone do servidor ou `new Date('YYYY-MM-DD')` para calendário civil.
- Escopo desta entrega: eventos internos, série semanal inteira, conflitos otimistas e leitura recente em memória. Integração Google, lembretes Google, exceções por ocorrência, fila offline durável e mesclagem automática por campo pertencem a fases posteriores. Não solicitar escopo Calendar nem criar seu plano antes de validar esta agenda funcionando.
- Cada passo de implementação lê as instruções locais de Next.js em `apps/web/node_modules/next/dist/docs` ou no pacote resolvido pelo workspace antes de usar APIs do framework.

---

## File Structure and Execution Order

Contracts em `packages/contracts/src/agenda.ts`; armazenamento e projeção em `apps/api/src/agenda/`; associação transacional em `apps/api/src/spaces/member-transaction.ts`; migração aditiva `apps/api/migrations/0002_agenda.sql`; rotas `apps/api/src/routes/internal-agenda.ts`. BFF em `apps/web/app/api/agenda/`; rede e polling reutilizáveis em `apps/web/lib/shared/`; formulários e visualizações em `apps/web/features/agenda/`; adaptação da home em `apps/web/features/timeline/`.

Tasks 1–4 constroem o domínio; Task 5 corrige os limites antes do polling; Tasks 6–9 entregam o fluxo; Task 10 valida PostgreSQL real e deploy. Nenhuma tarefa precisa editar a implementação de identidade em paralelo. Confirmar que a Task 5 de identidade terminou antes da Task 6 deste plano. Os commits abaixo são instruções de execução futura; o rascunho não os executa.

### Task 1: Define civil dates, agenda contracts and bounded recurrence

**Files:**
- Create: `packages/contracts/src/agenda.ts`
- Create: `packages/contracts/src/agenda.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/package.json`
- Modify: `package-lock.json`

**Interfaces:** Consumes Zod; produces the following exported types and schemas, with no request identity fields:

```ts
type AgendaFields = {
  title: string; date: string; time: string; durationMinutes: number;
  location: string; notes: string; assigneeId: string | null;
  recurrence: { frequency: 'weekly'; until: string | null } | null;
};
type AgendaEvent = AgendaFields & {
  id: string; spaceId: string; version: number;
  createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
  deletedAt: string | null;
};
type AgendaOccurrence = {
  occurrenceId: string; eventId: string; date: string;
  startsAt: string; endsAt: string; event: AgendaEvent;
};
type SpaceMember = { id: string; name: string; avatarUrl: string | null };
type AgendaQuery = { from: string; to: string; revision?: string };
type AgendaSnapshot = {
  revision: string; from: string; to: string;
  members: SpaceMember[]; occurrences: AgendaOccurrence[];
};
type AgendaRead = { changed: false; revision: string } |
  { changed: true; snapshot: AgendaSnapshot };
type CreateAgendaRequest = { event: AgendaFields };
type UpdateAgendaRequest = { expectedVersion: number; event: AgendaFields };
type DeleteAgendaRequest = { expectedVersion: number; confirmed: true };
type AgendaConflict = { error: 'version_conflict'; current: AgendaEvent };
```

- [ ] **Step 1: Write RED tests.**

```ts
import { expect, it } from 'vitest';
import { agendaFieldsSchema, agendaQuerySchema } from './agenda.js';
it('rejects impossible dates, duration and injected identity', () => {
  const event = { title: 'Aula', date: '2026-09-07', time: '19:00',
    durationMinutes: 90, location: 'Campus', notes: '', assigneeId: null,
    recurrence: { frequency: 'weekly', until: '2026-12-28' } };
  expect(agendaFieldsSchema.parse(event).title).toBe('Aula');
  expect(agendaFieldsSchema.safeParse({ ...event, date: '2026-02-30' }).success).toBe(false);
  expect(agendaFieldsSchema.safeParse({ ...event, durationMinutes: 0 }).success).toBe(false);
  expect(agendaFieldsSchema.safeParse({ ...event, spaceId: crypto.randomUUID() }).success).toBe(false);
  expect(agendaQuerySchema.safeParse({ from: '2026-09-01', to: '2026-11-01' }).success).toBe(false);
});
```

- [ ] **Step 2: Observe RED.** Run `npm --workspace @juntos/contracts test -- agenda`; expected missing module/exports.
- [ ] **Step 3: Implement schemas and date helpers.** Install `npm install --workspace @juntos/contracts @js-temporal/polyfill`; use the package from API/web through contract helpers, not undeclared direct imports. Export `parseCivilDate(value: string): string`, `addCivilDays(date: string, days: number): string`, `civilToday(now?: string): string`, `civilInstant(date: string, time: string): string`, `addInstantMinutes(instant: string, minutes: number): string`, `weekday(date: string): number`. Implement with Temporal:

```ts
import { Temporal } from '@js-temporal/polyfill';
export function parseCivilDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('invalid date');
  return Temporal.PlainDate.from(value).toString();
}
export function addCivilDays(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}
export function weekday(date: string): number {
  return Temporal.PlainDate.from(date).dayOfWeek;
}
export function civilInstant(date: string, time: string): string {
  return Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime('America/Sao_Paulo', { disambiguation: 'reject' }).toInstant().toString();
}
export function addInstantMinutes(instant: string, minutes: number): string {
  return Temporal.Instant.from(instant).add({ minutes }).toString();
}
export function civilToday(now?: string): string {
  return (now ? Temporal.Instant.from(now) : Temporal.Now.instant())
    .toZonedDateTimeISO('America/Sao_Paulo').toPlainDate().toString();
}
```

Use strict Zod objects. `civilDateSchema` calls `parseCivilDate` in a refinement; `time` matches `^(?:[01]\d|2[0-3]):[0-5]\d$`; trimmed title 1–120, location 0–200, notes 0–2000; duration integer 1–1440; IDs UUID; version positive integer; revision decimal string `^\d+$`. Dates 2000-01-01 through 2100-12-31. Query inclusive `from <= to <= addCivilDays(from,41)`. Recurrence until null or >= date and <= addCivilDays(date,730). Response schemas named `agendaEventSchema`, `agendaOccurrenceSchema`, `agendaSnapshotSchema`, `agendaReadSchema`, `agendaConflictSchema`; input schemas `agendaFieldsSchema`, `agendaQuerySchema`, `createAgendaRequestSchema`, `updateAgendaRequestSchema`, `deleteAgendaRequestSchema`. Derive all types with `z.infer`, export through index. Response timestamps ISO UTC strings; `date` and `time` remain civil values.
- [ ] **Step 4: Verify GREEN.** Run `npm --workspace @juntos/contracts test -- agenda` and `npm --workspace @juntos/contracts run typecheck`; require valid leap day, invalid until and unknown-key cases passing.
- [ ] **Step 5: Commit.** `git add packages/contracts package-lock.json`; `git commit -m "feat: define internal agenda contracts"`.

### Task 2: Add agenda persistence and safe membership transaction

**Files:**
- Create: `apps/api/migrations/0002_agenda.sql`
- Create: `apps/api/src/spaces/member-transaction.ts`
- Create: `apps/api/src/spaces/member-transaction.test.ts`
- Create: `apps/api/src/agenda/agenda-migration.test.ts`
- Create: `apps/api/src/agenda/test-database.ts`
- Modify: `apps/api/src/db/migration-runner.test.ts`

**Interfaces:** Consumes `Database = Pick<Pool,'query'|'connect'>`. Produces `withMemberTransaction<T>(db: Database,userId: string,run: (client: PoolClient,spaceId: string)=>Promise<T>): Promise<T>` and `SharedDataError` with `status: 403 | 404 | 409`. Test helper `createAgendaTestDatabase(): Promise<{pool: Pool; identity: PostgresIdentityStore; anaId: string; biaId: string; claraId: string}>` creates real users and two spaces through the identity store, with Ana/Bia joined and Clara isolated.

- [ ] **Step 1: Write RED migration/authorization tests.** Use `newDb`, register `octet_length(bytea)` as existing identity tests do, apply all migrations, seed helper identities using `upsertGoogleUser`, `createSpace`, `createInvitation` and `acceptInvitation`. Hash a generated invite via existing `hashOpaqueToken`; never bypass membership creation in store tests.

```ts
it('does not authorize a departed member', async () => {
  const { pool, identity, biaId } = await createAgendaTestDatabase();
  await identity.leaveSpace(biaId, new Date());
  await expect(withMemberTransaction(pool, biaId, async () => 'private'))
    .rejects.toMatchObject({ status: 403 });
  await pool.end();
});
```

- [ ] **Step 2: Observe RED.** `npm --workspace @juntos/api test -- agenda-migration member-transaction` fails on missing table/helper.
- [ ] **Step 3: Implement migration and locking.**

```sql
CREATE TABLE agenda_state (
  space_id uuid PRIMARY KEY REFERENCES couple_spaces(id),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
CREATE TABLE agenda_events (
  id uuid PRIMARY KEY, space_id uuid NOT NULL REFERENCES couple_spaces(id),
  title varchar(120) NOT NULL, date date NOT NULL, time varchar(5) NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  location varchar(200) NOT NULL, notes varchar(2000) NOT NULL,
  assignee_id uuid REFERENCES users(id), weekly boolean NOT NULL,
  recurrence_until date, version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id), updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, deleted_at timestamptz,
  CHECK (recurrence_until IS NULL OR (weekly AND recurrence_until >= date))
);
CREATE INDEX agenda_events_space_date_idx ON agenda_events(space_id,date);
CREATE INDEX agenda_events_space_weekly_idx ON agenda_events(space_id,weekly) WHERE deleted_at IS NULL;
CREATE TABLE agenda_activity (
  id uuid PRIMARY KEY, space_id uuid NOT NULL REFERENCES couple_spaces(id),
  event_id uuid NOT NULL REFERENCES agenda_events(id), actor_id uuid NOT NULL REFERENCES users(id),
  action varchar(16) NOT NULL CHECK(action IN ('created','updated','deleted')),
  version integer NOT NULL, created_at timestamptz NOT NULL
);
CREATE INDEX agenda_activity_space_created_idx ON agenda_activity(space_id,created_at);
```

Inside BEGIN first lookup membership without lock, then lock `couple_spaces` by discovered id, then re-read membership for same user+space `FOR UPDATE`. This follows space-first leave/accept paths and avoids deadlock with membership removal. Reject absent/archived space or vanished membership with 403. Callback receives trusted space id; COMMIT on success, ROLLBACK on any throw, release in finally. SQL parameter values never interpolated. State creation uses `INSERT ... ON CONFLICT DO NOTHING`; lock state row before any agenda write/read snapshot so revision and data are consistent. Update original migration runner table expectations for additive tables; never edit 0001.

- [ ] **Step 4: Verify GREEN.** `npm --workspace @juntos/api test -- agenda-migration member-transaction migration-runner`; confirm FK, positive version, idempotent second migration run and revoked association assertions.
- [ ] **Step 5: Commit.** `git add apps/api/migrations/0002_agenda.sql apps/api/src/spaces/member-transaction.ts apps/api/src/spaces/member-transaction.test.ts apps/api/src/agenda apps/api/src/db/migration-runner.test.ts`; `git commit -m "feat: persist scoped agenda records"`.

### Task 3: Implement versioned store and activity records

**Files:**
- Create: `apps/api/src/agenda/agenda-store.ts`
- Create: `apps/api/src/agenda/postgres-agenda-store.ts`
- Create: `apps/api/src/agenda/postgres-agenda-store.test.ts`

**Interfaces:**

```ts
type AgendaRows = { revision: string; events: AgendaEvent[]; members: SpaceMember[] };
interface AgendaStore {
  read(userId: string): Promise<AgendaRows>;
  create(userId: string,input: CreateAgendaRequest): Promise<AgendaEvent>;
  update(userId: string,id: string,input: UpdateAgendaRequest): Promise<AgendaEvent>;
  delete(userId: string,id: string,input: DeleteAgendaRequest): Promise<AgendaEvent>;
}
class AgendaVersionConflict extends Error { current: AgendaEvent; }
// PostgresAgendaStore implements AgendaStore
// constructor(db: Database, options?: { now?:()=>Date; id?:()=>string })
```

- [ ] **Step 1: Write RED store tests.**

```ts
it('returns current version and preserves the first writer', async () => {
  const f = await createAgendaTestDatabase();
  const store = new PostgresAgendaStore(f.pool);
  const event = { title:'Aula', date:'2026-09-07',time:'19:00',durationMinutes:90,
    location:'Campus',notes:'',assigneeId:null,recurrence:null };
  const first = await store.create(f.anaId,{event});
  const saved = await store.update(f.biaId,first.id,{expectedVersion:1,event:{...event,title:'Prova'}});
  expect(saved.version).toBe(2);
  await expect(store.update(f.anaId,first.id,{expectedVersion:1,event}))
    .rejects.toMatchObject({current:{title:'Prova',version:2}});
  await expect(store.delete(f.claraId,first.id,{expectedVersion:2,confirmed:true}))
    .rejects.toMatchObject({status:404});
  expect((await store.read(f.anaId)).events[0].title).toBe('Prova');
  await f.pool.end();
});
```

- [ ] **Step 2: Observe RED.** `npm --workspace @juntos/api test -- postgres-agenda-store`.
- [ ] **Step 3: Implement transactional operations.** Each method calls `withMemberTransaction`; state-row lock precedes event access. `create` generates UUID server-side and checks assignee membership in the same space. `update/delete` SELECT exact `(space_id,id)` including tombstone FOR UPDATE; absent returns 404; mismatched version or tombstone throws `AgendaVersionConflict(current)`; no update can resurrect a tombstone. Validate submitted assignee still belongs to space; old assignments to departed members remain readable through users lookup and UI label. Execute version predicate even under lock:

```sql
UPDATE agenda_events SET title=$4, date=$5, time=$6, duration_minutes=$7,
 location=$8, notes=$9, assignee_id=$10, weekly=$11, recurrence_until=$12,
 version=version+1, updated_by=$13, updated_at=$14
WHERE space_id=$1 AND id=$2 AND version=$3 AND deleted_at IS NULL
RETURNING id,space_id,title,date,time,duration_minutes,location,notes,assignee_id,
 weekly,recurrence_until,version,created_by,updated_by,created_at,updated_at,deleted_at;
```

Delete sets `deleted_at`, increments version and retains fields; all successes increment agenda_state.revision and insert one activity record without notes/title. Convert PG date/timestamp and bigint explicitly into contract string formats. Read returns nondeleted events and current member public names without emails. Assignee display for removed users is “Ex-integrante”; no email leakage. Unknown runtime database errors remain 500; do not downgrade all failures to validation 400.
- [ ] **Step 4: Verify GREEN.** `npm --workspace @juntos/api test -- postgres-agenda-store`; include partner CRUD, orphan assignee 400 at service boundary, cross-space reads empty, cross-space mutation 404, tombstone conflict, unchanged revision after rejected save, one activity per successful write.
- [ ] **Step 5: Commit.** `git add apps/api/src/agenda`; `git commit -m "feat: add optimistic agenda writes"`.

### Task 4: Project weekly occurrences through an agenda service

**Files:**
- Create: `apps/api/src/agenda/recurrence.ts`
- Create: `apps/api/src/agenda/recurrence.test.ts`
- Create: `apps/api/src/agenda/agenda-service.ts`
- Create: `apps/api/src/agenda/agenda-service.test.ts`

**Interfaces:** `expandAgenda(events: readonly AgendaEvent[],from: string,to: string): AgendaOccurrence[]`; `AgendaService` constructor `(store: AgendaStore)`, methods `list(userId:string,query:AgendaQuery):Promise<AgendaRead>`, `create(userId:string,input:CreateAgendaRequest):Promise<AgendaEvent>`, `update(userId:string,id:string,input:UpdateAgendaRequest):Promise<AgendaEvent>`, `delete(userId:string,id:string,input:DeleteAgendaRequest):Promise<AgendaEvent>`.

- [ ] **Step 1: Write RED recurrence tests.** Use a complete AgendaEvent factory in test file with UUID ids, createdAt/updatedAt `'2026-09-01T00:00:00Z'`, version 1 and deletedAt null.

```ts
expect(expandAgenda([event], '2026-09-07', '2026-09-21').map(o=>o.date))
  .toEqual(['2026-09-07','2026-09-14','2026-09-21']);
expect(expandAgenda([{...event,recurrence:{frequency:'weekly',until:'2026-09-14'}}],
  '2026-09-07','2026-09-21')).toHaveLength(2);
expect(expandAgenda([{...event,time:'23:30',durationMinutes:120,recurrence:null}],
  '2026-09-08','2026-09-08')).toHaveLength(1);
```

- [ ] **Step 2: Observe RED.** `npm --workspace @juntos/api test -- recurrence agenda-service`.
- [ ] **Step 3: Implement projection and validation.** Iterate civil dates from `addCivilDays(from,-1)` to `to`, max 43 candidates per series. A weekly event occurs when candidate>=anchor, weekday matches and candidate<=until when present; single events only at anchor. Convert start with `civilInstant` and end with `addInstantMinutes`; include an occurrence if it overlaps `[civilInstant(from,'00:00'),civilInstant(addCivilDays(to,1),'00:00'))`. Stable id `${event.id}:${candidate}`; retain original start date; chronological numeric instant sorting then eventId. Service validates all inputs with contracts and id UUID before store call. Compare supplied query revision against store revision; return changed false only for that requested interval's previous revision. Caller must reset revision when changing interval. Otherwise return snapshot with range and members. No recurrence records inserted during read.

```ts
async list(userId: string, query: AgendaQuery): Promise<AgendaRead> {
  const parsed = agendaQuerySchema.parse(query);
  const rows = await this.store.read(userId);
  if (parsed.revision === rows.revision) return { changed:false,revision:rows.revision };
  return {changed:true,snapshot:{revision:rows.revision,from:parsed.from,to:parsed.to,
    members:rows.members,occurrences:expandAgenda(rows.events,parsed.from,parsed.to)}};
}
```

- [ ] **Step 4: Verify GREEN.** `npm --workspace @juntos/api test -- recurrence agenda-service`; cover leap day, inclusive until, cross-midnight, exclusion at exact midnight end, stable keys, invalid range, 42-day bounds and no extra SQL writes on list.
- [ ] **Step 5: Commit.** `git add apps/api/src/agenda`; `git commit -m "feat: expand weekly agenda occurrences"`.

### Task 5: Register protected routes and polling-compatible limits

**Files:**
- Create: `apps/api/src/routes/internal-agenda.ts`
- Create: `apps/api/src/routes/internal-agenda.test.ts`
- Create: `apps/api/src/security/private-rate-limits.ts`
- Create: `apps/api/src/security/private-rate-limits.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:** plugin `internalAgendaRoutes: FastifyPluginAsync<{sessionService:SessionService;agendaService:AgendaService}>`. `BuildAppOptions` gets optional `agenda: { agendaService: AgendaService }`; register only inside authenticated `/internal` scope. Endpoints GET `/internal/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD&revision=decimal`, POST `/internal/agenda`, PATCH/DELETE `/internal/agenda/:id`; success 200 for reads/writes, 201 create. Export `PRIVATE_READ_LIMIT={max:600,timeWindow:'15 minutes'}`, `PRIVATE_WRITE_LIMIT={max:120,timeWindow:'15 minutes'}`.

- [ ] **Step 1: Write RED security tests.** Build Fastify with real SessionService, identity store and agenda store; generate two sessions and create space using existing identity methods. Injection assertions:

```ts
expect((await app.inject({method:'GET',url:'/internal/agenda?from=2026-09-07&to=2026-09-13'})).statusCode).toBe(404);
const response = await app.inject({method:'POST',url:'/internal/agenda',headers,
  payload:{event:{title:'Aula',date:'2026-09-07',time:'19:00',durationMinutes:90,
    location:'Campus',notes:'',assigneeId:null,recurrence:null}}});
expect(response.statusCode).toBe(201);
expect(response.headers['cache-control']).toBe('no-store');
```

`headers` is built in the test from the returned session plus an injected 64-character proxy key and `'a'.repeat(64)` trusted client id. Parameterize the limit unit test by method: 600 GET then 601st 429; 120 writes then 121st 429; auth sixth attempt 429. Test two client ids independently.
- [ ] **Step 2: Observe RED.** `npm --workspace @juntos/api test -- internal-agenda private-rate-limits`.
- [ ] **Step 3: Implement routes and rate configuration.** Keep existing internal key/client guard, session authentication, no-store hook and generic request_failed errors for 400/401/403/404/500. Only a same-space version conflict returns 409 plus `agendaConflictSchema.parse({error:'version_conflict',current})`; no record data on foreign id. Register GET with read limit and mutation with write limit; replace inherited 60/15min default by method-aware settings covering existing identity routes without weakening auth override 5. Do not install a second global limiter that consumes the old 60 bucket. Parse query/body before service, never pass caller identity keys. Server constructs `new AgendaService(new PostgresAgendaStore(pool))` alongside existing identity wiring.

```ts
app.get('/agenda',{config:{rateLimit:PRIVATE_READ_LIMIT}},async(request,reply)=>{
  const session=await authenticateSession(request,reply,deps.sessionService);
  if(!session)return;
  const parsed=agendaQuerySchema.safeParse(request.query);
  if(!parsed.success)return sendRequestFailure(request,reply,400);
  return reply.send(await deps.agendaService.list(session.user.id,parsed.data));
});
```

Set global request handler to map `SharedDataError` statuses and Zod 400 safely, while preserving route-local AgendaVersionConflict response. Logs contain only action/requestId/status, never notes, request body or authorization.
- [ ] **Step 4: Verify GREEN.** `npm --workspace @juntos/api test -- internal-agenda private-rate-limits internal-auth internal-spaces`; `npm --workspace @juntos/api run typecheck`. Include 65 consecutive valid reads to demonstrate removal of old 60 limit, membership loss 403, cross-space id 404 and stale edit/delete 409.
- [ ] **Step 5: Commit.** `git add apps/api/src`; `git commit -m "feat: expose protected agenda API and read limits"`.

### Task 6: Add same-origin agenda BFF with tested identity adapters

**Files:**
- Create: `apps/web/lib/server/shared-proxy.ts`
- Create: `apps/web/lib/server/shared-proxy.test.ts`
- Create: `apps/web/app/api/agenda/route.ts`
- Create: `apps/web/app/api/agenda/[id]/route.ts`
- Create: `apps/web/app/api/agenda/routes.test.ts`

**Interfaces:** `proxySharedRequest(request: Request,backendPath: string): Promise<Response>`. Runtime adapter consumes the completed identity BFF helpers: session reading through `SESSION_COOKIE_NAME` and the Next cookie store, exact-origin checking through `assertSameOrigin`, and authenticated backend requests through `backendFetch(path, init, session)`. New pure core `createSharedProxy(deps:{readSession:()=>Promise<string|null>;checkOrigin:(request:Request)=>void;send:(path:string,init:RequestInit,session:string)=>Promise<Response>}):(request:Request,path:string)=>Promise<Response>` defines a stable test boundary; do not duplicate cookie parsing, proxy-key handling or client-id derivation.

- [ ] **Step 1: Read local framework docs and write RED tests.** Resolve `next/package.json` from apps/web; read full route-handler, cookies and server-only guides under its dist/docs. Test pure boundary:

```ts
it('rejects mutation origin before reading body or calling backend',async()=>{
  const send=vi.fn(); const proxy=createSharedProxy({readSession:async()=>'session',
    checkOrigin:()=>{throw new Error('origin');},send});
  const result=await proxy(new Request('https://juntos.test/api/agenda',
    {method:'POST',body:'{'}),'/internal/agenda');
  expect(result.status).toBe(403); expect(send).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Observe RED.** `npm --workspace @juntos/web test -- shared-proxy routes`.
- [ ] **Step 3: Implement gateway.** Pure core checks non-GET origin first, requires session, forwards GET/PATCH/POST/DELETE only, JSON body under 16 KiB, `cache:'no-store'`; send errors => 502; absent session =>401; origin failure=>403. Response only JSON plus safe `Content-Type`, `Cache-Control:no-store`, `Retry-After` when 429; never forward Set-Cookie or backend credential headers. Preserve 409 JSON for comparison. Known backendPath supplied by server route only. Use async params:

```ts
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return Response.json({error:'request_failed'},{status:400});
  return proxySharedRequest(request,`/internal/agenda/${encodeURIComponent(id)}`);
}
```

DELETE uses exact same param resolution and calls proxySharedRequest with same path; GET collection copies only from/to/revision after `agendaQuerySchema` validation via URLSearchParams; POST forwards fixed `/internal/agenda`. Include no-store on local validation errors. Tests mock real cookie adapter to prove secrets absent in body and enforce next async APIs.
- [ ] **Step 4: Verify GREEN.** `npm --workspace @juntos/web test -- shared-proxy routes`; `npm --workspace @juntos/web run typecheck`.
- [ ] **Step 5: Commit.** `git add apps/web/lib/server/shared-proxy* apps/web/app/api/agenda`; `git commit -m "feat: add same-origin agenda gateway"`.

### Task 7: Create visible-page polling and conflict-aware client

**Files:**
- Create: `apps/web/lib/shared/use-visible-resource.ts`
- Create: `apps/web/lib/shared/use-visible-resource.test.tsx`
- Create: `apps/web/features/agenda/agenda-client.ts`
- Create: `apps/web/features/agenda/agenda-client.test.ts`

**Interfaces:**

```ts
type ResourceState<T>={data:T|null;status:'loading'|'synced'|'refreshing'|'offline'|'error';
  error:string|null;refresh:()=>Promise<void>};
type ResourceResult<T>={changed:false}|{changed:true;data:T};
function useVisibleResource<T>(key:string,load:(current:T|null,signal:AbortSignal)=>Promise<ResourceResult<T>>):ResourceState<T>;
class ApiFailure extends Error {status:number;body:unknown;}
function readAgenda(query:AgendaQuery,signal?:AbortSignal):Promise<AgendaRead>;
function createAgenda(input:CreateAgendaRequest):Promise<AgendaEvent>;
function updateAgenda(id:string,input:UpdateAgendaRequest):Promise<AgendaEvent>;
function deleteAgenda(id:string,input:DeleteAgendaRequest):Promise<AgendaEvent>;
```

- [ ] **Step 1: Write RED polling/client tests.** Fake timers and mock document.visibilityState plus navigator.onLine; render a harness that mounts one hook. Assert initial load once, 29,999 ms no extra call, 30,000 ms one refresh, hidden and offline no refresh, foreground/online immediate refresh, unmount aborts, changed:false preserves object, older response cannot overwrite new key. Client contract test:

```ts
vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(
  JSON.stringify({error:'version_conflict',current:event}),{status:409})));
await expect(updateAgenda(event.id,{expectedVersion:1,event:fields}))
  .rejects.toMatchObject({status:409,body:{current:{version:event.version}}});
```

`event` and `fields` are complete fixtures from agenda-client.test.ts using exact Task 1 shapes.
- [ ] **Step 2: Observe RED.** `npm --workspace @juntos/web test -- use-visible-resource agenda-client`.
- [ ] **Step 3: Implement hook and client.** Use recursive setTimeout after completion (30s); one AbortController per load, abort on key change/unmount; schedule none when hidden/offline. Attach visibilitychange/online/offline listeners; foreground calls refresh; collapse concurrent refresh calls and ignore response from stale generation. Cache in hook state only, clear immediately on key identity change and 401/403; do not persist sensitive data to service worker. Preserve last good data on 5xx/offline and show explicit state. Backoff on 429 until Retry-After or 60s. All client fetches relative `/api/agenda`, credentials same-origin and no-store; parse success and 409 with contracts, 502 on malformed response. Mutation is not retried automatically; safe explicit retry after network uncertainty starts with refresh to avoid duplicate create.

```ts
const response=await fetch(`/api/agenda/${encodeURIComponent(id)}`,{
  method:'PATCH',credentials:'same-origin',cache:'no-store',
  headers:{'content-type':'application/json'},body:JSON.stringify(input)});
const body:unknown=await response.json();
if(!response.ok)throw new ApiFailure(response.status,body);
return agendaEventSchema.parse(body);
```

Define `ApiFailure` constructor `(status:number,body:unknown)` calls super('request_failed') and assigns fields. Export it from `apps/web/lib/shared/api-failure.ts` and add that exact file to this task's commit; reused by food phase.
- [ ] **Step 4: Verify GREEN.** `npm --workspace @juntos/web test -- use-visible-resource agenda-client`; confirm 30s polling and no parallel intervals per page.
- [ ] **Step 5: Commit.** `git add apps/web/lib/shared apps/web/features/agenda`; `git commit -m "feat: sync visible agenda without page reloads"`.

### Task 8: Build mobile event create/edit/delete and three agenda views

**Files:**
- Create: `apps/web/features/agenda/agenda-screen.tsx`
- Create: `apps/web/features/agenda/agenda-screen.test.tsx`
- Create: `apps/web/features/agenda/event-form.tsx`
- Create: `apps/web/features/agenda/event-form.test.tsx`
- Create: `apps/web/features/agenda/agenda-calendar.tsx`
- Modify: `apps/web/app/agenda/page.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/product-pages.test.tsx`

**Interfaces:** `AgendaScreen({userId,spaceId,initialDate}:{userId:string;spaceId:string;initialDate:string})`; IDs scope local resource key only. `EventForm({event,members,onSave,onCancel}:{event:AgendaEvent|null;members:SpaceMember[];onSave:(fields:AgendaFields)=>Promise<void>;onCancel:()=>void})`; `AgendaCalendar({view,date,occurrences,onDate,onOpen}:{view:'month'|'week'|'list';date:string;occurrences:AgendaOccurrence[];onDate:(date:string)=>void;onOpen:(event:AgendaEvent)=>void})`.

- [ ] **Step 1: Write RED interaction tests.**

```tsx
render(<EventForm event={null} members={[]} onSave={save} onCancel={()=>{}}/>);
fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Aula'}});
fireEvent.change(screen.getByLabelText('Data'),{target:{value:'2026-09-07'}});
fireEvent.change(screen.getByLabelText('Horário'),{target:{value:'19:00'}});
fireEvent.click(screen.getByRole('button',{name:'Salvar compromisso'}));
await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({title:'Aula',assigneeId:null})));
```

Initialize `save=vi.fn().mockResolvedValue(undefined)`. Test cancel leaves server untouched, delete requires confirmation, failed save keeps values, and 409 shows both saved/current values without resubmitting automatically. Test 42 date cells for month, 7 weekday groups and list ordering from same occurrence data.
- [ ] **Step 2: Observe RED.** `npm --workspace @juntos/web test -- event-form agenda-screen product-pages`.
- [ ] **Step 3: Implement editor and views.** Visible labels Título, Data, Horário, Duração em minutos (default60), Local, Observações, Responsável with “Nós dois” null and current member ids, Repetir toda semana and Até optional. `event:null` means create; only current members selectable. Show “Editar toda a série”/“Excluir toda a série” on recurrence; delete confirmation `<dialog>` with title and Cancelar/Excluir. Form uses schema errors inline, role alert on failure, disabled controls while submitting. 409 panel shows submitted and latest title/date/time/duration/location/notes/responsável/recorrência, buttons “Usar versão atual” and “Reaplicar minhas alterações”; second button explicitly submits with current.version after review. If current.deletedAt exists only allow close and explicit new creation; never resurrection.

```tsx
<fieldset><legend>Responsável</legend>
  <label><input type="radio" name="assignee" checked={assigneeId===null}
    onChange={()=>setAssigneeId(null)}/>Nós dois</label>
  {members.map(member=><label key={member.id}><input type="radio" name="assignee"
    checked={assigneeId===member.id} onChange={()=>setAssigneeId(member.id)}/>{member.name}</label>)}
</fieldset>
```

AgendaScreen holds one polling hook across three view modes. Month starts Monday and queries 42 days; week queries Monday–Sunday; list same week. Buttons previous/next/today reset interval revision. Client save awaits server then refreshes resource, closes only on success. Display created/updated author and time in detail; user id mapping current members or Ex-integrante. Empty “Nenhum compromisso neste período”, retry button on error, “Sem conexão — mostrando a última atualização” retaining data, explicit loading. Gate server page using completed identity bootstrap ready state before rendering AppShell. Maintain editorial colors/spacing, 44px touch targets, focus restoration after dialog and reduced motion.
- [ ] **Step 4: Verify GREEN.** `npm --workspace @juntos/web test -- event-form agenda-screen product-pages`; `npm --workspace @juntos/web run lint`; include keyboard-only create/delete and 409 preservation.
- [ ] **Step 5: Commit.** `git add apps/web/features/agenda apps/web/app/agenda apps/web/app/globals.css apps/web/app/product-pages.test.tsx`; `git commit -m "feat: add editable mobile agenda"`.

### Task 9: Replace the home agenda fixture with real chronological events

**Files:**
- Create: `apps/web/features/timeline/home-timeline.tsx`
- Create: `apps/web/features/timeline/home-timeline.test.tsx`
- Create: `apps/web/features/timeline/agenda-adapter.ts`
- Create: `apps/web/features/timeline/agenda-adapter.test.ts`
- Modify: `apps/web/features/timeline/types.ts`
- Modify: `apps/web/features/timeline/build-timeline.ts`
- Modify: `apps/web/features/timeline/build-timeline.test.ts`
- Modify: `apps/web/components/timeline-view.tsx`
- Modify: `apps/web/components/timeline-view.test.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:** Change `CoupleMember` to `string` (real display labels), retain TimelineItem kind union. `agendaToTimeline(snapshot:AgendaSnapshot):CalendarEvent[]`. `HomeTimeline({userId,spaceId,initialDate}:{userId:string;spaceId:string;initialDate:string})`. Extend `TimelineViewProps` with `onDateChange?:(date:string)=>void` and `onAddEvent?:()=>void`; preserve presentational use with explicit event/meal arrays in tests.

- [ ] **Step 1: Write RED real-data tests.** Render HomeTimeline with mocked readAgenda returning an Ana event and assert Aula visible, demo work/faculdade examples absent, “Adicionar compromisso” navigates `/agenda?new=1`, next-day control refetches. Test event crossing midnight is visible on the second day and sorted before morning entries.

```ts
expect(agendaToTimeline(snapshot)[0]).toMatchObject({id:`${event.id}:2026-09-07`,title:'Aula',owner:'Ana'});
expect(buildTimeline({date:'2026-09-08',events:[overnight],meals:[]})).toHaveLength(1);
```

Fixtures define snapshot members matching event.assigneeId; overnight starts `'2026-09-07T23:30:00-03:00'`, ends `'2026-09-08T01:30:00-03:00'`.
- [ ] **Step 2: Observe RED.** `npm --workspace @juntos/web test -- home-timeline agenda-adapter build-timeline timeline-view`.
- [ ] **Step 3: Implement adapter and home loading.** Convert UTC occurrence timestamps into São Paulo offset ISO strings using an exported `toCivilDateTime(instant:string):string` in contracts (Temporal zoned dateTime string without bracketed zone); format time in view using Intl explicit timezone. For calendar events filter actual overlap with day boundaries using civilInstant and numeric timestamps; meal date filtering remains meal-start date. Sorting by instant (overnight first). Remove imports of demoDate/demoEvents/demoMeals from production home; meals empty until food phase supplies actual meals. Today computed server-side `civilToday()`, no hard-coded dates. Home mounts one read hook; presentation date changes drive resource key, and view disabled stale list while changing interval. Empty text invites creating a commitment. Keep four destinations and a single timeline, no summary panels.

```ts
export function toCivilDateTime(instant:string):string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO('America/Sao_Paulo')
    .toString({timeZoneName:'never',calendarName:'never'});
}
```

Add this helper to `packages/contracts/src/agenda.ts` and its UTC-midnight regression test in agenda.test.ts. Update EventForm opening for `?new=1` using async searchParams server-side or documented Next client hook without duplicate polling.
- [ ] **Step 4: Verify GREEN.** `npm --workspace @juntos/web test -- home-timeline agenda-adapter build-timeline timeline-view`; `npm --workspace @juntos/contracts test -- agenda`; assert real previous/next dates and overnight boundaries.
- [ ] **Step 5: Commit.** `git add apps/web/features/timeline apps/web/components/timeline-view* apps/web/app/page.tsx packages/contracts/src/agenda*`; `git commit -m "feat: show persisted agenda on home timeline"`.

### Task 10: Verify real concurrent writes, two devices and deployment

**Files:**
- Create: `apps/api/src/agenda/agenda-postgres.integration.test.ts`
- Create: `docs/operations/agenda-acceptance.md`
- Modify: `apps/api/package.json`
- Modify: `README.md`
- Modify: `tests/deployment-contract.test.mjs`

**Interfaces:** Adds `test:agenda:postgres` script `vitest run src/agenda/agenda-postgres.integration.test.ts`; test reads `TEST_DATABASE_URL` pointing to a disposable isolated database, never DATABASE_URL fallback. Existing Render `startCommand: npm --workspace @juntos/api run db:migrate && npm --workspace @juntos/api run start` stays valid for its free plan. Deployment documentation consumes configured Vercel/Render URLs, not invented domains.

- [ ] **Step 1: Write RED concurrent integration case.** On a fresh database, migrate then create two members with sessions and one event. Run concurrently:

```ts
const results=await Promise.allSettled([
  store.update(anaId,event.id,{expectedVersion:1,event:{...fields,title:'Prova'}}),
  store.update(biaId,event.id,{expectedVersion:1,event:{...fields,title:'Aula extra'}}),
]);
expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
expect((await store.read(anaId)).events[0].version).toBe(2);
```

Add membership leave versus update transaction test requiring either authorized committed update before leave or 403 after leave; no updates committed after the membership removal has committed. Add 0002 migration presence assertion to deployment-contract.test.mjs.
- [ ] **Step 2: Observe RED in an isolated PostgreSQL instance.** Create a disposable PostgreSQL database through available local database tooling, set TEST_DATABASE_URL in terminal environment, run `npm --workspace @juntos/api run test:agenda:postgres`. Integration tests must refuse missing TEST_DATABASE_URL in this explicit command; normal `npm test` may skip the dedicated file when absent and must report that skip. Record the actual executed DB version and test output.
- [ ] **Step 3: Implement deployment assertions and acceptance checklist.**

```js
assert.match(readFileSync('apps/api/migrations/0002_agenda.sql','utf8'),/CREATE TABLE agenda_events/);
assert.match(api.startCommand,/db:migrate/);
```

Use existing deployment test's parsed `api` object and filesystem imports. Document smoke checks: anonymous /api/agenda =>401; direct internal request=>404; session-backed create on A appears on B within 30s while visible; edit responsible/date/notes and weekly series; compare stale edit 409; confirm delete propagates; restart Render and reload both devices preserves records; pause background polling; return foreground refresh immediately. Browser viewport sizes 360×800, 390×844, 768×1024, 1440×900; keyboard dialog focus and reduced-motion preference. No Google Calendar consent during any agenda action.
- [ ] **Step 4: Verify GREEN and release.** Run `npm test`, `npm run typecheck`, `npm --workspace @juntos/web run lint`, `npm run build`, `npm --workspace @juntos/api run test:agenda:postgres`, `git diff --check`. Deploy backend additive migration before frontend; use project’s already configured deployment workflow and record actual deployment ids/URLs in acceptance doc. No new paid resource. Check `/health`, then the two-device checklist with two real accounts; code-green alone is insufficient to label deployment verified. If deployment credentials/accounts are unavailable, state exact remaining acceptance step rather than claim completion. Rollback app version leaves additive tables/data intact; never drop tables to rollback.
- [ ] **Step 5: Commit.** `git add apps/api/src/agenda/agenda-postgres.integration.test.ts apps/api/package.json docs/operations/agenda-acceptance.md README.md tests/deployment-contract.test.mjs`; `git commit -m "test: verify shared agenda lifecycle"`.

## Self-Review Report

Coverage: Tasks 1–4 cover validated fields, durable per-space data, both-member CRUD, recurrence, authorship and version conflict. Task 5 explicitly fixes inherited polling limits. Tasks 6–9 cover protected BFF, visible synchronization, edit/delete mobile flows, monthly/weekly/list views and real chronological home. Task 10 covers real database races, persistence after restart, viewport accessibility and deployment. Google integration is intentionally excluded until internal agenda acceptance; durable offline queue and field merging remain the spec’s reliability phase, with visible offline state implemented here.

Placeholder review: no open-ended implementation placeholders; all produced domain types, methods, statuses, routes and tests are specified. Code snippets illustrate the required algorithm and assertions; implementation remains organized by the exact file list. Identity is complete: Task 6 binds the shared proxy to the existing `SESSION_COOKIE_NAME`, `assertSameOrigin`, and `backendFetch` helpers behind the specified pure adapter.

Type review: `PublicUser` authentication remains unchanged; user id enters store, trusted space id exists only within transaction. Revisions are decimal strings; entity versions are integers; civil dates are distinct from UTC occurrence timestamps. `AgendaVersionConflict.current` carries complete AgendaEvent including tombstone, response and UI names match. Follow-up food plan depends on Task 6's proxy, Task 7's hook/ApiFailure, and Task 9's civil helpers/home.
