// Migração estrutural de anúncios de serviços; --plan consulta e descreve mudanças sem aplicá-las.
let db;

const COLUNAS_NECESSARIAS = [
    ['servicos', 'cidade', { tipo: 'varchar(100)', nulo: true }],
    ['servicos', 'estado', { tipo: 'varchar(50)', nulo: true }],
    ['servicos', 'valor_negociavel', { tipo: 'tinyint(1)', nulo: false, padrao: '0' }],
    ['servicos', 'especialidades', { tipo: 'text', nulo: true }],
    ['equipamentos', 'cidade', { tipo: 'varchar(100)', nulo: true }],
    ['equipamentos', 'estado', { tipo: 'varchar(50)', nulo: true }],
    ['solicitacoes', 'id_servico', { tipo: 'int', nulo: true }],
    ['avaliacoes_solicitacoes', 'id_servico', { tipo: 'int', nulo: true }]
];

const COLUNAS_ORIGEM_E_BASE = [
    ['prestadores', 'id_prestador'],
    ['prestadores', 'profissao'],
    ['prestadores', 'descricao'],
    ['prestadores', 'valor_diaria'],
    ['prestadores', 'cidade'],
    ['prestadores', 'estado'],
    ['prestador_especialidade', 'id_prestador'],
    ['prestador_especialidade', 'id_especialidade'],
    ['especialidades', 'id_especialidade'],
    ['especialidades', 'nome'],
    ['fotos_prestadores', 'id_foto'],
    ['fotos_prestadores', 'id_prestador'],
    ['fotos_prestadores', 'url_foto'],
    ['servicos', 'id_servico'],
    ['servicos', 'id_prestador'],
    ['servicos', 'nome_servico'],
    ['servicos', 'descricao'],
    ['servicos', 'valor_diaria'],
    ['servicos', 'disponivel']
];

function normalizarTipoColuna(tipo) {
    return String(tipo || '').toLowerCase().replace(/\s+/g, '').replace(/\b(int|bigint|smallint|mediumint)\(\d+\)/, '$1');
}

function extrairVersaoTidb(valor) {
    const texto = String(valor || '');
    const encontrada = texto.match(/TiDB[- ]v?(\d+\.\d+\.\d+)/i) || texto.match(/^\s*(\d+\.\d+\.\d+)/);
    if (!encontrada) return null;
    const partes = encontrada[1].split('.').map(Number);
    return { texto, partes };
}

function compararVersoes(a, b) {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

async function validarVersaoTidb(conexao) {
    const [[linha]] = await conexao.query('SELECT VERSION() AS versao');
    const versao = extrairVersaoTidb(linha?.versao);
    if (!versao || compararVersoes(versao.partes, [8, 5, 0]) < 0) {
        throw new Error(`Versão do TiDB não confirmada como 8.5.0 ou superior (retorno: ${linha?.versao || 'indisponível'}).`);
    }
    const [[checks]] = await conexao.query('SELECT @@SESSION.foreign_key_checks AS habilitado');
    if (Number(checks?.habilitado) !== 1) throw new Error('foreign_key_checks está desabilitado nesta conexão.');
    return versao;
}

function afirmarColunaCompativel(tabela, coluna, atual, esperado) {
    if (!atual) throw new Error(`Coluna obrigatória ausente: ${tabela}.${coluna}.`);
    const tipoAtual = normalizarTipoColuna(atual.COLUMN_TYPE);
    const tipoEsperado = normalizarTipoColuna(esperado.tipo);
    const padraoCompativel = esperado.padrao === undefined || String(atual.COLUMN_DEFAULT) === esperado.padrao;
    if (tipoAtual !== tipoEsperado || (atual.IS_NULLABLE === 'YES') !== esperado.nulo || !padraoCompativel) {
        throw new Error(`Estrutura incompatível em ${tabela}.${coluna}: esperado ${esperado.tipo} ${esperado.nulo ? 'NULL' : 'NOT NULL'}, encontrado ${atual.COLUMN_TYPE} ${atual.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}.`);
    }
}

function afirmarIndiceCompativel(tabela, indice, atual, esperado) {
    if (!atual) throw new Error(`Índice obrigatório ausente: ${tabela}.${indice}.`);
    const colunasAtuais = String(atual.colunas || '').split(',').filter(Boolean);
    const colunasEsperadas = esperado.colunas;
    if (Number(atual.naoUnico) !== Number(esperado.naoUnico) ||
        colunasAtuais.length !== colunasEsperadas.length ||
        colunasAtuais.some((coluna, i) => coluna !== colunasEsperadas[i])) {
        throw new Error(`Índice ${tabela}.${indice} existe, mas sua definição não corresponde a (${colunasEsperadas.join(', ')}).`);
    }
}

function normalizarRegraChaveEstrangeira(regra) {
    const valor = String(regra || '').trim().replace(/\s+/g, ' ').toUpperCase();
    return valor === 'NO ACTION' ? 'RESTRICT' : valor;
}

function formatarDetalhesChaveEstrangeira(atual) {
    if (!atual) return 'constraint não encontrada';
    return [
        `constraint=${atual.CONSTRAINT_NAME || '(sem nome)'}`,
        `origem=${atual.TABLE_NAME || '?'}(${atual.COLUMN_NAMES || '?'})`,
        `referência=${atual.REFERENCED_TABLE_NAME || '?'}(${atual.REFERENCED_COLUMN_NAMES || '?'})`,
        `ON DELETE=${atual.DELETE_RULE || '?'}`,
        `ON UPDATE=${atual.UPDATE_RULE || '?'}`
    ].join('; ');
}

function afirmarChaveEstrangeiraCompativel(tabela, chave, atual, esperado) {
    if (!atual) throw new Error(`Chave estrangeira obrigatória ausente: ${tabela}.${chave}.`);
    const regrasPermitidas = esperado.regrasAceitas || [{
        aoExcluir: esperado.aoExcluir,
        aoAtualizar: esperado.aoAtualizar
    }];
    const regraExcluir = normalizarRegraChaveEstrangeira(atual.DELETE_RULE);
    const regraAtualizar = normalizarRegraChaveEstrangeira(atual.UPDATE_RULE);
    const regrasCompativeis = regrasPermitidas.some(regra =>
        regraExcluir === normalizarRegraChaveEstrangeira(regra.aoExcluir) &&
        regraAtualizar === normalizarRegraChaveEstrangeira(regra.aoAtualizar));
    const compativel = atual.COLUMN_NAMES === esperado.coluna &&
        atual.REFERENCED_TABLE_NAME === esperado.tabelaPai &&
        atual.REFERENCED_COLUMN_NAMES === esperado.colunaPai &&
        regrasCompativeis;
    if (!compativel) {
        const regrasEsperadas = regrasPermitidas.map(regra =>
            `ON DELETE=${regra.aoExcluir}; ON UPDATE=${regra.aoAtualizar}`).join(' ou ');
        throw new Error(`Chave estrangeira incompatível em ${tabela}. Encontrada no TiDB: ${formatarDetalhesChaveEstrangeira(atual)}. ` +
            `Esperada pelo código: constraint=${chave}; origem=${tabela}(${esperado.coluna}); ` +
            `referência=${esperado.tabelaPai}(${esperado.colunaPai}); ` +
            `${regrasEsperadas}.`);
    }
}

function regrasEsperadasParaChave(tabela, chave, coluna, tabelaPai, colunaPai) {
    const esperado = {
        coluna, tabelaPai, colunaPai,
        aoExcluir: 'RESTRICT',
        aoAtualizar: 'RESTRICT'
    };
    if (tabela === 'servicos' && chave === 'fk_servicos_prestador') {
        // Preserva a regra já existente nessa relação; uma FK ausente ainda é criada com RESTRICT.
        esperado.regrasAceitas = [
            { aoExcluir: 'RESTRICT', aoAtualizar: 'RESTRICT' },
            { aoExcluir: 'CASCADE', aoAtualizar: 'RESTRICT' }
        ];
    }
    return esperado;
}

async function obterColuna(conexao, tabela, coluna) {
    const [linhas] = await conexao.query(
        `SELECT COLUMN_TYPE, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
                CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [tabela, coluna]
    );
    return linhas[0] || null;
}

async function garantirColuna(conexao, tabela, coluna, definicao, esperado) {
    let atual = await obterColuna(conexao, tabela, coluna);
    if (!atual) {
        await conexao.query(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${coluna}\` ${definicao}`);
        atual = await obterColuna(conexao, tabela, coluna);
    }
    afirmarColunaCompativel(tabela, coluna, atual, esperado);
}

async function validarColunasBase(conexao) {
    const tabelas = [...new Set(COLUNAS_ORIGEM_E_BASE.map(([tabela]) => tabela))];
    for (const tabela of tabelas) {
        if (!await tabelaExiste(conexao, tabela)) throw new Error(`Tabela necessária ausente: ${tabela}.`);
    }
    for (const [tabela, coluna] of COLUNAS_ORIGEM_E_BASE) {
        if (!await obterColuna(conexao, tabela, coluna)) throw new Error(`Coluna necessária ausente: ${tabela}.${coluna}.`);
    }

    const [precoPrestador, precoServico] = await Promise.all([
        obterColuna(conexao, 'prestadores', 'valor_diaria'),
        obterColuna(conexao, 'servicos', 'valor_diaria')
    ]);
    if (normalizarTipoColuna(precoPrestador.COLUMN_TYPE) !== normalizarTipoColuna(precoServico.COLUMN_TYPE) || precoServico.IS_NULLABLE !== 'YES') {
        throw new Error(`prestadores.valor_diaria (${precoPrestador.COLUMN_TYPE}) e servicos.valor_diaria (${precoServico.COLUMN_TYPE}) precisam ser compatíveis e permitir NULL para “A combinar”.`);
    }

    const nomeServico = await obterColuna(conexao, 'servicos', 'nome_servico');
    if (String(nomeServico.DATA_TYPE).toLowerCase() !== 'varchar' || Number(nomeServico.CHARACTER_MAXIMUM_LENGTH) < 100) {
        throw new Error('servicos.nome_servico precisa ser VARCHAR com capacidade mínima de 100 caracteres.');
    }
    const descricaoServico = await obterColuna(conexao, 'servicos', 'descricao');
    if (!['varchar', 'text', 'mediumtext', 'longtext'].includes(String(descricaoServico.DATA_TYPE).toLowerCase()) ||
        Number(descricaoServico.CHARACTER_MAXIMUM_LENGTH) < 4000) {
        throw new Error('servicos.descricao precisa armazenar pelo menos 4.000 caracteres para preservar descrições atuais.');
    }

    const tabelasInnoDB = ['servicos', 'equipamentos', 'solicitacoes', 'avaliacoes_solicitacoes'];
    for (const tabela of tabelasInnoDB) {
        const metadados = await tabelaExiste(conexao, tabela);
        if (!metadados || String(metadados.ENGINE).toLowerCase() !== 'innodb') {
            throw new Error(`A tabela ${tabela} precisa existir e usar InnoDB.`);
        }
    }
}

async function validarDadosDeOrigem(conexao) {
    const [limites] = await conexao.query(
        `SELECT MAX(CHAR_LENGTH(p.profissao)) AS profissao,
                MAX(CHAR_LENGTH(p.descricao)) AS descricao,
                MAX(CHAR_LENGTH(p.cidade)) AS cidade,
                MAX(CHAR_LENGTH(p.estado)) AS estado,
                MAX(CHAR_LENGTH(f.url_foto)) AS foto
         FROM prestadores p
         LEFT JOIN fotos_prestadores f ON f.id_prestador = p.id_prestador
         WHERE NOT EXISTS (SELECT 1 FROM servicos s WHERE s.id_prestador = p.id_prestador)`
    );
    const atual = limites[0] || {};
    const campos = [
        ['profissão', 100], ['descrição', 4000], ['cidade', 100], ['estado', 50], ['referência de foto', 255]
    ];
    for (const [campo, limite] of campos) {
        if (Number(atual[campo === 'profissão' ? 'profissao' : campo === 'descrição' ? 'descricao' : campo === 'referência de foto' ? 'foto' : campo] || 0) > limite) {
            throw new Error(`Há dados de ${campo} acima do limite suportado pelo esquema de destino (${limite}); a migração foi interrompida para evitar truncamento.`);
        }
    }
    const [orphans] = await conexao.query(
        `SELECT COUNT(*) AS total FROM servicos s
         LEFT JOIN prestadores p ON p.id_prestador = s.id_prestador
         WHERE p.id_prestador IS NULL`
    );
    if (Number(orphans[0]?.total) > 0) {
        throw new Error(`Existem ${orphans[0].total} serviços sem prestador correspondente; a migração foi interrompida para preservar os registros.`);
    }

    const [especialidades] = await conexao.query(
        `SELECT p.id_prestador, e.nome
         FROM prestadores p
         INNER JOIN prestador_especialidade pe ON pe.id_prestador = p.id_prestador
         INNER JOIN especialidades e ON e.id_especialidade = pe.id_especialidade
         WHERE NOT EXISTS (SELECT 1 FROM servicos s WHERE s.id_prestador = p.id_prestador)
         ORDER BY p.id_prestador, e.nome`
    );
    const especialidadesPorPrestador = new Map();
    for (const item of especialidades) {
        const id = Number(item.id_prestador);
        if (!especialidadesPorPrestador.has(id)) especialidadesPorPrestador.set(id, []);
        especialidadesPorPrestador.get(id).push(item.nome);
    }
    for (const [id, nomes] of especialidadesPorPrestador) {
        if (Buffer.byteLength(JSON.stringify([...new Set(nomes)]), 'utf8') > 65535) {
            throw new Error(`As especialidades do prestador ID ${id} excedem a capacidade de TEXT e não podem ser migradas sem truncamento.`);
        }
    }

    const relacoesExistentes = [
        ['fotos_servicos', 'id_servico', 'id_servico', 'servicos'],
        ['solicitacoes', 'id_servico', 'id_servico', 'servicos'],
        ['avaliacoes_solicitacoes', 'id_servico', 'id_servico', 'servicos']
    ];
    for (const [filha, colunaFilha, colunaPai, pai] of relacoesExistentes) {
        if (!await tabelaExiste(conexao, filha) || !await obterColuna(conexao, filha, colunaFilha)) continue;
        const [invalidos] = await conexao.query(
            `SELECT COUNT(*) AS total FROM \`${filha}\` f
             LEFT JOIN \`${pai}\` p ON p.\`${colunaPai}\` = f.\`${colunaFilha}\`
             WHERE f.\`${colunaFilha}\` IS NOT NULL AND p.\`${colunaPai}\` IS NULL`
        );
        if (Number(invalidos[0]?.total) > 0) {
            throw new Error(`A tabela ${filha} tem ${invalidos[0].total} referências sem serviço correspondente; a FK não será criada sobre dados inconsistentes.`);
        }
    }

    if (await tabelaExiste(conexao, 'fotos_servicos') && await obterColuna(conexao, 'fotos_servicos', 'id_foto') &&
        !(await obterIndice(conexao, 'fotos_servicos', 'PRIMARY'))) {
        const [duplicados] = await conexao.query(
            `SELECT COUNT(*) AS total FROM (
                 SELECT id_foto FROM fotos_servicos GROUP BY id_foto HAVING COUNT(*) > 1
             ) d`
        );
        if (Number(duplicados[0]?.total) > 0) throw new Error('fotos_servicos contém IDs de foto duplicados; a chave primária não pode ser criada com segurança.');
    }
}

async function obterIndice(conexao, tabela, indice) {
    const [linhas] = await conexao.query(
        `SELECT INDEX_NAME, NON_UNIQUE AS naoUnico,
                GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS colunas
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
         GROUP BY INDEX_NAME, NON_UNIQUE`,
        [tabela, indice]
    );
    return linhas[0] || null;
}

async function obterIndices(conexao, tabela) {
    const [linhas] = await conexao.query(
        `SELECT INDEX_NAME, NON_UNIQUE AS naoUnico,
                GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS colunas
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         GROUP BY INDEX_NAME, NON_UNIQUE`,
        [tabela]
    );
    return linhas;
}

async function garantirIndice(conexao, tabela, indice, definicao, esperado) {
    let atual = await obterIndice(conexao, tabela, indice);
    if (!atual) {
        const alternativo = (await obterIndices(conexao, tabela)).find(item =>
            Number(item.naoUnico) === Number(esperado.naoUnico) && item.colunas === esperado.colunas.join(','));
        if (alternativo) return;
        if (indice === 'PRIMARY') await conexao.query(`ALTER TABLE \`${tabela}\` ADD PRIMARY KEY ${definicao}`);
        else await conexao.query(`ALTER TABLE \`${tabela}\` ADD INDEX \`${indice}\` ${definicao}`);
        atual = await obterIndice(conexao, tabela, indice);
    }
    afirmarIndiceCompativel(tabela, indice, atual, esperado);
}

async function obterChaveEstrangeira(conexao, tabela, chave) {
    const [linhas] = await conexao.query(
        `SELECT kcu.CONSTRAINT_NAME, MAX(kcu.TABLE_NAME) AS TABLE_NAME,
                GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR ',') AS COLUMN_NAMES,
                MAX(kcu.REFERENCED_TABLE_NAME) AS REFERENCED_TABLE_NAME,
                GROUP_CONCAT(kcu.REFERENCED_COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION SEPARATOR ',') AS REFERENCED_COLUMN_NAMES,
                MAX(rc.DELETE_RULE) AS DELETE_RULE, MAX(rc.UPDATE_RULE) AS UPDATE_RULE
         FROM information_schema.KEY_COLUMN_USAGE kcu
         INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
          AND rc.TABLE_NAME = kcu.TABLE_NAME
          AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         WHERE kcu.CONSTRAINT_SCHEMA = DATABASE() AND kcu.TABLE_NAME = ?
           AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
         GROUP BY kcu.CONSTRAINT_NAME`,
        [tabela]
    );
    return linhas;
}

async function verificarTiposRelacionados(conexao, tabela, coluna, tabelaPai, colunaPai) {
    const [colunaFilha, colunaPaiMeta] = await Promise.all([
        obterColuna(conexao, tabela, coluna),
        obterColuna(conexao, tabelaPai, colunaPai)
    ]);
    if (!colunaFilha || !colunaPaiMeta) throw new Error(`Não foi possível verificar os tipos de ${tabela}.${coluna} e ${tabelaPai}.${colunaPai}.`);
    if (normalizarTipoColuna(colunaFilha.COLUMN_TYPE) !== normalizarTipoColuna(colunaPaiMeta.COLUMN_TYPE)) {
        throw new Error(`Tipos incompatíveis para a relação ${tabela}.${coluna} → ${tabelaPai}.${colunaPai}: ${colunaFilha.COLUMN_TYPE} versus ${colunaPaiMeta.COLUMN_TYPE}.`);
    }
}

async function garantirChaveEstrangeira(conexao, tabela, chave, definicao, esperado) {
    await verificarTiposRelacionados(conexao, tabela, esperado.coluna, esperado.tabelaPai, esperado.colunaPai);
    const [indicesPais] = await conexao.query(
        `SELECT COUNT(*) AS total FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
           AND SEQ_IN_INDEX = 1 AND NON_UNIQUE = 0`,
        [esperado.tabelaPai, esperado.colunaPai]
    );
    if (Number(indicesPais[0]?.total) === 0) {
        throw new Error(`A coluna referenciada ${esperado.tabelaPai}.${esperado.colunaPai} não tem índice compatível.`);
    }
    const existentes = await obterChaveEstrangeira(conexao, tabela, chave);
    let atual = existentes.find(item => item.CONSTRAINT_NAME === chave);
    if (!atual) atual = existentes.find(item => String(item.COLUMN_NAMES || '').split(',').includes(esperado.coluna));
    if (atual) afirmarChaveEstrangeiraCompativel(tabela, atual.CONSTRAINT_NAME, atual, esperado);
    if (!atual) {
        await conexao.query(`ALTER TABLE \`${tabela}\` ADD CONSTRAINT \`${chave}\` ${definicao}`);
        const adicionadas = await obterChaveEstrangeira(conexao, tabela, chave);
        atual = adicionadas.find(item => item.CONSTRAINT_NAME === chave);
        afirmarChaveEstrangeiraCompativel(tabela, chave, atual, esperado);
    }
}

async function tabelaExiste(conexao, tabela) {
    const [linhas] = await conexao.query(
        'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [tabela]
    );
    return linhas[0] || null;
}

async function maiorId(conexao, tabela, coluna) {
    const [[linha]] = await conexao.query(`SELECT COALESCE(MAX(\`${coluna}\`), 0) AS maior FROM \`${tabela}\``);
    return Number(linha?.maior || 0);
}

async function obterEstadoIds(conexao, tabela, coluna) {
    const [[linha]] = await conexao.query(
        `SELECT COUNT(*) AS total, COALESCE(MAX(\`${coluna}\`), 0) AS maior FROM \`${tabela}\``
    );
    return { total: Number(linha?.total || 0), maior: Number(linha?.maior || 0) };
}

function calcularProximoIdSeguro(maximoAtual, tabelaSequencia, tabelaDados, colunaId) {
    if (!Number.isSafeInteger(maximoAtual) || maximoAtual < 0 || maximoAtual >= 2147483647) {
        throw new Error(`Não há faixa de IDs INT assinados segura para inicializar ${tabelaSequencia} acima de ${tabelaDados}.${colunaId}.`);
    }
    return maximoAtual + 1;
}

function validarEstadoSequencia({ proximo, totalSequencia, maxSequencia, totalDados, maxDados, tabelaSequencia, tabelaDados, colunaId }) {
    const valores = [proximo, totalSequencia, maxSequencia, totalDados, maxDados];
    if (valores.some(valor => !Number.isSafeInteger(valor) || valor < 0)) {
        throw new Error(`Estado inválido ao validar a sequência ${tabelaSequencia} e os IDs de ${tabelaDados}.${colunaId}.`);
    }

    const vaziaNaoInicializada = proximo === 0 && totalSequencia === 0 && maxSequencia === 0 && totalDados === 0 && maxDados === 0;
    if (vaziaNaoInicializada) {
        return { proximo, maxDados, maxSequencia, vaziaNaoInicializada: true };
    }

    if (proximo === 0 || proximo <= maxDados || proximo <= maxSequencia) {
        throw new Error(`A sequência ${tabelaSequencia} não está comprovadamente acima dos IDs existentes: ` +
            `${tabelaSequencia} COUNT=${totalSequencia}, MAX(id)=${maxSequencia}; ` +
            `${tabelaDados} COUNT=${totalDados}, MAX(${colunaId})=${maxDados}; AUTO_INCREMENT=${proximo}. ` +
            'Requer inspeção manual, sem redefinição automática.');
    }
    return { proximo, maxDados, maxSequencia, vaziaNaoInicializada: false };
}

async function garantirTabelaSequencia(conexao, tabelaSequencia, tabelaDados, colunaId) {
    const tabelaSeqExistente = await tabelaExiste(conexao, tabelaSequencia);
    if (!tabelaSeqExistente) {
        const tabelaDadosExiste = await tabelaExiste(conexao, tabelaDados);
        const maximoAtual = tabelaDadosExiste ? await maiorId(conexao, tabelaDados, colunaId) : 0;
        const inicial = calcularProximoIdSeguro(maximoAtual, tabelaSequencia, tabelaDados, colunaId);
        await conexao.query(`CREATE TABLE \`${tabelaSequencia}\` (
            id INT NOT NULL AUTO_INCREMENT,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB AUTO_INCREMENT=${inicial}`);
    }

    const tabelaSeq = await tabelaExiste(conexao, tabelaSequencia);
    if (!tabelaSeq || String(tabelaSeq.ENGINE).toLowerCase() !== 'innodb') {
        throw new Error(`A tabela ${tabelaSequencia} não existe ou não usa InnoDB.`);
    }
    const id = await obterColuna(conexao, tabelaSequencia, 'id');
    if (!id || normalizarTipoColuna(id.COLUMN_TYPE) !== 'int' || id.IS_NULLABLE !== 'NO') {
        throw new Error(`A coluna ${tabelaSequencia}.id precisa ser INT NOT NULL AUTO_INCREMENT.`);
    }
    const [[extra]] = await conexao.query(
        `SELECT EXTRA FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'id'`, [tabelaSequencia]
    );
    if (!String(extra?.EXTRA || '').toLowerCase().includes('auto_increment')) {
        throw new Error(`A coluna ${tabelaSequencia}.id não está configurada como AUTO_INCREMENT.`);
    }
    const indice = await obterIndice(conexao, tabelaSequencia, 'PRIMARY');
    afirmarIndiceCompativel(tabelaSequencia, 'PRIMARY', indice, { colunas: ['id'], naoUnico: 0 });

    const [estadoSequencia, estadoDados] = await Promise.all([
        obterEstadoIds(conexao, tabelaSequencia, 'id'),
        obterEstadoIds(conexao, tabelaDados, colunaId)
    ]);
    const [linhasAuto] = await conexao.query(
        'SELECT AUTO_INCREMENT AS proximo FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [tabelaSequencia]
    );
    const proximo = Number(linhasAuto[0]?.proximo);
    return validarEstadoSequencia({
        proximo,
        totalSequencia: estadoSequencia.total,
        maxSequencia: estadoSequencia.maior,
        totalDados: estadoDados.total,
        maxDados: estadoDados.maior,
        tabelaSequencia,
        tabelaDados,
        colunaId
    });
}

async function alocarIdSemConflito(conexao, tabelaSequencia, tabelaDados, colunaId) {
    const [sequencia] = await conexao.query(`INSERT INTO \`${tabelaSequencia}\` () VALUES ()`);
    const id = Number(sequencia.insertId);
    const [conflitos] = await conexao.query(
        `SELECT 1 FROM \`${tabelaDados}\` WHERE \`${colunaId}\` = ? LIMIT 1`, [id]
    );
    if (conflitos.length) {
        throw new Error(`ID ${id} da sequência ${tabelaSequencia} já existe em ${tabelaDados}.${colunaId}; a transação será cancelada.`);
    }
    return id;
}

async function executarEtapa(nome, operacao) {
    console.log(`[migração] ${nome}...`);
    try {
        const resultado = await operacao();
        console.log(`[migração] ${nome}: concluída.`);
        return resultado;
    } catch (erro) {
        const erroEtapa = new Error(`Falha na etapa "${nome}": ${erro.message}`);
        erroEtapa.code = erro.code;
        erroEtapa.cause = erro;
        throw erroEtapa;
    }
}

async function copiarFotosDeTrabalho(conexao, idPrestador, idServico) {
    const [fotos] = await conexao.query(
        'SELECT url_foto FROM fotos_prestadores WHERE id_prestador = ? ORDER BY id_foto',
        [idPrestador]
    );
    for (const foto of fotos) {
        const idFoto = await alocarIdSemConflito(conexao, 'fotos_servicos_id_seq', 'fotos_servicos', 'id_foto');
        await conexao.query(
            'INSERT INTO fotos_servicos (id_foto, id_servico, url_foto) VALUES (?, ?, ?)',
            [idFoto, idServico, foto.url_foto]
        );
    }
}

async function prepararEstrutura(conexao) {
    await executarEtapa('confirmar versão e validação de chaves estrangeiras do TiDB', () => validarVersaoTidb(conexao));
    await executarEtapa('validar tabelas e colunas existentes', () => validarColunasBase(conexao));
    await executarEtapa('validar limites e relações dos dados atuais', () => validarDadosDeOrigem(conexao));
    for (const tabela of ['servicos', 'solicitacoes', 'avaliacoes_solicitacoes']) {
        const metadados = await tabelaExiste(conexao, tabela);
        if (!metadados || String(metadados.ENGINE).toLowerCase() !== 'innodb') {
            throw new Error(`A tabela ${tabela} precisa existir e usar InnoDB para esta migração.`);
        }
    }
    await executarEtapa('validar chave primária servicos.id_servico', async () => {
        afirmarColunaCompativel('servicos', 'id_servico', await obterColuna(conexao, 'servicos', 'id_servico'), { tipo: 'int', nulo: false });
        afirmarIndiceCompativel('servicos', 'PRIMARY', await obterIndice(conexao, 'servicos', 'PRIMARY'), { colunas: ['id_servico'], naoUnico: 0 });
    });
    for (const [tabela, coluna, esperado] of COLUNAS_NECESSARIAS) {
        const definicao = `${esperado.tipo} ${esperado.nulo ? 'NULL' : 'NOT NULL'}${coluna === 'valor_negociavel' ? ' DEFAULT 0' : ''}`;
        await executarEtapa(`validar coluna ${tabela}.${coluna}`, () => garantirColuna(conexao, tabela, coluna, definicao, esperado));
    }

    await executarEtapa('criar ou validar tabela fotos_servicos', async () => {
        const tabelaFotosExistente = await tabelaExiste(conexao, 'fotos_servicos');
        if (!tabelaFotosExistente) {
            await conexao.query(`CREATE TABLE fotos_servicos (
                id_foto INT NOT NULL,
                id_servico INT NOT NULL,
                url_foto VARCHAR(255) NOT NULL,
                PRIMARY KEY (id_foto)
            ) ENGINE=InnoDB`);
        } else if (String(tabelaFotosExistente.ENGINE).toLowerCase() !== 'innodb') {
            throw new Error('A tabela fotos_servicos existente precisa usar InnoDB.');
        }
        const [[{ total: totalFotos }]] = await conexao.query('SELECT COUNT(*) AS total FROM fotos_servicos');
        for (const [coluna, definicao, esperado] of [
            ['id_foto', 'INT NOT NULL', { tipo: 'int', nulo: false }],
            ['id_servico', 'INT NOT NULL', { tipo: 'int', nulo: false }],
            ['url_foto', 'VARCHAR(255) NOT NULL', { tipo: 'varchar(255)', nulo: false }]
        ]) {
            if (!await obterColuna(conexao, 'fotos_servicos', coluna) && Number(totalFotos) > 0) {
                throw new Error(`fotos_servicos.${coluna} está ausente em tabela com dados; não será adicionada automaticamente.`);
            }
            await garantirColuna(conexao, 'fotos_servicos', coluna, definicao, esperado);
        }
    });

    const indices = [
        ['fotos_servicos', 'PRIMARY', '(id_foto)', ['id_foto'], 0],
        ['fotos_servicos', 'idx_fotos_servicos_servico', '(id_servico)', ['id_servico'], 1],
        ['servicos', 'idx_servicos_prestador', '(id_prestador)', ['id_prestador'], 1],
        ['solicitacoes', 'idx_solicitacoes_servico', '(id_servico)', ['id_servico'], 1],
        ['avaliacoes_solicitacoes', 'idx_avaliacoes_servico', '(id_servico)', ['id_servico'], 1]
    ];
    for (const [tabela, indice, definicao, colunas, naoUnico] of indices) {
        await executarEtapa(`validar índice ${tabela}.${indice}`, () => garantirIndice(conexao, tabela, indice, definicao, { colunas, naoUnico }));
    }

    const chaves = [
        ['servicos', 'fk_servicos_prestador', 'id_prestador', 'prestadores', 'id_prestador'],
        ['fotos_servicos', 'fk_fotos_servicos_servico', 'id_servico', 'servicos', 'id_servico'],
        ['solicitacoes', 'fk_solicitacoes_servico', 'id_servico', 'servicos', 'id_servico'],
        ['avaliacoes_solicitacoes', 'fk_avaliacoes_servico', 'id_servico', 'servicos', 'id_servico']
    ];
    for (const [tabela, chave, coluna, tabelaPai, colunaPai] of chaves) {
        const regrasFk = regrasEsperadasParaChave(tabela, chave, coluna, tabelaPai, colunaPai);
        const definicaoFk = `FOREIGN KEY (${coluna}) REFERENCES ${tabelaPai}(${colunaPai}) ON DELETE RESTRICT ON UPDATE RESTRICT`;
        await executarEtapa(`validar chave estrangeira ${tabela}.${chave}`, () => garantirChaveEstrangeira(conexao, tabela, chave,
            definicaoFk, regrasFk));
    }
    await executarEtapa('validar sequência de serviços', () => garantirTabelaSequencia(conexao, 'servicos_id_seq', 'servicos', 'id_servico'));
    await executarEtapa('validar sequência de fotos de serviços', () => garantirTabelaSequencia(conexao, 'fotos_servicos_id_seq', 'fotos_servicos', 'id_foto'));
}

async function planejarChaveEstrangeira(conexao, plano, bloqueios, tabela, chave, coluna, tabelaPai, colunaPai) {
    try { await verificarTiposRelacionados(conexao, tabela, coluna, tabelaPai, colunaPai); }
    catch (erro) { bloqueios.push(erro.message); return; }
    const [indicesPais] = await conexao.query(
        `SELECT COUNT(*) AS total FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
           AND SEQ_IN_INDEX = 1 AND NON_UNIQUE = 0`, [tabelaPai, colunaPai]
    );
    if (!Number(indicesPais[0]?.total)) {
        bloqueios.push(`A coluna pai ${tabelaPai}.${colunaPai} não tem uma chave única compatível.`);
        return;
    }
    const existentes = await obterChaveEstrangeira(conexao, tabela, chave);
    const atual = existentes.find(item => item.CONSTRAINT_NAME === chave) ||
        existentes.find(item => String(item.COLUMN_NAMES || '').split(',').includes(coluna));
    const esperado = regrasEsperadasParaChave(tabela, chave, coluna, tabelaPai, colunaPai);
    if (atual) {
        try {
            afirmarChaveEstrangeiraCompativel(tabela, atual.CONSTRAINT_NAME, atual, esperado);
            const preservacao = tabela === 'servicos' && chave === 'fk_servicos_prestador'
                ? ' A regra existente será preservada, sem alteração da FK.'
                : '';
            plano.push(`FK existente: ${formatarDetalhesChaveEstrangeira(atual)}. Compatível com o relacionamento esperado: constraint=${chave}; origem=${tabela}(${coluna}); referência=${tabelaPai}(${colunaPai}); regras de integridade validadas.${preservacao}`);
        }
        catch (erro) { bloqueios.push(erro.message); }
        return;
    }
    plano.push(`ALTER TABLE ${tabela} ADD CONSTRAINT ${chave} FOREIGN KEY (${coluna}) REFERENCES ${tabelaPai}(${colunaPai}) ON DELETE RESTRICT ON UPDATE RESTRICT;`);
}

async function colunaPaiTemIndiceUnico(conexao, tabela, coluna) {
    const [linhas] = await conexao.query(
        `SELECT COUNT(*) AS total FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
           AND SEQ_IN_INDEX = 1 AND NON_UNIQUE = 0`, [tabela, coluna]
    );
    return Number(linhas[0]?.total) > 0;
}

async function planejarEstruturaSomenteLeitura(conexao) {
    const plano = [];
    const bloqueios = [];
    try {
        const versao = await validarVersaoTidb(conexao);
        plano.push(`TiDB ${versao.partes.join('.')}; foreign_key_checks ativo.`);
    } catch (erro) { bloqueios.push(erro.message); }

    try { await validarColunasBase(conexao); }
    catch (erro) { bloqueios.push(erro.message); }
    try { await validarDadosDeOrigem(conexao); }
    catch (erro) { bloqueios.push(erro.message); }

    const idServicoExistente = await obterColuna(conexao, 'servicos', 'id_servico');
    if (idServicoExistente) {
        try { afirmarColunaCompativel('servicos', 'id_servico', idServicoExistente, { tipo: 'int', nulo: false }); }
        catch (erro) { bloqueios.push(erro.message); }
        const pk = await obterIndice(conexao, 'servicos', 'PRIMARY');
        if (!pk) bloqueios.push('servicos precisa manter sua chave primária em id_servico; esta migração não altera a PK existente.');
        else {
            try { afirmarIndiceCompativel('servicos', 'PRIMARY', pk, { colunas: ['id_servico'], naoUnico: 0 }); }
            catch (erro) { bloqueios.push(erro.message); }
        }
    }

    for (const [tabela, coluna, esperado] of COLUNAS_NECESSARIAS) {
        const atual = await obterColuna(conexao, tabela, coluna);
        if (!atual) {
            const definicao = `${esperado.tipo} ${esperado.nulo ? 'NULL' : 'NOT NULL'}${esperado.padrao !== undefined ? ` DEFAULT ${esperado.padrao}` : ''}`;
            plano.push(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao};`);
        } else {
            try { afirmarColunaCompativel(tabela, coluna, atual, esperado); }
            catch (erro) { bloqueios.push(erro.message); }
        }
    }

    const fotos = await tabelaExiste(conexao, 'fotos_servicos');
    if (!fotos) {
        plano.push('CREATE TABLE fotos_servicos (id_foto INT NOT NULL, id_servico INT NOT NULL, url_foto VARCHAR(255) NOT NULL, PRIMARY KEY (id_foto)) ENGINE=InnoDB;');
    } else {
        if (String(fotos.ENGINE).toLowerCase() !== 'innodb') bloqueios.push('fotos_servicos existe, mas não usa InnoDB.');
        const [[total]] = await conexao.query('SELECT COUNT(*) AS total FROM fotos_servicos');
        for (const [coluna, tipo] of [['id_foto', 'int'], ['id_servico', 'int'], ['url_foto', 'varchar(255)']]) {
            const atual = await obterColuna(conexao, 'fotos_servicos', coluna);
            if (!atual && Number(total.total) > 0) bloqueios.push(`fotos_servicos.${coluna} está ausente numa tabela não vazia; requer análise manual.`);
            else if (!atual) plano.push(`ALTER TABLE fotos_servicos ADD COLUMN ${coluna} ${tipo} NOT NULL;`);
            else {
                try { afirmarColunaCompativel('fotos_servicos', coluna, atual, { tipo, nulo: false }); }
                catch (erro) { bloqueios.push(erro.message); }
            }
        }
    }

    const indiceEsperado = [
        ['fotos_servicos', 'PRIMARY', '(id_foto)', ['id_foto'], 0],
        ['fotos_servicos', 'idx_fotos_servicos_servico', '(id_servico)', ['id_servico'], 1],
        ['servicos', 'idx_servicos_prestador', '(id_prestador)', ['id_prestador'], 1],
        ['solicitacoes', 'idx_solicitacoes_servico', '(id_servico)', ['id_servico'], 1],
        ['avaliacoes_solicitacoes', 'idx_avaliacoes_servico', '(id_servico)', ['id_servico'], 1]
    ];
    for (const [tabela, nome, definicao, colunas, naoUnico] of indiceEsperado) {
        if (tabela === 'fotos_servicos' && !fotos && nome === 'PRIMARY') continue;
        const atual = await obterIndice(conexao, tabela, nome);
        if (atual) {
            try { afirmarIndiceCompativel(tabela, nome, atual, { colunas, naoUnico }); }
            catch (erro) { bloqueios.push(erro.message); }
        } else {
            const alternativo = (await obterIndices(conexao, tabela)).find(item =>
                Number(item.naoUnico) === naoUnico && item.colunas === colunas.join(','));
            if (!alternativo) plano.push(nome === 'PRIMARY'
                ? `ALTER TABLE ${tabela} ADD PRIMARY KEY ${definicao};`
                : `ALTER TABLE ${tabela} ADD INDEX ${nome} ${definicao};`);
        }
    }

    const relacoes = [
        ['servicos', 'fk_servicos_prestador', 'id_prestador', 'prestadores', 'id_prestador'],
        ['fotos_servicos', 'fk_fotos_servicos_servico', 'id_servico', 'servicos', 'id_servico'],
        ['solicitacoes', 'fk_solicitacoes_servico', 'id_servico', 'servicos', 'id_servico'],
        ['avaliacoes_solicitacoes', 'fk_avaliacoes_servico', 'id_servico', 'servicos', 'id_servico']
    ];
    for (const [tabela, nome, coluna, pai, colunaPai] of relacoes) {
        if (tabela === 'fotos_servicos' && !fotos) {
            const idServicoPai = await obterColuna(conexao, 'servicos', 'id_servico');
            if (idServicoPai && normalizarTipoColuna(idServicoPai.COLUMN_TYPE) === 'int' && await colunaPaiTemIndiceUnico(conexao, pai, colunaPai)) {
                plano.push(`ALTER TABLE fotos_servicos ADD CONSTRAINT ${nome} FOREIGN KEY (${coluna}) REFERENCES ${pai}(${colunaPai}) ON DELETE RESTRICT ON UPDATE RESTRICT;`);
            } else bloqueios.push('Não foi possível validar o tipo de fotos_servicos.id_servico antes da criação da FK.');
            continue;
        }
        const colunaFilha = await obterColuna(conexao, tabela, coluna);
        if (!colunaFilha) {
            const seraCriadaComoInt = COLUNAS_NECESSARIAS.some(([t, c, esperado]) => t === tabela && c === coluna && esperado.tipo === 'int');
            const colunaPaiAtual = await obterColuna(conexao, pai, colunaPai);
            if (seraCriadaComoInt && colunaPaiAtual && normalizarTipoColuna(colunaPaiAtual.COLUMN_TYPE) === 'int' && await colunaPaiTemIndiceUnico(conexao, pai, colunaPai)) {
                plano.push(`ALTER TABLE ${tabela} ADD CONSTRAINT ${nome} FOREIGN KEY (${coluna}) REFERENCES ${pai}(${colunaPai}) ON DELETE RESTRICT ON UPDATE RESTRICT;`);
            } else bloqueios.push(`Não foi possível confirmar os tipos da relação ${tabela}.${coluna} → ${pai}.${colunaPai}.`);
            continue;
        }
        if (!await obterColuna(conexao, pai, colunaPai)) continue;
        await planejarChaveEstrangeira(conexao, plano, bloqueios, tabela, nome, coluna, pai, colunaPai);
    }

    for (const [seq, dados, coluna] of [
        ['servicos_id_seq', 'servicos', 'id_servico'],
        ['fotos_servicos_id_seq', 'fotos_servicos', 'id_foto']
    ]) {
        const existente = await tabelaExiste(conexao, seq);
        const tabelaDados = await tabelaExiste(conexao, dados);
        const maximo = tabelaDados ? await maiorId(conexao, dados, coluna) : 0;
        if (!existente) {
            let proximo;
            try { proximo = calcularProximoIdSeguro(maximo, seq, dados, coluna); }
            catch (erro) {
                bloqueios.push(erro.message);
                continue;
            }
            plano.push(`CREATE TABLE ${seq} (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB AUTO_INCREMENT=${proximo}; -- maior ID atual em ${dados}.${coluna}: ${maximo}; próximo ID alocado: ${proximo}.`);
        } else {
            try {
                if (!tabelaDados) throw new Error(`Tabela de dados ${dados} ausente.`);
                const estado = await garantirTabelaSequencia(conexao, seq, dados, coluna);
                if (estado.vaziaNaoInicializada) {
                    plano.push(`Sequência ${seq}: vazia e ainda não inicializada (AUTO_INCREMENT=0); segura porque ${dados} também está vazia; a primeira alocação será gerada pelo TiDB e não haverá redefinição manual.`);
                } else {
                    plano.push(`Sequência ${seq}: válida; AUTO_INCREMENT atual=${estado.proximo}, MAX(id)=${estado.maxSequencia}, maior ID em ${dados}.${coluna}=${estado.maxDados}; não será redefinida.`);
                }
            } catch (erro) { bloqueios.push(erro.message); }
        }
    }

    if (bloqueios.length === 0) {
        const [[contagens]] = await conexao.query(
            `SELECT COUNT(*) AS anuncios,
                    (SELECT COUNT(*) FROM fotos_prestadores f
                     INNER JOIN prestadores p ON p.id_prestador = f.id_prestador
                     WHERE NOT EXISTS (SELECT 1 FROM servicos s WHERE s.id_prestador = p.id_prestador)) AS fotos
             FROM prestadores p
             WHERE NOT EXISTS (SELECT 1 FROM servicos s WHERE s.id_prestador = p.id_prestador)`
        );
        plano.push(`Carga prevista: ${contagens.anuncios} anúncios iniciais e ${contagens.fotos} referências de foto copiadas; referências originais serão mantidas.`);
    }
    return { plano, bloqueios };
}

async function executarPreviaSomenteLeitura() {
    let conexao;
    try {
        conexao = await db.promise().getConnection();
        const { plano, bloqueios } = await planejarEstruturaSomenteLeitura(conexao);
        console.log('\nPRÉVIA READ-ONLY: nenhuma alteração foi executada.');
        console.log('\nEstruturas/ações previstas:');
        if (plano.length) plano.forEach(item => console.log(`- ${item}`));
        else console.log('- Nenhuma alteração estrutural.');
        if (bloqueios.length) {
            console.error('\nBLOQUEIOS:');
            bloqueios.forEach(item => console.error(`- ${item}`));
            process.exitCode = 1;
        } else console.log('\nPrévia aprovada pelas verificações read-only.');
    } catch (erro) {
        console.error('[prévia] falha em consulta somente de leitura:', erro.code || 'ERRO_SQL');
        process.exitCode = 1;
    } finally {
        if (conexao) conexao.release();
        if (db) await db.promise().end();
    }
}

async function executarMigracao() {
    let conexao;
    let transacaoAtiva = false;
    try {
        conexao = await db.promise().getConnection();
        await executarEtapa('validar e preparar o esquema', () => prepararEstrutura(conexao));

        await executarEtapa('iniciar transação de dados', async () => {
            await conexao.beginTransaction();
            transacaoAtiva = true;
        });
        const [prestadores] = await executarEtapa('localizar prestadores sem anúncio de serviço', () => conexao.query(
            `SELECT p.id_prestador, p.profissao, p.descricao, p.valor_diaria,
                    p.cidade, p.estado
             FROM prestadores p
             WHERE NOT EXISTS (
                SELECT 1 FROM servicos s WHERE s.id_prestador = p.id_prestador
             )
             ORDER BY p.id_prestador`
        ));

        for (const prestador of prestadores) {
            await executarEtapa(`migrar prestador ID ${prestador.id_prestador}`, async () => {
                const idServico = await alocarIdSemConflito(conexao, 'servicos_id_seq', 'servicos', 'id_servico');
                const [especialidadesLinhas] = await conexao.query(
                    `SELECT DISTINCT e.nome FROM prestador_especialidade pe
                     INNER JOIN especialidades e ON e.id_especialidade = pe.id_especialidade
                     WHERE pe.id_prestador = ? ORDER BY e.nome`, [prestador.id_prestador]
                );
                const especialidades = especialidadesLinhas.map(linha => linha.nome).filter(Boolean);
                await conexao.query(
                    `INSERT INTO servicos
                        (id_servico, id_prestador, nome_servico, descricao, valor_diaria, disponivel,
                         cidade, estado, valor_negociavel, especialidades)
                     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
                    [idServico, prestador.id_prestador, String(prestador.profissao || 'Serviço profissional'),
                        prestador.descricao || null, prestador.valor_diaria,
                        prestador.cidade || null, prestador.estado || null,
                        prestador.valor_diaria == null ? 1 : 0,
                        especialidades.length ? JSON.stringify(especialidades) : null]
                );
                await copiarFotosDeTrabalho(conexao, prestador.id_prestador, idServico);
            });
        }

        await executarEtapa('confirmar transação de dados', async () => {
            await conexao.commit();
            transacaoAtiva = false;
        });
        console.log(`[migração] concluída. Anúncios iniciais criados: ${prestadores.length}.`);
    } catch (erro) {
        if (transacaoAtiva && conexao) {
            await conexao.rollback().catch(erroRollback => {
                console.error('[migração] FALHA AO DESFAZER A TRANSAÇÃO; confira manualmente o estado dos dados antes de tentar novamente:', erroRollback.code || erroRollback.message);
            });
        }
        console.error('[migração] execução interrompida:', erro.code || erro.message);
        console.error('[migração] alterações DDL podem permanecer após uma falha; não reexecute sem inspecionar o esquema e os dados no TiDB.');
        process.exitCode = 1;
    } finally {
        if (conexao) conexao.release();
        if (db) await db.promise().end();
    }
}

if (require.main === module) {
    if (process.argv.includes('--plan')) {
        db = require('./db');
        executarPreviaSomenteLeitura();
    } else if (process.env.CONFIRMAR_MIGRACAO_ANUNCIOS !== 'SIM') {
        console.error('Migração não executada. Defina CONFIRMAR_MIGRACAO_ANUNCIOS=SIM somente após confirmar o banco de destino e ter um backup.');
        process.exitCode = 2;
    } else {
        db = require('./db');
        executarMigracao();
    }
}

module.exports = {
    afirmarColunaCompativel,
    afirmarIndiceCompativel,
    afirmarChaveEstrangeiraCompativel,
    calcularProximoIdSeguro,
    validarEstadoSequencia,
    normalizarTipoColuna,
    extrairVersaoTidb,
    compararVersoes,
    planejarEstruturaSomenteLeitura
};
