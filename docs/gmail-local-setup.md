# Configuração local da integração Gmail

Esta configuração conecta uma única caixa Gmail à empresa Nexo atualmente selecionada. O CRM não pede nem armazena a senha Google. Tokens OAuth são cifrados com AES-256-GCM antes de serem gravados na tabela `gmail_connections`.

## 1. Google Cloud

1. Crie ou selecione um projeto no Google Cloud Console.
2. Ative a **Gmail API**.
3. Configure a tela de consentimento OAuth. Durante o desenvolvimento, mantenha o app em teste e inclua o endereço Gmail que será conectado como usuário de teste.
4. Cadastre os escopos `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly` e `https://www.googleapis.com/auth/gmail.send`.
5. Crie uma credencial OAuth do tipo **Aplicativo da Web** e cadastre este URI de redirecionamento autorizado:

   `http://localhost:3000/api/gmail/callback`

6. Copie o Client ID e o Client Secret para o `.env.local` local, sem publicar esses valores.

## 2. Variáveis locais

No `.env.local`, defina `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` e `GMAIL_REDIRECT_URI=http://localhost:3000/api/gmail/callback`.

Gere uma chave própria de 32 bytes para cifrar os tokens:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Coloque o resultado em `GMAIL_TOKEN_ENCRYPTION_KEY`. Não altere essa chave depois de conectar o Gmail: sem a chave original, os tokens gravados não poderão ser decifrados. Use um gerenciador de segredos no ambiente hospedado.

## 3. Banco e conexão

1. Revise e execute manualmente no SQL Editor do projeto Nexo a migration `supabase/migrations/202611090001_gmail_connections.sql`.
2. Reinicie o servidor Next.js local.
3. Acesse `/email` e clique em **Conectar com Google**.
4. Escolha a conta e revise as permissões na tela do Google.

## 4. Escopos e produção

O escopo de leitura de mensagens `gmail.readonly` é restrito pelo Google. Em modo de teste, a tela pode mostrar o aviso de app não verificado e limitar quais contas de teste podem autorizar. Antes de disponibilizar a integração a outras contas em produção, verifique os requisitos vigentes de verificação OAuth e avaliação de segurança do Google para o uso dos escopos Gmail.

Não coloque Client Secret, refresh token nem a chave de cifragem em variáveis `NEXT_PUBLIC_*`, no repositório ou no navegador.
