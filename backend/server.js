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
            MAX(p.cidade) AS cidade,
            MAX(p.estado) AS estado,
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
