// Testes das origens permitidas e da configuracao externa da politica CORS.
const test = require('node:test');
const assert = require('node:assert/strict');
const { criarPoliticaCors } = require('./cors-policy');

function avaliar(politica, origem) {
    return new Promise((resolve, reject) => {
        politica(origem, (erro, permitido) => erro ? reject(erro) : resolve(permitido));
    });
}

test('CORS permite os hosts locais e o frontend publicado configurados por padrao', async () => {
    const politica = criarPoliticaCors();
    assert.equal(await avaliar(politica, 'http://localhost:5500'), true);
    assert.equal(await avaliar(politica, 'https://nicholas0009ola.github.io'), true);
    assert.equal(await avaliar(politica, 'https://contrumax-site.onrender.com'), true);
    assert.equal(await avaliar(politica, 'https://origem-desconhecida.example'), false);
});

test('CORS usa a lista configurada e aceita chamadas sem cabecalho Origin', async () => {
    const politica = criarPoliticaCors('https://site.example, https://admin.example');
    assert.equal(await avaliar(politica, 'https://site.example'), true);
    assert.equal(await avaliar(politica, 'https://contrumax-site.onrender.com'), true);
    assert.equal(await avaliar(politica, 'https://nicholas0009ola.github.io'), false);
    assert.equal(await avaliar(politica, undefined), true);
});
