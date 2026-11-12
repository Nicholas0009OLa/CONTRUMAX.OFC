const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:3000"
    : "https://contrumax-ofc.onrender.com";

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
  
 
async function cadastrarUsuario() {

    const nome = document.getElementById("nome").value;
    const telefone = document.getElementById("telefone").value;
    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;

    const tipo_usuario = tipoConta;

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
                    document.getElementById("cpfCnpj").value
                );

                dadosProfissional.append(
                    "profissao",
                    document.getElementById("profissao").value
                );

                dadosProfissional.append(
                    "cidade",
                    document.getElementById("cidade").value
                );

                dadosProfissional.append(
                    "estado",
                    document.getElementById("estado").value
                );

                dadosProfissional.append(
                    "valor_diaria",
                    document.getElementById("valorDiaria").value
                );

                dadosProfissional.append(
                    "descricao",
                    document.getElementById("descricao").value
                );

                // Adiciona as fotos selecionadas
                const campoFotos = document.getElementById("fotosPrestador");
                const fotos = campoFotos.files;

                if (fotos.length > 5) {
                    alert("Selecione no máximo 5 fotos.");
                    return;
                }

                for (let i = 0; i < fotos.length; i++) {
                    dadosProfissional.append("fotos", fotos[i]);
                }

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

            closeModal();
            verificarLogin();

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

    if (prestadorPendenteParaChat) {
        const idPrestadorPendente = prestadorPendenteParaChat;
        prestadorPendenteParaChat = null;
        iniciarConversa(idPrestadorPendente);
    }

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

        document.getElementById("btnCadastro").style.display = "none";

        document.getElementById("btnLogin").innerHTML =
            `👤 ${usuario.nome}`;

        document.getElementById("btnLogin").onclick =
            mostrarMenuUsuario;
    }
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

    document.getElementById("painelUsuarioOverlay").classList.add("ativo");

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
        conteudo.innerHTML = `
            <h2 class="titulo-secao-painel">Meus pedidos</h2>

            <p class="descricao-secao-painel">
                Acompanhe os pedidos realizados na CONSTRUMAX.
            </p>

            <div class="mensagem-painel-vazio">
                <div>📦</div>

                <h3>Seus pedidos aparecerão aqui</h3>

                <p>
                    Estamos preparando a integração com o banco de dados
                    para exibir seus pedidos e acompanhar seus status.
                </p>
            </div>
        `;
    }
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
    const avatar = fotos.length
        ? `<img class="perfil-foto-principal" id="perfilFotoPrincipal" src="${API_BASE_URL}${escaparHTML(fotos[0])}" alt="Trabalho de ${nome}">`
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
                <aside class="perfil-contato"><h3>⭐ Avaliações</h3><p>${notaHtml}</p>${contato}</aside>
            </div>
        </article>
    </div>`;
    modal.classList.add("ativo");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("perfil-aberto");
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

document.addEventListener("keydown", event => {
    if (event.key === "Escape") fecharPerfilPrestador();
});

buscarPrestadores();
//EQUIPAMENTOS


document.getElementById("camposProfissional").style.display = "none";

let todosEquipamentos = [];

fetch(`${API_BASE_URL}/equipamentos`)
.then(res => res.json())
.then(equipamentos => {

    todosEquipamentos = equipamentos;

    renderizarEquipamentos(equipamentos);

})
.catch(erro => {

    console.error("Erro equipamentos:", erro);

});


function renderizarEquipamentos(equipamentos) {

    const lista = document.getElementById("lista-equipamentos");

    lista.innerHTML = "";

    equipamentos.forEach(equipamento => {

        const fotos = equipamento.fotos || [];

        const idCarrossel = `carrossel-${equipamento.id_equipamento}`;

        const imagemInicial = fotos.length > 0
            ? `${API_BASE_URL}${fotos[0]}`
            : "";

        lista.innerHTML += `

        <div class="machine-card">

            <div class="machine-gallery" id="${idCarrossel}">

                ${
                    fotos.length > 0
                    ? `
                        <img
                            class="machine-photo"
                            src="${imagemInicial}"
                            alt="${equipamento.nome_equipamento}"
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

                <h3>${equipamento.nome_equipamento}</h3>

                <ul class="machine-features">
                    <li>👤 ${equipamento.nome}</li>
                    <li>📍 ${equipamento.cidade} - ${equipamento.estado}</li>
                    <li>💰 R$ ${equipamento.valor_diaria}/dia</li>
                    <li>📦 Quantidade: ${equipamento.quantidade}</li>
                </ul>

                <button class="btn-quote">
                    Alugar
                </button>

            </div>

        </div>

        `;

    });

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


// FILTRO DE EQUIPAMENTOS

document.addEventListener("input", (e) => {

    if (e.target.id === "buscaEquipamento") {

        const busca = e.target.value.toLowerCase();

        const filtrados = todosEquipamentos.filter(equipamento =>

            (equipamento.nome_equipamento || "").toLowerCase().includes(busca) ||

            (equipamento.tipo_equipamento || "").toLowerCase().includes(busca) ||

            (equipamento.nome || "").toLowerCase().includes(busca) ||

            (equipamento.cidade || "").toLowerCase().includes(busca)

        );

        renderizarEquipamentos(filtrados);

    }

});
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
