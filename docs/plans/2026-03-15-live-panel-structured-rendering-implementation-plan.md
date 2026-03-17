# Live Panel Structured Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** fazer o painel `Live` renderizar eventos com estrutura visual correta e permitir filtro por categoria de sinal sem alterar o backend.

**Architecture:** o backend continua usando `sessionActivityLog` como source of truth. A mudança fica no dashboard: introduzir um view-model estruturado para eventos do `Live`, classificar `kind`s em categorias visuais, renderizar cada linha com componente dedicado e aplicar filtro local dentro de `ProviderLiveChatPanel`.

**Tech Stack:** Next.js, React, TypeScript, Convex hooks, Vitest, Testing Library

---

### Task 0: Confirmar story e baseline

**Files:**
- Check: `_bmad-output/implementation-artifacts/`
- Reference: `/Users/ennio/Documents/nanobot-ennio/docs/plans/2026-03-15-live-panel-structured-rendering-design.md`

**Step 1: Confirmar que existe uma story pronta para implementação**

Run: `ls _bmad-output/implementation-artifacts | rg "live|provider|sessionActivityLog|render"`
Expected: encontrar a story correspondente ou concluir que é preciso criar uma nova story antes de codar

**Step 2: Se não existir, criar a story antes de tocar código**

Run: usar o fluxo `/create-story` definido no projeto
Expected: artefato criado em `_bmad-output/implementation-artifacts/`

**Step 3: Registrar o escopo da implementação**

Confirmar que o escopo desta wave é:
- `ProviderLiveChatPanel`
- `useProviderSession`
- testes do dashboard

**Step 4: Commit**

```bash
git add docs/plans/2026-03-15-live-panel-structured-rendering-design.md docs/plans/2026-03-15-live-panel-structured-rendering-implementation-plan.md
git commit -m "docs: add live panel structured rendering plan"
```

### Task 1: Travar a taxonomia de eventos do Live em funções puras

**Files:**
- Create: `dashboard/features/interactive/lib/providerLiveEvents.ts`
- Test: `dashboard/features/interactive/lib/providerLiveEvents.test.ts`
- Reference: `dashboard/convex/sessionActivityLog.ts`
- Reference: `mc/contexts/interactive/supervision_types.py`

**Step 1: Write the failing test**

Cobrir pelo menos:

- `item_started` com `toolName` vira categoria `tool`
- `item_started` com nome indicando skill vira categoria `skill`
- `turn_completed` vira categoria `result`
- `approval_requested` e `user_input_requested` viram categoria `action`
- `session_failed` vira categoria `error`
- `session_ready` vira categoria `system`
- fallback sem `summary/error/toolName` ainda produz texto seguro

```ts
import { describe, expect, it } from "vitest";
import { classifyProviderEventCategory, buildProviderLiveEvent } from "./providerLiveEvents";

describe("classifyProviderEventCategory", () => {
  it("classifies tool executions", () => {
    expect(classifyProviderEventCategory({ kind: "item_started", toolName: "Read" })).toBe("tool");
  });

  it("classifies action-required events", () => {
    expect(classifyProviderEventCategory({ kind: "approval_requested" })).toBe("action");
  });
});

describe("buildProviderLiveEvent", () => {
  it("builds a structured result event", () => {
    expect(
      buildProviderLiveEvent({
        _id: "evt-1",
        kind: "turn_completed",
        ts: "2026-03-15T10:00:00.000Z",
        summary: "Implemented the fix",
      }),
    ).toMatchObject({
      id: "evt-1",
      category: "result",
      body: "Implemented the fix",
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- dashboard/features/interactive/lib/providerLiveEvents.test.ts`
Expected: FAIL because the module does not exist yet

**Step 3: Write minimal implementation**

Implementar em `providerLiveEvents.ts`:

- tipo `ProviderLiveCategory`
- tipo estruturado `ProviderLiveEvent`
- `classifyProviderEventCategory(rawEntry)`
- `buildProviderLiveEvent(rawEntry)`
- `buildProviderLiveEvents(entries)`
- heurística explícita para `skill` baseada em `toolName`

**Step 4: Run test to verify it passes**

Run: `npm run test -- dashboard/features/interactive/lib/providerLiveEvents.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/features/interactive/lib/providerLiveEvents.ts dashboard/features/interactive/lib/providerLiveEvents.test.ts
git commit -m "feat: add structured live event classification"
```

### Task 2: Migrar o hook para o view-model estruturado

**Files:**
- Modify: `dashboard/features/interactive/hooks/useProviderSession.ts`
- Modify: `dashboard/features/interactive/hooks/useProviderSession.test.ts`
- Reference: `dashboard/features/interactive/lib/providerLiveEvents.ts`

**Step 1: Write the failing test**

Expandir os testes do hook para provar:

- `normalizeProviderEvents` deixa de devolver só `text`
- o hook retorna `category`, `body`, `toolName`, `toolInput`, `requiresAction`
- eventos reais como `approval_requested` e `session_failed` são normalizados corretamente

```ts
it("normalizes activity entries into structured live events", () => {
  const events = normalizeProviderEvents([
    {
      _id: "act-1",
      kind: "approval_requested",
      ts: "2026-03-15T10:00:00.000Z",
      summary: "Need permission to run tests",
      requiresAction: true,
    },
  ]);

  expect(events[0]).toMatchObject({
    id: "act-1",
    kind: "approval_requested",
    category: "action",
    body: "Need permission to run tests",
    requiresAction: true,
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- dashboard/features/interactive/hooks/useProviderSession.test.ts`
Expected: FAIL because the normalized shape still returns flat text

**Step 3: Write minimal implementation**

Trocar `normalizeProviderEvents()` para delegar ao utilitário puro criado na task anterior e atualizar o tipo exportado pelo painel.

**Step 4: Run test to verify it passes**

Run: `npm run test -- dashboard/features/interactive/hooks/useProviderSession.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/features/interactive/hooks/useProviderSession.ts dashboard/features/interactive/hooks/useProviderSession.test.ts
git commit -m "feat: normalize live session events into structured view models"
```

### Task 3: Criar o renderer dedicado para eventos do Live

**Files:**
- Create: `dashboard/features/interactive/components/ProviderLiveEventRow.tsx`
- Create: `dashboard/features/interactive/components/ProviderLiveEventRow.test.tsx`
- Reference: `dashboard/features/thread/components/ThreadMessage.tsx`
- Reference: `dashboard/components/MarkdownRenderer.tsx`

**Step 1: Write the failing test**

Cobrir pelo menos:

- evento textual renderiza markdown
- evento `tool` mostra `toolName` e `toolInput`
- evento `action` mostra badge de ação requerida
- evento `error` destaca erro
- evento `result` mostra corpo principal

```tsx
it("renders tool events with structured metadata", () => {
  render(
    <ProviderLiveEventRow
      event={{
        id: "evt-1",
        kind: "item_started",
        category: "tool",
        title: "Read",
        body: "/tmp/file.txt",
        toolName: "Read",
        toolInput: "/tmp/file.txt",
        timestamp: "2026-03-15T10:00:00.000Z",
        requiresAction: false,
      }}
    />,
  );

  expect(screen.getByText("Read")).toBeInTheDocument();
  expect(screen.getByText("/tmp/file.txt")).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- dashboard/features/interactive/components/ProviderLiveEventRow.test.tsx`
Expected: FAIL because the component does not exist yet

**Step 3: Write minimal implementation**

Implementar componente que:

- usa `MarkdownRenderer` para `body`
- usa badges por categoria
- mostra timestamp
- mostra bloco monospace para `toolInput` quando houver
- destaca `error` e `requiresAction`

**Step 4: Run test to verify it passes**

Run: `npm run test -- dashboard/features/interactive/components/ProviderLiveEventRow.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/features/interactive/components/ProviderLiveEventRow.tsx dashboard/features/interactive/components/ProviderLiveEventRow.test.tsx
git commit -m "feat: add structured live event row renderer"
```

### Task 4: Adicionar filtro por categoria ao painel Live

**Files:**
- Modify: `dashboard/features/interactive/components/ProviderLiveChatPanel.tsx`
- Modify: `dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx`
- Reference: `dashboard/features/tasks/components/TaskDetailThreadTab.tsx`
- Reference: `dashboard/features/interactive/components/ProviderLiveEventRow.tsx`

**Step 1: Write the failing test**

Cobrir:

- painel renderiza categorias disponíveis
- filtro multi-select oculta categorias desmarcadas
- `All` restaura tudo
- empty state muda quando o filtro remove todos os eventos

```tsx
it("filters live events by category", async () => {
  render(
    <ProviderLiveChatPanel
      sessionId="session-123"
      events={[
        {
          id: "evt-1",
          kind: "item_started",
          category: "tool",
          title: "Read",
          body: "/tmp/a.txt",
          timestamp: "2026-03-15T10:00:00.000Z",
          requiresAction: false,
        },
        {
          id: "evt-2",
          kind: "turn_completed",
          category: "result",
          title: "Turn completed",
          body: "Done",
          timestamp: "2026-03-15T10:01:00.000Z",
          requiresAction: false,
        },
      ]}
      status="streaming"
      agentName="writer"
      provider="codex"
      isLoading={false}
    />,
  );

  // Desativar "tool" e verificar que só o resultado segue visível.
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx`
Expected: FAIL because the panel still renders raw `<pre>` blocks and has no filter controls

**Step 3: Write minimal implementation**

Atualizar `ProviderLiveChatPanel.tsx` para:

- manter estado local das categorias selecionadas
- derivar categorias presentes a partir de `events`
- renderizar barra de filtros acima da lista
- trocar `<pre>` por `ProviderLiveEventRow`
- mostrar empty state específico para filtro ativo

**Step 4: Run test to verify it passes**

Run: `npm run test -- dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add dashboard/features/interactive/components/ProviderLiveChatPanel.tsx dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx
git commit -m "feat: add live panel category filters"
```

### Task 5: Validar integração no TaskDetailSheet

**Files:**
- Check: `dashboard/features/tasks/components/TaskDetailSheet.tsx`
- Optional Test: `dashboard/features/tasks/components/TaskDetailSheet.test.tsx`

**Step 1: Write the failing test**

Se existir teste de integração do `Live`, adicionar cobertura para garantir que o painel renderiza eventos estruturados sem quebrar o layout de duas colunas.

**Step 2: Run test to verify it fails**

Run: `npm run test -- dashboard/features/tasks/components/TaskDetailSheet.test.tsx`
Expected: FAIL only if a new assertion was added

**Step 3: Write minimal implementation**

Só ajustar `TaskDetailSheet.tsx` se o contrato tipado de `ProviderLiveChatPanel` exigir mudanças.

**Step 4: Run test to verify it passes**

Run: `npm run test -- dashboard/features/tasks/components/TaskDetailSheet.test.tsx`
Expected: PASS or N/A if no integration test exists yet

**Step 5: Commit**

```bash
git add dashboard/features/tasks/components/TaskDetailSheet.tsx dashboard/features/tasks/components/TaskDetailSheet.test.tsx
git commit -m "test: cover live panel integration in task detail"
```

### Task 6: Run required validation gates

**Files:**
- Check: `dashboard/features/interactive/components/ProviderLiveChatPanel.tsx`
- Check: `dashboard/features/interactive/components/ProviderLiveEventRow.tsx`
- Check: `dashboard/features/interactive/hooks/useProviderSession.ts`
- Check: `dashboard/features/interactive/lib/providerLiveEvents.ts`

**Step 1: Run targeted tests**

Run: `npm run test -- dashboard/features/interactive/lib/providerLiveEvents.test.ts dashboard/features/interactive/hooks/useProviderSession.test.ts dashboard/features/interactive/components/ProviderLiveEventRow.test.tsx dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx`
Expected: PASS

**Step 2: Run dashboard file-format checks**

Run: `npm run format:file:check -- dashboard/features/interactive/lib/providerLiveEvents.ts dashboard/features/interactive/lib/providerLiveEvents.test.ts dashboard/features/interactive/hooks/useProviderSession.ts dashboard/features/interactive/hooks/useProviderSession.test.ts dashboard/features/interactive/components/ProviderLiveEventRow.tsx dashboard/features/interactive/components/ProviderLiveEventRow.test.tsx dashboard/features/interactive/components/ProviderLiveChatPanel.tsx dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx`
Expected: PASS

**Step 3: Run dashboard lint on touched files**

Run: `npm run lint:file -- dashboard/features/interactive/lib/providerLiveEvents.ts dashboard/features/interactive/lib/providerLiveEvents.test.ts dashboard/features/interactive/hooks/useProviderSession.ts dashboard/features/interactive/hooks/useProviderSession.test.ts dashboard/features/interactive/components/ProviderLiveEventRow.tsx dashboard/features/interactive/components/ProviderLiveEventRow.test.tsx dashboard/features/interactive/components/ProviderLiveChatPanel.tsx dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx`
Expected: PASS

**Step 4: Run dashboard architecture guardrail**

Run: `npm run test:architecture`
Expected: PASS

**Step 5: Browser validation in full MC runtime**

Run:

```bash
cp dashboard/.env.local .worktrees/codex/<branch>/dashboard/.env.local
cd .worktrees/codex/<branch>
PORT=3001 uv run nanobot mc start
```

Validate with `playwright-cli`:

- abrir `http://localhost:3001`
- entrar numa task com aba `Live`
- confirmar render rico para `tool`, `result`, `action`, `error` quando presentes
- confirmar filtro por categoria no painel esquerdo
- confirmar coluna `AgentActivityFeed` segue intacta

**Step 6: Commit**

```bash
git add dashboard/features/interactive/lib/providerLiveEvents.ts dashboard/features/interactive/lib/providerLiveEvents.test.ts dashboard/features/interactive/hooks/useProviderSession.ts dashboard/features/interactive/hooks/useProviderSession.test.ts dashboard/features/interactive/components/ProviderLiveEventRow.tsx dashboard/features/interactive/components/ProviderLiveEventRow.test.tsx dashboard/features/interactive/components/ProviderLiveChatPanel.tsx dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx dashboard/features/tasks/components/TaskDetailSheet.tsx dashboard/features/tasks/components/TaskDetailSheet.test.tsx
git commit -m "feat: render live panel events with category filters"
```

Plan complete and saved to `docs/plans/2026-03-15-live-panel-structured-rendering-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
