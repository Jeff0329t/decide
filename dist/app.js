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
let settings = { back:savedSettings.back || 'ink', feedback: savedSettings.feedback !== false, deckMode: savedSettings.deckMode || (savedSettings.reversed === false ? 'all-upright' : 'all-reversed'), ...savedSettings };
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
let sharedPayload = readSharedPayload();
if(sharedPayload)currentView='shared';

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
function shuffledDeck() {
  const source=settings.deckMode.startsWith('major') ? MAJOR : DECK;
  const useReversed=settings.deckMode.endsWith('reversed');
  return source.map(card=>({...card,orientation:useReversed && Math.random()<.28 ? 'reversed' : 'upright'})).sort(()=>Math.random()-.5);
}
function meaning(card) {
  if(card.id?.startsWith('M'))return card[card.orientation];
  const suit=SUITS.find(item=>card.name?.startsWith(item.name));
  const rank=Number(card.id?.match(/^m\d-(\d+)$/)?.[1]);
  return MINOR_KEYWORDS[suit?.name]?.[rank]?.[card.orientation==='upright'?0:1] || card[card.orientation];
}
function cardStory(card) {
  if(card.id?.startsWith('M'))return MAJOR_STORIES[card.name]||'';
  const suit=SUITS.find(item=>card.name?.startsWith(item.name)); const rank=Number(card.id?.match(/^m\d-(\d+)$/)?.[1]);
  return MINOR_STORIES[suit?.name]?.[rank]||'';
}
function cardKeywords(card) {
  if(card.id?.startsWith('M'))return [meaning(card),...(MAJOR_EXTRA_KEYWORDS[card.name]||[])].filter((item,index,list)=>list.indexOf(item)===index).slice(0,4);
  const suit=SUITS.find(item=>card.name?.startsWith(item.name)); const rank=Number(card.id?.match(/^m\d-(\d+)$/)?.[1]);
  return [meaning(card),...(SUIT_KEYWORDS[suit?.name]||[]),RANK_KEYWORDS[rank]].filter(Boolean).slice(0,4);
}
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
  deck.addEventListener('scroll',()=>{ if(ticking)return; ticking=true; requestAnimationFrame(()=>{ const next=Math.round(deck.scrollLeft/38); if(next!==last){last=next;sensoryFeedback('tick');} ticking=false; }); },{passive:true});
}

function navigate(view, id=null) {
  currentView = view; detailId = id;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === (view === 'history' || view === 'detail' ? 'history' : 'home')));
  render(); requestAnimationFrame(() => app.focus({preventScroll:true}));
}
function render() {
  if (currentView === 'shared') return renderSharedResult();
  if (currentView === 'home') return renderHome();
  if (currentView === 'draw') return renderDraw();
  if (currentView === 'session') return renderSession();
  if (currentView === 'decide') return renderDecision();
  if (currentView === 'history') return renderHistory();
  if (currentView === 'detail') return renderDetail();
}

function renderHome() {
  const last = logs[0];
  const deckCount=settings.deckMode.startsWith('major') ? 22 : 78;
  app.innerHTML = `
    <section class="screen home-screen">
      <p class="eyebrow">Decision tool</p>
      <h1>心から納得いく決断を。</h1>
      <p class="lead">カードをきっかけに、考えを整理するためのツールです。</p>
      <div class="choice-grid">
        <button class="draw-choice primary" data-action="start" data-mode="one"><span class="mode-art one-art" aria-hidden="true"><i class="card-back back-${settings.back}"></i></span><strong>1枚引き</strong><span>設定中の${deckCount}枚から選ぶ</span></button>
        <button class="draw-choice" data-action="start" data-mode="two"><span class="mode-art two-art" aria-hidden="true"><i class="card-back back-${settings.back}"></i><i class="card-back back-${settings.back}"></i></span><strong>2枚引き</strong><span>同じ${deckCount}枚から2枚を開く</span></button>
      </div>
      ${last ? `<button class="last-log" data-action="detail" data-id="${last.id}"><span>最近の決定</span><strong>${esc(last.title)}</strong><small>${esc(last.decision)} · ${formatDate(last.createdAt)}</small></button>` : ''}
    </section>`;
}

function startSession(mode) {
  sensoryFeedback('tap');
  const first = randomCard();
  const drawOptions = mode === 'two'
    ? [first, randomCard([first.id])]
    : shuffledDeck();
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
  const center=(activeSession.drawOptions.length-1)/2;
  const fanStyle=activeSession.mode === 'one' ? ` style="--tilt:${(((slot-center)/Math.max(center,1))*9).toFixed(2)}deg;--drop:${(Math.abs(slot-center)/Math.max(center,1)*18).toFixed(1)}px"` : '';
  return `<${tag} class="flip-card ${activeSession.mode === 'two' ? 'pair-card' : ''} ${revealed ? 'flipped chosen' : ''}"${action} data-slot="${slot}"${fanStyle} ${locked ? 'disabled' : ''} aria-label="${revealed ? `${card.name}を選びました` : `伏せたカードを選ぶ`}">
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
    <p class="lead">${two ? '左を選択肢1、右を選択肢2として思い浮かべてください。カードは答えを決めるものではなく、それぞれを考える視点を映します。' : `問いは言葉にしなくて大丈夫です。伏せた${activeSession.drawOptions.length}枚を左右に動かし、気になる1枚を選んでください。`}</p>
    ${two ? '' : `<div class="deck-count"><b>${activeSession.drawOptions.length}枚</b><span>すべてのカードから選べます</span></div>`}
    <div class="${two ? 'dual-draw' : 'fan-deck'}">
      ${activeSession.drawOptions.map((card,i) => drawCardButton(card,i,two ? `選択肢 ${i + 1}` : '')).join('')}
    </div>
    ${two ? `<button class="button reveal-both" data-action="flip-both" ${activeSession.revealed.length ? 'disabled' : ''}>カードを開いて比べる</button>` : ''}
    <p class="draw-instruction">${two ? (activeSession.revealed.length ? '2つの視点を読み取っています…' : '2つを思い浮かべたら、カードを開きます') : (activeSession.revealed.length ? '選んだカードを開いています…' : '横にスワイプできます。気になるカードをタップしてください')}</p>
  </section>`;
  if(!two) requestAnimationFrame(()=>{ const deck=document.querySelector('.fan-deck'); if(deck){deck.scrollLeft=(deck.scrollWidth-deck.clientWidth)/2;setupFanFeedback(deck);} });
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
  setTimeout(() => { if (activeSession) navigate('session'); }, 620);
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
  setTimeout(() => { if (activeSession) navigate('session'); }, 620);
}

function renderCard(node, index) {
  const c = node.card;
  return `<article class="thought-node ${c.orientation === 'reversed' ? 'is-reversed' : ''}">
    <div class="node-label"><span>${esc(node.label)}</span><b>${esc(node.question)}</b></div>
    <button class="compact-card card-detail-button" data-action="card-detail" data-index="${index}" aria-label="${esc(c.name)}の詳しい意味を見る">
      <img class="reading-image ${c.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(c)}" alt="${esc(c.name)}">
      <div><span class="tarot-index">${esc(c.number)} · ${orientationLabel(c)}</span><strong>${esc(c.name)}</strong></div>
    </button>
    <div class="reading"><b>${esc(meaning(c))}</b><p>${esc(interpretation(c))}</p></div>
    ${index < activeSession.nodes.length - 1 ? '<span class="connector" aria-hidden="true"></span>' : ''}
  </article>`;
}

const MAJOR_SIGNAL = {'愚者':1,'魔術師':2,'女教皇':1,'女帝':2,'皇帝':2,'教皇':1,'恋人':2,'戦車':2,'力':2,'隠者':0,'運命の輪':1,'正義':1,'吊るされた男':0,'死神':-1,'節制':2,'悪魔':-2,'塔':-2,'星':2,'月':-1,'太陽':2,'審判':2,'世界':2};
function cardSignal(card) {
  if(card.id?.startsWith('M')) {
    const base=MAJOR_SIGNAL[card.name] ?? 0;
    if(card.orientation==='upright')return base;
    if(['悪魔','死神'].includes(card.name))return .5;
    return Math.min(.5,-base || -.5);
  }
  const rank=Number(card.id?.match(/^m\d-(\d+)$/)?.[1]);
  const upright=[1.5,.5,1.2,.8,-.7,1,.5,1.4,.4,.6,1,1.1,1.3,1.5][rank] ?? .5;
  return card.orientation==='upright' ? upright : -Math.max(.4,upright*.7);
}
function comparisonVerdict(nodes) {
  const [first,second]=nodes; const difference=cardSignal(first.card)-cardSignal(second.card);
  const winner=difference>=0 ? first : second; const other=difference>=0 ? second : first;
  return {label:`${winner.label.replace(' ','')}が優勢です`,detail:`${winner.card.name}の「${meaning(winner.card)}」が、${other.label.replace(' ','')}より前へ進む材料を示しています。迷ったままにせず、現時点では${winner.label.replace(' ','')}を軸に考えるという結論です。`};
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
  const verdict=activeSession.mode === 'two' ? comparisonVerdict(activeSession.nodes.slice(0,2)) : null;
  app.innerHTML = `
    <section class="screen map-screen">
      <button class="text-back" data-action="home">← 最初に戻る</button>
      <div class="map-heading"><p class="eyebrow">Thought map</p><h2>${activeSession.mode === 'two' ? '2つの選択肢を比べる' : 'カードが示す、ひとつの視点'}</h2><p>${activeSession.mode === 'two' ? 'カードの向きと意味から、どちらが今進めやすいかを比べます。' : 'カードに未来を決めてもらうのではなく、解説を自分の状況に照らして読んでみてください。'}</p></div>
      ${activeSession.mode === 'two' ? `<section class="verdict-card"><span>比較の目安</span><h3>${esc(verdict.label)}</h3><p>${esc(verdict.detail)}</p></section><div class="choice-comparison">${activeSession.nodes.slice(0,2).map((node,index) => `<article class="compare-node"><span>${esc(node.label.replace(' ',''))}</span><button class="compare-card card-detail-button" data-action="card-detail" data-index="${index}" aria-label="${esc(node.card.name)}の詳しい意味を見る"><img class="${node.card.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(node.card)}" alt="${esc(node.card.name)}"><b>${esc(node.card.name)}</b><small>${orientationLabel(node.card)}</small></button><p><strong>${esc(meaning(node.card))}</strong>${esc(interpretation(node.card))}</p></article>`).join('')}</div><div class="thought-map deep-map">${activeSession.nodes.slice(2).map((node,index) => renderCard(node,index + 2)).join('')}</div>` : `<div class="thought-map">${activeSession.nodes.map(renderCard).join('')}</div>`}
      <section class="deep-panel">
        ${caution ? `<div class="decision-nudge"><b>そろそろ、材料は十分かもしれません。</b><p>新しい視点を増やすより、今ある材料から決めてみませんか。</p></div>` : `<p class="panel-title">もう少し考えるなら</p>`}
        ${canDraw ? `<p class="deep-help">気になるテーマを選ぶと、もう1枚のカードから詳しい視点を得られます。</p><div class="prompt-list">${deepPrompts().map(p => `<button class="prompt-button" data-action="deepen" data-prompt="${esc(p)}"><b>${esc(p)}</b><span>このテーマを深掘り →</span></button>`).join('')}</div>` : `<p class="limit-note">カードはここまで。いま見えている材料を使って決めましょう。</p>`}
      </section>
      <div class="decision-dock"><button class="button" data-action="decide">これで決めた <span>→</span></button></div>
    </section>`;
}

function addDeep(prompt) {
  sensoryFeedback('reveal');
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
    ${logs.length ? `<label class="history-search"><span aria-hidden="true">⌕</span><input id="history-search" type="search" value="${esc(historyQuery)}" placeholder="題名、カード、意味、ストーリーを検索" aria-label="履歴を検索"><small>${historyQuery ? `${results.length}件` : ''}</small></label><p class="swipe-hint">履歴を左へスワイプすると削除できます</p><div data-history-results>${renderHistoryResults(results)}</div>` : `<div class="empty-state"><h2>まだ履歴はありません</h2><p>最初のカードを引いて、ひとつ決めてみましょう。</p><button class="button" data-action="home">カードを引く</button></div>`}
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
  return `<div class="history-swipe" data-swipe-id="${log.id}"><button class="swipe-delete" data-action="delete-log" data-id="${log.id}">削除</button><button class="history-item" data-action="detail" data-id="${log.id}">
    <span class="history-thumbs">${cards.map((node,index)=>`<img style="--stack:${index}" class="${node.card.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(node.card)}" alt="">`).join('')}</span>
    <span class="history-copy"><time>${formatDate(log.createdAt)}</time><strong>${esc(log.title)}</strong><span>${esc(log.decision)}</span>${first ? `<small>${esc(first.name)} · ${orientationLabel(first)} — ${esc(meaning(first))}</small>` : ''}</span>
    ${log.review ? `<em>${reviewIcon(log.review)} ${esc(log.review)}</em>` : '<em class="pending">未評価</em>'}<i class="history-arrow" aria-hidden="true">→</i>
  </button></div>`;
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
    <h1>${esc(log.title)}</h1><div class="outcome"><span>今回の結論</span><strong>${esc(log.decision)}</strong><button data-action="share-log" data-id="${log.id}">この結果をシェア ↗</button></div>
    <div class="saved-cards"><p class="panel-title">引いたカードと意味</p>${log.nodes.map((node,index) => `<article class="saved-card">
      <img class="${node.card.orientation === 'reversed' ? 'reversed-image' : ''}" src="${cardImage(node.card)}" alt="${esc(node.card.name)}">
      <div><span>${esc(node.label || `CARD ${index+1}`)} · ${esc(node.question || '')}</span><h3>${esc(node.card.name)} <small>${orientationLabel(node.card)}</small></h3><b>${esc(meaning(node.card))}</b><p>${esc(interpretation(node.card))}</p><button class="card-more" data-action="saved-card-detail" data-id="${log.id}" data-index="${index}">カードの詳しい意味を見る</button></div>
    </article>`).join('')}</div>
    ${log.memo ? `<div class="saved-memo"><span>メモ</span><p>${esc(log.memo)}</p></div>` : ''}
    <section class="story-panel"><div class="story-head"><div><p class="panel-title">その後のストーリー</p><span>時間が経って分かったことや、選択の続きを残せます。</span></div>${log.storyUpdatedAt ? `<time>更新 ${formatDate(log.storyUpdatedAt)}</time>` : ''}</div>
      <textarea id="story-text" rows="6" maxlength="2000" placeholder="例：実際に選択肢1を選んでみたら、最初に心配していたことよりも…">${esc(log.story || '')}</textarea>
      <div class="story-actions"><button class="button secondary" data-action="save-story" data-id="${log.id}">${log.story ? 'ストーリーを更新する' : 'ストーリーを保存する'}</button>${log.story ? `<button class="button ghost" data-action="share-story" data-id="${log.id}">その後をシェア ↗</button>` : ''}</div>
    </section>
    <section class="review-panel"><p class="panel-title">この選択、その後どうでした？</p>
      <div class="review-grid">${['良かった','まあ良かった','どちらとも言えない','違った'].map(r => `<button class="review-button ${log.review === r ? 'selected' : ''}" data-action="review" data-value="${r}"><b>${reviewIcon(r)}</b><span>${r}</span></button>`).join('')}</div>
      ${log.review ? `<p class="review-saved">${formatDate(log.reviewedAt || new Date().toISOString())} に振り返りました</p>` : '<p class="review-hint">すぐに決めなくても大丈夫です。時間が経ってから戻ってきてください。</p>'}
    </section>
    <div class="danger-zone"><button data-action="delete-log" data-id="${log.id}">この履歴を削除</button></div>
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

function openDeleteConfirm(id) {
  const log=logs.find(item=>item.id===id); if(!log)return;
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='delete-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="close-delete" aria-label="削除確認を閉じる"></button><section class="settings-sheet confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div class="sheet-handle"></div><p class="eyebrow">Delete log</p><h2 id="delete-title">この履歴を削除しますか？</h2><p>「${esc(log.title)}」のカード、メモ、振り返り、ストーリーが削除されます。この操作は元に戻せません。</p><div class="confirm-actions"><button class="button secondary" data-action="close-delete">キャンセル</button><button class="button danger" data-action="confirm-delete" data-id="${log.id}">削除する</button></div></section>`;
  document.body.appendChild(wrap); requestAnimationFrame(()=>wrap.classList.add('open')); wrap.querySelector('[data-action="close-delete"]').focus();
}
function closeDelete() { const m=document.querySelector('#delete-modal'); if(!m)return; m.classList.remove('open'); setTimeout(()=>m.remove(),180); }
function deleteLog(id) {
  const log=logs.find(item=>item.id===id); if(!log)return;
  logs=logs.filter(item=>item.id!==id); persist(); closeDelete(); detailId=null; currentView='history'; render(); toast('履歴を削除しました');
}

function openCardDetail(card) {
  if(!card)return;
  const keywords=cardKeywords(card); const uprightMeaning=meaning({...card,orientation:'upright'}); const reversedMeaning=meaning({...card,orientation:'reversed'});
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='card-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="close-card-detail" aria-label="カード詳細を閉じる"></button><section class="settings-sheet card-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="card-detail-title"><div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Card meaning</p><h2 id="card-detail-title">${esc(card.name)}</h2></div><button data-action="close-card-detail" aria-label="閉じる">×</button></div><div class="card-detail-body"><img class="${card.orientation==='reversed'?'reversed-image':''}" src="${cardImage(card)}" alt="${esc(card.name)}"><div class="card-detail-copy"><span>${orientationLabel(card)}</span><strong>${esc(meaning(card))}</strong><div class="keyword-chips">${keywords.map(keyword=>`<i>${esc(keyword)}</i>`).join('')}</div><section><h3>絵柄のストーリー</h3><p>${esc(cardStory(card))}</p></section><section><h3>今回の読み方</h3><p>${esc(interpretation(card))}</p></section><section class="position-meanings"><h3>正位置と逆位置</h3><p><b>正位置</b>${esc(uprightMeaning)}</p><p><b>逆位置</b>${esc(reversedMeaning)}</p></section><small>解説はA.E.ウェイト『The Pictorial Key to the Tarot』とライダー＝ウェイト＝スミス版の図像をもとに、現代の意思決定向けに再構成しています。カードは未来の断定ではなく、自分の状況を考える視点として使います。</small></div></div></section>`;
  document.body.appendChild(wrap); requestAnimationFrame(()=>wrap.classList.add('open')); wrap.querySelector('.sheet-head button').focus();
}
function closeCardDetail() { const m=document.querySelector('#card-modal'); if(!m)return; m.classList.remove('open'); setTimeout(()=>m.remove(),180); }

function encodeSharedPayload(payload) { return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))); }
function readSharedPayload() {
  try { const raw=location.hash.startsWith('#share=')?location.hash.slice(7):''; return raw?JSON.parse(decodeURIComponent(escape(atob(raw)))):null; } catch { return null; }
}
function sharedResultUrl(log,type) {
  const nodes=(log.nodes||[]).slice(0,2);
  const payload={d:log.decision,c:nodes.map(node=>[node.card.id,node.card.orientation==='reversed'?1:0])};
  if(type==='story'){ payload.t=log.title; payload.s=(log.story||'').slice(0,700); }
  return `${location.origin}${location.pathname}#share=${encodeSharedPayload(payload)}`;
}
function normalizeSharedPayload(payload) {
  if(payload.title)return payload;
  const cards=(payload.c||[]).map(([id,reversed])=>{const base=DECK.find(card=>card.id===id);if(!base)return null;const card={...base,orientation:reversed?'reversed':'upright'};return {...card,image:cardImage(card),meaning:meaning(card),interpretation:interpretation(card)};}).filter(Boolean);
  return {title:payload.t||'決定の記録',decision:payload.d||'',cards,story:payload.s||'',verdict:cards.length===2?comparisonVerdict(cards.map((card,index)=>({card,label:`選択肢 ${index+1}`}))).label:''};
}
function renderSharedResult() {
  if(!sharedPayload){ currentView='home'; return renderHome(); }
  const payload=normalizeSharedPayload(sharedPayload);
  app.innerHTML=`<section class="screen shared-screen"><p class="eyebrow">Shared from DECIDE</p><h1>${esc(payload.title||'決定の記録')}</h1><div class="shared-outcome"><span>選んだ答え</span><strong>${esc(payload.decision||'')}</strong>${payload.verdict?`<p>${esc(payload.verdict)}</p>`:''}</div><div class="shared-card-grid">${(payload.cards||[]).map(card=>`<article><img class="${card.orientation==='reversed'?'reversed-image':''}" src="${esc(card.image)}" alt="${esc(card.name)}"><div><span>${card.orientation==='reversed'?'逆位置':'正位置'}</span><h2>${esc(card.name)}</h2><b>${esc(card.meaning)}</b><p>${esc(card.interpretation)}</p></div></article>`).join('')}</div>${payload.story?`<section class="shared-story"><span>その後のストーリー</span><p>${esc(payload.story)}</p></section>`:''}<div class="shared-note"><b>DECIDEとは？</b><p>タロットカードをきっかけに、心から納得できる決断を助ける思考ツールです。</p></div><button class="button" data-action="open-app">自分もカードを引いてみる</button></section>`;
}

async function createShareImageBlob(data) {
  const canvas=document.createElement('canvas'); canvas.width=1080; canvas.height=1350; const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f4f5f7'; ctx.fillRect(0,0,1080,1350); ctx.fillStyle='#1e2430'; ctx.font='700 34px sans-serif'; ctx.fillText('DECIDE',72,82);
  ctx.font='700 54px sans-serif'; wrapCanvasText(ctx,data.logTitle||data.title,72,165,936,68,2); ctx.fillStyle='#4869d7'; ctx.font='700 42px sans-serif'; ctx.fillText(data.decision||'',72,315);
  const cards=data.cards||[]; const cardWidth=cards.length>1?330:390; const gap=44; const total=cardWidth*cards.length+gap*Math.max(0,cards.length-1); let x=(1080-total)/2;
  for(const card of cards){ try{ const image=await loadShareImage(card.image); ctx.save(); if(card.orientation==='reversed'){ctx.translate(x+cardWidth,390+cardWidth*1.7);ctx.rotate(Math.PI);ctx.drawImage(image,0,0,cardWidth,cardWidth*1.7);}else ctx.drawImage(image,x,390,cardWidth,cardWidth*1.7);ctx.restore(); }catch{} ctx.fillStyle='#1e2430';ctx.font='700 28px sans-serif';ctx.fillText(card.name,x,1000);ctx.fillStyle='#4869d7';ctx.font='700 25px sans-serif';wrapCanvasText(ctx,card.meaning,x,1040,cardWidth,34,2);x+=cardWidth+gap; }
  ctx.fillStyle='#6f7580';ctx.font='24px sans-serif';ctx.fillText('カードをきっかけに、考えを整理する。',72,1270);
  return await new Promise(resolve=>canvas.toBlob(resolve,'image/png',.94));
}
function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight,maxLines=3){ let line='';let count=0;for(const char of String(text||'')){const next=line+char;if(ctx.measureText(next).width>maxWidth&&line){ctx.fillText(line,x,y+count*lineHeight);line=char;count++;if(count>=maxLines)return;}else line=next;}if(count<maxLines)ctx.fillText(line,x,y+count*lineHeight); }
function loadShareImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});}
async function downloadShareImage(){ if(!activeShareData?.cards?.length)return; const blob=await createShareImageBlob(activeShareData); if(!blob)return; const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='decide-result.png';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('共有画像を保存しました'); }

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
    const cardNodes=(log.nodes || []).slice(0,2); const cards=cardNodes.map(node=>`${node.card.name}（${orientationLabel(node.card)}）`).join('・');
    return {title:'DECIDE — 決定結果',logTitle:'決定の記録',decision:log.decision,heading:'結果をシェア',lead:'相手がリンクを開くと、カード画像・意味・あなたの結論が表示されます。題名とメモは共有されません。',text:`結論：${log.decision}${cards ? `\nカード：${cards}` : ''}\n#DECIDE`,url:sharedResultUrl(log,type),cards:cardNodes.map(node=>({...node.card,image:cardImage(node.card),meaning:meaning(node.card)}))};
  }
  if (type === 'story' && log) {
    const story=(log.story || '').slice(0,420);
    const cardNodes=(log.nodes || []).slice(0,2);
    return {title:`${log.title}のその後 — DECIDE`,logTitle:log.title,decision:log.decision,heading:'その後をシェア',lead:'相手がリンクを開くと、カード画像・結論・その後のストーリーが表示されます。',text:`「${log.title}」\n結論：${log.decision}\nその後：${story}${log.story?.length > 420 ? '…' : ''}\n#DECIDE`,url:sharedResultUrl(log,type),cards:cardNodes.map(node=>({...node.card,image:cardImage(node.card),meaning:meaning(node.card)}))};
  }
  return {title:'DECIDE — 決める前に、別の角度を。',heading:'DECIDEを共有',lead:'友だちにも、心から納得できる決断の時間を。共有されるのはアプリのURLだけで、あなたの履歴は含まれません。',text:'DECIDE — 決める前に、別の角度を。',url};
}
function openShare(type='app', id=null) {
  const log=id ? logs.find(item=>item.id===id) : null;
  activeShareData=shareData(type,log);
  const {url,title,heading,lead,text:shareText}=activeShareData;
  const wrap=document.createElement('div'); wrap.className='modal-wrap'; wrap.id='share-modal';
  wrap.innerHTML=`<button class="modal-shade" data-action="close-share" aria-label="共有画面を閉じる"></button><section class="settings-sheet share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
    <div class="sheet-handle"></div><div class="sheet-head"><div><p class="eyebrow">Share</p><h2 id="share-title">${esc(heading)}</h2></div><button data-action="close-share" aria-label="閉じる">×</button></div>
    <p class="share-lead">${esc(lead)}</p>
    ${type !== 'app' ? `<div class="share-card-preview"><div class="share-preview-images">${activeShareData.cards.map(card=>`<img class="${card.orientation==='reversed'?'reversed-image':''}" src="${card.image}" alt="${esc(card.name)}">`).join('')}</div><div class="share-preview">${esc(shareText).replace(/\n/g,'<br>')}</div></div>` : ''}
    <div class="share-grid">
      <a class="share-option line" href="https://line.me/R/msg/text/?${encodeURIComponent(`${shareText}\n${url}`)}" target="_blank" rel="noopener"><b>LINE</b><span>LINEで送る</span></a>
      <a class="share-option x-share" href="https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener"><b>𝕏</b><span>Xで共有</span></a>
      <a class="share-option facebook" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener"><b>f</b><span>Facebook</span></a>
      <button class="share-option" data-action="native-share"><b>↗</b><span>その他</span></button>
    </div>
    ${type !== 'app' ? `<button class="copy-link image-save" data-action="save-share-image"><span>カード画像と結論を1枚にまとめます</span><b>画像を保存</b></button>` : ''}
    <button class="copy-link" data-action="copy-link"><span>${esc(type === 'app' ? url : title)}</span><b>${type === 'app' ? 'リンクをコピー' : '文章をコピー'}</b></button>
  </section>`;
  document.body.appendChild(wrap); requestAnimationFrame(()=>wrap.classList.add('open')); wrap.querySelector('.sheet-head button').focus();
}
function closeShare() { const m=document.querySelector('#share-modal'); if(!m)return; m.classList.remove('open'); setTimeout(()=>m.remove(),180); }
async function shareNative() { const data=activeShareData || shareData(); if(navigator.share){ try{ const blob=data.cards?.length?await createShareImageBlob(data):null; const file=blob?new File([blob],'decide-result.png',{type:'image/png'}):null; const payload={title:data.title,text:data.text,url:data.url}; if(file&&navigator.canShare?.({files:[file]}))payload.files=[file]; await navigator.share(payload); }catch{} } else { await copyShareLink(); } }
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
  else if (action === 'select-back') { settings.back=el.dataset.value; persist(); const modal=document.querySelector('#settings-modal'); if(modal){ modal.querySelectorAll('.back-choice').forEach(item=>{ const chosen=item.dataset.value===settings.back; item.classList.toggle('selected',chosen); item.querySelector('b').textContent=chosen?'✓':''; }); } document.querySelectorAll('.flip-back,.mode-art i').forEach(item=>{ [...item.classList].filter(name=>name.startsWith('back-')).forEach(name=>item.classList.remove(name)); item.classList.add(`back-${settings.back}`); }); sensoryFeedback('tick'); toast('カードの裏面を変更しました'); }
  else if (action === 'deepen') addDeep(el.dataset.prompt);
  else if (action === 'decide') navigate('decide');
  else if (action === 'select-decision') { sensoryFeedback('tap'); selectedDecision=el.dataset.value; renderDecision(); }
  else if (action === 'detail') navigate('detail', el.dataset.id);
  else if (action === 'review') setReview(el.dataset.value);
  else if (action === 'deck-scope') { const orientation=settings.deckMode.endsWith('reversed')?'reversed':'upright'; settings.deckMode=`${el.dataset.value}-${orientation}`; persist(); updateDeckSettingUI(); if(currentView==='home')renderHome(); toast('使うカードを変更しました'); }
  else if (action === 'deck-orientation') { const scope=settings.deckMode.startsWith('major')?'major':'all'; settings.deckMode=`${scope}-${el.dataset.value}`; persist(); updateDeckSettingUI(); if(currentView==='home')renderHome(); toast('カードの向きを変更しました'); }
  else if (action === 'toggle-feedback') { settings.feedback=!settings.feedback; persist(); el.classList.toggle('on',settings.feedback); el.setAttribute('aria-pressed',String(settings.feedback)); el.querySelector('b').textContent=settings.feedback?'ON':'OFF'; if(settings.feedback)sensoryFeedback('tap'); toast(settings.feedback?'操作音・振動をONにしました':'操作音・振動をOFFにしました'); }
  else if (action === 'history-mode') { historyMode=el.dataset.value; selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-prev') { calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1); selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-next') { calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1); selectedCalendarDate=''; renderHistory(); }
  else if (action === 'calendar-day') { selectedCalendarDate=el.dataset.value; renderHistory(); }
  else if (action === 'save-story') saveStory(el.dataset.id);
  else if (action === 'share-log') openShare('result',el.dataset.id);
  else if (action === 'share-story') openShare('story',el.dataset.id);
  else if (action === 'card-detail') openCardDetail(activeSession?.nodes[Number(el.dataset.index)]?.card);
  else if (action === 'saved-card-detail') { const log=logs.find(item=>item.id===el.dataset.id); openCardDetail(log?.nodes[Number(el.dataset.index)]?.card); }
  else if (action === 'close-card-detail') closeCardDetail();
  else if (action === 'delete-log') openDeleteConfirm(el.dataset.id);
  else if (action === 'confirm-delete') deleteLog(el.dataset.id);
  else if (action === 'close-delete') closeDelete();
  else if (action === 'close-share') closeShare();
  else if (action === 'native-share') shareNative();
  else if (action === 'save-share-image') downloadShareImage();
  else if (action === 'copy-link') copyShareLink();
  else if (action === 'close-settings') closeSettings();
  else if (action === 'open-app') { history.replaceState(null,'',location.pathname); sharedPayload=null; activeSession=null; navigate('home'); }
});
document.addEventListener('submit', event => { if(event.target.id === 'save-form'){ event.preventDefault(); saveDecision(event.target); } });
document.addEventListener('input', event => { if(event.target.id === 'history-search'){ historyQuery=event.target.value; const results=document.querySelector('[data-history-results]'); if(results)results.innerHTML=renderHistoryResults(); const count=event.target.closest('.history-search')?.querySelector('small'); if(count)count.textContent=historyQuery?`${filteredLogs().length}件`:''; } });
document.querySelector('#settings-button').addEventListener('click', openSettings);
document.querySelector('#share-button').addEventListener('click', () => openShare());
document.addEventListener('keydown', event => { if(event.key === 'Escape'){ closeSettings(); closeShare(); closeDelete(); closeCardDetail(); } });

let swipeState=null;
document.addEventListener('touchstart',event=>{ const row=event.target.closest('.history-swipe'); if(!row)return; swipeState={row,startX:event.touches[0].clientX,startY:event.touches[0].clientY,moved:false}; },{passive:true});
document.addEventListener('touchmove',event=>{ if(!swipeState)return; const dx=event.touches[0].clientX-swipeState.startX; const dy=event.touches[0].clientY-swipeState.startY; if(Math.abs(dy)>Math.abs(dx)){swipeState=null;return;} if(dx<0){swipeState.moved=true;swipeState.row.style.setProperty('--swipe',`${Math.max(dx,-82)}px`);} },{passive:true});
document.addEventListener('touchend',()=>{ if(!swipeState)return; document.querySelectorAll('.history-swipe.swiped').forEach(row=>{if(row!==swipeState.row)row.classList.remove('swiped');}); const open=parseFloat(swipeState.row.style.getPropertyValue('--swipe')) < -42; swipeState.row.classList.toggle('swiped',open); swipeState.row.style.removeProperty('--swipe'); swipeState=null; },{passive:true});

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
