"""Builds the practice report PDF.

Fills title.json into report.html, prints it with headless Chrome, finds the page of
every heading in the printed PDF and prints again with a filled table of contents.
"""
import html
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SOURCE = HERE / "report.html"
STAGE = HERE / ".report.build.html"
OUT_PDF = HERE / "ПОЯСНЮВАЛЬНА_ЗАПИСКА_ПРАКТИКА.pdf"
TOC_PAGE = 2

HEADING = re.compile(r"<h([12])>(.*?)</h\1>", re.S)
# An empty title field stays as blank space, so the underlined slot can be filled by hand.
BLANK = "&nbsp;" * 12


def render_field(value: str) -> str:
    return html.escape(value.strip()) if value.strip() else BLANK


def plain(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", fragment))).strip()


def headings(source: str) -> list[dict]:
    found = []
    for level, inner in HEADING.findall(source):
        lines = [part.strip() for part in re.split(r"<br\s*/?>", inner)]
        if plain(lines[0]) == "ЗМІСТ":
            continue
        found.append({
            "level": int(level),
            "label": ". ".join(lines),
            "key": " ".join(plain(lines[0]).split()[:3]),
        })
    return found


def toc_html(entries: list[dict], pages: dict[str, int] | None) -> str:
    rows = []
    for entry in entries:
        page = pages.get(entry["key"], "??") if pages else "00"
        rows.append(
            f'<div class="toc-row l{entry["level"]}"><span class="t">{entry["label"]}</span>'
            f'<span class="dots"></span><span class="p">{page}</span></div>'
        )
    return "\n".join(rows)


def print_pdf(page_html: str) -> None:
    STAGE.write_text(page_html, encoding="utf-8")
    result = subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={OUT_PDF}", STAGE.resolve().as_uri()],
        capture_output=True, text=True, timeout=180,
    )
    if not OUT_PDF.exists() or result.returncode != 0:
        sys.exit(f"Chrome failed to print the PDF:\n{result.stderr}")


def page_texts() -> list[str]:
    text = subprocess.run(["pdftotext", "-layout", str(OUT_PDF), "-"],
                          capture_output=True, text=True, check=True).stdout
    return text.split("\f")


def locate(entries: list[dict]) -> dict[str, int]:
    pages = [[re.sub(r"\s+", " ", line).strip() for line in page.splitlines()] for page in page_texts()]
    located, start = {}, TOC_PAGE  # 0-based index TOC_PAGE is the page after the contents
    for entry in entries:
        for index in range(start, len(pages)):
            if any(line.startswith(entry["key"]) for line in pages[index]):
                located[entry["key"]] = index + 1
                start = index
                break
        else:
            print(f"warning: heading not found in PDF: {entry['key']}", file=sys.stderr)
    return located


def main() -> None:
    fields = json.loads((HERE / "title.json").read_text(encoding="utf-8"))
    source = SOURCE.read_text(encoding="utf-8")
    for key, value in fields.items():
        source = source.replace("{{" + key + "}}", render_field(value))
    leftover = re.findall(r"\{\{(\w+)\}\}", source.replace("{{TOC}}", ""))
    if leftover:
        sys.exit(f"title.json is missing fields: {', '.join(sorted(set(leftover)))}")
    entries = headings(source)

    print_pdf(source.replace("{{TOC}}", toc_html(entries, None)))
    first = locate(entries)
    print_pdf(source.replace("{{TOC}}", toc_html(entries, first)))
    second = locate(entries)
    STAGE.unlink(missing_ok=True)

    if first != second:
        print("warning: page numbers shifted between passes, run the build again", file=sys.stderr)
    total = len([p for p in page_texts() if p.strip()])
    print(f"{OUT_PDF.name}: {total} pages")
    for entry in entries:
        print(f"  {second.get(entry['key'], '??'):>3}  {entry['key']}")


if __name__ == "__main__":
    main()
