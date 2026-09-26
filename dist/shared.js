(function(root){
  'use strict';

  const MAX_SHARE_HASH_LENGTH=8192;

  function validSharedPayload(payload,validCardIds){
    if(!payload || typeof payload!=='object' || Array.isArray(payload))return false;
    if(typeof payload.d!=='string' || payload.d.length>40)return false;
    if(!Array.isArray(payload.c) || payload.c.length<1 || payload.c.length>2)return false;
    if(!payload.c.every(item=>Array.isArray(item) && item.length===2 && typeof item[0]==='string' && validCardIds.has(item[0]) && (item[1]===0 || item[1]===1)))return false;
    if(payload.t!==undefined && (typeof payload.t!=='string' || payload.t.length>60))return false;
    if(payload.s!==undefined && (typeof payload.s!=='string' || payload.s.length>700))return false;
    return true;
  }

  function readSharedHash(hash,validCardIds){
    if(!String(hash||'').startsWith('#share='))return {found:false,payload:null};
    const raw=String(hash).slice(7);
    if(!raw || raw.length>MAX_SHARE_HASH_LENGTH)return {found:true,payload:null};
    try {
      const payload=JSON.parse(decodeURIComponent(escape(atob(raw))));
      return {found:true,payload:validSharedPayload(payload,validCardIds)?payload:null};
    } catch {
      return {found:true,payload:null};
    }
  }

  function normalizeSharedPayload(payload,{deck,contentById,contentCardId,cardImage,compare}){
    const validCardIds=new Set(deck.map(card=>card.id));
    if(!validSharedPayload(payload,validCardIds))return null;
    try {
      const cards=payload.c.map(([id,reversed])=>{
        const base=deck.find(card=>card.id===id);
        const card={...base,orientation:reversed===1?'reversed':'upright'};
        const content=contentById.get(contentCardId(card));
        const copy=content?.[card.orientation];
        return {
          ...card,
          image:cardImage(card),
          keywords:Array.isArray(copy?.keywords)?copy.keywords.filter(Boolean):[],
          meaning:typeof copy?.meaning==='string'?copy.meaning:'',
          background:typeof content?.background==='string'?content.background:''
        };
      });
      const verdict=cards.length===2?compare(cards.map((card,index)=>({card,label:`選択肢 ${index+1}`}))):null;
      return {
        title:payload.t||'決定の記録', decision:payload.d, cards, story:payload.s||'',
        verdict
      };
    } catch {
      return null;
    }
  }

  function sharedOutcomeText(decision,verdict){
    const answer=String(decision||'');
    const label=answer.replace(/^選択肢([12])$/,(_,n)=>`選択肢${'AB'[n-1]}`);
    const base=`選んだ答え：${label}`;
    if(!verdict || verdict.tie || !/^選択肢[12]$/.test(answer))return base;
    const recommended=verdict.difference>0?'選択肢1':'選択肢2';
    return answer===recommended
      ? `${base}　（カードの視点でもおすすめでした）`
      : `${base}　（カードの視点では、${recommended.replace('1','A').replace('2','B')}が進めやすそうでした。決めたのは本人です）`;
  }

  function renderSharedCard(card,escapeHtml){
    const esc=escapeHtml;
    const keywords=card.keywords?.length?`<div class="keyword-chips shared-keywords">${card.keywords.map(keyword=>`<i>${esc(keyword)}</i>`).join('')}</div>`:'';
    const meaning=card.meaning?`<b>${esc(card.meaning)}</b>`:'';
    const background=card.background?`<section class="shared-background"><h3>絵柄と背景</h3><p>${esc(card.background)}</p></section>`:'';
    return `<article><img class="${card.orientation==='reversed'?'reversed-image':''}" src="${esc(card.image)}" alt="${esc(card.name)}"><div><span>${card.orientation==='reversed'?'逆位置':'正位置'}</span><h2>${esc(card.name)}</h2>${keywords}${meaning}${background}</div></article>`;
  }

  root.DECIDE_SHARED={validSharedPayload,readSharedHash,normalizeSharedPayload,renderSharedCard,sharedOutcomeText};
})(globalThis);
