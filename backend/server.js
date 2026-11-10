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

    console.log("DADOS RECEBIDOS:", req.body);

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
    console.log("BODY:", req.body);
    console.log("FILES:", req.files);
    console.log("CONTENT TYPE:", req.headers["content-type"]);

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

    console.log("LOGIN RECEBIDO:", req.body);

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

    db.query(
        `
        SELECT
            p.*,
            u.nome,
            u.telefone,
            e.nome AS especialidade,

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

        LEFT JOIN prestador_especialidade pe
            ON p.id_prestador = pe.id_prestador

        LEFT JOIN especialidades e
            ON pe.id_especialidade = e.id_especialidade
        `,

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
