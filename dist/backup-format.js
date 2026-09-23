/* Human-readable Obsidian note plus a lossless, private DECIDE backup payload. */
const DECIDE_BACKUP_FORMAT = (() => {
  const START='<!-- DECIDE-BACKUP-V1';
  const END='END-DECIDE-BACKUP-V1 -->';

  function encode(value) {
    const bytes=new TextEncoder().encode(value);
    const chunks=[];
    for(let i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
    return btoa(chunks.join(''));
  }
  function decode(value) {
    const binary=atob(value.replace(/\s+/g,''));
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }
  function safeText(value) {
    return String(value??'').replace(/\\/g,'\\\\').replace(/([*_`[\]<>|])/g,'\\$1').replace(/^([#>\-+]|\d+\.)/gm,'\\$1');
  }
  function logSection(log,index) {
    const lines=[`## ${index+1}. ${safeText(log.title || '題名なし')}`];
    for(const [label,value] of [
      ['日時',log.createdAt],['選んだ答え',log.decision],['ジャンル',log.genre],
      ['選択肢1',log.option1],['選択肢2',log.option2],['振り返り',log.review]
    ])if(value)lines.push(`- ${label}：${safeText(value)}`);
    for(const [i,node] of (Array.isArray(log.nodes)?log.nodes:[]).entries()) {
      const card=node?.card||{};
      lines.push(`- カード${i+1}：${safeText(card.name||'')}（${card.orientation==='reversed'?'逆位置':'正位置'}）`);
    }
    if(log.memo)lines.push('', '### メモ',safeText(log.memo));
    if(log.story)lines.push('', '### その後のストーリー',safeText(log.story));
    return lines.join('\n');
  }
  function render(payload) {
    const json=JSON.stringify(payload);
    const sections=payload.logs.map(logSection).join('\n\n---\n\n');
    return [
      '# DECIDE 決定ログ',
      '',
      `書き出し日時：${payload.exportedAt}`,
      `記録：${payload.logs.length}件`,
      '',
      'このノートには題名・メモ・ストーリーを含む記録が入っています。Obsidianで同期すると、同期先にも保存されます。',
      'DECIDEへの読み込みには末尾のバックアップデータを使います。表示部分の編集は読み込みに反映されません。',
      '',
      sections,
      '',
      START,
      encode(json),
      END,
      ''
    ].join('\n');
  }
  function parse(markdown) {
    const start=markdown.lastIndexOf(START);
    const end=markdown.lastIndexOf(END);
    if(start<0 || end<=start)throw new Error('DECIDEのMarkdownバックアップではありません。');
    const encoded=markdown.slice(start+START.length,end).trim();
    if(!encoded || !/^[A-Za-z0-9+/=\s]+$/.test(encoded))throw new Error('Markdownのバックアップデータが壊れています。');
    try { return JSON.parse(decode(encoded)); }
    catch { throw new Error('Markdownのバックアップデータを読み取れませんでした。'); }
  }
  return {render,parse};
})();
