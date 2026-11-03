const mysql = require('mysql2');
const path = require('path');

// Carregar variáveis do arquivo .env
require('dotenv').config({
    path: path.join(__dirname, '.env')
});

// Conexão com TiDB Cloud
const db = mysql.createPool({

    host: process.env.TIDB_HOST,

    port: Number(process.env.TIDB_PORT || 4000),

    user: process.env.TIDB_USER,

    password: process.env.TIDB_PASSWORD,

    database: process.env.TIDB_DATABASE || 'test',

    ssl: {
        minVersion: 'TLSv1.2'
    },

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0

});

// Testar a conexão
db.getConnection((erro, conexao) => {

    if (erro) {
        console.error("ERRO AO CONECTAR AO TIDB CLOUD:", erro.message);
        return;
    }

    console.log("CONEXÃO COM TIDB CLOUD ESTABELECIDA!");

    conexao.release();

});

module.exports = db;