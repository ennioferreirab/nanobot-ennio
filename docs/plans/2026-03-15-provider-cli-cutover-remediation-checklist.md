# Provider CLI Cutover Remediation Checklist

**Date:** 2026-03-15

Use este checklist antes de retomar `28-11` ou `28-12`.

## Prompt Contract

- [ ] `ExecutionRequest.prompt` é preenchido no fluxo real de task
- [ ] `ExecutionRequest.prompt` é preenchido no fluxo real de step
- [ ] `ProviderCliRunnerStrategy` recebe `--prompt` a partir do request canônico
- [ ] o bootstrap final do `provider-cli` preserva `agent_prompt`/orientation/persona

## Runtime Wiring

- [ ] o runtime real usa `provider_cli_registry` composto no gateway
- [ ] o runtime real usa `provider_cli_supervisor` composto no gateway
- [ ] não existe path suportado de step criando registry/supervisor default sem necessidade
- [ ] `Executor` e `StepDispatcher` compartilham o mesmo contrato de construção do engine

## Backend Proof

- [ ] existe teste backend-only cobrindo step execution por `provider-cli`
- [ ] o teste cobre `context -> runner_type -> strategy -> completion/crash`
- [ ] o teste prova que o path suportado não depende de `tmux`
- [ ] o teste prova que o path suportado não depende de `interactive_session_coordinator`

## Cutover Gate

- [ ] só depois dos itens acima `28-11` pode retomar o default flip
- [ ] só depois de `28-11` validado `28-12` pode retomar a remoção do legado
