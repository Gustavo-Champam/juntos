# Juntos — versão completa

Fonte da versão que termina as fases de **agenda**, **cardápio**, **lista de compras** e **sugestões de receitas**, inclusive com IA gratuita.

O app original em `apps/web` + `apps/api` continua na raiz. Esta pasta é o recorte pronto da lógica e da interface (TanStack Start + Postgres), para portar ou comparar.

## O que ficou pronto

- Espaço do casal, convite de uso único, login por conta
- Agenda compartilhada com recorrência semanal
- Cardápio da semana (café, almoço, jantar) com catálogo de receitas brasileiras
- Lista de compras gerada pelas receitas, sem duplicar itens
- Sugestões que reaproveitam o que já está na lista
- **IA gratuita** (provedores do [OmniRoute](https://www.omniroute.online/pt-BR/)): botão “Sugerir com IA” na tela de compras

## IA gratuita (OmniRoute)

A chamada é OpenAI-compatible (`POST /v1/chat/completions`).

Por padrão usa o provedor gratuito **LLM7**, o mesmo tipo de rota que o OmniRoute oferece sem cartão. Se vocês rodarem o gateway local:

```bash
npx omniroute
```

apontem o servidor para:

- `OMNIROUTE_BASE_URL=http://127.0.0.1:20128/v1`
- `OMNIROUTE_MODEL=auto`
- `OMNIROUTE_API_KEY` (opcional)

A IA só dispara quando alguém aperta o botão. Não roda no carregamento da página.

Arquivos:

- `src/lib/omniroute.ts` — cliente
- `src/lib/ai-recipes.ts` — sugestão a partir da lista e do cardápio
- `src/lib/recipes.ts` — catálogo
- `src/lib/recipe-suggest.ts` — ranking sem IA
- `src/components/shopping-screen.tsx` — interface da lista + IA
- `migrations/0002_juntos.sql` — espaço, agenda, refeições e compras

## Como encaixar no monorepo

1. Reaproveitar o catálogo e o ranking em `apps/web` (páginas de comidas/compras).
2. Expor um `POST /api/recipes/suggest` na Fastify usando `omniroute.ts`.
3. Rodar a migration `0002_juntos.sql` no Postgres (além das já existentes de identidade e agenda).
