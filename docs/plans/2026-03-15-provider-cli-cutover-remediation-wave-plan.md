# Provider CLI Cutover Remediation Wave Plan

**Date:** 2026-03-15

**Goal:** corrigir os bloqueios de integração do `provider-cli` antes de reabrir o default flip e a remoção do `interactive_tui`.

**Detailed plan:** `docs/plans/2026-03-15-provider-cli-cutover-remediation-plan.md`

---

## Story Decomposition

- `28-13-populate-canonical-provider-cli-prompt.md`
- `28-14-route-gateway-provider-cli-services-through-runtime.md`
- `28-15-prove-provider-cli-step-execution-backend-only.md`
- `28-17-preserve-agent-prompt-in-provider-cli-bootstrap.md`
- `28-16-rebaseline-provider-cli-cutover-gates.md`

## Wave 0: Freeze the Broken Cutover Assumptions

**Objective:** registrar que o cutover não está bloqueado por parser, e sim por integração do runtime com o pipeline canônico de execução.

**Problems solved:**

- evita tratar `28-11` e `28-12` como prontos para continuação linear

**Must not do:**

- não trocar default para `provider-cli`
- não remover `interactive_tui`
- não usar dashboard para validação

**Exit gate:**

- plano de remediação publicado
- backlog reaberto com stories específicas para os findings reais

## Wave 1: Populate Canonical Provider CLI Prompt

**Story:** `28-13-populate-canonical-provider-cli-prompt.md`

**Objective:** garantir que o request real de task/step carregue o prompt final que o provider CLI precisa executar.

**Problems solved:**

- `ExecutionRequest.prompt` vazio no fluxo real

**Exit gate:**

- `ContextBuilder` ou pipeline equivalente popula `request.prompt`
- testes provam `--prompt <non-empty>` no fluxo real

## Wave 2: Route Gateway Provider CLI Services Through Runtime

**Story:** `28-14-route-gateway-provider-cli-services-through-runtime.md`

**Objective:** fazer o caminho real de execução consumir os serviços `provider-cli` compostos no gateway/runtime, eliminando defaults escondidos.

**Problems solved:**

- gateway-composed services não usados
- duplicidade de caminhos de engine construction

**Exit gate:**

- `Executor` e `StepDispatcher` usam wiring coerente
- nenhum step path suportado recria registry/supervisor local sem necessidade

## Wave 3: Prove Provider CLI Step Execution Backend-Only

**Story:** `28-15-prove-provider-cli-step-execution-backend-only.md`

**Objective:** provar o caso decisivo de execução real de step pelo caminho `provider-cli`, sem `tmux`.

**Problems solved:**

- prova atual ainda sintética demais

**Exit gate:**

- teste backend-only cobre `context -> runner_type -> strategy -> completion/crash`
- teste garante ausência de dependência em `tmux` no path suportado

## Wave 4: Preserve Agent Prompt In Provider CLI Bootstrap

**Story:** `28-17-preserve-agent-prompt-in-provider-cli-bootstrap.md`

**Objective:** garantir que o path `provider-cli` preserve persona, orientation e guardrails do agente, em vez de enviar só o corpo operacional da missão.

**Problems solved:**

- backend executa sem `agent_prompt` no bootstrap final

**Exit gate:**

- o bootstrap canônico inclui instruções do agente + missão operacional
- testes backend-only cobrem task e step path com preservação de persona/orientation

## Wave 5: Rebaseline Cutover Gates And Resume 28-11/28-12

**Story:** `28-16-rebaseline-provider-cli-cutover-gates.md`

**Objective:** redefinir os gates de cutover em cima das correções novas e só então recolocar o default flip/retirement na fila.

**Problems solved:**

- gates antigos estavam assumindo um backend pronto que ainda não existia

**Exit gate:**

- checklist de cutover atualizado
- critérios explícitos para reabrir `28-11` e `28-12`

## Validation Rule

Toda validação nesta remediação é backend-only:

- `uv run pytest`
- `uv run ruff check`
- `uv run ruff format --check`
- testes de arquitetura/boundary já exigidos no projeto

Nenhuma etapa depende de dashboard, browser ou validação manual em frontend.
