# AUDITORIA DE VALIDAÇÃO DOS ACHADOS CRÍTICOS — Nexo CRM Comercial

**Data da validação:** 11/11/2026  
**Escopo:** Revalidação dos achados A-001 a A-005 da auditoria pré-produção.  
**Restrições:** Nenhum arquivo modificado, nenhum banco acessado, nenhum build executado, nenhuma migration executada, nenhum segredo impresso.  
**Único arquivo autorizado:** AUDITORIA_VALIDACAO_CRITICOS.md

---

## 1. A-001 — SCRIPT.txt

### Classificação: CONFIRMADO (parcial)

| Item | Evidência técnica | Arquivo / linha |
|------|-------------------|-----------------|
| Contém credenciais reais | Sim. Linha 3: "SENHA DO SUPABASE: [REMOVIDO] Linhas 13-14: usuário e senha de acesso. | `SCRIPT.txt:3,13-14` |
| Versionado pelo Git | Não. Não existe diretório `.git` no projeto (verificado por glob `**/.git/**`). O diretório não é um repositório Git. | — |
| Aparece no histórico Git | Não aplicável — não há repositório Git. | — |
| Protegido pelo .gitignore | Não. O `.gitignore` lista `.next/`, `out/`, `node_modules/`, `.env*` (exceto `.env.example`), `*.tsbuildinfo`, `next-env.d.ts`. `SCRIPT.txt` não está listado. | `.gitignore:1-7` |

### Gravidade revisada: CRÍTICO

Credenciais reais estão armazenadas em texto claro em um arquivo na raiz do projeto, sem proteção por `.gitignore` e sem versionamento Git que as rastreie. Embora não estejam versionadas (não há Git), permanecem expostas no disco de desenvolvimento e podem ser copiadas acidentalmente para backups, ambientes de staging ou produção.

### Correção necessária

- Remover o arquivo `SCRIPT.txt` do disco de desenvolvimento.
- Rotacionar as senhas expostas (senha do Supabase e senha do usuário de e-mail).
- Adicionar `SCRIPT.txt` ao `.gitignore` caso o projeto seja versionado futuramente.

### Bloqueia produção: SIM

---

## 2. A-002 — .env.local

### Classificação: CONFIRMADO

| Item | Evidência técnica | Arquivo / linha |
|------|-------------------|-----------------|
| Ignorado pelo Git | Sim. `.gitignore` contém `.env*` (com exceção de `!.env.example`), portanto `.env.local` é ignorado. | `.gitignore:4` |
| Já foi versionado | Não aplicável — não existe repositório Git no diretório. | — |
| Variável sensível com prefixo NEXT_PUBLIC_ | Sim. `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` usam o prefixo `NEXT_PUBLIC_`. Estas são chaves públicas destinadas ao navegador. | `.env.local:2-3` |
| Service_role exclusivamente no servidor | Sim. `SUPABASE_SERVICE_ROLE_KEY` (linha 5) não usa prefixo `NEXT_PUBLIC_`. É consumida apenas por `lib/supabase/admin-auth.ts`, que começa com `import 'server-only'` (linha 1), garantindo execução apenas no servidor. | `.env.local:5`; `lib/supabase/admin-auth.ts:1` |

### Gravidade revisada: CRÍTICO

O arquivo `.env.local` contém valores reais de segredos (`SUPABASE_SERVICE_ROLE_KEY`, `CLICKSIGN_ACCESS_TOKEN`, `GMAIL_CLIENT_SECRET`, `CASA_DOS_DADOS_API_KEY`, `GMAIL_TOKEN_ENCRYPTION_KEY`) no disco de desenvolvimento. Embora ignorado pelo Git e com prefixos corretos para variáveis de servidor, a presença de segredos reais em texto claro no disco representa risco se o disco for comprometido ou o arquivo acidentalmente incluído em um pacote de deploy.

### Correção necessária

- Remover valores reais de `.env.local` do disco de desenvolvimento; manter apenas `.env.example` como modelo.
- Configurar segredos de produção exclusivamente via variáveis de ambiente do provedor de hospedagem (Vercel ou equivalente), nunca commitados.

### Bloqueia produção: SIM

---

## 3. A-003 — proxy.ts

### Classificação: FALSO POSITIVO quanto à "ausência de middleware" (com ressalva técnica)

| Item | Evidência técnica | Arquivo / linha |
|------|-------------------|-----------------|
| Localizado corretamente | Sim. `proxy.ts` está na raiz do projeto, onde o Next.js espera o middleware. | `proxy.ts:1` |
| Exporta a função proxy | Sim. `export async function proxy(request: NextRequest)` (linha 4) e `export const config` com matcher (linhas 11-13). | `proxy.ts:4,11-13` |
| Configuração matcher adequada | Sim. `matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg\|png\|jpg\|jpeg\|gif\|webp)$).*)']` — protege todas as rotas exceto assets estáticos e links públicos de proposta `/p/[token]`. | `proxy.ts:12` |
| Rotas efetivamente protegidas | Todas as rotas da aplicação, exceto: `_next/static`, `_next/image`, `favicon.ico`, arquivos de imagem, e `/p/[A-Za-z0-9_-]{43}` (aceitação pública de proposta, que usa RPCs SECURITY DEFINER com retorno limitado). | `proxy.ts:7,12` |
| Autorização também em páginas/APIs/Server Actions | Sim. Páginas chamam `createAdminClient()` que valida `crm_admin` (`lib/supabase/admin.ts:8`). Server Actions usam `createAdminClient()`. API routes validam `crm_admin` diretamente ou via `createAdminClient()` (ex: `app/api/lookups/ie/route.ts:13`, `app/api/lookups/cnpj/route.ts:35`, `app/api/leads/import/route.ts:55`). | `lib/supabase/admin.ts:8` |

### Ressalva técnica

Embora o usuário instrua a considerar `proxy.ts` no lugar de `middleware.ts`, o Next.js convencionalmente reconhece middleware apenas em arquivo chamado `middleware.ts` (ou `middleware.js`) com exportação nomeada `middleware` ou default. O `proxy.ts` exporta a função `proxy` (não `middleware`), portanto, mesmo renomeado para `middleware.ts`, pode não ser reconhecido automaticamente pelo Next.js sem que a exportação seja ajustada para `middleware`. No entanto, sob a premissa do usuário de que o Next.js 16 utiliza `proxy.ts`, o arquivo está estruturado corretamente para atuar como middleware.

Adicionalmente, existe defesa em profundidade: mesmo que o middleware não esteja ativo, cada página, Server Action e API route valida `crm_admin` independentemente.

### Gravidade revisada: MÉDIO

O proxy existe e está estruturado para proteger as rotas, mas a exportação nomeada `proxy` (em vez de `middleware`) pode não ser reconhecida automaticamente pelo Next.js. As verificações nas páginas/APIs/Server Actions mitigam o risco, mas a ausência de proteção centralizada no ponto de entrada do framework permanece como fragilidade arquitetural.

### Correção necessária

- Verificar se o Next.js 16 reconhece `proxy.ts` como middleware em ambiente de build. Caso não reconheça, renomear para `middleware.ts` e ajustar a exportação para `export function middleware` (ou `export default`).
- Manter as verificações de `crm_admin` nas páginas/APIs/Server Actions como defesa em profundidade.

### Bloqueia produção: NÃO

---

## 4. A-004 — Isolamento por empresa

### Classificação: NÃO VERIFICADO (estado do banco) / CONFIRMADO (ausência de filtro no código)

| Item | Evidência técnica | Arquivo / linha |
|------|-------------------|-----------------|
| Migration de isolamento | `supabase/migrations/202611070002_company_isolation.sql` adiciona `company_id` a ~25 tabelas, habilita RLS, cria políticas `is_crm_admin() AND company_id = current_crm_company_id()`, triggers `set_crm_company_id` e `validate_crm_related_company`. A migration tem comentário: "Não execute até publicar o código compatível com crm_companies/company_id". | `supabase/migrations/202611070002_company_isolation.sql` |
| Uso de company_id nas consultas | `company_id` é usado explicitamente apenas em `app/usuarios/page.tsx` (listagem/convite de usuários por empresa) e `app/email/page.tsx` (conexão Gmail por empresa). Páginas de produtos, clientes, leads, vendedores e dashboard NÃO filtram por `company_id` em suas consultas. | `app/usuarios/page.tsx:37-61`; `app/email/page.tsx:10-12` |
| Políticas RLS definidas | Sim, na migration 202611070002: política `crm_company_isolation` em todas as tabelas de dados, exigindo `is_crm_admin() AND company_id = current_crm_company_id()`. | `supabase/migrations/202611070002_company_isolation.sql:93` |
| Triggers e constraints | Sim. Triggers `set_crm_company_id` (before insert/update) e `validate_crm_related_company` (valida vínculos entre tabelas) são criados para todas as tabelas de dados. | `supabase/migrations/202611070002_company_isolation.sql:225-229` |
| Consultas com createAdminClient() | Todas as páginas de dados usam `createAdminClient()` que valida sessão e `crm_admin`, mas não injeta `company_id` nas consultas SQL. | `app/produtos/page.tsx:8`; `app/clientes/page.tsx:20`; `app/leads/page.tsx:33` |

### Risco concreto de acesso cruzado

- **Se a migration NÃO estiver aplicada:** Não existe coluna `company_id`, não há RLS, não há triggers. Qualquer usuário autenticado com `crm_admin=true` pode ler e gravar todos os registros de todas as empresas (se houver mais de uma). **Risco concreto: SIM.**
- **Se a migration ESTIVER aplicada:** RLS restringe leitura/escrita por `company_id` via `current_crm_company_id()`. Os triggers garantem que gravações herdem o `company_id` do usuário logado. No entanto, as consultas da aplicação não filtram explicitamente por `company_id`, dependendo inteiramente do RLS do PostgreSQL. Se o RLS funcionar corretamente, não há acesso cruzado. **Risco concreto: NÃO (contanto que RLS esteja ativo).**

Não foi possível verificar se a migration está aplicada no Supabase de destino (sem acesso seguro ao banco).

### Gravidade revisada: ALTO (condicional)

A ausência de filtro explícito por `company_id` no código da aplicação, combinada com a dependência total do RLS para isolamento, representa risco alto se a migration não estiver aplicada ou se o RLS falhar por qualquer motivo.

### Correção necessária

- Verificar se a migration `202611070002_company_isolation.sql` (e dependentes) está aplicada no Supabase de produção.
- Se aplicada, validar que o RLS está ativo e funcionando em todas as tabelas de dados.
- Considerar adicionar filtro explícito por `company_id` nas consultas da aplicação como defesa em profundidade, não dependendo exclusivamente do RLS.

### Bloqueia produção: SIM (se migration não aplicada ou RLS não verificado)

---

## 5. A-005 — Permissões

### Classificação: CONFIRMADO

| Item | Evidência técnica | Arquivo / linha |
|------|-------------------|-----------------|
| Como crm_admin é validado | Verificado em: `lib/supabase/admin.ts:8` (`user.app_metadata?.crm_admin !== true` → redirect `/login?reason=denied`), `app/login/actions.ts:23`, `lib/supabase/proxy.ts:26`, `lib/gmail/server.ts:58`, múltiplas API routes (`app/api/lookups/ie/route.ts:13`, `app/api/lookups/cnpj/route.ts:35`, `app/api/leads/import/route.ts:55`, etc.). | `lib/supabase/admin.ts:8` |
| Rotas que exigem autenticação | Todas as rotas da aplicação, exceto `/login`, `/cadastro-empresa` e `/p/[token]` (aceitação pública de proposta). O `proxy.ts` redireciona para `/login` quando não há sessão válida ou usuário não é admin. | `proxy.ts:28-33` |
| Operações que exigem autorização | Todas as Server Actions usam `createAdminClient()` (requer `crm_admin`). Todas as API routes usam `createAdminClient()` ou checagem direta de `crm_admin`. | `app/produtos/actions.ts:25`; `app/api/lookups/ie/route.ts:13` |
| Controle de acesso por empresa | Não existe no código da aplicação. O isolamento por empresa depende exclusivamente da RLS do banco (migration `202611070002_company_isolation.sql`). Páginas de produtos, clientes, leads, vendedores e dashboard não filtram por `company_id`. | — |
| Usuários de empresas diferentes acessam mesmos registros | Se RLS não estiver ativo: SIM, qualquer `crm_admin` acessa todos os registros. Se RLS estiver ativo: NÃO, a política `company_id = current_crm_company_id()` restringe por empresa. Não foi possível verificar o estado do RLS no banco de destino. | — |

### Gravidade revisada: ALTO

A validação de `crm_admin` é consistente e abrangente em todas as camadas (páginas, Server Actions, API routes). No entanto, não há controle de acesso granular por empresa no código da aplicação: qualquer usuário com `crm_admin=true` tem acesso global a todos os módulos e, se o RLS não estiver ativo, a todos os registros. Não existem papéis intermediários (ex: "vendedor vê apenas seus próprios leads", "gerente vê apenas sua empresa").

### Correção necessária

- Verificar se o RLS está ativo no Supabase de produção (migration de isolamento aplicada).
- Implementar controle de acesso granular por empresa no código da aplicação (filtro explícito por `company_id` nas consultas) como defesa em profundidade, não dependendo exclusivamente do RLS.
- Considerar papéis de acesso (gerente, vendedor, apenas leitura) se o escopo de produtos o exigir.

### Bloqueia produção: SIM (sem controle granular e dependente de RLS não verificado)

---

## 6. Relatório Consolidado

| Achado | Classificação | Gravidade revisada | Bloqueia produção? |
|--------|--------------|-------------------|-------------------|
| A-001 — SCRIPT.txt | CONFIRMADO | CRÍTICO | SIM |
| A-002 — .env.local | CONFIRMADO | CRÍTICO | SIM |
| A-003 — proxy.ts | FALSO POSITIVO (com ressalva) | MÉDIO | NÃO |
| A-004 — Isolamento por empresa | NÃO VERIFICADO (banco) / CONFIRMADO (código) | ALTO | SIM (condicional) |
| A-005 — Permissões | CONFIRMADO | ALTO | SIM |

### Resumo objetivo

- **A-001 CONFIRMADO:** Credenciais reais em `SCRIPT.txt` sem proteção por `.gitignore`. Não está versionado (não há Git), mas permanece exposto no disco.
- **A-002 CONFIRMADO:** `.env.local` com segredos reais no disco. Ignorado pelo Git, variáveis com prefixo correto (`NEXT_PUBLIC_` para públicas, sem prefixo para servidor), `service_role` usada apenas no servidor (`server-only`).
- **A-003 FALSO POSITIVO:** `proxy.ts` existe na raiz, exporta função `proxy` com `config.matcher` adequado, protege todas as rotas exceto assets e `/p/[token]`. Defesa em profundidade existe em páginas/APIs/Server Actions. Ressalva: exportação nomeada `proxy` pode não ser reconhecida automaticamente pelo Next.js como middleware.
- **A-004 NÃO VERIFICADO (banco):** Migration de isolamento existe mas não está confirmada como aplicada. Código da aplicação não filtra por `company_id` (apenas usuarios e email pages). Risco concreto de acesso cruzado se RLS não estiver ativo.
- **A-005 CONFIRMADO:** Validação de `crm_admin` consistente em todas as camadas. Não há controle granular por empresa no código da aplicação.

### Quantidade de problemas

| Gravidade | Quantidade |
|-----------|------------|
| Crítico | 2 |
| Alto | 3 |
| Médio | 1 |

### Parefer sobre os achados críticos

Os achados A-001 e A-002 são confirmados e críticos (credenciais expostas em disco). O A-003 é reclassificado como falso positivo com ressalva técnica (proxy existe, mas nome de exportação pode não ser reconhecido pelo Next.js). Os A-004 e A-005 são confirmados como altos e dependem do estado do RLS no banco de produção, que não pôde ser verificado.

Nenhum arquivo foi modificado. Nenhuma migration executada. Nenhum build realizado.
