# Guia do sistema — Nexo CRM Comercial

**Projeto:** Nexo CRM Comercial

**Base técnica:** Next.js 16 App Router, React 19, TypeScript, Supabase Auth/Postgres/Storage.
**Atualizado em:** 13/11/2026

Este documento descreve o comportamento encontrado no código e registra limites operacionais importantes. As telas disponíveis podem depender de migrations e configurações externas. Antes de considerar uma função pronta em outro ambiente, confira a configuração e o schema daquele ambiente.

## 1. Visão geral

O Nexo organiza a operação comercial da prospecção ao acompanhamento de clientes e propostas. Leads permanecem separados dos clientes até o início da negociação/conversão. O funil acompanha as oportunidades e seus estados. Propostas e contratos guardam snapshots/versionamentos e informações comerciais; não são um módulo financeiro ou de cobrança.

### Tecnologias e comandos

| Item | Uso |
| --- | --- |
| Next.js 16.3.1 | Aplicação web, App Router, páginas server-rendered e rotas de API |
| React 19.2 | Interface e componentes interativos |
| TypeScript 5 | Tipagem estática |
| Supabase SSR / JS | Sessão Auth e acesso ao Postgres/Storage com RLS |
| `xlsx` | Leitura de planilhas no fluxo de importação |
| `npm run dev` | Desenvolvimento local |
| `npm run build` | Build de produção |
| `npm start` | Execução local do build produzido |
| `npm run lint` | ESLint |

## 2. Mapa de telas

| Caminho | Finalidade |
| --- | --- |
| `/` | Painel comercial e indicadores |
| `/login` | Entrada via Supabase Auth |
| `/cadastro-empresa` | Cadastro de novo espaço, sujeito à configuração de autoinscrição |
| `/clientes` | Pesquisa/listagem de clientes |
| `/clientes/novo` | Cadastro PF/PJ |
| `/clientes/[id]` | Ficha 360°, incluindo cadastro, fiscal, contador, atividades, oportunidades, propostas, documentos e contratos |
| `/clientes/[id]/editar` | Edição do cadastro existente |
| `/clientes/importar` | Importação histórica de clientes, fora do funil |
| `/leads` | Pesquisa e gestão de leads, filtros e ações comerciais |
| `/leads/[id]` | Ficha do lead, dados e interações |
| `/leads/importar` | Preparação e revisão local de planilha de prospecção |
| `/leads/importar/casa-dos-dados` | Solicitação/consulta de arquivos da Casa dos Dados |
| `/whatsapp` | Central de leads e abertura do WhatsApp Web |
| `/funil` | Kanban de oportunidades e movimentação entre etapas |
| `/oportunidades` | Rota de oportunidades |
| `/propostas` | Lista, pesquisa e status de propostas |
| `/propostas/novo` | Criação de proposta comercial |
| `/propostas/[id]` | Detalhes, versões, link público e registro/confirmacão de aceite |
| `/propostas/[id]/imprimir` | Versão imprimível/PDF pelo navegador |
| `/produtos` | Catálogo de produtos e serviços |
| `/produtos/novo` | Novo item de catálogo |
| `/produtos/[id]/editar` | Edição de item de catálogo |
| `/vendedores` | Vendedores e regras comerciais |
| `/metas` | Metas comerciais mensais |
| `/comissoes` | Previsão de comissões e metas de instalação |
| `/contadores` | Cadastro central de contadores/escritórios e classificação comercial |
| `/contratos` | Visão de contratos comerciais |
| `/email` | Gmail conectado por OAuth |
| `/usuarios` | Usuários, equipe e espaços empresariais |
| `/p/[token]` | Página pública de proposta associada a token aleatório |

As rotas `/api` dão suporte a essas telas. Entre elas: autenticação Google/Gmail, leitura e envio de e-mails, arquivos privados do cliente, importação de leads, pesquisas CNPJ/IE/CEP, Casa dos Dados, Clicksign e cron de prospecção. Consulte `app/api/` para os handlers exatos.

## 3. Fluxos comerciais

### Leads e prospecção

1. O usuário carrega um Excel/CSV na área de importação.
2. A leitura e a seleção de atividades/CNAEs são feitas para preparar uma prévia; o operador confere linhas, campos selecionados e duplicidades.
3. A importação cria leads e registra a origem/atividade e os dados comerciais permitidos. Leads não viram clientes nem oportunidades automaticamente.
4. O usuário registra interações e pode abrir o WhatsApp Web com o número cadastrado.
5. Ao iniciar negociação/converter, o fluxo cria/associa cliente e oportunidade conforme as ações disponíveis na tela.

Não trate uma prévia de planilha como gravação. A gravação só ocorre na ação final de confirmação. A importação histórica em `/clientes/importar` é um fluxo distinto e foi desenhada para arquivo/consulta, sem criar movimentações no funil.

### Clientes e ficha 360°

Clientes podem ser PF ou PJ e têm dados de identificação, contatos, endereço, informações fiscais, vendedor e contador associado. A ficha reúne atividades, oportunidades, propostas, documentos e contratos disponíveis. Documento de cliente deve ficar no bucket privado; o fluxo usa autorização e URLs assinadas/temporárias, nunca bucket público permanente.

### Funil e vendas

O Kanban representa etapas comerciais configuradas no schema (incluindo etapas de contato, análise, aprovação, contrato e conclusão). Alterar uma oportunidade pode atualizar os valores comerciais usados nos relatórios de comissões. As comissões são previsões calculadas a partir de vendas elegíveis e regras do vendedor; a retenção de 12% mostrada no módulo é uma regra parametrizada no código atual, não apuração tributária, folha ou conciliação bancária.

### Produtos, metas e comissões

O catálogo alimenta oportunidades e propostas. Metas comerciais aceitam escopos geral, vendedor, produto ou categoria, conforme schema e regras atuais. As metas de instalação por vendedor são em quantidade. Comissão mensal pode seguir a modalidade configurada ou ser desabilitada para o vendedor. O módulo não registra pagamento efetuado nem substitui conferência contábil.

### Propostas

Propostas guardam versões e itens com descrição/preços congelados por versão. A tela imprimível produz um documento pelo browser. A área administrativa pode gerar um token público de acesso/aceite; o aceite do cliente fica pendente até confirmação interna. O link público é um segredo portador: compartilhe apenas com o destinatário e revogue/substitua quando necessário. Não envie dados internos ou documentos de cliente por esse link.

## 4. Autenticação, autorização e dados por empresa

### Acesso administrativo

- A sessão usa Supabase Auth; o código valida o usuário no servidor com `auth.getUser()`.
- O acesso interno exige `app_metadata.crm_admin === true`. Essa claim deve ser atribuída pelo administrador via Supabase Auth Admin/API segura, nunca por formulário acessível ao usuário.
- A tabela `crm_company_members` associa usuário e empresa; `crm_companies` identifica o espaço ativo. `lib/tenant/context.ts` resolve o vínculo no servidor e não aceita `company_id` fornecido pelo navegador.
- A chave `SUPABASE_SECRET_KEY` (ou compatibilidade legada `SUPABASE_SERVICE_ROLE_KEY`) permite operações administrativas que ignoram RLS. Ela só pode existir em servidor/secret manager.

### Atenção ao isolamento multiempresa

O projeto possui camada de contexto de empresa e migrations de isolamento, e vários fluxos já filtram por `company_id`. Isso **não é uma declaração de auditoria integral de todo o sistema**. Há módulos e caminhos antigos que podem não ter sido migrados ou verificados para isolamento completo; a camada é incremental. Antes de cadastrar outra empresa com dados reais ou abrir o sistema a usuários de empresas diferentes, faça revisão de cada Server Action, página, API, Storage policy, trigger, função SQL e tabela, e execute testes com duas contas em ambientes de teste separados. Até essa revisão, mantenha o uso na empresa/base de testes já validada.

O modelo atual de membro permite papéis `owner` e `admin` na resolução de contexto. Não confunda isso com controle granular de permissões por módulo.

## 5. Banco e migrations

As migrations locais ficam em `supabase/migrations/` e são ordenadas pelo prefixo de data/identificador. Elas cobrem schema inicial, clientes/leads, documentos/contratos, cadastro fiscal, funil, catálogo, vendedores, vendas concluídas, metas, propostas públicas/branding, prospecção, isolamento empresarial, Clicksign, Gmail e regras de comissão.

### Aplicação segura

1. No Dashboard, confirme explicitamente o projeto Supabase **NEXO-CRM-COMERCIAL** (ou o projeto de teste correto).
2. Compare a lista local de migrations com o histórico de migrations no banco e confira quais já foram aplicadas. Não execute novamente todo o diretório por suposição.
3. Leia a migration pendente e as dependências indicadas no próprio SQL.
4. Faça backup apropriado antes de alterações em produção.
5. Execute somente a migration aprovada, pelo procedimento autorizado (SQL Editor manual nesta operação), e confirme o resultado.
6. Nunca aplique migration em Supabase antigo ou no Gestão Fácil+.

O build do Next.js não executa SQL. Arquivos de migration no Git também não indicam que foram aplicados ao banco.

## 6. Variáveis de ambiente

Os nomes abaixo são lidos pelo código ou constam no exemplo local. Valores reais não devem ser copiados para este documento.

| Variável | Onde usar | Finalidade |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | cliente e servidor | URL do projeto Supabase Nexo |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | cliente e servidor | Chave publicável; pode ser exposta ao browser e depende de Auth/RLS para proteger dados |
| `SUPABASE_SECRET_KEY` | somente servidor | API administrativa (ex.: convites/gestão Auth e cron privilegiado); preferida à chave legada |
| `SUPABASE_SERVICE_ROLE_KEY` | somente servidor | Compatibilidade legada; remover quando confirmado que nada mais a utiliza |
| `CASA_DOS_DADOS_API_KEY` | somente servidor | Acesso à API Casa dos Dados; operações podem consumir saldo contratado |
| `CRM_SELF_REGISTRATION_ENABLED` | somente servidor | Permite autoinscrição empresarial quando o valor é `true`; em produção fica desabilitada por padrão |
| `PROSPECTING_CRON_SECRET` | somente servidor | Segredo de autenticação do endpoint de cron |
| `CLICKSIGN_ENVIRONMENT` | somente servidor | `sandbox` por padrão; `production` seleciona API de produção |
| `CLICKSIGN_ACCESS_TOKEN` | somente servidor | Token Clicksign correspondente ao ambiente escolhido |
| `GMAIL_CLIENT_ID` | somente servidor | Cliente OAuth do Google |
| `GMAIL_CLIENT_SECRET` | somente servidor | Segredo OAuth do Google |
| `GMAIL_REDIRECT_URI` | somente servidor | Callback OAuth; precisa corresponder ao Console Google/domínio |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | somente servidor | Chave de criptografia dos tokens Gmail armazenados |

O arquivo `.env.example` contém somente marcadores de exemplo. Para Vercel, configure variáveis nas configurações do projeto e selecione os ambientes necessários; não coloque credenciais no código, README, GitHub Actions sem secrets, ou variáveis com prefixo `NEXT_PUBLIC_`.

## 7. Integrações e configuração externa

### WhatsApp

O modo gratuito abre conversa no WhatsApp/WhatsApp Web via navegador com número e, quando aplicável, texto pré-preenchido. Não é uma API oficial de envio: o operador revisa e envia manualmente; o CRM não lê a conversa nem confirma entrega. O navegador pode abrir link externo; use a aba do WhatsApp Web já autenticada para manter a sessão.

### Gmail

OAuth do Google permite listar/ler e enviar mensagens pela conta autorizada. A senha Google não é armazenada; tokens de atualização são cifrados em AES-256-GCM no servidor. Requer Gmail API, tela OAuth, credencial Web, URI de callback e migrations/tabela `gmail_connections`. Escopos de Gmail podem exigir inclusão de usuários de teste ou verificação Google para uso amplo; veja `docs/gmail-local-setup.md`. A chave de criptografia deve permanecer estável para decifrar tokens já armazenados.

### Casa dos Dados

A API solicita/consulta geração de CSV de prospecção. Geração pode consumir saldo. O cron só inicia quando configurado; o resultado é arquivo para revisão. A importação de leads continua dependendo de revisão e confirmação humana. Confira `docs/casa-dos-dados.md` para o fluxo, limites e configuração do cron.

### Consultas públicas de CNPJ, IE e CEP

As rotas server-side fazem consultas a fontes externas para preencher formulários. São dados sujeitos à disponibilidade/limites dos provedores; IE/IM não devem ser inventadas quando fonte não retorna informação confiável. O usuário pode corrigir os campos manualmente.

### Clicksign

O código cria/sincroniza o fluxo do contrato com a API v3 usando o ambiente indicado. Exige token válido e migrations de integração. Comece no sandbox e valide documentos, signatário, requisitos e retorno de status antes de usar produção. O envio real pode criar solicitações externas e depender do plano/conta Clicksign.

### Supabase Storage

Documentos/contratos usam armazenamento privado, tipos e limites controlados pela aplicação e policies do Storage. O bucket e policies precisam existir no projeto correto. Não transforme bucket em público para contornar erros de autorização.

## 8. Implantação e atualização

### Pré-requisitos de produção

1. Supabase correto, migrations necessárias aplicadas e revisadas, Auth configurado e usuário autorizado.
2. Bucket privado/policies instalados, caso Documentos/Contratos sejam usados.
3. Variáveis de ambiente configuradas na Vercel para Production (e Preview conforme necessidade), com segredos apenas server-side.
4. OAuth/Gmail com callback do domínio de produção e consentimento/escopos adequados.
5. Clicksign em sandbox até concluir teste ponta a ponta; não habilitar token live prematuramente.
6. Revisão de isolamento multiempresa descrita acima.
7. Build bem-sucedido e teste manual dos principais fluxos no Preview antes de direcionar usuários ao domínio de produção.

### Fluxo atual GitHub/Vercel

O repositório conectado é `leandrojfgarra-a11y/nexo-crm-comercial`, branch `master`. Um `git push` para `master` pode disparar build/deploy automático na Vercel. Portanto, commits de documentação também podem atualizar produção se o projeto estiver conectado ao ambiente Production. Prefira branch/Preview para mudanças que ainda precisam de aprovação; confira o status Ready/Error na Vercel antes de compartilhar uma URL.

Comandos usuais no PowerShell:

```powershell
cd D:\CRM-COMERCIAL
npm.cmd run build
git status --short --branch
git add README.md docs/GUIA_DO_SISTEMA.md supabase/README.md
git commit -m "Documenta módulos e operação do Nexo CRM"
git push origin master
```

Os comandos acima são referência; revise `git status` e o diff antes de fazer commit/push. Não inclua `.env.local`, exportações de clientes, arquivos temporários, backups ou tokens.

## 9. Operação local

1. Abrir PowerShell e entrar em `D:\CRM-COMERCIAL`.
2. Manter `.env.local` fora do Git e validar que o ambiente aponta ao Supabase correto.
3. Executar `npm.cmd run dev`.
4. Abrir `http://localhost:3000` e autenticar em `/login`.
5. Ao terminar, parar o servidor com `Ctrl+C`.

Se alterações locais não aparecerem, conferir o projeto aberto, o terminal que iniciou o Next.js e a porta usada; não encerre processos desconhecidos.

## 10. Checklist curto de validação funcional

- Entrar e sair; confirmar bloqueio de usuário não autorizado.
- Criar/editar um lead de teste e registrar interação.
- Testar filtros de situação, CNAE e período com datas que incluam e excluam registros conhecidos.
- Converter lead de teste e confirmar associação correta no cliente/funil.
- Mover oportunidade entre etapas; conferir vendedor, valores e cálculo de comissão.
- Criar proposta de teste, imprimir, abrir link público em janela anônima e registrar aceite; confirmar aceite internamente.
- Validar upload, listagem, download e exclusão controlada no bucket privado.
- Criar contrato de teste e, em sandbox, verificar integração Clicksign.
- Conectar Gmail de teste, ler e enviar mensagem de teste, depois desconectar.
- Abrir WhatsApp para número de teste e confirmar que o envio é manual.
- Usar contas/empresas de teste separadas antes de qualquer uso multiempresa real.

Evite criar registros fictícios em produção. Apague dados de teste de acordo com a retenção e o processo autorizado.

## 11. Limitações conhecidas e pontos a confirmar

- A documentação não certifica revisão legal, contábil, tributária ou de privacidade.
- O módulo de comissão é projeção comercial e não concilia pagamentos.
- WhatsApp está no modo sem API oficial.
- Gmail depende da configuração e dos requisitos OAuth do Google.
- Casa dos Dados pode consumir saldo externo.
- Links públicos de proposta são acessíveis a quem possuir o token.
- Isolamento multiempresa ainda precisa de validação integral por fluxo, RLS e Storage antes de receber dados independentes de outra empresa.
- Status de migration deve ser conferido no Supabase de destino; não inferir somente pelo conteúdo do repositório ou por mensagem de sucesso anterior.
- O funcionamento de cada integração depende de credenciais, consentimento, policies e serviços de terceiros.

## 12. Referência no código

- Páginas: `app/`
- Rotas de API: `app/api/`
- Componentes de interface: `components/`
- Acesso Supabase/Auth: `lib/supabase/`
- Contexto empresarial: `lib/tenant/`
- Integração Gmail: `lib/gmail/`
- Migrations: `supabase/migrations/`
- Documentação complementar: `docs/`
- Exemplo de variáveis: `.env.example`

Quando houver divergência entre este guia e o código, confira o código atual, as migrations realmente aplicadas no projeto Supabase e as variáveis do ambiente em execução.
