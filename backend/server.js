const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const db = require('./db');

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
    criarArmazenamentoImagens,
    criarCaminhoObjeto,
    validarImagem
} = require('./image-storage');

console.log("SERVER DA CONSTRUMAX CARREGADO");

const app = express();
const sessoes = new Map();
const armazenamentoImagens = criarArmazenamentoImagens();

function criarSessao(idUsuario) {
    const token = crypto.randomBytes(32).toString('hex');
    sessoes.set(token, Number(idUsuario));
    return token;
}

function autenticar(req, res, next) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const idUsuario = sessoes.get(token);
    if (!idUsuario) {
        return res.status(401).json({ sucesso: false, mensagem: 'Faça login novamente para continuar.' });
    }
    db.query('SELECT ativo, tipo_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1', [idUsuario], (erro, resultado) => {
        if (erro) {
            console.error('ERRO AO VALIDAR SESSÃO:', erro.message);
            return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível validar sua sessão.' });
        }
        if (!resultado[0] || Number(resultado[0].ativo) !== 1) {
            sessoes.delete(token);
            return res.status(403).json({ sucesso: false, mensagem: 'Esta conta está suspensa ou não existe.' });
        }
        req.usuarioAutenticado = { id_usuario: idUsuario, tipo_usuario: resultado[0].tipo_usuario };
        next();
    });
}

function autorizarAdmin(req, res, next) {
    db.query('SELECT tipo_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1', [req.usuarioAutenticado.id_usuario], (erro, resultado) => {
        if (erro) {
            console.error('ERRO AO VALIDAR ADMINISTRADOR:', erro.message);
            return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível validar a permissão.' });
        }
        if (!resultado[0] || resultado[0].tipo_usuario !== 'ADMIN') {
            return res.status(403).json({ sucesso: false, mensagem: 'Acesso exclusivo para administradores.' });
        }
        next();
    });
}

const pastaUploadsBase = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, 'uploads'));
const pastaUploads = path.join(pastaUploadsBase, 'equipamentos');

if (!fs.existsSync(pastaUploads)) {
    fs.mkdirSync(pastaUploads, { recursive: true });
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: 5,
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: function (req, file, cb) {

        if (file) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas.'));
        }

    }
});

const pastaUploadsPrestadores = path.join(pastaUploadsBase, 'prestadores');

if (!fs.existsSync(pastaUploadsPrestadores)) {
    fs.mkdirSync(pastaUploadsPrestadores, { recursive: true });
}

const uploadPrestadores = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: 6,
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: function (req, file, cb) {
        if (file) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas.'));
        }
    }
});

function arquivosRecebidos(req) {
    if (Array.isArray(req.files)) return req.files;
    return Object.values(req.files || {}).flat();
}

function removerUploadsRecebidos(req) {
    arquivosRecebidos(req).forEach(arquivo => {
        if (arquivo) arquivo.buffer = null;
    });
}

function caminhoFotoPrestador(url) {
    const nome = path.basename(String(url || ''));
    if (!/^\d+-\d+\.[a-z0-9]+$/i.test(nome)) return null;
    const caminho = path.join(pastaUploadsPrestadores, nome);
    return path.dirname(caminho) === pastaUploadsPrestadores ? caminho : null;
}

function removerArquivoFotoPrestador(url) {
    const caminho = caminhoFotoPrestador(url);
    if (caminho && fs.existsSync(caminho)) fs.unlinkSync(caminho);
}

async function removerFotoPrestadorSeSemReferencias(url, categoria, idRegistro) {
    const referencia = String(url || '');
    const ehObjetoSupabase = armazenamentoImagens.caminhoObjetoGerenciado(referencia);
    const ehArquivoLegado = Boolean(caminhoFotoPrestador(referencia));
    if (!ehObjetoSupabase && !ehArquivoLegado) return;
    if (ehObjetoSupabase && !armazenamentoImagens.caminhoObjetoPertenceA(referencia, categoria, idRegistro)) {
        const erro = new Error('Imagem fora do registro autorizado.');
        erro.code = 'IMAGE_STORAGE_OWNERSHIP_MISMATCH';
        throw erro;
    }
    const referencias = await consultar(
        `SELECT
            (SELECT COUNT(*) FROM usuarios WHERE foto_perfil = ?) +
            (SELECT COUNT(*) FROM prestadores WHERE foto = ?) +
            (SELECT COUNT(*) FROM fotos_prestadores WHERE url_foto = ?) +
            (SELECT COUNT(*) FROM fotos_equipamentos WHERE url_foto = ?) +
            (SELECT COUNT(*) FROM fotos_servicos WHERE url_foto = ?) AS total`,
        [referencia, referencia, referencia, referencia, referencia]
    );
    if (Number(referencias[0]?.total) !== 0) return;
    if (ehObjetoSupabase) await armazenamentoImagens.remover(referencia, categoria, idRegistro);
    else removerArquivoFotoPrestador(referencia);
}

async function guardarImagemNoSupabase(arquivo, categoria, idRegistro) {
    const tipoReal = validarImagem(arquivo);
    const extensoes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    const caminho = criarCaminhoObjeto(categoria, idRegistro, `imagem.${extensoes[tipoReal]}`);
    return armazenamentoImagens.enviar(arquivo, caminho);
}

async function guardarImagensNoSupabase(arquivos, categoria, idRegistro) {
    const caminhos = [];
    try {
        const lista = [...(arquivos || [])];
        for (const arquivo of lista) validarImagem(arquivo);
        for (const arquivo of lista) {
            caminhos.push(await guardarImagemNoSupabase(arquivo, categoria, idRegistro));
        }
        return caminhos;
    } catch (erro) {
        await armazenamentoImagens.remover(caminhos, categoria, idRegistro).catch(limpezaErro => {
            console.error('FALHA AO LIMPAR UPLOAD PARCIAL DO STORAGE:', limpezaErro.code || 'ERRO');
        });
        throw erro;
    }
}

async function removerImagensLegadasOuSupabase(referencias, categoria, idRegistro) {
    for (const referencia of [...new Set(referencias || [])]) {
        if (armazenamentoImagens.caminhoObjetoGerenciado(String(referencia || ''))) {
            await removerFotoPrestadorSeSemReferencias(referencia, categoria, idRegistro);
        } else if (String(referencia || '').startsWith('/uploads/equipamentos/')) {
            if (categoria !== 'equipamento') continue;
            arquivoFotoEquipamento(referencia);
        } else if (String(referencia || '').startsWith('/uploads/prestadores/')) {
            if (!['perfilUsuario', 'perfilPrestador', 'trabalhosPrestador'].includes(categoria)) continue;
            await removerFotoPrestadorSeSemReferencias(referencia, categoria, idRegistro);
        }
    }
}

function normalizarListaEspecialidades(valor) {
    let lista = valor;
    if (typeof lista === 'string') {
        try { lista = JSON.parse(lista); }
        catch { lista = lista.split(','); }
    }
    if (!Array.isArray(lista)) return [];
    const vistas = new Set();
    return lista.map(item => String(item || '').trim().slice(0, 100))
        .filter(item => {
            const chave = item.toLocaleLowerCase('pt-BR');
            if (!item || vistas.has(chave)) return false;
            vistas.add(chave);
            return true;
        }).slice(0, 10);
}

function dividirListaAgregada(valor) {
    return valor ? String(valor).split('|||').filter(Boolean) : [];
}

function uploadCamposPerfil(req, res, next) {
    uploadPrestadores.fields([
        { name: 'foto_perfil', maxCount: 1 },
        { name: 'fotos_trabalhos', maxCount: 5 }
    ])(req, res, erro => {
        if (erro) {
            const mensagem = erro.code === 'LIMIT_FILE_SIZE'
                ? 'Cada imagem deve ter no máximo 5 MB.'
                : erro.code === 'LIMIT_UNEXPECTED_FILE'
                    ? 'O limite de cinco fotos de trabalhos ou uma foto de perfil foi excedido.'
                    : erro.message || 'Não foi possível receber as imagens.';
            return res.status(400).json({ sucesso: false, mensagem });
        }
        next();
    });
}

function uploadFotosCadastroPrestador(req, res, next) {
    uploadPrestadores.array('fotos', 5)(req, res, erro => {
        if (erro) {
            const mensagem = erro.code === 'LIMIT_FILE_SIZE'
                ? 'Cada imagem deve ter no máximo 5 MB.'
                : erro.code === 'LIMIT_UNEXPECTED_FILE'
                    ? 'O cadastro aceita no máximo cinco fotos de trabalhos.'
                    : erro.message || 'Não foi possível receber as imagens.';
            return res.status(400).json({ sucesso: false, mensagem });
        }
        next();
    });
}


app.use(cors());
app.use(express.json());

app.get('/api/imagens/config', (req, res) => {
    res.json({
        sucesso: true,
        basePublica: armazenamentoImagens.basePublica
    });
});

app.use(
    '/uploads',
    express.static(pastaUploadsBase)
);

// ===============================
// ROTA PRINCIPAL
// ===============================

app.get('/', (req, res) => {
    res.send('TESTE NICHOLAS');
});


// ===============================
// LISTAR USUÁRIOS
// ===============================

app.get('/usuarios', autenticar, autorizarAdmin, (req, res) => {

    db.query(
        `SELECT id_usuario, nome, email, telefone, tipo_usuario, ativo, data_cadastro
         FROM usuarios ORDER BY id_usuario DESC LIMIT 200`,
        (erro, resultado) => {

            if (erro) {
                console.error("ERRO USUÁRIOS:", erro);

                return res.status(500).json({
                    sucesso: false,
                    erro
                });
            }

            res.json(resultado);
        }
    );

});


// ===============================
// CADASTRO DE USUÁRIO
// ===============================
// IMPORTANTE:
// Aqui cadastra SOMENTE o usuário.
// O profissional será cadastrado
// pela rota /cadastro-prestador.
// Isso evita duplicação.
// ===============================

function normalizarTelefoneBrasil(valor) {
    const texto = String(valor || '').trim();
    if (texto && !/^[\d\s()+.-]+$/.test(texto)) return null;
    const digitos = texto.replace(/\D/g, '');
    if (!/^[1-9]\d{9,10}$/.test(digitos) || Number(digitos.slice(0, 2)) < 11) return null;
    return digitos;
}

function validarDocumentoCpfCnpj(valor) {
    const texto = String(valor || '').trim();
    if (texto && !/^[\d\s().\/-]+$/.test(texto)) return false;
    const digitos = texto.replace(/\D/g, '');
    if (/^(\d)\1+$/.test(digitos)) return false;

    if (digitos.length === 11) {
        const calcular = tamanho => {
            const soma = digitos.slice(0, tamanho).split('').reduce(
                (total, numero, indice) => total + Number(numero) * (tamanho + 1 - indice), 0
            );
            const resto = (soma * 10) % 11;
            return resto === 10 ? 0 : resto;
        };
        return calcular(9) === Number(digitos[9]) && calcular(10) === Number(digitos[10]);
    }

    if (digitos.length === 14) {
        const calcular = pesos => {
            const soma = pesos.reduce((total, peso, indice) => total + Number(digitos[indice]) * peso, 0);
            const resto = soma % 11;
            return resto < 2 ? 0 : 11 - resto;
        };
        return calcular([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digitos[12]) &&
            calcular([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digitos[13]);
    }
    return false;
}

app.post('/cadastro', (req, res) => {

    const {
        nome,
        email,
        senha,
        telefone,
        tipo_usuario
    } = req.body;

    const telefoneNormalizado = normalizarTelefoneBrasil(telefone);
    if (!String(nome || '').trim() || !String(email || '').trim() || !String(senha || '') || !telefoneNormalizado) {
        return res.status(400).json({
            sucesso: false,
            mensagem: 'Informe nome, e-mail, senha e um telefone válido com DDD (10 ou 11 números).'
        });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
        return res.status(400).json({ sucesso: false, mensagem: 'Informe um e-mail válido.' });
    }

    // Converte o tipo para o padrão aceito pelo banco
    const tipoRecebido = String(tipo_usuario || "").trim().toLowerCase();

    let tipoBanco;

    if (tipoRecebido === "contratante" || tipoRecebido === "cliente") {
        tipoBanco = "CLIENTE";
    } else if (tipoRecebido === "profissional" || tipoRecebido === "prestador") {
        tipoBanco = "PRESTADOR";
    } else {
        return res.status(400).json({
            sucesso: false,
            erro: "Tipo de usuário inválido."
        });
    }

    // Gera um ID pela tabela auxiliar
    db.query(
        "INSERT INTO usuarios_id_seq () VALUES ()",
        (erroId, resultadoId) => {

            if (erroId) {
                console.error("ERRO AO GERAR ID:", erroId);

                return res.status(500).json({
                    sucesso: false,
                    erro: erroId.message
                });
            }

            const idUsuario = resultadoId.insertId;

            // Cadastra o usuário com o ID gerado
            db.query(
                `INSERT INTO usuarios
                (
                    id_usuario,
                    nome,
                    email,
                    senha,
                    telefone,
                    tipo_usuario
                )
                VALUES (?, ?, ?, ?, ?, ?)`,

                [
                    idUsuario,
                    String(nome).trim(),
                    String(email).trim(),
                    senha,
                    telefoneNormalizado,
                    tipoBanco
                ],

                (erro, resultado) => {

                    if (erro) {
                        console.error("ERRO SQL CADASTRO:", erro);

                        return res.status(500).json({
                            sucesso: false,
                            erro: erro.message
                        });
                    }

                    console.log("USUÁRIO CADASTRADO! ID:", idUsuario);

                    return res.json({
                        sucesso: true,
                        id: idUsuario,
                        token: criarSessao(idUsuario)
                    });

                }
            );
        }
    );

});


// ===============================
// CADASTRO DE PRESTADOR
// ===============================

// ===============================
// CADASTRO DE PRESTADOR
// ===============================


app.post('/cadastro-prestador', autenticar, uploadFotosCadastroPrestador, async (req, res) => {
    const idUsuario = Number(req.body?.id_usuario);
    if (req.usuarioAutenticado.tipo_usuario !== 'PRESTADOR' || !Number.isSafeInteger(idUsuario) || idUsuario !== req.usuarioAutenticado.id_usuario) {
        removerUploadsRecebidos(req);
        return res.status(403).json({ sucesso: false, mensagem: 'Acesso nao autorizado para cadastrar este perfil profissional.' });
    }
    if (!req.body) return res.status(400).json({ sucesso: false, mensagem: 'Dados do profissional nao recebidos.' });
    const { cpf_cnpj, profissao, cidade, estado, valor_diaria, descricao } = req.body;
    const valorNegociavel = ['1', 'true', 'on'].includes(String(req.body.valor_negociavel || '').toLowerCase()) ||
        (req.body.valor_negociavel == null && String(valor_diaria ?? '').trim() === '');
    const valorDiariaSalvo = valorNegociavel || String(valor_diaria ?? '').trim() === '' ? null : Number(valor_diaria);
    if (!validarDocumentoCpfCnpj(cpf_cnpj)) {
        removerUploadsRecebidos(req);
        return res.status(400).json({ sucesso: false, mensagem: 'Informe um CPF ou CNPJ completo e valido.' });
    }
    if (!String(profissao || '').trim() || !String(cidade || '').trim() || !String(estado || '').trim()) {
        removerUploadsRecebidos(req);
        return res.status(400).json({ sucesso: false, mensagem: 'Informe profiss?o, cidade e estado.' });
    }
    if (!valorNegociavel && (!Number.isFinite(valorDiariaSalvo) || valorDiariaSalvo < 0 || valorDiariaSalvo > 99999999.99)) {
        removerUploadsRecebidos(req);
        return res.status(400).json({ sucesso: false, mensagem: 'Informe um valor de diária válido ou marque "A combinar".' });
    }

    let conexao;
    let transacaoAtiva = false;
    let caminhosEnviados = [];
    let idPrestador = null;
    try {
        const existentes = await consultar('SELECT id_prestador FROM prestadores WHERE id_usuario = ?', [idUsuario]);
        if (existentes.length) {
            removerUploadsRecebidos(req);
            return res.json({ sucesso: true, mensagem: 'Este profissional ja esta cadastrado.', id_prestador: existentes[0].id_prestador, ja_existia: true });
        }
        const sequencia = await consultar('INSERT INTO prestadores_id_seq () VALUES ()');
        idPrestador = Number(sequencia.insertId);
        caminhosEnviados = await guardarImagensNoSupabase(req.files || [], 'trabalhosPrestador', idPrestador);

        conexao = await db.promise().getConnection();
        await conexao.beginTransaction();
        transacaoAtiva = true;
        await consultarNaConexao(conexao,
            'INSERT INTO prestadores (id_prestador, id_usuario, cpf_cnpj, profissao, cidade, estado, valor_diaria, descricao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [idPrestador, idUsuario, String(cpf_cnpj).replace(/\D/g, ''), profissao, cidade, estado, valorDiariaSalvo, descricao]);
        let fotosSalvas = 0;
        for (const caminho of caminhosEnviados) {
            const sequenciaFoto = await consultarNaConexao(conexao, 'INSERT INTO fotos_prestadores_id_seq () VALUES ()');
            await consultarNaConexao(conexao,
                'INSERT INTO fotos_prestadores (id_foto, id_prestador, url_foto) VALUES (?, ?, ?)',
                [sequenciaFoto.insertId, idPrestador, caminho]);
            fotosSalvas++;
        }
        await conexao.commit();
        transacaoAtiva = false;
        removerUploadsRecebidos(req);
        return res.json({ sucesso: true, mensagem: 'Prestador cadastrado com sucesso!', id_prestador: idPrestador, quantidade_fotos: fotosSalvas });
    } catch (erro) {
        if (transacaoAtiva && conexao) await conexao.rollback().catch(() => {});
        removerUploadsRecebidos(req);
        for (const caminho of caminhosEnviados) {
            try { await removerFotoPrestadorSeSemReferencias(caminho, 'trabalhosPrestador', idPrestador); }
            catch (erroLimpeza) { console.error('FALHA AO LIMPAR IMAGEM DE CADASTRO:', erroLimpeza.code || 'ERRO'); }
        }
        if (erro.code === 'IMAGE_INVALID_FILE') return res.status(400).json({ sucesso: false, mensagem: erro.message });
        console.error('ERRO AO CADASTRAR PRESTADOR:', erro.code || erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Nao foi possivel concluir o cadastro profissional e salvar as imagens.' });
    } finally {
        if (conexao) conexao.release();
    }
});
// ===============================
// LOGIN
// ===============================

app.post('/login', (req, res) => {

    const {
        email,
        senha
    } = req.body;


    db.query(

        `SELECT 
            id_usuario,
            nome,
            email,
            telefone,
            tipo_usuario,
            foto_perfil,
            descricao,
            ativo
         FROM usuarios
         WHERE email = ?
         AND senha = ?`,

        [
            email,
            senha
        ],

        (erro, resultado) => {

            if (erro) {

                console.error(
                    "ERRO LOGIN:",
                    erro
                );

                return res.status(500).json({
                    sucesso: false
                });
            }


            console.log(
                "RESULTADO LOGIN:",
                resultado
            );


            if (resultado.length > 0 && Number(resultado[0].ativo) === 1) {
                delete resultado[0].ativo;

                res.json({
                    sucesso: true,
                    usuario: resultado[0],
                    token: criarSessao(resultado[0].id_usuario)
                });

            } else {

                res.json({
                    sucesso: false,
                    mensagem: "E-mail ou senha inválidos"
                });

            }

        }

    );

});


// ===============================
// LISTAR PRESTADORES
// ===============================


app.get('/prestadores', (req, res) => {

    const servico = String(req.query.servico || '').trim();
    const cidade = String(req.query.cidade || '').trim();
    const filtros = [];
    const parametros = [];

    if (servico) {
        filtros.push(`(
            LOWER(p.profissao) LIKE LOWER(?)
            OR EXISTS (
                SELECT 1
                FROM prestador_especialidade peBusca
                INNER JOIN especialidades eBusca ON eBusca.id_especialidade = peBusca.id_especialidade
                WHERE peBusca.id_prestador = p.id_prestador
                  AND LOWER(eBusca.nome) LIKE LOWER(?)
            )
        )`);
        parametros.push(`%${servico}%`, `%${servico}%`);
    }

    if (cidade) {
        const partesLocalizacao = cidade.split(',').map(parte => parte.trim()).filter(Boolean);
        if (partesLocalizacao.length > 1) {
            filtros.push(`(LOWER(p.cidade) LIKE LOWER(?) AND LOWER(p.estado) LIKE LOWER(?))`);
            parametros.push(`%${partesLocalizacao[0]}%`, `%${partesLocalizacao.slice(1).join(' ')}%`);
        } else {
            filtros.push(`(LOWER(p.cidade) LIKE LOWER(?) OR LOWER(p.estado) LIKE LOWER(?))`);
            parametros.push(`%${cidade}%`, `%${cidade}%`);
        }
    }

    db.query(
        `
        SELECT
            p.*,
            u.nome,
            u.telefone,
            u.foto_perfil AS foto_perfil,
            (SELECT AVG(av.nota) FROM avaliacoes_solicitacoes av
             WHERE av.id_prestador = p.id_prestador AND av.alvo = 'PRESTADOR' AND av.nota IS NOT NULL AND av.moderacao_status = 'VISIVEL') AS nota_media_avaliacoes,
            (SELECT COUNT(*) FROM avaliacoes_solicitacoes av
             WHERE av.id_prestador = p.id_prestador AND av.alvo = 'PRESTADOR' AND av.nota IS NOT NULL AND av.moderacao_status = 'VISIVEL') AS total_notas_avaliacoes,
            (
                SELECT GROUP_CONCAT(DISTINCT e.nome SEPARATOR '|||')
                FROM prestador_especialidade pe
                INNER JOIN especialidades e ON e.id_especialidade = pe.id_especialidade
                WHERE pe.id_prestador = p.id_prestador
            ) AS especialidades,

            (
                SELECT GROUP_CONCAT(
                    f.url_foto
                    ORDER BY f.id_foto
                    SEPARATOR '|||'
                )
                FROM fotos_prestadores f
                WHERE f.id_prestador = p.id_prestador
            ) AS fotos

        FROM prestadores p

        INNER JOIN usuarios u
            ON p.id_usuario = u.id_usuario
        ${filtros.length ? `WHERE ${filtros.join(' AND ')} AND p.admin_ativo = 1 AND u.ativo = 1` : 'WHERE p.admin_ativo = 1 AND u.ativo = 1'}
        ORDER BY p.id_prestador DESC
        `,
        parametros,

        (erro, resultado) => {

            if (erro) {
                console.error("ERRO PRESTADORES:", erro);

                return res.status(500).json({
                    sucesso: false,
                    erro: erro.message
                });
            }

            const prestadores = resultado.map(prestador => ({
                ...prestador,
                valor_negociavel: prestador.valor_diaria === null || prestador.valor_diaria === undefined,
                avaliacao: prestador.nota_media_avaliacoes !== null && prestador.nota_media_avaliacoes !== undefined
                    ? Number(prestador.nota_media_avaliacoes) : prestador.avaliacao,
                total_avaliacoes: Number(prestador.total_notas_avaliacoes) > 0
                    ? Number(prestador.total_notas_avaliacoes) : prestador.total_avaliacoes,
                especialidades: prestador.especialidades
                    ? prestador.especialidades.split('|||')
                    : [],
                fotos: prestador.fotos
                    ? prestador.fotos.split('|||')
                    : []
            }));

            res.json(prestadores);
        }
    );

});



app.get('/servicos/anuncios', async (req, res) => {
    const servicoBusca = String(req.query.servico || '').trim();
    const cidadeBusca = String(req.query.cidade || '').trim();
    const filtros = ['s.disponivel = 1', 'p.admin_ativo = 1', 'u.ativo = 1'];
    const parametros = [];
    if (servicoBusca) {
        filtros.push('(LOWER(s.nome_servico) LIKE LOWER(?) OR LOWER(COALESCE(s.especialidades, \'\')) LIKE LOWER(?))');
        parametros.push(`%${servicoBusca}%`, `%${servicoBusca}%`);
    }
    if (cidadeBusca) {
        const partes = cidadeBusca.split(',').map(parte => parte.trim()).filter(Boolean);
        if (partes.length > 1) {
            filtros.push('(LOWER(COALESCE(s.cidade, p.cidade)) LIKE LOWER(?) AND LOWER(COALESCE(s.estado, p.estado)) LIKE LOWER(?))');
            parametros.push(`%${partes[0]}%`, `%${partes.slice(1).join(' ')}%`);
        } else {
            filtros.push('(LOWER(COALESCE(s.cidade, p.cidade)) LIKE LOWER(?) OR LOWER(COALESCE(s.estado, p.estado)) LIKE LOWER(?))');
            parametros.push(`%${cidadeBusca}%`, `%${cidadeBusca}%`);
        }
    }
    try {
        const servicos = await consultar(
            `SELECT s.id_servico, s.id_prestador, s.nome_servico, s.descricao,
                    s.valor_diaria, s.valor_negociavel, s.disponivel,
                    COALESCE(s.cidade, p.cidade) AS cidade,
                    COALESCE(s.estado, p.estado) AS estado,
                    s.especialidades, p.verificado, p.admin_ativo,
                    p.valor_diaria AS valor_diaria_perfil, p.avaliacao, p.total_avaliacoes,
                    u.nome, u.telefone, u.foto_perfil, p.foto,
                    (SELECT AVG(a.nota) FROM avaliacoes_solicitacoes a
                     WHERE a.id_prestador = p.id_prestador AND a.alvo = 'PRESTADOR'
                       AND a.nota IS NOT NULL AND a.moderacao_status = 'VISIVEL') AS nota_media_avaliacoes,
                    (SELECT COUNT(*) FROM avaliacoes_solicitacoes a
                     WHERE a.id_prestador = p.id_prestador AND a.alvo = 'PRESTADOR'
                       AND a.nota IS NOT NULL AND a.moderacao_status = 'VISIVEL') AS total_notas_avaliacoes,
                    (SELECT GROUP_CONCAT(f.url_foto ORDER BY f.id_foto SEPARATOR '|||')
                     FROM fotos_servicos f WHERE f.id_servico = s.id_servico) AS fotos,
                    (SELECT GROUP_CONCAT(fp.url_foto ORDER BY fp.id_foto SEPARATOR '|||')
                     FROM fotos_prestadores fp WHERE fp.id_prestador = p.id_prestador) AS fotos_trabalhos
             FROM servicos s
             INNER JOIN prestadores p ON p.id_prestador = s.id_prestador
             INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
             WHERE ${filtros.join(' AND ')}
             ORDER BY s.id_servico DESC`,
            parametros
        );
        const filtrosPrestadores = ['NOT EXISTS (SELECT 1 FROM servicos s WHERE s.id_prestador = p.id_prestador)', 'p.admin_ativo = 1', 'u.ativo = 1'];
        const parametrosPrestadores = [];
        if (servicoBusca) {
            filtrosPrestadores.push(`(
                LOWER(p.profissao) LIKE LOWER(?)
                OR EXISTS (
                    SELECT 1 FROM prestador_especialidade pe
                    INNER JOIN especialidades e ON e.id_especialidade = pe.id_especialidade
                    WHERE pe.id_prestador = p.id_prestador AND LOWER(e.nome) LIKE LOWER(?)
                )
            )`);
            parametrosPrestadores.push(`%${servicoBusca}%`, `%${servicoBusca}%`);
        }
        if (cidadeBusca) {
            const partes = cidadeBusca.split(',').map(parte => parte.trim()).filter(Boolean);
            if (partes.length > 1) {
                filtrosPrestadores.push('(LOWER(COALESCE(p.cidade, \'\')) LIKE LOWER(?) AND LOWER(COALESCE(p.estado, \'\')) LIKE LOWER(?))');
                parametrosPrestadores.push(`%${partes[0]}%`, `%${partes.slice(1).join(' ')}%`);
            } else {
                filtrosPrestadores.push('(LOWER(COALESCE(p.cidade, \'\')) LIKE LOWER(?) OR LOWER(COALESCE(p.estado, \'\')) LIKE LOWER(?))');
                parametrosPrestadores.push(`%${cidadeBusca}%`, `%${cidadeBusca}%`);
            }
        }
        const prestadoresSemAnuncio = await consultar(
            `SELECT p.id_prestador, NULL AS id_servico, p.profissao, p.descricao,
                    p.valor_diaria, (p.valor_diaria IS NULL) AS valor_negociavel,
                    1 AS disponivel, p.cidade, p.estado,
                    (SELECT GROUP_CONCAT(DISTINCT e.nome SEPARATOR '|||')
                     FROM prestador_especialidade pe
                     INNER JOIN especialidades e ON e.id_especialidade = pe.id_especialidade
                     WHERE pe.id_prestador = p.id_prestador) AS especialidades,
                    p.verificado, p.admin_ativo, p.valor_diaria AS valor_diaria_perfil,
                    p.avaliacao, p.total_avaliacoes, u.nome, u.telefone, u.foto_perfil, p.foto,
                    (SELECT AVG(a.nota) FROM avaliacoes_solicitacoes a
                     WHERE a.id_prestador = p.id_prestador AND a.alvo = 'PRESTADOR'
                       AND a.nota IS NOT NULL AND a.moderacao_status = 'VISIVEL') AS nota_media_avaliacoes,
                    (SELECT COUNT(*) FROM avaliacoes_solicitacoes a
                     WHERE a.id_prestador = p.id_prestador AND a.alvo = 'PRESTADOR'
                       AND a.nota IS NOT NULL AND a.moderacao_status = 'VISIVEL') AS total_notas_avaliacoes,
                    NULL AS fotos,
                    (SELECT GROUP_CONCAT(fp.url_foto ORDER BY fp.id_foto SEPARATOR '|||')
                     FROM fotos_prestadores fp WHERE fp.id_prestador = p.id_prestador) AS fotos_trabalhos
             FROM prestadores p
             INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
             WHERE ${filtrosPrestadores.join(' AND ')}
             ORDER BY p.id_prestador DESC`,
            parametrosPrestadores
        );
        const anuncios = servicos.map(item => ({
            ...item,
            id_servico: Number(item.id_servico),
            id_prestador: Number(item.id_prestador),
            profissao: item.nome_servico,
            valor_negociavel: Number(item.valor_negociavel) === 1,
            avaliacao: item.nota_media_avaliacoes !== null && item.nota_media_avaliacoes !== undefined
                ? Number(item.nota_media_avaliacoes) : item.avaliacao,
            total_avaliacoes: Number(item.total_notas_avaliacoes) > 0
                ? Number(item.total_notas_avaliacoes) : Number(item.total_avaliacoes) || 0,
            especialidades: normalizarListaEspecialidades(item.especialidades),
            fotos: dividirListaAgregada(item.fotos),
            fotos_trabalhos: dividirListaAgregada(item.fotos_trabalhos)
        }));
        const perfisSemAnuncio = prestadoresSemAnuncio.map(item => ({
            ...item,
            id_prestador: Number(item.id_prestador),
            id_servico: null,
            valor_negociavel: Number(item.valor_negociavel) === 1,
            avaliacao: item.nota_media_avaliacoes !== null && item.nota_media_avaliacoes !== undefined
                ? Number(item.nota_media_avaliacoes) : item.avaliacao,
            total_avaliacoes: Number(item.total_notas_avaliacoes) > 0
                ? Number(item.total_notas_avaliacoes) : Number(item.total_avaliacoes) || 0,
            especialidades: normalizarListaEspecialidades(dividirListaAgregada(item.especialidades)),
            fotos: [],
            fotos_trabalhos: dividirListaAgregada(item.fotos_trabalhos)
        }));
        return res.json([...anuncios, ...perfisSemAnuncio]);
    } catch (erro) {
        console.error('ERRO AO LISTAR ANUNCIOS DE SERVICOS:', erro.code || erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Nao foi possivel carregar os servicos.' });
    }
});

// ===============================
// LISTAR EQUIPAMENTOS
// ===============================


app.get('/equipamentos', (req, res) => {
    console.log("ROTA EQUIPAMENTOS REGISTRADA!");

    db.query(
        `
        SELECT
            e.*,
            MAX(u.nome) AS nome,
            MAX(p.id_usuario) AS id_usuario_prestador,
            MAX(COALESCE(e.cidade, p.cidade)) AS cidade,
            MAX(COALESCE(e.estado, p.estado)) AS estado,
            (SELECT AVG(av.nota) FROM avaliacoes_solicitacoes av
             WHERE av.id_equipamento = e.id_equipamento AND av.alvo = 'EQUIPAMENTO' AND av.nota IS NOT NULL AND av.moderacao_status = 'VISIVEL') AS nota_media_avaliacoes,
            (SELECT COUNT(*) FROM avaliacoes_solicitacoes av
             WHERE av.id_equipamento = e.id_equipamento AND av.alvo = 'EQUIPAMENTO' AND av.nota IS NOT NULL AND av.moderacao_status = 'VISIVEL') AS total_notas_avaliacoes,
            GROUP_CONCAT(
                DISTINCT f.url_foto
                ORDER BY f.id_foto
                SEPARATOR '|||'
            ) AS fotos

        FROM equipamentos e

        INNER JOIN prestadores p
            ON e.id_prestador = p.id_prestador

        INNER JOIN usuarios u
            ON p.id_usuario = u.id_usuario

        LEFT JOIN fotos_equipamentos f
            ON e.id_equipamento = f.id_equipamento

            WHERE e.admin_visivel = 1 AND e.disponivel = 1 AND u.ativo = 1 AND p.admin_ativo = 1
        GROUP BY e.id_equipamento

        ORDER BY e.id_equipamento DESC
        `,

        (erro, resultado) => {

            if (erro) {
                console.error("ERRO EQUIPAMENTOS:", erro);

                return res.status(500).json({
                    sucesso: false,
                    erro
                });
            }

            const equipamentos = resultado.map(equipamento => ({
                ...equipamento,
                avaliacao: equipamento.nota_media_avaliacoes === null ? null : Number(equipamento.nota_media_avaliacoes),
                total_avaliacoes: Number(equipamento.total_notas_avaliacoes) || 0,
                fotos: equipamento.fotos
                    ? equipamento.fotos.split('|||')
                    : []
            }));

            res.json(equipamentos);

        }
    );

});



// ===============================
// CADASTRO DE EQUIPAMENTO
// ===============================
// O site envia id_usuario.
// O backend encontra automaticamente
// o id_prestador correspondente.
// ===============================



// ===============================
// CADASTRO DE EQUIPAMENTO
// ===============================

app.post('/cadastro-equipamento', autenticar, upload.array('fotos', 5), async (req, res) => {
    const { id_usuario, nome_equipamento, tipo_equipamento, descricao, valor_diaria, quantidade } = req.body;
    if (Number(id_usuario) !== req.usuarioAutenticado.id_usuario) {
        removerUploadsRecebidos(req);
        return res.status(403).json({ sucesso: false, mensagem: 'Voce so pode cadastrar anuncios na sua conta.' });
    }

    let caminhosEnviados = [];
    let conexao;
    let transacaoAtiva = false;
    try {
        const prestadores = await consultar('SELECT id_prestador, cidade, estado FROM prestadores WHERE id_usuario = ?', [id_usuario]);
        if (!prestadores.length) {
            removerUploadsRecebidos(req);
            return res.status(404).json({ sucesso: false, mensagem: 'Profissional nao encontrado.' });
        }
        const sequencia = await consultar('INSERT INTO equipamentos_id_seq () VALUES ()');
        const idEquipamento = Number(sequencia.insertId);
        caminhosEnviados = await guardarImagensNoSupabase(req.files || [], 'equipamento', idEquipamento);

        conexao = await db.promise().getConnection();
        await conexao.beginTransaction();
        transacaoAtiva = true;
        await consultarNaConexao(conexao,
            'INSERT INTO equipamentos (id_equipamento, id_prestador, nome_equipamento, tipo_equipamento, descricao, valor_diaria, quantidade, disponivel, cidade, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [idEquipamento, prestadores[0].id_prestador, nome_equipamento, tipo_equipamento, descricao, valor_diaria, quantidade, 1,
                String(req.body.cidade || prestadores[0].cidade || '').trim() || null,
                String(req.body.estado || prestadores[0].estado || '').trim() || null]);
        for (const caminho of caminhosEnviados) await salvarReferenciaFotoEquipamento(idEquipamento, caminho, conexao);
        await conexao.commit();
        transacaoAtiva = false;
        removerUploadsRecebidos(req);
        return res.json({ sucesso: true, id_equipamento: idEquipamento, quantidade_fotos: caminhosEnviados.length });
    } catch (erro) {
        if (transacaoAtiva && conexao) await conexao.rollback().catch(() => {});
        removerUploadsRecebidos(req);
        for (const caminho of caminhosEnviados) {
            try { await removerFotoPrestadorSeSemReferencias(caminho, 'equipamento', idEquipamento); }
            catch (erroLimpeza) { console.error('FALHA AO LIMPAR IMAGEM DE EQUIPAMENTO:', erroLimpeza.code || 'ERRO'); }
        }
        if (erro.code === 'IMAGE_INVALID_FILE') return res.status(400).json({ sucesso: false, mensagem: erro.message });
        console.error('ERRO AO CADASTRAR EQUIPAMENTO:', erro.code || erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Nao foi possivel cadastrar o equipamento e suas imagens.' });
    } finally {
        if (conexao) conexao.release();
    }
});
// ===============================
// INICIAR SERVIDOR
// ===============================

// ===============================
// MEUS ANÚNCIOS
// ===============================
console.log("ROTA MEUS-ANUNCIOS REGISTRADA!");

app.get('/meus-anuncios/:id_usuario', autenticar, (req, res) => {

    const idUsuario = Number(req.params.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
        return res.status(400).json({
            sucesso: false,
            mensagem: "ID de usuário inválido."
        });
    }

    if (idUsuario !== req.usuarioAutenticado.id_usuario) {
        return res.status(403).json({ sucesso: false, mensagem: 'Acesso não autorizado.' });
    }

    // Buscar o perfil profissional
    db.query(
        `
        SELECT
            p.id_prestador,
            p.profissao,
            p.cidade,
            p.estado,
            p.valor_diaria,
            p.descricao,

            (
                SELECT GROUP_CONCAT(
                    f.url_foto
                    ORDER BY f.id_foto
                    SEPARATOR '|||'
                )
                FROM fotos_prestadores f
                WHERE f.id_prestador = p.id_prestador
            ) AS fotos

        FROM prestadores p
        WHERE p.id_usuario = ?
        `,
        [idUsuario],

        (erro, resultadoPrestador) => {

            if (erro) {
                console.error("ERRO AO BUSCAR PERFIL:", erro);

                return res.status(500).json({
                    sucesso: false,
                    mensagem: "Erro ao buscar perfil profissional."
                });
            }

            const prestador = resultadoPrestador[0] || null;

            // Se não for profissional, não terá equipamentos
            if (!prestador) {
                return res.json({
                    sucesso: true,
                    prestador: null,
                    equipamentos: [],
                    servicos: []
                });
            }

            prestador.valor_negociavel = prestador.valor_diaria === null || prestador.valor_diaria === undefined;

            prestador.fotos = prestador.fotos
                ? prestador.fotos.split('|||')
                : [];

            // Buscar equipamentos cadastrados pelo profissional
            db.query(
                `
                SELECT
                    e.*,
                    COALESCE(e.cidade, (SELECT p2.cidade FROM prestadores p2 WHERE p2.id_prestador = e.id_prestador)) AS cidade_anuncio,
                    COALESCE(e.estado, (SELECT p2.estado FROM prestadores p2 WHERE p2.id_prestador = e.id_prestador)) AS estado_anuncio,

                    (
                        SELECT GROUP_CONCAT(
                            DISTINCT f.url_foto
                            ORDER BY f.id_foto
                            SEPARATOR '|||'
                        )
                        FROM fotos_equipamentos f
                        WHERE f.id_equipamento = e.id_equipamento
                    ) AS fotos

                FROM equipamentos e
                WHERE e.id_prestador = ?
                ORDER BY e.id_equipamento DESC
                `,
                [prestador.id_prestador],

                (erroEquipamentos, resultadoEquipamentos) => {

                    if (erroEquipamentos) {
                        console.error(
                            "ERRO AO BUSCAR EQUIPAMENTOS:",
                            erroEquipamentos
                        );

                        return res.status(500).json({
                            sucesso: false,
                            mensagem: "Erro ao buscar equipamentos."
                        });
                    }

                    const equipamentos = resultadoEquipamentos.map(e => ({
                        ...e,
                        fotos: e.fotos ? e.fotos.split('|||') : []
                    }));

                    db.query(
                        `SELECT s.*,
                                (SELECT GROUP_CONCAT(f.url_foto ORDER BY f.id_foto SEPARATOR '|||')
                                 FROM fotos_servicos f WHERE f.id_servico = s.id_servico) AS fotos
                         FROM servicos s WHERE s.id_prestador = ? ORDER BY s.id_servico DESC`,
                        [prestador.id_prestador],
                        (erroServicos, resultadoServicos) => {
                            if (erroServicos) {
                                console.error('ERRO AO BUSCAR SERVIÇOS:', erroServicos.code || erroServicos.message);
                                return res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar serviços.' });
                            }
                            const servicos = resultadoServicos.map(servico => ({
                                ...servico,
                                valor_negociavel: Number(servico.valor_negociavel) === 1,
                                especialidades: normalizarListaEspecialidades(servico.especialidades),
                                fotos: dividirListaAgregada(servico.fotos)
                            }));
                            res.json({ sucesso: true, prestador, equipamentos, servicos });
                        }
                    );

                }
            );

        }
    );

});

function middlewareUploadServicos(req, res, next) {
    upload.array('fotos', 5)(req, res, erro => {
        if (!erro) return next();
        removerUploadsRecebidos(req);
        const mensagem = erro.code === 'LIMIT_FILE_SIZE'
            ? 'Cada imagem deve ter no máximo 5 MB.'
            : erro.code === 'LIMIT_UNEXPECTED_FILE'
                ? 'O serviço pode ter no máximo cinco fotos.'
                : erro.message || 'Não foi possível receber as imagens.';
        return res.status(400).json({ sucesso: false, mensagem });
    });
}

function validarDadosServico(corpo = {}) {
    const nome = String(corpo.nome_servico || '').trim();
    const descricao = String(corpo.descricao || '').trim();
    const cidade = String(corpo.cidade || '').trim();
    const estado = String(corpo.estado || '').trim();
    const negociavel = ['1', 'true', 'on'].includes(String(corpo.valor_negociavel || '').toLowerCase());
    const valor = negociavel || String(corpo.valor_diaria ?? '').trim() === '' ? null : Number(corpo.valor_diaria);
    const especialidades = normalizarListaEspecialidades(corpo.especialidades);
    if (!nome || nome.length > 100 || descricao.length > 4000 || !cidade || cidade.length > 100 || !estado || estado.length > 50 ||
        (!negociavel && (!Number.isFinite(valor) || valor < 0 || valor > 99999999.99)) || especialidades.length > 10) return null;
    return { nome, descricao, cidade, estado, negociavel, valor, especialidades };
}

async function buscarServicoDoUsuario(idServico, idUsuario) {
    const linhas = await consultar(
        `SELECT s.id_servico, s.id_prestador FROM servicos s
         INNER JOIN prestadores p ON p.id_prestador = s.id_prestador
         WHERE s.id_servico = ? AND p.id_usuario = ? LIMIT 1`,
        [idServico, idUsuario]
    );
    return linhas[0] || null;
}

async function salvarFotoServico(idServico, caminho, conexao) {
    const sequencia = await consultarNaConexao(conexao, 'INSERT INTO fotos_servicos_id_seq () VALUES ()');
    await consultarNaConexao(conexao,
        'INSERT INTO fotos_servicos (id_foto, id_servico, url_foto) VALUES (?, ?, ?)',
        [sequencia.insertId, idServico, caminho]);
}

app.post('/servicos', autenticar, middlewareUploadServicos, async (req, res) => {
    const dados = validarDadosServico(req.body);
    if (!dados) { removerUploadsRecebidos(req); return res.status(400).json({ sucesso: false, mensagem: 'Confira os dados do serviço e o valor informado.' }); }
    if ((req.files || []).length > 5) { removerUploadsRecebidos(req); return res.status(400).json({ sucesso: false, mensagem: 'O serviço pode ter no máximo cinco fotos.' }); }
    let idServico;
    let caminhos = [];
    let conexao;
    let transacaoAtiva = false;
    try {
        if (String(req.usuarioAutenticado.tipo_usuario).toUpperCase() !== 'PRESTADOR') return res.status(403).json({ sucesso: false, mensagem: 'Somente prestadores podem cadastrar serviços.' });
        const prestadores = await consultar('SELECT id_prestador FROM prestadores WHERE id_usuario = ? LIMIT 1', [req.usuarioAutenticado.id_usuario]);
        if (!prestadores[0]) return res.status(404).json({ sucesso: false, mensagem: 'Perfil profissional não encontrado.' });
        const sequencia = await consultar('INSERT INTO servicos_id_seq () VALUES ()');
        idServico = Number(sequencia.insertId);
        caminhos = await guardarImagensNoSupabase(req.files || [], 'servico', idServico);
        conexao = await db.promise().getConnection();
        await conexao.beginTransaction(); transacaoAtiva = true;
        await consultarNaConexao(conexao,
            `INSERT INTO servicos (id_servico, id_prestador, nome_servico, descricao, valor_diaria, disponivel, cidade, estado, valor_negociavel, especialidades)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
            [idServico, prestadores[0].id_prestador, dados.nome, dados.descricao || null, dados.valor, dados.cidade, dados.estado, Number(dados.negociavel), JSON.stringify(dados.especialidades)]);
        for (const caminho of caminhos) await salvarFotoServico(idServico, caminho, conexao);
        await conexao.commit(); transacaoAtiva = false;
        removerUploadsRecebidos(req);
        return res.status(201).json({ sucesso: true, id_servico: idServico });
    } catch (erro) {
        if (transacaoAtiva && conexao) await conexao.rollback().catch(() => {});
        removerUploadsRecebidos(req);
        for (const caminho of caminhos) await removerFotoPrestadorSeSemReferencias(caminho, 'servico', idServico).catch(() => {});
        if (erro.code === 'IMAGE_INVALID_FILE') return res.status(400).json({ sucesso: false, mensagem: erro.message });
        console.error('ERRO AO CADASTRAR SERVIÇO:', erro.code || erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível cadastrar o serviço.' });
    } finally { if (conexao) conexao.release(); }
});

app.put('/servicos/:id', autenticar, middlewareUploadServicos, async (req, res) => {
    const idServico = Number(req.params.id);
    const dados = validarDadosServico(req.body);
    if (!Number.isInteger(idServico) || idServico <= 0 || !dados) { removerUploadsRecebidos(req); return res.status(400).json({ sucesso: false, mensagem: 'Confira os dados do serviço.' }); }
    let caminhosNovos = [];
    let conexao;
    let transacaoAtiva = false;
    try {
        const servico = await buscarServicoDoUsuario(idServico, req.usuarioAutenticado.id_usuario);
        if (!servico) { removerUploadsRecebidos(req); return res.status(404).json({ sucesso: false, mensagem: 'Serviço não encontrado.' }); }
        const atuais = await consultar('SELECT id_foto, url_foto FROM fotos_servicos WHERE id_servico = ? ORDER BY id_foto', [idServico]);
        let manter = [];
        try { manter = JSON.parse(req.body.fotosManter || '[]'); } catch { manter = []; }
        if (!Array.isArray(manter)) manter = [];
        const urlsManter = new Set(manter.filter(url => atuais.some(f => f.url_foto === url)));
        if (urlsManter.size + (req.files || []).length > 5) { removerUploadsRecebidos(req); return res.status(400).json({ sucesso: false, mensagem: 'O serviço pode ter no máximo cinco fotos.' }); }
        caminhosNovos = await guardarImagensNoSupabase(req.files || [], 'servico', idServico);
        conexao = await db.promise().getConnection();
        await conexao.beginTransaction(); transacaoAtiva = true;
        await consultarNaConexao(conexao,
            `UPDATE servicos SET nome_servico = ?, descricao = ?, valor_diaria = ?, cidade = ?, estado = ?, valor_negociavel = ?, especialidades = ?
             WHERE id_servico = ? AND id_prestador = ?`,
            [dados.nome, dados.descricao || null, dados.valor, dados.cidade, dados.estado, Number(dados.negociavel), JSON.stringify(dados.especialidades), idServico, servico.id_prestador]);
        const removidas = atuais.filter(f => !urlsManter.has(f.url_foto));
        for (const foto of removidas) await consultarNaConexao(conexao, 'DELETE FROM fotos_servicos WHERE id_foto = ? AND id_servico = ?', [foto.id_foto, idServico]);
        for (const caminho of caminhosNovos) await salvarFotoServico(idServico, caminho, conexao);
        await conexao.commit(); transacaoAtiva = false;
        removerUploadsRecebidos(req);
        await removerImagensLegadasOuSupabase(removidas.map(f => f.url_foto), 'servico', idServico).catch(erro => console.error('FALHA AO REMOVER FOTO ANTIGA DE SERVIÇO:', erro.code || 'ERRO'));
        return res.json({ sucesso: true });
    } catch (erro) {
        if (transacaoAtiva && conexao) await conexao.rollback().catch(() => {});
        removerUploadsRecebidos(req);
        for (const caminho of caminhosNovos) await removerFotoPrestadorSeSemReferencias(caminho, 'servico', idServico).catch(() => {});
        if (erro.code === 'IMAGE_INVALID_FILE') return res.status(400).json({ sucesso: false, mensagem: erro.message });
        console.error('ERRO AO EDITAR SERVIÇO:', erro.code || erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível atualizar o serviço.' });
    } finally { if (conexao) conexao.release(); }
});

app.patch('/servicos/:id/disponibilidade', autenticar, async (req, res) => {
    const idServico = Number(req.params.id);
    const disponivel = Number(req.body.disponivel);
    if (!Number.isInteger(idServico) || idServico <= 0 || ![0, 1].includes(disponivel)) return res.status(400).json({ sucesso: false, mensagem: 'Disponibilidade inválida.' });
    try {
        const servico = await buscarServicoDoUsuario(idServico, req.usuarioAutenticado.id_usuario);
        if (!servico) return res.status(404).json({ sucesso: false, mensagem: 'Serviço não encontrado.' });
        await consultar('UPDATE servicos SET disponivel = ? WHERE id_servico = ? AND id_prestador = ?', [disponivel, idServico, servico.id_prestador]);
        return res.json({ sucesso: true, disponivel });
    } catch (erro) {
        console.error('ERRO AO ALTERAR DISPONIBILIDADE DO SERVIÇO:', erro.code || erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível alterar a disponibilidade.' });
    }
});

app.delete('/servicos/:id', autenticar, async (req, res) => {
    const idServico = Number(req.params.id);
    if (!Number.isInteger(idServico) || idServico <= 0) return res.status(400).json({ sucesso: false, mensagem: 'Serviço inválido.' });
    try {
        const servico = await buscarServicoDoUsuario(idServico, req.usuarioAutenticado.id_usuario);
        if (!servico) return res.status(404).json({ sucesso: false, mensagem: 'Serviço não encontrado.' });
        // Desativa para preservar solicitações, avaliações e imagens ligadas ao histórico.
        await consultar('UPDATE servicos SET disponivel = 0 WHERE id_servico = ? AND id_prestador = ?', [idServico, servico.id_prestador]);
        return res.json({ sucesso: true, removido: true });
    } catch (erro) {
        console.error('ERRO AO EXCLUIR SERVIÇO:', erro.code || erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível excluir o serviço.' });
    }
});

function consultar(sql, valores = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, valores, (erro, resultado) => erro ? reject(erro) : resolve(resultado));
    });
}

function arquivoFotoEquipamento(url) {
    const nome = path.basename(String(url || ''));
    if (!/^\d+-\d+\.[a-z0-9]+$/i.test(nome)) return;
    const caminho = path.join(pastaUploads, nome);
    if (path.dirname(caminho) === pastaUploads && fs.existsSync(caminho)) fs.unlinkSync(caminho);
}

async function buscarAnuncioDoUsuario(idEquipamento, idUsuario) {
    const resultados = await consultar(
        `SELECT e.id_equipamento, e.id_prestador
         FROM equipamentos e
         INNER JOIN prestadores p ON p.id_prestador = e.id_prestador
         WHERE e.id_equipamento = ? AND p.id_usuario = ?`,
        [idEquipamento, idUsuario]
    );
    return resultados[0] || null;
}

async function salvarReferenciaFotoEquipamento(idEquipamento, caminho, conexao = null) {
    const executar = conexao ? consultarNaConexao.bind(null, conexao) : consultar;
    const sequencia = await executar('INSERT INTO fotos_equipamentos_id_seq () VALUES ()');
    await executar(
        `INSERT INTO fotos_equipamentos (id_foto, id_equipamento, url_foto) VALUES (?, ?, ?)`,
        [sequencia.insertId, idEquipamento, caminho]
    );
}

app.post('/logout', autenticar, (req, res) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    sessoes.delete(token);
    res.json({ sucesso: true });
});

app.put('/equipamentos/:id', autenticar, upload.array('fotos', 5), async (req, res) => {
    const idEquipamento = Number(req.params.id);
    const { nome_equipamento, tipo_equipamento, descricao, valor_diaria, quantidade } = req.body;
    const valor = Number(valor_diaria);
    const qtd = Number(quantidade);
    if (!Number.isInteger(idEquipamento) || idEquipamento <= 0 || !nome_equipamento?.trim() ||
        !tipo_equipamento?.trim() || !Number.isFinite(valor) || valor < 0 || !Number.isInteger(qtd) || qtd < 1) {
        removerUploadsRecebidos(req);
        return res.status(400).json({ sucesso: false, mensagem: 'Confira os dados do equipamento.' });
    }

    let conexao;
    let transacaoAtiva = false;
    let caminhosNovos = [];
    try {
        const anuncio = await buscarAnuncioDoUsuario(idEquipamento, req.usuarioAutenticado.id_usuario);
        if (!anuncio) {
            removerUploadsRecebidos(req);
            return res.status(404).json({ sucesso: false, mensagem: 'Anuncio nao encontrado.' });
        }
        const fotosAtuais = await consultar('SELECT id_foto, url_foto FROM fotos_equipamentos WHERE id_equipamento = ?', [idEquipamento]);
        let manter;
        try { manter = JSON.parse(req.body.fotosManter || '[]'); } catch { manter = []; }
        const urlsManter = new Set(Array.isArray(manter) ? manter.filter(url => fotosAtuais.some(f => f.url_foto === url)) : []);
        const novasFotos = req.files || [];
        if (urlsManter.size + novasFotos.length > 5) {
            removerUploadsRecebidos(req);
            return res.status(400).json({ sucesso: false, mensagem: 'O anuncio pode ter no maximo 5 fotos.' });
        }

        caminhosNovos = await guardarImagensNoSupabase(novasFotos, 'equipamento', idEquipamento);
        conexao = await db.promise().getConnection();
        await conexao.beginTransaction();
        transacaoAtiva = true;
        await consultarNaConexao(conexao,
            'UPDATE equipamentos SET nome_equipamento = ?, tipo_equipamento = ?, descricao = ?, valor_diaria = ?, quantidade = ?, cidade = ?, estado = ? WHERE id_equipamento = ? AND id_prestador = ?',
            [nome_equipamento.trim(), tipo_equipamento.trim(), descricao || '', valor, qtd,
                String(req.body.cidade || '').trim() || null, String(req.body.estado || '').trim() || null,
                idEquipamento, anuncio.id_prestador]);

        const fotosRemovidas = fotosAtuais.filter(foto => !urlsManter.has(foto.url_foto));
        for (const foto of fotosRemovidas) {
            await consultarNaConexao(conexao, 'DELETE FROM fotos_equipamentos WHERE id_foto = ? AND id_equipamento = ?', [foto.id_foto, idEquipamento]);
        }
        for (const caminho of caminhosNovos) {
            const sequencia = await consultarNaConexao(conexao, 'INSERT INTO fotos_equipamentos_id_seq () VALUES ()');
            await consultarNaConexao(conexao,
                'INSERT INTO fotos_equipamentos (id_foto, id_equipamento, url_foto) VALUES (?, ?, ?)',
                [sequencia.insertId, idEquipamento, caminho]);
        }
        await conexao.commit();
        transacaoAtiva = false;
        removerUploadsRecebidos(req);

        try { await removerImagensLegadasOuSupabase(fotosRemovidas.map(foto => foto.url_foto), 'equipamento', idEquipamento); }
        catch (erroLimpeza) { console.error('FALHA AO LIMPAR FOTOS SUBSTITU?DAS:', erroLimpeza.code || 'ERRO'); }
        return res.json({ sucesso: true, mensagem: 'Anuncio atualizado.' });
    } catch (erro) {
        if (transacaoAtiva && conexao) await conexao.rollback().catch(() => {});
        removerUploadsRecebidos(req);
        for (const caminho of caminhosNovos) {
            try { await removerFotoPrestadorSeSemReferencias(caminho, 'equipamento', idEquipamento); }
            catch (erroLimpeza) { console.error('FALHA AO LIMPAR UPLOAD SEM REFER?NCIA:', erroLimpeza.code || 'ERRO'); }
        }
        if (erro.code === 'IMAGE_INVALID_FILE') return res.status(400).json({ sucesso: false, mensagem: erro.message });
        console.error('ERRO AO EDITAR EQUIPAMENTO:', erro.code || erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Nao foi possivel atualizar o anuncio.' });
    } finally {
        if (conexao) conexao.release();
    }
});

app.patch('/equipamentos/:id/disponibilidade', autenticar, async (req, res) => {
    const idEquipamento = Number(req.params.id);
    const disponivel = Number(req.body.disponivel);
    if (!Number.isInteger(idEquipamento) || idEquipamento <= 0 || ![0, 1].includes(disponivel)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Disponibilidade inválida.' });
    }
    try {
        const anuncio = await buscarAnuncioDoUsuario(idEquipamento, req.usuarioAutenticado.id_usuario);
        if (!anuncio) return res.status(404).json({ sucesso: false, mensagem: 'Anúncio não encontrado.' });
        await consultar('UPDATE equipamentos SET disponivel = ? WHERE id_equipamento = ?', [disponivel, idEquipamento]);
        res.json({ sucesso: true, disponivel });
    } catch (erro) {
        console.error('ERRO AO ALTERAR DISPONIBILIDADE:', erro);
        res.status(500).json({ sucesso: false, mensagem: 'Não foi possível alterar a disponibilidade.' });
    }
});

app.delete('/equipamentos/:id', autenticar, async (req, res) => {
    const idEquipamento = Number(req.params.id);
    if (!Number.isInteger(idEquipamento) || idEquipamento <= 0)
        return res.status(400).json({ sucesso: false, mensagem: 'Anuncio invalido.' });

    try {
        const anuncio = await buscarAnuncioDoUsuario(idEquipamento, req.usuarioAutenticado.id_usuario);
        if (!anuncio) return res.status(404).json({ sucesso: false, mensagem: 'Anuncio nao encontrado.' });
        await consultar('UPDATE equipamentos SET disponivel = 0 WHERE id_equipamento = ? AND id_prestador = ?', [idEquipamento, anuncio.id_prestador]);
        return res.json({ sucesso: true, removido: true, disponivel: 0, preservado: true });
    } catch (erro) {
        console.error('ERRO AO EXCLUIR EQUIPAMENTO:', erro.code || erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Nao foi possivel excluir o anuncio.' });
    }
});

async function buscarParticipacaoConversa(idConversa, idUsuario) {
    const conversas = await consultar(
        `SELECT c.id_conversa, c.id_cliente, c.id_prestador,
                p.id_usuario AS id_usuario_prestador
         FROM conversas c
         INNER JOIN prestadores p ON p.id_prestador = c.id_prestador
         WHERE c.id_conversa = ?
           AND (c.id_cliente = ? OR p.id_usuario = ?)
         LIMIT 1`,
        [idConversa, idUsuario, idUsuario]
    );
    return conversas[0] || null;
}

app.post('/conversas', autenticar, async (req, res) => {
    const idUsuario = req.usuarioAutenticado.id_usuario;
    const idPrestador = Number(req.body.id_prestador);
    if (!Number.isInteger(idPrestador) || idPrestador <= 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'Selecione um profissional válido.' });
    }

    try {
        const usuarios = await consultar('SELECT tipo_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1', [idUsuario]);
        if (!usuarios[0] || String(usuarios[0].tipo_usuario).toUpperCase() !== 'CLIENTE') {
            return res.status(403).json({ sucesso: false, mensagem: 'Somente contratantes podem iniciar uma conversa com um prestador.' });
        }

        const prestadores = await consultar(
            `SELECT p.id_usuario, p.admin_ativo, u.tipo_usuario, u.ativo
             FROM prestadores p
             INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
             WHERE p.id_prestador = ? LIMIT 1`,
            [idPrestador]
        );
        if (!prestadores[0] || Number(prestadores[0].admin_ativo) !== 1 || Number(prestadores[0].ativo) !== 1) return res.status(404).json({ sucesso: false, mensagem: 'Profissional não encontrado.' });
        const idUsuarioPrestador = Number(prestadores[0].id_usuario);
        if (idUsuarioPrestador === idUsuario || String(prestadores[0].tipo_usuario).toUpperCase() !== 'PRESTADOR') {
            return res.status(400).json({ sucesso: false, mensagem: 'Não é possível iniciar conversa com este perfil.' });
        }

        const existentes = await consultar(
            `SELECT id_conversa FROM conversas
             WHERE id_cliente = ? AND id_prestador = ? LIMIT 1`,
            [idUsuario, idPrestador]
        );
        if (existentes[0]) return res.json({ sucesso: true, id_conversa: existentes[0].id_conversa, existente: true });

        const sequencia = await consultar('INSERT INTO conversas_id_seq () VALUES ()');
        try {
            await consultar(
                `INSERT INTO conversas (id_conversa, id_cliente, id_prestador)
                 VALUES (?, ?, ?)`,
                [sequencia.insertId, idUsuario, idPrestador]
            );
            return res.status(201).json({ sucesso: true, id_conversa: sequencia.insertId, existente: false });
        } catch (erroInsercao) {
            if (erroInsercao.code !== 'ER_DUP_ENTRY') throw erroInsercao;
            const conversaCriada = await consultar(
                `SELECT id_conversa FROM conversas
                 WHERE id_cliente = ? AND id_prestador = ? LIMIT 1`,
                [idUsuario, idPrestador]
            );
            if (!conversaCriada[0]) throw erroInsercao;
            return res.json({ sucesso: true, id_conversa: conversaCriada[0].id_conversa, existente: true });
        }
    } catch (erro) {
        console.error('ERRO AO INICIAR CONVERSA:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível iniciar a conversa.' });
    }
});

app.get('/conversas', autenticar, async (req, res) => {
    const idUsuario = req.usuarioAutenticado.id_usuario;
    try {
        const conversas = await consultar(
            `SELECT
                c.id_conversa,
                c.id_cliente,
                c.id_prestador,
                u.nome AS nome_participante,
                u.tipo_usuario AS tipo_participante,
                CASE
                    WHEN u.id_usuario = p.id_usuario THEN COALESCE(NULLIF(u.foto_perfil, ''), p.foto)
                    ELSE u.foto_perfil
                END AS foto_participante,
                CASE WHEN u.id_usuario = p.id_usuario THEN p.profissao ELSE NULL END AS profissao_participante,
                CASE WHEN u.id_usuario = p.id_usuario THEN p.cidade ELSE NULL END AS cidade_participante,
                CASE WHEN u.id_usuario = p.id_usuario THEN p.estado ELSE NULL END AS estado_participante,
                CASE WHEN u.id_usuario = p.id_usuario THEN p.descricao ELSE u.descricao END AS descricao_participante,
                CASE WHEN u.id_usuario = p.id_usuario THEN p.avaliacao ELSE NULL END AS avaliacao_participante,
                CASE WHEN u.id_usuario = p.id_usuario THEN p.total_avaliacoes ELSE NULL END AS total_avaliacoes_participante,
                (SELECT m.mensagem FROM mensagens m WHERE m.id_conversa = c.id_conversa ORDER BY m.id_mensagem DESC LIMIT 1) AS ultima_mensagem,
                (SELECT m.data_envio FROM mensagens m WHERE m.id_conversa = c.id_conversa ORDER BY m.id_mensagem DESC LIMIT 1) AS ultima_mensagem_em,
                (SELECT COUNT(*) FROM mensagens m WHERE m.id_conversa = c.id_conversa AND m.id_remetente <> ? AND m.lida = 0) AS nao_lidas,
                c.data_criacao AS criada_em
             FROM conversas c
             INNER JOIN prestadores p ON p.id_prestador = c.id_prestador
             INNER JOIN usuarios u ON u.id_usuario = CASE
                WHEN c.id_cliente = ? THEN p.id_usuario
                ELSE c.id_cliente
             END
             WHERE c.id_cliente = ? OR p.id_usuario = ?
             ORDER BY COALESCE(
                (SELECT MAX(m.data_envio) FROM mensagens m WHERE m.id_conversa = c.id_conversa),
                c.data_criacao
             ) DESC`,
            [idUsuario, idUsuario, idUsuario, idUsuario]
        );
        res.json({ sucesso: true, conversas });
    } catch (erro) {
        console.error('ERRO AO LISTAR CONVERSAS:', erro);
        res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar suas conversas.' });
    }
});

app.get('/conversas/:id/mensagens', autenticar, async (req, res) => {
    const idConversa = Number(req.params.id);
    const idUsuario = req.usuarioAutenticado.id_usuario;
    const depois = Number(req.query.depois);
    const antes = Number(req.query.antes);
    if (!Number.isInteger(idConversa) || idConversa <= 0 ||
        (req.query.depois && (!Number.isInteger(depois) || depois <= 0)) ||
        (req.query.antes && (!Number.isInteger(antes) || antes <= 0))) {
        return res.status(400).json({ sucesso: false, mensagem: 'Conversa ou paginação inválida.' });
    }

    try {
        const conversa = await buscarParticipacaoConversa(idConversa, idUsuario);
        if (!conversa) return res.status(404).json({ sucesso: false, mensagem: 'Conversa não encontrada.' });

        await consultar(
            `UPDATE mensagens SET lida = 1
             WHERE id_conversa = ? AND id_remetente <> ? AND lida = 0`,
            [idConversa, idUsuario]
        );

        let mensagens;
        let temMais = false;
        if (req.query.antes) {
            mensagens = await consultar(
                `SELECT m.id_mensagem, m.id_conversa, m.id_remetente, u.nome AS nome_remetente,
                        m.mensagem AS conteudo, m.data_envio AS criada_em, m.lida
                 FROM mensagens m INNER JOIN usuarios u ON u.id_usuario = m.id_remetente
                 WHERE m.id_conversa = ? AND m.id_mensagem < ?
                 ORDER BY m.id_mensagem DESC LIMIT 51`,
                [idConversa, antes]
            );
            temMais = mensagens.length > 50;
            if (temMais) mensagens.pop();
            mensagens.reverse();
        } else if (req.query.depois) {
            mensagens = await consultar(
                `SELECT m.id_mensagem, m.id_conversa, m.id_remetente, u.nome AS nome_remetente,
                        m.mensagem AS conteudo, m.data_envio AS criada_em, m.lida
                 FROM mensagens m INNER JOIN usuarios u ON u.id_usuario = m.id_remetente
                 WHERE m.id_conversa = ? AND m.id_mensagem > ?
                 ORDER BY m.id_mensagem ASC LIMIT 100`,
                [idConversa, depois]
            );
        } else {
            mensagens = await consultar(
                `SELECT m.id_mensagem, m.id_conversa, m.id_remetente, u.nome AS nome_remetente,
                        m.mensagem AS conteudo, m.data_envio AS criada_em, m.lida
                 FROM mensagens m INNER JOIN usuarios u ON u.id_usuario = m.id_remetente
                 WHERE m.id_conversa = ?
                 ORDER BY m.id_mensagem DESC LIMIT 51`,
                [idConversa]
            );
            temMais = mensagens.length > 50;
            if (temMais) mensagens.pop();
            mensagens.reverse();
        }

        res.json({ sucesso: true, mensagens, tem_mais: temMais });
    } catch (erro) {
        console.error('ERRO AO CARREGAR MENSAGENS:', erro);
        res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar as mensagens.' });
    }
});

app.post('/conversas/:id/mensagens', autenticar, async (req, res) => {
    const idConversa = Number(req.params.id);
    const idUsuario = req.usuarioAutenticado.id_usuario;
    const conteudo = String(req.body.conteudo || '').trim();
    if (!Number.isInteger(idConversa) || idConversa <= 0 || !conteudo || conteudo.length > 2000) {
        return res.status(400).json({ sucesso: false, mensagem: 'A mensagem deve ter entre 1 e 2000 caracteres.' });
    }

    try {
        const conversa = await buscarParticipacaoConversa(idConversa, idUsuario);
        if (!conversa) return res.status(404).json({ sucesso: false, mensagem: 'Conversa não encontrada.' });
        const sequencia = await consultar('INSERT INTO mensagens_id_seq () VALUES ()');
        await consultar(
            `INSERT INTO mensagens (id_mensagem, id_conversa, id_remetente, mensagem, lida)
             VALUES (?, ?, ?, ?, 0)`,
            [sequencia.insertId, idConversa, idUsuario, conteudo]
        );
        res.status(201).json({ sucesso: true, id_mensagem: sequencia.insertId });
    } catch (erro) {
        console.error('ERRO AO ENVIAR MENSAGEM:', erro);
        res.status(500).json({ sucesso: false, mensagem: 'Não foi possível enviar a mensagem.' });
    }
});

app.delete('/conversas/:id/mensagens/:id_mensagem', autenticar, async (req, res) => {
    const idConversa = Number(req.params.id);
    const idMensagem = Number(req.params.id_mensagem);
    const idUsuario = req.usuarioAutenticado.id_usuario;
    if (!Number.isInteger(idConversa) || idConversa <= 0 ||
        !Number.isInteger(idMensagem) || idMensagem <= 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'Conversa ou mensagem inválida.' });
    }

    try {
        const conversa = await buscarParticipacaoConversa(idConversa, idUsuario);
        if (!conversa) return res.status(404).json({ sucesso: false, mensagem: 'Conversa não encontrada.' });
        const resultado = await consultar(
            `DELETE FROM mensagens
             WHERE id_mensagem = ? AND id_conversa = ? AND id_remetente = ?`,
            [idMensagem, idConversa, idUsuario]
        );
        if (!resultado.affectedRows) {
            return res.status(404).json({ sucesso: false, mensagem: 'Mensagem não encontrada ou não enviada por você.' });
        }
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('ERRO AO EXCLUIR MENSAGEM:', erro);
        res.status(500).json({ sucesso: false, mensagem: 'Não foi possível excluir a mensagem.' });
    }
});

function dataISOValida(valor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) return false;
    const data = new Date(`${valor}T00:00:00.000Z`);
    return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function hojeEmSaoPaulo() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${valores.year}-${valores.month}-${valores.day}`;
}

async function consultarNaConexao(conexao, sql, valores = []) {
    const [resultado] = await conexao.query(sql, valores);
    return resultado;
}

async function obterOuCriarConversaNaConexao(conexao, idCliente, idPrestador) {
    const existentes = await consultarNaConexao(
        conexao,
        'SELECT id_conversa FROM conversas WHERE id_cliente = ? AND id_prestador = ? LIMIT 1',
        [idCliente, idPrestador]
    );
    if (existentes[0]) return Number(existentes[0].id_conversa);

    const sequencia = await consultarNaConexao(conexao, 'INSERT INTO conversas_id_seq () VALUES ()');
    try {
        await consultarNaConexao(
            conexao,
            'INSERT INTO conversas (id_conversa, id_cliente, id_prestador) VALUES (?, ?, ?)',
            [sequencia.insertId, idCliente, idPrestador]
        );
        return Number(sequencia.insertId);
    } catch (erro) {
        if (erro.code !== 'ER_DUP_ENTRY') throw erro;
        const conversaCriada = await consultarNaConexao(
            conexao,
            'SELECT id_conversa FROM conversas WHERE id_cliente = ? AND id_prestador = ? LIMIT 1',
            [idCliente, idPrestador]
        );
        if (!conversaCriada[0]) throw erro;
        return Number(conversaCriada[0].id_conversa);
    }
}

async function tipoContaUsuario(idUsuario) {
    const usuarios = await consultar('SELECT tipo_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1', [idUsuario]);
    return usuarios[0]?.tipo_usuario || null;
}

app.post('/solicitacoes', autenticar, async (req, res) => {
    const idCliente = req.usuarioAutenticado.id_usuario;
    const corpo = req.body || {};
    const tipo = String(corpo.tipo || '').trim().toUpperCase();
    const idempotencia = String(corpo.idempotencia || '').trim();
    const tituloRecebido = String(corpo.titulo || '').trim();
    const descricao = String(corpo.descricao || '').trim();
    const local = String(corpo.local_atendimento || '').trim();
    const observacoes = String(corpo.observacoes || '').trim();
    const dataInicio = String(corpo.data_inicio || '').trim();
    const dataFim = String(corpo.data_fim || '').trim();
    const quantidadeRecebida = corpo.quantidade;
    const idPrestadorRecebido = Number(corpo.id_prestador);
    const idServicoRecebido = Number(corpo.id_servico);
    const idEquipamentoRecebido = Number(corpo.id_equipamento);

    if (!['SERVICO', 'EQUIPAMENTO'].includes(tipo) ||
        !/^[\w-]{16,64}$/.test(idempotencia) ||
        !descricao || descricao.length > 4000 || !local || local.length > 255 ||
        !dataISOValida(dataInicio) || dataInicio < hojeEmSaoPaulo() ||
        observacoes.length > 2000) {
        return res.status(400).json({ sucesso: false, mensagem: 'Confira os dados obrigatórios da solicitação.' });
    }

    if (tipo === 'SERVICO' && (((!Number.isInteger(idServicoRecebido) || idServicoRecebido <= 0) &&
        (!Number.isInteger(idPrestadorRecebido) || idPrestadorRecebido <= 0)) ||
        tituloRecebido.length > 150 || dataFim)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Informe o serviço, o profissional e a data prevista.' });
    }

    const quantidade = tipo === 'EQUIPAMENTO' ? Number(quantidadeRecebida) : 1;
    if (tipo === 'EQUIPAMENTO' && (!Number.isInteger(idEquipamentoRecebido) || idEquipamentoRecebido <= 0 ||
        !Number.isInteger(quantidade) || quantidade < 1 || !dataISOValida(dataFim) || dataFim < dataInicio)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Informe o período e a quantidade válidos para o aluguel.' });
    }

    let conexao;
    let transacaoAtiva = false;
    try {
        const papel = String(await tipoContaUsuario(idCliente) || '').toUpperCase();
        if (papel !== 'CLIENTE') {
            return res.status(403).json({ sucesso: false, mensagem: 'Somente contratantes podem enviar solicitações.' });
        }

        conexao = await db.promise().getConnection();
        await conexao.beginTransaction();
        transacaoAtiva = true;

        const anterior = await consultarNaConexao(
            conexao,
            'SELECT id_solicitacao, id_conversa FROM solicitacoes WHERE id_cliente = ? AND chave_idempotencia = ? LIMIT 1',
            [idCliente, idempotencia]
        );
        if (anterior[0]) {
            await conexao.commit();
            transacaoAtiva = false;
            return res.json({ sucesso: true, id_solicitacao: anterior[0].id_solicitacao, id_conversa: anterior[0].id_conversa, duplicada: true });
        }

        let idPrestador = idPrestadorRecebido;
        let idEquipamento = null;
        let idServico = null;
        let titulo = tituloRecebido;
        let valorDiaria = null;

        if (tipo === 'SERVICO') {
            const prestadores = idServicoRecebido > 0
                ? await consultarNaConexao(conexao,
                    `SELECT s.id_servico, s.id_prestador, s.nome_servico, s.valor_diaria, s.valor_negociavel,
                            s.disponivel AS servico_disponivel, p.id_usuario, p.admin_ativo, u.tipo_usuario, u.ativo
                     FROM servicos s INNER JOIN prestadores p ON p.id_prestador = s.id_prestador
                     INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
                     WHERE s.id_servico = ? FOR UPDATE`, [idServicoRecebido])
                : await consultarNaConexao(conexao,
                    `SELECT p.id_prestador, p.id_usuario, p.admin_ativo, u.tipo_usuario, u.ativo
                     FROM prestadores p INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
                     WHERE p.id_prestador = ? LIMIT 1`, [idPrestador]);
            const prestadorAlvo = prestadores[0];
            if (!prestadorAlvo || String(prestadorAlvo.tipo_usuario).toUpperCase() !== 'PRESTADOR' || Number(prestadorAlvo.admin_ativo) !== 1 || Number(prestadorAlvo.ativo) !== 1 || (idServicoRecebido > 0 && Number(prestadorAlvo.servico_disponivel) !== 1)) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(404).json({ sucesso: false, mensagem: 'Profissional não encontrado.' });
            }
            if (Number(prestadorAlvo.id_usuario) === idCliente) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(400).json({ sucesso: false, mensagem: 'Você não pode solicitar um serviço para si mesmo.' });
            }
            idPrestador = Number(prestadorAlvo.id_prestador);
            if (idServicoRecebido > 0) {
                idServico = Number(prestadorAlvo.id_servico);
                titulo = String(prestadorAlvo.nome_servico);
                valorDiaria = Number(prestadorAlvo.valor_negociavel) === 1 ? null : prestadorAlvo.valor_diaria;
            } else if (!tituloRecebido) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(400).json({ sucesso: false, mensagem: 'Informe o serviço desejado.' });
            }
        } else {
            const equipamentos = await consultarNaConexao(
                conexao,
                `SELECT e.id_equipamento, e.id_prestador, e.nome_equipamento, e.quantidade,
                        e.disponivel, e.admin_visivel, e.valor_diaria, p.id_usuario, p.admin_ativo, u.ativo, u.tipo_usuario
                 FROM equipamentos e
                 INNER JOIN prestadores p ON p.id_prestador = e.id_prestador
                 INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
                 WHERE e.id_equipamento = ? FOR UPDATE`,
                [idEquipamentoRecebido]
            );
            if (!equipamentos[0]) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(404).json({ sucesso: false, mensagem: 'Equipamento não encontrado.' });
            }
            const equipamento = equipamentos[0];
            if (String(equipamento.tipo_usuario).toUpperCase() !== 'PRESTADOR' || Number(equipamento.admin_visivel) !== 1 || Number(equipamento.admin_ativo) !== 1 || Number(equipamento.ativo) !== 1) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(404).json({ sucesso: false, mensagem: 'Equipamento não encontrado.' });
            }
            if (Number(equipamento.id_usuario) === idCliente) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(400).json({ sucesso: false, mensagem: 'Você não pode solicitar seu próprio equipamento.' });
            }
            if (Number(equipamento.disponivel) !== 1 || quantidade > Number(equipamento.quantidade || 0)) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(409).json({ sucesso: false, mensagem: 'O equipamento não está disponível na quantidade solicitada.' });
            }
            const reservas = await consultarNaConexao(
                conexao,
                `SELECT quantidade
                 FROM solicitacoes
                 WHERE id_equipamento = ? AND status IN ('ACEITA', 'EM_ANDAMENTO')
                   AND data_inicio <= ? AND data_fim >= ?
                 ORDER BY id_solicitacao FOR UPDATE`,
                [idEquipamentoRecebido, dataFim, dataInicio]
            );
            const quantidadeReservada = reservas.reduce((total, reserva) => total + Number(reserva.quantidade || 0), 0);
            if (quantidadeReservada + quantidade > Number(equipamento.quantidade || 0)) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(409).json({ sucesso: false, mensagem: 'A quantidade solicitada não está livre para todo esse período.' });
            }
            idPrestador = Number(equipamento.id_prestador);
            idEquipamento = Number(equipamento.id_equipamento);
            titulo = String(equipamento.nome_equipamento);
            valorDiaria = equipamento.valor_diaria;
        }

        const idConversa = await obterOuCriarConversaNaConexao(conexao, idCliente, idPrestador);
        const sequencia = await consultarNaConexao(conexao, 'INSERT INTO solicitacoes_id_seq () VALUES ()');
        await consultarNaConexao(
            conexao,
            `INSERT INTO solicitacoes
                (id_solicitacao, chave_idempotencia, id_cliente, id_prestador, id_equipamento, id_servico,
                 id_conversa, tipo, titulo, descricao, local_atendimento, data_inicio, data_fim,
                 quantidade, valor_diaria, observacoes, status, cliente_visualizou_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGUARDANDO_RESPOSTA', CURRENT_TIMESTAMP)`,
            [sequencia.insertId, idempotencia, idCliente, idPrestador, idEquipamento, idServico, idConversa,
                tipo, titulo, descricao, local, dataInicio, tipo === 'EQUIPAMENTO' ? dataFim : null,
                quantidade, valorDiaria, observacoes || null]
        );
        await conexao.commit();
        transacaoAtiva = false;
        return res.status(201).json({ sucesso: true, id_solicitacao: sequencia.insertId, id_conversa: idConversa });
    } catch (erro) {
        if (transacaoAtiva && conexao) await conexao.rollback().catch(() => {});
        if (erro.code === 'ER_DUP_ENTRY') {
            try {
                const duplicada = await consultar(
                    'SELECT id_solicitacao, id_conversa FROM solicitacoes WHERE id_cliente = ? AND chave_idempotencia = ? LIMIT 1',
                    [idCliente, idempotencia]
                );
                if (duplicada[0]) return res.json({ sucesso: true, id_solicitacao: duplicada[0].id_solicitacao, id_conversa: duplicada[0].id_conversa, duplicada: true });
            } catch (erroConsulta) {
                console.error('ERRO AO RECUPERAR SOLICITAÇÃO REPETIDA:', erroConsulta);
            }
        }
        console.error('ERRO AO CRIAR SOLICITAÇÃO:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível registrar a solicitação.' });
    } finally {
        if (conexao) conexao.release();
    }
});

const SQL_LISTA_SOLICITACOES = `
    SELECT s.id_solicitacao, s.id_cliente, s.id_prestador, s.id_equipamento, s.id_servico,
           s.id_conversa, s.tipo, s.titulo, s.descricao, s.local_atendimento,
           s.data_inicio, s.data_fim, s.quantidade, s.valor_diaria, s.observacoes,
           s.status, s.confirmada_cliente, s.data_confirmacao_cliente,
           s.cliente_visualizou_em, s.prestador_visualizou_em,
           s.data_criacao, s.data_atualizacao,
           EXISTS(SELECT 1 FROM avaliacoes_solicitacoes av WHERE av.id_solicitacao = s.id_solicitacao) AS possui_avaliacao,
           uc.nome AS nome_contratante, up.nome AS nome_prestador,
           e.nome_equipamento AS nome_equipamento_atual, sv.nome_servico AS nome_servico_atual,
           DATE_FORMAT(s.data_inicio, '%Y-%m-%d') AS data_inicio_iso,
           DATE_FORMAT(s.data_fim, '%Y-%m-%d') AS data_fim_iso
    FROM solicitacoes s
    INNER JOIN usuarios uc ON uc.id_usuario = s.id_cliente
    INNER JOIN prestadores p ON p.id_prestador = s.id_prestador
    INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
    LEFT JOIN equipamentos e ON e.id_equipamento = s.id_equipamento
    LEFT JOIN servicos sv ON sv.id_servico = s.id_servico
`;

app.get('/solicitacoes/minhas', autenticar, async (req, res) => {
    const idUsuario = req.usuarioAutenticado.id_usuario;
    try {
        if (String(await tipoContaUsuario(idUsuario) || '').toUpperCase() !== 'CLIENTE') {
            return res.status(403).json({ sucesso: false, mensagem: 'Esta área é exclusiva para contratantes.' });
        }
        await consultar(
            `UPDATE solicitacoes SET cliente_visualizou_em = CURRENT_TIMESTAMP,
                    data_atualizacao = data_atualizacao WHERE id_cliente = ?`,
            [idUsuario]
        );
        const solicitacoes = await consultar(
            `${SQL_LISTA_SOLICITACOES} WHERE s.id_cliente = ? ORDER BY s.data_criacao DESC, s.id_solicitacao DESC`,
            [idUsuario]
        );
        return res.json({ sucesso: true, solicitacoes });
    } catch (erro) {
        console.error('ERRO AO LISTAR PEDIDOS:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar seus pedidos.' });
    }
});

app.get('/solicitacoes/recebidas', autenticar, async (req, res) => {
    const idUsuario = req.usuarioAutenticado.id_usuario;
    try {
        if (String(await tipoContaUsuario(idUsuario) || '').toUpperCase() !== 'PRESTADOR') {
            return res.status(403).json({ sucesso: false, mensagem: 'Esta área é exclusiva para prestadores.' });
        }
        await consultar(
            `UPDATE solicitacoes SET prestador_visualizou_em = CURRENT_TIMESTAMP,
                    data_atualizacao = data_atualizacao
             WHERE id_prestador IN (SELECT id_prestador FROM prestadores WHERE id_usuario = ?)`,
            [idUsuario]
        );
        const solicitacoes = await consultar(
            `${SQL_LISTA_SOLICITACOES} WHERE p.id_usuario = ? ORDER BY s.data_criacao DESC, s.id_solicitacao DESC`,
            [idUsuario]
        );
        return res.json({ sucesso: true, solicitacoes });
    } catch (erro) {
        console.error('ERRO AO LISTAR SOLICITAÇÕES RECEBIDAS:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar as solicitações recebidas.' });
    }
});

app.get('/solicitacoes/:id', autenticar, async (req, res) => {
    const idSolicitacao = Number(req.params.id);
    const idUsuario = req.usuarioAutenticado.id_usuario;
    if (!Number.isInteger(idSolicitacao) || idSolicitacao <= 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'Solicitação inválida.' });
    }
    try {
        const solicitacoes = await consultar(
            `${SQL_LISTA_SOLICITACOES}
             WHERE s.id_solicitacao = ? AND
                   (s.id_cliente = ? OR p.id_usuario = ?)
             LIMIT 1`,
            [idSolicitacao, idUsuario, idUsuario]
        );
        if (!solicitacoes[0]) return res.status(404).json({ sucesso: false, mensagem: 'Solicitação não encontrada.' });
        return res.json({ sucesso: true, solicitacao: solicitacoes[0] });
    } catch (erro) {
        console.error('ERRO AO CONSULTAR SOLICITAÇÃO:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível consultar a solicitação.' });
    }
});

app.patch('/solicitacoes/:id/status', autenticar, async (req, res) => {
    const idSolicitacao = Number(req.params.id);
    const idUsuario = req.usuarioAutenticado.id_usuario;
    const novoStatus = String((req.body || {}).status || '').trim().toUpperCase();
    if (!Number.isInteger(idSolicitacao) || idSolicitacao <= 0 ||
        !['ACEITA', 'RECUSADA', 'EM_ANDAMENTO', 'AGUARDANDO_CONFIRMACAO_CLIENTE', 'CONCLUIDA', 'CANCELADA'].includes(novoStatus)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Ação ou solicitação inválida.' });
    }

    let conexao;
    let transacaoAtiva = false;
    try {
        conexao = await db.promise().getConnection();
        await conexao.beginTransaction();
        transacaoAtiva = true;
        const solicitacoesIniciais = await consultarNaConexao(
            conexao,
            'SELECT tipo, id_equipamento FROM solicitacoes WHERE id_solicitacao = ? LIMIT 1',
            [idSolicitacao]
        );
        if (!solicitacoesIniciais[0]) {
            await conexao.rollback(); transacaoAtiva = false;
            return res.status(404).json({ sucesso: false, mensagem: 'Solicitação não encontrada.' });
        }
        let equipamentoBloqueado = null;
        if (novoStatus === 'ACEITA' && solicitacoesIniciais[0].tipo === 'EQUIPAMENTO') {
            const equipamentos = await consultarNaConexao(
                conexao,
                'SELECT quantidade, disponivel FROM equipamentos WHERE id_equipamento = ? FOR UPDATE',
                [solicitacoesIniciais[0].id_equipamento]
            );
            equipamentoBloqueado = equipamentos[0] || null;
        }
        const solicitacoes = await consultarNaConexao(
            conexao,
            `SELECT s.*, p.id_usuario AS id_usuario_prestador
             FROM solicitacoes s INNER JOIN prestadores p ON p.id_prestador = s.id_prestador
             WHERE s.id_solicitacao = ? FOR UPDATE`,
            [idSolicitacao]
        );
        const solicitacao = solicitacoes[0];
        if (!solicitacao) {
            await conexao.rollback(); transacaoAtiva = false;
            return res.status(404).json({ sucesso: false, mensagem: 'Solicitação não encontrada.' });
        }

        const ePrestador = Number(solicitacao.id_usuario_prestador) === idUsuario;
        const eContratante = Number(solicitacao.id_cliente) === idUsuario;
        const transicoesValidas =
            (ePrestador && solicitacao.status === 'AGUARDANDO_RESPOSTA' && ['ACEITA', 'RECUSADA'].includes(novoStatus)) ||
            (ePrestador && solicitacao.status === 'ACEITA' && novoStatus === 'EM_ANDAMENTO') ||
            (ePrestador && solicitacao.status === 'EM_ANDAMENTO' && novoStatus === 'AGUARDANDO_CONFIRMACAO_CLIENTE') ||
            (eContratante && solicitacao.status === 'AGUARDANDO_CONFIRMACAO_CLIENTE' && novoStatus === 'CONCLUIDA') ||
            (eContratante && ['AGUARDANDO_RESPOSTA', 'ACEITA'].includes(solicitacao.status) && novoStatus === 'CANCELADA');
        if (!transicoesValidas) {
            await conexao.rollback(); transacaoAtiva = false;
            return res.status(403).json({ sucesso: false, mensagem: 'Você não pode realizar essa alteração para o status atual.' });
        }

        if (novoStatus === 'ACEITA' && solicitacao.tipo === 'EQUIPAMENTO') {
            if (!equipamentoBloqueado || Number(equipamentoBloqueado.disponivel) !== 1) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(409).json({ sucesso: false, mensagem: 'O equipamento foi removido ou está marcado como indisponível.' });
            }
            const reservas = await consultarNaConexao(
                conexao,
                `SELECT quantidade
                 FROM solicitacoes
                 WHERE id_equipamento = ? AND id_solicitacao <> ?
                   AND status IN ('ACEITA', 'EM_ANDAMENTO')
                   AND data_inicio <= ? AND data_fim >= ?
                 ORDER BY id_solicitacao FOR UPDATE`,
                [solicitacao.id_equipamento, idSolicitacao, solicitacao.data_fim, solicitacao.data_inicio]
            );
            const quantidadeReservada = reservas.reduce((total, reserva) => total + Number(reserva.quantidade || 0), 0);
            if (quantidadeReservada + Number(solicitacao.quantidade) > Number(equipamentoBloqueado.quantidade || 0)) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(409).json({ sucesso: false, mensagem: 'A quantidade disponível já está comprometida em parte desse período.' });
            }
        }

        await consultarNaConexao(
            conexao,
            `UPDATE solicitacoes
             SET status = ?,
                 confirmada_cliente = CASE WHEN ? = 'CONCLUIDA' THEN 1 ELSE confirmada_cliente END,
                 data_confirmacao_cliente = CASE WHEN ? = 'CONCLUIDA' THEN CURRENT_TIMESTAMP ELSE data_confirmacao_cliente END,
                 cliente_visualizou_em = CASE WHEN ? = 1 THEN NULL ELSE CURRENT_TIMESTAMP END,
                 prestador_visualizou_em = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
             WHERE id_solicitacao = ?`,
            [novoStatus, novoStatus, novoStatus, ePrestador ? 1 : 0, ePrestador ? 1 : 0, idSolicitacao]
        );
        await conexao.commit();
        transacaoAtiva = false;
        return res.json({ sucesso: true, status: novoStatus });
    } catch (erro) {
        if (transacaoAtiva && conexao) await conexao.rollback().catch(() => {});
        console.error('ERRO AO ATUALIZAR SOLICITAÇÃO:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível atualizar a solicitação.' });
    } finally {
        if (conexao) conexao.release();
    }
});

app.post('/solicitacoes/:id/avaliacao', autenticar, async (req, res) => {
    const idSolicitacao = Number(req.params.id);
    const idCliente = req.usuarioAutenticado.id_usuario;
    const corpo = req.body || {};
    const alvo = String(corpo.alvo || '').trim().toUpperCase();
    const notaRecebida = Number(corpo.nota);
    const comentario = String(corpo.comentario || '').trim();
    if (!Number.isInteger(idSolicitacao) || idSolicitacao <= 0 ||
        !['PRESTADOR', 'EQUIPAMENTO'].includes(alvo) ||
        !Number.isInteger(notaRecebida) || notaRecebida < 0 || notaRecebida > 5 ||
        comentario.length > 2000) {
        return res.status(400).json({ sucesso: false, mensagem: 'Escolha uma nota de 0 a 5 e escreva um comentário de até 2000 caracteres.' });
    }

    let conexao;
    let transacaoAtiva = false;
    try {
        conexao = await db.promise().getConnection();
        await conexao.beginTransaction();
        transacaoAtiva = true;
        const pedidos = await consultarNaConexao(
            conexao,
            `SELECT id_solicitacao, id_cliente, id_prestador, id_equipamento, id_servico, tipo, status, confirmada_cliente
             FROM solicitacoes WHERE id_solicitacao = ? FOR UPDATE`,
            [idSolicitacao]
        );
        const pedido = pedidos[0];
        if (!pedido || Number(pedido.id_cliente) !== idCliente) {
            await conexao.rollback(); transacaoAtiva = false;
            return res.status(404).json({ sucesso: false, mensagem: 'Pedido não encontrado.' });
        }
        if (pedido.status !== 'CONCLUIDA' || Number(pedido.confirmada_cliente) !== 1) {
            await conexao.rollback(); transacaoAtiva = false;
            return res.status(409).json({ sucesso: false, mensagem: 'A avaliação só fica disponível depois que você confirmar a conclusão.' });
        }
        if ((pedido.tipo === 'SERVICO' && alvo !== 'PRESTADOR') ||
            (pedido.tipo === 'EQUIPAMENTO' && alvo === 'EQUIPAMENTO' && !pedido.id_equipamento)) {
            await conexao.rollback(); transacaoAtiva = false;
            return res.status(400).json({ sucesso: false, mensagem: 'Esse pedido não permite avaliar o item selecionado.' });
        }

        const sequencia = await consultarNaConexao(conexao, 'INSERT INTO avaliacoes_solicitacoes_id_seq () VALUES ()');
        await consultarNaConexao(
            conexao,
            `INSERT INTO avaliacoes_solicitacoes
                (id_avaliacao, id_solicitacao, id_cliente, id_prestador, id_equipamento, id_servico, alvo, nota, comentario)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [sequencia.insertId, idSolicitacao, idCliente, pedido.id_prestador,
                alvo === 'EQUIPAMENTO' ? pedido.id_equipamento : null,
                pedido.id_servico || null,
                alvo, notaRecebida === 0 ? null : notaRecebida, comentario || null]
        );
        await conexao.commit();
        transacaoAtiva = false;
        return res.status(201).json({ sucesso: true, id_avaliacao: sequencia.insertId });
    } catch (erro) {
        if (transacaoAtiva && conexao) await conexao.rollback().catch(() => {});
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ sucesso: false, mensagem: 'Você já avaliou este perfil ou equipamento para esse pedido.' });
        }
        console.error('ERRO AO SALVAR AVALIAÇÃO:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível salvar a avaliação.' });
    } finally {
        if (conexao) conexao.release();
    }
});

app.get('/prestadores/:id/avaliacoes', async (req, res) => {
    const idPrestador = Number(req.params.id);
    if (!Number.isInteger(idPrestador) || idPrestador <= 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'Profissional inválido.' });
    }
    try {
        const avaliacoes = await consultar(
            `SELECT a.id_avaliacao, a.alvo, a.nota, a.comentario, a.data_criacao,
                    u.nome AS nome_cliente, e.nome_equipamento
             FROM avaliacoes_solicitacoes a
             INNER JOIN usuarios u ON u.id_usuario = a.id_cliente
             LEFT JOIN equipamentos e ON e.id_equipamento = a.id_equipamento
             WHERE a.id_prestador = ? AND a.moderacao_status = 'VISIVEL'
             ORDER BY a.data_criacao DESC, a.id_avaliacao DESC LIMIT 50`,
            [idPrestador]
        );
        const [resumo] = await consultar(
            `SELECT COUNT(*) AS quantidade_comentarios, COUNT(CASE WHEN alvo = 'PRESTADOR' THEN nota END) AS quantidade_notas,
                    AVG(CASE WHEN alvo = 'PRESTADOR' THEN nota END) AS media
             FROM avaliacoes_solicitacoes WHERE id_prestador = ? AND moderacao_status = 'VISIVEL'`,
            [idPrestador]
        );
        return res.json({ sucesso: true, avaliacoes, resumo });
    } catch (erro) {
        console.error('ERRO AO LISTAR AVALIAÇÕES DO PROFISSIONAL:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar as avaliações.' });
    }
});

app.get('/equipamentos/:id/avaliacoes', async (req, res) => {
    const idEquipamento = Number(req.params.id);
    if (!Number.isInteger(idEquipamento) || idEquipamento <= 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'Equipamento inválido.' });
    }
    try {
        const avaliacoes = await consultar(
            `SELECT a.id_avaliacao, a.nota, a.comentario, a.data_criacao, u.nome AS nome_cliente
             FROM avaliacoes_solicitacoes a INNER JOIN usuarios u ON u.id_usuario = a.id_cliente
             WHERE a.id_equipamento = ? AND a.alvo = 'EQUIPAMENTO' AND a.moderacao_status = 'VISIVEL'
             ORDER BY a.data_criacao DESC, a.id_avaliacao DESC LIMIT 50`,
            [idEquipamento]
        );
        const [resumo] = await consultar(
            `SELECT COUNT(*) AS quantidade_comentarios, COUNT(nota) AS quantidade_notas, AVG(nota) AS media
             FROM avaliacoes_solicitacoes WHERE id_equipamento = ? AND alvo = 'EQUIPAMENTO' AND moderacao_status = 'VISIVEL'`,
            [idEquipamento]
        );
        return res.json({ sucesso: true, avaliacoes, resumo });
    } catch (erro) {
        console.error('ERRO AO LISTAR AVALIAÇÕES DO EQUIPAMENTO:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar as avaliações do equipamento.' });
    }
});

app.get('/notificacoes/resumo', autenticar, async (req, res) => {
    const idUsuario = req.usuarioAutenticado.id_usuario;
    try {
        const tipo = String(await tipoContaUsuario(idUsuario) || '').toUpperCase();
        const [mensagens] = await consultar(
            `SELECT COUNT(*) AS total
             FROM mensagens m
             INNER JOIN conversas c ON c.id_conversa = m.id_conversa
             INNER JOIN prestadores p ON p.id_prestador = c.id_prestador
             WHERE m.id_remetente <> ? AND m.lida = 0
               AND (c.id_cliente = ? OR p.id_usuario = ?)`,
            [idUsuario, idUsuario, idUsuario]
        );
        let acoes = 0;
        if (tipo === 'PRESTADOR') {
            const [resultado] = await consultar(
                `SELECT COUNT(*) AS total FROM solicitacoes s
                 INNER JOIN prestadores p ON p.id_prestador = s.id_prestador
                 WHERE p.id_usuario = ? AND s.prestador_visualizou_em IS NULL`,
                [idUsuario]
            );
            acoes = Number(resultado.total) || 0;
        } else if (tipo === 'CLIENTE') {
            const [resultado] = await consultar(
                `SELECT COUNT(*) AS total FROM solicitacoes s
                 WHERE s.id_cliente = ? AND (
                    s.cliente_visualizou_em IS NULL OR
                    (s.status = 'CONCLUIDA' AND s.confirmada_cliente = 1 AND NOT EXISTS (
                        SELECT 1 FROM avaliacoes_solicitacoes a WHERE a.id_solicitacao = s.id_solicitacao
                    ))
                 )`,
                [idUsuario]
            );
            acoes = Number(resultado.total) || 0;
        }
        return res.json({ sucesso: true, mensagens_nao_lidas: Number(mensagens.total) || 0, acoes_pendentes: acoes });
    } catch (erro) {
        console.error('ERRO AO CONTAR NOTIFICAÇÕES:', erro);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar as notificações.' });
    }
});

// ===============================
// PAINEL ADMINISTRATIVO
// ===============================

app.get('/api/perfil', autenticar, async (req, res) => {
    const idUsuario = req.usuarioAutenticado.id_usuario;
    try {
        const usuarios = await consultar(
            `SELECT id_usuario, nome, email, telefone, tipo_usuario, foto_perfil, descricao
             FROM usuarios WHERE id_usuario = ? LIMIT 1`, [idUsuario]);
        if (!usuarios[0]) return res.status(404).json({ sucesso: false, mensagem: 'Conta não encontrada.' });
        const usuario = usuarios[0];
        const tipo = String(usuario.tipo_usuario).toUpperCase();
        if (!['CLIENTE', 'PRESTADOR'].includes(tipo)) {
            return res.status(403).json({ sucesso: false, mensagem: 'A edição de perfil está disponível para contratantes e prestadores.' });
        }

        let prestador = null;
        if (tipo === 'PRESTADOR') {
            const prestadores = await consultar(
                'SELECT id_prestador, descricao FROM prestadores WHERE id_usuario = ? LIMIT 1', [idUsuario]);
            if (!prestadores[0]) return res.status(404).json({ sucesso: false, mensagem: 'Perfil profissional não encontrado.' });
            prestador = prestadores[0];
            prestador.fotos = await consultar(
                `SELECT id_foto, url_foto FROM fotos_prestadores
                 WHERE id_prestador = ? ORDER BY id_foto`, [prestador.id_prestador]);
            usuario.descricao = prestador.descricao || '';
        }
        return res.json({ sucesso: true, usuario, prestador });
    } catch (erro) {
        console.error('ERRO AO CARREGAR PERFIL:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar seu perfil.' });
    }
});

app.put('/api/perfil', autenticar, uploadCamposPerfil, async (req, res) => {
    const idUsuario = req.usuarioAutenticado.id_usuario;
    const email = String(req.body.email || '').trim();
    const telefoneTexto = String(req.body.telefone || '').trim();
    const descricao = String(req.body.descricao || '').trim();
    const fotoPerfil = req.files?.foto_perfil?.[0] || null;
    const fotosTrabalhos = req.files?.fotos_trabalhos || [];
    const caminhosNovos = [];
    const responderErro = (status, mensagem) => {
        removerUploadsRecebidos(req);
        return res.status(status).json({ sucesso: false, mensagem });
    };

    try {
        for (const arquivo of arquivosRecebidos(req)) validarImagem(arquivo);
    } catch (erroImagem) {
        return responderErro(400, erroImagem.message);
    }

    if (email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return responderErro(400, 'Informe um e-mail válido com até 100 caracteres.');
    const telefone = telefoneTexto ? normalizarTelefoneBrasil(telefoneTexto) : null;
    if (telefoneTexto && !telefone)
        return responderErro(400, 'Informe um telefone válido com DDD e 10 ou 11 números.');
    if (descricao.length > 2000)
        return responderErro(400, 'A descrição deve ter no máximo 2.000 caracteres.');

    let idsRemover;
    try {
        idsRemover = JSON.parse(req.body.fotos_remover || '[]');
        if (!Array.isArray(idsRemover) || idsRemover.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) {
            return responderErro(400, 'A seleção de fotos para remover é inválida.');
        }
        idsRemover = [...new Set(idsRemover.map(Number))];
    } catch {
        return responderErro(400, 'A seleção de fotos para remover é inválida.');
    }

    let conexao;
    let transacaoAtiva = false;
    let fotosRemovidas = [];
    let fotoPerfilAntiga = null;
    let idPrestadorPerfil = null;
    let respostaPerfil;
    try {
        conexao = await db.promise().getConnection();
        await conexao.beginTransaction();
        transacaoAtiva = true;

        const usuarios = await consultarNaConexao(
            conexao,
            `SELECT id_usuario, nome, email, telefone, tipo_usuario, foto_perfil, descricao
             FROM usuarios WHERE id_usuario = ? FOR UPDATE`, [idUsuario]);
        const usuario = usuarios[0];
        if (!usuario) {
            await conexao.rollback(); transacaoAtiva = false;
            return responderErro(404, 'Conta não encontrada.');
        }
        const tipo = String(usuario.tipo_usuario).toUpperCase();
        if (!['CLIENTE', 'PRESTADOR'].includes(tipo)) {
            await conexao.rollback(); transacaoAtiva = false;
            return responderErro(403, 'A edição de perfil está disponível para contratantes e prestadores.');
        }

        const emails = await consultarNaConexao(
            conexao,
            'SELECT id_usuario FROM usuarios WHERE LOWER(email) = LOWER(?) AND id_usuario <> ? LIMIT 1',
            [email, idUsuario]);
        if (emails.length) {
            await conexao.rollback(); transacaoAtiva = false;
            return responderErro(409, 'Este e-mail já está sendo usado por outra conta.');
        }

        let prestador = null;
        let fotosAtuais = [];
        if (tipo === 'PRESTADOR') {
            const prestadores = await consultarNaConexao(
                conexao, 'SELECT id_prestador FROM prestadores WHERE id_usuario = ? FOR UPDATE', [idUsuario]);
            if (!prestadores[0]) {
                await conexao.rollback(); transacaoAtiva = false;
                return responderErro(404, 'Perfil profissional não encontrado.');
            }
            prestador = prestadores[0];
            idPrestadorPerfil = Number(prestador.id_prestador);
            fotosAtuais = await consultarNaConexao(
                conexao,
                'SELECT id_foto, url_foto FROM fotos_prestadores WHERE id_prestador = ? FOR UPDATE',
                [prestador.id_prestador]);
            const idsAtuais = new Set(fotosAtuais.map(foto => Number(foto.id_foto)));
            if (idsRemover.some(id => !idsAtuais.has(id))) {
                await conexao.rollback(); transacaoAtiva = false;
                return responderErro(400, 'Uma ou mais fotos selecionadas não pertencem ao seu perfil.');
            }
            const totalFinal = fotosAtuais.length - idsRemover.length + fotosTrabalhos.length;
            if (totalFinal > 5) {
                await conexao.rollback(); transacaoAtiva = false;
                return responderErro(400, 'Seu perfil pode ter no máximo cinco fotos de trabalhos. Remova uma foto ou selecione menos imagens.');
            }
        } else if (fotosTrabalhos.length || idsRemover.length) {
            await conexao.rollback(); transacaoAtiva = false;
            return responderErro(400, 'Somente prestadores podem alterar fotos de trabalhos.');
        }

        fotoPerfilAntiga = usuario.foto_perfil;
        const fotoPerfilUrl = fotoPerfil
            ? await guardarImagemNoSupabase(fotoPerfil, 'perfilUsuario', idUsuario)
            : usuario.foto_perfil;
        if (fotoPerfil && fotoPerfilUrl) caminhosNovos.push({ caminho: fotoPerfilUrl, categoria: 'perfilUsuario', id: idUsuario });
        let caminhosTrabalhos = [];
        if (fotosTrabalhos.length) {
            caminhosTrabalhos = await guardarImagensNoSupabase(fotosTrabalhos, 'trabalhosPrestador', prestador.id_prestador);
            caminhosNovos.push(...caminhosTrabalhos.map(caminho => ({
                caminho,
                categoria: 'trabalhosPrestador',
                id: prestador.id_prestador
            })));
        }
        await consultarNaConexao(
            conexao,
            'UPDATE usuarios SET email = ?, telefone = ?, foto_perfil = ? WHERE id_usuario = ?',
            [email, telefone, fotoPerfilUrl, idUsuario]);

        if (tipo === 'PRESTADOR') {
            await consultarNaConexao(
                conexao, 'UPDATE prestadores SET descricao = ? WHERE id_prestador = ?',
                [descricao || null, prestador.id_prestador]);
            if (idsRemover.length) {
                const placeholders = idsRemover.map(() => '?').join(',');
                const idsRemovidos = await consultarNaConexao(
                    conexao,
                    `SELECT url_foto FROM fotos_prestadores WHERE id_prestador = ? AND id_foto IN (${placeholders})`,
                    [prestador.id_prestador, ...idsRemover]);
                fotosRemovidas = idsRemovidos.map(foto => foto.url_foto);
                await consultarNaConexao(
                    conexao,
                    `DELETE FROM fotos_prestadores WHERE id_prestador = ? AND id_foto IN (${placeholders})`,
                    [prestador.id_prestador, ...idsRemover]);
            }
            for (const caminho of caminhosTrabalhos) {
                const sequencia = await consultarNaConexao(conexao, 'INSERT INTO fotos_prestadores_id_seq () VALUES ()');
                await consultarNaConexao(
                    conexao,
                    'INSERT INTO fotos_prestadores (id_foto, id_prestador, url_foto) VALUES (?, ?, ?)',
                    [sequencia.insertId, prestador.id_prestador, caminho]);
            }
        } else {
            await consultarNaConexao(conexao, 'UPDATE usuarios SET descricao = ? WHERE id_usuario = ?', [descricao || null, idUsuario]);
        }

        await conexao.commit();
        transacaoAtiva = false;
        respostaPerfil = {
            id_usuario: usuario.id_usuario,
            nome: usuario.nome,
            email,
            telefone,
            tipo_usuario: tipo,
            foto_perfil: fotoPerfilUrl,
            descricao
        };
    } catch (erro) {
        if (transacaoAtiva && conexao) await conexao.rollback().catch(() => {});
        removerUploadsRecebidos(req);
        for (const imagem of caminhosNovos) {
            try { await removerFotoPrestadorSeSemReferencias(imagem.caminho, imagem.categoria, imagem.id); }
            catch (erroLimpeza) { console.error('FALHA AO LIMPAR IMAGEM DE PERFIL SEM REFERÊNCIA:', erroLimpeza.code || 'ERRO'); }
        }
        if (erro.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ sucesso: false, mensagem: 'Este e-mail já está sendo usado por outra conta.' });
        }
        console.error('ERRO AO SALVAR PERFIL:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível salvar as alterações do perfil.' });
    } finally {
        if (conexao) conexao.release();
    }

    try {
        if (fotoPerfil && fotoPerfilAntiga && fotoPerfilAntiga !== respostaPerfil.foto_perfil) {
            await removerFotoPrestadorSeSemReferencias(fotoPerfilAntiga, 'perfilUsuario', idUsuario);
        }
        for (const url of fotosRemovidas) await removerFotoPrestadorSeSemReferencias(url, 'trabalhosPrestador', idPrestadorPerfil);
    } catch (erro) {
        console.error('NÃO FOI POSSÍVEL LIMPAR ARQUIVOS DE FOTO SEM REFERÊNCIA:', erro.message);
    }
    return res.json({ sucesso: true, mensagem: 'Perfil atualizado com sucesso.', usuario: respostaPerfil });
});

app.get('/api/admin/dashboard', autenticar, autorizarAdmin, async (req, res) => {
    try {
        const [usuarios, clientes, prestadores, equipamentos, solicitacoes] = await Promise.all([
            consultar('SELECT COUNT(*) AS total FROM usuarios'),
            consultar("SELECT COUNT(*) AS total FROM usuarios WHERE tipo_usuario = 'CLIENTE'"),
            consultar("SELECT COUNT(*) AS total FROM usuarios WHERE tipo_usuario = 'PRESTADOR'"),
            consultar('SELECT COUNT(*) AS total FROM equipamentos'),
            consultar('SELECT COUNT(*) AS total FROM solicitacoes')
        ]);
        return res.json({ sucesso: true, indicadores: {
            usuarios: Number(usuarios[0].total), clientes: Number(clientes[0].total),
            prestadores: Number(prestadores[0].total), equipamentos: Number(equipamentos[0].total),
            solicitacoes: Number(solicitacoes[0].total)
        }});
    } catch (erro) {
        console.error('ERRO DASHBOARD ADMIN:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar o dashboard.' });
    }
});

app.get('/api/admin/usuarios', autenticar, autorizarAdmin, async (req, res) => {
    try {
        const busca = String(req.query.busca || '').trim().slice(0, 100);
        const filtro = busca ? 'WHERE nome LIKE ? OR email LIKE ?' : '';
        const params = busca ? [`%${busca}%`, `%${busca}%`] : [];
        const usuarios = await consultar(
            `SELECT id_usuario, nome, email, telefone, tipo_usuario, ativo, data_cadastro
             FROM usuarios ${filtro} ORDER BY id_usuario DESC LIMIT 200`, params);
        return res.json({ sucesso: true, usuarios });
    } catch (erro) {
        console.error('ERRO USUARIOS ADMIN:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar os usuários.' });
    }
});

app.patch('/api/admin/usuarios/:id/status', autenticar, autorizarAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const ativo = req.body.ativo;
    if (!Number.isSafeInteger(id) || id <= 0 || ![0, 1, false, true].includes(ativo))
        return res.status(400).json({ sucesso: false, mensagem: 'Usuário ou status inválido.' });
    try {
        const [alvo] = await consultar('SELECT id_usuario, tipo_usuario, ativo FROM usuarios WHERE id_usuario = ? LIMIT 1', [id]);
        if (!alvo) return res.status(404).json({ sucesso: false, mensagem: 'Usuário não encontrado.' });
        if (id === req.usuarioAutenticado.id_usuario && !Boolean(ativo))
            return res.status(400).json({ sucesso: false, mensagem: 'Você não pode suspender a própria conta.' });
        if (alvo.tipo_usuario === 'ADMIN')
            return res.status(400).json({ sucesso: false, mensagem: 'Contas administrativas não podem ser suspensas por este painel.' });
        await consultar('UPDATE usuarios SET ativo = ? WHERE id_usuario = ?', [Number(Boolean(ativo)), id]);
        return res.json({ sucesso: true, ativo: Number(Boolean(ativo)) });
    } catch (erro) {
        console.error('ERRO STATUS USUARIO:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível atualizar o usuário.' });
    }
});

app.get('/api/admin/prestadores', autenticar, autorizarAdmin, async (req, res) => {
    try {
        const busca = String(req.query.busca || '').trim().slice(0, 100);
        const filtro = busca ? 'AND (u.nome LIKE ? OR u.email LIKE ? OR p.profissao LIKE ?)' : '';
        const params = busca ? [`%${busca}%`, `%${busca}%`, `%${busca}%`] : [];
        const prestadores = await consultar(
            `SELECT p.id_prestador, p.id_usuario, p.profissao, p.cidade, p.estado, p.verificado,
                    p.descricao, p.valor_diaria, p.admin_ativo, u.nome, u.email, u.telefone,
                    (SELECT COUNT(*) FROM equipamentos e WHERE e.id_prestador = p.id_prestador) AS total_equipamentos
             FROM prestadores p INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
             WHERE 1=1 ${filtro} ORDER BY p.id_prestador DESC LIMIT 200`, params);
        return res.json({ sucesso: true, prestadores });
    } catch (erro) {
        console.error('ERRO PRESTADORES ADMIN:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar os prestadores.' });
    }
});

app.patch('/api/admin/prestadores/:id/status', autenticar, autorizarAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const ativo = req.body.ativo;
    if (!Number.isSafeInteger(id) || id <= 0 || ![0, 1, false, true].includes(ativo))
        return res.status(400).json({ sucesso: false, mensagem: 'Prestador ou status inválido.' });
    try {
        const [alvo] = await consultar('SELECT id_usuario FROM prestadores WHERE id_prestador = ? LIMIT 1', [id]);
        if (!alvo) return res.status(404).json({ sucesso: false, mensagem: 'Prestador não encontrado.' });
        if (Number(alvo.id_usuario) === req.usuarioAutenticado.id_usuario)
            return res.status(400).json({ sucesso: false, mensagem: 'Você não pode suspender o próprio perfil.' });
        await consultar('UPDATE prestadores SET admin_ativo = ? WHERE id_prestador = ?', [Number(Boolean(ativo)), id]);
        return res.json({ sucesso: true, ativo: Number(Boolean(ativo)) });
    } catch (erro) {
        console.error('ERRO STATUS PRESTADOR:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível atualizar o prestador.' });
    }
});

app.get('/api/admin/equipamentos', autenticar, autorizarAdmin, async (req, res) => {
    try {
        const busca = String(req.query.busca || '').trim().slice(0, 100);
        const filtro = busca ? 'AND (e.nome_equipamento LIKE ? OR e.tipo_equipamento LIKE ? OR u.nome LIKE ?)' : '';
        const params = busca ? [`%${busca}%`, `%${busca}%`, `%${busca}%`] : [];
        const equipamentos = await consultar(
            `SELECT e.id_equipamento, e.nome_equipamento, e.tipo_equipamento, e.descricao,
                    e.valor_diaria, e.quantidade, e.disponivel, e.admin_visivel,
                    MAX(p.id_prestador) AS id_prestador, MAX(u.nome) AS nome_prestador, MAX(u.email) AS email_prestador,
                    GROUP_CONCAT(DISTINCT f.url_foto ORDER BY f.id_foto SEPARATOR '|||') AS fotos
             FROM equipamentos e INNER JOIN prestadores p ON p.id_prestador = e.id_prestador
             INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
             LEFT JOIN fotos_equipamentos f ON f.id_equipamento = e.id_equipamento
             WHERE 1=1 ${filtro} GROUP BY e.id_equipamento ORDER BY e.id_equipamento DESC LIMIT 200`, params);
        return res.json({ sucesso: true, equipamentos: equipamentos.map(e => ({ ...e, fotos: e.fotos ? e.fotos.split('|||') : [] })) });
    } catch (erro) {
        console.error('ERRO EQUIPAMENTOS ADMIN:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar os anúncios.' });
    }
});

app.patch('/api/admin/equipamentos/:id/status', autenticar, autorizarAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const visivel = req.body.visivel;
    if (!Number.isSafeInteger(id) || id <= 0 || ![0, 1, false, true].includes(visivel))
        return res.status(400).json({ sucesso: false, mensagem: 'Anúncio ou status inválido.' });
    try {
        const resultado = await consultar('UPDATE equipamentos SET admin_visivel = ? WHERE id_equipamento = ?', [Number(Boolean(visivel)), id]);
        if (!resultado.affectedRows) return res.status(404).json({ sucesso: false, mensagem: 'Anúncio não encontrado.' });
        return res.json({ sucesso: true, visivel: Number(Boolean(visivel)) });
    } catch (erro) {
        console.error('ERRO STATUS EQUIPAMENTO:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível atualizar o anúncio.' });
    }
});

// Exclusão administrativa é lógica: mantém solicitações e histórico do equipamento.
app.delete('/api/admin/equipamentos/:id', autenticar, autorizarAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ sucesso: false, mensagem: 'Anúncio inválido.' });
    try {
        const resultado = await consultar('UPDATE equipamentos SET admin_visivel = 0 WHERE id_equipamento = ?', [id]);
        if (!resultado.affectedRows) return res.status(404).json({ sucesso: false, mensagem: 'Anúncio não encontrado.' });
        return res.json({ sucesso: true, removido: true });
    } catch (erro) {
        console.error('ERRO EXCLUSAO LOGICA EQUIPAMENTO:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível remover o anúncio.' });
    }
});

app.get('/api/admin/avaliacoes', autenticar, autorizarAdmin, async (req, res) => {
    try {
        const [avaliacoesNovas, avaliacoesLegadas] = await Promise.all([consultar(
            `SELECT a.id_avaliacao, a.alvo, a.nota, a.comentario, a.data_criacao, a.moderacao_status,
                    u.nome AS nome_cliente, p.id_prestador, up.nome AS nome_prestador,
                    e.id_equipamento, e.nome_equipamento, 'NOVA' AS fonte
             FROM avaliacoes_solicitacoes a
             LEFT JOIN usuarios u ON u.id_usuario = a.id_cliente
             LEFT JOIN prestadores p ON p.id_prestador = a.id_prestador
             LEFT JOIN usuarios up ON up.id_usuario = p.id_usuario
             LEFT JOIN equipamentos e ON e.id_equipamento = a.id_equipamento
             ORDER BY a.data_criacao DESC LIMIT 200`), consultar(
            `SELECT a.id_avaliacao, 'PRESTADOR' AS alvo, a.nota, a.comentario,
                    a.data_avaliacao AS data_criacao, a.moderacao_status,
                    uc.nome AS nome_cliente, p.id_prestador, up.nome AS nome_prestador,
                    NULL AS id_equipamento,
                    (SELECT MAX(COALESCE(s.nome_servico, e.nome_equipamento))
                     FROM itens_pedido ip
                     LEFT JOIN servicos s ON s.id_servico = ip.id_servico
                     LEFT JOIN equipamentos e ON e.id_equipamento = ip.id_equipamento
                     WHERE ip.id_pedido = pd.id_pedido) AS nome_equipamento,
                    'LEGADA' AS fonte
             FROM avaliacoes a
             INNER JOIN pedidos pd ON pd.id_pedido = a.id_pedido
             INNER JOIN usuarios uc ON uc.id_usuario = pd.id_cliente
             INNER JOIN prestadores p ON p.id_prestador = pd.id_prestador
             INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
             ORDER BY a.data_avaliacao DESC LIMIT 200`)]);
        const avaliacoes = [...avaliacoesNovas, ...avaliacoesLegadas]
            .sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));
        return res.json({ sucesso: true, avaliacoes });
    } catch (erro) {
        console.error('ERRO AVALIACOES ADMIN:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível carregar as avaliações.' });
    }
});

app.patch('/api/admin/avaliacoes/:id/status', autenticar, autorizarAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const visivel = req.body.visivel;
    if (!Number.isSafeInteger(id) || id <= 0 || ![0, 1, false, true].includes(visivel))
        return res.status(400).json({ sucesso: false, mensagem: 'Avaliação ou status inválido.' });
    try {
        const tabela = req.body.fonte === 'LEGADA' ? 'avaliacoes' : 'avaliacoes_solicitacoes';
        const resultado = await consultar(`UPDATE ${tabela} SET moderacao_status = ? WHERE id_avaliacao = ?`, [visivel ? 'VISIVEL' : 'OCULTA', id]);
        if (!resultado.affectedRows) return res.status(404).json({ sucesso: false, mensagem: 'Avaliação não encontrada.' });
        return res.json({ sucesso: true, visivel: Number(Boolean(visivel)) });
    } catch (erro) {
        console.error('ERRO MODERACAO AVALIACAO:', erro.message);
        return res.status(500).json({ sucesso: false, mensagem: 'Não foi possível moderar a avaliação.' });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
