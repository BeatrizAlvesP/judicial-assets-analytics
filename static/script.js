/* =========================================================
   0) Entrada: JSONs do Flask (não recalcular o que o back já enviou)
   ========================================================= */


const elDados = document.getElementById('dados-json');
const elIndic = document.getElementById('indicadores-json');

const RAW = elDados ? JSON.parse(elDados.textContent) : [];
const IND = elIndic ? JSON.parse(elIndic.textContent) : null;

/* =========================================================
   1) Utilitários e helpers
   ========================================================= */
const toNum = v => (Number.isFinite(+v) ? +v : 0);
const brl   = v => toNum(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const uniq  = arr => [...new Set(arr)].filter(Boolean);

// normaliza frações: aceita 0–1 (preferido) e tolera 0–100
const frac = (v) => {
  const n = toNum(v);
  if (!Number.isFinite(n)) return 0;
  if (n > 1) return n/100;
  if (n < 0) return 0;
  return n;
};

// cor de risco (0 = verde, 0.5 = amarelo, 1 = vermelho)
function riskColor(r){
  const x = Math.max(0, Math.min(1, Number(r) || 0));
  let R, G, B = 80;
  if (x <= 0.5) {
    const t = x / 0.5;
    R = Math.round(0   + (234-0)   * t);
    G = Math.round(170 + (179-170) * t);
    B = Math.round(0   + (  8-0)   * t);
  } else {
    const t = (x - 0.5) / 0.5;
    R = Math.round(234 + (239-234) * t);
    G = Math.round(179 + ( 68-179) * t);
    B = Math.round(  8 + ( 68-  8) * t);
  }
  return `rgba(${R},${G},${B},0.85)`;
}
function riskBorder(r){
  const x = Math.max(0, Math.min(1, Number(r) || 0));
  return riskColor(x).replace(/0\.85\)$/, '1)');
}

// chip de cenário
function scenarioChipHTML(label, multi=false){
  const s = (label || 'Sem cenário');
  const l = s.toLowerCase();
  let cls = 'bg-gray-100 text-gray-800';
  if (l.includes('otim'))      cls = 'bg-green-100 text-green-800';      // Otimista
  else if (l.includes('base')) cls = 'bg-blue-100 text-blue-800';        // Base
  else if (l.includes('pess') || l.includes('conserv'))
                               cls = 'bg-orange-100 text-orange-800';    // Pess/Conserv
  return `<span class="px-2 py-1 text-xs font-semibold rounded-full ${cls}" ${multi ? 'title="Múltiplos cenários neste código"' : ''}>${s}</span>`;
}

/* =========================================================
   2) Normalização de linhas (sem mudar IDs/classes do HTML)
   ========================================================= */
function normRow(r){
  const get = (keys, def=null) => { for (const k of keys) if (r[k] !== undefined && r[k] !== null) return r[k]; return def; };

  const emissao  = String(get(['Emissão','Emissao'], '')).trim();
  const codigo   = String(get(['Codigo','Código'], '')).trim();
  const status   = String(get(['Status'], '')).trim();
  const cenario  = String(get(['Cenário','CENARIO TEMPO'], 'Sem Cenário')).trim() || 'Sem Cenário';

  const meses            = toNum(get(['Duration','MESES'], 0));
  const multiplo         = toNum(get(['Multiplo','Múltiplo'], 0));
  const totalDistribuido = toNum(get(['Total Distribuido','Total Distribuído'], 0));
  const totalTokens      = toNum(get(['Total Tokens'], 0));
  const qtdProcessos     = toNum(get(['Qtd Processos','Qtdd Processos'], 0));
  const valorAtualFace   = toNum(get(['Valor Atual Face'], 0));
  const valorEstimado    = toNum(get(['Valor Estimado'], 0));
  const valorRealBack    = get(['Valor Real'], null);

  const lastroF  = frac(get(['% Lastro','Lastro'], 0));
  const distribF = frac(get(['% Distribuido','% Distribuído'], 0));

  const ppRaw = get(['Percentual PP','PERCENTUAL'], null);
  const temPP = ppRaw !== null && ppRaw !== '' && Number.isFinite(+ppRaw);
  const percentualPPF = frac(temPP ? ppRaw : 0);

  const participF = frac(get(['Participação'], 0));

  // “Risco por Fase”
  const valorPossivelRuim = toNum(get(['Valor Estimado Possivel Ruim'], 0));
  const possiveisRuins    = toNum(get(['possiveis ruins','possiveis rui'], 0));
  const mesesDesdeEnc     = toNum(get(['Meses desde Encerramento'], NaN));
  const encerramento      = get(['Encerramento'], null);

  const valorReal = Number.isFinite(+valorRealBack) && +valorRealBack>0
    ? +valorRealBack
    : lastroF * valorAtualFace;

  return {
    emissao, codigo, status, cenario,
    meses, multiplo, totalDistribuido, totalTokens, qtdProcessos,
    valorAtualFace, valorEstimado, valorReal,
    lastroF, distribF, percentualPPF, participF, temPP,
    valorPossivelRuim, possiveisRuins, mesesDesdeEnc, encerramento,
    _raw: r
  };
}

const BASE = (RAW || []).map(normRow);

/* =========================================================
   3) Cards — IDs do seu HTML (sem alterar)
   ========================================================= */
function preencherOverview(dados){
    console.log('🔎 dados[0] no Overview:', dados[0]);

  const hasFiltro =
    ((document.getElementById('codigo')?.value || '').trim() !== '') ||
    ((document.getElementById('filterCenario')?.value || '') !== '') ||
    ((document.getElementById('filterEmissao')?.value || '') !== '');

  const over = (!hasFiltro && IND?.overview) ? IND.overview : null;

  const totalDistribuido = over?.total_distribuido ?? dados.reduce((s,d)=> s + toNum(d.totalDistribuido), 0);
  const valorRealTotal   = over?.valor_real_total   ?? dados.reduce((s,d)=> s + toNum(d.valorReal), 0);
  const tempoMedio       = over?.tempo_medio_meses  ?? (() => {
    const m = dados.map(d=>d.meses).filter(Number.isFinite);
    return m.length ? (m.reduce((a,b)=>a+b,0)/m.length) : 0;
  })();
  const totalReg         = over?.total_tokens_registros ?? dados.length;

  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  setTxt('valorDistribuido', brl(totalDistribuido));
  setTxt('valorRealTotal',   brl(valorRealTotal));

  const tempoEl = document.getElementById('tempoMédio') || document.getElementById('tempoMedio');
  if (tempoEl) tempoEl.textContent = (tempoMedio == null ? '—' : (Math.round(tempoMedio*10)/10).toFixed(1));

  setTxt('totalTokenDash', Number(totalReg).toLocaleString('pt-BR'));
}

function preencherAlertas(dados){ 
  const base = (dados || []).filter(
    d => String(d.status).toLowerCase() === 'ativa' && toNum(d.valorEstimado) > 0 ); 

  const tokensSemVal = base.filter(d => toNum(d.valorAtualFace) <= 0).length;
  const valorEmRisco = base.reduce((s, d) => 
    {const valor = toNum(d.valorEstimado);
        const lastro = frac(d.lastroF); // 0–1
        return s + valor * (1 - lastro);
    }, 0);
  const valorTotalCarteira = (dados || []).reduce((s, d) => s + toNum(d.valorReal),0);
  const percCarteiraEmRisco =valorTotalCarteira > 0? (valorEmRisco / valorTotalCarteira) * 100: 0;
  const qtdPastas = base.reduce((s,d)=> s + toNum(d._raw?.["Numero de Pastas Estimado"] ?? d["Numero de Pastas Estimado"]), 0); 
  
  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; }; 
  setTxt('totalTokenSemValor', Number(tokensSemVal).toLocaleString('pt-BR')); 
  setTxt('valorSemLastro', brl(valorEmRisco)); 
  const percEl = document.getElementById('participacaoDoLastro'); 
  if (percEl) percEl.textContent = percCarteiraEmRisco.toFixed(1);
  setTxt('qtdDePastas', Number(qtdPastas).toLocaleString('pt-BR')); 
}

/* =========================================================
   4) Filtros (mantendo ids do HTML)
   ========================================================= */
function preencherFiltros(dados){
  const selCen = document.getElementById('filterCenario');
  const selEmi = document.getElementById('filterEmissao');
  if (!selCen || !selEmi) return;

  selCen.querySelectorAll("option:not([value=''])").forEach(o=>o.remove());
  selEmi.querySelectorAll("option:not([value=''])").forEach(o=>o.remove());

  uniq(dados.map(d=>d.cenario)).sort()
    .forEach(c=> selCen.insertAdjacentHTML('beforeend', `<option value="${c}">${c}</option>`));

  uniq(dados.map(d=>d.emissao)).sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}))
    .forEach(e=> selEmi.insertAdjacentHTML('beforeend', `<option value="${e}">${e}</option>`));
}

/* =========================================================
   5) Gráficos
   ========================================================= */
let chRiscoValor=null, chRanking=null, chMatriz=null, chRiscoStatus=null, chRetorno=null;

function destroyCharts(){
  [chRiscoValor,chRanking,chMatriz,chRiscoStatus,chRetorno].forEach(c=> c && c.destroy && c.destroy());
  chRiscoValor=chRanking=chMatriz=chRiscoStatus=chRetorno=null;
}

function desenharGraficos(dados){
  const arr = dados && dados.length ? dados : BASE;

  // ---------- 1) Risco vs. Valor ----------
  const ctxRV = document.getElementById('riscoValorChart')?.getContext('2d');
  if (ctxRV) {
    const ativos = (dados && dados.length ? dados : BASE).filter(d =>
      String(d.status).toLowerCase() === 'ativa' &&
      Number.isFinite(d.valorEstimado) && d.valorEstimado > 0
    );

    const expX = (d) => {
      if (Number.isFinite(d.valorReal) && d.valorReal > 0) return d.valorReal;
      const faceCarteira = Number(d._raw?.['Valor Atual de Face Estimado da Carteira']);
      if (Number.isFinite(faceCarteira) && faceCarteira > 0) return faceCarteira;
      if (Number.isFinite(d.valorAtualFace) && d.valorAtualFace > 0) return d.valorAtualFace;
      if (Number.isFinite(d.totalTokens) && d.totalTokens > 0) return d.totalTokens;
      return 0;
    };

    const maxY = Math.max(...ativos.map(d => d.valorEstimado), 1);
    const heat = (t) => {
      const x = Math.max(0, Math.min(1, t || 0));
      let R, G, B;
      if (x <= 0.5) { const u = x / 0.5; R = Math.round(0 + (234-0) * u); G = Math.round(170 + (179-170) * u); B = Math.round(0 + (8-0) * u); }
      else { const u = (x - 0.5) / 0.5; R = Math.round(234 + (239-234) * u); G = Math.round(179 + (68-179) * u); B = Math.round(8 + (68-8) * u); }
      return `rgba(${R},${G},${B},0.85)`;
    };

    const xs = ativos.map(expX).sort((a,b)=>a-b);
    const pickP = t => xs.length ? xs[Math.min(xs.length-1, Math.floor(t*(xs.length-1)))] : 0;
    const p05 = pickP(0.05), p95 = pickP(0.95);
    const radius = (v) => {
      if (!p95 || p95 <= p05) return 5;
      const z = Math.max(0, Math.min(1, (v - p05) / (p95 - p05)));
      return 4 + z * 8;
    };

    const pontos = ativos.map(d => {
      const x = expX(d);
      const y = d.valorEstimado;
      return { x, y, label: d.codigo || d.emissao, _c: y / maxY, _r: radius(x) };
    });

    chRiscoValor = new Chart(ctxRV, {
      type: 'scatter',
      data: {
        datasets: [{
          label: '',
          data: pontos,
          pointRadius: (ctx) => ctx.raw ? ctx.raw._r : 5,
          backgroundColor: (ctx) => ctx.raw ? heat(ctx.raw._c) : 'rgba(99,102,241,0.8)',
          borderColor: 'rgba(17,24,39,1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: {display: true, color: "rgba(200,200,200,0.3)"},
               title: { display: true, text: 'Exposição (R$)', color: '#ffffff'},
               ticks: { callback: v => (v >= 1_000_000) ? 'R$ ' + (v/1_000_000).toFixed(1) + 'M' : 'R$ ' + (v/1000).toFixed(0) + 'k', color: '#ffffff' } },
          y: { grid: {display: true, color: "rgba(200,200,200,0.3)"},
               title: { display: true, text: 'Valor Estimado (R$)', color: '#ffffff' },
               ticks: { callback: v => (v >= 1_000_000) ? 'R$ ' + (v/1_000_000).toFixed(1) + 'M' : 'R$ ' + (v/1000).toFixed(0) + 'k', color: '#ffffff' } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (ctx) => ctx[0].raw.label || '',
                                  label: (ctx) => [`Exposição: ${brl(ctx.raw.x)}`, `Valor Estimado: ${brl(ctx.raw.y)}`] } }
        }
      }
    });
  }

  // ---------- 2) Ranking de Maiores Valores em Risco ----------
  const ctxRank = document.getElementById('rankingRiscoChart')?.getContext('2d');
  if (ctxRank){
    const ativos = arr.filter(d => String(d.status).toLowerCase() === 'ativa' && toNum(d.valorEstimado) > 0);

    const agg = new Map();
    ativos.forEach(d => {
      const key = d.codigo || d.emissao || '—';
      agg.set(key, (agg.get(key) || 0) + toNum(d.valorEstimado));
    });

    let serie = [...agg.entries()].map(([k,v]) => ({ k, v }));
    const top = serie.sort((a,b)=> a.v - b.v).slice(0,10);

    const maxV = Math.max(...top.map(s=>s.v));
    const minV = Math.min(...top.map(s=>s.v));
    const norm = v => (maxV === minV ? 0.5 : (v - minV) / (maxV - minV));

    const bg = top.map(s => riskColor(norm(s.v)));
    const bd = top.map(s => riskBorder(norm(s.v)));

    chRanking = new Chart(ctxRank,{
      type:'bar',
      data:{ labels: top.map(s=>s.k),
             datasets:[{ label:'', data: top.map(s=>s.v), maxBarThickness: 24, backgroundColor: bg, borderColor: bd, borderWidth: 1.5 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=> ` ${brl(c.raw)}`  } } },
                scales:{ x:{ ticks:{ callback: v => (v >= 1_000_000) ? 'R$ ' + (v/1_000_000).toFixed(1) + 'M' : 'R$ ' + (v/1000).toFixed(0) + 'k', color: '#ffffff' } }, y:{ticks:{color: '#ffffff'}}}}
    });
  }

  // ---------- 3) Matriz (Impacto x Urgência) ----------
  const ctxMat = document.getElementById('matrizChart')?.getContext('2d');
  if (ctxMat) {
    const ONLY_ATIVAS_IN_MATRIX = true;

    const heat = (t) => {
      const x = Math.max(0, Math.min(1, t || 0));
      let R, G, B;
      if (x <= 0.5) { const u = x / 0.5; R = Math.round(0 + (234-0) * u); G = Math.round(170 + (179-170) * u); B = Math.round(0 + (8-0) * u); }
      else { const u = (x - 0.5) / 0.5; R = Math.round(234 + (239-234) * u); G = Math.round(179 + (68-179) * u); B = Math.round(8 + (68-8) * u); }
      return `rgba(${R},${G},${B},0.85)`;
    };

    const classificaCenarioPorMeses = (m) => {
      const v = Number(m);
      if (!Number.isFinite(v) || v <= 0) return null;
      if (v <= 24) return { nome: 'Otimista',   proxy: 18 };
      if (v <= 34) return { nome: 'Base',       proxy: 30 };
      return { nome: 'Conservador', proxy: 42 };
    };
    const classificaCenarioPorTexto = (txt) => {
      const s = String(txt || '').toLowerCase();
      if (s.includes('otim')) return { nome: 'Otimista',   proxy: 18 };
      if (s.includes('base')) return { nome: 'Base',       proxy: 30 };
      if (s.includes('conserv')) return { nome: 'Conservador', proxy: 42 };
      return { nome: 'Sem cenário', proxy: 45 };
    };

    const fonte = (dados && dados.length ? dados : BASE);
    const filtrados = fonte.filter(d => {
      if (ONLY_ATIVAS_IN_MATRIX && String(d.status).toLowerCase() !== 'ativa') return false;
      const faceCarteira =
        toNum(d._raw?.["Valor Atual de Face Estimado da Carteira"]) ||
        toNum(d["Valor Atual de Face Estimado da Carteira"]) ||
        toNum(d.valorAtualFace) || 0;
      return faceCarteira > 0;
    });

    const impactos = filtrados.map(d =>
      toNum(d._raw?.["Valor Atual de Face Estimado da Carteira"]) ||
      toNum(d["Valor Atual de Face Estimado da Carteira"]) ||
      toNum(d.valorAtualFace) || 0
    );
    const maxImpacto = Math.max(...impactos, 1);

    const parts = filtrados.map(d => toNum(d.participF) || 0);
    const sortedParts = [...parts].sort((a,b)=>a-b);
    const pickP = (t) => sortedParts.length
      ? sortedParts[Math.min(sortedParts.length-1, Math.floor(t*(sortedParts.length-1)))]
      : 0;
    const p05 = pickP(0.05), p95 = pickP(0.95);
    const radius = (p) => {
      const v = toNum(p) || 0;
      if (!p95 || p95 <= p05) return 5;
      const z = Math.max(0, Math.min(1, (v - p05) / (p95 - p05)));
      return 4 + z * 8;
    };

    const pontos = filtrados.map(d => {
      const impacto =
        toNum(d._raw?.["Valor Atual de Face Estimado da Carteira"]) ||
        toNum(d["Valor Atual de Face Estimado da Carteira"]) ||
        toNum(d.valorAtualFace) || 0;

      const meses = Number.isFinite(d.meses) && d.meses > 0 ? d.meses : null;
      const cls = meses != null
        ? classificaCenarioPorMeses(meses)
        : classificaCenarioPorTexto(d.cenario);

      const urgencia = meses != null ? meses : cls.proxy;
      return {
        x: impacto,
        y: urgencia,
        label: d.codigo || d.emissao,
        _c: heat(impacto / maxImpacto),
        _r: radius(d.participF),
        _bucket: cls?.nome || 'Sem cenário'
      };
    });

    chMatriz = new Chart(ctxMat, {
      type: 'scatter',
      data: { datasets: [{ label: '', data: pontos,
                           pointRadius: (ctx) => ctx.raw ? ctx.raw._r : 5,
                           backgroundColor: (ctx) => ctx.raw ? ctx.raw._c : 'rgba(99,102,241,0.8)',
                           borderColor: 'rgba(17,24,39,1)', borderWidth: 1 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: {display: true, color: "rgba(200,200,200,0.3)"},
               title: { display: true, text: 'Impacto (Face Estimada da Carteira em R$)' , color: '#ffffff'},
               ticks: { callback: v => (v >= 1_000_000) ? 'R$ ' + (v/1_000_000).toFixed(1) + 'M' : 'R$ ' + (v/1000).toFixed(0) + 'k' , color: '#ffffff'} },
          y: { grid: {display: true, color: "rgba(200,200,200,0.3)"},
               title: { display: true, text: 'Urgência (meses — ≤24 Otimista, ≤34 Base, >34 Conservador)', color: '#ffffff' } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (c) => c[0].raw.label || '',
                                  label: (c) => [`Impacto: ${brl(c.raw.x)}`,
                                                 `Urgência (meses): ${Number(c.raw.y).toFixed(1)}`,
                                                 `Cenário (regra): ${c.raw._bucket}`] } }
        }
      }
    });
  }

  // ---------- 4) Risco por Fase ----------
  const ctxFase = document.getElementById('riscoStatusChart')?.getContext('2d');
  if (ctxFase){
    const dUTC = (y,m,d)=> new Date(Date.UTC(y,m,d));
    const parseDateFlex = (v) => {
      if (!v) return null;
      if (v instanceof Date && !isNaN(v)) return dUTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
      if (typeof v === 'string'){
        const s = v.trim();
        const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); // dd/mm/aaaa
        if (m1) return dUTC(+m1[3], +m1[2]-1, +m1[1]);
        const d = new Date(s);
        if (!isNaN(d)) return dUTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        return null;
      }
      if (typeof v === 'number') return new Date(v);
      return null;
    };
    const monthsDiffUTC = (a, b) => {
      const Au = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
      const Bu = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
      return (Au - Bu) / (1000*60*60*24*30.4375);
    };

    const fonte = (dados && dados.length ? dados : BASE).filter(d =>
      String(d.status).toLowerCase() === 'ativa' && toNum(d.valorPossivelRuim) > 0
    );

    const agg = new Map();
    for (const r of fonte){
      if (!r.emissao) continue;
      const enc = parseDateFlex(r.encerramento);

      if (!agg.has(r.emissao)){
        agg.set(r.emissao, { emissao: r.emissao, risco: 0, qtdProc: 0, possRuins: 0, encs: [] });
      }
      const g = agg.get(r.emissao);
      g.risco     += toNum(r.valorPossivelRuim);
      g.qtdProc    = Math.max(g.qtdProc, toNum(r.qtdProcessos));
      g.possRuins  = Math.max(g.possRuins, toNum(r.possiveisRuins));
      if (enc) g.encs.push(enc);
    }

    const today = new Date();
    const todayUTC = dUTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

    let serie = [...agg.values()].map(o => {
      o.encs.sort((a,b)=> a - b);
      const encMin = o.encs[0] ?? null;
      const encMax = o.encs.length ? o.encs[o.encs.length-1] : null;

      const mesesMin = encMin ? monthsDiffUTC(todayUTC, encMin) : NaN;
      const hasSecond = (encMin && encMax && encMax.getTime() !== encMin.getTime());
      const mesesMax  = hasSecond ? monthsDiffUTC(todayUTC, encMax) : NaN;
      const mesesParaCor = hasSecond ? mesesMax : mesesMin;

      return { emissao: o.emissao, risco: o.risco, qtdProc: o.qtdProc, possRuins: o.possRuins,
               encMin, encMax, mesesMin, mesesMax, mesesParaCor };
    });

    serie.sort((a,b)=>{
      const am = Number.isFinite(a.mesesParaCor) ? a.mesesParaCor : 1e9;
      const bm = Number.isFinite(b.mesesParaCor) ? b.mesesParaCor : 1e9;
      if (am !== bm) return am - bm;
      return a.risco - b.risco;
    });

    const labels  = serie.map(s=> s.emissao);
    const valores = serie.map(s=> s.risco);

    const capMeses = 18;
    const norm = m => Math.max(0, Math.min(1, (Number.isFinite(m) ? m : 0) / capMeses));
    const cores   = serie.map(s=> riskColor(norm(s.mesesParaCor)));
    const bordas  = serie.map(s=> riskBorder(norm(s.mesesParaCor)));

    chRiscoStatus = new Chart(ctxFase,{
      type:'bar',
      data:{ labels,
             datasets:[{ label:'', data: valores, backgroundColor: cores,
                         borderColor: bordas, borderWidth: 1.5,
                         maxBarThickness: 28, categoryPercentage: 0.85, barPercentage: 0.9 }] },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{ display:false },
          tooltip:{
            callbacks:{
              label:(c)=> ` ${brl(c.raw)}`,
              afterLabel:(c)=>{
                const s = serie[c.dataIndex];
                const fmt = d => d?.toLocaleDateString('pt-BR') ?? '—';
                const linhas = [];
                if (s.encMin && s.encMax && s.encMin.getTime() !== s.encMax.getTime()){
                  linhas.push(`Encerr.: ${fmt(s.encMin)} – ${fmt(s.encMax)}`);
                } else {
                  linhas.push(`Encerr.: ${fmt(s.encMin || s.encMax)}`);
                }
                const m1 = Number.isFinite(s.mesesMin) ? s.mesesMin.toFixed(1)+' meses' : '—';
                linhas.push(`Meses (1ª data): ${m1}`);
                if (Number.isFinite(s.mesesMax)){
                  linhas.push(`Meses (2ª data): ${s.mesesMax.toFixed(1)} meses`);
                }
                return linhas;
              },
              title:(c)=> c[0].label
            }
          }
        },
        scales:{
          y:{ grid: {display: true, color: "rgba(200,200,200,0.3)"}, beginAtZero:true,
              ticks:{ callback: v => (v >= 1_000_000) ? 'R$ ' + (v/1_000_000).toFixed(1) + 'M' : 'R$ ' + (v/1000).toFixed(0) + 'k', color: '#ffffff' } },
          x:{ grid: {display: true, color: "rgba(200,200,200,0.3)"}, ticks:{ autoSkip:false, maxRotation: 60, minRotation: 30 , color: '#ffffff'} }
        }
      }
    });
  }

  // ---------- 5) % Distribuído por Emissão ----------
  const ctxRet = document.getElementById('retornoRiscoChart')?.getContext('2d');
  if (ctxRet){
    Chart.getChart(ctxRet.canvas)?.destroy();

    const rows = (arr && arr.length ? arr : BASE);

    const toNumberFlex = (v) => {
      if (v === null || v === undefined || v === '') return NaN;
      if (typeof v === 'number') return v;
      const s0 = String(v).trim();
      let s = s0.replace(/[R$\s]/g, '');
      if (/,/.test(s) && /\./.test(s)) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(',', '.');
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : NaN;
    };
    const toPercent0_100 = (v) => {
      const n = toNumberFlex(v);
      if (!Number.isFinite(n)) return NaN;
      return n <= 1 ? n * 100 : n;
    };

    const byEm = new Map();
    for (const r of rows){
      const em = (r.emissao || r._raw?.['Emissão'] || r._raw?.['Emissao'] || '').toString().trim();
      if (!em) continue;

      const vi  = toNumberFlex(r._raw?.['Valor Individual'] ?? r._raw?.['Valor individual']);
      const pct = toPercent0_100(r._raw?.['% Distribuido'] ?? r._raw?.['% Distribuído']);
      if (!Number.isFinite(vi) || !Number.isFinite(pct)) continue;

      if (!byEm.has(em)) byEm.set(em, { emissao: em, sumVI: 0, maxPct: 0 });
      const g = byEm.get(em);
      if (vi > 0) g.sumVI += vi;
      if (pct > g.maxPct) g.maxPct = pct;
    }

    let serie = [...byEm.values()]
      .filter(g => g.maxPct > 0)
      .sort((a,b)=> a.maxPct - b.maxPct)
      .map(g => ({ emissao: g.emissao, pct: +g.maxPct.toFixed(2), numerVI: g.sumVI }));

    const labels  = serie.map(s => s.emissao);
    const valores = serie.map(s => s.pct);

    const cores  = valores.map(v => v >= 80 ? 'rgba(34,197,94,0.9)' : v >= 50 ? 'rgba(234,179,8,0.9)' : 'rgba(239,68,68,0.9)');
    const bordas = valores.map(()=>'rgba(255,255,255,0.6)');

    chRetorno = new Chart(ctxRet,{
      type:'bar',
      data:{ labels, datasets:[{ label:'', data: valores, backgroundColor: cores, borderColor: bordas, borderWidth: 1.2, maxBarThickness: 28, categoryPercentage: 0.9, barPercentage: 0.9 }] },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false },
                  tooltip:{ callbacks:{ title:(c)=> c[0].label,
                                        label:(c)=> [`% Distribuído: ${c.raw.toFixed(2)}%`],
                                        afterLabel:(c)=>{ const s = serie[c.dataIndex]; return [`Valor Distribuído: ${(s.numerVI||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`]; } } } },
        scales:{ y:{ grid: {display: true, color: "rgba(200,200,200,0.3)"}, beginAtZero:true, max:100, ticks:{ callback:v=> v+'%' }, title:{ display:true, text:'% Distribuído (Emissões > 0%)' } , color: '#ffffff'},
                 x:{ grid: {display: true, color: "rgba(200,200,200,0.3)"}, ticks:{ autoSkip:false, maxRotation: 60, minRotation: 30, color: '#ffffff' } } }
      }
    });
  }
}

/* =========================================================
   6) Cards por CÓDIGO + paginação
   ========================================================= */
const itensPorPagina = 12;
let paginaAtual = 1;
let dadosFiltrados = Array.isArray(BASE) ? BASE.slice() : [];

// urgência (meses) como na Matriz
function proxyUrgenciaMeses(meses, cenarioTxt){
  if (Number.isFinite(+meses) && +meses > 0) return +meses;
  const s = String(cenarioTxt||'').toLowerCase();
  if (s.includes('otim'))  return 18;
  if (s.includes('base'))  return 30;
  if (s.includes('conserv')) return 42;
  return 45;
}
function impactoDaLinha(r){
  return toNum(r._raw?.['Valor Atual de Face Estimado da Carteira']) ||
         toNum(r['Valor Atual de Face Estimado da Carteira']) ||
         toNum(r.valorAtualFace) || 0;
}

function agruparPorCodigo(rows){
  const by = new Map();

  for (const r of rows){
    const cod = (r.codigo || '').trim();
    if (!cod) continue;

    if (!by.has(cod)){
      by.set(cod, {
        codigo: cod,
        ead: 0, ver: 0, impacto: 0,
        totalTokens: 0, qtddProcessos: 0, tokensSemValor: 0,
        emissoes: new Set(),
        _lastroW: 0, _lastroV: 0, lastro: 0,
        meses: 0, _mesesN: 0, _ppW: 0, percentualPP: 0,
        multiplo: 0, _multN: 0,
        _urgSoma: 0, _urgN: 0, urg: 0,
        // cenário por código
        cenarios: new Map(),
        cenario: 'Sem cenário',
        hasMultiCenarios: false,
        // flags
        temLastro: false, temValorFace: false,
        status: r.status || ''
      });
    }

    const g = by.get(cod);
    g.emissoes.add(r.emissao);

    // somatórios
    g.ead += Number.isFinite(+r.valorReal)      ? +r.valorReal      : 0;
    g.ver += Number.isFinite(+r.valorEstimado)  ? +r.valorEstimado  : 0;
    g.impacto += impactoDaLinha(r);

    g.totalTokens   += Number.isFinite(+r.totalTokens)  ? +r.totalTokens  : 0;
    g.qtddProcessos += Number.isFinite(+r.qtdProcessos) ? +r.qtdProcessos : 0;

    if (!(+r.valorAtualFace > 0)) {
      g.tokensSemValor += Number.isFinite(+r.totalTokens) ? +r.totalTokens : 0;
    }

    const last = Number.isFinite(+r.lastroF) ? (+r.lastroF * 100) : 0;
    const face = Number.isFinite(+r.valorAtualFace) ? +r.valorAtualFace : 0;
    g._lastroW += last * face; g._lastroV += face;

    if (Number.isFinite(+r.meses)) { g.meses += +r.meses; g._mesesN++; }

    const pp  = Number.isFinite(+r.percentualPPF) ? (+r.percentualPPF * 100) : 0;
    const ead = Number.isFinite(+r.valorReal) ? +r.valorReal : 0;
    g.percentualPP += pp * ead; g._ppW += ead;

    if (Number.isFinite(+r.multiplo)) { g.multiplo += +r.multiplo; g._multN++; }

    const urg = proxyUrgenciaMeses(r.meses, r.cenario);
    g._urgSoma += urg; g._urgN++;

    g.temLastro    = g.temLastro    || (r.lastroF > 0);
    g.temValorFace = g.temValorFace || (+r.valorAtualFace > 0);

    // contar cenários
    const c = r.cenario || 'Sem cenário';
    g.cenarios.set(c, (g.cenarios.get(c) || 0) + 1);
  }

  const grupos = [];
  for (const g of by.values()){
    g.lastro       = g._lastroV > 0 ? (g._lastroW / g._lastroV) : 0;
    g.meses        = g._mesesN > 0 ? (g.meses    / g._mesesN)   : 0;
    g.percentualPP = g._ppW    > 0 ? (g.percentualPP / g._ppW)  : 0;
    g.multiplo     = g._multN  > 0 ? (g.multiplo / g._multN)    : 0;
    g.urg          = g._urgN   > 0 ? (g._urgSoma / g._urgN)     : 0;

    if (g.cenarios && g.cenarios.size) {
      const [nome] = [...g.cenarios.entries()].sort((a,b)=> b[1]-a[1])[0];
      g.cenario = nome || 'Sem cenário';
      g.hasMultiCenarios = g.cenarios.size > 1;
    }

    grupos.push(g);
  }

  // classificação de risco
  const maxImpacto = Math.max(...grupos.map(x => x.impacto), 1);
  grupos.forEach(g => {
    if (g.ver > 0) { g.nivelRisco = 'Crítico'; return; }
    const impNorm = Math.max(0, Math.min(1, g.impacto / maxImpacto));
    const urgNorm = Math.max(0, Math.min(1, (g.urg || 0) / 42));
    const score   = 0.65 * impNorm + 0.35 * urgNorm;
    g.nivelRisco  = (score >= 0.66) ? 'Alto' : (score >= 0.35) ? 'Médio' : 'Baixo';
  });

  return grupos.sort((a,b)=> a.codigo.localeCompare(b.codigo,'pt-BR',{numeric:true}));
}

function popularCardsEmissoes(rows){
  const container = document.getElementById('cardsEmissoes');
  if (!container) return;
  container.innerHTML = '';

  const grupos = agruparPorCodigo(rows);

  const ord = document.getElementById('ordenacao')?.value || 'default';
  const riscoPeso = { 'Crítico':4, 'Alto':3, 'Médio':2, 'Baixo':1 };
  grupos.sort((a,b)=>{
    switch (ord){
      case 'perdas-desc':   return b.percentualPP - a.percentualPP;
      case 'duration-desc': return b.meses - a.meses;
      case 'lastro-asc':    return a.lastro - b.lastro;
      case 'valor-desc':    return b.ver - a.ver;
      case 'risco-desc':    return (riscoPeso[b.nivelRisco]||0) - (riscoPeso[a.nivelRisco]||0);
      default:              return a.codigo.localeCompare(b.codigo,'pt-BR',{numeric:true});
    }
  });

  const inicio = (paginaAtual - 1) * itensPorPagina;
  const fim    = inicio + itensPorPagina;
  const page   = grupos.slice(inicio, fim);

  const tempoMedio = grupos.length ? grupos.reduce((s,p)=> s + (p.meses||0), 0)/grupos.length : 0;

  page.forEach(it=>{
    let corBorda='border-gray-300', icone='';
    if (it.nivelRisco==='Crítico'){ corBorda='border-red-500';    icone='🚨'; }
    else if (it.nivelRisco==='Alto'){ corBorda='border-orange-500'; icone='⚠️'; }
    else if (it.nivelRisco==='Médio'){ corBorda='border-yellow-500'; icone='⚡'; }
    else if (!it.temLastro || it.meses > tempoMedio*1.2){ corBorda='border-purple-500'; icone='⏰'; }

    const div = document.createElement('div');
    // >>> fundo off-white fixo
    div.className = `bg-[#fafafa] p-3 rounded-lg border-l-4 ${corBorda}`;

    const emList = [...it.emissoes].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
    const chips  = emList.slice(0,3).map(e =>
      `<span class="inline-block px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">${e}</span>`
    ).join(' ');
    const extra  = emList.length > 3 ? `<span class="text-[10px] text-gray-500">+${emList.length-3}</span>` : '';

    const chipCenario = scenarioChipHTML(it.cenario, it.hasMultiCenarios);

    div.innerHTML = `
      <div class="mb-2">
        <div class="flex justify-between items-start mb-1">
          <h5 class="font-semibold text-gray-900 text-sm">${it.codigo}</h5>
          ${icone ? `<span class="text-lg">${icone}</span>` : ''}
        </div>
        <div class="flex gap-1 mb-1">
          <span class="px-2 py-1 text-xs font-semibold rounded-full 
            ${it.nivelRisco==='Crítico'?'bg-red-100 text-red-800':
              it.nivelRisco==='Alto'?'bg-orange-100 text-orange-800':
              it.nivelRisco==='Médio'?'bg-yellow-100 text-yellow-800':
              'bg-green-100 text-green-800'}">${it.nivelRisco}</span>
          ${it.status ? `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">${it.status}</span>` : ''}
          ${chipCenario}
        </div>
      </div>

      <div class="text-[11px] text-gray-600 mb-1" title="${emList.join(', ')}">
        <span class="font-medium">${emList.length>1 ? 'Emissões:' : 'Emissão:'}</span>
        <span class="ml-1 inline-flex gap-1 align-middle">${chips} ${extra}</span>
      </div>

      <div class="text-xs font-medium text-blue-600 mb-1">EAD: ${brl(it.ead)}</div>
      <div class="text-xs font-medium text-red-600 mb-1">VeR: ${brl(it.ver)}</div>
      <div class="text-xs text-gray-600 mb-1">
        <span class="${it.lastro < 30 ? 'text-red-600 font-semibold' : 'text-gray-600'}">%Lastro: ${it.lastro.toFixed(1)}%</span> | 
        <span class="${it.meses > tempoMedio*1.2 ? 'text-orange-600 font-semibold' : 'text-gray-600'}">Duration: ${it.meses.toFixed(1)}m</span>
      </div>
      <div class="text-xs text-gray-600 mb-1">
        <span class="${it.percentualPP > 15 ? 'text-red-600 font-semibold' : 'text-gray-600'}">%PP: ${it.percentualPP.toFixed(1)}%</span> | 
        Múltiplo: ${Number(it.multiplo||0).toFixed(2)}
      </div>
      <div class="text-xs text-gray-600">Processos: ${it.qtddProcessos||0} | Tokens: ${it.totalTokens.toLocaleString('pt-BR')}</div>
    `;
    container.appendChild(div);
  });

  const total = grupos.length;
  const infoEl = document.getElementById('infoRegistros');
  if (infoEl) {
    infoEl.textContent =
      `Mostrando ${total ? inicio + 1 : 0}-${Math.min(fim, total)} de ${total} ativos`;
  }

  const totalPaginas = Math.ceil(total / itensPorPagina);
  const prev = document.getElementById('btnAnterior');
  const next = document.getElementById('btnProximo');
  if (prev){
    prev.disabled = paginaAtual===1;
    prev.className = paginaAtual===1
      ? 'px-3 py-1 bg-gray-200 text-gray-400 rounded cursor-not-allowed'
      : 'px-3 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors';
  }
  if (next){
    next.disabled = paginaAtual===totalPaginas;
    next.className = paginaAtual===totalPaginas
      ? 'px-3 py-1 bg-gray-200 text-gray-400 rounded cursor-not-allowed'
      : 'px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors';
  }
}

// paginação (expostos no escopo global p/ seus botões)
window.paginaAnterior = function(){
  if (paginaAtual>1){ paginaAtual--; popularCardsEmissoes(dadosFiltrados); }
};
window.proximaPagina = function(){
  const totalPaginas = Math.ceil(agruparPorCodigo(dadosFiltrados).length / itensPorPagina);
  if (paginaAtual < totalPaginas){ paginaAtual++; popularCardsEmissoes(dadosFiltrados); }
};

/* =========================================================
   7) Filtro/busca
   ========================================================= */
function aplicarFiltros(ev){
  if (ev && ev.preventDefault) ev.preventDefault();
  const termo  = (document.getElementById('codigo')?.value || '').trim().toLowerCase();
  const cenSel = document.getElementById('filterCenario')?.value || '';
  const emiSel = document.getElementById('filterEmissao')?.value || '';

  const FILT = BASE.filter(d=>{
    const okTermo = !termo || d.emissao.toLowerCase().includes(termo) ||
                              d.codigo.toLowerCase().includes(termo)  ||
                              d.status.toLowerCase().includes(termo);
    const okCen   = !cenSel || d.cenario === cenSel;
    const okEmi   = !emiSel || d.emissao === emiSel;
    return okTermo && okCen && okEmi;
  });

  dadosFiltrados = FILT;
  paginaAtual = 1;

  preencherOverview(FILT);
  preencherAlertas(FILT);

  destroyCharts();
  desenharGraficos(FILT);

  popularCardsEmissoes(dadosFiltrados);
}

/* =========================================================
   8) Inicialização
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  preencherFiltros(BASE);
  preencherOverview(BASE);
  preencherAlertas(BASE);
  desenharGraficos(BASE);

  dadosFiltrados = BASE.slice();
  paginaAtual = 1;
  popularCardsEmissoes(dadosFiltrados);

  const form = document.querySelector('.search-form');
  if (form) form.addEventListener('submit', aplicarFiltros);
  document.getElementById('codigo')?.addEventListener('input', aplicarFiltros);
  document.getElementById('filterCenario')?.addEventListener('change', aplicarFiltros);
  document.getElementById('filterEmissao')?.addEventListener('change', aplicarFiltros);
});
