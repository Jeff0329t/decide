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
    const absoluteDifference=Math.abs(difference);
    const recommended=difference>=0 ? 1 : 2;
    let label='拮抗しています。どちらも同じくらいの追い風です';
    if(absoluteDifference>=2)label=`カードの視点では、選択肢${recommended}がおすすめです`;
    else if(absoluteDifference===1)label=`わずかに、選択肢${recommended}が進めやすそうです`;
    let note='';
    if(first.score<=2 && second.score<=2)note='どちらも今は慎重に。急がず条件を整える時期かもしれません。';
    else if(first.score>=4 && second.score>=4)note='どちらも追い風です。差は小さいので、本音で選んで大丈夫です。';
    else if(difference===0)note='差がつかないときは、「決め手になる違い」を深掘りしましょう。';
    return {
      label,
      scores:[first.score,second.score],
      difference,
      tie:difference===0,
      reason:`選択肢1は「${first.keywords.join('・')}」、選択肢2は「${second.keywords.join('・')}」を示しています。`,
      note,
      closing:'最終的に決めるのは、あなたです。'
    };
  }
  function stars(score) { return `${'★'.repeat(score)}${'☆'.repeat(5-score)}`; }
  return {compare,stars};
});
