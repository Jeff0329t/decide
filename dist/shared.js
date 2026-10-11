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


  // 同じIDの履歴を項目ごとに合わせる（読み込みと同期で同じルール）。a が手元側。
  function canonicalJson(value){
    if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
    if(value && typeof value==='object')return `{${Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value===undefined?null:value);
  }
  function mergeLog(a,b){
    const time=value=>{const t=Date.parse(value||'');return Number.isFinite(t)?t:0;};
    const stamp=log=>Math.max(time(log?.updatedAt),time(log?.reviewedAt),time(log?.storyUpdatedAt),time(log?.createdAt));
    if(!b || typeof b!=='object')return {log:a,changed:false,conflict:false};
    if(!a || typeof a!=='object')return {log:b,changed:true,conflict:false};
    const base=stamp(b)>stamp(a)?b:a; const other=base===a?b:a;
    const log={...base};
    const empty=value=>value===undefined||value===null||value==='';
    for(const key of Object.keys(other))if(empty(log[key]) && !empty(other[key]))log[key]=other[key];
    const pick=(stampKey,fields)=>{
      const src=time(b[stampKey])>time(a[stampKey])?b:(time(a[stampKey])>time(b[stampKey])?a:null);
      if(!src)return;
      for(const key of fields){ if(src[key]===undefined)delete log[key]; else log[key]=src[key]; }
    };
    pick('reviewedAt',['review','reviewedAt']);
    pick('storyUpdatedAt',['story','storyUpdatedAt']);
    const result=canonicalJson(log);
    const changed=result!==canonicalJson(a);
    return {log,changed,conflict:changed && result!==canonicalJson(b)};
  }
  root.DECIDE_MERGE_LOG=mergeLog;
  root.DECIDE_CANONICAL_JSON=canonicalJson;

  root.DECIDE_SHARED={validSharedPayload,readSharedHash,normalizeSharedPayload,renderSharedCard,sharedOutcomeText};
})(globalThis);
