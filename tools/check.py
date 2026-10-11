# -*- coding: utf-8 -*-
"""Проверка страницы по разделу 9 STANDARD.md: ширины, прокрутка вбок, axe (WCAG 2.2 A/AA),
консоль, фокус, форма. Запуск: python3 check.py <base_url> <out_dir>
Нужны Python Playwright с Chromium и axe-core в tools/node_modules (npm install axe-core в папке tools)."""
import json
import sys
import os
from playwright.sync_api import sync_playwright

BASE, OUT = sys.argv[1].rstrip("/"), sys.argv[2]
os.makedirs(OUT, exist_ok=True)
AXE = open(os.path.join(os.path.dirname(__file__), "node_modules/axe-core/axe.min.js"), encoding="utf8").read()
WIDTHS = [320, 360, 390, 768, 1024, 1440]
report = {"overflow": [], "axe": {}, "console": [], "focus": [], "form": []}

with sync_playwright() as p:
    br = p.chromium.launch()
    for page_name in ["index.html", "components.html"]:
        for w in WIDTHS:
            ctx = br.new_context(viewport={"width": w, "height": 900}, device_scale_factor=1)
            pg = ctx.new_page()
            errs = []
            pg.on("console", lambda m, errs=errs: errs.append(m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e, errs=errs: errs.append(str(e)))
            pg.goto(f"{BASE}/{page_name}", wait_until="networkidle")
            sw = pg.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]")
            if sw[0] > sw[1]:
                # кто вылезает за край
                wide = pg.evaluate("""() => [...document.querySelectorAll('body *')].filter(e => {
                    const r = e.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 0.5;
                  }).slice(0, 8).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))""")
                report["overflow"].append({"page": page_name, "width": w, "scroll": sw, "elements": wide})
            pg.screenshot(path=f"{OUT}/{page_name.split('.')[0]}_{w}.png", full_page=True)
            if errs:
                report["console"].append({"page": page_name, "width": w, "errors": errs})
            if w in (390, 1440):
                pg.add_script_tag(content=AXE)
                res = pg.evaluate("""async () => { const r = await axe.run(document, {runOnly: {type: 'tag',
                    values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa','best-practice']}});
                    return r.violations.map(v => ({id: v.id, impact: v.impact, help: v.help,
                      nodes: v.nodes.slice(0, 5).map(n => n.target.join(' '))})); }""")
                report["axe"][f"{page_name}@{w}"] = res
            ctx.close()

    # фокус: обход Tab на телефоне и компьютере
    for w in (390, 1440):
        ctx = br.new_context(viewport={"width": w, "height": 900})
        pg = ctx.new_page()
        pg.goto(f"{BASE}/index.html", wait_until="networkidle")
        seen = []
        for i in range(60):
            pg.keyboard.press("Tab")
            info = pg.evaluate("""() => { const e = document.activeElement; if (!e || e === document.body) return null;
                const s = getComputedStyle(e); const r = e.getBoundingClientRect();
                const par = e.parentElement; const inl = e.tagName === 'A' && s.display === 'inline' && par &&
                  par.textContent.trim().length > e.textContent.trim().length + 10;
                return {tag: e.tagName, inline_sentence: inl, text: (e.getAttribute('aria-label') || e.textContent || e.name || '').trim().slice(0, 40),
                        outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor,
                        visible: r.width > 0 && r.height > 0, w: Math.round(r.width), h: Math.round(r.height)}; }""")
            if info is None:
                break
            seen.append(info)
        bad = [s for s in seen if not s["outline"].startswith("solid 3px") or not s["visible"]]
        small = [s for s in seen if s["visible"] and (s["w"] < 24 or s["h"] < 24) and not s["inline_sentence"]]
        report["focus"].append({"width": w, "count": len(seen), "no_ring_or_hidden": bad, "small_targets": small,
                                "order": [s["text"] for s in seen]})
        ctx.close()

    # меню на телефоне: открытие, Esc, возврат фокуса
    ctx = br.new_context(viewport={"width": 390, "height": 900})
    pg = ctx.new_page()
    pg.goto(f"{BASE}/index.html", wait_until="networkidle")
    nav_hidden = pg.evaluate("getComputedStyle(document.getElementById('nav')).display")
    pg.click(".menu-button")
    nav_open = pg.evaluate("getComputedStyle(document.getElementById('nav')).display")
    pg.keyboard.press("Escape")
    after = pg.evaluate("[getComputedStyle(document.getElementById('nav')).display, document.activeElement.className]")
    report["menu"] = {"closed": nav_hidden, "open": nav_open, "after_esc": after}
    ctx.close()

    # форма: сочетания полей (адрес отправки пуст, поэтому ждём сообщение «не настроена»)
    def run_case(name, fill, consent=True):
        ctx = br.new_context(viewport={"width": 390, "height": 900})
        pg = ctx.new_page()
        pg.goto(f"{BASE}/index.html", wait_until="networkidle")
        for k, v in fill.items():
            pg.fill(f"#{k}", v)
        if consent:
            pg.check("#consent")
        pg.click("button[type=submit]")
        pg.wait_for_timeout(300)
        res = pg.evaluate("""() => ({
            errors: [...document.querySelectorAll('.error:not([hidden])')].map(e => e.id + ': ' + e.textContent.trim()),
            invalid: [...document.querySelectorAll('[aria-invalid=true]')].map(e => e.id),
            focus: document.activeElement.id,
            status: document.getElementById('form-status').textContent.trim()})""")
        res["case"] = name
        report["form"].append(res)
        ctx.close()

    run_case("пустая форма без согласия", {}, consent=False)
    run_case("только имя и вопрос", {"name": "Тест", "message": "Проверка"})
    run_case("только e-mail", {"name": "Тест", "email": "test@example.org", "message": "Проверка"})
    run_case("только телефон с пробелами и 8", {"name": "Тест", "phone": "8 (900) 000-00-00", "message": "Проверка"})
    run_case("оба контакта", {"name": "Тест", "email": "test@example.org", "phone": "+7 900 000-00-00", "message": "Проверка"})
    run_case("плохой e-mail", {"name": "Тест", "email": "test@", "message": "Проверка"})
    run_case("короткий телефон", {"name": "Тест", "phone": "12345", "message": "Проверка"})
    br.close()

json.dump(report, open(f"{OUT}/report.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(json.dumps({k: (v if k != "focus" else [{kk: vv for kk, vv in f.items() if kk != "order"} for f in v])
                  for k, v in report.items()}, ensure_ascii=False, indent=1)[:12000])
