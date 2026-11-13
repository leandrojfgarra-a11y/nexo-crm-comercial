# AUDITORIA FINAL PRÉ-PRODUÇÃO — Nexo CRM Comercial

**Data da auditoria:** 11/11/2026  
**Escopo:** Apenas análise e documentação. Nenhum arquivo foi modificado, nenhum build executado, nenhum deploy realizado.  
**Status do relatório:** FINAL  
**Parecer:** NÃO APTO PARA PRODUÇÃO

---

## 1. Resumo Executivo

O Nexo CRM Comercial é um sistema Next.js 16 (App Router) + React 19 + TypeScript com integração Supabase (Auth, Database, Storage). Implementa módulos de dashboard, clientes, leads, funil, oportunidades, propostas, contratos, produtos, vendedores, metas, comissões, usuários/empresas, contadores, WhatsApp e e-mail (Gmail).

A auditoria identificou **problemas críticos e altos que bloqueiam a implantação em produção**, incluindo armazenamento de senhas e segredos reais em arquivos do repositório/disco, ausência de middleware de proteção de rotas, e ausência de isolamento por empresa (RLS) no banco de dados.

Não se recomenda deploy até que os problemas CRÍTICO e ALTO sejam corrigidos e as verificações pendentes sejam concluídas.

---

## 2. Inventário dos Módulos

### 2.1 Versões e dependências (package.json)

| Item | Versão |
|------|--------|
| Next.js | 16.3.1 |
| React | 19.2.8 |
| React DOM | 19.2.8 |
| TypeScript | ^5 |
| @supabase/supabase-js | ^2.118.0 |
| @supabase/ssr | ^0.12.7 |
| xlsx | CDN SheetJS (0.20.3) |
| ESLint | ^9 (eslint-config-next 16.3.1) |
| Tailwind CSS | ^4 |

Scripts disponíveis: `dev`, `build`, `start`, `lint`.

### 2.2 Rotas e páginas (App Router)

| Rota | Página | Descrição |
|------|--------|-----------|
| `/` | `app/page.tsx` | Dashboard gerencial (métricas, comissões, metas) |
| `/login` | `app/login/page.tsx` | Login com e-mail/senha, verifica `crm_admin` |
| `/cadastro-empresa` | `app/cadastro-empresa/page.tsx` | Auto-cadastro de empresa (desabilitado em produção por padrão) |
| `/p/[token]` | `app/p/[token]/page.tsx` | Aceitação pública de proposta (sem auth) |
| `/clientes` | `app/clientes/page.tsx` | Listagem, busca, filtros, paginação, WhatsApp |
| `/clientes/novo` | `app/clientes/novo/page.tsx` | Cadastro de cliente |
| `/clientes/[id]` | `app/clientes/[id]/page.tsx` | Ficha 360° do cliente (abas: dados, fiscal, contador, atividades, oportunidades, propostas, documentos, contratos) |
| `/clientes/[id]/editar` | `app/clientes/[id]/editar/page.tsx` | Edição de cliente |
| `/clientes/importar` | `app/clientes/importar/page.tsx` | Importação de clientes |
| `/leads` | `app/leads/page.tsx` | Listagem com filtros avançados, paginação, cadastro/edição inline, conversão |
| `/leads/[id]` | `app/leads/[id]/page.tsx` | Detalhe do lead, histórico de atividades |
| `/leads/importar` | `app/leads/importar/page.tsx` | Importação de leads (planilha / Casa dos Dados) |
| `/oportunidades` | `app/oportunidades/page.tsx` | Redireciona para `/funil#kanban` |
| `/funil` | `app/funil/page.tsx` | Kanban de vendas, filtros por vendedor/busca |
| `/propostas` | `app/propostas/page.tsx` | Listagem de propostas versionadas, filtros |
| `/propostas/novo` | `app/propostas/novo/page.tsx` | Criação de proposta |
| `/propostas/[id]` | `app/propostas/[id]/page.tsx` | Detalhe e versão de proposta |
| `/propostas/[id]/imprimir` | `app/propostas/[id]/imprimir/page.tsx` | Versão imprimível da proposta |
| `/contratos` | `app/contratos/page.tsx` | Listagem de contratos, filtros, status |
| `/produtos` | `app/produtos/page.tsx` | Catálogo, listagem, filtros (tipo, status, busca), botão Novo item |
| `/produtos/novo` | `app/produtos/novo/page.tsx` | Cadastro de produto/serviço (ProductForm) |
| `/produtos/[id]/editar` | `app/produtos/[id]/editar/page.tsx` | Edição de produto/serviço (ProductForm) |
| `/vendedores` | `app/vendedores/page.tsx` | Listagem de vendedores, regras de comissão, metas de instalação (form embutido no SellerCatalog) |
| `/metas` | `app/metas/page.tsx` | Metas comerciais por vendedor/produto/categoria |
| `/comissoes` | `app/comissoes/page.tsx` | Cálculo de comissões (instalação, mensal, bruto, retenção 12%, líquido) |
| `/usuarios` | `app/usuarios/page.tsx` | Convite de usuários, empresas isoladas, listagem de contas |
| `/contadores` | `app/contadores/page.tsx` | Cadastro de contadores/escritórios, relacionamento (lead/parceiro) |
| `/whatsapp` | `app/whatsapp/page.tsx` | Workspace WhatsApp, interações por lead |
| `/email` | `app/email/page.tsx` | Workspace Gmail (OAuth) |

### 2.3 Componentes principais (components/)

| Componente | Função |
|------------|--------|
| `app-shell.tsx` | Layout principal com navegação lateral, topbar, tema, logout |
| `ui.tsx` | Primitivos UI (PageHeader, Card, Panel, table/th/td) |
| `product-catalog.tsx` | ProductCatalog (listagem) + ProductForm (formulário) |
| `seller-catalog.tsx` | SellerCatalog (listagem + formulário embutido de vendedor) |
| `customer-form.tsx` | Formulário de cliente |
| `accountant-form.tsx` | Formulário de contador |
| `proposal-editor.tsx` | Editor de proposta |
| `proposal-detail.tsx` | Detalhe de proposta |
| `public-proposal-acceptance.tsx` | Aceitação pública de proposta |
| `manager-dashboard.tsx` | Dashboard gerencial |
| `dashboard-filters.tsx` | Filtros do dashboard |
| `funnel-board.tsx` | Kanban do funil |
| `commercial-goals.tsx` | Metas comerciais |
| `lead-negotiation-button.tsx` | Botão de negociação de lead |
| `whatsapp-workspace.tsx` | Workspace WhatsApp |
| `gmail-workspace.tsx` | Workspace Gmail |
| `lead-import-workspace.tsx` | Importação de leads |
| `casa-dados-prospecting.tsx` | Prospecção Casa dos Dados |
| `clicksign-controls.tsx` | Controles Clicksign |
| `historical-customer-import.tsx` | Importação histórica de clientes |
| `confirm-submit.tsx` | Confirmação de envio |
| `print-button.tsx` | Botão de impressão |

### 2.4 Server Actions

| Arquivo | Funções principais |
|---------|-------------------|
| `app/login/actions.ts` | signIn, signOut |
| `app/cadastro-empresa/actions.ts` | registerCompany |
| `app/clientes/actions.ts` | saveCustomer |
| `app/clientes/importar/actions.ts` | importação de clientes |
| `app/leads/actions.ts` | saveLead, addLeadInteraction, convertLead |
| `app/produtos/actions.ts` | saveProduct, setProductActive |
| `app/vendedores/actions.ts` | saveSeller, setSellerActive, searchInternalAuthUsers |
| `app/propostas/actions.ts` | createProposal, createProposalVersion, updateProposalStatus, createProposalShareLink, reviewProposalAcceptance |
| `app/comissoes/actions.ts` | — (cálculo direto na página) |
| `app/metas/actions.ts` | — |
| `app/usuarios/actions.ts` | createIsolatedCompany, inviteTeamUser |
| `app/contadores/actions.ts` | saveAccountant |
| `app/whatsapp/actions.ts` | addWhatsAppInteraction |
| `app/oportunidades/actions.ts` | — |
| `app/contatos/actions.ts` | — |

### 2.5 Integração Supabase

| Arquivo | Função |
|---------|--------|
| `lib/supabase/client.ts` | Cliente do navegador (anon key) |
| `lib/supabase/server.ts` | Cliente de servidor (cookies, anon key) |
| `lib/supabase/admin.ts` | `createAdminClient()` — verifica sessão + `crm_admin`, redireciona se inválido |
| `lib/supabase/admin-auth.ts` | `createAuthAdminClient()` — service_role para gestão de usuários Auth |
| `lib/supabase/proxy.ts` | `updateSession()` — middleware-like de sessão (não registrado como middleware Next.js) |

### 2.6 Migrations Supabase (26 arquivos)

Destaques: `202610290001_initial_schema.sql`, `202610310004_sales_funnel.sql`, `202610310006_commercial_products_catalog.sql`, `202610310007_seller_commercial_profile.sql`, `202610310009_closed_sales_register.sql`, `202610310010_commercial_goals.sql`, `202611020001_proposal_public_access.sql`, `202611020002_proposal_recurring_prices.sql`, `202611050002_proposal_branding_and_backup.sql`, `202611070002_company_isolation.sql`, `202611070003_company_admin_api_grants.sql`, `202611100001_seller_installation_goal_and_net_commission.sql`.

---

## 3. Auditoria de Segurança

### 3.1 Autenticação e sessões

**CONFIRMADO — Funcionando:** Login via Supabase Auth (e-mail/senha). Todas as páginas administrativas chamam `createAdminClient()` que verifica a sessão e o campo `app_metadata.crm_admin === true`. Usuários não-admin ou sem sessão são redirecionados para `/login`.

**CONFIRMADO — Funcionando:** Logout disponível no topbar do AppShell.

### 3.2 Proteção de rotas (CRÍTICO / ALTO)

**CRÍTICO — CONFIRMADO — A-003:** Não existe arquivo `middleware.ts` na raiz do projeto. O Next.js não reconhece `proxy.ts` como middleware porque o nome do arquivo está incorreto e o `next.config.ts` está vazio (`const nextConfig: NextConfig = {}`). O arquivo `proxy.ts` contém a lógica de `updateSession` com verificação de sessão, mas **não é executado automaticamente** pelo Next.js.

Consequência: A proteção de rotas depende exclusivamente de cada página Server Component chamar `createAdminClient()`. Se qualquer nova página esquecer essa chamada, ficará acessível sem autenticação. Não há proteção centralizada.

Correção recomendada: Renomear/criar `middleware.ts` na raiz importando `updateSession` de `@/lib/supabase/proxy`, com matcher adequado, e manter as verificações por página como defesa em profundidade.

### 3.3 Autorização nas Server Actions e APIs

**CONFIRMADO — Funcionamento parcial:** Todas as Server Actions usam `createAdminClient()` que valida sessão e `crm_admin`. No entanto, não há validação de propriedade de dados (ex: um vendedor não pode editar produto de outro) além do `crm_admin` global. Todas as ações são globais.

**ALTO — CONFIRMADO — A-005:** Não há controle de acesso granular por módulo ou por empresa. Qualquer usuário com `crm_admin=true` pode acessar todos os módulos e todos os dados. Não existem papéis como "vendedor apenas vê próprios leads" ou "gerente vê apenas sua empresa".

### 3.4 Acesso indevido por manipulação de URL

**CONFIRMADO — Funcionamento parcial:** Páginas de detalhe (`/clientes/[id]`, `/leads/[id]`, `/propostas/[id]`, etc.) usam `maybeSingle()` e retornam `notFound()` quando o registro não existe. IDs são validados com regex UUID em várias páginas.

**POTENCIAL — A-006:** O endpoint público `/p/[token]` valida o formato do token (43 caracteres base64url) e chama a RPC `get_public_proposal`. A segurança depende inteiramente da implementação da RPC no Supabase (SECURITY DEFINER, validação de token hash, expiração). Não foi possível verificar o estado real do Supabase.

### 3.5 RLS e políticas do Supabase

**ALTO — NÃO VERIFICADO — A-004:** A migration `202611070002_company_isolation.sql` adiciona coluna `company_id` a todas as tabelas de dados, habilita RLS, cria políticas que exigem `is_crm_admin() AND company_id = current_crm_company_id()`, e cria triggers `set_crm_company_id` e `validate_crm_related_company`. O comentário na própria migration diz: "Não execute até publicar o código compatível com crm_companies/company_id."

Se esta migration não estiver aplicada:
- Não há RLS nas tabelas de dados
- Não há isolamento por empresa
- Qualquer admin autenticado pode ler/escrever todos os registros

Não foi possível verificar se a migration está aplicada no Supabase de destino (sem acesso seguro ao banco). Classificado como NÃO VERIFICADO, mas representa risco ALTO se não aplicada.

### 3.6 Uso de service_role e cliente administrativo

**CONFIRMADO:** `createAuthAdminClient()` usa `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor (`server-only`). Nunca é importado no navegador. Usado para convites de usuários, listagem de contas Auth e criação de empresas.

**CONFIRMADO:** `createAdminClient()` usa o cliente de servidor com anon key + cookies de sessão, não a service_role diretamente para operações de dados.

### 3.7 Acesso cruzado entre usuários ou empresas

**POTENCIAL — Vinculado a A-004 e A-005:** Sem RLS aplicado, não há barreira no banco para impedir acesso cruzado. No nível da aplicação, as páginas não filtram por `company_id` (a coluna só existe se a migration de isolamento for aplicada). A página `/usuarios` filtra por empresa, mas as demais páginas de dados não possuem esse filtro.

### 3.8 Validação de dados no servidor

**CONFIRMADO — Funcionando:** Todas as Server Actions validam entradas (UUID, CPF/CNPJ, e-mail, faixas de valores monetários, percentuais, tamanhos de string). Exemplo: `parseMoney`, `validCpf`, `validCnpj`, `isUuid`, `safeSearchTerm`.

### 3.9 Exposição de dados sensíveis

**CONFIRMADO — A-001 (CRÍTICO):** O arquivo `SCRIPT.txt` na raiz do projeto contém senhas reais:
- SENHA DO SUPABASE: `[REDACTED]`
- Usuário: `conectarjf.fiscal@gmail.com`, senha: `[REDACTED]`

Este arquivo não está no `.gitignore`, portanto está rastreado pelo versionamento (se houver). Mesmo que não esteja, sua presença no disco de desenvolvimento com credenciais reais é um risco crítico.

**CONFIRMADO — A-002 (CRÍTICO/ALTO):** O arquivo `.env.local` contém segredos reais:
- `SUPABASE_SERVICE_ROLE_KEY=[REDACTED]`
- `CLICKSIGN_ACCESS_TOKEN=[REMOVIDO]`
- `GMAIL_CLIENT_SECRET=[REMOVIDO]`
- `CASA_DOS_DADOS_API_KEY=[REMOVIDO]`

O `.gitignore` inclui `.env*` (exceto `.env.example`), então `.env.local` não é versionado. No entanto, existe no disco com credenciais reais de um projeto Supabase. Se essas credenciais forem de produção e estiverem sendo usadas em desenvolvimento, há risco de vazamento e uso indevido.

### 3.10 Variáveis de ambiente e segredos

**CONFIRMADO:** `.env.example` existe com variáveis esperadas, sem valores reais. `.env.local` possui valores reais (ver A-002).

### 3.11 Riscos de XSS, injeção e operações não autorizadas

**CONFIRMADO — Baixo risco:** O React escapa automaticamente conteúdo renderizado entre chaves `{}`, reduzindo risco de XSS refletido. Valores de usuário vêm de formulários controlados e são enviados para Server Actions via FormData (não diretamente para SQL). O Supabase client usa consultas parametrizadas.

**MÉDIO — CONFIRMADO — A-008:** Algumas mensagens de erro incluem `error.code` e `error.message` do Supabase (ex: `app/produtos/actions.ts`, `app/vendedores/actions.ts`), o que pode vazar detalhes internos do esquema ou do banco para o cliente.

**POTENCIAL — MÉDIO — A-007:** Sem middleware Next.js ativo, a proteção CSRF padrão do framework para Server Actions pode não estar operante. Verificar se a ausência de middleware compromete a validação de origem das requisições.

---

## 4. Auditoria do Banco de Dados

### 4.1 Migrations existentes

26 migrations encontradas em `supabase/migrations/`. Elas cobrem: schema inicial (people, leads, customers, sellers, products, pipelines, opportunities, activities, proposals, etc.), campos de clientes/leads, documentos, funil de vendas, catálogo de produtos, perfil comercial de vendedores, registro de vendas fechadas, metas comerciais, acesso público a propostas, preços recorrentes, branding de propostas, filtros de prospecção, tipo de relacionamento de contador, isolamento por empresa, contratos Clicksign, conexões Gmail, metas de instalação e comissão líquida.

### 4.2 Compatibilidade código ↔ banco

O código verifica a disponibilidade de colunas/tabelas antes de gravar, usando funções `has*Schema()` (ex: `hasProductCatalogSchema`, `hasSellerCommercialSchema`, `hasCompleteCustomerSchema`). Quando o schema não está pronto, as telas entram em "modo de leitura" com aviso ao usuário. Isso evita erros de runtime, mas significa que funcionalidades ficam indisponíveis até que as migrations sejam aplicadas.

### 4.3 Chaves estrangeiras e restrições

O schema inicial define FKs com `ON DELETE RESTRICT` e `ON DELETE SET NULL` em tabelas-chave (leads→people, customers→people, opportunities→people/sellers/pipelines, activities→people/opportunities, etc.).

### 4.4 RLS e isolamento por empresa

A migration `202611070002_company_isolation.sql` adiciona `company_id` a ~25 tabelas, habilita RLS, cria políticas de isolamento e triggers de validação. **Não foi possível verificar se está aplicada** no ambiente de destino (NÃO VERIFICADO).

### 4.5 Views utilizadas

O dashboard e comissões usam a view `active_closed_sales` e a tabela `closed_sale_items` (migration `202610310009_closed_sales_register.sql`). O dashboard referencia explicitamente a migration 009 e a view `active_closed_sales` em mensagens de erro.

### 4.6 Operações transacionais

A Server Action `createProposal` em `app/propostas/actions.ts` executa múltiplas operações (insert proposal, insert version, insert items, update proposal) com rollback manual em caso de falha (exclui version, items e proposal se houver erro parcial). Isso é adequado, embora não use transação nativa do banco.

### 4.7 Duplicidade de registros

O cadastro de clientes verifica duplicidade de `tax_id` (CPF/CNPJ) antes de salvar (`app/clientes/actions.ts`). O cadastro de produtos verifica código interno duplicado (código de erro 23505). O cadastro de vendedores verifica `user_id` duplicado.

### 4.8 Pendências de migration

Várias telas exibem avisos como "Aplique manualmente a migration 202610310006 antes de gravar" ou "Migração pendente". Isso indica que nem todas as migrations foram aplicadas no ambiente atual.

---

## 5. Auditoria Funcional

### 5.1 Dashboard

| Item | Status |
|------|--------|
| Listagem de métricas | Implementado |
| Filtros (mês, vendedor, período personalizado) | Implementado |
| Gráficos (semanal, mensal) | Implementado |
| Acompanhamento de metas | Implementado |
| Erros de schema tratados | Sim (mensagens de erro na UI) |

### 5.2 Clientes

| Item | Status |
|------|--------|
| Listagem, busca, filtros (status, termo) | Implementado |
| Cadastro (pessoa física/jurídica, CPF/CNPJ validado) | Implementado |
| Edição | Implementado |
| Ficha 360° com múltiplas abas | Implementado |
| Importação (planilha / Casa dos Dados) | Implementado |
| WhatsApp direto | Implementado |
| Inativação (status active/inactive) | Implementado |

### 5.3 Leads

| Item | Status |
|------|--------|
| Listagem com filtros avançados | Implementado |
| Paginação | Implementado |
| Cadastro e edição inline | Implementado |
| Conversão para cliente | Implementado |
| Histórico de atividades | Implementado |
| Botão de negociação (funil) | Implementado |

### 5.4 Funil de Vendas / Oportunidades

| Item | Status |
|------|--------|
| Kanban com etapas | Implementado |
| Filtros (busca, vendedor) | Implementado |
| Arrastar cartões entre etapas | Implementado (componente FunnelBoard) |
| Oportunidades redireciona para funil | Implementado (redirect) |

### 5.5 Produtos e Serviços

| Item | Status |
|------|--------|
| Listagem com filtros (tipo, status, busca) | Implementado |
| Cadastro (ProductForm) | Implementado |
| Edição | Implementado |
| Ativar/inativar | Implementado |
| Botão "Novo item" → `/produtos/novo` | Implementado |
| Voltar da tela de cadastro/edição | Implementado (link "← Voltar para produtos") |

### 5.6 Vendedores

| Item | Status |
|------|--------|
| Listagem com busca, filtros (tipo, status) | Implementado |
| Cadastro com regras de comissão | Implementado (form embutido no SellerCatalog) |
| Ativar/inativar | Implementado |
| Metas de instalação por vendedor | Implementado (condicional ao schema) |
| Botão "Novo vendedor" | Implementado (ação do PageHeader, âncora #cadastro) |

**Observação:** O módulo vendedores não possui páginas separadas `/vendedores/novo` e `/vendedores/[id]/editar`; o formulário é embutido no `SellerCatalog` via âncora `#cadastro`.

### 5.7 Propostas

| Item | Status |
|------|--------|
| Listagem, busca, filtros (status) | Implementado |
| Criação versionada | Implementado |
| Detalhe da proposta | Implementado |
| Versão imprimível | Implementado |
| Link público de aceitação (`/p/[token]`) | Implementado |
| Envio, cancelamento, rejeição | Implementado |

### 5.8 Contratos

| Item | Status |
|------|--------|
| Listagem, busca, filtros (status) | Implementado |
| Criação (via ficha do cliente) | Implementado |
| Acompanhamento de vigência | Implementado |
| Envio para Clicksign | Preparado (credencial necessária) |

### 5.9 Comissões

| Item | Status |
|------|--------|
| Cálculo por competência | Implementado |
| Comissão de instalação e mensal | Implementado |
| Retenção 12% e líquido | Implementado |
| Meta de instalação por vendedor | Implementado (condicional) |
| Filtros (competência, vendedor) | Implementado |

### 5.10 Metas

| Item | Status |
|------|--------|
| Metas gerais, por vendedor, por produto, por categoria | Implementado |
| Acompanhamento de realizado vs planejado | Implementado |

### 5.11 Usuários e Empresas

| Item | Status |
|------|--------|
| Convite de usuários | Implementado |
| Empresas isoladas | Implementado (depende da migration de isolamento) |
| Listagem de contas | Implementado |

### 5.12 Contadores

| Item | Status |
|------|--------|
| Cadastro de contadores/escritórios | Implementado |
| Relacionamento (lead/parceiro/sem classificação) | Implementado |
| Filtros por relacionamento | Implementado |
| WhatsApp direto | Implementado |

### 5.13 WhatsApp e E-mail

| Item | Status |
|------|--------|
| Workspace WhatsApp com histórico | Implementado |
| Workspace Gmail (OAuth) | Implementado (depende de credenciais) |

### 5.14 Navegação e botão Voltar

**CONFIRMADO:** As telas de cadastro e edição de produtos (`/produtos/novo`, `/produtos/[id]/editar`) possuem link "← Voltar para produtos". As telas de clientes (`/clientes/novo`) possuem link "← Voltar para clientes". O módulo vendedores usa âncora `#cadastro` na mesma página (não há botão voltar separado, pois está na mesma página de listagem).

---

## 6. Verificações Técnicas

### 6.1 TypeScript

**NÃO EXECUTADO:** O build do TypeScript não foi executado nesta auditoria (restrição: servidor de desenvolvimento em uso; não executar build nesta fase). O `tsconfig.json` está configurado com `strict: true`, `noEmit: true`, `isolatedModules: true`. Os caminhos `@/*` estão mapeados para `./*`.

**POTENCIAL:** Conforme contexto de trabalho anterior, existiam erros de TypeScript relacionados à exportação de `ProductForm` de `product-catalog.tsx` e uso de `submit` no formulário. Esses erros precisam ser verificados com `tsc --noEmit` antes do deploy.

### 6.2 Lint

**CONFIRMADO:** ESLint está listado como devDependency (`^9`) com `eslint-config-next: 16.3.1`, mas não há arquivo de configuração ESLint na raiz do projeto (`.eslintrc*`, `eslint.config.*`). O script `lint` é `eslint` sem argumentos, que leria a configuração padrão ou falharia sem configuração. Não foi executado.

### 6.3 Imports quebrados

**CONFIRMADO — Verificado visualmente:** Todos os imports nas páginas lidas apontam para arquivos existentes:
- `@/components/product-catal
og` → `components/product-catalog.tsx` ✓
- `@/components/seller-catalog` → `components/seller-catalog.tsx` ✓
- `@/components/customer-form` → `components/customer-form.tsx` ✓
- `@/components/accountant-form` → `components/accountant-form.tsx` ✓
- `@/lib/supabase/admin` → `lib/supabase/admin.ts` ✓
- `@/lib/supabase/server` → `lib/supabase/server.ts` ✓
- `@/lib/product-catalog` → `lib/product-catalog.ts` ✓
- `@/lib/seller-schema` → `lib/seller-schema.ts` ✓

Não foram identificados imports para arquivos inexistentes nas páginas principais lidas.

### 6.4 Código morto ou duplicado

**CONFIRMADO:** Existem muitos arquivos de backup temporário no diretório `components/` com nomes como `customer-form.tsx.bak`, `customer-form.tsx.final`, `customer-form.tsx.next`, `customer-form.tsx.tmp`, `customer-form.tsx.new`, e centenas de arquivos `etapa-4.tsx.novo*`. Esses arquivos não são importados pelo código (não são módulos TS/TSX usados), mas ocupam espaço e podem causar confusão. Recomenda-se limpeza antes do deploy.

### 6.5 Tratamento de erros

**CONFIRMADO:** Server Actions retornam `{ ok, message }` e as páginas exibem mensagens de erro/sucesso. Páginas de detalhe usam `notFound()` quando registros não existem. Ações de ativação usam otimismo com verificação de conflito (`eq('active', currentActive)`).

### 6.6 Configurações inseguras

**CONFIRMADO — A-003:** Ausência de `middleware.ts`. O `proxy.ts` não é reconhecido pelo Next.js como middleware.

**CONFIRMADO — A-007 (potencial):** Sem middleware, cookies de sessão podem não ser renovados adequadamente em todas as rotas (o comentário em `server.ts` menciona que `proxy.ts` mantém a sessão atualizada, mas ele não é chamado automaticamente).

---

## 7. Lista de Problemas por Gravidade

### CRÍTICO (2) — BLOQUEIA PRODUÇÃO

| ID | Gravidade | Módulo | Arquivo/Linha | Evidência | Consequência | Correção recomendada | Bloqueia? |
|----|-----------|--------|---------------|-----------|--------------|----------------------|-----------|
| A-001 | CRÍTICO | Segurança | `SCRIPT.txt` (raiz) | O arquivo continha credenciais em texto claro; os valores foram removidos. | Arquivo removido do projeto; manter fora do Git e rotacionar credenciais expostas. | SIM |
| A-002 | CRÍTICO | Segurança | `.env.local` (raiz) | Contém `SUPABASE_SERVICE_ROLE_KEY`, `CLICKSIGN_ACCESS_TOKEN`, `GMAIL_CLIENT_SECRET`, `CASA_DOS_DADOS_API_KEY` com valores reais | Segredos de produção expostos no disco de desenvolvimento; risco de vazamento se o disco for comprometido ou o arquivo acidentalmente incluído no deploy | Remover valores reais do `.env.local`; usar apenas `.env.example` como referência; configurar segredos via variáveis de ambiente do provedor de hospedagem (Vercel/equivalent) no deploy | SIM |

### ALTO (3) — BLOQUEIA OU RISCO IMPORTANTE

| ID | Gravidade | Módulo | Arquivo/Linha | Evidência | Consequência | Correção recomendada | Bloqueia? |
|----|-----------|--------|---------------|-----------|--------------|----------------------|-----------|
| A-003 | ALTO | Segurança / Infra | `next.config.ts` (vazio), `proxy.ts` (não registrado) | `next.config.ts` é `const nextConfig: NextConfig = {}`; não existe `middleware.ts`; `proxy.ts` existe mas não é usado pelo Next.js | Sem proteção centralizada de rotas; depende de cada página chamar `createAdminClient()`; nova página esquecida fica pública | Criar `middleware.ts` na raiz importando `updateSession` de `@/lib/supabase/proxy`, com matcher para todas as rotas exceto assets e `/p/[token]` | SIM |
| A-004 | ALTO | Banco de dados | `supabase/migrations/202611070002_company_isolation.sql` | Migration com comentário "Não execute até publicar o código compatível"; adiciona `company_id`, RLS, triggers de validação | Sem RLS: qualquer admin vê todos os dados; sem isolamento por empresa; dados de diferentes empresas misturados | Verificar se a migration está aplicada no Supabase de destino; se não, aplicar após validar compatibilidade com o código; garantir que todas as páginas filtram por `company_id` | SIM (se não aplicado) |
| A-005 | ALTO | Segurança / Autorização | Todas as páginas e Server Actions | Uso de `createAdminClient()` verifica apenas `crm_admin=true`; não há filtros por empresa nem papéis granulares | Qualquer admin acessa todos os módulos e todos os dados; sem separação de responsabilidades | Implementar controle de acesso baseado em empresa (quando RLS estiver ativo) e considerar papéis granulares (gerente, vendedor, apenas leitura) | SIM |

### MÉDIO (3) — CORREÇÃO PLANEJADA

| ID | Gravidade | Módulo | Arquivo/Linha | Evidência | Consequência | Correção recomendada | Bloqueia? |
|----|-----------|--------|---------------|-----------|--------------|----------------------|-----------|
| A-006 | MÉDIO | Segurança / Público | `app/p/[token]/page.tsx`, `app/p/[token]/actions.ts` | Endpoint público valida formato do token e chama RPC `get_public_proposal` / `submit_public_proposal_acceptance` | Segurança depende inteiramente da RPC no Supabase; se a RPC falhar, propostas públicas podem ser expostas | Verificar a implementação da RPC no Supabase (SECURITY DEFINER, hash do token, expiração); adicionar logs de acesso | NÃO |
| A-007 | MÉDIO | Segurança / Infra | Ausência de `middleware.ts` | Sem middleware Next.js ativo | CSRF protection para Server Actions pode não estar ativa; renovação de sessão pode falhar em algumas rotas | Criar `middleware.ts` (ver A-003); testar renovação de sessão e Server Actions após a correção | NÃO |
| A-008 | MÉDIO | Segurança / Erros | `app/produtos/actions.ts`, `app/vendedores/actions.ts` | Mensagens de erro incluem `error.code` e `error.message` do Supabase | Detalhes internos do esquema/banco podem ser expostos ao cliente | Sanitizar mensagens de erro antes de exibir; usar mensagens genéricas para o usuário e logar detalhes no servidor | NÃO |

### BAIXO (4) — MELHORIAS

| ID | Gravidade | Módulo | Arquivo/Linha | Evidência | Consequência | Correção recomendada | Bloqueia? |
|----|-----------|--------|---------------|-----------|--------------|----------------------|-----------|
| A-009 | BAIXO | Documentação | `README.md` | Diz "não há autenticação, persistência ou conexão externa" mas o código tem auth completa, Supabase e persistência | Documentação desatualizada pode enganar novos desenvolvedores | Atualizar o README para refletir a arquitetura real (Next.js 16 + Supabase + Auth + App Router) | NÃO |
| A-010 | BAIXO | Build | `package.json` (`build: next build`) | Build de produção ainda não validado (contexto anterior indica erros de TypeScript pendentes) | Não há garantia de que o código compila para produção | Executar `next build` e corrigir todos os erros antes do deploy | NÃO (mas necessário) |
| A-011 | BAIXO | Banco / Funcional | Várias telas | Avisos "Aplique manualmente a migration XXXX antes de gravar" em produtos, vendedores, propostas, metas, comissões | Funcionalidades ficam em modo de leitura se as migrations não forem aplicadas | Aplicar migrations pendentes no ambiente de produção; validar cada módulo após aplicação | NÃO |
| A-012 | BAIXO | Qualidade de código | Diretório `components/` | Centenas de arquivos `.bak`, `.final`, `.next`, `.tmp`, `.new`, `etapa-4.tsx.novo*` | Arquivos temporários causam confusão e ocupam espaço; risco de uso acidental | Remover arquivos de backup temporário antes do deploy | NÃO |

---

## 8. Pendências Não Verificadas

Os seguintes itens não puderam ser verificados nesta auditoria (sem acesso seguro ao banco de produção, sem execução de build, sem deploy):

1. **Estado real do Supabase:** Não foi possível confirmar se as migrations estão aplicadas, especialmente a `202611070002_company_isolation.sql` (RLS e isolamento por empresa).
2. **Build de produção:** `next build` não foi executado. Erros de TypeScript ou de build podem impedir o deploy.
3. **RPCs do Supabase:** `get_public_proposal` e `submit_public_proposal_acceptance` não foram inspecionadas; sua segurança depende da implementação no banco.
4. **Policies de Storage:** As policies de `nexo-crm-private` e `nexo-proposal-assets` são definidas na migration, mas não foi possível verificar se os buckets existem e estão configurados.
5. **Variáveis de ambiente de produção:** Não foram verificadas as variáveis configuradas no provedor de hospedagem (Vercel ou similar).
6. **Testes de renderização:** Não foi possível renderizar as páginas no navegador (sem sessão de autenticação disponível).

---

## 9. Checklist para Implantação

- [ ] Rotacionar senhas expostas em `SCRIPT.txt` e remover o arquivo
- [ ] Limpar `.env.local` de valores reais; configurar segredos via variáveis de ambiente do provedor de hospedagem
- [ ] Criar `middleware.ts` na raiz com `updateSession` do `@/lib/supabase/proxy`
- [ ] Aplicar migration `202611070002_company_isolation.sql` (e dependentes) no Supabase de produção
- [ ] Verificar se todas as outras migrations pendentes estão aplicadas
- [ ] Executar `tsc --noEmit` e corrigir erros de TypeScript
- [ ] Executar `next build` e corrigir erros de build
- [ ] Sanitizar mensagens de erro que vazam detalhes do Supabase (A-008)
- [ ] Atualizar `README.md` com a arquitetura real
- [ ] Limpar arquivos de backup temporário (`*.bak`, `*.tmp`, `etapa-4.tsx.novo*`, etc.)
- [ ] Verificar RPCs públicas (`get_public_proposal`, `submit_public_proposal_acceptance`) no Supabase
- [ ] Verificar buckets de Storage e policies
- [ ] Validar fluxo de login, cadastro, edição e inativação em cada módulo após as correções

---

## 10. Parecer Final

**NÃO APTO PARA PRODUÇÃO**

Justificativa: Existem **2 problemas CRÍTICO** (senhas e segredos expostos) e **3 problemas ALTO** (ausência de middleware, RLS/isolamento por empresa não verificado, controle de acesso global sem granularidade) não resolvidos. Além disso, verificações essenciais de segurança e implantação permanecem pendentes (build de produção, estado das migrations no Supabase, RPCs públicas).

O sistema não deve ser implantado em produção até que os problemas CRÍTICO e ALTO sejam corrigidos e as verificações pendentes sejam concluídas.

---

**Quantidade de problemas:**
- Críticos: 2
- Altos: 3
- Médios: 3
- Baixos: 4
- Pendências não verificadas: 6

**Arquivo único autorizado criado:** `AUDITORIA_FINAL_PRE_PRODUCAO.md` (este arquivo). Nenhum outro arquivo foi modificado.
