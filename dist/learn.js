/* P19: the encyclopedia owns only decide.tarot.learn.v1. Lessons load on entry. */
(() => {
  const KEY='decide.tarot.learn.v1';
  const FILTERS=[['all','すべて'],['ar','大アルカナ'],['wa','ワンド'],['cu','カップ'],['sw','ソード'],['pe','ペンタクル']];
  let data=null, pending=null, tab='cards', filter='all', query='', lessonId=null, answer=null;
  let viewed=[], read={}, visible=[], cardIndex=-1, direction='upright', returnTile=null, observer=null;
  const state=load(KEY,{});
  if(Array.isArray(state.viewed))viewed=[...new Set(state.viewed.filter(id=>typeof id==='string'))];
  if(state.lessons && typeof state.lessons==='object' && !Array.isArray(state.lessons))read={...state.lessons};

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
  function save() { safeSetItem(KEY,JSON.stringify({viewed,lessons:read})); }
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
      tab='cards'; lessonId=null; query=''; filter='all';
      fetchData(); navigate('learn'); signal('open');
    },190);
  }
  function goHome() {
    if(history.state?.decideLearn)history.back();
    else navigate('home');
  }
  window.addEventListener('popstate',()=>{if(currentView==='learn'){closeModal('#card-modal');navigate('home');}});
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
    const header=el('header','learn-header');
    header.append(btn('← 戻る','home','learn-back'),el('h1','', 'タロットを学ぶ'));
    root.append(header);
    if(!data){
      root.append(el('p','learn-loading',pending?'読み込み中…':'学習データを読み込めませんでした。'));
      if(!pending)root.append(btn('もう一度読み込む','retry','button secondary'));
      app.replaceChildren(root);return;
    }
    const tabs=el('div','learn-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','タロットを学ぶ');
    for(const [key,label] of [['cards','図鑑'],['lessons','学ぶ']]){
      const b=btn(label,'tab','learn-tab');b.dataset.tab=key;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(tab===key));
      b.tabIndex=tab===key?0:-1;tabs.append(b);
    }
    root.append(tabs);
    if(tab==='cards')renderCards(root);else renderLessons(root);
    app.replaceChildren(root);
    if(tab==='cards')observeImages();
  }
  function renderCards(root) {
    const pane=el('div','learn-cards');pane.setAttribute('role','tabpanel');
    const progress=el('p','learn-progress');progress.dataset.learnProgress='';
    progress.textContent=`78枚中${viewed.length}枚を見ました`;pane.append(progress);
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
    const progress=document.querySelector('[data-learn-progress]');
    if(progress)progress.textContent=`78枚中${viewed.length}枚を見ました`;
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
    const switcher=el('div','learn-direction');switcher.setAttribute('role','group');switcher.setAttribute('aria-label','カードの向き');
    for(const [key,label] of [['upright','正位置'],['reversed','逆位置']]){const b=btn(label,'direction');b.dataset.direction=key;b.setAttribute('aria-pressed',String(direction===key));switcher.append(b);}sheet.append(switcher);
    const copyBox=el('div','card-detail-copy');
    copyBox.append(section('物語のなかの位置',copy.story),section('絵柄と背景',copy.background));
    const meaning=el('section');meaning.append(el('h3','','この向きの意味'));
    const keywords=el('div','keyword-chips');copy[direction].keywords.forEach(word=>keywords.append(el('i','',word)));meaning.append(keywords,el('p','direction-meaning',copy[direction].meaning));copyBox.append(meaning);
    const themes=el('section','theme-reading');themes.append(el('h3','','テーマ別の読み方'));
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
    else paragraph(type,'大アルカナ');
    const links=el('div','learn-related');for(const lid of suit?['l3','l4']:['l2']){const lesson=data.lessons.find(l=>l.id===lid);const b=btn(`関連レッスン：${lesson.title}`,'related','learn-related-link');b.dataset.id=lid;links.append(b);}type.append(links);copyBox.append(type);
    copyBox.append(el('small','card-disclaimer','カードは未来を断定するものではありません。自分の状況を考える視点として使ってください。'));
    sheet.append(copyBox);
    const nav=el('div','learn-card-nav');const prev=btn('← 前のカード','prev','button secondary');const next=btn('次のカード →','next','button secondary');
    prev.disabled=cardIndex===0;next.disabled=cardIndex===visible.length-1;nav.append(prev,next);sheet.append(nav,btn('閉じる','close-card','button card-detail-close'));
    wrap.append(sheet);mountModal(wrap,focusTarget);wrap.returnFocus=returnTile;
    markViewed(copy.id);signal('card',copy.id);
  }
  function renderLessons(root) {
    const pane=el('div','learn-lessons');pane.setAttribute('role','tabpanel');
    if(lessonId){renderLesson(pane);root.append(pane);return;}
    data.lessons.forEach(lesson=>{
      const b=btn('','lesson','learn-lesson-item');b.dataset.id=lesson.id;
      const label=el('span');label.append(el('strong','',lesson.title),el('small','',`所要${lesson.minutes}分`),el('p','',lesson.summary));
      b.append(label,el('span','learn-read',read[lesson.id]?'✓ 読んだ':'読む →'));pane.append(b);
    });
    if(data.lessons.every(l=>read[l.id])){const done=el('div','learn-complete');done.append(el('p','', 'タロットの基礎は、ひととおり読みました。カードを引いて、試してみましょう'),btn('ホームへ','home','button'));pane.append(done);}
    root.append(pane);
  }
  function renderLesson(pane) {
    const lesson=data.lessons.find(l=>l.id===lessonId);if(!lesson)return;
    pane.append(btn('← レッスン一覧','lesson-list','learn-lesson-back'),el('h2','',lesson.title),el('p','learn-minutes',`所要${lesson.minutes}分`));
    lesson.body.forEach(part=>paragraph(pane,part));
    if(lesson.id==='l2'){
      const journey=el('div','learn-journey');data.majorJourney.forEach(part=>{const row=el('div','learn-journey-step');row.append(el('b','',part.range),el('strong','',part.title),el('p','',part.text));journey.append(row);});pane.append(journey);
    }
    if(lesson.id==='l3'){
      const suits=el('div','learn-suit-cards');data.suits.forEach(part=>{const c=el('article');c.append(el('h3','',`${part.name}（${part.element}）`),el('p','',part.theme),el('p','',part.asks));suits.append(c);});pane.append(suits);
    }
    if(lesson.id==='l4'){
      const table=el('table','learn-rank-table');const body=el('tbody');
      [...data.numbers.map(n=>[String(n.n),n.label]),...data.court.map(c=>[c.name,c.label])].forEach(([name,label])=>{const row=el('tr');row.append(el('th','',name),el('td','',label));body.append(row);});table.append(body);pane.append(table);
    }
    const points=el('section','learn-points');points.append(el('h3','','要点'));const list=el('ul');lesson.points.forEach(p=>list.append(el('li','',p)));points.append(list);pane.append(points);
    const quiz=el('section','learn-quiz');quiz.append(el('h3','','ミニクイズ'),el('p','',lesson.quiz.q));
    lesson.quiz.choices.forEach((choice,i)=>{const b=btn(choice,'answer','learn-answer');b.dataset.index=String(i);if(answer!==null){b.disabled=true;b.classList.toggle('correct',i===lesson.quiz.answer);b.classList.toggle('incorrect',i===answer && i!==lesson.quiz.answer);}quiz.append(b);});
    if(answer!==null)quiz.append(el('p','learn-explain',`${answer===lesson.quiz.answer?'正解です。':'不正解です。'}${lesson.quiz.explain}`));
    pane.append(quiz,btn(read[lesson.id]?'読んだ ✓':'読んだ','read-lesson','button learn-mark-read'));
  }
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
    if(action==='related'){closeModal('#card-modal');tab='lessons';lessonId=target.dataset.id;answer=null;setTimeout(()=>{render();window.scrollTo(0,0);signal('lesson',lessonId);},190);return;}
    if(action==='tab'){tab=target.dataset.tab;lessonId=null;answer=null;render();return;}
    if(action==='filter'){filter=target.dataset.filter;document.querySelectorAll('.learn-filter').forEach(b=>b.setAttribute('aria-pressed',String(b===target)));fillGrid(document.querySelector('[data-learn-grid]'));return;}
    if(action==='lesson'){lessonId=target.dataset.id;answer=null;render();window.scrollTo(0,0);signal('lesson',lessonId);return;}
    if(action==='lesson-list'){lessonId=null;answer=null;render();return;}
    if(action==='answer'){answer=Number(target.dataset.index);signal('quiz',lessonId);render();requestAnimationFrame(()=>document.querySelector('.learn-explain')?.scrollIntoView({block:'nearest'}));return;}
    if(action==='read-lesson'){read[lessonId]=true;save();lessonId=null;answer=null;render();return;}
  });
  document.addEventListener('input',event=>{
    if(event.target.id!=='learn-search')return;
    query=event.target.value;fillGrid(document.querySelector('[data-learn-grid]'));
  });
  document.addEventListener('keydown',event=>{
    const tabButton=event.target.closest?.('.learn-tab');if(!tabButton || !['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();tab=tab==='cards'?'lessons':'cards';lessonId=null;render();document.querySelector(`.learn-tab[data-tab="${tab}"]`)?.focus();
  });
  window.DECIDE_LEARN={open,render};
})();
