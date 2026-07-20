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
  function selectTipo(btn) {
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  }

  /* ── Chat Modal ─── */
  function openChat() {
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('chatOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeChat() {
    document.getElementById('chatOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }
  function closeChatOutside(e) { if (e.target === document.getElementById('chatOverlay')) closeChat(); }

  function switchChatTab(tab) {
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.chat-list-panel').forEach(p => p.classList.remove('active'));
    const tabs = ['conversas','suporte','novo'];
    const idx = tabs.indexOf(tab);
    document.querySelectorAll('.chat-tab')[idx].classList.add('active');
    document.getElementById('chat-panel-' + tab).classList.add('active');
    closeConversation();
  }

  let currentContact = null;
  function openConversation(name, initials, bg, color) {
    currentContact = { name, initials, bg, color };
    document.getElementById('chat-conv-list').style.display = 'none';
    const conv = document.getElementById('chat-conversation-view');
    conv.classList.add('open');
    document.querySelector('.chat-header-name').textContent = name;
    document.querySelector('.chat-avatar-header').textContent = initials;
    document.querySelector('.chat-avatar-header').style.background = bg;
    document.querySelector('.chat-avatar-header').style.color = color;
    const msgList = document.getElementById('chat-messages-list');
    msgList.scrollTop = msgList.scrollHeight;
  }
  function closeConversation() {
    document.getElementById('chat-conv-list').style.display = '';
    const conv = document.getElementById('chat-conversation-view');
    conv.classList.remove('open');
    document.querySelector('.chat-header-name').textContent = 'Mensagens';
    document.querySelector('.chat-avatar-header').textContent = '💬';
    document.querySelector('.chat-avatar-header').style.background = 'var(--yellow)';
    document.querySelector('.chat-avatar-header').style.color = 'var(--black)';
  }
  function sendMessage() {
    const input = document.getElementById('chat-input-field');
    const text = input.value.trim();
    if (!text) return;
    const msgList = document.getElementById('chat-messages-list');
    const now = new Date();
    const time = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');
    const msg = document.createElement('div');
    msg.className = 'msg sent';
    msg.innerHTML = `<div class="msg-bubble">${text}</div><div class="msg-time">${time}</div>`;
    msgList.appendChild(msg);
    input.value = '';
    msgList.scrollTop = msgList.scrollHeight;
    setTimeout(() => {
      const reply = document.createElement('div');
      reply.className = 'msg recv';
      reply.innerHTML = `<div class="msg-bubble">Obrigado pela mensagem! Retornaremos em breve.</div><div class="msg-time">${time}</div>`;
      msgList.appendChild(reply);
      msgList.scrollTop = msgList.scrollHeight;
    }, 1200);
  }
  function sendOnEnter(e) { if (e.key === 'Enter') sendMessage(); }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeChat(); } });
  
  async function cadastrarUsuario() {

    const nome = document.getElementById("nome").value;
    const telefone = document.getElementById("telefone").value;
    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;

    const dados = {
        nome: nome,
        email: email,
        senha: senha,
        telefone: telefone,
        tipo_usuario: "contratante"
    };

    try {

        const resposta = await fetch(
            "http://localhost:3000/cadastro",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(dados)
            }
        );

        const resultado = await resposta.json();

        if(resultado.sucesso){

    localStorage.setItem(
        "usuario",
        JSON.stringify({
            id_usuario: resultado.id,
            nome: nome,
            email: email
        })
    );

    closeModal();

    verificarLogin();

}

    } catch(erro){
        console.error(erro);
        alert("Erro ao cadastrar.");
    }

}
async function loginUsuario() {

    const email = document.getElementById("loginEmail").value;
    const senha = document.getElementById("loginSenha").value;

    try {

        const resposta = await fetch(
            "http://localhost:3000/login",
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

       if (resultado.sucesso) {

    localStorage.setItem(
        "usuario",
        JSON.stringify(resultado.usuario)
    );

    closeModal();

    verificarLogin(); // atualiza o menu imediatamente

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

    const sair = confirm(
        "Deseja sair da sua conta?"
    );

    if (sair) {

        localStorage.removeItem("usuario");

        location.reload();

    }
}

verificarLogin();

fetch("http://localhost:3000/prestadores")
.then(res => res.json())
.then(dados => {

    console.log("PRESTADORES DO BANCO:");
    console.log(dados);

})
.catch(erro => {
    console.error("Erro ao buscar prestadores:", erro);
});