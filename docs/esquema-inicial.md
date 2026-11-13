# Desenho inicial de dados — CRM Comercial

Documento conceitual. **Não contém script executável** e nenhuma conexão de banco foi configurada. O esquema será próprio, sem copiar o modelo multiempresa/licenciamento do Gestão Fácil+.

## Entidades propostas

- `people`: pessoa PF ou PJ, nome/razão social, nome fantasia, documento opcional, contatos e endereço; `kind` restringido a `individual` ou `company`.
- `leads`: pessoa/organização em prospecção, origem, status, responsável e datas de conversão; leads podem ser associados a uma pessoa existente.
- `customers`: relacionamento comercial ativo com pessoa, data de entrada e observações. Uma pessoa pode ser cliente e lead em períodos distintos.
- `sellers`: vendedores independentes, dados de contato e ativo/inativo. Regras de comissão ficam para etapa posterior.
- `products`: catálogo de itens `product` ou `service`, descrição, preço de referência e ativo/inativo. Sem flags de cobrança recorrente ou geração de serviço/financeiro.
- `pipelines` e `pipeline_stages`: funis e suas etapas ordenadas. O funil inicial inclui explicitamente `Proposta Enviada`.
- `opportunities`: lead ou cliente relacionado, vendedor, pipeline/etapa, título, valor estimado, fechamento previsto e estado comercial.
- `activities`: chamadas, mensagens, reuniões, tarefas e notas ligadas à oportunidade ou pessoa; vencimento e conclusão.
- `opportunity_events`: histórico imutável de mudança de etapa, atribuição, valor e observações.
- `proposals`: cabeçalho comercial, cliente, oportunidade opcional, número, validade e status. Não tem relacionamento com contas a receber, transações ou recorrências.
- `proposal_versions`: snapshot numerado e imutável de conteúdo, itens, preços e condições de cada revisão.
- `proposal_links`: token com hash, validade e revogação para compartilhamento público controlado.
- `proposal_acceptances`: registro de aceite declarado pelo cliente, horário e evidência/metadados; estado separado `pending_internal_confirmation` / `confirmed` / `rejected` para exigir confirmação interna.
- `proposal_items`: snapshot dos itens e preços vinculados à versão, sem dependência do catálogo após envio.

## Regras estruturais

- IDs UUID, `created_at`/`updated_at`, chaves estrangeiras explícitas e índices por status, etapa, pessoa e datas.
- Documento fiscal opcional e normalizado; unicidade por documento só após definir tratamento de duplicados e dados ausentes.
- Alterações em proposta enviada criam nova versão; versões enviadas não são sobrescritas.
- Eventos/histórico preservados ao encerrar oportunidade ou desativar cadastro.
- Escopo de usuário pessoal (um proprietário local) será definido na etapa de banco; sem `company_id`, licenciamento SaaS, módulos comerciais ou permissões multiempresa do projeto de origem.
- Nenhuma proposta aceita cria lançamento financeiro, serviço contratado ou recorrência.
- Certificados digitais e regras de comissão ficam fora do primeiro esquema.

## Decisões pendentes para implementação

Escolher autenticação local, estratégia de backup e política de exclusão; decidir como converter um lead em cliente preservando histórico; definir campos brasileiros de PF/PJ e o processo de confirmação interna de aceite.
