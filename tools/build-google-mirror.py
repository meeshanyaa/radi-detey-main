# -*- coding: utf-8 -*-
"""Собирает google.html: копию index.html со встроенными стилями, скриптом и шрифтами.

Копию отдаёт веб-приложение Apps Script (doGet) на домене Google: github.io
с мобильного интернета некоторых операторов не открывается. Запуск из корня
репозитория: python3 tools/build-google-mirror.py
"""
import base64
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "styles.css").read_text(encoding="utf-8")
js = (root / "script.js").read_text(encoding="utf-8")

for name in ("golos-cyrillic.woff2", "golos-latin.woff2"):
    data = base64.b64encode((root / "fonts" / name).read_bytes()).decode("ascii")
    css = css.replace(f'url("fonts/{name}")', f'url("data:font/woff2;base64,{data}")')
assert "fonts/" not in css, "в стилях остались ссылки на файлы шрифтов"

lines_to_drop = ('<link rel="preload"', '<link rel="icon"', '<script src="script.js"')
html = "\n".join(l for l in html.split("\n") if not l.strip().startswith(lines_to_drop))
html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "</style>")
html = html.replace("</body>", "<script>\n" + js + "</script>\n</body>")

# страница открывается во фрейме Google: внешние ссылки уходят в новую вкладку, звонок и почта — в окно целиком
html = re.sub(r'<a ([^>]*?)href="(https?://[^"]+)"', r'<a \1href="\2" target="_blank" rel="noopener"', html)
html = re.sub(r'<a ([^>]*?)href="((?:tel|mailto):[^"]+)"', r'<a \1href="\2" target="_top"', html)

banner = ("<!-- Копия index.html для запасной ссылки на домене Google. Собрана tools/build-google-mirror.py, "
          "вручную не править. -->\n")
(root / "google.html").write_text(banner + html, encoding="utf-8")
print("google.html:", len((root / "google.html").read_bytes()), "байт")
