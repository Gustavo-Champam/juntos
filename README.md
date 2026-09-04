# Juntos

Juntos é um espaço compartilhado para duas pessoas organizarem compromissos,
refeições e compras. A interface é pensada primeiro para celular e mantém o dia
em uma única linha do tempo, sem painéis extras.

Este repositório contém a fundação executável do produto: o frontend Next.js,
a API Fastify, contratos compartilhados, instalação como aplicativo e os
arquivos de publicação. Os dados exibidos nesta fase são representativos; login
Google, persistência e sincronização entram nas próximas fases.

## Requisitos

- Node.js 22 ou mais recente
- npm 11 ou mais recente
- PostgreSQL para a fase de persistência

## Rodar localmente

1. Duplique `apps/api/.env.example` como `apps/api/.env` e
   `apps/web/.env.example` como `apps/web/.env.local`. O arquivo `.env.example`
   da raiz reúne o contrato completo para consulta.
2. Instale tudo uma única vez, na raiz:

   ```bash
   npm install
   ```

3. Em um terminal, inicie a API:

   ```bash
   npm run dev:api
   ```

4. Em outro terminal, disponibilize `API_BASE_URL=http://localhost:4000` para o
   processo e inicie o site:

   ```bash
   npm run dev:web
   ```

O site abre em `http://localhost:3000` e a API em `http://localhost:4000`.
O navegador conversa com a API somente pela rota interna
`/api/backend-health`; o endereço do Render nunca precisa ser público.

## Verificação

```bash
npm test
npm run typecheck
npm run build
```

## Publicar o frontend na Vercel

Crie o projeto a partir deste repositório e configure:

- **Root Directory:** `apps/web`
- **Include source files outside of the Root Directory:** ativado
- **Framework Preset:** Next.js
- **API_BASE_URL:** URL pública da API no Render, sem barra final
- **INTERNAL_PROXY_KEY:** segredo compartilhado, somente no ambiente da Vercel

A instalação deve usar o `package-lock.json` e os workspaces declarados no
`package.json` da raiz, pois o frontend também consome `packages/contracts`.

## Publicar a API e o banco no Render

Use **New > Blueprint** e selecione este repositório. O `render.yaml` cria:

- o serviço Node `juntos-api`;
- o banco PostgreSQL `juntos-db`;
- a ligação segura de `DATABASE_URL`;
- uma chave interna gerada pelo Render;
- a verificação de saúde em `/health`.

Antes da primeira publicação, informe `WEB_ORIGIN` com a origem exata do site
na Vercel, por exemplo `https://juntos.vercel.app`. Não inclua uma barra final.

## Variáveis de ambiente

| Variável | Onde | Finalidade |
| --- | --- | --- |
| `API_BASE_URL` | Vercel | Endereço privado usado pelo servidor Next.js para chamar a API |
| `INTERNAL_PROXY_KEY` | Vercel e Render | Segredo reservado para autenticar o proxy interno |
| `WEB_ORIGIN` | Render | Origem exata permitida pelo CORS |
| `DATABASE_URL` | Render | Injetada automaticamente pelo banco do Blueprint |
| `HOST` e `PORT` | local/Render | Interface e porta usadas pela API |
| `NODE_ENV` | ambos | Ambiente de execução |

Nunca use o prefixo `NEXT_PUBLIC_` em segredos ou no endereço interno da API.

## Preparação do login Google

Quando a fase de identidade for implementada, registre no Google Cloud todas as
origens e callbacks usados pelo produto:

- desenvolvimento: `http://localhost:3000`;
- produção: o domínio definitivo da Vercel;
- previews: apenas se forem necessários, com uma política de callback específica.

As credenciais do Google serão variáveis de ambiente; elas não devem ser
adicionadas ao Git ou copiadas para o frontend.
