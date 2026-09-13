const express = require('express');
const cors = require('cors');
const db = require('./db');

console.log("SERVER DA CONSTRUMAX CARREGADO");

const app = express();

app.use(cors());
app.use(express.json());


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
            p.estado

        FROM equipamentos e

        INNER JOIN prestadores p
            ON e.id_prestador = p.id_prestador

        INNER JOIN usuarios u
            ON p.id_usuario = u.id_usuario
        `,

        (erro, resultado) => {

            if (erro) {

                console.error(
                    "ERRO EQUIPAMENTOS:",
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
// CADASTRO DE EQUIPAMENTO
// ===============================
// O site envia id_usuario.
// O backend encontra automaticamente
// o id_prestador correspondente.
// ===============================

app.post('/cadastro-equipamento', (req, res) => {

    console.log(
        "EQUIPAMENTO RECEBIDO:",
        req.body
    );


    const {
        id_usuario,
        nome_equipamento,
        tipo_equipamento,
        descricao,
        valor_diaria,
        quantidade
    } = req.body;


    // ===============================
    // BUSCAR O PRESTADOR
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


            // Profissional não encontrado
            if (resultado.length === 0) {

                return res.status(404).json({
                    sucesso: false,
                    mensagem: "Profissional não encontrado."
                });

            }


            const idPrestador =
                resultado[0].id_prestador;


            console.log(
                "ID DO PRESTADOR:",
                idPrestador
            );


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


                    console.log(
                        "EQUIPAMENTO CADASTRADO:",
                        resultadoEquipamento.insertId
                    );


                    res.json({
                        sucesso: true,
                        id_equipamento:
                            resultadoEquipamento.insertId
                    });

                }

            );

        }

    );

});


// ===============================
// INICIAR SERVIDOR
// ===============================

app.listen(3000, () => {

    console.log(
        'Servidor rodando na porta 3000'
    );

});