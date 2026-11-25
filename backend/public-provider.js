// Projeção explícita dos campos públicos do prestador, evitando devolver dados cadastrais privados.
function mapearPrestadorPublico(prestador) {
    const avaliacaoCalculada = prestador.nota_media_avaliacoes;
    const totalCalculado = Number(prestador.total_notas_avaliacoes) || 0;
    return {
        id_prestador: prestador.id_prestador,
        id_servico: prestador.id_servico ?? null,
        profissao: prestador.profissao,
        descricao: prestador.descricao,
        valor_diaria: prestador.valor_diaria,
        valor_negociavel: prestador.valor_negociavel ?? prestador.valor_diaria == null,
        disponivel: prestador.disponivel ?? 1,
        cidade: prestador.cidade,
        estado: prestador.estado,
        especialidades: prestador.especialidades || [],
        verificado: prestador.verificado,
        avaliacao: avaliacaoCalculada !== null && avaliacaoCalculada !== undefined
            ? Number(avaliacaoCalculada) : prestador.avaliacao,
        total_avaliacoes: totalCalculado > 0 ? totalCalculado : Number(prestador.total_avaliacoes) || 0,
        nome: prestador.nome,
        foto_perfil: prestador.foto_perfil,
        foto: prestador.foto,
        fotos: prestador.fotos || []
    };
}

module.exports = { mapearPrestadorPublico };
