# Nexo CRM Comercial

Base independente de CRM pessoal em Next.js 16 App Router. As telas desta etapa usam estados vazios e conteúdo estático; não há autenticação, persistência ou conexão externa.

## Iniciar

Dependências compatíveis declaradas em `package.json`; instalar conforme a disponibilidade local antes de executar `npm run dev`.

## Rotas iniciais

`/` Painel · `/clientes` · `/leads` · `/oportunidades` · `/funil` · `/propostas` · `/produtos` · `/vendedores`

## Segurança de escopo

Não contém `.env`, chaves, SDK Supabase, configuração Vercel, credenciais ou dados de clientes. Propostas nunca geram lançamentos financeiros ou recorrências.

Veja [inventário de reaproveitamento](docs/inventario-reaproveitamento.md) e [desenho do esquema](docs/esquema-inicial.md).
