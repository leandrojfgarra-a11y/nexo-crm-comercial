# Integração Casa dos Dados

## Configuração local

Defina `CASA_DOS_DADOS_API_KEY` no `.env.local`. A chave é lida exclusivamente por Route Handler do servidor e não deve receber o prefixo `NEXT_PUBLIC_`.

## Fluxo de pesquisa

1. Abra `/leads/importar/casa-dos-dados` com a sessão administrativa ativa.
2. Informe CNAEs de sete dígitos, período de abertura, situação e, se desejar, UF e município.
3. Aplique a migration `202611050001_lead_prospecting_saved_filters.sql` manualmente no Supabase Nexo para salvar filtros administrativos no CRM.
4. Salve a pesquisa no CRM. A opção de geração diária fica desligada até ser ativada explicitamente.
5. Solicite um CSV manual quando estiver pronto para consumir o saldo, ou habilite a geração diária e configure o cron da hospedagem.
6. Baixe o arquivo temporário e carregue-o em `/leads/importar` para aplicar as regras de seleção, verificar duplicidades e revisar antes de importar.

O link de download é temporário (a documentação da Casa dos Dados informa validade de uma hora). Se expirar, solicite outro arquivo. O Nexo não salva a chave, o CSV, nem os dados de empresas consultados nessa tela.

## Produção

Configure `CASA_DOS_DADOS_API_KEY` como variável privada no provedor de hospedagem. Nunca a adicione ao GitHub, ao `.env.example` com valor real, nem a uma variável `NEXT_PUBLIC_*`.

Para execução diária, configure também `SUPABASE_SERVICE_ROLE_KEY` e `PROSPECTING_CRON_SECRET` como variáveis privadas. A chave de service role é usada exclusivamente pelo endpoint de cron para ler pesquisas administrativas salvas e registrar o cursor de execução; as ações normais do CRM continuam usando sessão/RLS. Agende uma chamada diária com `Authorization: Bearer <PROSPECTING_CRON_SECRET>` para `/api/cron/casa-dos-dados`. O endpoint solicita um CSV para o dia anterior, avança pelo cursor `last_opened_through` e não executa mais de uma vez por pesquisa no mesmo dia.

O cron gera arquivos, mas não cria leads automaticamente. O administrador ainda baixa os CSVs pelo painel e revisa/importa na tela existente, o que bloqueia duplicidades e evita gravar empresas sem conferência.
