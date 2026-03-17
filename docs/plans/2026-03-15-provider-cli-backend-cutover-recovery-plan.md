# Provider CLI Backend Cutover Recovery Plan

**Date:** 2026-03-15

## Goal

Retomar a migração para `provider-cli` sem depender do `interactive_tui`/`tmux` no caminho suportado de execução de steps, validando tudo apenas pelo backend e por testes.

## Current State

O estado real hoje é este:

- a base de `provider-cli` existe
- `RunnerType.PROVIDER_CLI` existe
- parsers de Claude, Codex e Nanobot existem
- o gateway voltou a subir o runtime legado
- o default voltou para `INTERACTIVE_TUI`
- `tmux` ainda é parte ativa do caminho de step execution

## What Failed

O corte falhou por um motivo estrutural, não por detalhe de parser:

- o gateway ainda não compõe o caminho `provider-cli` como runtime completo
- a execution strategy nova ainda não substitui ponta a ponta o coordinator legado
- o fluxo de conclusão/falha da sessão ainda não está fechado como caminho canônico

Resultado:

- trocar o default para `provider-cli` cedo demais quebrou steps reais
- o rollback foi correto

## Recommendation

Retomar em backend-only, sem dashboard e sem mexer no frontend agora.

Ordem correta:

1. fechar composição do runtime `provider-cli` no gateway
2. fazer Claude rodar step real pelo caminho novo
3. fechar projeção de completion/crash/final result
4. validar cutover por testes backend-only
5. só então trocar o default
6. por último remover `interactive_tui`, PTY e `tmux`

## Scope Boundaries

### In Scope

- Python runtime
- execution engine
- gateway wiring
- provider-cli supervision/process/session lifecycle
- backend tests
- arquitetura e remoção do legado backend

### Out of Scope

- dashboard
- live panel
- terminal panel
- qualquer validação dependente de UI

## Architecture Direction

O caminho novo precisa virar este:

- `resolve_step_runner_type()` seleciona `PROVIDER_CLI`
- `ExecutionEngine` usa strategy própria do provider-cli
- `gateway` compõe supervisor, registry e process core reais
- provider process produz eventos canônicos
- runtime projeta `running`, `review`, `completed`, `crashed` sem tocar no TUI legado
- nenhum step suportado cria sessão `tmux`

## Success Criteria

- um step Claude roda do início ao fim sem `tmux`
- `final_result` é produzido e consumido pela strategy nova
- crash e completion projetam corretamente para task/step
- o default pode mudar para `provider-cli` sem rollback
- o runtime legado pode ser removido do backend com segurança
