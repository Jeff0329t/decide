(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.DECIDE_DECISION=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const GENRES=['仕事','転職・キャリア','お金','人間関係','恋愛・結婚','健康','暮らし・住まい','学び・挑戦','その他'];
  const PAIRS={
    '仕事':[['今の仕事を続ける','新しい仕事に挑戦する'],['引き受ける','断る'],['今やる','あとでやる']],
    '転職・キャリア':[['転職する','今の会社に残る'],['独立する','会社員を続ける'],['資格を取る','実務で経験を積む']],
    'お金':[['買う','買わない'],['貯める','使う'],['投資する','見送る']],
    '人間関係':[['話す','様子を見る'],['距離を置く','関係を続ける'],['会う','会わない']],
    '恋愛・結婚':[['告白する','待つ'],['続ける','別れる'],['進める','時間をおく']],
    '健康':[['受診する','様子を見る'],['始める','今は休む']],
    '暮らし・住まい':[['引っ越す','今の家に住む'],['買う','借りる']],
    '学び・挑戦':[['始める','見送る'],['挑戦する','今回は見送る']],
    'その他':[['進む','やめる'],['今','あと']]
  };
  const clean=(value,max)=>String(value??'').trim().slice(0,max);
  const optionValue=value=>clean(value,30);
  const validGenre=value=>GENRES.includes(value)?value:'';
  const savedOptions=(first,second)=>{
    const values={'1':optionValue(first),'2':optionValue(second)};
    return values['1']||values['2']?values:null;
  };
  const orientation=card=>card?.orientation==='reversed'?'逆位置':'正位置';
  function autoTitle({genre='',options=null,nodes=[],createdAt=new Date().toISOString(),mode='one'}={}){
    const safeGenre=validGenre(genre);
    const first=optionValue(options?.['1']);
    const second=optionValue(options?.['2']);
    const date=new Date(createdAt);
    const md=Number.isNaN(date.getTime())?'':`${date.getMonth()+1}/${date.getDate()}`;
    const cards=nodes.map(node=>node?.card).filter(Boolean);
    let title;
    if(safeGenre&&first&&second)title=`${safeGenre}：${first}／${second}`;
    else if(safeGenre)title=`${safeGenre}：${cards[0]?.name||'カード'}・${md}`;
    else if(mode==='two')title=`${cards[0]?.name||'カード1'}／${cards[1]?.name||'カード2'}・${md}`;
    else title=`${cards[0]?.name||'カード'}（${orientation(cards[0])}）・${md}`;
    return title.slice(0,60);
  }
  function recentChoices(logs=[],limit=4){
    const found=[];
    for(const log of logs){
      for(const key of ['1','2']){
        const value=optionValue(log?.options?.[key]);
        if(value&&!found.includes(value))found.push(value);
        if(found.length===limit)return found;
      }
    }
    return found;
  }
  // 保存値は「選択肢1/2」のまま。画面・共有文では「選択肢A/B」と表示する。
  function choiceText(s){
    return String(s??'').replace(/選択肢\s?1/g,'選択肢A').replace(/選択肢\s?2/g,'選択肢B');
  }
  function decisionText(log={}){
    const key=log.decision==='選択肢1'?'1':log.decision==='選択肢2'?'2':'';
    const value=key?optionValue(log.options?.[key]):'';
    return value?`${choiceText(log.decision)}（${value}）`:choiceText(log.decision);
  }
  function nodeLabel(log={},node={},index=0){
    const value=index<2?optionValue(log.options?.[String(index+1)]):'';
    const label=choiceText(String(node.label||`CARD ${index+1}`));
    return value?`${label}：${value}`:label;
  }
  return {GENRES,PAIRS,optionValue,validGenre,savedOptions,autoTitle,recentChoices,choiceText,decisionText,nodeLabel};
});
