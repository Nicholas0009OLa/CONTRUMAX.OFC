const db = require('./db');

async function executarMigracao() {
    try {
        const [[statusAtual]] = await db.promise().query(
            `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'solicitacoes' AND COLUMN_NAME = 'status'`
        );
        if (!statusAtual) throw new Error('Execute primeiro criar-tabelas-solicitacoes.js.');

        const enumStatus = String(statusAtual.COLUMN_TYPE || '');
        if (!enumStatus.includes('AGUARDANDO_CONFIRMACAO_CLIENTE')) {
            await db.promise().query(`
                ALTER TABLE solicitacoes MODIFY COLUMN status
                ENUM('AGUARDANDO_RESPOSTA', 'ACEITA', 'RECUSADA', 'EM_ANDAMENTO',
                     'AGUARDANDO_CONFIRMACAO_CLIENTE', 'CONCLUIDA', 'CANCELADA')
                NOT NULL DEFAULT 'AGUARDANDO_RESPOSTA'
            `);
        }

        const [colunas] = await db.promise().query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'solicitacoes'
               AND COLUMN_NAME IN (
                    'confirmada_cliente', 'data_confirmacao_cliente',
                    'cliente_visualizou_em', 'prestador_visualizou_em'
               )`
        );
        const existentes = new Set(colunas.map(coluna => coluna.COLUMN_NAME));
        if (!existentes.has('confirmada_cliente')) {
            await db.promise().query(
                'ALTER TABLE solicitacoes ADD COLUMN confirmada_cliente TINYINT(1) NOT NULL DEFAULT 0'
            );
        }
        if (!existentes.has('data_confirmacao_cliente')) {
            await db.promise().query(
                'ALTER TABLE solicitacoes ADD COLUMN data_confirmacao_cliente DATETIME NULL'
            );
        }
        if (!existentes.has('cliente_visualizou_em')) {
            await db.promise().query('ALTER TABLE solicitacoes ADD COLUMN cliente_visualizou_em DATETIME NULL');
        }
        if (!existentes.has('prestador_visualizou_em')) {
            await db.promise().query('ALTER TABLE solicitacoes ADD COLUMN prestador_visualizou_em DATETIME NULL');
        }

        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS avaliacoes_solicitacoes_id_seq (
                id INT NOT NULL AUTO_INCREMENT,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB
        `);
        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS avaliacoes_solicitacoes (
                id_avaliacao INT NOT NULL,
                id_solicitacao INT NOT NULL,
                id_cliente INT NOT NULL,
                id_prestador INT NOT NULL,
                id_equipamento INT NULL,
                alvo ENUM('PRESTADOR', 'EQUIPAMENTO') NOT NULL,
                nota TINYINT NULL,
                comentario TEXT NULL,
                data_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id_avaliacao),
                UNIQUE KEY uq_avaliacao_solicitacao_alvo (id_solicitacao, alvo),
                KEY idx_avaliacoes_solicitacoes_prestador (id_prestador, alvo, data_criacao),
                KEY idx_avaliacoes_solicitacoes_equipamento (id_equipamento, alvo, data_criacao),
                KEY idx_avaliacoes_solicitacoes_cliente (id_cliente, data_criacao)
            ) ENGINE=InnoDB
        `);

        const [[maiorAvaliacao]] = await db.promise().query(
            'SELECT COALESCE(MAX(id_avaliacao), 0) AS maior_id FROM avaliacoes_solicitacoes'
        );
        const [[maiorSequencia]] = await db.promise().query(
            'SELECT COALESCE(MAX(id), 0) AS maior_id FROM avaliacoes_solicitacoes_id_seq'
        );
        const proximoId = Math.max(Number(maiorAvaliacao.maior_id), Number(maiorSequencia.maior_id)) + 1;
        await db.promise().query(`ALTER TABLE avaliacoes_solicitacoes_id_seq AUTO_INCREMENT = ${proximoId}`);

        console.log('Confirmação do contratante e estrutura de avaliações preparadas. Nenhum pedido ou avaliação foi criado.');
    } catch (erro) {
        console.error('Não foi possível preparar confirmações e avaliações:', erro.message);
        process.exitCode = 1;
    } finally {
        await db.promise().end();
    }
}

executarMigracao();
