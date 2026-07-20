const express = require('express');
const cors = require('cors');
const db = require('./db');

console.log("SERVER DA CONSTRUMAX CARREGADO");

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('TESTE NICHOLAS');
});

app.get('/usuarios', (req, res) => {

    db.query(
        'SELECT * FROM usuarios',
        (erro, resultado) => {

            if (erro) {
                console.error(erro);
                return res.status(500).json(erro);
            }

            res.json(resultado);
        }
    );

});
app.post('/cadastro', (req, res) => {

    console.log("Dados recebidos:", req.body);

    const { nome, email, senha, telefone, tipo_usuario } = req.body;

    db.query(
        `INSERT INTO usuarios
        (nome, email, senha, telefone, tipo_usuario)
        VALUES (?, ?, ?, ?, ?)`,
        [nome, email, senha, telefone, tipo_usuario],
        (erro, resultado) => {

            if (erro) {
                console.error("ERRO SQL:", erro);
                return res.status(500).json(erro);
            }

            res.json({
                sucesso: true,
                id: resultado.insertId
            });
        }
    );
});
app.post('/login', (req, res) => {

    console.log("LOGIN RECEBIDO:", req.body);

    const { email, senha } = req.body;

    db.query(
        'SELECT * FROM usuarios WHERE email = ? AND senha = ?',
        [email, senha],
        (erro, resultado) => {

            if (erro) {
                console.error("ERRO LOGIN:", erro);
                return res.status(500).json({ sucesso: false });
            }

            console.log("RESULTADO LOGIN:", resultado);

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

//ROTA PARA OS PRESTADORES:

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
                console.error(erro);
                return res.status(500).json(erro);
            }

            res.json(resultado);
        }
    );

});



app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
});