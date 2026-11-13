# Ativar o administrador do Nexo CRM

O CRM não permite que usuários promovam a própria conta. A autorização é validada no servidor a partir de `app_metadata.crm_admin === true`.

1. No painel do projeto **NEXO-CRM-COMERCIAL**, crie ou convide a conta do administrador em **Authentication → Users** e confirme o endereço conforme a política definida para o projeto.
2. Confirme o UUID da conta e atribua `app_metadata.crm_admin: true` por um contexto administrativo confiável, usando a API Admin (`supabase.auth.admin.updateUserById(userId, { app_metadata: { crm_admin: true } })`). Essa API exige uma chave secreta/serviço e só deve ser executada em ambiente de servidor ou estação administrativa controlada.
3. Nunca coloque a chave `service_role`/secret em `.env.local` compartilhado, em variável `NEXT_PUBLIC_*`, código do navegador, formulário ou repositório. O app Nexo usa somente URL do projeto e publishable key.
4. O usuário deve entrar novamente para receber a claim atualizada no fluxo de autenticação. Teste `/login`, acesso autorizado e uma conta sem a claim.

Não use `user_metadata` para essa permissão: o usuário pode editar esses metadados. A atribuição da claim é uma operação administrativa remota e não foi realizada nesta etapa.
