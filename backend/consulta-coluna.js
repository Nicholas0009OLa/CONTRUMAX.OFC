require("dotenv").config();

const db = require("./db");

db.query(`
    CREATE TABLE prestadores_id_seq (
        id INT NOT NULL AUTO_INCREMENT,
        PRIMARY KEY (id)
    ) AUTO_INCREMENT = 14
`, (erro) => {
    if (erro) {
        console.log("ERRO:", erro.message);
    } else {
        console.log("Tabela auxiliar de prestadores criada com sucesso!");
    }

    db.end();
});