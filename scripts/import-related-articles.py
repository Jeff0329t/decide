#!/usr/bin/env python3
"""Import user-provided WXR drafts as text blocks for the in-app reader.
Usage: python3 scripts/import-related-articles.py file1.xml file2.xml ...
HTML is parsed as text; no source HTML or XML instructions are executed.
"""
from pathlib import Path
from html.parser import HTMLParser
import hashlib,json,re,sys,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent.parent
NS={'content':'http://purl.org/rss/1.0/modules/content/','wp':'http://wordpress.org/export/1.2/'}
class Blocks(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.blocks=[];self.kind=None;self.parts=[];self.skip=0
 def flush(self):
  text=re.sub(r'[ \t]+',' ',''.join(self.parts)).strip()
  if text:self.blocks.append({'type':self.kind or 'p','text':text})
  self.parts=[]
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style','iframe'):self.skip+=1
  if self.skip:return
  if tag in ('p','h2','h3','li','blockquote'):self.flush();self.kind=tag
  elif tag=='br':self.parts.append('\n')
 def handle_endtag(self,tag):
  if tag in ('script','style','iframe') and self.skip:self.skip-=1;return
  if not self.skip and tag in ('p','h2','h3','li','blockquote'):self.flush();self.kind=None
 def handle_data(self,text):
  if not self.skip:self.parts.append(text)
def category(title):
 if re.search('タロット|カード|占い|直感',title):return 'tarot'
 if re.search('相手|人間関係|恋|友|家族|親|他人|嫌われ|断る|孤独|パートナー|相談|会話|怒り|言葉|対人',title):return 'relationships'
 if re.search('仕事|働|転職|お金|買い物|時間|AI|SNS|スマホ|情報|動画|通知|デジタル|アルゴリズム|チャット|ツール',title):return 'work-life'
 if re.search('習慣|毎日|振り返|記録|日記|ログ|先延ばし|やる気|ルーティン|行動|挑戦|実験',title):return 'habits'
 return 'feelings'
if len(sys.argv)<2:raise SystemExit('Usage: python3 scripts/import-related-articles.py file1.xml [file2.xml ...]')
articles=[];seen=set();sources=[]
for arg in sys.argv[1:]:
 path=Path(arg);raw=path.read_bytes();items=ET.fromstring(raw).findall('./channel/item');count=0
 for item in items:
  if item.findtext('wp:post_type',namespaces=NS) not in (None,'post'):continue
  slug=item.findtext('wp:post_name',namespaces=NS) or ''
  title=(item.findtext('title') or '').strip()
  if not re.fullmatch(r'[a-z0-9-]+',slug) or not title:raise ValueError(f'Invalid article identity in {path.name}')
  if slug in seen:raise ValueError(f'Duplicate slug: {slug}')
  seen.add(slug);parser=Blocks();parser.feed(item.findtext('content:encoded',namespaces=NS) or '');parser.flush()
  # The common promotional footer is replaced by the app's own return control.
  blocks=[b for b in parser.blocks if not ('https://decisionprocess.net' in b['text'] and 'DECIDE' in b['text'])]
  if not blocks:raise ValueError(f'Empty article: {slug}')
  text='\n'.join(b['text'] for b in blocks);summary=next((b['text'] for b in blocks if b['type']=='p'),title)
  articles.append({'id':slug,'title':title,'category':category(title),'summary':summary[:90]+('…' if len(summary)>90 else ''),'minutes':max(1,round(len(text)/500)),'blocks':blocks})
  count+=1
 sources.append({'file':path.name,'sha256':hashlib.sha256(raw).hexdigest(),'articles':count})
articles.sort(key=lambda x:int(re.search(r'(\d+)$',x['id']).group(1)))
result={'version':1,'categories':[{'id':'tarot','label':'タロットの使い方'},{'id':'feelings','label':'気持ちと迷い'},{'id':'relationships','label':'人との関係'},{'id':'work-life','label':'仕事と暮らし'},{'id':'habits','label':'行動と習慣'}],'articles':articles}
(ROOT/'dist/assets/related-articles.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(ROOT/'docs/related-learning-2026-10-18').mkdir(parents=True,exist_ok=True)
(ROOT/'docs/related-learning-2026-10-18/import-report.json').write_text(json.dumps({'sources':sources,'total':len(articles),'categories':{c['id']:sum(a['category']==c['id'] for a in articles) for c in result['categories']}},ensure_ascii=False,indent=2)+'\n')
print(f'Imported {len(articles)} articles from {len(sources)} files as safe text blocks.')
