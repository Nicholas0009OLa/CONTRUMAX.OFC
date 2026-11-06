const db = require('./db');

db.query(`
    CREATE TABLE equipamentos_id_seq (
        id INT NOT NULL AUTO_INCREMENT,
        PRIMARY KEY (id)
    ) AUTO_INCREMENT = 1
`, (erro) => {
    if (erro) {
        console.log("ERRO:", erro);
    } else {
        console.log("SEQUÊNCIA DE EQUIPAMENTOS CRIADA!");
    }

    process.exit();
});