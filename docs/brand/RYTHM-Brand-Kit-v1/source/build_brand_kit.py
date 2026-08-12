from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"

NAVY = "#0B1220"
INDIGO = "#6472E8"
CYAN = "#4BC6D8"
CLOUD = "#F5F7FB"
WHITE = "#FFFFFF"
SLATE = "#667085"
LINE = "#D9DFEA"


def svg_shell(view_box: str, body: str, width: int | None = None, height: int | None = None) -> str:
    size = ""
    if width and height:
        size = f' width="{width}" height="{height}"'
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}"{size} role="img" aria-label="RYTHM Company OS logo">
  <title>RYTHM Company OS</title>
  <metadata>RYTHM Company OS Brand Identity System v1.0 - August 2026</metadata>
{body}
</svg>
'''


def mark_group(
    x: float = 0,
    y: float = 0,
    scale: float = 1,
    base: str = NAVY,
    dynamic: str = INDIGO,
    signal: str = CYAN,
) -> str:
    return f'''  <g transform="translate({x} {y}) scale({scale})">
    <rect x="16" y="16" width="56" height="56" rx="2" fill="{base}"/>
    <rect x="16" y="88" width="56" height="56" rx="2" fill="{base}"/>
    <rect x="16" y="160" width="56" height="56" rx="2" fill="{base}"/>
    <path fill="{dynamic}" d="M84 16h64c46 0 76 25 76 64s-30 64-76 64v-48c18 0 28-6 28-16s-10-16-28-16H84V16Z"/>
    <rect x="84" y="88" width="56" height="56" rx="2" fill="{signal}"/>
    <path fill="{dynamic}" d="M84 160h59l81 80h-66l-74-73v-7Z"/>
  </g>'''


def wordmark(
    x: float,
    y: float,
    main: str,
    sub: str,
    size: float = 126,
    sub_size: float = 34,
    anchor: str = "start",
) -> str:
    return f'''  <text x="{x}" y="{y}" text-anchor="{anchor}" fill="{main}" font-family="URW Gothic" font-size="{size}" font-weight="600" letter-spacing="7">RYTHM</text>
  <text x="{x + (5 if anchor == 'start' else 0)}" y="{y + 73}" text-anchor="{anchor}" fill="{sub}" font-family="Nimbus Sans" font-size="{sub_size}" font-weight="700" letter-spacing="14">COMPANY OS</text>'''


def write(name: str, content: str) -> None:
    (SOURCE / name).write_text(content, encoding="utf-8")


def build() -> None:
    primary_horizontal = svg_shell(
        "0 0 820 300",
        f'''{mark_group(22, 22, 1)}
{wordmark(326, 154, NAVY, INDIGO)}''',
    )
    write("logo-horizontal-primary.source.svg", primary_horizontal)

    inverse_horizontal = svg_shell(
        "0 0 820 300",
        f'''{mark_group(22, 22, 1, WHITE, WHITE, CYAN)}
{wordmark(326, 154, WHITE, "#9FA8FF")}''',
    )
    write("logo-horizontal-inverse.source.svg", inverse_horizontal)

    dark_bg_horizontal = svg_shell(
        "0 0 820 300",
        f'''  <rect width="820" height="300" rx="24" fill="{NAVY}"/>
{mark_group(22, 22, 1, WHITE, WHITE, CYAN)}
{wordmark(326, 154, WHITE, "#9FA8FF")}''',
    )
    write("logo-horizontal-dark-bg.source.svg", dark_bg_horizontal)

    stacked_primary = svg_shell(
        "0 0 700 720",
        f'''{mark_group(139, 35, 1.65)}
{wordmark(350, 535, NAVY, INDIGO, 118, 31, "middle")}''',
    )
    write("logo-stacked-primary.source.svg", stacked_primary)

    stacked_dark = svg_shell(
        "0 0 700 720",
        f'''  <rect width="700" height="720" rx="32" fill="{NAVY}"/>
{mark_group(139, 35, 1.65, WHITE, WHITE, CYAN)}
{wordmark(350, 535, WHITE, "#9FA8FF", 118, 31, "middle")}''',
    )
    write("logo-stacked-dark-bg.source.svg", stacked_dark)

    mark_primary = svg_shell("0 0 256 256", mark_group(), 1024, 1024)
    write("mark-primary.source.svg", mark_primary)

    mark_inverse = svg_shell("0 0 256 256", mark_group(0, 0, 1, WHITE, WHITE, CYAN), 1024, 1024)
    write("mark-inverse.source.svg", mark_inverse)

    mono_navy = svg_shell(
        "0 0 820 300",
        f'''{mark_group(22, 22, 1, NAVY, NAVY, NAVY)}
{wordmark(326, 154, NAVY, NAVY)}''',
    )
    write("logo-horizontal-monochrome-navy.source.svg", mono_navy)

    mono_white = svg_shell(
        "0 0 820 300",
        f'''{mark_group(22, 22, 1, WHITE, WHITE, WHITE)}
{wordmark(326, 154, WHITE, WHITE)}''',
    )
    write("logo-horizontal-monochrome-white.source.svg", mono_white)

    nav = svg_shell(
        "0 0 430 104",
        f'''{mark_group(10, 10, 0.34)}
  <text x="112" y="53" fill="{NAVY}" font-family="URW Gothic" font-size="44" font-weight="600" letter-spacing="3">RYTHM</text>
  <text x="114" y="78" fill="{SLATE}" font-family="Nimbus Sans" font-size="13" font-weight="700" letter-spacing="5">COMPANY OS</text>''',
    )
    write("logo-navbar-primary.source.svg", nav)

    nav_inverse = svg_shell(
        "0 0 430 104",
        f'''{mark_group(10, 10, 0.34, WHITE, WHITE, CYAN)}
  <text x="112" y="53" fill="{WHITE}" font-family="URW Gothic" font-size="44" font-weight="600" letter-spacing="3">RYTHM</text>
  <text x="114" y="78" fill="#AAB3C5" font-family="Nimbus Sans" font-size="13" font-weight="700" letter-spacing="5">COMPANY OS</text>''',
    )
    write("logo-navbar-inverse.source.svg", nav_inverse)

    favicon = svg_shell(
        "0 0 256 256",
        f'''  <rect x="4" y="4" width="248" height="248" rx="54" fill="{NAVY}"/>
{mark_group(28, 28, 0.78, WHITE, WHITE, CYAN)}''',
        256,
        256,
    )
    write("favicon.source.svg", favicon)

    app_icon = svg_shell(
        "0 0 512 512",
        f'''  <rect width="512" height="512" rx="112" fill="{NAVY}"/>
  <rect x="24" y="24" width="464" height="464" rx="92" fill="none" stroke="#25304A" stroke-width="4"/>
{mark_group(56, 56, 1.56, WHITE, WHITE, CYAN)}''',
        512,
        512,
    )
    write("app-icon.source.svg", app_icon)

    social_avatar = svg_shell(
        "0 0 1200 1200",
        f'''  <rect width="1200" height="1200" rx="180" fill="{NAVY}"/>
  <circle cx="600" cy="570" r="420" fill="#111A2D" stroke="#283552" stroke-width="5"/>
{mark_group(396, 365, 1.62, WHITE, WHITE, CYAN)}
  <text x="600" y="1040" text-anchor="middle" fill="#AAB3C5" font-family="Nimbus Sans" font-size="48" font-weight="700" letter-spacing="13">COMPANY OS</text>''',
        1200,
        1200,
    )
    write("social-avatar.source.svg", social_avatar)

    board = svg_shell(
        "0 0 1600 1100",
        f'''  <rect width="1600" height="1100" fill="{CLOUD}"/>
  <rect x="0" y="0" width="1600" height="430" fill="{NAVY}"/>
  <text x="90" y="90" fill="#9FA8FF" font-family="Nimbus Sans" font-size="24" font-weight="700" letter-spacing="7">RYTHM BRAND IDENTITY / V1.0</text>
{mark_group(92, 125, 0.85, WHITE, WHITE, CYAN)}
{wordmark(370, 275, WHITE, "#9FA8FF", 132, 31)}
  <text x="90" y="520" fill="{NAVY}" font-family="URW Gothic" font-size="54" font-weight="600">Governed intelligence in motion.</text>
  <text x="92" y="575" fill="{SLATE}" font-family="Nimbus Sans" font-size="25">A modular operating mark for human authority, AI coordination, and traceable execution.</text>
  <g transform="translate(90 650)">
    <rect width="260" height="230" rx="22" fill="{NAVY}"/><text x="24" y="172" fill="white" font-family="Nimbus Sans" font-size="18" font-weight="700">AUTHORITY NAVY</text><text x="24" y="204" fill="#AAB3C5" font-family="Nimbus Sans" font-size="18">#0B1220</text>
  </g>
  <g transform="translate(375 650)">
    <rect width="260" height="230" rx="22" fill="{INDIGO}"/><text x="24" y="172" fill="white" font-family="Nimbus Sans" font-size="18" font-weight="700">GOVERNANCE INDIGO</text><text x="24" y="204" fill="white" font-family="Nimbus Sans" font-size="18">#6472E8</text>
  </g>
  <g transform="translate(660 650)">
    <rect width="260" height="230" rx="22" fill="{CYAN}"/><text x="24" y="172" fill="{NAVY}" font-family="Nimbus Sans" font-size="18" font-weight="700">DECISION CYAN</text><text x="24" y="204" fill="{NAVY}" font-family="Nimbus Sans" font-size="18">#4BC6D8</text>
  </g>
  <g transform="translate(945 650)">
    <rect width="260" height="230" rx="22" fill="white" stroke="{LINE}"/><text x="24" y="172" fill="{NAVY}" font-family="Nimbus Sans" font-size="18" font-weight="700">SYSTEM CLOUD</text><text x="24" y="204" fill="{SLATE}" font-family="Nimbus Sans" font-size="18">#F5F7FB</text>
  </g>
  <g transform="translate(1230 650)">
    <rect width="280" height="230" rx="22" fill="white" stroke="{LINE}"/>
{mark_group(75, 24, 0.52)}
    <text x="140" y="204" text-anchor="middle" fill="{NAVY}" font-family="Nimbus Sans" font-size="18" font-weight="700">MODULAR R MARK</text>
  </g>
  <line x1="90" y1="955" x2="1510" y2="955" stroke="{LINE}" stroke-width="2"/>
  <text x="90" y="1025" fill="{NAVY}" font-family="Nimbus Sans" font-size="23" font-weight="700">Human authority</text>
  <text x="365" y="1025" fill="{NAVY}" font-family="Nimbus Sans" font-size="23" font-weight="700">Modular AI organization</text>
  <text x="755" y="1025" fill="{NAVY}" font-family="Nimbus Sans" font-size="23" font-weight="700">Governed decision point</text>
  <text x="1160" y="1025" fill="{NAVY}" font-family="Nimbus Sans" font-size="23" font-weight="700">Decision to execution</text>''',
        1600,
        1100,
    )
    write("brand-board.source.svg", board)


if __name__ == "__main__":
    build()
