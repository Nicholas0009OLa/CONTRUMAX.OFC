// Script legado que ajusta o próximo ID da sequência de equipamentos com base nos registros atuais.
const db = require('./db');

db.query(
    "SELECT MAX(id_equipamento) AS maior_id FROM equipamentos",
    (erro, resultado) => {

        if (erro) {
            console.log("ERRO AO CONSULTAR EQUIPAMENTOS:", erro);
            process.exit();
            return;
        }

        const proximoId = (resultado[0].maior_id || 0) + 1;

        db.query(
            `ALTER TABLE equipamentos_id_seq AUTO_INCREMENT = ${proximoId}`,
            (erroAlteracao) => {

                if (erroAlteracao) {
                    console.log("ERRO AO AJUSTAR SEQUÊNCIA:", erroAlteracao);
                } else {
                    console.log("SEQUÊNCIA AJUSTADA!");
                    console.log("PRÓXIMO ID:", proximoId);
                }

                process.exit();
            }
        );
    }
);
