/* views/plano.js — geração e acompanhamento do plano de estudos até a data da prova. */

import { h, todayKey, fmtDateBR, diffDays, fmtDuracao } from '../util.js';
import { get, set } from '../store.js';
import { dados, materiaNome, corMateria, dataDaProva } from '../data.js';
import { gerarPlano, recomendacaoDeHoje } from '../planner.js';
import { cabecalho, card, badge, botao, barra, stat, toast, chipMateria, markdown } from '../components.js';

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function viewPlano() {
  const estado = get();
  const raiz = h('div', { class: 'pagina' });

  function desenhar() { raiz.replaceChildren(montar()); }
  raiz.appendChild(montar());
  return raiz;

  function montar() {
    const e = get();
    const prova = e.perfil.dataProva || dataDaProva();
    const diasRestantes = diffDays(prova, todayKey());

    const box = h('div');
    box.appendChild(cabecalho('Plano de estudos',
      diasRestantes > 0 ? `${diasRestantes} dias até a prova (${fmtDateBR(prova)})` : 'A data da prova já passou',
      [botao('⚙ Configurar', () => abrirConfig(), { variante: 'secundario' }),
       botao(e.plano.length ? '↻ Regenerar plano' : '🗓 Gerar plano', () => gerar(), { variante: 'primario' })]));

    box.appendChild(h('div', { class: 'faixa-stats' },
      stat(e.perfil.horasPorDia, 'horas/dia'),
      stat(diasRestantes, 'dias restantes'),
      stat(Math.round(diasRestantes * e.perfil.horasPorDia), 'horas totais', { cor: 'var(--verde)' }),
      stat(e.plano.length, 'dias planejados'),
      stat(fmtDuracao(e.metas.minutosSemana), 'meta semanal')));

    if (!e.plano.length) {
      box.appendChild(card('Comece gerando seu plano',
        h('div', {},
          h('p', { text: 'O plano distribui os 319 tópicos do Anexo II pelos dias que faltam até a prova, na proporção dos pontos que cada matéria representa na prova (o bloco de Específicos concentra 4,0 dos 10,0 pontos; Português e Legislação, 2,0 cada; Informática e RL, 1,0 cada — cada questão vale 0,2) e dá prioridade aos tópicos marcados como S e A no edital. Os últimos ~12% dos dias ficam reservados para revisão relâmpago e simulados.' }),
          h('div', { class: 'form-acoes' }, botao('Gerar plano agora', () => gerar(), { variante: 'primario' })))));
      return box;
    }

    const rec = recomendacaoDeHoje({ plano: e.plano, estado: e, dataProva: prova });
    const hoje = e.plano.find((d) => d.data === todayKey());

    if (hoje) box.appendChild(card('📌 Hoje', montarDia(hoje, { expandido: true }), { classe: 'card-hoje' }));
    else if (rec.dia) box.appendChild(card(`Próximo dia de estudo — ${fmtDateBR(rec.dia.data)}`, montarDia(rec.dia, { expandido: true }), { classe: 'card-hoje' }));

    if (rec.diasRestantes <= 0) {
      box.appendChild(card('Prova realizada', h('p', { text: 'A data da prova informada já passou. Ajuste em Configurações se houver nova data.' }), { classe: 'card-alerta' }));
    }

    // visão semanal
    const semanas = agruparPorSemana(e.plano);
    box.appendChild(card('Visão geral',
      h('div', { class: 'visao-semanal' }, ...semanas.map((s) => h('div', { class: 'semana' },
        h('div', { class: 'semana-titulo' },
          h('strong', { text: `${fmtDateBR(s.inicio)} → ${fmtDateBR(s.fim)}` }),
          badge(fmtDuracao(s.minutos), 'neutro'),
          badge(`${s.dias.length} dias`, 'neutro')),
        h('div', { class: 'semana-dias' }, ...s.dias.map((d) => h('div', {
          class: `mini-dia ${d.data === todayKey() ? 'mini-hoje' : ''} ${d.data < todayKey() ? 'mini-passado' : ''}`,
          title: `${fmtDateBR(d.data)} — ${d.blocos.map((b) => `${b.materiaNome} (${b.minutos}min)`).join(' · ')}`,
        }, h('strong', { text: fmtDateBR(d.data).slice(0, 5) }), h('span', { text: `${Math.round(d.minutos / 60 * 10) / 10}h` })))))))));

    // distribuição por matéria
    const porMateria = new Map();
    for (const d of e.plano) for (const b of d.blocos) {
      const k = b.materia || 'revisao';
      if (!porMateria.has(k)) porMateria.set(k, 0);
      porMateria.set(k, porMateria.get(k) + b.minutos);
    }
    const totalMin = [...porMateria.values()].reduce((a, b) => a + b, 0) || 1;
    box.appendChild(card('Distribuição do tempo por matéria',
      h('div', { class: 'materias-grid' }, ...[...porMateria.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, min]) => h('div', { class: 'materia-linha' },
          h('div', { class: 'materia-nome' }, chipMateria(k === 'revisao' ? 'Revisão / simulados' : materiaNome(k), corMateria(k))),
          h('div', { class: 'materia-barra' }, barra((min / totalMin) * 100, { cor: corMateria(k), altura: 7 })),
          h('div', { class: 'materia-numeros' }, h('span', { text: fmtDuracao(min) }), h('span', { class: 'detalhe', text: `${Math.round((min / totalMin) * 100)}%` })))))));

    // calendário dia a dia
    box.appendChild(card('Dia a dia',
      h('div', { class: 'lista-dias' }, ...e.plano.map((d) => montarDia(d, { expandido: d.data === todayKey() })))));

    return box;
  }

  function montarDia(d, { expandido = false } = {}) {
    const passado = d.data < todayKey();
    const el = h('details', { class: `dia ${passado ? 'dia-passado' : ''} ${d.data === todayKey() ? 'dia-hoje' : ''}`, open: expandido },
      h('summary', {},
        h('div', { class: 'dia-data' },
          h('strong', { text: fmtDateBR(d.data) }),
          h('span', { text: DIAS_SEMANA[new Date(`${d.data}T12:00:00`).getDay()] })),
        h('div', { class: 'dia-badges' },
          badge(d.tipo === 'reta-final' ? 'reta final' : 'conteúdo', d.tipo === 'reta-final' ? 'laranja' : 'neutro'),
          badge(fmtDuracao(d.minutos), 'neutro'),
          d.data === todayKey() ? badge('hoje', 'verde') : null,
          passado ? badge('passou', 'neutro') : null)),
      h('div', { class: 'dia-corpo' },
        ...d.blocos.map((b) => h('div', { class: 'bloco', style: { '--cor': b.cor || 'var(--accent)' } },
          h('div', { class: 'bloco-cabecalho' },
            h('strong', { text: b.materiaNome }),
            badge(fmtDuracao(b.minutos), 'neutro'),
            badge(b.tipo, 'neutro'),
            b.materia ? botao('Treinar', () => { location.hash = `#/treino/${b.materia}`; }, { variante: 'fantasma' }) : null,
            b.materia ? botao('Tópicos', () => { location.hash = `#/curriculo/${b.materia}`; }, { variante: 'fantasma' }) : null),
          b.topicos?.length ? h('ul', { class: 'bloco-topicos' }, ...b.topicos.map((t) => h('li', {},
            h('span', { class: 'topico-bola' }),
            h('span', { text: t.texto }),
            h('em', { text: `${t.minutos} min · prioridade ${t.prioridade}` })))) : null,
        )),
        h('div', { class: 'dia-acoes' },
          botao('✓ Marcar dia como concluído', () => marcarDia(d), { variante: 'secundario' }),
          botao('Abrir sessão de hoje', () => iniciarSessaoDoDia(d), { variante: 'primario' }))));
    return el;
  }

  function marcarDia(d) {
    set((s) => { s.diasConcluidos = s.diasConcluidos || {}; s.diasConcluidos[d.data] = new Date().toISOString(); },
      { log: { tipo: 'estudo', detalhe: { dia: d.data, minutos: d.minutos } } });
    toast(`Dia ${fmtDateBR(d.data)} marcado como concluído.`, 'sucesso');
    desenhar();
  }

  function iniciarSessaoDoDia(d) {
    const materias = [...new Set(d.blocos.map((b) => b.materia).filter(Boolean))];
    if (!materias.length) {
      if (d.tipo === 'reta-final') location.hash = '#/simulados/sim-prova-real';
      else location.hash = '#/erros';
      return;
    }
    const qs = [];
    for (const m of materias) qs.push(...dados.questoes.filter((q) => q.materia === m));
    const alvo = Math.min(qs.length, Math.max(5, Math.round(d.minutos / 2)));
    import('./resolver.js').then(({ criarResolver }) => {
      import('../util.js').then(({ shuffle }) => {
        document.getElementById('app').replaceChildren(criarResolver({
          questoes: shuffle(qs).slice(0, alvo),
          modo: 'livre',
          titulo: `Plano de ${fmtDateBR(d.data)}`,
        }));
        window.scrollTo(0, 0);
      });
    });
  }

  function gerar() {
    const e = get();
    const prova = e.perfil.dataProva || dataDaProva();
    const estrutura = estruturaProva();
    const resultado = gerarPlano({
      materias: dados.materias,
      estrutura,
      horasPorDia: e.perfil.horasPorDia || 3,
      diasSemana: e.perfil.diasSemana?.length ? e.perfil.diasSemana : [1, 2, 3, 4, 5, 6, 0],
      dataProva: prova,
      estado: e,
    });
    if (resultado.aviso && !resultado.dias.length) { toast(resultado.aviso, 'erro', 5000); return; }
    set((s) => { s.plano = resultado.dias; s.planoGeradoEm = new Date().toISOString(); s.planoResumo = resultado.resumo; s.planoAviso = resultado.aviso; });
    toast(resultado.aviso ? 'Plano gerado com ressalvas.' : `Plano gerado: ${resultado.dias.length} dias, ~${resultado.resumo.horasTotais}h de estudo.`, resultado.aviso ? 'aviso' : 'sucesso', 6000);
    desenhar();
  }

  function estruturaProva() {
    const modelo = (dados.simulados?.simulados || []).find((m) => m.id === 'sim-prova-real');
    if (modelo?.estrutura && Array.isArray(modelo.estrutura)) return modelo.estrutura;
    const blocos = dados.concurso?.estruturaProva;
    if (Array.isArray(blocos)) {
      const ce = dados.concurso?.estimativaConhecimentosEspecificos?.porMateria || {};
      const saida = [];
      for (const b of blocos) {
        if (b.id === 'ce') {
          for (const [mat, qtd] of Object.entries(ce)) saida.push({ materia: mat, quantidade: qtd, pontos: qtd * 0.2 });
        } else {
          saida.push({ materia: b.id, quantidade: b.questoes, pontos: b.pontos });
        }
      }
      return saida;
    }
    return [];
  }

  function abrirConfig() {
    location.hash = '#/config';
  }
}

function agruparPorSemana(plano) {
  const semanas = [];
  let atual = null;
  for (const d of plano) {
    const dt = new Date(`${d.data}T12:00:00`);
    const dom = new Date(dt);
    dom.setDate(dt.getDate() - dt.getDay());
    const chave = dom.toISOString().slice(0, 10);
    if (!atual || atual.chave !== chave) {
      atual = { chave, inicio: chave, fim: null, dias: [], minutos: 0 };
      semanas.push(atual);
    }
    atual.dias.push(d);
    atual.minutos += d.minutos;
    atual.fim = d.data;
  }
  return semanas;
}
