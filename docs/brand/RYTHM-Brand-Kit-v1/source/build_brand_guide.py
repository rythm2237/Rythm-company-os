from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "RYTHM-Brand-Guidelines-v1.0.pdf"
W, H = landscape(A4)

NAVY = HexColor("#0B1220")
INDIGO = HexColor("#6472E8")
CYAN = HexColor("#4BC6D8")
CLOUD = HexColor("#F5F7FB")
SLATE = HexColor("#667085")
LINE = HexColor("#D9DFEA")
GREEN = HexColor("#2FB878")
AMBER = HexColor("#E2A13D")

FONT_REGULAR = "RYTHMSans"
FONT_BOLD = "RYTHMSansBold"
FONT_MONO = "RYTHMMono"

pdfmetrics.registerFont(TTFont(FONT_REGULAR, "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont(FONT_BOLD, "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont(FONT_MONO, "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"))


def mark(c: canvas.Canvas, x: float, y: float, size: float, base=NAVY, dynamic=INDIGO, signal=CYAN) -> None:
    s = size / 256

    def px(v: float) -> float:
        return x + v * s

    def py(v: float) -> float:
        return y + v * s

    c.setFillColor(base)
    for yy in (16, 88, 160):
        c.roundRect(px(16), py(256 - yy - 56), 56 * s, 56 * s, 2 * s, stroke=0, fill=1)

    c.setFillColor(dynamic)
    p = c.beginPath()
    p.moveTo(px(84), py(240))
    p.lineTo(px(148), py(240))
    p.curveTo(px(194), py(240), px(224), py(215), px(224), py(176))
    p.curveTo(px(224), py(137), px(194), py(112), px(148), py(112))
    p.lineTo(px(148), py(160))
    p.curveTo(px(166), py(160), px(176), py(166), px(176), py(176))
    p.curveTo(px(176), py(186), px(166), py(192), px(148), py(192))
    p.lineTo(px(84), py(192))
    p.close()
    c.drawPath(p, stroke=0, fill=1)

    c.setFillColor(signal)
    c.roundRect(px(84), py(112), 56 * s, 56 * s, 2 * s, stroke=0, fill=1)

    c.setFillColor(dynamic)
    p = c.beginPath()
    p.moveTo(px(84), py(96))
    p.lineTo(px(143), py(96))
    p.lineTo(px(224), py(16))
    p.lineTo(px(158), py(16))
    p.lineTo(px(84), py(89))
    p.close()
    c.drawPath(p, stroke=0, fill=1)


def page_bg(c: canvas.Canvas, dark: bool = False) -> None:
    c.setFillColor(NAVY if dark else CLOUD)
    c.rect(0, 0, W, H, stroke=0, fill=1)


def label(c: canvas.Canvas, text: str, x: float, y: float, dark: bool = False) -> None:
    c.setFillColor(HexColor("#9FA8FF") if dark else INDIGO)
    c.setFont(FONT_BOLD, 8.5)
    c.drawString(x, y, text.upper())


def title(c: canvas.Canvas, text: str, x: float, y: float, dark: bool = False, size: float = 30) -> None:
    c.setFillColor(white if dark else NAVY)
    c.setFont(FONT_BOLD, size)
    c.drawString(x, y, text)


def body(c: canvas.Canvas, text: str, x: float, y: float, width: float, dark: bool = False, size: float = 11, leading: float = 16) -> float:
    color = HexColor("#AAB3C5") if dark else SLATE
    c.setFillColor(color)
    c.setFont(FONT_REGULAR, size)
    words = text.split()
    line = ""
    yy = y
    for word in words:
        candidate = f"{line} {word}".strip()
        if stringWidth(candidate, FONT_REGULAR, size) <= width:
            line = candidate
        else:
            c.drawString(x, yy, line)
            yy -= leading
            line = word
    if line:
        c.drawString(x, yy, line)
        yy -= leading
    return yy


def footer(c: canvas.Canvas, n: int, dark: bool = False) -> None:
    c.setStrokeColor(HexColor("#25304A") if dark else LINE)
    c.line(44, 31, W - 44, 31)
    c.setFillColor(HexColor("#7D879B") if dark else SLATE)
    c.setFont(FONT_REGULAR, 7.5)
    c.drawString(44, 18, "RYTHM COMPANY OS / BRAND IDENTITY SYSTEM / V1.0")
    c.drawRightString(W - 44, 18, f"{n:02d}")


def logo_lockup(c: canvas.Canvas, x: float, y: float, mark_size: float, dark: bool = False) -> None:
    base = white if dark else NAVY
    signal = CYAN
    mark(c, x, y, mark_size, base, base if dark else INDIGO, signal)
    c.setFillColor(base)
    c.setFont(FONT_BOLD, mark_size * 0.43)
    c.drawString(x + mark_size * 1.28, y + mark_size * 0.48, "RYTHM")
    c.setFillColor(HexColor("#9FA8FF") if dark else INDIGO)
    c.setFont(FONT_BOLD, mark_size * 0.105)
    c.drawString(x + mark_size * 1.30, y + mark_size * 0.25, "C O M P A N Y   O S")


def card(c: canvas.Canvas, x: float, y: float, w: float, h: float, fill=white) -> None:
    c.setFillColor(fill)
    c.setStrokeColor(LINE)
    c.roundRect(x, y, w, h, 14, stroke=1, fill=1)


def swatch(c: canvas.Canvas, x: float, y: float, color, name: str, value: str, usage: str) -> None:
    c.setFillColor(color)
    c.roundRect(x, y + 43, 142, 92, 12, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 10)
    c.drawString(x, y + 28, name)
    c.setFillColor(SLATE)
    c.setFont(FONT_REGULAR, 9)
    c.drawString(x, y + 14, value)
    c.setFont(FONT_REGULAR, 7.5)
    c.drawString(x, y, usage)


def build() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=(W, H), pageCompression=1)
    c.setTitle("RYTHM Company OS - Brand Identity System v1.0")
    c.setAuthor("RYTHM Company OS")

    # 01 Cover
    page_bg(c, True)
    label(c, "Brand identity system", 54, H - 58, True)
    logo_lockup(c, 54, 220, 176, True)
    title(c, "Governed intelligence in motion.", 54, 158, True, 28)
    body(c, "A modular identity for human authority, AI coordination, and traceable execution.", 56, 126, 520, True, 12, 18)
    c.setFillColor(CYAN)
    c.circle(W - 89, 71, 7, stroke=0, fill=1)
    c.setFillColor(HexColor("#AAB3C5"))
    c.setFont(FONT_BOLD, 8)
    c.drawRightString(W - 108, 68, "VERSION 1.0 / AUGUST 2026")
    c.showPage()

    # 02 Strategic foundation
    page_bg(c)
    label(c, "01 / Strategic foundation", 44, H - 48)
    title(c, "Identity before decoration", 44, H - 88)
    body(c, "RYTHM is an AI-native Company Operating System, not a chatbot. The identity therefore signals accountable authority, modular organization, governed coordination, and operational movement.", 44, H - 122, 610, False, 11, 17)
    card(c, 44, 93, 235, 238)
    label(c, "Mission", 64, 298)
    body(c, "Build governed AI-native companies that improve human capability while keeping consequential authority under accountable human control.", 64, 271, 194, False, 10.5, 16)
    card(c, 301, 93, 235, 238)
    label(c, "Vision", 321, 298)
    body(c, "Become the trusted operating layer through which organizations coordinate humans, AI agents, decisions, knowledge, and execution.", 321, 271, 194, False, 10.5, 16)
    card(c, 558, 93, 240, 238)
    label(c, "Design principles", 578, 298)
    for i, item in enumerate(("Precise, never ornamental", "Technological, not cyberpunk", "Alive, not visually noisy", "Premium and enterprise credible", "Accessible at every size")):
        c.setFillColor(CYAN if i == 0 else INDIGO)
        c.circle(583, 267 - i * 34, 3.5, stroke=0, fill=1)
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, 9.2)
        c.drawString(595, 263 - i * 34, item)
    footer(c, 2)
    c.showPage()

    # 03 Symbol
    page_bg(c)
    label(c, "02 / The modular R", 44, H - 48)
    title(c, "An operating system in one mark", 44, H - 88)
    card(c, 44, 105, 320, 330)
    mark(c, 96, 148, 220)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    for pos in (96 + 16 * 220 / 256, 96 + 72 * 220 / 256, 96 + 84 * 220 / 256, 96 + 140 * 220 / 256):
        c.line(pos, 130, pos, 390)
    x0, y0 = 408, 388
    meanings = [
        ("01", "Authority axis", "The left modules hold the organization to a stable chain of accountable authority."),
        ("02", "AI organization", "Repeated modules represent agents, departments, memory, projects, and governed operating units."),
        ("03", "Decision point", "The cyan node is the visible moment where context, control, and approval meet."),
        ("04", "Execution vector", "The diagonal leg turns deliberation into accountable action and traceable outcomes."),
    ]
    for idx, head, desc in meanings:
        c.setFillColor(INDIGO if idx != "03" else CYAN)
        c.setFont(FONT_BOLD, 10)
        c.drawString(x0, y0, idx)
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, 13)
        c.drawString(x0 + 36, y0, head)
        body(c, desc, x0 + 36, y0 - 20, 330, False, 9.3, 13)
        y0 -= 79
    footer(c, 3)
    c.showPage()

    # 04 Logo architecture
    page_bg(c)
    label(c, "03 / Logo architecture", 44, H - 48)
    title(c, "Built for every interface", 44, H - 88)
    card(c, 44, 300, 750, 150)
    logo_lockup(c, 72, 327, 100)
    label(c, "Primary horizontal lockup", 560, 414)
    body(c, "Use for landing pages, documents, product headers, and partner materials.", 560, 391, 205, False, 9, 13)
    card(c, 44, 91, 230, 180)
    mark(c, 94, 123, 130)
    label(c, "Symbol", 65, 111)
    card(c, 298, 91, 230, 180)
    mark(c, 356, 128, 110)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 30)
    c.drawCentredString(413, 112, "RYTHM")
    label(c, "Stacked / avatar", 319, 101)
    card(c, 552, 91, 242, 180, NAVY)
    mark(c, 570, 132, 102, white, white, CYAN)
    c.setFillColor(white)
    c.setFont(FONT_BOLD, 20)
    c.drawString(682, 168, "RYTHM")
    c.setFillColor(HexColor("#9FA8FF"))
    c.setFont(FONT_BOLD, 5.5)
    c.drawString(683, 153, "COMPANY OS")
    footer(c, 4)
    c.showPage()

    # 05 Color
    page_bg(c)
    label(c, "04 / Color system", 44, H - 48)
    title(c, "Authority first. Signal with restraint.", 44, H - 88)
    body(c, "Navy carries authority and trust. Indigo expresses governed coordination. Cyan is reserved for active decision points, focus, and controlled system signals.", 44, H - 122, 660, False, 11, 17)
    swatch(c, 44, 263, NAVY, "Authority Navy", "#0B1220", "Primary type, surfaces, control")
    swatch(c, 196, 263, INDIGO, "Governance Indigo", "#6472E8", "Hierarchy, navigation, focus")
    swatch(c, 348, 263, CYAN, "Decision Cyan", "#4BC6D8", "Active signal, decision node")
    swatch(c, 500, 263, CLOUD, "System Cloud", "#F5F7FB", "Primary light environment")
    swatch(c, 652, 263, SLATE, "Operational Slate", "#667085", "Secondary copy and metadata")
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 12)
    c.drawString(44, 222, "Supporting system colors")
    for xx, col, nm, hx in ((44, GREEN, "Success", "#2FB878"), (208, AMBER, "Attention", "#E2A13D"), (372, LINE, "Border", "#D9DFEA")):
        c.setFillColor(col)
        c.roundRect(xx, 151, 34, 34, 8, stroke=0, fill=1)
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, 9)
        c.drawString(xx + 45, 174, nm)
        c.setFillColor(SLATE)
        c.setFont(FONT_REGULAR, 8)
        c.drawString(xx + 45, 157, hx)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 10)
    c.drawString(548, 205, "Accessibility rule")
    body(c, "Do not use cyan for body text on white. Preserve high-contrast navy/white combinations for essential information and controls.", 548, 183, 240, False, 9, 13)
    footer(c, 5)
    c.showPage()

    # 06 Typography
    page_bg(c)
    label(c, "05 / Typography", 44, H - 48)
    title(c, "Clear enough for command. Human enough for trust.", 44, H - 88, size=25)
    card(c, 44, 252, 482, 198)
    label(c, "Primary UI and marketing", 66, 419)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 44)
    c.drawString(66, 355, "Inter")
    body(c, "Use Inter across the public site, authenticated product, decks, and operational documents. Strong weights support command hierarchy; regular weights preserve calm readability.", 66, 320, 426, False, 10, 15)
    card(c, 548, 252, 246, 198)
    label(c, "Technical layer", 570, 419)
    c.setFillColor(NAVY)
    c.setFont(FONT_MONO, 27)
    c.drawString(570, 361, "Geist Mono")
    body(c, "Use sparingly for IDs, versions, logs, system status, timestamps, and traceability details.", 570, 320, 190, False, 9.5, 14)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 11)
    c.drawString(44, 210, "Wordmark note")
    body(c, "The supplied RYTHM wordmark is converted to vector outlines. Never recreate it by typing the name in a font. Use the approved artwork files.", 44, 188, 470, False, 10, 15)
    c.setFillColor(INDIGO)
    c.setFont(FONT_BOLD, 8)
    c.drawString(548, 208, "TYPE SCALE / DIGITAL")
    for i, (nm, sz, val) in enumerate((("DISPLAY", 28, "64 / 0.96"), ("H1", 23, "48 / 1.00"), ("H2", 18, "32 / 1.10"), ("BODY", 11, "16 / 1.60"), ("LABEL", 8, "12 / 1.20"))):
        yy = 181 - i * 28
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, sz)
        c.drawString(548, yy, nm)
        c.setFillColor(SLATE)
        c.setFont(FONT_REGULAR, 8)
        c.drawRightString(790, yy, val)
    footer(c, 6)
    c.showPage()

    # 07 Clear space
    page_bg(c)
    label(c, "06 / Clear space and scale", 44, H - 48)
    title(c, "Give the system room to operate", 44, H - 88)
    c.setStrokeColor(INDIGO)
    c.setDash(4, 4)
    c.rect(72, 185, 390, 215, stroke=1, fill=0)
    mark(c, 132, 209, 166)
    c.setDash()
    c.setFillColor(CYAN)
    c.roundRect(320, 350, 28, 28, 2, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 10)
    c.drawString(354, 359, "x = module unit")
    body(c, "Keep at least one x of clear space around every lockup. No text, frame, or competing graphic may enter this area.", 500, 388, 275, False, 10.5, 16)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 12)
    c.drawString(500, 294, "Minimum digital sizes")
    rows = (("Symbol", "20 px"), ("Navbar lockup", "120 px wide"), ("Primary horizontal", "180 px wide"), ("Print horizontal", "25 mm wide"))
    for i, (nm, value) in enumerate(rows):
        yy = 263 - i * 34
        c.setStrokeColor(LINE)
        c.line(500, yy - 8, 785, yy - 8)
        c.setFillColor(SLATE)
        c.setFont(FONT_REGULAR, 9)
        c.drawString(500, yy, nm)
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, 9)
        c.drawRightString(785, yy, value)
    footer(c, 7)
    c.showPage()

    # 08 Icon system
    page_bg(c)
    label(c, "07 / Digital icon system", 44, H - 48)
    title(c, "Recognizable from 16 px to the app store", 44, H - 88)
    sizes = ((44, 254, 188, "APP ICON / 512"), (262, 286, 128, "PWA ICON / 192"), (435, 310, 84, "TOUCH ICON / 180"), (565, 330, 48, "FAVICON / 32"), (659, 341, 26, "FAVICON / 16"))
    for x, y, sz, lbl in sizes:
        c.setFillColor(NAVY)
        c.roundRect(x, y, sz, sz, sz * 0.22, stroke=0, fill=1)
        mark(c, x + sz * 0.11, y + sz * 0.11, sz * 0.78, white, white, CYAN)
        c.setFillColor(SLATE)
        c.setFont(FONT_BOLD, 7)
        c.drawCentredString(x + sz / 2, y - 16, lbl)
    body(c, "At small sizes, use the symbol only. Do not place the full wordmark in browser tabs, app launchers, social avatars, or square navigation controls.", 44, 191, 700, False, 10.5, 16)
    c.setFillColor(CYAN)
    c.circle(52, 137, 4, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont(FONT_BOLD, 9.5)
    c.drawString(66, 133, "The cyan decision node must remain visible whenever color reproduction is reliable.")
    footer(c, 8)
    c.showPage()

    # 09 Misuse
    page_bg(c)
    label(c, "08 / Logo integrity", 44, H - 48)
    title(c, "Protect the signal", 44, H - 88)
    items = (
        ("Do not stretch", "Preserve the original aspect ratio."),
        ("Do not recolor", "Use only approved palette variants."),
        ("Do not add effects", "No glow, bevel, shadow, or 3D treatment."),
        ("Do not rotate", "The authority axis remains vertical."),
        ("Do not change spacing", "Use supplied lockups; do not re-typeset."),
        ("Do not place on noise", "Use a calm field with sufficient contrast."),
    )
    for i, (head, desc) in enumerate(items):
        col = i % 3
        row = i // 3
        x = 44 + col * 255
        y = 280 - row * 150
        card(c, x, y, 230, 125)
        c.setStrokeColor(HexColor("#D85B68"))
        c.setLineWidth(2.5)
        c.line(x + 20, y + 86, x + 39, y + 67)
        c.line(x + 39, y + 86, x + 20, y + 67)
        c.setFillColor(NAVY)
        c.setFont(FONT_BOLD, 10)
        c.drawString(x + 55, y + 78, head)
        body(c, desc, x + 20, y + 48, 190, False, 8.6, 12)
    footer(c, 9)
    c.showPage()

    # 10 Handoff
    page_bg(c, True)
    label(c, "09 / Handoff", 44, H - 48, True)
    title(c, "One system. Every surface.", 44, H - 88, True)
    body(c, "The package includes production vector artwork, transparent PNG exports, favicon and app icon sets, a navbar lockup, monochrome variants, a brand board, and this usage guide.", 44, H - 122, 690, True, 11, 17)
    c.setFillColor(HexColor("#111A2D"))
    c.roundRect(44, 145, 750, 260, 18, stroke=0, fill=1)
    columns = (
        (70, "VECTOR", ("Primary horizontal", "Inverse horizontal", "Stacked lockups", "Symbol and navbar", "Monochrome artwork")),
        (310, "DIGITAL", ("PNG @ 1x / 2x / 4x", "Favicon SVG / ICO", "Touch icon 180", "PWA icons 192 / 512", "Social avatar 1200")),
        (555, "GUIDANCE", ("Color tokens", "Typography direction", "Clear space", "Minimum sizes", "Usage restrictions")),
    )
    for x, head, lines in columns:
        label(c, head, x, 365, True)
        for i, line in enumerate(lines):
            c.setFillColor(CYAN if i == 0 else HexColor("#7D879B"))
            c.circle(x + 3, 334 - i * 34, 3, stroke=0, fill=1)
            c.setFillColor(white)
            c.setFont(FONT_BOLD, 8.5)
            c.drawString(x + 14, 331 - i * 34, line)
    logo_lockup(c, 44, 51, 82, True)
    c.setFillColor(HexColor("#7D879B"))
    c.setFont(FONT_REGULAR, 8)
    c.drawRightString(W - 44, 62, "RYTHM COMPANY OS / BRAND IDENTITY SYSTEM / V1.0")
    c.showPage()

    c.save()


if __name__ == "__main__":
    build()
