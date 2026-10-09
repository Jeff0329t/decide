const app = document.querySelector('#app');
const STORAGE_KEY = 'decide.tarot.logs.v1';
const SETTINGS_KEY = 'decide.tarot.settings.v1';
const TUTORIAL_KEY = 'decide.tarot.tutorial.v1';
const BACKUP_SCHEMA = 1;
const IMPORT_LIMIT_BYTES = 5 * 1024 * 1024;
const MARKDOWN_IMPORT_LIMIT_BYTES = 16 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

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

const MINOR_KEYWORDS = {
  'ワンド': [['始動','空回り'],['展望','迷走'],['展開','停滞'],['安定','内輪の乱れ'],['競争','衝突疲れ'],['勝利','自信過剰'],['防衛','消耗'],['急展開','行き違い'],['粘り強さ','疲弊'],['責任','抱えすぎ'],['好奇心','見切り発車'],['突破力','暴走'],['情熱と包容力','嫉妬'],['統率力','独断']],
  'カップ': [['心の始まり','感情の停滞'],['信頼関係','すれ違い'],['喜びの共有','馴れ合い'],['見直す時間','無関心'],['喪失からの気づき','後悔'],['懐かしさ','過去への執着'],['豊かな想像力','幻想'],['次へ進む','未練'],['満足','満たされない思い'],['幸福なつながり','関係の不調和'],['素直な感性','感情の未熟さ'],['理想を追う','気分の暴走'],['思いやり','自己犠牲'],['感情の成熟','感情の抑圧']],
  'ソード': [['明確な決断','判断の曇り'],['保留と均衡','決められない状態'],['痛みの直視','痛みの長期化'],['休息','休めない焦り'],['勝敗への固執','対立の回避'],['環境の移行','過去への停滞'],['戦略','不誠実'],['思考の束縛','思い込み'],['不安','不安からの回復'],['終止符','終わりへの抵抗'],['新しい発想','浅い判断'],['迅速な行動','性急さ'],['冷静な知性','批判的すぎる'],['合理的な判断','支配的な論理']],
  'ペンタクル': [['現実的な機会','機会損失'],['柔軟な両立','負担の偏り'],['技術と協力','連携不足'],['安定の確保','執着'],['不足からの学び','孤立'],['公平な分配','不公平'],['成果を待つ','見切りの早さ'],['技能の習得','単調さ'],['自立','依存'],['豊かさの継承','土台の不安定'],['実直な学び','準備不足'],['着実な前進','停滞'],['現実的な支え','抱え込み'],['安定した統率','物質への固執']]
};
const MAJOR_STORIES = {
  '愚者':'崖の縁へ軽やかに進む旅人は、未知への信頼と無垢な一歩を表します。足元の犬は、本能からの注意や旅の伴走者です。','魔術師':'片手を天へ、もう片手を地へ向け、机上の四元素を使う人物です。持っている力を現実の行動へ変える場面を描きます。','女教皇':'白と黒の柱の間で巻物を持つ人物は、言葉にならない知恵と秘密の境界を守っています。静けさの中で本質を見抜くカードです。','女帝':'実り豊かな大地に座る女帝は、創造・養育・豊かさを体現します。時間をかけて育て、受け取る力が物事を実らせます。','皇帝':'石の玉座に座る皇帝は、秩序・責任・境界線の象徴です。感情に流されず、長く維持できる土台を築きます。','教皇':'二人の信徒を前に祝福する教皇は、伝統・学び・共通の価値観を示します。信頼できる型から知恵を受け継ぐ場面です。','恋人':'天使の下に立つ二人は、愛だけでなく価値観に沿った選択を表します。何を選び、何に責任を持つかが問われます。','戦車':'異なる二頭のスフィンクスを意志で導く戦士です。相反する力を一つの方向へまとめ、前進する姿を描きます。','力':'女性が獅子を穏やかに扱う姿は、力で押さえつけるのではなく、忍耐と優しさで本能を導く強さを表します。','隠者':'山頂で灯りを掲げる老人は、外の評価から離れ、自分の経験と内なる光で道を探す姿です。','運命の輪':'回転する輪の周囲に複数の存在が描かれ、上昇と下降が繰り返されます。変化する流れと、巡ってきた機会の象徴です。','正義':'剣と天秤を持つ人物は、事実を見極め、行動の結果を引き受ける公平さを示します。','吊るされた男':'片足で逆さに吊られた人物は苦しむより穏やかに見えます。止まることで視点を反転し、新しい理解を得る場面です。','死神':'白馬に乗る死神の前で、立場を問わず人々が変化を迎えます。文字どおりの死ではなく、終わりと再生の避けられない節目です。','節制':'天使が二つの杯の水を混ぜています。異なるものを適切に配合し、無理のない中間点を作るカードです。','悪魔':'鎖につながれた二人と悪魔の姿は、欲望・執着・依存を表します。鎖は緩く、気づけば自分で外せることも示しています。','塔':'雷に打たれた塔から人々が落ちる場面です。誤った前提が突然崩れ、隠れていた真実が露わになる強制的な転換を描きます。','星':'裸の女性が水を大地と池へ注ぎ、頭上に星が輝きます。傷ついた後の回復、素直さ、未来への静かな希望を表します。','月':'月の下で犬と狼が吠え、道が遠くへ続きます。直感が働く一方、恐れや錯覚で先が見えにくい夜の旅です。','太陽':'大きな太陽の下で子どもが白馬に乗る姿は、明快さ・生命力・隠し事のない喜びを表します。','審判':'天使のラッパに応えて人々が立ち上がります。過去を振り返り、呼びかけに応えて再び生き方を選ぶ場面です。','世界':'輪の中央で人物が舞い、四隅の存在が見守ります。一つの旅の完成と、得た経験を携えて次へ進む統合のカードです。'
};
const MINOR_STORIES = {
  'ワンド':['雲から差し出された手が芽吹く棒を握り、創造的な火が生まれる瞬間です。','城壁の人物が地球儀を手に遠くを見つめ、可能性を比較しています。','高台の人物が海を進む船を眺め、選んだ方向の発展を待っています。','花輪の下で人々が祝う場面は、一区切りと安心できる居場所を示します。','五人の若者が棒を交差させ、意見や力がぶつかり合う活発な競争を描きます。','月桂冠の騎手を人々が迎え、努力が認められる勝利の場面です。','高所の人物が下から伸びる棒を防ぎ、自分の立場を守っています。','八本の棒が空を一直線に飛び、物事が速く動き始める瞬間です。','傷を負った人物が棒を背に立ち、疲れながらも最後まで警戒しています。','人物が十本の棒を抱えて町へ向かい、責任と負担を一人で運んでいます。','若者が芽吹く棒を見上げ、新しい興味や知らせに心を動かされています。','騎士が火のような勢いで馬を走らせ、情熱のまま挑戦へ向かいます。','ひまわりと黒猫を伴う女王は、温かさ・自信・人を惹きつける魅力の象徴です。','王は芽吹く棒を持ち、経験と情熱を使って大きな方向を示します。'],
  'カップ':['聖杯から水があふれ、感情・愛情・直感が満ち始める瞬間です。','二人が杯を交わし、互いを尊重する対等な結びつきを作っています。','三人の女性が杯を掲げ、友情と喜びを分かち合っています。','木の下の人物は差し出された杯に気づかず、心を閉じて考え込んでいます。','黒い衣の人物が倒れた杯を嘆きますが、背後にはまだ二つの杯が残っています。','子どもが花の入った杯を渡し、過去の純粋さや優しい記憶を呼び起こします。','雲に浮かぶ七つの杯には様々な幻が現れ、魅力的な可能性と迷いを示します。','人物が並んだ杯を残して山へ向かい、満たされない状況から離れます。','九つの杯を背に満足げに座る人物は、願いがかなった充足感を表します。','虹の下で家族が喜び、感情的な安心と長く続く幸福を描きます。','若者の杯から魚が顔を出し、予想外の感情や創造的な知らせが届きます。','白馬の騎士が杯を差し出し、理想や思いを丁寧に届けようとしています。','女王は精巧な杯を見つめ、深い共感と直感で感情を受け止めています。','荒れる海の中でも王は落ち着いて座り、感情を理解しながら支配されません。'],
  'ソード':['雲から伸びる手が冠を戴く剣を掲げ、真実を切り分ける明晰さが生まれます。','目隠しをした人物が剣を交差し、決められないまま均衡を保っています。','雨の中で三本の剣が心臓を貫き、避けられない痛みや真実を示します。','横たわる人物は剣の下で休み、戦いを離れて心身を回復させています。','剣を集める人物と去る人々の姿は、勝っても残る後味の悪さを描きます。','舟が静かな岸へ進み、痛みを抱えながらも環境を移していく場面です。','人物が剣を持ち去り、正面からではなく策略や単独行動で進もうとします。','縛られ目隠しされた人物の周囲に剣が立ち、思い込みによる閉塞を表します。','夜中に目覚めた人物が顔を覆い、不安や罪悪感が頭の中で膨らんでいます。','倒れた人物に十本の剣が刺さり、苦しい状況が限界と終わりを迎えます。','若者が剣を掲げ、風の中で周囲を注意深く観察しています。','騎士が剣を構えて突進し、結論へ一直線に進む強い意志を示します。','女王は剣を立て片手を差し出し、経験に基づく率直さと知性を示します。','王は正面を向き剣を掲げ、感情に流されない論理と責任ある判断を表します。'],
  'ペンタクル':['庭園の上に金貨が差し出され、仕事・お金・身体に関する具体的な機会が生まれます。','人物が二枚の金貨を無限大の輪で操り、変化の中で複数の役割を調整しています。','職人が聖堂で協力者と話し、技術を社会の中で形にしています。','人物が金貨を強く抱え、得たものを守る安心と失う恐れを同時に示します。','雪の中の二人が教会の窓のそばを通り、困難の中で支援を見落としています。','天秤を持つ人物が金貨を分け与え、与える側と受け取る側の均衡を描きます。','農夫が育てた作物を眺め、時間をかけた努力の成果を評価しています。','職人が一枚ずつ金貨を仕上げ、反復によって技術を身につけています。','豊かな庭園の女性は、自分で築いた実りと心地よい自立を味わっています。','家族・犬・建物と金貨が描かれ、世代を越えて続く豊かさと基盤を表します。','若者が金貨を真剣に見つめ、現実的な学びを始めようとしています。','騎士は動かない馬上で金貨を持ち、派手さより確実な継続を選びます。','女王は自然の中で金貨を抱き、現実的な世話と安心できる環境を作ります。','王は豊かな玉座に座り、資源を管理して安定を長く維持します。']
};
const SUIT_KEYWORDS={'ワンド':['行動','情熱'],'カップ':['感情','人間関係'],'ソード':['思考','コミュニケーション'],'ペンタクル':['仕事・お金','現実性']};
const RANK_KEYWORDS=['始まり','選択','成長','安定','試練','前進','見極め','進展','成熟','完成','学び','推進','受容','統率'];
const MAJOR_EXTRA_KEYWORDS={
  '愚者':['未知への一歩','自由','可能性'],'魔術師':['意志','技能','実行力'],'女教皇':['直感','沈黙','内なる知恵'],'女帝':['豊かさ','創造','養育'],'皇帝':['秩序','責任','安定'],'教皇':['伝統','学び','信頼'],'恋人':['愛','価値観','選択'],'戦車':['前進','自制','勝利'],'力':['勇気','忍耐','優しさ'],'隠者':['内省','探求','一人の時間'],'運命の輪':['転機','循環','好機'],'正義':['公平','真実','因果'],'吊るされた男':['停止','手放し','視点の転換'],'死神':['終わり','変容','再生'],'節制':['調和','中庸','統合'],'悪魔':['執着','誘惑','依存'],'塔':['崩壊','真実の露呈','解放'],'星':['希望','回復','素直さ'],'月':['不安','曖昧さ','直感'],'太陽':['成功','喜び','明快さ'],'審判':['目覚め','再評価','再出発'],'世界':['完成','統合','達成']
};

const savedSettings = load(SETTINGS_KEY, {});
const DEFAULT_CARD_BACK = DECIDE_CARD_BACKS[0][0];
let settings = { back:DEFAULT_CARD_BACK, feedback: savedSettings.feedback === true, cloudSync: savedSettings.cloudSync === true, deckMode: savedSettings.deckMode || (savedSettings.reversed === false ? 'all-upright' : 'all-reversed'), ...savedSettings };
settings.back = DEFAULT_CARD_BACK;
const DECK_MODES = ['major-upright','major-reversed','all-upright','all-reversed'];
if(!DECK_MODES.includes(settings.deckMode))settings.deckMode='all-reversed';
const DECK_PRESETS = [
  {mode:'major-upright',name:'シンプル',subtitle:'大アルカナ22枚・正位置のみ',one:'絵柄が印象的で、意味が分かりやすい。',benefit:'迷わず読める／初めてでも使いやすい',drawback:'日常の細かい場面までは出にくい',scene:'はじめての方。大きなテーマを考えたいとき'},
  {mode:'major-reversed',name:'深め',subtitle:'大アルカナ22枚・正位置と逆位置（44通り）',one:'22枚のまま、気をつけたい点も読める。',benefit:'一つの札を、両面から読める',drawback:'逆位置の読み方に、少し慣れが要る',scene:'大きな決断を、両面から見たいとき'},
  {mode:'all-upright',name:'いろいろ',subtitle:'全78枚・正位置のみ',one:'身近な場面まで、カードが広がる。',benefit:'仕事・お金・人間関係など、日常の具体的な場面が出る',drawback:'枚数が多く、選ぶのに少し時間がかかる',scene:'日々の迷いを整理したいとき'},
  {mode:'all-reversed',name:'くわしい',subtitle:'全78枚・正位置と逆位置（156通り）',one:'状況の細部まで、両面から読める。',benefit:'細やかな読みが得られる',drawback:'情報量が多く、読むのに時間がかかる',scene:'じっくり整理したいとき'}
];
let logs = (list=>Array.isArray(list) ? list.filter(log=>log && typeof log==='object' && typeof log.id==='string' && Array.isArray(log.nodes)) : [])(load(STORAGE_KEY, []));
let activeSession = null;
let currentView = 'home';
let homeStage = 'splash';
let detailId = null;
let completionId = null;
let selectedDecision = '';
let decisionDraft = {genre:'',option1:'',option2:'',title:'',memo:''};
let historyMode = 'list';
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = '';
let historyQuery = '';
let statsTab = 'summary';
let statsTheme = '';
let statsReview = '';
let statsPeriod = '';
let detailReturn = 'history';
let activeShareData = null;
let pendingImport = null;
let pendingSave = null;
let storageSaveFailed = false;
let a2hsBannerLogId = null;
let a2hsShownLogId = null;
let cardContentById = new Map();
let cardThemeLabels = {
  blind:'見落としていること', caution:'進むときの注意点', want:'本音（本当はどうしたい？）',
  letgo:'手放してよいこと', diff:'決め手になる違い'
};
let deepenThemeMap = {
  '見落としていること':'blind', '進むときの注意点':'caution', '本当はどうしたい？':'want',
  '手放してよいこと':'letgo', '決め手になる違い':'diff', '選択肢1を選ぶときの注意点':'caution',
  '選択肢2を選ぶときの注意点':'caution', '本当はどちらを望んでいる？':'want'
};
let cardContentPromise = null;
let activeCardDetail = null;
let tutorial = null;
let sharedPayload = readSharedPayload();
if(sharedPayload)currentView='shared';

function roman(num) {
  const map = [[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let out=''; for (const [v,s] of map) while(num >= v){ out += s; num -= v; } return out;
}
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function safeSetItem(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function persist() {
  const logsSaved=safeSetItem(STORAGE_KEY,JSON.stringify(logs));
  const settingsSaved=safeSetItem(SETTINGS_KEY,JSON.stringify(settings));
  storageSaveFailed=!(logsSaved && settingsSaved);
  window.DECIDE_SYNC?.schedule?.();
  return !storageSaveFailed;
}
function isStandalone() { return navigator.standalone===true || matchMedia('(display-mode: standalone)').matches; }
function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1); }
function inAppBrowser() { return /Line\/|FBAN|FBAV|Instagram|Twitter/i.test(navigator.userAgent); }
function shouldShowA2HS() { return isIOS() && !isStandalone() && Number(settings.a2hsDismissedUntil || 0)<=Date.now(); }
function shouldShowBackupReminder() {
  if(logs.length<3 || Number(settings.backupReminderDismissedUntil || 0)>Date.now())return false;
  const last=Date.parse(settings.lastBackupAt || '');
  return !Number.isFinite(last) || Date.now()-last>14*DAY_MS;
}
function storageEvent(action) { window.dispatchEvent(new CustomEvent('decide:storage',{detail:{action}})); }
function requestPersistentStorage() { try { Promise.resolve(navigator.storage?.persist?.()).catch(()=>{}); } catch {} }
function backupDateLabel(value) { return value ? `${formatDate(value, true)} に書き出しました` : 'まだバックアップしていません'; }
function backupFileName(date=new Date()) { const local=value=>String(value).padStart(2,'0'); return `decide-log-${date.getFullYear()}${local(date.getMonth()+1)}${local(date.getDate())}.json`; }
function backupPayload() { return { app:'DECIDE', schema:BACKUP_SCHEMA, exportedAt:new Date().toISOString(), logs }; }
function backupPayloadFor(records=logs) { const payload=backupPayload(); return records===logs ? payload : {...payload,logs:records}; }
function setBackupStatus(message, isError=false) { const status=document.querySelector('[data-backup-status]'); if(!status)return; status.textContent=message; status.classList.toggle('is-error',isError); }
function markBackupComplete(exportedAt) { settings.lastBackupAt=exportedAt; settings.backupReminderDismissedUntil=Date.now()+14*DAY_MS; persist(); const date=document.querySelector('[data-backup-date]'); if(date)date.textContent=backupDateLabel(exportedAt); document.querySelector('[data-backup-reminder]')?.remove(); }
function showBackupText(content) { const output=document.querySelector('[data-backup-output]'); const field=output?.querySelector('textarea'); if(!output || !field)return; field.value=content; output.hidden=false; setBackupStatus('ファイルとして保存できなかったため、内容をコピーできます。'); }
async function copyBackupText() { const field=document.querySelector('[data-backup-output] textarea'); if(!field)return; try { await navigator.clipboard.writeText(field.value); toast('バックアップ内容をコピーしました'); } catch { field.select(); document.execCommand('copy'); toast('バックアップ内容をコピーしました'); } }
async function exportLogs(records=logs, markComplete=true, format='json') {
  const payload=backupPayloadFor(records); const exportedAt=payload.exportedAt;
  const markdown=format==='markdown';
  const content=markdown ? DECIDE_BACKUP_FORMAT.render(payload) : JSON.stringify(payload,null,2);
  const filename=backupFileName(new Date(exportedAt)).replace(/\.json$/,markdown?'.md':'.json');
  const mime=markdown?'text/markdown':'application/json';
  const blob=new Blob([content],{type:mime}); const file=typeof File==='function' ? new File([blob],filename,{type:mime}) : null;
  if(file && navigator.canShare?.({files:[file]}) && navigator.share) {
    try { await navigator.share({files:[file],title:'DECIDEの履歴バックアップ'}); if(markComplete)markBackupComplete(exportedAt); toast('履歴を書き出しました'); return; }
    catch(error) { if(error?.name==='AbortError')return; }
  }
  const link=document.createElement('a');
  if('download' in link && URL?.createObjectURL) { const url=URL.createObjectURL(blob); link.href=url; link.download=filename; link.style.display='none'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); if(markComplete)markBackupComplete(exportedAt); toast('履歴を書き出しました'); return; }
  showBackupText(content); if(markComplete)markBackupComplete(exportedAt);
}
function isImportCard(card) { return Boolean(card) && typeof card==='object' && typeof card.id==='string' && card.id && typeof card.name==='string' && ['upright','reversed'].includes(card.orientation); }
function isImportLog(value) { return Boolean(value) && typeof value==='object' && typeof value.id==='string' && Boolean(value.id) && Array.isArray(value.nodes) && value.nodes.every(node=>node && typeof node==='object' && isImportCard(node.card)) && !Number.isNaN(Date.parse(value.createdAt || '')); }
function reviewedAtTime(log) { const value=Date.parse(log?.reviewedAt || ''); return Number.isNaN(value) ? 0 : value; }
function prepareImport(payload) {
  if(!payload || payload.app!=='DECIDE' || payload.schema!==BACKUP_SCHEMA || !Array.isArray(payload.logs))throw new Error('DECIDEのバックアップファイルではありません。');
  if(!payload.logs.every(isImportLog))throw new Error('履歴データの形式が正しくありません。');
  const ids=payload.logs.map(log=>log.id); if(new Set(ids).size!==ids.length)throw new Error('同じ履歴IDが重複しています。');
  const existing=new Map(logs.map(log=>[log.id,log])); const additions=[]; let duplicates=0; let reviewedUpdates=0;
  for(const incoming of payload.logs) {
    const current=existing.get(incoming.id);
    if(!current) { additions.push(incoming); existing.set(incoming.id,incoming); continue; }
    duplicates++;
    if(reviewedAtTime(incoming)>reviewedAtTime(current)) { existing.set(incoming.id,{...current,review:incoming.review ?? current.review,reviewedAt:incoming.reviewedAt}); reviewedUpdates++; }
  }
  const updated=logs.map(log=>existing.get(log.id));
  const dateValue=log=>Date.parse(log.createdAt || '') || 0;
  return { additions, duplicates, reviewedUpdates, mergedLogs:[...updated,...additions].sort((a,b)=>dateValue(b)-dateValue(a)) };
}
function openImportPicker(format='json') { const input=document.querySelector(format==='markdown'?'#import-markdown-file':'#import-file'); input?.click(); }
async function readImportFile(file) {
  if(!file)return;
  const markdown=/\.md$/i.test(file.name) || file.type==='text/markdown';
  const limit=markdown?MARKDOWN_IMPORT_LIMIT_BYTES:IMPORT_LIMIT_BYTES;
  if(file.size>limit) { setBackupStatus(`ファイルは${markdown?'16':'5'}MB以下にしてください。`,true); return; }
  try {
    const content=await file.text();
    const payload=markdown?DECIDE_BACKUP_FORMAT.parse(content):JSON.parse(content);
    pendingImport=prepareImport(payload);
    closeSettings(); setTimeout(openImportConfirm,190);
  } catch(error) { setBackupStatus(error instanceof Error ? error.message : 'ファイルを読み込めませんでした。',true); }
}
function openImportConfirm() {
  if(!pendingImport)return;
  const {additions,duplicates,reviewedUpdates}=pendingImport;
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='import-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="close-import" aria-label="読み込み確認を閉じる"></button><section class="settings-sheet confirm-sheet import-sheet" role="dialog" aria-modal="true" aria-labelledby="import-title"><div class="sheet-handle"></div><p class="eyebrow">Import backup</p><h2 id="import-title">履歴を読み込みますか？</h2><p>既存の履歴は残したまま、バックアップの内容を追加します。</p><dl class="import-summary"><div><dt>追加</dt><dd>${additions.length}件</dd></div><div><dt>重複</dt><dd>${duplicates}件</dd></div>${reviewedUpdates ? `<div><dt>振り返り更新</dt><dd>${reviewedUpdates}件</dd></div>` : ''}</dl><p class="import-note">同じIDの履歴は既存内容を優先し、より新しい振り返り日時だけを反映します。</p><p class="storage-error" data-import-error role="alert" hidden></p><div class="confirm-actions"><button class="button secondary" data-action="close-import">キャンセル</button><button class="button" data-action="confirm-import">取り込む</button></div></section>`;
  mountModal(wrap,'.settings-sheet [data-action="close-import"]');
}
function closeImport() { pendingImport=null; closeModal('#import-modal'); }
function confirmImport() {
  if(!pendingImport)return; const {additions,reviewedUpdates,mergedLogs}=pendingImport;
  if(!safeSetItem(STORAGE_KEY,JSON.stringify(mergedLogs))) {
    storageSaveFailed=true;
    const error=document.querySelector('[data-import-error]');
    if(error){error.textContent='この端末では保存できませんでした。履歴は変更していません。空き容量やブラウザの設定を確認してください。';error.hidden=false;}
    return;
  }
  logs=mergedLogs; pendingImport=null; window.DECIDE_SYNC?.schedule?.(); closeModal('#import-modal');
  if(currentView==='history')renderHistory(); toast(`履歴を${additions.length}件追加しました${reviewedUpdates ? `（振り返り${reviewedUpdates}件を更新）` : ''}`);
}
function esc(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function contentCardId(card={}) {
  const imageMatch=String(card.image || '').match(/(?:^|\/)(ar|wa|cu|sw|pe)(\d{2})\.jpg(?:[?#].*)?$/i);
  if(imageMatch)return `${imageMatch[1].toLowerCase()}${imageMatch[2]}`;
  if(/^(ar|wa|cu|sw|pe)\d{2}$/i.test(card.id || ''))return card.id.toLowerCase();
  if(/^M\d+$/.test(card.id || ''))return `ar${String(Number(card.id.slice(1))).padStart(2,'0')}`;
  const minor=String(card.id || '').match(/^m(\d)-(\d+)$/);
  if(minor)return `${['wa','cu','sw','pe'][Number(minor[1])]}${String(Number(minor[2])+1).padStart(2,'0')}`;
  return '';
}
function cardContent(card) { return cardContentById.get(contentCardId(card)); }
function orientationContent(card, orientation=card?.orientation || 'upright') { return cardContent(card)?.[orientation]; }
function themeKey(question='') { return deepenThemeMap[question] || 'blind'; }
function validCardContent(data) {
  return data && Array.isArray(data.cards) && data.cards.length===78 && data.cards.every(card =>
    card?.id && card?.name && card?.upright?.meaning && card?.reversed?.meaning &&
    ['upright','reversed'].every(direction => Array.isArray(card[direction].keywords) && ['blind','caution','want','letgo','diff'].every(key => card[direction].themes?.[key]))
  );
}
function loadCardContent() {
  if(cardContentPromise)return cardContentPromise;
  cardContentPromise=fetch('./assets/cards.json',{cache:'force-cache'}).then(response=>{
    if(!response.ok)throw new Error('カード原稿を読み込めませんでした。');
    return response.json();
  }).then(data=>{
    if(!validCardContent(data))throw new Error('カード原稿の形式が正しくありません。');
    cardContentById=new Map(data.cards.map(card=>[card.id,card]));
    cardThemeLabels={...cardThemeLabels,...data.themes};
    deepenThemeMap={...deepenThemeMap,...data.deepenThemeMap};
    if(['session','detail','shared'].includes(currentView) && !document.querySelector('.modal-wrap')) {
      const scrollY=window.scrollY; render(); requestAnimationFrame(()=>window.scrollTo(0,scrollY));
    }
    return data;
  }).catch(()=>null);
  return cardContentPromise;
}
function formatDate(iso, withTime=false) {
  const date=new Date(iso); if(Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'short', day:'numeric', ...(withTime ? {hour:'2-digit',minute:'2-digit'} : {}) }).format(date);
}
function randomCard(exclude=[]) {
  const source = settings.deckMode.startsWith('major') ? MAJOR : DECK;
  const pool = source.filter(c => !exclude.includes(c.id));
  const base = pool[Math.floor(Math.random() * pool.length)];
  const useReversed = settings.deckMode.endsWith('reversed');
  return { ...base, orientation: useReversed && Math.random() < .28 ? 'reversed' : 'upright' };
}
function shuffledDeck(source=settings.deckMode.startsWith('major') ? MAJOR : DECK) {
  const useReversed=settings.deckMode.endsWith('reversed');
  return source.map(card=>({...card,orientation:useReversed && Math.random()<.28 ? 'reversed' : 'upright'})).sort(()=>Math.random()-.5);
}
function meaning(card) {
  return orientationContent(card)?.meaning || '';
}
function cardStory(card) {
  return cardContent(card)?.story || '';
}
function cardKeywords(card) {
  const keywords=orientationContent(card)?.keywords;
  return Array.isArray(keywords) ? keywords : [];
}
function orientationLabel(card) { return card.orientation === 'upright' ? '正位置' : '逆位置'; }
function cardImage(card) {
  if (card.image) return card.image;
  if (card.id?.startsWith('M')) return `./assets/rider-waite/ar${String(Number(card.id.slice(1))).padStart(2,'0')}.jpg`;
  const match=card.id?.match(/^m(\d)-(\d+)$/); if(!match)return '';
  const codes=['wa','cu','sw','pe']; return `./assets/rider-waite/${codes[Number(match[1])]}${String(Number(match[2])+1).padStart(2,'0')}.jpg`;
}
function cardWebpSrcset(card) {
  const jpg=cardImage(card);
  return /\.jpg$/i.test(jpg) ? `${jpg.slice(0,-4)}-320.webp 320w, ${jpg.slice(0,-4)}-480.webp 480w` : '';
}
const CARD_IMAGE_HEIGHTS = [
  805,832,825,821,825,827,821,829,827,821,835,827,844,829,833,846,831,827,829,827,827,829,
  833,827,836,832,832,824,831,827,827,837,831,827,824,835,829,831,825,824,822,827,831,827,827,831,827,831,827,822,
  831,822,836,825,831,829,827,827,827,833,832,829,835,825,831,829,825,830,829,831,827,825,832,827,829,829,831,833
];
function cardImageHeight(card) {
  const match=cardImage(card).match(/(?:ar|wa|cu|sw|pe)(\d{2})\.jpg$/);
  const code=cardImage(card).match(/(ar|wa|cu|sw|pe)\d{2}\.jpg$/)?.[1];
  if(!match || !code)return 830;
  const rank=Number(match[1]);
  const start={ar:0,wa:22,cu:36,sw:50,pe:64}[code];
  return CARD_IMAGE_HEIGHTS[start + rank - (code==='ar'?0:1)] || 830;
}
function cardPicture(card, {className='',alt=card.name,sizes='160px',attributes=''}={}) {
  const src=esc(cardImage(card));
  const srcset=cardWebpSrcset(card);
  return `<picture>${srcset ? `<source type="image/webp" srcset="${esc(srcset)}" sizes="${sizes}">` : ''}<img data-card-image width="480" height="${cardImageHeight(card)}" class="${className}" src="${src}" alt="${esc(alt)}" ${attributes}></picture>`;
}
const cardImagePromises=new Map();
function preloadCardImage(card) {
  const src=cardImage(card); if(!src)return Promise.resolve(false);
  if(cardImagePromises.has(src))return cardImagePromises.get(src);
  const promise=new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>{
      const decoded=typeof image.decode==='function' ? image.decode() : null;
      if(decoded?.then)decoded.catch(()=>{}).finally(()=>resolve(true));
      else resolve(true);
    };
    image.onerror=()=>{
      if(image.srcset){ image.srcset=''; image.src=src; }
      else resolve(false);
    };
    image.srcset=cardWebpSrcset(card);
    image.sizes='160px';
    image.src=src;
  });
  cardImagePromises.set(src,promise);
  return promise;
}
function preloadCardImages(cards=[]) { return Promise.all(cards.filter(Boolean).map(preloadCardImage)); }
function prepareCardImage(image) {
  if (!(image instanceof HTMLImageElement) || !image.matches('[data-card-image]')) return;
  const reveal=()=>image.classList.add('is-loaded');
  if (image.complete && image.naturalWidth) reveal();
  else image.addEventListener('load',reveal,{once:true});
}
const cardImageObserver=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
  if (!(node instanceof Element)) return;
  if (node.matches('[data-card-image]')) prepareCardImage(node);
  node.querySelectorAll?.('[data-card-image]').forEach(prepareCardImage);
})));
cardImageObserver.observe(document.body,{childList:true,subtree:true});
function nodeReading(node, mode='one', index=0) {
  const copy=orientationContent(node?.card);
  if(!copy)return {heading:orientationLabel(node?.card || {}),body:''};
  const initialCount=mode==='two' ? 2 : 1;
  if(index>=initialCount) {
    const themed=copy.themes?.[themeKey(node.question)];
    return {heading:copy.keywords[0],body:themed || copy.meaning};
  }
  const keywordCount=mode==='two' ? copy.keywords.length : 2;
  return {heading:copy.keywords.slice(0,keywordCount).join('・'),body:copy.meaning};
}

function sensoryFeedback(kind='tap') {
  if (!settings.feedback) return;
  try { navigator.vibrate?.(kind === 'tick' ? 3 : kind === 'reveal' ? [10, 24, 12] : kind === 'save' ? [18, 24, 24] : 8); } catch {}
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const context = sensoryFeedback.context ||= new Audio();
    const now = context.currentTime;
    const tones = kind === 'tick' ? [[720,0]] : kind === 'reveal' ? [[392,0],[523.25,.055]] : kind === 'save' ? [[440,0],[659.25,.09]] : [[520,0]];
    tones.forEach(([frequency,delay]) => {
      const oscillator=context.createOscillator(); const gain=context.createGain();
      oscillator.type='sine'; oscillator.frequency.setValueAtTime(frequency,now+delay);
      const volume=kind === 'tick' ? .014 : .045; const duration=kind === 'tick' ? .045 : .16;
      gain.gain.setValueAtTime(.0001,now+delay); gain.gain.exponentialRampToValueAtTime(volume,now+delay+.008); gain.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);
      oscillator.connect(gain).connect(context.destination); oscillator.start(now+delay); oscillator.stop(now+delay+duration+.02);
    });
  } catch {}
}
function setupFanFeedback(deck) {
  let last=Math.round(deck.scrollLeft/38); let ticking=false;
  const updateCenter=()=>{
    const center=deck.getBoundingClientRect().left+deck.clientWidth/2;
    let nearest=null; let distance=Infinity;
    deck.querySelectorAll('.flip-card:not(:disabled)').forEach(card=>{
      card.classList.remove('is-centered');
      const box=card.getBoundingClientRect();
      const nextDistance=Math.abs(box.left+box.width/2-center);
      if(nextDistance<distance){distance=nextDistance;nearest=card;}
    });
    nearest?.classList.add('is-centered');
  };
  updateCenter();
  deck.addEventListener('scroll',()=>{ if(ticking)return; ticking=true; requestAnimationFrame(()=>{ const next=Math.round(deck.scrollLeft/38); if(next!==last){last=next;sensoryFeedback('tick');} updateCenter(); ticking=false; }); },{passive:true});
  window.addEventListener('resize',updateCenter,{passive:true,once:true});
}

function updateNavigationState(view=currentView) {
  const selected=view==='history' || view==='detail' ? 'history' : view==='stats' ? 'stats' : view==='home' ? 'home' : '';
  const bottomNav=document.querySelector('.bottom-nav');
  if(bottomNav)bottomNav.style.display=['history','detail','stats','session','decide','prepare-genre','prepare-options','draw'].includes(view)?'grid':'';
  document.querySelectorAll('.nav-item').forEach(item=>{
    const active=item.dataset.nav===selected;
    item.classList.toggle('active',active);
    if(active)item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
  });
  const back=document.querySelector('.nav-back');
  if(back){
    // 表示は「戻る」に統一し、戻り先は読み上げ用ラベルで補う
    const labels={detail:detailReturn==='stats'?'統計へ戻る':'ログへ戻る',decide:'結果へ戻る',learn:'設定へ戻る'};
    back.querySelector('span').textContent='戻る';
    back.setAttribute('aria-label',labels[view]||'戻る');
    back.disabled=view==='home'&&homeStage==='splash';
  }
}
function navigateBack() {
  const deepToggle=document.querySelector('.deep-menu-open [data-action="toggle-reflection"][aria-expanded="true"]');
  if(deepToggle)return toggleReflection(deepToggle);
  if(currentView==='detail')return navigate(detailReturn);
  if(currentView==='prepare-options'){ captureDecisionDraft(); return navigate('prepare-genre'); }
  if(currentView==='decide'){ captureDecisionDraft(); return navigate('session'); }
  if(currentView==='learn'){ window.DECIDE_LEARN?.close?.(); return; }
  if(currentView==='home'&&homeStage==='quickstart'){ homeStage='splash'; return renderHome(); }
  activeSession=null; completionId=null; homeStage='quickstart'; navigate('home');
}
function navigate(view, id=null) {
  if(tutorial && ['home','history','detail','decide'].includes(view))finishTutorial('skipped',false);
  if(view==='detail'&&currentView!=='detail')detailReturn=currentView==='stats'?'stats':'history';
  currentView = view; detailId = id;
  render(); requestAnimationFrame(() => { window.scrollTo({top:0,left:0,behavior:'instant'}); app.focus({preventScroll:true}); });
}
function render() {
  document.body.classList.toggle('learn-active',currentView==='learn');
  document.body.classList.toggle('has-logs',logs.length>0);
  document.body.dataset.view=currentView;
  if(currentView!=='detail')delete document.body.dataset.detailMode;
  updateNavigationState();
  try {
    if (currentView === 'shared') return renderSharedResult();
    if (currentView === 'prepare-genre' || currentView === 'prepare-options') return renderPreparation();
    if (currentView === 'draw') return renderDraw();
    if (currentView === 'session') return renderSession();
    if (currentView === 'decide') return renderDecision();
    if (currentView === 'history') return renderHistory();
    if (currentView === 'stats') return renderStats();
    if (currentView === 'detail') return renderDetail();
    if (currentView === 'learn') return window.DECIDE_LEARN.render();
    return renderHome();
  } catch(error) {
    console.error('DECIDE render error',error);
    currentView='home'; detailId=null; activeSession=null; updateNavigationState('home');
    try { return renderHome(); }
    catch {
      app.replaceChildren();
      const section=document.createElement('section'); section.className='screen empty-state';
      const heading=document.createElement('h1'); heading.textContent='DECIDE';
      const message=document.createElement('p'); message.textContent='画面を読み直してください。';
      section.append(heading,message); app.append(section);
    }
  }
}

function renderHome() {
  const last = logs[0];
  document.body.classList.toggle('has-logs',logs.length>0);
  const deckCount=settings.deckMode.startsWith('major') ? 22 : 78;
  document.body.dataset.homeStage=homeStage;
  if(homeStage==='splash') {
    app.innerHTML = `
      <section class="screen home-screen splash-screen">
        <div class="splash-copy">
          <h1 class="home-wordmark">DECIDE<span>.</span></h1>
          <p class="home-tagline">心から納得いく決断を。</p>
        </div>
        <p class="splash-sidecopy">A TOOL<br>FOR<br>BETTING<br>ON YOU.</p>
        <div class="splash-start">
          <button data-action="start-app" aria-label="DECIDEをはじめる"><span>→</span></button>
          <b>はじめる</b>
        </div>
      </section>`;
    return;
  }
  app.innerHTML = `
    <section class="screen home-screen quickstart-screen">
      <header class="quickstart-brand" aria-label="DECIDE.">
        <small aria-hidden="true">TAROT FOR DECISIONS</small>
        <h1 aria-hidden="true"><span class="qb-word">DECIDE</span><span class="qb-dot">.</span></h1>
        <p aria-hidden="true"><i>No.</i>迷ったら、ここへ。</p>
      </header>
      <p class="quickstart-title">どちらの方法で<wbr>考えますか？</p>
      <div class="choice-grid">
        <div class="quickstart-plate" aria-hidden="true"><small>CHOOSE</small><span>YOUR DRAW</span></div>
        <button class="draw-choice primary" data-action="start" data-mode="one"><span class="choice-kicker" aria-hidden="true">SOLO · 1 CARD</span><span class="mode-art one-art" aria-hidden="true"><i class="card-back back-${settings.back}"></i></span><span class="choice-stamp" aria-hidden="true">DRAW!</span><strong>1枚引き</strong><span>ひとつの迷いを考える</span><small>${deckCount} CARDS</small></button>
        <button class="draw-choice" data-action="start" data-mode="two"><span class="choice-kicker" aria-hidden="true">DUEL · A or B</span><span class="mode-art two-art" aria-hidden="true"><i class="card-back back-${settings.back}"></i><i class="card-back back-${settings.back}"></i><b class="choice-vs">OR</b></span><span class="choice-stamp" aria-hidden="true">DRAW!</span><strong>2枚引き</strong><span>2つの選択肢を比べる</span><small>${deckCount} CARDS</small></button>
      </div>
      <button class="quickstart-help" data-action="tutorial-open">使い方を見る</button>
      ${last ? `<button class="last-log" data-action="detail" data-id="${esc(last.id)}"><span>最近の決定</span><strong>${esc(last.title)}</strong><small>${esc(DECIDE_DECISION.choiceText(last.decision))} · ${formatDate(last.createdAt)}</small></button>` : ''}
    </section>`;
}

function tutorialEvent(action, step) { window.dispatchEvent(new CustomEvent('decide:tutorial',{detail:{action,step}})); }
function shouldAutoStartTutorial() {
  if(currentView!=='home' || sharedPayload || logs.length || tutorial || homeStage!=='quickstart')return false;
  try { return localStorage.getItem(TUTORIAL_KEY)===null; } catch { return false; }
}
// step: 1=DRAW, 2=DECIDE, 3=LOOK BACK (the intro has no page number)
function tutorialProgress(step) {
  const dots=document.createElement('div'); dots.className='tutorial-progress'; dots.setAttribute('aria-label',`${step}/3`);
  const pageNo=document.createElement('b'); pageNo.className='tutorial-page-no'; pageNo.setAttribute('aria-hidden','true'); pageNo.innerHTML=`${String(step).padStart(2,'0')}<small>/ 03</small>`; dots.append(pageNo);
  for(let index=1;index<=3;index++){ const dot=document.createElement('span'); dot.className=index===step?'current':''; dot.setAttribute('aria-hidden','true'); dots.append(dot); }
  return dots;
}
function startTutorialIntro() {
  if(tutorial || currentView!=='home')return;
  tutorial={stage:1,selectedKeyword:null,returnFocus:document.activeElement};
  tutorialEvent('start',1);
  const wrap=document.createElement('div'); wrap.id='tutorial-intro'; wrap.className='tutorial-intro';
  const dialog=document.createElement('section'); dialog.className='tutorial-intro-card'; dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-labelledby','tutorial-intro-title');
  const heading=document.createElement('h2'); heading.id='tutorial-intro-title'; heading.textContent='心から納得いく決断を。';
  const lines=document.createElement('div'); lines.className='tutorial-intro-lines';
  [['DRAW','迷いを1つ思い浮かべ、カードを直感で1枚引く'],['DECIDE','カードの言葉をヒントに自分で決めて、ログに残す'],['LOOK BACK','後日、その決断がどうだったかレビューする。決断の傾向がわかり、決める精度が上がっていく']].forEach(([kicker,copy],index)=>{ const line=document.createElement('p'); const no=document.createElement('b'); no.textContent=`${index+1} ${kicker}`; const text=document.createElement('span'); text.textContent=copy; line.append(no,text); lines.append(line); });
  const note=document.createElement('p'); note.className='tutorial-intro-note'; note.textContent='カードは答えを決めません。決めるのは、あなたです。';
  const actions=document.createElement('div'); actions.className='tutorial-intro-actions';
  const skipBottom=document.createElement('button'); skipBottom.className='tutorial-intro-skip-bottom'; skipBottom.dataset.action='tutorial-skip'; skipBottom.innerHTML='<small>SKIP</small>スキップ';
  const start=document.createElement('button'); start.className='button tutorial-intro-start'; start.dataset.action='tutorial-start'; start.textContent='やってみる';
  actions.append(skipBottom,start);
  dialog.append(heading,lines,note,actions); wrap.append(dialog);
  document.body.append(wrap); setBodyScrollLocked(true); setBackgroundInert(true); start.focus();
}
function releaseTutorialIntro() {
  const intro=document.querySelector('#tutorial-intro'); if(!intro)return;
  intro.remove();
  setBackgroundInert(false); setBodyScrollLocked(false);
}
function setTutorialInactive(element) { if(!element)return; element.inert=true; element.dataset.tutorialInert=''; }
function restoreTutorialControls() {
  document.querySelectorAll('[data-tutorial-inert]').forEach(element=>{ element.inert=false; delete element.dataset.tutorialInert; });
  document.body.classList.remove('tutorial-running');
}
function tutorialCallout(copy) {
  const bubble=document.createElement('aside'); bubble.className='tutorial-callout'; bubble.setAttribute('role','status'); bubble.setAttribute('aria-live','polite');
  const text=document.createElement('p'); bubble.append(text);
  requestAnimationFrame(()=>{ if(bubble.isConnected)text.textContent=copy; });
  return bubble;
}
function renderTutorialStage() {
  if(!tutorial || ![2,3].includes(tutorial.stage))return;
  const page=tutorial.stage-1;
  restoreTutorialControls(); document.body.classList.add('tutorial-running');
  document.querySelectorAll('.tutorial-guidance').forEach(element=>element.remove());
  const screen=app.querySelector(tutorial.stage===2?'.draw-screen':'.map-screen'); if(!screen)return;
  const controls=document.createElement('div'); controls.className='tutorial-guidance tutorial-stage-controls';
  const skip=document.createElement('button'); skip.dataset.action='tutorial-skip'; skip.textContent='スキップ'; controls.append(tutorialProgress(page),skip); document.body.append(controls);
  let target;
  if(tutorial.stage===2) {
    setTutorialInactive(document.querySelector('.topbar')); setTutorialInactive(document.querySelector('.bottom-nav'));
    [...screen.children].filter(element=>!element.classList.contains('fan-deck') && !element.classList.contains('tutorial-guidance')).forEach(setTutorialInactive);
    target=screen.querySelector('.fan-deck');
    const bubble=tutorialCallout('迷いを1つ、思い浮かべてください。気になるカードを1枚、タップ。'); bubble.classList.add('tutorial-guidance'); target?.before(bubble);
  } else {
    const node=screen.querySelector('.thought-node'); const reading=node?.querySelector('.reading'); const reflection=node?.querySelector('.reflection-card');
    if(!node || !reading || !reflection)return;
    setTutorialInactive(reflection); setTutorialInactive(node.querySelector('.compact-card'));
    if(tutorial.phase==='keyword') {
      target=reading;
      const bubble=tutorialCallout(tutorial.selectedKeyword!==null?'その言葉が、迷いを整理する入口になるかもしれません。':'この中で、いま心に引っかかる言葉はどれですか？（1つ選んでください）'); bubble.classList.add('tutorial-guidance');
      const chips=document.createElement('div'); chips.className='tutorial-keywords';
      cardKeywords(activeSession.nodes[0].card).forEach((keyword,index)=>{ const button=document.createElement('button'); button.dataset.action='tutorial-keyword'; button.dataset.index=String(index); button.textContent=keyword; button.setAttribute('aria-pressed',String(tutorial.selectedKeyword===index)); if(tutorial.selectedKeyword===index)button.classList.add('selected'); chips.append(button); });
      bubble.append(chips); reading.after(bubble);
    } else {
      target=reflection; reflection.classList.add('tutorial-highlight');
      const bubble=tutorialCallout('しっくりきたら『決める』へ。決めたことはログに残ります。まだ引っかかるなら、別の角度からもう1枚引けます。'); bubble.classList.add('tutorial-guidance');
      const done=document.createElement('button'); done.className='button'; done.dataset.action='tutorial-next'; done.textContent='次へ'; bubble.append(done); reflection.before(bubble);
    }
  }
  requestAnimationFrame(()=>target?.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'}));
}
function beginTutorialDraw() {
  if(tutorial?.stage!==1)return;
  releaseTutorialIntro(); tutorial.stage=2; tutorialEvent('step',2);
  activeSession={id:crypto.randomUUID?.()||String(Date.now()),mode:'one',startedAt:new Date().toISOString(),nodes:[],drawOptions:shuffledDeck(MAJOR),revealed:[],tutorial:true};
  selectedDecision=''; decisionDraft={genre:'',option1:'',option2:'',title:'',memo:''}; navigate('draw');
}
function beginTutorialResult() {
  if(tutorial?.stage!==2)return;
  tutorial.stage=3; tutorial.phase='keyword'; tutorialEvent('step',3); navigate('session');
}
function chooseTutorialKeyword(index) {
  if(tutorial?.stage!==3 || tutorial.phase!=='keyword' || !cardKeywords(activeSession.nodes[0].card)[index])return;
  tutorial.selectedKeyword=index; renderTutorialStage();
  setTimeout(()=>{ if(tutorial?.stage===3 && tutorial.phase==='keyword' && tutorial.selectedKeyword===index){ tutorial.phase='reflection'; tutorialEvent('step',3); renderTutorialStage(); } },1400);
}
function tutorialOverlay(step, kind, headingText) {
  const wrap=document.createElement('div'); wrap.id='tutorial-intro'; wrap.className=`tutorial-intro tutorial-lookback ${kind}`;
  const dialog=document.createElement('section'); dialog.className='tutorial-intro-card'; dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-labelledby','tutorial-lookback-title');
  const top=document.createElement('div'); top.className='tutorial-lookback-top';
  const skip=document.createElement('button'); skip.className='tutorial-lookback-skip'; skip.dataset.action='tutorial-skip'; skip.textContent='スキップ';
  top.append(tutorialProgress(step),skip);
  const heading=document.createElement('h2'); heading.id='tutorial-lookback-title'; heading.textContent=headingText;
  dialog.append(top,heading); wrap.append(dialog);
  return {wrap,dialog};
}
function tutorialDrawnText() {
  const card=activeSession?.nodes?.[0]?.card; const keyword=card && tutorial.selectedKeyword!==null ? cardKeywords(card)[tutorial.selectedKeyword] : '';
  return card ? `引いたカード：${card.name}${keyword?`／「${keyword}」`:''}` : '引いたカードと、選んだ言葉';
}
function tutorialMockField(label, value, className='') {
  const row=document.createElement('div'); row.className=`tutorial-mock-field ${className}`.trim();
  const name=document.createElement('span'); name.textContent=label;
  const text=document.createElement('p'); text.textContent=value;
  row.append(name,text); return row;
}
function beginTutorialLog() {
  if(tutorial?.stage!==3 || tutorial.phase!=='reflection')return;
  tutorial.phase='log'; tutorial.decision=null; tutorialEvent('step',3);
  document.querySelectorAll('.tutorial-guidance').forEach(element=>element.remove()); restoreTutorialControls();
  const {wrap,dialog}=tutorialOverlay(2,'tutorial-logstep','決めたら、ログに残す。');
  const lead=document.createElement('p'); lead.className='tutorial-log-lead'; lead.textContent='1件のログに、こんなことが残ります。';
  const log=document.createElement('article'); log.className='tutorial-mock-log';
  const meta=document.createElement('p'); meta.className='tutorial-mock-meta'; meta.innerHTML=`<b>DECISION LOG</b><span>${new Date().toLocaleDateString('ja-JP',{month:'long',day:'numeric'})}（今日）</span>`;
  const title=document.createElement('h3'); title.textContent='さっき思い浮かべた迷い';
  const drawn=document.createElement('p'); drawn.className='tutorial-mock-card'; drawn.textContent=tutorialDrawnText();
  const question=document.createElement('p'); question.className='tutorial-mock-question'; question.textContent='決めたこと';
  const choices=document.createElement('div'); choices.className='tutorial-mock-decisions';
  ['進む','見送る','保留する'].forEach(value=>{ const button=document.createElement('button'); button.dataset.action='tutorial-decision'; button.dataset.value=value; button.setAttribute('aria-pressed','false'); button.textContent=value; choices.append(button); });
  const memo=tutorialMockField('決め手・今の気持ち（ひとことメモ）','例）不安はあるけど、今やらないと後悔しそう','tutorial-mock-memo');
  log.append(meta,title,drawn,question,choices,memo);
  const hint=tutorialCallout('試しに「決めたこと」を1つ選んでみてください（保存はされません）'); hint.classList.add('tutorial-lookback-callout');
  dialog.append(lead,log,hint);
  document.body.append(wrap); setBodyScrollLocked(true); setBackgroundInert(true); choices.querySelector('button')?.focus();
}
function chooseTutorialDecision(value) {
  if(tutorial?.stage!==3 || tutorial.phase!=='log')return;
  const intro=document.querySelector('#tutorial-intro.tutorial-logstep'); if(!intro)return;
  const first=tutorial.decision===null; tutorial.decision=value;
  intro.querySelectorAll('[data-action="tutorial-decision"]').forEach(button=>{ const on=button.dataset.value===value; button.classList.toggle('selected',on); button.setAttribute('aria-pressed',String(on)); });
  if(!first)return;
  intro.querySelector('.tutorial-lookback-callout')?.remove();
  const bubble=tutorialCallout('決めた理由や気持ちは、時間が経つと忘れたり、結果に合わせて書き換わったりします。その時の考えを残しておくと、後で結果と正直に比べられます。'); bubble.classList.add('tutorial-lookback-callout');
  const next=document.createElement('button'); next.className='button'; next.dataset.action='tutorial-log-next'; next.textContent='次へ'; bubble.append(next);
  intro.querySelector('.tutorial-intro-card').append(bubble);
  requestAnimationFrame(()=>bubble.scrollIntoView({block:'nearest',behavior:'auto'}));
}
function beginTutorialLookBack() {
  if(tutorial?.stage!==3 || tutorial.phase!=='log' || !tutorial.decision)return;
  releaseTutorialIntro();
  tutorial.stage=4; tutorial.review=null; tutorialEvent('step',4);
  const {wrap,dialog}=tutorialOverlay(3,'tutorial-reviewstep','後日、その決断をレビューする。');
  const log=document.createElement('article'); log.className='tutorial-mock-log';
  const meta=document.createElement('p'); meta.className='tutorial-mock-meta'; meta.innerHTML='<b>DECISION LOG</b><span>30日後</span>';
  const title=document.createElement('h3'); title.textContent='さっき思い浮かべた迷い';
  const drawn=document.createElement('p'); drawn.className='tutorial-mock-card'; drawn.textContent=tutorialDrawnText();
  const past=document.createElement('div'); past.className='tutorial-mock-past';
  past.append(tutorialMockField('決めたこと',tutorial.decision),tutorialMockField('その時の気持ち','例）不安はあるけど、今やらないと後悔しそう'));
  const question=document.createElement('p'); question.className='tutorial-mock-question'; question.textContent='この選択、その後どうでした？';
  const grid=document.createElement('div'); grid.className='review-grid tutorial-mock-reviews';
  ['良かった','まあ良かった','どちらとも言えない','違った'].forEach(value=>{ const button=document.createElement('button'); button.className='review-button'; button.dataset.action='tutorial-review'; button.dataset.value=value; button.setAttribute('aria-pressed','false'); button.innerHTML=`<b>${reviewIcon(value)}</b><span>${value}</span>`; grid.append(button); });
  log.append(meta,title,drawn,past,question,grid);
  const hint=tutorialCallout('当時の気持ちと見比べながら、試しに1つ選んでみてください（保存はされません）'); hint.classList.add('tutorial-lookback-callout');
  dialog.append(log,hint);
  document.body.append(wrap); setBodyScrollLocked(true); setBackgroundInert(true); grid.querySelector('button')?.focus();
}
function chooseTutorialReview(value) {
  if(tutorial?.stage!==4)return;
  const intro=document.querySelector('#tutorial-intro.tutorial-reviewstep'); if(!intro)return;
  const first=tutorial.review===null; tutorial.review=value;
  intro.querySelectorAll('[data-action="tutorial-review"]').forEach(button=>{ const on=button.dataset.value===value; button.classList.toggle('selected',on); button.setAttribute('aria-pressed',String(on)); });
  if(!first)return;
  intro.querySelector('.tutorial-lookback-callout')?.remove();
  const bubble=tutorialCallout('レビューが貯まると、自分の決断の傾向がわかります。どんなときにうまくいくかが見えて、決める精度が上がっていきます。'); bubble.classList.add('tutorial-lookback-callout');
  const done=document.createElement('button'); done.className='button'; done.dataset.action='tutorial-complete'; done.textContent='わかった'; bubble.append(done);
  intro.querySelector('.tutorial-intro-card').append(bubble);
  requestAnimationFrame(()=>bubble.scrollIntoView({block:'nearest',behavior:'auto'}));
}
function finishTutorial(status, redirect=true) {
  if(!tutorial)return;
  const {stage,returnFocus}=tutorial; tutorialEvent(status==='completed'?'complete':'skip',stage);
  safeSetItem(TUTORIAL_KEY,JSON.stringify({status,at:new Date().toISOString(),version:1}));
  tutorial=null; releaseTutorialIntro(); document.querySelectorAll('.tutorial-guidance').forEach(element=>element.remove()); restoreTutorialControls();
  if(activeSession?.tutorial)activeSession.tutorial=false;
  if(status==='completed'){ renderSession(); toast('ログと統計から、いつでも振り返れます'); app.focus({preventScroll:true}); }
  else if(redirect && stage===2){ activeSession=null; navigate('home'); }
  else if(redirect && stage>=3){ renderSession(); app.focus({preventScroll:true}); }
  else if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
}

let pickingDrawMode=false;
function pickDrawMode(button, event){
  if(window.DECIDE_ENTITLEMENTS && !window.DECIDE_ENTITLEMENTS.canDraw()){ window.DECIDE_ENTITLEMENTS.openPaywall('draw'); return; }
  const screen=button.closest('.quickstart-screen');
  if(!screen || event.detail===0 || prefersReducedMotion()){ startSession(button.dataset.mode); return; }
  if(pickingDrawMode)return;
  pickingDrawMode=true;
  sensoryFeedback('tap');
  screen.classList.add('is-choosing');
  button.classList.add('is-picked');
  setTimeout(()=>{ pickingDrawMode=false; if(button.isConnected)startSession(button.dataset.mode); },420);
}
function startSession(mode) {
  if(window.DECIDE_ENTITLEMENTS && !window.DECIDE_ENTITLEMENTS.canDraw()){ window.DECIDE_ENTITLEMENTS.openPaywall('draw'); return false; }
  window.DECIDE_ENTITLEMENTS?.recordDraw?.();
  sensoryFeedback('tap');
  const first = randomCard();
  const drawOptions = mode === 'two'
    ? [first, randomCard([first.id])]
    : shuffledDeck();
  activeSession = { id: crypto.randomUUID?.() || String(Date.now()), mode, startedAt:new Date().toISOString(), nodes:[], drawOptions, revealed:[] };
  if(mode==='two')preloadCardImages(drawOptions);
  selectedDecision = '';
  decisionDraft = {genre:'',option1:'',option2:'',title:'',memo:''};
  navigate('prepare-genre');
}

function genreChips() {
  return `<div class="genre-chips">${DECIDE_DECISION.GENRES.map(genre=>`<button type="button" class="meta-chip" data-action="select-genre" data-value="${genre}" aria-pressed="false">${genre}</button>`).join('')}</div>`;
}
function optionEditor() {
  return `<div class="option-editor"><label>選択肢A<textarea id="option-1" name="option1" maxlength="30" autocomplete="off" enterkeyhint="done" lang="ja" rows="2" placeholder="例：今の仕事を続ける"></textarea></label><button type="button" class="swap-options" data-action="swap-options" aria-label="選択肢AとBを入れ替える">⇄</button><label>選択肢B<textarea id="option-2" name="option2" maxlength="30" autocomplete="off" enterkeyhint="done" lang="ja" rows="2" placeholder="例：新しい仕事に挑戦する"></textarea></label></div>`;
}
function sessionContext() {
  const values=[decisionDraft.genre, activeSession.mode==='two' && decisionDraft.option1 ? `A：${decisionDraft.option1}` : '', activeSession.mode==='two' && decisionDraft.option2 ? `B：${decisionDraft.option2}` : ''].filter(Boolean);
  return values.length ? `<p class="session-context">${values.map(esc).join('<br>')}</p>` : '';
}
function renderPreparation() {
  if(!activeSession)return navigate('home');
  const options=currentView==='prepare-options';
  app.innerHTML=`<section class="screen prepare-screen"><button class="text-back" data-action="${options?'prepare-back':'home'}">← 戻る</button><p class="eyebrow">${activeSession.mode==='two'?'2枚引き':'1枚引き'}</p><h1>${options?'2つの選択肢を選ぶ':'どんな迷いですか？'}</h1><p class="lead">${options?'候補からA・Bを1つずつ選ぶか、自由に入力できます。':'ジャンルを1タップで選べます。'}入力は任意です。</p><form id="prepare-form" class="save-form">${options?`${sessionContext()}<div class="pair-candidates" data-option-candidates></div>${optionEditor()}`:genreChips()}<button class="button" type="button" data-action="prepare-next">${options||activeSession.mode==='one'?'カードを引く':'選択肢を選ぶ →'}</button><button class="button secondary" type="button" data-action="prepare-skip">スキップして引く</button></form></section>`;
  restoreDecisionDraft();
  if(options){
    const values=[...new Set((DECIDE_DECISION.PAIRS[decisionDraft.genre]||[]).flat())];
    document.querySelector('[data-option-candidates]').innerHTML=['1','2'].map(key=>`<div class="option-candidate-group"><b>選択肢${key==='1'?'A':'B'}の候補</b><div class="genre-chips">${values.map(value=>`<button type="button" class="meta-chip" data-action="prepare-choice" data-key="${key}" data-value="${esc(value)}" aria-pressed="${decisionDraft['option'+key]===value}">${esc(value)}</button>`).join('')}</div></div>`).join('');
  }
}
function continuePreparation(skip=false) {
  captureDecisionDraft();
  if(skip){ if(currentView==='prepare-genre')decisionDraft.genre=''; decisionDraft.option1=''; decisionDraft.option2=''; }
  navigate(!skip && currentView==='prepare-genre' && activeSession.mode==='two'?'prepare-options':'draw');
}

function backPicker() {
  const choice=([id,label])=>`<button class="back-choice ${settings.back === id ? 'selected' : ''}" data-action="select-back" data-value="${id}" aria-label="${label}" aria-pressed="${settings.back === id}"><i class="card-back back-${id}"></i><small>${label}</small><b aria-hidden="true">${settings.back === id ? '✓' : ''}</b></button>`;
  return `<div class="back-picker" aria-label="カードの裏面を選ぶ">
    ${DECIDE_CARD_BACKS.map(choice).join('')}
  </div>`;
}
function selectBack(id) {
  if(!DECIDE_CARD_BACKS.some(([value])=>value===id))return;
  settings.back=id; persist();
  document.querySelectorAll('#settings-modal .back-choice').forEach(item=>{
    const chosen=item.dataset.value===id;
    item.classList.toggle('selected',chosen);
    item.setAttribute('aria-pressed',String(chosen));
    item.querySelector('b').textContent=chosen?'✓':'';
  });
  document.querySelectorAll('.flip-back,.mode-art i').forEach(item=>{
    [...item.classList].filter(name=>name.startsWith('back-')).forEach(name=>item.classList.remove(name));
    item.classList.add(`back-${id}`);
  });
  sensoryFeedback('tick'); toast('カードの裏面を変更しました');
}

function drawCardButton(card, slot, label='') {
  const revealed = activeSession.revealed.includes(slot);
  const locked = activeSession.revealed.length && activeSession.mode === 'one' && !revealed;
  const tag = activeSession.mode === 'two' ? 'div' : 'button';
  const action = activeSession.mode === 'two' ? '' : ' data-action="flip-card"';
  const center=(activeSession.drawOptions.length-1)/2;
  const fanStyle=activeSession.mode === 'one' ? ` style="--tilt:${(((slot-center)/Math.max(center,1))*9).toFixed(2)}deg;--drop:${(Math.abs(slot-center)/Math.max(center,1)*18).toFixed(1)}px"` : '';
  const hiddenLabel=activeSession.mode === 'two' ? `選択肢${'AB'[slot]}のカード（伏せてある）` : `伏せたカード ${slot + 1}枚目`;
  const tabIndex=activeSession.mode === 'one' ? ` tabindex="${slot === Math.floor(center) ? '0' : '-1'}"` : '';
  const front=revealed ? `<span class="flip-face flip-front" aria-hidden="false">${cardPicture(card,{className:card.orientation === 'reversed' ? 'reversed-image' : ''})}<em>${esc(card.name)}</em></span>` : '';
  return `<${tag} class="flip-card ${activeSession.mode === 'two' ? 'pair-card' : ''} ${revealed ? 'flipped chosen' : ''}"${action} data-slot="${slot}"${fanStyle}${tabIndex} ${locked ? 'disabled' : ''} aria-label="${revealed ? `${card.name}を選びました` : hiddenLabel}">
    ${label ? (activeSession.mode === 'two' ? `<b class="draw-label draw-plate" aria-hidden="true"><small>OPTION</small><span>${esc(label)}</span></b>` : `<b class="draw-label">${label}</b>`) : ''}
    <span class="flip-inner">
      <span class="flip-face flip-back card-back back-${settings.back}"><i aria-hidden="true"></i></span>
      ${front}
    </span>
  </${tag}>`;
}

function renderDraw() {
  if (!activeSession) return navigate('home');
  const two = activeSession.mode === 'two';
  app.innerHTML = `<section class="screen draw-screen${two ? ' draw-two' : ''}">
    <button class="text-back" data-action="home">← 最初に戻る</button>
    <p class="eyebrow">Take a moment</p><p class="draw-prompt">${two ? '2つの選択肢を思い浮かべてください。' : '迷いを1つ、思い浮かべてください。'}</p>${sessionContext()}
    <h1>${two ? '2つの選択肢を、<wbr>思い浮かべる。' : '問いを、心の中で<wbr>決める。'}</h1>
    <p class="lead">${two ? '左を選択肢A、右を選択肢Bとして<wbr>思い浮かべてください。<wbr>カードは答えを決めるものではなく、<wbr>それぞれを考える視点を映します。' : `問いは言葉にしなくて<wbr>大丈夫です。<wbr>伏せた${activeSession.drawOptions.length}枚を左右に動かし、<wbr>気になる1枚を選んでください。`}</p>
    ${two ? '' : `<div class="deck-count"><b>${activeSession.drawOptions.length}枚</b><span>すべてのカードから選べます</span></div>`}
    ${two ? '' : '<p class="fan-guide">横に滑らせて、1枚選ぶ</p>'}
    <div class="${two ? 'dual-draw' : 'fan-deck'}">
      ${activeSession.drawOptions.map((card,i) => drawCardButton(card,i,two ? 'AB'[i] : '')).join('')}
      ${two ? `<span class="draw-vs" aria-hidden="true">OR</span>
      <p class="draw-instruction">${activeSession.revealed.length ? '2つの視点を読み取っています…' : '2つを思い浮かべたら、カードを開きます'}</p>` : ''}
    </div>
    ${two ? `<button class="button reveal-both reveal-hold" data-action="flip-both" ${activeSession.revealed.length ? 'disabled' : ''}>
      <span class="reveal-kicker">REVEAL · 2 CARDS</span>
      <span class="reveal-title">カードを開いて比べる</span>
      <span class="reveal-hint">${activeSession.revealed.length ? 'OPEN' : '長押しで開く'}</span>
      <i class="reveal-charge" aria-hidden="true"></i>
    </button>` : ''}
    ${two ? '' : `<p class="draw-instruction">${activeSession.revealed.length ? '選んだカードを開いています…' : '横にスワイプできます。気になるカードをタップしてください'}</p>`}
  </section>`;
  if(!two) requestAnimationFrame(()=>{ const deck=document.querySelector('.fan-deck'); if(deck){deck.scrollLeft=(deck.scrollWidth-deck.clientWidth)/2;setupFanFeedback(deck);} });
  renderTutorialStage();
}

function flipCard(slot) {
  if (!activeSession || activeSession.mode === 'two' || activeSession.revealed.includes(slot)) return;
  sensoryFeedback('reveal');
  activeSession.revealed.push(slot);
  const card = activeSession.drawOptions[slot];
  const sessionId=activeSession.id;
  document.querySelectorAll('.flip-card').forEach((item,index) => { if(index !== slot) item.disabled = true; });
  const instruction = document.querySelector('.draw-instruction');
  if (instruction) instruction.textContent = 'カードを開いています…';
  preloadCardImages([card]);
  if(activeSession?.tutorial)loadCardContent();
  if(!activeSession || activeSession.id!==sessionId)return;
  const button = document.querySelector(`.flip-card[data-slot="${slot}"]`);
  if (button) {
    button.querySelector('.flip-inner')?.insertAdjacentHTML('beforeend',`<span class="flip-face flip-front" aria-hidden="false">${cardPicture(card,{className:card.orientation === 'reversed' ? 'reversed-image' : ''})}<em>${esc(card.name)}</em></span>`);
    button.classList.add('flipped','chosen');
    button.setAttribute('aria-label',`${card.name}を選びました`);
    const front = button.querySelector('.flip-front');
    const image = front?.querySelector('img');
    front?.setAttribute('aria-hidden','false');
    if (image) image.alt = card.name;
  }
  activeSession.nodes = [{question:'いま必要な視点',label:'NOW',card}];
  setTimeout(async () => {
    await loadCardContent();
    if (activeSession?.id===sessionId){ if(tutorial?.stage===2)beginTutorialResult(); else navigate('session'); }
  }, 520);
}

const REVEAL_HOLD_MS=900;
let revealHold=null;
function prefersReducedMotion(){ return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
function startRevealHold(button){
  if(button.disabled || revealHold || activeSession?.mode!=='two') return;
  button.closest('.draw-screen')?.classList.add('is-charging');
  button.classList.add('charging');
  sensoryFeedback('tick');
  revealHold={button,timer:setTimeout(()=>{ revealHold=null; button.classList.remove('charging'); flipBoth(); },REVEAL_HOLD_MS)};
}
function cancelRevealHold(){
  if(!revealHold) return;
  clearTimeout(revealHold.timer);
  revealHold.button.classList.remove('charging');
  revealHold.button.closest('.draw-screen')?.classList.remove('is-charging');
  revealHold=null;
}
function nudgeRevealHold(button){
  const hint=button.querySelector('.reveal-hint');
  if(hint) hint.textContent='押したまま、少し待つ';
  button.classList.remove('nudge'); void button.offsetWidth; button.classList.add('nudge');
}

function flipBoth() {
  if (!activeSession || activeSession.mode !== 'two' || activeSession.revealed.length) return;
  cancelRevealHold();
  sensoryFeedback('reveal');
  const screen=document.querySelector('.draw-screen');
  screen?.classList.remove('is-charging');
  screen?.classList.add('is-revealing');
  activeSession.revealed = [0, 1];
  const sessionId=activeSession.id;
  const reveal = document.querySelector('[data-action="flip-both"]');
  if (reveal) { reveal.disabled = true; const hint=reveal.querySelector('.reveal-hint'); if(hint) hint.textContent='OPEN'; }
  const instruction = document.querySelector('.draw-instruction');
  if (instruction) instruction.textContent = '2枚のカードを準備しています…';
  preloadCardImages(activeSession.drawOptions.slice(0,2));
  if(!activeSession || activeSession.id!==sessionId)return;
  document.querySelectorAll('.flip-card').forEach((item, slot) => {
    const card = activeSession.drawOptions[slot];
    item.querySelector('.flip-inner')?.insertAdjacentHTML('beforeend',`<span class="flip-face flip-front" aria-hidden="false">${cardPicture(card,{className:card.orientation === 'reversed' ? 'reversed-image' : ''})}<em>${esc(card.name)}</em></span>`);
    item.classList.add('flipped','chosen');
    item.setAttribute('aria-label',`${card.name}を開きました`);
    const front = item.querySelector('.flip-front');
    const image = front?.querySelector('img');
    front?.setAttribute('aria-hidden','false');
    if (image) image.alt = card.name;
  });
  if (instruction) instruction.textContent = '2つの視点を開いています…';
  activeSession.nodes = [
    {question:'選択肢1を選んだとき',label:'選択肢 1',card:activeSession.drawOptions[0]},
    {question:'選択肢2を選んだとき',label:'選択肢 2',card:activeSession.drawOptions[1]}
  ];
  setTimeout(async () => {
    await loadCardContent();
    if (activeSession?.id===sessionId) navigate('session');
  }, prefersReducedMotion() ? 520 : 900);
}

function renderCard(node, index, showReflection=false) {
  const c = node.card;
  const reading=nodeReading(node,activeSession?.mode || 'one',index);
  const answered=showReflection && index < activeSession.nodes.length-1;
  return `<article class="thought-node ${c.orientation === 'reversed' ? 'is-reversed' : ''}">
    <div class="node-label"><span>${esc(DECIDE_DECISION.choiceText(node.label))}</span><b>${esc(DECIDE_DECISION.choiceText(node.question))}</b></div>
    <button class="compact-card card-detail-button" data-action="card-detail" data-index="${index}" aria-label="${esc(c.name)}の詳しい意味を見る">
      <span class="card-image-frame reading-image-frame">${cardPicture(c,{className:c.orientation === 'reversed' ? 'reversed-image' : '',sizes:'104px'})}</span>
      <div><span class="tarot-index">${esc(c.number)} · ${orientationLabel(c)}</span><strong>${esc(c.name)}</strong></div>
    </button>
    <div class="reading"><b>${esc(reading.heading)}</b><p>${esc(reading.body)}</p></div>
    ${showReflection ? renderReflection(`card-${index}`,answered) : ''}
    ${index < activeSession.nodes.length - 1 ? '<span class="connector" aria-hidden="true"></span>' : ''}
  </article>`;
}

function cardScore(card) {
  const score=Number(orientationContent(card)?.score);
  return Number.isInteger(score) && score>=1 && score<=5 ? score : 3;
}
function comparisonVerdict(nodes) {
  const [first,second]=nodes;
  return DECIDE_SCORING.compare(
    {score:cardScore(first.card),keywords:cardKeywords(first.card)},
    {score:cardScore(second.card),keywords:cardKeywords(second.card)}
  );
}
const SCORE_STAR_PATH='M12 2.6l2.8 5.67 6.26.91-4.53 4.42 1.07 6.24L12 16.88 6.4 19.83l1.07-6.24L2.94 9.17l6.26-.91L12 2.6z';
function renderStars(score,label) {
  const stars=Array.from({length:5},(_,index) => `<svg class="${index < score ? 'filled' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${SCORE_STAR_PATH}"/></svg>`).join('');
  return `<span class="score-stars" role="img" aria-label="${esc(label)}、5段階中${score}">${stars}</span>`;
}
function renderScoreRow(label,score) {
  return `<div><b>${label}</b>${renderStars(score,`${label}の進めやすさ`)}</div>`;
}

function deepPrompts() {
  const used = activeSession.nodes.map(n => n.question);
  return DECIDE_INTERVIEW.availablePrompts(activeSession.mode,used);
}
function renderReflection(stepKey,answered=false,verdict=null) {
  const two=activeSession.mode==='two';
  const question=two?'この結果、しっくりきましたか？':'このカード、しっくりきましたか？';
  if(answered)return `<section class="reflection-card answered"><h3>${question}</h3><span class="reflection-done">回答済み</span></section>`;
  const prompts=deepPrompts();
  const panelId=`reflection-options-${stepKey}`;
  const promptHeading=two?'何が気になりますか？':'どこが引っかかりますか？';
  const options=prompts.map(item=>{
    const recommended=Boolean(verdict?.tie && item.prompt==='決め手になる違い');
    return `<button class="prompt-button ${recommended?'recommended-prompt':''}" data-action="deepen" data-prompt="${esc(item.prompt)}">${recommended?'<em>今のおすすめ</em>':''}<b>${esc(DECIDE_DECISION.choiceText(item.label))}</b><span>${esc(DECIDE_DECISION.choiceText(item.prompt))} →</span></button>`;
  }).join('');
  return `<section class="reflection-card"><h3>${question}</h3><div class="reflection-actions"><button class="button" data-action="decide">しっくりきた → 決める</button>${prompts.length?`<button class="button secondary" data-action="toggle-reflection" aria-expanded="false" aria-controls="${panelId}">まだ引っかかる</button>`:''}</div>${prompts.length?`<div class="reflection-options" id="${panelId}" hidden><button class="deep-back" data-action="close-deep-menu">← 結果に戻る</button><p>${promptHeading}</p><div class="prompt-list">${options}</div></div>`:''}</section>`;
}

function renderSession() {
  if (!activeSession) return navigate('home');
  const initial = activeSession.mode === 'two' ? 2 : 1;
  const deepCount = activeSession.nodes.length - initial;
  const verdict=activeSession.mode === 'two' ? comparisonVerdict(activeSession.nodes.slice(0,2)) : null;
  const comparison=activeSession.mode === 'two' ? activeSession.nodes.slice(0,2).map((node,index) => {
    const reading=nodeReading(node,'two',index);
    const label=DECIDE_DECISION.choiceText(node.label).replace(' ','');
    return `<article class="compare-node"><div class="compare-heading"><span class="compare-letter" aria-hidden="true">${'AB'[index]}</span>${renderStars(verdict.scores[index],`${label}の進めやすさ`)}</div><button class="compare-card card-detail-button" data-action="card-detail" data-index="${index}" aria-label="${esc(node.card.name)}の詳しい意味を見る"><span class="card-image-frame">${cardPicture(node.card,{className:node.card.orientation === 'reversed' ? 'reversed-image' : '',sizes:'160px'})}</span></button><div class="compare-meta"><b>${esc(node.card.name)}</b><small>${orientationLabel(node.card)}</small></div><p><strong>${esc(reading.heading)}</strong>${esc(reading.body)}</p></article>`;
  }).join('') : '';
  app.innerHTML = `
    <section class="screen map-screen ${activeSession.mode === 'two' ? 'two-result' : 'one-result'} ${deepCount > 0 ? 'has-deep' : ''}">
      <button class="text-back" data-action="home">← 最初に戻る</button>
      ${sessionContext()}<div class="map-heading"><p class="eyebrow">Thought map</p><h1>${activeSession.mode === 'two' ? '2つの選択肢を<wbr>比べる' : 'カードが示す、<wbr>ひとつの視点'}</h1><p>${activeSession.mode === 'two' ? 'カードの向きと意味から、<wbr>どちらが今進めやすいかを<wbr>比べます。' : 'カードに未来を決めてもらうのではなく、<wbr>解説を自分の状況に照らして<wbr>読んでみてください。'}</p></div>
      ${activeSession.mode === 'two' ? `<div class="choice-comparison">${comparison}</div><section class="verdict-card"><span class="verdict-kicker">今回のカードでは</span><h3>${esc(verdict.label.replace(/選択肢([AB])/g,(_,letter)=>decisionDraft['option'+(letter==='A'?'1':'2')] ? `『${decisionDraft['option'+(letter==='A'?'1':'2')]}』` : `選択肢${letter}`))}</h3><div class="score-lines">${renderScoreRow('選択肢A',verdict.scores[0])}${renderScoreRow('選択肢B',verdict.scores[1])}</div><details class="score-help"><summary>進めやすさとは？</summary><p>その選択肢を「いま進める」ときの追い風の強さです。運勢の良し悪しではありません。</p></details><p class="verdict-reason">${esc(verdict.reason)}</p>${verdict.note?`<p class="verdict-note">${esc(verdict.note)}</p>`:''}<p class="verdict-closing">${esc(verdict.closing)}</p></section>${renderReflection('verdict',deepCount>0,verdict)}<div class="thought-map deep-map">${activeSession.nodes.slice(2).map((node,index) => renderCard(node,index + 2,true)).join('')}</div>` : `<div class="thought-map">${activeSession.nodes.map((node,index)=>renderCard(node,index,true)).join('')}</div>`}
    </section>`;
  renderTutorialStage();
}

function toggleReflection(button) {
  const panel=document.getElementById(button.getAttribute('aria-controls'));
  if(!panel)return;
  const expanded=button.getAttribute('aria-expanded')==='true';
  button.setAttribute('aria-expanded',String(!expanded));
  panel.hidden=expanded;
  button.closest('.map-screen')?.classList.toggle('deep-menu-open',!expanded);
  const navBack=document.querySelector('.nav-back'); if(navBack){navBack.querySelector('span').textContent='戻る';navBack.setAttribute('aria-label',expanded?'ホームへ戻る':'結果へ戻る');}
  if(!expanded)panel.querySelector('button')?.focus({preventScroll:true});
}

function addDeep(prompt) {
  sensoryFeedback('reveal');
  const exclude = activeSession.nodes.map(n => n.card.id);
  const card=randomCard(exclude); preloadCardImages([card]);
  activeSession.nodes.push({ question:prompt, label:`DEEP ${activeSession.nodes.length - (activeSession.mode === 'two' ? 1 : 0)}`, card });
  renderSession();
  requestAnimationFrame(() => window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}));
}

function renderDecision() {
  if (!activeSession) return navigate('home');
  const options = activeSession.mode === 'two' ? ['選択肢1','選択肢2','保留する'] : ['進む','見送る','保留する'];
  app.innerHTML = `
    <section class="screen decide-screen">
      <button class="text-back" data-action="session">← マップに戻る</button>
      <p class="eyebrow">Decide</p><div class="decide-title"><span class="decide-kicker">THE FINAL CALL</span><h1>今回は、<wbr>どうする？</h1><span class="decide-sub">YOU DECIDE, NOT THE CARDS.</span></div>
      <p class="lead">カードではなく、<wbr>あなたが決めます。<wbr>いちばん納得できるものを<wbr>選んでください。</p>
      <div class="decision-options">${options.map((o,i) => `<button class="decision-option ${selectedDecision === o ? 'selected' : ''}" data-action="select-decision" data-value="${o}" aria-pressed="${selectedDecision === o}"><b class="decision-index">${(activeSession.mode === 'two' ? ['A','B','HOLD'] : ['GO','PASS','HOLD'])[i]}</b><span>${DECIDE_DECISION.choiceText(o)}</span><i>${selectedDecision === o ? '✓' : ''}</i></button>`).join('')}</div>
      <form id="save-form" class="save-form">
        ${selectedDecision ? `<section class="decision-meta" aria-label="決定の補足">
          <div class="form-section"><div class="form-section-head"><b>ジャンル</b><span>任意・1つだけ</span></div><div class="genre-chips">${DECIDE_DECISION.GENRES.map(genre=>`<button type="button" class="meta-chip" data-action="select-genre" data-value="${genre}" aria-pressed="false">${genre}</button>`).join('')}</div></div>
          ${activeSession.mode==='two'?`<div class="form-section"><div class="form-section-head"><b>選択肢の内容</b><span>任意</span></div><div class="pair-candidates" data-pair-candidates></div>${optionEditor()}<div class="recent-options" data-recent-options></div></div>`:''}
        </section>`:''}
        <label>題名 <span>任意</span><input name="title" maxlength="60" autocomplete="off" enterkeyhint="done" lang="ja" placeholder="空欄なら内容から自動で作成"></label>
        <label>ひとことメモ <span>任意</span><textarea name="memo" maxlength="240" rows="3" lang="ja" placeholder="決め手や、今の気持ち"></textarea></label>
        <button class="button" type="submit" ${selectedDecision ? '' : 'disabled'}>決定を記録する</button>
        <p class="timestamp">${formatDate(new Date().toISOString(), true)} の記録として保存</p>
      </form>
    </section>`;
  restoreDecisionDraft();
}

function captureDecisionDraft() {
  const form=document.querySelector('#save-form, #prepare-form'); if(!form)return;
  decisionDraft.title=String(form.elements.title?.value||'').slice(0,60);
  decisionDraft.memo=String(form.elements.memo?.value||'').slice(0,240);
  decisionDraft.option1=DECIDE_DECISION.optionValue(form.elements.option1?.value??decisionDraft.option1);
  decisionDraft.option2=DECIDE_DECISION.optionValue(form.elements.option2?.value??decisionDraft.option2);
}

function renderPairCandidates() {
  const wrap=document.querySelector('[data-pair-candidates]'); if(!wrap)return;
  wrap.replaceChildren();
  const pairs=DECIDE_DECISION.PAIRS[decisionDraft.genre]||[];
  if(!pairs.length){ const hint=document.createElement('p'); hint.className='pair-hint'; hint.textContent='ジャンルを選ぶと候補が表示されます。'; wrap.append(hint); return; }
  pairs.forEach((pair,index)=>{ const button=document.createElement('button'); button.type='button'; button.className='pair-chip'; button.dataset.action='select-pair'; button.dataset.pairIndex=String(index); button.textContent=`${pair[0]}／${pair[1]}`; wrap.append(button); });
}

function renderRecentChoices() {
  const wrap=document.querySelector('[data-recent-options]'); if(!wrap)return;
  wrap.replaceChildren();
  const recent=DECIDE_DECISION.recentChoices(logs);
  if(!recent.length)return;
  const label=document.createElement('span'); label.textContent='最近使った選択肢'; wrap.append(label);
  const chips=document.createElement('div'); chips.className='recent-chips';
  recent.forEach((value,index)=>{ const button=document.createElement('button'); button.type='button'; button.className='meta-chip'; button.dataset.action='recent-option'; button.dataset.recentIndex=String(index); button.textContent=value; chips.append(button); });
  wrap.append(chips);
}

function restoreDecisionDraft() {
  const form=document.querySelector('#save-form, #prepare-form'); if(!form)return;
  if(form.elements.title)form.elements.title.value=decisionDraft.title;
  if(form.elements.memo)form.elements.memo.value=decisionDraft.memo;
  if(form.elements.option1)form.elements.option1.value=decisionDraft.option1;
  if(form.elements.option2)form.elements.option2.value=decisionDraft.option2;
  document.querySelectorAll('[data-action="select-genre"]').forEach(button=>{ const selected=button.dataset.value===decisionDraft.genre; button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected)); });
  renderPairCandidates(); renderRecentChoices();
}

function selectGenre(value) {
  captureDecisionDraft();
  decisionDraft.genre=decisionDraft.genre===value?'':DECIDE_DECISION.validGenre(value);
  if(currentView.startsWith('prepare-'))renderPreparation(); else restoreDecisionDraft(); sensoryFeedback('tick');
}

function selectPair(index) {
  const pair=(DECIDE_DECISION.PAIRS[decisionDraft.genre]||[])[index]; if(!pair)return;
  decisionDraft.option1=pair[0]; decisionDraft.option2=pair[1]; restoreDecisionDraft(); sensoryFeedback('tick');
}

function swapOptions() {
  captureDecisionDraft(); [decisionDraft.option1,decisionDraft.option2]=[decisionDraft.option2,decisionDraft.option1]; restoreDecisionDraft(); sensoryFeedback('tick');
}

function useRecentChoice(index) {
  captureDecisionDraft(); const value=DECIDE_DECISION.recentChoices(logs)[index]; if(!value)return;
  if(!decisionDraft.option1)decisionDraft.option1=value; else if(!decisionDraft.option2)decisionDraft.option2=value; else return;
  restoreDecisionDraft(); sensoryFeedback('tick');
}

function saveDecision(form) {
  if (!selectedDecision || !activeSession) return;
  sensoryFeedback('save');
  const fd = new FormData(form);
  const createdAt = new Date().toISOString();
  const genre=DECIDE_DECISION.validGenre(decisionDraft.genre)||null;
  const options=activeSession.mode==='two'?DECIDE_DECISION.savedOptions(fd.get('option1'),fd.get('option2')):null;
  const manualTitle=String(fd.get('title')||'').trim().slice(0,60);
  const title=manualTitle||DECIDE_DECISION.autoTitle({genre,options,nodes:activeSession.nodes,createdAt,mode:activeSession.mode});
  const log = { id:activeSession.id, mode:activeSession.mode, createdAt, title,
    memo:String(fd.get('memo') || '').trim(), decision:selectedDecision, nodes:activeSession.nodes, review:null, genre, options };
  const retry=pendingSave?.log.id===log.id;
  const firstRecord=retry ? pendingSave.firstRecord : logs.length===0;
  const requestPersistence=retry ? pendingSave.requestPersistence : firstRecord && !settings.storagePersistRequested;
  const existing=logs.findIndex(item=>item.id===log.id);
  if(existing>=0 && 'remindAt' in logs[existing]) log.remindAt=logs[existing].remindAt; else if(existing<0){ const remindAt=window.DECIDE_REMINDERS?.defaultRemindAt?.(log.createdAt); if(remindAt) log.remindAt=remindAt; }
  if(existing<0 && !retry && window.DECIDE_ENTITLEMENTS && !window.DECIDE_ENTITLEMENTS.canSaveLog(logs.length)){ window.DECIDE_ENTITLEMENTS.openPaywall('save'); return; }
  if(existing>=0)logs[existing]=log; else logs.unshift(log);
  if(requestPersistence)settings.storagePersistRequested=true;
  if(!persist()) { pendingSave={log,firstRecord,requestPersistence}; openSaveFailure(log); return; }
  if(requestPersistence)requestPersistentStorage();
  pendingSave=null;
  if(firstRecord && shouldShowA2HS())a2hsBannerLogId=log.id;
  activeSession = null; selectedDecision = ''; detailId = log.id;
  decisionDraft = {genre:'',option1:'',option2:'',title:'',memo:''};
  completionId=log.id; currentView = 'detail'; render(); toast('決定を記録しました');
  window.DECIDE_AUTH?.maybePromptAfterSave?.(logs.length, existing<0);
}

function openSaveFailure(log) {
  storageEvent('saveFailed');
  document.querySelector('#save-failed-modal')?.remove();
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='save-failed-modal'; wrap.failedLog=log;
  wrap.innerHTML=`<button class="modal-shade" data-action="close-save-failed" aria-label="保存エラーを閉じる"></button><section class="settings-sheet confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="save-failed-title"><div class="sheet-handle"></div><div class="sheet-head"><h2 id="save-failed-title">保存できませんでした</h2><button data-action="close-save-failed" aria-label="閉じる">×</button></div><p>この端末では、記録を保存できない状態です（保存領域がいっぱい、またはブラウザの設定で制限されています）。いま入力した内容は、書き出してお手元に残せます。</p><div class="backup-output" data-backup-output hidden><label>バックアップ内容<textarea readonly aria-label="バックアップJSON"></textarea></label><button class="button secondary" data-action="copy-backup-text">コピーする</button></div><div class="confirm-actions"><button class="button" data-action="export-failed-log">この記録を書き出す</button><button class="button secondary" data-action="close-save-failed">閉じる</button></div></section>`;
  mountModal(wrap,'[data-action="export-failed-log"]');
}

function openA2HSHelp() {
  storageEvent('a2hsHelp');
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='a2hs-help-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="close-a2hs-help" aria-label="追加手順を閉じる"></button><section class="settings-sheet confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="a2hs-help-title"><div class="sheet-handle"></div><div class="sheet-head"><h2 id="a2hs-help-title">ホーム画面に追加する方法</h2><button data-action="close-a2hs-help" aria-label="閉じる">×</button></div><ol class="a2hs-steps"><li>画面下の共有ボタン（□に↑）を押す</li><li>「ホーム画面に追加」を選ぶ</li><li>右上の「追加」を押す</li></ol><div class="confirm-actions"><button class="button" data-action="close-a2hs-help">閉じる</button></div></section>`;
  mountModal(wrap,'.sheet-head button');
}

function dismissA2HS() {
  settings.a2hsDismissedUntil=Date.now()+7*DAY_MS; a2hsBannerLogId=null; persist(); storageEvent('a2hsDismiss'); document.querySelector('[data-a2hs-banner]')?.remove();
}

function renderHistory() {
  const results=filteredLogs();
  app.innerHTML = `<section class="screen history-screen">
    <div class="history-head"><div><p class="eyebrow">Decision log</p><h1>決めたこと。</h1></div>
      <div class="view-switch" aria-label="履歴の表示形式"><button class="${historyMode === 'list' ? 'selected' : ''}" data-action="history-mode" data-value="list">リスト</button><button class="${historyMode === 'calendar' ? 'selected' : ''}" data-action="history-mode" data-value="calendar">カレンダー</button></div>
    </div>
    ${shouldShowBackupReminder() ? '<aside class="storage-banner backup-reminder" data-backup-reminder><button class="banner-close" data-action="dismiss-backup-reminder" aria-label="バックアップ案内を閉じる">×</button><b>バックアップしておきませんか</b><p>記録を書き出して、端末の外にも残しておけます。</p><button class="button secondary" data-action="export-logs">履歴を書き出す</button></aside>' : ''}
    ${logs.length ? `<label class="history-search"><span aria-hidden="true">⌕</span><input id="history-search" type="search" value="${esc(historyQuery)}" placeholder="題名、カード、意味、ストーリーを検索" aria-label="履歴を検索"><small>${historyQuery ? `${results.length}件` : ''}</small></label>${historyMode === 'list' ? '<p class="swipe-hint">履歴を左へスワイプすると削除できます</p>' : ''}<div data-history-results>${renderHistoryResults(results)}</div>` : `<div class="empty-state"><h2>まだ履歴はありません</h2><p>最初のカードを引いて、ひとつ決めてみましょう。</p><button class="button" data-action="home">カードを引く</button></div>`}
  </section>`;
}

function filteredLogs() {
  const query=historyQuery.trim().toLocaleLowerCase('ja'); if(!query)return logs;
  return logs.filter(log => {
    const cards=(log.nodes || []).flatMap(node=>[node.question,DECIDE_DECISION.choiceText(node.question),node.card?.name,meaning(node.card || {})]);
    return [log.title,log.decision,DECIDE_DECISION.choiceText(log.decision),log.memo,log.story,log.genre,log.options?.['1'],log.options?.['2'],...cards].filter(Boolean).join(' ').toLocaleLowerCase('ja').includes(query);
  });
}

function renderHistoryResults(results=filteredLogs()) {
  if(!results.length) return `<div class="search-empty"><span>⌕</span><b>見つかりませんでした</b><p>言葉を短くするか、別のキーワードで試してください。</p></div>`;
  return historyMode === 'calendar' ? renderCalendar(results) : `<div class="history-list">${results.map(log=>historyItem(log)).join('')}</div>`;
}

function historyItem(log,{deletable=true}={}) {
  const cards=(log.nodes || []).slice(0,3);
  const first=cards[0]?.card;
  return `<div class="${deletable?'history-swipe':'history-static'}"${deletable?` data-swipe-id="${esc(log.id)}"`:''}>${deletable?`<button class="swipe-delete" data-action="delete-log" data-id="${esc(log.id)}" aria-hidden="true" tabindex="-1">削除</button>`:''}<div class="history-row"><button class="history-item" data-action="detail" data-id="${esc(log.id)}">
    <span class="history-thumbs">${cards.map((node,index)=>cardPicture(node.card,{className:node.card.orientation === 'reversed' ? 'reversed-image' : '',alt:'',sizes:'46px',attributes:`style="--stack:${index}"`})).join('')}</span>
    <span class="history-copy"><time>${formatDate(log.createdAt)}</time><strong>${esc(log.title)}</strong>${log.genre?`<small class="history-genre">${esc(log.genre)}</small>`:''}<span>${esc(DECIDE_DECISION.decisionText(log))}</span>${first ? `<small>${esc(first.name)} · ${orientationLabel(first)} — ${esc(meaning(first))}</small>` : ''}</span>
    ${log.review ? `<em>${reviewIcon(log.review)} ${esc(log.review)}</em>` : '<em class="pending">評価待ち</em>'}<i class="history-arrow" aria-hidden="true">→</i>
  </button>${deletable?`<button class="history-delete-action" data-action="delete-log" data-id="${esc(log.id)}" aria-label="「${esc(log.title)}」を削除">削除</button>`:''}</div></div>`;
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
  const monthKey = `${year}-${String(month+1).padStart(2,'0')}-`;
  const monthLogs = Object.entries(byDate).filter(([key]) => key.startsWith(monthKey)).flatMap(([,list]) => list);
  const monthPending = monthLogs.filter(log => !log.review).length;
  const monthName = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'][month];
  const blanks = Array.from({length:firstDay},() => '<span class="calendar-blank"></span>').join('');
  const cells = Array.from({length:days},(_,i) => {
    const key=`${monthKey}${String(i+1).padStart(2,'0')}`;
    const dayLogs=byDate[key] || [];
    const count=dayLogs.length;
    const pending=dayLogs.filter(log => !log.review).length;
    const label=`${month+1}月${i+1}日${count ? `、決定${count}件${pending ? `（評価待ち${pending}件）` : '（すべて評価済み）'}` : ''}`;
    return `<button class="calendar-day ${count ? 'has-log' : ''} ${pending ? 'has-pending' : count ? 'all-reviewed' : ''} ${key === today ? 'today' : ''} ${key === selectedCalendarDate ? 'selected' : ''}" data-action="calendar-day" data-value="${key}" aria-label="${label}" ${count ? '' : 'disabled'}><span>${i+1}</span>${count ? `<i>${count}</i>` : ''}${pending ? '<b aria-hidden="true">!</b>' : ''}</button>`;
  }).join('');
  const selectedLogs = byDate[selectedCalendarDate] || [];
  const selectedPending = selectedLogs.filter(log => !log.review).length;
  return `<div class="calendar-wrap">
    <div class="calendar-toolbar"><button data-action="calendar-prev" aria-label="前の月">←</button><strong><small>${monthName}</small><span>${year}年 ${month+1}月</span></strong><button data-action="calendar-next" aria-label="次の月">→</button></div>
    <div class="calendar-summary"><p class="calendar-pending-plate ${monthPending ? '' : 'clear'}"><span>AWAITING REVIEW</span><strong>${monthPending}</strong><small>件</small></p><ul class="calendar-legend"><li class="pending">評価待ち</li><li class="reviewed">評価済み</li></ul></div>
    <div class="week-row">${['日','月','火','水','木','金','土'].map(d=>`<span>${d}</span>`).join('')}</div>
    <div class="calendar-grid">${blanks}${cells}</div>
    <div class="calendar-detail">${selectedCalendarDate ? `<p class="calendar-date-label"><span>${Number(selectedCalendarDate.slice(5,7))}月${Number(selectedCalendarDate.slice(8,10))}日の決定</span>${selectedPending ? `<em>評価待ち ${selectedPending}件</em>` : ''}</p>${selectedLogs.map(historyItem).join('')}` : '<p class="calendar-hint">印のある日を選ぶと、その日の決定を確認できます。</p>'}</div>
  </div>`;
}

function reviewIcon(review) { return ({'良かった':'◎','まあ良かった':'○','どちらとも言えない':'△','違った':'×'})[review] || ''; }
function renderSavedCard(log,node,index) {
  const reading=nodeReading(node,log.mode,index);
  return `<article class="saved-card">
    <button class="saved-card-image-button" data-action="saved-card-detail" data-id="${esc(log.id)}" data-index="${index}" aria-label="${esc(node.card.name)}の詳しい意味を見る"><span class="card-image-frame saved-card-image-frame">${cardPicture(node.card,{className:node.card.orientation === 'reversed' ? 'reversed-image' : '',sizes:'92px'})}</span></button>
    <div><span>${esc(DECIDE_DECISION.nodeLabel(log,node,index))} · ${esc(DECIDE_DECISION.choiceText(node.question || ''))}</span><h3>${esc(node.card.name)} <small>${orientationLabel(node.card)}</small></h3><b>${esc(reading.heading)}</b><p>${esc(reading.body)}</p><button class="card-more" data-action="saved-card-detail" data-id="${esc(log.id)}" data-index="${index}">カードの詳しい意味を見る</button></div>
  </article>`;
}
function recentMonthCounts(items, limit=6) {
  const counts=new Map();
  items.forEach(log=>{ const date=new Date(log.createdAt); if(Number.isNaN(date.getTime()))return; const key=date.getFullYear()*12+date.getMonth(); counts.set(key,(counts.get(key)||0)+1); });
  return [...counts].sort((a,b)=>b[0]-a[0]).slice(0,limit).map(([key,count])=>[`${Math.floor(key/12)}年${key%12+1}月`,count]);
}
function renderStats() {
  const reviewed=logs.filter(log=>log.review);
  const positive=reviewed.filter(log=>['良かった','まあ良かった'].includes(log.review)).length;
  const satisfaction=reviewed.length ? Math.round(positive/reviewed.length*100) : 0;
  const themes=Object.entries(logs.reduce((counts,log)=>{ const key=log.genre||'その他'; counts[key]=(counts[key]||0)+1; return counts; },{})).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const REVIEW_KEYS={'良かった':'good','まあ良かった':'fair','どちらとも言えない':'neutral','違った':'bad'};
  const reviewCounts=Object.keys(REVIEW_KEYS).map(label=>{
    const count=reviewed.filter(log=>log.review===label).length;
    return {label,count,percent:reviewed.length?Math.round(count/reviewed.length*100):0};
  });
  const pendingCount=logs.length-reviewed.length;
  if(statsReview && !logs.some(log=>(log.review||'評価待ち')===statsReview))statsReview='';
  const reviewButton=(label,inner,className)=>`<button class="${className}${statsReview===label?' selected':''}" data-action="stats-review" data-value="${esc(label)}" aria-pressed="${statsReview===label}"${!reviewed.some(log=>log.review===label)?' disabled':''}>${inner}</button>`;
  const reviewRows=reviewCounts.map(({label,count,percent})=>reviewButton(label,`<span class="review-label"><em aria-hidden="true">${reviewIcon(label)}</em>${esc(label)}</span><i style="--value:${percent}%"></i><b>${percent}%<small>${count}件</small></b>`,`review-row review-${REVIEW_KEYS[label]}`)).join('');
  let ringStop=0;
  const ringStyle=reviewCounts.map(({label,count})=>{ const from=ringStop; ringStop+=reviewed.length?count/reviewed.length*360:0; return `--${REVIEW_KEYS[label]}-from:${from}deg;--${REVIEW_KEYS[label]}-to:${ringStop}deg`; }).join(';');
  if(statsTheme && !logs.some(log=>(log.genre||'その他')===statsTheme))statsTheme='';
  const periodOf=log=>{ const date=new Date(log.createdAt); return Number.isNaN(date.getTime())?'':`${date.getFullYear()}年${date.getMonth()+1}月`; };
  if(statsPeriod && !logs.some(log=>periodOf(log)===statsPeriod))statsPeriod='';
  const themeButton=(name,inner,className)=>`<button class="${className}${statsTheme===name?' selected':''}" data-action="stats-theme" data-value="${esc(name)}" aria-pressed="${statsTheme===name}">${inner}</button>`;
  const logPanel=(kicker,name,list,action)=>`<section class="stats-theme-logs" aria-live="polite"><header><h2><span>${kicker}</span>「${esc(name)}」の決断<b>${list.length}件</b></h2><button class="stats-theme-close" data-action="${action}" data-value="${esc(name)}" aria-label="一覧を閉じる">×</button></header><div class="history-list">${list.map(log=>historyItem(log,{deletable:false})).join('')}</div></section>`;
  const newestFirst=(a,b)=>new Date(b.createdAt)-new Date(a.createdAt);
  const themeLogPanel=statsTheme?logPanel('THEME LOG',statsTheme,logs.filter(log=>(log.genre||'その他')===statsTheme).sort(newestFirst),'stats-theme'):'';
  const reviewLogPanel=statsReview&&statsReview!=='評価待ち'?logPanel('REVIEW LOG',statsReview,logs.filter(log=>log.review===statsReview).sort(newestFirst),'stats-review'):'';
  const pendingLogPanel=statsReview==='評価待ち'?logPanel('PENDING LOG','評価待ち',logs.filter(log=>!log.review).sort(newestFirst),'stats-review'):'';
  const periodLogPanel=statsPeriod?logPanel('PERIOD LOG',statsPeriod,logs.filter(log=>periodOf(log)===statsPeriod).sort(newestFirst),'stats-period'):'';
  const pendingBlock=pendingCount
    ?`<button class="stats-pending${statsReview==='評価待ち'?' selected':''}" data-action="stats-review" data-value="評価待ち" aria-pressed="${statsReview==='評価待ち'}"><span class="stats-pending-kicker">AWAITING REVIEW</span><span class="stats-pending-title">決断評価待ち</span><strong>${pendingCount}<small>件</small></strong></button>`
    :`<section class="stats-pending empty"><span class="stats-pending-kicker">AWAITING REVIEW</span><span class="stats-pending-title">決断評価待ち<small>評価待ちはありません</small></span><strong>0<small>件</small></strong></section>`;
  const rankPanel=(kicker,title,items,action,selected,lead,emptyText,logPanelHtml)=>{
    const total=items.reduce((sum,[,count])=>sum+count,0);
    const max=Math.max(...items.map(([,count])=>count),1);
    const rows=items.map(([name,count],index)=>`<button class="stats-rank-row${selected===name?' selected':''}" data-action="${action}" data-value="${esc(name)}" aria-pressed="${selected===name}"><em class="stats-rank-lead">${lead(name,index)}</em><span class="stats-rank-name">${esc(name)}</span><strong>${count}<small>件</small></strong><i><b style="width:${Math.round(count/max*100)}%"></b></i><small class="stats-rank-share">${total?Math.round(count/total*100):0}%</small></button>`).join('');
    return `<section class="stats-rank"><header class="stats-rank-head"><span>${kicker}</span><h2>${title}</h2><b>${total}<small>件</small></b></header>${items.length?`<div class="stats-rank-list">${rows}</div>`:`<p class="stats-rank-empty">${emptyText}</p>`}</section>${logPanelHtml}`;
  };
  const themePanel=rankPanel('THEME RANKING','テーマ別の決断',themes,'stats-theme',statsTheme,(name,index)=>String(index+1).padStart(2,'0'),'決断を記録すると、よく考えるテーマが見えてきます。',themeLogPanel);
  const periodPanel=rankPanel('MONTHLY RECORD','最近6か月の記録',recentMonthCounts(logs),'stats-period',statsPeriod,name=>{ const [,y,m]=name.match(/^(\d+)年(\d+)月$/)||[]; return `${String(m).padStart(2,'0')}<small>${y}</small>`; },'記録が増えると、月ごとの決断数を比べられます。',periodLogPanel);
  const summaryPanel=`<section class="stats-summary"><span>これまでの決断</span><strong>${logs.length}<small>件</small></strong></section>${pendingBlock}${pendingLogPanel}<section class="satisfaction"><h2>決断の満足度</h2><div class="satisfaction-ring${reviewed.length?'':' empty'}" style="${ringStyle}"><strong>${reviewed.length ? `${satisfaction}<small>%</small>` : '—'}</strong><span>${reviewed.length ? '満足' : '評価待ち'}</span></div><div class="review-bars">${reviewRows}</div></section>${reviewLogPanel}<section class="stats-themes"><h2>よくあるテーマ</h2><div>${themes.length?themes.map(([name,count])=>themeButton(name,`${esc(name)} <b>${count}</b>`,'stats-theme-ticket')).join(''):'<span>まだデータがありません</span>'}</div></section>${themeLogPanel}`;
  const panels={summary:summaryPanel,theme:themePanel,period:periodPanel};
  const tabs=[['summary','サマリー'],['theme','テーマ'],['period','期間']];
  const current=panels[statsTab] ? statsTab : 'summary';
  app.innerHTML=`<section class="screen stats-screen">
    <button class="stats-back" data-action="home">← ホーム</button>
    <header class="stats-title"><h1>MY<br>DECISION<br>PATTERN</h1><p>私の意思決定の傾向</p></header>
    <div class="stats-tabs" role="tablist" aria-label="統計の表示">${tabs.map(([value,label])=>`<button data-action="stats-tab" data-value="${value}" role="tab" class="${current===value?'selected':''}" aria-selected="${current===value}">${label}</button>`).join('')}</div>
    <div class="stats-panel" role="tabpanel">${panels[current]}</div>
  </section>`;
}
function renderDetail() {
  const log = logs.find(l => l.id === detailId);
  if (!log) return navigate('history');
  if(completionId===log.id) {
    document.body.dataset.detailMode='complete';
    app.innerHTML=`<section class="screen completion-screen">
      <div class="completion-hero" aria-hidden="true"><p class="completion-script">DECIDED<span>決断を、次の一歩へ。</span></p></div>
      <div class="completion-dock">
        <div class="completion-copy"><h1>よし、決めた。</h1><p>この決断を記録しました。</p><strong data-completion-title></strong></div>
        ${renderRemindPicker(log)}
        <div class="completion-actions"><button class="button satisfied-button" data-action="satisfied"><small>DONE</small>納得できた！</button><div class="completion-sub"><button class="button secondary" data-action="share-log" data-id="${esc(log.id)}">SNSでシェア ↗</button><button class="button ghost" data-action="home">ホームへ</button></div></div>
      </div>
    </section>`;
    app.querySelector('[data-completion-title]').textContent=DECIDE_DECISION.decisionText(log);
    return;
  }
  document.body.dataset.detailMode='review';
  const showA2HS=log.id===a2hsBannerLogId && shouldShowA2HS();
  const appBrowser=showA2HS && inAppBrowser();
  app.innerHTML = `<section class="screen detail-screen">
    <button class="text-back" data-action="${detailReturn==='stats'?'stats':'history'}" aria-label="${detailReturn==='stats'?'統計へ戻る':'履歴へ戻る'}">← 戻る</button>
    ${showA2HS ? `<aside class="storage-banner a2hs-banner" data-a2hs-banner><button class="banner-close" data-action="dismiss-a2hs" aria-label="案内を閉じる">×</button><p>${appBrowser ? 'この画面では、ホーム画面に追加できません。メニューから『ブラウザで開く』（Safariで開く）を選んでから、追加してください。' : '記録を消さないために、ホーム画面に追加しておきませんか？　Safariでは、しばらく開かないと記録が消えることがあります。'}</p><div class="banner-actions">${appBrowser ? '' : '<button class="button secondary" data-action="a2hs-help">追加のしかた</button>'}<button class="button ghost" data-action="dismiss-a2hs">あとで</button></div></aside>` : ''}
    ${renderDetailDate(log.createdAt)}<p class="eyebrow">${formatDate(log.createdAt, true)}</p>
    <h1 data-detail-title></h1><div class="outcome"><span class="decided-stamp" aria-hidden="true">DECIDED</span><span>今回の結論</span><strong>${esc(DECIDE_DECISION.decisionText(log))}</strong><button data-action="share-log" data-id="${esc(log.id)}">この結果をシェア ↗</button></div>
    <div class="saved-cards"><p class="panel-title">引いたカードと意味</p>${log.nodes.map((node,index) => renderSavedCard(log,node,index)).join('')}</div>
    ${log.memo ? '<div class="saved-memo"><span>メモ</span><p data-detail-memo></p></div>' : ''}
    <section class="story-panel"><div class="story-head"><div><p class="panel-title">その後のストーリー</p><span>時間が経って分かったことや、選択の続きを残せます。</span></div>${log.storyUpdatedAt ? `<time>更新 ${formatDate(log.storyUpdatedAt)}</time>` : ''}</div>
      <textarea id="story-text" rows="6" maxlength="2000" placeholder="例：実際に選択肢Aを選んでみたら、最初に心配していたことよりも…"></textarea>
      <div class="story-actions"><button class="button secondary" data-action="save-story" data-id="${esc(log.id)}">${log.story ? 'ストーリーを更新する' : 'ストーリーを保存する'}</button>${log.story ? `<button class="button ghost" data-action="share-story" data-id="${esc(log.id)}">その後をシェア ↗</button>` : ''}</div>
    </section>
    <section class="review-panel"><p class="panel-title">この選択、その後どうでした？</p>
      <div class="review-grid">${['良かった','まあ良かった','どちらとも言えない','違った'].map(r => `<button class="review-button ${log.review === r ? 'selected' : ''}" data-action="review" data-value="${r}"><b>${reviewIcon(r)}</b><span>${r}</span></button>`).join('')}</div>
      ${log.review ? `<p class="review-saved">${formatDate(log.reviewedAt || new Date().toISOString())} に振り返りました</p><button class="button satisfied-button" data-action="satisfied"><small>DONE</small>納得できた！</button>` : `<p class="review-hint">すぐに決めなくても大丈夫です。時間が経ってから戻ってきてください。</p>${renderRemindPicker(log)}`}
    </section>
    <div class="danger-zone"><button data-action="delete-log" data-id="${esc(log.id)}">この履歴を削除</button></div>
  </section>`;
  app.querySelector('[data-detail-title]').textContent=log.title;
  const memo=app.querySelector('[data-detail-memo]'); if(memo)memo.textContent=log.memo;
  app.querySelector('#story-text').value=log.story || '';
  if(showA2HS && a2hsShownLogId!==log.id) { a2hsShownLogId=log.id; storageEvent('a2hsShown'); }
}

const REMIND_OPTIONS=[[3,'3日後'],[7,'1週間後'],[30,'1か月後'],[0,'決めない']];
function renderRemindPicker(log) {
  const at=log.remindAt ? new Date(log.remindAt) : null; const valid=at && !Number.isNaN(at.getTime());
  const chosen=valid ? REMIND_OPTIONS.find(([days])=>days && Math.abs(at-new Date(log.createdAt).getTime()-days*DAY_MS)<DAY_MS/2)?.[0] : null;
  return `<section class="remind-picker" aria-labelledby="remind-title-${esc(log.id)}">
    <p class="remind-kicker">REMIND ME</p>
    <h2 id="remind-title-${esc(log.id)}">いつ頃、結論が出そう？</h2>
    <div class="remind-options">${REMIND_OPTIONS.map(([days,label])=>`<button class="${(days?chosen===days:log.remindAt===null)?'selected':''}" data-action="set-remind" data-days="${days}" data-id="${esc(log.id)}" aria-pressed="${days?chosen===days:log.remindAt===null}">${label}</button>`).join('')}</div>
    <p class="remind-status">${valid ? `<b>${formatDate(log.remindAt)}</b> ごろ、アプリを開いたときに「その後どう？」とお聞きします` : log.remindAt===null ? 'リマインドなし。気が向いたら履歴から振り返れます' : '選ぶと、その頃にアプリを開いたとき振り返りをご案内します'}</p>
  </section>`;
}
function setRemind(id,days) {
  const log=logs.find(item=>item.id===id); if(!log)return;
  sensoryFeedback('tick');
  const base=new Date(log.createdAt).getTime(); const from=Number.isNaN(base)?Date.now():base;
  log.remindAt=days>0 ? new Date(Math.max(from+days*DAY_MS,Date.now()+DAY_MS/2)).toISOString() : null;
  persist(); renderDetail(); toast(days>0 ? `${formatDate(log.remindAt)} ごろにお聞きします` : 'リマインドなしにしました');
}
function dueReviewLog() {
  const now=Date.now();
  return logs.filter(log=>!log.review && log.remindAt && new Date(log.remindAt).getTime()<=now).sort((a,b)=>new Date(a.remindAt)-new Date(b.remindAt))[0] || null;
}
function checkDueReview() {
  if(document.querySelector('.modal-wrap, .tutorial-intro, .farewell'))return;
  const log=dueReviewLog(); if(!log)return;
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='due-review-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="due-review-later" data-id="${esc(log.id)}" aria-label="あとで"></button><section class="settings-sheet confirm-sheet due-review-sheet" role="dialog" aria-modal="true" aria-labelledby="due-review-title"><div class="sheet-handle"></div><p class="due-review-kicker">LOOK BACK</p><div class="sheet-head"><h2 id="due-review-title">あの決断、その後どうですか？</h2><button data-action="due-review-later" data-id="${esc(log.id)}" aria-label="閉じる">×</button></div><div class="due-review-log"><time>${formatDate(log.createdAt)}</time><strong data-due-title></strong><span data-due-decision></span></div><p class="due-review-note">結果がどうであれ、振り返ることで次の決断が少しラクになります。</p><div class="confirm-actions"><button class="button" data-action="due-review-open" data-id="${esc(log.id)}">振り返る</button><button class="button ghost" data-action="due-review-later" data-id="${esc(log.id)}">あとで（3日後）</button></div></section>`;
  wrap.querySelector('[data-due-title]').textContent=log.title || '無題の決断';
  wrap.querySelector('[data-due-decision]').textContent=`結論：${DECIDE_DECISION.decisionText(log)}`;
  mountModal(wrap,'[data-action="due-review-open"]');
}
function openFarewell() {
  if(document.querySelector('.farewell'))return;
  sensoryFeedback('save');
  const wrap=document.createElement('div'); wrap.className='farewell'; wrap.setAttribute('role','dialog'); wrap.setAttribute('aria-modal','true'); wrap.setAttribute('aria-labelledby','farewell-title');
  const count=logs.length; const reviewed=logs.filter(log=>log.review).length;
  wrap.innerHTML=`<div class="farewell-inner">
    <p class="farewell-kicker">SEE YOU AGAIN</p>
    <p class="farewell-mark" aria-hidden="true">DECIDE<span>.</span></p>
    <h2 id="farewell-title">迷ったら、<br>またここへ。</h2>
    <p class="farewell-copy">決めたのは、あなた自身です。<br>次に迷ったときも、カードがきっかけになります。</p>
    <p class="farewell-count"><b>${count}</b><span>DECISIONS</span><b>${reviewed}</b><span>LOOKED BACK</span></p>
    <p class="farewell-note">このままアプリを閉じて大丈夫です</p>
    <button class="button farewell-home" data-action="farewell-home">ホームへ</button>
  </div>`;
  document.body.appendChild(wrap); setBodyScrollLocked(true);
  requestAnimationFrame(()=>{ wrap.classList.add('is-open'); wrap.querySelector('.farewell-home')?.focus({preventScroll:true}); });
}
function closeFarewell() {
  const wrap=document.querySelector('.farewell'); if(!wrap)return;
  wrap.remove(); setBodyScrollLocked(false);
}

function renderDetailDate(iso) {
  const date=new Date(iso); if(Number.isNaN(date.getTime()))return '';
  const month=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][date.getMonth()];
  return `<div class="detail-date" aria-hidden="true"><b>${String(date.getDate()).padStart(2,'0')}</b><span><i>${month}</i><small>${date.getFullYear()}</small></span></div>`;
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

function openDeleteConfirm(id) {
  const log=logs.find(item=>item.id===id); if(!log)return;
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='delete-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="close-delete" aria-label="削除確認を閉じる"></button><section class="settings-sheet confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div class="sheet-handle"></div><p class="eyebrow">Delete log</p><h2 id="delete-title">この履歴を削除しますか？</h2><p>「<span data-delete-title></span>」のカード、メモ、振り返り、ストーリーが削除されます。この操作は元に戻せません。</p><div class="confirm-actions"><button class="button secondary" data-action="close-delete">キャンセル</button><button class="button danger" data-action="confirm-delete" data-id="${esc(log.id)}">削除する</button></div></section>`;
  wrap.querySelector('[data-delete-title]').textContent=log.title;
  mountModal(wrap,'.settings-sheet [data-action="close-delete"]');
}
const modalBackground=()=>document.querySelectorAll('.topbar, #app, .bottom-nav');
function setBackgroundInert(value) { modalBackground().forEach(element=>{ element.inert=value; if(value)element.setAttribute('aria-hidden','true'); else element.removeAttribute('aria-hidden'); }); }
function focusableElements(modal) { return [...modal.querySelectorAll('.settings-sheet a[href], .settings-sheet button:not([disabled]), .settings-sheet input:not([disabled]), .settings-sheet textarea:not([disabled]), .settings-sheet select:not([disabled]), .settings-sheet [tabindex]:not([tabindex="-1"])')].filter(element=>!element.hidden && element.getClientRects().length); }
let modalScrollY=0;
function setBodyScrollLocked(value) {
  const shell=document.querySelector('.app-shell');
  if(value) {
    if(document.body.classList.contains('modal-open'))return;
    modalScrollY=window.scrollY;
    if(shell)shell.style.top=`-${modalScrollY}px`;
    document.body.classList.add('modal-open');
    return;
  }
  if(!document.body.classList.contains('modal-open'))return;
  document.body.classList.remove('modal-open');
  shell?.style.removeProperty('top');
  window.scrollTo(0,modalScrollY);
}
function enableSheetSwipe(wrap) {
  const sheet=wrap.querySelector('.settings-sheet'); const handle=wrap.querySelector('.sheet-handle');
  if(!sheet || !handle)return;
  let startY=0; let distance=0; let tracking=false;
  handle.addEventListener('pointerdown',event=>{
    if(!event.isPrimary || sheet.scrollTop>0)return;
    tracking=true; startY=event.clientY; distance=0; sheet.classList.add('is-dragging'); handle.setPointerCapture?.(event.pointerId);
  });
  handle.addEventListener('pointermove',event=>{
    if(!tracking)return;
    const next=event.clientY-startY;
    if(next<=0){ distance=0; sheet.style.removeProperty('transform'); return; }
    distance=Math.min(next,220); sheet.style.transform=`translateY(${distance}px)`; event.preventDefault();
  });
  const finish=()=>{
    if(!tracking)return;
    tracking=false; sheet.classList.remove('is-dragging'); sheet.style.removeProperty('transform');
    if(distance>=72)closeModal(`#${wrap.id}`);
    distance=0;
  };
  handle.addEventListener('pointerup',finish);
  handle.addEventListener('pointercancel',finish);
}
function mountModal(wrap, initialSelector) {
  wrap.returnFocus=document.activeElement;
  document.body.appendChild(wrap);
  setBodyScrollLocked(true);
  setBackgroundInert(true);
  enableSheetSwipe(wrap);
  requestAnimationFrame(()=>{ wrap.classList.add('open'); const initial=wrap.querySelector(initialSelector) || focusableElements(wrap)[0] || wrap.querySelector('[role="dialog"]'); initial?.focus(); });
}
function closeModal(selector) {
  const modal=document.querySelector(selector); if(!modal || modal.classList.contains('closing'))return;
  if(selector==='#card-modal')activeCardDetail=null;
  const returnFocus=modal.returnFocus;
  modal.classList.add('closing'); modal.classList.remove('open');
  setTimeout(()=>{ modal.remove(); if(!document.querySelector('.modal-wrap:not(.closing)')){ setBackgroundInert(false); setBodyScrollLocked(false); } if(returnFocus?.isConnected)returnFocus.focus(); else app.focus(); },180);
}
function closeDelete() { closeModal('#delete-modal'); }
function deleteLog(id) {
  const log=logs.find(item=>item.id===id); if(!log)return;
  logs=logs.filter(item=>item.id!==id); window.DECIDE_SYNC?.markDeleted?.(id); persist(); closeDelete(); detailId=null; currentView='history'; render(); toast('履歴を削除しました');
}

function switchCardTheme(key) {
  if(!activeCardDetail || !cardThemeLabels[key])return;
  const modal=document.querySelector('#card-modal'); const copy=activeCardDetail.content[activeCardDetail.direction];
  modal?.querySelectorAll('[data-action="card-theme"]').forEach(button=>{ const selected=button.dataset.theme===key; button.classList.toggle('selected',selected); button.setAttribute('aria-selected',String(selected)); });
  const title=modal?.querySelector('[data-theme-title]'); const text=modal?.querySelector('[data-theme-text]');
  if(title)title.textContent=cardThemeLabels[key];
  if(text)text.textContent=copy.themes[key];
}
function openCardDetail(card, originQuestion='') {
  if(!card)return;
  const direction=card.orientation==='reversed'?'reversed':'upright';
  const content=cardContent(card);
  if(!content) {
    const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='card-modal';
    wrap.innerHTML=`<button class="modal-shade" data-action="close-card-detail" aria-label="カード詳細を閉じる"></button><section class="settings-sheet card-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="card-detail-title"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Card meaning</p><h2 id="card-detail-title">カードの詳しい意味</h2></div><button data-action="close-card-detail" aria-label="閉じる">×</button></div><header class="card-detail-header"><span class="card-image-frame card-detail-image-frame">${cardPicture(card,{className:direction==='reversed'?'reversed-image':'',sizes:'132px'})}</span><div><span class="orientation-badge">${orientationLabel(card)}</span><h3>${esc(card.name)}</h3></div></header><button class="button card-detail-close" data-action="close-card-detail">閉じる</button></section>`;
    mountModal(wrap,'.sheet-head button'); return;
  }
  const opposite=direction==='upright'?'reversed':'upright';
  const current=content[direction]; const other=content[opposite];
  const originKey=originQuestion ? themeKey(originQuestion) : 'blind';
  activeCardDetail={content,direction,originKey};
  const number=card.number || content.id?.slice(2) || '';
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='card-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="close-card-detail" aria-label="カード詳細を閉じる"></button><section class="settings-sheet card-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="card-detail-title"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Card meaning</p><h2 id="card-detail-title">カードの詳しい意味</h2></div><button data-action="close-card-detail" aria-label="閉じる">×</button></div>
    <header class="card-detail-header"><span class="card-image-frame card-detail-image-frame">${cardPicture(card,{className:direction==='reversed'?'reversed-image':'',sizes:'132px'})}</span><div><span class="orientation-badge">${orientationLabel(card)}</span><h3>${esc(content.name)}</h3>${content.en?`<p class="card-english">${esc(content.en)}</p>`:''}<p class="card-meta">番号 ${esc(number)} ・ ${esc(content.arcana)}</p>${content.symbol?`<p class="card-symbol">${esc(content.symbol)}</p>`:''}</div></header>
    <div class="card-detail-copy"><section><h3>物語のなかの位置</h3><p>${esc(content.story)}</p></section><section><h3>絵柄と背景</h3><p>${esc(content.background)}</p></section><section><h3>この向きの意味</h3><div class="keyword-chips">${current.keywords.map(keyword=>`<i>${esc(keyword)}</i>`).join('')}</div><p class="direction-meaning">${esc(current.meaning)}</p></section>
    <section class="theme-reading"><h3>テーマ別の読み方</h3><div class="theme-tabs" role="tablist" aria-label="テーマを選ぶ">${Object.entries(cardThemeLabels).map(([key,label])=>`<button role="tab" aria-selected="${key===originKey}" class="${key===originKey?'selected':''}" data-action="card-theme" data-theme="${key}">${key===originKey?'<span aria-hidden="true">●</span>':''}${esc(label)}</button>`).join('')}</div><div class="theme-panel" role="tabpanel"><b data-theme-title>${esc(cardThemeLabels[originKey])}</b><p data-theme-text>${esc(current.themes[originKey])}</p></div></section>
    <details class="opposite-meaning"><summary>反対の向きでは <span>${opposite==='upright'?'正位置':'逆位置'}</span></summary><div class="keyword-chips">${other.keywords.map(keyword=>`<i>${esc(keyword)}</i>`).join('')}</div><p>${esc(other.meaning)}</p></details>
    <small class="card-disclaimer">カードは未来を断定するものではありません。自分の状況を考える視点として使ってください。</small></div><button class="button card-detail-close" data-action="close-card-detail">閉じる</button></section>`;
  mountModal(wrap,'.sheet-head button');
}
function closeCardDetail() { activeCardDetail=null; closeModal('#card-modal'); }

function encodeSharedPayload(payload) { return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))); }
function readSharedPayload() {
  try {
    const result=DECIDE_SHARED.readSharedHash(location.hash,new Set(DECK.map(card=>card.id)));
    return result.found ? (result.payload || {invalid:true}) : null;
  } catch { return location.hash.startsWith('#share=') ? {invalid:true} : null; }
}
function sharedResultUrl(log,type,{includeContent=false}={}) {
  const nodes=(log.nodes||[]).slice(0,2);
  const payload={d:log.decision,c:nodes.map(node=>[node.card.id,node.card.orientation==='reversed'?1:0])};
  if(type==='story'&&includeContent){ payload.t=log.title; payload.s=(log.story||'').slice(0,700); }
  return `${location.origin}${location.pathname}#share=${encodeSharedPayload(payload)}`;
}
function normalizeSharedPayload(payload) {
  try { return DECIDE_SHARED.normalizeSharedPayload(payload,{deck:DECK,contentById:cardContentById,contentCardId,cardImage,compare:comparisonVerdict}); }
  catch { return null; }
}
function renderInvalidSharedResult() {
  app.innerHTML=`<section class="screen shared-screen empty-state"><p class="eyebrow">Shared from DECIDE</p><h1>このリンクは読み込めませんでした</h1><p>リンクが途中で切れているか、古い形式かもしれません。</p><button class="button" data-action="open-app">DECIDEを使ってみる</button></section>`;
}
function renderSharedResult() {
  if(!sharedPayload){ currentView='home'; return renderHome(); }
  const payload=normalizeSharedPayload(sharedPayload);
  if(!payload)return renderInvalidSharedResult();
  app.innerHTML=`<section class="screen shared-screen"><p class="eyebrow">Shared from DECIDE</p><h1 data-shared-title></h1><div class="shared-outcome"><strong data-shared-outcome></strong></div><div class="shared-card-grid">${payload.cards.map(card=>DECIDE_SHARED.renderSharedCard(card,esc)).join('')}</div>${payload.story?'<section class="shared-story"><span>その後のストーリー</span><p data-shared-story></p></section>':''}<div class="shared-note"><b>DECIDEとは？</b><p>タロットカードをきっかけに、心から納得できる決断を助ける思考ツールです。</p></div><button class="button" data-action="open-app">自分もカードを引いてみる</button></section>`;
  app.querySelector('[data-shared-title]').textContent=payload.title||'決定の記録';
  app.querySelector('[data-shared-outcome]').textContent=DECIDE_SHARED.sharedOutcomeText(payload.decision,payload.verdict);
  const sharedStory=app.querySelector('[data-shared-story]'); if(sharedStory)sharedStory.textContent=payload.story;
}

async function createShareImageBlob(data) {
  const canvas=document.createElement('canvas'); canvas.width=1080; canvas.height=1350; const ctx=canvas.getContext('2d');
  const YELLOW='#f1d527', INK='#0b0b0b', CREAM='#f4efe3', SERIF='Didot,"Bodoni 72","Bodoni MT",serif', MINCHO='"Hiragino Mincho ProN","Yu Mincho",serif';
  ctx.fillStyle=INK; ctx.fillRect(0,0,1080,1350);
  ctx.strokeStyle='rgba(244,239,227,.08)'; ctx.lineWidth=1; for(let y=0;y<1350;y+=6){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1080,y);ctx.stroke();}
  ctx.save(); ctx.translate(540,120); ctx.rotate(-.025); ctx.fillStyle=YELLOW; ctx.fillRect(-560,-58,1120,116); ctx.restore();
  ctx.fillStyle=INK; ctx.font=`italic 700 92px ${SERIF}`; ctx.textBaseline='middle'; ctx.fillText('DECIDE.',64,122);
  ctx.font=`700 22px ${SERIF}`; ctx.textAlign='right'; ctx.fillText('TAROT FOR DECISIONS',1016,134); ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.fillStyle=YELLOW; ctx.font=`700 24px ${SERIF}`; ctx.fillText('— THE QUESTION',72,250);
  ctx.fillStyle=CREAM; ctx.font=`700 50px ${MINCHO}`; wrapCanvasText(ctx,data.logTitle||data.title,72,318,936,64,2);
  const cards=data.cards||[]; const cardWidth=cards.length>1?330:380; const cardHeight=cardWidth*1.7; const gap=cards.length>1?120:0; const total=cardWidth*cards.length+gap*Math.max(0,cards.length-1); let x=(1080-total)/2; const top=cards.length>1?440:420;
  for(const [index,card] of cards.entries()){
    const tilt=cards.length>1?(index?.035:-.035):-.02;
    ctx.save(); ctx.translate(x+cardWidth/2,top+cardHeight/2); ctx.rotate(tilt);
    ctx.fillStyle=YELLOW; ctx.fillRect(-cardWidth/2+16,-cardHeight/2+16,cardWidth,cardHeight);
    ctx.fillStyle=CREAM; ctx.fillRect(-cardWidth/2-8,-cardHeight/2-8,cardWidth+16,cardHeight+16);
    try{ const image=await loadShareImage(card.image); if(card.orientation==='reversed')ctx.rotate(Math.PI); ctx.drawImage(image,-cardWidth/2,-cardHeight/2,cardWidth,cardHeight); }catch{}
    ctx.restore();
    if(cards.length>1){ ctx.save(); ctx.translate(x+cardWidth/2,top-26); ctx.rotate(tilt); ctx.fillStyle=index?YELLOW:CREAM; ctx.fillRect(-92,-22,184,44); ctx.fillStyle=INK; ctx.font=`700 24px ${SERIF}`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(`OPTION ${index?'B':'A'}`,0,2); ctx.restore(); }
    const textTop=top+cardHeight+60; ctx.fillStyle=CREAM; ctx.font=`700 30px ${MINCHO}`; ctx.fillText(`${card.name}${card.orientation==='reversed'?'（逆位置）':''}`,x,textTop,cardWidth); ctx.fillStyle=YELLOW; ctx.font=`500 24px ${MINCHO}`; wrapCanvasText(ctx,card.meaning,x,textTop+40,cardWidth,34,2);
    x+=cardWidth+gap;
  }
  if(cards.length>1){ const cx=540, cy=top+cardHeight/2; ctx.save(); ctx.translate(cx,cy); ctx.rotate(-.08); ctx.fillStyle=YELLOW; ctx.fillRect(-46+8,-46+8,92,92); ctx.fillStyle=INK; ctx.fillRect(-46,-46,92,92); ctx.strokeStyle=YELLOW; ctx.lineWidth=3; ctx.strokeRect(-46,-46,92,92); ctx.fillStyle=YELLOW; ctx.font=`italic 700 46px ${SERIF}`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('OR',0,3); ctx.restore(); }
  ctx.save(); ctx.translate(72,1218); ctx.rotate(-.012); ctx.fillStyle=YELLOW; ctx.fillRect(10,10,936,84); ctx.fillStyle=CREAM; ctx.fillRect(0,0,936,84); ctx.fillStyle=INK; ctx.font=`700 22px ${SERIF}`; ctx.textBaseline='middle'; ctx.fillText('DECIDED',28,42); ctx.font=`700 36px ${MINCHO}`; ctx.fillText(data.decision||'',180,44,730); ctx.restore();
  return await new Promise(resolve=>canvas.toBlob(resolve,'image/png',.94));
}
// Instagramストーリーズ用 9:16（上下約250pxは安全域として空ける）
async function createStoryImageBlob(data, theme) {
  const W=1080, H=1920; const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H; const ctx=canvas.getContext('2d');
  const P=window.DECIDE_SHARE_THEMES?.palette?.(theme)||{};
  const YELLOW=P.yellow||'#f1d527', INK=P.ink||'#0b0b0b', CREAM=P.cream||'#f4efe3', SERIF='Didot,"Bodoni 72","Bodoni MT",serif', MINCHO='"Hiragino Mincho ProN","Yu Mincho",serif';
  ctx.fillStyle=INK; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=P.line||'rgba(244,239,227,.08)'; ctx.lineWidth=1; for(let y=0;y<H;y+=6){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.save(); ctx.translate(540,330); ctx.rotate(-.025); ctx.fillStyle=YELLOW; ctx.fillRect(-560,-62,1120,124); ctx.restore();
  ctx.fillStyle=INK; ctx.textBaseline='middle'; ctx.textAlign='center'; ctx.font=`italic 700 100px ${SERIF}`; ctx.fillText('DECIDE.',540,334);
  ctx.textBaseline='alphabetic'; ctx.fillStyle=YELLOW; ctx.font=`700 28px ${SERIF}`; ctx.fillText('— MY DECISION —',540,500);
  ctx.fillStyle=CREAM; ctx.font=`700 64px ${MINCHO}`; wrapCanvasText(ctx,`私は「${data.decision||''}」に決めた`,540,600,920,84,3);
  const cards=data.cards||[]; const cardWidth=cards.length>1?340:380; const cardHeight=cardWidth*1.7; const gap=cards.length>1?100:0; const total=cardWidth*cards.length+gap*Math.max(0,cards.length-1); let x=(W-total)/2; const top=860;
  for(const [index,card] of cards.entries()){
    const tilt=cards.length>1?(index?.035:-.035):-.02;
    ctx.save(); ctx.translate(x+cardWidth/2,top+cardHeight/2); ctx.rotate(tilt);
    ctx.fillStyle=YELLOW; ctx.fillRect(-cardWidth/2+16,-cardHeight/2+16,cardWidth,cardHeight);
    ctx.fillStyle=CREAM; ctx.fillRect(-cardWidth/2-8,-cardHeight/2-8,cardWidth+16,cardHeight+16);
    try{ const image=await loadShareImage(card.image); if(card.orientation==='reversed')ctx.rotate(Math.PI); ctx.drawImage(image,-cardWidth/2,-cardHeight/2,cardWidth,cardHeight); }catch{}
    ctx.restore();
    const cx=x+cardWidth/2, textTop=top+cardHeight+70;
    if(card.keyword){ ctx.font=`700 36px ${MINCHO}`; const w=Math.min(cardWidth+20,ctx.measureText(card.keyword).width+48); ctx.fillStyle=YELLOW; ctx.fillRect(cx-w/2,textTop-40,w,60); ctx.fillStyle=INK; ctx.fillText(card.keyword,cx,textTop,cardWidth); }
    ctx.fillStyle=CREAM; ctx.font=`700 30px ${MINCHO}`; ctx.fillText(`${card.name}${card.orientation==='reversed'?'（逆位置）':''}`,cx,textTop+64,cardWidth);
    x+=cardWidth+gap;
  }
  ctx.fillStyle=YELLOW; ctx.font=`700 34px ${SERIF}`; ctx.fillText('decisionprocess.net',540,1660);
  ctx.fillStyle=P.soft||'rgba(244,239,227,.6)'; ctx.font=`500 24px ${MINCHO}`; ctx.fillText('タロットで、迷いに答えを出す',540,1704);
  return await new Promise(resolve=>canvas.toBlob(resolve,'image/png',.94));
}
function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight,maxLines=3){ let line='';let count=0;for(const char of String(text||'')){const next=line+char;if(ctx.measureText(next).width>maxWidth&&line){ctx.fillText(line,x,y+count*lineHeight);line=char;count++;if(count>=maxLines)return;}else line=next;}if(count<maxLines)ctx.fillText(line,x,y+count*lineHeight); }
function loadShareImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});}
async function downloadShareImage(){ if(!activeShareData?.cards?.length)return; try { const blob=await createShareImageBlob(activeShareData); if(!blob){toast('画像を保存できませんでした');return;} const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='decide-result.png';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('共有画像を保存しました'); } catch { toast('画像を保存できませんでした'); } }

function renderDeckPresets() {
  return DECK_PRESETS.map(preset => {
    const selected=settings.deckMode===preset.mode;
    return `<button type="button" class="deck-preset ${selected?'selected':''}" role="radio" aria-checked="${selected}" tabindex="${selected?'0':'-1'}" data-action="deck-preset" data-value="${preset.mode}">
      <span class="deck-preset-head"><strong>${preset.name}</strong><span class="deck-preset-badge" ${selected?'':'hidden'}>使用中</span></span>
      <span class="deck-preset-subtitle">${preset.subtitle}</span>
      <span class="deck-preset-line"><b>ひとこと：</b>${preset.one}</span>
      <span class="deck-preset-line"><b>メリット：</b>${preset.benefit}</span>
      <span class="deck-preset-line"><b>デメリット：</b>${preset.drawback}</span>
      <span class="deck-preset-line"><b>向いている場面：</b>${preset.scene}</span>
    </button>`;
  }).join('');
}
function openSettings() {
  const wrap = document.createElement('div'); wrap.className='modal-wrap'; wrap.id='settings-modal';
  wrap.innerHTML = `<button class="modal-shade" data-action="close-settings" aria-label="設定を閉じる"></button><section class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="sheet-handle"></div><div class="sheet-head"><h2 id="settings-title">設定</h2><button data-action="close-settings" aria-label="閉じる">×</button></div>
    <div class="deck-setting"><b id="deck-setting-title">使うカード</b><p>引くカードの種類と、逆位置の有無を選べます。あとから、いつでも変えられます。</p>
      <div class="deck-presets" role="radiogroup" aria-labelledby="deck-setting-title">${renderDeckPresets()}</div>
      <div class="deck-preset-notes"><p>選ぶと、次に引くカードから変わります。これまでの履歴は変わりません。</p><p>逆位置ありでは、引いたカードの約3割が逆位置になります。</p></div>
      <details class="deck-advanced"><summary>詳しく設定する</summary>
      <div class="setting-switch-row"><span><b>カード範囲</b><small data-deck-count>${settings.deckMode.startsWith('major') ? '22枚' : '78枚'}</small></span><div class="segmented-switch" aria-label="使うカードの範囲"><button class="${settings.deckMode.startsWith('major') ? 'selected' : ''}" data-action="deck-scope" data-value="major">大アルカナ</button><button class="${settings.deckMode.startsWith('all') ? 'selected' : ''}" data-action="deck-scope" data-value="all">全カード</button></div></div>
      <div class="setting-switch-row"><span><b>カードの向き</b><small data-orientation-note>${settings.deckMode.endsWith('reversed') ? '逆位置を含む' : '正位置だけ'}</small></span><div class="segmented-switch" aria-label="カードの向き"><button class="${settings.deckMode.endsWith('upright') ? 'selected' : ''}" data-action="deck-orientation" data-value="upright">正位置のみ</button><button class="${settings.deckMode.endsWith('reversed') ? 'selected' : ''}" data-action="deck-orientation" data-value="reversed">正逆あり</button></div></div>
      <div class="deck-summary"><span>現在</span><strong data-deck-summary>${settings.deckMode.startsWith('major') ? '大アルカナ22枚' : '全78枚'}・${settings.deckMode.endsWith('reversed') ? '正位置／逆位置' : '正位置のみ'}</strong></div>
      </details>
    </div>
    <div class="setting-backs"><b>カードの裏面</b>${backPicker()}</div>
    <div class="feedback-setting"><div><b>操作音・振動</b><p>カードを開く時や決定を保存する時に、控えめな反応を返します。</p></div><button class="toggle-button ${settings.feedback ? 'on' : ''}" data-action="toggle-feedback" aria-pressed="${settings.feedback}"><span></span><b>${settings.feedback ? 'ON' : 'OFF'}</b></button></div>
    <section class="data-setting" aria-labelledby="data-setting-title"><div><b id="data-setting-title">データ</b><p>履歴 ${logs.length}件</p><small data-backup-date>${backupDateLabel(settings.lastBackupAt)}</small></div>${storageSaveFailed ? '<p class="storage-error" role="alert">この端末では保存できない状態です</p>' : ''}${isIOS() && !isStandalone() ? '<p class="safari-storage-note">Safariでは、記録は端末内に保存されます。しばらく開かないと消えることがあるため、ホーム画面への追加と、書き出しをおすすめします。</p>' : ''}<div class="data-actions"><button class="button secondary" data-action="export-logs">履歴を書き出す（JSON）</button><button class="button secondary" data-action="import-logs">履歴を読み込む（JSON）</button><button class="button secondary" data-action="export-markdown">Obsidian用に書き出す（MD）</button><button class="button secondary" data-action="import-markdown">Obsidianから読み込む（MD）</button></div><p class="backup-format-note">MDはObsidianで読める1つのノートとして保存します。保管庫へはご自身で移してください。題名・メモ・ストーリーを含み、読み込みには末尾のバックアップデータを使います。表示部分の編集は反映されません。</p><input id="import-file" type="file" accept="application/json,.json" hidden><input id="import-markdown-file" type="file" accept="text/markdown,.md" hidden><p class="backup-status" data-backup-status role="status" aria-live="polite"></p><div class="backup-output" data-backup-output hidden><label>バックアップ内容<textarea readonly aria-label="バックアップ内容"></textarea></label><button class="button secondary" data-action="copy-backup-text">コピーする</button></div></section>
     <section class="data-setting account-setting" data-account-setting aria-labelledby="account-setting-title" hidden></section>
     <div class="setting-note"><b>カードと深掘り提案</b><p>表面はパメラ・コールマン・スミスによる1909年のライダー＝ウェイト＝スミス版（パブリックドメイン）です。決定ログはこのブラウザ内に保存されます（PROで同期をONにした場合のみサーバーにも保存）。</p><p><a href="./privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a></p></div>
     <button class="learn-entry" data-action="open-learn"><span aria-hidden="true">▣</span><span>タロットを学ぶ（カード図鑑）</span><span aria-hidden="true">→</span></button>
     <button class="tutorial-replay" data-action="tutorial-replay"></button>
     <button class="sheet-bottom-close" data-action="close-settings">設定を閉じる</button>
  </section>`;
  wrap.querySelector('[data-action="tutorial-replay"]').textContent='使い方をもう一度見る';
  window.DECIDE_AUTH?.renderSettings?.(wrap);
  window.DECIDE_REMINDERS?.mountSettings?.(wrap);
  window.DECIDE_PUSH?.mountSettings?.(wrap);
  mountModal(wrap,'.sheet-head button');
}
function closeSettings() { closeModal('#settings-modal'); }
function shareCards(cardNodes){ return cardNodes.map(node=>({...node.card,image:cardImage(node.card),meaning:meaning(node.card),keyword:cardKeywords(node.card)[0]||''})); }
function sharePostText(log,cardNodes){ const keywords=cardNodes.map(node=>cardKeywords(node.card)[0]).filter(Boolean); return `私は「${DECIDE_DECISION.choiceText(log.decision)}」に決めた${keywords.length?`\nカード：${keywords.join('・')}`:''}\n#DECIDE #タロット`; }
function shareData(type='app', log=null, {includeContent=false}={}) {
  const url=`${location.origin}${location.pathname}`;
  if (type === 'result' && log) {
    const cardNodes=(log.nodes || []).slice(0,2); const cards=cardNodes.map(node=>`${node.card.name}（${orientationLabel(node.card)}）`).join('・');
    return {title:'DECIDE — 決定結果',logTitle:'決定の記録',decision:DECIDE_DECISION.choiceText(log.decision),heading:'結果をシェア',lead:'相手がリンクを開くと、カード画像・意味・あなたの結論（決めた内容）が表示されます。題名とメモは共有されません。',text:`結論：${DECIDE_DECISION.choiceText(log.decision)}${cards ? `\nカード：${cards}` : ''}\n#DECIDE`,url:sharedResultUrl(log,type),cards:shareCards(cardNodes),postText:sharePostText(log,cardNodes)};
  }
  if (type === 'story' && log) {
    const cardNodes=(log.nodes || []).slice(0,2); const decision=DECIDE_DECISION.choiceText(log.decision);
    const base={heading:'その後をシェア',decision,cards:shareCards(cardNodes),postText:sharePostText(log,cardNodes),logId:log.id,includeContent};
    if(includeContent){
      const story=(log.story || '').slice(0,420);
      return {...base,title:`${log.title}のその後 — DECIDE`,logTitle:log.title,lead:'相手がリンクを開くと、カード画像・結論・その後のストーリーが表示されます。タイトルと本文が共有先に表示されます。',text:`「${log.title}」\n結論：${decision}\nその後：${story}${log.story?.length > 420 ? '…' : ''}\n#DECIDE`,url:sharedResultUrl(log,type,{includeContent:true})};
    }
    return {...base,title:'DECIDE — その後',logTitle:'決定の記録',lead:'相手がリンクを開くと、カード画像と結論（決めた内容）が表示されます。タイトルと本文は共有されません。含める場合は下のスイッチをONにしてください。',text:`結論：${decision}\n#DECIDE`,url:sharedResultUrl(log,type)};
  }
  return {title:'DECIDE — 心から納得いく決断を。',heading:'DECIDEを共有',lead:'友だちにも、心から納得できる決断の時間を。共有されるのはアプリのURLだけで、あなたの履歴は含まれません。',text:'DECIDE — 心から納得いく決断を。',url};
}
function openShare(type='app', id=null) {
  const log=id ? logs.find(item=>item.id===id) : null;
  if(type!=='app' && !log){toast('記録が見つかりません');return;}
  activeShareData=shareData(type,log);
  const {url,title,heading,lead,text:shareText}=activeShareData;
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='share-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="close-share" aria-label="共有画面を閉じる"></button><section class="settings-sheet share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
    <div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Share</p><h2 id="share-title">${esc(heading)}</h2></div><button data-action="close-share" aria-label="閉じる">×</button></div>
    <p class="share-lead" data-share-lead>${esc(lead)}</p>
    ${type === 'story' ? `<div class="feedback-setting share-content-setting"><div><b>タイトルと本文を含める</b><p>ONにすると、相談のタイトルとその後の本文が投稿文・リンク・画像に入ります。</p></div><button class="toggle-button" data-action="toggle-share-content" aria-pressed="false"><span></span><b>OFF</b></button></div>` : ''}
    ${type !== 'app' ? `<div class="share-card-preview"><div class="share-preview-images">${activeShareData.cards.map(card=>cardPicture(card,{className:card.orientation==='reversed'?'reversed-image':'',sizes:'82px'})).join('')}</div><div class="share-preview" data-share-preview></div></div>` : ''}
    ${type !== 'app' ? (window.DECIDE_SHARE_THEMES?.renderPicker?.()||'') : ''}
    <div class="share-primary">
      ${type !== 'app' ? `<button class="share-big instagram" data-action="share-instagram-story"><b>◎</b><span>Instagramストーリーズにシェア</span></button>
      <a class="share-big x-post" data-share-x href="https://x.com/intent/post?text=${encodeURIComponent(activeShareData.postText)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener"><b>𝕏</b><span>Xにポスト</span></a>` : ''}
      <a class="share-big line" data-share-line href="https://line.me/R/msg/text/?${encodeURIComponent(`${shareText}\n${url}`)}" target="_blank" rel="noopener"><b>LINE</b><span>LINEで送る</span></a>
      <a class="share-big facebook" data-share-facebook href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener"><b>f</b><span>Facebookでシェア</span></a>
    </div>
    <div class="share-grid share-grid-single">
      <button class="share-option" data-action="native-share"><b>↗</b><span>その他</span></button>
    </div>
    ${type !== 'app' ? `<button class="copy-link image-save" data-action="save-share-image"><span>カード画像と結論を1枚にまとめます</span><b>画像を保存</b></button>` : ''}
    <button class="copy-link" data-action="copy-link"><span data-share-copy-label></span><b>${type === 'app' ? 'リンクをコピー' : '文章をコピー'}</b></button>
    <button class="sheet-bottom-close" data-action="close-share">共有画面を閉じる</button>
  </section>`;
  const preview=wrap.querySelector('[data-share-preview]'); if(preview)preview.textContent=shareText;
  wrap.querySelector('[data-share-copy-label]').textContent=type==='app'?url:title;
  if(type!=='app') rebuildShareStoryBlob();
  mountModal(wrap,'.sheet-head button');
}
function closeShare() { closeModal('#share-modal'); }
async function shareInstagramStory() {
  const data=activeShareData; if(!data?.cards?.length) return;
  const blob=await (data.storyBlobPromise || createStoryImageBlob(data,window.DECIDE_SHARE_THEMES?.current?.()).catch(()=>null));
  if(!blob){ toast('画像を作れませんでした'); return; }
  const file=new File([blob],'decide-story.png',{type:'image/png'});
  if(navigator.canShare?.({files:[file]})){
    try { await navigator.share({files:[file]}); return; } catch(error) { if(error?.name==='AbortError') return; }
  }
  const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download='decide-story.png'; link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  toast('画像を保存しました。Instagramのストーリーズで貼ってください');
}
function rebuildShareStoryBlob(){ if(activeShareData?.cards) activeShareData.storyBlobPromise=createStoryImageBlob(activeShareData,window.DECIDE_SHARE_THEMES?.current?.()).catch(()=>null); }
function toggleShareContent(button){
  const log=logs.find(item=>item.id===activeShareData?.logId); const wrap=document.getElementById('share-modal'); if(!log||!wrap)return;
  activeShareData=shareData('story',log,{includeContent:!activeShareData.includeContent});
  const {url,title,lead,text,postText,includeContent}=activeShareData;
  button.classList.toggle('on',includeContent); button.setAttribute('aria-pressed',String(includeContent)); button.querySelector('b').textContent=includeContent?'ON':'OFF';
  wrap.querySelector('[data-share-lead]').textContent=lead;
  wrap.querySelector('[data-share-preview]').textContent=text;
  wrap.querySelector('[data-share-copy-label]').textContent=title;
  wrap.querySelector('[data-share-x]').href=`https://x.com/intent/post?text=${encodeURIComponent(postText)}&url=${encodeURIComponent(url)}`;
  wrap.querySelector('[data-share-line]').href=`https://line.me/R/msg/text/?${encodeURIComponent(`${text}\n${url}`)}`;
  wrap.querySelector('[data-share-facebook]').href=`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  rebuildShareStoryBlob(); sensoryFeedback('tap');
}
async function shareNative() { const data=activeShareData || shareData(); if(navigator.share){ try{ const blob=data.cards?.length?await createShareImageBlob(data):null; const file=blob?new File([blob],'decide-result.png',{type:'image/png'}):null; const payload={title:data.title,text:data.text,url:data.url}; if(file&&navigator.canShare?.({files:[file]}))payload.files=[file]; await navigator.share(payload); }catch{} } else { await copyShareLink(); } }
async function copyShareLink() { const data=activeShareData || shareData(); try{ await navigator.clipboard.writeText(`${data.text}\n${data.url}`); sensoryFeedback('tap'); toast(data.heading === 'DECIDEを共有' ? '共有リンクをコピーしました' : '共有する文章をコピーしました'); }catch{ toast('コピーできませんでした'); } }
function showUpdateBar() {
  if (document.querySelector('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar'; bar.setAttribute('role','status');
  bar.innerHTML = '<p>新しいバージョンがあります。アプリを閉じて開き直すと反映されます。</p><button type="button">再読み込み</button><button type="button" class="update-bar-close" aria-label="閉じる">×</button>';
  const [reload, close] = bar.querySelectorAll('button');
  reload.addEventListener('click', () => location.reload());
  close.addEventListener('click', () => bar.remove());
  document.body.appendChild(bar);
}
function toast(message) { const t=document.querySelector('#toast'); t.textContent=message; t.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('show'),1800); }
function selectDeckMode(mode) {
  const preset=DECK_PRESETS.find(item=>item.mode===mode); if(!preset)return;
  settings.deckMode=mode; persist(); updateDeckSettingUI();
  if(currentView==='home')renderHome();
  toast(`${preset.name}を使います`);
}
function updateDeckSettingUI() {
  const modal=document.querySelector('#settings-modal'); if(!modal)return;
  const major=settings.deckMode.startsWith('major'); const reversed=settings.deckMode.endsWith('reversed');
  modal.querySelectorAll('[data-action="deck-preset"]').forEach(item=>{
    const selected=item.dataset.value===settings.deckMode;
    item.classList.toggle('selected',selected);
    item.setAttribute('aria-checked',String(selected));
    item.tabIndex=selected?0:-1;
    item.querySelector('.deck-preset-badge').hidden=!selected;
  });
  modal.querySelectorAll('[data-action="deck-scope"]').forEach(item=>item.classList.toggle('selected',item.dataset.value===(major?'major':'all')));
  modal.querySelectorAll('[data-action="deck-orientation"]').forEach(item=>item.classList.toggle('selected',item.dataset.value===(reversed?'reversed':'upright')));
  modal.querySelector('[data-deck-count]').textContent=major?'22枚':'78枚';
  modal.querySelector('[data-orientation-note]').textContent=reversed?'逆位置を含む':'正位置だけ';
  modal.querySelector('[data-deck-summary]').textContent=`${major?'大アルカナ22枚':'全78枚'}・${reversed?'正位置／逆位置':'正位置のみ'}`;
}

document.addEventListener('click', event => {
  const el = event.target.closest('[data-action], [data-nav]'); if (!el) return;
  const action = el.dataset.action || el.dataset.nav;
  if (action === 'tutorial-start') beginTutorialDraw();
  else if (action === 'tutorial-skip') finishTutorial('skipped');
  else if (action === 'tutorial-keyword') chooseTutorialKeyword(Number(el.dataset.index));
  else if (action === 'tutorial-next') beginTutorialLog();
  else if (action === 'tutorial-decision') chooseTutorialDecision(el.dataset.value);
  else if (action === 'tutorial-log-next') beginTutorialLookBack();
  else if (action === 'tutorial-review') chooseTutorialReview(el.dataset.value);
  else if (action === 'tutorial-complete') { if(tutorial?.stage===4 && tutorial.review)finishTutorial('completed'); }
  else if (action === 'tutorial-replay') { closeSettings(); setTimeout(()=>{ try{localStorage.removeItem(TUTORIAL_KEY);}catch{} activeSession=null; navigate('home'); startTutorialIntro(); },180); }
  else if (action === 'tutorial-open') startTutorialIntro();
  else if (action === 'start-app') { const splash=app.querySelector('.splash-screen'); const go=()=>{ homeStage='quickstart'; renderHome(); app.focus({preventScroll:true}); }; if(splash && !prefersReducedMotion() && !splash.classList.contains('peeling')){ splash.classList.add('peeling'); setTimeout(go,460); } else if(!splash?.classList.contains('peeling')) go(); }
  else if (action === 'open-learn') window.DECIDE_LEARN.open();
  else if (action === 'open-settings') openSettings();
  else if (action === 'start') pickDrawMode(el, event);
  else if (action === 'home') { activeSession=null; completionId=null; homeStage='quickstart'; navigate('home'); requestAnimationFrame(checkDueReview); }
  else if (action === 'nav-back') navigateBack();
  else if (action === 'history') { completionId=null; navigate('history'); }
  else if (action === 'stats') navigate('stats');
  else if (action === 'stats-tab') { statsTab=el.dataset.value; renderStats(); }
  else if (action === 'stats-theme' || action === 'stats-review' || action === 'stats-period') { const current={'stats-theme':statsTheme,'stats-review':statsReview,'stats-period':statsPeriod}[action]; const next=current===el.dataset.value?'':el.dataset.value; statsTheme=action==='stats-theme'?next:''; statsReview=action==='stats-review'?next:''; statsPeriod=action==='stats-period'?next:''; renderStats(); if(next)requestAnimationFrame(()=>document.querySelector('.stats-theme-logs')?.scrollIntoView({behavior:'smooth',block:'start'})); }
  else if (action === 'session') navigate('session');
  else if (action === 'prepare-next') continuePreparation();
  else if (action === 'prepare-skip') continuePreparation(true);
  else if (action === 'prepare-back') { captureDecisionDraft(); navigate('prepare-genre'); }
  else if (action === 'prepare-choice') { captureDecisionDraft(); decisionDraft['option'+el.dataset.key]=el.dataset.value; renderPreparation(); }
  else if (action === 'flip-card') flipCard(Number(el.dataset.slot));
  else if (action === 'flip-both') { if(event.detail===0 || prefersReducedMotion()) flipBoth(); else if(!revealHold) nudgeRevealHold(el); }
  else if (action === 'select-back') selectBack(el.dataset.value);
  else if (action === 'toggle-reflection') toggleReflection(el);
  else if (action === 'close-deep-menu') { const toggle=el.closest('.map-screen')?.querySelector('[data-action="toggle-reflection"][aria-expanded="true"]'); if(toggle)toggleReflection(toggle); }
  else if (action === 'deepen') addDeep(el.dataset.prompt);
  else if (action === 'decide') navigate('decide');
  else if (action === 'select-decision') { captureDecisionDraft(); sensoryFeedback('tap'); selectedDecision=el.dataset.value; renderDecision(); }
  else if (action === 'select-genre') selectGenre(el.dataset.value);
  else if (action === 'select-pair') selectPair(Number(el.dataset.pairIndex));
  else if (action === 'swap-options') swapOptions();
  else if (action === 'recent-option') useRecentChoice(Number(el.dataset.recentIndex));
  else if (action === 'detail') navigate('detail', el.dataset.id);
  else if (action === 'review') setReview(el.dataset.value);
  else if (action === 'set-remind') setRemind(el.dataset.id,Number(el.dataset.days));
  else if (action === 'due-review-open') { const log=logs.find(item=>item.id===el.dataset.id); closeModal('#due-review-modal'); if(log){ log.remindAt=null; persist(); } completionId=null; detailReturn='history'; navigate('detail',el.dataset.id); }
  else if (action === 'due-review-later') { const log=logs.find(item=>item.id===el.dataset.id); if(log){ log.remindAt=new Date(Date.now()+3*DAY_MS).toISOString(); persist(); } closeModal('#due-review-modal'); toast('3日後にまたお聞きします'); }
  else if (action === 'satisfied') openFarewell();
  else if (action === 'farewell-home') { closeFarewell(); activeSession=null; completionId=null; homeStage='quickstart'; navigate('home'); }
  else if (action === 'deck-preset') selectDeckMode(el.dataset.value);
  else if (action === 'deck-scope') { const orientation=settings.deckMode.endsWith('reversed')?'reversed':'upright'; selectDeckMode(`${el.dataset.value}-${orientation}`); }
  else if (action === 'deck-orientation') { const scope=settings.deckMode.startsWith('major')?'major':'all'; selectDeckMode(`${scope}-${el.dataset.value}`); }
  else if (action === 'toggle-feedback') { settings.feedback=!settings.feedback; persist(); el.classList.toggle('on',settings.feedback); el.setAttribute('aria-pressed',String(settings.feedback)); el.querySelector('b').textContent=settings.feedback?'ON':'OFF'; if(settings.feedback)sensoryFeedback('tap'); toast(settings.feedback?'操作音・振動をONにしました':'操作音・振動をOFFにしました'); }
  else if (action === 'export-logs') exportLogs();
  else if (action === 'export-markdown') exportLogs(logs,true,'markdown');
  else if (action === 'export-failed-log') { const failed=el.closest('#save-failed-modal')?.failedLog; if(failed){ storageEvent('exportFromError'); exportLogs([failed],false); } }
  else if (action === 'close-save-failed') closeModal('#save-failed-modal');
  else if (action === 'a2hs-help') openA2HSHelp();
  else if (action === 'close-a2hs-help') closeModal('#a2hs-help-modal');
  else if (action === 'dismiss-a2hs') dismissA2HS();
  else if (action === 'dismiss-backup-reminder') { settings.backupReminderDismissedUntil=Date.now()+14*DAY_MS; persist(); document.querySelector('[data-backup-reminder]')?.remove(); }
  else if (action === 'import-logs') openImportPicker();
  else if (action === 'import-markdown') openImportPicker('markdown');
  else if (action === 'copy-backup-text') copyBackupText();
  else if (action === 'close-import') closeImport();
  else if (action === 'confirm-import') confirmImport();
  else if (action === 'history-mode') { historyMode=el.dataset.value; selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-prev') { calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1); selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-next') { calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1); selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-day') { selectedCalendarDate=el.dataset.value; renderHistory(); }
  else if (action === 'save-story') saveStory(el.dataset.id);
  else if (action === 'share-log') openShare('result',el.dataset.id);
  else if (action === 'share-story') openShare('story',el.dataset.id);
  else if (action === 'card-detail') { const node=activeSession?.nodes[Number(el.dataset.index)]; openCardDetail(node?.card,node?.question); }
  else if (action === 'saved-card-detail') { const log=logs.find(item=>item.id===el.dataset.id); openCardDetail(log?.nodes?.[Number(el.dataset.index)]?.card); }
  else if (action === 'card-theme') switchCardTheme(el.dataset.theme);
  else if (action === 'close-card-detail') closeCardDetail();
  else if (action === 'delete-log') openDeleteConfirm(el.dataset.id);
  else if (action === 'confirm-delete') deleteLog(el.dataset.id);
  else if (action === 'close-delete') closeDelete();
  else if (action === 'close-share') closeShare();
  else if (action === 'toggle-share-content') toggleShareContent(el);
  else if (action === 'native-share') shareNative();
  else if (action === 'save-share-image') downloadShareImage();
  else if (action === 'share-instagram-story') shareInstagramStory();
  else if (action === 'copy-link') copyShareLink();
  else if (action === 'close-settings') closeSettings();
  else if (action === 'open-app') { history.replaceState(null,'',location.pathname); sharedPayload=null; activeSession=null; navigate('home'); if(shouldAutoStartTutorial())requestAnimationFrame(startTutorialIntro); }
});
document.addEventListener('submit', event => { if(event.target.id === 'save-form'){ event.preventDefault(); saveDecision(event.target); } });
document.addEventListener('input', event => { if(event.target.id === 'history-search'){ historyQuery=event.target.value; const results=document.querySelector('[data-history-results]'); if(results)results.innerHTML=renderHistoryResults(); const count=event.target.closest('.history-search')?.querySelector('small'); if(count)count.textContent=historyQuery?`${filteredLogs().length}件`:''; } });
document.addEventListener('change', event => { if(['import-file','import-markdown-file'].includes(event.target.id)) { const [file]=event.target.files || []; readImportFile(file).finally(()=>{ event.target.value=''; }); } });
document.addEventListener('pointerdown', event => {
  const button=event.target.closest('[data-action="flip-both"]');
  if(button && event.button===0 && !prefersReducedMotion()) startRevealHold(button);
});
['pointerup','pointercancel'].forEach(type=>document.addEventListener(type, cancelRevealHold));
document.addEventListener('contextmenu', event => { if(event.target.closest('[data-action="flip-both"]')) event.preventDefault(); });
document.querySelector('#settings-button').addEventListener('click', openSettings);
document.querySelector('#share-button').addEventListener('click', () => openShare());
document.addEventListener('keydown', event => {
  if(tutorial) {
    if(event.key==='Escape'){ event.preventDefault(); finishTutorial('skipped'); return; }
    const intro=document.querySelector('#tutorial-intro');
    if(intro && event.key==='Tab'){
      const controls=[...intro.querySelectorAll('button')]; const first=controls[0],last=controls.at(-1);
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      return;
    }
  }
  const modal=document.querySelector('.modal-wrap.open');
  if(modal) {
    if(event.key === 'Escape') { event.preventDefault(); closeModal(`#${modal.id}`); return; }
    const radio=event.target.closest?.('[data-action="deck-preset"]');
    if(radio && modal.id==='settings-modal') {
      if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End'].includes(event.key)) {
        event.preventDefault();
        const radios=[...modal.querySelectorAll('[data-action="deck-preset"]')];
        const step=['ArrowDown','ArrowRight'].includes(event.key)?1:-1;
        const index=event.key==='Home'?0:event.key==='End'?radios.length-1:(radios.indexOf(radio)+step+radios.length)%radios.length;
        radios[index].click(); radios[index].focus(); return;
      }
      if(event.key==='Enter' || event.key===' ') { event.preventDefault(); radio.click(); return; }
    }
    if(event.key === 'Tab') {
      const focusable=focusableElements(modal); if(!focusable.length)return;
      const first=focusable[0], last=focusable.at(-1);
      if(!modal.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if(event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); }
      else if(!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  const card=event.target.closest?.('.fan-deck .flip-card');
  if(!card || !['ArrowLeft','ArrowRight','Enter'].includes(event.key))return;
  event.preventDefault();
  if(event.key==='Enter') { card.click(); return; }
  const cards=[...card.closest('.fan-deck').querySelectorAll('.flip-card:not(:disabled)')];
  const next=Math.max(0,Math.min(cards.length-1,cards.indexOf(card)+(event.key==='ArrowRight'?1:-1)));
  cards.forEach((item,index)=>item.tabIndex=index===next?0:-1);
  cards[next]?.focus({preventScroll:true}); cards[next]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
});

let swipeState=null;
document.addEventListener('touchstart',event=>{ const row=event.target.closest('.history-swipe'); if(!row)return; swipeState={row,startX:event.touches[0].clientX,startY:event.touches[0].clientY,moved:false}; },{passive:true});
document.addEventListener('touchmove',event=>{ if(!swipeState)return; const dx=event.touches[0].clientX-swipeState.startX; const dy=event.touches[0].clientY-swipeState.startY; if(Math.abs(dy)>Math.abs(dx)){swipeState=null;return;} if(dx<0){swipeState.moved=true;swipeState.row.style.setProperty('--swipe',`${Math.max(dx,-82)}px`);} },{passive:true});
document.addEventListener('touchend',()=>{ if(!swipeState)return; document.querySelectorAll('.history-swipe.swiped').forEach(row=>{if(row!==swipeState.row)row.classList.remove('swiped');}); const open=parseFloat(swipeState.row.style.getPropertyValue('--swipe')) < -42; swipeState.row.classList.toggle('swiped',open); swipeState.row.style.removeProperty('--swipe'); swipeState=null; },{passive:true});

function registerWebMcp() {
  const context = document.modelContext; if (!context?.registerTool) return;
  const tools = [
    { name:'start_decision_session', title:'カードを引く', description:'1枚引きまたは2枚引きの意思決定セッションを開始して画面に表示します。', inputSchema:{type:'object',properties:{mode:{type:'string',enum:['one','two']}},required:['mode'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:({mode})=>{ if(!['one','two'].includes(mode)) throw new Error('mode must be one or two'); if(startSession(mode)===false) return {status:'blocked',reason:'free_limit'}; return {status:'started',mode,cards:activeSession.nodes.map(n=>n.card.name)}; } },
    { name:'list_decision_logs', title:'決定履歴を見る', description:'このブラウザに保存された決定ログを新しい順に読み取ります。', inputSchema:{type:'object',properties:{},additionalProperties:false}, annotations:{readOnlyHint:true,untrustedContentHint:false}, execute:()=>logs.map(l=>({id:l.id,date:l.createdAt,title:l.title,decision:l.decision,review:l.review})) },
    { name:'review_decision', title:'決定を振り返る', description:'保存済みの決定に後日の評価を記録します。', inputSchema:{type:'object',properties:{id:{type:'string'},review:{type:'string',enum:['良かった','まあ良かった','どちらとも言えない','違った']}},required:['id','review'],additionalProperties:false}, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute:({id,review})=>{ const log=logs.find(l=>l.id===id); if(!log) throw new Error('log not found'); log.review=review; log.reviewedAt=new Date().toISOString(); persist(); if(detailId===id) renderDetail(); return {status:'saved',id,review}; } }
  ];
  tools.forEach(tool => { try { Promise.resolve(context.registerTool(tool)).catch(()=>{}); } catch {} });
}

registerWebMcp();
if ('serviceWorker' in navigator) {
  // 新しい SW が制御を引き継いだとき、既に制御下にあったページだけ1回再読み込みして新旧の混在を防ぐ
  const hadController = !!navigator.serviceWorker.controller;
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadedForUpdate) return;
    reloadedForUpdate = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then(registration => {
      // skipWaiting しないので、新版は全画面を閉じるまで待機する。待機中の新版があれば案内を出す
      const notify = () => { if (registration.waiting && navigator.serviceWorker.controller) showUpdateBar(); };
      notify();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') notify(); });
      });
      return registration.update();
    }).catch(() => {});
  }, {once:true});
}
window.DECIDE_APP_BRIDGE={getLogs:()=>logs,setLogs:v=>{logs=v},getSettings:()=>settings,persist,render,
  rebuildStory:theme=>{ if(activeShareData?.cards) activeShareData.storyBlobPromise=createStoryImageBlob(activeShareData,theme).catch(()=>null); }};
loadCardContent();
render();
if(shouldAutoStartTutorial())requestAnimationFrame(startTutorialIntro);
else setTimeout(checkDueReview,900);
