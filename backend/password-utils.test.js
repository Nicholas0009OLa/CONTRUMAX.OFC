// Testes de hash, compatibilidade de credenciais antigas e comparacao de senhas.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { criarHashSenha, verificarSenha, hashValido } = require('./password-utils');

test('armazena senha como hash PBKDF2 com salt aleatorio', async () => {
    const primeiro = await criarHashSenha('senha-de-teste');
    const segundo = await criarHashSenha('senha-de-teste');
    assert.equal(hashValido(primeiro), true);
    assert.ok(primeiro.length <= 60, 'hash deve caber em uma coluna VARCHAR(60)');
    assert.notEqual(primeiro, segundo);
    assert.equal(primeiro.includes('senha-de-teste'), false);
});

test('verifica senha correta e rejeita senha incorreta no formato PBKDF2', async () => {
    const hash = await criarHashSenha('senha-correta');
    assert.deepEqual(await verificarSenha('senha-correta', hash), { valida: true, precisaAtualizar: false });
    assert.deepEqual(await verificarSenha('senha-incorreta', hash), { valida: false, precisaAtualizar: false });
});

test('reconhece credenciais legadas e marca somente as validas para migracao gradual', async () => {
    assert.deepEqual(await verificarSenha('legada', 'legada'), { valida: true, precisaAtualizar: true });
    assert.deepEqual(await verificarSenha('errada', 'legada'), { valida: false, precisaAtualizar: true });
});

test('rejeita hash PBKDF2 malformado sem lancar excecao', async () => {
    assert.deepEqual(await verificarSenha('qualquer', 'pbkdf2$99999999$abc$xyz'), { valida: false, precisaAtualizar: false });
});

test('continua aceitando o formato PBKDF2 anterior e permite atualizacao gradual', async () => {
    const salt = crypto.randomBytes(16);
    const derivada = crypto.pbkdf2Sync('senha-intermediaria', salt, 310000, 32, 'sha256');
    const hashAnterior = `pbkdf2$310000$${salt.toString('base64url')}$${derivada.toString('base64url')}`;
    assert.deepEqual(await verificarSenha('senha-intermediaria', hashAnterior), { valida: true, precisaAtualizar: true });
});

test('hash ficticio e valido e produz custo equivalente para e-mail inexistente', async () => {
    const { HASH_DUMMY } = require('./password-utils');
    assert.equal(hashValido(HASH_DUMMY), true);
    const resultado = await verificarSenha('senha-de-teste', HASH_DUMMY);
    assert.equal(resultado.valida, false);
});
