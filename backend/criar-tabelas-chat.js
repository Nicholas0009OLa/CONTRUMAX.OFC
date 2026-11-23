const db = require('./db');

const comandos = [
    `CREATE TABLE IF NOT EXISTS conversas_id_seq (
        id INT NOT NULL AUTO_INCREMENT,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS mensagens_id_seq (
        id INT NOT NULL AUTO_INCREMENT,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB`
];

async function executarMigracao() {
    try {
        for (const comando of comandos) {
            await db.promise().query(comando);
        }

        const [[{ maior_id_conversa }]] = await db.promise().query(
            'SELECT COALESCE(MAX(id_conversa), 0) AS maior_id_conversa FROM conversas'
        );
        const [[{ maior_id_mensagem }]] = await db.promise().query(
            'SELECT COALESCE(MAX(id_mensagem), 0) AS maior_id_mensagem FROM mensagens'
        );
        const [[{ maior_seq_conversa }]] = await db.promise().query(
            'SELECT COALESCE(MAX(id), 0) AS maior_seq_conversa FROM conversas_id_seq'
        );
        const [[{ maior_seq_mensagem }]] = await db.promise().query(
            'SELECT COALESCE(MAX(id), 0) AS maior_seq_mensagem FROM mensagens_id_seq'
        );

        const proximoIdConversa = Math.max(Number(maior_id_conversa), Number(maior_seq_conversa)) + 1;
        const proximoIdMensagem = Math.max(Number(maior_id_mensagem), Number(maior_seq_mensagem)) + 1;
        await db.promise().query(`ALTER TABLE conversas_id_seq AUTO_INCREMENT = ${proximoIdConversa}`);
        await db.promise().query(`ALTER TABLE mensagens_id_seq AUTO_INCREMENT = ${proximoIdMensagem}`);

        const [indicesConversa] = await db.promise().query('SHOW INDEX FROM conversas');
        if (!indicesConversa.some(indice => indice.Key_name === 'uq_conversas_cliente_prestador')) {
            await db.promise().query(
                'ALTER TABLE conversas ADD UNIQUE KEY uq_conversas_cliente_prestador (id_cliente, id_prestador)'
            );
        }

        console.log('Sequências e índice único do chat preparados.');
    } catch (erro) {
        console.error('Não foi possível preparar as tabelas do chat:', erro.message);
        process.exitCode = 1;
    } finally {
        await db.promise().end();
    }
}

executarMigracao();
