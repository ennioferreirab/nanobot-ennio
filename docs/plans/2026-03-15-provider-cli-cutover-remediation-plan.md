# Provider CLI Cutover Remediation Plan

**Date:** 2026-03-15

**Goal:** corrigir os bloqueios reais encontrados na revisão do épico 28 para que o `provider-cli` consiga executar steps reais no backend sem `tmux`, com prompt canônico, runtime wiring consistente e gates de cutover reabertos.

## Context

As stories `28-8` a `28-12` abriram a estrutura do `provider-cli`, mas a revisão do código mostrou que o caminho de produção ainda não fecha ponta a ponta. O problema não é mais parser ou process supervision isoladamente; o problema agora está na integração do pipeline canônico de execução com o runtime novo.

## Problems Found

### Problem 1: the real execution path does not populate `ExecutionRequest.prompt`

O `ProviderCliRunnerStrategy` só injeta `--prompt` quando `request.prompt` está preenchido. No fluxo real de `ContextBuilder -> StepDispatcher/Executor -> ExecutionEngine`, o request recebe `agent_prompt` e `description`, mas não recebe o prompt final consolidado. O processo sobe, mas não recebe a missão.

### Problem 2: gateway-composed provider-cli services are not used by the real step path

O gateway cria `provider_cli_registry`, `provider_cli_supervisor` e `provider_cli_projector`, mas o caminho real de step execution instancia o engine sem injetar esses serviços. Isso recria registries/supervisors locais e invalida a ideia de composition root.

### Problem 3: the step path still has two engine-construction routes with inconsistent wiring

`Executor` usa `_build_execution_engine()`, mas `StepDispatcher` ainda passa por `_run_step_agent()` e cria o engine por outro caminho. Isso faz o backend ter dois caminhos com garantias diferentes justamente na área que estamos tentando estabilizar.

### Problem 4: backend proof is still too synthetic

Os testes atuais provam peças isoladas, mas ainda não cobrem a sequência crítica:

- construir `ExecutionRequest` real
- resolver `RunnerType.PROVIDER_CLI`
- lançar o strategy com prompt não vazio
- usar os serviços compostos no gateway/runtime
- completar ou falhar um step sem `tmux`

## Recommended Approach

### Option A: patch the minimum surface and keep the current split paths

- preencher `request.prompt` em um ponto qualquer do fluxo
- injetar serviços `provider-cli` só onde quebrar
- manter `_run_step_agent()` e `_build_execution_engine()` coexistindo

**Pros**

- menor diff inicial

**Cons**

- perpetua rotas duplicadas
- aumenta a chance de um path continuar usando defaults escondidos
- dificulta provar o cutover com confiança

### Option B: make the canonical execution request and engine wiring the only supported path

- definir claramente onde o prompt final é montado
- garantir que `Executor` e `StepDispatcher` passem pelo mesmo builder do engine
- fazer o engine sempre receber os serviços `provider-cli` do runtime quando o processo real estiver em execução

**Pros**

- fecha a arquitetura em torno de um caminho só
- reduz divergência entre testes e produção
- prepara o corte final do `interactive_tui`

**Cons**

- exige tocar mais arquivos do backend na remediação

### Recommendation

Seguir a **Option B**. O problema atual não é falta de feature; é falta de coerência entre o runtime composition root e o caminho real de execução. Corrigir isso por completo custa menos do que continuar adicionando patches locais.

## Design

### 1. Canonical prompt assembly

O backend precisa ter uma regra explícita para preencher `ExecutionRequest.prompt`.

Minha recomendação:

- `agent_prompt` continua sendo a orientação/base do agente
- `description` continua sendo o contexto operacional da task/step
- `prompt` passa a ser o bootstrap final que o runner precisa consumir

Para `provider-cli`, o prompt deve ser montado de forma canônica no pipeline de contexto, não dentro do strategy. O strategy só consome `request.prompt`.

### 2. Single runtime composition path

`gateway.py` deve continuar sendo o composition root dos serviços `provider-cli`. O restante do backend não deve criar registries/supervisors default quando estiver em runtime real.

Isso implica:

- `Executor` e `StepDispatcher` devem receber o mesmo builder de engine ou o mesmo acesso aos serviços do runtime
- `_run_step_agent()` não pode continuar criando um engine parcialmente injetado
- o caminho suportado de step execution deve usar exatamente os serviços compostos no gateway

### 3. Step execution proof without tmux

Antes de reabrir `28-11` e `28-12`, o backend precisa provar o seguinte cenário com testes:

1. construir `req` real para um step
2. `resolve_step_runner_type(req)` retornar `PROVIDER_CLI`
3. o strategy receber `--prompt <non-empty>`
4. o session registry compartilhado ser usado
5. nenhuma dependência de `interactive_session_coordinator` ou `tmux` aparecer nesse fluxo

### 4. Re-baseline the remaining cutover stories

Depois dessas correções:

- `28-11` volta a ser sobre default flip, não sobre descobrir lacunas de wiring
- `28-12` volta a ser remoção final, não tentativa prematura de remoção

## Non-Goals

- nenhuma mudança em dashboard/frontend
- nenhuma nova UX
- nenhum ajuste em parser multi-provider além do necessário para o fluxo Claude atual
- nenhuma remoção imediata de `interactive_tui` antes das provas backend-only

## Deliverables

- plano em waves de remediação
- plano detalhado de execução backend-only
- novas stories BMad para:
  - prompt canônico
  - propagação do runtime wiring
  - prova backend-only do path real
  - preservação de `agent_prompt` no bootstrap final
  - rebaseline dos gates de cutover

## Success Criteria

- `ExecutionRequest.prompt` fica preenchido no fluxo real de task/step que usa `provider-cli`
- o bootstrap final do `provider-cli` preserva `agent_prompt` e orientation do agente
- nenhum path real de produção cria `ProviderSessionRegistry`/`ProviderProcessSupervisor` escondidos quando os serviços do runtime existem
- `StepDispatcher` e `Executor` usam um caminho coerente de construção do engine
- existe teste backend-only que prova step execution sem `tmux`
- só depois disso `28-11` e `28-12` voltam à fila
