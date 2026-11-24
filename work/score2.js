// ============================================================
// CLOSET ROLL scoring engine v2 (score2.js)
// Pure functions, no DOM. Deterministic: same 5 items -> same result.
// Internal axes: luxury / appeal / color / silhouette / style / complete /
// indiv -> fashion, harmony, daily derived. Displayed score = 総合価値.
// Unknown attributes (ATTRS -1/0) are treated as neutral, never guessed.
// ============================================================
const S2_LABELS = ['トップス','ボトムス','シューズ','バッグ','小物'];
const S2_STYLES = {c:'カジュアル',s:'ストリート',e:'モード',p:'個性派'};
const S2_NEUTRAL = new Set([1,2,3,4,5,14,16]); // black white gray brown beige metallic khaki
let S2_ATTR = null;
function s2attr(item){
  if(!S2_ATTR){
    S2_ATTR = new Map();
    if(typeof catalog !== 'undefined' && typeof ATTRS !== 'undefined')
      catalog.forEach((g,i)=>g.forEach((it,j)=>S2_ATTR.set(it, ATTRS[i][j])));
  }
  return S2_ATTR.get(item) || [0,-1,-1,-1,0,0,0,0,0,-1,0,40,68,50,0];
}
const s2clamp = (v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,v));
// Progressive bonus curve by match count (style unity / same brand):
// 2->+2, 3->+4, 4->+7, 5->+10. Indexed by count (0..5). Steep enough that
// a coherent outfit visibly separates from a mixed one even after the
// drama-spread recalibration that keeps the global bands unchanged.
const S2_PROGRESSIVE=[0,0,2,4,7,10];
// Unity-axis credit for same-brand count (v14 WS4): one designer's
// language across the set is objective uniformity, so the brand count
// feeds the style-unity axis itself (the flat brand bonus below stays a
// separate draw reward). 2->+2, 3->+5, 4->+10, 5->+12: with the style
// count, a full 5-brand set reaches the mid-80s on unity before
// color/silhouette adjustments. (Calibrated against the WS4 panel so
// designer uniforms land 90s, not a flat 100.)
const S2_BRAND_UNITY=[0,0,2,5,10,12];
const s2yen = v=>'¥'+Math.round(v).toLocaleString('ja-JP');
function s2tier(item){ // mirror of game.js rank() for non-legacy images
  const legacy=/^photos\/([0-3])-([0-3])\.webp$/.exec(item.img||'');
  if(legacy) return Number(legacy[2]);
  return item.price<=4000?0 : item.price>=150000?3 : item.price>=70000?2 : 1;
}
function s2hash(items){
  let h=7;
  for(const it of items){ const s=String(it.id||it.name); for(let i=0;i<s.length;i++) h=(Math.imul(h,31)+s.charCodeAt(i))>>>0; }
  return h;
}
const s2pick=(items,arr)=>arr[s2hash(items)%arr.length];

// ---------- pairwise / structural rule pass ----------
// Each rule is assigned to exactly ONE axis to avoid double counting.
function s2rules(items,A){
  const [top,bottom,shoes,bag,acc]=items;
  const R=[]; // {axis, pts, note, severe, pair}
  const has=(it,re)=>it&&re.test(it.name);
  const add=(axis,pts,note,severe,pair)=>R.push({axis,pts,note,severe:!!severe,pair:pair||null});
  // --- color/pattern axis rules ---
  const pat=i=>A[i][4], pstr=i=>A[i][5];
  if(pstr(0)>=2&&pstr(1)>=2){
    if(pat(0)===pat(1)) add('CP',4,'上下で同じ柄を繰り返している',0,'tb');
    else add('CP',-12,'上下で異なる柄が主張している',1,'tb');
  }
  const strongPat=[0,1,2,3,4].filter(i=>pstr(i)>=2).length;
  if(strongPat>=3) add('CP',-8,'柄のある品が3点以上重なっている',0,null);
  const famS=A[2][0], famB=A[3][0];
  if(famS&&famS===famB&&(A[2][14]===1||A[3][14]===1)) add('CP',4,'靴とバッグの色がつながっている',0,'bs');
  // --- silhouette / season-balance axis rules ---
  const volT=A[0][7], volB=A[1][7];
  if(volT&&volB){
    if(volT===3&&volB===3) add('SI', top.style===bottom.style?-2:-7,'上下ともボリュームがあり、シルエットが膨らんでいる',0,'tb');
    else if(volT!==volB&&(volT===3||volB===3)&&(volT===1||volB===1)) add('SI',7,'上下のボリュームに強弱があり、シルエットにメリハリがある',0,'tb');
    else if(volT===1&&volB===1) add('SI',3,'上下とも細身で、線がすっきりしている',0,'tb');
  }
  const cold=/ダウンジャケット|中綿|ボアジャケット|防寒|ダウンコート|ムートン|DOWN JACKET|PUFFER/i;
  const summerShoe=/サンダル|ビーチサンダル|SANDALS?|SLIDES?/i;
  if(has(top,cold)&&has(shoes,summerShoe)) add('SI',-11,'防寒トップスとサンダルで季節感が離れている',1,'ts');
  if(has(bottom,/ハーフパンツ|ショートパンツ|SHORTS/i)&&has(top,cold)) add('SI',-8,'防寒トップスに脚を出すボトムスが重なる',0,'tb');
  if(has(bottom,/ジャージ|トラックパンツ|トレーニング|TRACK PANTS|TRAINING/i)&&has(shoes,/パンプス|ドレスシューズ|PUMPS|OXFORD/i)) add('SI',-10,'トレーニング寄りのパンツにドレス靴が入る',1,'bs');
  if(has(top,/タンクトップ|TANK TOP/i)&&acc&&/マフラー|手袋|耳当て|MUFFLER/i.test(acc.name)) add('SI',-7,'肩を出したトップスと防寒小物の季節感が離れる',0,'ta');
  if(has(bottom,/SHORTS|ショートパンツ|ハーフパンツ/i)&&has(shoes,/サンダル|SANDAL/i)) add('SI',3,'脚を出すボトムスとサンダルの季節感が揃っている',0,'bs');
  // --- style-unity axis rules ---
  const mat=i=>A[i][6];
  if((mat(0)&1)&&(mat(1)&1)) add('U',5,'上下の生地やワークテイストに共通点がある',0,'tb');
  if((mat(0)&4)&&acc&&(mat(4)&4)) add('U',4,'トップスと小物のニットが呼応している',0,'ta');
  if(has(top,/SHIRT|シャツ/)&&has(bottom,/TROUSER|スラックス/)&&has(shoes,/LOAFER|DERBY|ローファー/)) add('U',8,'シャツから革靴までドレス感が揃っている',0,'tb');
  if(has(top,/スウェット|フーディ|パーカー|HOODIE/i)&&has(bottom,/カーゴ|デニム|ジーンズ|CARGO|JEANS/i)&&has(shoes,/スニーカー|SNEAKER|ALL STAR/i)) add('U',7,'フーディやスウェットからパンツ、スニーカーまで街着の流れがある',0,'tb');
  if(top.style==='e'&&bottom.style==='p'&&shoes.style==='s'&&top.street.role!=='statement') add('U',-6,'端正な上半身に個性派のボトムスとストリートの靴が重なる',0,'tb');
  const role=it=>it&&it.street?it.street.role:'';
  if(role(top)==='statement'&&role(bottom)==='statement'&&top.style!==bottom.style) add('U',-9,'上下が違うテイストで、ともに主役を主張する',1,'tb');
  // --- completeness axis rules (role / wearability problems) ---
  const innerBottom=has(bottom,/インナー.*スパッツ|LONG JOHNS|UNDERPANTS/i);
  if(innerBottom) add('CO',-20,'ボトムスが肌着一枚で、外出用のパンツがない',1,'tb');
  if(has(top,/エアバリアインナー|保温肌着/)) add('CO',-13,'インナーが外側のトップスになっている',1,'tb');
  if(has(shoes,/上履き|室内用|携帯スリッパ/)) add('CO',-11,'屋外用の一式に室内履きが入っている',1,'bs');
  if(has(bag,/ポリ袋|クラフト紙袋/)) add('CO',-7,'持ち運び用の袋がバッグの代わりになっている',0,'bs');
  const practical=items.filter(x=>['underlayer','utility','specialUse'].includes(role(x))).length;
  if(practical>=2&&['layering','underlayer'].includes(role(top))) add('CO',-7,'薄いトップスに実用品が複数重なり、外出着の軸が弱い',0,null);
  if(items.filter(x=>role(x)==='statement').length>=4) add('CO',-6,'主張の強い品が重なり、視線を集める場所が分散している',0,null);
  return R;
}

// ---------- main ----------
function scoreV2(items){
  const A=items.map(s2attr);
  const total=items.reduce((n,x)=>n+x.price,0);
  const brandCounts={}; for(const it of items) brandCounts[it.brand]=(brandCounts[it.brand]||0)+1;
  const topBrand=Object.keys(brandCounts).sort((a,b)=>brandCounts[b]-brandCounts[a])[0];
  const brandN=topBrand?brandCounts[topBrand]:0;
  const styleCounts={}; for(const it of items) styleCounts[it.style]=(styleCounts[it.style]||0)+1;
  const domStyle=Object.keys(styleCounts).sort((a,b)=>styleCounts[b]-styleCounts[a])[0];
  const domN=styleCounts[domStyle];
  const W=[32,32,17,12,7];
  // luxury: price family counted ONCE here (total + per-item log price)
  const priceTotal=s2clamp(Math.round(100*Math.log10(Math.max(1,total/6500))/2.18));
  const itemLux=items.map(it=>s2clamp(100*Math.log10(Math.max(1,it.price/700))/Math.log10(1200000/700)));
  const luxury=s2clamp(Math.round(.5*priceTotal+.5*(itemLux.reduce((a,b)=>a+b,0)/5)));
  // appeal: per-item appeal (attrs), slot-weighted
  const appeal=s2clamp(Math.round(items.reduce((s,it,i)=>s+A[i][12]*W[i],0)/100));
  // individuality
  const asserts=A.map(a=>a[11]);
  const meanAssert=asserts.reduce((a,b)=>a+b,0)/5;
  const maxAssert=Math.max(...asserts);
  const colorfulMean=A.reduce((s,a)=>s+(a[3]>=0?a[3]:40),0)/5;
  let indiv=s2clamp(Math.round(.5*maxAssert+.35*meanAssert+.15*colorfulMean));
  // Brand-identity credit (v14 WS4): a near-full uniform set from a
  // high-identity designer brand (mode / individualist styles) IS the
  // statement - the designer's language is the individuality, even when
  // the per-item assertion data reads quiet (e.g. Rick Owens basics
  // score assert 14-20 and cratered this axis to 17, capping a 4xSSR
  // brand pack at 84 pre-spread). Floor: 4 pieces -> 34, 5 -> 42.
  if(brandN>=4){
    const brandItems=items.filter(it=>it.brand===topBrand);
    const idShare=brandItems.filter(it=>it.style==='e'||it.style==='p').length/brandItems.length;
    if(idShare>=0.75) indiv=Math.max(indiv,26+(brandN-3)*8);
  }
  // Worldview floor (WS4): a full 5-piece single-style set in a mode /
  // individualist world is one coherent universe even across brands -
  // that coherence is itself individuality, so the axis floors at 34.
  if(domN===5&&(domStyle==='e'||domStyle==='p')) indiv=Math.max(indiv,34);
  // rules
  const R=s2rules(items,A);
  const byAxis={CP:[],SI:[],U:[],CO:[]};
  for(const r of R) byAxis[r.axis].push(r);
  const sum=arr=>arr.reduce((n,r)=>n+r.pts,0);
  // --- color/pattern axis ---
  let cp=60;
  const conf=A.map(a=>a[14]===1?1:a[14]===2?.55:0);
  const strongFams=new Map();
  A.forEach((a,i)=>{ if(a[0]&&!S2_NEUTRAL.has(a[0])) strongFams.set(a[0],(strongFams.get(a[0])||0)+conf[i]); });
  const strongCount=[...strongFams.values()].filter(v=>v>=.5).length;
  const neutralRatio=A.filter((a,i)=>a[0]&&S2_NEUTRAL.has(a[0])).length/5;
  if(strongCount===0) cp+=6;
  else if(strongCount===1){ cp+=12; const ai=A.findIndex(a=>a[0]&&!S2_NEUTRAL.has(a[0])); if(ai>=0&&A[ai][2]>=35) cp+=6; }
  else if(strongCount===2) cp+=3;
  else cp-=8*(strongCount-2);
  const multiCount=A.filter(a=>a[0]===15).length;
  if(multiCount>=2) cp-=7;
  const sats=A.map(a=>a[2]).filter(v=>v>=0);
  if(sats.length>=3&&Math.max(...sats)-Math.min(...sats)>58) cp-=4;
  const knownFams=A.map(a=>a[0]).filter(Boolean);
  if(knownFams.length===5&&new Set(knownFams).size===1) cp+=6;
  cp=s2clamp(Math.round(cp+sum(byAxis.CP)));
  // --- silhouette axis ---
  const si=s2clamp(Math.round(60+sum(byAxis.SI)));
  // --- style unity axis ---
  let u=58;
  if(domN>=5) u+=15; else if(domN===4) u+=11; else if(domN===3) u+=7; else if(domN===2) u+=3;
  u+=S2_BRAND_UNITY[brandN];
  // Worldview coherence (WS4): one style world (4+ of one style) told
  // in a single color story (at most one strong color family) reads as
  // one universe even when the brands differ.
  if(domN>=4&&strongCount<=1) u+=3;
  const MIX={cs:2,sc:2,ce:1,ec:1,sp:1,ps:1,ep:-2,pe:-2,cp:-1,pc:-1,se:-1,es:-1};
  for(const [i,j] of [[0,1],[1,2],[0,2]]){ const k=items[i].style+items[j].style; if(k[0]!==k[1]) u+=MIX[k]||0; }
  const forms=A.map(a=>a[9]).filter(v=>v>=0);
  if(forms.length>=2){ const spread=Math.max(...forms)-Math.min(...forms); if(spread>55) u-=10; else if(spread<25) u+=5; }
  u=s2clamp(Math.round(u+sum(byAxis.U)));
  // --- completeness axis ---
  let co=60;
  const othersAssert=asserts.filter((_,i)=>i!==asserts.indexOf(maxAssert));
  const heroIdx=asserts.indexOf(maxAssert);
  if(maxAssert>=60&&Math.max(...othersAssert)<=maxAssert-15) co+=10;
  if(asserts.filter(v=>v>=60).length>=3) co-=10;
  if(maxAssert<=35) co-=4;
  if(!byAxis.CO.some(r=>r.pts<0)&&!R.some(r=>r.severe)) co+=6; // no wearability problems at all
  // Full-set rarity credit (v14 WS4): a complete 5-piece set drawn
  // entirely at SR+ is finished by construction - every slot holds a
  // considered piece, so the axis credits the set, not just the hero.
  const minTier=Math.min(...items.map(s2tier));
  if(minTier>=3) co+=10; else if(minTier>=2) co+=8;
  co=s2clamp(Math.round(co+sum(byAxis.CO)));
  // derived axes
  const harmony=s2clamp(Math.round(.30*cp+.25*si+.25*u+.20*co));
  const fashion=s2clamp(Math.round(.30*cp+.25*si+.20*u+.15*co+.10*appeal));
  const daily=s2clamp(Math.round(52+(harmony-55)*.5+neutralRatio*18-luxury*.12-meanAssert*.12+(total<=30000?8:total>=200000?-10:0)));
  // overall (総合価値)
  let raw=.30*luxury+.15*appeal+.15*cp+.15*si+.10*u+.10*co+.05*indiv;
  const severe=R.filter(r=>r.severe);
  const broken=severe.length>0||harmony<42;
  let overall=50+(raw-50)*1.55; // calibration spread: axes cluster near 60, widen tails deterministically
  overall-=Math.min(20,severe.length*8);
  if(severe.length>=2) overall=Math.min(overall,45);
  if(severe.length>=1&&fashion<=luxury) overall=Math.min(overall,52); // money cannot buy out a broken outfit
  if(harmony<40) overall=Math.min(overall,50);
  if(luxury>=70&&fashion>=65) overall+=5;
  if(luxury>=85&&fashion>=68) overall+=5;
  if(fashion>=75&&indiv>=55) overall+=3;
  // --- explicit bonuses (REAL points inside the overall, not just chips) ---
  // Progressive curves: the same-style count and the top-brand count scale
  // 2->+2, 3->+4, 4->+7, 5->+10 (the old flat +1/+2 was display-only and
  // barely registered, so a 2-of-5 and a 5-of-5 outfit scored almost the
  // same). Plus a small rarity term from the mean draw tier (N0/R1/SR2/
  // SSR3 x2, capped at +6): a high-rarity draw should feel rewarded. ALL
  // of it is gated OFF for broken outfits (severe clash / atrocity /
  // harmony<42), so bonuses can never rescue junk. base = overall -
  // bonusSum stays the no-bonus score.
  const bonuses=[];
  if(!broken){
    if(domN>=2) bonuses.push([S2_STYLES[domStyle]+'統一ボーナス',S2_PROGRESSIVE[domN],'style',domStyle]);
    if(brandN>=2) bonuses.push([topBrand+' × '+brandN+' 同ブランドボーナス',S2_PROGRESSIVE[brandN],'brand',topBrand]);
    // Rarity as scored value (WS4): the MEAN tier pays progressively
    // (x2, as before) and the FLOOR tier pays on top - an all-SR+ set,
    // and especially an all-SSR set, is rewarded in the score itself.
    // Cap +10. Still inside the !broken gate: rarity never rescues a
    // genuinely clashing outfit.
    const meanTier=items.reduce((n,it)=>n+s2tier(it),0)/items.length;
    const rarityPts=Math.min(10,Math.round(meanTier*2)+(minTier>=2?3:minTier>=1?2:0)+(minTier>=3?3:0));
    if(rarityPts>0) bonuses.push(['レアリティボーナス',rarityPts,'rarity','rarity']);
  }
  const bonusSum=bonuses.reduce((n,b)=>n+b[1],0);
  overall+=bonusSum;
  // --- petit-prix ceiling relief (2026-11-24, user-approved with a hard cap) ---
  // Luxury is 30% of raw, so a perfectly coordinated cheap outfit used to
  // cap in the 70s no matter how well it was put together. Narrow relief:
  // ONLY when the outfit is genuinely cheap (total <= ¥30,000) AND genuinely
  // well put together (harmony >= 75 AND completeness axis >= 70) AND not
  // broken (no severe rule hits - the same gate as the bonuses), part of
  // the luxury shortfall is transferred back as pre-spread points:
  //   reliefPts = min(20, round((harmony-68)*0.55 + (complete-70)*0.2))
  // Junk/broken outfits get nothing (gate), the classification is untouched,
  // and the luxury caps below are relaxed for relieved outfits only (74/84
  // -> 92 pre-spread). HARD GUARANTEE (user requirement): a relieved outfit
  // can NEVER reach 100 - after the spread (and after the credibility
  // floor) its score is capped at 94, so smitten (95+) and 100 stay luxury
  // territory. The result exposes relief:true so the persona review can use
  // the everyday-love (DAILY) pools instead of runway praise.
  const reliefOK=!broken&&total<=30000&&harmony>=75&&co>=70;
  const reliefPts=reliefOK?Math.min(20,Math.round((harmony-68)*0.55+(co-70)*0.2)):0;
  if(reliefPts>0) overall+=reliefPts;
  if(luxury<20) overall=Math.min(overall,reliefPts>0?92:74);
  else if(luxury<35) overall=Math.min(overall,reliefPts>0?92:84);
  // The indiv<28 cap targets genuinely characterless outfits. A uniform
  // set (4+ pieces of one brand) has identity by construction and is
  // exempt: the cap must not silently erase the price/rarity signal of
  // a designer uniform (WS4 panel: OUR LEGACY uniform sat at indiv 24).
  if(indiv<28&&brandN<4) overall=Math.min(overall,84);
  overall=s2spread(s2clamp(Math.round(overall)));
  // --- credibility floor (zero-point audit, 2026-11-24) ---
  // Diagnosis of a user outfit that landed on exactly 0 (axes 63/51/60/74/
  // 56/26, luxury 6): raw 42.2 -> x1.55 calibration 37.9 -> ONE severe
  // pattern-clash penalty -8 -> 29.9 -> the spread's flat bottom (every
  // pre-spread value <=36 maps to 0) crushed it to 0. Three multiplicative
  // punishments compounded into a verdict the outfit's own axes contradict.
  // Fix: penalties may discount the score, never annihilate it. Unless the
  // outfit is genuinely hopeless (2+ severe reasons AND a very low raw),
  // the final score keeps a floor derived from the raw axis blend itself:
  // raw>=44 -> 10, >=40 -> 8, >=36 -> 5, >=32 -> 3, below that -> 0.
  // 0 is thereby reserved for outfits that are broken AND weak everywhere.
  if(!(severe.length>=2&&raw<40)){
    const credFloor=raw>=44?10:raw>=40?8:raw>=36?5:raw>=32?3:0;
    if(overall<credFloor) overall=credFloor;
  }
  // relief hard cap (see above): enforced LAST, after spread and floor, so
  // no relieved outfit can ever exceed 94 - 100 points is impossible here.
  if(reliefPts>0) overall=Math.min(overall,94);
  // classification (independent of the overall and of the bonuses)
  let cls;
  if(broken) cls=indiv>=52?'wild_fail':'dasai';
  else if(indiv>=55&&fashion>=60) cls='wild_good';
  else if(fashion>=67) cls='stylish';
  else if(harmony>=54) cls='plain';
  else if(fashion<46) cls='dasai';
  else cls='plain';
  const tier=total<=30000?'cheap':total<=150000?'mid':total<=500000?'high':'lux';
  // reasons structure
  const axisVals={luxury,appeal,color:cp,silhouette:si,style:u,complete:co};
  const axisLabels={luxury:'ラグジュアリー性',appeal:'アイテム単体の魅力',color:'色彩・柄の相性',silhouette:'シルエット',style:'スタイルの統一感',complete:'全体の完成度'};
  const sortedAxes=Object.keys(axisVals).sort((a,b)=>axisVals[b]-axisVals[a]);
  const plus=R.filter(r=>r.pts>0).sort((a,b)=>b.pts-a.pts), minus=R.filter(r=>r.pts<0).sort((a,b)=>a.pts-b.pts);
  const pairPts={}; for(const r of R) if(r.pair) pairPts[r.pair]=(pairPts[r.pair]||0)+r.pts;
  const pairName={tb:'トップス×ボトムス',bs:'ボトムス×シューズ',ts:'トップス×シューズ',ta:'トップス×小物'};
  const pairKeys=Object.keys(pairPts).sort((a,b)=>pairPts[b]-pairPts[a]);
  const sortedNonLux=sortedAxes.filter(k=>k!=='luxury');
  const reasons={
    bestAxis:sortedAxes[0], worstAxis:sortedAxes[sortedAxes.length-1],
    worstAxisNonLux:sortedNonLux[sortedNonLux.length-1],
    plus:plus.map(r=>r.note), minus:minus.map(r=>r.note),
    bestPair:pairKeys.length&&pairPts[pairKeys[0]]>0?pairName[pairKeys[0]]:null,
    worstPair:pairKeys.length&&pairPts[pairKeys[pairKeys.length-1]]<0?pairName[pairKeys[pairKeys.length-1]]:null,
    hero:{slot:S2_LABELS[heroIdx],brand:items[heroIdx].brand,name:items[heroIdx].name},
  };
  const axes={...axisVals,indiv,fashion,harmony,daily};
  const text=s2text(items,{cls,tier,axes,reasons,total,domStyle,hero:reasons.hero});
  const reasonText='内部評価：'+Object.keys(axisVals).map(k=>axisLabels[k]+' '+axisVals[k]).join('／')
    +'。分類：'+text.clsLabel+'。'
    +(plus.length?'加点：'+plus.map(r=>r.note+'（＋'+r.pts+'）').join('。')+'。':'')
    +(minus.length?'減点：'+minus.map(r=>r.note+'（−'+Math.abs(r.pts)+'）').join('。')+'。':'組み合わせによる目立った減点はありません。');
  return {v2:true, price:luxury, balance:harmony, overall, base:overall-bonusSum, bonuses, reason:reasonText,
    relief:reliefPts>0, reliefPts,
    axes, cls, clsLabel:text.clsLabel, tier, title:text.title, headline:text.headline,
    impression:text.impression, reasonComment:text.reasonComment, reasons, total};
}

// --- drama spread (final display-score transform) ---
// The internal axes (parameter bars) and the classification are computed
// exactly as before; only the final overall passes through this monotone
// piecewise-linear spread, so that high and low scores actually happen
// instead of everything clustering in the 50s-70s. Monotone increasing, so
// relative order, the price correlation and determinism (same outfit ->
// same score) are kept.
// Recalibrated 2026-11-24 for the progressive unity/brand bonuses + rarity
// term (which add real points pre-spread): the curve is shifted +6
// pre-spread points vs the v7 table (with the 75-point shoulder lifted
// 67->70 so a coherent mid outfit keeps its bonus gain), keeping the
// distribution inside the v7 bands in the 100k simulation (MEN): mean
// 55-62, 90+ 3-6%, <=30 10-15%. (Shift sweep at 30k with the new curves:
// +5 -> mean 62.8 / 90+ 9.2% / <=30 8.8%; +6 -> mean 60.7 / 90+ 3.4% /
// <=30 10.1%; +8 -> mean 56.7 / 90+ 2.5% / <=30 12.4%.)
const S2_SPREAD=[[0,0],[36,0],[44,8],[52,29],[62,43],[70,56],[75,70],[78,76],[80,84],[84,88],[86,92],[92,96],[98,98],[100,100]];
function s2spread(x){
  if(x<=0)return 0; if(x>=100)return 100;
  for(let i=1;i<S2_SPREAD.length;i++){
    if(x<=S2_SPREAD[i][0]){ const a=S2_SPREAD[i-1],b=S2_SPREAD[i]; return s2clamp(Math.round(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]))); }
  }
  return 100;
}

// ---------- titles / comments (all generated from the same reasons) ----------
// Player-facing text rule: NO internal axis names, NO axis numbers. Text is
// pure fashion commentary built from concrete outfit facts (price, hero item,
// colors/patterns, best/worst pair, plus/minus rule phenomena). The reasons
// structure decides WHICH facts and framing to use, so text never contradicts
// the scoring (e.g. an expensive quiet outfit is joked about as quiet money,
// never explained with axis arithmetic).
const S2_FAMS=[,'黒','白','グレー','ブラウン','ベージュ','赤','ピンク','オレンジ','黄','緑','青','紺','紫','メタリック','マルチ','カーキ'];
const S2_PATS=[,'ストライプ','チェック','ドット','花柄','アニマル・カモ','ボーダー','ロゴ柄','総柄'];
// Strip size/spec noise from a product name for player-facing text:
// parenthetical size ranges (25-27cm), (R)/（R）/Ⓡ marks, size letters (M),
// cm/サイズ spec notes. Keeps the core product descriptor.
function s2cleanName(name){
  let n=String(name||'');
  n=n.replace(/[（(][^（）()]*[）)]/g,m=>{const inner=m.slice(1,-1).trim();return /cm|センチ|サイズ|^[RＲ]$|^[SML]$|^\d+(?:\.\d+)?$/.test(inner)?'':m;});
  n=n.replace(/Ⓡ/g,'');
  n=n.replace(/\s*\d+(?:\.\d+)?\s*[-〜~]\s*\d+(?:\.\d+)?\s*cm/g,'');
  return n.replace(/\s+/g,' ').trim();
}
function s2shortName(name){
  let n=s2cleanName(String(name||'').split(' / ')[0].trim());
  if(n.length>24){
    let out='';
    for(const w of n.split(/\s+/)){ if((out+' '+w).trim().length>20)break; out=(out+' '+w).trim(); }
    n=out||n.slice(0,20);
  }
  return n;
}
function s2kindOf(notes){
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
function s2plusKindOf(notes){
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
const S2_MINUS_PHRASE={
  pattern:'柄と柄が正面からぶつかっている', season:'季節感が真逆を向いている',
  volume:'上下とも膨らんで、行き場のないボリューム感になっている', inner:'肌着が外出着の座に座ってしまっている',
  indoor:'室内履きが外の世界に紛れ込んでいる', bag:'バッグの代わりが買い物袋になっている',
  statement:'主役が多すぎて、全員が同時に喋っている', dressmix:'きれいな靴と部屋着パンツが鉢合わせしている',
  practical:'実用品ばかりが集まって、外出着の軸がぼやけている',
};
const S2_PLUS_PHRASE={
  pattern:'上下で柄を繰り返す小技', colorlink:'靴とバッグの色がさりげなくつながっているところ',
  volume:'上下のボリューム配分の上手さ', slim:'細身のラインがすっきり通っているところ',
  material:'上下の素材感に共通点があるところ', dress:'シャツから革靴まで格が揃っているところ',
  street:'街着の流れが一本通っているところ', knit:'ニット同士が呼応しているところ',
  season:'季節感まで揃えた手堅さ',
};
function s2facts(items,o){
  const {reasons,total,hero}=o;
  const A=items.map(s2attr);
  const strong=[],seen=new Set();
  A.forEach((a,i)=>{ if(a[0]&&!S2_NEUTRAL.has(a[0])&&a[14]!==0&&!seen.has(a[0])){seen.add(a[0]);strong.push(S2_FAMS[a[0]]);} });
  const pats=[]; A.forEach(a=>{ if(a[4]&&a[5]>=2&&!pats.includes(S2_PATS[a[4]]))pats.push(S2_PATS[a[4]]); });
  const minusKind=s2kindOf(reasons.minus), plusKind=s2plusKindOf(reasons.plus);
  const heroRef=hero.brand+'の'+s2shortName(hero.name);
  // Hero framing rule: a small accessory (accessory slot / socks) is never
  // framed as the outfit's center/主役 in commentary - center framing goes to
  // the priciest main garment (tops/bottoms/shoes); the accessory keeps the
  // supporting phrasings （主張している/効いている/は悪くない).
  const heroMinor=hero.slot==='小物'||/靴下|ソックス/.test(hero.name);
  const mainItem=items.slice(0,3).reduce((a,b)=>b.price>a.price?b:a);
  return {
    yen:s2yen(total),
    heroRef,
    heroCenterRef:heroMinor?(mainItem.brand+'の'+s2shortName(mainItem.name)):heroRef,
    heroBrand:hero.brand, heroSlot:hero.slot,
    colorDesc:strong.length?strong.slice(0,2).join('と')+'の効いた色使い':'黒・白を中心にした落ち着いた色使い',
    patDesc:pats.length?pats.join('と')+'の柄使い':null,
    minusPhrase:minusKind?S2_MINUS_PHRASE[minusKind]:null,
    plusPhrase:plusKind?S2_PLUS_PHRASE[plusKind]:null,
    worstPair:reasons.worstPair, bestPair:reasons.bestPair,
  };
}
function s2text(items,o){
  const {cls,tier,reasons}=o;
  const pick=arr=>s2pick(items,arr);
  const pickF=(arr,salt)=>arr[(s2hash(items)+salt*131)%arr.length];
  const clsLabel={plain:'無難',stylish:'オシャレ',dasai:'ダサい',wild_good:'個性的でオシャレ',wild_fail:'個性的だが成立していない'}[cls];
  const f=s2facts(items,o);
  let title,headline,impression,reason;
  if(cls==='plain'&&tier==='cheap'){
    title=pick(['休日の模範的一般人','街に溶け込む才能','普通を極めし者','圧倒的な親近感','日常生活の優等生']);
    headline=pick(['本日のミックスコーデ','平和な休日コーデ']);
    impression=pick(['予定を決めずに街を歩く日。誰の記憶にも残らない代わりに、誰にも嫌われない。','清潔感のある普段着。近所のカフェが似合う午後。','彼女の親に挨拶するなら、むしろこれが正解な一式。','駅前のベンチが似合う午後。事件は起きない。']);
    reason=pickF([
      ()=>`総額${f.yen}。何も間違っていない。何も起きてもいない。でもこの清潔感、近所では無敵。`,
      ()=>`${f.heroCenterRef}を中心に、色も形も喧嘩なし。普通のデートなら満点。ここが表紙を競う場所なだけ。`,
      ()=>`総額${f.yen}の平和な一式。${f.colorDesc}の手堅さはあるのに、事件が起きない。`,
      ()=>`${f.heroRef}で臨めば、彼女の親への挨拶なら正解のコーデ。表紙より、休日のショッピングモールが似合う。`,
      ()=>`破綻ゼロ、主張もゼロ。${f.heroBrand}ですら空気を読んで静かにしている。`,
      ()=>`${f.colorDesc}で穏やかにまとまった普段着。一般社会では優秀、ファッション界ではあまりにも平和。`,
    ],1)(f);
  }else if(cls==='plain'&&(tier==='high'||tier==='lux')){
    title=pick(['富裕層の休日','静かなる財力','上品すぎる一般人','お金持ちの休日']);
    headline=pick(['本日のミックスコーデ','静かな高級感']);
    impression=pick(['一見すると普通の休日コーデ。値札を見るまでは。','お金持ちが近所のカフェに行くとこうなる。','上品で完成度も高いが、ランウェイを沸かせるには少し大人しい。']);
    reason=pickF([
      ()=>`総額${f.yen}。なのにこの静けさ。一見ふつうの休日コーデ、値札を見るまでは。`,
      ()=>`お金持ちが近所のカフェに行くとこうなる。${f.heroRef}だけが、そっと格を主張している。`,
      ()=>`総額${f.yen}の上品さ。完成度は高いのに、ランウェイを沸かせる悪ノリが一滴足りない。`,
      ()=>`${f.heroCenterRef}を軸にした大人の休日。騒がない、媚びない、でも財布だけは正直。`,
      ()=>`総額${f.yen}の静けさ。静かな高級感とはこのこと。ただし表紙は、もう少しうるさい人のもの。`,
      ()=>`${f.colorDesc}で抑えた総額${f.yen}。金は使った。音は立てなかった。`,
    ],2)(f);
  }else if(cls==='plain'){
    title=pick(['街角の自由人','普通を極めし者','日常生活の優等生']);
    headline='本日のミックスコーデ';
    impression=pick(['予定を決めずに街を歩く日。','大きな破綻のない、穏やかな一式。','コンビニの前で友達と待ち合わせる休日。']);
    reason=pickF([
      ()=>`総額${f.yen}、大きな破綻のない穏やかな一式。${f.plusPhrase?f.plusPhrase+'はある。':''}決め手の事件は起きなかった。`,
      ()=>`${f.heroCenterRef}が中心の、平和な休日コーデ。悪くない。ただ、記憶に残るかは別問題。`,
      ()=>`色も形も仲良し。${f.colorDesc}で穏やかにまとまったが、主役の座は空席のまま。`,
      ()=>`${f.heroBrand}を擁しながらこの穏やかさ。主張のブレーキがよく効いている。`,
    ],3)(f);
  }else if(cls==='stylish'&&tier==='cheap'){
    title=pick(['プチプラ界の革命児','予算を超えた才能','コスパの支配者']);
    headline=pick(['コスパ最強コーデ','予算を超えた完成度']);
    impression=pick(['値札を見なければ、もっと高く評価されていたかもしれない。','財力ではなくセンスで勝負するタイプ。','近所の古着屋で一目置かれる人。']);
    reason=pickF([
      ()=>`総額${f.yen}でこの完成度。値札を見なければ、もっと高く見えた。`,
      ()=>`財力ではなくセンスで勝負するタイプ。決め手は${f.bestPair||'上下'}の相性。`,
      ()=>`${f.heroRef}が効いている。予算を超えた才能とは、このこと。`,
      ()=>`プチプラの意地を見た。${f.plusPhrase?f.plusPhrase+'が光る。':''}買い物上手として表彰したい。`,
      ()=>`${f.colorDesc}が安さを消している。総額${f.yen}とは、言われないと分からない。`,
    ],4)(f);
  }else if(cls==='stylish'){
    title=pick(['街角スナップ常連','ファッション界の主役','表紙候補']);
    headline=pick(['完成度の高い一式','センスの良いミックス']);
    impression=pick(['古着屋の前でスナップを頼まれる休日。','ギャラリーの白壁が似合う午後。','レコードショップの開店待ち。']);
    reason=pickF([
      ()=>`${f.heroCenterRef}を主役に、脇役がちゃんと仕事をしている。組み合わせに意図のある一式。`,
      ()=>`決め手は${f.bestPair||'色のつながり'}。${f.colorDesc}が全体を締めている。`,
      ()=>`総額${f.yen}、無駄な力みがない。スナップを頼まれる休日の顔。`,
      ()=>`${f.plusPhrase?f.plusPhrase+'。':f.heroCenterRef+'が全体を引っ張っている。'}どこを切り取っても絵になるバランス。`,
      ()=>`${f.heroBrand}の存在感と、それを邪魔しない周り。主役と脇役の給料差がはっきりしている。`,
    ],5)(f);
  }else if(cls==='dasai'&&(tier==='high'||tier==='lux')){
    title=pick(['金で解決できなかった男','財力とセンスの不一致','歩くブランド内紛']);
    headline=pick(['財力とセンスの不一致','高級ブランド同士の内紛']);
    impression=pick(['一つひとつは主役級。全員が主役を譲らなかった結果、こうなりました。','総額'+f.yen+'。統一感は別売りだった模様。','高級ブランド同士が全力で喧嘩している。']);
    reason=pickF([
      ()=>`総額${f.yen}。まとまりだけ、別売りだった模様。`,
      ()=>`一つひとつは主役級。${f.minusPhrase||'全員が主役を譲らなかった'}。財力とセンスが別々に到着した。`,
      ()=>`高級ブランド同士が全力で喧嘩している。${f.worstPair?'現場は'+f.worstPair+'。':''}仲裁に入るアイテムがいない。`,
      ()=>`${f.heroRef}は悪くない。周りが全員、同じくらい悪くないのが問題だった。`,
      ()=>`値札の合計は一流、まとまりは迷子。${f.minusPhrase||'方向性がそろっていない'}のが決定打。`,
    ],6)(f);
  }else if(cls==='dasai'){
    title=pick(['全身の意思疎通に失敗','ファッション界の事故物件','方向性が行方不明']);
    headline=pick(['意思疎通に失敗','方向性が行方不明']);
    impression=pick(['上半身と下半身が別々の予定で外出している。','色も柄も自由奔放。まとめ役が欲しかった。','集合場所は同じ。ドレスコードは全員別。']);
    reason=pickF([
      ()=>`予算の問題ではない。組み合わせの問題である。${f.minusPhrase||'方向性がそろっていない'}。`,
      ()=>`上半身と下半身が別々の予定で外出している。${f.worstPair?'特に'+f.worstPair+'が他人行儀。':''}`,
      ()=>`${f.minusPhrase||'色も形も自由奔放'}。誰か一人くらい、まとめ役が欲しかった。`,
      ()=>`色も形も自由奔放。${f.heroBrand}まで道に迷っている。`,
      ()=>`${f.heroRef}の良さが、周りの騒ぎでかき消された。もったいない一式。`,
    ],7)(f);
  }else if(cls==='wild_good'){
    title=pick(['ファッション上級者','個性を着こなす者','芸術性の高い一式']);
    headline=pick(['個性が成立したコーデ','上級者のミックス']);
    impression=pick(['待ち合わせで一番見つけやすい人。しかも、それが似合っている。','一般的ではないが、組み合わせとして成立している。','美術館の前で写真を頼まれる側の人。']);
    reason=pickF([
      ()=>`主役は${f.heroCenterRef}。一般的ではないのに、ちゃんと似合ってしまう不思議。`,
      ()=>`待ち合わせで一番見つけやすい人。しかも成立している。${f.plusPhrase?f.plusPhrase+'が効いている。':''}`,
      ()=>`主張は強い。でも衝突ではなく相乗効果。${f.colorDesc}まで計算のうちに見える。`,
      ()=>`${f.heroBrand}の本気と、それを受け止める脇役たち。上級者の綱渡りが成功した。`,
      ()=>`${f.patDesc?f.patDesc+'まで味方につけた。':'色も形も攻めている。'}普通の人なら事故になる配分を、着こなしで黙らせている。`,
    ],8)(f);
  }else{ // wild_fail
    title=pick(['主張の衝突現場','アイテム同士の内紛','個性の交通渋滞']);
    headline=pick(['主張の衝突','個性の交通渋滞']);
    impression=pick(['一つひとつは面白い。全員が同時に喋り出した結果、こうなりました。','個性的ではある。成立しているかは、また別の話。']);
    reason=pickF([
      ()=>`一つひとつは面白い。全員が同時に喋り出した結果、こうなりました。`,
      ()=>`個性的ではある。成立しているかは、また別の話。${f.minusPhrase||'全員の主張がぶつかっている'}。`,
      ()=>`${f.heroRef}の主張に、周りが全員対抗してきた。個性の交通渋滞。`,
      ()=>`主役不在ではなく、主役過多。${f.worstPair?f.worstPair+'の現場が':'全体が'}一番騒がしい。`,
      ()=>`アイテム同士の顔見知り感はゼロ。${f.minusPhrase||'方向性がまとまっていない'}のが響いた。`,
    ],9)(f);
  }
  // special overrides keep v1 flavour for full-brand packs
  if(items.every(x=>x.brand===items[0].brand)){ title='ひとりブランド特集'; }
  return {clsLabel,title,headline,impression,reasonComment:reason};
}
if(typeof module!=='undefined') module.exports={scoreV2,s2attr};
