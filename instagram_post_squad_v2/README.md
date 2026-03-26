# Instagram Post Squad V2 Bundle

Este pacote reorganiza o seu squad para aumentar aderência, rastreabilidade, qualidade de revisão e consistência entre copy e design.

## O que tem aqui

- `specs/agents/` — agent specs completos e reescritos
- `specs/review-specs/` — três review specs prontos
- `specs/squad/` — payload completo para `publish_squad_graph`
- `specs/workflows/` — payload standalone para `publish_workflow`
- `skills/mc/` — skills de Mission Control reescritas (`create-agent`, `create-review-spec`, `create-skill`, `create-squad`, `create-workflow`)
- `skills/runtime/` — skills reescritas ou novas para sustentar o squad (`web-search`, `instagram-scraper`, `brand-analysis`, `instagram-copywriting`, `creative-qc`, `generate-image`)
- `docs/` — ordem de publicação e notas de schema

## Principais mudanças estruturais

1. `company-intel` agora vem antes da pesquisa paralela, para fixar idioma, marca, mercado e oferta.
2. `copy-researcher` foi separado de `copywriter`.
3. `identity-designer` foi substituído por `post-designer`, porque o trabalho real é de criação de posts, não de branding full-stack.
4. Foi adicionada a camada `post-specs`, que sincroniza copy e design por `postId`.
5. Foram adicionados três quality gates automáticos com roteamento de rejeição.
6. Foi adicionado `creative-reviewer` para revisar pesquisa, estratégia e pack final.
7. O workflow termina com `memory-writeback` para capturar aprendizados aprovados.

## Ordem sugerida de uso

1. Criar review specs e guardar os `specId`
2. Criar ou atualizar os agents
3. Substituir os placeholders `<...-id>` no squad/workflow
4. Publicar o squad graph
5. Se necessário, publicar o workflow standalone

Veja `docs/publish-order.md` para o passo a passo.
