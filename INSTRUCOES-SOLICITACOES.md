# Sistema de solicitações CONSTRUMAX

## Preparar o TiDB

O backend usa `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD` e `TIDB_DATABASE`. Configure essas variáveis em `backend/.env` no ambiente local e no Render. Não envie `.env` ao Git.

Execute as migrações uma vez, nesta ordem, antes de iniciar a nova versão do backend:

```powershell
cd backend
node criar-tabelas-solicitacoes.js
node migrar-confirmacao-e-avaliacoes.js
```

A primeira migração cria as tabelas de solicitações. A segunda adiciona a confirmação do contratante, os marcadores de leitura e as tabelas de avaliações. As migrações não criam solicitações nem avaliações de teste.

## Executar localmente

```powershell
cd backend
npm install
npm start
```

Sirva o `index.html` em `localhost` (por exemplo, com a extensão Live Server do VS Code) para o frontend usar `http://localhost:3000`.

## Publicar no Render

Configure o serviço Node com **Root Directory** `backend`, **Build Command** `npm install` e **Start Command** `npm start`. Cadastre as variáveis `TIDB_*` no Render e execute as duas migrações do TiDB antes de publicar o backend com as rotas de solicitações e avaliações.

## Conferir o fluxo

Use uma conta de contratante e outra de prestador. O contratante pode solicitar um orçamento no perfil de um profissional ou um aluguel em **Ver equipamento**. O prestador aceita ou recusa o pedido, atualiza o andamento e solicita confirmação de conclusão. O contratante confirma a conclusão e pode avaliar o prestador ou equipamento. Confira também os indicadores de mensagens e solicitações não lidas e o chat relacionado ao pedido.