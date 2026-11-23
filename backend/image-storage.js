const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024;
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
// Keep previously stored objects manageable, even if their extension predates the upload allowlist.
const PADRAO_OBJETO_CONSTRUMAX = new RegExp(`^(?:prestadores/\\d+/(?:perfil|trabalhos)|equipamentos/\\d+|servicos/\\d+|usuarios/\\d+/perfil)/${UUID}\\.[a-z0-9]{1,8}$`, 'i');

function detectarTipoImagem(buffer) {
    if (!Buffer.isBuffer(buffer)) return null;
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

function erroImagem(mensagem) {
    const erro = new Error(mensagem);
    erro.code = 'IMAGE_INVALID_FILE';
    return erro;
}

function validarImagem(arquivo) {
    if (!arquivo?.buffer || !Buffer.isBuffer(arquivo.buffer)) throw erroImagem('Arquivo de imagem invalido.');
    if (arquivo.buffer.length > TAMANHO_MAXIMO_IMAGEM) throw erroImagem('Cada imagem deve ter no maximo 5 MB.');
    const tipoReal = detectarTipoImagem(arquivo.buffer);
    if (!tipoReal) throw erroImagem('A imagem deve ser um arquivo JPEG, PNG ou WebP valido.');
    return tipoReal;
}

function criarCaminhoObjeto(categoria, idRegistro, nomeOriginal = '') {
    const id = Number(idRegistro);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Identificador invalido para armazenar imagem.');
    const pastas = {
        perfilPrestador: `prestadores/${id}/perfil`,
        trabalhosPrestador: `prestadores/${id}/trabalhos`,
        equipamento: `equipamentos/${id}`,
        servico: `servicos/${id}`,
        perfilUsuario: `usuarios/${id}/perfil`
    };
    const pasta = pastas[categoria];
    if (!pasta) throw new Error('Categoria de imagem invalida.');
    const extensaoOriginal = path.extname(String(nomeOriginal || '')).slice(1).toLowerCase();
    const extensao = /^[a-z0-9]{1,8}$/.test(extensaoOriginal) ? extensaoOriginal : 'img';
    return `${pasta}/${crypto.randomUUID()}.${extensao}`;
}

function caminhoObjetoGerenciado(caminho) {
    return typeof caminho === 'string' && caminho.length <= 255 &&
        PADRAO_OBJETO_CONSTRUMAX.test(caminho) && !caminho.includes('..');
}

function caminhoObjetoPertenceA(caminho, categoria, idRegistro) {
    const id = Number(idRegistro);
    if (!Number.isSafeInteger(id) || id <= 0 || !caminhoObjetoGerenciado(caminho)) return false;
    const prefixos = {
        perfilPrestador: `prestadores/${id}/perfil/`,
        trabalhosPrestador: `prestadores/${id}/trabalhos/`,
        equipamento: `equipamentos/${id}/`,
        servico: `servicos/${id}/`,
        perfilUsuario: `usuarios/${id}/perfil/`
    };
    const prefixo = prefixos[categoria];
    return Boolean(prefixo && caminho.startsWith(prefixo));
}

function criarArmazenamentoImagens({ env = process.env, criarCliente = createClient } = {}) {
    const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    const chavePrivada = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    const bucket = String(env.SUPABASE_STORAGE_BUCKET || '').trim();
    const algumConfigurado = Boolean(supabaseUrl || chavePrivada || bucket);
    const configurado = Boolean(supabaseUrl && chavePrivada && bucket);
    if (algumConfigurado && !configurado) throw new Error('Configuracao do Supabase incompleta. Verifique as tres variaveis SUPABASE_* no backend.');
    if (configurado) {
        let url;
        try { url = new URL(supabaseUrl); } catch { throw new Error('SUPABASE_URL possui formato invalido.'); }
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
            throw new Error('SUPABASE_URL possui formato invalido.');
        }
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(bucket)) throw new Error('SUPABASE_STORAGE_BUCKET possui formato invalido.');
        const chaveValida = /^sb_secret_[a-zA-Z0-9_-]{20,}$/.test(chavePrivada) ||
            /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(chavePrivada);
        if (!chaveValida) throw new Error('SUPABASE_SERVICE_ROLE_KEY possui formato invalido.');
    }
    const cliente = configurado ? criarCliente(supabaseUrl, chavePrivada, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    }) : null;
    const basePublica = configurado
        ? `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}`
        : null;

    async function enviar(arquivo, caminho) {
        if (!cliente) {
            const erro = new Error('Armazenamento de imagens nao configurado no backend.');
            erro.code = 'IMAGE_STORAGE_NOT_CONFIGURED';
            throw erro;
        }
        if (!caminhoObjetoGerenciado(caminho)) throw new Error('Caminho de imagem invalido.');
        const tipo = validarImagem(arquivo);
        const { error } = await cliente.storage.from(bucket).upload(caminho, arquivo.buffer, {
            contentType: tipo,
            cacheControl: '3600',
            upsert: false
        });
        if (error) {
            const falha = new Error('Nao foi possivel enviar a imagem ao armazenamento.');
            falha.code = 'IMAGE_STORAGE_UPLOAD_FAILED';
            throw falha;
        }
        return caminho;
    }

    async function remover(caminhos, categoria, idRegistro) {
        if (!cliente) {
            const erro = new Error('Armazenamento de imagens nao configurado no backend.');
            erro.code = 'IMAGE_STORAGE_NOT_CONFIGURED';
            throw erro;
        }
        const lista = [...new Set(Array.isArray(caminhos) ? caminhos : [caminhos])];
        if (!lista.length) return;
        if (lista.some(caminho => !caminhoObjetoPertenceA(caminho, categoria, idRegistro))) {
            const erro = new Error('A imagem nao pertence ao registro autorizado para remocao.');
            erro.code = 'IMAGE_STORAGE_OWNERSHIP_MISMATCH';
            throw erro;
        }
        const { error } = await cliente.storage.from(bucket).remove(lista);
        if (error) {
            const falha = new Error('Nao foi possivel remover uma imagem do armazenamento.');
            falha.code = 'IMAGE_STORAGE_DELETE_FAILED';
            throw falha;
        }
    }

    function urlPublica(caminho) {
        if (!basePublica || !caminhoObjetoGerenciado(caminho)) return null;
        return `${basePublica}/${caminho.split('/').map(encodeURIComponent).join('/')}`;
    }

    return { configurado, bucket, basePublica, enviar, remover, urlPublica, caminhoObjetoGerenciado, caminhoObjetoPertenceA };
}

module.exports = {
    TAMANHO_MAXIMO_IMAGEM,
    detectarTipoImagem,
    validarImagem,
    caminhoObjetoGerenciado,
    caminhoObjetoPertenceA,
    criarArmazenamentoImagens,
    criarCaminhoObjeto
};
