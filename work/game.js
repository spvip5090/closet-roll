const byId = id => document.getElementById(id);
const labels = ['トップス','ボトムス','シューズ','バッグ','小物'];
const tiers = ['N','R','SR','SSR'];
const yen = value => '¥' + value.toLocaleString('ja-JP');
const names = {c:'カジュアル',s:'ストリート',e:'モード',p:'個性派'};
const timers = new Set();
let current = '';
function schedule(fn, ms) {
  const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
  timers.add(timer);
}
function cancel() {
  timers.forEach(clearTimeout);
  timers.clear();
  byId('stage').classList.remove('charging','upgrade');
}
function countUp(el,to){
  if(gentle()){el.textContent=to;return;}
  const t0=performance.now(),dur=650;
  function step(t){const p=Math.min(1,(t-t0)/dur);el.textContent=Math.round(to*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(step);}
  requestAnimationFrame(step);
}
const cheap = item => item.price <= 4000;
const rich = item => item.price >= 150000;
function randomEntry(list) { return list[Math.floor(Math.random()*list.length)]; }
function rank(item) {
  const legacy = /^photos\/([0-3])-([0-3])\.webp$/.exec(item.img || '');
  if (legacy) return Number(legacy[2]);
  return cheap(item) ? 0 : rich(item) ? 3 : item.price >= 70000 ? 2 : 1;
}
const targetRates=[.5,.3,.15,.05];
// Hidden special packs (secret spec): on each draw, one cumulative roll can
// force a special pack before the ordinary paths - checked in the order
// super (all-SSR + single brand) -> god (all-SSR) -> brand (single brand).
// If no brand has an SSR item in every slot of the mode pool, a super hit
// degrades to a god pack. These rates and conditions are NEVER written into
// player-facing strings; the result banners are decided from the drawn
// items themselves (see verdict), so a naturally drawn set with the same
// pattern earns the same celebration.
const SPECIAL_RATES={super:.0001,god:.001,brand:.01};
const modeCache={};
function eligible(x,mode){return x.gender==='unisex'||x.gender===(mode==='MEN'?'men':'women');}
function weighted(ids,group){
  const counts=new Map();
  ids.forEach(i=>counts.set(group[i].brand,(counts.get(group[i].brand)||0)+1));
  const weights=ids.map(i=>1/Math.sqrt(counts.get(group[i].brand)));
  let total=0;
  const cumulative=weights.map(w=>total+=w);
  return {ids,weights,pick(rng){
    const value=rng()*total;
    let lo=0,hi=ids.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(value<cumulative[mid])hi=mid;else lo=mid+1;}
    return ids[lo];
  }};
}
// --- Draw freshness (2026-11-24): the same SSR items (e.g. the ¥1,152,800
// PONT DES ARTS BELT, 3 times in one evening) repeated too often. Items
// drawn in the player's last 10 pulls (state.recent, maintained by
// extras.js resultExtras) are down-weighted x0.15 - user-calibrated, NOT a
// hard ban: weights never reach zero, so small SSR pools can never empty.
// Items not yet in the 図鑑 (state.found) get a slight x1.3 boost so
// collecting stays fresh. Both factors apply WITHIN a tier list only, so
// the base rarity rates (N50/R30/SR15/SSR5) and the hidden special-pack
// rates are mathematically untouched; forced special draws (super/god/
// brand) bypass suppression entirely but are still recorded into recent
// by resultExtras like every other draw. With no player state (tests,
// first run) the pick is exactly the old weighted pick.
const FRESH_RECENT_W=0.15, FRESH_NEW_BONUS=1.3;
function freshState(){
  if(typeof state==='undefined'||!state||!Array.isArray(state.recent))return null;
  const recent=new Set();
  for(const r of state.recent.slice(0,10)){
    const m=/^[gn]((?:\d{1,3}\.){4}\d{1,3})$/.exec(String(r&&r.code||''));
    if(m)m[1].split('.').forEach((v,s)=>recent.add(s+':'+Number(v)));
  }
  return {recent,found:state.found||{}};
}
function pickFrom(w,slot,rng,fs){
  if(!fs||!w.ids.length)return w.pick(rng);
  let total=0;
  const cumulative=w.ids.map((id,k)=>{
    let mlt=1;
    if(fs.recent.has(slot+':'+id))mlt*=FRESH_RECENT_W;
    const it=catalog[slot][id];
    if(!(fs.found[it.id||it.source]>0))mlt*=FRESH_NEW_BONUS;
    return total+=w.weights[k]*mlt;
  });
  const value=rng()*total;
  let lo=0,hi=w.ids.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(value<cumulative[mid])hi=mid;else lo=mid+1;}
  return w.ids[lo];
}
function modePlan(mode){
  if(modeCache[mode])return modeCache[mode];
  const groups=catalog.map(group=>group.map((_,i)=>i).filter(i=>eligible(group[i],mode)));
  const allBrands=[...new Set(groups.flatMap((ids,s)=>ids.map(i=>catalog[s][i].brand)))];
  // brands: at least one mode-eligible item in every slot.
  // superBrands: an SSR (rank 3) item in every slot - currently none in
  // either mode, so super hits degrade to god packs (see drawLook).
  const brands=allBrands.filter(b=>groups.every((ids,s)=>ids.some(i=>catalog[s][i].brand===b)));
  const superBrands=allBrands.filter(b=>groups.every((ids,s)=>ids.some(i=>catalog[s][i].brand===b&&rank(catalog[s][i])===3)));
  const slots=groups.map((ids,s)=>{
    const group=catalog[s];
    if(!ids.length)throw Error(mode+' '+labels[s]+' の候補なし');
    const byTier=tiers.map((_,t)=>weighted(ids.filter(i=>rank(group[i])===t),group));
    const byBrand=brands.map(b=>ids.filter(i=>group[i].brand===b));
    const byBrandSSR=superBrands.map(b=>ids.filter(i=>group[i].brand===b&&rank(group[i])===3));
    return {byTier,byBrand,byBrandSSR};
  });
  const canSSR=slots.every(s=>s.byTier[3].ids.length>0);
  const pSuper=canSSR?SPECIAL_RATES.super:0;
  const pGod=canSSR?SPECIAL_RATES.god:0;
  const pBrand=brands.length?SPECIAL_RATES.brand:0;
  const budget=slots.every(s=>s.byTier[0].ids.length)?.12:0;
  const wild=canSSR&&budget?.11:0;
  slots.forEach(({byTier,byBrand},s)=>{
    const available=targetRates.reduce((n,w,t)=>n+(byTier[t].ids.length?w:0),0);
    slots[s].ordinary=targetRates.map((w,t)=>{
      const brandPart=pBrand?pBrand*byBrand.reduce((n,list)=>n+list.filter(i=>rank(catalog[s][i])===t).length/list.length,0)/brands.length:0;
      return ((byTier[t].ids.length?w/available:0)-brandPart-(t===0?budget+wild*.8:t===3?pSuper+pGod+wild*.2:0))/(1-pSuper-pGod-pBrand-budget-wild);
    });
  });
  return modeCache[mode]={slots,brands,superBrands,pSuper,pGod,pBrand,budget,wild};
}
function drawLook(mode='MEN',rng=Math.random){
  const {slots,brands,superBrands,pSuper,pGod,pBrand,budget,wild}=modePlan(mode);
  const fs=freshState();
  const roll=rng(),star=Math.floor(rng()*5);
  // sequential special rolls on one cumulative roll: super, then god, then brand
  let kind='ordinary';
  if(roll<pSuper)kind=superBrands.length?'super':'god';
  else if(roll<pSuper+pGod)kind='god';
  else if(roll<pSuper+pGod+pBrand)kind='brand';
  else if(roll<pSuper+pGod+pBrand+budget)kind='budget';
  else if(roll<pSuper+pGod+pBrand+budget+wild)kind='wild';
  let ids;
  if(kind==='super'){
    const bi=Math.floor(rng()*superBrands.length);
    ids=slots.map(({byBrandSSR})=>{const list=byBrandSSR[bi];return list[Math.floor(rng()*list.length)];});
  }else if(kind==='god'){
    ids=slots.map(({byTier})=>byTier[3].pick(rng));
  }else if(kind==='brand'){
    const bi=Math.floor(rng()*brands.length);
    ids=slots.map(({byBrand})=>{const list=byBrand[bi];return list[Math.floor(rng()*list.length)];});
  }else{
    // ordinary / budget / wild paths: per-tier picks go through the
    // freshness weighting (forced special paths above bypass it on purpose)
    ids=slots.map(({byTier,ordinary},s)=>{
      let t=0;
      if(kind==='budget')t=0;
      else if(kind==='wild')t=s===star?3:0;
      else {let r=rng();while(t<3 && r>=ordinary[t])r-=ordinary[t++];}
      return pickFrom(byTier[t],s,rng,fs);
    });
  }
  return (kind==='super'||kind==='god'||kind==='brand'?'g':'n')+ids.join('.');
}
function selected(){
  const ids=current.includes('.')?current.slice(1).split('.').map(Number):Array.from(current,x=>parseInt(x,36));
  return ids.map((id,i)=>catalog[i][id]);
}
function verdict(items,score){
  // BUDGET BREAK JP title lines (user directive, 2026-11-24): spicy, final,
  // witty - but the banned word never appears. EN label stays BUDGET BREAK.
  // (Defined inside verdict so test harnesses that slice this function out
  // of game.js keep working.)
  const SPICY_BREAK=[
    '成立してない。財布だけが無事。',
    '今日は解散。着替えて出直して。',
    '擁護不能。それが結論。',
    '財布は無傷。コーデは全滅。',
    '安くても、これは組めてない。'
  ];
  // Special results are read off the drawn items themselves, never the
  // draw path or the share-code prefix: the same five cards always earn
  // the same celebration, however they were drawn. Specials take
  // precedence over every score/price-based banner below.
  const sameBrand=items.length===5&&items.every(x=>x.brand===items[0].brand);
  const allSSR=items.length===5&&items.every(x=>rank(x)===3);
  // God-tier copy rule (user, 2026-11-24): celebration and mystique ONLY.
  // The copy must never state or hint at WHY the pack is special - no
  // rarity words, no aggregate claims, no conditions. It should read as a
  // legendary event, not as a mechanism. (Brand copy may name the brand:
  // it is printed on the cards anyway.)
  const GOD_LINES=[
    ['神域の一式が、降りた。','言葉を失う輝き。理由は、問わないで。'],
    ['伝説の扉が、開いた日。','ランウェイがざわつく一式。'],
    ['神話級。ただ、それだけ。','二度と拝めないかもしれない輝き。']
  ];
  const SUPER_GOD_LINES=[
    ['神域の、その先。','伝説が、もう一段階ひらいた。'],
    ['天啓級の一式、降臨。','言葉を失う。ただ、まばゆい。'],
    ['神話が、今日ここに。','もう二度と拝めないかもしれない。']
  ];
  const vh=items.reduce((n,x)=>n+[...(x.brand+x.name)].reduce((a,c)=>a+c.charCodeAt(0),0),0);
  if(allSSR&&sameBrand){ const L=SUPER_GOD_LINES[vh%SUPER_GOD_LINES.length]; return ['supergod','SUPER GOD PACK',L[0],L[1]]; }
  if(allSSR){ const L=GOD_LINES[vh%GOD_LINES.length]; return ['god','GOD PACK',L[0],L[1]]; }
  if(sameBrand) return ['brand','BRAND PACK','全身 '+items[0].brand,items[0].brand+'だけで揃えた、堂々の一式。'];
  const low=items.filter(cheap).length, high=items.filter(rich).length;
  if(high===items.length) return ['jackpot','JACKPOT','全身、金銭感覚バグ。',items.length+'枚すべてが15万円以上。ランウェイ直行。'];
  if(low===items.length){
    // BUDGET BREAK is a verdict about the outfit, so it needs evidence: a
    // broken classification (dasai / wild_fail) or a genuine junk/atrocity
    // offense. An all-petit-prix outfit that is merely plain is an everyday
    // win - cheapness alone is not a failure either, so it gets the DAILY
    // WIN banner instead (same 'bust' pack theme, softer verdict). The JP
    // title lines are spicy but never use the word the user banned on
    // 2026-11-24; the EN label stays BUDGET BREAK.
    const harsh=!score||!score.v2||score.cls==='dasai'||score.cls==='wild_fail'||(typeof personaOffense==='function'&&score.reasons&&personaOffense(items,score));
    if(harsh){ const h2=items.reduce((n,x)=>n+[...(x.brand+x.name)].reduce((a,c)=>a+c.charCodeAt(0),0),0);
      return ['bust','BUDGET BREAK',SPICY_BREAK[h2%SPICY_BREAK.length],'全身'+items.length+'点とも4,000円以下。むしろ買い物上手かも。']; }
    const soft=[
      ['DAILY WIN','日常の勝ち組。映えは次の機会に。'],
      ['DAILY WIN','全員プチプラ、でも全員仕事してる。'],
      ['DAILY WIN','財布は無傷。普段着としては勝ち組よ。'],
      ['DAILY WIN','安くても、まとまりは本物。日常の勝ち組。'],
    ];
    const h=items.reduce((n,x)=>n+[...(x.brand+x.name)].reduce((a,c)=>a+c.charCodeAt(0),0),0);
    const [kick,ttl]=soft[h%soft.length];
    return ['bust',kick,ttl,'全身'+items.length+'点とも4,000円以下。むしろ買い物上手かも。'];
  }
  if(low===items.length-1 && high===1){
    const pos=items.findIndex(rich);
    return ['wild','WILD CARD',labels[pos]+'だけ、世界線が違う。','残り'+(items.length-1)+'点はプチプラ。一点に予算を全振り！'];
  }
  return ['mix','STYLE MIX','本日のミックスコーデ','一番高いのは'+labels[items.indexOf(items.reduce((a,b)=>a.price>b.price?a:b))]+'。'];
}
function outfitFit(items){
  const [top,bottom,shoes,bag,accessory]=items;
  const has=(item,re)=>item && re.test(item.name);
  const adjustments=[];
  function apply(condition,points,note){if(condition)adjustments.push({points,note});}
  const innerBottom=has(bottom,/インナー.*スパッツ|LONG JOHNS|UNDERPANTS/i);
  const tank=has(top,/タンクトップ|TANK TOP/i);
  apply(innerBottom,-24,'ボトムスが肌着一枚で、外出用のパンツがない');
  apply(has(top,/エアバリアインナー|保温肌着/),-13,'インナーが外側のトップスになっている');
  apply(innerBottom && tank,-10,'肩を出すトップスと防寒用のスパッツで季節感が離れている');
  apply(has(shoes,/上履き|室内用|携帯スリッパ/),-12,'屋外用の一式に室内履きが入っている');
  apply(has(bag,/ポリ袋|クラフト紙袋/),-8,'持ち運び用の袋がバッグの代わりになっている');
  apply(has(top,/DOWN JACKET|あったか即戦力フリース/i) && has(shoes,/サンダル|SANDAL/i),-9,'防寒トップスとサンダルで季節感が離れている');
  apply(tank && !innerBottom && has(bottom,/JEANS|デニム|ジーンズ|ハーフパンツ|SHORTS/i),5,'軽いトップスに普段着のボトムスを合わせている');
  apply(has(top,/DENIM|FLANNEL|ネルシャツ/i) && has(bottom,/DENIM|JEANS|ジーンズ/i),5,'上下の生地やワークテイストに共通点がある');
  apply(has(top,/KNIT|SWEATER|ニット/i) && has(accessory,/KNIT CAP|BEANIE|ニット帽/i),4,'トップスと帽子のニットが呼応している');
  apply(has(top,/SHIRT|シャツ/) && has(bottom,/TROUSER|スラックス/) && has(shoes,/LOAFER|DERBY|ローファー/),8,'シャツから革靴までドレス感が揃っている');
  function shade(item){
    const shadeText=(item.name.split(' / ').slice(1).join(' ') || item.name).toUpperCase();
    for(const [name,pattern] of [['明るい白系',/\b(WHT|WHITE|ALABASTER|IVORY)\b|オフホワイト/],['黒系',/\b(BLK|BLACK)\b|ブラック/],['ブラウン系',/\b(BRW|BROWN|COGNAC)\b/]]){
      if(pattern.test(shadeText))return name;
    }
  }
  const shoeColor=shade(shoes);
  apply(shoeColor && shoeColor===shade(bag),4,'靴とバッグの'+shoeColor+'がつながっている');
  // Tops and bottoms establish most of the visible silhouette.
  const weights=[32,32,17,12,7];
  const weightSum=items.reduce((sum,_,i)=>sum+weights[i],0);
  const foundation=Math.round(items.reduce((sum,item,i)=>sum+item.street.points*weights[i],0)/weightSum);
  const role=item=>item?.street.role;
  const practical=items.filter(x=>['underlayer','utility','specialUse'].includes(role(x))).length;
  apply(practical>=2 && ['layering','underlayer'].includes(role(top)),-7,'薄いトップスに実用品が複数重なり、外出着の軸が弱い');
  apply(['layering','underlayer'].includes(role(top)) && role(bottom)==='underlayer' && ['polished','statement'].includes(role(shoes)),-4,'上下のラフさに対して靴だけが装飾寄り');
  apply(role(top)==='polished' && role(bottom)==='polished' && role(shoes)==='polished',5,'上下と足元のドレス感が一貫している');
  apply(items.filter(x=>role(x)==='statement').length>=4,-6,'主張の強い品が重なり、視線を集める場所が分散している');
  apply(top.style===bottom.style && bottom.style===shoes.style && practical===0,4,'上下と靴のテイストがつながっている');
  apply(top.style==='e' && bottom.style==='p' && shoes.style==='s' && role(top)!=='statement',-6,'端正な上半身に個性派のボトムスとストリートの靴が重なる');
  apply(role(top)==='statement' && role(bottom)==='statement' && top.style!==bottom.style,-9,'上下が違うテイストで、ともに主役を主張する');
  const print=/レオパード|迷彩|ヒョウ|花柄|チェック柄|ドット柄|ボーダー柄|ストライプ柄|千鳥柄|LEOPARD|CAMO(?:UFLAGE)?|FLORAL|PAISLEY|PLAID/i;
  const topPrint=top.name.match(print)?.[0],bottomPrint=bottom.name.match(print)?.[0];
  apply(topPrint && bottomPrint && topPrint!==bottomPrint,-10,'上下で異なる柄が主張している');
  const cold=/ダウンジャケット|中綿|ボアジャケット|防寒|ダウンコート|ムートン|DOWN JACKET|PUFFER/i;
  const summer=/サンダル|ビーチサンダル|SANDALS?|SLIDES?/i;
  apply(cold.test(top.name) && summer.test(shoes.name) && !has(top,/DOWN JACKET|あったか即戦力フリース/i),-13,'防寒アウターと開放的な足元で季節感が分かれる');
  apply(/ハーフパンツ|ショートパンツ|SHORTS/i.test(bottom.name)&&cold.test(top.name),-9,'防寒トップスに脚を出すボトムスが重なる');
  const tailored=/スラックス|センタープレス|テーラード|TAILORED|PLEATED TROUSERS/i;
  const sport=/ジャージ|トラックパンツ|トレーニング|TRACK PANTS|TRAINING/i;
  apply(sport.test(bottom.name)&&/パンプス|ドレスシューズ|PUMPS|OXFORD/i.test(shoes.name),-8,'トレーニング寄りのパンツにドレス靴が入る');
  apply(tailored.test(bottom.name)&&/シャツ|ジャケット|BLAZER|SHIRT/i.test(top.name)&&!sport.test(top.name),6,'シャツやジャケットがボトムスの仕立てを引き立てる');
  apply(/スウェット|フーディ|パーカー|HOODIE/i.test(top.name)&&/カーゴ|デニム|ジーンズ|CARGO|JEANS/i.test(bottom.name)&&/スニーカー|SNEAKER|ALL STAR/i.test(shoes.name),7,'フーディやスウェットからパンツ、スニーカーまで街着の流れがある');
  const coldAccessory=accessory && /マフラー|手袋|耳当て|MUFFLER|WINTER GLOVES/i.test(accessory.name);
  apply(tank&&coldAccessory,-8,'肩を出したトップスと防寒小物の季節感が離れる');
  apply(topPrint&&bottomPrint===topPrint&&top.style===bottom.style,5,'上下で同じ柄を繰り返している');
  const balance=Math.max(0,Math.min(100,foundation+adjustments.reduce((n,a)=>n+a.points,0)));
  return {balance,foundation,adjustments};
}

function scoreLook(items) {
  if (typeof scoreV2 === 'function') return scoreV2(items);
  return scoreLookV1(items);
}
function scoreLookV1(items) {
  const sum = items.reduce((total,item)=>total+item.price,0);
  const price = Math.max(0,Math.min(100,Math.round(100*Math.log10(Math.max(1,sum/6500))/2.18)));
  const {balance,foundation,adjustments}=outfitFit(items);
  const counts={};
  for(const item of items) counts[item.style]=(counts[item.style]||0)+1;
  const sorted=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  const reason='アイテムの街着適性 '+foundation+'点。'+(adjustments.length
    ? adjustments.map(a=>a.note+'（'+(a.points>0?'＋':'−')+Math.abs(a.points)+'）').join('。')+'。'
    : '組み合わせによる追加の加減点はありません。');
  const fit=Math.max(0,Math.min(100, Math.round((balance-69)*3.15+65)));
  const base=Math.round(price*.23+fit*.77);
  const bonuses=[];
  const matches=counts[sorted[0]];
  if(matches>=3) bonuses.push([names[sorted[0]]+'統一ボーナス',matches-2,'style',sorted[0]]);
  const brands={};
  for(const item of items) brands[item.brand]=(brands[item.brand]||0)+1;
  const brand=Object.keys(brands).sort((a,b)=>brands[b]-brands[a])[0];
  if(brand && brands[brand]>=2) bonuses.push([brand+' × '+brands[brand]+' 同ブランドボーナス',brands[brand]-1,'brand',brand]);
  const overall=Math.min(100,base+bonuses.reduce((n,b)=>n+b[1],0));
  return {price,balance:fit,overall,reason,bonuses,base};
}
function lookComment(items,balance){
  if (typeof scoreV2 === 'function') return scoreV2(items).reasonComment;
  return lookCommentV1(items,balance);
}
function lookCommentV1(items,balance){
  const [top,bottom,shoes,bag,acc]=items;
  const has=(item,regex)=>item && regex.test(item.name);
  const tank=has(top,/タンクトップ|TANK TOP/), shorts=has(bottom,/短パン|ハーフパンツ|SHORTS?\b/);
  const boots=has(shoes,/BOOTS?\b/),sandals=has(shoes,/サンダル|SLIDER|SANDAL/);
  const total=items.reduce((n,x)=>n+x.price,0);
  const lead=items.reduce((a,b)=>a.price>=b.price?a:b);
  const subject=labels[items.indexOf(lead)];
  const share=Math.floor(100*lead.price/total);
  const seed=items.reduce((hash,item)=>Array.from(item.name).reduce((h,c)=>(Math.imul(h,31)+c.charCodeAt(0))>>>0,hash),7);
  const pick=lines=>lines[seed%lines.length];
  if(items.every(x=>x.brand===top.brand))return 'トップスから最後の小物まで、すべて'+top.brand+'。ブランド名を五度見するパック。';
  if(has(bottom,/インナー.*スパッツ/)) return '防寒用スパッツの上に重ねるパンツが欲しい。'+(tank?'タンクトップとの季節差も大きい。':'小物よりも、まず外側の一枚で印象が変わる。');
  const notes=[];
  const add=(test,...lines)=>{if(test)notes.push(...lines)};
  add(tank && shorts && sandals,'タンクトップ、短パン、サンダル。天気予報だけは確認して出かけたい。');
  add(tank && boots,'肩は夏休み、足元はブーツ。季節の境目がちょうど膝にある。');
  add(tank && balance>=82,'全体はきれいにまとまっているのに、上はタンクトップ一枚。袖を足すか、潔さを取るか。');
  add(tank && has(acc,/PANDA|CHOKER|NECKLACE/),'タンクトップが額縁になって、首元のアクセサリーが主役に。');
  add(has(top,/DENIM/) && has(bottom,/DENIM|JEANS|ジーンズ/),'上下ともデニム。別々に引いた二枚がセットアップ気分を出している。');
  add(has(top,/FLANNEL|FLANNNEL/) && has(bottom,/DENIM|JEANS|ジーンズ/),'ネルシャツとデニム。ガチャに任せた上下が、古着屋の店員並みに気が合った。');
  add(has(top,/DOWN JACKET|FLEECE/) && (shorts||sandals),'上半身は防寒対策ばっちり。下半身にはその連絡が届いていない。');
  add(has(top,/HOODIE|SWEAT/) && has(bottom,/SWEAT/),'上下にスウェットが揃った。着心地部門なら優勝候補。');
  add(shorts && boots,'短パンの裾からブーツまで、脚まわりだけで十分に見せ場がある。');
  add(has(top,/LEATHER|BIKER/) && sandals,'レザーで固めた上半身から、足元だけ先に夏へ。');
  add(has(top,/KNIT|SWEATER/) && has(acc,/BEANIE|KNIT CAP/),'頭とトップスでニットが呼応。最後に引いた帽子が意外なまとめ役。');
  add(has(acc,/CAT EAR/),'最後に猫耳が登場。ここまで服に集まっていた視線が一気に頭の上へ。');
  add(has(acc,/PANDA/),'最後の一枚で首元にパンダが着席。このコーデでいちばん目が合う相手。');
  add(has(bottom,/BAGGY|WIDE LEG/) && has(top,/JUMBO|オーバーサイズ/),'上下ともゆったり。シルエットの大胆さでは意見が一致した。');
  add(has(bag,/エコバッグ/) && lead.price>=120000,'手には'+yen(bag.price)+'のエコバッグ。'+subject+'に'+yen(lead.price)+'かけても、袋代は節約。');
  add(has(bag,/ポリ袋/),'バッグ枠から半透明のポリ袋が登場。持ち物まで含めてコーディネート。');
  add(has(bag,/クラフト紙袋/),'仕上げはクラフト紙袋。出かける前から買い物帰りに見える。');
  add(has(acc,/蝶ネクタイ/),'蝶ネクタイを一つ足しただけで、集合写真の司会者が決まった。');
  add(has(shoes,/スリッパ/),'足元はスリッパ。玄関に着いた時点でコーデが完成する。');
  const material=notes.length?pick(notes):'';
  let money='';
  if(share>=60 && lead.price>=50000)money=pick([subject+'だけで総額の'+share+'％。残りを全部足しても届かない。',subject+'に'+yen(lead.price)+'。予算の'+share+'％がこの一枚に集まった。',lead.brand+'の'+subject+'が総額の'+share+'％を占有。ほかのアイテムは予算を譲り合った。']);
  if(material || money)return material+money;
  const fitting=outfitFit(items).adjustments.filter(x=>Math.abs(x.points)>=5);
  if(fitting.length){const detail=fitting.reduce((a,b)=>Math.abs(a.points)>=Math.abs(b.points)?a:b);return detail.note+'。'+(detail.points>0?'ここが今回の着こなしの決め手。':'全体の印象はこの組み合わせに引っ張られる。');}
  if(tank)return yen(top.price)+'のタンクトップ一枚で登場。上半身を軽くしたぶん、'+bag.brand+'のバッグがよく見える。';
  const groups=Object.groupBy?Object.groupBy(items,x=>x.brand):items.reduce((a,x)=>((a[x.brand]??=[]).push(x),a),{});
  const repeated=Object.values(groups).find(g=>g.length>=2);
  if(repeated)return repeated[0].brand+'が'+repeated.length+'点。別々に引いたのに、同じ店から帰ってきたような顔ぶれ。';
  if(items.every(cheap))return '全部合わせて'+yen(total)+'。一式揃えたあとのレシートが今日いちばんの見どころ。';
  if(shoes.style===bag.style)return pick(['足元とバッグの方向性が一致。別ブランドでも端と端でまとまった。',shoes.brand+'の靴と'+bag.brand+'のバッグが同じテイスト。小物から逆算したような組み合わせ。']);
  return pick([top.brand+'のトップスに'+shoes.brand+'の靴。総額のうち'+subject+'が'+share+'％を占めるミックス。',bottom.brand+'のボトムスから'+shoes.brand+'の靴へ。最後に'+(acc||bag).brand+'が加わるブランド横断コーデ。']);
}
function celebrate(theme){
  const hearts=theme==='hearts'||theme==='heartsSoft';
  const field=document.createElement('div');field.className='particles '+theme;field.setAttribute('aria-hidden','true');
  for(let k=0;k<(theme==='supergod'?110:theme==='god'?65:theme==='brand'?44:theme==='hearts'?26:theme==='heartsSoft'?12:32);k++){
    const bit=document.createElement('i');bit.style.setProperty('--x',Math.random()*100+'%');bit.style.setProperty('--d',(hearts?Math.random()*1.4:Math.random()*.5)+'s');bit.style.setProperty('--h',hearts?330+Math.floor(Math.random()*30):Math.floor(Math.random()*360));bit.textContent=theme==='bust'?'↓':(theme==='god'||theme==='supergod')?'✧':hearts?(k%3?'♥':'✿'):'✦';field.append(bit);
  }
  document.body.append(field);setTimeout(()=>field.remove(),hearts?3600:2200);
}
function card(index, animate) {
  const item = selected()[index];
  const tier = rank(item);
  const el = document.createElement('article');
  el.className = 'card r' + tier + (animate ? ' reveal' : '');
  el.innerHTML = '<img><span class="badge"></span><div class="copy"><small></small><strong></strong><span class="styleTag"></span><b></b></div>';
  const image = el.querySelector('img');
  image.loading='lazy'; image.decoding='async'; image.src=item.img;
  image.alt = item.brand + ' ' + item.name;
  if(typeof crImg==='function')crImg(image,index);
  el.querySelector('.badge').textContent = tiers[tier];
  if(typeof isNewItem==='function'&&isNewItem(item)){const nb=document.createElement('span');nb.className='newBadge';nb.textContent='NEW';el.append(nb);}
  el.querySelector('small').textContent = labels[index] + ' · ' + item.brand;
  el.querySelector('strong').textContent = typeof displayItemName==='function'?displayItemName(item.name):item.name;
  el.querySelector('.styleTag').textContent = names[item.style];
  el.querySelector('b').textContent = yen(item.price);
  const href=productLink(item);if(href){const link=document.createElement('a'); link.href=href; link.rel='noopener'+(item.affiliateEnabled?' sponsored':'');link.target='_blank';link.textContent=item.affiliateEnabled?'PR・購入先':'商品情報';link.onclick=()=>eventLog('product_click',{id:item.id});el.querySelector('.copy').append(link);}
  if(animate && tier>=2){const flash=document.createElement('span');flash.className='brandReveal';flash.textContent=tiers[tier]+'  /  '+item.brand;flash.setAttribute('aria-hidden','true');el.append(flash);}
  el.title='タップで詳細';
  el.addEventListener('click',e=>{if(e.target.closest('a'))return;if(typeof openDetail==='function')openDetail(item,index);});
  return el;
}
function finish(showEffects=false) {
  cancel();
  const items = selected();
  const score=scoreLook(items);
  const [theme,kicker,title]=verdict(items,score);
  const comment=lookComment(items,score.balance);
  const banner=byId('outcome');
  banner.hidden=false;banner.className=theme;
  banner.querySelector('span').textContent=(score.v2&&theme==='mix')?score.clsLabel:kicker;
  banner.querySelector('strong').textContent=(score.v2&&theme==='mix')?score.headline:title;
  banner.querySelector('p').textContent=(score.v2&&theme==='mix')?score.impression:coverLine(items,score);
  if(showEffects===true && !gentle() && (theme!=='mix'||items.some(x=>rank(x)===3))) celebrate(theme);
  else if(showEffects===true && !gentle() && score.overall>=85) celebrate('jackpot'); // high-score celebration
  byId('stage').hidden = true;
  byId('scores').classList.toggle('award',showEffects===true && !gentle());
  byId('result').hidden = false;
  const grid = byId('grid');
  if(grid.dataset.complete !== current) grid.replaceChildren(...items.map((_,i) => card(i,false)));
  grid.dataset.complete = current;
  const total = yen(items.reduce((sum,item) => sum + item.price,0));
  byId('total').textContent = total;
  byId('scores').hidden=false;
  byId('price').textContent=score.price;byId('balance').textContent=score.balance;countUp(byId('overall'),score.overall);
  byId('review').textContent=comment;
  const reviewFull=byId('reviewFull');
  reviewFull.replaceChildren(...outfitReview(items,score).map(t=>{const p=document.createElement('p');p.textContent=t;return p;}));
  renderParams(score);renderBonusChips(score);
  for(const el of grid.children) el.querySelectorAll('.bonusMark').forEach(mark=>mark.remove());
  for(const [,,field,value] of score.bonuses){
    items.forEach((item,i)=>{
      if(item[field]!==value)return;
      const mark=document.createElement('span');
      mark.className='bonusMark '+field;
      mark.textContent=field==='style'?'系統一致':'ブランド一致';
      grid.children[i].querySelector('.copy').append(mark);
    });
  }
  byId('status').textContent = '開封完了。コーデ総額 ' + total;
  resultExtras(items,score);
  if(showEffects===true && !gentle() && typeof firePersonaFx==='function') firePersonaFx();
  history.replaceState(typeof navHistState==='function'?navHistState():null,'',(current.includes('.')?'#v6-'+resultMode+'-':current.length===5?'#v4-':'#v3-')+current+(battle?'~'+battle:''));
  byId('share').href = 'https://twitter.com/intent/tweet?' + new URLSearchParams({
    text:title+' '+total+'\n総合 '+score.overall+'点（価格 '+score.price+'／バランス '+score.balance+'）\n'+comment+'\n#コーデガチャ',url:location.href
  });
  byId('pull').hidden = byId('share').hidden = false;
  byId('skip').hidden = true;
  byId('pull').textContent = '✦　もう1パック開ける';
}
function openPack() {
  cancel();
  if(typeof showView==='function')showView('gacha');
  const daily=arguments[0]==='daily';resultMode=preferredMode();
  current=drawLook(resultMode,daily?dayRng():Math.random);pendingRecord=daily?dayKey():'draw';eventLog('draw',{mode:resultMode,daily});
  selected().forEach(it=>{const pre=new Image();pre.src=it.img;}); // preload the 5 photos during the opening animation
  byId('moreResult').hidden=true;
  byId('outcome').hidden=true;
  byId('scores').hidden=true;
  document.querySelectorAll('.particles').forEach(el=>el.remove());
  if(gentle()) { finish(); return; }
  const stage = byId('stage'), grid = byId('grid');
  stage.hidden = false;
  stage.dataset.theme=verdict(selected())[0];
  stage.classList.add('charging'); stage.dataset.tier=tiers[Math.max(...selected().map(rank))];
  byId('hint').textContent = stage.dataset.theme==='supergod'?'光が、渦を巻いて重なっていく…':stage.dataset.theme==='god'?'五つの光が、ひとつに重なる…':'ランウェイの幕が上がる…';
  byId('status').textContent = 'パック開封中';
  byId('total').textContent = '？？？';
  byId('pull').hidden = byId('share').hidden = byId('result').hidden = true;
  byId('skip').hidden = false;
  grid.dataset.complete = '';
  grid.replaceChildren(...labels.map(label=>{
    const el=document.createElement('div');
    el.className='card covered';
    el.innerHTML='<b>CR</b><small>'+label+'</small>';
    return el;
  }));
  if(stage.dataset.tier==='SSR'){schedule(()=>{byId('hint').textContent=stage.dataset.theme==='supergod'?'SUPER GOD PACK · まばゆい光の渦。':stage.dataset.theme==='god'?'GOD PACK · 金の箔が、舞い上がる。':stage.dataset.theme==='brand'?'BRAND PACK · 箔が、浮かぶ。':'金の箔が浮かぶ。SSR確定。';stage.classList.add('upgrade');},620);}
  schedule(()=>{stage.hidden=true;stage.classList.remove('upgrade');byId('result').hidden=false},1100);
  let delay=1300;
  labels.forEach((_,i)=>{
    if(rank(selected()[i])===3) delay+=350;
    else if(rank(selected()[i])===2) delay+=150;
    schedule(()=>{grid.children[i].replaceWith(card(i,true));cue(rank(selected()[i]));},delay);
    delay+=490;
  });
  schedule(()=>{grid.dataset.complete=current;finish(true)},delay+200);
}
function restore(viaHash) {
  if(/^#v1-[0-3]{4}$/.test(location.hash)) { location.replace('legacy.html'+location.hash); return; }
  if(typeof popNavRecent==='function'&&popNavRecent())return;
  pendingRecord='';battle='';opponent=null;
  const modern=location.hash.match(/^#(?:v5-|v6-(ALL|MEN|WOMEN|MIX)-)([gn](?:\d{1,3}\.){4}\d{1,3})(?:~(high|low|value))?$/);
  if(modern && modern[2].slice(1).split('.').every((v,i)=>catalog[i][+v])){
    current=modern[2];resultMode=(modern[1]==='MEN'||modern[1]==='WOMEN')?modern[1]:'MEN';pendingRecord='';
    battle=modern[3]||'';if(battle){const items=selected();opponent={kind:battle,score:scoreLook(items).overall,value:items.reduce((n,x)=>n+x.price,0)};}
    if(typeof showView==='function')showView('gacha',viaHash?{}:{fromPop:true});
    finish();return;
  }
  const match = location.hash.match(/^#v4-([0-9ab]{5})$/) || location.hash.match(/^#v3-([0-9ab]{4})$/) || location.hash.match(/^#v2-([0-3]{4})$/);
  if(match) {current=match[1]; if(typeof showView==='function')showView('gacha',viaHash?{}:{fromPop:true}); finish();}
}
initExtras();
byId('pull').onclick=()=>{battle='';openPack()};
byId('skip').onclick=()=>finish();
window.addEventListener('hashchange',()=>restore(true));
restore();
