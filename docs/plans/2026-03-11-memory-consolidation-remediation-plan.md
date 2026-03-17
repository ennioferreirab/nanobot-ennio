# Memory Consolidation Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Corrigir os gaps de consolidação e indexação de memória entre nanobot backend, CCBackend, Telegram e Mission Control, de modo que `MEMORY.md`, `HISTORY.md` e `memory-index.sqlite` reflitam o comportamento esperado por agente e por board.

**Architecture:** O trabalho deve atacar a causa raiz em quatro camadas: disparo de consolidação, canonicalização do índice SQLite, cobertura de runtime real para CC/nanobot e saneamento do contrato de arquivos em `memory/`. A implementação deve preservar o modelo atual de workspaces globais vs board-scoped, mas eliminar ambiguidade de caminhos e fluxos que hoje só funcionam no código, não nos artefatos persistidos.

**Tech Stack:** Python, SQLite/FTS5/sqlite-vec, nanobot AgentLoop, Claude Code workspace/memory bridge, pytest.

---

## Refined Problem Statement

O problema real não é apenas “`HISTORY.md` vazio”. Existem três contratos de produto que hoje não estão suficientemente garantidos:

1. **Paridade entre canais oficiais do nanobot e Mission Control**
   - Para o mesmo agente lógico, Telegram e outros canais oficiais do nanobot devem consumir, escrever, consolidar e buscar memória no mesmo workspace canônico.
   - A política de trigger deve ser a mesma em todos os canais/backends: consolidar por `threshold` e por `session boundary`.
   - A diferença entre canal e MC deve ser apenas **qual evento materializa o `session boundary`**, não **onde armazenar** nem **como buscar**.
   - O agente deve compartilhar aprendizados, memória e arquivos persistentes relevantes independentemente do canal de entrada.

2. **Paridade entre nanobot backend e CCBackend**
   - O `CCBackend` não pode implementar apenas “escrita de `HISTORY.md`”.
   - Ele precisa seguir o mesmo contrato funcional do backend nanobot para:
     - consolidação
     - contexto de memória injetado em prompt
     - busca por memória
     - resolução de workspace/board
     - indexação SQLite
     - saneamento de arquivos inválidos

3. **Separação clara entre memória, artefatos persistentes e output de task**
   - `MEMORY.md`/`HISTORY.md` são para fatos e histórico consolidado.
   - `tasks/<id>/output/` é para entregáveis específicos de uma task.
   - Artefatos persistentes serão `board-scoped`, consultáveis pela config do board, e devem reutilizar o viewer já existente da aba `Files`.
   - Falta um fluxo explícito para **artefatos persistentes de uso contínuo do agente**, como bases de referência, templates operacionais, catálogos, resumos duráveis e outros arquivos que o agente deva reusar depois.

## Additional Design Decisions

- **Identidade do mesmo agente lógico**
  - usar `agent_name + effective memory scope`;
  - `with_history` resolve para workspace compartilhado;
  - `clean` resolve para workspace isolado por board.
- **Binding de canais oficiais para recursos `board-scoped`**
  - quando o canal não carregar `board_id`, usar o board default como binding canônico para `artifacts`.
- **Validação isolada por padrão**
  - harness usa workspace temporário por padrão;
  - workspace real só pode ser usado em modo de auditoria explícito.
- **Observabilidade mínima**
  - registrar `agent_name`, `backend`, `channel`, `trigger_type`, `boundary_reason`, `memory_workspace`, `artifacts_workspace`, `action`, `skip_reason` e `files_touched`.

## Product Rules To Preserve

- Canais oficiais do nanobot, MC e `CCBackend` usam a mesma política de trigger: `threshold` + `session boundary`.
- `/new` em canais oficiais é um `session boundary`.
- Fim de task no MC é um `session boundary`.
- Boards em modo `clean` continuam isolando memória.
- Boards em modo `with_history` continuam compartilhando memória.
- O contrato de `memory/` continua restrito; artefatos persistentes não devem vazar para essa pasta.
- Artefatos persistentes ficam em diretório `board-scoped`, fora de `memory/` e fora de `tasks/<id>/output/`.
- `output/` continua sendo o destino padrão para deliverables da task.

## Objective Acceptance Criteria

### AC1: Canonical Storage Equality

Para um mesmo agente configurado para compartilhar memória:

- Telegram e MC resolvem o mesmo `memory_workspace` canônico.
- `MEMORY.md`, `HISTORY.md` e `memory-index.sqlite` ficam no mesmo target físico ou no mesmo target canônico.
- `search_memory` via MCP bridge e o contexto montado pelo nanobot usam esse mesmo workspace.

### AC2: Channel Trigger Parity

Para o mesmo agente compartilhado:

- Em qualquer canal/backend, a consolidação acontece por `threshold` e por `session boundary`.
- No Telegram e outros canais oficiais, `/new` executa `session boundary`.
- No MC, fim de task executa `session boundary`.
- No `CCBackend`, a mesma regra se aplica ao runtime de execução.
- Em ambos os casos, o resultado final aparece no mesmo storage canônico.
- O comportamento de trigger é explícito em código e coberto em teste.

### AC3: Shared Learning And Shared Files

Após uma interação relevante em um canal oficial e outra no MC:

- fatos duráveis aparecem no mesmo `MEMORY.md`;
- eventos consolidados aparecem no mesmo `HISTORY.md`;
- arquivos persistentes compartilháveis aparecem em um diretório persistente próprio, `board-scoped`, separado de `memory/` e de `tasks/<id>/output/`;
- a config do board permite consultar esses arquivos persistentes;
- o agente consegue ler esses arquivos persistentes em execuções futuras independentemente do canal.

### AC4: No Duplicate Chunks

Para um workspace compartilhado via symlink:

- o índice SQLite contém apenas um conjunto lógico de chunks por arquivo canônico;
- `search_memory` não retorna duplicatas oriundas de `workspace/...` vs `boards/...` para o mesmo conteúdo;
- `chunks.file_path` no banco usa forma canônica estável.

### AC5: CCBackend Memory Parity

Para um agente `cc/...`:

- a execução gera `MEMORY.md`/`HISTORY.md` no mesmo contrato do nanobot backend;
- o prompt de trabalho consome o mesmo contexto de memória;
- `search_memory` encontra o mesmo conteúdo consolidado;
- `memory-index.sqlite` é sincronizado;
- arquivos inválidos em `memory/` são relocados/quarentenados do mesmo modo.
- a política de `threshold` + `session boundary` é respeitada do mesmo modo.

### AC6: Validation Harness Parity

- O harness de validação usa o mesmo pipeline de hooks pós-execução do runtime real, ou
- a divergência é intencional, explicitamente nomeada, documentada e coberta em teste.
- Não pode existir falso negativo silencioso em que “a validação mostra sem consolidação” enquanto produção consolidaria.
- Por padrão, a validação deve rodar em workspace isolado; uso de workspace real deve ser explícito.

### AC7: Persistent Artifact Contract

Para artefatos de uso contínuo do agente:

- existe um diretório persistente explícito por board;
- o prompt do agente diferencia claramente:
  - `memory/` para fatos e histórico,
  - `artifacts/` ou diretório equivalente para arquivos de reuso contínuo,
  - `tasks/<id>/output/` para outputs específicos da task;
- o backend não indexa artefatos persistentes como se fossem memória, a menos que isso seja explicitamente parte do desenho;
- a config do board expõe listagem e abertura desses arquivos usando o viewer já existente;
- existe pelo menos um fluxo de leitura/reuso desses artefatos em execuções futuras.

## Test Matrix

Os testes finais devem cobrir pelo menos esta matriz:

- `nanobot` compartilhado via canal oficial + MC
- um agente board `clean`
- um agente board `with_history`
- um agente `cc/...`
- um agente nanobot puro não-CC
- um caso com arquivo inválido dentro de `memory/`
- um caso com artefato persistente válido fora de `memory/`

### Task 1: Reproduzir e congelar os bugs observados em testes

**Files:**
- Modify: `tests/mc/memory/test_index.py`
- Modify: `tests/mc/test_board_utils.py`
- Modify: `tests/mc/test_chat_handler.py`
- Modify: `tests/test_run_agent_validation.py`

**Step 1: Write the failing tests**

- Adicionar um teste em `tests/mc/memory/test_index.py` que indexe o mesmo arquivo por dois caminhos equivalentes via symlink e confirme que apenas um conjunto de chunks é persistido.
- Adicionar um teste em `tests/mc/test_board_utils.py` que cubra `with_history` para um agente com memória symlinkada e valide que o índice não duplica `file_path`.
- Adicionar um teste em `tests/mc/test_chat_handler.py` que cubra chat nanobot de longa duração e congele a política já definida: consolidar por `threshold` e por `session boundary`.
- Adicionar um teste em `tests/cc/test_mcp_bridge.py` que confirme que `search_memory` resolve o mesmo workspace canônico que o backend de execução para o mesmo agente/board.
- Adicionar um teste em `tests/test_run_agent_validation.py` que prove que o harness de validação usa o mesmo conjunto de hooks pós-execução do runtime de produção, ou então documente explicitamente que não usa.
- Adicionar um teste para binding explícito de recursos `board-scoped` quando o fluxo de canal não carregar `board_id`.

**Step 2: Run tests to verify they fail**

Run:

```bash
uv run pytest tests/mc/memory/test_index.py tests/mc/test_board_utils.py tests/mc/test_chat_handler.py tests/cc/test_mcp_bridge.py tests/test_run_agent_validation.py -v
```

Expected:

- Pelo menos um teste deve falhar por duplicação de chunks para caminhos equivalentes.
- Pelo menos um teste deve falhar ou evidenciar que o harness de validação não executa hooks de consolidação.
- Pelo menos um teste deve falhar por divergência entre resolução de workspace de busca e de execução.

**Step 3: Commit**

```bash
git add tests/mc/memory/test_index.py tests/mc/test_board_utils.py tests/mc/test_chat_handler.py tests/test_run_agent_validation.py
git commit -m "test: capture memory consolidation regressions"
```

### Task 2: Corrigir a canonicalização de caminhos no índice de memória

**Files:**
- Modify: `mc/memory/index.py`
- Modify: `mc/infrastructure/boards.py`
- Test: `tests/mc/memory/test_index.py`
- Test: `tests/mc/test_board_utils.py`

**Step 1: Implement canonical path handling**

- Em `mc/memory/index.py`, canonicalizar o `file_path` antes de gravar nos metadados do banco.
- A canonicalização deve usar um caminho estável e consistente para arquivos symlinkados.
- O objetivo é evitar que `workspace/memory/MEMORY.md` e `boards/default/.../memory/MEMORY.md` gerem registros separados quando referenciam o mesmo inode/conteúdo.

**Step 2: Re-sync logic**

- Garantir que `sync()` e `sync_file()` removam corretamente entradas antigas baseadas no caminho canonicalizado.
- Validar que a poda de arquivos não apague conteúdo legítimo de boards `clean`.

**Step 3: Run focused tests**

Run:

```bash
uv run pytest tests/mc/memory/test_index.py tests/mc/test_board_utils.py tests/cc/test_mcp_bridge.py -v
```

Expected:

- Todos os testes passam.
- O índice mantém um único conjunto de chunks para memória compartilhada via symlink.
- `search_memory` não muda de resultado dependendo do path lógico usado para chegar ao mesmo arquivo.

**Step 4: Commit**

```bash
git add mc/memory/index.py mc/infrastructure/boards.py tests/mc/memory/test_index.py tests/mc/test_board_utils.py
git commit -m "fix: canonicalize shared memory index paths"
```

### Task 3: Implementar a política unificada de consolidação para sessões

**Files:**
- Modify: `vendor/nanobot/nanobot/agent/loop.py`
- Modify: `mc/contexts/conversation/chat_handler.py`
- Modify: `mc/application/execution/post_processing.py`
- Test: `tests/mc/test_chat_handler.py`
- Test: `tests/mc/memory/test_store.py`

**Step 1: Implement the agreed policy**

- Aplicar a política já definida para todos os canais/backends:
  - consolidar por `threshold`;
  - consolidar por `session boundary`.
- Tratar `/new` em canais oficiais como `session boundary`.
- Tratar fim de task no MC como `session boundary`.
- Não manter o estado atual implícito, em que Telegram compartilha storage com MC mas não consolida.
- Registrar observabilidade suficiente para explicar trigger executado e motivo de skip.

**Step 2: Implement minimal code**

- Ajustar o `AgentLoop` e o runtime para disparar consolidação por `threshold` e `session boundary`.
- Garantir que nanobot backend e `CCBackend` passem pela mesma regra abstrata.
- Preservar a proteção contra dupla consolidação e limpar sessão apenas quando a política exigir.
- Garantir que `/new` continue sendo um trigger válido para canais oficiais.

**Step 3: Run tests**

Run:

```bash
uv run pytest tests/mc/test_chat_handler.py tests/mc/memory/test_store.py tests/mc/test_executor_cc.py -v
```

Expected:

- Testes passam.
- O comportamento de chat contínuo fica definido e coberto.
- O mesmo agente passa a consolidar no mesmo storage canônico tanto após fluxo de canal oficial quanto após fluxo MC.
- O `CCBackend` passa a obedecer à mesma política de trigger.

**Step 4: Commit**

```bash
git add vendor/nanobot/nanobot/agent/loop.py mc/contexts/conversation/chat_handler.py mc/application/execution/post_processing.py tests/mc/test_chat_handler.py tests/mc/memory/test_store.py
git commit -m "fix: define chat memory consolidation policy"
```

### Task 4: Alinhar CCBackend e harness de validação ao runtime real

**Files:**
- Modify: `scripts/run_agent_validation.py`
- Modify: `mc/application/execution/engine.py`
- Modify: `mc/application/execution/post_processing.py`
- Test: `tests/test_run_agent_validation.py`
- Test: `tests/cc/test_memory_consolidator.py`
- Test: `tests/mc/test_executor_cc.py`

**Step 1: Remove false negatives from validation**

- Fazer o harness de validação usar `build_execution_engine()` ou uma factory equivalente ao runtime de produção.
- Se isso for intencionalmente diferente, separar claramente “validation mode” de “production mode” e impedir que os resultados sejam interpretados como evidência de consolidação.
- Fazer o modo padrão rodar em workspace isolado, deixando workspace real apenas para auditoria explícita.

**Step 2: Verify CC consolidation end-to-end**

- Garantir que agentes com modelo `cc/...` e backend Claude Code escrevam `HISTORY.md` de forma observável quando executados pelo caminho real.
- Cobrir explicitamente o caso dos agentes atuais: `offer-strategist`, `sales-revops`, `marketing-copy`, `finance-pricing`, `delivery-systems`.
- Validar também que o contexto de memória consumido por Claude Code e a busca por `search_memory` apontam para o mesmo storage consolidado.

**Step 3: Run tests**

Run:

```bash
uv run pytest tests/test_run_agent_validation.py tests/cc/test_memory_consolidator.py tests/mc/test_executor_cc.py tests/cc/test_workspace.py tests/cc/test_mcp_bridge.py -v
```

Expected:

- O harness não diverge mais do runtime sem documentação.
- CC consolidation passa em fluxo real de execução.
- `CCBackend` passa nos mesmos invariantes de memória que o backend nanobot.

**Step 4: Commit**

```bash
git add scripts/run_agent_validation.py mc/application/execution/engine.py mc/application/execution/post_processing.py tests/test_run_agent_validation.py tests/cc/test_memory_consolidator.py tests/mc/test_executor_cc.py
git commit -m "fix: align validation harness with production memory hooks"
```

### Task 5: Saneamento e guarda do contrato de arquivos em `memory/`

**Files:**
- Modify: `mc/memory/policy.py`
- Modify: `mc/application/execution/post_processing.py`
- Modify: `mc/memory/service.py`
- Test: `tests/mc/memory/test_policy.py`
- Test: `tests/mc/test_filesystem_memory_guard.py`

**Step 1: Cover the current invalid-memory case**

- Adicionar teste para o caso observado em `youtube-summarizer`, onde arquivos arbitrários `.md` e `.json` foram parar em `memory/`.
- Confirmar que esses arquivos são quarentenados/relocados e não participam do índice principal de memória do agente.

**Step 2: Minimal implementation**

- Reforçar a detecção e a quarentena no fluxo que abre/sincroniza a store.
- Manter apenas `MEMORY.md`, `HISTORY.md`, `HISTORY_ARCHIVE.md`, SQLite sidecars e lockfiles como contrato oficial.
- Garantir que nenhum prompt oriente agentes a salvar artefatos persistentes em `memory/`.

**Step 3: Run tests**

Run:

```bash
uv run pytest tests/mc/memory/test_policy.py tests/mc/test_filesystem_memory_guard.py -v
```

Expected:

- Arquivos inválidos são detectados e removidos do caminho crítico.
- O índice deixa de chunkar artefatos ad hoc dentro de `memory/`.
- O caso observado do `youtube-summarizer` fica coberto por teste.

**Step 4: Commit**

```bash
git add mc/memory/policy.py mc/application/execution/post_processing.py mc/memory/service.py tests/mc/memory/test_policy.py tests/mc/test_filesystem_memory_guard.py
git commit -m "fix: enforce memory directory contract"
```

### Task 6: Introduzir contrato de `artifacts/` persistentes por board

**Files:**
- Modify: `vendor/nanobot/nanobot/agent/context.py`
- Modify: `vendor/claude-code/claude_code/workspace.py`
- Modify: `mc/application/execution/file_enricher.py`
- Modify: `vendor/nanobot/nanobot/agent/tools/filesystem.py`
- Modify: `dashboard/features/boards/components/BoardSettingsSheet.tsx`
- Modify: `dashboard/features/boards/hooks/useBoardSettingsSheet.ts`
- Modify: `dashboard/components/DocumentViewerModal.tsx`
- Modify: `dashboard/hooks/useDocumentFetch.ts`
- Create: `mc/artifacts/__init__.py`
- Create: `mc/artifacts/policy.py`
- Test: `tests/mc/test_filesystem_memory_guard.py`
- Create: `tests/mc/test_artifact_policy.py`

**Step 1: Define the contract**

- Introduzir um diretório persistente explícito `board-scoped`, por exemplo `artifacts/`, fora de `memory/` e fora de `tasks/<id>/output/`.
- Definir que esse diretório serve para arquivos duráveis de reuso contínuo no board.
- Se necessário, permitir subpastas por agente dentro do board para evitar colisão de nomes.

**Step 2: Update prompt guidance**

- Atualizar prompts/contexto de nanobot e CC para instruir:
  - fatos em `memory/`
  - artefatos persistentes em `artifacts/`
  - deliverables de task em `tasks/<id>/output/`
- Ajustar mensagens de erro e guidance do filesystem tool para apontar o destino correto.
- Expor a listagem dos `artifacts` na config do board, reaproveitando o viewer já existente da aba `Files`.

**Step 3: Add policy and tests**

- Criar testes que provem que o agente pode gravar um artifact persistente permitido fora de `memory/`.
- Criar testes que provem que esse artifact é legível em execução futura no mesmo board.
- Criar testes da UI do board para listar, abrir e baixar `artifacts`.
- Criar testes que garantam que esse diretório não é confundido com `memory/`.

**Step 4: Run tests**

Run:

```bash
uv run pytest tests/mc/test_filesystem_memory_guard.py tests/mc/test_artifact_policy.py tests/cc/test_workspace.py -v
npm run test -- BoardSettingsSheet DocumentViewerModal TaskDetailSheet
```

Expected:

- Existe um caminho persistente explícito `board-scoped` para reuso contínuo.
- Prompts e guards apontam para esse caminho.
- O agente consegue compartilhar arquivos persistentes relevantes entre execuções no mesmo board.
- A config do board permite consultar e abrir os `artifacts`.

**Step 5: Commit**

```bash
git add vendor/nanobot/nanobot/agent/context.py vendor/claude-code/claude_code/workspace.py mc/application/execution/file_enricher.py vendor/nanobot/nanobot/agent/tools/filesystem.py dashboard/features/boards/components/BoardSettingsSheet.tsx dashboard/features/boards/hooks/useBoardSettingsSheet.ts dashboard/components/DocumentViewerModal.tsx dashboard/hooks/useDocumentFetch.ts mc/artifacts/__init__.py mc/artifacts/policy.py tests/mc/test_filesystem_memory_guard.py tests/mc/test_artifact_policy.py tests/cc/test_workspace.py
git commit -m "feat: add persistent agent artifacts contract"
```

### Task 7: Verificação operacional com amostragem real de agentes

**Files:**
- Modify: `scripts/run_agent_validation.py`
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/memory-consolidation-runbook.md`
- Test: `tests/test_run_agent_validation.py`

**Step 1: Add operational checks**

- Registrar um checklist mínimo para validar, em ambiente local:
  - um agente nanobot puro,
  - um agente CC,
  - o `nanobot` compartilhado Telegram/MC,
  - um board `clean`,
  - um board `with_history`,
  - um caso com artefato persistente de reuso.
- Documentar como ler `MEMORY.md`, `HISTORY.md`, `memory-index.sqlite`, `*-wal`, `*-shm`, sessões JSONL e sinais de observabilidade para diagnosticar divergências.

**Step 2: Write the runbook**

- Criar `docs/memory-consolidation-runbook.md` com:
  - sintomas
  - comandos de inspeção
  - interpretação esperada
  - leitura dos triggers executados e dos skips
  - critérios para dizer “funcionando”

**Step 3: Run tests**

Run:

```bash
uv run pytest tests/test_run_agent_validation.py -v
```

Expected:

- O harness suporta a verificação operacional definida.
- Existe uma checklist objetiva para declarar o sistema “coeso” ou “não coeso”.

**Step 4: Commit**

```bash
git add scripts/run_agent_validation.py docs/ARCHITECTURE.md docs/memory-consolidation-runbook.md tests/test_run_agent_validation.py
git commit -m "docs: add memory consolidation verification runbook"
```

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 4
4. Task 3
5. Task 5
6. Task 6
7. Task 7

## Risk Notes

- O bug de maior impacto hoje é a duplicação de chunks no `nanobot` compartilhado por board/workspace.
- O segundo maior risco é o gap entre “o código parece consolidar” e “os artefatos reais mostram `HISTORY.md` vazio”, especialmente no `CCBackend`.
- O terceiro risco é operacional: Telegram compartilha os mesmos arquivos do `nanobot` do MC, mas a sessão longa permanece fora da consolidação.
- O quarto risco é semântico: sem contrato explícito de artefatos persistentes, agentes continuarão abusando de `memory/` ou de `output/` para dados que deveriam sobreviver entre execuções.

## Success Criteria

- `search_memory` não retorna duplicatas para memória compartilhada por symlink.
- Agentes `cc/...` passam a produzir `HISTORY.md` observável em runtime real e a buscar memória do mesmo jeito que o backend nanobot.
- O `nanobot` compartilhado entre Telegram e MC tem política de consolidação explícita e testada.
- Canais oficiais do nanobot e MC, para o mesmo agente compartilhado, usam o mesmo storage canônico de memória.
- Arquivos fora do contrato deixam de contaminar o índice de memória.
- Existe um diretório persistente explícito para artefatos contínuos, com prompt guidance e testes de reuso.

Plan complete and saved to `docs/plans/2026-03-11-memory-consolidation-remediation-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
