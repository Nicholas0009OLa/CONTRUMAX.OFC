const test = require('node:test');
const assert = require('node:assert/strict');
const {
    afirmarColunaCompativel,
    afirmarIndiceCompativel,
    afirmarChaveEstrangeiraCompativel,
    calcularProximoIdSeguro,
    validarEstadoSequencia,
    normalizarTipoColuna,
    extrairVersaoTidb,
    compararVersoes
} = require('./migrar-anuncios-servicos');

test('normaliza larguras de exibição de tipos inteiros sem ignorar UNSIGNED', () => {
    assert.equal(normalizarTipoColuna('INT(11)'), 'int');
    assert.equal(normalizarTipoColuna('int unsigned'), 'intunsigned');
});

test('identifica a versão TiDB 8.5.3 em retornos compatíveis e compara versões', () => {
    assert.deepEqual(extrairVersaoTidb('5.7.25-TiDB-v8.5.3'), {
        texto: '5.7.25-TiDB-v8.5.3', partes: [8, 5, 3]
    });
    assert.equal(compararVersoes([8, 5, 3], [8, 5, 0]) > 0, true);
    assert.equal(extrairVersaoTidb('MySQL 8.0'), null);
});

test('aceita apenas colunas com tipo e nulabilidade esperados', () => {
    afirmarColunaCompativel('solicitacoes', 'id_servico',
        { COLUMN_TYPE: 'int(11)', IS_NULLABLE: 'YES' },
        { tipo: 'INT', nulo: true });
    assert.throws(() => afirmarColunaCompativel('solicitacoes', 'id_servico',
        { COLUMN_TYPE: 'bigint', IS_NULLABLE: 'YES' },
        { tipo: 'INT', nulo: true }), /Estrutura incompatível/);
    assert.throws(() => afirmarColunaCompativel('solicitacoes', 'id_servico', null,
        { tipo: 'INT', nulo: true }), /ausente/);
    assert.throws(() => afirmarColunaCompativel('servicos', 'valor_negociavel',
        { COLUMN_TYPE: 'tinyint(1)', IS_NULLABLE: 'NO', COLUMN_DEFAULT: '1' },
        { tipo: 'tinyint(1)', nulo: false, padrao: '0' }), /Estrutura incompatível/);
});

test('aceita apenas índices com as colunas, ordem e unicidade esperadas', () => {
    afirmarIndiceCompativel('fotos_servicos', 'idx_fotos_servicos_servico',
        { colunas: 'id_servico', naoUnico: 1 },
        { colunas: ['id_servico'], naoUnico: 1 });
    assert.throws(() => afirmarIndiceCompativel('fotos_servicos', 'idx_fotos_servicos_servico',
        { colunas: 'id_foto,id_servico', naoUnico: 1 },
        { colunas: ['id_servico'], naoUnico: 1 }), /definição não corresponde/);
});

test('aceita somente a relação e regras exatas das chaves estrangeiras', () => {
    const esperada = {
        coluna: 'id_servico', tabelaPai: 'servicos', colunaPai: 'id_servico',
        aoExcluir: 'RESTRICT', aoAtualizar: 'RESTRICT'
    };
    afirmarChaveEstrangeiraCompativel('solicitacoes', 'fk_solicitacoes_servico', {
        COLUMN_NAMES: 'id_servico', REFERENCED_TABLE_NAME: 'servicos',
        REFERENCED_COLUMN_NAMES: 'id_servico', DELETE_RULE: 'RESTRICT', UPDATE_RULE: 'RESTRICT'
    }, esperada);
    assert.doesNotThrow(() => afirmarChaveEstrangeiraCompativel('solicitacoes', 'fk_solicitacoes_servico', {
        COLUMN_NAMES: 'id_servico', REFERENCED_TABLE_NAME: 'servicos',
        REFERENCED_COLUMN_NAMES: 'id_servico', DELETE_RULE: 'NO ACTION', UPDATE_RULE: 'NO ACTION'
    }, esperada));
    assert.throws(() => afirmarChaveEstrangeiraCompativel('servicos', 'fk_servicos_prestador', {
        CONSTRAINT_NAME: 'servicos_ibfk_1', TABLE_NAME: 'servicos', COLUMN_NAMES: 'id_prestador',
        REFERENCED_TABLE_NAME: 'usuarios', REFERENCED_COLUMN_NAMES: 'id_usuario',
        DELETE_RULE: 'CASCADE', UPDATE_RULE: 'NO ACTION'
    }, { coluna: 'id_prestador', tabelaPai: 'prestadores', colunaPai: 'id_prestador', aoExcluir: 'RESTRICT', aoAtualizar: 'RESTRICT' }),
    /servicos_ibfk_1.*origem=servicos\(id_prestador\).*referência=usuarios\(id_usuario\).*ON DELETE=CASCADE.*Esperada pelo código.*prestadores\(id_prestador\)/);
});

test('aceita CASCADE e NO ACTION somente na FK servicos para prestadores', () => {
    const esperada = {
        coluna: 'id_prestador', tabelaPai: 'prestadores', colunaPai: 'id_prestador',
        aoExcluir: 'RESTRICT', aoAtualizar: 'RESTRICT',
        regrasAceitas: [
            { aoExcluir: 'RESTRICT', aoAtualizar: 'RESTRICT' },
            { aoExcluir: 'CASCADE', aoAtualizar: 'RESTRICT' }
        ]
    };
    assert.doesNotThrow(() => afirmarChaveEstrangeiraCompativel('servicos', 'servicos_ibfk_1', {
        CONSTRAINT_NAME: 'servicos_ibfk_1', TABLE_NAME: 'servicos', COLUMN_NAMES: 'id_prestador',
        REFERENCED_TABLE_NAME: 'prestadores', REFERENCED_COLUMN_NAMES: 'id_prestador',
        DELETE_RULE: 'CASCADE', UPDATE_RULE: 'NO ACTION'
    }, esperada));
    assert.throws(() => afirmarChaveEstrangeiraCompativel('solicitacoes', 'fk_solicitacoes_servico', {
        COLUMN_NAMES: 'id_servico', REFERENCED_TABLE_NAME: 'servicos',
        REFERENCED_COLUMN_NAMES: 'id_servico', DELETE_RULE: 'CASCADE', UPDATE_RULE: 'NO ACTION'
    }, {
        coluna: 'id_servico', tabelaPai: 'servicos', colunaPai: 'id_servico',
        aoExcluir: 'RESTRICT', aoAtualizar: 'RESTRICT'
    }), /ON DELETE=RESTRICT; ON UPDATE=RESTRICT/);
    assert.throws(() => afirmarChaveEstrangeiraCompativel('servicos', 'servicos_ibfk_1', {
        COLUMN_NAMES: 'id_prestador', REFERENCED_TABLE_NAME: 'usuarios',
        REFERENCED_COLUMN_NAMES: 'id_usuario', DELETE_RULE: 'CASCADE', UPDATE_RULE: 'NO ACTION'
    }, esperada), /referência=usuarios\(id_usuario\)/);
});

test('calcula a sequência nova como maior ID existente mais um', () => {
    assert.equal(calcularProximoIdSeguro(0, 'servicos_id_seq', 'servicos', 'id_servico'), 1);
    assert.equal(calcularProximoIdSeguro(57, 'fotos_servicos_id_seq', 'fotos_servicos', 'id_foto'), 58);
    assert.throws(() => calcularProximoIdSeguro(2147483647, 'servicos_id_seq', 'servicos', 'id_servico'), /faixa de IDs INT assinados segura/);
});

test('aceita sequência vazia não inicializada apenas quando a tabela destino também está vazia', () => {
    for (const [tabelaSequencia, tabelaDados, colunaId] of [
        ['servicos_id_seq', 'servicos', 'id_servico'],
        ['fotos_servicos_id_seq', 'fotos_servicos', 'id_foto']
    ]) {
        const estado = validarEstadoSequencia({
            proximo: 0, totalSequencia: 0, maxSequencia: 0,
            totalDados: 0, maxDados: 0,
            tabelaSequencia, tabelaDados, colunaId
        });
        assert.equal(estado.vaziaNaoInicializada, true);
        assert.equal(estado.proximo, 0);
    }
    assert.throws(() => validarEstadoSequencia({
        proximo: 0, totalSequencia: 0, maxSequencia: 0,
        totalDados: 1, maxDados: 9,
        tabelaSequencia: 'fotos_servicos_id_seq', tabelaDados: 'fotos_servicos', colunaId: 'id_foto'
    }), /AUTO_INCREMENT=0/);
});

test('valida rigorosamente uma sequência preenchida', () => {
    const estado = validarEstadoSequencia({
        proximo: 8, totalSequencia: 4, maxSequencia: 7,
        totalDados: 0, maxDados: 0,
        tabelaSequencia: 'servicos_id_seq', tabelaDados: 'servicos', colunaId: 'id_servico'
    });
    assert.equal(estado.vaziaNaoInicializada, false);
    assert.equal(estado.maxSequencia, 7);
    assert.throws(() => validarEstadoSequencia({
        proximo: 7, totalSequencia: 4, maxSequencia: 7,
        totalDados: 0, maxDados: 0,
        tabelaSequencia: 'servicos_id_seq', tabelaDados: 'servicos', colunaId: 'id_servico'
    }), /MAX\(id\)=7/);
});

test('exige que o contador supere os IDs quando a tabela destino está preenchida', () => {
    const estado = validarEstadoSequencia({
        proximo: 13, totalSequencia: 0, maxSequencia: 0,
        totalDados: 12, maxDados: 12,
        tabelaSequencia: 'fotos_servicos_id_seq', tabelaDados: 'fotos_servicos', colunaId: 'id_foto'
    });
    assert.equal(estado.vaziaNaoInicializada, false);
    assert.throws(() => validarEstadoSequencia({
        proximo: 12, totalSequencia: 0, maxSequencia: 0,
        totalDados: 12, maxDados: 12,
        tabelaSequencia: 'fotos_servicos_id_seq', tabelaDados: 'fotos_servicos', colunaId: 'id_foto'
    }), /MAX\(id_foto\)=12/);
});

test('bloqueia contadores negativos, inválidos ou abaixo dos IDs da sequência', () => {
    assert.throws(() => validarEstadoSequencia({
        proximo: 0, totalSequencia: 1, maxSequencia: 1,
        totalDados: 0, maxDados: 0,
        tabelaSequencia: 'servicos_id_seq', tabelaDados: 'servicos', colunaId: 'id_servico'
    }), /MAX\(id\)=1/);
    assert.throws(() => validarEstadoSequencia({
        proximo: -1, totalSequencia: 0, maxSequencia: 0,
        totalDados: 0, maxDados: 0,
        tabelaSequencia: 'servicos_id_seq', tabelaDados: 'servicos', colunaId: 'id_servico'
    }), /Estado inválido/);
});
