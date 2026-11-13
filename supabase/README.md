# Supabase — NEXO CRM Comercial

O projeto não foi conectado nem recebeu SQL nesta etapa. O schema está em `migrations/202610290001_initial_schema.sql` para revisão e implantação manual.

## Configuração local

1. Copie `.env.example` para `.env.local`.
2. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os dados do projeto **NEXO-CRM-COMERCIAL**. A chave publicável pode estar no bundle do navegador; não use `service_role`/secret key no frontend.
3. Instale os pacotes: `npm install @supabase/ssr @supabase/supabase-js`. O código já contém o cliente browser, cliente server e `proxy.ts` para renovar sessões de Auth no Next.js 16.

## Administrador e RLS

O RLS permite operações somente a usuários Auth com `app_metadata.crm_admin` definido como boolean `true`. Configure a claim apenas pelo Supabase Dashboard / Auth Admin API, após confirmar a conta administradora autorizada. Usuário comum não pode alterar `app_metadata`; não conceda essa capacidade via formulário público. Faça o controle de acesso também nas rotas/Server Actions antes de iniciar gravações.

## Implantação manual

1. Confirme no painel que está no projeto novo NEXO-CRM-COMERCIAL.
2. Revise o arquivo SQL, especialmente a claim de administrador, as etapas e restrições do negócio.
3. Cole o conteúdo no SQL Editor do projeto e execute manualmente, ou aplique com o fluxo de migrations aprovado pelo responsável.
4. Confirme tabelas, policies RLS e etapa `Proposta Enviada`; só então configure as variáveis de ambiente no ambiente da aplicação e habilite as Server Actions/formulários.

Este arquivo SQL é apenas um artefato local. Nenhum comando Supabase, migration ou SQL remoto foi executado.

## Dependência do alerta npm

A instalação solicitada foi bloqueada pelo ambiente ao tentar acessar `registry.npmjs.org` (EACCES). A auditoria offline disponível não contém alertas registrados e não identifica a dependência crítica. Reexecute `npm audit` com acesso ao registry, guarde o relatório completo e avalie a dependência afetada antes de qualquer atualização; `npm audit fix` não foi executado.
