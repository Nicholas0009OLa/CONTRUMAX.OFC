// Hash de senhas e verificação compatível com credenciais antigas para migração gradual no login.
const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2 = promisify(crypto.pbkdf2);
const PREFIXO_HASH = 'p$';
const ITERACOES = 310000;
const TAMANHO_SALT = 16;
const TAMANHO_HASH = 20;
const HASH_DUMMY = 'p$310000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAA';

function igualConstante(valorA, valorB) {
    const a = crypto.createHash('sha256').update(String(valorA), 'utf8').digest();
    const b = crypto.createHash('sha256').update(String(valorB), 'utf8').digest();
    return crypto.timingSafeEqual(a, b);
}

function hashValido(hash) {
    return typeof hash === 'string' && (hash.startsWith(PREFIXO_HASH) || hash.startsWith('pbkdf2$'));
}

// PBKDF2 usa salt aleatório; somente o hash é persistido, nunca a senha recebida.
async function criarHashSenha(senha) {
    const salt = crypto.randomBytes(TAMANHO_SALT);
    const derivada = await pbkdf2(String(senha), salt, ITERACOES, TAMANHO_HASH, 'sha256');
    return `${PREFIXO_HASH}${ITERACOES}$${salt.toString('base64url')}$${derivada.toString('base64url')}`;
}

async function verificarSenha(senha, armazenada) {
    const valor = String(armazenada || '');
    if (!hashValido(valor)) {
        return { valida: igualConstante(senha, valor), precisaAtualizar: true };
    }

    const partes = valor.split('$');
    if (partes.length !== 4) return { valida: false, precisaAtualizar: false };
    const iteracoes = Number(partes[1]);
    const tamanhoHashBase64 = partes[0] === 'pbkdf2' ? 43 : 27;
    if (!Number.isSafeInteger(iteracoes) || iteracoes < 100000 || iteracoes > 1000000 ||
        !/^[A-Za-z0-9_-]{22}$/.test(partes[2]) || !new RegExp(`^[A-Za-z0-9_-]{${tamanhoHashBase64}}$`).test(partes[3])) {
        return { valida: false, precisaAtualizar: false };
    }

    const salt = Buffer.from(partes[2], 'base64url');
    const esperado = Buffer.from(partes[3], 'base64url');
    const calculado = await pbkdf2(String(senha), salt, iteracoes, esperado.length, 'sha256');
    return {
        valida: crypto.timingSafeEqual(calculado, esperado),
        precisaAtualizar: partes[0] === 'pbkdf2' || iteracoes < ITERACOES
    };
}

module.exports = { criarHashSenha, verificarSenha, hashValido, ITERACOES, HASH_DUMMY };
