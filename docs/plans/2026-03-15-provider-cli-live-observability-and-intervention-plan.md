# Provider CLI Live Observability And Intervention Plan

**Date:** 2026-03-15

**Goal:** fechar o fluxo backend-first de observabilidade e intervenção do `provider-cli`, provando ponta a ponta que o runtime projeta estado real, persiste telemetria útil e que `interrupt/stop/resume` têm efeito verificável no subprocesso antes de qualquer dependência de dashboard.

## Context

O cutover do `provider-cli` já consegue executar steps reais. O problema agora não é mais “rodar uma vez”; é “conseguir confiar no runtime quando ele estiver em execução”.

O backend já tem várias peças úteis:

- `LiveStreamProjector`
- `HumanInterventionController`
- `InteractiveSessionRegistry`
- `InteractiveExecutionSupervisor`
- `interactiveSessions` e `sessionActivityLog` no Convex

Isso é suficiente para montar um fluxo coeso sem inventar uma segunda arquitetura. O ponto correto é reaproveitar o contrato de supervisão já usado no runtime interativo, e fazer o `provider-cli` publicar nesse mesmo funil.

## Problems Found

### Problem 1: provider-cli still lacks a canonical supervision sink

O `provider-cli` gera `ParsedCliEvent`, mas ainda não está fechado que esses eventos passam pelo mesmo contrato canônico de supervisão que já alimenta `InteractiveExecutionSupervisor`. Sem isso, surgem duas semânticas de sessão concorrentes.

### Problem 2: runtime eventing is not yet the proof source

Hoje ainda é fácil cair em validação por log de gateway ou por efeito visual. Isso não é suficiente. A prova precisa sair do backend em três níveis:

- estado resumido em `interactiveSessions`
- timeline ordenada em `sessionActivityLog`
- mudança real no subprocesso supervisionado

### Problem 3: operator diagnostics are incomplete

O prompt bootstrap existe, mas ainda precisa ser tratado como dado de sessão de primeira classe. O mesmo vale para:

- último comando de controle emitido
- resultado do comando
- último erro legível
- provider session id

### Problem 4: intervention path must be proven on a real subprocess

Não basta testar que uma mutation foi chamada ou que o registry mudou. O sistema precisa provar que:

- `interrupt` chegou ao parser/handle corretos
- `stop` encerrou o processo
- `resume` retomou a sessão quando suportado, ou falhou explicitamente quando não suportado

### Problem 5: dashboard is a later consumer, not current scope

As superfícies do dashboard podem ser úteis depois, mas elas não podem entrar como critério de conclusão desta etapa. O recorte correto agora é backend e testes.

## Approaches

### Option A: create a provider-cli-specific observability path

**Pros**

- pode parecer mais rápido no curto prazo

**Cons**

- duplica semântica que já existe no runtime interativo
- aumenta risco de divergência entre providers
- piora manutenção e debugging

### Option B: reuse the interactive supervision contract as the canonical sink

**Pros**

- um só contrato de sessão e activity log
- menor risco arquitetural
- reduz código duplicado
- facilita validar parity entre runtimes

**Cons**

- exige encaixar corretamente os eventos `ParsedCliEvent` no funil existente

### Recommendation

Seguir a **Option B**.

O backend já tem um contrato de supervisão maduro o bastante para isso. O caminho coerente é fazer `provider-cli` produzir os mesmos tipos de efeito operacional esperados pelo runtime atual:

1. persistência de sessão
2. persistência de timeline
3. efeito real no subprocesso

## Design

### 1. Canonical supervision path

O `provider-cli` deve produzir eventos que deságuem no mesmo contrato de supervisão já usado em `InteractiveExecutionSupervisor`, em vez de escrever diretamente em múltiplos destinos ad hoc.

Fluxo recomendado:

1. parser produz `ParsedCliEvent`
2. projector atribui `seq` e `timestamp`
3. adaptador converte para evento de supervisão canônico
4. `InteractiveExecutionSupervisor` atualiza:
   - `interactiveSessions`
   - `sessionActivityLog`
   - side effects operacionais necessários

Isso evita duplicar regras de:

- `summary`
- `last_error`
- `final_result`
- `supervision_state`
- truncamento de `tool_input`

### 2. Session metadata contract

`interactiveSessions` deve refletir a sessão `provider-cli` real com campos suficientes para operação backend:

- `status`
- `supervisionState`
- `lastEventKind`
- `lastEventAt`
- `lastError`
- `summary`
- `finalResult`
- `providerSessionId`
- `bootstrapPrompt` ou `bootstrapPromptPreview`
- diagnóstico do último comando de controle emitido

O prompt bootstrap deve ser persistido como dado diagnóstico de leitura, nunca editável.

### 3. Real backend control plane

O control plane precisa ser um serviço backend explícito, não só mutações de metadata.

Esse caminho deve:

- validar `sessionId/taskId/stepId/agent/provider`
- resolver a sessão em registry + supervisor
- obter `ProviderProcessHandle` e parser corretos
- chamar `HumanInterventionController`
- persistir o efeito resultante em metadata e timeline

Toda intervenção deve gerar evidência backend observável:

- comando solicitado
- timestamp
- resultado
- erro, se houver
- estado terminal ou intermediário resultante

### 4. Backend e2e proof with deterministic subprocess

O gate real desta etapa é um harness backend-only com subprocesso determinístico.

Esse harness deve provar:

- start do processo
- streaming/projeção de eventos
- `interrupt` com efeito real
- `stop` com efeito real
- `resume` suportado ou recusa explícita
- consistência entre process state, registry state e activity log

Para o provider real, smoke tests manuais ainda ajudam, mas não substituem esse harness.

### 5. Explicit out-of-scope

Ficam fora desta etapa:

- `TaskDetailSheet`
- `ProviderLiveChatPanel`
- `AgentActivityFeed`
- botões de intervenção no dashboard

Essas superfícies só entram quando o backend já estiver comprovado.

## What Must Be Observable In The Backend

- bootstrap prompt
- status resumido da sessão
- timeline de eventos normalizados
- tool calls como eventos operacionais
- último erro legível
- resultado final quando houver
- histórico mínimo de comandos `interrupt/stop/resume`

## What Must Not Be Persisted

- chain-of-thought bruto
- raciocínio interno detalhado do modelo
- dumps integrais de contexto sem necessidade operacional

## Deliverables

- plano em waves backend-only
- plano detalhado de execução
- checklist backend de readiness
- stories BMad para:
  - projeção canônica de eventos
  - persistência de metadata/prompt
  - control plane real
  - harness e2e backend-only
  - diagnósticos de comando e estabilização

## Success Criteria

- uma sessão `provider-cli` publica eventos via contrato canônico de supervisão
- `interactiveSessions` e `sessionActivityLog` refletem o runtime real
- o prompt bootstrap fica consultável no backend
- `interrupt` e `stop` têm efeito real e verificável no subprocesso
- existe teste backend-only automatizado provando esse efeito
- nenhum critério desta etapa depende do dashboard
