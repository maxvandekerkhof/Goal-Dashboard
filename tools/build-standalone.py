#!/usr/bin/env python3
"""Bouwt goal-dashboard-standalone.html: het hele dashboard in één bestand.

Handig om te mailen, op een USB-stick te zetten of los te openen zonder
webserver. Draai vanuit de hoofdmap van het project:

    python3 tools/build-standalone.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "goal-dashboard-standalone.html"


def main() -> int:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css/style.css").read_text(encoding="utf-8")

    html = html.replace(
        '<link rel="stylesheet" href="css/style.css">',
        "<style>\n" + css + "\n  </style>",
    )

    # In dit ene bestand staat alle code inline, dus moet de beveiligingsregel
    # dat toestaan. De rest van de regel blijft even streng.
    if "script-src 'self'" not in html:
        print("Content-Security-Policy niet gevonden in index.html.", file=sys.stderr)
        return 1
    html = html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")

    def inline(match: "re.Match[str]") -> str:
        code = (ROOT / match.group(1)).read_text(encoding="utf-8")
        return "<script>\n" + code + "\n  </script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)

    if 'src="' in html:
        print("Er staan nog externe verwijzingen in het bestand.", file=sys.stderr)
        return 1

    OUT.write_text(html, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} geschreven ({len(html) // 1024} kB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
