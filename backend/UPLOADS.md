# Armazenamento de imagens

O backend usa `backend/uploads` por padrao. Para persistir os uploads no Render:

1. Anexe um Persistent Disk ao servico, por exemplo com ponto de montagem `/var/data`.
2. Copie as imagens que ja existem para `/var/data/uploads` antes de trocar o caminho da aplicacao.
3. Configure a variavel de ambiente `UPLOADS_DIR=/var/data/uploads` no servico.

Sem um disco persistente, novos arquivos enviados podem desaparecer em reinicios ou implantacoes. A configuracao do disco e da variavel precisa ser feita no painel do Render.
