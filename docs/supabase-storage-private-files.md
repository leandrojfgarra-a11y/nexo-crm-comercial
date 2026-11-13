# Configuração manual do Storage privado do Nexo

Esta configuração é necessária antes de ativar upload/visualização. O app não cria bucket automaticamente.

## Ordem

1. Confirme que as migrations base do Nexo e `202610300002_customer_documents_contracts.sql` foram revisadas e aplicadas manualmente no projeto **NEXO-CRM-COMERCIAL**.
2. No Supabase Dashboard desse projeto, abra **Storage → New bucket** e crie:
   - Nome/ID: `nexo-crm-private`
   - Público: **desativado**
   - Limite por arquivo: `10 MB` (`10485760` bytes)
   - MIME types permitidos: `application/pdf`, `image/jpeg`, `image/png`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
3. Confira em `storage.objects` as quatro policies criadas pela migration: SELECT, INSERT, UPDATE e DELETE, todas limitadas ao bucket `nexo-crm-private` e à claim `app_metadata.crm_admin=true`.
4. Recarregue a aplicação e teste com um cliente de teste: enviar, visualizar, baixar, substituir após confirmação e excluir após confirmação. Teste também acesso sem sessão e com usuário sem a claim; ambos devem ser bloqueados.

O app salva objetos em pastas com UUID do cliente e nome de arquivo aleatório. Nome original, categoria, descrição, tamanho e responsável ficam nos metadados privados do banco. O acesso a arquivos passa por Route Handlers autenticados que consultam o vínculo do arquivo com o cliente; URLs públicas e URLs permanentes assinadas não são usadas.

Contratos não têm ação de exclusão/substituição no app. A migration não concede DELETE em `customer_contracts`; a remoção automática de contratos assinados não existe. O histórico de situação é gravado por trigger dentro da transação da alteração.

## Campos fiscais/contador

A ficha foi organizada nas abas pedidas. A aba Contador permanece informativa até definir campos de contador; inscrições Estadual/Municipal também não existem na migration inicial e seguem pendentes de migration específica.
