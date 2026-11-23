const db = require('./db');

async function adicionarColunaSeAusente(tabela, coluna, definicao) {
    const [linhas] = await db.promise().query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tabela, coluna]
    );
    if (!linhas.length) await db.promise().query(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${coluna}\` ${definicao}`);
}

async function executar() {
    try {
        const [contas] = await db.promise().query(
            'SELECT id_usuario, tipo_usuario FROM usuarios WHERE LOWER(email) = LOWER(?)',
            ['adminconstrumax@gmail.com']
        );
        if (contas.length !== 1) {
            throw new Error(`Esperava encontrar exatamente uma conta pelo e-mail indicado; encontrei ${contas.length}. Nenhuma promoção foi realizada.`);
        }
        if (!['CLIENTE', 'ADMIN'].includes(String(contas[0].tipo_usuario).toUpperCase())) {
            throw new Error('A conta encontrada não tem o tipo esperado CLIENTE/ADMIN. Nenhuma promoção foi realizada.');
        }

        await adicionarColunaSeAusente('usuarios', 'ativo', 'TINYINT(1) NOT NULL DEFAULT 1');
        await adicionarColunaSeAusente('prestadores', 'admin_ativo', 'TINYINT(1) NOT NULL DEFAULT 1');
        await adicionarColunaSeAusente('equipamentos', 'admin_visivel', 'TINYINT(1) NOT NULL DEFAULT 1');
        await adicionarColunaSeAusente('avaliacoes_solicitacoes', 'moderacao_status', "ENUM('VISIVEL','OCULTA') NOT NULL DEFAULT 'VISIVEL'");
        await adicionarColunaSeAusente('avaliacoes', 'moderacao_status', "ENUM('VISIVEL','OCULTA') NOT NULL DEFAULT 'VISIVEL'");

        // Atualiza apenas o campo autorizado para esta única conta.
        if (contas[0].tipo_usuario !== 'ADMIN') {
            await db.promise().query(
                "UPDATE usuarios SET tipo_usuario = 'ADMIN' WHERE id_usuario = ? AND LOWER(email) = LOWER(?)",
                [contas[0].id_usuario, 'adminconstrumax@gmail.com']
            );
        }

        const [confirmacao] = await db.promise().query(
            'SELECT tipo_usuario FROM usuarios WHERE id_usuario = ? AND LOWER(email) = LOWER(?)',
            [contas[0].id_usuario, 'adminconstrumax@gmail.com']
        );
        if (confirmacao.length !== 1 || confirmacao[0].tipo_usuario !== 'ADMIN') {
            throw new Error('A confirmação da promoção não retornou ADMIN.');
        }
        console.log('Migração concluída. Campos de moderação prontos; a única conta indicada está confirmada como ADMIN.');
    } finally {
        await db.end();
    }
}

executar().catch(erro => {
    console.error('Falha na migração do painel administrativo:', erro.message);
    process.exitCode = 1;
});
