# Schema Notes and Recommended Tightenings

Estes não bloqueiam o bundle, mas ajudam a deixar a spec mais assertiva:

1. `agent.displayName` deveria aceitar update também. A descrição de operação diz que update pode alterar `displayName`, mas a lista de fields marca `displayName` apenas para `create`.
2. `reviewSpec.criteria.weight` deveria ser validado para somar 1.0 com tolerância pequena.
3. `workflow_step` usa `key` no squad publish e `id` no workflow standalone. Vale unificar para um só nome.
4. `review` step deveria requerer `agentKey` explicitamente se a engine realmente usa reviewer agent dedicado.
5. `squad.reviewPolicy` e `agent.reviewPolicyRef` usam convenções diferentes. Vale decidir entre `...Ref` e texto livre em ambos.
6. `skills` aceitam apenas nomes válidos, mas falta um campo opcional de `requiredCapabilities` quando a skill pode existir em múltiplos providers.
