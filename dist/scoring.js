(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  root.DECIDE_SCORING=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function validateOption(option) {
    if(!option || !Number.isInteger(option.score) || option.score<1 || option.score>5)throw new Error('score must be an integer from 1 to 5');
    if(!Array.isArray(option.keywords) || !option.keywords.length)throw new Error('keywords are required');
  }
  function compare(first,second) {
    validateOption(first); validateOption(second);
    const difference=first.score-second.score;
    const recommended=difference>=0 ? 1 : 2;
    const label=difference===0 ? 'どちらも選択としておすすめです' : `選択肢${'AB'[recommended-1]}を選択としておすすめします`;
    let note='';
    if(first.score<=2 && second.score<=2)note='どちらも今は慎重に。急がず条件を整える時期かもしれません。';
    else if(first.score>=4 && second.score>=4)note='どちらも追い風です。差は小さいので、本音で選んで大丈夫です。';
    else if(difference===0)note='差がつかないときは、「決め手になる違い」を深掘りしましょう。';
    return {
      label,
      scores:[first.score,second.score],
      difference,
      tie:difference===0,
      reason:`選択肢Aは「${first.keywords.join('・')}」、選択肢Bは「${second.keywords.join('・')}」を示しています。`,
      note,
      closing:'最終的に決めるのは、あなたです。'
    };
  }
  function stars(score) { return `${'★'.repeat(score)}${'☆'.repeat(5-score)}`; }
  return {compare,stars};
});
