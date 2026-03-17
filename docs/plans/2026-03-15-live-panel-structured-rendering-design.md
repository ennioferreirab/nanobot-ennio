# Live Panel Structured Rendering Design

**Date:** 2026-03-15

## Summary

Corrigir o painel `Live` para deixar de renderizar todos os eventos como texto puro em `<pre>`, reaproveitando o comportamento de renderização rico que já existe no thread, e adicionar filtro por categoria de sinal dentro do próprio `ProviderLiveChatPanel`.

## Current State

Hoje o `Live` da task é composto por duas colunas em [TaskDetailSheet.tsx](/Users/ennio/Documents/nanobot-ennio/dashboard/features/tasks/components/TaskDetailSheet.tsx): a coluna principal com `ProviderLiveChatPanel` e a coluna lateral com `AgentActivityFeed`.

O gargalo está na coluna principal:

- [useProviderSession.ts](/Users/ennio/Documents/nanobot-ennio/dashboard/features/interactive/hooks/useProviderSession.ts) achata cada entrada do `sessionActivityLog` para `{ id, text, kind }`
- [ProviderLiveChatPanel.tsx](/Users/ennio/Documents/nanobot-ennio/dashboard/features/interactive/components/ProviderLiveChatPanel.tsx) renderiza tudo com `<pre>`
- `sessionActivityLog` já persiste campos estruturados úteis (`kind`, `summary`, `error`, `toolName`, `toolInput`, `filePath`, `requiresAction`)

Resultado: a UI perde semântica, não diferencia categorias úteis para filtro e não consegue reaproveitar o renderer que já trata markdown e mensagens ricas no thread.

## Approaches

### Option A: manter o modelo achatado e adicionar só chips de filtro

**Pros**

- mudança pequena
- baixo risco imediato

**Cons**

- não resolve o problema principal de renderização pobre
- perpetua a perda de estrutura em `normalizeProviderEvents`
- torna difícil diferenciar `tool`, `resultado`, `ação requerida`, `erro`

### Option B: criar um view-model estruturado no dashboard e renderizar por categoria

**Pros**

- resolve filtro e renderização no mesmo refactor
- reaproveita `MarkdownRenderer` e padrões visuais do thread sem falsificar `Doc<"messages">`
- mantém backend estável e concentra a mudança na camada de apresentação

**Cons**

- exige atualizar testes e o contrato do hook `useProviderSession`
- pede uma taxonomia visual clara para agrupar `kind`s técnicos

### Option C: criar um novo payload renderizável no backend

**Pros**

- deixaria o frontend mais simples no longo prazo

**Cons**

- aumenta o escopo sem necessidade
- mistura problema de UX com mudança de contrato backend
- não é o caminho mínimo para validar a feature

## Recommendation

Seguir a **Option B**.

O backend já persiste dados suficientes. O problema atual é a perda de estrutura no dashboard. A solução mais coerente é introduzir um view-model estruturado para o `Live`, mapear os `kind`s técnicos para categorias visuais estáveis e usar um renderer dedicado que reaproveite os mesmos blocos de markdown/metadata já aprovados no thread.

## Design

### 1. Source of truth

Continuar usando `sessionActivityLog` como source of truth do `Live`.

Não criar nova tabela, mutation ou payload backend nesta etapa.

### 2. Structured event model

Substituir o modelo achatado `{ id, text, kind }` por um view-model mais rico no dashboard, por exemplo:

- `id`
- `kind`
- `category`
- `title`
- `body`
- `timestamp`
- `toolName`
- `toolInput`
- `filePath`
- `requiresAction`
- `isMarkdown`

Esse modelo deve nascer em uma função pura compartilhável, fora do componente React.

### 3. Category model

O filtro do painel `Live` deve usar categorias visuais, não `kind`s brutos. Recomendação inicial:

- `text`
- `tool`
- `skill`
- `result`
- `action`
- `error`
- `system`

Mapeamento recomendado:

- `item_started` com `toolName` normalizado para categoria `tool`
- `item_started` quando o nome da ferramenta indicar `skill` para categoria `skill`
- `item_completed` para `result`
- `turn_completed` para `result`
- `approval_requested`, `user_input_requested`, `ask_user_requested`, `paused_for_review` para `action`
- `session_failed` para `error`
- `session_started`, `session_ready`, `session_stopped`, `turn_started`, `turn_updated` para `system`
- fallback textual para `text`

O classificador deve ser centralizado em utilitário testado, não espalhado no JSX.

### 4. Rendering strategy

Não adaptar eventos do `Live` para fingirem ser `Doc<"messages">`.

Em vez disso:

- extrair um row/component específico para o `Live`
- reaproveitar `MarkdownRenderer` para corpo textual rico
- reaproveitar convenções visuais do `ThreadMessage` para avatar/badge/timestamp quando fizer sentido
- renderizar `toolName` e `toolInput` como bloco estruturado
- renderizar `error` com destaque visual
- renderizar `requiresAction` como badge explícito

Isso evita acoplamento incorreto com o schema de `messages` e mantém a UI consistente.

### 5. Filter UX

O filtro deve viver dentro de `ProviderLiveChatPanel`, local ao painel.

Comportamento recomendado:

- estado inicial: todas as categorias ativas
- multi-select por chips/checkboxes
- contador por categoria opcional
- ação rápida `Clear` ou `All`
- estado vazio contextual quando o filtro esconder todos os eventos

Não propagar esse filtro para `TaskDetailSheet` nem para o `Thread`.

### 6. Activity feed boundary

`AgentActivityFeed` continua na coluna da direita sem mudança funcional nesta etapa.

O objetivo é evitar dois refactors simultâneos. O painel da direita continua sendo timeline técnica compacta; o painel da esquerda vira a superfície de leitura rica.

## Files Expected To Change

- [dashboard/features/interactive/hooks/useProviderSession.ts](/Users/ennio/Documents/nanobot-ennio/dashboard/features/interactive/hooks/useProviderSession.ts)
- [dashboard/features/interactive/hooks/useProviderSession.test.ts](/Users/ennio/Documents/nanobot-ennio/dashboard/features/interactive/hooks/useProviderSession.test.ts)
- [dashboard/features/interactive/components/ProviderLiveChatPanel.tsx](/Users/ennio/Documents/nanobot-ennio/dashboard/features/interactive/components/ProviderLiveChatPanel.tsx)
- [dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx](/Users/ennio/Documents/nanobot-ennio/dashboard/features/interactive/components/ProviderLiveChatPanel.test.tsx)
- `dashboard/features/interactive/components/ProviderLiveEventRow.tsx`
- `dashboard/features/interactive/components/ProviderLiveEventRow.test.tsx`
- `dashboard/features/interactive/lib/providerLiveEvents.ts`
- `dashboard/features/interactive/lib/providerLiveEvents.test.ts`

## Risks

- Existe dívida entre os testes atuais do hook e os `kind`s realmente persistidos no `sessionActivityLog`
- `skill` pode não vir como `kind` explícito e precisar de heurística baseada em `toolName`
- alguns providers podem emitir poucos campos e cair no fallback textual; isso deve ser suportado sem quebrar o renderer

## Success Criteria

- o painel `Live` deixa de usar `<pre>` como renderer universal
- markdown e blocos estruturados aparecem corretamente para sinais suportados
- o usuário consegue filtrar o `Live` por categoria visual
- o filtro não afeta o `Thread` nem a coluna `AgentActivityFeed`
- os `kind`s reais persistidos pelo runtime ficam cobertos por testes de classificação e renderização
