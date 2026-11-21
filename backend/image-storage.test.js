const test = require('node:test');
const assert = require('node:assert/strict');
const {
    TAMANHO_MAXIMO_IMAGEM,
    caminhoObjetoGerenciado,
    caminhoObjetoPertenceA,
    criarArmazenamentoImagens,
    criarCaminhoObjeto,
    detectarTipoImagem,
    validarImagem
} = require('./image-storage');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const WEBP = Buffer.from('RIFF0000WEBP', 'ascii');
const TEST_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature123456789';

function armazenamentoFake({ erroUpload = null, erroRemocao = null } = {}) {
    const chamadas = { uploads: [], remocoes: [] };
    const cliente = {
        storage: {
            from(bucket) {
                return {
                    async upload(caminho, buffer, opcoes) {
                        chamadas.uploads.push({ bucket, caminho, buffer, opcoes });
                        return { data: { path: caminho }, error: erroUpload };
                    },
                    async remove(caminhos) {
                        chamadas.remocoes.push({ bucket, caminhos });
                        return { data: caminhos, error: erroRemocao };
                    }
                };
            }
        }
    };
    const armazenamento = criarArmazenamentoImagens({
        env: {
            SUPABASE_URL: 'https://projeto-teste.supabase.co/',
            SUPABASE_SERVICE_ROLE_KEY: TEST_SERVICE_KEY,
            SUPABASE_STORAGE_BUCKET: 'construmax-imagens'
        },
        criarCliente: (url, chave) => {
            assert.equal(url, 'https://projeto-teste.supabase.co');
            assert.equal(chave, TEST_SERVICE_KEY);
            return cliente;
        }
    });
    return { armazenamento, chamadas };
}

test('detecta somente as assinaturas JPEG, PNG e WebP', () => {
    assert.equal(detectarTipoImagem(JPEG), 'image/jpeg');
    assert.equal(detectarTipoImagem(PNG), 'image/png');
    assert.equal(detectarTipoImagem(WEBP), 'image/webp');
    assert.equal(detectarTipoImagem(Buffer.from('not an image')), null);
});

test('gera chaves relativas gerenciadas e valida a propriedade por categoria e ID', () => {
    const caminho = criarCaminhoObjeto('trabalhosPrestador', 42, 'obra.jpg');
    assert.match(caminho, /^prestadores\/42\/trabalhos\/[a-f0-9-]{36}\.jpg$/i);
    assert.equal(caminhoObjetoGerenciado(caminho), true);
    assert.equal(caminhoObjetoPertenceA(caminho, 'trabalhosPrestador', 42), true);
    assert.equal(caminhoObjetoPertenceA(caminho, 'trabalhosPrestador', 43), false);
    assert.equal(caminhoObjetoPertenceA(caminho, 'equipamento', 42), false);
    assert.equal(caminhoObjetoPertenceA('equipamentos/9/123e4567-e89b-42d3-a456-426614174000.gif', 'equipamento', 9), true);
    assert.equal(caminhoObjetoGerenciado('/uploads/prestadores/antiga.jpg'), false);
    assert.equal(caminhoObjetoGerenciado('../equipamentos/42/foto.jpg'), false);
    assert.throws(() => criarCaminhoObjeto('equipamento', 0, 'x.png'));
});

test('envia imagem com MIME derivado dos bytes e mantem a chave privada no backend', async () => {
    const { armazenamento, chamadas } = armazenamentoFake();
    const caminho = criarCaminhoObjeto('equipamento', 9, 'maquina.png');
    assert.equal(await armazenamento.enviar({ buffer: PNG, mimetype: 'image/png', originalname: 'maquina.png' }, caminho), caminho);
    assert.equal(chamadas.uploads.length, 1);
    assert.equal(chamadas.uploads[0].bucket, 'construmax-imagens');
    assert.equal(chamadas.uploads[0].opcoes.upsert, false);
    assert.equal(chamadas.uploads[0].opcoes.contentType, 'image/png');
    assert.equal(armazenamento.urlPublica(caminho), `https://projeto-teste.supabase.co/storage/v1/object/public/construmax-imagens/${caminho}`);
    assert.equal(JSON.stringify(armazenamento).includes(TEST_SERVICE_KEY), false);
});

test('rejeita assinatura invalida e arquivos acima de 5 MB antes do provedor', async () => {
    const { armazenamento, chamadas } = armazenamentoFake();
    const caminho = criarCaminhoObjeto('perfilUsuario', 7, 'avatar.jpg');
    await assert.rejects(armazenamento.enviar({ buffer: Buffer.from('conteudo invalido'), mimetype: 'image/jpeg', originalname: 'avatar.jpg' }, caminho), /JPEG, PNG ou WebP/);
    await assert.rejects(armazenamento.enviar({ buffer: Buffer.concat([JPEG, Buffer.alloc(TAMANHO_MAXIMO_IMAGEM)]), mimetype: 'image/jpeg', originalname: 'avatar.jpg' }, caminho), /5 MB/);
    assert.equal(chamadas.uploads.length, 0);
});

test('usa a assinatura real mesmo quando o MIME declarado pelo navegador diverge', async () => {
    const { armazenamento, chamadas } = armazenamentoFake();
    const caminho = criarCaminhoObjeto('perfilUsuario', 7, 'avatar.png');
    await armazenamento.enviar({ buffer: PNG, mimetype: 'image/jpeg', originalname: 'arquivo-com-nome-errado.jpg' }, caminho);
    assert.equal(chamadas.uploads[0].opcoes.contentType, 'image/png');
});

test('valida o lote inteiro antes de iniciar qualquer upload', () => {
    assert.doesNotThrow(() => validarImagem({ buffer: WEBP, mimetype: 'image/webp', originalname: 'foto.webp' }));
    assert.throws(() => validarImagem({ buffer: Buffer.from('fake'), mimetype: 'image/png', originalname: 'foto.png' }), /JPEG, PNG ou WebP/);
});

test('remove apenas caminhos validos do registro e rejeita tentativa de exclusao cruzada', async () => {
    const { armazenamento, chamadas } = armazenamentoFake();
    const dono = criarCaminhoObjeto('equipamento', 9, 'maquina.png');
    const outroDono = criarCaminhoObjeto('equipamento', 10, 'outra.png');
    await armazenamento.remover([dono, dono], 'equipamento', 9);
    assert.equal(chamadas.remocoes.length, 1);
    assert.deepEqual(chamadas.remocoes[0].caminhos, [dono]);
    await assert.rejects(armazenamento.remover(outroDono, 'equipamento', 9), erro => erro.code === 'IMAGE_STORAGE_OWNERSHIP_MISMATCH');
    await assert.rejects(armazenamento.remover(dono, 'trabalhosPrestador', 9), erro => erro.code === 'IMAGE_STORAGE_OWNERSHIP_MISMATCH');
    assert.equal(chamadas.remocoes.length, 1);
});

test('valida formato e completude das variaveis sem revelar valores secretos', () => {
    assert.equal(criarArmazenamentoImagens({ env: {}, criarCliente: () => assert.fail('client should not be created') }).configurado, false);
    assert.throws(() => criarArmazenamentoImagens({ env: { SUPABASE_URL: 'not-a-url' } }), /incompleta/);
    assert.throws(() => criarArmazenamentoImagens({ env: {
        SUPABASE_URL: 'http://projeto-teste.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: TEST_SERVICE_KEY,
        SUPABASE_STORAGE_BUCKET: 'construmax-imagens'
    } }), /SUPABASE_URL.*invalido/);
});

test('falha claramente se a configuracao do Supabase nao estiver disponivel', async () => {
    const armazenamento = criarArmazenamentoImagens({ env: {}, criarCliente: () => assert.fail('client should not be created') });
    await assert.rejects(
        armazenamento.enviar({ buffer: JPEG, mimetype: 'image/jpeg', originalname: 'foto.jpg' }, criarCaminhoObjeto('equipamento', 1, 'foto.jpg')),
        erro => erro.code === 'IMAGE_STORAGE_NOT_CONFIGURED'
    );
});
