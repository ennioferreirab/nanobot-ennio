# Provider CLI Backend Cutover Recovery Wave Plan

**Date:** 2026-03-15

**Goal:** completar o cutover backend para `provider-cli` antes de remover `interactive_tui` e `tmux`.

**Detailed plan:** `docs/plans/2026-03-15-provider-cli-backend-cutover-recovery-plan.md`

---

## Story Decomposition

- `28-8-compose-provider-cli-runtime-in-gateway.md`
- `28-9-run-claude-steps-through-provider-cli-core.md`
- `28-10-close-provider-cli-completion-and-crash-projection.md`
- `28-11-backend-cutover-gates-and-default-flip.md`
- `28-12-retire-interactive-tui-backend-runtime.md`

## Problems Found

### Problem 1: gateway composition is incomplete

O `provider-cli` existe, mas o gateway ainda não o sobe como caminho de execução completo e autossuficiente.

### Problem 2: the supported step path is still legacy

O caminho real de produção ainda passa por `INTERACTIVE_TUI`, coordinator legado e `tmux`.

### Problem 3: end-of-step lifecycle is not fully closed on the new path

Completion, crash, final result e cleanup ainda não estão fortes o bastante para serem o caminho padrão.

### Problem 4: default flip happened before the cutover was ready

O default foi trocado antes da composição completa, então a remoção do legado ficou prematura.

## Wave 0: Freeze the Cutover Boundary

**Objective:** Fixar que o trabalho agora é backend-only e que `interactive_tui` continua temporário.

**Must not do:**

- não mexer em dashboard
- não tentar remover `tmux` antes do cutover backend

**Exit gate:**

- o novo plano backend-only está registrado

## Wave 1: Compose Provider CLI Runtime In Gateway

**Story:** `28-8-compose-provider-cli-runtime-in-gateway.md`

**Objective:** Fazer o gateway compor o runtime `provider-cli` com dependências reais.

**Problems solved:**

- gateway composition incomplete

**Exit gate:**

- gateway sobe o core `provider-cli` sem depender do runtime legado para step execution

## Wave 2: Run Claude Steps Through Provider CLI Core

**Story:** `28-9-run-claude-steps-through-provider-cli-core.md`

**Objective:** Fazer Claude ser o primeiro provedor a executar steps reais sem `tmux`.

**Problems solved:**

- supported step path still legacy

**Exit gate:**

- um step Claude completa pelo caminho `provider-cli`

## Wave 3: Close Completion, Crash, and Final Result Projection

**Story:** `28-10-close-provider-cli-completion-and-crash-projection.md`

**Objective:** Fechar o lifecycle operacional do step no caminho novo.

**Problems solved:**

- end-of-step lifecycle incomplete

**Exit gate:**

- completion, crash, final result e cleanup passam em testes backend-only

## Wave 4: Default Flip And Backend Cutover Gates

**Story:** `28-11-backend-cutover-gates-and-default-flip.md`

**Objective:** Trocar o default com critérios objetivos e rollback boundary claro.

**Problems solved:**

- default flip happened before the cutover was ready

**Exit gate:**

- `provider-cli` vira default com suíte backend verde

## Wave 5: Retire Interactive TUI Backend Runtime

**Story:** `28-12-retire-interactive-tui-backend-runtime.md`

**Objective:** Remover o runtime legado backend quando ele deixar de ser necessário.

**Problems solved:**

- backend still carries dead tmux/PTY ownership

**Exit gate:**

- caminho suportado não instancia `TmuxSessionManager`
- runtime legado backend foi removido ou ficou inacessível por código morto eliminado

## Remediation Wave (inserted between Wave 3 and Wave 4)

**Stories:** `28-13`, `28-14`, `28-15`, `28-16`

**Objective:** Corrigir os dois bloqueios reais encontrados na revisão:
1. `ExecutionRequest.prompt` vazio no fluxo canônico (28-13)
2. Serviços provider-cli compostos no gateway não propagados ao path real de execução (28-14)

**Prerequisite chain:**

- `28-11` e `28-12` ficam bloqueados até `28-13` → `28-14` → `28-15` estarem verdes.
- `28-16` rebaseline a checklist para refletir o path real ao invés de seams sintéticos.

**Exit gate:**

- teste de integração backend-only prova que o step suportado roda sem tmux
- prompt não vazio no comando `--prompt`
- serviços gateway-composed chegam ao engine real

## Validation Rule

Toda validação nesta fase é backend-only:

- `pytest`
- `ruff`
- testes de arquitetura
- testes dirigidos de runtime/strategy/process supervision
