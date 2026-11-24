const settingsKey='closet-editorial-v1';
function readState(){try{return JSON.parse(localStorage.getItem(settingsKey))||{}}catch{return {}}}
const state=Object.assign({mode:'MEN',found:{},seen:{},recent:[],stars:[],titles:[],count:0,ssr:0,god:0,supergod:0,brandpack:0,packs:{},closetCount:0,closetLast:null},readState());
if(!state.seen||typeof state.seen!=='object')state.seen={};
let resultMode='MEN',pendingRecord='',battle='',opponent=null,posterUrl='',audioContext;
let reviewSource='gacha'; // 'closet' only while a My Closet judging renders (v13)
let fxNow=null; // persona emotion FX plan, set by resultExtras, fired by game.js finish() on fresh draws only
// --- View router state (v15): exactly one view is visible at a time.
// navState mirrors the visible view (+ a sub-state for the closet result);
// viewSeen gates lazy per-view rendering (records history, catalog);
// bookActivated flips once when the catalog view is first opened, so tab
// switches never rebuild the catalog DOM. lastPopNavAt lets game.js
// restore() tell a browser back/forward navigation (popstate governs the
// view) apart from a pasted/ clicked share link (hashchange governs).
const VIEW_ELS={home:'viewHome',gacha:'viewGacha',catalog:'viewCatalog',closet:'closetView',mypage:'viewMypage'};
const TAB_ELS={home:'tabHome',gacha:'tabGacha',catalog:'tabCatalog',closet:'tabCloset',mypage:'tabMypage'};
let navState={view:'home',sub:null};
const viewSeen={};
let bookActivated=false;
let lastPopNavAt=0;
let histOK=false;
function save(){try{localStorage.setItem(settingsKey,JSON.stringify(state));}catch{byId('message').textContent='このブラウザでは記録を保存できません。'}}
function preferredMode(){return ['MEN','WOMEN'].includes(state.mode)?state.mode:'MEN';}
function gentle(){return state.quiet||matchMedia('(prefers-reduced-motion: reduce)').matches;}
function eventLog(name,detail){window.dispatchEvent(new CustomEvent('closet:event',{detail:{name,...detail}}));}
function productLink(item){const value=item.affiliateEnabled?item.affiliateUrl:item.publicLinkApproved?item.shopUrl||item.officialUrl:null;return /^https:\/\//.test(value||'')?value:null;}
// --- Purchase slot (shops.js data layer): registered vendors first, else search links ---
function detailShopLinks(item){
 let links=(typeof buildVendorLinks==='function')?buildVendorLinks(item):[];
 const legacy=productLink(item);
 if(legacy&&!links.some(l=>l.href===legacy)){
  const head={kind:'shop',vendor:item.affiliateEnabled?'購入先':'商品情報',label:item.affiliateEnabled?'購入先を見る':'商品情報を見る',href:legacy,affiliate:!!item.affiliateEnabled,match:'同一商品',price:null,currency:'JPY',stock:'不明',condition:'新品',lastChecked:null,asp:null,source:null};
  links=[head,...links.filter(l=>l.kind==='shop')];
 }
 return links;
}
function renderShopSlot(item,shop){
 shop.replaceChildren();
 const slotBox=document.createElement('div');slotBox.className='shopSlot';
 const links=detailShopLinks(item);
 if(!links.length){slotBox.textContent='購入リンクは準備中です（今後ここに購入先が表示されます）';shop.append(slotBox);return;}
 const real=links.filter(l=>l.kind==='shop');
 const rows=real.length?real:links;
 const head=document.createElement('div');head.className='shopHead';head.textContent=real.length?'購入先':'この商品を探す';slotBox.append(head);
 for(const l of rows){
  const row=document.createElement('div');row.className='shopRow';
  const a=document.createElement('a');a.href=l.href;a.target='_blank';a.rel=l.affiliate?'sponsored noopener':'noopener';a.textContent=l.label||l.vendor;
  if(l.affiliate){const m=document.createElement('span');m.className='prMark';m.textContent='PR';a.append(m);}
  if(!real.length){const t=document.createElement('span');t.className='matchTag';t.textContent='検索リンク';a.append(t);}
  a.onclick=()=>eventLog('vendor_click',{type:'vendor_click',itemId:item.id||item.source,vendor:l.vendor,matchType:l.match});
  row.append(a);
  if(real.length){
   const meta=[];
   if(l.price!=null)meta.push('販売価格 '+(l.currency==='JPY'?'¥'+Number(l.price).toLocaleString('ja-JP'):l.price+' '+l.currency));
   if(l.stock)meta.push(l.stock);
   if(l.condition==='中古')meta.push('中古');
   if(l.lastChecked)meta.push(l.lastChecked+'確認');
   if(meta.length){const d=document.createElement('div');d.className='shopMeta';d.textContent=meta.join(' · ');row.append(d);}
  }
  slotBox.append(row);
 }
 const note=document.createElement('div');note.className='shopNote';
 note.textContent=real.length?'価格・在庫は変動します。最新の情報はリンク先でご確認ください。':'リンク先は各サイトの検索結果ページです。同じ商品が表示されるとは限りません。';
 slotBox.append(note);
 shop.append(slotBox);
}
// --- Item detail sheet + image fallback + attribute chips (UI completeness) ---
const PIC_PATHS=['M4 16 L18 9 Q24 18 30 9 L44 16 L38 26 L33 23 L33 42 L15 42 L15 23 L10 26 Z','M11 8 L36 8 L39 43 L27 43 L24 24 L21 43 L9 43 Z','M5 27 L15 15 L21 21 L28 24 L32 29 L42 30 L44 37 L5 37 Z','M8 22 L39 22 L41 41 L6 41 Z M15 22 C15 4 32 4 32 22','M6 30 Q6 12 23 12 Q39 13 38 30 L46 33 Q33 36 23 31 Z'];
function picURI(slot){const svg="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect width='48' height='48' fill='#574374'/><path d='"+(PIC_PATHS[slot]||PIC_PATHS[4])+"' fill='#d9c8f5'/></svg>";return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);}
function crImg(img,slot){img.addEventListener('error',()=>{if(img.dataset.fb)return;img.dataset.fb='1';img.src=picURI(slot);});}
const COLOR_FAMS=[,'黒','白','グレー','ブラウン','ベージュ','赤','ピンク','オレンジ','黄','緑','青','紺','紫','メタリック','マルチ','カーキ'];
const PATTERN_NAMES=[,'ストライプ','チェック','ドット','花柄','アニマル・カモ','ボーダー','グラフィック・ロゴ','総柄'];
const MATERIAL_BITS=[[1,'デニム'],[2,'レザー'],[4,'ニット'],[8,'スウェット'],[16,'ナイロン系'],[32,'サテン・シルク系'],[64,'コットン・リネン']];
function attrChips(item){
 if(typeof s2attr!=='function')return [];
 let a;try{a=s2attr(item);}catch{return [];}
 if(!a)return [];
 const chips=[];
 if(a[0]&&COLOR_FAMS[a[0]])chips.push('色：'+COLOR_FAMS[a[0]]+(a[14]===2?'（写真から推定）':''));
 if(a[4]&&PATTERN_NAMES[a[4]])chips.push('柄：'+PATTERN_NAMES[a[4]]);
 const mats=MATERIAL_BITS.filter(([b])=>a[6]&b).map(([,n])=>n);if(mats.length)chips.push('素材：'+mats.join('・'));
 if(a[7]===3)chips.push('シルエット：ゆったり');else if(a[7]===1)chips.push('シルエット：細身');
 if(a[8]===2)chips.push('丈：ロング');else if(a[8]===1)chips.push('丈：ショート');
 if(a[9]>=0)chips.push('フォーマル度：'+a[9]);
 if(a[10]&1)chips.push('季節：冬寄り');if(a[10]&2)chips.push('季節：夏寄り');
 chips.push('主張度：'+a[11]);chips.push('単体の魅力：'+a[12]);
 return chips;
}
function itemKey(item){return item.id||item.source;}
// NEW badge logic (2026-11-24): a draw result card is NEW while the item is
// not yet in the collection - result cards are always rendered BEFORE
// resultExtras records the draw into state.found, so at render time this
// reads exactly "not owned before this draw" (restored/shared results are
// rendered after recording, so they never badge). In the catalog, an owned
// item keeps its NEW badge until its detail sheet is opened once
// (state.seen, persisted with the collection); openDetail clears it.
function isNewItem(item){return !!(item&&state.found&&!(state.found[itemKey(item)]>0));}
function hasUnseenNew(item){return !!(item&&state.found&&(state.found[itemKey(item)]>0)&&!state.seen[itemKey(item)]);}
function openDetail(item,slot,count){
 const box=byId('detail');if(!box||!item)return;
 const img=byId('detailImg');img.dataset.fb='';img.src=item.img;img.alt=item.brand+' '+item.name;crImg(img,slot);
 const tier=byId('detailTier');tier.textContent=tiers[rank(item)];tier.style.background=['#afb1bd','#8bd6ff','#e9acf9','#ffe077'][rank(item)];
 const gender={men:'メンズ',women:'レディース',unisex:'ユニセックス'}[item.gender]||'';
 byId('detailSlot').textContent=labels[slot]+' · '+names[item.style]+(gender?' · '+gender:'');
 byId('detailBrand').textContent=item.brand;
 byId('detailName').textContent=displayItemName(item.name);
 const dfn=byId('detailFullName');if(dfn)dfn.textContent=item.name;
 byId('detailPrice').textContent=yen(item.price);
 const owned=count??(state.found[item.id||item.source]||0);
 byId('detailOwn').textContent=owned?'所持 ×'+owned:'未獲得';
 if(owned>0&&!state.seen[itemKey(item)]){state.seen[itemKey(item)]=1;save();renderBook(false);}
 const attrs=byId('detailAttrs');attrs.replaceChildren();
 for(const chip of attrChips(item)){const s=document.createElement('span');s.className='attrChip';s.textContent=chip;attrs.append(s);}
 renderShopSlot(item,byId('detailShop'));
 box.hidden=false;
}
function closeDetail(){const box=byId('detail');if(box)box.hidden=true;}
function dayKey(){return new Date(Date.now()+9*3600000).toISOString().slice(0,10);}
function dayRng(){let x=Number(dayKey().replaceAll('-',''));return ()=>((x=(Math.imul(1664525,x)+1013904223)>>>0)/4294967296);}
function sumPrice(items){return items.reduce((n,x)=>n+x.price,0);}
function specials(items,score){
  const total=sumPrice(items),list=[];
  if(items.length===5 && items.every(x=>x.brand===items[0].brand))list.push('COMPLETE BRAND');
  const tones=items.map(x=>{const suffix=x.name.split(' / ').at(-1).trim().toUpperCase();return ({BLK:'黒',BLACK:'黒',WHT:'白',WHITE:'白',NVY:'紺',NAVY:'紺'})[suffix];});
  if(items.length===5 && tones[0]&&tones.every(t=>t===tones[0]))list.push('MONOCHROME');
  if(total>=1000000)list.push('MILLION STYLE');
  if(total<=10000&&score.overall>=80)list.push('BUDGET MASTER');
  // Harsh labels need evidence, not just a low score / high price: they fire
  // only for a broken classification (dasai / wild_fail) or a genuine
  // junk/atrocity offense. A coherent plain outfit with a low score is not
  // a disaster - the old score-only trigger was simply a wrong verdict.
  const harshOK=!score.v2||score.cls==='dasai'||score.cls==='wild_fail'||(score.reasons&&personaOffense(items,score));
  if(score.overall<=10&&harshOK)list.push('FASHION DISASTER');
  if(total>=500000&&score.overall<=30&&harshOK)list.push('MONEY IS NOT STYLE');
  if(score.overall===100)list.push('PERFECT STYLE');
  return list;
}
function coverLine(items,score){
 const [top,bottom,shoes,bag]=items, total=sumPrice(items);
 if(items.every(x=>x.brand===top.brand))return top.brand+'のショー、そのまま最前列へ。';
 if(bottom.street.role==='underlayer')return '玄関で気づいた。パンツをもう一枚。';
 if(shoes.price>total*.7)return '足元から先にVIP席へ。';
 if(bag.price>total*.7)return 'バッグだけ招待状を持っている。';
 if(score.balance<30)return '集合場所は同じ。ドレスコードは全員別。';
 if(total<18000&&score.balance>75)return '古着屋の前でスナップを頼まれる休日。';
 return ({e:'ギャラリーの白壁が似合う午後。',s:'レコードショップの開店待ち。',p:'待ち合わせで一番見つけやすい人。',c:'予定を決めずに街を歩く日。'})[top.style];
}
function titleFor(items,s){
 if(s&&s.v2&&s.title)return s.title;
 if(s.overall>=95)return '表紙の顔';
 if(s.overall<=10)return '全身の意思疎通に失敗';
 if(sumPrice(items)>=500000 && s.balance<45)return '金で解決できなかった編集部';
 if(items.every(x=>x.brand===items[0].brand))return 'ひとりブランド特集';
 if(sumPrice(items)<=20000 && s.balance>=75)return 'プチプラ界の革命児';
 if(Math.max(...items.map(x=>x.price))>sumPrice(items)*.65)return '一点豪華主義';
 return s.balance>=78?'街角スナップ常連':s.balance<35?'方向性を募集中':'街角の自由人';
}
// Strip size/spec noise from a product name for player-facing text:
// parenthetical size ranges (25-27cm), (R)/（R）/Ⓡ marks, size letters (M),
// cm/サイズ spec notes. Keeps brand-facing core descriptor text.
function cleanItemName(name){
 let n=String(name||'');
 n=n.replace(/[（(][^（）()]*[）)]/g,m=>{const inner=m.slice(1,-1).trim();return /cm|センチ|サイズ|^[RＲ]$|^[SML]$|^\d+(?:\.\d+)?$/.test(inner)?'':m;});
 n=n.replace(/Ⓡ/g,'');
 n=n.replace(/\s*\d+(?:\.\d+)?\s*[-〜~]\s*\d+(?:\.\d+)?\s*cm/g,'');
 return n.replace(/\s+/g,' ').trim();
}
function reviewShortName(name){
 let n=cleanItemName(String(name||'').split(' / ')[0].trim());
 if(n.length>24){
  let out='';
  for(const w of n.split(/\s+/)){ if((out+' '+w).trim().length>20)break; out=(out+' '+w).trim(); }
  n=out||n.slice(0,20);
 }
 return n;
}
// Display name for item CARDS / catalog list / detail title (2026-11-24):
// review text already used cleaned names, but cards and the 図鑑 showed the
// raw keyword-stuffed product names (e.g. coca's 「ハット メンズ バケット
// ハット ポケッタブル 折りたたみ 撥水加工 無地 サイズ調節可 薄手」). Same
// cleaning family as the text path: strip size/spec parentheticals and the
// ' / ' variant tail (cleanItemName), drop keyword-stuffing tokens (gender
// labels, feature words, spec words), strip the ポケッタブル prefix crammed
// into compound words and a trailing /MODEL-NO tail, then cap at a sane
// length on a word boundary. The item DATA is untouched: the detail sheet
// keeps the full original name on a small sub-line, and search/filter still
// match the full name.
const NAME_STOP_TOKENS=new Set(['メンズ','レディース','ユニセックス','ポケッタブル','折りたたみ','折り畳み','撥水加工','撥水','サイズ調節可','サイズ調整可','サイズ調節','サイズ調整','薄手','軽量','無地','大きめ','小さめ','ゆったり']);
function displayItemName(name){
 let n=cleanItemName(String(name||'').split(' / ')[0].trim());
 n=n.replace(/\/[A-Za-z0-9-]{2,}$/,'').replace(/ポケッタブル/g,'');
 n=n.split(/\s+/).filter(t=>t&&!NAME_STOP_TOKENS.has(t)).join(' ');
 if(n.length>34){
  let out='';
  for(const w of n.split(/\s+/)){ if((out+' '+w).trim().length>30)break; out=(out+' '+w).trim(); }
  n=out||n.slice(0,30);
 }
 return n||cleanItemName(String(name||''));
}
function reviewKindOf(notes){
 const j=(notes||[]).join(' ');
 if(/異なる柄|柄のある品/.test(j))return 'pattern';
 if(/季節感が離れ|防寒トップスとサンダル/.test(j))return 'season';
 if(/ボリュームがあり/.test(j))return 'volume';
 if(/肌着|インナーが外側/.test(j))return 'inner';
 if(/室内履き|室内用/.test(j))return 'indoor';
 if(/袋がバッグ/.test(j))return 'bag';
 if(/主役を主張|主張の強い品/.test(j))return 'statement';
 if(/ドレス靴|パンプス/.test(j))return 'dressmix';
 if(/実用品が複数/.test(j))return 'practical';
 return null;
}
function reviewPlusKindOf(notes){
 const j=(notes||[]).join(' ');
 if(/同じ柄を繰り返/.test(j))return 'pattern';
 if(/靴とバッグの色/.test(j))return 'colorlink';
 if(/ボリュームに強弱/.test(j))return 'volume';
 if(/細身で/.test(j))return 'slim';
 if(/生地やワークテイスト|デニム/.test(j))return 'material';
 if(/ドレス感が揃/.test(j))return 'dress';
 if(/街着の流れ/.test(j))return 'street';
 if(/ニットが呼応/.test(j))return 'knit';
 if(/季節感が揃/.test(j))return 'season';
 return null;
}
const REVIEW_MINUS={
 pattern:'柄と柄が正面衝突。どっちの柄も悪くないのに、同時に喋るからうるさい',
 season:'季節感が真逆。上の防寒ぶりと下の夏ぶりが、まだ話し合いの途中',
 volume:'上下とも膨らんで、ボリュームの置き場に困っている',
 inner:'肌着が外出着として出てきてしまっている。まず本来の主役を呼んであげたい',
 indoor:'室内履きが紛れている。玄関で一度、深呼吸したい一式',
 bag:'バッグが買い物袋。そこだけ生活感が全力で出てしまった',
 statement:'主役が多すぎて全員が同時に喋っている。誰か一人は脇役に回ってほしい',
 dressmix:'きれいな靴と部屋着パンツの鉢合わせ。どっちも悪くないのが惜しい',
 practical:'実用品が集まりすぎて、外出着としての芯がぼやけている',
};
const REVIEW_PLUS={
 pattern:'上下で柄を繰り返す小技が効いている', colorlink:'靴とバッグの色がさりげなくつながっている',
 volume:'上下のボリューム配分が上手い', slim:'細身のラインがすっきり通っている',
 material:'上下の素材感に共通点があって、ちぐはぐさがない', dress:'シャツから革靴まで格が揃っている',
 street:'街着の流れが一本通っている', knit:'ニット同士が呼応している', season:'季節感まで揃えた手堅さがある',
};
// --- コーデ総評: persona review by a veteran coordinator (spoken feedback) ---
// The 総評 is spoken feedback from one consistent character: 冴島ミレイ, a
// veteran fashion coordinator and former senior model. She reviews the outfit
// like a senior backstage: SMITTEN gushing at the very top (score >=95 and
// stylish/wild_good - she has fallen for it, no tsukkomi), strong praise when
// it's great, dry boredom when it's plain, cold scolding for clashes,
// exasperation for wild failures, and comedic RAGE at item-level offenses.
// Rage escalates in levels:
//   Lv1 キレ      - a single mild offense (eco-bag, indoor shoes, a TRUE
//                   quality gap: a junk-grade item far below the median price)
//   Lv2 ブチギレ  - a severe offense (paper/poly bag, underwear as outerwear),
//                   or two offenses at once
//   Lv3 伝説級    - 3+ offenses at once
// Verdict-evidence match is the standing rule: rage fires ONLY with a clear,
// statable reason - (1) item atrocities (bag-bags, underwear as outerwear,
// indoor shoes), (2) multiple severe clashes, (3) a true quality gap. A mere
// price ratio is NOT a reason: ordinary petit-prix garments (WEGO / UNIQLO /
// GU everyday clothes) never count as an offense at any ratio, and the gap
// is measured against the outfit's MEDIAN price, never a single hero item
// or the total. Every rage review states its ground in the first content
// line: the offending item's name plus the concrete problem (for a gap,
// both prices). Rage targets items and combinations only - never the
// player's body, looks, or gender. Plain outfits without a trigger item
// stay in the bored tier.
// Structure: 3 short spoken lines normally (opening reaction -> specific point
// naming items/pairs/colors -> closing verdict); rage reviews grow to 4 lines
// (Lv2) and 5 lines (Lv3) as she heats up. Line pools are large and keyed to
// the concrete facts (plus/minus kinds, hero item, colors, price tier, the
// specific trigger item), and selection is deterministic per outfit.
// Same hard rules as the narrator comment: NO internal axis names, NO axis
// numbers (prices are OK), every claim grounded in score2's reasons structure,
// and plain outfits never receive dasai-type wording (rage aims at items).
const PERSONA={name:'ミレイ',full:'冴島ミレイ',label:'先輩コーディネーター・ミレイの総評'};
function personaKindsOf(notes){
 const j=(notes||[]).join(' '),out=[];
 if(/異なる柄|柄のある品/.test(j))out.push('pattern');
 if(/季節感が離れ|防寒トップスとサンダル/.test(j))out.push('season');
 if(/ボリュームがあり/.test(j))out.push('volume');
 if(/肌着|インナーが外側/.test(j))out.push('inner');
 if(/室内履き|室内用/.test(j))out.push('indoor');
 if(/袋がバッグ/.test(j))out.push('bag');
 if(/主役を主張|主張の強い品/.test(j))out.push('statement');
 if(/ドレス靴|パンプス/.test(j))out.push('dressmix');
 if(/実用品が複数/.test(j))out.push('practical');
 return out;
}
// Spoken minus-point phrases per clash kind (several variants each).
const PERSONA_MINUS_V={
 pattern:['柄と柄が正面からぶつかってるのよ。同時に喋るから、どっちの声も聞こえないじゃない','柄同士が喧嘩腰なのよ。仲裁に入るの大変だったわよ','柄の主張が全員分あるのよ。うるさいのよ、はっきり言うと','柄の置き場が全員分ないのよ。一つ減らす勇気も要るのよ','柄同士、自己紹介が終わってないのよ。まだ他人行儀じゃない'],
 season:['季節が真逆なのよ。上が真冬で下が真夏じゃ、言い争いの途中みたいじゃない','季節感が真っ二つなのよ。どっちの季節に住んでるの、あんた','上の防寒と下の涼しさ、まだ話し合いが終わってないのよ','季節のカレンダーが二枚必要なのよ、これ','上と下で季節の言い分が違うのよ。統一しなさい'],
 volume:['上下とも膨らみすぎなのよ。ボリュームの置き場、ちゃんと考えた？','膨らみ同士が場所を取り合ってるのよ。譲り合いなさい','シルエットが渋滞してるのよ。まず一品、細身に替えてみなさい','膨らみの置き場が足りないのよ。まず一品、引いてみなさい','上下とも主張が体積なのよ。空気の入る隙間がないじゃない'],
 statement:['全員が主役を張ってるのよ。誰か一人、脇役に回りなさいって言ってるでしょ','主役が多すぎて、舞台が狭いのよ。一人降りなさい','全員センターに立ちたがるから、誰も目立たないのよ。本末転倒じゃない','主役の椅子が足りないのよ。椅子取りゲームは終わりにしなさい','全員が一番前に出たがるから、列が崩れてるのよ'],
 dressmix:['きれいな靴と部屋着パンツが鉢合わせよ。どっちも悪くないのに、もったいないじゃない','格の違う同士が無理に並んでるのよ。靴が困ってる顔してるわよ','ドレスな足元と部屋着の温度差、どうにかならなかったの','きれいな靴が浮いてるのよ。周りの温度と合ってないじゃない','格違いの同席は、格の高い方が気を遣うのよ。かわいそうじゃない'],
 practical:['実用品が集まりすぎて、外出着の顔をしてないのよ。生活感が出すぎじゃない','便利さで固めたら、格好よさが置いてけぼりなのよ','実用品の会議みたいになってるのよ。お出かけの顔しなさい','便利グッズの展示会みたいなのよ。着るものとしての顔しなさい','実用一点張りで、色気の居場所がないのよ'],
};
const PERSONA_MINUS={}; for(const k in PERSONA_MINUS_V)PERSONA_MINUS[k]=PERSONA_MINUS_V[k][0];
// Spoken plus-point phrases per harmony kind (several variants each).
const PERSONA_PLUS_V={
 pattern:['上下で柄を繰り返す小技、ちゃんと効いてる','柄の置き方が上手いじゃない。計算できてるのよ'],
 colorlink:['靴とバッグの色がさりげなくつながっている','色のつなぎ方が上品なのよ。分かってるじゃない'],
 volume:['上下のボリューム配分が上手い','膨らませるところと引くところ、心得てるわね'],
 slim:['細身のラインがすっきり通っている','ラインの潔さが気持ちいいのよ'],
 material:['上下の素材感に共通点があって、ちぐはぐさがない','素材の会話が成立してるのよ。地味に難しいのよ、これ'],
 dress:['シャツから革靴まで格が揃っている','格の揃い方がプロっぽいのよ'],
 street:['街着の流れが一本通っている','街に放り出しても様になる流れなのよ'],
 knit:['ニット同士が呼応している','ニットの呼応、さりげなくて好きよ'],
 season:['季節感まで揃えた手堅さがある','季節まで味方につけてるのよ。抜かりないわね'],
};
const PERSONA_SEVERE=['pattern','season','inner','indoor','statement','dressmix'];
// Junk-grade: an item that is genuinely not ordinary clothing - a practical
// role (underlayer / utility / specialUse: underwear, room shoes, storage
// and eco bags, party goods) or truly bottom-range appeal (<=45). Ordinary
// items floor at appeal ~60, so a percentile cut would wrongly flag normal
// petit-prix garments (a WEGO pair of pants sits at 62, same as most cheap
// clothes); the <=45 cluster is exactly the practical/oddity items. Price
// alone NEVER makes an item junk-grade.
function personaJunk(it){
 const role=it&&it.street?it.street.role:'';
 if(role==='underlayer'||role==='utility'||role==='specialUse')return true;
 return typeof s2attr==='function'&&s2attr(it)[12]<=45;
}
// All item-level offenses in this outfit, in priority order (bag > inner >
// indoor > price gap > multiple clashes). sev: 1 mild, 2 severe, 3 legendary.
function personaOffenses(items,score){
 const [top,bottom,shoes,bag]=items;
 const kinds=personaKindsOf(score.reasons.minus);
 const ref=it=>it.brand+'の'+reviewShortName(it.name);
 const total=score.total||items.reduce((n,x)=>n+x.price,0);
 const out=[];
 if(bag&&/収納バッグ|エコバッグ|ポリ袋|紙袋|レジ袋|買い物袋/.test(bag.name)){
  const paper=/ポリ袋|紙袋/.test(bag.name);
  out.push({kind:paper?'bagPaper':'bagEco',item:bag,ref:ref(bag),sev:paper?2:1});
 }
 let innerDone=false;
 if(/エアバリアインナー|保温肌着|肌着/.test(top.name)||(kinds.includes('inner')&&/インナー|肌着/.test(top.name))){out.push({kind:'inner',item:top,ref:ref(top),sev:2});innerDone=true;}
 if(/インナー|スパッツ|LONG JOHNS|UNDERPANTS/i.test(bottom.name)&&kinds.includes('inner')){out.push({kind:'inner',item:bottom,ref:ref(bottom),sev:2});innerDone=true;}
 if(!innerDone&&kinds.includes('inner'))out.push({kind:'inner',item:bottom,ref:ref(bottom),sev:2});
 if(/上履き|室内用|携帯スリッパ/.test(shoes.name)||kinds.includes('indoor'))out.push({kind:'indoor',item:shoes,ref:ref(shoes),sev:1});
 // TRUE quality gap only: the cheapest item must be junk-grade (see
 // personaJunk - an ordinary petit-prix garment NEVER counts, at any ratio),
 // cost <=¥3,000, and sit far below the outfit's MEDIAN item price. The gap
 // is never measured against a single hero item or the total: one luxury
 // hero (e.g. a ¥299,200 bag) plus ordinary petit-prix clothes is a normal
 // mix outfit, not an offense. A gap alone is always a mild (sev 1) offense.
 const cheapest=items.reduce((a,b)=>b.price<a.price?b:a);
 if(cheapest.price<=3000&&personaJunk(cheapest)&&!out.some(e=>e.item===cheapest)){
  const prices=items.map(x=>x.price).sort((a,b)=>a-b);
  const median=prices[Math.floor(prices.length/2)];
  if(median>=cheapest.price*20)out.push({kind:'gap',item:cheapest,ref:ref(cheapest),total,sev:1});
 }
 const clash=kinds.filter(k=>['pattern','season','statement','dressmix'].includes(k));
 if(clash.length>=2)out.push({kind:'multi',kinds:clash,sev:clash.length>=3?2:1});
 return out;
}
function personaRageLevel(list){
 if(!list||!list.length)return 0;
 if(list.some(e=>e.sev>=3))return 3;
 if(list.length>=3)return 3;
 if(list.length>=2)return 2;
 if(list.some(e=>e.sev>=2))return 2;
 return 1;
}
// Primary offense (first by priority) + full list + rage level, or null.
function personaOffense(items,score){
 const list=personaOffenses(items,score);
 if(!list.length)return null;
 return Object.assign({},list[0],{list,level:personaRageLevel(list)});
}
// Score band for the mid-range rebuild (2026-11-24 20:26): the user found
// 30-80 reviews emotionally flat, so the middle is now five DISTINCT bands
// with different voices; a player should be able to guess the band from the
// review alone. 0 = outside the band range (<30 or 85+).
function personaBand(o){return o>=80?5:o>=70?4:o>=60?3:o>=45?2:o>=30?1:0;}
function personaTier(score,offense){
 if(offense)return 'rage';
 // SMITTEN: the very top. Score >=95 AND a stylish classification - Mirei
 // has fallen for the outfit (97+ is ~0.4% of draws, so this stays rare).
 if(score.overall>=95&&(score.cls==='stylish'||score.cls==='wild_good'))return 'smitten';
 // FLUTTER （動揺）: 90-94 + stylish/wild_good. The affection gradient the
 // user asked for (2026-11-24): 85-89 stays professional praise, 90-94 she
 // starts slipping, 95+ she is fully lovestruck. Same person throughout -
 // offenses still take rage precedence over every band above.
 if(score.overall>=90&&(score.cls==='stylish'||score.cls==='wild_good'))return 'flutter';
 // Plain outfits keep the bored tier at EVERY score (user regressions pin
 // bored at 30 / 67 / 80 points); the band only flavours WHICH bored pool
 // speaks - see BORED_BAND in outfitReview.
 if(score.cls==='plain')return 'bored';
 const f=score.axes?score.axes.fashion:0;
 // 85-89 keeps the professional 絶賛 (praise) / approve split, unchanged.
 if(score.overall>=85)return f>=70?'praise':'approve';
 // Mid-range bands 30-84 for every non-plain classification: stylish /
 // wild_good take the standard flavour, dasai / wild_fail the sharper one.
 const b=personaBand(score.overall);
 if(b)return 'band'+b;
 if(score.cls==='wild_fail')return 'exasperated';
 if(score.cls==='stylish'||score.cls==='wild_good')return 'approve';
 return 'scold';
}
// One rant line about a specific offense entry. hot = Lv2/3 heat, mild = Lv1.
// Each offense kind has its own pool - an eco-bag never gets the underwear rant.
function personaRant(e,hot,pick,salt){
 const R=e.ref,H=e.heroRef||'';
 const P=(arr,s)=>pick(arr,salt+(s||0));
 switch(e.kind){
  case 'bagEco': return P(hot?[
   R+'。それ、レジ横で配ってるやつでしょ。何でコーデの真ん中にいるのよ。',
   R+'よ。買い物袋を相方に選ぶ度胸、誰も止めなかったの？',
   R+'。そのペラペラの買い物袋で、主役の隣に立つ気？　格が違いすぎるのよ。',
   R+'よ。エコバッグは買い物袋の仕事をしなさい。今日はバッグの日じゃないの。',
   R+'。買い物袋を「バッグ」と呼ぶ度胸、感心通り越して呆れるわよ。没収よ、没収。',
   R+'よ。レジ袋以下の存在感で、よく主役の隣に立てたわね。',
  ]:[
   R+'よ。それは買い物に行くときの袋でしょ。コーデの相方じゃないのよ。',
   R+'。エコなのは結構。でも今日の役目はバッグでしょ？　違うの？',
   R+'よ。帰りに買い物する気満々の生活感、隠れてないわよ。',
   R+'。それ、荷物入れであって、持つものじゃないのよ。分かってる？',
  ],31);
  case 'bagPaper': return P(hot?[
   R+'。紙袋をバッグって言い張るの、やめなさい。見てるこっちが恥ずかしいわよ。',
   R+'よ。それで人前に出る度胸だけは認めるわ。認めるけど却下よ、却下。',
   R+'。底が抜ける前に、私の堪忍袋が切れるわよ。',
   R+'よ。紙よ？　紙を持って「コーデ完成」は、さすがに無理があるのよ。',
   R+'。紙袋で勝負に出る度胸だけは世界級ね。……褒めてないわよ、一ミリも。',
   R+'よ。底が抜ける心配の前に、私の堪忍袋が先に破れたわよ。',
  ]:[
   R+'よ。それ、店でもらう袋じゃない。バッグの代わりにはならないのよ。',
   R+'。紙よ、紙。雨が降ったらどうするつもりなの。',
   R+'よ。持ち手のチープさが、全体の格を引っ張ってるのよ。',
   R+'。それで歩いたら、中身の心配が先に立つのよ。バッグの仕事してないじゃない。',
  ],33);
  case 'inner': return P(hot?[
   R+'。ふざけないで、それ肌着よ。肌着を主役に据える度胸、誰が教えたの。',
   R+'よ。肌着一枚で表舞台に立つ気？　ありえないんだけど。',
   R+'。それは服の下で汗をかく役なの。スポットライトの当たる場所じゃないのよ。',
   R+'よ。下に着るものを一番上に持ってくる発想、どこで覚えたの。却下よ。',
   R+'。肌着でランウェイ気取り？　笑えない冗談は、やめなさい。',
   R+'よ。それを「トップス」と呼ぶなら、私が辞表を出すレベルよ。着替えてきなさい。',
  ]:[
   R+'。それは主役の服じゃなくて、服の下で支える役なのよ。立場を間違えちゃダメじゃない。',
   R+'よ。下に着るやつよ。下に。何で一番上にいるの。',
   R+'。それ肌着よ。外出着の顔じゃないのよ。まず本来の主役を呼んであげたいわ。',
   R+'よ。肌着の出番は服の下なの。今日は場所を間違えてるわよ。',
  ],35);
  case 'indoor': return P(hot?[
   R+'。上履きで街を歩くの？　体育館の床が泣くわよ。',
   R+'よ。室内履きのまま玄関を越えた勇気、誰か止めなさいって言った？',
   R+'。そのペラペラの底で一日歩くつもり？　足も私も悲鳴よ。',
   R+'よ。上履きは学校の宝物なの。街に連れ出したらダメなのよ。',
   R+'。上履きで外を歩く根性、認めるわ。認めた上で、即刻履き替えなさい。',
   R+'よ。昇降口で人生止まってるの？　街は先にあるのよ。',
  ]:[
   R+'。室内で履くものは室内卒業なさい。外の空気、吸わせちゃダメなのよ。',
   R+'よ。それ室内用でしょ。ここ、昇降口じゃないのよ。',
   R+'。上履きの清潔感は認めるわよ。でも舞台は学校じゃないの。',
   R+'よ。室内履きは室内の主役なの。外では脇役にもなれないのよ。',
  ],37);
  case 'gap': { // the ground must be obvious at a glance: item + BOTH prices
   const T='¥'+(e.total||0).toLocaleString('ja-JP'), C='¥'+e.item.price.toLocaleString('ja-JP');
   return P(hot?[
    R+'。総額'+T+'のコーデに、'+C+'の実用品が混ざってるのよ。質の落差、目立ちすぎじゃない。',
    R+'よ。総額'+T+'の顔ぶれに、'+C+'のそれだけ日用品の顔してるじゃない。',
    '総額'+T+'まで組んでおいて、最後が'+R+'（'+C+'）なの？　締まらないわよ、それじゃ。',
    R+'。'+T+'の舞台に'+C+'の実用品よ。格の違いが、見てるこっちまで伝わるのよ。',
    R+'。総額'+T+'の舞台で、'+C+'の実用品が一人だけ日用品の顔。場違いって言葉、あんたのためにあるのよ。',
   ]:[
    R+'。総額'+T+'のコーデに、'+C+'のそれは浮くわよ。実用品は実用品の場所にいなさい。',
    R+'よ。総額'+T+'の本気に、'+C+'の実用品が並ぶのは無理があるのよ。',
    '総額'+T+'の顔ぶれに、'+R+'（'+C+'）だけ質が違うのよ。そこ、替えてきなさい。',
    R+'。安いのが悪いんじゃないの。'+T+'の中で、'+C+'のそれだけ日用品なのが悪いのよ。',
   ],39);
  }
  default: { // multi: several severe clashes at once
   const ks=(e.kinds||[]).filter(k=>PERSONA_MINUS_V[k]);
   const a=ks.length?P(PERSONA_MINUS_V[ks[0]],41):'';
   const b=ks.length>1?P(PERSONA_MINUS_V[ks[1]],43):null;
   if(hot)return b?a+'。さらに、'+b+'。'+P(['喧嘩の仲裁だけで一日終わるわよ、これ。','二つの現場を同時に相手させないで。私の堪忍袋にも限界があるのよ。'],45):a+'。これだけでも十分すぎるのよ。';
   return b?'まず、'+a+'。おまけに、'+b+'。一か所ずつ直していらっしゃい。':a+'。ここは外せないわよ。';
  }
 }
}
// --- line pools per tier (opening / closing), all spoken Mirei voice ---
const PRAISE_OPEN=['ちょっと、これ好きよ。ちゃんと分かってるじゃない。','いいじゃない、いいじゃない。今日のあんた、冴えてるわよ。','あら、やるじゃない。文句を探すのが大変だったわよ。','ちょっと待って。これ、本気で好きなんだけど。','……完璧に近いわよ。私が言うんだから、間違いないわ。','ほら、こういうのよ。私が見たかったのは、こういうの。','やだ、鳥肌。良い意味でね。分かってるじゃない。','今日のあんた、誰かに自慢していいわよ。私が保証するわ。'];
const PRAISE_CLOSE=['このままショーに出しなさい。合格よ、合格。','覚えておきなさい。これが「決めた」って顔よ。','次もこの調子でいらっしゃい。期待してるわよ。','私のワードローブにあっても文句言わないわよ、これ。','若手に見せてあげたいわね。お手本ってやつよ。','今日は文句なし。……珍しいわよ、私がこれ言うの。','そのまま写真撮っちゃいなさい。残す価値あるわよ。','合格どころじゃないわよ。表彰ものね、これ。'];
// SMITTEN （惚れ）: above 絶賛. Mirei has fallen - and per the user's
// direction (2026-11-24 20:14) the affection lands on the PLAYER, not only
// the outfit: the clothes are the evidence, the person who chose them is
// the target. Flustered, gushing, uncharacteristically honest. No tsukkomi
// slot at all: the third line is more praise, not a caveat.
// SMITTEN voice rules (user, 2026-11-24 20:33 + 20:35 + 20:38): at the top
// tiers Mirei ABANDONS the senpai/coordinator stance entirely and her speech
// itself goes plain （素の喋り） - short unadorned sentences, embarrassment,
// searching for words; coordinator catchphrases and judge vocabulary
// （なさい/合格/任命/審査/保証する/責任取りなさい) are gone. AND she never
// confesses: no direct 好き・惚れた aimed at the player, ever. She comes
// infinitely close - heartbeat, gaze, wanting more time together,
// almost-saying-it-and-stopping, 「察して」 - but the words themselves are
// never said. 好き・惚れた aimed at the OUTFIT (a fashion judgment) stays.
const SMITTEN_OPEN=['ちょっと待って待って。これ、好きすぎるんだけど。どうしよう。','……参った。完敗だよ、完敗。私、これに惚れたみたい。','やだ、ドキドキする。こんなの、反則だよ。','キミね……私を落としに来た？　落ちたよ、もう。','言葉が出ない。……いや出る、好き。好きすぎるの、これ。','ちょっと、心臓に悪いよ。ドキドキが止まらないの。','ふふ。……にやけちゃう。顔が、ゆるむの。','これだよ、これ。私が惚れるって、こういうことなの。','やだもう、どうしてくれるの。心臓、うるさいんだけど。','……ねえ、キミのセンスに惚れるって、こういうことなのね。','ふふ、ふふふ。……ごめん、にやけちゃうの、顔が。','ねえ、行かないで。……もう少しだけ、見せて。お願い。','心臓がうるさいの、今日ずっと。……あんたのセンスのせいだよ。','完敗。完敗だよ。プロの意地？　そんなの、もうない。','その服が羨ましいな。……キミに着てもらえてるなんてね。','ドキドキしすぎて、仕事どころじゃないんだけど。どうしてくれるの。','惚れたのはこの一式だけじゃないの。……続きは、言わない。察して。','ねえ、あんたって罪な人。服で私を落とすなんて。','あんたのセンスに惚れたのか、もっと別の何かなのか……ううん、言わない。','……もう隠さない。ドキドキしてることだけは、ね。この一式を選ぶあんたを見てると、止まらないの。','やだ、私ったら。服を見に来たのに、あんたばかり見てる。','ドキドキの原因、服だけじゃないの。……分かってるでしょ、キミ。'];
const SMITTEN_CLOSE=['ケチつける場所？　あるわけないよ。今日は私がファン。','そのまま私のワードローブに欲しいくらい。……本気だよ？','ねえ、こっち見て。……私も、キミと同じくらいドキドキしてるの。','今日のあんた、目が離せなかった。……ドキドキしっぱなし。連れて歩きたいくらい。','参った、ほんとに参ったの。今日は私の完敗でいいよ。','もう、言葉が出ない。ドキドキだけが、正直なの。','ドキドキが止まらないの。……ねえ、止め方、知らない？','もう一回見せて。……惚れ直すから。何度でもね。','今日のキミ、何度も見ちゃった。……新規でドキドキしてる、私。','次も惚れさせてね。約束だよ、約束。','私の「好き」は高いんだよ？　……今日は大盤振る舞い。','行かないでよ。……もう一回、最初から見せて。お願いだから。','その服たち、幸せ者だね。あんたに選んでもらえて。……羨ましいな。','心臓の音、聞こえる？　キミを見ると、ドキドキが止まらないの。','あんたのせいだよ、私をこんなにドキドキさせて。……嬉しいくせに、困ってるの。','次に会うのが楽しみになっちゃった。……ドキドキしながら待つよ、あんたのせい。','私の「好き」は服にだけ言う言葉だったの。……今日は、服以外にも言いかけて、止めた。ドキドキ、バレてた？','帰したくないな。……キミのセンス、もっと側で見ていたいの。','ねえ、こっち見て。……ドキドキ、顔に出てるでしょ。察して。'];
// SMITTEN MAX (score 100 only): the closest she ever gets - and she still
// does not say it. Completely plain speech （素の喋り）: naive, straight,
// short lines, no speeches, no judge words, no rank at all. The confession
// itself is always withheld (user rule, 2026-11-24 20:35): heartbeat, gaze,
// not wanting to leave, almost-saying-it - everything but the words.
const SMITTEN_MAX_OPEN=['ねえ、今の気持ち、言葉にしたら負けな気がするの。……だから言わない。察して。','点数なんていらないの。……キミの隣、空いてる？','……すごい。ほんとに、すごいよ。ドキドキする。','帰りたくないの。……もう少しだけ、キミの側にいさせて。言わなくても、分かるでしょ。','キミの、そういうところが……ううん、言わない。目が離せないのよ、私。'];
const SMITTEN_MAX_CLOSE=['ねえ、お願い。……これからも、私をドキドキさせて？　命令じゃないよ、お願い。','今日から私、キミのファン一号。……いえ、特別枠。ずっと側で見せてね。','帰りたくないのは私の方かも。……ねえ、もう少しだけ、キミの側にいさせて。','次も、その次も。キミのコーデで、私を落とし続けて。約束だよ。','もう降参。完敗。……この気持ちに名前は付けない。付けたら、負けな気がするの。','ねえ、察して。……言わないけど、目が離せないの、キミから。','ねえ、この気持ち、こういうことなのね。……言わない、絶対。','服の話は、もう終わり。……ねえ、もう少しだけ、側にいて。お願い。'];
// FLUTTER （動揺） pools: 90-94. She is still trying to be the professional
// - and failing, audibly. Warmth slips out, then she catches herself. The
// middle line is built in outfitReview (it names the hero item).
const FLUTTER_OPEN=['ちょっと待って。……ううん、待たなくていいわ。良いのよ、これ。すごく。','……あら。困ったわね、私、文句が見つからないの。','ちょっと、どうしたの今日。……良い意味でよ？　良い意味で言ってるの。','ふーん。……ふーん、じゃないわね。参ったわ、認めるわよ。','待って、今の、もう一回見せて。……確認よ、確認。仕事の確認。','……ドキドキ、してるかも。いえ、仕事として言ってるのよ？　仕事として。','あらら。今日のあんた、ちょっと反則じゃない？','……服の話をしてたはずなのに。キミの顔、思い出してる私がいるのよ。','ちょっと待って。……長く見てきたつもりだったけど、今日のあんたは知らない顔してるじゃない。','あら。……キミから、目が離せないのよ。服の話よ？　……たぶん。','……もっとあんたのこと、知りたくなってきたじゃない。仕事が、手につかないの。','ふーん。……ふーん、で済ませたいのに。知らなかったあんたの顔、もっと見たくなってるのよ、私。','ねえ。……あんたを見てると、先輩の顔が保てないの。ドキドキ、バレてる？'];
const FLUTTER_CLOSE=['合格よ。……合格、以上の何かよ、これ。','次も期待しちゃうじゃない。……期待してるわよ、本当はね。','ふふ。今日は私、機嫌がいいわよ。あんたのおかげでね。','認めたくないけど、認めるわ。……好きよ、この感じ。','プロとしては冷静でいたいんだけどね。……無理だったわ、今日は。','この調子で来て。私、楽しみにしちゃうから。','合格よ。……キミが、ちょっと気に——ううん、仕事の話よ？　仕事の。','次も来て。……あんたのセンス、もっと見たいの。……見せて、ね？','ふふ。あんたって、油断ならない人ね。……良い意味で、ドキドキしたわよ。','今日のことは内緒ね。……私があんたにドキッとしたことも、内緒。','認めるわ。服も、あんたも。……今日はここまで。続きは次回ね。'];
const APPROVE_OPEN=['うん、悪くないわよ。ちゃんと成立してるじゃない。','いい線いってるわよ。あと一歩ってところね。','あら、まとまってるじゃない。悪くないわよ。','うんうん。今日のあんた、ちゃんとしてるじゃない。','文句らしい文句はないわね。及第点、あげるわよ。','悪くないのよ。あと少しで「好き」って言えたのにね。'];
const APPROVE_CLOSE=['方向は合ってるわよ。自信持っていらっしゃい。','次はもう少しだけ攻めてみなさい。化けるわよ。','この調子でいきなさい。次はもっと欲張っていいのよ。','惜しいのよ、あと一歩。でも悪くないわよ、本当に。','次は主役をもっと目立たせなさい。話はそれからよ。','うん、合格ラインは越えてるわよ。胸張っていらっしゃい。'];
const BORED_OPEN_RICH=['悪くないわよ。悪くないけどさ、お金はかかってるのに音がしないのよね。','上品ね。上品だけどさ、これ、表紙の顔じゃなくて休日の顔なのよ。','高いものって、もっと騒いでいいのよ？　静かすぎるのよ。','お金は使ってるのよ。使ってるのに、印象が残らないのよ。'];
const BORED_OPEN=['悪くないよ。悪くないけどさ、目が覚める事件は何も起きてないわね。','うん、平和ね。平和すぎて、途中で時計見ちゃったわよ。','……ふぁ。ごめんなさい、退屈なんじゃなくて、安心しすぎたのよ。','無難って言葉、あんたのためにあるのね。褒めて……るわよ、一応。','破綻はないわよ。破綻は。……それ以外のお話、ある？','悪くないのよ。ただ、私の記憶には残らないタイプね。'];
const BORED_CLOSE=['次は一品だけ冒険してみなさい。それで十分変わるわよ。','惜しいのは華やかさの在庫切れね。次、期待してるわよ。','次は驚かせてみなさい。私、退屈に弱いのよ。','普段着としては合格よ。……「普段着としては」が付くけどね。','一品だけ悪者を入れてみなさい。全体が目覚めるわよ。','悪くないのよ、本当に。ただ、もう一押しの欲が欲しいわね。','今日はこれで帰っていいわよ。次は期待してるから。'];
const EXASP_OPEN=['あのさ……気持ちは分かるのよ。分かるけど、やりすぎじゃない？','個性ってのはね、全員で叫ぶことじゃないのよ。','……はぁ。個性のつもりが、ただの騒音になってるわよ。','気持ちが先行しすぎなのよ。服が追いついてないじゃない。','一品ずつは個性的なのよ。全員集合すると、ただうるさいのよ。'];
const EXASP_CLOSE=['一品ずつは悪くないのよ。引く勇気も覚えなさい。','次は主役を一人に絞っていらっしゃい。話はそれからよ。','個性を減らすんじゃないのよ。置き場所を決めるのよ。','次は一人だけ大声を出させなさい。他は囁く役よ。','惜しいわね、本当に。あと一品引けば化けたのに。'];
const SCOLD_OPEN=['……はぁ。何これ。組み合わせ、ちゃんと考えた？','ダメね、これは。はっきり言うわよ、合ってないの。','ちょっと、これはないわよ。冷静に見て、変でしょ。','品物は悪くないのよ。合わせ方が、冷たい言い方すると雑なの。','うーん……。褒める場所、探すのに時間かかったわよ。','これは通せないわね。理由、言ってあげるから聞きなさい。'];
const SCOLD_CLOSE=['やり直し。でも一品ずつは悪くないのよ、組み直せば化けるわよ。','次は色か形、どっちか一つに絞って合わせなさい。分かった？','冷たい言い方だけど、これが本当よ。直してきなさい。','期待してるから言うのよ。……今のは本気で直しなさい。','このままだと、品物の方がかわいそうよ。組み直しなさい。','はい、解散。一品ずつ出直してきなさい。'];
const RAGE1_OPEN=['ちょっと待って。……何これ、本気？','は？　ちょっと、そこで止まって。','信じられないんだけど。まず、そこよ、そこ。','ちょっと！　あんた、それで表に出るつもり？','ちょっと待って。突っ込みどころが先に目に入っちゃったんだけど。','信じられない。見なかったことにしたいところだけど、無理ね。','あらららら。やっちゃったわね、これ。','ちょっと、鏡。もう一回見てきた？'];
const RAGE1_CLOSE_PLAIN=['他はちゃんと成立してるのよ。だからこそ、そこだけ今すぐ直しなさい。分かった？','怒ってるのはその一点だけよ。他は普段着として悪くないんだから、直してきなさい。','その一点さえ替えたら、普通に通せるわよ。惜しいのよ、あんた。','他は許すわよ。でも、そこだけは今日中に直しなさい。'];
const RAGE1_CLOSE=['今日のところは保留よ。その一点、直してから出直していらっしゃい。','他が頑張ってるのに、そこだけ置いてけぼりよ。直しなさい。','却下まではしないわよ。でも、その一点は今すぐよ。今すぐ。','あと一歩だったのよ、本当に。だからこそ、そこが許せないのよ。'];
const RAGE2_OPEN=['ふざけないで。何考えてるの、ほんとに。','ありえない。ありえないんだけど、これ。','ちょっと！　信じられない。誰も止めなかったの、これ。','信じられない。私の目が悪いのかと思ったわよ。悪くないのよね、これ。','ふざけないで。言葉が出ない……いや、出るわ。文句がね。','何考えてるの。何なのこれ、説明しなさい、説明。','本気で言ってる？　本気ならなおさら問題なんだけど。','はぁ？　冗談はここまでよ。真面目にやるわよ、真面目に。','ふざけないで。今年いちばんの論外よ、これ。','論外。話にならないわ。ふざけないで、どこから突っ込めばいいのよ。','失格。今日の審査、ここで打ち切りよ。','……帰りなさい。話は着替えてからよ。','擁護する材料、一個も見つからないんだけど。'];
const RAGE2_EXTRA=['誰か一人、止める大人は周りにいなかったの？','鏡の前で一回も止まらなかったの、あんた。','これで「完成」って顔してるなら、問題はそこもよ。','私が若手の頃にこれやったら、その場で着替え直しよ。','言いたいことは山ほどあるのよ。時間がないから要点だけね。','ほら、こっち見なさい。目を逸らしたって直らないわよ。','弁解は聞かないわよ。目は節穴じゃないの。','これを「個性」と呼ぶなら、言葉の敗北よ。','私の時間を返してほしいくらいよ、本気で。','下の者なら、その場で没収よ。没収。'];
const RAGE2_CLOSE=['ダメダメ、これは通せないわよ。帰って着替えてきなさい。','却下よ、却下。組み直して、出直していらっしゃい。','一品ずつ見直してきなさい。話はそれからよ。分かった？','今日のあんたは連れて歩けないわよ。直してきなさい、早く。','やり直し。最初からよ。私、ここで待ってるから。','その格好で帰るなら、せめて裏道使いなさい。……直してから帰りなさい。','最終通告よ。直してこないなら、次はないから。','却下。判決は覆らないわよ。組み直して、出直して。','今日のところは解散。明日の正装で出直しなさい。'];
const RAGE3_OPEN=['ちょっと待って待って待って。……ドッキリ？　これ、ドッキリなの？','はぁぁ？　カメラ、どこ？　隠しカメラ探すわよ、私。','伝説ね。私のキャリアで、これは歴史に残るわよ。','今年ワースト、もう決まったんじゃない？　まだ戦える？','伝説の予感しかしない。笑うしかないんだけど、これ。','ちょっと、歴史に残るタイプのやつ来たわよ。覚悟して聞きなさい。','……記録更新。悪い意味で、ぶっちぎりのワーストよ。','審査中止。いや、審査する価値の話から始めましょうか。','私の語彙が尽きたわ。残ってるのは、怒りだけよ。'];
const RAGE3_MID=['しかも一個じゃないのよ。数えるのも嫌になるわ。','突っ込みが渋滞して、口が追いつかないのよ。','直す場所を挙げたら、指が足りないのよ。両手使ってもね。','これ、わざと？　わざとなら才能よ。褒めてないわよ。','一個直しても、まだ次があるのよ。エンドレスなのよ。','擁護側の証人、ゼロよ。ゼロ。誰もあんたの味方をしない組み合わせなの。','直す場所を数えるのをやめたのよ。数える意味がないくらいにはね。'];
// Lv3-only extra contempt line (user directive 2026-11-24: rage may hit
// harder; Lv3 reviews may run to 6 lines). Reason lines still come first.
const RAGE3_EXTRA=['伝説って、こうやって生まれるのね。……最悪の形でね。','来年も語り継ぐわよ、この一式。反面教師として、完璧なの。','私のキャリアの「ワースト」棚、いっぱいになったわ。あんたのせいで。','ドッキリじゃなかったのね。……現実の方が、よっぽど怖いわよ。'];
const RAGE3_CLOSE=['伝説級に却下よ。まず深呼吸して、全部組み直してきなさい。','今年の語り草が決まったわね。……褒めてないわよ？　直してきなさい。','歴史に残る前に、歴史を書き換えてきなさい。やり直しよ。','私のキャリアの語り草が増えたわ。光栄に思いながら着替えてきなさい。','ワースト記録、更新よ。次は良い意味で更新しなさいね。','はい、殿堂入り。……悪い意味でね。全部直してきなさい。','判決：総入れ替え。異議は認めないわよ。','歴史に残る前に、歴史ごと消してきなさい。全文書き直しよ。'];
// --- DAILY pools (petit-prix relief, 2026-11-24 20:24): when scoreV2's
// relief fired and the tier would be praise (85-89) or flutter (90-94),
// Mirei praises the outfit as beloved EVERYDAY wear, not runway wear -
// 「ランウェイではないけど普段着として好き」. ランウェイ may appear only in
// the negating form. Relief outfits are hard-capped at 94, so they never
// reach smitten; at 85+ these pools take precedence over the standard
// praise/flutter pools (and over the band pools, which stop at 84).
const DAILY_PRAISE_OPEN=['ランウェイの服じゃないわよ。でもね、こういう普段着が、いちばん好きだったりするの。','派手さはないわよ。でも、毎日着たくなる顔してるじゃない。','これ、日常の勝ち組ね。騒がないのに、ちゃんと素敵なのよ。','普段着の理想形って、こういうのよ。力んでないのに、決まってる。','毎日の服ってね、結局こういうのが一番頼りになるのよ。好きよ、これ。','特別な日の服じゃないわ。でも、毎日に寄り添う強さがあるのよ。','地味？　違うわよ。日常をちゃんと格好よくするって、一番難しいの。'];
const DAILY_PRAISE_POINT=['推しは__HERO__ね。毎日の相方にちょうどいい顔してるのよ。','__FACT__のよ。普段着の完成度って、こういう地味な上手さなの。','__HERO__を中心に、無理のない普段着が組めてるのよ。好感度、高いわよ。','決め手は__FACT__。毎日使うものほど、こういう確かさが効くのよ。','__HERO__の選び方、生活のセンスが出てるわね。好きよ、こういうの。','__FACT__。派手な事件はないけど、毎日の満足度は高いはずよ。'];
const DAILY_PRAISE_CLOSE=['この普段着、長く付き合えるわよ。大事に着なさい。','合格よ。……いえ、日常着としては、かなり上位の合格ね。','明日の朝も、迷わず手に取る一式よ。そういうのが強いの。','特別じゃない日の味方。そういう服が一番好きだったりするのよ。','毎日見ても飽きないって、才能よ。この調子でいらっしゃい。','普段着でここまで決める人、信用できるわ。次も期待してるわよ。'];
const DAILY_FLUTTER_OPEN=['待って。……普段着に、ドキドキさせられてる私がいるのよ。','毎日の服で、こんなに目が離せなくなるなんて。……反則よ。','あら。……この普段着、ちょっと好きすぎるかも。仕事の話よ？','日常の服でこの破壊力。……キミ、普段からこんな感じなの？','ふふ。……毎朝これで現れたら、私、困るわよ。良い意味でね。','待って、今のもう一回。……普段着の確認よ、確認。……たぶん。'];
const DAILY_FLUTTER_POINT=['推しは__HERO__ね。毎日の相方にしたら、ちょっと自慢したくなる顔よ。','__FACT__のよ。普段着でここまでやる人、なかなかいないわよ。','__HERO__の選び方。……一緒に暮らす服を選ぶセンスって、こういうのよね。','決め手は__FACT__。日常の積み重ねが、一番その人を表すのよ。','__HERO__、毎日見たいわ。……服の話よ。服の。……たぶん。','__FACT__。地味な上手さに、ドキッとしたわよ。'];
const DAILY_FLUTTER_CLOSE=['ふふ。……あんたの日常、ちょっと覗いてみたくなったじゃない。','次も普段着で落としに来て。……待ってる、ドキドキしながら。','毎日のあんた、素敵なのね。……服の話から逸れたわね。でも本当よ。','認めるわ。普段着のあんたに、ちょっとドキドキしたかも。……仕事の話よ？','この調子でいらっしゃい。あんたの日常のファンになりそうよ、私。','ふふ。今日は帰すけど、明日もその普段着で来て。見たいの。'];
// --- Mid-range BAND pools (2026-11-24 20:26): five score bands with
// unmistakably different voices. Each band has a signature word that appears
// in its openings and never in a neighbouring band's pools, so the band can
// be guessed from the review alone:
//   band1 30-44 落胆・辛口 (signature 落胆） - disappointed, names the
//          biggest flaw, no comfort padding
//   band2 45-59 物足りない (signature 物足りない) - lukewarm, one specific
//          complaint + at most one redeeming point, あと一歩 frustration
//   band3 60-69 渋い及第点 (signature 及第点） - grudging pass, nitpick
//   band4 70-79 認める (signature 認める) - genuine professional approval,
//          one reservation
//   band5 80-84 高評価 (signature 上出来） - warm strong praise, one step
//          below the unchanged 絶賛 (85-89)
// Flavours: std = stylish/wild_good, sharp = dasai/wild_fail (the sharper
// variant of the same band). Templates: __HERO__ center item, __FACT__ a
// plus-point clause, __MINUS__ the main minus-point sentence.
const BAND_POOLS={
1:{std:{
 open:['ため息が出るわね。落胆したわ、はっきり言うと。','期待して損した気分よ。落胆って、こういう顔するの。','うーん、落胆。どこから手をつけるか、考えるのも疲れるわ。','正直に言うわよ、落胆した。品物は悪くないのにね。','ため息が先に出る一式ね。落胆の理由、言ってあげるわ。','楽しみにしてたのよ？　そのぶん、落胆も大きいの。'],
 push:['一番の問題はこれ。__MINUS__。ここが全体を沈めてるのよ。','__MINUS__。これじゃ、他の頑張りが報われないじゃない。','中心の__HERO__は悪くないのよ。でも、__MINUS__。救いきれないわ。','__MINUS__。致命的なのはここね。褒め台詞、ここで尽きたわ。','悪い点から言うわよ。__MINUS__。弁解の余地は薄いわね。','__HERO__の良さが霞んでるのよ。__MINUS__。もったいないを通り越してるわ。'],
 close:['今日のところは、これが現実。受け止めなさい。','擁護はしないわよ。次に期待、ね。','このまま街に出すのは、私が許さないわ。','直す場所は言ったわよ。あとはあんた次第。','合格？　遠いわよ。まず一か所、変えてきなさい。','ため息で終わる日もあるわ。次は笑わせて。']},
 sharp:{
 open:['ため息どころじゃないわ。落胆した、通り越して呆れたのよ。','落胆したわ。組み合わせの意味が、私には見つからないの。','これは擁護のしようがないわね。落胆って言葉がぴったりよ。','期待はしてなかったけど、それでも落胆する出来ね。','落胆で、ため息が止まらないわ。どこを見ても、直しどころだらけよ。','落胆した。品物同士が、仲良くする気ゼロじゃない。'],
 push:['筆頭はこれ。__MINUS__。言い訳のしようがないわ。','__MINUS__。これが一番の喧嘩どころよ。他も大概だけどね。','中心の__HERO__まで巻き添えよ。__MINUS__。これが元凶なの。','__MINUS__。擁護側の材料、ゼロなのよ。','悪い点を挙げたら切りがないけど、筆頭はこれ。__MINUS__。','__HERO__は悪くない。悪いのは組み合わせ。__MINUS__。'],
 close:['解散。今日の話は終わりよ。','この一式は、私の記憶から消すわ。あんたも忘れなさい。','次は頼むわよ、心から。','弁解は聞かないわ。直す場所だけ、覚えて帰りなさい。','今日の判定は覆らないわよ。次は別物を持ってきなさい。','期待の反動って、怖いわね。次は裏切らないで。']}},
2:{std:{
 open:['悪くないのよ。でも、物足りない。あと一歩が遠いの。','うん、成立はしてる。でも物足りないのよ、決め手が。','物足りないわね。嫌いじゃないのに、好きにもなれない。','物足りないのよ、本当に。惜しさの正体、言ってあげるわ。','届かないわけじゃないの。でも、物足りない。この差が悔しいのよ。','中途半端って言葉が浮かぶわね。物足りないのよ、あと少し。'],
 push:['良い点はこれ。__FACT__。でも、__MINUS__。この差が物足りなさの正体よ。','__FACT__のは良い点ね。でも、__MINUS__。惜しいのよ。','中心は__HERO__ね。悪くないのよ。ただ、__MINUS__。あと一歩ね。','__MINUS__のが、ずっと引っかかってるの。__FACT__だけじゃ、届かないわ。','救いはこれ。__FACT__。でも主役の__HERO__が、まだ本領を出してない顔なのよ。','__FACT__。良い材料はあるの。組み上げが、あと一歩なのよ。'],
 close:['あと一歩よ、本当に。次は届かせてみなさい。','物足りなさは、伸びしろってことよ。期待はしてるわ。','この悔しさ、覚えておきなさい。次で晴らすのよ。','合格には届かないわ。でも、遠くもないの。','次は決め手を一つ、足してきなさい。話はそれからよ。','惜しいで終わるのは、今日までにしなさい。']},
 sharp:{
 open:['物足りない、どころじゃないわ。喧嘩の仲裁から疲れたのよ。','成立してないのよ。物足りない以前の問題ね。','うーん、物足りない。足りないのは、まとめる気概かしら。','物足りないわね。惜しい場所を探す方が大変なくらいよ。','物足りないわね。主張だけは一人前なのにね。','物足りないわね。喧嘩の中途半端さほど、見てて疲れるものはないのよ。'],
 push:['筆頭はこれ。__MINUS__。これが片付かないと、話にならないわ。','__MINUS__。良い点を探す前に、これが目に入るのよ。','救いはこれくらい。__FACT__。でも、__MINUS__。埋もれるわ。','__HERO__は悪くないのよ。周りとの喧嘩が、全部持っていくの。','__MINUS__のが致命傷ね。あと一歩どころか、スタート地点の話よ。','材料はあるの。__FACT__。でも組み合わせがこれ。__MINUS__。順番が逆なのよ。'],
 close:['まず喧嘩を止めなさい。話はそれからよ。','次は一人だけ、声を落としてきなさい。','物足りなさの原因は言ったわよ。次に活かしなさい。','このままじゃ、誰も幸せにならない組み合わせよ。','期待は残しておくわ。少しだけね。','今日のところは解散。次はまとめてきなさい。']}},
3:{std:{
 open:['及第点。……渋々だけど、及第点はあげるわよ。','まあ、及第点ね。褒めちぎる気にはならないけど。','渋々だけど、及第点。文句は、まあ、あるわよ。','及第点ライン、ちょうどね。危ない橋だったわよ。','うん、及第点。胸を張るには、まだ早いのよ。','及第点は及第点。でも、私の目は誤魔化せないわよ。'],
 push:['中心は__HERO__ね。悪くないのよ。でも、__MINUS__のが引っかかるわ。','__FACT__のは良い点。ただ、__MINUS__。細かいけど、目立つのよ。','__FACT__で及第点に届いた感じね。__MINUS__のが、なければね。','__HERO__は仕事してるわよ。脇の問題はこれ。__MINUS__。惜しいの。','良い点は__FACT__。粗はこれ。__MINUS__。差し引き、及第点ね。','__FACT__。悪くないのよ、本当に。でも、__MINUS__。この粗がなければ、もっと上だったわ。'],
 close:['及第点は守りなさい。次は、もう少し上を見なさい。','この調子なら、次は化けるかもね。期待は薄めにしておくわ。','悪くないのよ。……渋々、褒めてるの。分かった？','今日のところは合格ライン。浮かれないでね。','次は粗を一つ減らしてきなさい。それだけで違うわよ。','及第点の常連で終わるか、次で抜けるか。あんた次第よ。']},
 sharp:{
 open:['及第点？　喧嘩しながら、よく届いたわね。','渋々、及第点。衝突の割には、形になってるのよ。','及第点はあげるわ。でも、この喧嘩は見逃さないわよ。','まあ、及第点。騒がしい及第点ね。','及第点ラインにしがみついた感じね。危なかったわよ。','渋い顔で及第点。内容は、まあ、言わなくても分かるでしょ。'],
 push:['筆頭の粗はこれ。__MINUS__。これで及第点なのが不思議なくらいね。','__MINUS__。これがなければ、もっと楽に通せたのよ。','救いは__FACT__。喧嘩の割に、材料は悪くないの。','__HERO__が踏ん張ってるのよ。周りの問題はこれ。__MINUS__。足を引っ張るわ。','__MINUS__。この衝突、及第点の代償としては高いわよ。','良い点は__FACT__。でも、__MINUS__。差し引きが、ちょうど及第点なの。'],
 close:['及第点は及第点。次は喧嘩を減らしてきなさい。','この調子で衝突を減らせば、上も見えるわよ。','渋々だけど、通すわ。次は綺麗に通しなさい。','今日のところは見逃すわ。次は知らないわよ。','粗は言ったわよ。直せば化ける材料はあるの。','及第点の味を覚えたなら、次は上を狙いなさい。']}},
4:{std:{
 open:['認めるわ、これは。ちゃんと組めてるじゃない。','うん、認める。今日のあんた、仕事が丁寧よ。','認めるわ。文句は一つだけ、あとは合格ね。','これは認めるわよ。センスの置きどころが分かってるじゃない。','認める。地味に難しいことを、やってのけてるわね。','私が認めるって、安くないのよ？　今日は出すわ。'],
 push:['中心は__HERO__ね。__FACT__のよ。留保は一つ。__MINUS__。','__FACT__。良い仕事よ。ただ、__MINUS__。惜しいわね。','__HERO__の選び方、認めるわ。粗はこれくらい。__MINUS__。','決め手は__FACT__。残る粗はこれ。__MINUS__。直せば文句なしに近づくわ。','__FACT__のよ。完成度、認めるわ。細部でこれが残念ね。__MINUS__。','__HERO__が全体を引っ張ってる。__MINUS__。これは目を瞑る範囲よ。'],
 close:['認めたんだから、自信持っていらっしゃい。','この調子でいきなさい。次も認めさせてよね。','合格よ。……認めるって、こういうことよ。','次は粗も消してきなさい。期待してるわよ。','今日のあんたは、連れて歩けるわ。胸張っていらっしゃい。','認めるわ、本当に。次はもっと欲張っていいのよ。']},
 sharp:{
 open:['認めるわ、喧嘩しながらも点は取ってるのよ。','認めるわ。衝突はあるけど、力で押し切ったわね。','これは認める。荒いけど、成立はしてるのよ。','認めるわよ。喧嘩の割に、格好はついてるじゃない。','うん、認める。騒がしいけど、悪くない出来よ。','認める。ぶつかりながらも、形にする力はあるわね。'],
 push:['筆頭の粗はこれ。__MINUS__。でも、__FACT__で押し切ってるわ。','__FACT__。この力が、喧嘩を上回ったのよ。','__HERO__の存在感は認めるわ。残る課題はこれ。__MINUS__。','__MINUS__。粗は粗。でも全体の力は本物よ。','決め手は__FACT__。衝突込みで、この出来は認めるわ。','__HERO__が中心で踏ん張ってる。粗はこれ。__MINUS__。直せば化けるわ。'],
 close:['認めたわよ。次は喧嘩も減らしてきなさい。','この力は本物。粗を直せば、もっと上よ。','合格。騒がしい合格だけどね。','次も認めさせて。衝突の処理も含めてね。','今日のあんたは通すわ。胸張っていらっしゃい。','認める。その代わり、粗の直し方も考えてきなさい。']}},
5:{std:{
 open:['上出来よ、これ。絶賛まで、あと少しのところよ。','上出来。文句の置き場に困るくらいよ。','これは上出来ね。センスが冴えてるじゃない。','上出来よ。今日のあんた、かなり良い線を超えてるわ。','褒めるわよ、上出来。プロの目で見ても、隙が少ないの。','上出来。あとは好みの問題ってくらい、決まってるわ。'],
 push:['中心は__HERO__ね。__FACT__のよ。決まってるわ。','__FACT__。この完成度、上出来の証拠よ。','__HERO__の選び方、冴えてるわね。__FACT__。隙がないのよ。','決め手は__FACT__。細部まで気が利いてるのよ。','__FACT__のよ。粗探しが趣味の私が、手こずるくらい。','__HERO__を主役に、脇まで仕事してる。上出来な一式よ。'],
 close:['合格どころじゃないわよ。上出来の合格ね。','この調子で来なさい。次は絶賛を取りにいくのよ。','今日のあんたは自慢していいわ。私が太鼓判よ。','上出来の味、覚えておきなさい。次も頼むわよ。','胸張っていらっしゃい。プロのお墨付きの一式よ。','次はもっと上を見なさい。届く手応え、あるでしょ。']},
 sharp:{
 open:['上出来よ、喧嘩込みでね。力技だけど、決まってるわ。','上出来。衝突をねじ伏せる力、あるじゃない。','これは上出来ね。荒さごと、格好になってるのよ。','上出来よ。騒がしいのに、目が離せない出来ね。','褒めるわ、上出来。衝突の処理まで含めてね。','上出来。荒いけど強い。そういう一式よ。'],
 push:['__FACT__。この力が衝突を上回ったのよ。','粗はこれ。__MINUS__。でも、__FACT__で帳消しに近いわ。','__HERO__の存在感が全体を支配してる。上出来の決め手よ。','決め手は__FACT__。荒さは、個性に変わってるわ。','粗はこれ。__MINUS__。でも、__FACT__。差し引いても、上出来よ。','__HERO__中心に、喧嘩ごと成立させたわね。力量よ。'],
 close:['上出来の合格。次は衝突も片付けてきなさい。','この強さは本物よ。胸張っていらっしゃい。','次も上出来で来なさい。期待、跳ね上がってるわよ。','今日のあんたは通すわ。文句は少ない方よ。','荒さも味方につけたわね。次が楽しみよ。','上出来。この調子で、絶賛を取りにいらっしゃい。']}}
};
// Bored-flavoured band variants for PLAIN outfits (tier stays 'bored' at
// every score - the pinned regressions - but the open/close pools follow
// the band, so a plain 80 reads warm-dry and a plain 30 reads dry-tired).
// All lines stay BADWORD-free and rage-free, like the legacy bored pools.
const BORED_BAND={
1:{open:['ため息は出るわね。落胆まではいかないけど、事件ゼロなのよ。','落胆ってほどじゃないの。ただ、平和すぎて眠くなるのよ。','落胆とまでは言わないけど、ため息交じりの平和ね。破綻はないけど、事件もないのよ。','落胆の理由は地味さね。悪くないのに、残らないのよ。'],
 close:['次は事件を一つ、起こしてみなさい。','普段着としては失格じゃないわよ。ただ、印象はゼロね。','今日はこれで帰っていいわよ。次は驚かせて。','悪くないのよ。記憶に残らないだけでね。']},
2:{open:['物足りないわね。平和なのは良いけど、決め手がないのよ。','悪くないのよ。でも物足りない。事件が足りないの。','物足りないのよ、正体は無難さね。安全運転すぎるのよ。','うん、平和。でも物足りない。この差、悔しくない？'],
 close:['あと一品、冒険してみなさい。それで変わるわよ。','次は驚かせて。物足りなさは、伸びしろよ。','普段着としては合格。でも、もう一押しね。','今日はこれでいいわよ。次は期待してるから。']},
3:{open:['及第点。平和な及第点ね。事件は、まあ、ないわよ。','渋々、及第点。無難の王道って顔してるわね。','及第点はあるのよ。でも、記憶に残るかは別ね。','及第点。破綻なし、事件なし。優等生の退屈さね。'],
 close:['及第点は守りなさい。次は事件も添えて。','悪くないのよ。次は一品だけ、悪者を入れてみなさい。','この調子なら安定はするわよ。華は、次に期待ね。','今日はこれで帰っていいわよ。次は驚かせて。']},
4:{open:['認めるわ、普段着としては上位よ。事件はないけどね。','認めるわ。無難なのに、ちゃんと決まってるじゃない。','認める。平和なのに、品があるのよ、これ。','認めるわよ。退屈なはずなのに、悪くないのが不思議ね。'],
 close:['普段着としては合格よ。次は事件も見せて。','この安定感は本物。あとは華だけね。','今日はこれで帰っていいわよ。良い普段着だったわ。','次は驚かせてみなさい。基礎はできてるんだから。']},
5:{open:['上出来な普段着よ、これ。事件はないけど、完成度は本物ね。','上出来。無難の到達点って、こういう顔なのよ。','上出来よ。平和なのに、この品の良さは事件ものよ。','上出来な一式ね。普段着の格が違うわ。'],
 close:['普段着としては文句なし。次は表紙も狙ってみなさい。','この安定感と品、長く付き合えるわよ。','今日はこれで帰っていいわよ。……褒めてるのよ、今のは。','次は冒険も足してみなさい。上出来の次が見たいわ。']}
};
// --- My Closet review flavour （相談室， 2026-11-24 v13): the closet is
// Mirei's consultation room, the gacha is the real stage. Scores, tiers,
// bands, banners and FX are IDENTICAL in closet mode - only the review
// TEXT gets a closet layer, applied by the `done` wrapper in outfitReview:
//   1. the opening is replaced by a consultation framing (she knows the
//      player assembled the outfit himself and brought it to her),
//   2. a coaching note the gacha review never has is inserted before the
//      closing line, derived from the score internals (see closetCoachLine),
//   3. rage keeps its structure and its reason-first rant; only the
//      opening changes - she scolds a choice he DELIBERATELY made.
// Relief keeps its DAILY everyday-love framing: the closet layer wins the
// opening, DAILY wins the affection framing. All standing persona rules
// carry over unchanged (no confession, near-miss only, no superior markers
// at smitten/MAX, plain-register gradient, no stranger framing), including
// the pronoun gradient: あんた is the professional default, キミ leaks
// only at 90+ (flutter: an occasional slip, smitten: about half the
// address lines, MAX: predominant, daily praise: never).
const CLOSET_OPEN_LOW=['自分で組んできたのね。……ふーん、じゃあ正直に言うわよ。隠し事なしでね。','相談ね。……いいわ、見せて。自分で組んだコーデって、その人が出るのよ。','わざわざ持ってきたのね。……うん、正直に診るわよ。覚悟して聞きなさい。','自分で組んできたのね。……ふーん、じゃあ正直に言うわよ。','相談に来たからには、本音で言うわよ。……まず見せて。'];
const CLOSET_OPEN_MID=['自分で組んできたのね。……うん、相談は受け付けるわよ。見せて。','相談ね。……あら、自分でここまで組めるようになったの。','持ってきたのね。……いいわ、プロの目で診てあげる。','自分で組んだ一式ね。……ふふ、相談相手に私を選ぶセンスは認めるわ。'];
const CLOSET_OPEN_HIGH=['いつ覚えたの、こんな組み方。……教えた覚え、ないんだけど。','自分で組んできたの？　……ふーん、見ない間に上手くなったじゃない。','相談のつもりで来たの？　……この出来なら、太鼓判を押しに来たようなものね。','見せに来たのね。……うん、あんたの成長、ちゃんと出てるわよ。'];
const CLOSET_OPEN_BORED=['自分で組んできたのね。……平和な相談ね。まず見せて。','相談ね。……うん、破綻のない一式を持ってきたわね。','自分で組んだ普段着、見せに来たのね。……ふーん、正直に言うわよ。'];
const CLOSET_OPEN_FLUTTER=['相談のつもりで来たの？　……ごめん、今、仕事の顔が保ててないかも。','……わざわざ組んで、見せに来たの？　……うん、見てる。ドキドキしながら、見てる。','自分で組んできたのね。……待って、心臓の準備がまだなの。','見せに来たの？　……キミのセンス、今日は一段違うみたい。','相談ね。……ふふ、プロの顔で聞くつもりだったのに。無理そう。'];
const CLOSET_OPEN_SMITTEN=['……わざわざ組んで、見せに来たの？　……うん、見てる。ちゃんと見てるよ。','キミが自分で組んだの、これ。……すごい。ほんとにすごい。','相談、のつもりだった？　……ごめん、もう仕事の顔できないや。','……見せに来たの？　……うん。キミのセンス、今日は目が離せない。','自分で組んで、私に見せに来たの？　……ドキドキする。どうしてくれるの。'];
const CLOSET_OPEN_MAX=['……見せに来たの？　……うん。見てる。ずっと見てる。','キミが組んだの。……すごい。言葉、出ないや。','相談、もういいの。……キミの隣、空いてる？','……わざわざ、私のために組んだの？　……うん、察して。言わない。'];
const CLOSET_OPEN_DAILY_PRAISE=['自分で組んだ普段着、見せに来たのね。……うん、こういうの、好きだよ。','相談ね。……普段着を自分でここまで組める人、なかなかいないわよ。','見せに来たのね。……ランウェイじゃないけど、毎日の顔してる。良い顔。'];
const CLOSET_OPEN_DAILY_FLUTTER=['普段着を、わざわざ見せに来たの？　……ドキドキしてる、私。','相談のつもりが、困ったな。……キミの普段着、目が離せないの。','自分で組んだ普段着で、こんなにドキドキさせるなんて。……反則だよ。'];
const CLOSET_RAGE_OPEN_MILD=['自分で選んで、これ？　……まず、そこよ、そこ。理由、言うわよ。','わざわざ組んで持ってきたのね。……その一点だけは、見逃せないわ。','相談に来たからには正直に言うわよ。……そこ、ダメ。理由はこれ。'];
const CLOSET_RAGE_OPEN_HOT=['わざわざ選んでこれ？　……ふざけないで。理由から言うわよ。','自分で組んで、自信満々で持ってきたの？　……信じられない。まず理由、聞きなさい。','相談？　……これは説教の案件ね。理由、一個ずつ言うわよ。'];
// Stage-nod closings (v13 value differentiation): in closet flutter /
// smitten only, the closing line OCCASIONALLY gestures at the real stage -
// a chance high score in the gacha is the rarer, more valuable event.
// Sparing by construction (one slot in five in outfitReview's done()).
const CLOSET_STAGE_CLOSE=['これを本番で引いたら、どうなるか……分かってる？','今日は相談。本番でこれが出たら……その時は、もっとすごいことになるよ。','偶然の一式でこれが出たら、伝説。……本番でも待ってるから。'];
// Coaching notes by clash kind (plain words only - no axis names, no
// numbers; each names the actual problem the engine found and the kind of
// piece that would lift it).
const CLOSET_COACH_KIND={
 pattern:['あとは柄の置き場。どっちか一品、無地の子に替えてみて。それだけで喧嘩が止むわ。','直すなら柄同士の距離。主張の強い柄を一品だけにして、他は静かな子に替えてみて。'],
 season:['あとは季節の足並み。上の防寒ぶりか下の涼しさ、どっちか寄せてみて。','直すなら季節感。寒い側か涼しい側、一品だけ季節を合わせてみて。'],
 volume:['あとはボリュームの置き場。膨らむ側を一品、細身の子に替えてみて。','直すなら上下の膨らみ配分。片方をすっきりさせると、全体が息をするわ。'],
 statement:['あとは主役の数。一人だけ残して、他は脇役の子に替えてみて。','直すなら主張の配分。一番見せたい一品を決めて、周りは静かな子にしてみて。'],
 dressmix:['あとは格の足並み。靴か服、どっちかの格をもう片方に寄せてみて。','直すなら温度差。きれいな側か部屋着側か、一品だけ格を合わせてみて。'],
 practical:['あとは外出着の芯。実用品を一品、ちゃんと服の顔をした子に替えてみて。','直すなら生活感の濃さ。便利な子を一品減らして、着るための一品に替えてみて。'],
};
// Nothing-to-fix notes for 95+ closet outfits: the coaching slot turns
// into "wear it on the real stage" (plain register; MAX = キミ-led).
const CLOSET_COACH_NONE=['直すところ、ない。……本番で着て。そのまま、世に出して。','アドバイス？　……ないよ。キミのセンス、完成してる。','直す場所、探したの。……なかった。本番で着て。'];
const CLOSET_COACH_NONE_MAX=['直すところ、ない。……本番で着て。お願い。','アドバイスは、ない。……キミ、そのままでいて。','何も直さなくていい。……うん、本番で着て。'];
// The coaching note, derived from the actual score internals so the advice
// is TRUE for this outfit: the engine's own clash kinds first, then its
// worst pair, then its weakest non-luxury axis (appeal names the weakest
// piece's slot). 95+ outfits get the nothing-to-fix note instead.
function closetCoachLine(items,score,pick){
 if(score.overall>=100)return pick(CLOSET_COACH_NONE_MAX,71);
 if(score.overall>=95)return pick(CLOSET_COACH_NONE,71);
 const kinds=personaKindsOf(score.reasons.minus);
 for(const k of kinds)if(CLOSET_COACH_KIND[k])return pick(CLOSET_COACH_KIND[k],73);
 if(score.reasons.worstPair)return pick([
  'あとは'+score.reasons.worstPair+'の呼吸。片方を、もう片方に寄せた色・形の子に替えてみて。',
  '直すなら'+score.reasons.worstPair+'。ここが一番他人行儀なの。片方を寄せてみて。',
 ],75);
 const axis=score.reasons.worstAxisNonLux;
 if(axis==='appeal'){
  let wi=0;items.forEach((it,i)=>{if(s2attr(it)[12]<s2attr(items[wi])[12])wi=i;});
  return pick([
   'あとは'+labels[wi]+'。今の子は脇役すぎるの。少しだけ主張する子に替えてみて。',
   '直すなら'+labels[wi]+'。地味な一点を、少しだけ主張する子に替えてみて。',
  ],77);
 }
 if(axis==='color')return pick(['あとは色の置き場。どこか一品、全体の色に寄せた子に替えてみて。喧嘩が減るわ。','直すなら色の足並み。一品だけ、中心の色に近い子に替えてみて。'],77);
 if(axis==='silhouette')return pick(['あとは上下のボリューム配分。膨らむ側を一品、細身の子に替えてみて。','直すなら形の強弱。片方をすっきりさせると、全体の線が締まるわ。'],77);
 if(axis==='style')return pick(['あとはテイストの足並み。一品、中心の系統に寄せた子に替えてみて。','直すなら方向性。ばらけた一品を、中心の系統の子に替えてみて。'],77);
 return pick(['あとは主役の決め方。一番見せたい一品を決めて、他を脇に回してみて。','直すなら完成度。主役を一人に絞ると、全体が急に締まるわ。'],77);
}
// ===== v14: review length variance (WS2) + Mirei's memory (WS3) =====
// Every line below obeys the standing text rules: no internal axis names or
// numerals in her speech, no direct confession (near-miss only), no band
// signature words, no superior-register words, no stranger framing,
// あんた default pronoun.
const SHORT_ONE_BORED=[ // very-low plain outfit, SHORT mode: one dry verdict
 '……帰って。事件、なかったわね。',
 '平和ね。……何も起きてないわよ。',
 '悪くないわよ。ただ、今日はそれだけ。',
 '破綻はないわよ。……事件もないけどね。'];
const SHORT_ONE_SMITTEN=[ // smitten, SHORT mode: one plain unguarded line
 '……すごい。ドキドキが止まらないよ。',
 'ねえ、見て。……私、ドキドキしてる。',
 '言葉が出ないの。……すごい、しか言えないよ。',
 '……参った。完敗だよ、もう。'];
// LONG mode: one extra observation line before the close. __ITEM2__ is a
// second named item; lines without it are item-free asides.
const EXTRA_PRAISE=[
 'あと、__ITEM2__も地味に効いてるのよ。脇の仕事が上手いじゃない。',
 '__ITEM2__の置き方も、私は好きよ。全体の格を上げてるわ。',
 '細部まで気が回ってるのよ。こういう一式は、近くで見るともっと良いの。'];
const EXTRA_FLUTTER=[
 'あと、__ITEM2__ね。……つい目がいくのよ。服の話よ？',
 '__ITEM2__も効いてるの。……褒めすぎ？　自覚はあるわ。',
 '……ねえ、今日は褒めすぎかも。でも、本当のことしか言ってないわよ。'];
const EXTRA_SMITTEN=[
 'あと、__ITEM2__。……それも含めて、全部ツボなの。',
 '__ITEM2__まで素敵なんて、どうしてくれるの。ドキドキが増えるじゃない。',
 '……ねえ、もう少しだけ見せて。お願い。'];
const EXTRA_MAX=[
 'あと、__ITEM2__も、すごいの。……全部、すごい。',
 '……うん。もう少し、ここにいて。'];
const EXTRA_BAND=[ // band reviews: no signature words, no rage words
 'あと、__ITEM2__の置き方も見ておいて。地味に効いてるわ。',
 '__ITEM2__も、脇でちゃんと仕事してるのよ。',
 '細部は、近くで見るともっと伝わるのよ。'];
const EXTRA_BORED=[
 'あと、__ITEM2__ね。脇役としては、真面目に働いてるわよ。',
 '__ITEM2__が頑張ってるのは伝わるのよ。他が静かすぎるだけで。',
 '近くで見れば、悪くない作りはしてるのよ。遠目が平和すぎるだけで。'];
const EXTRA_SCOLD=[ // scold/exasperated: never Lv2/Lv3 rage markers
 'あと、__ITEM2__。一品としては悪くないのよ。置き場所が悪いの。',
 '一品ずつは悪くないのよ。全部、置き場所が悪いの。'];
const EXTRA_DAILY=[
 'あと、__ITEM2__も毎日の味方ね。派手じゃないけど、頼れる顔よ。',
 '毎日の服って、こういう地味な確かさの積み重ねなのよ。'];
// --- Mirei's memory (WS3): direction only, never numerals ---
const MEM_CMP_UP=[
 '前回より上がったじゃない。……ちゃんと見てるのよ、私は。',
 'この前より良くなってるわね。積み重ね、嫌いじゃないわよ。'];
const MEM_CMP_DOWN=[
 'この前はもっと良かったわよ。……何か、迷ってた？',
 '前回のほうが冴えてたわね。今日は、少し慎重すぎたかも。'];
const MEM_CMP_TIE=[
 '前回と並ぶくらいね。安定してるじゃない、あんた。',
 'この前と互角ね。波がないの、嫌いじゃないわよ。'];
const MEM_REPEAT=[
 'また__SLOT__？　……お気に入りなのね、あんたの。',
 '__SLOT__、また連れてきたわね。……まあ、似合うから許すけど。'];
const MEM_STREAK_HI=[
 '最近、冴えてるわね。……私も、ちょっと嬉しいのよ。',
 '良い流れが続いてるじゃない。波に乗ってるわね、あんた。'];
const MEM_STREAK_LO=[
 '最近、こういうのが続いてるわね。……一度、基本に戻りましょうか。',
 '続いてるわね、この感じ。……ねえ、焦ってない？'];
const MEM_MILESTONE=[
 '図鑑、だいぶ揃ってきたじゃない。……集めるのも、才能なのよ。',
 'コレクションが増えたわね。あんたのクローゼット、育ってるじゃない。'];
const MEM_FIRST_SSR=[
 '……ついに最高レア、引いたわね。今日は記念日よ。',
 '初めての最高レアね。……私も、ちょっと誇らしいのよ。'];
const MEM_CLOSET_UP=[
 '前回の相談より上がってるじゃない。……ちゃんと直してきたのね。',
 'この前の相談のときより、良くなってるわよ。聞く耳、あるじゃない。'];
const MEM_CLOSET_DOWN=[
 '前回の相談のほうが良かったわよ。……何を変えたの？',
 'この前のほうが冴えてたわね。今日は少し、欲張りすぎかも。'];
const MEM_CLOSET_TIE=[
 '前回の相談と互角ね。安定感はあるわよ、あんた。',
 'この前と並ぶくらいね。地力はついてるわよ。'];
const MEM_GATE=[1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0]; // 9/20 = 45%
const MEM_THRESHOLDS=[25,50,100,200,400,800];

function outfitReview(items,score,mode){
 if(!score||!score.v2||!score.reasons){
  return ['あら、今日は採点表が届いてないのよ。組み合わせだけ見せてちょうだい。'];
 }
 // Closet mode (v13): explicit 'closet' argument wins; the closet judge
 // path instead sets reviewSource='closet' around its finish() call.
 // Default is the gacha voice, byte-identical to v12.
 const closet=mode?mode==='closet':(typeof reviewSource!=='undefined'&&reviewSource==='closet');
 const r=score.reasons;
 const hash=items.reduce((h,it)=>Array.from(String(it.id||it.name)).reduce((a,c)=>(Math.imul(a,31)+c.charCodeAt(0))>>>0,h),7);
 // salt-decorrelated deterministic pick (a plain hash+salt stride makes the
 // opening/point/closing choices move in lockstep and collapses variety)
 const pick=(arr,salt)=>arr[(Math.imul(hash^Math.imul((salt||0)+1,0x9E3779B1),0x85EBCA6B)>>>0)%arr.length];
 const heroRef=r.hero?r.hero.brand+'の'+reviewShortName(r.hero.name):null;
 // Hero framing rule: a small accessory (accessory slot / socks) is never the
 // outfit's "center" - it gets a supporting mention, and the priciest main
 // garment (tops/bottoms/shoes) takes the center framing instead.
 const heroItem=r.hero?items.find(it=>it.brand===r.hero.brand&&it.name===r.hero.name):null;
 const heroMinor=!!heroItem&&(items.indexOf(heroItem)===4||/靴下|ソックス/.test(heroItem.name));
 const mainItem=items.slice(0,3).reduce((a,b)=>b.price>a.price?b:a);
 const centerRef=heroMinor?(mainItem.brand+'の'+reviewShortName(mainItem.name)):heroRef;
 let colorDesc=null;
 if(typeof s2attr==='function'){
  const strong=[],seen=new Set();
  for(const it of items){ const a=s2attr(it); if(a&&a[0]&&COLOR_FAMS[a[0]]&&![1,2,3,4,5,14,16].includes(a[0])&&!seen.has(a[0])){seen.add(a[0]);strong.push(COLOR_FAMS[a[0]]);} }
  if(strong.length)colorDesc=strong.slice(0,2).join('と')+'の色使い';
 }
 const kinds=personaKindsOf(r.minus);
 const minusKind=kinds[0]||null;
 const plusKind=reviewPlusKindOf(r.plus);
 const bonusBrand=(score.bonuses||[]).find(b=>b[2]==='brand');
 const bonusStyle=(score.bonuses||[]).find(b=>b[2]==='style');
 const offense=personaOffense(items,score);
 const tier=personaTier(score,offense);
 // Uniformly strong set (WS4 guard): 4+ pieces of one brand, every piece
 // SR or above. For such a set, "the rest can't keep up" is false
 // evidence - the bored point pool and the bored LONG extra exclude
 // weak-link claims when this holds.
 const uniformStrong=(()=>{ try{
   if(typeof s2tier!=='function')return false;
   const bc={}; for(const it of items) bc[it.brand]=(bc[it.brand]||0)+1;
   return Math.max(...Object.values(bc))>=4&&items.every(it=>s2tier(it)>=2);
 }catch{ return false; } })();
 // Closet flavour layer (see the CLOSET_* pools above): swap the opening
 // for a consultation framing and insert the coaching note before the
 // closing line. Rage keeps its lines; only its opening changes.
 // --- v14 length modes (WS2): seeded from the outfit hash, so the same
 // outfit+state always yields the same review shape. SHORT 6/50 (12%),
 // LONG 5/50 (10%), STANDARD otherwise. Rage keeps its mandated structure
 // at every level: no compression, no extension.
 const lenMode=pick(['S','S','S','S','S','S','L','L','L','L','L','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','','',''],91);
 const family=score.relief&&(tier==='praise'||tier==='flutter')?'daily':(tier.startsWith('band')?'band':tier);
 const extraLine=()=>{
  const pools={praise:EXTRA_PRAISE,approve:EXTRA_PRAISE,flutter:EXTRA_FLUTTER,smitten:score.overall>=100?EXTRA_MAX:EXTRA_SMITTEN,band:EXTRA_BAND,bored:EXTRA_BORED,scold:EXTRA_SCOLD,exasperated:EXTRA_SCOLD,daily:EXTRA_DAILY};
  const pool=pools[family];if(!pool)return null;
  let line=pick(pool,93);
  if(family==='bored'&&uniformStrong&&/静かすぎる|ついてきてない/.test(line))line=pick(pool.filter(l=>!/静かすぎる|ついてきてない/.test(l)),93);
  if(!line.includes('__ITEM2__'))return line;
  const others=items.filter(it=>it!==heroItem&&!/\d/.test(reviewShortName(it.name)));
  if(!others.length)return null;
  const it2=pick(others,95);
  return line.replace('__ITEM2__',it2.brand+'の'+reviewShortName(it2.name));
 };
 const applyLength=ls=>{
  if(tier==='rage'||ls.length<3)return ls;
  if(lenMode==='S'){
   // 100 points keeps a two-line minimum (MAX opening + MAX closing):
   // the one-liner form is reserved for 95-99 smitten and bored.
   if(tier==='smitten'&&score.overall<100)return [pick(SHORT_ONE_SMITTEN,97)];
   if(tier==='bored'&&score.overall<30)return [pick(SHORT_ONE_BORED,97)];
   return [ls[0],ls[ls.length-1]];
  }
  if(lenMode==='L'){const ex=extraLine();if(ex)ls.splice(ls.length-1,0,ex);}
  return ls;
 };
 // --- v14 memory (WS3): at most one line, only when its factual
 // precondition holds in the live game state, seeded at ~45% of eligible
 // reviews. Direction only - never numerals. Fresh state => no candidates.
 const memoryLine=()=>{
  const st=(typeof state!=='undefined'&&state)?state:null;
  if(!st)return null;
  // No shared history yet => no memory at all (fresh state stays silent).
  if(!closet&&(st.count||0)<1)return null;
  const cands=[];
  const cur=(typeof current!=='undefined')?current:null;
  const lastG=Array.isArray(st.recent)&&st.recent.length?st.recent[0]:null;
  const sameAsLast=!!(lastG&&cur&&lastG.code===cur);
  if(closet){
   if((st.closetCount||0)>=1&&typeof st.closetLast==='number'){
    const d=score.overall-st.closetLast;
    cands.push(d>0?pick(MEM_CLOSET_UP,101):d<0?pick(MEM_CLOSET_DOWN,101):pick(MEM_CLOSET_TIE,101));
   }
  }else if(lastG&&!sameAsLast&&typeof lastG.score==='number'){
   const d=score.overall-lastG.score;
   cands.push(d>0?pick(MEM_CMP_UP,101):d<0?pick(MEM_CMP_DOWN,101):pick(MEM_CMP_TIE,101));
   if(score.overall>=85&&lastG.score>=85)cands.push(pick(MEM_STREAK_HI,103));
   if(score.overall<40&&lastG.score<40)cands.push(pick(MEM_STREAK_LO,103));
  }
  // repeat item: seen in a recent outfit (by slot index) or owned 3+ times
  const recentKeys=new Set();
  if(Array.isArray(st.recent))for(const rec of st.recent.slice(0,3)){
   if(cur&&rec&&rec.code===cur)continue;
   const m=/^[gn]((?:\d{1,3}\.){4}\d{1,3})$/.exec(String(rec&&rec.code||''));
   if(m)m[1].split('.').forEach((v,s)=>recentKeys.add(s+':'+Number(v)));
  }
  let repSlot=-1;
  for(let s=0;s<items.length;s++){
   const idx=(typeof catalog!=='undefined'&&Array.isArray(catalog[s]))?catalog[s].indexOf(items[s]):-1;
   if(idx>=0&&recentKeys.has(s+':'+idx)){repSlot=s;break;}
   if(((st.found&&st.found[itemKey(items[s])])||0)>=3){repSlot=s;break;}
  }
  if(repSlot>=0)cands.push(pick(MEM_REPEAT,105).replace('__SLOT__',labels[repSlot]));
  if(!closet){
   const owned=Object.keys(st.found||{}).length;
   const freshN=items.filter(it=>!(st.found&&st.found[itemKey(it)])).length;
   if(freshN>0&&MEM_THRESHOLDS.some(t=>owned<t&&owned+freshN>=t))cands.push(pick(MEM_MILESTONE,107));
   const hasTop=items.some(it=>{
    const rk=(typeof rank==='function')?rank(it):-1;
    return rk===3||(rk<0&&it.price>=150000);
   });
   if((st.ssr||0)===0&&hasTop)cands.push(pick(MEM_FIRST_SSR,109));
  }
  if(!cands.length)return null;
  if(!pick(MEM_GATE,111))return null;
  return pick(cands,113);
 };
 const applyMemory=ls=>{
  if(tier==='rage'||score.overall>=100||ls.length<2)return ls;
  const line=memoryLine();
  if(!line)return ls;
  ls.splice(ls.length-1,0,line);
  return ls;
 };
 const done=ls=>{
  ls=applyLength(ls);
  if(closet){
   if(tier==='rage'){ls[0]=pick(offense&&offense.level<=1?CLOSET_RAGE_OPEN_MILD:CLOSET_RAGE_OPEN_HOT,31);return applyMemory(ls);}
   let key;
   if(score.relief&&tier==='praise')key='dailyPraise';
   else if(score.relief&&tier==='flutter')key='dailyFlutter';
   else if(tier==='smitten')key=score.overall>=100?'max':'smitten';
   else if(tier==='flutter')key='flutter';
   else if(tier==='bored')key='bored';
   else if(score.overall>=80)key='high';
   else if(score.overall>=60)key='mid';
   else key='low';
   const pools={low:CLOSET_OPEN_LOW,mid:CLOSET_OPEN_MID,high:CLOSET_OPEN_HIGH,bored:CLOSET_OPEN_BORED,flutter:CLOSET_OPEN_FLUTTER,smitten:CLOSET_OPEN_SMITTEN,max:CLOSET_OPEN_MAX,dailyPraise:CLOSET_OPEN_DAILY_PRAISE,dailyFlutter:CLOSET_OPEN_DAILY_FLUTTER};
   if(ls.length===1){
    // SHORT one-liner base: keep the verdict line as the closing; the
    // consultation opening and the coaching note frame it.
    ls=[pick(pools[key],33),closetCoachLine(items,score,pick),ls[0]];
   }else{
    ls[0]=pick(pools[key],33);
    ls.splice(ls.length-1,0,closetCoachLine(items,score,pick));
    if((key==='flutter'||key==='smitten')&&pick([0,1,2,3,4],37)===0)ls[ls.length-1]=pick(CLOSET_STAGE_CLOSE,39);
   }
  }
  return applyMemory(ls);
 };
 const plainBase=score.cls==='plain';
 const lines=[];
 // specific praise material, spoken: fact candidates keyed to this outfit
 const factCandidates=()=>{
  const cands=[];
  if(plusKind&&PERSONA_PLUS_V[plusKind])for(const p of PERSONA_PLUS_V[plusKind])cands.push(p);
  if(r.bestPair)cands.push(r.bestPair+'の合わせ方が上手い');
  if(colorDesc)cands.push(colorDesc+'が全体を締めてる');
  if(bonusBrand)cands.push(bonusBrand[3]+'で揃えた安心感がある');
  if(bonusStyle)cands.push('テイストの揃い方が気持ちいい');
  return cands;
 };
 const priceAngle=score.tier==='cheap'?'この値段でこの仕上がり、計算が上手すぎる':score.tier==='mid'?'値段と見た目がちゃんと釣り合ってる':'高いだけのことはある。値段に負けてない';
 const minusPhrase=minusKind&&PERSONA_MINUS_V[minusKind]?pick(PERSONA_MINUS_V[minusKind],2):null;
 const worstLine=()=>r.worstPair?pick(['特に'+r.worstPair+'。ここ、完全に他人行儀なのよ。','特に'+r.worstPair+'、まだ初対面同士の顔してるわよ。','特に'+r.worstPair+'。ここが一番の喧嘩どころよ。','特に'+r.worstPair+'。ここだけ別の現場なのよ。','特に'+r.worstPair+'、呼吸が合ってないわよ。合わせ直しなさい。'],2):null;
 // template fillers for the DAILY / BAND point lines
 const factStr=(()=>{const c=factCandidates();return c.length?pick(c,2):'全体のバランスは取れてる';})();
 const minusStr=minusPhrase||(r.worstPair?'特に'+r.worstPair+'の呼吸が合ってない':'全体の方向がそろってない');
 const fillT=tpl=>tpl.replace(/__HERO__/g,centerRef||'').replace(/__FACT__/g,factStr).replace(/__MINUS__/g,minusStr);
 if(tier==='rage'){
  const lv=offense.level,list=offense.list;
  if(lv===1){
   lines.push(pick(RAGE1_OPEN,1));
   lines.push(personaRant(list[0],false,pick,20));
   lines.push(pick(plainBase?RAGE1_CLOSE_PLAIN:RAGE1_CLOSE,3));
  }else if(lv===2){
   lines.push(pick(RAGE2_OPEN,1));
   lines.push(personaRant(list[0],true,pick,20));
   lines.push(list[1]?personaRant(list[1],false,pick,22):pick(RAGE2_EXTRA,22));
   lines.push(pick(RAGE2_CLOSE,3));
  }else{
   lines.push(pick(RAGE3_OPEN,1));
   lines.push(personaRant(list[0],true,pick,20));
   lines.push(list[1]?personaRant(list[1],true,pick,22):pick(RAGE3_MID,22));
   lines.push(list[2]?personaRant(list[2],false,pick,24):pick(RAGE3_MID,24));
   lines.push(pick(RAGE3_EXTRA,26));
   lines.push(pick(RAGE3_CLOSE,3));
  }
  return done(lines);
 }
 // DAILY relief pools take precedence at 85+ (the score bands stop at 84,
 // and a relieved outfit's praise is everyday love, not runway love). This
 // check must run BEFORE the standard flutter branch below.
 if(score.relief&&tier==='praise'){
  lines.push(pick(DAILY_PRAISE_OPEN,1));
  lines.push(fillT(pick(DAILY_PRAISE_POINT,2))+(heroMinor?(' '+heroRef+'も、脇でちゃんと効いてるのよ。'):''));
  lines.push(pick(DAILY_PRAISE_CLOSE,3));
  return done(lines);
 }
 if(score.relief&&tier==='flutter'){
  lines.push(pick(DAILY_FLUTTER_OPEN,1));
  lines.push(fillT(pick(DAILY_FLUTTER_POINT,2))+(heroMinor?(' '+heroRef+'も、脇でちゃんと効いてるのよ。'):''));
  lines.push(pick(DAILY_FLUTTER_CLOSE,3));
  return done(lines);
 }
 if(tier==='smitten'){
  // score 100 = MAX: she stops reviewing and speaks plainly, as an equal -
  // and still never confesses (see the SMITTEN voice rules above).
  const maxed=score.overall>=100;
  lines.push(pick(maxed?SMITTEN_MAX_OPEN:SMITTEN_OPEN,1));
  const fact=pick([...factCandidates(),priceAngle],2);
  const gush=[
   centerRef?('推しは'+centerRef+'ね。私も同じの欲しい……本気で言ってるよ。'):null,
   centerRef?('その'+centerRef+'、私にちょうだい。……冗談じゃなくて。'):null,
   fact+'の。もう、褒める言葉が足りないよ。',
   '色も形も全部ツボなの。私の好み、盗み見た？',
   priceAngle+'。今日のあんた見て、ドキドキし直した。',
   'ねえ、センスって努力じゃ買えないんだよ。あんた、持ってる側だね。',
   centerRef?('その'+centerRef+'、選んだあんたの目がすごいの。……服の話だよ、服の。'):null,
   'ねえ、その一式、私にも選んで？　……お願い、真剣に。',
   'あんたのセンスに嫉妬してるの、私。プロなのにね。',
   centerRef?('その'+centerRef+'、近くで見せて。……もっと近く。'):null,
   centerRef?('推しは'+centerRef+'。……本当の推しは、言わない。察して。'):null,
   'ねえ、キミのセンスに惚れたの。……いえ、訂正は、しない。察して。',
   centerRef?('その'+centerRef+'、あんたが選ぶとこんなに輝くんだね。持ち主の目って、大事だね。'):null,
   'キミって人、もっと知りたいな。……服の話から、逸れすぎかな。ふふ。',
  ].filter(Boolean);
  const maxGush=[
   centerRef?('推しは'+centerRef+'……いえ、訂正。推しは、言わないの。察して。'):null,
   'すごいの、ほんとに。どこを見ても、すごいしか出てこない。',
   'ねえ、あんたのセンス、独占したい。……他の誰にも、見せたくないくらい。',
   centerRef?('その'+centerRef+'が主役？　違うの。今日の主役は、選んだキミだと思う。'):null,
  ].filter(Boolean);
  lines.push(pick(maxed?maxGush:gush,2)+(heroMinor?(' '+heroRef+'まで脇で効いてるなんて、抜かりないね。'):''));
  lines.push(pick(maxed?SMITTEN_MAX_CLOSE:SMITTEN_CLOSE,3));
  return done(lines);
 }
 if(tier==='flutter'){
  lines.push(pick(FLUTTER_OPEN,1));
  const fact=pick([...factCandidates(),priceAngle],2);
  const warm=[
   centerRef?('推しは'+centerRef+'ね。……私も欲しいくらいよ。内緒ね。'):null,
   centerRef?('その'+centerRef+'の選び方、センスが光ってるのよ。……ちょっと、ドキッとしたわ。'):null,
   fact+'のよ。……ねえ、褒めすぎ？　自覚はあるわよ。',
   priceAngle+'。……キミ、今日は一段違うわね。',
   centerRef?('推しは'+centerRef+'。……と、それを選んだあんた。順番は内緒ね。'):null,
   'ねえ、その選び方。……あんたのそういうところ、もっと知りたくなるわね。仕事抜きで。',
   '褒めてるのは服だけじゃないのよ。……今のは、忘れて。',
  ].filter(Boolean);
  lines.push(pick(warm,2)+(heroMinor?(' '+heroRef+'まで脇で効いてるなんて、抜かりないわね。'):''));
  lines.push(pick(FLUTTER_CLOSE,3));
  return done(lines);
 }
 // Mid-range bands (30-84, non-plain): a distinct voice per band.
 if(tier.startsWith('band')){
  const bp=BAND_POOLS[Number(tier.slice(4))][(score.cls==='dasai'||score.cls==='wild_fail')?'sharp':'std'];
  lines.push(pick(bp.open,1));
  lines.push(fillT(pick(bp.push,2)));
  lines.push(pick(bp.close,3));
  return done(lines);
 }
 if(tier==='praise'){
  lines.push(pick(PRAISE_OPEN,1));
  const fact=pick([...factCandidates(),priceAngle],2);
  lines.push(centerRef?('推しは'+centerRef+'ね。'+fact+'のよ。'+(heroMinor?heroRef+'も、脇でちゃんと効いてるのよ。':'')):(fact+'のよ。'));
  lines.push(pick(PRAISE_CLOSE,3));
  return done(lines);
 }
 if(tier==='approve'){
  lines.push(pick(APPROVE_OPEN,1));
  const fact=pick([...factCandidates(),priceAngle],2);
  lines.push(centerRef?('中心は'+centerRef+'ね。'+fact+'のよ。'+(heroMinor?heroRef+'も、脇でちゃんと効いてるのよ。':'')):(fact+'のよ。'));
  lines.push(pick(APPROVE_CLOSE,3));
  return done(lines);
 }
 if(tier==='bored'){
  const bn=personaBand(score.overall);
  lines.push(pick(bn?BORED_BAND[bn].open:((score.tier==='high'||score.tier==='lux')?BORED_OPEN_RICH:BORED_OPEN),1));
  if(heroMinor){
   lines.push(pick([
    '効いてるのは'+heroRef+'ね。脇役の仕事はちゃんとしてるわよ。',
    heroRef+'が頑張ってるのは伝わるわよ。良い脇役ぶりじゃない。',
    '脇の'+heroRef+'は効いてるわよ。あとは服の見せ場待ちね。',
   ],2));
  }else if(heroRef){
   const boredPts=[
    '普段着としては、'+heroRef+'を中心にちゃんと回ってるわよ。清潔感も足りてるじゃない。',
    heroRef+'が真面目に働いてるのは分かるのよ。他がついてきてないだけで。',
    '中心の'+heroRef+'は悪くないのよ。周りが静かすぎるだけで。',
   ].filter(l=>!(uniformStrong&&/ついてきてない|静かすぎる/.test(l)));
   lines.push(pick(boredPts,2));
  }else{
   const cands=factCandidates();
   lines.push(cands.length?(pick(cands,2)+'のよ。普段着の出来としては申し分ないのよ。'):'破綻はどこにもないのよ。着る人を選ばない、優しい一式じゃない。');
  }
  lines.push(pick(bn?BORED_BAND[bn].close:BORED_CLOSE,3));
  return done(lines);
 }
 if(tier==='exasperated'){
  lines.push(pick(EXASP_OPEN,1));
  lines.push(minusPhrase?minusPhrase+'。':(worstLine()||'一品ずつ見れば悪くないの。置き場所が喧嘩してるだけよ。'));
  lines.push(pick(EXASP_CLOSE,3));
  return done(lines);
 }
 // scold (dasai): colder and more cutting than before, still below rage Lv1
 lines.push(pick(SCOLD_OPEN,1));
 lines.push(minusPhrase?minusPhrase+'。':(worstLine()||'色も形も、みんな別々の方向を向いてるのよ。まとめ役がいないじゃない。'));
 lines.push(pick(SCOLD_CLOSE,3));
 return done(lines);
}

// --- Parameter bars (7 internal axes, plain-word labels) + bonus chips ---
const PARAM_DEFS=[['luxury','高級感'],['appeal','単体の魅力'],['color','色・柄の相性'],['silhouette','シルエット'],['style','統一感'],['complete','完成度'],['indiv','個性']];
function renderParams(score){
 const box=byId('params');if(!box)return;box.replaceChildren();
 if(!score||!score.v2||!score.axes)return;
 for(const [k,label] of PARAM_DEFS){
  const v=score.axes[k];if(v==null)continue;
  const row=document.createElement('div');row.className='paramRow';
  const s=document.createElement('span');s.textContent=label;
  const bar=document.createElement('div');bar.className='paramBar';
  const i=document.createElement('i');i.style.width=v+'%';if(v>=80)i.className='hi';bar.append(i);
  const b=document.createElement('b');b.textContent=v;
  row.append(s,bar,b);box.append(row);
 }
}
function renderBonusChips(score){
 const box=byId('bonusChips');if(!box)return;box.replaceChildren();
 ((score&&score.bonuses)||[]).forEach(([label,points],idx)=>{
  const c=document.createElement('span');c.className='bonusChip';c.style.animationDelay=(idx*90)+'ms';
  c.textContent=label+' +'+points;box.append(c);
 });
}
function rarityText(s,sp){
 const data=typeof estimates==='undefined'?null:estimates[resultMode];if(!data)return '';
 const high=s.overall>=75,tail=data.hist.reduce((n,v,i)=>n+((high?i>=s.overall:i<=s.overall)?v:0),0);
 const events=[[s.overall+'点'+(high?'以上':'以下'),tail],...sp.map(k=>[k,data.special[k]||0])].sort((a,b)=>a[1]-b[1]);
 const [name,n]=events[0];return resultMode+' · '+name+' '+(n>=10?'約'+(100*n/data.n).toLocaleString('ja-JP',{maximumFractionDigits:2})+'%':data.n.toLocaleString()+'回中'+n+'回（少数観測）');
}
function cue(tier){if(gentle())return;if(state.vibrate && tier>=2)navigator.vibrate?.(tier===3?[35,40,80]:35);
 if(!state.sound||!audioContext)return;try{const ctx=audioContext,osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=[260,392,523,784][tier];gain.gain.setValueAtTime(.05,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.24);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.25);}catch{}}
function resultExtras(items,s){
 // rage visual accent: heat the review block (and the persona badge) when
 // Mirei is angry - Lv1 warm edge, Lv2 hot, Lv3 red-hot frame.
 const rf=byId('reviewFull');
 if(rf){
  const off=(s&&s.v2&&s.reasons)?personaOffense(items,s):null;
  const lv=off?off.level:0;
  const loveTier=!lv&&(s&&s.v2&&s.reasons)?personaTier(s,null):'';
  rf.className=lv?('rageLv'+lv):(loveTier==='smitten'?'smittenLove':loveTier==='flutter'?'flutterLove':'');
  const det=rf.parentElement;
  if(det&&det.classList){det.classList.remove('rage1','rage2','rage3');if(lv)det.classList.add('rage'+lv);}
  // Emotion FX plan (2026-11-24): smitten -> gentle pink hearts, flutter ->
  // a few small hearts, rage Lv2 -> short screen shake, Lv3 -> shake + red
  // vignette pulse. No FX for praise/bored/scold/band tiers. game.js
  // finish() fires this only for a fresh draw (showEffects), never when a
  // shared/restored result is merely displayed.
  fxNow=lv>=3?{shake:3}:lv===2?{shake:2}:loveTier==='smitten'?{hearts:'hearts'}:loveTier==='flutter'?{hearts:'heartsSoft'}:null;
 }
 const total=sumPrice(items),sp=specials(items,s),title=titleFor(items,s);
 // Closet result differentiation (v13): a consultation must not look like
 // a draw result - it gets the 相談室 header mark, the fromCloset accent,
 // a consultation title, and NO chance-percentile line (a consultation
 // has no odds; the percentile is part of what makes a gacha high score
 // the valuable, recorded event). Gacha results render exactly as before.
 const isCloset=reviewSource==='closet';
 const cm=byId('closetMark');if(cm)cm.hidden=!isCloset;
 const rt=byId('resultTitle');if(rt)rt.textContent=isCloset?'相談室のコーデ':'今回のコーデ';
 const resEl=byId('result');if(resEl){if(resEl.classList)resEl.classList.toggle('fromCloset',isCloset);else resEl.className=isCloset?'fromCloset':'';}
 byId('honors').textContent=(isCloset?['ミレイの相談室',...sp]:[title,...sp]).join(' · ');byId('rarity').textContent=isCloset?'':rarityText(s,sp);
 byId('posterArea').replaceChildren();if(posterUrl){URL.revokeObjectURL(posterUrl);posterUrl='';}
 byId('moreResult').hidden=false;byId('favorite').textContent=state.stars.some(x=>x.code===current)?'★ 保存済み':'☆ お気に入り';
 const drawn=!!pendingRecord;let record='';
 if(drawn && (pendingRecord==='draw'||pendingRecord!==state.day)){
  if(pendingRecord!=='draw')state.day=pendingRecord;
  if(state.count&&s.overall>state.high)record='自己最高得点！';
  else if(state.count&&s.overall<state.low)record='自己最低得点！';
  state.high=Math.max(state.high??0,s.overall);state.low=Math.min(state.low??100,s.overall);
  state.max=Math.max(state.max??0,total);state.min=Math.min(state.min??Infinity,total);
  eventLog('completed',{mode:resultMode,ids:items.map(x=>x.id),brands:items.map(x=>x.brand),score:s.overall});const pack=verdict(items)[0];state.packs[pack]=(state.packs[pack]||0)+1;for(const x of items)if(productLink(x))eventLog('product_impression',{id:x.id});state.count++;state.ssr+=items.filter(x=>rank(x)===3).length;if(pack==='supergod')state.supergod=(state.supergod||0)+1;else if(pack==='god')state.god++;else if(pack==='brand')state.brandpack=(state.brandpack||0)+1;
  for(const x of items){const id=x.id||x.source;state.found[id]=(state.found[id]||0)+1;}
  if(!state.titles.includes(title))state.titles.push(title);
  state.recent.unshift({code:current,mode:resultMode,title,score:s.overall});state.recent.length=Math.min(state.recent.length,40);save();
 }
 if(opponent){const k=opponent.kind;const mine=k==='value'?total:s.overall,other=k==='value'?opponent.value:opponent.score;record+=' 対決相手 '+(k==='value'?yen(other):other+'点')+' · '+(drawn?(mine===other?'引き分け':(k==='low'?mine<other:mine>other)?'勝ち！':'今回は負け'):'次のパックで挑戦！');}
 byId('challengeStatus').textContent=record;pendingRecord='';refreshRecords();
}
// Fire the emotion FX planned by resultExtras (see fxNow). Hearts reuse
// game.js's existing particle field via celebrate(); the shake / red
// vignette are cheap CSS classes on <main> / a fixed overlay - no layout
// changes, no new assets. Called by game.js finish() for fresh draws only.
function firePersonaFx(){
 const fx=fxNow;fxNow=null;if(!fx)return;
 if(fx.hearts&&typeof celebrate==='function')celebrate(fx.hearts);
 if(fx.shake){
  const m=document.querySelector('main');
  if(m&&m.classList){m.classList.remove('fxShake2','fxShake3');void m.offsetWidth;m.classList.add(fx.shake>=3?'fxShake3':'fxShake2');setTimeout(()=>m.classList.remove('fxShake2','fxShake3'),750);}
  if(fx.shake>=3){const v=document.createElement('div');v.className='fxRagePulse';v.setAttribute('aria-hidden','true');document.body.append(v);setTimeout(()=>v.remove(),950);}
 }
}
// --- Catalog (図鑑): lazy render, acquired-first, search + incremental paging ---
let bookShown=50;
function bookData(){
 const mode=byId('bookFilter').value||'acquired';
 const q=(byId('bookSearch').value||'').trim().toLowerCase();
 const list=[];
 catalog.forEach((group,s)=>group.forEach(item=>{
  const n=state.found[item.id||item.source]||0;
  if(mode==='acquired'&&!n)return;
  if(mode==='missing'&&n)return;
  if(q&&!(item.brand+' '+item.name).toLowerCase().includes(q))return;
  list.push({item,slot:s,n});
 }));
 return list;
}
function bookCountsText(){
 const total=catalog.flat().length,owned=Object.keys(state.found).length;
 const per=tiers.map((t,ti)=>{let o=0,c=0;catalog.forEach(g=>g.forEach(x=>{if(rank(x)===ti){c++;if(state.found[x.id||x.source])o++;}}));return t+' '+o+'/'+c;});
 return '収集中 '+owned+'／'+total+' · '+per.join(' · ');
}
function renderBook(reset){
 if(!bookActivated)return; // never build DOM before the catalog view is first opened (v15)
 if(reset)bookShown=50;
 byId('bookCounts').textContent=bookCountsText();
 const list=bookData(),book=byId('book');book.replaceChildren();
 if(!list.length){const p=document.createElement('p');p.textContent=(byId('bookFilter').value||'acquired')==='acquired'&&!Object.keys(state.found).length?'まだ獲得した商品がありません。ガチャを引くと図鑑に集まります。':'条件に合う商品がありません。';book.append(p);}
 for(const e of list.slice(0,bookShown)){
  const d=document.createElement('button');d.className='bookItem rk'+rank(e.item);d.type='button';
  const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.alt='';img.src=e.item.img;crImg(img,e.slot);
  const tx=document.createElement('span');tx.className='bookTx';
  const b=document.createElement('b');b.textContent=e.item.brand;
  const nm=document.createElement('span');nm.textContent=displayItemName(e.item.name);
  const meta=document.createElement('small');meta.textContent=labels[e.slot]+' · '+yen(e.item.price)+(e.n?' · ×'+e.n:' · 未獲得');
  tx.append(rarEl(e.item),b,nm,meta);
  const tr=tagRowEl(e.item);if(tr)tx.append(tr);
  if(hasUnseenNew(e.item)){const nb=document.createElement('span');nb.className='newBadge';nb.textContent='NEW';tx.append(nb);}
  d.append(img,tx);
  d.onclick=()=>openDetail(e.item,e.slot,e.n);
  book.append(d);
 }
 const more=byId('bookMore');
 more.hidden=list.length<=bookShown;
 more.textContent='もっと見る（残り '+(list.length-bookShown)+' 件）';
}
// Style/system tag chips for selection-time display (closet picker, slot
// rows, catalog list): the item's primary 系統 (names[style]) plus its
// pattern / material tags from the same attrChips vocabulary the detail
// sheet uses - no new taxonomy, capped at 3, data order preserved.
function styleChips(item){
 const chips=[];
 if(typeof names!=='undefined'&&names&&names[item.style])chips.push(names[item.style]);
 if(typeof attrChips==='function'){
  for(const c of attrChips(item)){
   if(/^(柄|素材)：/.test(c))chips.push(c.replace(/^(柄|素材)：/,''));
   if(chips.length>=3)break;
  }
 }
 return chips.slice(0,3);
}
function tagRowEl(item){
 const chips=styleChips(item);
 if(!chips.length)return null;
 const row=document.createElement('span');row.className='tagRow';
 for(const c of chips){const t=document.createElement('span');t.className='tagChip';t.textContent=c;row.append(t);}
 return row;
}
// Rarity label element in the gacha cards' colour language (C, v13):
// N #afb1bd / R #8bd6ff / SR #e9acf9 / SSR #ffe077 (see .rar in style.css).
function rarEl(item){
 const r=document.createElement('span');r.className='rar rar'+rank(item);r.textContent=tiers[rank(item)];
 return r;
}
function refreshRecords(){
 const rec=byId('records');rec.replaceChildren();
 if(!state.count){const p=document.createElement('p');p.textContent='最初のパックを引くと記録が始まります。';rec.append(p);}
 else{
  const stats=[['パック数',state.count],['最高得点',state.high+'点'],['最低得点',state.low+'点'],['コーデ総額',yen(state.min)+' 〜 '+yen(state.max)],['SSR',state.ssr+'枚'],['GOD',state.god+'回'],['SUPER GOD',(state.supergod||0)+'回'],['BRAND',(state.brandpack||0)+'回'],['全身高額',(state.packs.jackpot||0)+'回'],['全身節約',(state.packs.bust||0)+'回'],['一点豪華',(state.packs.wild||0)+'回'],['図鑑',Object.keys(state.found).length+'／'+catalog.flat().length]];
  for(const [k,v] of stats){const d=document.createElement('div');d.className='stat';const s=document.createElement('small');s.textContent=k;const b=document.createElement('b');b.textContent=v;d.append(s,b);rec.append(d);}
  if(state.titles.length){const d=document.createElement('div');d.className='stat wide';const s=document.createElement('small');s.textContent='称号';const b=document.createElement('b');b.textContent=state.titles.join('、');d.append(s,b);rec.append(d);}
 }
 if(!viewSeen.mypage)return;
 const recent=byId('recent');recent.replaceChildren();
 for(const [prefix,rows] of [['★',state.stars],['履歴',state.recent]])for(const r of rows){
 const a=document.createElement('a');a.textContent=prefix+' · '+r.score+'点 '+r.title;a.href=r.code.includes('.')?'#v6-'+r.mode+'-'+r.code:(r.code.length===5?'#v4-':'#v3-')+r.code;recent.append(a);}
 renderBook(false);
}
// --- My Closet builder （マイクローゼット, 2026-11-24): assemble an outfit
// freely from OWNED items only, then have Mirei judge it with the SAME
// engine (scoreV2, relief + cap included) and the SAME result rendering
// (game.js finish: score, parameter bars, review open by default, emotion
// FX, banner). Free-build rules: no draw, no rarity rolls, no pack logic,
// nothing is recorded - closetJudgeItems leaves pendingRecord '' so
// resultExtras treats the result as a restore, and the collection and the
// draw counters are never touched. Deterministic: the outfit is encoded in
// `current` exactly like a drawn look, so the same 5 items always produce
// the same score and review. Mode lock: an item belongs to its mode pool;
// once any chosen item fixes the outfit's mode (men-only -> MEN, women-only
// -> WOMEN, unisex fits both), the picker and closetSet refuse the other
// mode's items. Reset clears the outfit and the lock together.
let closetSel=[null,null,null,null,null];
let closetPickSlot=-1;
function closetLockExcept(except){
 let lock=null;
 for(let s=0;s<5;s++){
  if(s===except)continue;
  const idx=closetSel[s];if(idx==null)continue;
  const g=catalog[s][idx].gender;
  if(g==='men')lock='MEN';else if(g==='women')lock='WOMEN';
 }
 return lock;
}
function closetLock(){return closetLockExcept(-1);}
function closetFits(item,lock){return !lock||item.gender==='unisex'||item.gender===(lock==='MEN'?'men':'women');}
function closetSet(slot,idx){
 const item=catalog[slot]&&catalog[slot][idx];
 if(!item)return false;
 if(!(state.found[itemKey(item)]>0))return false; // owned items only
 if(!closetFits(item,closetLockExcept(slot)))return false; // no MEN/WOMEN mixing
 closetSel[slot]=idx;return true;
}
function closetClear(slot){closetSel[slot]=null;}
function closetResetAll(){closetSel=[null,null,null,null,null];closetPickSlot=-1;}
function closetItems(){return closetSel.every(i=>i!=null)?closetSel.map((idx,s)=>catalog[s][idx]):null;}
function closetOwnedList(slot){
 const lock=closetLockExcept(slot);
 return catalog[slot].map((item,i)=>({item,i})).filter(e=>(state.found[itemKey(e.item)]||0)>0&&closetFits(e.item,lock));
}
function renderCloset(){
 const wrap=byId('closetSlots');if(!wrap)return;
 wrap.replaceChildren();
 closetSel.forEach((idx,s)=>{
  const row=document.createElement('div');row.className='closetRow';
  const lab=document.createElement('span');lab.className='closetLab';lab.textContent=labels[s];row.append(lab);
  if(idx==null){
   const t=document.createElement('span');t.className='closetEmpty';t.textContent='未選択';row.append(t);
  }else{
   const item=catalog[s][idx];
   if(row.classList)row.classList.add('rk'+rank(item));else row.className='closetRow rk'+rank(item);
   const img=document.createElement('img');img.src=item.img;img.alt='';crImg(img,s);row.append(img);
   const tx=document.createElement('span');tx.className='closetTx';
   const b=document.createElement('b');b.textContent=item.brand;
   const nm=document.createElement('span');nm.className='closetName';nm.textContent=displayItemName(item.name);
   const meta=document.createElement('small');meta.textContent=yen(item.price)+' · ×'+(state.found[itemKey(item)]||0);
   tx.append(rarEl(item),b,nm,meta);
   const tr=tagRowEl(item);if(tr)tx.append(tr);
   row.append(tx);
  }
  const btns=document.createElement('span');btns.className='closetBtns';
  const pick=document.createElement('button');pick.type='button';pick.textContent=idx==null?'選ぶ':'変更';pick.onclick=()=>openClosetPicker(s);btns.append(pick);
  const clr=document.createElement('button');clr.type='button';clr.textContent='クリア';clr.disabled=idx==null;clr.onclick=()=>{closetClear(s);renderCloset();};btns.append(clr);
  row.append(btns);
  wrap.append(row);
 });
 const lock=closetLock(),mode=byId('closetMode');
 if(mode)mode.textContent=lock?lock+' で統一中（他のモードは混ぜられません）':'';
 const judge=byId('closetJudge');if(judge)judge.disabled=!closetItems();
 renderClosetPicker();
}
function renderClosetPicker(){
 const box=byId('closetPicker');if(!box)return;
 if(closetPickSlot<0){box.hidden=true;box.replaceChildren();return;}
 const s=closetPickSlot,list=closetOwnedList(s);
 box.hidden=false;box.replaceChildren();
 const head=document.createElement('p');head.className='closetPickHead';head.textContent=labels[s]+'を選ぶ（所持アイテムのみ）';box.append(head);
 if(!list.length){
  const p=document.createElement('p');
  p.textContent=catalog[s].some(it=>(state.found[itemKey(it)]||0)>0)
   ?'いま組んでいるモードと合う所持アイテムがありません。リセットすると選び直せます。'
   :'この枠の所持アイテムはまだありません。ガチャを引いて手に入れましょう。';
  box.append(p);return;
 }
 for(const e of list){
  const d=document.createElement('button');d.className='bookItem rk'+rank(e.item)+(closetSel[s]===e.i?' closetChosen':'');d.type='button';
  const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.alt='';img.src=e.item.img;crImg(img,s);
  const tx=document.createElement('span');tx.className='bookTx';
  const b=document.createElement('b');b.textContent=e.item.brand;
  const nm=document.createElement('span');nm.textContent=displayItemName(e.item.name);
  const meta=document.createElement('small');meta.textContent=yen(e.item.price)+' · ×'+(state.found[itemKey(e.item)]||0);
  tx.append(rarEl(e.item),b,nm,meta);
  const tr=tagRowEl(e.item);if(tr)tx.append(tr);
  d.append(img,tx);
  d.onclick=()=>{if(closetSet(s,e.i)){closetPickSlot=-1;renderCloset();}};
  box.append(d);
 }
}
function openClosetPicker(s){closetPickSlot=closetPickSlot===s?-1:s;renderCloset();}
// --- Dedicated closet view (v13, playtest E): the closet is its own
// screen. openClosetView hides the whole main view (CSS: #appMain.closetOpen
// > *:not(#closetView) is display:none) and shows #closetView; the judging
// result is rendered INSIDE the closet view by physically moving the
// shared #result section into #closetResultSlot (byId lookups in game.js /
// extras.js are unaffected by the move), and closeClosetView puts it back
// at its original anchor, hidden. closetSel is module state, so the chosen
// outfit survives every view switch untouched.
let resultHome=null;
function placeResultInCloset(){
 const r=byId('result'),slot=byId('closetResultSlot');
 if(!r||!slot)return;
 if(!resultHome&&r.parentElement)resultHome={parent:r.parentElement,next:r.nextSibling||null};
 if(r.parentElement!==slot)slot.append(r);
}
function placeResultHome(){
 const r=byId('result');if(!r)return;
 if(resultHome&&resultHome.parent){
  if(resultHome.parent.insertBefore)resultHome.parent.insertBefore(r,resultHome.next);
  else if(resultHome.parent.append)resultHome.parent.append(r);
 }
}
function setClosetView(open){
 const m=byId('appMain'),v=byId('closetView');
 if(v)v.hidden=!open;
 if(m){if(m.classList)m.classList.toggle('closetOpen',open);else m.className=open?'closetOpen':'';}
}
// --- View router (v15): real screen separation. Exactly one view section
// is unhidden at a time; switching resets scroll to the top. On the real
// page every switch pushes a history entry ({cr,view,sub}) so the browser
// back button walks views (and the closet result sub-state) in order; the
// outfit hash finish() writes via replaceState is preserved because
// finish() re-stamps the entry with navHistState(). In the widget trial
// build (in-memory storage shim, no usable history) pushState is skipped
// entirely and in-app controls drive the same transitions directly.
function inWidget(){try{return !!window.__crMem;}catch{return false;}}
function navHistState(){return {cr:1,view:navState.view,sub:navState.sub};}
function pushNav(){
 if(inWidget()||typeof history==='undefined')return;
 try{history.pushState(navHistState(),'');histOK=true;}catch{histOK=false;}
}
function outfitHashPresent(){
 try{return typeof location!=='undefined'&&/^#v[1-6]-/.test(location.hash||'');}catch{return false;}
}
function activateBook(){if(bookActivated)return;bookActivated=true;renderBook(true);}
function applyView(){
 for(const name in VIEW_ELS){const el=byId(VIEW_ELS[name]);if(el)el.hidden=name!==navState.view;}
 setClosetView(navState.view==='closet');
 for(const name in TAB_ELS){
  const el=byId(TAB_ELS[name]);if(!el)continue;
  const on=name===navState.view;
  if(el.classList)el.classList.toggle('on',on);else el.className=on?'on':'';
  if(el.setAttribute)el.setAttribute('aria-current',on?'page':'false');
 }
 viewSeen[navState.view]=1;
 if(navState.view==='catalog'){
  if(bookActivated){const bc=byId('bookCounts');if(bc)bc.textContent=bookCountsText();}
  else activateBook();
 }
 if(navState.view==='mypage')refreshRecords();
 if(typeof window!=='undefined'&&window.scrollTo)window.scrollTo(0,0);
}
function showView(name,opts){
 opts=opts||{};
 if(!VIEW_ELS[name])name='home';
 if(name===navState.view&&navState.sub===null){applyView();return;}
 if(name==='closet')closetEnter();
 else if(navState.view==='closet')closetLeave();
 navState={view:name,sub:null};
 applyView();
 if(!opts.fromPop)pushNav();
}
function closetEnter(){closetShowBuilder();}
function closetLeave(){placeResultHome();const r=byId('result');if(r)r.hidden=true;}
// The ONE in-app back pattern (v15): a single "← もどる" at the top of a
// sub-flow. In the closet it returns from a judging result to the builder;
// the old second button (closet-head もどる that left the whole view) is
// gone - leaving a view is the tab bar's job now.
function closetShowBuilder(){
 const r=byId('result');
 if(r&&byId('closetResultSlot')&&r.parentElement===byId('closetResultSlot'))r.hidden=true;
 const bar=byId('closetResultBar');if(bar)bar.hidden=true;
 const b=byId('closetBuilder');if(b)b.hidden=false;
 renderCloset();
}
function closetShowResult(){
 const r=byId('result'),slot=byId('closetResultSlot');
 if(!r||!slot||r.parentElement!==slot)return;
 r.hidden=false;
 const bar=byId('closetResultBar');if(bar)bar.hidden=false;
 const b=byId('closetBuilder');if(b)b.hidden=true;
}
function popNavRecent(){return Date.now()-lastPopNavAt<600;}
function onPopState(e){
 lastPopNavAt=Date.now();
 const st=e&&e.state;
 let target;
 if(st&&st.cr&&VIEW_ELS[st.view])target={view:st.view,sub:st.sub||null};
 else target={view:outfitHashPresent()?'gacha':'home',sub:null}; // state replaced by finish() or the initial entry: infer from the outfit hash
 if(target.view==='closet'&&navState.view!=='closet')closetEnter();
 else if(target.view!=='closet'&&navState.view==='closet')closetLeave();
 navState={view:target.view,sub:target.sub};
 applyView();
 if(target.view==='closet'){if(target.sub==='result')closetShowResult();else closetShowBuilder();}
}
function syncGachaToHash(){
 // Deep back-chains can leave the URL naming a different outfit than the
 // one on screen; re-tapping the gacha tab re-renders the URL's outfit.
 if(typeof restore!=='function')return;
 try{
  const h=(typeof location!=='undefined'&&location.hash)||'';
  const cur=typeof current!=='undefined'?String(current):'';
  if(h&&cur&&!h.includes(cur))restore();
 }catch{}
}
function initRouter(){
 for(const name in TAB_ELS){
  const el=byId(TAB_ELS[name]);if(!el)continue;
  el.onclick=()=>{
   if(navState.view===name){if(name==='gacha')syncGachaToHash();if(typeof window!=='undefined'&&window.scrollTo)window.scrollTo(0,0);}
   else showView(name);
  };
 }
 const hd=byId('homeDraw');if(hd)hd.onclick=()=>{showView('gacha');if(typeof openPack==='function')openPack();};
 for(const [id,v] of [['homeToCatalog','catalog'],['homeToCloset','closet'],['homeToMypage','mypage']]){
  const el=byId(id);if(el)el.onclick=()=>showView(v);
 }
 if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('popstate',onPopState);
 // A shared / versus outfit in the URL belongs to the gacha view.
 navState={view:outfitHashPresent()?'gacha':'home',sub:null};
 applyView();
 if(!inWidget()&&typeof history!=='undefined'){try{history.replaceState(navHistState(),'');}catch{}}
}
function openClosetView(){showView('closet');}
function closeClosetView(){showView('home');}
// Prepare a closet judging: encode the outfit like a drawn look and point
// the shared result renderer at it WITHOUT marking it as a draw. Returns
// the items, or null while any slot is empty.
function closetJudgeItems(){
 const items=closetItems();if(!items)return null;
 current='n'+closetSel.join('.');resultMode=closetLock()||preferredMode();pendingRecord='';battle='';opponent=null;
 return items;
}
// Original slot pictograms for sharing without embedding a retailer photograph.
function garment(c,index,x,y,color){
 const paths=['M4 16 L18 9 Q24 18 30 9 L44 16 L38 26 L33 23 L33 42 L15 42 L15 23 L10 26 Z','M11 8 L36 8 L39 43 L27 43 L24 24 L21 43 L9 43 Z','M5 27 L15 15 L21 21 L28 24 L32 29 L42 30 L44 37 L5 37 Z','M8 22 L39 22 L41 41 L6 41 Z M15 22 C15 4 32 4 32 22','M6 30 Q6 12 23 12 Q39 13 38 30 L46 33 Q33 36 23 31 Z'];
 c.save();c.translate(x,y);c.scale(1.35,1.35);c.fillStyle=color;c.strokeStyle=color;c.lineWidth=2.5;const path=new Path2D(paths[index]);c.fill(path);c.stroke(path);c.restore();
}
async function poster(){
 const items=selected(),score=scoreLook(items),canvas=document.createElement('canvas');canvas.width=900;canvas.height=1240;
 const c=canvas.getContext('2d'),bg=c.createLinearGradient(0,0,900,1240);bg.addColorStop(0,'#faf7f1');bg.addColorStop(1,'#f1e8d2');c.fillStyle=bg;c.fillRect(0,0,900,1240);
 const line=(text,x,y,size,color='#1d1a16',max=800)=>{c.fillStyle=color;c.font='bold '+size+'px sans-serif';c.fillText(text,x,y,max);};
 line('CLOSET ROLL   /   COVER ISSUE',50,77,30,'#c8102e');line(titleFor(items,score),50,171,65);
 line(score.overall+' POINTS',50,271,77,'#c8102e');line(yen(sumPrice(items)),515,266,43,'#1d1a16',335);
 line(coverLine(items,score),50,334,32);
 items.forEach((x,i)=>{const y=377+i*114;c.fillStyle=['#fffdf8','#f3eee2'][i%2];c.fillRect(42,y,816,102);
 garment(c,i,58,y+17,['#c9ccd4','#bcd9ea','#e5b2ee','#f2d98c'][rank(x)]);line(tiers[rank(x)]+'   '+labels[i]+'   /   '+x.brand,144,y+34,24,['#6a6e7a','#0b6fae','#a723b8','#a87b00'][rank(x)],680);line(x.name,144,y+77,35,'#1d1a16',680);});
 line(specials(items,score).join(' · ')||resultMode+' EDITION',50,986,26,'#c8102e');line(rarityText(score,specials(items,score)),50,1032,24);
 const review=lookComment(items,score.balance);let row='',y=1080;for(const char of review){if(c.measureText(row+char).width>790){line(row,50,y,22);row='';y+=29;}row+=char;if(y>1138)break;}line(row,50,y,22);
 line(location.origin+location.pathname,50,1201,22,'#5d574b');
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)return;
 if(posterUrl)URL.revokeObjectURL(posterUrl);posterUrl=URL.createObjectURL(blob);
 const area=byId('posterArea'),img=new Image();img.alt='共有用コーデ表紙';img.src=posterUrl;
 const a=document.createElement('a');a.href=posterUrl;a.download='closet-roll.png';a.textContent='PNGを保存（スマホは画像の長押しも可）';area.replaceChildren(img,a);
 if(typeof File==='function'){const data={files:[new File([blob],'closet-roll.png',{type:'image/png'})]};if(navigator.canShare?.(data)){const b=document.createElement('button');b.textContent='画像を共有';b.onclick=async()=>{try{await navigator.share(data);eventLog('share',{kind:'file'});}catch{}};area.append(b);}}
 eventLog('poster',{mode:resultMode});
}
function initExtras(){
 const issue=byId('issueLine');if(issue){const d=new Date();issue.textContent=d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日 ・ DAILY EDITION';}
 const modeButtons=[...byId('modes').children];function modes(){for(const b of modeButtons)b.setAttribute('aria-pressed',String((b.dataset.mode||b.textContent)===preferredMode()));}modes();
 for(const b of modeButtons)b.onclick=()=>{state.mode=b.dataset.mode||b.textContent;save();modes();};
 for(const id of ['quiet','vibrate','sound']){byId(id).checked=!!state[id];byId(id).onchange=e=>{state[id]=e.target.checked;save();};}
 document.addEventListener('click',()=>{if(state.sound&&!audioContext){try{audioContext=new (window.AudioContext||window.webkitAudioContext)();}catch{}}},true);
 byId('bookFilter').onchange=()=>renderBook(true);
 byId('bookSearch').addEventListener('input',()=>renderBook(true));
 byId('bookMore').onclick=()=>{bookShown+=50;renderBook(false);};
 byId('detailClose').onclick=closeDetail;
 byId('detail').addEventListener('click',e=>{if(e.target===e.currentTarget)closeDetail();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail();});
 if(byId('closetView')){
  byId('closetReset').onclick=()=>{closetResetAll();renderCloset();};
  byId('closetResultBack').onclick=()=>{
   if(navState.sub==='result'&&histOK){try{history.back();}catch{} setTimeout(()=>{if(navState.sub==='result'){navState={view:'closet',sub:null};closetShowBuilder();}},450);}
   else{navState={view:'closet',sub:null};closetShowBuilder();}
  };
  byId('closetJudge').onclick=()=>{const judged=closetJudgeItems();if(!judged)return;placeResultInCloset();reviewSource='closet';try{if(typeof finish==='function')finish(true);}finally{reviewSource='gacha';}state.closetCount=(state.closetCount||0)+1;try{state.closetLast=scoreV2(judged).overall;}catch{}save();byId('closetBuilder').hidden=true;byId('closetResultBar').hidden=false;navState={view:'closet',sub:'result'};pushNav();const v=byId('closetView');if(v&&v.scrollIntoView)v.scrollIntoView();};
 }
 byId('poster').onclick=poster;byId('share').onclick=()=>eventLog('share_intent',{kind:'x'});
 byId('daily').onclick=()=>{battle='';opponent=null;openPack('daily');};
 byId('favorite').onclick=()=>{const i=state.stars.findIndex(x=>x.code===current);if(i>=0)state.stars.splice(i,1);else state.stars.unshift({code:current,mode:resultMode,score:scoreLook(selected()).overall,title:titleFor(selected(),scoreLook(selected()))});state.stars=state.stars.slice(0,30);save();byId('favorite').textContent=i>=0?'☆ お気に入り':'★ 保存済み';refreshRecords();};
 byId('invite').onclick=async()=>{const url=new URL(location.href);url.hash='v6-'+resultMode+'-'+current+'~'+byId('duel').value;try{await navigator.clipboard.writeText(url.href);byId('challengeStatus').textContent='対決リンクをコピーしました。';}catch{prompt('対決リンクをコピー',url.href);}eventLog('share_intent',{kind:'challenge'});};
 initRouter();
 refreshRecords();
}
