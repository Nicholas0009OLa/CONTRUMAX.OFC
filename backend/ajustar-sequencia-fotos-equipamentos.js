
const db = require('./db');

db.query(
    "SELECT MAX(id_foto) AS maior_id FROM fotos_equipamentos",
    (erro, resultado) => {

        if (erro) {
            console.log("ERRO AO CONSULTAR FOTOS:", erro);
            process.exit();
            return;
        }

        const proximoId = (resultado[0].maior_id || 0) + 1;

        db.query(
            `ALTER TABLE fotos_equipamentos_id_seq AUTO_INCREMENT = ${proximoId}`,
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
