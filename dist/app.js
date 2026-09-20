const app = document.querySelector('#app');
const STORAGE_KEY = 'decide.tarot.logs.v1';
const SETTINGS_KEY = 'decide.tarot.settings.v1';

const MAJOR = [
  ['愚者','自由','無計画'],['魔術師','始める力','準備不足'],['女教皇','直感','閉じこもる'],['女帝','育てる','過保護'],
  ['皇帝','秩序','頑固さ'],['教皇','信頼できる型','思い込み'],['恋人','納得できる選択','迷い'],['戦車','前進','空回り'],
  ['力','しなやかな強さ','自信の揺れ'],['隠者','内省','孤立'],['運命の輪','転機','停滞'],['正義','公平な判断','偏り'],
  ['吊るされた男','視点の転換','我慢しすぎる'],['死神','区切り','手放せない'],['節制','調整','バランスの乱れ'],['悪魔','執着に気づく','依存'],
  ['塔','前提が崩れる','変化への抵抗'],['星','希望','期待しすぎる'],['月','曖昧さ','不安に飲まれる'],['太陽','明快さ','楽観しすぎる'],
  ['審判','再決断','過去への固執'],['世界','完成','あと一歩']
].map((c, i) => ({ id:`M${i}`, number: i === 0 ? '0' : roman(i), name:c[0], upright:c[1], reversed:c[2], image:`./assets/rider-waite/ar${String(i).padStart(2,'0')}.jpg` }));

const SUITS = [
  {name:'ワンド', code:'wa', theme:'行動と情熱'},
  {name:'カップ', code:'cu', theme:'感情と関係'},
  {name:'ソード', code:'sw', theme:'思考と決断'},
  {name:'ペンタクル', code:'pe', theme:'現実と積み重ね'}
];
const RANKS = [
  ['エース','始まり','機会を見送る'],['2','選択と均衡','迷いが長引く'],['3','展開と協力','足並みが揃わない'],['4','安定と土台','守りに入りすぎる'],
  ['5','摩擦と課題','争いを避けすぎる'],['6','前進と調和','過去に留まる'],['7','見極めと粘り','疑いすぎる'],['8','集中と加速','急ぎすぎる'],
  ['9','成熟と備え','抱え込みすぎる'],['10','到達と責任','背負いすぎる'],['ペイジ','好奇心と知らせ','未熟な見切り発車'],['ナイト','推進力','極端に走る'],
  ['クイーン','受容と判断','内向きになる'],['キング','統率と確信','コントロールしすぎる']
];
const MINOR = SUITS.flatMap((s, si) => RANKS.map((r, ri) => ({
  id:`m${si}-${ri}`, number:String(ri + 1).padStart(2,'0'), name:`${s.name}の${r[0]}`, upright:`${s.theme}における${r[1]}`,
  reversed:`${s.theme}における${r[2]}`, image:`./assets/rider-waite/${s.code}${String(ri + 1).padStart(2,'0')}.jpg`
})));
const DECK = [...MAJOR, ...MINOR];

const savedSettings = load(SETTINGS_KEY, {});
let settings = { back:'lines', deckMode: savedSettings.deckMode || (savedSettings.reversed === false ? 'all-upright' : 'all-reversed'), ...savedSettings };
let logs = load(STORAGE_KEY, []);
let activeSession = null;
let currentView = 'home';
let detailId = null;
let selectedDecision = '';
let historyMode = 'list';
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = '';
let historyQuery = '';

function roman(num) {
  const map = [[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let out=''; for (const [v,s] of map) while(num >= v){ out += s; num -= v; } return out;
}
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(logs)); localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function esc(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function formatDate(iso, withTime=false) {
  return new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'short', day:'numeric', ...(withTime ? {hour:'2-digit',minute:'2-digit'} : {}) }).format(new Date(iso));
}
function randomCard(exclude=[]) {
  const source = settings.deckMode.startsWith('major') ? MAJOR : DECK;
  const pool = source.filter(c => !exclude.includes(c.id));
  const base = pool[Math.floor(Math.random() * pool.length)];
  const useReversed = settings.deckMode.endsWith('reversed');
  return { ...base, orientation: useReversed && Math.random() < .28 ? 'reversed' : 'upright' };
}
function meaning(card) { return card[card.orientation]; }
function orientationLabel(card) { return card.orientation === 'upright' ? '正位置' : '逆位置'; }
function cardImage(card) {
  if (card.image) return card.image;
  if (card.id?.startsWith('M')) return `./assets/rider-waite/ar${String(Number(card.id.slice(1))).padStart(2,'0')}.jpg`;
  const match=card.id?.match(/^m(\d)-(\d+)$/); if(!match)return '';
  const codes=['wa','cu','sw','pe']; return `./assets/rider-waite/${codes[Number(match[1])]}${String(Number(match[2])+1).padStart(2,'0')}.jpg`;
}
function interpretation(card) {
  const m = meaning(card);
  return card.orientation === 'upright'
    ? `「${m}」が焦点です。いま持っている材料の中で、この視点を行動に変えられる場所を探してみてください。`
    : `「${m}」に注意が向いています。結論を急ぐ前に、無理や思い込みが混ざっていないか確かめてみてください。`;
}

function navigate(view, id=null) {
  currentView = view; detailId = id;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === (view === 'history' || view === 'detail' ? 'history' : 'home')));
  render(); requestAnimationFrame(() => app.focus({preventScroll:true}));
}
function render() {
  if (currentView === 'home') return renderHome();
  if (currentView === 'draw') return renderDraw();
  if (currentView === 'session') return renderSession();
  if (currentView === 'decide') return renderDecision();
  if (currentView === 'history') return renderHistory();
  if (currentView === 'detail') return renderDetail();
}

function renderHome() {
  const last = logs[0];
  app.innerHTML = `
    <section class="screen home-screen">
      <p class="eyebrow">Quick decision</p>
      <h1>迷いを、決める材料に。</h1>
      <p class="lead">答えを預けるのではなく、見方を変えるためのカードです。考えたい形だけ選んでください。</p>
      <div class="choice-grid">
        <button class="draw-choice primary" data-action="start" data-mode="one"><strong>1枚引き</strong><span>今の状況に、新しい視点をひとつ。</span></button>
        <button class="draw-choice" data-action="start" data-mode="two"><strong>2枚引き</strong><span>AとB、ふたつの選択肢を比べる。</span></button>
      </div>
      <p class="micro-note"><b>入力は不要です。</b><span>カードを見てから、必要なときだけ深掘りできます。</span></p>
      ${last ? `<button class="last-log" data-action="detail" data-id="${last.id}"><span>最近の決定</span><strong>${esc(last.title)}</strong><small>${esc(last.decision)} · ${formatDate(last.createdAt)}</small></button>` : ''}
    </section>`;
}

function startSession(mode) {
  const first = randomCard();
  const drawOptions = mode === 'two'
    ? [first, randomCard([first.id])]
    : Array.from({length:5}).reduce((cards) => [...cards, randomCard(cards.map(c => c.id))], []);
  activeSession = { id: crypto.randomUUID?.() || String(Date.now()), mode, startedAt:new Date().toISOString(), nodes:[], drawOptions, revealed:[] };
  selectedDecision = '';
  navigate('draw');
}

function backPicker() {
  return `<div class="back-picker" aria-label="カードの裏面を選ぶ">
    ${[
      ['lines','分岐ライン'],['classic','クラシック'],['plain','シンプル'],['ivory','アイボリー'],['cobalt','コバルト'],
      ['graph','方眼'],['ripple','波紋'],['sunrise','夜明け'],['ink','インク'],['steps','ステップ']
    ].map(([id,label]) => `<button class="back-choice ${settings.back === id ? 'selected' : ''}" data-action="select-back" data-value="${id}" aria-label="${label}"><i class="card-back back-${id}"></i><small>${label}</small><b aria-hidden="true">${settings.back === id ? '✓' : ''}</b></button>`).join('')}
  </div>`;
}

function drawCardButton(card, slot, label='') {
  const revealed = activeSession.revealed.includes(slot);
  const locked = activeSession.revealed.length && activeSession.mode === 'one' && !revealed;
  return `<button class="flip-card ${revealed ? 'flipped chosen' : ''}" data-action="flip-card" data-slot="${slot}" ${locked ? 'disabled' : ''} aria-label="${revealed ? `${card.name}を選びました` : `${label || slot + 1}枚目の伏せたカードを選ぶ`}">
    ${label ? `<b class="draw-label">${label}</b>` : ''}
    <span class="flip-inner">
      <span class="flip-face flip-back card-back back-${settings.back}"><i>DECIDE</i></span>
      <span class="flip-face flip-front" aria-hidden="${revealed ? 'false' : 'true'}"><img class="${card.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(card)}" alt="${revealed ? esc(card.name) : ''}"><em>${esc(card.name)}</em></span>
    </span>
  </button>`;
}

function renderDraw() {
  if (!activeSession) return navigate('home');
  const two = activeSession.mode === 'two';
  app.innerHTML = `<section class="screen draw-screen">
    <button class="text-back" data-action="home">← 最初に戻る</button>
    <p class="eyebrow">Take a moment</p>
    <h1>${two ? 'AとBを、心に置く。' : '問いを、心の中で決める。'}</h1>
    <p class="lead">${two ? '左をA、右をBとして思い浮かべてください。決まったら、それぞれのカードをめくります。' : '言葉にしなくて大丈夫です。気持ちが決まったら、惹かれるカードを1枚選んでください。'}</p>
    <div class="${two ? 'dual-draw' : 'draw-row'}">
      ${activeSession.drawOptions.map((card,i) => drawCardButton(card,i,two ? (i === 0 ? 'A' : 'B') : '')).join('')}
    </div>
    <p class="draw-instruction">${two ? (activeSession.revealed.length === 0 ? 'AかB、どちらからでも引けます' : activeSession.revealed.length === 1 ? 'もう一方のカードも引いてください' : '2つの視点を開いています…') : (activeSession.revealed.length ? 'カードを開いています…' : '決まったら、タップして引く')}</p>
  </section>`;
}

function flipCard(slot) {
  if (!activeSession || activeSession.revealed.includes(slot)) return;
  activeSession.revealed.push(slot);
  const card = activeSession.drawOptions[slot];
  const button = document.querySelector(`.flip-card[data-slot="${slot}"]`);
  if (button) {
    button.classList.add('flipped','chosen');
    button.setAttribute('aria-label',`${card.name}を選びました`);
    const front = button.querySelector('.flip-front');
    const image = front?.querySelector('img');
    front?.setAttribute('aria-hidden','false');
    if (image) image.alt = card.name;
  }
  const instruction = document.querySelector('.draw-instruction');
  if (activeSession.mode === 'one') {
    document.querySelectorAll('.flip-card').forEach((item,index) => { if(index !== slot) item.disabled = true; });
    if (instruction) instruction.textContent = 'カードを開いています…';
  } else if (instruction) {
    instruction.textContent = activeSession.revealed.length === 1 ? 'もう一方のカードも引いてください' : '2つの視点を開いています…';
  }
  const complete = activeSession.mode === 'one' || activeSession.revealed.length === 2;
  if (!complete) return;
  const picked = activeSession.mode === 'one' ? [activeSession.drawOptions[slot]] : activeSession.drawOptions;
  activeSession.nodes = activeSession.mode === 'two'
    ? [{question:'Aを選んだとき',label:'A',card:picked[0]},{question:'Bを選んだとき',label:'B',card:picked[1]}]
    : [{question:'いま必要な視点',label:'NOW',card:picked[0]}];
  setTimeout(() => { if (activeSession) navigate('session'); }, 1050);
}

function renderCard(node, index) {
  const c = node.card;
  return `<article class="thought-node ${c.orientation === 'reversed' ? 'is-reversed' : ''}">
    <div class="node-label"><span>${esc(node.label)}</span><b>${esc(node.question)}</b></div>
    <div class="compact-card">
      <img class="reading-image ${c.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(c)}" alt="${esc(c.name)}">
      <div><span class="tarot-index">${esc(c.number)} · ${orientationLabel(c)}</span><strong>${esc(c.name)}</strong></div>
    </div>
    <div class="reading"><b>${esc(meaning(c))}</b><p>${esc(interpretation(c))}</p></div>
    ${index < activeSession.nodes.length - 1 ? '<span class="connector" aria-hidden="true"></span>' : ''}
  </article>`;
}

function deepPrompts() {
  const used = activeSession.nodes.map(n => n.question);
  const pool = activeSession.mode === 'two'
    ? ['決め手になる違い','Aを選ぶときの注意点','Bを選ぶときの注意点','本当はどちらを望んでいる？','選んだ後の最初の一歩','見落としている前提']
    : ['見落としていること','進むときの注意点','本当はどうしたい？','手放してよいこと','次の小さな一歩','いま守るべきもの'];
  return pool.filter(p => !used.includes(p)).slice(0,3);
}

function renderSession() {
  if (!activeSession) return navigate('home');
  const initial = activeSession.mode === 'two' ? 2 : 1;
  const deepCount = activeSession.nodes.length - initial;
  const caution = deepCount >= 3;
  const canDraw = deepCount < 6;
  app.innerHTML = `
    <section class="screen map-screen">
      <button class="text-back" data-action="home">← 最初に戻る</button>
      <div class="map-heading"><p class="eyebrow">Thought map</p><h2>${activeSession.mode === 'two' ? 'AとBを、並べて考える' : 'ひとつずつ、視点を深める'}</h2></div>
      ${activeSession.mode === 'two' ? `<div class="choice-comparison">${activeSession.nodes.slice(0,2).map((node,index) => `<article class="compare-node"><span>${node.label}</span><div class="compare-card"><img class="${node.card.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(node.card)}" alt="${esc(node.card.name)}"><b>${esc(node.card.name)}</b><small>${orientationLabel(node.card)}</small></div><p><strong>${esc(meaning(node.card))}</strong>${esc(interpretation(node.card))}</p></article>`).join('')}</div><div class="thought-map deep-map">${activeSession.nodes.slice(2).map((node,index) => renderCard(node,index + 2)).join('')}</div>` : `<div class="thought-map">${activeSession.nodes.map(renderCard).join('')}</div>`}
      <section class="deep-panel">
        ${caution ? `<div class="decision-nudge"><b>そろそろ、材料は十分かもしれません。</b><p>新しい視点を増やすより、今ある材料から決めてみませんか。</p></div>` : `<p class="panel-title">もう少し考えるなら</p>`}
        ${canDraw ? `<div class="prompt-list">${deepPrompts().map(p => `<button class="prompt-button" data-action="deepen" data-prompt="${esc(p)}">${esc(p)}<span>＋1枚</span></button>`).join('')}</div>` : `<p class="limit-note">カードはここまで。いま見えている材料を使って決めましょう。</p>`}
      </section>
      <div class="decision-dock"><button class="button" data-action="decide">ここで決める <span>→</span></button></div>
    </section>`;
}

function addDeep(prompt) {
  const exclude = activeSession.nodes.map(n => n.card.id);
  activeSession.nodes.push({ question:prompt, label:`DEEP ${activeSession.nodes.length - (activeSession.mode === 'two' ? 1 : 0)}`, card:randomCard(exclude) });
  renderSession();
  requestAnimationFrame(() => window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}));
}

function renderDecision() {
  if (!activeSession) return navigate('home');
  const options = activeSession.mode === 'two' ? ['Aを選ぶ','Bを選ぶ','保留する'] : ['進む','見送る','保留する'];
  app.innerHTML = `
    <section class="screen decide-screen">
      <button class="text-back" data-action="session">← マップに戻る</button>
      <p class="eyebrow">Decide</p><h1>今回は、どうする？</h1>
      <p class="lead">カードではなく、あなたが決めます。いちばん納得できるものを選んでください。</p>
      <div class="decision-options">${options.map(o => `<button class="decision-option ${selectedDecision === o ? 'selected' : ''}" data-action="select-decision" data-value="${o}"><span>${o}</span><i>${selectedDecision === o ? '✓' : ''}</i></button>`).join('')}</div>
      <form id="save-form" class="save-form">
        <label>題名 <span>任意</span><input name="title" maxlength="60" placeholder="例：新しい仕事を引き受けるか"></label>
        <label>ひとことメモ <span>任意</span><textarea name="memo" maxlength="240" rows="3" placeholder="決め手や、今の気持ち"></textarea></label>
        <button class="button" type="submit" ${selectedDecision ? '' : 'disabled'}>決定を記録する</button>
        <p class="timestamp">${formatDate(new Date().toISOString(), true)} の記録として保存</p>
      </form>
    </section>`;
}

function saveDecision(form) {
  if (!selectedDecision || !activeSession) return;
  const fd = new FormData(form);
  const createdAt = new Date().toISOString();
  const fallback = activeSession.mode === 'two' ? `${selectedDecision}と決めた記録` : '今日の決定';
  const log = { id:activeSession.id, mode:activeSession.mode, createdAt, title:String(fd.get('title') || '').trim() || fallback,
    memo:String(fd.get('memo') || '').trim(), decision:selectedDecision, nodes:activeSession.nodes, review:null };
  logs.unshift(log); persist(); activeSession = null; selectedDecision = ''; detailId = log.id;
  currentView = 'detail'; render(); toast('決定を記録しました');
}

function renderHistory() {
  const results=filteredLogs();
  app.innerHTML = `<section class="screen history-screen">
    <div class="history-head"><div><p class="eyebrow">Decision log</p><h1>決めたこと。</h1></div>
      <div class="view-switch" aria-label="履歴の表示形式"><button class="${historyMode === 'list' ? 'selected' : ''}" data-action="history-mode" data-value="list">リスト</button><button class="${historyMode === 'calendar' ? 'selected' : ''}" data-action="history-mode" data-value="calendar">カレンダー</button></div>
    </div>
    ${logs.length ? `<label class="history-search"><span aria-hidden="true">⌕</span><input id="history-search" type="search" value="${esc(historyQuery)}" placeholder="題名、カード、意味、ストーリーを検索" aria-label="履歴を検索"><small>${historyQuery ? `${results.length}件` : ''}</small></label><div data-history-results>${renderHistoryResults(results)}</div>` : `<div class="empty-state"><span>□</span><h2>まだ記録はありません</h2><p>最初のカードを引いて、ひとつ決めてみましょう。</p><button class="button" data-action="home">カードを引く</button></div>`}
  </section>`;
}

function filteredLogs() {
  const query=historyQuery.trim().toLocaleLowerCase('ja'); if(!query)return logs;
  return logs.filter(log => {
    const cards=(log.nodes || []).flatMap(node=>[node.question,node.card?.name,meaning(node.card || {})]);
    return [log.title,log.decision,log.memo,log.story,...cards].filter(Boolean).join(' ').toLocaleLowerCase('ja').includes(query);
  });
}

function renderHistoryResults(results=filteredLogs()) {
  if(!results.length) return `<div class="search-empty"><span>⌕</span><b>見つかりませんでした</b><p>言葉を短くするか、別のキーワードで試してください。</p></div>`;
  return historyMode === 'calendar' ? renderCalendar(results) : `<div class="history-list">${results.map(historyItem).join('')}</div>`;
}

function historyItem(log) {
  const cards=(log.nodes || []).slice(0,3);
  const first=cards[0]?.card;
  return `<button class="history-item" data-action="detail" data-id="${log.id}">
    <span class="history-thumbs">${cards.map((node,index)=>`<img style="--stack:${index}" class="${node.card.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(node.card)}" alt="">`).join('')}</span>
    <span class="history-copy"><time>${formatDate(log.createdAt)}</time><strong>${esc(log.title)}</strong><span>${esc(log.decision)}</span>${first ? `<small>${esc(first.name)} · ${orientationLabel(first)} — ${esc(meaning(first))}</small>` : ''}</span>
    ${log.review ? `<em>${reviewIcon(log.review)} ${esc(log.review)}</em>` : '<em class="pending">未評価</em>'}<i class="history-arrow" aria-hidden="true">→</i>
  </button>`;
}

function localDateKey(value) {
  const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderCalendar(viewLogs=logs) {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year,month,1).getDay();
  const days = new Date(year,month+1,0).getDate();
  const today = localDateKey(new Date());
  const byDate = viewLogs.reduce((map,log) => { const key=localDateKey(log.createdAt); (map[key] ||= []).push(log); return map; },{});
  const blanks = Array.from({length:firstDay},() => '<span class="calendar-blank"></span>').join('');
  const cells = Array.from({length:days},(_,i) => {
    const key=`${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
    const count=(byDate[key] || []).length;
    return `<button class="calendar-day ${count ? 'has-log' : ''} ${key === today ? 'today' : ''} ${key === selectedCalendarDate ? 'selected' : ''}" data-action="calendar-day" data-value="${key}" ${count ? '' : 'disabled'}><span>${i+1}</span>${count ? `<i>${count}</i>` : ''}</button>`;
  }).join('');
  const selectedLogs = byDate[selectedCalendarDate] || [];
  return `<div class="calendar-wrap">
    <div class="calendar-toolbar"><button data-action="calendar-prev" aria-label="前の月">←</button><strong>${year}年 ${month+1}月</strong><button data-action="calendar-next" aria-label="次の月">→</button></div>
    <div class="week-row">${['日','月','火','水','木','金','土'].map(d=>`<span>${d}</span>`).join('')}</div>
    <div class="calendar-grid">${blanks}${cells}</div>
    <div class="calendar-detail">${selectedCalendarDate ? `<p class="calendar-date-label">${Number(selectedCalendarDate.slice(5,7))}月${Number(selectedCalendarDate.slice(8,10))}日の決定</p>${selectedLogs.map(historyItem).join('')}` : '<p class="calendar-hint">印のある日を選ぶと、その日の決定を確認できます。</p>'}</div>
  </div>`;
}

function reviewIcon(review) { return ({'良かった':'◎','まあ良かった':'○','どちらとも言えない':'△','違った':'×'})[review] || ''; }
function renderDetail() {
  const log = logs.find(l => l.id === detailId);
  if (!log) return navigate('history');
  app.innerHTML = `<section class="screen detail-screen">
    <button class="text-back" data-action="history">← 履歴へ</button><p class="eyebrow">${formatDate(log.createdAt, true)}</p>
    <h1>${esc(log.title)}</h1><div class="outcome"><span>今回の結論</span><strong>${esc(log.decision)}</strong></div>
    <div class="saved-cards"><p class="panel-title">引いたカードと意味</p>${log.nodes.map((node,index) => `<article class="saved-card">
      <img class="${node.card.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(node.card)}" alt="${esc(node.card.name)}">
      <div><span>${esc(node.label || `CARD ${index+1}`)} · ${esc(node.question || '')}</span><h3>${esc(node.card.name)} <small>${orientationLabel(node.card)}</small></h3><b>${esc(meaning(node.card))}</b><p>${esc(interpretation(node.card))}</p></div>
    </article>`).join('')}</div>
    ${log.memo ? `<div class="saved-memo"><span>メモ</span><p>${esc(log.memo)}</p></div>` : ''}
    <section class="story-panel"><div class="story-head"><div><p class="panel-title">その後のストーリー</p><span>時間が経って分かったことや、選択の続きを残せます。</span></div>${log.storyUpdatedAt ? `<time>更新 ${formatDate(log.storyUpdatedAt)}</time>` : ''}</div>
      <textarea id="story-text" rows="6" maxlength="2000" placeholder="例：実際にAを選んでみたら、最初に心配していたことよりも…">${esc(log.story || '')}</textarea>
      <button class="button secondary" data-action="save-story" data-id="${log.id}">${log.story ? 'ストーリーを更新する' : 'ストーリーを保存する'}</button>
    </section>
    <section class="review-panel"><p class="panel-title">この選択、その後どうでした？</p>
      <div class="review-grid">${['良かった','まあ良かった','どちらとも言えない','違った'].map(r => `<button class="review-button ${log.review === r ? 'selected' : ''}" data-action="review" data-value="${r}"><b>${reviewIcon(r)}</b><span>${r}</span></button>`).join('')}</div>
      ${log.review ? `<p class="review-saved">${formatDate(log.reviewedAt || new Date().toISOString())} に振り返りました</p>` : '<p class="review-hint">すぐに決めなくても大丈夫です。時間が経ってから戻ってきてください。</p>'}
    </section>
  </section>`;
}

function setReview(value) {
  const log = logs.find(l => l.id === detailId); if (!log) return;
  log.review = value; log.reviewedAt = new Date().toISOString(); persist(); renderDetail(); toast('振り返りを保存しました');
}

function saveStory(id) {
  const log=logs.find(item=>item.id===id); const field=document.querySelector('#story-text'); if(!log || !field)return;
  log.story=field.value.trim(); log.storyUpdatedAt=new Date().toISOString(); persist(); renderDetail(); toast('その後のストーリーを保存しました');
}

function openSettings() {
  const wrap = document.createElement('div'); wrap.className='modal-wrap'; wrap.id='settings-modal';
  wrap.innerHTML = `<button class="modal-shade" data-action="close-settings" aria-label="設定を閉じる"></button><section class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="sheet-handle"></div><div class="sheet-head"><h2 id="settings-title">設定</h2><button data-action="close-settings" aria-label="閉じる">×</button></div>
    <div class="deck-setting"><b>使うカード</b><p>2つのスイッチを組み合わせて選びます</p>
      <div class="setting-switch-row"><span><b>カード範囲</b><small data-deck-count>${settings.deckMode.startsWith('major') ? '22枚' : '78枚'}</small></span><div class="segmented-switch" aria-label="使うカードの範囲"><button class="${settings.deckMode.startsWith('major') ? 'selected' : ''}" data-action="deck-scope" data-value="major">大アルカナ</button><button class="${settings.deckMode.startsWith('all') ? 'selected' : ''}" data-action="deck-scope" data-value="all">全カード</button></div></div>
      <div class="setting-switch-row"><span><b>カードの向き</b><small data-orientation-note>${settings.deckMode.endsWith('reversed') ? '逆位置を含む' : '正位置だけ'}</small></span><div class="segmented-switch" aria-label="カードの向き"><button class="${settings.deckMode.endsWith('upright') ? 'selected' : ''}" data-action="deck-orientation" data-value="upright">正位置のみ</button><button class="${settings.deckMode.endsWith('reversed') ? 'selected' : ''}" data-action="deck-orientation" data-value="reversed">正逆あり</button></div></div>
      <div class="deck-summary"><span>現在</span><strong data-deck-summary>${settings.deckMode.startsWith('major') ? '大アルカナ22枚' : '全78枚'}・${settings.deckMode.endsWith('reversed') ? '正位置／逆位置' : '正位置のみ'}</strong></div>
    </div>
    <div class="setting-backs"><b>カードの裏面</b>${backPicker()}</div>
    <div class="setting-note"><b>カードと深掘り提案</b><p>逆位置ありでは、引いたカードの約3割が逆位置になります。表面はパメラ・コールマン・スミスによる1909年のライダー＝ウェイト＝スミス版（パブリックドメイン）です。決定ログはこのブラウザ内だけに保存されます。</p></div>
  </section>`;
  document.body.appendChild(wrap); requestAnimationFrame(() => wrap.classList.add('open'));
  wrap.querySelector('.settings-sheet button').focus();
}
function closeSettings() { const m=document.querySelector('#settings-modal'); if(!m)return; m.classList.remove('open'); setTimeout(()=>m.remove(),180); }
function openShare() {
  const url=`${location.origin}${location.pathname}`; const title='DECIDE — タロット思考ツール';
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='share-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="close-share" aria-label="共有画面を閉じる"></button><section class="settings-sheet share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
    <div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Share</p><h2 id="share-title">DECIDEを共有</h2></div><button data-action="close-share" aria-label="閉じる">×</button></div>
    <p class="share-lead">友だちにも、決めるための時間を。共有されるのはアプリのURLだけで、あなたの履歴は含まれません。</p>
    <div class="share-grid">
      <a class="share-option line" href="https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}" target="_blank" rel="noopener"><b>LINE</b><span>LINEで送る</span></a>
      <a class="share-option x-share" href="https://x.com/intent/post?text=${encodeURIComponent('迷いを、決める材料に。DECIDE')}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener"><b>𝕏</b><span>Xで共有</span></a>
      <a class="share-option facebook" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener"><b>f</b><span>Facebook</span></a>
      <button class="share-option" data-action="native-share"><b>↗</b><span>その他</span></button>
    </div>
    <button class="copy-link" data-action="copy-link"><span>${esc(url)}</span><b>リンクをコピー</b></button>
  </section>`;
  document.body.appendChild(wrap); requestAnimationFrame(()=>wrap.classList.add('open')); wrap.querySelector('.sheet-head button').focus();
}
function closeShare() { const m=document.querySelector('#share-modal'); if(!m)return; m.classList.remove('open'); setTimeout(()=>m.remove(),180); }
async function shareNative() { const data={title:'DECIDE — タロット思考ツール',text:'迷いを、決める材料に。',url:`${location.origin}${location.pathname}`}; if(navigator.share){ try{ await navigator.share(data); }catch{} } else { await copyShareLink(); } }
async function copyShareLink() { try{ await navigator.clipboard.writeText(`${location.origin}${location.pathname}`); toast('共有リンクをコピーしました'); }catch{ toast('リンクをコピーできませんでした'); } }
function toast(message) { const t=document.querySelector('#toast'); t.textContent=message; t.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('show'),1800); }
function updateDeckSettingUI() {
  const modal=document.querySelector('#settings-modal'); if(!modal)return;
  const major=settings.deckMode.startsWith('major'); const reversed=settings.deckMode.endsWith('reversed');
  modal.querySelectorAll('[data-action="deck-scope"]').forEach(item=>item.classList.toggle('selected',item.dataset.value===(major?'major':'all')));
  modal.querySelectorAll('[data-action="deck-orientation"]').forEach(item=>item.classList.toggle('selected',item.dataset.value===(reversed?'reversed':'upright')));
  modal.querySelector('[data-deck-count]').textContent=major?'22枚':'78枚';
  modal.querySelector('[data-orientation-note]').textContent=reversed?'逆位置を含む':'正位置だけ';
  modal.querySelector('[data-deck-summary]').textContent=`${major?'大アルカナ22枚':'全78枚'}・${reversed?'正位置／逆位置':'正位置のみ'}`;
}

document.addEventListener('click', event => {
  const el = event.target.closest('[data-action], [data-nav]'); if (!el) return;
  const action = el.dataset.action || el.dataset.nav;
  if (action === 'start') startSession(el.dataset.mode);
  else if (action === 'home') { activeSession=null; navigate('home'); }
  else if (action === 'history') navigate('history');
  else if (action === 'session') navigate('session');
  else if (action === 'flip-card') flipCard(Number(el.dataset.slot));
  else if (action === 'select-back') { settings.back=el.dataset.value; persist(); const modal=document.querySelector('#settings-modal'); if(modal){ modal.querySelectorAll('.back-choice').forEach(item=>{ const chosen=item.dataset.value===settings.back; item.classList.toggle('selected',chosen); item.querySelector('b').textContent=chosen?'✓':''; }); } toast('カードの裏面を変更しました'); }
  else if (action === 'deepen') addDeep(el.dataset.prompt);
  else if (action === 'decide') navigate('decide');
  else if (action === 'select-decision') { selectedDecision=el.dataset.value; renderDecision(); }
  else if (action === 'detail') navigate('detail', el.dataset.id);
  else if (action === 'review') setReview(el.dataset.value);
  else if (action === 'deck-scope') { const orientation=settings.deckMode.endsWith('reversed')?'reversed':'upright'; settings.deckMode=`${el.dataset.value}-${orientation}`; persist(); updateDeckSettingUI(); toast('使うカードを変更しました'); }
  else if (action === 'deck-orientation') { const scope=settings.deckMode.startsWith('major')?'major':'all'; settings.deckMode=`${scope}-${el.dataset.value}`; persist(); updateDeckSettingUI(); toast('カードの向きを変更しました'); }
  else if (action === 'history-mode') { historyMode=el.dataset.value; selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-prev') { calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1); selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-next') { calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1); selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-day') { selectedCalendarDate=el.dataset.value; renderHistory(); }
  else if (action === 'save-story') saveStory(el.dataset.id);
  else if (action === 'close-share') closeShare();
  else if (action === 'native-share') shareNative();
  else if (action === 'copy-link') copyShareLink();
  else if (action === 'close-settings') closeSettings();
});
document.addEventListener('submit', event => { if(event.target.id === 'save-form'){ event.preventDefault(); saveDecision(event.target); } });
document.addEventListener('input', event => { if(event.target.id === 'history-search'){ historyQuery=event.target.value; const results=document.querySelector('[data-history-results]'); if(results)results.innerHTML=renderHistoryResults(); const count=event.target.closest('.history-search')?.querySelector('small'); if(count)count.textContent=historyQuery?`${filteredLogs().length}件`:''; } });
document.querySelector('#settings-button').addEventListener('click', openSettings);
document.querySelector('#share-button').addEventListener('click', openShare);
document.addEventListener('keydown', event => { if(event.key === 'Escape'){ closeSettings(); closeShare(); } });

function registerWebMcp() {
  const context = document.modelContext; if (!context?.registerTool) return;
  const tools = [
    { name:'start_decision_session', title:'カードを引く', description:'1枚引きまたは2枚引きの意思決定セッションを開始して画面に表示します。', inputSchema:{type:'object',properties:{mode:{type:'string',enum:['one','two']}},required:['mode'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:({mode})=>{ if(!['one','two'].includes(mode)) throw new Error('mode must be one or two'); startSession(mode); return {status:'started',mode,cards:activeSession.nodes.map(n=>n.card.name)}; } },
    { name:'list_decision_logs', title:'決定履歴を見る', description:'このブラウザに保存された決定ログを新しい順に読み取ります。', inputSchema:{type:'object',properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:()=>logs.map(l=>({id:l.id,date:l.createdAt,title:l.title,decision:l.decision,review:l.review})) },
    { name:'review_decision', title:'決定を振り返る', description:'保存済みの決定に後日の評価を記録します。', inputSchema:{type:'object',properties:{id:{type:'string'},review:{type:'string',enum:['良かった','まあ良かった','どちらとも言えない','違った']}},required:['id','review'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:({id,review})=>{ const log=logs.find(l=>l.id===id); if(!log) throw new Error('log not found'); log.review=review; log.reviewedAt=new Date().toISOString(); persist(); if(detailId===id) renderDetail(); return {status:'saved',id,review}; } }
  ];
  tools.forEach(tool => { try { Promise.resolve(context.registerTool(tool)).catch(()=>{}); } catch {} });
}

registerWebMcp();
render();
