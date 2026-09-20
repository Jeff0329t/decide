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

const MAJOR_READINGS = {
  '愚者': {upright:'まだ道筋が見えなくても、好奇心が動く方向には試す価値があります。失敗しても戻れる小さな一歩にして、まず経験から判断材料を増やしましょう。',reversed:'自由に動きたい気持ちが、準備不足や現実逃避に傾いていないか確認したい場面です。勢いで決めず、最低限守る条件を一つ決めてから動きましょう。'},
  '魔術師': {upright:'必要な道具や経験は、すでに手元に揃い始めています。完璧な準備を待つより、自分から働きかけられる最初の一手を選ぶと流れが生まれます。',reversed:'力が足りないというより、使えるものを整理できていない可能性があります。見栄や過信を脇に置き、今できることと足りないことを分けてください。'},
  '女教皇': {upright:'表面的な条件だけではなく、静かな違和感や納得感を大切にしてください。すぐ答えを出すより、一度情報を閉じて自分の反応を確かめると本音が見えます。',reversed:'考えを内側に抱え込みすぎて、直感と不安の区別が曖昧になっています。信頼できる人に事実だけを話し、思い込みを外から点検してみましょう。'},
  '女帝': {upright:'育てる余地がある選択です。効率だけで切らず、安心・喜び・人とのつながりが長く続く方を選ぶと実りにつながります。',reversed:'大切にすることと、抱え込みすぎることが混ざっているかもしれません。誰かの期待ではなく、自分の時間と余力を守れる条件を置いてください。'},
  '皇帝': {upright:'判断基準と責任の範囲をはっきりさせるほど、迷いは小さくなります。自分が主導できる方、長期的に土台を作れる方を見極めましょう。',reversed:'正しさや計画に固執すると、現実の変化を見落とします。譲れない条件を一つに絞り、それ以外には柔軟さを残してください。'},
  '教皇': {upright:'実績のある方法や信頼できる助言が支えになります。独自性を急ぐより、まず基本に沿って進められる選択かを確かめましょう。',reversed:'常識や周囲の正解が、あなたの目的に本当に合うとは限りません。ルールを破るためではなく、なぜ従うのかを問い直してください。'},
  '恋人': {upright:'条件の優劣だけでなく、その選択を自分が好きでいられるかが決め手です。選んだ後に誰と、どんな気持ちで進みたいかを想像してください。',reversed:'迷いの背景に、誰かをがっかりさせたくない気持ちが隠れていそうです。全員に好かれる答えではなく、自分が引き受けられる答えを選びましょう。'},
  '戦車': {upright:'方向を決めて動くほど状況が開けます。すべての不安を消すより、期限と最初の行動を決めて前進してください。',reversed:'意欲はあっても、力の向きがばらばらになっています。急ぐ前に目的を一文で言い直し、今やらないことを決める必要があります。'},
  '力': {upright:'押し切る強さではなく、焦りや恐れを扱う落ち着きが役立ちます。相手や自分を責めず、続けられる強度で選択を実行しましょう。',reversed:'自信の揺れが、必要以上に選択肢を小さく見せています。大きな決断にせず、成功しやすい単位へ分けると力を取り戻せます。'},
  '隠者': {upright:'外の評価から少し離れ、自分が本当に知りたい答えを絞る時です。一人で考える時間を取り、長期的に納得できる基準を見つけてください。',reversed:'内省が長引き、行動を避ける理由になっているかもしれません。考える期限を決め、その時点の最善で一度選びましょう。'},
  '運命の輪': {upright:'状況が動く節目にいます。完全にコントロールしようとせず、今だけ開いている機会に反応できる選択を考えてください。',reversed:'思い通りにならない流れを、無理に押し戻そうとしていないでしょうか。変えられない条件を受け入れ、次に備える選択も前進です。'},
  '正義': {upright:'感情と事実を分け、同じ基準で比べると答えが見えます。短期的な得より、後から説明できる公平な選択を優先してください。',reversed:'都合のよい情報だけを拾っている可能性があります。反対の立場から見た時にも納得できるか、判断材料をもう一度点検しましょう。'},
  '吊るされた男': {upright:'今すぐ動かないことで見えるものがあります。損に見える時間にも意味があるため、視点を反転させて何を得ているか考えてください。',reversed:'我慢や保留が目的化しています。待つなら期限を決め、状況が変わらない場合に選ぶ次の一手まで用意しましょう。'},
  '死神': {upright:'何かを終えることで、新しい余白が生まれます。失うものだけでなく、手放した後に取り戻せる時間や力を数えてください。',reversed:'終わりを認めたくない気持ちが、判断を止めています。完全に切るのが難しければ、まず関わり方を縮小する選択から始めましょう。'},
  '節制': {upright:'二者択一に見えても、配分や順序を変える第三の道があります。無理なく続く中間点を探し、小さく調整しながら進めてください。',reversed:'いくつもの事情を混ぜすぎて、判断軸がぼやけています。今もっとも整えたいものを一つ決め、他は後から調整しましょう。'},
  '悪魔': {upright:'損得や執着が選択を縛っていないか、正直に見る時です。「失うのが怖いから」以外の理由があるかを確かめてください。',reversed:'縛りの正体に気づき、離れる準備が始まっています。急にすべてを変えず、依存を一段弱める具体的な行動を選びましょう。'},
  '塔': {upright:'前提が崩れる可能性を恐れず、事実を優先してください。古い計画を守るより、壊れた後にも残る大事なものを基準に選びましょう。',reversed:'変化の兆しを感じながら、先延ばしにしているようです。大きな混乱になる前に、危うい部分だけでも自分から見直してください。'},
  '星': {upright:'希望を持って先を描ける選択です。理想を夢のままにせず、今日できる小さな行動へ変えると方向が定まります。',reversed:'期待と現実の差に疲れているかもしれません。目標を捨てるのではなく、回復できる距離まで一度近づけてください。'},
  '月': {upright:'情報が足りず、不安が想像を膨らませています。今は白黒を急がず、確認できる事実と感じている恐れを別々に書き出しましょう。',reversed:'曖昧だったことが少しずつ見え始めています。まだ残る違和感をごまかさず、確認すべき一点を明らかにしてください。'},
  '太陽': {upright:'状況を素直に受け取り、自信を持って進める兆しです。複雑に考えすぎず、喜びや成長を周囲と分かち合える方を選びましょう。',reversed:'悪くはありませんが、楽観だけで細部を飛ばしていないか注意が必要です。期待値を少し現実的に整えれば、前向きに進めます。'},
  '審判': {upright:'過去の経験を材料に、今度は違う選択ができます。以前うまくいかなかった理由を一つ言葉にし、それを越える答えを選んでください。',reversed:'過去の後悔や自己評価が、新しい判断まで縛っています。当時の自分と今の自分の違いを確認し、再挑戦の条件を整えましょう。'},
  '世界': {upright:'一つの区切りにふさわしい選択です。足りない部分を探し続けず、ここまで積み上げたものを認めて次へ進みましょう。',reversed:'完成目前で、細部へのこだわりが終わりを遠ざけています。合格点を決め、残りは次の段階で改善すると割り切ってください。'}
};

const SUIT_READINGS = {
  'ワンド': {upright:'行動への熱が本物か、続けたいと思える方を見てください。',reversed:'勢いの空回りや、やる気の消耗が判断を急がせていないか確認してください。'},
  'カップ': {upright:'気持ちの満足と人との関係に、どんな変化が生まれるかを見てください。',reversed:'期待や感情に飲まれず、本音と一時的な気分を分けて考えてください。'},
  'ソード': {upright:'事実と言葉を整理すると、判断の輪郭がはっきりします。',reversed:'考えすぎや決めつけを一度止め、確認できる事実へ戻ってください。'},
  'ペンタクル': {upright:'時間・お金・体力など、現実に続けられる条件を確かめてください。',reversed:'目先の損得だけでなく、負担の偏りや維持コストを見直してください。'}
};
const RANK_READINGS = [
  {upright:'始めるなら、最初の一歩を具体的に決めると機会を活かせます。',reversed:'機会を逃す不安だけで選ばず、始めるための最低条件を整えましょう。'},
  {upright:'両方を抱えるより、優先順位と期限を決めることが次の一手です。',reversed:'迷いを長引かせる情報を減らし、判断基準を一つに絞りましょう。'},
  {upright:'一人で完結させず、協力者やフィードバックを取り入れると展開します。',reversed:'役割や期待のずれを先に揃えてから進める方が安全です。'},
  {upright:'守りたい土台を明確にすると、安心して選べます。',reversed:'安定を守ることが停滞になっていないか、手放せる条件を探してください。'},
  {upright:'摩擦は失敗ではなく、優先したい価値を知る材料です。',reversed:'争いを避けるための妥協が、後の不満にならないか確かめましょう。'},
  {upright:'過去の成功や支えを、今の判断に活かせます。',reversed:'慣れた方を選ぶだけでなく、現在の自分に合うかを見直してください。'},
  {upright:'すぐ結論を出さず、価値が育つ余地を見極める段階です。',reversed:'疑い続けるより、小さく試して反応を見る方が答えに近づきます。'},
  {upright:'集中する対象を決めれば、物事は速く進みます。',reversed:'速度を落とし、見落としや連絡不足を一度点検してください。'},
  {upright:'ここまでの経験を信じつつ、最後の備えを整えてください。',reversed:'一人で耐え続けず、助けを求めることも選択肢に入れましょう。'},
  {upright:'到達後に背負う責任まで含めて、引き受けられる方を選んでください。',reversed:'負担を減らす、断る、分担するという決断も必要です。'},
  {upright:'好奇心を小さな実験に変え、結果から学ぶのが合っています。',reversed:'情報だけで満足せず、確認してから言葉や行動に移しましょう。'},
  {upright:'勢いを活かしつつ、止まる条件も先に決めておきましょう。',reversed:'極端な決断を避け、一晩置いてから実行するくらいが適切です。'},
  {upright:'自分と周囲の状態を丁寧に受け取り、無理のない方を選べます。',reversed:'気遣いが自己犠牲になっていないか、自分の余白を確認してください。'},
  {upright:'長期の方針を定め、責任を持って進める判断が求められています。',reversed:'支配したい気持ちを緩め、他者の意見や変化を受け入れてください。'}
];

const savedSettings = load(SETTINGS_KEY, {});
let settings = { back:'lines', feedback: savedSettings.feedback !== false, deckMode: savedSettings.deckMode || (savedSettings.reversed === false ? 'all-upright' : 'all-reversed'), ...savedSettings };
let logs = load(STORAGE_KEY, []);
let activeSession = null;
let currentView = 'home';
let detailId = null;
let selectedDecision = '';
let historyMode = 'list';
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = '';
let historyQuery = '';
let activeShareData = null;

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
  const major = MAJOR_READINGS[card.name]?.[card.orientation];
  if (major) return major;
  const suit = SUITS.find(item => card.name?.startsWith(item.name));
  const rank = Number(card.id?.match(/^m\d-(\d+)$/)?.[1]);
  const suitText = SUIT_READINGS[suit?.name]?.[card.orientation] || '';
  const rankText = RANK_READINGS[rank]?.[card.orientation] || '';
  return `${suitText} ${rankText}`.trim();
}

function sensoryFeedback(kind='tap') {
  if (!settings.feedback) return;
  try { navigator.vibrate?.(kind === 'reveal' ? [10, 32, 14] : kind === 'save' ? [18, 24, 24] : 8); } catch {}
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const context = sensoryFeedback.context ||= new Audio();
    const now = context.currentTime;
    const tones = kind === 'reveal' ? [[392,0],[523.25,.07]] : kind === 'save' ? [[440,0],[659.25,.09]] : [[520,0]];
    tones.forEach(([frequency,delay]) => {
      const oscillator=context.createOscillator(); const gain=context.createGain();
      oscillator.type='sine'; oscillator.frequency.setValueAtTime(frequency,now+delay);
      gain.gain.setValueAtTime(.0001,now+delay); gain.gain.exponentialRampToValueAtTime(.045,now+delay+.015); gain.gain.exponentialRampToValueAtTime(.0001,now+delay+.16);
      oscillator.connect(gain).connect(context.destination); oscillator.start(now+delay); oscillator.stop(now+delay+.18);
    });
  } catch {}
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
      <p class="lead">答えを預けるのではなく、見方を変えるためのカードです。今の迷いに合う引き方を選んでください。</p>
      <div class="choice-grid">
        <button class="draw-choice primary" data-action="start" data-mode="one"><strong>1枚引き</strong><span>今の状況に、新しい視点をひとつ。</span></button>
        <button class="draw-choice" data-action="start" data-mode="two"><strong>2枚引き</strong><span>選択肢1と2、ふたつの可能性を比べる。</span></button>
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
  const tag = activeSession.mode === 'two' ? 'div' : 'button';
  const action = activeSession.mode === 'two' ? '' : ' data-action="flip-card"';
  return `<${tag} class="flip-card ${activeSession.mode === 'two' ? 'pair-card' : ''} ${revealed ? 'flipped chosen' : ''}"${action} data-slot="${slot}" ${locked ? 'disabled' : ''} aria-label="${revealed ? `${card.name}を選びました` : `${label || slot + 1}枚目の伏せたカード`}">
    ${label ? `<b class="draw-label">${label}</b>` : ''}
    <span class="flip-inner">
      <span class="flip-face flip-back card-back back-${settings.back}"><i>DECIDE</i></span>
      <span class="flip-face flip-front" aria-hidden="${revealed ? 'false' : 'true'}"><img class="${card.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(card)}" alt="${revealed ? esc(card.name) : ''}"><em>${esc(card.name)}</em></span>
    </span>
  </${tag}>`;
}

function renderDraw() {
  if (!activeSession) return navigate('home');
  const two = activeSession.mode === 'two';
  app.innerHTML = `<section class="screen draw-screen">
    <button class="text-back" data-action="home">← 最初に戻る</button>
    <p class="eyebrow">Take a moment</p>
    <h1>${two ? '2つの選択肢を、思い浮かべる。' : '問いを、心の中で決める。'}</h1>
    <p class="lead">${two ? '左を選択肢1、右を選択肢2として思い浮かべてください。準備ができたら、2枚を同時に引きます。' : '言葉にしなくて大丈夫です。気持ちが決まったら、惹かれるカードを1枚選んでください。'}</p>
    <div class="${two ? 'dual-draw' : 'draw-row'}">
      ${activeSession.drawOptions.map((card,i) => drawCardButton(card,i,two ? `選択肢 ${i + 1}` : '')).join('')}
    </div>
    ${two ? `<button class="button reveal-both" data-action="flip-both" ${activeSession.revealed.length ? 'disabled' : ''}>2枚を同時に引く</button>` : ''}
    <p class="draw-instruction">${two ? (activeSession.revealed.length ? '2つの視点を開いています…' : '心の中で決まったら、ボタンを押してください') : (activeSession.revealed.length ? 'カードを開いています…' : '決まったら、タップして引く')}</p>
  </section>`;
}

function flipCard(slot) {
  if (!activeSession || activeSession.mode === 'two' || activeSession.revealed.includes(slot)) return;
  sensoryFeedback('reveal');
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
  }
  activeSession.nodes = [{question:'いま必要な視点',label:'NOW',card}];
  setTimeout(() => { if (activeSession) navigate('session'); }, 1050);
}

function flipBoth() {
  if (!activeSession || activeSession.mode !== 'two' || activeSession.revealed.length) return;
  sensoryFeedback('reveal');
  activeSession.revealed = [0, 1];
  document.querySelectorAll('.flip-card').forEach((item, slot) => {
    const card = activeSession.drawOptions[slot];
    item.classList.add('flipped','chosen');
    item.setAttribute('aria-label',`${card.name}を開きました`);
    const front = item.querySelector('.flip-front');
    const image = front?.querySelector('img');
    front?.setAttribute('aria-hidden','false');
    if (image) image.alt = card.name;
  });
  const reveal = document.querySelector('[data-action="flip-both"]');
  if (reveal) reveal.disabled = true;
  const instruction = document.querySelector('.draw-instruction');
  if (instruction) instruction.textContent = '2つの視点を開いています…';
  activeSession.nodes = [
    {question:'選択肢1を選んだとき',label:'選択肢 1',card:activeSession.drawOptions[0]},
    {question:'選択肢2を選んだとき',label:'選択肢 2',card:activeSession.drawOptions[1]}
  ];
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
    ? ['決め手になる違い','選択肢1を選ぶときの注意点','選択肢2を選ぶときの注意点','本当はどちらを望んでいる？','選んだ後の最初の一歩','見落としている前提']
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
      <div class="map-heading"><p class="eyebrow">Thought map</p><h2>${activeSession.mode === 'two' ? '選択肢1と2を、並べて考える' : 'ひとつずつ、視点を深める'}</h2></div>
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
  const options = activeSession.mode === 'two' ? ['選択肢1を選ぶ','選択肢2を選ぶ','保留する'] : ['進む','見送る','保留する'];
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
  sensoryFeedback('save');
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
    <h1>${esc(log.title)}</h1><div class="outcome"><span>今回の結論</span><strong>${esc(log.decision)}</strong><button data-action="share-log" data-id="${log.id}">この決定を共有 ↗</button></div>
    <div class="saved-cards"><p class="panel-title">引いたカードと意味</p>${log.nodes.map((node,index) => `<article class="saved-card">
      <img class="${node.card.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(node.card)}" alt="${esc(node.card.name)}">
      <div><span>${esc(node.label || `CARD ${index+1}`)} · ${esc(node.question || '')}</span><h3>${esc(node.card.name)} <small>${orientationLabel(node.card)}</small></h3><b>${esc(meaning(node.card))}</b><p>${esc(interpretation(node.card))}</p></div>
    </article>`).join('')}</div>
    ${log.memo ? `<div class="saved-memo"><span>メモ</span><p>${esc(log.memo)}</p></div>` : ''}
    <section class="story-panel"><div class="story-head"><div><p class="panel-title">その後のストーリー</p><span>時間が経って分かったことや、選択の続きを残せます。</span></div>${log.storyUpdatedAt ? `<time>更新 ${formatDate(log.storyUpdatedAt)}</time>` : ''}</div>
      <textarea id="story-text" rows="6" maxlength="2000" placeholder="例：実際に選択肢1を選んでみたら、最初に心配していたことよりも…">${esc(log.story || '')}</textarea>
      <div class="story-actions"><button class="button secondary" data-action="save-story" data-id="${log.id}">${log.story ? 'ストーリーを更新する' : 'ストーリーを保存する'}</button>${log.story ? `<button class="button ghost" data-action="share-story" data-id="${log.id}">ストーリーを共有 ↗</button>` : ''}</div>
    </section>
    <section class="review-panel"><p class="panel-title">この選択、その後どうでした？</p>
      <div class="review-grid">${['良かった','まあ良かった','どちらとも言えない','違った'].map(r => `<button class="review-button ${log.review === r ? 'selected' : ''}" data-action="review" data-value="${r}"><b>${reviewIcon(r)}</b><span>${r}</span></button>`).join('')}</div>
      ${log.review ? `<p class="review-saved">${formatDate(log.reviewedAt || new Date().toISOString())} に振り返りました</p>` : '<p class="review-hint">すぐに決めなくても大丈夫です。時間が経ってから戻ってきてください。</p>'}
    </section>
  </section>`;
}

function setReview(value) {
  const log = logs.find(l => l.id === detailId); if (!log) return;
  sensoryFeedback('tap');
  log.review = value; log.reviewedAt = new Date().toISOString(); persist(); renderDetail(); toast('振り返りを保存しました');
}

function saveStory(id) {
  const log=logs.find(item=>item.id===id); const field=document.querySelector('#story-text'); if(!log || !field)return;
  sensoryFeedback('save');
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
    <div class="feedback-setting"><div><b>操作音・振動</b><p>カードを開く時や決定を保存する時に、控えめな反応を返します。</p></div><button class="toggle-button ${settings.feedback ? 'on' : ''}" data-action="toggle-feedback" aria-pressed="${settings.feedback}"><span></span><b>${settings.feedback ? 'ON' : 'OFF'}</b></button></div>
    <div class="setting-note"><b>カードと深掘り提案</b><p>逆位置ありでは、引いたカードの約3割が逆位置になります。表面はパメラ・コールマン・スミスによる1909年のライダー＝ウェイト＝スミス版（パブリックドメイン）です。決定ログはこのブラウザ内だけに保存されます。</p></div>
  </section>`;
  document.body.appendChild(wrap); requestAnimationFrame(() => wrap.classList.add('open'));
  wrap.querySelector('.settings-sheet button').focus();
}
function closeSettings() { const m=document.querySelector('#settings-modal'); if(!m)return; m.classList.remove('open'); setTimeout(()=>m.remove(),180); }
function shareData(type='app', log=null) {
  const url=`${location.origin}${location.pathname}`;
  if (type === 'result' && log) {
    const cards=(log.nodes || []).slice(0,2).map(node=>`${node.card.name}（${orientationLabel(node.card)}）`).join('・');
    return {title:`${log.title} — DECIDE`,heading:'決定を共有',lead:'題名・結論・引いたカードを共有します。メモや履歴全体は含まれません。',text:`「${log.title}」\n結論：${log.decision}${cards ? `\nカード：${cards}` : ''}\n#DECIDE`,url};
  }
  if (type === 'story' && log) {
    const story=(log.story || '').slice(0,420);
    return {title:`${log.title}のその後 — DECIDE`,heading:'その後のストーリーを共有',lead:'保存したストーリーと結論を共有します。内容を確認してから共有先を選んでください。',text:`「${log.title}」\n結論：${log.decision}\nその後：${story}${log.story?.length > 420 ? '…' : ''}\n#DECIDE`,url};
  }
  return {title:'DECIDE — タロット思考ツール',heading:'DECIDEを共有',lead:'友だちにも、決めるための時間を。共有されるのはアプリのURLだけで、あなたの履歴は含まれません。',text:'迷いを、決める材料に。\n#DECIDE',url};
}
function openShare(type='app', id=null) {
  const log=id ? logs.find(item=>item.id===id) : null;
  activeShareData=shareData(type,log);
  const {url,title,heading,lead,text:shareText}=activeShareData;
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='share-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="close-share" aria-label="共有画面を閉じる"></button><section class="settings-sheet share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
    <div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Share</p><h2 id="share-title">${esc(heading)}</h2></div><button data-action="close-share" aria-label="閉じる">×</button></div>
    <p class="share-lead">${esc(lead)}</p>
    ${type !== 'app' ? `<div class="share-preview">${esc(shareText).replace(/\n/g,'<br>')}</div>` : ''}
    <div class="share-grid">
      <a class="share-option line" href="https://line.me/R/msg/text/?${encodeURIComponent(`${shareText}\n${url}`)}" target="_blank" rel="noopener"><b>LINE</b><span>LINEで送る</span></a>
      <a class="share-option x-share" href="https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener"><b>𝕏</b><span>Xで共有</span></a>
      <a class="share-option facebook" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener"><b>f</b><span>Facebook</span></a>
      <button class="share-option" data-action="native-share"><b>↗</b><span>その他</span></button>
    </div>
    <button class="copy-link" data-action="copy-link"><span>${esc(type === 'app' ? url : title)}</span><b>${type === 'app' ? 'リンクをコピー' : '文章をコピー'}</b></button>
  </section>`;
  document.body.appendChild(wrap); requestAnimationFrame(()=>wrap.classList.add('open')); wrap.querySelector('.sheet-head button').focus();
}
function closeShare() { const m=document.querySelector('#share-modal'); if(!m)return; m.classList.remove('open'); setTimeout(()=>m.remove(),180); }
async function shareNative() { const data=activeShareData || shareData(); if(navigator.share){ try{ await navigator.share({title:data.title,text:data.text,url:data.url}); }catch{} } else { await copyShareLink(); } }
async function copyShareLink() { const data=activeShareData || shareData(); try{ await navigator.clipboard.writeText(`${data.text}\n${data.url}`); sensoryFeedback('tap'); toast(data.heading === 'DECIDEを共有' ? '共有リンクをコピーしました' : '共有する文章をコピーしました'); }catch{ toast('コピーできませんでした'); } }
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
  else if (action === 'flip-both') flipBoth();
  else if (action === 'select-back') { settings.back=el.dataset.value; persist(); const modal=document.querySelector('#settings-modal'); if(modal){ modal.querySelectorAll('.back-choice').forEach(item=>{ const chosen=item.dataset.value===settings.back; item.classList.toggle('selected',chosen); item.querySelector('b').textContent=chosen?'✓':''; }); } toast('カードの裏面を変更しました'); }
  else if (action === 'deepen') addDeep(el.dataset.prompt);
  else if (action === 'decide') navigate('decide');
  else if (action === 'select-decision') { sensoryFeedback('tap'); selectedDecision=el.dataset.value; renderDecision(); }
  else if (action === 'detail') navigate('detail', el.dataset.id);
  else if (action === 'review') setReview(el.dataset.value);
  else if (action === 'deck-scope') { const orientation=settings.deckMode.endsWith('reversed')?'reversed':'upright'; settings.deckMode=`${el.dataset.value}-${orientation}`; persist(); updateDeckSettingUI(); toast('使うカードを変更しました'); }
  else if (action === 'deck-orientation') { const scope=settings.deckMode.startsWith('major')?'major':'all'; settings.deckMode=`${scope}-${el.dataset.value}`; persist(); updateDeckSettingUI(); toast('カードの向きを変更しました'); }
  else if (action === 'toggle-feedback') { settings.feedback=!settings.feedback; persist(); el.classList.toggle('on',settings.feedback); el.setAttribute('aria-pressed',String(settings.feedback)); el.querySelector('b').textContent=settings.feedback?'ON':'OFF'; if(settings.feedback)sensoryFeedback('tap'); toast(settings.feedback?'操作音・振動をONにしました':'操作音・振動をOFFにしました'); }
  else if (action === 'history-mode') { historyMode=el.dataset.value; selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-prev') { calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1); selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-next') { calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1); selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-day') { selectedCalendarDate=el.dataset.value; renderHistory(); }
  else if (action === 'save-story') saveStory(el.dataset.id);
  else if (action === 'share-log') openShare('result',el.dataset.id);
  else if (action === 'share-story') openShare('story',el.dataset.id);
  else if (action === 'close-share') closeShare();
  else if (action === 'native-share') shareNative();
  else if (action === 'copy-link') copyShareLink();
  else if (action === 'close-settings') closeSettings();
});
document.addEventListener('submit', event => { if(event.target.id === 'save-form'){ event.preventDefault(); saveDecision(event.target); } });
document.addEventListener('input', event => { if(event.target.id === 'history-search'){ historyQuery=event.target.value; const results=document.querySelector('[data-history-results]'); if(results)results.innerHTML=renderHistoryResults(); const count=event.target.closest('.history-search')?.querySelector('small'); if(count)count.textContent=historyQuery?`${filteredLogs().length}件`:''; } });
document.querySelector('#settings-button').addEventListener('click', openSettings);
document.querySelector('#share-button').addEventListener('click', () => openShare());
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
