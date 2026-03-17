# MC Epics — Agrupamento de Tasks com Contexto Compartilhado

## Decisao

Epicos como entidade propria (tabela `epics` separada no Convex). Nao reusar tasks nem boards.

**Justificativa:** Epicos tem semantica distinta de tasks (status derivado, sem agente assignado, thread compartilhada com filhas). Entidade propria evita complexidade condicional.

## 1. Data Model

### Convex — tabela `epics`

```typescript
epics: defineTable({
  title: v.string(),
  description: v.optional(v.string()),
  status: v.union(
    v.literal("planning"),     // criado, sem filhas ou decomposicao em andamento
    v.literal("in_progress"),  // >= 1 filha ativa
    v.literal("done"),         // todas as filhas done
    v.literal("failed"),       // filha(s) failed/crashed, nenhuma ativa restante
    v.literal("blocked"),      // todas as filhas restantes estao blocked/planning
  ),
  boardId: v.optional(v.id("boards")),
  tags: v.optional(v.array(v.string())),
  contextWindowSize: v.optional(v.number()),  // N mensagens recentes para heranca (default: 20)
  decomposeAutomatically: v.optional(v.boolean()), // lead-agent decompoe se true
  files: v.optional(v.array(v.object({
    name: v.string(),
    type: v.string(),
    size: v.number(),
    subfolder: v.string(),       // "attachments" ou "output/{task_title}"
    uploadedAt: v.string(),
    sourceTaskId: v.optional(v.id("tasks")),
  }))),
  createdAt: v.string(),
  updatedAt: v.string(),
})
```

### Alteracao na tabela `tasks`

```typescript
epicId: v.optional(v.id("epics")),  // novo campo
```

Tasks com `epicId` sao filhas do epico. Herdam `boardId` do epico na criacao. Nao possuem thread propria.

### Alteracao na tabela `messages`

```typescript
// taskId passa a ser opcional, epicId adicionado
taskId: v.optional(v.id("tasks")),
epicId: v.optional(v.id("epics")),
// Invariante: exatamente um de taskId ou epicId deve estar presente
// Mensagens de tasks filhas usam epicId + taskId (referencia da filha)
```

### Python — `mc/types.py`

```python
@dataclass
class EpicData:
    title: str
    status: str  # EpicStatus
    created_at: str
    updated_at: str
    description: str | None = None
    board_id: str | None = None
    tags: list[str] | None = None
    context_window_size: int | None = None
    decompose_automatically: bool | None = None
    id: str | None = None
```

### Filesystem

```
~/.nanobot/epics/{safe_epic_id}/
├── attachments/                          # Inputs compartilhados
└── output/
    └── {safe_child_task_title}/          # Outputs por filha
```

Tasks filhas NAO tem diretorio em `~/.nanobot/tasks/` — usam o diretorio do epico.

## 2. Epic Lifecycle & Status Derivado

### Regras de derivacao

O epico nao tem state machine com transicoes explicitas. Status recomputado quando uma task filha muda de status.

```
computeEpicStatus(childTasks) -> EpicStatus:
  1. Se nao ha filhas -> "planning"
  2. Se todas as filhas estao "done" -> "done"
  3. Se alguma filha esta "failed"/"crashed" E nenhuma esta ativa -> "failed"
  4. Se alguma filha esta "in_progress"/"assigned"/"ready" -> "in_progress"
  5. Caso contrario -> "blocked"
```

### Trigger de recompute

Toda vez que `tasks:updateStatus` e chamado para task com `epicId`, chama `epics:recomputeStatus(epicId)`.

### Progresso agregado

```typescript
epics:getProgress(epicId) -> { total, done, inProgress, failed, blocked }
```

### Criacao

```typescript
epics:create({ title, description?, boardId?, tags?, contextWindowSize? })
// -> status "planning", cria diretorio, activity event "epic_created"
```

### Adicao de task filha

- **Nova task:** `tasks:create` com `epicId`. Herda `boardId` do epico.
- **Task existente:** `tasks:attachToEpic(taskId, epicId)` — migra mensagens para thread do epico.

### Remocao de task filha

`tasks:detachFromEpic(taskId)` — remove `epicId`. Mensagens existentes ficam na thread do epico. Novas mensagens vao para thread propria.

### Kick-off manual

Tasks filhas sao criadas com status `inbox`. Usuario da kick-off manualmente. Orchestrator NAO faz routing automatico de tasks com `epicId`.

## 3. Thread Compartilhada

### Modelo

Toda comunicacao de tasks filhas vai para a thread do epico. Campo `taskId` na mensagem identifica qual filha originou.

```typescript
{
  epicId: "epic_123",
  taskId: "task_456",        // qual filha gerou
  authorName: "dev-agent",
  authorType: "agent",
  content: "Endpoint /users concluido",
  type: "step_completion",
  stepId: "step_789",
  artifacts: [{ path: "output/api-users/routes.py", action: "created" }],
}
```

### Queries

```typescript
epics:listMessages(epicId, { limit?, cursor? })           // toda a thread
epics:listMessages(epicId, { taskId, limit?, cursor? })   // filtro por filha
```

### Quem posta

| Autor | Tipo | taskId? |
|---|---|---|
| Agente executando filha | step_completion, system_error | Sim |
| Lead-agent decompondo | lead_agent_plan, lead_agent_chat | Nao |
| Usuario comentando | user_message, comment | Opcional |
| Sistema (status changes) | system_event | Sim (quando relativo a filha) |

## 4. Heranca de Contexto

### Contexto que a task filha recebe

```
## Epic Context
**Epic:** {epic.title}
**Description:** {epic.description}
**Progress:** {done}/{total} tasks complete

## Workspace
Epic directory: /absolute/path/to/epics/{safe_epic_id}/
Your output directory: /absolute/path/to/epics/{safe_epic_id}/output/{safe_task_title}/
Shared attachments: /absolute/path/to/epics/{safe_epic_id}/attachments/

Write your outputs to your output directory.
Read shared inputs from attachments/ and sibling outputs from output/.

## Recent Epic Thread ({N} messages)
[{timestamp}] {author} (task: {task_title}): {content}
...

## Available Files
attachments/
  - requirements.md (PDF, 2.3 MB)
output/
  auth-service/
    - routes.py (Python, 4.2 KB)
```

### Janela deslizante

`contextWindowSize` controla quantas mensagens recentes (default: 20).

### O que NAO e herdado

- Lista completa de tasks irmas com detalhes
- Mensagens antigas alem da janela
- Execution plans de outras filhas

## 5. Lead-Agent Decomposicao

### Fluxo

Quando epico tem `decomposeAutomatically: true` e status `planning` sem filhas:

1. Orchestrator detecta via `epics:listPendingDecomposition()`
2. Lead-agent recebe titulo, descricao e attachments
3. Gera lista de tasks filhas com titulos e descricoes
4. Posta plano na thread do epico (`lead_agent_plan`)
5. Cria tasks filhas com status `inbox` + `epicId`
6. Activity event: `epic_decomposed`

Tasks ficam em inbox ate kick-off manual pelo usuario.

## 6. Bridge & API Layer

### Novas operacoes em `mc/bridge.py`

```python
# Epicos
def create_epic(self, title, description=None, board_id=None, tags=None,
                context_window_size=None, decompose_automatically=False) -> str
def get_epic(self, epic_id) -> EpicData
def list_epics(self, board_id=None, status=None) -> list[EpicData]
def create_epic_directory(self, epic_id) -> Path
def create_child_output_dir(self, epic_id, task_title) -> Path

# Thread do epico
def send_epic_message(self, epic_id, author_name, author_type, content,
                      msg_type, task_id=None, step_id=None, artifacts=None)
def get_epic_thread(self, epic_id, limit=50, task_id=None) -> list[MessageData]
def post_epic_step_completion(self, epic_id, task_id, step_id, agent_name,
                              content, artifacts=None)

# Files do epico
def update_epic_files(self, epic_id, files) -> None
```

### Novas Convex mutations/queries

```typescript
// epics.ts
epics:create(args) -> epic_id
epics:get(epicId) -> EpicDoc
epics:list({ boardId?, status? }) -> EpicDoc[]
epics:recomputeStatus(epicId) -> void           // internal mutation
epics:getProgress(epicId) -> { total, done, inProgress, failed, blocked }
epics:listPendingDecomposition() -> EpicDoc[]

// Alteracoes em tasks.ts
tasks:create — aceita epicId opcional
tasks:updateStatus — chama epics:recomputeStatus se task tem epicId
tasks:attachToEpic(taskId, epicId) -> void
tasks:detachFromEpic(taskId) -> void
tasks:listByEpic(epicId) -> TaskDoc[]

// Alteracoes em messages.ts
messages:create — aceita epicId em vez de taskId
messages:listByEpic(epicId, { taskId?, limit?, cursor? })
```

### Activity events novos

```
epic_created, epic_status_changed, epic_decomposed,
task_attached_to_epic, task_detached_from_epic
```

## 7. Orchestrator & Executor

### Orchestrator — novo loop

```python
async def start_epic_planning_loop(self):
    """Monitora epicos pendentes de decomposicao."""
    queue = bridge.async_subscribe("epics:listPendingDecomposition")
    while True:
        epics = await queue.get()
        for epic in epics:
            await self._decompose_epic(epic)
```

### Orchestrator — skip filhas de epico

```python
# start_inbox_routing_loop — skip tasks com epicId
async def _should_skip_task(self, task):
    if task.epic_id:
        return True  # usuario controla kick-off
    ...
```

### Executor — alteracoes para tasks com epicId

```python
if task.epic_id:
    epic = bridge.get_epic(task.epic_id)
    task_dir = bridge.create_child_output_dir(task.epic_id, task.title)
    context = output_enricher.enrich_with_epic_context(task, epic)
    # Mensagens -> thread do epico
    # Artifacts -> files do epico
    # Status change -> trigger recompute epico
```

### Output Enricher — novo metodo

```python
def enrich_with_epic_context(self, task: TaskData, epic: EpicData) -> str:
    """Monta contexto para task filha de epico."""
    # Epic Context + Workspace + Recent Thread + Available Files + Task info
```

## 8. Dashboard

### Epic card no board

Cards diferenciados com barra de progresso, status derivado, indicador de filhas ativas.

### Epic detail view

```
+---------------------------------------------+
| Epic: Migracao API v2                       |
| Status: in_progress (3/5)  ========-- 60%   |
+---------------------------------------------+
| [Thread] [Tasks] [Files]                    |
+---------------------------------------------+
| Thread: unificada com filtro por filha      |
| Tasks: lista com status + kick-off + add    |
| Files: attachments/ + output/ por filha     |
+---------------------------------------------+
```

### Acoes

- Create Epic
- Add Task (filha manual)
- Decompose with AI (seta decomposeAutomatically)
- Kick-off task (inicia filha individual)
- Upload attachment
