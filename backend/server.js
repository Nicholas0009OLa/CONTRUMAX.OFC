const express = require('express');
const cors = require('cors');
const db = require('./db');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

console.log("SERVER DA CONSTRUMAX CARREGADO");

const app = express();

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


    db.query(

        `INSERT INTO usuarios
        (
            nome,
            email,
            senha,
            telefone,
            tipo_usuario
        )
        VALUES (?, ?, ?, ?, ?)`,

        [
            nome,
            email,
            senha,
            telefone,
            tipo_usuario
        ],

        (erro, resultado) => {

            if (erro) {

                console.error("ERRO SQL CADASTRO:", erro);

                return res.status(500).json({
                    sucesso: false,
                    erro
                });
            }


            const idUsuario = resultado.insertId;


            res.json({
                sucesso: true,
                id: idUsuario
            });

        }

    );

});


// ===============================
// CADASTRO DE PRESTADOR
// ===============================

app.post('/cadastro-prestador', (req, res) => {

    console.log("PRESTADOR RECEBIDO:", req.body);

    const {
        id_usuario,
        cpf_cnpj,
        profissao,
        cidade,
        estado,
        valor_diaria,
        descricao
    } = req.body;


    // Verifica se o usuário já possui
    // um cadastro de prestador
    db.query(

        `SELECT id_prestador
         FROM prestadores
         WHERE id_usuario = ?`,

        [id_usuario],

        (erroBusca, resultadoBusca) => {

            if (erroBusca) {

                console.error(
                    "ERRO AO VERIFICAR PRESTADOR:",
                    erroBusca
                );

                return res.status(500).json({
                    sucesso: false,
                    erro: erroBusca
                });
            }


            // Se já existir, não cadastra novamente
            if (resultadoBusca.length > 0) {

                console.log(
                    "Prestador já cadastrado. Não será duplicado."
                );

                return res.json({
                    sucesso: true,
                    id_prestador: resultadoBusca[0].id_prestador,
                    ja_existia: true
                });

            }


            // Se não existir, cadastra
            db.query(

                `INSERT INTO prestadores
                (
                    id_usuario,
                    cpf_cnpj,
                    profissao,
                    cidade,
                    estado,
                    valor_diaria,
                    descricao
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)`,

                [
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

                        console.error(
                            "ERRO PRESTADOR:",
                            erro
                        );

                        return res.status(500).json({
                            sucesso: false,
                            erro
                        });
                    }


                    res.json({
                        sucesso: true,
                        id_prestador: resultado.insertId,
                        ja_existia: false
                    });

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

        `SELECT *
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
                    usuario: resultado[0]
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
            e.nome AS especialidade

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

                console.error(
                    "ERRO PRESTADORES:",
                    erro
                );

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
// LISTAR EQUIPAMENTOS
// ===============================


app.get('/equipamentos', (req, res) => {

    db.query(
        `
        SELECT
            e.*,
            u.nome,
            p.cidade,
            p.estado,
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

app.post(
    '/cadastro-equipamento',
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


        // ===============================
        // VERIFICAR SE O PRESTADOR EXISTE
        // ===============================

        db.query(
            `SELECT id_prestador
             FROM prestadores
             WHERE id_usuario = ?`,
            [id_usuario],

            (erro, resultado) => {

                if (erro) {

                    console.error(
                        "ERRO AO BUSCAR PRESTADOR:",
                        erro
                    );

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


                const idPrestador =
                    resultado[0].id_prestador;


                // ===============================
                // CADASTRAR EQUIPAMENTO
                // ===============================

                db.query(
                    `INSERT INTO equipamentos
                    (
                        id_prestador,
                        nome_equipamento,
                        tipo_equipamento,
                        descricao,
                        valor_diaria,
                        quantidade,
                        disponivel
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,

                    [
                        idPrestador,
                        nome_equipamento,
                        tipo_equipamento,
                        descricao,
                        valor_diaria,
                        quantidade,
                        1
                    ],

                    (erroEquipamento, resultadoEquipamento) => {

                        if (erroEquipamento) {

                            console.error(
                                "ERRO AO CADASTRAR EQUIPAMENTO:",
                                erroEquipamento
                            );

                            return res.status(500).json({
                                sucesso: false,
                                mensagem:
                                    "Erro ao cadastrar equipamento.",
                                erro: erroEquipamento
                            });
                        }


                        const idEquipamento =
                            resultadoEquipamento.insertId;


                        console.log(
                            "EQUIPAMENTO CADASTRADO:",
                            idEquipamento
                        );


                        // ===============================
                        // CADASTRAR AS FOTOS
                        // ===============================

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


                            db.query(
                                `INSERT INTO fotos_equipamentos
                                (
                                    id_equipamento,
                                    url_foto
                                )
                                VALUES (?, ?)`,

                                [
                                    idEquipamento,
                                    urlFoto
                                ],

                                (erroFotoBanco) => {

                                    if (erroFotoBanco) {

                                        console.error(
                                            "ERRO AO SALVAR FOTO:",
                                            erroFotoBanco
                                        );

                                        if (!erroFoto) {

                                            erroFoto = true;

                                            return res.status(500).json({
                                                sucesso: false,
                                                mensagem:
                                                    "Equipamento cadastrado, mas houve erro ao salvar as fotos."
                                            });
                                        }

                                        return;
                                    }


                                    fotosProcessadas++;


                                    if (
                                        fotosProcessadas ===
                                        fotos.length &&
                                        !erroFoto
                                    ) {

                                        console.log(
                                            "TODAS AS FOTOS FORAM SALVAS."
                                        );


                                        res.json({
                                            sucesso: true,
                                            id_equipamento:
                                                idEquipamento,
                                            quantidade_fotos:
                                                fotos.length
                                        });
                                    }

                                }
                            );

                        });

                    }
                );

            }
        );

    }
);


// ===============================
// INICIAR SERVIDOR
// ===============================

app.listen(3000, () => {

    console.log(
        'Servidor rodando na porta 3000'
    );

});