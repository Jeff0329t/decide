(function(root){
  'use strict';

  // カード解説ページ（/cards/）の CTA から ?from=wa05 / ?from=wands で来た人に、視点ガイドを表示する
  const CARD_ID_RE=/^(ar(0\d|1\d|2[01])|(wa|cu|sw|pe)(0[1-9]|1[0-4]))$/;
  const CATEGORY_LABELS={major:'大アルカナ',wands:'ワンド',cups:'カップ',swords:'ソード',pentacles:'ペンタクル'};

  function parseCardEntry(value){
    const v=String(value||'');
    if(CARD_ID_RE.test(v))return {type:'card',id:v};
    if(Object.prototype.hasOwnProperty.call(CATEGORY_LABELS,v))return {type:'category',id:v};
    return null;
  }

  function cardEntryLabel(entry,deck){
    if(!entry)return '';
    if(entry.type==='category')return CATEGORY_LABELS[entry.id];
    const card=(deck||[]).find(c=>typeof c.image==='string' && c.image.endsWith(`/${entry.id}.jpg`));
    return card?card.name:'';
  }

  function showCardEntryGuide(label){
    const box=document.createElement('div');
    box.className='card-entry-guide';
    box.setAttribute('role','status');
    const text=document.createElement('p');
    const strong=document.createElement('strong');
    strong.textContent=`${label}の視点で考える`;
    const sub=document.createElement('span');
    sub.textContent='いま抱えている迷いを、この視点に当てはめながら整理してみましょう。';
    text.append(strong,sub);
    const close=document.createElement('button');
    close.type='button';
    close.setAttribute('aria-label','閉じる');
    close.textContent='×';
    close.addEventListener('click',()=>box.remove());
    box.append(text,close);
    document.body.appendChild(box);
  }

  function initCardEntry(){
    const params=new URLSearchParams(location.search||'');
    if(!params.has('from'))return;
    const entry=parseCardEntry(params.get('from'));
    params.delete('from');
    const query=params.toString();
    history.replaceState?.(history.state,'',`${location.pathname}${query?`?${query}`:''}${location.hash||''}`);
    const label=cardEntryLabel(entry,typeof DECK!=='undefined'?DECK:[]);
    if(label)showCardEntryGuide(label);
  }

  root.DECIDE_CARD_ENTRY={parseCardEntry,cardEntryLabel};
  if(typeof document!=='undefined' && typeof location!=='undefined')initCardEntry();
})(globalThis);
