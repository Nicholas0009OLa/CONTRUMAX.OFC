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


            // Se for profissional, cadastra os dados extras

            if(tipo_usuario === "profissional"){


                const dadosProfissional = {


                    id_usuario: resultado.id,

                    cpf_cnpj:
                    document.getElementById("cpfCnpj").value,


                    profissao:
                    document.getElementById("profissao").value,


                    cidade:
                    document.getElementById("cidade").value,


                    estado:
                    document.getElementById("estado").value,


                    valor_diaria:
                    document.getElementById("valorDiaria").value,


                    descricao:
                    document.getElementById("descricao").value

                };


                const respostaProfissional = await fetch(

                    "http://localhost:3000/cadastro-prestador",

                    {

                        method:"POST",

                        headers:{

                            "Content-Type":"application/json"

                        },

                        body: JSON.stringify(dadosProfissional)

                    }

                );


                const resultadoProfissional =
                await respostaProfissional.json();


                if(!resultadoProfissional.sucesso){

                    alert("Usuário criado, mas erro nos dados profissionais.");

                    return;

                }


            }


            alert("Cadastro realizado com sucesso!");

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
        console.log("RETORNO CADASTRO:", resultado);
        

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

let todosPrestadores = [];

fetch("http://localhost:3000/prestadores")
.then(res => res.json())
.then(prestadores => {

    todosPrestadores = prestadores;

    renderizarPrestadores(prestadores);

})
.catch(erro => {
    console.error("Erro:", erro);
});

// PARA BUSCAR PRESTADORES
function renderizarPrestadores(prestadores) {

    const lista = document.getElementById("lista-profissionais");

    lista.innerHTML = "";

    prestadores.forEach(prestador => {

        const iniciais = prestador.nome
            .split(" ")
            .map(nome => nome[0])
            .slice(0, 2)
            .join("");

        lista.innerHTML += `
            <div class="prof-card">

                <div class="prof-verified">
                    ✔ Verificado
                </div>

                <div class="prof-header">

                    <div class="prof-avatar">
                        ${iniciais}
                    </div>

                    <div class="prof-meta">
                        <div class="prof-name">
                            ${prestador.nome}
                        </div>

                        <div class="prof-role">
                            ${prestador.profissao}
                        </div>
                    </div>

                </div>

                <div class="prof-stars">
                    ⭐ ${prestador.avaliacao}
                    <span>
                        (${prestador.total_avaliacoes} avaliações)
                    </span>
                </div>

                <div class="prof-tags">
                    <span class="prof-tag">
                        ${prestador.especialidade}
                    </span>
                </div>

                <div class="prof-info">

                    <div class="prof-location">
                        📍 ${prestador.cidade} - ${prestador.estado}
                    </div>

                    <div class="prof-price">
                        R$ ${prestador.valor_diaria}
                        <small>/ dia</small>
                    </div>

                </div>

                <button class="btn-prof-contact">
                    Contratar
                </button>

            </div>
        `;
    });
}

fetch("http://localhost:3000/prestadores")
.then(res => res.json())
.then(prestadores => {

    const lista = document.getElementById("lista-profissionais");

    lista.innerHTML = "";

    prestadores.forEach(prestador => {

        const iniciais = prestador.nome
            .split(" ")
            .map(nome => nome[0])
            .slice(0, 2)
            .join("");

        lista.innerHTML += `
            <div class="prof-card">

                <div class="prof-verified">
                    ✔ Verificado
                </div>

                <div class="prof-header">

                    <div class="prof-avatar">
                        ${iniciais}
                    </div>

                    <div class="prof-meta">
                        <div class="prof-name">
                            ${prestador.nome}
                        </div>

                        <div class="prof-role">
                            ${prestador.profissao}
                        </div>
                    </div>

                </div>

                <div class="prof-stars">
                    ⭐ ${prestador.avaliacao}
                    <span>
                        (${prestador.total_avaliacoes} avaliações)
                    </span>
                </div>

                <div class="prof-tags">
                    <span class="prof-tag">
                        ${prestador.especialidade}
                    </span>
                </div>

                <div class="prof-info">

                    <div class="prof-location">
                        📍 ${prestador.cidade} - ${prestador.estado}
                    </div>

                    <div class="prof-price">
                        R$ ${prestador.valor_diaria}
                        <small>/ dia</small>
                    </div>

                </div>

                <button class="btn-prof-contact">
                    Contratar
                </button>

            </div>
        `;
    });

})
.catch(erro => {
    console.error("Erro:", erro);
});

document.addEventListener("input", (e) => {

    if (e.target.id === "buscaProfissional") {

        const busca = e.target.value.toLowerCase();

        const filtrados = todosPrestadores.filter(prestador => {

            const nome = (prestador.nome || "").toLowerCase();
            const profissao = (prestador.profissao || "").toLowerCase();
            const cidade = (prestador.cidade || "").toLowerCase();

            return (
                nome.includes(busca) ||
                profissao.includes(busca) ||
                cidade.includes(busca)
            );

        });

        renderizarPrestadores(filtrados);

    }

});

//EQUIPAMENTOS


document.getElementById("camposProfissional").style.display = "none";

let todosEquipamentos = [];

fetch("http://localhost:3000/equipamentos")
.then(res => res.json())
.then(equipamentos => {

    todosEquipamentos = equipamentos;

    renderizarEquipamentos(equipamentos);

})
.catch(erro => {

    console.error("Erro equipamentos:", erro);

});

function renderizarEquipamentos(equipamentos){

    const lista = document.getElementById("lista-equipamentos");

    lista.innerHTML = "";

    equipamentos.forEach(equipamento => {

        lista.innerHTML += `

        <div class="machine-card">

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