"""Generate the flat credential card images (1012x638, ID-1 card ratio) and the
matching credential logos (256x256, <card>-logo.png).

Usage: python3 scripts/generate-card-images.py
Requires rsvg-convert (brew install librsvg). To add a card, add an entry to
CARDS (and an icon to ICONS if needed) and reference the files in the
credential config's display.background_image and display.logo.
"""
import pathlib, subprocess, tempfile

OUT = pathlib.Path(__file__).resolve().parent.parent / "eudiplo-config" / "playground" / "images"
W, H = 1012, 638
FONT = "Helvetica, Arial, sans-serif"

# Icons drawn in a 100x100 box. {c} = accent colour (for cut-outs on white shapes).
ICONS = {
    "cross": '<rect x="36" y="12" width="28" height="76" fill="#fff"/><rect x="12" y="36" width="76" height="28" fill="#fff"/>',
    "mortarboard": (
        '<path d="M50 14 L94 34 L50 54 L6 34 Z" fill="#fff"/>'
        '<path d="M24 46 V66 C24 76 76 76 76 66 V46 L50 58 Z" fill="#fff"/>'
        '<rect x="84" y="36" width="5" height="30" fill="#fff"/><circle cx="86.5" cy="70" r="6" fill="#fff"/>'
    ),
    "heart": '<path d="M50 86 C20 64 8 48 8 33 C8 19 19 11 30 11 C40 11 46 17 50 25 C54 17 60 11 70 11 C81 11 92 19 92 33 C92 48 80 64 50 86 Z" fill="#fff"/>',
    "dumbbell": (
        '<rect x="24" y="45" width="52" height="10" rx="3" fill="#fff"/>'
        '<rect x="14" y="28" width="13" height="44" rx="4" fill="#fff"/><rect x="73" y="28" width="13" height="44" rx="4" fill="#fff"/>'
        '<rect x="3" y="37" width="9" height="26" rx="3" fill="#fff"/><rect x="88" y="37" width="9" height="26" rx="3" fill="#fff"/>'
    ),
    "ticket": (
        '<path d="M6 24 H94 V42 A8 8 0 0 0 94 58 V76 H6 V58 A8 8 0 0 0 6 42 Z" fill="#fff"/>'
        '<line x1="66" y1="30" x2="66" y2="70" stroke="{c}" stroke-width="4" stroke-dasharray="6 5"/>'
        '<path d="M32 38 L36 46 L45 47 L38 53 L40 62 L32 57 L24 62 L26 53 L19 47 L28 46 Z" fill="{c}"/>'
    ),
    "wheel": (
        '<circle cx="50" cy="50" r="38" fill="none" stroke="#fff" stroke-width="11"/>'
        '<circle cx="50" cy="52" r="11" fill="#fff"/>'
        '<rect x="14" y="46" width="72" height="10" fill="#fff"/><rect x="45" y="52" width="10" height="36" fill="#fff"/>'
    ),
}

CARDS = [
    dict(file="first-aid-certificate.png", g1="#065f46", g2="#10b981", accent="#059669", tint="#d1fae5", icon="cross",
         issuer="DRH Bildungswerk", issuer_sub="Deutsches Rettungshilfswerk",
         title="Erste-Hilfe-Bescheinigung", subtitle="First Aid Certificate"),
    dict(file="university-diploma.png", g1="#0f2440", g2="#2f5a8c", accent="#1e3a5f", tint="#fde68a", icon="mortarboard",
         issuer="European Technical University", issuer_sub="Europäische Technische Universität",
         title="University Diploma", subtitle="Hochschulabschluss"),
    dict(file="honorary-credential.png", g1="#881337", g2="#e11d48", accent="#be123c", tint="#ffe4e6", icon="heart",
         issuer="Civic Honors Office", issuer_sub="Ehrenamtsbüro Musterstadt",
         title="Ehrenamtskarte", subtitle="Honorary Engagement Card"),
    dict(file="loyalty-card.png", g1="#4c1d95", g2="#8b5cf6", accent="#6d28d9", tint="#ede9fe", icon="dumbbell",
         issuer="FitLife Health Club", issuer_sub="Stay healthy · Stay active",
         title="Membership Card", subtitle="Mitgliedskarte"),
    dict(file="event-access-attestation.png", g1="#0f172a", g2="#4338ca", accent="#4338ca", tint="#c7d2fe", icon="ticket",
         issuer="Tech Conference 2026", issuer_sub="Berlin Convention Center",
         title="Event Pass", subtitle="Veranstaltungszugang"),
    dict(file="mdl.png", g1="#1e3a8a", g2="#3b82f6", accent="#1d4ed8", tint="#dbeafe", icon="wheel",
         issuer="Driving Licence Authority", issuer_sub="Fahrerlaubnisbehörde",
         title="Mobiler Führerschein", subtitle="Mobile Driving Licence"),
]


def icon(name: str, accent: str) -> str:
    return ICONS[name].replace("{c}", accent)


def svg(c: dict) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{c['g1']}"/>
      <stop offset="1" stop-color="{c['g2']}"/>
    </linearGradient>
  </defs>
  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <circle cx="{W - 110}" cy="{H - 70}" r="250" fill="#fff" opacity="0.06"/>
  <g transform="translate({W - 300} 200) scale(2.3)" opacity="0.10">{icon(c['icon'], c['g1'])}</g>
  <rect x="64" y="64" width="132" height="132" rx="20" fill="#fff"/>
  <rect x="78" y="78" width="104" height="104" rx="13" fill="{c['accent']}"/>
  <g transform="translate(88 88) scale(0.84)">{icon(c['icon'], c['accent'])}</g>
  <text x="232" y="124" font-family="{FONT}" font-size="36" font-weight="700" fill="#fff">{c['issuer']}</text>
  <text x="232" y="170" font-family="{FONT}" font-size="26" fill="{c['tint']}">{c['issuer_sub']}</text>
  <text x="64" y="{H - 136}" font-family="{FONT}" font-size="60" font-weight="700" fill="#fff">{c['title']}</text>
  <text x="64" y="{H - 80}" font-family="{FONT}" font-size="30" fill="{c['tint']}">{c['subtitle']}</text>
</svg>
"""


LOGO = 256


def logo_svg(c: dict) -> str:
    """The card emblem on its own: white icon on the accent colour, transparent corners."""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{LOGO}" height="{LOGO}" viewBox="0 0 {LOGO} {LOGO}">
  <rect width="{LOGO}" height="{LOGO}" rx="56" fill="{c['accent']}"/>
  <g transform="translate(43 43) scale(1.7)">{icon(c['icon'], c['accent'])}</g>
</svg>
"""


def logo_file(c: dict) -> str:
    return c["file"].replace(".png", "-logo.png")


def render(tmp: str, name: str, content: str) -> None:
    src = pathlib.Path(tmp) / name.replace(".png", ".svg")
    src.write_text(content)
    subprocess.run(["rsvg-convert", str(src), "-o", str(OUT / name)], check=True)
    print("wrote", name)


with tempfile.TemporaryDirectory() as tmp:
    for card in CARDS:
        render(tmp, card["file"], svg(card))
        render(tmp, logo_file(card), logo_svg(card))
