/* P19: the encyclopedia owns only decide.tarot.learn.v1. Lessons load on entry. */
(() => {
  const KEY='decide.tarot.learn.v1';
  const FILTERS=[['all','すべて'],['ar','大アルカナ'],['wa','ワンド'],['cu','カップ'],['sw','ソード'],['pe','ペンタクル']];
  let data=null, pending=null, tab='cards', filter='all', query='', lessonId=null;
  let articles=null, articlePending=null, articleError=false, articleId=null, articleQuery='', articleCategory='all', articleLimit=12, articleListScroll=0;
  const TABS=[['cards','図鑑'],['lessons','学ぶ'],['articles','関連記事']];
  let viewed=[], read={}, articlesRead=[], visible=[], cardIndex=-1, direction='upright', returnTile=null, observer=null;
  const state=load(KEY,{});
  if(Array.isArray(state.viewed))viewed=[...new Set(state.viewed.filter(id=>typeof id==='string'))];
  if(state.lessons && typeof state.lessons==='object' && !Array.isArray(state.lessons))read={...state.lessons};
  if(Array.isArray(state.articles))articlesRead=[...new Set(state.articles.filter(id=>typeof id==='string'))];

  function el(tag, cls='', value=null) {
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==null)node.textContent=String(value);
    return node;
  }
  function btn(label, action, cls='') {
    const node=el('button',cls,label); node.type='button'; node.dataset.learn=action; return node;
  }
  function signal(action,id='') { window.dispatchEvent(new CustomEvent('decide:learn',{detail:{action,id}})); }
  function save() { safeSetItem(KEY,JSON.stringify({viewed,lessons:read,articles:articlesRead})); }
  function fetchData() {
    if(pending)return pending;
    pending=Promise.all([loadCardContent(),fetch('./assets/learn.json').then(r=>{if(!r.ok)throw Error('load');return r.json();})])
      .then(([cards,learn])=>{
        if(!cards || !Array.isArray(learn.lessons) || learn.lessons.length!==6)throw Error('format');
        data=learn; if(currentView==='learn')render(); return learn;
      }).catch(()=>{pending=null;if(currentView==='learn')render();return null;});
    return pending;
  }
  function open() {
    if(tutorial)finishTutorial('skipped',false);
    closeSettings();
    setTimeout(()=>{
      history.pushState({...history.state,decideLearn:true},'',location.href);
      tab='cards'; lessonId=null; articleId=null; query=''; filter='all';
      fetchData(); navigate('learn'); signal('open');
    },190);
  }
  function goHome() {
    if(history.state?.decideLearn)history.back();
    else navigate('home');
  }
  window.addEventListener('popstate',()=>{if(currentView==='learn'){closeModal('#card-modal');navigate('home');}});
  function goBack() {
    if(articleId){showArticleList();return;}
    if(lessonId){lessonId=null;render();scrollAppTo(0);return;}
    goHome();
  }
  function allCards() {return DECK.map(card=>({base:card,copy:cardContent(card)})).filter(item=>item.copy);}
  function filtered() {
    const q=query.trim().toLocaleLowerCase('ja');
    return allCards().filter(({copy})=>{
      if(filter!=='all' && !copy.id.startsWith(filter))return false;
      if(!q)return true;
      const words=[copy.name,...['upright','reversed'].flatMap(o=>[
        ...(copy[o]?.keywords||[]),copy[o]?.meaning,...Object.values(copy[o]?.themes||{})
      ])];
      return words.some(word=>String(word||'').toLocaleLowerCase('ja').includes(q));
    });
  }
  function render() {
    document.body.classList.toggle('learn-active',currentView==='learn');
    const root=el('section','screen learn-screen');
    root.dataset.learnTab=tab;
    document.querySelector('.nav-back')?.setAttribute('aria-label',articleId?'関連記事の一覧へ戻る':lessonId?'レッスン一覧へ戻る':'ホームへ戻る');
    const header=el('header','learn-header');
    header.append(el('h1','', 'タロットを学ぶ'));
    root.append(header);
    if(!data){
      root.append(el('p','learn-loading',pending?'読み込み中…':'学習データを読み込めませんでした。'));
      if(!pending)root.append(btn('もう一度読み込む','retry','button secondary'));
      app.replaceChildren(root);return;
    }
    const tabs=el('div','learn-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','タロットを学ぶ');
    for(const [key,label] of TABS){
      const b=btn(label,'tab','learn-tab');b.dataset.tab=key;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===key));
      b.tabIndex=tab===key?0:-1;tabs.append(b);
    }
    root.append(tabs);
    if(tab==='cards')renderCards(root);else if(tab==='lessons')renderLessons(root);else renderArticles(root);
    app.replaceChildren(root);
    if(tab==='cards')observeImages();
  }
  function renderCards(root) {
    const pane=el('div','learn-cards');pane.setAttribute('role','tabpanel');
    const chips=el('div','learn-filters');chips.setAttribute('aria-label','カードの種類');
    for(const [key,label] of FILTERS){const b=btn(label,'filter','learn-filter');b.dataset.filter=key;b.setAttribute('aria-pressed',String(filter===key));chips.append(b);}
    pane.append(chips);
    const search=el('input','learn-search');search.id='learn-search';search.type='search';search.placeholder='カード名や言葉で検索';
    search.setAttribute('aria-label','カードを検索');search.setAttribute('autocomplete','off');search.value=query;pane.append(search);
    const grid=el('div','learn-grid');grid.dataset.learnGrid='';pane.append(grid);root.append(pane);fillGrid(grid);
  }
  function fillGrid(grid) {
    observer?.disconnect();visible=filtered();grid.replaceChildren();
    if(!visible.length){grid.append(el('p','learn-empty','見つかりませんでした'));return;}
    visible.forEach(({base,copy},index)=>{
      const tile=btn('','card','learn-tile');tile.dataset.index=String(index);tile.setAttribute('aria-label',`${copy.name}の詳しい意味を見る`);
      const frame=el('span','learn-thumb');
      const img=el('img');img.alt='';img.width=320;img.height=Math.round(cardImageHeight(base)*2/3);
      img.loading='lazy';img.decoding='async';img.dataset.src=cardImage(base).replace(/\.jpg$/,'-320.webp');
      img.dataset.fallback=cardImage(base);img.addEventListener('error',()=>{if(img.src.endsWith('.webp'))img.src=img.dataset.fallback;});
      frame.append(img);
      const name=el('span','learn-tile-name');
      const boundary=copy.name.indexOf('の');
      if(boundary>0){name.append(el('span','',copy.name.slice(0,boundary+1)),document.createElement('wbr'),el('span','',copy.name.slice(boundary+1)));}
      else name.textContent=copy.name;
      tile.append(frame,name,el('small','learn-tile-number',Number(copy.id.slice(2))));grid.append(tile);
    });
    observeImages();
  }
  function observeImages() {
    observer?.disconnect();
    const images=[...document.querySelectorAll('.learn-tile img[data-src]')];
    if(!images.length)return;
    if(!('IntersectionObserver' in window)){images.forEach(img=>{img.src=img.dataset.src;delete img.dataset.src;});return;}
    observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      const img=entry.target;img.src=img.dataset.src;delete img.dataset.src;observer.unobserve(img);
    }),{rootMargin:'0px',threshold:.01});
    images.forEach(img=>observer.observe(img));
  }
  function markViewed(id) {
    if(!viewed.includes(id)){viewed.push(id);save();}
  }
  function paragraph(parent,value,cls='') {parent.append(el('p',cls,value));}
  function section(title,value) {const s=el('section');s.append(el('h3','',title),el('p','',value));return s;}
  function detail(focusTarget='.sheet-head button') {
    const item=visible[cardIndex];if(!item)return;
    document.querySelector('#card-modal')?.remove();
    const {base,copy}=item;
    const wrap=el('div','modal-wrap');wrap.id='card-modal';
    const shade=btn('','close-card','modal-shade');shade.setAttribute('aria-label','カード詳細を閉じる');wrap.append(shade);
    const sheet=el('section','settings-sheet card-detail-sheet learn-detail-sheet');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','card-detail-title');
    sheet.append(el('div','sheet-handle'));
    const head=el('div','sheet-head');const headText=el('div');headText.append(el('p','eyebrow','Card meaning'),el('h2','', 'カードの詳しい意味'));headText.querySelector('h2').id='card-detail-title';
    const x=btn('×','close-card');x.setAttribute('aria-label','閉じる');head.append(headText,x);sheet.append(head);
    const hero=el('header','card-detail-header');const frame=el('span','card-image-frame card-detail-image-frame');
    const pic=el('picture');const source=el('source');source.type='image/webp';source.srcset=cardWebpSrcset(base);source.sizes='132px';
    const image=el('img',direction==='reversed'?'reversed-image':'');image.src=cardImage(base);image.alt=copy.name;image.width=480;image.height=cardImageHeight(base);pic.append(source,image);frame.append(pic);
    const meta=el('div');meta.append(el('span','orientation-badge',direction==='upright'?'正位置':'逆位置'),el('h3','',copy.name));
    if(copy.en)paragraph(meta,copy.en,'card-english');paragraph(meta,`番号 ${base.number} ・ ${copy.arcana}`,'card-meta');if(copy.symbol)paragraph(meta,copy.symbol,'card-symbol');
    hero.append(frame,meta);sheet.append(hero);
    paragraph(sheet,'正位置は、ふつうの向き。逆位置は、上下が逆の向きです。逆位置だから悪いことが起きる、という意味ではありません。','card-direction-help');
    const switcher=el('div','learn-direction');switcher.setAttribute('role','group');switcher.setAttribute('aria-label','カードの向き');
    for(const [key,label] of [['upright','正位置'],['reversed','逆位置']]){const b=btn(label,'direction');b.dataset.direction=key;b.setAttribute('aria-pressed',String(direction===key));switcher.append(b);}sheet.append(switcher);
    const copyBox=el('div','card-detail-copy');
    copyBox.append(section('このカードが表すこと',copy.story),section('絵に描かれているもの',copy.background));
    const meaning=el('section');meaning.append(el('h3','','カードの意味'));
    const keywords=el('div','keyword-chips');copy[direction].keywords.forEach(word=>keywords.append(el('i','',word)));meaning.append(keywords,el('p','direction-meaning',copy[direction].meaning));copyBox.append(meaning);
    const themes=el('section','theme-reading');themes.append(el('h3','','決めるときに考えるヒント'));
    const themeTabs=el('div','theme-tabs');themeTabs.setAttribute('role','tablist');themeTabs.setAttribute('aria-label','テーマを選ぶ');
    Object.entries(cardThemeLabels).forEach(([key,label])=>{const b=btn(label,'theme');b.dataset.theme=key;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(key==='blind'));themeTabs.append(b);});
    const themePanel=el('div','theme-panel');themePanel.setAttribute('role','tabpanel');themePanel.append(el('b','',cardThemeLabels.blind),el('p','',copy[direction].themes.blind));
    themes.append(themeTabs,themePanel);copyBox.append(themes);
    const opposite=direction==='upright'?'reversed':'upright';const more=el('details','opposite-meaning');
    more.append(el('summary','',`反対の向きでは ${opposite==='upright'?'正位置':'逆位置'}`));const otherWords=el('div','keyword-chips');
    copy[opposite].keywords.forEach(word=>otherWords.append(el('i','',word)));more.append(otherWords,el('p','',copy[opposite].meaning));copyBox.append(more);
    const type=el('section','learn-card-type');type.append(el('h3','','このカードの種類'));
    const id=copy.id, suit=data.suits.find(s=>id.startsWith(s.id));const rank=Number(id.slice(2));
    if(suit){paragraph(type,`${suit.name}（${suit.element}）：${suit.theme}。${suit.asks}`);const n=data.numbers.find(n=>n.n===rank);const c=data.court.find(c=>c.n===rank);if(n)paragraph(type,`${rank}：${n.label}`);if(c)paragraph(type,`${c.name}：${c.label}`);}
    else paragraph(type,'大アルカナ：大きな変化や、自分の気持ちを考える22枚のカードです。');
    if(suit)paragraph(type,'火・水・風・地は、カードの4つのグループについたイメージです。数字や人物は、考えるときの目安として読めます。');
    const links=el('div','learn-related');for(const lid of suit?['l3','l4']:['l2']){const lesson=data.lessons.find(l=>l.id===lid);if(!lesson)continue;const b=btn(`関連レッスン：${lesson.title}`,'related','learn-related-link');b.dataset.id=lid;links.append(b);}type.append(links);copyBox.append(type);
    copyBox.append(el('small','card-disclaimer','カードは未来を決めるものではありません。自分の気持ちや、次にすることを考えるヒントにしてください。'));
    sheet.append(copyBox);
    const nav=el('div','learn-card-nav');const prev=btn('← 前のカード','prev','button secondary');const next=btn('次のカード →','next','button secondary');
    prev.disabled=cardIndex===0;next.disabled=cardIndex===visible.length-1;nav.append(prev,next);sheet.append(nav,btn('閉じる','close-card','button card-detail-close'));
    wrap.append(sheet);mountModal(wrap,focusTarget);wrap.returnFocus=returnTile;
    markViewed(copy.id);signal('card',copy.id);
  }
  function renderLessons(root) {
    const pane=el('div','learn-lessons');pane.setAttribute('role','tabpanel');
    if(lessonId){pane.classList.add('learn-lesson-reader');renderLesson(pane);root.append(pane);return;}
    data.lessons.forEach(lesson=>{
      const b=btn('','lesson','learn-lesson-item');b.dataset.id=lesson.id;
      const label=el('span');label.append(el('strong','',lesson.title),el('p','',lesson.summary));
      b.append(label,el('span','learn-read',read[lesson.id]?'✓ 読んだ':'読む →'));pane.append(b);
    });
    if(data.lessons.every(l=>read[l.id])){const done=el('div','learn-complete');done.append(el('p','', 'タロットの基礎は、ひととおり読みました。カードを引いて、試してみましょう'),btn('ホームへ','home','button'));pane.append(done);}
    root.append(pane);
  }
  function cardThumb(code, caption='', note='', cls='') {
    const item=allCards().find(c=>c.copy.id===code);
    const fig=el('figure',`learn-fig-card ${cls}`.trim());const frame=el('span','learn-fig-frame');
    const img=el('img');img.src=`./assets/rider-waite/${code}-320.webp`;img.alt=item?.copy.name||'';img.width=320;img.height=Math.round(cardImageHeight(item?.base||{})*2/3);
    img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>{if(img.src.endsWith('.webp'))img.src=`./assets/rider-waite/${code}.jpg`;},{once:true});
    frame.append(img);fig.append(frame);
    const text=el('figcaption');if(caption)text.append(el('b','',caption));if(note){const span=el('span');note.split(/(?<=の)/).forEach((part,i)=>{if(i)span.append(document.createElement('wbr'));span.append(part);});text.append(span);}if(caption||note)fig.append(text);
    return fig;
  }
  function figureBox(title, cls, ...children) {
    const box=el('div',`learn-figure ${cls}`);if(title)box.append(el('p','learn-figure-title',title));box.append(...children);return box;
  }
  const LESSON_FIGURES={
    composition(){
      const bar=el('div','learn-split');bar.setAttribute('role','img');bar.setAttribute('aria-label','78枚のうち、大アルカナが22枚、小アルカナが56枚');
      const major=el('span','learn-split-major');major.append(el('b','','大アルカナ'),el('span','','22枚'));
      const minor=el('span','learn-split-minor');minor.append(el('b','','小アルカナ'),el('span','','56枚'));bar.append(major,minor);
      const cards=el('div','learn-fig-row');cards.append(cardThumb('ar00','大アルカナ','愚者'),cardThumb('ar17','大アルカナ','星'),cardThumb('cu03','小アルカナ','カップの3'),cardThumb('pe08','小アルカナ','ペンタクルの8'));
      return figureBox('78枚の内わけ','learn-figure-composition',bar,cards);
    },
    'major-samples'(){
      const row=el('div','learn-fig-row learn-fig-row-3');row.append(cardThumb('ar00','0 愚者','小さく試す'),cardThumb('ar08','8 力','落ち着いて向き合う'),cardThumb('ar21','21 世界','ここまでと区切る'));
      return figureBox('大アルカナの例','learn-figure-samples',row);
    },
    journey(){
      const codes=['ar00','ar01','ar08','ar21'];
      const journey=el('ol','learn-journey');data.majorJourney.forEach((part,i)=>{const row=el('li','learn-journey-step');const text=el('div');text.append(el('b','',part.range),el('strong','',part.title),el('p','',part.text));row.append(cardThumb(codes[i],'','','learn-journey-card'),text);journey.append(row);});
      return figureBox('愚者の旅（22枚の読み方の1つ）','learn-figure-journey',journey);
    },
    suits(){
      const tools={wa:'杖',cu:'杯',sw:'剣',pe:'金貨'};
      const suits=el('div','learn-suit-cards');data.suits.forEach(part=>{const c=el('article');const text=el('div');text.append(el('h3','',part.name),el('p','learn-suit-tool',`${tools[part.id]}の絵・${part.element}`),el('p','learn-suit-theme',part.theme),el('p','learn-suit-ask',part.asks));c.append(cardThumb(`${part.id}01`,'','','learn-suit-card'),text);suits.append(c);});
      return suits;
    },
    numbers(){
      const label=n=>data.numbers.find(x=>x.n===n)?.label||'';
      const row=el('div','learn-fig-row learn-fig-row-3');row.append(cardThumb('wa01','1（エース）',label(1)),cardThumb('wa05','5',label(5)),cardThumb('wa10','10',label(10)));
      return figureBox('数字のカード（ワンドの例）','learn-figure-numbers',row);
    },
    court(){
      const row=el('div','learn-fig-row');data.court.forEach((c,i)=>row.append(cardThumb(`cu${11+i}`,c.name,['学び始める人','行動する人','寄り添う人','支える人'][i])));
      return figureBox('人物のカード（カップの例）','learn-figure-court',row);
    },
    'rank-table'(){
      const table=el('table','learn-rank-table');const body=el('tbody');
      [...data.numbers.map(n=>[String(n.n),n.label]),...data.court.map(c=>[c.name,c.label])].forEach(([name,label])=>{const row=el('tr');row.append(el('th','',name),el('td','',label));body.append(row);});table.append(body);
      return figureBox('数字と人物の目安','learn-figure-table',table);
    },
    orientation(){
      const row=el('div','learn-fig-row learn-fig-row-2');row.append(cardThumb('ar17','正位置','ふつうの向き'),cardThumb('ar17','逆位置','上下が逆さま','is-reversed'));
      return figureBox('同じ「星」のカードの、2つの向き','learn-figure-orientation',row);
    },
    flow(){
      const steps=el('ol','learn-flow');[['引く','決めたいことを1つ思い浮かべて、カードを引く'],['読む','説明を読んで、どう感じたか確かめる'],['決める','進む・見送る・保留するを選ぶ'],['ふり返る','あとでログに、どうだったかを残す']].forEach(([title,text],i)=>{const li=el('li');li.append(el('span','learn-flow-no',i+1),el('b','',title),el('span','learn-flow-text',text));steps.append(li);});
      return figureBox('DECIDE.の使い方の流れ','learn-figure-flow',steps);
    },
  };
  function renderLesson(pane) {
    const lesson=data.lessons.find(l=>l.id===lessonId);if(!lesson)return;
    pane.append(btn('← レッスン一覧','lesson-list','learn-lesson-back'),el('p','learn-kicker','LESSON'),el('h2','',lesson.title));
    const figures=Array.isArray(lesson.figures)?lesson.figures:[];
    lesson.body.forEach((part,index)=>{paragraph(pane,part);figures.filter(f=>f.after===index && LESSON_FIGURES[f.type]).forEach(f=>pane.append(LESSON_FIGURES[f.type]()));});
    const points=el('section','learn-points');points.append(el('h3','','覚えておきたいこと'));const list=el('ul');lesson.points.forEach(p=>list.append(el('li','',p)));points.append(list);pane.append(points);
    pane.append(btn(read[lesson.id]?'読んだ ✓':'読んだ','read-lesson','button learn-mark-read'));
  }
  function fetchArticles() {
    if(articles || articlePending)return;
    articleError=false;
    articlePending=fetch('./assets/related-articles.json').then(response=>{
      if(!response.ok)throw Error('articles');return response.json();
    }).then(value=>{
      const types=new Set(['p','h2','h3','li','blockquote']);
      if(!Array.isArray(value.articles) || !Array.isArray(value.categories) || !value.articles.length || new Set(value.articles.map(a=>a.id)).size!==value.articles.length || !value.articles.every(a=>typeof a.id==='string' && /^[a-z0-9-]+$/.test(a.id) && typeof a.title==='string' && Array.isArray(a.blocks) && a.blocks.length && a.blocks.every(b=>types.has(b.type) && typeof b.text==='string')))throw Error('article format');
      articles=value;
    }).catch(()=>{articleError=true;}).finally(()=>{
      articlePending=null;if(currentView==='learn' && tab==='articles')render();
    });
  }
  function articleMatches() {
    const q=articleQuery.trim().toLocaleLowerCase('ja');
    return articles.articles.filter(a=>(articleCategory==='all' || a.category===articleCategory) && (!q || [a.title,...a.blocks.map(b=>b.text)].join(' ').toLocaleLowerCase('ja').includes(q)));
  }
  function fillArticleList(list) {
    const matches=articleMatches();list.replaceChildren();
    const count=list.parentElement?.querySelector('[data-article-count]');if(count)count.textContent=`${matches.length}件の記事${articleQuery.trim()?`（「${articleQuery.trim()}」で検索）`:''}`;
    if(!matches.length){list.append(el('p','learn-empty','見つかりませんでした。別の言葉で探してみてください。'));return;}
    matches.slice(0,articleLimit).forEach(article=>{
      const button=btn('','article','learn-article-item');button.dataset.id=article.id;
      const category=articles.categories.find(c=>c.id===article.category)?.label || '';
      const meta=el('small','learn-article-meta');meta.append(el('span','learn-article-tag',category),el('span','',`約${article.minutes}分`));
      if(articlesRead.includes(article.id)){meta.append(el('span','learn-article-done','読んだ'));button.classList.add('is-read');}
      button.append(meta,el('strong','',article.title),el('p','',article.summary));list.append(button);
    });
    if(matches.length>articleLimit)list.append(btn(`もっと見る（あと${matches.length-articleLimit}件）`,'article-more','button secondary learn-article-more'));
  }
  // Long article paragraphs read better split between sentences (same rule as scripts/lib/reading-feel.mjs).
  function splitParagraph(text) {
    if([...text].length<=110)return [text];
    const sentences=[];let depth=0,start=0;
    for(let i=0;i<text.length;i++){const ch=text[i];if('「『（(【'.includes(ch))depth++;else if('」』）)】'.includes(ch))depth=Math.max(0,depth-1);else if(depth===0 && '。！？'.includes(ch)){sentences.push(text.slice(start,i+1));start=i+1;}}
    if(start<text.length)sentences.push(text.slice(start));
    const parts=[];let current='';
    sentences.filter(x=>x.trim()).forEach(x=>{if(current && [...current].length+[...x].length>90){parts.push(current);current='';}current+=x;});
    if(current)parts.push(current);
    if(parts.length>1 && [...parts.at(-1)].length<24)parts.splice(-2,2,parts.at(-2)+parts.at(-1));
    return parts;
  }
  function renderArticles(root) {
    const pane=el('div','learn-articles');pane.setAttribute('role','tabpanel');root.append(pane);
    if(!articles){
      pane.append(el('p','learn-loading',articleError?'記事を読み込めませんでした。':'記事を読み込んでいます…'));
      if(articleError)pane.append(btn('もう一度読み込む','article-retry','button secondary'));else fetchArticles();
      return;
    }
    const article=articleId && articles.articles.find(a=>a.id===articleId);
    if(article){
      pane.classList.add('learn-article-reader');
      const category=articles.categories.find(c=>c.id===article.category)?.label || '';
      const progress=el('div','learn-read-progress');progress.setAttribute('aria-hidden','true');progress.append(el('span'));
      const meta=el('p','learn-article-meta');meta.append(el('span','learn-article-tag',category),el('span','',`約${article.minutes}分で読めます`));
      pane.append(progress,btn('← 記事の一覧へ','article-list','learn-lesson-back'),meta,el('h2','',article.title));
      const body=el('article','learn-article-body');
      article.blocks.forEach(block=>{if(block.type==='p')splitParagraph(block.text).forEach(part=>body.append(el('p','',part)));else body.append(el(block.type==='li'?'p':block.type,'',block.type==='li'?`・${block.text}`:block.text));});
      pane.append(body);
      const next=articles.articles.filter(a=>a.id!==article.id && a.category===article.category);
      const picks=[...next.filter(a=>!articlesRead.includes(a.id)),...next.filter(a=>articlesRead.includes(a.id))].slice(0,2);
      if(picks.length){
        const more=el('section','learn-article-next');more.append(el('h3','','つづけて読む'));
        picks.forEach(a=>{const b=btn('','article','learn-article-item');b.dataset.id=a.id;b.append(el('small','learn-article-meta',`約${a.minutes}分`),el('strong','',a.title));more.append(b);});
        pane.append(more);
      }
      pane.append(btn('記事の一覧へ戻る','article-list','button secondary'));
      if(!articlesRead.includes(article.id)){articlesRead.push(article.id);save();}
      return;
    }
    pane.append(el('p','learn-articles-intro','気になる話から読んでみましょう。'));
    const filters=el('div','learn-filters learn-article-filters');filters.setAttribute('aria-label','記事のテーマ');
    [['all','すべて'],...articles.categories.map(c=>[c.id,c.label])].forEach(([id,label])=>{
      const button=btn(label,'article-filter','learn-filter');button.dataset.category=id;button.setAttribute('aria-pressed',String(articleCategory===id));filters.append(button);
    });pane.append(filters);
    const search=el('input','learn-search');search.id='learn-article-search';search.type='search';search.placeholder='気になる言葉で記事を探す';search.setAttribute('aria-label','関連記事を検索');search.value=articleQuery;pane.append(search);
    const count=el('p','learn-article-count');count.dataset.articleCount='';count.setAttribute('role','status');pane.append(count);
    const list=el('div','learn-article-list');list.dataset.articleList='';pane.append(list);fillArticleList(list);
  }
  function showArticleList() {
    articleId=null;render();requestAnimationFrame(()=>{
      scrollAppTo(articleListScroll);
      document.querySelector(`[data-learn="article"][data-id="${lastArticleId}"]`)?.focus({preventScroll:true});
    });
  }
  let lastArticleId='';
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-learn]');if(!target)return;
    const action=target.dataset.learn;
    if(action==='home'){goHome();return;}
    if(action==='retry'){fetchData();render();return;}
    if(action==='close-card'){closeModal('#card-modal');return;}
    if(action==='card'){cardIndex=Number(target.dataset.index);direction='upright';returnTile=target;detail();return;}
    if(action==='direction'){direction=target.dataset.direction;detail(`[data-learn="direction"][data-direction="${direction}"]`);return;}
    if(action==='prev' || action==='next'){cardIndex+=action==='prev'?-1:1;direction='upright';detail(`[data-learn="${action}"]`);return;}
    if(action==='theme'){
      const modal=target.closest('#card-modal');const copy=visible[cardIndex]?.copy?.[direction];if(!copy)return;
      modal.querySelectorAll('[data-learn="theme"]').forEach(b=>b.setAttribute('aria-selected',String(b===target)));
      const panel=modal.querySelector('.theme-panel');panel.querySelector('b').textContent=cardThemeLabels[target.dataset.theme];panel.querySelector('p').textContent=copy.themes[target.dataset.theme];return;
    }
    if(action==='related'){closeModal('#card-modal');tab='lessons';lessonId=target.dataset.id;setTimeout(()=>{render();scrollAppTo(0);signal('lesson',lessonId);},190);return;}
    if(action==='tab'){tab=target.dataset.tab;lessonId=null;articleId=null;render();return;}
    if(action==='article-retry'){fetchArticles();render();return;}
    if(action==='article'){if(!articleId)articleListScroll=appScrollTop();articleId=target.dataset.id;lastArticleId=articleId;render();scrollAppTo(0);app.focus({preventScroll:true});updateReadProgress();return;}
    if(action==='article-list'){showArticleList();return;}
    if(action==='article-filter'){articleCategory=target.dataset.category;articleLimit=12;document.querySelectorAll('[data-learn="article-filter"]').forEach(b=>b.setAttribute('aria-pressed',String(b===target)));target.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});fillArticleList(document.querySelector('[data-article-list]'));return;}
    if(action==='article-more'){const previous=articleLimit;articleLimit+=12;const list=document.querySelector('[data-article-list]');fillArticleList(list);list.querySelectorAll('[data-learn="article"]')[previous]?.focus({preventScroll:true});return;}
    if(action==='filter'){filter=target.dataset.filter;document.querySelectorAll('.learn-filter').forEach(b=>b.setAttribute('aria-pressed',String(b===target)));fillGrid(document.querySelector('[data-learn-grid]'));return;}
    if(action==='lesson'){lessonId=target.dataset.id;render();scrollAppTo(0);signal('lesson',lessonId);return;}
    if(action==='lesson-list'){lessonId=null;render();return;}
    if(action==='read-lesson'){read[lessonId]=true;save();lessonId=null;render();return;}
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='learn-article-search'){articleQuery=event.target.value;articleLimit=12;fillArticleList(document.querySelector('[data-article-list]'));return;}
    if(event.target.id!=='learn-search')return;
    query=event.target.value;fillGrid(document.querySelector('[data-learn-grid]'));
  });
  document.addEventListener('keydown',event=>{
    const tabButton=event.target.closest?.('.learn-tab');if(!tabButton || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const index=TABS.findIndex(([id])=>id===tab);const next=event.key==='Home'?0:event.key==='End'?TABS.length-1:(index+(event.key==='ArrowRight'?1:-1)+TABS.length)%TABS.length;tab=TABS[next][0];lessonId=null;articleId=null;render();document.querySelector(`.learn-tab[data-tab="${tab}"]`)?.focus();
  });
  function updateReadProgress() {
    const bar=document.querySelector('.learn-read-progress span');if(!bar)return;
    const scroller=document.documentElement.classList.contains('standalone-shell')?document.querySelector('.app-shell'):document.documentElement;
    const range=scroller.scrollHeight-scroller.clientHeight;
    bar.style.transform=`scaleX(${range>0?Math.min(1,Math.max(0,appScrollTop()/range)):1})`;
  }
  document.addEventListener('scroll',updateReadProgress,{capture:true,passive:true});
  window.DECIDE_LEARN={open,render,close:goBack};
})();
