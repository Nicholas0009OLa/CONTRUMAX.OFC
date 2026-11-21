const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:3000"
    : "https://contrumax-ofc.onrender.com";

function alternarMenuMobile() {
    const menu = document.querySelector('.nav-links');
    const botao = document.getElementById('menuMobileToggle');
    if (!menu || !botao) return;
    const aberto = menu.classList.toggle('menu-mobile-aberto');
    botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
}

document.querySelector('.nav-links')?.addEventListener('click', event => {
    if (event.target.closest('a') && window.matchMedia('(max-width: 1100px)').matches) {
        const menu = document.querySelector('.nav-links');
        const botao = document.getElementById('menuMobileToggle');
        menu?.classList.remove('menu-mobile-aberto');
        botao?.setAttribute('aria-expanded', 'false');
        botao?.setAttribute('aria-label', 'Abrir menu');
    }
});

/* ── Auth Modal ─── */
  function openModal(tab) {
    document.getElementById('chatOverlay').classList.remove('open');
    document.getElementById('modalOverlay').classList.add('open');
    switchTab(tab || 'login');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }
  function closeModalOutside(e) { if (e.target === document.getElementById('modalOverlay')) closeModal(); }
  function switchTab(tab) {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('panel-' + tab).classList.add('active');
  }
  // funaçao dos campos do prestador
 let tipoConta = "contratante";

function selectTipo(btn){

    document
        .querySelectorAll(".tipo-btn")
        .forEach(b => b.classList.remove("selected"));

    btn.classList.add("selected");

    if(btn.innerText.includes("Profissional")){

        tipoConta = "profissional";

        document.getElementById("camposProfissional").style.display = "block";

    }else{

        tipoConta = "contratante";

        document.getElementById("camposProfissional").style.display = "none";

    }

}

  /* ── Chat Modal ─── */
  let conversasDoUsuario = [];
  let conversaAtivaId = null;
  let ultimoIdMensagem = 0;
  let mensagemMaisAntigaId = 0;
  let temMensagensAntigas = false;
  let buscandoNovasMensagensChat = false;
  let intervaloConversasChat = null;
  let intervaloMensagensChat = null;
  let solicitacaoPendenteLogin = null;
  let solicitacaoAtual = null;
  let intervaloNotificacoes = null;

  function tokenChat() {
    return obterUsuarioPainel()?.auth_token || "";
  }

  async function requisicaoChat(caminho, opcoes = {}) {
    const token = tokenChat();
    if (!token) throw new Error("Entre na sua conta para usar as mensagens.");
    const resposta = await fetch(`${API_BASE_URL}${caminho}`, {
      ...opcoes,
      headers: {
        ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
        ...(opcoes.headers || {}),
        Authorization: `Bearer ${token}`
      }
    });
    const tipoResposta = resposta.headers.get('content-type') || '';
    let resultado;
    if (tipoResposta.includes('application/json')) {
      resultado = await resposta.json();
    } else {
      await resposta.text();
      if (resposta.status === 404 && opcoes.method === 'DELETE') {
        throw new Error('A exclusão ainda não está disponível no servidor ativo. Reinicie o backend local ou atualize o serviço publicado para carregar a nova rota.');
      }
      throw new Error(`O servidor retornou uma resposta inesperada (HTTP ${resposta.status}). Verifique se o backend está atualizado e ativo.`);
    }
    if (!resposta.ok || !resultado.sucesso) throw new Error(resultado.mensagem || "Não foi possível concluir a operação do chat.");
    return resultado;
  }

  function openChat() {
    if (!tokenChat()) {
      alert("Entre na sua conta para acessar suas conversas.");
      openModal("login");
      return;
    }
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('chatOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    document.querySelectorAll('.chat-tab').forEach((aba, indice) => aba.classList.toggle('active', indice === 0));
    document.querySelectorAll('.chat-list-panel').forEach((painel, indice) => painel.classList.toggle('active', indice === 0));
    closeConversation();
    document.getElementById('chat-conv-list').innerHTML = '<div class="chat-loading">Carregando conversas...</div>';
    carregarConversasChat();
    atualizarNotificacoes();
    clearInterval(intervaloConversasChat);
    intervaloConversasChat = setInterval(carregarConversasChat, 15000);
  }

  function closeChat() {
    clearInterval(intervaloConversasChat);
    clearInterval(intervaloMensagensChat);
    intervaloConversasChat = null;
    intervaloMensagensChat = null;
    conversaAtivaId = null;
    document.getElementById('chatOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  function closeChatOutside(e) { if (e.target === document.getElementById('chatOverlay')) closeChat(); }

  function switchChatTab(tab) {
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.chat-list-panel').forEach(p => p.classList.remove('active'));
    const tabs = ['conversas','suporte'];
    const idx = tabs.indexOf(tab);
    if (idx < 0) return;
    document.querySelectorAll('.chat-tab')[idx].classList.add('active');
    document.getElementById('chat-panel-' + tab).classList.add('active');
    closeConversation();
    if (tab === 'conversas') carregarConversasChat();
  }

  function openConversation(idConversa) {
    const id = Number(idConversa);
    const conversa = conversasDoUsuario.find(item => Number(item.id_conversa) === id);
    if (!conversa) return;
    conversaAtivaId = id;
    ultimoIdMensagem = 0;
    mensagemMaisAntigaId = 0;
    temMensagensAntigas = false;
    clearInterval(intervaloMensagensChat);
    document.getElementById('chat-conv-list').style.display = 'none';
    const painel = document.getElementById('chat-conversation-view');
    painel.classList.add('open');
    const nome = conversa.nome_participante || 'Conversa';
    document.querySelector('.chat-header-name').textContent = nome;
    document.querySelector('.chat-avatar-header').textContent = nome.split(/\s+/).map(parte => parte[0]).slice(0, 2).join('').toUpperCase();
    const mensagens = document.getElementById('chat-messages-list');
    mensagens.innerHTML = '<div class="chat-loading">Carregando mensagens...</div>';
    carregarMensagensChat(id, 'inicial');
    intervaloMensagensChat = setInterval(() => carregarMensagensChat(id, 'novas'), 3000);
  }

  function closeConversation() {
    clearInterval(intervaloMensagensChat);
    intervaloMensagensChat = null;
    conversaAtivaId = null;
    const lista = document.getElementById('chat-conv-list');
    const painel = document.getElementById('chat-conversation-view');
    if (lista) lista.style.display = '';
    if (painel) painel.classList.remove('open');
    const nome = document.querySelector('.chat-header-name');
    const avatar = document.querySelector('.chat-avatar-header');
    if (nome) nome.textContent = 'Mensagens';
    if (avatar) {
      avatar.textContent = '💬';
      avatar.style.background = 'var(--yellow)';
      avatar.style.color = 'var(--black)';
    }
  }

  async function sendMessage() {
    const input = document.getElementById('chat-input-field');
    const conteudo = input.value.trim();
    if (!conversaAtivaId || !conteudo) return;
    if (conteudo.length > 2000) {
      alert('A mensagem deve ter no máximo 2000 caracteres.');
      return;
    }
    const botao = document.querySelector('.chat-send');
    if (botao) botao.disabled = true;
    try {
      await requisicaoChat(`/conversas/${conversaAtivaId}/mensagens`, {
        method: 'POST',
        body: JSON.stringify({ conteudo })
      });
      input.value = '';
      await carregarMensagensChat(conversaAtivaId, 'novas');
      carregarConversasChat();
    } catch (erro) {
      alert(erro.message);
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  function sendOnEnter(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }

  async function carregarConversasChat() {
    const lista = document.getElementById('chat-conv-list');
    if (!lista || !tokenChat()) return;
    try {
      const resultado = await requisicaoChat('/conversas');
      conversasDoUsuario = resultado.conversas || [];
      if (!conversasDoUsuario.length) {
        lista.innerHTML = '<div class="chat-empty"><div class="chat-empty-icon">💬</div><div>Suas conversas aparecerão aqui.</div><div>Abra o perfil de um prestador para iniciar uma conversa.</div></div>';
        return;
      }
      lista.innerHTML = conversasDoUsuario.map(conversa => {
        const nome = escaparHTML(conversa.nome_participante || 'Usuário');
        const iniciais = escaparHTML(String(conversa.nome_participante || 'U').split(/\s+/).map(parte => parte[0]).slice(0, 2).join('').toUpperCase());
        const ultima = escaparHTML(conversa.ultima_mensagem || 'Conversa iniciada. Envie uma mensagem.');
        const data = conversa.ultima_mensagem_em || conversa.criada_em;
        const hora = data ? new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
        const naoLidas = Number(conversa.nao_lidas) || 0;
        return `<button type="button" class="chat-contact ${naoLidas ? 'unread' : ''}" onclick="openConversation(${Number(conversa.id_conversa)})">
          <span class="chat-contact-avatar">${iniciais}</span>
          <span class="chat-contact-info"><span class="chat-contact-top"><span class="chat-contact-name">${nome}</span><span class="chat-contact-time">${hora}</span></span><span class="chat-contact-msg">${ultima}</span></span>
          ${naoLidas ? `<span class="chat-unread-badge">${naoLidas}</span>` : ''}
        </button>`;
      }).join('');
    } catch (erro) {
      lista.innerHTML = `<div class="chat-empty">${escaparHTML(erro.message)}</div>`;
    }
  }

  function htmlMensagemChat(mensagem) {
    const minha = Number(mensagem.id_remetente) === Number(obterUsuarioPainel()?.id_usuario);
    const horario = mensagem.criada_em ? new Date(mensagem.criada_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    return `<div class="msg ${minha ? 'sent' : 'recv'}" data-id="${Number(mensagem.id_mensagem)}">
      ${!minha ? `<div class="msg-author">${escaparHTML(mensagem.nome_remetente || 'Participante')}</div>` : ''}
      <div class="msg-bubble">${escaparHTML(mensagem.conteudo)}</div>
      <div class="msg-footer"><span class="msg-time">${escaparHTML(horario)}</span>${minha ? `<button type="button" class="msg-delete" onclick="apagarMensagemChat(${Number(mensagem.id_conversa)}, ${Number(mensagem.id_mensagem)})" aria-label="Apagar mensagem">Apagar</button>` : ''}</div>
    </div>`;
  }

  async function apagarMensagemChat(idConversa, idMensagem) {
    if (!confirm('Apagar esta mensagem enviada?')) return;
    try {
      await requisicaoChat(`/conversas/${Number(idConversa)}/mensagens/${Number(idMensagem)}`, {
        method: 'DELETE'
      });
      document.querySelector(`#chat-messages-list .msg[data-id="${Number(idMensagem)}"]`)?.remove();
      if (!document.querySelector('#chat-messages-list .msg')) {
        document.getElementById('chat-messages-list').innerHTML = '<div class="chat-empty-history">Esta conversa ainda não tem mensagens.</div>';
      }
      await carregarConversasChat();
    } catch (erro) {
      alert(erro.message);
    }
  }

  async function carregarMensagensChat(idConversa, modo, idReferencia) {
    if (!idConversa || Number(idConversa) !== Number(conversaAtivaId)) return;
    if (modo === 'novas' && buscandoNovasMensagensChat) return;
    if (modo === 'novas') buscandoNovasMensagensChat = true;
    const conversaSolicitada = Number(conversaAtivaId);
    const painel = document.getElementById('chat-messages-list');
    const parametros = new URLSearchParams();
    if (modo === 'novas' && ultimoIdMensagem) parametros.set('depois', String(ultimoIdMensagem));
    if (modo === 'anteriores' && idReferencia) parametros.set('antes', String(idReferencia));
    const sufixo = parametros.toString() ? `?${parametros.toString()}` : '';
    try {
      const resultado = await requisicaoChat(`/conversas/${idConversa}/mensagens${sufixo}`);
      if (conversaSolicitada !== Number(conversaAtivaId)) return;
      const mensagens = resultado.mensagens || [];
      if (modo === 'inicial') {
        painel.innerHTML = `${resultado.tem_mais ? '<button type="button" class="chat-load-older" onclick="carregarMensagensAntigas()">Carregar mensagens anteriores</button>' : ''}${mensagens.map(htmlMensagemChat).join('')}${mensagens.length ? '' : '<div class="chat-empty-history">Esta conversa ainda não tem mensagens.</div>'}`;
        if (mensagens.length) {
          mensagemMaisAntigaId = Number(mensagens[0].id_mensagem);
          ultimoIdMensagem = Number(mensagens[mensagens.length - 1].id_mensagem);
        }
        painel.scrollTop = painel.scrollHeight;
        temMensagensAntigas = Boolean(resultado.tem_mais);
        carregarConversasChat();
        return;
      }
      if (modo === 'anteriores') {
        const alturaAnterior = painel.scrollHeight;
        const scrollAnterior = painel.scrollTop;
        const botaoAnterior = painel.querySelector('.chat-load-older');
        if (mensagens.length && botaoAnterior) {
          botaoAnterior.insertAdjacentHTML('afterend', mensagens.map(htmlMensagemChat).join(''));
        }
        if (!resultado.tem_mais) botaoAnterior?.remove();
        if (mensagens.length) mensagemMaisAntigaId = Number(mensagens[0].id_mensagem);
        temMensagensAntigas = Boolean(resultado.tem_mais);
        painel.scrollTop = scrollAnterior + painel.scrollHeight - alturaAnterior;
        return;
      }
      if (mensagens.length) {
        painel.querySelector('.chat-empty-history')?.remove();
        painel.insertAdjacentHTML('beforeend', mensagens.map(htmlMensagemChat).join(''));
        ultimoIdMensagem = Number(mensagens[mensagens.length - 1].id_mensagem);
        painel.scrollTop = painel.scrollHeight;
      }
    } catch (erro) {
      if (conversaSolicitada !== Number(conversaAtivaId)) return;
      if (modo === 'inicial') painel.innerHTML = `<div class="chat-empty">${escaparHTML(erro.message)}</div>`;
      console.error('Erro ao atualizar mensagens:', erro);
    } finally {
      if (modo === 'novas') buscandoNovasMensagensChat = false;
    }
  }

  function carregarMensagensAntigas() {
    if (temMensagensAntigas && conversaAtivaId && mensagemMaisAntigaId) {
      carregarMensagensChat(conversaAtivaId, 'anteriores', mensagemMaisAntigaId);
    }
  }

  let prestadorPendenteParaChat = null;

  async function iniciarConversa(idPrestador, mensagemInicial = '') {
    if (!tokenChat()) {
      prestadorPendenteParaChat = Number(idPrestador);
      alert('Entre na sua conta para conversar com este profissional.');
      fecharPerfilPrestador();
      openModal('login');
      return false;
    }
    try {
      const resultado = await requisicaoChat('/conversas', {
        method: 'POST',
        body: JSON.stringify({ id_prestador: Number(idPrestador) })
      });
      if (mensagemInicial.trim()) {
        await requisicaoChat(`/conversas/${resultado.id_conversa}/mensagens`, {
          method: 'POST',
          body: JSON.stringify({ conteudo: mensagemInicial.trim() })
        });
      }
      if (document.getElementById('modalPerfilPrestador')?.classList.contains('ativo')) {
        fecharPerfilPrestador();
      }
      openChat();
      await carregarConversasChat();
      const lista = document.querySelectorAll('.chat-tab');
      if (lista[0]) switchChatTab('conversas');
      openConversation(resultado.id_conversa);
      return true;
    } catch (erro) {
      alert(erro.message);
      return false;
    }
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeChat(); } });
  
 
function mascararTelefoneBrasil(valor) {
    const digitos = String(valor || '').replace(/\D/g, '').slice(0, 11);
    if (digitos.length <= 2) return digitos.length === 2 ? `(${digitos}) ` : digitos;
    const ddd = digitos.slice(0, 2);
    const numero = digitos.slice(2);
    const divisor = digitos.length > 10 || numero.startsWith('9') ? 5 : 4;
    if (numero.length <= divisor) return `(${ddd}) ${numero}`;
    return `(${ddd}) ${numero.slice(0, divisor)}-${numero.slice(divisor)}`;
}

function mascararCpfCnpj(valor) {
    const digitos = String(valor || '').replace(/\D/g, '').slice(0, 14);
    if (digitos.length <= 11) {
        if (digitos.length <= 3) return digitos;
        if (digitos.length <= 6) return `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
        if (digitos.length <= 9) return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
        return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
    }
    if (digitos.length <= 2) return digitos;
    if (digitos.length <= 5) return `${digitos.slice(0, 2)}.${digitos.slice(2)}`;
    if (digitos.length <= 8) return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5)}`;
    if (digitos.length <= 12) return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8)}`;
    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

function anexarMascaraNumerica(campo, mascara) {
    if (!campo || campo.dataset.mascaraCadastro === 'ativa') return;
    campo.dataset.mascaraCadastro = 'ativa';
    campo.addEventListener('keydown', evento => {
        if (evento.key.length === 1 && !/^\d$/.test(evento.key) && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
            evento.preventDefault();
        }
    });
    campo.addEventListener('input', evento => {
        const elemento = evento.currentTarget;
        const posicaoAntiga = elemento.selectionStart ?? elemento.value.length;
        const digitosAntes = elemento.value.slice(0, posicaoAntiga).replace(/\D/g, '').length;
        const valorFormatado = mascara(elemento.value);
        elemento.value = valorFormatado;
        let digitosContados = 0;
        let novaPosicao = valorFormatado.length;
        if (digitosAntes === 0) novaPosicao = 0;
        else {
            for (let indice = 0; indice < valorFormatado.length; indice++) {
                if (/\d/.test(valorFormatado[indice])) digitosContados++;
                if (digitosContados === digitosAntes) {
                    novaPosicao = indice + 1;
                    while (novaPosicao < valorFormatado.length && !/\d/.test(valorFormatado[novaPosicao])) novaPosicao++;
                    break;
                }
            }
        }
        elemento.setSelectionRange?.(novaPosicao, novaPosicao);
    });
}

let fotosCadastroPrestador = [];

function inicializarCamposCadastro() {
    anexarMascaraNumerica(document.getElementById('telefone'), mascararTelefoneBrasil);
    anexarMascaraNumerica(document.getElementById('cpfCnpj'), mascararCpfCnpj);
    document.getElementById('fotosPrestador')?.addEventListener('change', evento => {
        const novas = Array.from(evento.currentTarget.files || []);
        const vagas = Math.max(0, 5 - fotosCadastroPrestador.length);
        if (novas.length > vagas) alert(`Você pode selecionar mais ${vagas} foto(s). O limite é cinco.`);
        fotosCadastroPrestador.push(...novas.slice(0, vagas).filter(arquivo => arquivo.type.startsWith('image/')));
        evento.currentTarget.value = '';
        renderizarPreviewFotosCadastro();
    });
}

function removerFotoCadastroPrestador(indice) {
    fotosCadastroPrestador.splice(Number(indice), 1);
    renderizarPreviewFotosCadastro();
}

function renderizarPreviewFotosCadastro() {
    const preview = document.getElementById('previewFotosPrestador');
    if (!preview) return;
    preview.querySelectorAll('img').forEach(imagem => URL.revokeObjectURL(imagem.src));
    preview.innerHTML = fotosCadastroPrestador.map((foto, indice) => `<div class="foto-cadastro-preview"><img src="${URL.createObjectURL(foto)}" alt="Prévia da foto ${indice + 1}"><button type="button" onclick="removerFotoCadastroPrestador(${indice})" aria-label="Remover foto ${indice + 1}">×</button></div>`).join('');
    const status = document.getElementById('statusFotosPrestador');
    if (status) status.textContent = `${fotosCadastroPrestador.length} de 5 fotos selecionadas.`;
}

function validarCpfCnpj(valor) {
    const digitos = String(valor || '').replace(/\D/g, '');
    if (/^(\d)\1+$/.test(digitos)) return false;
    if (digitos.length === 11) {
        const calcular = tamanho => {
            const soma = digitos.slice(0, tamanho).split('').reduce((total, numero, indice) => total + Number(numero) * (tamanho + 1 - indice), 0);
            const resto = (soma * 10) % 11;
            return resto === 10 ? 0 : resto;
        };
        return calcular(9) === Number(digitos[9]) && calcular(10) === Number(digitos[10]);
    }
    if (digitos.length === 14) {
        const calcular = pesos => {
            const soma = pesos.reduce((total, peso, indice) => total + Number(digitos[indice]) * peso, 0);
            const resto = soma % 11;
            return resto < 2 ? 0 : 11 - resto;
        };
        const primeiro = calcular([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        const segundo = calcular([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        return primeiro === Number(digitos[12]) && segundo === Number(digitos[13]);
    }
    return false;
}

function telefoneBrasilValido(valor) {
    const digitos = String(valor || '').replace(/\D/g, '');
    return /^[1-9]\d{9,10}$/.test(digitos) && Number(digitos.slice(0, 2)) >= 11;
}

function mostrarErroCadastro(mensagem, idCampo) {
    alert(mensagem);
    document.getElementById(idCampo)?.focus();
}

function validarFormularioCadastro(tipoUsuario) {
    const nome = document.getElementById('nome').value.trim();
    const emailCampo = document.getElementById('email');
    const email = emailCampo.value.trim();
    const telefone = document.getElementById('telefone').value;
    const senha = document.getElementById('senha').value;
    if (!nome) { mostrarErroCadastro('Informe seu nome.', 'nome'); return false; }
    if (!email || !emailCampo.checkValidity()) { mostrarErroCadastro('Informe um e-mail válido.', 'email'); return false; }
    if (!telefoneBrasilValido(telefone)) { mostrarErroCadastro('Informe um telefone com DDD e 10 ou 11 números.', 'telefone'); return false; }
    if (!senha) { mostrarErroCadastro('Informe uma senha.', 'senha'); return false; }
    if (tipoUsuario === 'profissional') {
        if (!validarCpfCnpj(document.getElementById('cpfCnpj').value)) {
            mostrarErroCadastro('Informe um CPF ou CNPJ completo e válido.', 'cpfCnpj'); return false;
        }
        for (const [id, rotulo] of [['profissao', 'profissão'], ['cidade', 'cidade'], ['estado', 'estado']]) {
            if (!document.getElementById(id).value.trim()) {
                mostrarErroCadastro(`Informe sua ${rotulo}.`, id); return false;
            }
        }
        if (fotosCadastroPrestador.length > 5) {
            mostrarErroCadastro('Selecione no máximo 5 fotos.', 'fotosPrestador'); return false;
        }
    }
    return true;
}

function alternarVisibilidadeSenha(botao) {
    const campo = document.getElementById(botao?.dataset.campoSenha || '');
    if (!campo) return;
    const mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    botao.setAttribute('aria-pressed', mostrar ? 'true' : 'false');
    botao.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
}

async function cadastrarUsuario() {

    const nome = document.getElementById("nome").value.trim();
    const telefone = document.getElementById("telefone").value.replace(/\D/g, '');
    const email = document.getElementById("email").value.trim();
    const senha = document.getElementById("senha").value;

    const tipo_usuario = tipoConta;
    if (!validarFormularioCadastro(tipo_usuario)) return;

    const dados = {
        nome,
        telefone,
        email,
        senha,
        tipo_usuario
    };

    try {

        const resposta = await fetch(
            `${API_BASE_URL}/cadastro`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(dados)
            }
        );

        const resultado = await resposta.json();
        if (!resposta.ok || !resultado.sucesso) {
            alert(resultado.mensagem || resultado.erro || 'Não foi possível criar a conta. Confira os dados informados.');
            return;
        }

        if (resultado.sucesso) {

            localStorage.setItem(
                "usuario",
                JSON.stringify({
                    id_usuario: resultado.id,
                    nome: nome,
                    email: email,
                    tipo_usuario: tipo_usuario === "profissional" ? "PRESTADOR" : "CLIENTE",
                    auth_token: resultado.token
                })
            );

            // Cadastro dos dados profissionais
            if (tipo_usuario === "profissional") {

                const dadosProfissional = new FormData();

                dadosProfissional.append("id_usuario", resultado.id);

                dadosProfissional.append(
                    "cpf_cnpj",
                    document.getElementById("cpfCnpj").value.replace(/\D/g, '')
                );

                dadosProfissional.append(
                    "profissao",
                    document.getElementById("profissao").value.trim()
                );

                dadosProfissional.append(
                    "cidade",
                    document.getElementById("cidade").value.trim()
                );

                dadosProfissional.append(
                    "estado",
                    document.getElementById("estado").value.trim()
                );

                dadosProfissional.append(
                    "valor_diaria",
                    document.getElementById("valorDiaria").value
                );

                dadosProfissional.append(
                    "descricao",
                    document.getElementById("descricao").value.trim()
                );

                // Adiciona as fotos selecionadas depois de validar a quantidade antes do cadastro da conta.
                fotosCadastroPrestador.forEach(foto => dadosProfissional.append("fotos", foto));

                const respostaProfissional = await fetch(
                    `${API_BASE_URL}/cadastro-prestador`,
                    {
                        method: "POST",
                        headers: { Authorization: `Bearer ${resultado.token}` },
                        body: dadosProfissional
                    }
                );

                const resultadoProfissional =
                    await respostaProfissional.json();

                if (!resultadoProfissional.sucesso) {
                    console.error(resultadoProfissional);
                    alert(
                        "Usuário criado, mas ocorreu um erro nos dados profissionais ou nas fotos."
                    );
                    return;
                }
            }

            alert("Cadastro realizado com sucesso!");

            fotosCadastroPrestador = [];
            renderizarPreviewFotosCadastro();

            closeModal();
            verificarLogin();
            retomarSolicitacaoPendente();

        }

    } catch (erro) {

        console.error(erro);
        alert("Erro ao cadastrar.");

    }
}

async function loginUsuario() {

    const email = document.getElementById("loginEmail").value;
    const senha = document.getElementById("loginSenha").value;

    try {

        const resposta = await fetch(
            `${API_BASE_URL}/login`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    senha
                })
            }
        );

        const resultado = await resposta.json();
        console.log("RETORNO CADASTRO:", resultado);
        

       if (resultado.sucesso) {

    localStorage.setItem(
        "usuario",
        JSON.stringify({ ...resultado.usuario, auth_token: resultado.token })
    );

    closeModal();

    verificarLogin(); // atualiza o menu imediatamente

    if (String(resultado.usuario.tipo_usuario || '').toUpperCase() === 'ADMIN') {
        abrirPainelUsuario('admin-dashboard');
        return;
    }

    if (prestadorPendenteParaChat) {
        const idPrestadorPendente = prestadorPendenteParaChat;
        prestadorPendenteParaChat = null;
        iniciarConversa(idPrestadorPendente);
    }
    retomarSolicitacaoPendente();

} else {

            alert("E-mail ou senha inválidos");

        }

    } catch (erro) {

        console.error(erro);
        alert("Erro ao fazer login.");

    }

}
const usuario = JSON.parse(localStorage.getItem("usuario"));

if(usuario){
    document.querySelector(".btn-login").innerHTML =
        `👤 ${usuario.nome}`;
}
function usuarioComSessao() {
    const usuario = obterUsuarioPainel();
    if (!usuario?.auth_token) {
        alert("Sua sessão expirou. Entre novamente para gerenciar os anúncios.");
        openModal("login");
        return null;
    }
    return usuario;
}

function abrirEdicaoEquipamento(id) {
    const equipamento = equipamentosDoPainel.find(item => Number(item.id_equipamento) === Number(id));
    if (!equipamento) return;
    document.getElementById("modalEditarEquipamento")?.remove();
    const fotos = equipamento.fotos || [];
    const modal = document.createElement("div");
    modal.id = "modalEditarEquipamento";
    modal.className = "modal-editar-equipamento";
    modal.innerHTML = `
        <form class="form-editar-equipamento" onsubmit="salvarEdicaoEquipamento(event, ${Number(id)})">
            <button type="button" class="fechar-edicao-equipamento" onclick="fecharEdicaoEquipamento()" aria-label="Fechar">×</button>
            <h2>Editar equipamento</h2>
            <label>Nome<input name="nome_equipamento" required maxlength="150" value="${escaparTextoPainel(equipamento.nome_equipamento)}"></label>
            <label>Tipo<input name="tipo_equipamento" required maxlength="100" value="${escaparTextoPainel(equipamento.tipo_equipamento)}"></label>
            <label>Descrição<textarea name="descricao" rows="4">${escaparTextoPainel(equipamento.descricao || "")}</textarea></label>
            <div class="campos-editar-linha">
                <label>Valor da diária<input name="valor_diaria" type="number" min="0" step="0.01" required value="${escaparTextoPainel(equipamento.valor_diaria)}"></label>
                <label>Quantidade<input name="quantidade" type="number" min="1" step="1" required value="${escaparTextoPainel(equipamento.quantidade)}"></label>
            </div>
            <label>Fotos atuais <span class="ajuda-editar-fotos">Desmarque as que deseja remover.</span></label>
            <div class="fotos-editar-equipamento">
                ${fotos.map((foto, i) => `<label class="foto-editar-item"><img src="${API_BASE_URL}${escaparTextoPainel(foto)}" alt="Foto atual ${i + 1}"><span><input type="checkbox" name="fotosManter" value="${escaparTextoPainel(foto)}" checked> Manter</span></label>`).join("") || "<p>Este anúncio não tem fotos.</p>"}
            </div>
            <label>Adicionar fotos<input name="fotos" type="file" accept="image/*" multiple></label>
            <small>Máximo de 5 fotos no total.</small>
            <div class="botoes-editar-equipamento"><button class="acao-anuncio-principal" type="submit">Salvar alterações</button><button class="acao-anuncio-secundaria" type="button" onclick="fecharEdicaoEquipamento()">Cancelar</button></div>
        </form>`;
    modal.addEventListener("click", event => { if (event.target === modal) fecharEdicaoEquipamento(); });
    document.body.appendChild(modal);
    modal.querySelector('input[type="file"]').addEventListener("change", event => {
        const manter = modal.querySelectorAll('input[name="fotosManter"]:checked').length;
        if (manter + event.target.files.length > 5) {
            alert("O anúncio pode ter no máximo 5 fotos.");
            event.target.value = "";
        }
    });
}

function fecharEdicaoEquipamento() {
    document.getElementById("modalEditarEquipamento")?.remove();
}

async function salvarEdicaoEquipamento(event, id) {
    event.preventDefault();
    const usuario = usuarioComSessao();
    if (!usuario) return;
    const form = event.currentTarget;
    const dados = new FormData();
    ["nome_equipamento", "tipo_equipamento", "descricao", "valor_diaria", "quantidade"].forEach(nome => {
        dados.append(nome, form.elements.namedItem(nome).value);
    });
    const fotosManter = [...form.querySelectorAll('input[name="fotosManter"]:checked')].map(campo => campo.value);
    dados.set("fotosManter", JSON.stringify(fotosManter));
    [...form.querySelector('input[name="fotos"]').files].forEach(foto => dados.append("fotos", foto));
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
        const resposta = await fetch(`${API_BASE_URL}/equipamentos/${id}`, {
            method: "PUT",
            headers: { Authorization: `Bearer ${usuario.auth_token}` },
            body: dados
        });
        const resultado = await resposta.json();
        if (!resposta.ok || !resultado.sucesso) throw new Error(resultado.mensagem || "Não foi possível atualizar o anúncio.");
        fecharEdicaoEquipamento();
        await carregarMeusAnuncios();
        alert("Anúncio atualizado com sucesso.");
    } catch (erro) {
        alert(erro.message || "Erro ao atualizar o anúncio.");
        botao.disabled = false;
    }
}

async function alternarDisponibilidadeEquipamento(id) {
    const usuario = usuarioComSessao();
    if (!usuario) return;
    const equipamento = equipamentosDoPainel.find(item => Number(item.id_equipamento) === Number(id));
    if (!equipamento) return;
    try {
        const resposta = await fetch(`${API_BASE_URL}/equipamentos/${id}/disponibilidade`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${usuario.auth_token}` },
            body: JSON.stringify({ disponivel: Number(equipamento.disponivel) === 1 ? 0 : 1 })
        });
        const resultado = await resposta.json();
        if (!resposta.ok || !resultado.sucesso) throw new Error(resultado.mensagem || "Não foi possível alterar a disponibilidade.");
        await carregarMeusAnuncios();
    } catch (erro) { alert(erro.message || "Erro ao alterar a disponibilidade."); }
}

async function excluirEquipamento(id) {
    if (!confirm("Tem certeza de que deseja excluir este anúncio? Esta ação não pode ser desfeita.")) return;
    const usuario = usuarioComSessao();
    if (!usuario) return;
    try {
        const resposta = await fetch(`${API_BASE_URL}/equipamentos/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${usuario.auth_token}` }
        });
        const resultado = await resposta.json();
        if (!resposta.ok || !resultado.sucesso) throw new Error(resultado.mensagem || "Não foi possível excluir o anúncio.");
        await carregarMeusAnuncios();
    } catch (erro) { alert(erro.message || "Erro ao excluir o anúncio."); }
}

function verificarLogin() {

    const usuario = JSON.parse(
        localStorage.getItem("usuario")
    );

    if (usuario) {

        const ehAdmin = String(usuario.tipo_usuario || '').toUpperCase() === 'ADMIN';
        document.querySelectorAll('.admin-nav-btn').forEach(botao => { botao.hidden = !ehAdmin; });
        document.querySelectorAll('.painel-sidebar > .painel-nav-btn:not(.admin-nav-btn):not(.opcao-sair), .painel-sidebar > .painel-sidebar-divider').forEach(botao => { botao.hidden = ehAdmin; });
        const tituloPainel = document.querySelector('.painel-usuario-header h2');
        if (tituloPainel) tituloPainel.textContent = ehAdmin ? 'Painel administrativo' : 'Minha área';

        atualizarRotulosPedidos();

        document.getElementById("btnCadastro").style.display = "none";

        document.getElementById("btnLogin").innerHTML =
            `👤 ${usuario.nome}`;

        document.getElementById("btnLogin").onclick =
            mostrarMenuUsuario;
        iniciarPollingNotificacoes();
    } else {
        iniciarPollingNotificacoes();
    }
}

function atualizarRotulosPedidos() {
    const usuario = obterUsuarioPainel();
    const texto = String(usuario?.tipo_usuario || usuario?.tipo || '').toUpperCase() === 'PRESTADOR'
        ? '📩 Solicitações recebidas' : '📦 Meus pedidos';
    const menu = document.getElementById('navPedidosDropdown');
    const painel = document.getElementById('nav-pedidos');
    if (menu) menu.innerHTML = `${texto}<span id="badgePedidosDropdown" class="badge-notificacao badge-notificacao-inline" hidden></span>`;
    if (painel) painel.innerHTML = `${texto}<span id="badgePedidosPainel" class="badge-notificacao" hidden></span>`;
}

function atualizarBadgeNotificacao(id, quantidade) {
    const badge = document.getElementById(id);
    if (!badge) return;
    const total = Math.max(0, Number(quantidade) || 0);
    badge.hidden = total === 0;
    badge.textContent = total > 99 ? '99+' : String(total);
}

async function atualizarNotificacoes() {
    if (!tokenChat()) {
        atualizarBadgeNotificacao('badgeChatNotificacoes', 0);
        atualizarBadgeNotificacao('badgePedidosDropdown', 0);
        atualizarBadgeNotificacao('badgePedidosPainel', 0);
        return;
    }
    try {
        const resumo = await requisicaoChat('/notificacoes/resumo');
        atualizarBadgeNotificacao('badgeChatNotificacoes', resumo.mensagens_nao_lidas);
        atualizarBadgeNotificacao('badgePedidosDropdown', resumo.acoes_pendentes);
        atualizarBadgeNotificacao('badgePedidosPainel', resumo.acoes_pendentes);
    } catch (erro) {
        console.debug('Notificações indisponíveis no momento.');
    }
}

function iniciarPollingNotificacoes() {
    clearInterval(intervaloNotificacoes);
    if (!tokenChat()) {
        atualizarBadgeNotificacao('badgeChatNotificacoes', 0);
        atualizarBadgeNotificacao('badgePedidosDropdown', 0);
        atualizarBadgeNotificacao('badgePedidosPainel', 0);
        intervaloNotificacoes = null;
        return;
    }
    atualizarNotificacoes();
    intervaloNotificacoes = setInterval(atualizarNotificacoes, 20000);
}

function mostrarMenuUsuario() {
    const dropdown = document.getElementById("dropdownUsuario");
    dropdown.classList.toggle("ativo");
}

async function sairDaConta() {
    const usuario = obterUsuarioPainel();
    if (usuario?.auth_token) {
        try {
            await fetch(`${API_BASE_URL}/logout`, {
                method: "POST",
                headers: { Authorization: `Bearer ${usuario.auth_token}` }
            });
        } catch (erro) {
            console.warn("Não foi possível encerrar a sessão no servidor.", erro);
        }
    }
    localStorage.removeItem("usuario");
    location.reload();
}


// =========================
// PAINEL DO USUÁRIO
// =========================

// Recupera os dados do usuário logado
function obterUsuarioPainel() {
    try {
        return JSON.parse(localStorage.getItem("usuario")) || null;
    } catch (erro) {
        return null;
    }
}

// Protege os dados exibidos na tela
function escaparTextoPainel(valor) {
    return String(valor ?? "Não informado").replace(/[&<>"']/g, caractere => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[caractere]);
}

// Abre o painel na seção escolhida
function abrirPainelUsuario(secao) {
    const usuario = obterUsuarioPainel();

    if (!usuario) {
        alert("Entre na sua conta para acessar esta área.");
        return;
    }

    const ehAdmin = String(usuario.tipo_usuario || '').toUpperCase() === 'ADMIN';
    if (ehAdmin && !String(secao).startsWith('admin-')) secao = 'admin-dashboard';
    if (!ehAdmin && String(secao).startsWith('admin-')) {
        alert('Acesso exclusivo para administradores.');
        return;
    }

    document.getElementById("painelUsuarioOverlay").classList.add("ativo");

    atualizarRotulosPedidos();
    atualizarNotificacoes();

    const dropdown = document.getElementById("dropdownUsuario");

    if (dropdown) {
        dropdown.classList.remove("ativo");
    }

    mostrarSecaoPainel(secao);
}

// Navegação entre as seções do painel
function mostrarSecaoPainel(secao) {
    const usuario = obterUsuarioPainel();
    const conteudo = document.getElementById("conteudoPainelUsuario");

    if (!usuario || !conteudo) return;

    if (String(secao).startsWith('admin-')) {
        if (String(usuario.tipo_usuario || '').toUpperCase() !== 'ADMIN') return;
        carregarSecaoAdmin(secao);
        return;
    }

    // Atualiza o botão selecionado no menu lateral
    document.querySelectorAll(".painel-nav-btn").forEach(botao => {
        const selecionado =
            botao.getAttribute("onclick") === `mostrarSecaoPainel('${secao}')`;

        botao.classList.toggle("ativo", selecionado);
    });

    // MINHA CONTA
    if (secao === "conta") {
        conteudo.innerHTML = `
            <h2 class="titulo-secao-painel">Minha conta</h2>

            <p class="descricao-secao-painel">
                Confira as informações da sua conta na CONSTRUMAX.
            </p>

            <div class="perfil-conta-resumo">
                ${usuario.foto_perfil ? `<img src="${API_BASE_URL}${escaparTextoPainel(usuario.foto_perfil)}" alt="Foto de perfil" class="perfil-conta-foto">` : `<div class="perfil-conta-foto perfil-conta-iniciais">${escaparTextoPainel(String(usuario.nome || 'U').split(' ').map(parte => parte[0]).slice(0, 2).join(''))}</div>`}
                <div class="dados-conta-painel">

                <div class="campo-conta-painel">
                    <span>Nome completo</span>
                    <strong>${escaparTextoPainel(usuario.nome)}</strong>
                </div>

                <div class="campo-conta-painel">
                    <span>E-mail</span>
                    <strong>${escaparTextoPainel(usuario.email)}</strong>
                </div>

                <div class="campo-conta-painel">
                    <span>Telefone</span>
                    <strong>${escaparTextoPainel(usuario.telefone)}</strong>
                </div>

                <div class="campo-conta-painel">
                    <span>Tipo de conta</span>
                    <strong>${escaparTextoPainel(usuario.tipo_usuario || usuario.tipo)}</strong>
                </div>
            </div>
            </div>
            <button type="button" class="btn-primary btn-editar-perfil" onclick="abrirEdicaoPerfil()">Editar perfil</button>
        `;
    }

    // MEUS ANÚNCIOS
    else if (secao === "anuncios") {
        conteudo.innerHTML = `
            <h2 class="titulo-secao-painel">Meus anúncios</h2>

            <p class="descricao-secao-painel">
                Gerencie os equipamentos e serviços que você cadastrou.
            </p>

            <p>Carregando seus anúncios...</p>
        `;

        carregarMeusAnuncios();
    
    }


    // MEUS PEDIDOS
    else if (secao === "pedidos") {
        const prestador = String(usuario.tipo_usuario || usuario.tipo || '').toUpperCase() === 'PRESTADOR';
        conteudo.innerHTML = `
            <h2 class="titulo-secao-painel">${prestador ? 'Solicitações recebidas' : 'Meus pedidos'}</h2>

            <p class="descricao-secao-painel">
                ${prestador ? 'Analise e acompanhe os pedidos enviados pelos contratantes.' : 'Acompanhe os pedidos realizados na CONSTRUMAX.'}
            </p>

            <div id="listaSolicitacoesPainel" class="lista-solicitacoes-painel mensagem-painel-vazio">
                <div>📦</div>

                <h3>Seus pedidos aparecerão aqui</h3>

                <p>
                    Estamos preparando a integração com o banco de dados
                    para exibir seus pedidos e acompanhar seus status.
                </p>
            </div>
        `;
        carregarSolicitacoesPainel(prestador);
    }
}

const rotulosStatusSolicitacao = {
    AGUARDANDO_RESPOSTA: 'Aguardando resposta', ACEITA: 'Aceita', RECUSADA: 'Recusada',
    EM_ANDAMENTO: 'Em andamento', AGUARDANDO_CONFIRMACAO_CLIENTE: 'Aguardando sua confirmação',
    CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada'
};

function formatarDataPainel(valor) {
    if (!valor) return 'Não informada';
    const texto = String(valor);
    const data = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00`) : new Date(valor);
    return Number.isNaN(data.getTime()) ? 'Não informada' : data.toLocaleDateString('pt-BR');
}

async function carregarSolicitacoesPainel(eAreaPrestador) {
    const lista = document.getElementById('listaSolicitacoesPainel');
    const usuario = obterUsuarioPainel();
    if (!lista || !usuario) return;
    try {
        const resultado = await requisicaoChat(eAreaPrestador ? '/solicitacoes/recebidas' : '/solicitacoes/minhas');
        const solicitacoes = resultado.solicitacoes || [];
        if (!solicitacoes.length) {
            lista.innerHTML = `<div><h3>${eAreaPrestador ? 'Nenhuma solicitação recebida' : 'Você ainda não enviou pedidos'}</h3><p>${eAreaPrestador ? 'Quando um contratante enviar um pedido, ele aparecerá aqui.' : 'Quando você solicitar um serviço ou equipamento, poderá acompanhar o andamento por aqui.'}</p></div>`;
            return;
        }
        lista.classList.remove('mensagem-painel-vazio');
        lista.innerHTML = solicitacoes.map(solicitacao => {
            const id = Number(solicitacao.id_solicitacao);
            const tipo = solicitacao.tipo === 'EQUIPAMENTO' ? 'Aluguel de equipamento' : 'Serviço profissional';
            const pessoa = eAreaPrestador ? solicitacao.nome_contratante : solicitacao.nome_prestador;
            const status = rotulosStatusSolicitacao[solicitacao.status] || solicitacao.status;
            const inicio = formatarDataPainel(solicitacao.data_inicio_iso || solicitacao.data_inicio);
            const periodo = solicitacao.tipo === 'EQUIPAMENTO'
                ? `${inicio} até ${formatarDataPainel(solicitacao.data_fim_iso || solicitacao.data_fim)}` : inicio;
            const aluguel = solicitacao.tipo === 'EQUIPAMENTO'
                ? `<p><strong>Quantidade:</strong> ${Number(solicitacao.quantidade)}${solicitacao.valor_diaria !== null ? ` · <strong>Diária:</strong> ${Number(solicitacao.valor_diaria).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}</p>` : '';
            let acoes = Number(solicitacao.id_conversa) > 0
                ? `<button type="button" class="acao-anuncio-secundaria" onclick="abrirChatSolicitacao(${Number(solicitacao.id_conversa)})">Conversar</button>` : '';
            if (eAreaPrestador && solicitacao.status === 'AGUARDANDO_RESPOSTA') {
                acoes += `<button type="button" class="acao-anuncio-principal" onclick="alterarStatusSolicitacao(${id}, 'ACEITA')">Aceitar</button><button type="button" class="acao-anuncio-secundaria" onclick="alterarStatusSolicitacao(${id}, 'RECUSADA')">Recusar</button>`;
            }
            if (eAreaPrestador && solicitacao.status === 'ACEITA') acoes += `<button type="button" class="acao-anuncio-principal" onclick="alterarStatusSolicitacao(${id}, 'EM_ANDAMENTO')">Marcar como em andamento</button>`;
            if (eAreaPrestador && solicitacao.status === 'EM_ANDAMENTO') acoes += `<button type="button" class="acao-anuncio-principal" onclick="alterarStatusSolicitacao(${id}, 'AGUARDANDO_CONFIRMACAO_CLIENTE')">Solicitar confirmação de conclusão</button>`;
            if (!eAreaPrestador && solicitacao.status === 'AGUARDANDO_CONFIRMACAO_CLIENTE') acoes += `<button type="button" class="acao-anuncio-principal" onclick="alterarStatusSolicitacao(${id}, 'CONCLUIDA')">Confirmar conclusão</button>`;
            if (!eAreaPrestador && ['AGUARDANDO_RESPOSTA', 'ACEITA'].includes(solicitacao.status)) acoes += `<button type="button" class="acao-anuncio-excluir" onclick="alterarStatusSolicitacao(${id}, 'CANCELADA')">Cancelar pedido</button>`;
            if (!eAreaPrestador && solicitacao.status === 'CONCLUIDA' && Number(solicitacao.confirmada_cliente) === 1) {
                acoes += Number(solicitacao.possui_avaliacao)
                    ? '<span class="avaliacao-enviada">Avaliação enviada</span>'
                    : `<button type="button" class="acao-anuncio-principal" onclick="mostrarFormularioAvaliacao(${id}, '${solicitacao.tipo}')">Avaliar</button>`;
            }
            return `<article class="solicitacao-painel-card">
                <header><div><span class="solicitacao-tipo">${escaparTextoPainel(tipo)}</span><h3>${escaparTextoPainel(solicitacao.titulo)}</h3></div><span class="solicitacao-status status-${escaparTextoPainel(solicitacao.status).toLowerCase()}">${escaparTextoPainel(status)}</span></header>
                <div class="solicitacao-resumo">
                    <p><strong>${eAreaPrestador ? 'Contratante' : 'Prestador'}:</strong> ${escaparTextoPainel(pessoa)}${eAreaPrestador ? ` · Conta #${Number(solicitacao.id_cliente)}` : ''}</p>
                    <p><strong>Pedido enviado:</strong> ${formatarDataPainel(solicitacao.data_criacao)}</p>
                    <p><strong>${solicitacao.tipo === 'EQUIPAMENTO' ? 'Período desejado' : 'Data prevista'}:</strong> ${periodo}</p>
                    <p><strong>Local:</strong> ${escaparTextoPainel(solicitacao.local_atendimento)}</p>${aluguel}
                    <p><strong>Descrição:</strong><br>${escaparTextoPainel(solicitacao.descricao)}</p>
                    ${solicitacao.observacoes ? `<p><strong>Observações:</strong><br>${escaparTextoPainel(solicitacao.observacoes)}</p>` : ''}
                </div>${acoes ? `<footer class="solicitacao-acoes">${acoes}</footer>` : ''}
                ${!eAreaPrestador && solicitacao.status === 'CONCLUIDA' && !Number(solicitacao.possui_avaliacao) ? `<div id="formAvaliacaoSolicitacao-${id}"></div>` : ''}
            </article>`;
        }).join('');
    } catch (erro) {
        lista.innerHTML = `<div><h3>Não foi possível carregar as solicitações</h3><p>${escaparTextoPainel(erro.message)}</p></div>`;
    }
}

async function alterarStatusSolicitacao(id, status) {
    const confirmacoes = {
        CANCELADA: 'Cancelar este pedido?',
        AGUARDANDO_CONFIRMACAO_CLIENTE: 'Pedir ao contratante que confirme a conclusão?',
        CONCLUIDA: 'Confirmar que o serviço ou aluguel foi concluído?'
    };
    const mensagem = confirmacoes[status] || `${rotulosStatusSolicitacao[status] || 'Atualizar'} esta solicitação?`;
    if (!confirm(mensagem)) return;
    const usuario = obterUsuarioPainel();
    const prestador = String(usuario?.tipo_usuario || usuario?.tipo || '').toUpperCase() === 'PRESTADOR';
    try {
        await requisicaoChat(`/solicitacoes/${Number(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
        await carregarSolicitacoesPainel(prestador);
        atualizarNotificacoes();
    } catch (erro) { alert(erro.message); }
}

function mostrarFormularioAvaliacao(id, tipo) {
    const local = document.getElementById(`formAvaliacaoSolicitacao-${Number(id)}`);
    if (!local) return;
    const seletorAlvo = tipo === 'EQUIPAMENTO'
        ? '<label>Avaliar<select name="alvo"><option value="EQUIPAMENTO">Este equipamento</option><option value="PRESTADOR">O prestador</option></select></label>'
        : '<input type="hidden" name="alvo" value="PRESTADOR"><p class="avaliacao-alvo">Avaliação do prestador</p>';
    local.innerHTML = `<form class="form-avaliacao" onsubmit="enviarAvaliacaoSolicitacao(event, ${Number(id)})">
        <h4>Como foi sua experiência?</h4>${seletorAlvo}
        <input type="hidden" name="nota" value="0">
        <div class="seletor-estrelas" role="group" aria-label="Nota de zero a cinco estrelas">
            <button type="button" class="nota-estrela nota-zero selecionada" onclick="selecionarNotaAvaliacao(${Number(id)}, 0)" aria-pressed="true">0 · Sem estrelas</button>
            ${[1, 2, 3, 4, 5].map(nota => `<button type="button" class="nota-estrela" onclick="selecionarNotaAvaliacao(${Number(id)}, ${nota})" aria-label="${nota} ${nota === 1 ? 'estrela' : 'estrelas'}" aria-pressed="false">${'★'.repeat(nota)}</button>`).join('')}
        </div>
        <label>Comentário <span>(opcional)</span><textarea name="comentario" maxlength="2000" rows="3" placeholder="Conte como foi o serviço ou o equipamento"></textarea></label>
        <div class="form-solicitacao-acoes"><button type="button" class="acao-anuncio-secundaria" onclick="document.getElementById('formAvaliacaoSolicitacao-${Number(id)}').innerHTML=''">Cancelar</button><button type="submit" class="acao-anuncio-principal">Enviar avaliação</button></div>
    </form>`;
}

function selecionarNotaAvaliacao(id, nota) {
    const local = document.getElementById(`formAvaliacaoSolicitacao-${Number(id)}`);
    if (!local) return;
    local.querySelector('[name="nota"]').value = String(nota);
    local.querySelectorAll('.nota-estrela').forEach(botao => {
        const valor = botao.classList.contains('nota-zero') ? 0 : (botao.getAttribute('aria-label') || '').match(/^\d/)?.[0] * 1;
        botao.classList.toggle('selecionada', valor === nota);
        botao.setAttribute('aria-pressed', valor === nota ? 'true' : 'false');
    });
}

async function enviarAvaliacaoSolicitacao(event, id) {
    event.preventDefault();
    const form = event.currentTarget;
    const nota = Number(form.elements.nota.value);
    const comentario = String(form.elements.comentario.value || '').trim();
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
        await requisicaoChat(`/solicitacoes/${Number(id)}/avaliacao`, {
            method: 'POST',
            body: JSON.stringify({ alvo: form.elements.alvo.value, nota, comentario })
        });
        await carregarSolicitacoesPainel(false);
        atualizarNotificacoes();
    } catch (erro) {
        alert(erro.message);
        botao.disabled = false;
    }
}

async function abrirChatSolicitacao(idConversa) {
    openChat();
    await carregarConversasChat();
    openConversation(Number(idConversa));
}

// Atalhos do menu superior
function abrirMinhaConta() {
    abrirPainelUsuario("conta");
}

function abrirMeusAnuncios() {
    abrirPainelUsuario("anuncios");
}

function abrirMeusPedidos() {
    abrirPainelUsuario("pedidos");
}

let dadosPerfilEdicao = null;
let fotosPerfilParaRemover = new Set();
let novasFotosPerfil = [];

async function requisicaoPerfil(opcoes = {}) {
    const usuario = obterUsuarioPainel();
    if (!usuario?.auth_token) throw new Error('Entre na sua conta para editar o perfil.');
    const resposta = await fetch(`${API_BASE_URL}/api/perfil`, {
        ...opcoes,
        headers: {
            ...(opcoes.body instanceof FormData ? {} : opcoes.body ? { 'Content-Type': 'application/json' } : {}),
            ...(opcoes.headers || {}),
            Authorization: `Bearer ${usuario.auth_token}`
        }
    });
    const resultado = await resposta.json();
    if (!resposta.ok || !resultado.sucesso) throw new Error(resultado.mensagem || 'Não foi possível atualizar o perfil.');
    return resultado;
}

async function abrirEdicaoPerfil() {
    const conteudo = document.getElementById('conteudoPainelUsuario');
    conteudo.innerHTML = '<p>Carregando seus dados…</p>';
    try {
        dadosPerfilEdicao = await requisicaoPerfil();
        fotosPerfilParaRemover = new Set();
        novasFotosPerfil = [];
        renderizarEditorPerfil();
    } catch (erro) {
        conteudo.innerHTML = `<div class="admin-erro"><p>${escaparTextoPainel(erro.message)}</p><button type="button" class="btn-primary" onclick="mostrarSecaoPainel('conta')">Voltar</button></div>`;
    }
}

function renderizarEditorPerfil() {
    const conteudo = document.getElementById('conteudoPainelUsuario');
    const usuario = dadosPerfilEdicao.usuario;
    const prestador = dadosPerfilEdicao.prestador;
    const foto = usuario.foto_perfil
        ? `<img id="fotoPerfilPreview" class="editor-perfil-foto" src="${API_BASE_URL}${escaparTextoPainel(usuario.foto_perfil)}" alt="Foto de perfil atual">`
        : `<div id="fotoPerfilPreview" class="editor-perfil-foto editor-perfil-iniciais">${escaparTextoPainel(String(usuario.nome || 'U').split(' ').map(parte => parte[0]).slice(0, 2).join(''))}</div>`;

    conteudo.innerHTML = `<h2 class="titulo-secao-painel">Editar perfil</h2>
      <p class="descricao-secao-painel">Atualize seus dados. A senha não pode ser alterada por esta tela.</p>
      <form id="formEditarPerfil" class="form-editar-perfil" onsubmit="salvarPerfil(event)">
        <div class="editor-perfil-foto-linha">${foto}<label class="campo-perfil-arquivo">Foto de perfil<input id="fotoPerfilArquivo" name="foto_perfil" type="file" accept="image/*" onchange="previsualizarFotoPerfil(event)"><small>Selecione uma imagem de até 5 MB.</small></label></div>
        <label class="campo-editar-perfil">E-mail<input name="email" type="email" maxlength="100" required value="${escaparTextoPainel(usuario.email)}" autocomplete="email"></label>
        <label class="campo-editar-perfil">Telefone<input name="telefone" type="tel" maxlength="20" value="${escaparTextoPainel(usuario.telefone || '')}" placeholder="DDD + número" autocomplete="tel"></label>
        <label class="campo-editar-perfil">Sobre mim<textarea name="descricao" maxlength="2000" rows="5" placeholder="Conte um pouco sobre você">${escaparTextoPainel(usuario.descricao || '')}</textarea></label>
        ${prestador ? `<section class="editor-fotos-trabalho"><h3>Fotos dos seus trabalhos</h3><p>Você pode manter até cinco fotos. Para substituir, marque a foto antiga para remover e adicione a nova.</p><div id="editorFotosExistentes"></div><label class="campo-perfil-arquivo">Adicionar fotos<input id="fotosTrabalhoNovas" type="file" accept="image/*" multiple onchange="adicionarFotosPerfil(this.files); this.value=''"><small>Selecione várias imagens. Máximo de cinco fotos no total.</small></label><div id="editorNovasFotos"></div><p id="contadorFotosPerfil" class="contador-fotos-perfil"></p></section>` : ''}
        <div class="acoes-editar-perfil"><button type="button" class="acao-anuncio-secundaria" onclick="mostrarSecaoPainel('conta')">Cancelar</button><button type="submit" class="acao-anuncio-principal">Salvar alterações</button></div>
      </form>`;
    if (prestador) renderizarFotosPerfilEditor();
}

function previsualizarFotoPerfil(evento) {
    const arquivo = evento.target.files?.[0];
    const preview = document.getElementById('fotoPerfilPreview');
    if (!arquivo || !preview) return;
    if (!arquivo.type.startsWith('image/')) {
        evento.target.value = '';
        alert('Selecione um arquivo de imagem.');
        return;
    }
    if (preview.tagName === 'IMG') {
        if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
        preview.src = URL.createObjectURL(arquivo);
    }
    else {
        const imagem = document.createElement('img');
        imagem.id = 'fotoPerfilPreview';
        imagem.className = 'editor-perfil-foto';
        imagem.alt = 'Prévia da nova foto de perfil';
        imagem.src = URL.createObjectURL(arquivo);
        preview.replaceWith(imagem);
    }
}

function adicionarFotosPerfil(arquivos) {
    if (!dadosPerfilEdicao?.prestador) return;
    const atuais = dadosPerfilEdicao.prestador.fotos || [];
    const disponiveis = Math.max(0, 5 - (atuais.length - fotosPerfilParaRemover.size) - novasFotosPerfil.length);
    const selecionadas = Array.from(arquivos || []);
    if (selecionadas.length > disponiveis) alert(`Você pode adicionar mais ${disponiveis} foto(s). O limite é cinco no total.`);
    novasFotosPerfil.push(...selecionadas.slice(0, disponiveis).filter(arquivo => arquivo.type.startsWith('image/')));
    renderizarFotosPerfilEditor();
}

function alternarRemocaoFotoPerfil(idFoto) {
    const atuais = dadosPerfilEdicao?.prestador?.fotos || [];
    const removendo = fotosPerfilParaRemover.has(Number(idFoto));
    if (removendo && atuais.length - (fotosPerfilParaRemover.size - 1) + novasFotosPerfil.length > 5) {
        alert('Remova uma das novas imagens antes de manter esta foto. O limite é cinco.');
        return;
    }
    if (removendo) fotosPerfilParaRemover.delete(Number(idFoto));
    else fotosPerfilParaRemover.add(Number(idFoto));
    renderizarFotosPerfilEditor();
}

function removerNovaFotoPerfil(indice) {
    novasFotosPerfil.splice(Number(indice), 1);
    renderizarFotosPerfilEditor();
}

function renderizarFotosPerfilEditor() {
    const existentes = document.getElementById('editorFotosExistentes');
    const novas = document.getElementById('editorNovasFotos');
    if (!existentes || !novas) return;
    novas.querySelectorAll('img').forEach(imagem => {
        if (imagem.src.startsWith('blob:')) URL.revokeObjectURL(imagem.src);
    });
    existentes.innerHTML = (dadosPerfilEdicao.prestador.fotos || []).map(foto => {
        const vaiRemover = fotosPerfilParaRemover.has(Number(foto.id_foto));
        return `<article class="foto-perfil-item ${vaiRemover ? 'foto-perfil-remover' : ''}"><img src="${API_BASE_URL}${escaparTextoPainel(foto.url_foto)}" alt="Foto de trabalho atual"><button type="button" onclick="alternarRemocaoFotoPerfil(${Number(foto.id_foto)})">${vaiRemover ? 'Manter foto' : 'Remover / substituir'}</button></article>`;
    }).join('') || '<p>Você ainda não adicionou fotos de trabalhos.</p>';
    novas.innerHTML = novasFotosPerfil.map((arquivo, indice) => `<article class="foto-perfil-item"><img src="${URL.createObjectURL(arquivo)}" alt="Prévia da nova foto"><button type="button" onclick="removerNovaFotoPerfil(${indice})">Remover nova foto</button></article>`).join('');
    const contador = document.getElementById('contadorFotosPerfil');
    if (contador) contador.textContent = `${(dadosPerfilEdicao.prestador.fotos || []).length - fotosPerfilParaRemover.size + novasFotosPerfil.length} de 5 fotos após salvar`;
}

async function salvarPerfil(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const formulario = new FormData();
    formulario.append('email', form.elements.email.value.trim());
    formulario.append('telefone', form.elements.telefone.value.trim());
    formulario.append('descricao', form.elements.descricao.value.trim());
    const fotoPerfil = form.elements.foto_perfil.files?.[0];
    if (fotoPerfil) formulario.append('foto_perfil', fotoPerfil);
    if (dadosPerfilEdicao?.prestador) {
        formulario.append('fotos_remover', JSON.stringify([...fotosPerfilParaRemover]));
        novasFotosPerfil.forEach(foto => formulario.append('fotos_trabalhos', foto));
    }
    const botao = form.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
        const resultado = await requisicaoPerfil({ method: 'PUT', body: formulario });
        const usuario = obterUsuarioPainel();
        localStorage.setItem('usuario', JSON.stringify({ ...usuario, ...resultado.usuario, auth_token: usuario.auth_token }));
        alert(resultado.mensagem || 'Perfil atualizado com sucesso.');
        mostrarSecaoPainel('conta');
    } catch (erro) {
        alert(erro.message || 'Não foi possível salvar o perfil.');
        botao.disabled = false;
    }
}

async function requisicaoAdmin(caminho, opcoes = {}) {
    const usuario = obterUsuarioPainel();
    if (String(usuario?.tipo_usuario || '').toUpperCase() !== 'ADMIN' || !usuario?.auth_token) {
        throw new Error('Acesso exclusivo para administradores.');
    }
    const resposta = await fetch(`${API_BASE_URL}${caminho}`, {
        ...opcoes,
        headers: {
            ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
            ...(opcoes.headers || {}),
            Authorization: `Bearer ${usuario.auth_token}`
        }
    });
    const resultado = await resposta.json();
    if (!resposta.ok || !resultado.sucesso) throw new Error(resultado.mensagem || 'Não foi possível concluir a operação administrativa.');
    return resultado;
}

function renderizarTabelaAdmin(titulo, buscaPlaceholder, colunas, linhas, secao) {
    const conteudo = document.getElementById('conteudoPainelUsuario');
    conteudo.innerHTML = `<h2 class="titulo-secao-painel">${titulo}</h2>
      <div class="admin-busca"><input id="buscaAdmin" type="search" value="${escaparTextoPainel(buscaAdminAtual)}" placeholder="${buscaPlaceholder}" onkeydown="if(event.key==='Enter') carregarSecaoAdmin('${secao}')">
      <button type="button" class="btn-primary" onclick="carregarSecaoAdmin('${secao}')">Buscar</button></div>
      <div class="admin-tabela-wrap"><table class="admin-tabela"><thead><tr>${colunas.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>`;
}

function botaoAdminRotulo(ativo, alvo, id, verbo) {
    const rotulo = ativo ? (verbo === 'visivel' ? 'Ocultar' : 'Suspender') : (verbo === 'visivel' ? 'Reativar' : 'Reativar');
    return `<button class="admin-acao" type="button" onclick="alterarStatusAdmin('${alvo}','${String(id)}',${ativo ? 0 : 1})">${rotulo}</button>`;
}

async function alterarStatusAdmin(alvo, id, valor) {
    if (alvo === 'equipamento' && valor === 0 && !confirm('Ocultar este anúncio? O histórico de solicitações será preservado.')) return;
    if (alvo === 'usuario' && valor === 0 && !confirm('Suspender esta conta? A pessoa perderá acesso à plataforma.')) return;
    if (alvo === 'prestador' && valor === 0 && !confirm('Suspender este perfil profissional?')) return;
    try {
        const mapas = {
            usuario: [`/api/admin/usuarios/${id}/status`, { ativo: valor }],
            prestador: [`/api/admin/prestadores/${id}/status`, { ativo: valor }],
            equipamento: [`/api/admin/equipamentos/${id}/status`, { visivel: valor }],
            avaliacao: [`/api/admin/avaliacoes/${String(id).split(':').pop()}/status`, { visivel: valor, fonte: String(id).startsWith('LEGADA:') ? 'LEGADA' : 'NOVA' }]
        };
        const [url, body] = mapas[alvo];
        await requisicaoAdmin(url, { method: 'PATCH', body: JSON.stringify(body) });
        carregarSecaoAdmin(secaoAdminAtual);
    } catch (erro) { alert(erro.message); }
}

let secaoAdminAtual = 'admin-dashboard';
let buscaAdminAtual = '';

async function carregarSecaoAdmin(secao) {
    const buscaAnterior = document.getElementById('buscaAdmin');
    if (buscaAnterior) buscaAdminAtual = buscaAnterior.value;
    secaoAdminAtual = secao;
    const conteudo = document.getElementById('conteudoPainelUsuario');
    conteudo.innerHTML = '<p>Carregando painel administrativo…</p>';
    document.querySelectorAll('.painel-nav-btn').forEach(botao => botao.classList.toggle('ativo', botao.getAttribute('onclick') === `mostrarSecaoPainel('${secao}')`));
    try {
        if (secao === 'admin-dashboard') {
            const { indicadores } = await requisicaoAdmin('/api/admin/dashboard');
            const cards = [['Usuários', indicadores.usuarios], ['Contratantes', indicadores.clientes], ['Prestadores', indicadores.prestadores], ['Equipamentos', indicadores.equipamentos], ['Solicitações', indicadores.solicitacoes]];
            conteudo.innerHTML = `<h2 class="titulo-secao-painel">Visão geral</h2><p class="descricao-secao-painel">Resumo da CONSTRUMAX.</p><div class="admin-indicadores">${cards.map(([nome, total]) => `<article class="admin-indicador"><span>${nome}</span><strong>${total}</strong></article>`).join('')}</div>`;
            return;
        }
        const busca = encodeURIComponent(buscaAdminAtual || '');
        if (secao === 'admin-usuarios') {
            const { usuarios } = await requisicaoAdmin(`/api/admin/usuarios?busca=${busca}`);
            renderizarTabelaAdmin('Gerenciar usuários', 'Buscar por nome ou e-mail', ['Nome', 'E-mail', 'Telefone', 'Tipo', 'Status', 'Ação'], usuarios.map(u => `<tr><td>${escaparTextoPainel(u.nome)}</td><td>${escaparTextoPainel(u.email)}</td><td>${escaparTextoPainel(u.telefone || '—')}</td><td>${escaparTextoPainel(u.tipo_usuario)}</td><td>${Number(u.ativo) ? 'Ativo' : 'Suspenso'}</td><td>${u.tipo_usuario === 'ADMIN' ? 'Administrador' : botaoAdminRotulo(Number(u.ativo), 'usuario', u.id_usuario)}</td></tr>`).join(''), secao);
        } else if (secao === 'admin-prestadores') {
            const { prestadores } = await requisicaoAdmin(`/api/admin/prestadores?busca=${busca}`);
            renderizarTabelaAdmin('Gerenciar prestadores', 'Buscar por nome, e-mail ou profissão', ['Profissional', 'Contato', 'Profissão', 'Cidade', 'Perfil', 'Equipamentos', 'Status', 'Ação'], prestadores.map(p => `<tr><td>${escaparTextoPainel(p.nome)}</td><td>${escaparTextoPainel(p.email)}<br>${escaparTextoPainel(p.telefone || '')}</td><td>${escaparTextoPainel(p.profissao || '—')}</td><td>${escaparTextoPainel([p.cidade, p.estado].filter(Boolean).join(', ') || '—')}</td><td>${p.verificado ? 'Verificado' : 'Não verificado'}${p.valor_diaria == null ? '' : `<br>R$ ${Number(p.valor_diaria).toFixed(2)}/dia`}<details><summary>Descrição</summary>${escaparTextoPainel(p.descricao || 'Sem descrição.')}</details></td><td>${p.total_equipamentos}</td><td>${Number(p.admin_ativo) ? 'Ativo' : 'Suspenso'}</td><td>${botaoAdminRotulo(Number(p.admin_ativo), 'prestador', p.id_prestador)}</td></tr>`).join(''), secao);
        } else if (secao === 'admin-equipamentos') {
            const { equipamentos } = await requisicaoAdmin(`/api/admin/equipamentos?busca=${busca}`);
            renderizarTabelaAdmin('Gerenciar equipamentos', 'Buscar por equipamento ou prestador', ['Equipamento', 'Tipo', 'Prestador', 'Diária', 'Qtd.', 'Detalhes', 'Status', 'Ação'], equipamentos.map(e => `<tr><td>${escaparTextoPainel(e.nome_equipamento)}</td><td>${escaparTextoPainel(e.tipo_equipamento || '—')}</td><td>${escaparTextoPainel(e.nome_prestador)}<br>${escaparTextoPainel(e.email_prestador)}</td><td>${e.valor_diaria == null ? '—' : `R$ ${Number(e.valor_diaria).toFixed(2)}`}</td><td>${e.quantidade}</td><td><details><summary>Descrição e fotos (${e.fotos.length})</summary><p>${escaparTextoPainel(e.descricao || 'Sem descrição.')}</p><div class="admin-fotos">${e.fotos.map((foto, i) => `<img src="${API_BASE_URL}${escaparTextoPainel(foto)}" alt="Foto ${i + 1} de ${escaparTextoPainel(e.nome_equipamento)}">`).join('')}</div></details></td><td>${Number(e.admin_visivel) ? 'Visível' : 'Oculto'}</td><td>${botaoAdminRotulo(Number(e.admin_visivel), 'equipamento', e.id_equipamento, 'visivel')} ${Number(e.admin_visivel) ? `<button class="admin-acao admin-acao-perigo" onclick="excluirAnuncioAdmin(${Number(e.id_equipamento)})">Excluir</button>` : ''}</td></tr>`).join(''), secao);
        } else if (secao === 'admin-avaliacoes') {
            const { avaliacoes } = await requisicaoAdmin('/api/admin/avaliacoes');
            conteudo.innerHTML = `<h2 class="titulo-secao-painel">Moderar avaliações</h2><div class="admin-tabela-wrap"><table class="admin-tabela"><thead><tr><th>Data</th><th>Cliente</th><th>Alvo</th><th>Avaliação</th><th>Comentário</th><th>Status</th><th>Ação</th></tr></thead><tbody>${avaliacoes.map(a => `<tr><td>${new Date(a.data_criacao).toLocaleDateString('pt-BR')}</td><td>${escaparTextoPainel(a.nome_cliente)}</td><td>${escaparTextoPainel(a.alvo === 'PRESTADOR' ? a.nome_prestador : a.nome_equipamento)}</td><td>${a.nota == null ? 'Sem estrelas' : `${a.nota}/5`}</td><td>${escaparTextoPainel(a.comentario || '—')}</td><td>${a.moderacao_status === 'VISIVEL' ? 'Visível' : 'Oculta'}</td><td>${botaoAdminRotulo(a.moderacao_status === 'VISIVEL', 'avaliacao', `${a.fonte}:${a.id_avaliacao}`, 'visivel')}</td></tr>`).join('')}</tbody></table></div>`;
        }
    } catch (erro) {
        conteudo.innerHTML = `<div class="admin-erro"><h2>Não foi possível carregar esta área</h2><p>${escaparTextoPainel(erro.message)}</p><button class="btn-primary" onclick="carregarSecaoAdmin('${secao}')">Tentar novamente</button></div>`;
    }
}

async function excluirAnuncioAdmin(id) {
    if (!confirm('Excluir este anúncio? Ele será ocultado e o histórico das solicitações continuará preservado.')) return;
    try {
        await requisicaoAdmin(`/api/admin/equipamentos/${id}`, { method: 'DELETE' });
        carregarSecaoAdmin('admin-equipamentos');
    } catch (erro) { alert(erro.message); }
}

// Fecha o painel
function fecharPainelUsuario() {
    document.getElementById("painelUsuarioOverlay").classList.remove("ativo");
}

// Fecha ao clicar fora do painel
function fecharPainelUsuarioFora(event) {
    if (event.target.id === "painelUsuarioOverlay") {
        fecharPainelUsuario();
    }
}

// Fecha ao pressionar ESC
document.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
        fecharPainelUsuario();
    }
});



// =========================
// CARREGAR MEUS ANÚNCIOS
// =========================

let equipamentosDoPainel = [];

async function carregarMeusAnuncios() {

    const usuario = obterUsuarioPainel();
    const conteudo = document.getElementById("conteudoPainelUsuario");

    if (!usuario || !conteudo) return;

    try {

        const resposta = await fetch(
            `${API_BASE_URL}/meus-anuncios/${encodeURIComponent(usuario.id_usuario)}`,
            { headers: { Authorization: `Bearer ${usuario.auth_token || ""}` } }
        );

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || "Erro ao buscar anúncios.");
        }

        const prestador = resultado.prestador;
        const equipamentos = resultado.equipamentos || [];
        equipamentosDoPainel = equipamentos;

        let html = `
            <h2 class="titulo-secao-painel">Meus anúncios</h2>

            <p class="descricao-secao-painel">
                Aqui estão os serviços e equipamentos vinculados à sua conta.
            </p>
        `;

        // PERFIL PROFISSIONAL

        if (prestador) {

            html += `
                <h3 class="subtitulo-anuncios-painel">
                    Meu perfil profissional
                </h3>

                <div class="anuncio-painel-card">

                    <h3>${escaparTextoPainel(prestador.profissao)}</h3>

                    <p>${escaparTextoPainel(prestador.descricao)}</p>

                    <p>
                        📍 ${escaparTextoPainel(prestador.cidade)},
                        ${escaparTextoPainel(prestador.estado)}
                    </p>

                    <p>
                        💰 R$ ${escaparTextoPainel(prestador.valor_diaria)} por diária
                    </p>

                    <div class="fotos-anuncio-painel">
                        ${(prestador.fotos || []).map(foto => `
                            <img
                                src="${API_BASE_URL}${escaparTextoPainel(foto)}"
                                alt="Foto do trabalho profissional"
                            >
                        `).join("")}
                    </div>

                </div>
            `;
        }

        // EQUIPAMENTOS

        html += `
            <h3 class="subtitulo-anuncios-painel">
                Meus equipamentos (${equipamentos.length})
            </h3>
        `;

        if (equipamentos.length === 0) {

            html += `
                <div class="mensagem-painel-vazio">
                    <div>🚧</div>
                    <h3>Nenhum equipamento cadastrado</h3>
                    <p>Quando você cadastrar equipamentos, eles aparecerão aqui.</p>
                </div>
            `;

        } else {

            equipamentos.forEach(equipamento => {

                html += `
                    <div class="anuncio-painel-card">

                        <h3>${escaparTextoPainel(equipamento.nome_equipamento)}</h3>

                        <p>
                            Tipo: ${escaparTextoPainel(equipamento.tipo_equipamento)}
                        </p>

                        <p>
                            ${escaparTextoPainel(equipamento.descricao)}
                        </p>

                        <p>
                            💰 R$ ${escaparTextoPainel(equipamento.valor_diaria)} / diária
                        </p>

                        <p>
                            Quantidade: ${escaparTextoPainel(equipamento.quantidade)}
                        </p>

                        <p>
                            Disponibilidade:
                            ${Number(equipamento.disponivel) === 1 ? "Disponível" : "Indisponível"}
                        </p>

                        <div class="acoes-anuncio-painel">
                            <button type="button" class="acao-anuncio-principal" onclick="abrirEdicaoEquipamento(${Number(equipamento.id_equipamento)})">Editar</button>
                            <button type="button" class="acao-anuncio-secundaria" onclick="alternarDisponibilidadeEquipamento(${Number(equipamento.id_equipamento)})">${Number(equipamento.disponivel) === 1 ? "Marcar indisponível" : "Marcar disponível"}</button>
                            <button type="button" class="acao-anuncio-excluir" onclick="excluirEquipamento(${Number(equipamento.id_equipamento)})">Excluir</button>
                        </div>

                        <div class="fotos-anuncio-painel">

                            ${(equipamento.fotos || []).map(foto => `
                                <img
                                    src="${API_BASE_URL}${escaparTextoPainel(foto)}"
                                    alt="Foto do equipamento"
                                >
                            `).join("")}

                        </div>

                    </div>
                `;
            });

        }

        conteudo.innerHTML = html;

    } catch (erro) {

        console.error("ERRO AO CARREGAR ANÚNCIOS:", erro);

        conteudo.innerHTML = `
            <h2 class="titulo-secao-painel">Meus anúncios</h2>

            <div class="mensagem-painel-vazio">
                <h3>Não foi possível carregar seus anúncios.</h3>
                <p>Verifique sua conexão com o servidor e tente novamente.</p>
            </div>
        `;

    }

}

verificarLogin();
inicializarCamposCadastro();

let todosPrestadores = [];
let requisicaoBuscaPrestadores = 0;

function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[caractere]);
}

// PARA BUSCAR PRESTADORES

function renderizarPrestadores(prestadores) {
    const lista = document.getElementById("lista-profissionais");
    if (!prestadores.length) {
        lista.innerHTML = '<div class="busca-sem-resultados"><h3>Nenhum profissional encontrado</h3><p>Tente outro serviço ou informe uma cidade diferente.</p></div>';
        return;
    }

    lista.innerHTML = prestadores.map(prestador => {
        const nome = escaparHTML(prestador.nome || "Profissional");
        const profissao = escaparHTML(prestador.profissao || "Profissional da construção");
        const iniciais = String(prestador.nome || "P").split(" ").map(parte => parte[0]).slice(0, 2).join("");
        const fotos = prestador.fotos || [];
        const id = Number(prestador.id_prestador);
        const especialidades = prestador.especialidades || (prestador.especialidade ? [prestador.especialidade] : []);
        const nota = Number(prestador.avaliacao);
        const totalAvaliacoes = Number(prestador.total_avaliacoes) || 0;
        const verificado = [1, true, "1", "true"].includes(prestador.verificado);
        const galeriaFotos = fotos.length ? `
            <div class="prof-gallery" id="carrossel-prestador-${id}" data-indice="0">
                <img class="prof-photo" src="${API_BASE_URL}${escaparHTML(fotos[0])}" alt="Trabalho de ${nome}" data-indice="0">
                ${fotos.length > 1 ? `
                    <button class="prof-photo-arrow prof-photo-prev" onclick="mudarFotoPrestador(${id}, -1)" type="button" aria-label="Foto anterior">❮</button>
                    <button class="prof-photo-arrow prof-photo-next" onclick="mudarFotoPrestador(${id}, 1)" type="button" aria-label="Próxima foto">❯</button>
                    <span class="prof-photo-counter" id="contador-prestador-${id}">1/${fotos.length}</span>` : ""}
            </div>` : `<div class="prof-avatar">${escaparHTML(iniciais)}</div>`;
        const avaliacao = totalAvaliacoes > 0 && Number.isFinite(nota)
            ? `⭐ ${nota.toFixed(1)} <span>(${totalAvaliacoes} avaliações)</span>`
            : '<span class="sem-avaliacoes">Ainda sem avaliações</span>';
        const tags = especialidades.length
            ? especialidades.map(item => `<span class="prof-tag">${escaparHTML(item)}</span>`).join("")
            : `<span class="prof-tag">${profissao}</span>`;

        return `<article class="prof-card">
            <div class="prof-verified ${verificado ? "" : "prof-cadastrado"}">${verificado ? "✓ Verificado" : "Perfil cadastrado"}</div>
            <div class="prof-header">${galeriaFotos}<div class="prof-meta"><div class="prof-name">${nome}</div><div class="prof-role">${profissao}</div></div></div>
            <div class="prof-stars">${avaliacao}</div>
            <div class="prof-tags">${tags}</div>
            <div class="prof-info"><div class="prof-location">📍 ${escaparHTML(prestador.cidade)} - ${escaparHTML(prestador.estado)}</div><div class="prof-price">R$ ${escaparHTML(prestador.valor_diaria)}<small>/ dia</small></div></div>
            <button class="btn-prof-contact" type="button" onclick="abrirPerfilPrestador(${id})">Ver perfil</button>
        </article>`;
    }).join("");
}
function mudarFotoPrestador(idPrestador, direcao) {

    const prestador = todosPrestadores.find(
        item => String(item.id_prestador) === String(idPrestador)
    );

    if (!prestador || !prestador.fotos || prestador.fotos.length < 2) {
        return;
    }

    const galeria = document.getElementById(
        `carrossel-prestador-${idPrestador}`
    );

    if (!galeria) return;

    let indice = Number(galeria.dataset.indice || 0);

    indice = (
        indice + direcao + prestador.fotos.length
    ) % prestador.fotos.length;

    galeria.dataset.indice = indice;

    const imagem = galeria.querySelector(".prof-photo");

    imagem.src = `${API_BASE_URL}${prestador.fotos[indice]}`;
    imagem.dataset.indice = indice;

    const contador = document.getElementById(
        `contador-prestador-${idPrestador}`
    );

    if (contador) {
        contador.textContent = `${indice + 1}/${prestador.fotos.length}`;
    }
}

function normalizarTermoBusca(valor) {
    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .trim();
}


async function buscarPrestadores(event) {
    if (event) event.preventDefault();
    const servico = document.getElementById("buscaProfissional").value.trim();
    const cidade = document.getElementById("buscaCidadeProfissional").value.trim();
    const lista = document.getElementById("lista-profissionais");
    const botao = document.querySelector('#formBuscaProfissionais button[type="submit"]');
    const parametros = new URLSearchParams();
    const numeroRequisicao = ++requisicaoBuscaPrestadores;
    if (servico) parametros.set("servico", servico);
    if (cidade) parametros.set("cidade", cidade);
    lista.innerHTML = '<div class="busca-sem-resultados"><p>Buscando profissionais...</p></div>';
    if (botao) botao.disabled = true;

    try {
        const resposta = await fetch(`${API_BASE_URL}/prestadores?${parametros.toString()}`);
        if (!resposta.ok) throw new Error("Falha ao consultar profissionais.");
        const resultados = await resposta.json();
        if (numeroRequisicao !== requisicaoBuscaPrestadores) return;
        const servicoNormalizado = normalizarTermoBusca(servico);
        const partesLocalizacao = cidade.split(",").map(parte => normalizarTermoBusca(parte)).filter(Boolean);
        todosPrestadores = resultados.filter(prestador => {
            const termosServico = [prestador.profissao, prestador.especialidade, ...(prestador.especialidades || [])]
                .map(normalizarTermoBusca);
            const servicoCombina = !servicoNormalizado || termosServico.some(termo => termo.includes(servicoNormalizado));
            const cidadeNormalizada = normalizarTermoBusca(prestador.cidade);
            const estadoNormalizado = normalizarTermoBusca(prestador.estado);
            const cidadeCombina = !partesLocalizacao.length || (partesLocalizacao.length > 1
                ? cidadeNormalizada.includes(partesLocalizacao[0]) && estadoNormalizado.includes(partesLocalizacao.slice(1).join(" "))
                : cidadeNormalizada.includes(partesLocalizacao[0]) || estadoNormalizado.includes(partesLocalizacao[0]));
            return servicoCombina && cidadeCombina;
        });
        renderizarPrestadores(todosPrestadores);
    } catch (erro) {
        if (numeroRequisicao !== requisicaoBuscaPrestadores) return;
        console.error("Erro ao buscar profissionais:", erro);
        lista.innerHTML = '<div class="busca-sem-resultados"><h3>Não foi possível carregar os profissionais</h3><p>Tente novamente em instantes.</p></div>';
    } finally {
        if (botao && numeroRequisicao === requisicaoBuscaPrestadores) botao.disabled = false;
    }
}

function limparBuscaPrestadores() {
    document.getElementById("buscaProfissional").value = "";
    document.getElementById("buscaCidadeProfissional").value = "";
    buscarPrestadores();
}

function abrirPerfilPrestador(id) {
    const prestador = todosPrestadores.find(item => Number(item.id_prestador) === Number(id));
    if (!prestador) return;
    const modal = document.getElementById("modalPerfilPrestador");
    const fotos = prestador.fotos || [];
    const nome = escaparHTML(prestador.nome || "Profissional");
    const profissao = escaparHTML(prestador.profissao || "Profissional da construção");
    const especialidades = prestador.especialidades || (prestador.especialidade ? [prestador.especialidade] : []);
    const nota = Number(prestador.avaliacao);
    const totalAvaliacoes = Number(prestador.total_avaliacoes) || 0;
    const temAvaliacao = totalAvaliacoes > 0 && Number.isFinite(nota);
    const verificado = [1, true, "1", "true"].includes(prestador.verificado);
    const usuarioAtivo = obterUsuarioPainel();
    const podeIniciarConversa = !usuarioAtivo || !usuarioAtivo.tipo_usuario || String(usuarioAtivo.tipo_usuario).toUpperCase() === "CLIENTE";
    const contato = podeIniciarConversa
        ? `<button class="perfil-botao-contato" type="button" onclick="iniciarConversa(${Number(id)})">💬 Entrar em contato</button>`
        : '<button class="perfil-botao-contato" type="button" disabled>Contato disponível para contratantes</button>';
    const solicitar = podeIniciarConversa
        ? `<button class="perfil-botao-contato perfil-botao-solicitar" type="button" onclick="solicitarOrcamento(${Number(id)})">📋 Solicitar orçamento</button>`
        : '';
    const fotoPerfil = prestador.foto_perfil || prestador.foto || fotos[0];
    const avatar = fotoPerfil
        ? `<img class="perfil-foto-principal" id="perfilFotoPrincipal" src="${API_BASE_URL}${escaparHTML(fotoPerfil)}" alt="Foto de perfil de ${nome}">`
        : `<div class="perfil-avatar-grande">${escaparHTML(String(prestador.nome || "P").split(" ").map(parte => parte[0]).slice(0, 2).join(""))}</div>`;
    const galeria = fotos.length ? `<section class="perfil-galeria-secao"><h3>📷 Meus trabalhos</h3><div class="perfil-galeria">${fotos.map((foto, indice) => `<button type="button" onclick="selecionarFotoPerfilPrestador(${Number(id)}, ${indice})" aria-label="Ver foto ${indice + 1}"><img src="${API_BASE_URL}${escaparHTML(foto)}" alt="Trabalho ${indice + 1} de ${nome}"></button>`).join("")}</div></section>` : "";
    const notaHtml = temAvaliacao
        ? `<strong>⭐ ${nota.toFixed(1)}</strong> de 5 (${totalAvaliacoes} avaliações)`
        : '<span>Este profissional ainda não recebeu avaliações.</span>';
    const tags = especialidades.length
        ? especialidades.map(item => `<span>${escaparHTML(item)}</span>`).join("")
        : `<span>${profissao}</span>`;
    const preco = Number(prestador.valor_diaria);
    const diaria = Number.isFinite(preco)
        ? preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : escaparHTML(prestador.valor_diaria || "Consulte o profissional");

    modal.innerHTML = `<div class="perfil-fundo" onclick="fecharPerfilPrestador(event)">
        <article class="perfil-modal-conteudo" role="dialog" aria-modal="true" aria-labelledby="perfilNome">
            <button type="button" class="perfil-fechar" onclick="fecharPerfilPrestador()" aria-label="Fechar perfil">×</button>
            <div class="perfil-topo">
                ${avatar}
                <div class="perfil-identificacao">
                    <span class="perfil-selo ${verificado ? "perfil-verificado" : ""}">${verificado ? "✓ Profissional verificado" : "Perfil profissional"}</span>
                    <h2 id="perfilNome">${nome}</h2>
                    <h3>🦺 ${profissao}</h3>
                    <p>📍 ${escaparHTML(prestador.cidade)}${prestador.estado ? `, ${escaparHTML(prestador.estado)}` : ""}</p>
                    <p class="perfil-nota">${notaHtml}</p>
                </div>
                <div class="perfil-preco"><strong>${diaria}</strong><span>por diária</span></div>
            </div>
            ${galeria}
            <div class="perfil-detalhes">
                <section class="perfil-sobre"><h3>📝 Sobre mim</h3><p>${escaparHTML(prestador.descricao || "O profissional ainda não adicionou uma descrição.")}</p><h3>⚙ Serviços oferecidos</h3><div class="perfil-tags">${tags}</div><h3>📍 Localização</h3><p>${escaparHTML(prestador.cidade)}${prestador.estado ? `, ${escaparHTML(prestador.estado)}` : ""}</p></section>
                <aside class="perfil-contato"><h3>⭐ Avaliações</h3><p id="resumoAvaliacoesPrestador-${Number(id)}">${notaHtml}</p><div id="avaliacoesPrestador-${Number(id)}" class="lista-avaliacoes"><span>Carregando comentários...</span></div>${solicitar}${contato}</aside>
            </div>
        </article>
    </div>`;
    modal.classList.add("ativo");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("perfil-aberto");
    carregarAvaliacoesPrestador(Number(id));
}

function textoEstrelas(nota) {
    const valor = Number(nota);
    if (!Number.isFinite(valor) || valor <= 0) return 'Sem nota';
    const cheias = Math.min(5, Math.max(0, Math.round(valor)));
    return `${'★'.repeat(cheias)}${'☆'.repeat(5 - cheias)} ${valor.toFixed(1)}`;
}

function htmlCartaoAvaliacao(avaliacao, incluirAlvo = false) {
    const alvo = avaliacao.alvo === 'EQUIPAMENTO'
        ? `Equipamento: ${escaparHTML(avaliacao.nome_equipamento || 'anúncio removido')}` : 'Prestador';
    const nota = Number(avaliacao.nota) > 0 ? `<span class="avaliacao-estrelas">${textoEstrelas(avaliacao.nota)}</span>` : '<span class="avaliacao-sem-nota">Sem estrelas</span>';
    const comentario = avaliacao.comentario
        ? `<p>${escaparHTML(avaliacao.comentario)}</p>` : '<p class="avaliacao-sem-comentario">Sem comentário.</p>';
    return `<article class="avaliacao-card">${nota}${incluirAlvo ? `<span class="avaliacao-alvo-resumo">${alvo}</span>` : ''}${comentario}<small>${escaparHTML(avaliacao.nome_cliente || 'Contratante')} · ${formatarDataPainel(avaliacao.data_criacao)}</small></article>`;
}

async function carregarAvaliacoesPrestador(idPrestador) {
    const lista = document.getElementById(`avaliacoesPrestador-${Number(idPrestador)}`);
    if (!lista) return;
    try {
        const resposta = await fetch(`${API_BASE_URL}/prestadores/${Number(idPrestador)}/avaliacoes`);
        const resultado = await resposta.json();
        if (!resposta.ok || !resultado.sucesso) throw new Error(resultado.mensagem || 'Não foi possível carregar os comentários.');
        const resumo = resultado.resumo || {};
        const campoResumo = document.getElementById(`resumoAvaliacoesPrestador-${Number(idPrestador)}`);
        if (campoResumo) {
            const cadastro = todosPrestadores.find(item => Number(item.id_prestador) === Number(idPrestador));
            const notaAntiga = Number(cadastro?.avaliacao);
            const totalAntigo = Number(cadastro?.total_avaliacoes) || 0;
            campoResumo.innerHTML = Number(resumo.quantidade_notas) > 0
                ? `<strong>${textoEstrelas(resumo.media)}</strong> de 5 (${Number(resumo.quantidade_notas)} avaliações)`
                : totalAntigo > 0 && Number.isFinite(notaAntiga)
                    ? `<strong>${textoEstrelas(notaAntiga)}</strong> de 5 (${totalAntigo} avaliações)`
                    : 'Este profissional ainda não recebeu avaliações com estrelas.';
        }
        lista.innerHTML = resultado.avaliacoes?.length
            ? resultado.avaliacoes.map(avaliacao => htmlCartaoAvaliacao(avaliacao, true)).join('')
            : '<span class="avaliacao-sem-comentario">Ainda não há comentários.</span>';
    } catch (erro) {
        lista.innerHTML = `<span class="avaliacao-sem-comentario">${escaparHTML(erro.message)}</span>`;
    }
}

function selecionarFotoPerfilPrestador(id, indice) {
    const prestador = todosPrestadores.find(item => Number(item.id_prestador) === Number(id));
    const imagem = document.getElementById("perfilFotoPrincipal");
    if (prestador?.fotos?.[indice] && imagem) {
        imagem.src = `${API_BASE_URL}${prestador.fotos[indice]}`;
    }
}

function fecharPerfilPrestador(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById("modalPerfilPrestador");
    modal.classList.remove("ativo");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("perfil-aberto");
}

function solicitarOrcamento(idPrestador) {
    const usuario = obterUsuarioPainel();
    if (!usuario?.auth_token) {
        solicitacaoPendenteLogin = { tipo: 'SERVICO', id_prestador: Number(idPrestador) };
        fecharPerfilPrestador();
        alert('Entre na sua conta de contratante para solicitar um orçamento.');
        openModal('login');
        return;
    }
    if (String(usuario.tipo_usuario || usuario.tipo || '').toUpperCase() === 'PRESTADOR') {
        alert('Somente contratantes podem enviar solicitações.');
        return;
    }
    const prestador = todosPrestadores.find(item => Number(item.id_prestador) === Number(idPrestador));
    if (!prestador) return;
    abrirModalSolicitacaoServico(prestador);
}

function abrirSolicitacaoEquipamento(idEquipamento) {
    const usuario = obterUsuarioPainel();
    if (!usuario?.auth_token) {
        solicitacaoPendenteLogin = { tipo: 'EQUIPAMENTO', id_equipamento: Number(idEquipamento) };
        fecharDetalhesEquipamento();
        alert('Entre na sua conta de contratante para solicitar um aluguel.');
        openModal('login');
        return;
    }
    if (String(usuario.tipo_usuario || usuario.tipo || '').toUpperCase() === 'PRESTADOR') {
        alert('Somente contratantes podem enviar solicitações.');
        return;
    }
    const equipamento = todosEquipamentos.find(item => Number(item.id_equipamento) === Number(idEquipamento));
    if (!equipamento) return;
    if (Number(equipamento.disponivel) !== 1 || Number(equipamento.quantidade) < 1) {
        alert('Este equipamento está marcado como indisponível.');
        return;
    }
    abrirModalSolicitacaoEquipamento(equipamento);
}

function retomarSolicitacaoPendente() {
    if (!solicitacaoPendenteLogin || !obterUsuarioPainel()?.auth_token) return;
    const usuario = obterUsuarioPainel();
    const pendente = solicitacaoPendenteLogin;
    solicitacaoPendenteLogin = null;
    if (String(usuario.tipo_usuario || usuario.tipo || '').toUpperCase() === 'PRESTADOR') {
        alert('A solicitação está disponível somente para contratantes.');
        return;
    }
    if (pendente.tipo === 'SERVICO') solicitarOrcamento(pendente.id_prestador);
    else abrirSolicitacaoEquipamento(pendente.id_equipamento);
}

function dataAtualParaFormulario() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${valores.year}-${valores.month}-${valores.day}`;
}

function abrirModalSolicitacaoServico(prestador) {
    fecharPerfilPrestador();
    solicitacaoAtual = { tipo: 'SERVICO', id_prestador: Number(prestador.id_prestador) };
    const nome = escaparHTML(prestador.nome || 'profissional');
    const servico = escaparHTML(prestador.profissao || 'Serviço profissional');
    const local = escaparHTML([prestador.cidade, prestador.estado].filter(Boolean).join(', '));
    document.getElementById('solicitacaoConteudo').innerHTML = `
        <span class="solicitacao-tipo">PEDIDO DE SERVIÇO</span>
        <h2 id="solicitacaoTitulo">Solicitar orçamento</h2>
        <p class="solicitacao-intro">Seu pedido será enviado para ${nome}. O serviço só será confirmado depois da resposta do profissional.</p>
        <form class="form-solicitacao" onsubmit="enviarSolicitacao(event)">
            <label>Serviço desejado<input name="titulo" maxlength="150" required value="${servico}"></label>
            <label>Descreva o trabalho<textarea name="descricao" maxlength="4000" rows="4" required placeholder="Conte o que precisa ser feito, medidas ou detalhes importantes"></textarea></label>
            <div class="form-solicitacao-linha"><label>Data prevista<input name="data_inicio" type="date" min="${dataAtualParaFormulario()}" required></label><label>Local do serviço<input name="local_atendimento" maxlength="255" required value="${local}" placeholder="Cidade ou endereço"></label></div>
            <label>Informações adicionais <span>(opcional)</span><textarea name="observacoes" maxlength="2000" rows="2" placeholder="Horários, acesso ao local ou outros detalhes"></textarea></label>
            <div class="form-solicitacao-acoes"><button type="button" class="acao-anuncio-secundaria" onclick="fecharSolicitacao()">Voltar</button><button type="submit" class="acao-anuncio-principal">Enviar pedido</button></div>
        </form>`;
    mostrarModalSolicitacao();
}

function abrirModalSolicitacaoEquipamento(equipamento) {
    fecharDetalhesEquipamento();
    solicitacaoAtual = { tipo: 'EQUIPAMENTO', id_equipamento: Number(equipamento.id_equipamento) };
    const nome = escaparHTML(equipamento.nome_equipamento || 'Equipamento');
    const maximo = Math.max(1, Number(equipamento.quantidade) || 1);
    const local = escaparHTML([equipamento.cidade, equipamento.estado].filter(Boolean).join(', '));
    document.getElementById('solicitacaoConteudo').innerHTML = `
        <span class="solicitacao-tipo">PEDIDO DE ALUGUEL</span>
        <h2 id="solicitacaoTitulo">Solicitar aluguel</h2>
        <p class="solicitacao-intro">${nome} · ${maximo} unidade(s) anunciada(s). O pedido depende da confirmação do prestador.</p>
        <form class="form-solicitacao" onsubmit="enviarSolicitacao(event)">
            <label>Equipamento<input value="${nome}" readonly></label>
            <div class="form-solicitacao-linha"><label>Início do aluguel<input name="data_inicio" type="date" min="${dataAtualParaFormulario()}" onchange="this.form.elements.data_fim.min=this.value" required></label><label>Devolução prevista<input name="data_fim" type="date" min="${dataAtualParaFormulario()}" required></label></div>
            <div class="form-solicitacao-linha"><label>Quantidade<input name="quantidade" type="number" min="1" max="${maximo}" step="1" value="1" required></label><label>Local de utilização<input name="local_atendimento" maxlength="255" required value="${local}" placeholder="Cidade ou endereço"></label></div>
            <label>Como pretende utilizar? <span>(opcional)</span><textarea name="descricao" maxlength="4000" rows="3" placeholder="Informe o tipo de trabalho ou condições do local"></textarea></label>
            <label>Observações <span>(opcional)</span><textarea name="observacoes" maxlength="2000" rows="2" placeholder="Acesso, entrega ou outros detalhes"></textarea></label>
            <div class="form-solicitacao-acoes"><button type="button" class="acao-anuncio-secundaria" onclick="fecharSolicitacao()">Voltar</button><button type="submit" class="acao-anuncio-principal">Enviar pedido</button></div>
        </form>`;
    mostrarModalSolicitacao();
}

function mostrarModalSolicitacao() {
    if (!solicitacaoAtual.idempotencia) {
        solicitacaoAtual.idempotencia = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const modal = document.getElementById('modalSolicitacao');
    modal.classList.add('ativo');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function fecharSolicitacao() {
    const modal = document.getElementById('modalSolicitacao');
    if (!modal) return;
    modal.classList.remove('ativo');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    solicitacaoAtual = null;
}

function fecharSolicitacaoFora(event) {
    if (event.target === document.getElementById('modalSolicitacao')) fecharSolicitacao();
}

async function enviarSolicitacao(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const botao = form.querySelector('button[type="submit"]');
    const campos = new FormData(form);
    const corpo = {
        ...solicitacaoAtual,
        idempotencia: solicitacaoAtual?.idempotencia,
        titulo: String(campos.get('titulo') || (solicitacaoAtual?.tipo === 'EQUIPAMENTO' ? document.querySelector('#solicitacaoConteudo input[readonly]')?.value || '' : '')).trim(),
        descricao: String(campos.get('descricao') || (solicitacaoAtual?.tipo === 'EQUIPAMENTO' ? 'Pedido de aluguel do equipamento.' : '')).trim(),
        local_atendimento: String(campos.get('local_atendimento') || '').trim(),
        data_inicio: String(campos.get('data_inicio') || ''),
        data_fim: String(campos.get('data_fim') || ''),
        quantidade: Number(campos.get('quantidade') || 1),
        observacoes: String(campos.get('observacoes') || '').trim()
    };
    if (!solicitacaoAtual) return;
    botao.disabled = true;
    try {
        await requisicaoChat('/solicitacoes', { method: 'POST', body: JSON.stringify(corpo) });
        fecharSolicitacao();
        alert('Pedido enviado. Você poderá acompanhar a resposta em “Meus pedidos” e conversar com o prestador pelo chat.');
        abrirPainelUsuario('pedidos');
    } catch (erro) {
        alert(erro.message);
    } finally {
        if (botao.isConnected) botao.disabled = false;
    }
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        fecharSolicitacao();
        fecharDetalhesEquipamento();
        fecharPerfilPrestador();
    }
});

buscarPrestadores();
//EQUIPAMENTOS


document.getElementById("camposProfissional").style.display = "none";

let todosEquipamentos = [];

fetch(`${API_BASE_URL}/equipamentos`)
.then(res => {
    if (!res.ok) throw new Error(`Falha ao consultar equipamentos (HTTP ${res.status}).`);
    return res.json();
})
.then(equipamentos => {
    if (!Array.isArray(equipamentos)) throw new Error('A resposta de equipamentos está em formato inválido.');

    todosEquipamentos = equipamentos;

    renderizarEquipamentos(equipamentos);

})
.catch(erro => {

    console.error("Erro equipamentos:", erro);
    const lista = document.getElementById("lista-equipamentos");
    const resultado = document.getElementById("resultadoBuscaEquipamentos");
    if (lista) lista.innerHTML = '<div class="busca-equipamentos-vazio"><h3>Não foi possível carregar os equipamentos</h3><p>Tente novamente em instantes.</p></div>';
    if (resultado) resultado.textContent = '';

});


function renderizarEquipamentos(equipamentos) {

    const lista = document.getElementById("lista-equipamentos");
    if (!lista) return;
    const resultado = document.getElementById("resultadoBuscaEquipamentos");
    if (resultado) {
        resultado.textContent = equipamentos.length === todosEquipamentos.length
            ? `${equipamentos.length} ${equipamentos.length === 1 ? 'equipamento encontrado' : 'equipamentos encontrados'}`
            : `${equipamentos.length} de ${todosEquipamentos.length} equipamentos encontrados`;
    }
    if (!equipamentos.length) {
        lista.innerHTML = '<div class="busca-equipamentos-vazio"><h3>Nenhum equipamento encontrado</h3><p>Altere os filtros e tente novamente.</p></div>';
        return;
    }

    lista.innerHTML = equipamentos.map(equipamento => {

        const fotos = Array.isArray(equipamento.fotos) ? equipamento.fotos : [];

        const idCarrossel = `carrossel-${equipamento.id_equipamento}`;
        const nome = escaparHTML(equipamento.nome_equipamento || 'Equipamento');
        const prestador = escaparHTML(equipamento.nome || 'Prestador');
        const cidade = escaparHTML(equipamento.cidade || 'Cidade não informada');
        const estado = escaparHTML(equipamento.estado || '');
        const preco = Number(equipamento.valor_diaria) || 0;
        const quantidade = Number(equipamento.quantidade) || 0;
        const fotoInicial = fotos.length > 0 ? `${API_BASE_URL}${escaparHTML(fotos[0])}` : '';

        const disponivel = Number(equipamento.disponivel) === 1 && quantidade > 0;

        return `

        <div class="machine-card" onclick="abrirDetalhesEquipamento(${Number(equipamento.id_equipamento)}, event)">

            <div class="machine-gallery" id="${idCarrossel}">

                ${
                    fotos.length > 0
                    ? `
                        <img
                            class="machine-photo"
                            src="${fotoInicial}"
                            alt="${nome}"
                        >

                        ${
                            fotos.length > 1
                            ? `
                                <button
                                    type="button"
                                    class="photo-arrow photo-prev"
                                    onclick="mudarFoto(${equipamento.id_equipamento}, -1)"
                                >❮</button>

                                <button
                                    type="button"
                                    class="photo-arrow photo-next"
                                    onclick="mudarFoto(${equipamento.id_equipamento}, 1)"
                                >❯</button>

                                <span class="photo-counter" id="contador-${equipamento.id_equipamento}">
                                    1/${fotos.length}
                                </span>
                            `
                            : ""
                        }
                    `
                    : `
                        <div class="machine-no-photo">
                            📷 Sem fotos disponíveis
                        </div>
                    `
                }

            </div>

            <div class="machine-info">

                <h3>${nome}</h3>

                <ul class="machine-features">
                    <li>👤 ${prestador}</li>
                    <li>📍 ${cidade}${estado ? ` - ${estado}` : ''}</li>
                    <li>💰 ${preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/dia</li>
                    <li>📦 Quantidade: ${quantidade}</li>
                    <li>${Number(equipamento.total_avaliacoes) > 0 && Number(equipamento.avaliacao) > 0 ? `⭐ ${Number(equipamento.avaliacao).toFixed(1)} (${Number(equipamento.total_avaliacoes)} avaliações)` : 'Ainda sem avaliações'}</li>
                    <li class="machine-availability ${disponivel ? 'disponivel' : 'indisponivel'}">${disponivel ? 'Disponível para aluguel' : 'Indisponível no momento'}</li>
                </ul>

                <button class="btn-quote" type="button" onclick="abrirDetalhesEquipamento(${Number(equipamento.id_equipamento)}, event)">
                    Ver equipamento
                </button>

            </div>

        </div>

        `;

    }).join('');

}

function abrirDetalhesEquipamento(idEquipamento, event) {
    if (event?.currentTarget !== event?.target && event?.target?.closest('button')) return;
    const equipamento = todosEquipamentos.find(item => Number(item.id_equipamento) === Number(idEquipamento));
    if (!equipamento) return;
    const modal = document.getElementById('modalEquipamentoDetalhe');
    const conteudo = document.getElementById('equipamentoDetalheConteudo');
    const fotos = Array.isArray(equipamento.fotos) ? equipamento.fotos : [];
    const disponivel = Number(equipamento.disponivel) === 1 && Number(equipamento.quantidade) > 0;
    const usuario = obterUsuarioPainel();
    const dono = Number(usuario?.id_usuario) > 0 && Number(usuario.id_usuario) === Number(equipamento.id_usuario_prestador);
    const capa = fotos.length
        ? `<img id="fotoDetalheEquipamento" class="equipamento-foto-principal" src="${API_BASE_URL}${escaparHTML(fotos[0])}" alt="${escaparHTML(equipamento.nome_equipamento)}">`
        : '<div class="equipamento-sem-foto">📷 Sem fotos cadastradas</div>';
    const miniaturas = fotos.length > 1
        ? `<div class="equipamento-miniaturas">${fotos.map((foto, indice) => `<button type="button" onclick="selecionarFotoDetalheEquipamento(${Number(idEquipamento)}, ${indice})" aria-label="Ver foto ${indice + 1}"><img src="${API_BASE_URL}${escaparHTML(foto)}" alt="Foto ${indice + 1}"></button>`).join('')}</div>` : '';
    conteudo.innerHTML = `<button type="button" class="equipamento-detalhe-fechar" onclick="fecharDetalhesEquipamento()" aria-label="Fechar">×</button>
        <div class="equipamento-detalhe-grid"><div>${capa}${miniaturas}</div>
        <div class="equipamento-detalhe-info"><span class="solicitacao-tipo">EQUIPAMENTO PARA LOCAÇÃO</span>
            <h2 id="equipamentoDetalheTitulo">${escaparHTML(equipamento.nome_equipamento)}</h2>
            <p class="equipamento-dono">Oferecido por <strong>${escaparHTML(equipamento.nome || 'Prestador')}</strong></p>
            <p>📍 ${escaparHTML(equipamento.cidade)}${equipamento.estado ? `, ${escaparHTML(equipamento.estado)}` : ''}</p>
            <p class="equipamento-preco">${Number(equipamento.valor_diaria || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<small> / diária</small></p>
            <p><strong>Tipo:</strong> ${escaparHTML(equipamento.tipo_equipamento || 'Não informado')} · <strong>Quantidade:</strong> ${Number(equipamento.quantidade) || 0}</p>
            <p class="equipamento-disponibilidade ${disponivel ? 'disponivel' : 'indisponivel'}">${disponivel ? 'Disponível para solicitar' : 'Indisponível no momento'}</p>
            <div class="equipamento-detalhe-acoes">${dono ? '<span>Este anúncio pertence à sua conta.</span>' : `<button type="button" class="perfil-botao-contato perfil-botao-solicitar" onclick="abrirSolicitacaoEquipamento(${Number(idEquipamento)})" ${disponivel ? '' : 'disabled'}>📦 Solicitar aluguel</button><button type="button" class="perfil-botao-contato" onclick="entrarEmContatoEquipamento(${Number(idEquipamento)})">💬 Entrar em contato</button>`}</div>
        </div></div>
        <section class="equipamento-descricao"><h3>Descrição</h3><p>${escaparHTML(equipamento.descricao || 'O prestador ainda não adicionou uma descrição.')}</p></section>
        <section class="equipamento-avaliacoes"><h3>Avaliações do equipamento <span id="resumoAvaliacoesEquipamento-${Number(idEquipamento)}"></span></h3><div id="avaliacoesEquipamento-${Number(idEquipamento)}" class="lista-avaliacoes">Carregando avaliações...</div></section>`;
    modal.classList.add('ativo');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    carregarAvaliacoesEquipamento(Number(idEquipamento));
}

function selecionarFotoDetalheEquipamento(idEquipamento, indice) {
    const equipamento = todosEquipamentos.find(item => Number(item.id_equipamento) === Number(idEquipamento));
    const imagem = document.getElementById('fotoDetalheEquipamento');
    if (equipamento?.fotos?.[indice] && imagem) imagem.src = `${API_BASE_URL}${equipamento.fotos[indice]}`;
}

function fecharDetalhesEquipamento() {
    const modal = document.getElementById('modalEquipamentoDetalhe');
    if (!modal) return;
    modal.classList.remove('ativo');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function fecharDetalhesEquipamentoFora(event) {
    if (event.target === document.getElementById('modalEquipamentoDetalhe')) fecharDetalhesEquipamento();
}

function entrarEmContatoEquipamento(idEquipamento) {
    const equipamento = todosEquipamentos.find(item => Number(item.id_equipamento) === Number(idEquipamento));
    if (!equipamento) return;
    fecharDetalhesEquipamento();
    iniciarConversa(Number(equipamento.id_prestador));
}

async function carregarAvaliacoesEquipamento(idEquipamento) {
    const lista = document.getElementById(`avaliacoesEquipamento-${Number(idEquipamento)}`);
    if (!lista) return;
    try {
        const resposta = await fetch(`${API_BASE_URL}/equipamentos/${Number(idEquipamento)}/avaliacoes`);
        const resultado = await resposta.json();
        if (!resposta.ok || !resultado.sucesso) throw new Error(resultado.mensagem || 'Não foi possível carregar as avaliações.');
        const resumo = resultado.resumo || {};
        const campo = document.getElementById(`resumoAvaliacoesEquipamento-${Number(idEquipamento)}`);
        if (campo) campo.textContent = Number(resumo.quantidade_notas) > 0
            ? `· ${textoEstrelas(resumo.media)} (${Number(resumo.quantidade_notas)})` : '· Ainda sem notas';
        lista.innerHTML = resultado.avaliacoes?.length
            ? resultado.avaliacoes.map(avaliacao => htmlCartaoAvaliacao(avaliacao)).join('')
            : '<span class="avaliacao-sem-comentario">Ainda não há comentários para este equipamento.</span>';
    } catch (erro) {
        lista.innerHTML = `<span class="avaliacao-sem-comentario">${escaparHTML(erro.message)}</span>`;
    }
}


function mudarFoto(idEquipamento, direcao) {

    const equipamento = todosEquipamentos.find(
        item => item.id_equipamento == idEquipamento
    );

    if (!equipamento || !equipamento.fotos || equipamento.fotos.length < 2) {
        return;
    }

    const galeria = document.getElementById(
        `carrossel-${idEquipamento}`
    );

    const imagem = galeria.querySelector(".machine-photo");

    const contador = document.getElementById(
        `contador-${idEquipamento}`
    );

    let indiceAtual = Number(
        galeria.dataset.indice || 0
    );

    indiceAtual =
        (indiceAtual + direcao + equipamento.fotos.length)
        % equipamento.fotos.length;

    galeria.dataset.indice = indiceAtual;

    imagem.src =
        `${API_BASE_URL}${equipamento.fotos[indiceAtual]}`;

    contador.textContent =
        `${indiceAtual + 1}/${equipamento.fotos.length}`;
}


function filtrarEquipamentos(event) {
    event?.preventDefault();
    const termo = normalizarTermoBusca(document.getElementById('buscaEquipamento')?.value);
    const localizacao = normalizarTermoBusca(document.getElementById('buscaCidadeEquipamento')?.value);
    const termosLocalizacao = localizacao.split(/[\s,]+/).filter(Boolean);

    const filtrados = todosEquipamentos.filter(equipamento => {
        const textoPesquisavel = normalizarTermoBusca([
            equipamento.nome_equipamento, equipamento.tipo_equipamento
        ].filter(Boolean).join(' '));
        const enderecoPesquisavel = normalizarTermoBusca([equipamento.cidade, equipamento.estado].filter(Boolean).join(' '));
        return (!termo || textoPesquisavel.includes(termo)) &&
            (!termosLocalizacao.length || termosLocalizacao.every(parte => enderecoPesquisavel.includes(parte)));
    });

    renderizarEquipamentos(filtrados);
}

function limparBuscaEquipamentos() {
    document.getElementById('formBuscaEquipamentos')?.reset();
    renderizarEquipamentos(todosEquipamentos);
}
async function cadastrarEquipamento() {

    const usuario = JSON.parse(
        localStorage.getItem("usuario")
    );

    if (!usuario) {
        alert("Você precisa estar logado para cadastrar um equipamento.");
        openModal("login");
        return;
    }


    const nome_equipamento =
        document.getElementById("nomeEquipamento").value;

    const tipo_equipamento =
        document.getElementById("tipoEquipamento").value;

    const descricao =
        document.getElementById("descricaoEquipamento").value;

    const valor_diaria =
        document.getElementById("valorDiariaEquipamento").value;

    const quantidade =
        document.getElementById("quantidadeEquipamento").value;


    if (
        !nome_equipamento ||
        !tipo_equipamento ||
        !valor_diaria ||
        !quantidade
    ) {
        alert("Preencha todos os campos obrigatórios.");
        return;
    }


    // ===============================
    // CRIAR FORM DATA
    // ===============================

    const dados = new FormData();

    dados.append("id_usuario", usuario.id_usuario);
    dados.append("nome_equipamento", nome_equipamento);
    dados.append("tipo_equipamento", tipo_equipamento);
    dados.append("descricao", descricao);
    dados.append("valor_diaria", valor_diaria);
    dados.append("quantidade", quantidade);


    // ===============================
    // ADICIONAR AS FOTOS
    // ===============================

    fotosSelecionadas.forEach((foto) => {
        dados.append("fotos", foto);
    });


    console.log(
        "Quantidade de fotos enviadas:",
        fotosSelecionadas.length
    );

    console.log("FOTOS:", fotosSelecionadas);


    try {

        const resposta = await fetch(
            `${API_BASE_URL}/cadastro-equipamento`,
            {
                method: "POST",
                headers: { Authorization: `Bearer ${usuario.auth_token || ""}` },
                body: dados
            }
        );


        const resultado = await resposta.json();


        if (resultado.sucesso) {

            alert(
                `Equipamento cadastrado com sucesso!\n` +
                `Fotos enviadas: ${resultado.quantidade_fotos}`
            );


            // Limpar campos

            document.getElementById("nomeEquipamento").value = "";
            document.getElementById("tipoEquipamento").value = "";
            document.getElementById("descricaoEquipamento").value = "";
            document.getElementById("valorDiariaEquipamento").value = "";
            document.getElementById("quantidadeEquipamento").value = "";


            // Limpar fotos selecionadas

            fotosSelecionadas = [];

            atualizarPreviewFotos();


            fecharCadastroEquipamento();


            // Atualizar lista

            location.reload();

        } else {

            alert(
                resultado.mensagem ||
                "Erro ao cadastrar equipamento."
            );

        }

    } catch (erro) {

        console.error(
            "ERRO AO CADASTRAR EQUIPAMENTO:",
            erro
        );

        alert(
            "Não foi possível conectar com o servidor."
        );

    }

}
function abrirCadastroEquipamento() {
    const formulario = document.getElementById("formularioEquipamento");

    if (formulario) {
        formulario.style.display = "block";
    }
}

function fecharCadastroEquipamento() {
    const formulario = document.getElementById("formularioEquipamento");

    if (formulario) {
        formulario.style.display = "none";
    }
}

let fotosSelecionadas = [];

document.getElementById("fotosEquipamento").addEventListener("change", function () {

    const novasFotos = Array.from(this.files);

    if (fotosSelecionadas.length + novasFotos.length > 5) {
        alert("Você pode selecionar no máximo 5 fotos.");
        this.value = "";
        return;
    }

    fotosSelecionadas = fotosSelecionadas.concat(novasFotos);

    this.value = "";

    atualizarPreviewFotos();
});


function atualizarPreviewFotos() {

    const contador = document.getElementById("contadorFotos");
    const preview = document.getElementById("previewFotos");

    contador.textContent =
        `📸 ${fotosSelecionadas.length}/5 fotos selecionadas`;

    preview.innerHTML = "";

    fotosSelecionadas.forEach((foto, index) => {

        const div = document.createElement("div");

        div.style.position = "relative";
        div.style.width = "100px";
        div.style.height = "100px";

        div.innerHTML = `
            <img
                src="${URL.createObjectURL(foto)}"
                style="
                    width: 100px;
                    height: 100px;
                    object-fit: cover;
                    border-radius: 8px;
                "
            >

            <button
                type="button"
                onclick="removerFoto(${index})"
                style="
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    width: 24px;
                    height: 24px;
                    border: none;
                    border-radius: 50%;
                    background: #000;
                    color: #fff;
                    cursor: pointer;
                    font-weight: bold;
                "
            >
                ×
            </button>
        `;

        preview.appendChild(div);
    });
}
function removerFoto(index) {

    fotosSelecionadas.splice(index, 1);

    atualizarPreviewFotos();
}



const modalFoto = document.getElementById("modalFoto");
const imagemAmpliada = document.getElementById("imagemAmpliada");
const fecharModalFoto = document.getElementById("fecharModalFoto");
const fotoAnterior = document.getElementById("fotoAnterior");
const proximaFoto = document.getElementById("proximaFoto");
const contadorModalFoto = document.getElementById("contadorModalFoto");

let equipamentoAmpliado = null;
let prestadorAmpliado = null;
let indiceFotoAmpliada = 0;


function atualizarFotoAmpliada() {

    const itemAmpliado = prestadorAmpliado || equipamentoAmpliado;

    if (!itemAmpliado) return;

    const fotos = itemAmpliado.fotos || [];

    if (fotos.length === 0) return;

    imagemAmpliada.src =
        `${API_BASE_URL}${fotos[indiceFotoAmpliada]}`;

    contadorModalFoto.textContent =
        `${indiceFotoAmpliada + 1}/${fotos.length}`;

    const mostrarSetas = fotos.length > 1;

    fotoAnterior.style.display = mostrarSetas ? "block" : "none";
    proximaFoto.style.display = mostrarSetas ? "block" : "none";

    contadorModalFoto.style.display =
        mostrarSetas ? "block" : "none";
}



function trocarFotoAmpliada(direcao) {

    const itemAmpliado = prestadorAmpliado || equipamentoAmpliado;

    if (!itemAmpliado || !itemAmpliado.fotos?.length) return;

    const fotos = itemAmpliado.fotos;

    indiceFotoAmpliada =
        (indiceFotoAmpliada + direcao + fotos.length) % fotos.length;

    atualizarFotoAmpliada();
}


function fecharFotoAmpliada() {

    modalFoto.classList.remove("ativo");
    imagemAmpliada.src = "";
    equipamentoAmpliado = null;
    indiceFotoAmpliada = 0;
}

// Abre a galeria ao clicar na foto de um card

document.addEventListener("click", function(evento) {

    // Clique na foto de um equipamento
    if (evento.target.classList.contains("machine-photo")) {

        const galeria = evento.target.closest(".machine-gallery");
        if (!galeria) return;

        const idEquipamento = galeria.id.replace("carrossel-", "");

        equipamentoAmpliado = todosEquipamentos.find(
            item => String(item.id_equipamento) === idEquipamento
        );

        prestadorAmpliado = null;

        if (!equipamentoAmpliado || !equipamentoAmpliado.fotos?.length) {
            return;
        }

        indiceFotoAmpliada = Number(galeria.dataset.indice || 0);

        modalFoto.classList.add("ativo");
        atualizarFotoAmpliada();
        return;
    }

    // Clique na foto de um profissional
    if (evento.target.classList.contains("prof-photo")) {

        const galeria = evento.target.closest(".prof-gallery");
        if (!galeria) return;

        const idPrestador = galeria.id.replace(
            "carrossel-prestador-", ""
        );

        prestadorAmpliado = todosPrestadores.find(
            item => String(item.id_prestador) === idPrestador
        );

        equipamentoAmpliado = null;

        if (!prestadorAmpliado || !prestadorAmpliado.fotos?.length) {
            return;
        }

        indiceFotoAmpliada = Number(galeria.dataset.indice || 0);

        modalFoto.classList.add("ativo");
        atualizarFotoAmpliada();
    }
});

fotoAnterior.addEventListener("click", function() {
    trocarFotoAmpliada(-1);
});

proximaFoto.addEventListener("click", function() {
    trocarFotoAmpliada(1);
});

fecharModalFoto.addEventListener("click", fecharFotoAmpliada);

modalFoto.addEventListener("click", function(evento) {
    if (evento.target === modalFoto) {
        fecharFotoAmpliada();
    }
});


// Teclado: Esc fecha; setas navegam
document.addEventListener("keydown", function(evento) {

    if (!modalFoto.classList.contains("ativo")) return;

    if (evento.key === "Escape") {
        fecharFotoAmpliada();
    } else if (evento.key === "ArrowLeft") {
        trocarFotoAmpliada(-1);
    } else if (evento.key === "ArrowRight") {
        trocarFotoAmpliada(1);
    }
});
