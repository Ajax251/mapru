#!/usr/bin/env python3
"""
Собирает один автономный HTML из index.html.
Все библиотеки скачиваются из интернета, шрифты встраиваются как base64.
pdf.worker.js встраивается как обычный <script> для работы на file://.
"""

import os
import re
import base64
import hashlib
from pathlib import Path
from urllib.parse import urlparse, urljoin

import requests
from bs4 import BeautifulSoup, Comment

# -------------------- настройки --------------------
SRC_HTML = "pdf.html"
OUT_HTML = "pdf-app.html"
CACHE_DIR = Path("_cache")
TIMEOUT = 60
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# -------------------- URL-адреса библиотек --------------------
LIBS = {
    "pdfjs": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    "pdfjs_worker": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    "pdflib": "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
    "jszip": "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
    "fontawesome_css": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
}

CACHE_DIR.mkdir(exist_ok=True)

# -------------------- вспомогательные функции --------------------
def _cache_path(url: str) -> Path:
    h = hashlib.sha1(url.encode()).hexdigest()[:12]
    name = os.path.basename(urlparse(url).path) or "file"
    return CACHE_DIR / f"{h}_{name}"

def fetch(url: str) -> bytes:
    """Скачивает файл или берёт из кеша."""
    local = _cache_path(url)
    if local.exists():
        return local.read_bytes()
    r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT})
    r.raise_for_status()
    local.write_bytes(r.content)
    print(f"  ↓ {url} ({len(r.content)} байт)")
    return r.content

def data_uri(data: bytes, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(data).decode("ascii")

# -------------------- встраивание CSS --------------------
FONT_URL_RE = re.compile(r"url\(\s*(['\"]?)([^)'\"]+)\1\s*\)", re.IGNORECASE)

def inline_css_assets(css_text: str, css_url: str) -> tuple[str, int]:
    """Встраивает url(...) в CSS как data: URI."""
    replaced = 0
    def repl(m):
        nonlocal replaced
        raw = m.group(2).strip()
        if raw.startswith("data:"):
            return m.group(0)
        # Разрешаем относительный путь относительно URL CSS
        if raw.startswith("//"):
            abs_url = "https:" + raw
        elif raw.startswith(("http://", "https://")):
            abs_url = raw
        else:
            abs_url = urljoin(css_url, raw)
        try:
            data = fetch(abs_url)
        except Exception as e:
            print(f"  ⚠ CSS url {raw}: {e}")
            return m.group(0)
        replaced += 1
        mime = "font/woff2" if ".woff2" in raw.lower() else "application/octet-stream"
        return f"url({data_uri(data, mime)})"
    return FONT_URL_RE.sub(repl, css_text), replaced

# -------------------- основная сборка --------------------
def build():
    base_dir = Path(SRC_HTML).parent.resolve()
    html = Path(SRC_HTML).read_text(encoding="utf-8-sig")
    soup = BeautifulSoup(html, "html.parser")

    # ---------- 1. Скачиваем все библиотеки ----------
    print("Скачивание библиотек...")
    pdfjs_code = fetch(LIBS["pdfjs"]).decode("utf-8", errors="ignore")
    worker_code = fetch(LIBS["pdfjs_worker"]).decode("utf-8", errors="ignore")
    pdflib_code = fetch(LIBS["pdflib"]).decode("utf-8", errors="ignore")
    jszip_code = fetch(LIBS["jszip"]).decode("utf-8", errors="ignore")
    fa_css = fetch(LIBS["fontawesome_css"]).decode("utf-8", errors="ignore")
    print("  ✓ Все библиотеки загружены.\n")

    # ---------- 2. Встраиваем Font Awesome CSS ----------
    print("Встраивание Font Awesome...")
    fa_css, n_fa = inline_css_assets(fa_css, LIBS["fontawesome_css"])
    fa_style = soup.new_tag("style")
    fa_style.string = fa_css

    # ---------- 3. Заменяем <link> и <script> в HTML ----------
    print("Обработка HTML...")
    # Удаляем Google Fonts (если есть)
    for link in soup.find_all("link", rel="stylesheet"):
        if "fonts.googleapis.com" in link.get("href", ""):
            print("  × Удалены Google Fonts (Roboto).")
            link.decompose()

    # Вставляем Font Awesome <style> в head
    if soup.head:
        soup.head.append(fa_style)

    # Удаляем старые <script src> для наших библиотек
    for script in soup.find_all("script", src=True):
        src = script.get("src", "")
        if any(k in src.lower() for k in ["pdf.min.js", "pdf-lib", "jszip", "worker"]):
            script.decompose()

    # ---------- 4. Создаём <script> для pdf.js, pdf-lib, jszip ----------
    pdfjs_script = soup.new_tag("script")
    pdfjs_script.string = pdfjs_code.replace("</script>", "<\\/script>")
    
    pdflib_script = soup.new_tag("script")
    pdflib_script.string = pdflib_code.replace("</script>", "<\\/script>")
    
    jszip_script = soup.new_tag("script")
    jszip_script.string = jszip_code.replace("</script>", "<\\/script>")

    # Вставляем pdf.js в head (или в начало body, если head нет)
    if soup.head:
        soup.head.append(pdfjs_script)
        soup.head.append(pdflib_script)
        soup.head.append(jszip_script)
    else:
        soup.insert(0, pdfjs_script)
        soup.insert(1, pdflib_script)
        soup.insert(2, jszip_script)

    # ---------- 5. Встраиваем worker pdf.js как обычный <script> ----------
    # Это заставит pdf.js работать через fake worker (работает на file://)
    worker_script = soup.new_tag("script")
    worker_script["id"] = "pdfjs-worker-inline"
    worker_script.string = worker_code.replace("</script>", "<\\/script>")

    # Ищем главный скрипт приложения (тот, что содержит pdfjsLib.getDocument)
    main_app_script = None
    for script in soup.find_all("script"):
        if script.get("src") or script.get("type"):
            continue
        if script.string and "pdfjsLib.getDocument" in script.string:
            main_app_script = script
            break

    if main_app_script:
        # Вставляем worker перед главным скриптом
        main_app_script.insert_before(worker_script)
        print("  ✓ Worker pdf.js встроен как обычный <script> (fake worker mode).")
    else:
        # Fallback: вставляем в конец body
        (soup.body or soup).append(worker_script)
        print("  ⚠ Worker pdf.js вставлен в конец документа.")

    # ---------- 6. Удаляем старую строку workerSrc из основного кода ----------
    worker_src_pat = re.compile(
        r"""pdfjsLib\.GlobalWorkerOptions\.workerSrc\s*=\s*['"][^'"]+['"]\s*;?"""
    )
    for script in soup.find_all("script"):
        if script.get("src") or script.get("type") or not script.string:
            continue
        if "pdfjsLib.GlobalWorkerOptions.workerSrc" in script.string:
            script.string = worker_src_pat.sub(
                "/* workerSrc удалён — используется fake worker */", script.string
            )
            print("  ✓ Строка pdfjsLib.GlobalWorkerOptions.workerSrc удалена.")

    # ---------- 7. Сохранение ----------
    out = str(soup)
    Path(OUT_HTML).write_text(out, encoding="utf-8")
    size_mb = len(out.encode("utf-8")) / (1024 * 1024)
    print(f"\n✅ Готово: {OUT_HTML}  ({size_mb:.2f} МБ)")

    # ---------- 8. Проверка ----------
    print("\n--- ПРОВЕРКА ИТОГОВОГО ФАЙЛА ---")
    checks = {
        "pdfjsLib определён": "GlobalWorkerOptions" in out,
        "pdf-lib определён": "PDFDocument" in out and "PDFLib" in out,
        "JSZip определён": "JSZip" in out,
        "Worker код встроен": "WorkerMessageHandler" in out,
        "pdfjsWorker global": ("globalThis.pdfjsWorker" in out or
                               "window.pdfjsWorker" in out or
                               ".pdfjsWorker=" in out),
        "Font Awesome шрифты": "data:font/woff2" in out,
    }
    for k, v in checks.items():
        print(f"  {'✓' if v else '❌'} {k}")

if __name__ == "__main__":
    build()