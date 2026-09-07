# Juntos

Juntos é um espaço compartilhado para duas pessoas organizarem compromissos,
refeições e compras. A interface é pensada primeiro para celular e mantém o dia
em uma única linha do tempo, sem painéis extras.

Este repositório contém o frontend Next.js, a API Fastify, contratos
compartilhados, login Google, sessões privadas, espaço do casal e convite de
uso único. Agenda, refeições e compras serão as próximas fases persistidas.

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

4. Em outro terminal, inicie o site:

   ```bash
   npm run dev:web
   ```

O site abre em `http://localhost:3000` e a API em `http://localhost:4000`.
Cadastre no Google Cloud o callback local
`http://localhost:3000/api/auth/google/callback` antes de testar o login. O
navegador chama apenas as rotas `/api/*` do próprio site; o endereço do Render
e os segredos nunca entram no JavaScript do navegador.

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
- **INTERNAL_PROXY_KEY:** o mesmo segredo de 32 bytes em base64url informado no Render
- **GOOGLE_CLIENT_ID:** ID do cliente OAuth Web do Google
- **GOOGLE_REDIRECT_URI:** `https://<dominio-vercel>/api/auth/google/callback`

A instalação deve usar o `package-lock.json` e os workspaces declarados no
`package.json` da raiz, pois o frontend também consome `packages/contracts`.

## Publicar a API e o banco no Render

Use **New > Blueprint** e selecione este repositório. O `render.yaml` cria:

- o serviço Node `juntos-api`;
- o banco PostgreSQL `juntos-db`;
- a ligação segura de `DATABASE_URL`;
- a verificação de saúde em `/health`.

Antes da primeira publicação, preencha no Render os valores secretos:
`INTERNAL_PROXY_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI` e `WEB_ORIGIN`. O `INTERNAL_PROXY_KEY` deve ser
exatamente o mesmo configurado na Vercel. Informe `WEB_ORIGIN` com a origem
exata do site, por exemplo `https://juntos.vercel.app`, sem barra final.

Gere `INTERNAL_PROXY_KEY` uma única vez com um gerador criptográfico. O valor
deve ser a codificação base64url, sem `=`, de 32 bytes aleatórios (43
caracteres). Por exemplo, execute localmente:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copie o resultado diretamente para os dois painéis. A aplicação recusa valores
curtos, placeholders e codificações fora desse formato; não salve o resultado
em nenhum arquivo do repositório.

O comando de início aplica migrações idempotentes antes de iniciar a API. Isso
é necessário porque o plano Free do Render não oferece comando de pré-publicação.

O Blueprint começa nos planos gratuitos para não gerar cobrança automática.
Nesse plano, a API pode levar cerca de um minuto para acordar após 15 minutos
sem acesso, e o PostgreSQL gratuito expira 30 dias após a criação. Antes de
guardar dados reais do casal, atualize o banco para um plano persistente com
backup ou migre os dados para outro PostgreSQL gerenciado.

## Variáveis de ambiente

| Variável | Onde | Finalidade |
| --- | --- | --- |
| `API_BASE_URL` | Vercel | Endereço privado usado pelo servidor Next.js para chamar a API |
| `INTERNAL_PROXY_KEY` | Vercel e Render | Mesmo segredo aleatório de 32 bytes, em base64url canônico com 43 caracteres |
| `GOOGLE_CLIENT_ID` | Vercel e Render | Identificador público do mesmo cliente OAuth Web |
| `GOOGLE_CLIENT_SECRET` | Render | Segredo OAuth; nunca vai para a Vercel ou Git |
| `GOOGLE_REDIRECT_URI` | Vercel e Render | Callback exato do login, igual nos dois serviços |
| `WEB_ORIGIN` | Render | Origem exata permitida pelo CORS |
| `DATABASE_URL` | Render | Injetada automaticamente pelo banco do Blueprint |
| `HOST` e `PORT` | local/Render | Interface e porta usadas pela API |
| `NODE_ENV` | ambos | Ambiente de execução |

Nunca use o prefixo `NEXT_PUBLIC_` em segredos ou no endereço interno da API.

## Configurar e aceitar com Google

Crie um cliente OAuth do tipo **Aplicativo da Web** no Google Cloud. Registre a
origem local e a de produção, e estes callbacks exatos:

```text
http://localhost:3000/api/auth/google/callback
https://<dominio-vercel>/api/auth/google/callback
```

Não adicione credenciais ao Git ou a variáveis `NEXT_PUBLIC_*`. O login pede
somente `openid email profile`; nenhuma permissão de Google Calendar aparece
nesta etapa.

### Aceitação real em dois aparelhos

Depois de configurar as variáveis e publicar as duas partes, faça esta checagem
manual com duas contas Google diferentes:

1. No primeiro aparelho, entre, crie o espaço e gere o convite.
2. Abra o link no segundo aparelho, entre com a segunda conta e aceite uma vez.
3. Recarregue os dois aparelhos: ambos devem mostrar o mesmo espaço.
4. Tente abrir o mesmo convite novamente: ele deve falhar sem adicionar outra pessoa.

Os testes automatizados cobrem esse ciclo com identidades falsas. Esta checagem
manual continua necessária até que credenciais OAuth reais e os dois aparelhos
estejam disponíveis.
