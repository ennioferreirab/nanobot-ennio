# Memory Consolidation Backlog

Baseado no checklist [`_bmad/bmm/workflows/4-implementation/create-story/checklist.md`](/Users/ennio/Documents/nanobot-ennio/_bmad/bmm/workflows/4-implementation/create-story/checklist.md), este backlog foi estruturado para:

- evitar soluções duplicadas;
- preservar contratos existentes de board/workspace;
- explicitar dependências e riscos;
- definir testes objetivos;
- impedir critérios vagos de “parece que funciona”.

Relação com o plano maior:
- plano detalhado: [2026-03-11-memory-consolidation-remediation-plan.md](/Users/ennio/Documents/nanobot-ennio/docs/plans/2026-03-11-memory-consolidation-remediation-plan.md)

## Decisões de produto já fechadas

- A política de trigger de consolidação será a mesma independentemente do canal e do backend.
- A regra unificada será: consolidar por `threshold` e por `session boundary`.
- Em canais oficiais, `/new` é um `session boundary`.
- No MC, fim de task é um `session boundary`.
- Artefatos persistentes serão `board-scoped`, fora de `memory/` e fora de `tasks/<id>/output/`.
- Os `artifacts` do board serão consultáveis pela config do board, com viewer reaproveitando a lógica já existente da aba `Files`.

## Decisões complementares fechadas

- Regra de identidade do “mesmo agente lógico”:
  - usar `agent_name + effective memory scope`;
  - `with_history` aponta para workspace compartilhado;
  - `clean` continua isolado por board.
- Binding de canais oficiais para recursos `board-scoped`:
  - quando o canal não carregar `board_id`, usar o board default como binding canônico para `artifacts`.
- Política de validação:
  - harness usa workspace temporário por padrão;
  - workspace real só pode ser usado em modo de auditoria explícito.
- Observabilidade mínima:
  - registrar `agent_name`, `backend`, `channel`, `trigger_type`, `boundary_reason`, `memory_workspace`, `artifacts_workspace`, `action`, `skip_reason` e `files_touched`.

---

## P0

### Story P0.1: Unificar o storage canônico de memória entre canais oficiais e MC

**Problema**

Hoje o mesmo agente lógico pode ser acessado por Telegram/canais oficiais e por Mission Control, mas o contrato “mesmo agente, mesma memória” não está suficientemente garantido por testes e evidências.

**Objetivo**

Garantir que, para um agente compartilhado, canais oficiais do nanobot e MC leiam e escrevam no mesmo workspace canônico de memória, mudando apenas o trigger de consolidação.

**Escopo**

- regra explícita de identidade para “mesmo agente lógico”;
- resolução de `memory_workspace`;
- resolução usada por `search_memory`;
- alinhamento entre AgentLoop, MCP bridge e board resolution;
- verificação de compartilhamento de arquivos persistentes do agente.

**Fora de escopo**

- mudar a semântica de boards `clean`;
- redesign da UX de canais;
- nova estratégia de embeddings.

**Dependências**

- [`mc/infrastructure/boards.py`](/Users/ennio/Documents/nanobot-ennio/mc/infrastructure/boards.py)
- [`vendor/claude-code/claude_code/mcp_bridge.py`](/Users/ennio/Documents/nanobot-ennio/vendor/claude-code/claude_code/mcp_bridge.py)
- [`mc/application/execution/context_builder.py`](/Users/ennio/Documents/nanobot-ennio/mc/application/execution/context_builder.py)

**Testes**

- teste de resolução de workspace para agente compartilhado em canal oficial;
- teste de resolução de workspace para o mesmo agente em MC;
- teste de `search_memory` usando o mesmo target canônico;
- teste de igualdade de target físico ou canônico para `MEMORY.md`, `HISTORY.md` e `memory-index.sqlite`.
- teste de binding explícito para recursos `board-scoped` quando o canal não carregar `board_id`.

**Critérios de aceite**

- Para o agente `nanobot`, Telegram e MC resolvem o mesmo storage canônico de memória.
- `search_memory` usa o mesmo workspace que a execução usa.
- `MEMORY.md`, `HISTORY.md` e `memory-index.sqlite` apontam para o mesmo target canônico quando o agente está em modo compartilhado.
- Quando o fluxo usa recursos `board-scoped`, o binding de board fica explícito, documentado e coberto por teste.
- Existe teste automatizado cobrindo esse contrato.

**Evidência de done**

- `pytest` verde nos testes novos.
- inspeção do banco e dos symlinks sem divergência de target.

### Story P0.2: Eliminar duplicação de chunks no índice SQLite para memória compartilhada

**Problema**

O índice atual pode registrar o mesmo conteúdo duas vezes quando chega ao mesmo arquivo por caminhos lógicos diferentes (`workspace/...` e `boards/...` via symlink).

**Objetivo**

Canonicalizar `file_path` no índice e garantir que um arquivo compartilhado produza um único conjunto lógico de chunks.

**Escopo**

- `MemoryIndex.sync_file()`;
- remoção/poda de registros antigos;
- compatibilidade com `with_history`;
- preservação do comportamento de boards `clean`.

**Fora de escopo**

- trocar SQLite;
- mudar chunking ou ranking.

**Dependências**

- [`mc/memory/index.py`](/Users/ennio/Documents/nanobot-ennio/mc/memory/index.py)
- [`tests/mc/memory/test_index.py`](/Users/ennio/Documents/nanobot-ennio/tests/mc/memory/test_index.py)

**Testes**

- indexação do mesmo arquivo por dois paths equivalentes;
- re-sync após canonicalização;
- busca sem duplicatas.

**Critérios de aceite**

- Um arquivo compartilhado indexado por path global e path board gera apenas um conjunto lógico de chunks.
- `search_memory` não retorna duplicatas devido a symlink.
- `chunks.file_path` usa forma canônica estável.
- Boards `clean` continuam com indexação isolada.

**Evidência de done**

- query no banco mostra um único path canônico por arquivo compartilhado;
- `pytest` cobre caso com symlink.

### Story P0.3: Implementar a política unificada de consolidação para sessões

**Problema**

Hoje o storage pode ser compartilhado, mas a política de quando consolidar ainda varia por fluxo e está implícita.

**Objetivo**

Definir e implementar uma política única e explícita de consolidação, independente do canal e do backend: consolidar por `threshold` e por `session boundary`.

**Escopo**

- AgentLoop;
- fluxo `/new` como `session boundary`;
- fim de task no MC como `session boundary`;
- threshold de consolidação;
- observabilidade do trigger e do skip;
- documentação do comportamento.

**Fora de escopo**

- redesign da interface Telegram;
- novos comandos de canal.

**Dependências**

- [`vendor/nanobot/nanobot/agent/loop.py`](/Users/ennio/Documents/nanobot-ennio/vendor/nanobot/nanobot/agent/loop.py)
- [`tests/mc/test_chat_handler.py`](/Users/ennio/Documents/nanobot-ennio/tests/mc/test_chat_handler.py)
- [`tests/mc/memory/test_store.py`](/Users/ennio/Documents/nanobot-ennio/tests/mc/memory/test_store.py)

**Testes**

- sessão longa sem `/new`;
- sessão longa com `/new`;
- sessão que cruza threshold;
- comparação com fluxo de fim de task no MC;
- comparação do mesmo cenário em backend nanobot e `CCBackend`;
- verificação de log/metadata do trigger executado.

**Critérios de aceite**

- Existe uma única política de consolidação documentada em código para canais e backends.
- `threshold` e `session boundary` são os únicos triggers válidos de consolidação automática.
- `/new` em canais oficiais e fim de task no MC executam a mesma regra abstrata de `session boundary`.
- O resultado da consolidação vai para o mesmo storage canônico usado pela execução.
- O runtime registra qual trigger consolidou, ou por que a consolidação foi pulada.
- Existe teste cobrindo ao menos um fluxo de canal oficial, um fluxo MC e um fluxo `CCBackend`.

**Evidência de done**

- `telegram_*.jsonl` deixa de crescer indefinidamente sem regra;
- `HISTORY.md` passa a refletir eventos vindos de canal oficial e MC sob a mesma política;
- logs/metadata permitem explicar cada consolidação executada ou pulada.

---

## P1

### Story P1.1: Garantir paridade funcional de memória entre nanobot backend e CCBackend

**Problema**

O `CCBackend` já tem caminho de consolidação, mas a paridade com nanobot backend ainda não está garantida nos artefatos reais.

**Objetivo**

Fazer o `CCBackend` obedecer ao mesmo contrato funcional de memória do backend nanobot.

**Escopo**

- consolidação;
- `get_memory_context`;
- `search_memory`;
- sync de `memory-index.sqlite`;
- board-aware workspace;
- relocation/quarentena de arquivos inválidos.

**Fora de escopo**

- trocar o provider Claude Code;
- mudar o formato de `MEMORY.md`.

**Dependências**

- [`vendor/claude-code/claude_code/memory_consolidator.py`](/Users/ennio/Documents/nanobot-ennio/vendor/claude-code/claude_code/memory_consolidator.py)
- [`vendor/claude-code/claude_code/workspace.py`](/Users/ennio/Documents/nanobot-ennio/vendor/claude-code/claude_code/workspace.py)
- [`mc/memory/service.py`](/Users/ennio/Documents/nanobot-ennio/mc/memory/service.py)
- [`tests/cc/test_memory_consolidator.py`](/Users/ennio/Documents/nanobot-ennio/tests/cc/test_memory_consolidator.py)
- [`tests/mc/test_executor_cc.py`](/Users/ennio/Documents/nanobot-ennio/tests/mc/test_executor_cc.py)

**Testes**

- execução real de agente `cc/...`;
- verificação de `MEMORY.md`, `HISTORY.md` e índice;
- busca por memória após consolidação;
- board `clean` e board `with_history`.

**Critérios de aceite**

- Um agente `cc/...` grava `MEMORY.md` e `HISTORY.md` no mesmo contrato do backend nanobot.
- O prompt consumido pelo `CCBackend` inclui o mesmo contexto de memória esperado.
- `search_memory` encontra o conteúdo consolidado do agente `cc/...`.
- O índice SQLite é sincronizado após consolidação.
- Arquivos inválidos em `memory/` são tratados do mesmo modo que no backend nanobot.
- O `CCBackend` obedece à mesma política de `threshold` e `session boundary`.

**Evidência de done**

- agentes `offer-strategist`, `sales-revops` ou equivalentes passam a mostrar evidência real de `HISTORY.md` não-vazio quando o cenário exige;
- testes automatizados cobrem o fluxo.

### Story P1.2: Alinhar o harness de validação com o runtime real

**Problema**

O harness de validação atual pode executar `ExecutionEngine()` sem hooks de produção, gerando falso negativo sobre consolidação.

**Objetivo**

Fazer com que a validação use o mesmo pipeline do runtime real, ou documentar e separar explicitamente os modos.

**Escopo**

- `scripts/run_agent_validation.py`;
- factory do execution engine;
- testes de integração do harness.

**Fora de escopo**

- mudar os cenários de validação em massa;
- redesign do formato de relatório.

**Dependências**

- [`scripts/run_agent_validation.py`](/Users/ennio/Documents/nanobot-ennio/scripts/run_agent_validation.py)
- [`mc/application/execution/engine.py`](/Users/ennio/Documents/nanobot-ennio/mc/application/execution/engine.py)
- [`mc/application/execution/post_processing.py`](/Users/ennio/Documents/nanobot-ennio/mc/application/execution/post_processing.py)

**Testes**

- validação de agente nanobot;
- validação de agente `cc/...`;
- comparação entre engine cru e engine de produção, se ambos existirem.

**Critérios de aceite**

- O harness usa os hooks de produção, ou a divergência fica explícita e testada.
- Não existe mais interpretação ambígua de que “validação sem histórico” significa bug de produção.
- O relatório de validação identifica o modo de execução usado.
- Por padrão, a validação roda em workspace isolado; uso do workspace real exige modo explícito.

**Evidência de done**

- testes do harness verdes;
- documentação curta do modo de validação.

### Story P1.3: Enforçar o contrato de `memory/`

**Problema**

Agentes podem acumular arquivos arbitrários dentro de `memory/`, contaminando o índice e confundindo o papel de memória.

**Objetivo**

Fazer `memory/` aceitar apenas arquivos do contrato oficial.

**Escopo**

- policy de memória;
- relocation/quarentena;
- guards de escrita;
- cobertura do caso `youtube-summarizer`.

**Fora de escopo**

- migrar automaticamente todo conteúdo legado para nova estrutura sem review.

**Dependências**

- [`mc/memory/policy.py`](/Users/ennio/Documents/nanobot-ennio/mc/memory/policy.py)
- [`mc/application/execution/post_processing.py`](/Users/ennio/Documents/nanobot-ennio/mc/application/execution/post_processing.py)
- [`vendor/nanobot/nanobot/agent/tools/filesystem.py`](/Users/ennio/Documents/nanobot-ennio/vendor/nanobot/nanobot/agent/tools/filesystem.py)

**Testes**

- presença de `.md` e `.json` inválidos em `memory/`;
- relocation para output/quarantine;
- sync do índice após limpeza.

**Critérios de aceite**

- Apenas `MEMORY.md`, `HISTORY.md`, `HISTORY_ARCHIVE.md`, sidecars SQLite e locks são aceitos em `memory/`.
- Arquivos inválidos não entram no índice principal.
- O caso do `youtube-summarizer` fica reproduzido e coberto.

**Evidência de done**

- inspeção do diretório e do índice sem arquivos ad hoc;
- testes verdes.

---

### Story P1.4: Criar contrato para `artifacts` persistentes por board

**Problema**

Hoje só existem dois destinos claros: `memory/` e `tasks/<id>/output/`. Falta um espaço persistente, `board-scoped`, para arquivos que o agente deve reutilizar entre execuções.

**Objetivo**

Introduzir um diretório persistente explícito de `artifacts/` por board, com política, prompt guidance e acesso pela config do board.

**Escopo**

- definição do diretório persistente por board;
- orientação no prompt do nanobot e do CCBackend;
- política de leitura/escrita;
- integração com Board Settings;
- listagem, abertura e download reaproveitando a lógica de viewer já existente;
- testes de reuso futuro.

**Fora de escopo**

- indexar automaticamente artefatos persistentes como memória;
- construir um sistema completo de knowledge base.

**Dependências**

- [`vendor/nanobot/nanobot/agent/context.py`](/Users/ennio/Documents/nanobot-ennio/vendor/nanobot/nanobot/agent/context.py)
- [`vendor/claude-code/claude_code/workspace.py`](/Users/ennio/Documents/nanobot-ennio/vendor/claude-code/claude_code/workspace.py)
- [`mc/application/execution/file_enricher.py`](/Users/ennio/Documents/nanobot-ennio/mc/application/execution/file_enricher.py)
- [`dashboard/features/boards/components/BoardSettingsSheet.tsx`](/Users/ennio/Documents/nanobot-ennio/dashboard/features/boards/components/BoardSettingsSheet.tsx)
- [`dashboard/features/boards/hooks/useBoardSettingsSheet.ts`](/Users/ennio/Documents/nanobot-ennio/dashboard/features/boards/hooks/useBoardSettingsSheet.ts)
- [`dashboard/features/tasks/components/TaskDetailFilesTab.tsx`](/Users/ennio/Documents/nanobot-ennio/dashboard/features/tasks/components/TaskDetailFilesTab.tsx)
- [`dashboard/components/DocumentViewerModal.tsx`](/Users/ennio/Documents/nanobot-ennio/dashboard/components/DocumentViewerModal.tsx)
- [`dashboard/hooks/useDocumentFetch.ts`](/Users/ennio/Documents/nanobot-ennio/dashboard/hooks/useDocumentFetch.ts)

**Testes**

- gravação permitida de artefato persistente;
- listagem do artifact na config do board;
- abertura/download usando viewer reaproveitado;
- leitura em execução futura;
- garantia de que não vai para `memory/`;
- garantia de que não é tratado como output de task por engano.

**Critérios de aceite**

- Existe um diretório persistente explícito e documentado de `artifacts/` por board.
- O prompt do agente diferencia claramente `memory/`, `artifacts/` e `output/`.
- A config do board permite listar, abrir e baixar os `artifacts` persistentes.
- A abertura do arquivo reutiliza o viewer já existente para `Files`, sem criar um segundo sistema de preview.
- O agente consegue reusar um artifact persistente em execução futura no mesmo board.
- O backend não indexa `artifacts/` como memória.
- O contrato é coberto por testes automatizados.

**Evidência de done**

- testes de reuso verdes;
- prompt/contexto atualizado;
- UI do board navegável com os `artifacts`.

---

## P2

### Story P2.1: Criar runbook operacional de verificação

**Problema**

Mesmo com testes, falta um checklist operacional para validar coesão de memória em agentes reais.

**Objetivo**

Criar um runbook objetivo para declarar “coeso” ou “não coeso”.

**Escopo**

- comandos de inspeção;
- sinais esperados;
- matriz mínima de agentes;
- critérios de passagem.

**Dependências**

- [`docs/ARCHITECTURE.md`](/Users/ennio/Documents/nanobot-ennio/docs/ARCHITECTURE.md)
- novo `docs/memory-consolidation-runbook.md`

**Testes**

- checklist manual reproduzível em:
  - `nanobot` compartilhado,
  - um agente `cc/...`,
  - um board `clean`,
  - um board `with_history`.

**Critérios de aceite**

- Existe um runbook curto e objetivo.
- O runbook permite verificar storage, índices, sessões e artifacts persistentes.
- O runbook inclui sinais de observabilidade para trigger executado e trigger pulado.
- O resultado da inspeção é binário o suficiente para uso operacional.

**Evidência de done**

- documento salvo;
- checklist executável sem contexto oral extra.

---

## Sequência Recomendada

1. `P0.1`
2. `P0.2`
3. `P0.3`
4. `P1.1`
5. `P1.2`
6. `P1.3`
7. `P1.4`
8. `P2.1`

## Gate de Pronto Para Implementação

Uma story só entra em execução quando tiver:

- objetivo único e claro;
- fora de escopo explícito;
- arquivos prováveis de impacto;
- testes definidos;
- critério de aceite observável;
- evidência esperada de done.
