# WhatsApp Web em uma única aba no Chrome

Esta extensão local permite manter o CRM em uma aba e reutilizar uma única aba `web.whatsapp.com` ao clicar em **Abrir WhatsApp Web**. Se ainda não houver uma aba do WhatsApp Web, ela abre a primeira.

## Instalação no Chrome

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione esta pasta: `D:\CRM-COMERCIAL\extensions\chrome-whatsapp-single-tab`.
5. Recarregue a página do CRM em `http://localhost:3000`.
6. Feche manualmente as abas duplicadas do WhatsApp que já estejam abertas, deixando no máximo uma.
7. Clique em **Abrir WhatsApp Web** em um lead. Os próximos cliques atualizam a mesma aba do WhatsApp.

## Limites

- Funciona no Chrome local quando o CRM está em `localhost:3000` ou `127.0.0.1:3000`.
- A extensão somente abre a conversa com número e texto pré-preenchido; não lê nem envia mensagens.
- Para outro endereço local ou para produção, as origens autorizadas precisarão ser adicionadas ao manifesto e ao service worker.
- A extensão não fecha abas antigas automaticamente; feche duplicadas uma vez após instalá-la.
