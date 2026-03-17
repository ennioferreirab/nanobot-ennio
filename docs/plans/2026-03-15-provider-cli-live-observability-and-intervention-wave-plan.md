# Provider CLI Live Observability And Intervention Wave Plan

**Date:** 2026-03-15

**Goal:** entregar observabilidade e controle reais para o `provider-cli`, com escopo estritamente backend-first e prova de efeito no subprocesso antes de qualquer trabalho de dashboard.

**Detailed plan:** `docs/plans/2026-03-15-provider-cli-live-observability-and-intervention-plan.md`

---

## Story Decomposition

- `28-18-project-provider-cli-events-to-convex.md`
- `28-19-persist-provider-cli-session-metadata-and-bootstrap-prompt.md`
- `28-20-add-real-provider-cli-interrupt-stop-resume-control-plane.md`
- `28-21-prove-provider-cli-intervention-e2e-backend-only.md`
- `28-22-capture-provider-cli-command-effect-diagnostics.md`
- `28-23-stabilize-provider-cli-backend-observability-rollout.md`

## Wave 0: Freeze Scope To Backend

**Objective:** registrar formalmente que o sucesso desta etapa não depende de dashboard, live tab ou controles visuais.

**Must not do:**

- não usar UI como prova primária
- não tratar patch de metadata como equivalente a sinal real no processo
- não abrir nova frente de frontend nesta wave set

**Exit gate:**

- plano e stories rebaselinados para backend-only

## Wave 1: Project Provider CLI Events Through The Canonical Supervision Path

**Story:** `28-18-project-provider-cli-events-to-convex.md`

**Objective:** fazer `ParsedCliEvent` entrar no contrato canônico de supervisão e refletir em `sessionActivityLog`.

**Problems solved:**

- ausência de funil canônico para eventos `provider-cli`
- risco de semântica paralela de sessão

**Exit gate:**

- texto, tool use, lifecycle e falhas aparecem em `sessionActivityLog`
- projeção usa o contrato canônico do backend, não um sink ad hoc

## Wave 2: Persist Session Metadata And Bootstrap Prompt

**Story:** `28-19-persist-provider-cli-session-metadata-and-bootstrap-prompt.md`

**Objective:** tornar consultáveis status resumido, prompt bootstrap, provider session id e erro atual.

**Problems solved:**

- falta de visibilidade operacional do estado da sessão

**Exit gate:**

- `interactiveSessions` reflete a sessão `provider-cli` real
- prompt bootstrap e identificadores de sessão ficam acessíveis no backend

## Wave 3: Add Real Interrupt / Stop / Resume Control Plane

**Story:** `28-20-add-real-provider-cli-interrupt-stop-resume-control-plane.md`

**Objective:** ligar `HumanInterventionController` a um caminho operacional real e verificável.

**Problems solved:**

- takeover sem efeito real no processo

**Exit gate:**

- backend expõe `interrupt/stop/resume` reais
- registry, Convex e estado do subprocesso convergem

## Wave 4: Prove Intervention Effects Backend-Only

**Story:** `28-21-prove-provider-cli-intervention-e2e-backend-only.md`

**Objective:** provar com subprocesso real que eventos e comandos têm efeito de verdade.

**Problems solved:**

- ausência de prova E2E real

**Exit gate:**

- teste automatizado prova start/stream/interrupt/stop
- `resume` é provado ou explicitamente rejeitado conforme suporte

## Wave 5: Capture Command-Effect Diagnostics

**Story:** `28-22-capture-provider-cli-command-effect-diagnostics.md`

**Objective:** tornar auditável no backend o ciclo completo dos comandos operacionais.

**Problems solved:**

- falta de evidência persistida de que o comando foi pedido, aceito, executado e refletido

**Exit gate:**

- toda intervenção gera rastro diagnóstico mínimo no backend
- operador consegue distinguir “comando emitido”, “comando aplicado” e “comando falhou”

## Wave 6: Stabilize And Roll Out Backend-Only

**Story:** `28-23-stabilize-provider-cli-backend-observability-rollout.md`

**Objective:** consolidar guardrails, checklist e disciplina de rollout para o path backend.

**Problems solved:**

- risco de declarar pronto sem prova suficiente de efeito real

**Exit gate:**

- suíte backend verde
- checklist backend concluído
- dashboard explicitamente fora do gate desta etapa

## Validation Rule

Validação obrigatória por ordem:

1. testes unitários/backend de contrato
2. testes de integração backend
3. E2E backend com subprocesso determinístico real
4. smoke manual opcional com provider real

Nada é considerado pronto se o comando existir mas não houver prova de efeito no processo e na projeção de estado.
