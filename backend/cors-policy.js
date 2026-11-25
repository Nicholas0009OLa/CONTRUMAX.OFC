// Lista de origens autorizadas pelo navegador; FRONTEND_ORIGINS personaliza as origens adicionais.
const ORIGEM_FRONTEND_PRODUCAO = 'https://contrumax-site.onrender.com';
const ORIGENS_PADRAO = [
    ORIGEM_FRONTEND_PRODUCAO,
    'https://nicholas0009ola.github.io',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

function criarPoliticaCors(configurada) {
    const origens = String(configurada || '')
        .split(',')
        .map(origem => origem.trim())
        .filter(Boolean);
    const permitidas = new Set(origens.length ? origens : ORIGENS_PADRAO);
    // Mantém permitido o frontend de produção mesmo se a variável do Render listar outras origens.
    permitidas.add(ORIGEM_FRONTEND_PRODUCAO);

    return (origem, callback) => {
        if (!origem || permitidas.has(origem)) return callback(null, true);
        return callback(null, false);
    };
}

module.exports = { criarPoliticaCors, ORIGENS_PADRAO };
