// Confirma que a resposta publica nao inclui campos privados de cadastro.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mapearPrestadorPublico } = require('./public-provider');

test('retorna somente campos publicos do profissional e exclui documento e contato privado', () => {
    const publico = mapearPrestadorPublico({
        id_prestador: 4,
        id_usuario: 90,
        cpf_cnpj: 'documento-de-teste',
        email: 'privado@example.invalid',
        telefone: '11999990000',
        senha: 'nao-retornar',
        profissao: 'Pedreiro',
        cidade: 'Cidade',
        estado: 'SP',
        valor_diaria: null,
        verificado: 1,
        avaliacao: 4.5,
        total_avaliacoes: 2,
        nota_media_avaliacoes: 5,
        total_notas_avaliacoes: 1,
        especialidades: ['Alvenaria'],
        fotos: ['/uploads/prestadores/teste.jpg']
    });

    assert.equal(publico.valor_negociavel, true);
    assert.equal(publico.avaliacao, 5);
    assert.equal(publico.total_avaliacoes, 1);
    for (const campo of ['cpf_cnpj', 'email', 'telefone', 'senha', 'id_usuario']) {
        assert.equal(Object.hasOwn(publico, campo), false);
    }
});
