# Publish Order

## 1. Create review specs first

Crie nesta ordem:

1. `instagram-research-review`
2. `instagram-strategy-review`
3. `instagram-post-pack-review`

Guarde os `specId` retornados.

## 2. Create or update the agents

Use os arquivos em `specs/agents/`.

Se os agents já existirem e você quiser manter os mesmos nomes publicados, aplique os campos via update.

## 3. Replace placeholders

Substitua nos arquivos de squad/workflow:

- `<instagram-research-review-id>`
- `<instagram-strategy-review-id>`
- `<instagram-post-pack-review-id>`
- `<published-squad-spec-id>`

## 4. Publish squad graph

Arquivo recomendado:

- `specs/squad/instagram-post-squad-v2.publish.json`

## 5. Optional standalone workflow publish

Se o squad já existir publicado e você quiser apenas anexar o workflow:

- `specs/workflows/instagram-post-creation-v2.publish.json`
