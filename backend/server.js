const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const db = require('./db');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

console.log("SERVER DA CONSTRUMAX CARREGADO");

const app = express();
const sessoes = new Map();

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
    req.usuarioAutenticado = { id_usuario: idUsuario };
    next();
}

const pastaUploads = path.join(__dirname, 'uploads', 'equipamentos');

if (!fs.existsSync(pastaUploads)) {
    fs.mkdirSync(pastaUploads, { recursive: true });
}

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
        cb(null, pastaUploads);
    },

    filename: function (req, file, cb) {

        const nomeUnico =
            Date.now() +
            '-' +
            Math.round(Math.random() * 1E9) +
            path.extname(file.originalname);

        cb(null, nomeUnico);
    }

});

const upload = multer({
    storage: storage,
    limits: {
        files: 5,
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: function (req, file, cb) {

        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas.'));
        }

    }
});

const pastaUploadsPrestadores = path.join(__dirname, 'uploads', 'prestadores');

if (!fs.existsSync(pastaUploadsPrestadores)) {
    fs.mkdirSync(pastaUploadsPrestadores, { recursive: true });
}

const storagePrestadores = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, pastaUploadsPrestadores);
    },
    filename: function (req, file, cb) {
        const nomeUnico =
            Date.now() +
            '-' +
            Math.round(Math.random() * 1E9) +
            path.extname(file.originalname);

        cb(null, nomeUnico);
    }
});

const uploadPrestadores = multer({
    storage: storagePrestadores,
    limits: {
        files: 5,
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas.'));
        }
    }
});


app.use(cors());
app.use(express.json());

app.use(
    '/uploads',
    express.static(path.join(__dirname, 'uploads'))
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

app.get('/usuarios', (req, res) => {

    db.query(
        'SELECT * FROM usuarios',
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

app.post('/cadastro', (req, res) => {

    const {
        nome,
        email,
        senha,
        telefone,
        tipo_usuario
    } = req.body;

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
                    nome,
                    email,
                    senha,
                    telefone,
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


app.post('/cadastro-prestador', uploadPrestadores.array('fotos', 5), (req, res) => {
    if (!req.body) {
        return res.status(400).json({
            sucesso: false,
            mensagem: "Dados do profissional não recebidos."
        });
    }

    const {
        id_usuario,
        cpf_cnpj,
        profissao,
        cidade,
        estado,
        valor_diaria,
        descricao
    } = req.body;

    // Verifica se o usuário já possui cadastro de prestador
    db.query(
        `SELECT id_prestador FROM prestadores WHERE id_usuario = ?`,
        [id_usuario],
        (erroBusca, resultadoBusca) => {

            if (erroBusca) {
                console.log("ERRO AO BUSCAR PRESTADOR:", erroBusca);

                return res.status(500).json({
                    sucesso: false,
                    mensagem: "Erro ao verificar cadastro profissional."
                });
            }

            if (resultadoBusca.length > 0) {
                return res.json({
                    sucesso: true,
                    mensagem: "Este profissional já está cadastrado.",
                    id_prestador: resultadoBusca[0].id_prestador,
                    ja_existia: true
                });
            }

            // Gera um ID para o prestador
            db.query(
                "INSERT INTO prestadores_id_seq () VALUES ()",
                (erroId, resultadoId) => {

                    if (erroId) {
                        console.log("ERRO AO GERAR ID DO PRESTADOR:", erroId);

                        return res.status(500).json({
                            sucesso: false,
                            mensagem: "Erro ao gerar ID do profissional."
                        });
                    }

                    const idPrestador = resultadoId.insertId;

                    // Cadastra os dados do profissional
                    db.query(
                        `INSERT INTO prestadores
                        (
                            id_prestador,
                            id_usuario,
                            cpf_cnpj,
                            profissao,
                            cidade,
                            estado,
                            valor_diaria,
                            descricao
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            idPrestador,
                            id_usuario,
                            cpf_cnpj,
                            profissao,
                            cidade,
                            estado,
                            valor_diaria,
                            descricao
                        ],
                        (erro, resultado) => {

                            if (erro) {
                                console.log("ERRO AO CADASTRAR PRESTADOR:", erro);

                                return res.status(500).json({
                                    sucesso: false,
                                    mensagem: "Erro ao cadastrar os dados profissionais."
                                });
                            }

                            const fotos = req.files || [];

                            // Se não houver fotos, finaliza o cadastro
                            if (fotos.length === 0) {
                                return res.json({
                                    sucesso: true,
                                    mensagem: "Prestador cadastrado com sucesso!",
                                    id_prestador: idPrestador,
                                    quantidade_fotos: 0
                                });
                            }

                            let fotosSalvas = 0;
                            let houveErro = false;
                            let fotosProcessadas = 0;

                            // Salva cada foto no banco
                            fotos.forEach(foto => {

                                const caminhoFoto =
                                    `/uploads/prestadores/${foto.filename}`;

                                // Gera um ID para a foto
                                db.query(
                                    "INSERT INTO fotos_prestadores_id_seq () VALUES ()",
                                    (erroIdFoto, resultadoIdFoto) => {

                                        if (erroIdFoto) {
                                            console.log(
                                                "ERRO AO GERAR ID DA FOTO:",
                                                erroIdFoto
                                            );

                                            houveErro = true;
                                            fotosProcessadas++;

                                            finalizarFotos();
                                            return;
                                        }

                                        const idFoto = resultadoIdFoto.insertId;

                                        // Insere a foto na tabela
                                        db.query(
                                            `INSERT INTO fotos_prestadores
                                            (id_foto, id_prestador, url_foto)
                                            VALUES (?, ?, ?)`,
                                            [
                                                idFoto,
                                                idPrestador,
                                                caminhoFoto
                                            ],
                                            (erroFoto) => {

                                                if (erroFoto) {
                                                    console.log(
                                                        "ERRO AO SALVAR FOTO:",
                                                        erroFoto
                                                    );

                                                    houveErro = true;
                                                } else {
                                                    fotosSalvas++;
                                                }

                                                fotosProcessadas++;
                                                finalizarFotos();
                                            }
                                        );
                                    }
                                );
                            });

                            function finalizarFotos() {
                                if (fotosProcessadas !== fotos.length) {
                                    return;
                                }

                                if (houveErro) {
                                    return res.status(500).json({
                                        sucesso: false,
                                        mensagem: "Prestador cadastrado, mas houve erro ao salvar algumas fotos.",
                                        quantidade_fotos: fotosSalvas
                                    });
                                }

                                return res.json({
                                    sucesso: true,
                                    mensagem: "Prestador cadastrado com sucesso!",
                                    id_prestador: idPrestador,
                                    quantidade_fotos: fotosSalvas
                                });
                            }
                        }
                    );
                }
            );
        }
    );
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
            tipo_usuario
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


            if (resultado.length > 0) {

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
            (SELECT AVG(av.nota) FROM avaliacoes_solicitacoes av
             WHERE av.id_prestador = p.id_prestador AND av.alvo = 'PRESTADOR' AND av.nota IS NOT NULL) AS nota_media_avaliacoes,
            (SELECT COUNT(*) FROM avaliacoes_solicitacoes av
             WHERE av.id_prestador = p.id_prestador AND av.alvo = 'PRESTADOR' AND av.nota IS NOT NULL) AS total_notas_avaliacoes,
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
        ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
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
            MAX(p.cidade) AS cidade,
            MAX(p.estado) AS estado,
            (SELECT AVG(av.nota) FROM avaliacoes_solicitacoes av
             WHERE av.id_equipamento = e.id_equipamento AND av.alvo = 'EQUIPAMENTO' AND av.nota IS NOT NULL) AS nota_media_avaliacoes,
            (SELECT COUNT(*) FROM avaliacoes_solicitacoes av
             WHERE av.id_equipamento = e.id_equipamento AND av.alvo = 'EQUIPAMENTO' AND av.nota IS NOT NULL) AS total_notas_avaliacoes,
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

app.post(
    '/cadastro-equipamento',
    autenticar,
    upload.array('fotos', 5),
    (req, res) => {

        console.log("EQUIPAMENTO RECEBIDO:", req.body);
        console.log("FOTOS RECEBIDAS:", req.files);

        const {
            id_usuario,
            nome_equipamento,
            tipo_equipamento,
            descricao,
            valor_diaria,
            quantidade
        } = req.body;

        if (Number(id_usuario) !== req.usuarioAutenticado.id_usuario) {
            return res.status(403).json({ sucesso: false, mensagem: 'Você só pode cadastrar anúncios na sua conta.' });
        }

        // VERIFICAR SE O PRESTADOR EXISTE
        db.query(
            `SELECT id_prestador
             FROM prestadores
             WHERE id_usuario = ?`,
            [id_usuario],
            (erro, resultado) => {

                if (erro) {
                    console.error("ERRO AO BUSCAR PRESTADOR:", erro);

                    return res.status(500).json({
                        sucesso: false,
                        mensagem: "Erro ao buscar profissional."
                    });
                }

                if (resultado.length === 0) {
                    return res.status(404).json({
                        sucesso: false,
                        mensagem: "Profissional não encontrado."
                    });
                }

                const idPrestador = resultado[0].id_prestador;

                // GERAR ID DO EQUIPAMENTO
                db.query(
                    "INSERT INTO equipamentos_id_seq () VALUES ()",
                    (erroSequencia, resultadoSequencia) => {

                        if (erroSequencia) {
                            console.error("ERRO AO GERAR ID DO EQUIPAMENTO:", erroSequencia);

                            return res.status(500).json({
                                sucesso: false,
                                mensagem: "Erro ao gerar ID do equipamento."
                            });
                        }

                        const idEquipamento = resultadoSequencia.insertId;

                        // CADASTRAR EQUIPAMENTO
                        db.query(
                            `INSERT INTO equipamentos
                            (
                                id_equipamento,
                                id_prestador,
                                nome_equipamento,
                                tipo_equipamento,
                                descricao,
                                valor_diaria,
                                quantidade,
                                disponivel
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,

                            [
                                idEquipamento,
                                idPrestador,
                                nome_equipamento,
                                tipo_equipamento,
                                descricao,
                                valor_diaria,
                                quantidade,
                                1
                            ],

                            (erroEquipamento) => {

                                if (erroEquipamento) {
                                    console.error("ERRO AO CADASTRAR EQUIPAMENTO:", erroEquipamento);

                                    return res.status(500).json({
                                        sucesso: false,
                                        mensagem: "Erro ao cadastrar equipamento."
                                    });
                                }

                                console.log("EQUIPAMENTO CADASTRADO:", idEquipamento);

                                // CADASTRAR FOTOS
                                const fotos = req.files || [];

                                if (fotos.length === 0) {
                                    return res.json({
                                        sucesso: true,
                                        id_equipamento: idEquipamento,
                                        quantidade_fotos: 0
                                    });
                                }

                                let fotosProcessadas = 0;
                                let erroFoto = false;

                                fotos.forEach((foto) => {

                                    const urlFoto =
                                        `/uploads/equipamentos/${foto.filename}`;

                                    // GERAR ID DA FOTO
                                    db.query(
                                        "INSERT INTO fotos_equipamentos_id_seq () VALUES ()",
                                        (erroSequenciaFoto, resultadoSequenciaFoto) => {

                                            if (erroSequenciaFoto) {
                                                console.error("ERRO AO GERAR ID DA FOTO:", erroSequenciaFoto);

                                                if (!erroFoto) {
                                                    erroFoto = true;

                                                    return res.status(500).json({
                                                        sucesso: false,
                                                        mensagem: "Erro ao gerar ID da foto."
                                                    });
                                                }

                                                return;
                                            }

                                            const idFoto = resultadoSequenciaFoto.insertId;

                                            // SALVAR FOTO
                                            db.query(
                                                `INSERT INTO fotos_equipamentos
                                                (
                                                    id_foto,
                                                    id_equipamento,
                                                    url_foto
                                                )
                                                VALUES (?, ?, ?)`,

                                                [
                                                    idFoto,
                                                    idEquipamento,
                                                    urlFoto
                                                ],

                                                (erroFotoBanco) => {

                                                    if (erroFotoBanco) {
                                                        console.error("ERRO AO SALVAR FOTO:", erroFotoBanco);

                                                        if (!erroFoto) {
                                                            erroFoto = true;

                                                            return res.status(500).json({
                                                                sucesso: false,
                                                                mensagem: "Equipamento cadastrado, mas houve erro ao salvar as fotos."
                                                            });
                                                        }

                                                        return;
                                                    }

                                                    fotosProcessadas++;

                                                    if (
                                                        fotosProcessadas === fotos.length &&
                                                        !erroFoto
                                                    ) {
                                                        console.log("TODAS AS FOTOS FORAM SALVAS.");

                                                        res.json({
                                                            sucesso: true,
                                                            id_equipamento: idEquipamento,
                                                            quantidade_fotos: fotos.length
                                                        });
                                                    }
                                                }
                                            );
                                        }
                                    );
                                });
                            }
                        );
                    }
                );
            }
        );
    }
);




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
                    equipamentos: []
                });
            }

            prestador.fotos = prestador.fotos
                ? prestador.fotos.split('|||')
                : [];

            // Buscar equipamentos cadastrados pelo profissional
            db.query(
                `
                SELECT
                    e.*,

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

                    res.json({
                        sucesso: true,
                        prestador,
                        equipamentos
                    });

                }
            );

        }
    );

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

async function salvarFotoEquipamento(idEquipamento, foto) {
    const sequencia = await consultar('INSERT INTO fotos_equipamentos_id_seq () VALUES ()');
    await consultar(
        `INSERT INTO fotos_equipamentos (id_foto, id_equipamento, url_foto) VALUES (?, ?, ?)`,
        [sequencia.insertId, idEquipamento, `/uploads/equipamentos/${foto.filename}`]
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
        !tipo_equipamento?.trim() || !Number.isFinite(valor) || valor < 0 ||
        !Number.isInteger(qtd) || qtd < 1) {
        return res.status(400).json({ sucesso: false, mensagem: 'Confira os dados do equipamento.' });
    }

    try {
        const anuncio = await buscarAnuncioDoUsuario(idEquipamento, req.usuarioAutenticado.id_usuario);
        if (!anuncio) return res.status(404).json({ sucesso: false, mensagem: 'Anúncio não encontrado.' });

        const fotosAtuais = await consultar('SELECT id_foto, url_foto FROM fotos_equipamentos WHERE id_equipamento = ?', [idEquipamento]);
        let manter;
        try { manter = JSON.parse(req.body.fotosManter || '[]'); } catch { manter = []; }
        const urlsManter = new Set(Array.isArray(manter) ? manter.filter(url => fotosAtuais.some(f => f.url_foto === url)) : []);
        const novasFotos = req.files || [];
        if (urlsManter.size + novasFotos.length > 5) {
            novasFotos.forEach(f => arquivoFotoEquipamento(`/uploads/equipamentos/${f.filename}`));
            return res.status(400).json({ sucesso: false, mensagem: 'O anúncio pode ter no máximo 5 fotos.' });
        }

        await consultar(
            `UPDATE equipamentos SET nome_equipamento = ?, tipo_equipamento = ?, descricao = ?, valor_diaria = ?, quantidade = ? WHERE id_equipamento = ?`,
            [nome_equipamento.trim(), tipo_equipamento.trim(), descricao || '', valor, qtd, idEquipamento]
        );

        for (const foto of fotosAtuais) {
            if (!urlsManter.has(foto.url_foto)) {
                await consultar('DELETE FROM fotos_equipamentos WHERE id_foto = ? AND id_equipamento = ?', [foto.id_foto, idEquipamento]);
                arquivoFotoEquipamento(foto.url_foto);
            }
        }
        for (const foto of novasFotos) await salvarFotoEquipamento(idEquipamento, foto);
        res.json({ sucesso: true, mensagem: 'Anúncio atualizado.' });
    } catch (erro) {
        console.error('ERRO AO EDITAR EQUIPAMENTO:', erro);
        res.status(500).json({ sucesso: false, mensagem: 'Não foi possível atualizar o anúncio.' });
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
    if (!Number.isInteger(idEquipamento) || idEquipamento <= 0) {
        return res.status(400).json({ sucesso: false, mensagem: 'Anúncio inválido.' });
    }
    try {
        const anuncio = await buscarAnuncioDoUsuario(idEquipamento, req.usuarioAutenticado.id_usuario);
        if (!anuncio) return res.status(404).json({ sucesso: false, mensagem: 'Anúncio não encontrado.' });
        const fotos = await consultar('SELECT url_foto FROM fotos_equipamentos WHERE id_equipamento = ?', [idEquipamento]);
        await consultar('DELETE FROM fotos_equipamentos WHERE id_equipamento = ?', [idEquipamento]);
        await consultar('DELETE FROM equipamentos WHERE id_equipamento = ? AND id_prestador = ?', [idEquipamento, anuncio.id_prestador]);
        fotos.forEach(f => arquivoFotoEquipamento(f.url_foto));
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('ERRO AO EXCLUIR EQUIPAMENTO:', erro);
        res.status(500).json({ sucesso: false, mensagem: 'Não foi possível excluir o anúncio.' });
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
            `SELECT p.id_usuario, u.tipo_usuario
             FROM prestadores p
             INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
             WHERE p.id_prestador = ? LIMIT 1`,
            [idPrestador]
        );
        if (!prestadores[0]) return res.status(404).json({ sucesso: false, mensagem: 'Profissional não encontrado.' });
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
    const idEquipamentoRecebido = Number(corpo.id_equipamento);

    if (!['SERVICO', 'EQUIPAMENTO'].includes(tipo) ||
        !/^[\w-]{16,64}$/.test(idempotencia) ||
        !descricao || descricao.length > 4000 || !local || local.length > 255 ||
        !dataISOValida(dataInicio) || dataInicio < hojeEmSaoPaulo() ||
        observacoes.length > 2000) {
        return res.status(400).json({ sucesso: false, mensagem: 'Confira os dados obrigatórios da solicitação.' });
    }

    if (tipo === 'SERVICO' && (!Number.isInteger(idPrestadorRecebido) || idPrestadorRecebido <= 0 ||
        !tituloRecebido || tituloRecebido.length > 150 || dataFim)) {
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
        let titulo = tituloRecebido;
        let valorDiaria = null;

        if (tipo === 'SERVICO') {
            const prestadores = await consultarNaConexao(
                conexao,
                `SELECT p.id_prestador, p.id_usuario, u.tipo_usuario
                 FROM prestadores p INNER JOIN usuarios u ON u.id_usuario = p.id_usuario
                 WHERE p.id_prestador = ? LIMIT 1`,
                [idPrestador]
            );
            if (!prestadores[0] || String(prestadores[0].tipo_usuario).toUpperCase() !== 'PRESTADOR') {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(404).json({ sucesso: false, mensagem: 'Profissional não encontrado.' });
            }
            if (Number(prestadores[0].id_usuario) === idCliente) {
                await conexao.rollback(); transacaoAtiva = false;
                return res.status(400).json({ sucesso: false, mensagem: 'Você não pode solicitar um serviço para si mesmo.' });
            }
        } else {
            const equipamentos = await consultarNaConexao(
                conexao,
                `SELECT e.id_equipamento, e.id_prestador, e.nome_equipamento, e.quantidade,
                        e.disponivel, e.valor_diaria, p.id_usuario, u.tipo_usuario
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
            if (String(equipamento.tipo_usuario).toUpperCase() !== 'PRESTADOR') {
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
                (id_solicitacao, chave_idempotencia, id_cliente, id_prestador, id_equipamento,
                 id_conversa, tipo, titulo, descricao, local_atendimento, data_inicio, data_fim,
                 quantidade, valor_diaria, observacoes, status, cliente_visualizou_em)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGUARDANDO_RESPOSTA', CURRENT_TIMESTAMP)`,
            [sequencia.insertId, idempotencia, idCliente, idPrestador, idEquipamento, idConversa,
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
    SELECT s.id_solicitacao, s.id_cliente, s.id_prestador, s.id_equipamento,
           s.id_conversa, s.tipo, s.titulo, s.descricao, s.local_atendimento,
           s.data_inicio, s.data_fim, s.quantidade, s.valor_diaria, s.observacoes,
           s.status, s.confirmada_cliente, s.data_confirmacao_cliente,
           s.cliente_visualizou_em, s.prestador_visualizou_em,
           s.data_criacao, s.data_atualizacao,
           EXISTS(SELECT 1 FROM avaliacoes_solicitacoes av WHERE av.id_solicitacao = s.id_solicitacao) AS possui_avaliacao,
           uc.nome AS nome_contratante, up.nome AS nome_prestador,
           e.nome_equipamento AS nome_equipamento_atual,
           DATE_FORMAT(s.data_inicio, '%Y-%m-%d') AS data_inicio_iso,
           DATE_FORMAT(s.data_fim, '%Y-%m-%d') AS data_fim_iso
    FROM solicitacoes s
    INNER JOIN usuarios uc ON uc.id_usuario = s.id_cliente
    INNER JOIN prestadores p ON p.id_prestador = s.id_prestador
    INNER JOIN usuarios up ON up.id_usuario = p.id_usuario
    LEFT JOIN equipamentos e ON e.id_equipamento = s.id_equipamento
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
            `SELECT id_solicitacao, id_cliente, id_prestador, id_equipamento, tipo, status, confirmada_cliente
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
                (id_avaliacao, id_solicitacao, id_cliente, id_prestador, id_equipamento, alvo, nota, comentario)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [sequencia.insertId, idSolicitacao, idCliente, pedido.id_prestador,
                alvo === 'EQUIPAMENTO' ? pedido.id_equipamento : null,
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
             WHERE a.id_prestador = ?
             ORDER BY a.data_criacao DESC, a.id_avaliacao DESC LIMIT 50`,
            [idPrestador]
        );
        const [resumo] = await consultar(
            `SELECT COUNT(*) AS quantidade_comentarios, COUNT(CASE WHEN alvo = 'PRESTADOR' THEN nota END) AS quantidade_notas,
                    AVG(CASE WHEN alvo = 'PRESTADOR' THEN nota END) AS media
             FROM avaliacoes_solicitacoes WHERE id_prestador = ?`,
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
             WHERE a.id_equipamento = ? AND a.alvo = 'EQUIPAMENTO'
             ORDER BY a.data_criacao DESC, a.id_avaliacao DESC LIMIT 50`,
            [idEquipamento]
        );
        const [resumo] = await consultar(
            `SELECT COUNT(*) AS quantidade_comentarios, COUNT(nota) AS quantidade_notas, AVG(nota) AS media
             FROM avaliacoes_solicitacoes WHERE id_equipamento = ? AND alvo = 'EQUIPAMENTO'`,
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
