# Etapa 01 — Identificação segura da empresa

## Escopo concluído

Foi criada a camada de resolução de empresa em `lib/tenant/context.ts`. Ela usa o cliente Supabase de servidor já existente, valida a identidade com `auth.getUser()`, exige a claim administrativa `app_metadata.crm_admin === true`, procura o vínculo ativo do próprio usuário em `crm_company_members` e confirma que a empresa vinculada está ativa em `crm_companies`.

O identificador da empresa nunca vem de parâmetro, formulário ou estado do navegador. As consultas usam a sessão autenticada e continuam sujeitas às políticas RLS atuais. A camada não usa `service_role` nem outras credenciais administrativas. Erros são tipados (`TenantContextError`) e não repassam mensagens do banco.

## Arquivos criados

- `lib/tenant/context.ts` — tipos do contexto, erro tipado e função `requireTenantContext()`.
- `ETAPA_01_MULTIEMPRESA.md` — este relatório.

## Limites desta etapa

- Nenhum módulo comercial, rota, formulário, proxy ou fluxo existente foi alterado.
- Nenhum SQL, migration ou acesso remoto ao Supabase foi executado.
- A camada está preparada para uso por código de servidor nas próximas etapas; esta etapa não alterou as consultas existentes para aplicar isolamento.
- O proxy atual continua exigindo `crm_admin`. Portanto, esta etapa preserva a autenticação vigente e não habilita ainda logins comuns de outras empresas.
- A separação efetiva das consultas comerciais exige uma etapa posterior que aplique o contexto de empresa aos acessos de dados e seja validada com as políticas já existentes.

## Verificação de TypeScript

A primeira execução de `npx.cmd tsc --noEmit` identificou dois erros em `app/comissoes/page.tsx`:

1. `app/comissoes/page.tsx:91:89` — `TS2339: Property 'id' does not exist on type 'ParserError<"Unexpected input: " | "Unexpected input: ,monthly_installation_goal_count">'.`
2. `app/comissoes/page.tsx:95:44` — `TS2339: Property 'name' does not exist on type 'ParserError<"Unexpected input: " | "Unexpected input: ,monthly_installation_goal_count">'.`

A causa era a lista do `select()` formada por template string condicional. A correção mínima foi substituir essa expressão por duas seleções estáticas, escolhidas pela mesma verificação `installationGoalSchemaReady`. Ambas mantêm a ordenação e o limite existentes; os campos usados nos cálculos não mudaram.

Após a correção, foi executada uma única nova verificação `npx.cmd tsc --noEmit`, que passou sem erros.

## Estado

Etapa 01 encerrada dentro do escopo acima. Além da camada de identificação, somente a composição tipada do `select()` na página de Comissões foi ajustada; regras e cálculos de comissão foram preservados. Não houve alterações no banco, migrations, outros módulos comerciais, commit ou deploy. A Etapa 02 não foi iniciada.
