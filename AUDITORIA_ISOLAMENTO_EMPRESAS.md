# AUDITORIA DE ISOLAMENTO POR EMPRESA — Nexo CRM Comercial

**Data da auditoria:** 11/11/2026  
**Escopo:** Compatibilidade do isolamento por empresa (migration `202611070002_company_isolation.sql`) com o código existente.  
**Restrições:** Nenhum arquivo modificado, nenhum SQL executado, nenhuma migration aplicada, nenhum build executado.  
**Único arquivo autorizado:** AUDITORIA_ISOLAMENTO_EMPRESAS.md

---

## 1. Situação Atual

O projeto Nexo CRM Comercial é um sistema Next.js 16 + Supabase com múltiplos módulos (clientes, leads, produtos, vendedores, propostas, contratos, comissões, metas, usuários, contadores, WhatsApp, e-mail). Todos os dados comerciais residem em tabelas públicas do Supabase **sem coluna `company_id`** e **sem RLS (Row Level Security)** ativa.

A migration `202611070002_company_isolation.sql` está pronta no repositório mas **não foi aplicada** (o próprio arquivo adverte: "Não execute até publicar o código compatível com crm_companies/company_id"). A migration `202611070003_company_admin_api_grants.sql` concede privilégios à `service_role` para `crm_companies` e `crm_company_members`.

### Estado de preparação para isolamento

| Item | Status | Evidência |
|------|--------|-----------|
| Migration de isolamento existente | Sim | `supabase/migrations/202611070002_company_isolation.sql` |
| Migration aplicada no banco | Não verificado | Comentário na própria migration impede execução antecipada |
| Código filtra por `company_id` | Não (exceto 2 páginas) | `app/usuarios/page.tsx`, `app/email/page.tsx` |
| Código injeta `company_id` nas gravações | Não | Nenhuma Server Action ou API route injeta `company_id` |
| Sessão carrega empresa ativa | Não | `createAdminClient()` valida apenas `crm_admin` |
| Trigger de auto-atribuição de `company_id` | Definido na migration, não aplicado | `set_crm_company_id()` |

---

## 2. Análise da Migration `202611070002_company_isolation.sql`

### 2.1 Tabelas criadas

| Tabela | Propósito |
|--------|-----------|
| `public.crm_companies` | Cadastro de empresas isoladas (id, name, active, created_at) |
| `public.crm_company_members` | Vínculo usuário ↔ empresa (user_id, company_id, role, active) |

### 2.2 Tabelas que recebem `company_id` (22 tabelas)

```
people, leads, customers, sellers, products, accountants, opportunities,
activities, opportunity_events, proposals, proposal_versions, proposal_items,
proposal_links, proposal_acceptances, customer_documents, customer_contracts,
customer_contract_status_history, opportunity_products, closed_sales,
closed_sale_items, closed_sale_events, commercial_goals, lead_prospecting_filters
```

### 2.3 Tabelas que NÃO recebem `company_id`

| Tabela | Motivo |
|--------|--------|
| `pipelines`, `pipeline_stages` | Estrutura de funil compartilhada |
| `gmail_connections` | Filtrada por `membership.company_id` na página de e-mail |
| `crm_companies`, `crm_company_members` | Tabelas de controle do próprio isolamento |

### 2.4 Políticas RLS

| Tabela(s) | Política | Condição |
|-----------|----------|----------|
| `crm_companies` | `crm_company_read_member` | `id = current_crm_company_id() AND is_crm_admin()` |
| `crm_company_members` | `crm_company_member_read_self` | `user_id = auth.uid()` |
| 22 tabelas de dados | `crm_company_isolation` | `is_crm_admin() AND company_id = current_crm_company_id()` (USING + WITH CHECK) |

Todas as políticas exigem `is_crm_admin()` **e** `company_id = current_crm_company_id()`. A função `current_crm_company_id()` lê de `crm_company_members` onde `user_id = auth.uid() AND active`.

### 2.5 Triggers

| Trigger | Tabelas | Função | Comportamento |
|---------|---------|--------|---------------|
| `set_crm_company_id` | 22 tabelas (before insert/update) | `set_crm_company_id()` | Auto-atribui `company_id` do usuário logado; impede gravação em outra empresa |
| `validate_crm_related_company` | 22 tabelas (before insert/update) | `validate_crm_related_company()` | Valida que registros relacionados (person, seller, customer, etc.) pertencem à mesma empresa |

### 2.6 Dependências de outras migrations

- Exige `public.is_crm_admin()` (criada na `202610290001_initial_schema.sql`).
- Exige que todas as 22 tabelas de dados já existam (criadas por migrations anteriores: 202610290001, 202610300001, 202610300002, 202610310001-0010, 202611020001-0002, 202611050001, 202611070001, 202611080001-0002, 202611090001, 202611100001-0003).
- `202611070003_company_admin_api_grants.sql` depende dela e concede acesso à `service_role`.

### 2.7 Regras de acesso administrativo

- Apenas usuários com `app_metadata.crm_admin = true` podem acessar dados (via RLS).
- `service_role` tem privilégios diretos em `crm_companies` e `crm_company_members` (via migration 0003).
- Usuários autenticados comuns têm `select, insert, update, delete` nas 22 tabelas, mas restritos por RLS à própria empresa.
- `anon` não tem acesso a nenhuma tabela de dados.

### 2.8 Registros existentes sem `company_id`

A migration **atualiza automaticamente** todos registros existentes definindo `company_id = '00000000-0000-0000-0000-000000000100'` (Base de testes) onde `company_id IS NULL`. Isso garante que dados antigos não fiquem órfãos, mas todos ficam associados à "Base de testes".

---

## 3. Mapeamento de Consultas do Projeto

### 3.1 Uso de `createAdminClient()` (valida `crm_admin`, não injeta company_id)

| Arquivo | Uso |
|---------|-----|
| `app/produtos/actions.ts` | `saveProduct`, `setProductActive` |
| `app/vendedores/actions.ts` | `saveSeller`, `setSellerActive`, `searchInternalAuthUsers` |
| `app/clientes/actions.ts` | `saveCustomer` |
| `app/clientes/importar/actions.ts` | importação de clientes |
| `app/leads/actions.ts` | `saveLead`, `addLeadInteraction`, `convertLead` |
| `app/contadores/actions.ts` | `saveAccountant`, `createQuickAccountant` |
| `app/propostas/actions.ts` | `createProposal`, `createProposalVersion`, `updateProposalStatus`, `createProposalShareLink`, `reviewProposalAcceptance` |
| `app/usuarios/actions.ts` | `createIsolatedCompany`, `inviteTeamUser` |
| `app/whatsapp/actions.ts` | `addWhatsAppInteraction` |
| `app/page.tsx` (dashboard) | métricas e consultas agregadas |
| `app/produtos/page.tsx`, `novo/page.tsx`, `[id]/editar/page.tsx` | listagem e formulário |
| `app/vendedores/page.tsx` | listagem de vendedores |
| `app/clientes/page.tsx`, `[id]/page.tsx`, `[id]/editar/page.tsx`, `novo/page.tsx` | clientes |
| `app/leads/page.tsx`, `[id]/page.tsx`, `importar/page.tsx` | leads |
| `app/comissoes/page.tsx` | comissões |
| `app/metas/page.tsx` | metas |
| `app/contadores/page.tsx` | contadores |
| `app/funil/page.tsx` | funil |
| `app/propostas/page.tsx`, `novo/page.tsx`, `[id]/page.tsx` | propostas |
| `app/contratos/page.tsx` | contratos |
| `app/whatsapp/page.tsx` | WhatsApp workspace |
| `app/email/page.tsx` | Gmail workspace |

### 3.2 Uso de `createClient()` (cliente do navegador/servidor com anon key)

| Arquivo | Uso |
|---------|-----|
| `app/login/actions.ts` | `signIn` |
| `app/cadastro-empresa/actions.ts` | `registerCompany` |
| `app/api/lookups/ie/route.ts` | consulta IE |
| `app/api/lookups/cnpj/route.ts` | consulta CNPJ |
| `app/api/leads/import/route.ts` | importação de leads |
| `app/api/leads/prospecting/filters/route.ts` | filtros de prospecção |
| `app/api/leads/prospecting/casa-dos-dados/route.ts` | Casa dos Dados |
| `app/api/gmail/connect/route.ts` | conectar Gmail |
| `app/api/gmail/callback/route.ts` | callback Gmail |
| `app/api/gmail/disconnect/route.ts` | desconectar Gmail |
| `app/p/[token]/page.tsx` | aceitação pública de proposta |

### 3.3 Uso de `service_role` diretamente (bypassa RLS)

| Arquivo | Uso |
|---------|-----|
| `app/api/cron/casa-dos-dados/route.ts` | `createSupabaseClient(url, serviceRoleKey, ...)` — acessa `lead_prospecting_filters` sem RLS |

### 3.4 Supabase RPC

| Arquivo | RPC | Contexto |
|---------|-----|----------|
| `app/vendedores/actions.ts` | `search_crm_auth_users` | pesquisa de usuários Auth |
| `app/p/[token]/page.tsx` | `get_public_proposal` | proposta pública (SECURITY DEFINER) |
| `app/p/[token]/actions.ts` | `submit_public_proposal_acceptance` | aceite público (SECURITY DEFINER) |

---

## 4. Matriz de Compatibilidade por Módulo

| Módulo | Tabela | Operação | Empresa identificada? | Filtro `company_id`? | RLS aplicável? | Risco | Ajuste necessário |
|--------|--------|----------|----------------------|---------------------|----------------|-------|-------------------|
| Usuários/Empresas | `crm_companies` | CRUD | Sim (via `currentMembership`) | Não (usa `crm_company_members`) | Sim | Médio | Código já lida com empresa; trigger `set_crm_company_id` garante integridade |
| Usuários/Empresas | `crm_company_members` | CRUD | Sim | Não | Sim | Médio | Código já filtra por `user_id` e `company_id` |
| Dashboard | `sellers`, `products`, `opportunities`, `proposals`, `active_closed_sales`, `commercial_goals` | SELECT | Não | Não | Sim | Alto | Sem filtro explícito; depende totalmente de RLS |
| Clientes | `people`, `customers` | SELECT/INSERT/UPDATE | Não | Não | Sim | Alto | `saveCustomer()` não injeta `company_id`; trigger auto-atribui |
| Clientes | `customer_documents`, `customer_contracts` | SELECT/INSERT/UPDATE | Não | Não | Sim | Alto | API route `customer-files` não injeta `company_id` |
| Leads | `people`, `leads` | SELECT/INSERT/UPDATE | Não | Não | Sim | Alto | `saveLead()` não injeta `company_id` |
| Produtos | `products` | SELECT/INSERT/UPDATE | Não | Não | Sim | Alto | `saveProduct()` não injeta `company_id` |
| Vendedores | `sellers` | SELECT/INSERT/UPDATE | Não | Não | Sim | Alto | `saveSeller()` não injeta `company_id` |
| Propostas | `proposals`, `proposal_versions`, `proposal_items`, `proposal_links`, `proposal_acceptances` | SELECT/INSERT/UPDATE | Não | Não | Sim | Alto | `createProposal()` não injeta `company_id` |
| Contratos | `customer_contracts` | SELECT/INSERT/UPDATE | Não | Não | Sim | Alto | Não injeta `company_id` |
| Comissões | `active_closed_sales`, `closed_sale_items`, `sellers` | SELECT | Não | Não | Sim | Alto | Leitura agregada sem filtro empresa |
| Metas | `commercial_goals` | SELECT/INSERT/UPDATE | Não | Não | Sim | Alto | Não injeta `company_id` |
| Contadores | `accountants` | SELECT/INSERT/UPDATE | Não | Não | Sim | Alto | `saveAccountant()` não injeta `company_id` |
| Funil | `leads`, `opportunities`, `pipeline_stages`, `activities` | SELECT | Não | Não | Sim | Alto | Leitura agregada sem filtro empresa |
| WhatsApp | `leads`, `people`, `activities` | SELECT/INSERT | Não | Não | Sim | Alto | `addWhatsAppInteraction()` não injeta `company_id` |
| E-mail | `gmail_connections` | SELECT/INSERT | Sim (via `membership.company_id`) | Sim | Não | Baixo | Já filtra por empresa na aplicação |
| Cron Casa dos Dados | `lead_prospecting_filters` | SELECT/UPDATE | Não (usa `service_role`) | Não | Não | Alto | `service_role` bypassa RLS; não há filtro empresa |

**Nota sobre RLS:** Se a migration for aplicada, todas as operações acima ficam restritas por RLS à empresa do usuário logado (via `current_crm_company_id()`). O trigger `set_crm_company_id` garante que `company_id` seja preenchido automaticamente em INSERT/UPDATE. No entanto, como o código não injeta `company_id` explicitamente, qualquer falha no RLS ou no trigger exporia dados de outras empresas.

---

## 5. Verificação de Relacionamentos com Empresa

### 5.1 Cadastro e associação de usuários a empresas

**Sim, existe.** A migration cria `crm_companies` e `crm_company_members`. A página `/usuarios` permite:
- Criar empresas isoladas (`createIsolatedCompany`)
- Convidar usuários vinculados a uma empresa (`inviteTeamUser`)
- Listar usuários por empresa (`companyByUserId`)

No entanto, **não existe conceito de "empresa ativa na sessão"**. A empresa é determinada por requisição via função SQL `current_crm_company_id()`, que consulta `crm_company_members` pelo `auth.uid()`. Um usuário pode pertencer a apenas uma empresa (PK `user_id` em `crm_company_members`).

### 5.2 Relacionamento de vendedores com empresas

**Não existe no código.** A tabela `sellers` receberá `company_id` pela migration, mas:
- `saveSeller()` não injeta `company_id`
- Não há validação de que o vendedor pertence à empresa do usuário logado
- O trigger `validate_crm_related_company` valida vendedores em leads/opportunities, mas não existe tela para atribuir vendedor a empresa

### 5.3 Relacionamento de clientes, propostas, contratos, oportunidades e comissões com empresas

- **Clientes:** `customers` receberá `company_id`, mas `saveCustomer()` não injeta. RLS restringe leitura/escrita.
- **Propostas:** `proposals` receberá `company_id`, mas `createProposal()` não injeta.
- **Contratos:** `customer_contracts` receberá `company_id`, mas API route não injeta.
- **Oportunidades:** `opportunities` receberá `company_id`, mas não há tela dedicada (redireciona para funil).
- **Comissões:** Leitura de `active_closed_sales` e `sellers`, sem filtro empresa.

---

## 6. Operações que Deixariam de Funcionar Após a Migration

| Operação | Motivo | Severidade |
|----------|--------|------------|
| `saveCustomer()` | Não injeta `company_id`; trigger auto-atribui, mas se RLS falhar, gravação pode ser rejeitada | Alto |
| `saveLead()` | Mesmo problema acima | Alto |
| `saveProduct()` | Mesmo problema acima | Alto |
| `saveSeller()` | Mesmo problema acima | Alto |
| `createProposal()` | Mesmo problema acima | Alto |
| `saveAccountant()` | Mesmo problema acima | Alto |
| `addWhatsAppInteraction()` | Mesmo problema acima | Alto |
| `inviteTeamUser()` | Usa `service_role` diretamente em `crm_company_members`; funciona, mas não filtra por empresa do usuário logado | Médio |
| `createIsolatedCompany()` | Usa `service_role` diretamente em `crm_companies`; funciona | Médio |
| Consultas de dashboard/comissões/funil | Leitura agregada sem filtro empresa; depende 100% de RLS | Alto |
| Cron Casa dos Dados | Usa `service_role` (bypassa RLS); não filtra por empresa | Alto |

---

## 7. Alterações Necessárias

### 7.1 Alterações de banco (não executar nesta etapa)

1. Aplicar `202611070002_company_isolation.sql` — adiciona `company_id`, RLS, triggers, índices únicos por empresa.
2. Aplicar `202611070003_company_admin_api_grants.sql` — privilégios da `service_role`.
3. Verificar se todas as migrations anteriores foram aplicadas (a migration 0002 levanta exceção se alguma tabela estiver ausente).
4. Verificar se os buckets de Storage `nexo-crm-private` e `nexo-proposal-assets` existem (políticas são criadas pela migration).

### 7.2 Alterações de código (não executar nesta etapa)

1. **Injetar `company_id` em todas as gravações:** Todas as Server Actions e API routes que fazem INSERT/UPDATE nas 22 tabelas devem incluir `company_id` obtido de `current_crm_company_id()` (via consulta a `crm_company_members` ou via RPC).

2. **Adicionar filtro explícito por `company_id` em consultas SELECT:** Todas as páginas que listam registros devem filtrar por `company_id` como defesa em profundidade, não dependendo exclusivamente de RLS.

3. **Determinar empresa ativa na sessão:** Criar mecanismo para identificar a empresa do usuário logado (consulta a `crm_company_members`) e disponibilizá-la para Server Actions e páginas.

4. **Validar relacionamentos cruzados no código:** Antes de salvar um lead com `seller_id`, verificar se o vendedor pertence à mesma empresa. Mesmo que o trigger faça isso no banco, o código deve retornar erro amigável.

5. **Ajustar cron Casa dos Dados:** O `service_role` bypassa RLS; adicionar filtro por `company_id` ou restringir o acesso.

6. **Ajustar `app/email/page.tsx`:** Já filtra por `membership.company_id`, mas deve ser revisado para consistência com o novo modelo.

### 7.3 Migração de dados existentes

A migration `0002` já atualiza todos os registros existentes para `company_id = '00000000-0000-0000-0000-000000000100'` (Base de testes). Nenhuma migração adicional de dados é necessária para o isolamento inicial, mas:
- Registros futuros devem ser atribuídos à empresa correta do usuário logado.
- Se houver múltiplas empresas, será necessário um processo de reatribuição de registros históricos.

---

## 8. Sequência Segura de Implementação

### Fase 1: Preparação de código (antes da migration)

1. Implementar detecção de empresa ativa no servidor (consulta a `crm_company_members`).
2. Injetar `company_id` em todas as Server Actions e API routes que gravam nas 22 tabelas.
3. Adicionar filtro explícito por `company_id` em consultas SELECT de todas as páginas.
4. Adicionar validação de relacionamentos cruzados (vendedor, cliente, produto pertencem à mesma empresa).
5. Ajustar cron Casa dos Dados para filtrar por empresa ou restringir acesso de `service_role`.

### Fase 2: Aplicação de migration

6. Aplicar `202611070002_company_isolation.sql` no Supabase de homologação.
7. Verificar se RLS está ativo em todas as 22 tabelas.
8. Verificar se triggers `set_crm_company_id` e `validate_crm_related_company` foram criados.
9. Aplicar `202611070003_company_admin_api_grants.sql`.

### Fase 3: Validação

10. Executar `next build` e corrigir erros de TypeScript.
11. Testar login, cadastro, edição e inativação em cada módulo com dados de múltiplas empresas.
12. Verificar que usuário da Empresa A não consegue acessar registros da Empresa B.
13. Verificar que trigger impede gravação de `company_id` diferente da empresa do usuário.
14. Verificar que Storage policies funcionam para arquivos privados e logos.

### Fase 5: Produção

15. Aplicar migration no Supabase de produção.
16. Validar funcionamento em produção com dados reais.

---

## 9. Critérios de Aceitação para Produção

| Critério | Como verificar |
|----------|---------------|
| Migration aplicada | `to_regclass('public.crm_companies')` não é nulo; `to_regclass('public.crm_company_members')` não é nulo |
| RLS ativo em todas as 22 tabelas | `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'` mostra `true` para todas |
| Triggers ativos | `SELECT * FROM pg_trigger WHERE tgname IN ('set_crm_company_id', 'validate_crm_related_company')` |
| Usuário só vê dados da própria empresa | Login como usuário da Empresa A; tentar acessar registro da Empresa B → deve retornar vazio ou erro |
| Gravação injeta `company_id` correto | Inserir registro como usuário da Empresa A; verificar que `company_id` = ID da Empresa A |
| Impede gravação em outra empresa | Tentar definir `company_id` de Empresa B como usuário da Empresa A → trigger deve rejeitar |
| Storage isolado | Tentar acessar arquivo privado de cliente da Empresa B como usuário da Empresa A → deve ser negado |
| `service_role` restrito | Cron Casa dos Dados não deve acessar registros de outras empresas sem filtro |
| Build sem erros | `next build` concluído com sucesso; `tsc --noEmit` sem erros |

---

## 10. Riscos Confirmados

| Risco | Gravidade | Descrição |
|-------|-----------|-----------|
| R-001 | Crítico | Código não injeta `company_id` em gravações; depende 100% do trigger do banco. Se trigger falhar ou não estiver ativo, gravações podem ser rejeitadas ou dados podem ficar sem empresa. |
| R-002 | Crítico | Não há filtro explícito por `company_id` em consultas SELECT (exceto usuários e e-mail). Se RLS for desabilitado ou falhar, qualquer admin acessa todos os dados de todas as empresas. |
| R-003 | Alto | `service_role` no cron Casa dos Dados bypassa RLS completamente; não há filtro de empresa. |
| R-004 | Alto | Não existe conceito de "empresa ativa na sessão" no código da aplicação; empresa é determinada apenas por função SQL no banco. |
| R-005 | Médio | Vendedores não têm relacionamento explícito com empresa no código; `sellers` receberá `company_id` mas não há validação de atribuição. |
| R-006 | Médio | Migration `0002` não pode ser aplicada sem que todas as 22 tabelas existam; ordem de migrations deve ser respeitada. |

---

## 11. Conclusão

A migration `202611070002_company_isolation.sql` está bem estruturada e fornece isolamento por empresa no nível do banco (RLS + triggers + índices únicos). No entanto, **o código da aplicação não está preparado** para essa migration:

- Nenhuma Server Action injeta `company_id` nas gravações.
- Nenhuma página filtra explicitamente por `company_id` nas leituras.
- Não há mecanismo de "empresa ativa na sessão" no código.
- O `service_role` no cron bypassa RLS totalmente.

**Recomendação:** Não aplicar a migration na produção antes de implementar as alterações de código listadas na Fase 1. A aplicação da migration sem essas alterações causará falhas em gravações (trigger rejeitará se `company_id` não puder ser determinado) e deixará leituras dependentes exclusivamente de RLS, sem defesa em profundidade.
