# Juntos — agenda e cardápio compartilhados

## Objetivo

Criar um aplicativo web privado para um casal organizar compromissos, refeições e compras em aparelhos diferentes. A experiência será pensada primeiro para celular, funcionará bem no computador e poderá ser instalada na tela inicial como um aplicativo.

## Princípios do produto

- Mostrar somente o que importa no momento, sem concentrar todos os dados na tela inicial.
- Manter agenda, alimentação e compras completas, mas separadas em áreas claras.
- Sincronizar alterações entre os dois usuários sem apagar dados silenciosamente.
- Pedir o mínimo de permissões possível e manter o espaço do casal privado.
- Priorizar refeições práticas para rotinas com trabalho e faculdade.

## Estrutura da experiência

### Início

A entrada será uma linha do tempo do dia. Compromissos e refeições aparecerão em ordem cronológica, com horário, título e a informação secundária essencial. A tela não terá painéis de resumo adicionais.

No celular, a navegação inferior terá quatro destinos: Início, Agenda, Comidas e Compras. Perfil, configurações, integração Google e gestão do casal ficarão no avatar. No computador, a navegação inferior se transforma em uma barra lateral discreta e o conteúdo permanece centralizado, sem ocupar toda a largura disponível.

### Agenda

- Visualizações mensal, semanal e em lista.
- Eventos com título, data, horário, duração, local, observações e responsável: uma pessoa ou o casal.
- Eventos únicos ou recorrentes.
- Criação, edição e exclusão por qualquer membro do casal.
- Calendário Google exclusivo do casal, separado dos calendários pessoais.
- Lembretes entregues pelo Google Calendar.
- Indicação de autoria e última alteração.

### Comidas

- Planejamento semanal de café da manhã, almoço e jantar.
- Preenchimento manual, seleção de favoritos ou escolha entre sugestões.
- Sugestões filtradas por tempo de preparo, com destaque para opções rápidas.
- Receita com porções, ingredientes, preparo e duração estimada.
- Troca de uma refeição sem regenerar o restante da semana.
- Histórico simples para reduzir repetições frequentes.

As sugestões da primeira versão serão produzidas por um catálogo curado e por regras baseadas em tempo disponível, tipo de refeição e histórico recente. Isso entrega resultados previsíveis sem depender de uma cobrança externa por geração de texto. Uma camada de sugestões generativas poderá ser acrescentada depois sem alterar o restante do produto.

### Compras

- Geração automática a partir das refeições escolhidas para a semana.
- Consolidação de ingredientes repetidos e ajuste pelas porções.
- Agrupamento por categoria, como hortifruti, mercearia, carnes e laticínios.
- Inclusão de itens manuais.
- Marcação de itens concluídos por qualquer membro do casal.
- Indicação visual de alterações feitas pelo outro usuário.

## Contas e espaço do casal

Cada pessoa entrará com sua própria conta Google. O primeiro usuário cria um espaço privado e envia um convite com validade limitada. O segundo usuário aceita o convite usando a conta Google que ficará vinculada ao espaço.

Um espaço terá no máximo dois membros nesta versão. Ambos terão as mesmas permissões sobre agenda, refeições, receitas e compras. Sair do espaço exigirá uma confirmação explícita e não apagará automaticamente os dados do outro membro.

## Arquitetura

O produto será dividido em unidades independentes:

- **Interface responsiva:** apresenta a linha do tempo e as áreas de Agenda, Comidas e Compras.
- **Identidade e acesso:** realiza o login Google, gerencia sessão, convite e associação ao espaço do casal.
- **Serviço de agenda:** mantém eventos internos e coordena a sincronização com o Google Calendar.
- **Serviço de alimentação:** mantém cardápios, receitas, favoritos e o mecanismo de sugestões.
- **Serviço de compras:** transforma ingredientes planejados em uma lista consolidada e preserva itens manuais.
- **Persistência:** armazena os dados duráveis com isolamento por espaço do casal.
- **Sincronização:** propaga alterações entre aparelhos, registra versões e resolve tentativas de edição concorrentes.

A interface conversará somente com serviços autenticados do próprio aplicativo. Credenciais e operações do Google Calendar permanecerão no servidor e nunca serão expostas no navegador.

## Modelo de dados

As entidades principais serão:

- Usuário e sessão.
- Espaço do casal, membros e convite.
- Integração Google e calendário compartilhado.
- Evento, recorrência e registro de sincronização.
- Semana de cardápio e refeição planejada.
- Receita, ingrediente e favorito.
- Lista de compras, item e estado de conclusão.
- Registro de atividade com autor, horário e tipo de alteração.

Toda entidade compartilhada carregará a identificação do espaço do casal. As consultas e alterações validarão essa identificação no servidor.

## Fluxos principais

### Entrada e convite

1. O usuário entra com Google.
2. Cria o espaço do casal e escolhe seu nome.
3. O aplicativo gera um convite de uso único e validade limitada.
4. O parceiro entra com Google e aceita o convite.
5. O espaço passa a aparecer para ambos os usuários.

### Sincronização da agenda

1. Um membro conecta o Google Calendar e autoriza as permissões necessárias.
2. O aplicativo cria ou seleciona um calendário exclusivo do casal.
3. Eventos criados no aplicativo são enviados a esse calendário.
4. Alterações feitas no Google são importadas pelo processo de sincronização.
5. O aplicativo guarda o identificador e a versão remota para evitar duplicações.

### Planejamento alimentar

1. O casal abre uma semana.
2. Preenche uma refeição ou solicita sugestões.
3. O mecanismo oferece opções compatíveis com o tipo de refeição e o tempo escolhido.
4. A opção selecionada é salva no cardápio.
5. Os ingredientes são recalculados na lista de compras.

### Compras compartilhadas

1. O aplicativo consolida ingredientes do cardápio e mantém itens manuais separados.
2. Qualquer membro pode ajustar quantidade ou categoria.
3. Marcar um item como comprado sincroniza o estado com o outro aparelho.
4. Remover uma refeição recalcula apenas os itens automáticos ainda não comprados.

## Sincronização, modo offline e conflitos

Leituras recentes ficarão disponíveis quando a conexão cair. Novas alterações serão guardadas localmente em uma fila e enviadas quando a internet voltar. A interface sempre mostrará se o conteúdo está sincronizado, pendente ou com erro.

Cada registro terá uma versão. Se dois aparelhos alterarem o mesmo campo a partir da mesma versão, o servidor recusará a gravação tardia e apresentará uma comparação simples para escolha do valor correto. Alterações em campos diferentes poderão ser combinadas automaticamente.

Erros temporários do Google Calendar serão tentados novamente com intervalo crescente. Falhas persistentes aparecerão na área de integração, sem bloquear o uso da agenda interna.

## Segurança e privacidade

- Acesso somente por sessão autenticada e associação confirmada ao espaço.
- Validação de autorização em toda leitura e alteração, independentemente da interface.
- Convites de uso único, com validade limitada e armazenamento seguro.
- Permissões Google restritas a identidade e calendário.
- Tokens Google protegidos no servidor e renovados sem exposição ao navegador.
- Proteção contra requisições forjadas, abuso de formulários e entrada de conteúdo malicioso.
- Registro de ações importantes sem armazenar conteúdo sensível desnecessário.
- Opção de desconectar o Google Calendar sem apagar os dados internos.

## Estados e tratamento de erros

Cada tela terá estados próprios para carregamento, conteúdo vazio, conexão ausente e falha. As mensagens explicarão o que aconteceu e oferecerão uma ação direta, como tentar novamente ou revisar a integração.

Operações destrutivas pedirão confirmação. A interface usará atualização otimista somente quando houver recuperação segura; caso contrário, esperará a confirmação do servidor. Nenhuma falha de sincronização será apresentada como sucesso.

## Direção visual

O visual será minimalista e editorial, com bastante espaço, tipografia forte e poucos acentos de cor. A tela inicial seguirá a opção aprovada de linha do tempo. Funções completas ficarão nas páginas dedicadas, reduzindo a sensação de excesso de informação.

Interações terão movimentos curtos e funcionais: entrada suave de itens, confirmação clara ao salvar e transições discretas entre datas. A interface evitará efeitos decorativos que prejudiquem a leitura.

## Acessibilidade e responsividade

- Áreas de toque confortáveis e controles com rótulos claros.
- Contraste suficiente e informação que não dependa apenas de cor.
- Navegação por teclado e foco visível no computador.
- Estrutura semântica compatível com leitores de tela.
- Respeito à preferência de movimento reduzido.
- Layout validado em celulares pequenos, celulares grandes, tablets e computadores.

## Verificação

Os testes cobrirão:

- Regras de autorização e isolamento entre espaços.
- Convite, entrada e recuperação de sessão.
- Criação, alteração, recorrência e sincronização de eventos.
- Geração e troca de refeições.
- Consolidação, edição e conclusão de itens de compra.
- Fila offline, repetição de envio e conflitos de versão.
- Fluxos completos nos tamanhos de tela prioritários.
- Navegação por teclado e estados de carregamento, vazio e erro.

A versão será considerada pronta quando duas contas Google em aparelhos diferentes conseguirem completar todos os fluxos principais e observar os mesmos dados sem atualização manual da página.

## Entrega em fases

1. **Base compartilhada:** interface responsiva, login Google, espaço do casal, convite e persistência.
2. **Agenda:** eventos internos, recorrência, calendário compartilhado e sincronização Google.
3. **Alimentação:** cardápio semanal, catálogo de receitas, favoritos e sugestões rápidas.
4. **Compras:** consolidação de ingredientes, itens manuais e sincronização.
5. **Confiabilidade:** modo offline, conflitos, histórico, acessibilidade e validação completa.

Cada fase deixará o aplicativo utilizável e será validada antes da seguinte.

## Fora do escopo inicial

- Mais de duas pessoas no mesmo espaço.
- Calendários públicos ou compartilhamento com convidados externos.
- Controle financeiro, divisão de despesas ou estoque doméstico.
- Entrega de supermercado e compra automática.
- Recomendações médicas ou nutricionais.
- Aplicativos nativos separados para Android e iOS.
