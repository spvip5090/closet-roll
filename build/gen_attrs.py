#!/usr/bin/env python3
"""CLOSET ROLL Phase 1: derive per-item attributes for all 1,318 catalog items.

Evidence sources ONLY:
  - product name keywords (color codes/words, pattern, material, silhouette,
    formality, season signals)
  - dominant color / lightness / saturation / colorfulness from the local photo
    (PIL, background pixels excluded)
  - existing catalog data (style, street.points/role, price, brand)
Anything not derivable stays -1 / 0 (unknown) and is treated as neutral by the
scoring engine. Output: work/attrs.js + build/coverage.json
"""
import json, re, math, colorsys, sys
from pathlib import Path
from PIL import Image

ROOT = Path.home() / "workspace/closet-roll"
cards_src = (ROOT / "original/cards.js").read_text(encoding="utf-8")
catalog = json.loads(cards_src[cards_src.index("=") + 1:].rstrip().rstrip(";"))

# color families: 0 unknown,1 black,2 white,3 gray,4 brown,5 beige,6 red,7 pink,
# 8 orange,9 yellow,10 green,11 blue,12 navy,13 purple,14 metallic,15 multi,16 khaki
NAME_COLORS = [
    (1,  r"\bBLK\b|\bBLACK\b|ブラック|黒"),
    (2,  r"\bWHT\b|\bWHITE\b|ホワイト|オフホワイト|白"),
    (12, r"\bNVY\b|\bNAVY\b|ネイビー|紺"),
    (3,  r"\bGRY\b|\bGRAY\b|\bGREY\b|グレー|灰"),
    (4,  r"\bBRW\b|\bBROWN\b|ブラウン|茶"),
    (5,  r"\bBEG\b|\bBEIGE\b|ベージュ|アイボリー|\bIVORY\b|クリーム|生成"),
    (7,  r"\bPNK\b|\bPINK\b|ピンク|桃"),
    (6,  r"\bRED\b|レッド|赤|ボルドー|\bBRD\b|ワイン"),
    (8,  r"\bORG\b|\bORANGE\b|オレンジ|橙"),
    (9,  r"\bYEL\b|\bYELLOW\b|イエロー|黄色|黄\b|マスタード"),
    (10, r"\bGRN\b|\bGREEN\b|グリーン|緑|ミント"),
    (16, r"カーキ|\bKHA\b|\bKHAKI\b|オリーブ|\bOLV\b"),
    (11, r"\bBLU\b|\bBLUE\b|ブルー|青|サックス|水色|デニムブルー"),
    (13, r"\bPPL\b|\bPURPLE\b|パープル|紫|ラベンダー"),
    (14, r"\bGLD\b|\bGOLD\b|ゴールド|金色|\bSLV\b|\bSILVER\b|シルバー|銀色|メタリック"),
]
PATTERNS = [  # (code, strength, regex) code:1 stripe 2 check 3 dot 4 floral 5 animal/camo 6 border 7 graphic/logo 8 other-print
    (1, 2, r"ストライプ|STRIPE"),
    (6, 2, r"ボーダー|BORDER"),
    (2, 2, r"チェック|千鳥|ギンガム|CHECK|PLAID|タータン"),
    (3, 2, r"ドット|水玉|DOT"),
    (4, 3, r"花柄|フラワー|FLORAL|ボタニカル"),
    (5, 3, r"迷彩|カモ|CAMO|レオパード|ヒョウ|LEOPARD|アニマル|ゼブラ|パイソン"),
    (7, 2, r"ロゴ|LOGO|プリント|PRINT|グラフィック|刺繍|フォト|イラスト"),
    (8, 3, r"総柄|柄シャツ|アロハ|ペイズリー|PAISLEY"),
]
MATERIALS = [  # bitmask
    (1,  r"デニム|ジーンズ|DENIM|JEANS"),
    (2,  r"レザー|LEATHER|本革|牛革|羊革|スエード|SUEDE"),
    (4,  r"ニット|KNIT|セーター|SWEATER|カーディガン"),
    (8,  r"スウェット|SWEAT|フリース|FLEECE|フーディ|HOODIE|パーカー"),
    (16, r"ナイロン|NYLON|ポリエステル"),
    (32, r"サテン|SATIN|シルク|SILK|ベルベット|VELVET"),
    (64, r"コットン|COTTON|綿|リネン|麻|LINEN"),
]
VOL = [(3, r"オーバーサイズ|ビッグシルエット|ワイド|バギー|ルーズ|JUMBO|WIDE|BAGGY|OVERSIZE|ゆったり"),
       (1, r"スリム|スキニー|タイト|SLIM|SKINNY|細身")]
LENGTH = [(2, r"ロング|LONG|マキシ"), (1, r"ショート|クロップド|ミニ|SHORT|CROP")]
FORMAL_UP = r"テーラード|TAILORED|スラックス|センタープレス|ローファー|LOAFER|ダービー|DERBY|パンプス|PUMPS|オックスフォード|OXFORD|ブレザー|BLAZER|ブラウス|ドレスシャツ"
FORMAL_DN = r"ジャージ|トラックパンツ|TRACK|トレーニング|サンダル|SANDAL|スニーカー|SNEAKER|カーゴ|CARGO|ジョガー|スウェットパンツ"
SEASON_COLD = r"ダウン|中綿|ボア|防寒|ムートン|DOWN|PUFFER|マフラー|手袋|ニット帽|ビーニー|耳当て"
SEASON_SUM = r"サンダル|SANDAL|タンクトップ|TANK TOP|ハーフパンツ|ショートパンツ|SHORTS|ビーチ|水着|キャミソール"
ASSERT_KW = r"スタッズ|チェーン|ダメージ|グランジ|アシンメトリー|変形|フリル|レースアップ|大ぶり|ビジュー"

def hue_family(h, s, v):
    if s < 0.10:
        return 1 if v < 0.25 else (3 if v < 0.65 else 2)
    deg = h * 360
    if deg < 15 or deg >= 345: return 6
    if deg < 50 and s < 0.40: return 5 if v > 0.60 else 4
    if deg < 42: return 8 if s > 0.45 else 4
    if deg < 70: return 9
    if deg < 165: return 10
    if deg < 200: return 11
    if deg < 250: return 12 if v < 0.45 else 11
    if deg < 290: return 13
    if deg < 345: return 7
    return 6

def photo_stats(path):
    """Return (family, lightness0-100, saturation0-100, colorfulness0-100, multi?) or None."""
    try:
        im = Image.open(path).convert("RGB")
    except Exception:
        return None
    im.thumbnail((40, 40))
    px = list(im.getdata())
    fg, sats = [], []
    for r, g, b in px:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        sats.append(s)
        if not (v > 0.93 and s < 0.12):  # near-white background
            fg.append((h, s, v))
    use = fg if len(fg) >= max(8, len(px) * 0.08) else [(colorsys.rgb_to_hsv(r/255, g/255, b/255)) for r, g, b in px]
    if not use: return None
    # saturation-weighted mean hue (circular)
    sx = sy = sw = 0.0; lv = sv = 0.0; bins = {}
    for h, s, v in use:
        w = 0.15 + s
        deg = h * 360
        if 12 <= deg <= 42 and 0.18 <= s <= 0.62 and 0.45 <= v <= 0.97:
            w *= 0.25  # skin-tone-like pixels: weak evidence for garment color
        sx += math.cos(h * 2 * math.pi) * w; sy += math.sin(h * 2 * math.pi) * w; sw += w
        lv += v; sv += s
        if s >= 0.25:
            bins[int(h * 12) % 12] = bins.get(int(h * 12) % 12, 0) + 1
    mh = (math.atan2(sy, sx) / (2 * math.pi)) % 1.0
    ms = sv / len(use); mv = lv / len(use)
    fam = hue_family(mh, ms, mv)
    multi = False
    if len(bins) >= 2:
        top = sorted(bins.values(), reverse=True)
        keys = sorted(bins, key=bins.get, reverse=True)
        if top[1] >= 0.35 * top[0] and abs(keys[0] - keys[1]) % 12 not in (0, 1, 11):
            multi = True
    colorful = round(min(100, (ms * 100) * 0.7 + (sum(abs(s - ms) for _, s, _ in use) / len(use)) * 100 * 0.6))
    return (15 if multi else fam, round(mv * 100), round(ms * 100), colorful)

def name_color(name):
    upper = name.upper()
    tail = name.split(" / ")[-1] if " / " in name else name
    for fam, pat in NAME_COLORS:
        if re.search(pat, tail.upper()) or re.search(pat, tail):
            return fam
    for fam, pat in NAME_COLORS:
        if re.search(pat, upper) or re.search(pat, name):
            return fam
    return 0

# brand price percentile (within brand, all slots)
from collections import defaultdict
brand_prices = defaultdict(list)
for group in catalog:
    for it in group:
        brand_prices[it["brand"]].append(it["price"])
for b in brand_prices: brand_prices[b].sort()

def brand_pct(brand, price):
    arr = brand_prices[brand]
    import bisect
    return round(100 * bisect.bisect_right(arr, price) / len(arr))

cov = defaultdict(int)
out_groups = []
for gi, group in enumerate(catalog):
    out = []
    for it in group:
        name = it["name"]; upper = name.upper()
        nc = name_color(name)
        ps = photo_stats(ROOT / "original" / it["img"])
        if ps: cov["photo_ok"] += 1
        cf_name = nc
        if nc: cov["color_name"] += 1
        if ps and ps[0] != 15: cov["color_photo"] += 1
        cf = nc if nc else (ps[0] if ps else 0)
        if cf: cov["color_any"] += 1
        li = ps[1] if ps else -1; sa = ps[2] if ps else -1; col = ps[3] if ps else -1
        pat, patstr = 0, 0
        for code, strength, rx in PATTERNS:
            if re.search(rx, upper) or re.search(rx, name):
                if strength > patstr: pat, patstr = code, strength
        if pat: cov["pattern"] += 1
        mat = 0
        for bit, rx in MATERIALS:
            if re.search(rx, upper) or re.search(rx, name): mat |= bit
        if mat: cov["material"] += 1
        vol = 0
        for v, rx in VOL:
            if re.search(rx, upper) or re.search(rx, name): vol = v; break
        if vol: cov["silhouette"] += 1
        leng = 0
        for v, rx in LENGTH:
            if re.search(rx, upper) or re.search(rx, name): leng = v; break
        fu = len(re.findall(FORMAL_UP, upper)) + len(re.findall(FORMAL_UP, name))
        fd = len(re.findall(FORMAL_DN, upper)) + len(re.findall(FORMAL_DN, name))
        form = -1
        if fu or fd:
            form = max(0, min(100, 50 + 22 * fu - 22 * fd)); cov["formality"] += 1
        season = (1 if re.search(SEASON_COLD, upper) or re.search(SEASON_COLD, name) else 0) \
               | (2 if re.search(SEASON_SUM, upper) or re.search(SEASON_SUM, name) else 0)
        if season: cov["season"] += 1
        bp = brand_pct(it["brand"], it["price"])
        role = it.get("street", {}).get("role", "")
        base_assert = {"statement": 68, "polished": 42, "everyday": 28}.get(role, 40)
        asrt = base_assert + patstr * 7 + (10 if re.search(ASSERT_KW, name) else 0)
        if sa >= 0: asrt += round((sa - 35) * 0.25)
        if col >= 0: asrt += round((col - 40) * 0.15)
        asrt = max(2, min(98, asrt)); cov["assert"] += 1
        pts = it.get("street", {}).get("points", 68)
        appeal = pts + round((asrt - 40) * 0.18) + (5 if mat & 34 else 0) + round((bp - 50) * 0.08)
        appeal = max(5, min(98, appeal))
        csrc = 1 if nc else (2 if ps else 0)
        if csrc == 1: cov["color_src_name"] += 1
        elif csrc == 2: cov["color_src_photo"] += 1
        out.append([cf, li, sa, col, pat, patstr, mat, vol, leng, form, season, asrt, appeal, bp, csrc])
    out_groups.append(out)

total = sum(len(g) for g in catalog)
header = ("// AUTO-GENERATED by build/gen_attrs.py - per-item derived attributes, parallel to catalog.\n"
          "// [colorFamily, lightness, saturation, colorfulness, pattern, patternStrength, materialBits,\n"
          "//  volume, length, formality, seasonBits, assertiveness, appeal, brandPricePct, colorSrc]  -1/0 = unknown (neutral).\n"
          "// colorSrc: 1 = from product name (high confidence), 2 = from photo dominant color (noisy on model shots).\n"
          "// colorFamily: 0? 1black 2white 3gray 4brown 5beige 6red 7pink 8orange 9yellow 10green 11blue 12navy 13purple 14metallic 15multi 16khaki\n")
(ROOT / "work/attrs.js").write_text(header + "const ATTRS=" + json.dumps(out_groups, separators=(",", ":")) + ";\n", encoding="utf-8")
cov_out = {"total": total, **{k: cov[k] for k in sorted(cov)},
           "pct": {k: round(100 * cov[k] / total, 1) for k in sorted(cov)}}
(ROOT / "build/coverage.json").write_text(json.dumps(cov_out, indent=1, ensure_ascii=False), encoding="utf-8")
print(json.dumps(cov_out, indent=1, ensure_ascii=False))
print("attrs.js bytes:", (ROOT / "work/attrs.js").stat().st_size)
