'use strict';
const UP = '#F0525B', DN = '#2EBD85', AMB = '#F5B544', BLUE = '#6FA8FF', MUT = '#8691A1';
const app = document.getElementById('app');
let D = null;
const kcache = {};
const ui = { newsCat: 'all', divTab: 'TW', ratioTab: 'trust', ratioP: 1, ratioSide: 'buy', chipSeg: 1, chipSel: null, instSeg: 0, oiSeg: 0, instSel: null, oiSel: null, period: 'D', sel: null, offset: 0, sym: null };

// ---------- 工具 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 2) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sg = (v, d = 2) => (v == null || isNaN(v) ? '—' : (v >= 0 ? '+' : '') + fmt(v, d));
const clr = (v) => (v == null ? MUT : v >= 0 ? UP : DN);
const fname = (s) => s.replace(/[^A-Za-z0-9._-]/g, '_');
const dec = (sym) => (sym === 'TX_NIGHT' ? 0 : 2);
const md = (iso) => (iso ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}` : '—');
const weekday = (iso) => '日一二三四五六'[new Date(iso + 'T00:00:00').getDay()];
function volFmt(v, sym) {
  if (v == null) return '—';
  if (sym && /\.TWO?$/.test(sym)) return `${fmt(v / 1000, 0)} 張`;
  if (sym === 'TX_NIGHT') return `${fmt(v, 0)} 口`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 億`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(1)} 萬`;
  return fmt(v, 0);
}
function weekStart(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function thisWeek(iso) {
  if (!iso) return false;
  const t = new Date(), d = new Date(iso + 'T00:00:00');
  const diff = (d - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5;
  return diff >= 0 && diff < 7;
}
const ICON_BACK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C7CEDA" stroke-width="2.2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

function spark(vals, prev, w = 100, h = 32, color) {
  if (!vals || vals.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const all = prev != null ? [...vals, prev] : vals;
  const mn = Math.min(...all), mx = Math.max(...all), rg = mx - mn || 1;
  const y = (v) => (h - 3 - ((v - mn) / rg) * (h - 6)).toFixed(1);
  const x = (i) => ((i / (vals.length - 1)) * w).toFixed(1);
  const c = color || clr(vals[vals.length - 1] - (prev ?? vals[0]));
  const p = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ');
  const base = prev != null ? `<path d="M0 ${y(prev)} H${w}" stroke="#3A4250" stroke-dasharray="2 3" fill="none"/>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">${base}<path d="${p}" stroke="${c}" stroke-width="1.6" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
}

function header(title, sub) {
  return `<header class="hdr"><div class="row"><span class="sub">${esc(sub)}</span>${D && D.errors && D.errors.length ? `<a class="badge" href="#/settings">${D.errors.length} 個來源異常</a>` : ''}</div><div class="row" style="justify-content:space-between"><h1>${esc(title)}</h1>${refreshBtn()}</div></header>`;
}
function genDate() {
  if (!D) return '';
  const d = new Date(D.generated);
  return `${d.getMonth() + 1}月${d.getDate()}日 週${'日一二三四五六'[d.getDay()]} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 更新`;
}
const emptyBox = (t) => `<div class="card empty">${esc(t)}</div>`;

// ---------- 美股 ----------
function pageUS() {
  const u = D.us || {};
  const idx = (u.indices || []).map((q) => `
    <a class="card ic" href="#/s/${encodeURIComponent(q.sym)}">
      <span class="lbl">${esc(q.name)}</span>
      <span class="num big">${fmt(q.price)}</span>
      <span class="num" style="font-size:12px;font-weight:600;color:${clr(q.chg)}">${sg(q.chg)} (${sg(q.pct)}%)</span>
      <div style="margin-top:4px">${spark(q.spark, q.sparkPrev, 100, 34)}</div>
    </a>`).join('');
  const hot = (u.hot || []).map((q) => `
    <a class="lrow" href="#/s/${encodeURIComponent(q.sym)}">
      <div class="col" style="width:92px"><span class="num" style="font-size:15px;font-weight:600">${esc(q.sym)}</span><span class="lbl">${esc(q.name)}</span></div>
      <div style="flex:1">${spark(q.spark, q.sparkPrev, 100, 26)}</div>
      <div class="col right" style="width:84px;gap:3px"><span class="num" style="font-size:15px;font-weight:600">${fmt(q.price)}</span><span class="num pill" style="background:${clr(q.chg)}">${sg(q.pct)}%</span></div>
    </a>`).join('');
  const adr = (u.adrs || []).map((q) => `
    <a class="lrow" href="#/s/${encodeURIComponent(q.sym)}">
      <div class="col" style="flex:1"><span style="font-size:15px;font-weight:600"><span class="num">${esc(q.sym)}</span> · ${esc(q.name)}</span><span class="lbl">換算台股 <span class="num">${fmt(q.twConv)}</span> · 台股收 <span class="num">${fmt(q.twClose)}</span></span></div>
      <div class="col right" style="gap:3px"><span class="num" style="font-size:15px;font-weight:600">${fmt(q.price)} <span style="font-size:12px;color:${clr(q.chg)}">${sg(q.pct)}%</span></span><span class="num" style="font-size:12px;color:${AMB}">${q.premium >= 0 ? '溢價' : '折價'} ${sg(q.premium)}%</span></div>
    </a>`).join('');
  return header('每日晨報', `${genDate()} · 美股收盤`) + `
    <section class="sec"><div class="sech"><h2>美國四大指數</h2></div><div class="grid2">${idx || emptyBox('暫無資料')}</div></section>
    <section class="sec"><div class="sech"><h2>熱門個股</h2><span class="hint">依成交值</span></div><div class="card list">${hot || '<div class="empty">暫無資料</div>'}</div></section>
    <section class="sec"><div class="sech"><h2>台股 ADR</h2><span class="hint">USD/TWD ${fmt(u.usdtwd, 3)}</span></div><div class="card list">${adr || '<div class="empty">暫無資料</div>'}</div></section>`;
}

// ---------- 台股 ----------
function pageTW() {
  const t = D.tw || {};
  const tx = t.taiex, nt = t.night;
  const idxCard = (q, href, label, extra, when) => q ? `
    <a class="card ic" href="${href}">
      <span class="lbl">${label} · ${when || md(q.date)}</span>
      <span class="num big">${fmt(q.price, dec(q.sym))}</span>
      <span class="num" style="font-size:12px;font-weight:600;color:${clr(q.chg)}">${sg(q.chg, dec(q.sym))} (${sg(q.pct)}%)</span>
      <div style="margin-top:4px">${spark(q.spark, q.sparkPrev, 100, 38)}</div>
      <span class="small num">${extra}</span>
    </a>` : emptyBox(`${label} 暫無資料`);
  const basis = nt && nt.basis != null ? `較現貨 ${sg(nt.basis, 0)} 點 · ${nt.basis >= 0 ? '正' : '逆'}價差` : '';
  let instHtml = '<div class="empty">暫無資料</div>';
  if (t.inst && t.inst.dates.length) {
    const i = t.inst.dates.length - 1, vals = [t.inst.foreign[i], t.inst.trust[i], t.inst.dealer[i]];
    const max = Math.max(...vals.map(Math.abs), 1), tot = vals.reduce((a, b) => a + b, 0);
    instHtml = ['外資', '投信', '自營商'].map((n, k) => `
      <div class="tbl" style="grid-template-columns:56px minmax(0,1fr) 72px">
        <span style="font-size:13px;color:var(--tx2)">${n}</span>
        <div style="position:relative;height:10px;background:var(--bg);border-radius:999px"><div style="position:absolute;left:50%;top:-3px;height:16px;border-left:1px solid #3A4250"></div>
          <div style="position:absolute;top:0;height:100%;border-radius:999px;background:${clr(vals[k])};${vals[k] >= 0 ? 'left' : 'right'}:50%;width:${(Math.abs(vals[k]) / max * 50).toFixed(1)}%"></div></div>
        <span class="num" style="font-size:14px;font-weight:600;text-align:right;color:${clr(vals[k])}">${sg(vals[k], 1)}</span>
      </div>`).join('') + `<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:10px"><span class="lbl">合計 · ${md(t.inst.dates[i])}</span><span class="num" style="font-size:15px;font-weight:700;color:${clr(tot)}">${sg(tot, 1)} 億</span></div>`;
  }
  let oiHtml = '<div class="empty">暫無資料</div>';
  if (t.oi && t.oi.dates.length) {
    const i = t.oi.dates.length - 1;
    oiHtml = [['外資', 'foreign'], ['投信', 'trust'], ['自營商', 'dealer']].map(([n, k]) => {
      const v = t.oi[k][i], p = i ? t.oi[k][i - 1] : null, dv = v != null && p != null ? v - p : null;
      return `<div class="lrow" style="min-height:52px"><span style="font-size:13px;color:var(--tx2);width:64px">${n}</span><span class="lbl" style="flex:1">${v >= 0 ? '淨多單' : '淨空單'}</span>
        <div class="col right"><span class="num" style="font-size:15px;font-weight:600;color:${clr(v)}">${sg(v, 0)} 口</span><span class="num" style="font-size:11px;color:${clr(dv)}">較前日 ${sg(dv, 0)}</span></div></div>`;
    }).join('');
  }
  const R = t.ratios || {};
  const RQ = R.quotes || {};
  const list = ((R.lists || {})[`${ui.ratioTab}|${ui.ratioP}|${ui.ratioSide}`]) || [];
  const RG = 'grid-template-columns:18px minmax(0,1fr) 64px 82px 56px';
  const rows = list.map((it, i) => { const q = RQ[it.sym] || {}; return `
    <a class="tbl" href="#/s/${encodeURIComponent(it.sym)}" style="${RG};min-height:54px;border-top:1px solid var(--line)">
      <span class="num small" style="font-size:13px">${i + 1}</span>
      <div class="col" style="min-width:0"><span style="font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.name)}</span><span class="num small">${esc(it.code)}</span></div>
      <div class="col right"><span class="num" style="font-size:15px;font-weight:600;color:${AMB}">${fmt(it.ratio, 2)}%</span><span class="num small" style="color:${clr(it.lots)}">${sg(it.lots, 0)} 張</span></div>
      <div class="col right"><span class="num" style="font-size:15px;font-weight:600;color:${clr(q.chg)}">${fmt(q.price)}</span><span class="num" style="font-size:11px;color:${clr(q.chg)}">${q.chg == null ? '—' : `${q.chg >= 0 ? '▲' : '▼'}${fmt(Math.abs(q.chg))}(${fmt(Math.abs(q.pct))}%)`}</span></div>
      <div style="width:56px">${spark(q.spark, q.sparkPrev, 100, 26)}</div>
    </a>`; }).join('');
  const rlabel = ui.ratioTab === 'trust' ? '投本比' : '外本比';
  const lastD = (R.dates || []).slice(-1)[0];
  return header('台股', `${genDate()} · 台股盤前`) + `
    <section class="sec"><div class="grid2">${idxCard(tx, '#/s/%5ETWII', '加權指數', tx ? `成交量 ${volFmt(tx.vol, tx.sym)}` : '')}${idxCard(nt, '#/s/TX_NIGHT', '台指期夜盤', basis, nt ? `${md(nt.date)} 05:00 收` : '')}</div></section>
    <section class="sec"><div class="sech"><h2>三大法人買賣超 <span class="hint" style="font-weight:400">億元</span></h2><a class="more" href="#/inst">每日明細 ›</a></div><a class="card pad col" style="gap:12px" href="#/inst">${instHtml}</a></section>
    <section class="sec"><div class="sech"><h2>台指期未平倉 <span class="hint" style="font-weight:400">淨口數</span></h2><a class="more" href="#/oi">每日明細 ›</a></div><a class="card list" style="display:block" href="#/oi">${oiHtml}</a></section>
    <section class="sec"><div class="sech"><h2>籌碼排行</h2><div class="seg"><button data-act="ratio" data-v="trust" class="${ui.ratioTab === 'trust' ? 'on' : ''}">投本比</button><button data-act="ratio" data-v="foreign" class="${ui.ratioTab === 'foreign' ? 'on' : ''}">外本比</button></div></div>
      <div class="row" style="gap:4px;justify-content:space-between">
        <div class="seg">${(R.periods || [1, 3, 5, 10, 20]).map((p) => `<button data-act="ratioP" data-v="${p}" class="${ui.ratioP === p ? 'on' : ''}" style="min-width:40px">${p}日</button>`).join('')}</div>
        <div class="seg"><button data-act="ratioSide" data-v="buy" class="${ui.ratioSide === 'buy' ? 'on' : ''}" style="min-width:36px">買</button><button data-act="ratioSide" data-v="sell" class="${ui.ratioSide === 'sell' ? 'on' : ''}" style="min-width:36px">賣</button></div>
      </div>
      <div class="card" style="padding:6px 14px">
        <div class="tbl small" style="${RG};padding:6px 0"><span></span><span>股票</span><span style="text-align:right;color:${AMB}">${rlabel}(%)</span><span style="text-align:right">股價</span><span style="text-align:center">走勢</span></div>
        ${rows || '<div class="empty">暫無資料</div>'}
      </div>
      <span class="small" style="margin:0 4px">${rlabel} = 近 ${ui.ratioP} 日${ui.ratioTab === 'trust' ? '投信' : '外資'}${ui.ratioSide === 'buy' ? '買超' : '賣超'}股數 ÷ 已發行股數 · 資料日 ${md(lastD)} · 點個股看 K 線與法人明細</span></section>`;
}

// ---------- 法人、未平倉每日明細 ----------
function pageDaily(kind) {
  const isOI = kind === 'oi';
  const src = isOI ? D.tw.oi : D.tw.inst;
  const title = isOI ? '台指期未平倉' : '三大法人買賣超';
  const top = `<div class="top"><a class="back" href="#/tw" aria-label="返回台股">${ICON_BACK}</a><div class="col"><span style="font-size:18px;font-weight:700">${title}</span><span class="lbl">${isOI ? '三大法人淨口數 · 每日明細' : '集中市場 · 每日明細'}</span></div></div>`;
  if (!src || !src.dates.length) return top + `<div class="sec">${emptyBox('暫無資料')}</div>`;
  const names = isOI ? ['外資', '投信', '自營商'] : ['外資', '投信', '自營商', '合計'];
  const series = [src.foreign, src.trust, src.dealer].map((s) => s.map((v) => v ?? 0));
  if (!isOI) series.push(src.dates.map((_, i) => series[0][i] + series[1][i] + series[2][i]));
  const segKey = isOI ? 'oiSeg' : 'instSeg', selKey = isOI ? 'oiSel' : 'instSel';
  const seg = Math.min(ui[segKey], series.length - 1), S = series[seg], N = S.length;
  const d = isOI ? 0 : 1, unit = isOI ? '口' : '億';
  const sel = ui[selKey] == null || ui[selKey] >= N ? N - 1 : ui[selKey];
  const today = S[N - 1];
  const a5 = isOI ? today - S[Math.max(0, N - 6)] : S.slice(-5).reduce((a, b) => a + b, 0);
  const a20 = isOI ? today - S[0] : S.reduce((a, b) => a + b, 0);
  const sums = [[isOI ? '今日淨部位' : '今日', today], [isOI ? '5 日增減' : '近 5 日累計', a5], [isOI ? `${N} 日增減` : `近 ${N} 日累計`, a20]];
  const max = Math.max(...S.map(Math.abs), 1), W = 100 / N;
  const bars = S.map((v, i) => {
    const h = Math.abs(v) / max * 46;
    return `<rect x="${(i * W + W * 0.2).toFixed(2)}" y="${v >= 0 ? 50 - h : 50}" width="${(W * 0.6).toFixed(2)}" height="${Math.max(h, 0.4).toFixed(2)}" fill="${clr(v)}" opacity="${i === sel ? 1 : 0.55}" ${i === sel ? 'stroke="#fff" stroke-width="0.6" vector-effect="non-scaling-stroke"' : ''}/>
      <rect x="${(i * W).toFixed(2)}" y="0" width="${W.toFixed(2)}" height="100" fill="transparent" data-act="dsel" data-k="${selKey}" data-v="${i}" style="cursor:pointer"/>`;
  }).join('');
  const pv = S[sel], chg = isOI && sel > 0 ? `（較前日 ${sg(pv - S[sel - 1], 0)}）` : '';
  const cols = `44px repeat(${names.length}, minmax(0,1fr))`;
  const rows = [];
  for (let i = N - 1; i >= Math.max(0, N - 10); i--) {
    rows.push(`<div class="tbl" style="grid-template-columns:${cols};min-height:40px;border-top:1px solid var(--line)"><span class="num lbl">${md(src.dates[i])}</span>${series.map((s, k) => `<span class="num" style="text-align:right;font-size:13px;font-weight:${k === seg ? 700 : 500};color:${clr(s[i])}">${sg(s[i], d)}</span>`).join('')}</div>`);
  }
  return top + `
    <div class="sec"><div class="seg big2">${names.map((n, i) => `<button data-act="dseg" data-k="${segKey}" data-v="${i}" class="${i === seg ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="sec"><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">${sums.map(([l, v]) => `<div class="card stat" style="padding:10px 12px"><span class="small">${l}</span><b class="num" style="color:${clr(v)}">${sg(v, d)}</b></div>`).join('')}</div></div>
    <div class="sec"><div class="card pad col" style="gap:10px">
      <div class="row num" style="justify-content:space-between;font-size:12px"><b>${md(src.dates[sel])}（${weekday(src.dates[sel])}）${names[seg]}</b><b style="color:${clr(pv)}">${sg(pv, d)} ${unit}${chg}</b></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="150"><path d="M0 50 H100" stroke="#3A4250" vector-effect="non-scaling-stroke"/>${bars}</svg>
      <div class="row num small" style="justify-content:space-between"><span>${md(src.dates[0])}</span><span>點選長條看當日</span><span>${md(src.dates[N - 1])}</span></div>
    </div></div>
    <div class="sec"><div class="card" style="padding:6px 14px"><div class="tbl small" style="grid-template-columns:${cols};padding:6px 0"><span>日期</span>${names.map((n) => `<span style="text-align:right">${n}</span>`).join('')}</div>${rows.join('')}</div>
    <span class="small" style="margin:0 4px">${isOI ? '單位：口（台指期，含大台）。正值為淨多單、負值為淨空單。' : '單位：億元。外資含外資自營商；自營商含自行買賣與避險。'}</span></div>`;
}

// ---------- 資訊 ----------
function pageInfo() {
  const I = D.info || {};
  const TAG = { TW: ['台股', UP], US: ['美股', BLUE], MAC: ['總經', AMB] };
  const news = (I.news || []).filter((n) => ui.newsCat === 'all' || n.cat === ui.newsCat).slice(0, 12).map((n) => `
    <a class="col" style="gap:6px;padding:12px 0" href="${esc(n.link)}" target="_blank" rel="noopener">
      <span style="font-size:15px;font-weight:500;line-height:1.45">${esc(n.title)}</span>
      <div class="row small" style="gap:8px"><span style="color:${TAG[n.cat][1]};border:1px solid ${TAG[n.cat][1]}55;border-radius:4px;padding:0 5px">${TAG[n.cat][0]}</span><span>${esc(n.src)}</span><span class="num">${esc(n.time)}</span></div>
    </a>`).join('');
  const calls = (I.calls || []).slice(0, 10).map((c, i) => `
    <div class="lrow" style="gap:12px;min-height:60px">
      <div class="col" style="width:46px;height:46px;border-radius:10px;background:var(--bg);align-items:center;justify-content:center"><span class="num small" style="font-size:10px">${+c.date.slice(5, 7)}月</span><span class="num" style="font-size:17px;font-weight:700;color:${i === 0 ? AMB : 'inherit'}">${c.date.slice(8)}</span></div>
      <div class="col" style="flex:1;min-width:0;gap:2px"><span style="font-size:14px;font-weight:600">${esc(c.name)} <span class="num small" style="font-size:12px;font-weight:400">${esc(c.code)}</span></span><span class="lbl" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.topic)}</span></div>
      <div class="col right" style="gap:2px"><span class="num" style="font-size:12px;color:var(--tx2)">${esc(c.time)}</span><span class="small">${esc(c.mode)}</span></div>
    </div>`).join('');
  const divs = (ui.divTab === 'TW' ? I.divTW : I.divUS) || [];
  const divRows = divs.slice(0, 12).map((x) => `
    <div class="tbl" style="grid-template-columns:minmax(0,1fr) 52px 64px 52px;min-height:50px;border-top:1px solid var(--line)">
      <div class="col" style="min-width:0"><span style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.name)}</span><span class="num small">${esc(x.code)}${x.pay ? ` · 發放 ${md(x.pay)}` : ''}</span></div>
      <span class="num" style="font-size:13px;text-align:right;color:${thisWeek(x.date) ? AMB : 'inherit'}">${md(x.date)}</span>
      <span class="num" style="font-size:13px;text-align:right">${ui.divTab === 'TW' ? fmt(x.cash, 2) + ' 元' : '$' + fmt(x.cash, 2)}</span>
      <span class="num" style="font-size:13px;font-weight:600;text-align:right;color:${AMB}">${x.yield == null ? '—' : fmt(x.yield, 1) + '%'}</span>
    </div>`).join('');
  const pill = (c) => `font-size:11px;font-weight:600;color:${c};border:1px solid ${c}66;border-radius:999px;padding:1px 8px;white-space:nowrap`;
  const splits = (I.splits || []).slice(0, 15).map((s) => `
    <div class="lrow" style="min-height:56px;gap:10px">
      <div class="col" style="flex:1;min-width:0;gap:2px"><span style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span class="num">${esc(s.code)}</span>${s.name ? ` <span class="lbl" style="font-weight:400">${esc(s.name)}</span>` : ''}</span>
        <span class="num small"><span style="color:${s.market === '台股' ? UP : BLUE}">${esc(s.market || '')}</span> · ${s.pending ? esc(s.note || '日期待公告') : `${s.upcoming ? '生效日' : '已生效'} ${esc(s.date)}`}</span></div>
      <span class="num" style="font-size:15px;font-weight:700">${esc(s.ratio)}</span>
      <span style="${pill(s.pending ? BLUE : s.upcoming ? AMB : MUT)}">${s.pending ? '已通過' : s.upcoming ? '即將生效' : '已生效'}</span>
    </div>`).join('');
  const ST = { open: ['申購中', UP], soon: ['即將開始', AMB], closed: ['已截止', MUT] };
  const lots = (I.lottery || []).map((l) => `
    <div class="card pad col" style="gap:10px">
      <div class="row" style="gap:8px"><span style="font-size:15px;font-weight:600">${esc(l.name)} <span class="num small" style="font-size:12px;font-weight:400">${esc(l.code)}</span></span><span style="${pill(ST[l.status][1])}">${ST[l.status][0]}</span><span class="num" style="margin-left:auto;font-size:16px;font-weight:700;color:${clr(l.gainPct)}">${l.gainPct == null ? '—' : sg(l.gainPct, 1) + '%'}</span></div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px">
        <div class="stat"><span class="small">承銷價</span><span class="num" style="font-size:13px;font-weight:600">${fmt(l.offer)}</span></div>
        <div class="stat"><span class="small">市價</span><span class="num" style="font-size:13px;font-weight:600">${fmt(l.price)}</span></div>
        <div class="stat"><span class="small">每張價差</span><span class="num" style="font-size:13px;font-weight:600;color:${clr(l.gain)}">${sg(l.gain, 0)}</span></div>
        <div class="stat"><span class="small">中籤率</span><span class="num" style="font-size:13px;font-weight:600">${l.rate == null ? '—' : fmt(l.rate, 2) + '%'}</span></div>
      </div>
      <div class="row num small" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:8px"><span>申購 ${md(l.start)}–${md(l.end)}</span><span>抽籤 ${md(l.draw)}</span><span>撥券 ${md(l.deliver)}</span></div>
    </div>`).join('');
  const cats = [['all', '全部'], ['TW', '台股'], ['US', '美股'], ['MAC', '總經']];
  return header('資訊', genDate()) + `
    <section class="sec"><div class="sech"><h2>每日財經新聞</h2></div>
      <div class="chips">${cats.map(([k, n]) => `<button data-act="news" data-v="${k}" class="${ui.newsCat === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="card list">${news || '<div class="empty">暫無新聞</div>'}</div></section>
    <section class="sec"><div class="sech"><h2>近期法說會</h2><span class="hint">未來 2 週</span></div><div class="card list">${calls || '<div class="empty">暫無資料</div>'}</div></section>
    <section class="sec"><div class="sech"><h2>配息資訊</h2><div class="seg"><button data-act="div" data-v="TW" class="${ui.divTab === 'TW' ? 'on' : ''}">台股</button><button data-act="div" data-v="US" class="${ui.divTab === 'US' ? 'on' : ''}">美股</button></div></div>
      <div class="card" style="padding:6px 14px"><div class="tbl small" style="grid-template-columns:minmax(0,1fr) 52px 64px 52px;padding:6px 0"><span>股票</span><span style="text-align:right">除息日</span><span style="text-align:right">${ui.divTab === 'TW' ? '現金股利' : '每股配息'}</span><span style="text-align:right">殖利率</span></div>${divRows || '<div class="empty">暫無資料</div>'}</div>
      <span class="small" style="margin:0 4px">橘色除息日 = 7 天內除息${ui.divTab === 'US' ? ' · 美股為追蹤清單' : ' · 殖利率以最近收盤價計'}</span></section>
    <section class="sec"><div class="sech"><h2>股票分割</h2><span class="hint">近 30 天與未來 90 天</span></div><div class="card list">${splits || '<div class="empty">近期沒有分割</div>'}</div></section>
    <section class="sec"><div class="sech"><h2>申購抽籤</h2><span class="hint">依價差報酬排序</span></div>${lots || emptyBox('近期沒有公開申購')}
      <span class="small" style="margin:0 4px">每張價差 =（市價 − 承銷價）× 申購股數 · 未扣手續費</span></section>`;
}

// ---------- 設定 ----------
function pageSettings() {
  const errs = (D.errors || []).map((e) => `<div style="padding:10px 0;font-size:12px;color:var(--mut);word-break:break-all">${esc(e)}</div>`).join('');
  return header('設定', genDate()) + `
    <section class="sec"><div class="card pad col" style="gap:8px">
      <span style="font-size:14px">資料更新時間：<b class="num">${esc(D.generated)}</b></span>
      <span class="lbl">每天台北時間 07:00 自動更新。報價為收盤資料，非即時。</span>
      <button data-act="reload" style="margin-top:6px;min-height:44px;border:0;border-radius:10px;background:var(--amb);color:#141413;font-weight:700;font-size:14px;cursor:pointer">重新載入</button>
    </div></section>
    <section class="sec"><div class="sech"><h2>更新鈕設定</h2><span class="hint">${getToken() ? '已設定' : '尚未設定'}</span></div>
      <div class="card pad col" style="gap:10px">
        <span class="lbl" style="line-height:1.6">按右上角的更新鈕，會請 GitHub 立刻重抓資料，約 5～8 分鐘後自動顯示新資料。需要先設定一次 GitHub 權杖（只存在這支手機裡，不會上傳）。</span>
        <ol class="lbl" style="margin:0;padding-left:20px;line-height:1.7">
          <li>打開 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="color:var(--amb)">GitHub 建立權杖頁面</a></li>
          <li>Token name 填「晨報更新」，Expiration 選 1 年（或自訂）</li>
          <li>Repository access 選「Only select repositories」→ 勾 ${esc(REPO.name)}</li>
          <li>Permissions → Repository permissions →「Actions」選「Read and write」</li>
          <li>按「Generate token」，複製 github_pat_ 開頭的權杖貼到下面</li>
        </ol>
        <input id="tok" type="password" autocomplete="off" placeholder="${getToken() ? '已儲存（貼上新的可覆蓋）' : 'github_pat_…'}" style="min-height:44px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--tx);padding:0 12px;font-size:14px">
        <div class="row" style="gap:8px">
          <button data-act="tok-save" style="flex:1;min-height:44px;border:0;border-radius:10px;background:var(--amb);color:#141413;font-weight:700;font-size:14px;cursor:pointer">儲存</button>
          <button data-act="tok-clear" style="flex:1;min-height:44px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--mut);font-weight:600;font-size:14px;cursor:pointer">清除權杖</button>
        </div>
      </div></section>
    <section class="sec"><div class="sech"><h2>資料來源狀態</h2><span class="hint">${(D.errors || []).length ? `${D.errors.length} 個異常` : '全部正常'}</span></div>
      <div class="card list">${errs || '<div class="empty">上次更新所有來源都成功</div>'}</div></section>
    <section class="sec"><span class="small" style="margin:0 4px;line-height:1.6">資料來源：證交所、期交所、櫃買中心、公開資訊觀測站公開資料；美股與 K 線來自 Yahoo Finance；新聞來自 RSS。僅供參考，不構成投資建議。</span></section>`;
}

// ---------- 個股／指數詳情 ----------
function findQuote(sym) {
  if (!D) return null;
  const u = D.us || {}, t = D.tw || {};
  const pools = [u.indices, u.hot, u.adrs, [t.taiex, t.night]];
  for (const p of pools) for (const q of p || []) if (q && q.sym === sym) return q;
  const R = t.ratios || {};
  if (R.names && R.names[sym]) return { sym, name: R.names[sym], ...((R.quotes || {})[sym] || {}) };
  return null;
}
function aggregate(daily, p) {
  if (p === 'D') return daily.map((r) => ({ d: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5], label: r[0].replace(/-/g, '/') }));
  const key = (iso) => (p === 'W' ? weekStart(iso) : p === 'M' ? iso.slice(0, 7) : iso.slice(0, 4));
  const out = [];
  for (const r of daily) {
    const k = key(r[0]), last = out[out.length - 1];
    if (last && last.k === k) { last.h = Math.max(last.h, r[2]); last.l = Math.min(last.l, r[3]); last.c = r[4]; last.v += r[5]; last.d = r[0]; }
    else out.push({ k, d: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] });
  }
  out.forEach((x) => { x.label = p === 'W' ? `${md(x.k)} 當週` : p === 'M' ? `${x.k.slice(0, 4)} 年 ${+x.k.slice(5)} 月` : `${x.k} 年`; });
  return out;
}
const SHOW = { D: 60, W: 52, M: 48, Y: 20 };

function kChart(K, sym) {
  const n = Math.min(SHOW[ui.period], K.length);
  const maxOff = Math.max(0, K.length - n);
  ui.offset = Math.max(0, Math.min(ui.offset, maxOff));
  const end = K.length - ui.offset, view = K.slice(end - n, end);
  if (!view.length) return { svg: '', info: '' };
  const sel = ui.sel == null || ui.sel >= view.length ? view.length - 1 : ui.sel;
  const hi = Math.max(...view.map((x) => x.h)), lo = Math.min(...view.map((x) => x.l)), sp = hi - lo || 1;
  const hiIdx = view.findIndex((x) => x.h === hi);
  const y = (v) => 12 + ((hi - v) / sp) * 82;
  const W = 100 / n, bw = W * 0.64, dd = dec(sym);
  let s = `<line x1="0" x2="100" y1="12" y2="12" stroke="${AMB}" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`;
  view.forEach((x, i) => {
    const c = x.c >= x.o ? UP : DN, cx = i * W + W / 2;
    s += `<line x1="${cx.toFixed(2)}" x2="${cx.toFixed(2)}" y1="${y(x.h).toFixed(2)}" y2="${y(x.l).toFixed(2)}" stroke="${c}" vector-effect="non-scaling-stroke"/>`;
    s += `<rect x="${(cx - bw / 2).toFixed(2)}" y="${y(Math.max(x.o, x.c)).toFixed(2)}" width="${bw.toFixed(2)}" height="${Math.max(0.6, Math.abs(y(x.o) - y(x.c))).toFixed(2)}" fill="${c}" ${i === sel ? 'stroke="#fff" stroke-width="1.2" vector-effect="non-scaling-stroke"' : ''}/>`;
  });
  const sx = sel * W + W / 2;
  s += `<line x1="${sx.toFixed(2)}" x2="${sx.toFixed(2)}" y1="0" y2="100" stroke="${MUT}" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>`;
  const tagSide = hiIdx > n / 2 ? 'left:0' : 'right:0';
  const S = view[sel], prevC = sel > 0 ? view[sel - 1].c : (K[end - n - 1] || S).c, pct = (S.c / prevC - 1) * 100;
  const info = `
    <div class="card" style="background:var(--bg);padding:8px 10px;display:flex;flex-direction:column;gap:6px">
      <div class="row num" style="justify-content:space-between;font-size:12px"><b>${esc(S.label)}</b><b style="color:${clr(pct)}">${sg(pct)}%</b></div>
      <div class="num" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));font-size:11px;color:var(--mut)">
        <span>開<br><b style="color:var(--tx);font-weight:600">${fmt(S.o, dd)}</b></span><span>高<br><b style="color:var(--tx);font-weight:600">${fmt(S.h, dd)}</b></span><span>低<br><b style="color:var(--tx);font-weight:600">${fmt(S.l, dd)}</b></span><span>收<br><b style="color:var(--tx);font-weight:600">${fmt(S.c, dd)}</b></span><span>量<br><b style="color:var(--tx);font-weight:600">${volFmt(S.v, sym)}</b></span>
      </div></div>`;
  const svg = `<div class="kbox" id="kbox" data-n="${n}">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="190">${s}</svg>
      <span class="num" style="position:absolute;top:calc(12% - 18px);${tagSide};font-size:10px;font-weight:600;color:#141413;background:${AMB};border-radius:4px;padding:1px 5px;white-space:nowrap">前高 ${fmt(hi, dd)} · ${esc(view[hiIdx].label)}</span>
    </div>
    <div class="row num small" style="justify-content:space-between"><span>${esc(view[0].label)}</span><span>${ui.offset ? '往左拖回最新 ←' : '→ 往右拖看更早'}</span><span>${esc(view[view.length - 1].label)}</span></div>`;
  return { svg, info };
}

function intradayChart(k, sym) {
  const pts = (k.intraday && k.intraday.pts) || [];
  if (pts.length < 2) return `<div class="empty">${sym === 'TX_NIGHT' ? '夜盤只提供每日收盤資料，沒有分時走勢' : '沒有盤中資料'}</div>`;
  const prev = k.intraday.prev, vals = pts.map((p) => p[1]);
  const mn = Math.min(...vals, prev), mx = Math.max(...vals, prev), pad = (mx - mn) * 0.08 || 1, lo = mn - pad, hi = mx + pad;
  const y = (v) => ((hi - v) / (hi - lo)) * 100;
  const x = (i) => (i / (pts.length - 1)) * 100;
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
  const c = clr(vals[vals.length - 1] - prev), dd = dec(sym);
  const ticks = [0.2, 0.4, 0.6, 0.8].map((f) => hi - f * (hi - lo));
  const labels = ticks.filter((v) => Math.abs(y(v) - y(prev)) > 9).map((v) => `<span class="num" style="position:absolute;right:0;top:calc(${y(v).toFixed(1)}% - 7px);font-size:10px;color:${MUT}">${fmt(v, dd)}</span>`).join('')
    + `<span class="num" style="position:absolute;right:0;top:calc(${y(prev).toFixed(1)}% - 7px);font-size:10px;color:var(--tx2);background:var(--card);padding-left:2px">${fmt(prev, dd)}</span>`;
  const grid = [20, 40, 60, 80].map((t) => `<line x1="0" x2="100" y1="${t}" y2="${t}" stroke="#1F242D" vector-effect="non-scaling-stroke"/>`).join('');
  const mid = pts[Math.floor(pts.length / 2)][0];
  return `<div class="row" style="gap:6px;align-items:stretch">
      <div style="position:relative;width:58px;height:130px">${labels}</div>
      <div style="flex:1;min-width:0"><svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="130" role="img" aria-label="當日走勢">
        <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
        ${grid}<path d="${line} L100 100 L0 100 Z" fill="url(#ga)"/>
        <line x1="0" x2="100" y1="${y(prev)}" y2="${y(prev)}" stroke="#5B6474" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>
        <path d="${line}" stroke="${c}" stroke-width="1.8" fill="none" vector-effect="non-scaling-stroke"/></svg></div>
    </div>
    <div class="row num small" style="justify-content:space-between;margin-left:64px"><span>${pts[0][0]}</span><span>${mid}</span><span>${pts[pts.length - 1][0]}</span></div>`;
}

function pageDetail(sym) {
  const k = kcache[sym];
  const q = findQuote(sym) || {};
  const isTW = /\.TWO?$/.test(sym) || sym === '^TWII' || sym === 'TX_NIGHT';
  const backTo = isTW ? '#/tw' : '#/us';
  const name = q.name || (k && k.name) || sym;
  const top = `<div class="top"><a class="back" href="${backTo}" aria-label="返回">${ICON_BACK}</a><div class="col"><span style="font-size:18px;font-weight:700">${esc(name)}</span><span class="lbl num">${esc(sym === 'TX_NIGHT' ? `台指期 ${q.contract || ''} 盤後` : sym)}</span></div></div>`;
  if (!k) return top + `<div class="sec">${emptyBox(k === null ? '這檔沒有歷史資料' : '載入中…')}</div>`;
  const rows = k.daily, last = rows[rows.length - 1], prev = rows[rows.length - 2] || last, dd = dec(sym);
  const useQ = sym === 'TX_NIGHT' && q.prev != null;
  const price = last[4], chg = useQ ? q.chg : price - prev[4], pct = useQ ? q.pct : (price / prev[4] - 1) * 100;
  const sw = sym === '^TWII' || sym === 'TX_NIGHT' ? `<div class="sec"><div class="seg big2"><a href="#/s/%5ETWII" class="${sym === '^TWII' ? 'on' : ''}" style="flex:1;display:flex;align-items:center;justify-content:center;min-height:40px;border-radius:9px;font-size:14px;font-weight:600;${sym === '^TWII' ? `background:#262C36;color:${AMB}` : 'color:var(--mut)'}">加權指數</a><a href="#/s/TX_NIGHT" style="flex:1;display:flex;align-items:center;justify-content:center;min-height:40px;border-radius:9px;font-size:14px;font-weight:600;${sym === 'TX_NIGHT' ? `background:#262C36;color:${AMB}` : 'color:var(--mut)'}">台指期夜盤</a></div></div>` : '';
  const K = aggregate(rows, ui.period);
  const kc = kChart(K, sym);
  const vols = rows.map((r) => r[5]);
  const v0 = vols[vols.length - 1], v5 = avg(vols.slice(-5)), v10 = avg(vols.slice(-10));
  const last10 = rows.slice(-10), vmax = Math.max(...last10.map((r) => r[5]), v5, v10, 1);
  const vbars = last10.map((r, i) => `<div style="flex:1;height:${(r[5] / vmax * 100).toFixed(1)}%;border-radius:3px 3px 0 0;background:${i === last10.length - 1 ? clr(r[4] - r[1]) : r[4] >= r[1] ? UP + '99' : DN + '99'}"></div>`).join('');
  const cutoff = new Date(new Date(last[0]).getTime() - 365 * 864e5).toISOString().slice(0, 10);
  const yr = rows.filter((r) => r[0] >= cutoff);
  const hiR = yr.reduce((a, b) => (b[2] > a[2] ? b : a)), loR = yr.reduce((a, b) => (b[3] < a[3] ? b : a));
  const ret = (price / yr[0][4] - 1) * 100, pos = ((price - loR[3]) / (hiR[2] - loR[3] || 1)) * 100;
  const chips = D.tw && D.tw.ratios && D.tw.ratios.chips && D.tw.ratios.chips[sym];
  const P = { D: '日K', W: '週K', M: '月K', Y: '年K' };
  return top + sw + `
    <div style="padding:6px 20px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><span class="num" style="font-size:36px;font-weight:700;color:${clr(chg)}">${fmt(price, dd)}</span><span class="num" style="font-size:15px;font-weight:600;color:${clr(chg)}">${sg(chg, dd)} (${sg(pct)}%)</span><span class="small num">${esc(last[0])}</span></div>
    <div class="sec"><div class="card pad col" style="gap:8px"><div class="row" style="justify-content:space-between"><b style="font-size:14px">當日走勢</b><span class="num lbl">${sym === 'TX_NIGHT' ? `日盤收${q.refDate ? ' ' + md(q.refDate) : ''}` : '昨收'} ${fmt(k.intraday && k.intraday.prev, dd)}</span></div>${intradayChart(k, sym)}</div></div>
    <div class="sec"><div class="card pad col" style="gap:10px">
      <div class="row" style="justify-content:space-between"><b style="font-size:14px">K 線</b><div class="seg" style="background:var(--bg)">${Object.keys(P).map((p) => `<button data-act="period" data-v="${p}" class="${ui.period === p ? 'on' : ''}">${P[p]}</button>`).join('')}</div></div>
      <div id="kinfo">${kc.info}</div><div id="kwrap">${kc.svg}</div>
    </div></div>
    <div class="sec"><div class="card pad col" style="gap:10px"><b style="font-size:14px">${sym === 'TX_NIGHT' ? '成交口數' : '成交量'}</b>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
        <div class="stat"><span class="small">今日</span><b class="num">${volFmt(v0, sym)}</b><span class="num" style="font-size:11px;color:${v0 >= v5 ? UP : DN}">量比 ${fmt(v0 / (v5 || 1), 2)}</span></div>
        <div class="stat"><span class="small">5 日均量</span><b class="num">${volFmt(v5, sym)}</b><span class="num" style="font-size:11px;color:${AMB}">— MA5</span></div>
        <div class="stat"><span class="small">10 日均量</span><b class="num">${volFmt(v10, sym)}</b><span class="num" style="font-size:11px;color:${BLUE}">— MA10</span></div>
      </div>
      <div style="position:relative;height:80px;display:flex;align-items:flex-end;gap:6px">${vbars}
        <div style="position:absolute;left:0;right:0;bottom:${(v5 / vmax * 100).toFixed(1)}%;border-top:1.5px dashed ${AMB}"></div>
        <div style="position:absolute;left:0;right:0;bottom:${(v10 / vmax * 100).toFixed(1)}%;border-top:1.5px dashed ${BLUE}"></div></div>
      <span class="small">近 10 個交易日 · 最右為最新</span></div></div>
    ${chips ? chipsCard(sym, chips) : ''}
    <div class="sec"><div class="card pad col" style="gap:12px">
      <div class="row" style="justify-content:space-between;align-items:baseline"><b style="font-size:14px">近一年高低</b><span class="lbl">一年報酬 <b class="num" style="color:${clr(ret)};font-size:15px">${sg(ret, 1)}%</b></span></div>
      <div style="position:relative;height:8px;border-radius:999px;background:linear-gradient(90deg,${DN},#3A4250,${UP})"><div style="position:absolute;left:calc(${pos.toFixed(1)}% - 2px);top:-5px;width:4px;height:18px;border-radius:2px;background:#fff"></div></div>
      <div class="row" style="justify-content:space-between">
        <div class="stat"><span class="small">一年最低 · ${md(loR[0])}</span><b class="num" style="color:${DN}">${fmt(loR[3], dd)}</b><span class="num small">距低點 ${sg((price / loR[3] - 1) * 100, 1)}%</span></div>
        <div class="stat right"><span class="small">一年最高 · ${md(hiR[0])}</span><b class="num" style="color:${UP}">${fmt(hiR[2], dd)}</b><span class="num small">距高點 ${sg((price / hiR[2] - 1) * 100, 1)}%</span></div>
      </div></div></div>`;
}
function chipsCard(sym, c) {
  const dates = (D.tw.ratios.dates || []), N = dates.length;
  const names = ['外資', '投信', '自營商'], keys = ['foreign', 'trust', 'dealer'];
  const seg = ui.chipSeg, S = c[keys[seg]] || [];
  const cum = S.reduce((a, b) => a + b, 0), today = S[N - 1];
  const max = Math.max(...S.map(Math.abs), 1), W = 100 / N;
  const sel = ui.chipSel == null || ui.chipSel >= N ? N - 1 : ui.chipSel;
  const bars = S.map((v, i) => { const h = Math.abs(v) / max * 46; return `<rect x="${(i * W + W * 0.18).toFixed(2)}" y="${v >= 0 ? 50 - h : 50}" width="${(W * 0.64).toFixed(2)}" height="${Math.max(h, 0.4).toFixed(2)}" fill="${clr(v)}" opacity="${i === sel ? 1 : 0.6}"/><rect x="${(i * W).toFixed(2)}" y="0" width="${W.toFixed(2)}" height="100" fill="transparent" data-act="chipSel" data-v="${i}" style="cursor:pointer"/>`; }).join('');
  const sh = c.shares ? c.shares / 1000 : null;
  const ratio = (arr, p) => (sh ? arr.slice(-p).reduce((a, b) => a + b, 0) / sh * 100 : null);
  const rows = [];
  for (let i = N - 1; i >= Math.max(0, N - 10); i--) {
    const v = keys.map((k) => c[k][i]), tot = v[0] + v[1] + v[2];
    rows.push(`<div class="tbl" style="grid-template-columns:44px repeat(4,minmax(0,1fr));min-height:40px;border-top:1px solid var(--line)"><span class="num lbl">${md(dates[i])}</span>${[...v, tot].map((x, k) => `<span class="num" style="text-align:right;font-size:13px;font-weight:${k === seg ? 700 : 500};color:${clr(x)}">${fmt(x, 0)}</span>`).join('')}</div>`);
  }
  return `<div class="sec"><div class="card pad col" style="gap:10px">
    <div class="row" style="justify-content:space-between"><b style="font-size:14px">三大法人</b><div class="seg" style="background:var(--bg)">${names.map((n, i) => `<button data-act="chipSeg" data-v="${i}" class="${i === seg ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
      <div class="stat"><span class="small">近 ${N} 日累計</span><b class="num" style="color:${clr(cum)}">${sg(cum, 0)} 張</b></div>
      <div class="stat"><span class="small">${md(dates[sel])} 買賣超</span><b class="num" style="color:${clr(S[sel])}">${sg(S[sel], 0)} 張</b></div>
      <div class="stat"><span class="small">${seg === 1 ? '投本比' : seg === 0 ? '外本比' : '佔股本'} 1/5/20日</span><b class="num" style="font-size:12px;color:${AMB}">${[1, 5, 20].map((p) => (ratio(S, p) == null ? '—' : fmt(ratio(S, p), 2))).join(' / ')}%</b></div>
    </div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="110"><path d="M0 50 H100" stroke="#3A4250" vector-effect="non-scaling-stroke"/>${bars}</svg>
    <div class="row num small" style="justify-content:space-between"><span>${md(dates[0])}</span><span>點長條看當日</span><span>${md(dates[N - 1])}</span></div>
    <b style="font-size:13px;margin-top:4px">近 10 日三大法人買賣超明細（張）</b>
    <div><div class="tbl small" style="grid-template-columns:44px repeat(4,minmax(0,1fr));padding:4px 0"><span>日期</span><span style="text-align:right">外資</span><span style="text-align:right">投信</span><span style="text-align:right">自營商</span><span style="text-align:right">合計</span></div>${rows.join('')}</div>
  </div></div>`;
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function redrawK() {
  const sym = ui.sym, k = kcache[sym];
  if (!k) return;
  const kc = kChart(aggregate(k.daily, ui.period), sym);
  document.getElementById('kinfo').innerHTML = kc.info;
  document.getElementById('kwrap').innerHTML = kc.svg;
}

// K 線：點選看資料、左右拖曳看更早
let drag = null;
app.addEventListener('pointerdown', (e) => {
  const box = e.target.closest('#kbox');
  if (!box) return;
  drag = { x: e.clientX, off: ui.offset, moved: false, w: box.getBoundingClientRect().width, n: +box.dataset.n, left: box.getBoundingClientRect().left };
  box.setPointerCapture(e.pointerId);
});
app.addEventListener('pointermove', (e) => {
  if (!drag) {
    const box = e.target.closest && e.target.closest('#kbox');
    if (box && e.pointerType === 'mouse') pickCandle(e.clientX, box.getBoundingClientRect(), +box.dataset.n);
    return;
  }
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 6) drag.moved = true;
  if (drag.moved) {
    const shift = Math.round(dx / (drag.w / drag.n));
    const off = Math.max(0, drag.off + shift);
    if (off !== ui.offset) { ui.offset = off; redrawK(); }
  }
});
app.addEventListener('pointerup', (e) => {
  if (!drag) return;
  if (!drag.moved) pickCandle(e.clientX, { left: drag.left, width: drag.w }, drag.n);
  drag = null;
});
function pickCandle(clientX, rect, n) {
  const i = Math.max(0, Math.min(n - 1, Math.floor(((clientX - rect.left) / rect.width) * n)));
  if (i !== ui.sel) { ui.sel = i; redrawK(); }
}

// ---------- 更新鈕：觸發 GitHub Actions 重抓資料 ----------
const REPO = (() => {
  const owner = location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : 'andy98765272-jpg';
  const name = location.pathname.split('/').filter(Boolean)[0] || 'morning-report';
  return { owner, name };
})();
const API = `https://api.github.com/repos/${REPO.owner}/${REPO.name}/actions/workflows/daily.yml`;
const upd = { state: 'idle', msg: '', url: '' };
function getToken() { try { return localStorage.getItem('mr_token') || ''; } catch { return ''; } }
function setToken(v) { try { v ? localStorage.setItem('mr_token', v) : localStorage.removeItem('mr_token'); } catch {} }
function refreshBtn() {
  const busy = upd.state !== 'idle';
  return `<button data-act="refresh" aria-label="更新資料" ${busy ? 'disabled' : ''} style="display:flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid ${busy ? '#5A4A26' : 'var(--line)'};background:var(--card);color:${busy ? AMB : 'var(--tx2)'};font-size:13px;font-weight:600;cursor:pointer">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true" ${busy ? 'style="animation:spin 1s linear infinite"' : ''}><path d="M20 12a8 8 0 1 1-2.3-5.6 M20 4v5h-5"/></svg>${busy ? '更新中' : '更新'}</button>`;
}
let toastTimer;
function toast(text, kind = 'info', sticky = false) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.style.cssText = `position:fixed;left:50%;transform:translateX(-50%);top:calc(12px + env(safe-area-inset-top));z-index:20;max-width:min(92vw,480px);padding:10px 16px;border-radius:12px;font-size:13px;line-height:1.5;box-shadow:0 6px 24px #0008;background:${kind === 'err' ? '#3A1C20' : '#262C36'};color:${kind === 'err' ? '#FFB4B8' : kind === 'ok' ? '#B7F0D6' : 'var(--tx)'};border:1px solid ${kind === 'err' ? '#6B2A30' : 'var(--line)'}`;
  el.innerHTML = text;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => el.remove(), 4000);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function setUpd(state, msg) { upd.state = state; upd.msg = msg; document.querySelectorAll('[data-act=refresh]').forEach((b) => { b.outerHTML = refreshBtn(); }); if (msg) toast(msg, 'info', state !== 'idle'); }
async function gh(path, opt = {}) {
  return fetch(API + path, { ...opt, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${getToken()}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opt.headers || {}) } });
}
async function startUpdate() {
  if (upd.state !== 'idle') return;
  if (!getToken()) { toast('第一次使用要先設定權杖，已帶你到設定頁', 'info'); location.hash = '#/settings'; return; }
  const before = D && D.generated, t0 = Date.now();
  setUpd('dispatch', '正在請 GitHub 開始更新…');
  try {
    const r = await gh('/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
    if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error('權杖無效、過期或權限不足，請到設定頁重新設定（Actions 需要 Read and write）');
    if (!r.ok) throw new Error(`GitHub 回應 ${r.status}`);
    let run = null;
    for (let i = 0; i < 80; i++) {
      await sleep(i < 4 ? 5000 : 15000);
      const j = await (await gh('/runs?event=workflow_dispatch&per_page=1')).json();
      run = (j.workflow_runs || [])[0];
      if (!run || new Date(run.created_at).getTime() < t0 - 60000) { setUpd('wait', '等待 GitHub 排程…'); continue; }
      const min = Math.floor((Date.now() - t0) / 60000);
      if (run.status !== 'completed') { setUpd('run', `抓資料中（已 ${min} 分鐘，通常 5 分鐘左右）`); continue; }
      if (run.conclusion !== 'success') throw new Error(`這次抓資料失敗，<a href="${run.html_url}" target="_blank" rel="noopener" style="color:${AMB}">看詳細</a>`);
      break;
    }
    if (!run || run.status !== 'completed') throw new Error('等太久了，請稍後按設定頁的「重新載入」');
    setUpd('deploy', '資料已抓好，等網頁發布（約 1 分鐘）…');
    for (let i = 0; i < 24; i++) {
      await sleep(10000);
      try {
        const nd = await (await fetch(`data/latest.json?t=${Date.now()}`, { cache: 'no-store' })).json();
        if (nd.generated !== before) { D = nd; for (const k in kcache) delete kcache[k]; setUpd('idle', ''); render(false); toast(`已更新到 ${esc(nd.generated.slice(5, 16).replace('T', ' '))}`, 'ok'); return; }
      } catch {}
    }
    throw new Error('網頁發布比較慢，過幾分鐘按「重新載入」就會看到新資料');
  } catch (e) {
    setUpd('idle', '');
    toast(e.message || String(e), 'err', true);
    setTimeout(() => { const el = document.getElementById('toast'); el && el.addEventListener('click', () => el.remove(), { once: true }); }, 0);
  }
}

// ---------- 事件、路由 ----------
app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, v = el.dataset.v;
  if (a === 'ratio') ui.ratioTab = v;
  else if (a === 'ratioP') ui.ratioP = +v;
  else if (a === 'ratioSide') ui.ratioSide = v;
  else if (a === 'chipSeg') { ui.chipSeg = +v; ui.chipSel = null; }
  else if (a === 'chipSel') ui.chipSel = +v;
  else if (a === 'news') ui.newsCat = v;
  else if (a === 'div') ui.divTab = v;
  else if (a === 'period') { ui.period = v; ui.sel = null; ui.offset = 0; }
  else if (a === 'dseg') { ui[el.dataset.k] = +v; ui[el.dataset.k.replace('Seg', 'Sel')] = null; }
  else if (a === 'dsel') ui[el.dataset.k] = +v;
  else if (a === 'reload') { load(true); return; }
  else if (a === 'refresh') { startUpdate(); return; }
  else if (a === 'tok-save') { const v = document.getElementById('tok').value.trim(); if (v) { setToken(v); toast('權杖已儲存，可以按更新鈕了', 'ok'); } }
  else if (a === 'tok-clear') { setToken(''); toast('已清除權杖', 'ok'); }
  render(false);
});

async function loadK(sym) {
  if (sym in kcache) return;
  try {
    const r = await fetch(`data/k/${fname(sym)}.json?v=${encodeURIComponent(D.generated)}`);
    kcache[sym] = r.ok ? await r.json() : null;
  } catch { kcache[sym] = null; }
}

async function render(scrollTop = true) {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'us';
  const [page, ...rest] = h.split('/');
  const tab = ['us', 'tw', 'info', 'settings'].includes(page) ? page : page === 's' && (/\.TWO?$/.test(rest.join('/')) || ['^TWII', 'TX_NIGHT'].includes(rest.join('/'))) ? 'tw' : page === 's' ? 'us' : 'tw';
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  if (!D) return;
  let html;
  if (page === 's') {
    const sym = rest.join('/');
    if (ui.sym !== sym) { ui.sym = sym; ui.sel = null; ui.offset = 0; ui.chipSel = null; }
    if (!(sym in kcache)) { app.innerHTML = pageDetail(sym); await loadK(sym); }
    html = pageDetail(sym);
  } else if (page === 'tw') html = pageTW();
  else if (page === 'info') html = pageInfo();
  else if (page === 'settings') html = pageSettings();
  else if (page === 'inst') html = pageDaily('inst');
  else if (page === 'oi') html = pageDaily('oi');
  else html = pageUS();
  app.innerHTML = html;
  if (scrollTop) window.scrollTo(0, 0);
}

async function load(force) {
  try {
    const r = await fetch(`data/latest.json?t=${force ? Date.now() : Math.floor(Date.now() / 6e5)}`);
    D = await r.json();
    for (const k in kcache) delete kcache[k];
  } catch (e) {
    app.innerHTML = `<div class="empty" style="padding-top:30vh">還沒有資料。<br>請先到 GitHub 的 Actions 手動執行一次「每日晨報資料更新」。</div>`;
    return;
  }
  render();
}

window.addEventListener('hashchange', () => render());
load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
