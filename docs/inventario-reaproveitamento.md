# Inventário dirigido — Gestão Fácil+

Inspecionados seletivamente `app/crm`, `app/contatos`, `app/orcamentos`, `app/servicos/catalogo`, `components/app-sidebar`, folhas globais e migrations locais de CRM, catálogo e propostas. Nenhum dado ou arquivo de ambiente foi copiado.

## Referências reaproveitáveis

- CRM (`app/crm`): indicadores, agrupamento por etapa, filtros, cartões Kanban por arrastar/soltar, atividades e eventos de oportunidade. Reaproveitar o comportamento e campos conceituais; refazer carregamento e persistência.
- Contatos (`app/contatos`): campos para PF/PJ, contatos/endereço, papéis e composição da ficha 360°. Reaproveitar seleção de campos e abas comerciais. Remover fornecedores, dados contábeis, anexos de cliente reais e todas as abas Financeiro/recorrências/serviços.
- Catálogo (`app/servicos/catalogo`): distinção produto/serviço, descrição, preço padrão e ativo. Remover vínculo obrigatório com quadros de execução, cobrança e recorrência.
- Propostas (`app/orcamentos`): itens, totais, status, impressão, links públicos e dashboard de status. Reimplementar versionamento append-only e aceite com confirmação interna; remover aprovação RPC antiga e integrações automáticas.
- Vendedores (`app/crm/vendedores`): campos de vendedor interno/externo e atribuição. Não importar comissão nem associação a usuários da empresa.
- Visual (`components/app-sidebar`, `app/globals.css`, `components/theme-toggle.tsx`): inspiração de navegação lateral, tema e cartões. Nova identidade Nexo, marinho/azul/ciano, Inter via fallback local do sistema, componentes próprios.

## Dependências observadas que não devem ser transportadas

- Supabase server client, Auth e RLS; login/callback/reset, `profiles`, `company_members` e papéis.
- Empresa ativa, `getActiveCompany`, `company_id`, `getCompanyAccess`, `can`, módulos/licença e administração SaaS.
- Integração de proposta aprovada com `services`, `transactions`, `financial_recurrences`, RPC transacional e dashboard financeiro.
- Permissões e regras para comissões; valores de instalação/MRR usados como projeção financeira.
- Integrações de certificado digital, documentos do cliente e chamadas externas de CNPJ/CEP.
- Sidebar original consulta notificações, branding empresarial, SaaS e ações de login.

## Compatibilidade local

Referência: Next.js `16.3.1`, React `19.2.8`, TypeScript 5 e Tailwind CSS 4 conforme `package.json` do app existente. Docs locais consultadas: estrutura de projeto, layout/páginas e CSS do App Router. Nenhum pacote foi instalado ou copiado nesta etapa. O diretório de dependências local será preparado na próxima tarefa se necessário.
