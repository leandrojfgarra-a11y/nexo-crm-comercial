# Nexo CRM Comercial

CRM comercial construído com Next.js 16, React 19 e Supabase. O projeto contém cadastro de clientes e leads, funil de oportunidades, propostas versionadas, contratos, atendimento por WhatsApp Web, integração Gmail e ferramentas administrativas.

## Documentação

- [Guia detalhado do sistema](docs/GUIA_DO_SISTEMA.md): módulos, fluxos, integrações, segurança, banco, implantação e pendências.
- [Configuração Supabase](supabase/README.md)
- [Configuração Gmail](docs/gmail-local-setup.md)
- [Casa dos Dados e prospecção](docs/casa-dos-dados.md)
- [Armazenamento privado de documentos](docs/supabase-storage-private-files.md)
- [Ativação do administrador](docs/supabase-admin-activation.md)
- [Esquema inicial](docs/esquema-inicial.md)
- [Inventário de reaproveitamento](docs/inventario-reaproveitamento.md)

## Executar localmente

Requisitos: Node.js compatível com Next.js 16 e npm. Na pasta do projeto:

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Preencha `.env.local` com os valores do projeto Supabase Nexo e demais integrações que for utilizar. Nunca publique esse arquivo. O acesso exige uma conta Supabase Auth autorizada e a claim administrativa descrita no guia.

Endereços locais padrão: `http://localhost:3000` e `http://localhost:3000/login`.

## Comandos

- `npm run dev`: servidor local de desenvolvimento.
- `npm run build`: compilação de produção.
- `npm start`: serve a compilação já gerada.
- `npm run lint`: ESLint.

## Segurança

As chaves de servidor e credenciais de integrações devem ficar exclusivamente em variáveis de ambiente server-side. As migrations são arquivos SQL versionados; sua presença no repositório não significa que devam ser executadas automaticamente. Consulte o guia e confira o histórico real do Supabase antes de aplicar qualquer SQL.

Não use este projeto para outra empresa até concluir a validação de isolamento descrita no guia. A base atual também funciona como ambiente de testes.
