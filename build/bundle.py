#!/usr/bin/env python3
"""Regenerate dist/ preview + widget bundles from work/ (same transforms as the
original v2 bundles):
- inline style.css and all scripts in index.html order
- strip the Cloudflare challenge script copied from the published page
- photos -> absolute URLs on the original public site (cards.js data + HTML)
- report.html / release.html links -> absolute
- widget only: in-memory localStorage shim inserted before the first script,
  and `localStorage` references replaced with `__crMem`
"""
import re
from pathlib import Path

ROOT = Path.home() / "workspace/closet-roll"
W = ROOT / "work"
BASE = "https://closet-roll-mix.hospitablesaffron6.chatgpt.site/"

html = (W / "index.html").read_text(encoding="utf-8")
html = re.sub(r"<script>\(function\(\)\{function c\(\).*?</script>", "", html, flags=re.S)
css = (W / "style.css").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>{css}</style>")
html = html.replace('src="photos/', f'src="{BASE}photos/')
html = html.replace('href="report.html"', f'href="{BASE}report.html"')
html = html.replace('href="release.html"', f'href="{BASE}release.html"')


def inline(m):
    name = m.group(1)
    code = (W / name).read_text(encoding="utf-8")
    if name == "cards.js":
        code = code.replace('"img":"photos/', f'"img":"{BASE}photos/')
    assert "</script>" not in code, name
    return "<script>\n" + code + "\n</script>"


html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
(ROOT / "dist" / "closet-roll-v2-preview.html").write_text(html, encoding="utf-8")

SHIM = ('<script>window.__crMem={_d:{},getItem:function(k){return k in this._d?this._d[k]:null},'
        'setItem:function(k,v){this._d[k]=String(v)},removeItem:function(k){delete this._d[k]}};</script>')
widget = html.replace("<script>\nconst catalog=", SHIM + "<script>\nconst catalog=", 1)
widget = widget.replace("localStorage", "__crMem")
(ROOT / "dist" / "closet-roll-v2-widget.html").write_text(widget, encoding="utf-8")
print("preview", len(html), "widget", len(widget))
