# Supabase — Nexo CRM Comercial

Este diretório contém as migrations SQL versionadas do Nexo CRM. A existência de um arquivo aqui **não confirma** que ele foi executado em qualquer banco. Consulte o histórico de migrations no projeto Supabase correto antes de aplicar SQL.

## Configuração da aplicação

1. Copie `.env.example` para `.env.local` no ambiente local.
2. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os valores do projeto Supabase exclusivo do Nexo.
3. Mantenha `SUPABASE_SECRET_KEY` (ou a variável legada `SUPABASE_SERVICE_ROLE_KEY`, se ainda necessária) somente no servidor/secret manager. Nunca use chave secreta em componente client ou variável `NEXT_PUBLIC_*`.
4. Para implantação, configure as variáveis necessárias na Vercel, nos ambientes apropriados. Não versionar `.env.local`.

Os clientes Supabase para navegador e servidor usam as bibliotecas oficiais `@supabase/ssr` e `@supabase/supabase-js`, com renovação de sessão pelo proxy do Next.js. A autorização administrativa e o contexto empresarial estão descritos em [Guia do sistema](../docs/GUIA_DO_SISTEMA.md).

## Autenticação, autorização e isolamento

- A sessão é validada no servidor com Supabase Auth.
- O acesso administrativo interno depende da claim `app_metadata.crm_admin === true`, atribuída por procedimento administrativo seguro; formulários do CRM não podem concedê-la.
- As migrations incluem tabelas e políticas de empresas/membros. A camada multiempresa é incremental e **ainda requer revisão e validação integral de todas as consultas, ações, APIs, Storage e políticas RLS antes de isolar dados reais de outra empresa**.
- Não use a mesma base para empresas independentes até concluir essa validação. Não permita que o navegador escolha livremente o identificador da empresa para contornar a autorização.

## Aplicação de migrations

1. Confirme no Dashboard que está no projeto NEXO-CRM-COMERCIAL ou no ambiente de teste explicitamente escolhido.
2. Compare os arquivos `migrations/` com o histórico real do banco e identifique as migrations pendentes e dependências.
3. Revise cada SQL, prepare backup quando apropriado e aplique somente no ambiente autorizado.
4. Após execução, confira o resultado no banco e valide as telas dependentes.

O build não executa migrations. Não aplique todo o diretório por suposição e não execute SQL no Gestão Fácil+ ou em outro projeto Supabase.

## Documentação complementar

Consulte [`docs/GUIA_DO_SISTEMA.md`](../docs/GUIA_DO_SISTEMA.md) para mapa de módulos, integrações, variáveis de ambiente, procedimentos de implantação, limites conhecidos e checklist operacional.
