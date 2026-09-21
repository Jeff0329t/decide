(function(root){
  'use strict';

  const PROMPTS={
    one:[
      {label:'見落としがありそう',prompt:'見落としていること'},
      {label:'進むのが不安',prompt:'進むときの注意点'},
      {label:'本音が分からない',prompt:'本当はどうしたい？'},
      {label:'手放したいものがある',prompt:'手放してよいこと'}
    ],
    two:[
      {label:'決め手がほしい',prompt:'決め手になる違い'},
      {label:'選択肢1が不安',prompt:'選択肢1を選ぶときの注意点'},
      {label:'選択肢2が不安',prompt:'選択肢2を選ぶときの注意点'},
      {label:'本音を知りたい',prompt:'本当はどちらを望んでいる？'}
    ]
  };

  function availablePrompts(mode,used=[]){
    const usedSet=new Set(used);
    return (PROMPTS[mode]||PROMPTS.one).filter(item=>!usedSet.has(item.prompt));
  }

  root.DECIDE_INTERVIEW={PROMPTS,availablePrompts};
})(globalThis);
