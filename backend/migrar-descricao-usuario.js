const db = require('./db');

async function executar() {
    try {
        const [colunas] = await db.promise().query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'descricao'`
        );
        if (!colunas.length) {
            await db.promise().query('ALTER TABLE usuarios ADD COLUMN descricao TEXT NULL');
        }
        console.log('Campo opcional de descrição do contratante verificado no TiDB.');
    } finally {
        await db.end();
    }
}

executar().catch(erro => {
    console.error('Falha ao preparar a descrição do usuário:', erro.message);
    process.exitCode = 1;
});
