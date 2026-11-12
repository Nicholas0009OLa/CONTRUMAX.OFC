const db = require('./db');

async function executarMigracao() {
    try {
        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS solicitacoes_id_seq (
                id INT NOT NULL AUTO_INCREMENT,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB
        `);

        await db.promise().query(`
            CREATE TABLE IF NOT EXISTS solicitacoes (
                id_solicitacao INT NOT NULL,
                chave_idempotencia CHAR(36) NOT NULL,
                id_cliente INT NOT NULL,
                id_prestador INT NOT NULL,
                id_equipamento INT NULL,
                id_conversa INT NULL,
                tipo ENUM('SERVICO', 'EQUIPAMENTO') NOT NULL,
                titulo VARCHAR(150) NOT NULL,
                descricao TEXT NOT NULL,
                local_atendimento VARCHAR(255) NOT NULL,
                data_inicio DATE NOT NULL,
                data_fim DATE NULL,
                quantidade INT NOT NULL DEFAULT 1,
                valor_diaria DECIMAL(10,2) NULL,
                observacoes TEXT NULL,
                status ENUM('AGUARDANDO_RESPOSTA', 'ACEITA', 'RECUSADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA') NOT NULL DEFAULT 'AGUARDANDO_RESPOSTA',
                data_criacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                data_atualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id_solicitacao),
                UNIQUE KEY uq_solicitacoes_idempotencia (id_cliente, chave_idempotencia),
                KEY idx_solicitacoes_cliente (id_cliente, data_criacao),
                KEY idx_solicitacoes_prestador (id_prestador, status, data_criacao),
                KEY idx_solicitacoes_equipamento_periodo (id_equipamento, status, data_inicio, data_fim)
            ) ENGINE=InnoDB
        `);

        const [[ids], [sequencias]] = await Promise.all([
            db.promise().query('SELECT COALESCE(MAX(id_solicitacao), 0) AS maior_id FROM solicitacoes'),
            db.promise().query('SELECT COALESCE(MAX(id), 0) AS maior_sequencia FROM solicitacoes_id_seq')
        ]);
        const proximoId = Math.max(Number(ids[0].maior_id), Number(sequencias[0].maior_sequencia)) + 1;
        await db.promise().query(`ALTER TABLE solicitacoes_id_seq AUTO_INCREMENT = ${proximoId}`);

        console.log('Estrutura de solicitações preparada. Nenhum pedido foi criado ou alterado.');
    } catch (erro) {
        console.error('Não foi possível preparar as solicitações:', erro.message);
        process.exitCode = 1;
    } finally {
        await db.promise().end();
    }
}

executarMigracao();
