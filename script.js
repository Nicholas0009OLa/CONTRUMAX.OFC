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

        if (resultado.sucesso) {

            localStorage.setItem(
                "usuario",
                JSON.stringify({
                    id_usuario: resultado.id,
                    nome: nome,
                    email: email
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
                    "http://localhost:3000/cadastro-prestador",
                    {
                        method: "POST",
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
    const dropdown = document.getElementById("dropdownUsuario");
    dropdown.classList.toggle("ativo");
}

function sairDaConta() {
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

async function carregarMeusAnuncios() {

    const usuario = obterUsuarioPainel();
    const conteudo = document.getElementById("conteudoPainelUsuario");

    if (!usuario || !conteudo) return;

    try {

        const resposta = await fetch(
            `http://localhost:3000/meus-anuncios/${encodeURIComponent(usuario.id_usuario)}`
        );

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || "Erro ao buscar anúncios.");
        }

        const prestador = resultado.prestador;
        const equipamentos = resultado.equipamentos || [];

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
                                src="http://localhost:3000${escaparTextoPainel(foto)}"
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

                        <div class="fotos-anuncio-painel">

                            ${(equipamento.fotos || []).map(foto => `
                                <img
                                    src="http://localhost:3000${escaparTextoPainel(foto)}"
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

        const fotos = prestador.fotos || [];
        console.log("ELEMENTO DA LISTA:", document.getElementById("lista-profissionais"));
        console.log("URL DA FOTO:", `http://localhost:3000${fotos[0]}`);
        console.log("FOTOS DO PRESTADOR:", prestador.nome, fotos);
        const idGaleria = `carrossel-prestador-${prestador.id_prestador}`;

        let galeriaFotos = "";

        if (fotos.length > 0) {

            galeriaFotos = `
                <div class="prof-gallery"
                     id="${idGaleria}"
                     data-indice="0">

                    <img
                        class="prof-photo"
                        src="http://localhost:3000${fotos[0]}"
                        alt="Trabalho de ${prestador.nome}"
                        data-indice="0"
                    >

                    ${
                        fotos.length > 1
                            ? `
                                <button
                                    class="prof-photo-arrow prof-photo-prev"
                                    onclick="mudarFotoPrestador(${prestador.id_prestador}, -1)"
                                    type="button"
                                    aria-label="Foto anterior"
                                >❮</button>

                                <button
                                    class="prof-photo-arrow prof-photo-next"
                                    onclick="mudarFotoPrestador(${prestador.id_prestador}, 1)"
                                    type="button"
                                    aria-label="Próxima foto"
                                >❯</button>

                                <span class="prof-photo-counter"
                                      id="contador-prestador-${prestador.id_prestador}">
                                    1/${fotos.length}
                                </span>
                            `
                            : ""
                    }

                </div>
            `;

        } else {

            galeriaFotos = `
                <div class="prof-avatar">
                    ${iniciais}
                </div>
            `;

        }

        lista.innerHTML += `
            <div class="prof-card">

                <div class="prof-verified">
                    ✔ Verificado
                </div>

                <div class="prof-header">

                    ${galeriaFotos}

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
                    ⭐ ${prestador.avaliacao ?? "Novo"}
                    <span>
                        (${prestador.total_avaliacoes ?? 0} avaliações)
                    </span>
                </div>

                <div class="prof-tags">
                    <span class="prof-tag">
                        ${prestador.especialidade || prestador.profissao}
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

    console.log(
        "GALERIAS AO FINAL DA FUNÇÃO:",
        lista.querySelectorAll(".prof-gallery").length
    );
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

    imagem.src = `http://localhost:3000${prestador.fotos[indice]}`;
    imagem.dataset.indice = indice;

    const contador = document.getElementById(
        `contador-prestador-${idPrestador}`
    );

    if (contador) {
        contador.textContent = `${indice + 1}/${prestador.fotos.length}`;
    }
}


fetch("http://localhost:3000/prestadores")
    .then(res => res.json())
    .then(prestadores => {
        todosPrestadores = prestadores;
        renderizarPrestadores(prestadores);
    })
    .catch(erro => {
        console.error("Erro ao carregar prestadores:", erro);
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


function renderizarEquipamentos(equipamentos) {

    const lista = document.getElementById("lista-equipamentos");

    lista.innerHTML = "";

    equipamentos.forEach(equipamento => {

        const fotos = equipamento.fotos || [];

        const idCarrossel = `carrossel-${equipamento.id_equipamento}`;

        const imagemInicial = fotos.length > 0
            ? `http://localhost:3000${fotos[0]}`
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
        `http://localhost:3000${equipamento.fotos[indiceAtual]}`;

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
            "http://localhost:3000/cadastro-equipamento",
            {
                method: "POST",
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
        `http://localhost:3000${fotos[indiceFotoAmpliada]}`;

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
