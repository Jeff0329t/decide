(function(root){
  'use strict';
  const clean=(value,max)=>String(value||'').trim().slice(0,max).replace(/[\uD800-\uDBFF]$/,'');
  function draft(log,cards){
    const two=log.mode==='two';
    return {cards:cards.slice(0,two?2:1),choices:two?[clean(log.options?.['1'],30)||'選択肢A',clean(log.options?.['2'],30)||'選択肢B']:[],question:'',chosen:two && /^選択肢[12]$/.test(log.decision)?Number(log.decision.slice(-1)):0,decision:two?'':clean(log.decision,40),memo:clean(log.memo,240),includeMemo:false,format:'story'};
  }
  function payload(data){
    const two=data.cards.length===2;
    const out={k:1,d:two?(data.chosen?`選択肢${data.chosen}`:'まだ迷っている'):clean(data.decision,40),c:data.cards.map(card=>[card.id,card.orientation==='reversed'?1:0]),q:two?data.choices.map((text,i)=>clean(text,30)||`選択肢${'AB'[i]}`):[],a:two?data.chosen:0};
    if(clean(data.question,60))out.t=clean(data.question,60);
    if(data.includeMemo && clean(data.memo,240))out.n=clean(data.memo,240);
    return out;
  }
  function link(data,base){return `${base.split('#')[0]}#share=${btoa(unescape(encodeURIComponent(JSON.stringify(payload(data)))))}`;}
  function postText(data){
    const p=payload(data),two=p.c.length===2;
    return [two?'あなたなら、どっち？':'この迷い、どう思う？',p.t||'',...(two?p.q.map((q,i)=>`${'AB'[i]}：${q}`):[]),...data.cards.map((c,i)=>`${two?'AB'[i]+'：':''}${c.name}（${c.orientation==='reversed'?'逆位置':'正位置'}）`),two?(p.a?`私は${'AB'[p.a-1]}を選んだ`:'まだ迷っている'):`このときの決定：${p.d}`,p.n?`当時のメモ：${p.n}`:'','ひとこと、意見を聞かせて。'].filter(Boolean).join('\n');
  }
  function lines(ctx,text,x,y,width,lineHeight,max=3){
    const output=[];let line='';
    for(const ch of String(text||'')){if(ch==='\n'||(line && ctx.measureText(line+ch).width>width)){output.push(line);line=ch==='\n'?'':ch;}else line+=ch;}
    if(line)output.push(line);
    if(output.length>max){output.length=max;let last=output[max-1];while(last && ctx.measureText(last+'…').width>width)last=last.slice(0,-1);output[max-1]=last+'…';}
    output.forEach((s,i)=>ctx.fillText(s,x,y+i*lineHeight));
  }
  function image(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('カード画像を読み込めませんでした'));img.src=src;});}
  async function renderImage(data){
    await document.fonts.ready;
    const W=1080,H=1920,story=true;
    const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext('2d'),cream='#f4efe3',ink='#0b0b0b',yellow='#f1d527';
    const serif='"Hiragino Mincho ProN","Yu Mincho",serif',sans='"Hiragino Kaku Gothic ProN",sans-serif';
    const p=payload(data),two=data.cards.length===2;
    const cardImages=await Promise.all(data.cards.map(c=>image(c.image)));
    ctx.fillStyle=ink;ctx.fillRect(0,0,W,H);
    try { const art=await image('./assets/editorial/prepare-portals-v1.webp');const hh=story?420:250;ctx.drawImage(art,0,0,art.width,art.height/3,650,0,430,hh);ctx.fillStyle='rgba(11,11,11,.70)';ctx.fillRect(650,0,430,hh); }catch{}
    const titleY=story?300:95;ctx.fillStyle=cream;ctx.font=`700 ${story?82:66}px ${serif}`;
    lines(ctx,two?'あなたなら、どっち？':'この迷い、どう思う？',56,titleY,950,102,2);
    ctx.font=`500 34px ${sans}`;lines(ctx,p.t||'ひとこと、意見を聞かせて。',56,story?410:172,940,46,2);
    const top=story?510:270,areaH=story?980:570;
    ctx.fillStyle=cream;ctx.fillRect(32,top,1016,areaH);
    const width=two?458:720,gap=36,start=two?64:180;
    data.cards.forEach((card,i)=>{
      const x=start+i*(width+gap),chosen=two && p.a===i+1;
      ctx.strokeStyle=chosen?yellow:'#bcb5a7';ctx.lineWidth=chosen?8:2;ctx.strokeRect(x,top+24,width,areaH-48);
      ctx.fillStyle=ink;ctx.font=`700 44px ${serif}`;ctx.textAlign='center';ctx.fillText(two?'AB'[i]:'CARD',x+width/2,top+78);
      ctx.font=`700 32px ${sans}`;lines(ctx,two?p.q[i]:p.t||'いま必要な視点',x+width/2,top+126,width-32,40,2);
      const ch=story?550:250,cw=ch*cardImages[i].width/cardImages[i].height,cy=top+(story?225:215);
      ctx.save();ctx.translate(x+width/2,cy+ch/2);if(card.orientation==='reversed')ctx.rotate(Math.PI);ctx.drawImage(cardImages[i],-cw/2,-ch/2,cw,ch);ctx.restore();
      ctx.fillStyle=ink;ctx.font=`700 ${story?34:30}px ${serif}`;ctx.fillText(card.name,x+width/2,cy+ch+48,width-24);
      ctx.font=`500 24px ${sans}`;ctx.fillText(card.orientation==='reversed'?'逆位置':'正位置',x+width/2,cy+ch+82);
      if(story){ctx.font=`500 28px ${sans}`;lines(ctx,card.keyword||'',x+width/2,cy+ch+130,width-36,36,2);}
      if(chosen){ctx.fillStyle=yellow;ctx.fillRect(x+width-252,cy-36,244,44);ctx.fillStyle=ink;ctx.font=`700 26px ${sans}`;ctx.fillText(`私は${'AB'[i]}を選んだ`,x+width-130,cy-6);}
    });
    ctx.textAlign='center';ctx.fillStyle=cream;ctx.font=`700 ${story?42:34}px ${serif}`;
    ctx.fillText(two?(p.a?`私は${'AB'[p.a-1]}を選んだ。あなたは？`:'まだ迷っている。あなたは？'):`このときの決定：${p.d}`,540,story?1570:910,960);
    if(p.n){ctx.font=`500 ${story?28:24}px ${sans}`;lines(ctx,p.n,540,story?1630:955,940,story?38:30,2);}
    ctx.fillStyle=yellow;ctx.font='700 40px Didot,serif';ctx.fillText('DECIDE.',540,story?1810:1040);
    if(story){ctx.fillStyle=cream;ctx.font=`500 24px ${sans}`;ctx.fillText('decisionprocess.net',540,1855);}
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像を作れませんでした')),'image/png'));
  }
  function open(log,cards,{mount,close,toast,escapeHtml}){
    const data=draft(log,cards),esc=escapeHtml;
    if(!data.cards.length){toast('共有できるカードがありません');return;}
    const two=data.cards.length===2,wrap=document.createElement('div');wrap.className='modal-wrap';wrap.id='consultation-modal';
    wrap.innerHTML=`<button class="modal-shade" data-consult-close aria-label="共有画面を閉じる"></button><section class="settings-sheet consultation-sheet" role="dialog" aria-modal="true" aria-labelledby="consultation-title"><div class="sheet-handle"></div><header class="sheet-head"><div><p class="eyebrow">DECIDE.</p><h2 id="consultation-title" tabindex="-1">Instagram投稿作成</h2></div><button data-consult-close aria-label="閉じる">×</button></header><p class="consult-intro">9:16の画像を確認して、共有先を選べます。</p><div class="consult-preview" aria-busy="true"><img alt="共有する相談画像のプレビュー" hidden><p data-consult-status role="status">画像を作っています…</p></div><div class="consult-fields"><label>相談のひとこと <small>任意・共有されます</small><input data-question maxlength="60" placeholder="例：今の仕事、どうしよう？" autocomplete="off"></label>${two?`<fieldset><legend>共有する選択肢</legend>${data.choices.map((q,i)=>`<label class="consult-choice"><span>${'AB'[i]}</span><input data-choice="${i}" maxlength="30" value="${esc(q)}" aria-label="共有する選択肢${'AB'[i]}" autocomplete="off"></label>`).join('')}<p class="consult-note">実名・会社名は、ここでぼかして送れます。元のログは変わりません。</p></fieldset><fieldset><legend>私が選んだ方</legend><div class="consult-segments">${[[1,'A'],[2,'B'],[0,'まだ迷っている']].map(([v,l])=>`<button type="button" data-chosen="${v}" aria-pressed="${data.chosen===v}">${l}</button>`).join('')}</div></fieldset>`:`<p class="consult-note">カード1枚と、このときの決定「${esc(data.decision)}」を共有します。</p>`}<section class="consult-memo-section" aria-label="当時のメモ">${data.memo ? `<label class="consult-memo"><span>当時のメモを含める</span><input type="checkbox" data-memo></label><p class="consult-memo-content">${esc(data.memo)}</p><p class="consult-note">チェックすると、このメモも共有されます。</p>` : '<p class="consult-note">当時のメモはありません。</p>'}</section><p class="consult-note" data-privacy>${two?'選択肢と':''}相談のひとことは共有されます。メモは含めません。</p></div><div class="consult-actions"><button class="button" type="button" data-send disabled>共有先を選ぶ ↗</button><button type="button" class="sheet-bottom-close" data-consult-close>閉じる</button></div></section>`;
    let revision=0,blob=null,objectURL=null,timer=null,alive=true;
    const preview=wrap.querySelector('.consult-preview'),status=wrap.querySelector('[data-consult-status]'),img=preview.querySelector('img'),send=wrap.querySelector('[data-send]');
    const base=location.origin+location.pathname;
    const refresh=()=>{
      const id=++revision;blob=null;send.disabled=true;preview.setAttribute('aria-busy','true');img.hidden=true;status.hidden=false;status.textContent='画像を作っています…';clearTimeout(timer);
      timer=setTimeout(async()=>{try{const next=await renderImage(JSON.parse(JSON.stringify(data)));if(!alive||id!==revision)return;blob=next;if(objectURL)URL.revokeObjectURL(objectURL);objectURL=URL.createObjectURL(blob);img.src=objectURL;img.hidden=false;status.hidden=true;preview.setAttribute('aria-busy','false');send.disabled=false;}catch(error){if(alive&&id===revision){status.textContent=error.message;preview.setAttribute('aria-busy','false');}}},140);
    };
    wrap.addEventListener('input',event=>{const el=event.target;if(el.matches('[data-question]'))data.question=clean(el.value,60);else if(el.matches('[data-choice]'))data.choices[Number(el.dataset.choice)]=clean(el.value,30);else if(el.matches('[data-memo]'))data.includeMemo=el.checked;else return;wrap.querySelector('[data-privacy]').textContent=`${two?'選択肢と':''}相談のひとことは共有されます。${data.includeMemo?'メモも画像・投稿文・リンク先に含めます。':'メモは含めません。'}`;refresh();});
    wrap.addEventListener('click',async event=>{
      const el=event.target.closest('button');if(!el)return;
      if(el.hasAttribute('data-consult-close')){close('#consultation-modal');return;}
      if(el.hasAttribute('data-chosen')){
        data.chosen=Number(el.dataset.chosen);wrap.querySelectorAll('[data-chosen]').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));refresh();
      }else if(el.hasAttribute('data-send') && blob){
        const file=new File([blob],'decide-consultation-story.png',{type:'image/png'});
        if(navigator.share && navigator.canShare?.({files:[file]})){
          send.disabled=true;
          try{await navigator.share({files:[file],text:postText(data)+'\n'+link(data,base)});}
          catch(error){if(error.name!=='AbortError')toast('共有できませんでした。もう一度お試しください');}
          finally{if(alive && blob)send.disabled=false;}
        }else toast('このブラウザは画像共有に対応していません。スマートフォンのSafariやChromeでお試しください。');
      }
    });
    const observer=new MutationObserver(()=>{if(wrap.isConnected)return;alive=false;clearTimeout(timer);if(objectURL)URL.revokeObjectURL(objectURL);observer.disconnect();});
    mount(wrap,'#consultation-title');observer.observe(document.body,{childList:true});refresh();
  }
  const api={draft,payload,link,postText,renderImage,open};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DECIDE_CONSULTATION=api;
})(globalThis);
