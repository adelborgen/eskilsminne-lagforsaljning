import json
W = json.load(open("wordmark.json"))
GRAFIT, KRAM, MINT, MINTMORK = "#16191d", "#fff8d6", "#6fe3b4", "#1c8a5f"

def farger(tema):
    if tema == "mork":   # på mörk bakgrund
        return dict(linje=KRAM, mynt=MINT, glas=MINT, glasop=".16", skrammel=MINT, ljus=KRAM, myntkant="none", text=KRAM)
    return dict(linje=GRAFIT, mynt=MINT, glas=MINT, glasop=".28", skrammel=MINTMORK, ljus="#ffffff", myntkant=GRAFIT, text=GRAFIT)

def symbol(tema, enkel=False, animerad=False):
    c = farger(tema)
    sw = 4.2 if enkel else 3.2
    mk = f' stroke="{c["myntkant"]}" stroke-width="2.4"' if c["myntkant"] != "none" else ""
    cy, r = (11, 9) if enkel else (13, 7)
    skr = "" if enkel else f'<g class="skrammel" stroke="{c["skrammel"]}" stroke-width="3" stroke-linecap="round"><path d="M14 11 l4 3"/><path d="M20 4 l1 5"/><path d="M50 11 l-4 3"/><path d="M44 4 l-1 5"/></g>'
    inne = "" if enkel else (f'<g class="inne"><circle class="i1" cx="26" cy="49" r="5" fill="{c["mynt"]}"{mk}/><circle class="i2" cx="37" cy="50" r="5" fill="{c["mynt"]}"{mk}/><circle class="i3" cx="31.5" cy="41" r="5" fill="{c["mynt"]}"{mk}/></g>'
             f'<line x1="21" y1="33" x2="21" y2="44" stroke="{c["ljus"]}" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>')
    bossa = (f'<g class="bossa"><path d="M15 26 V54 A17 5.5 0 0 0 49 54 V26" fill="{c["glas"]}" fill-opacity="{c["glasop"]}" stroke="{c["linje"]}" stroke-width="{sw}" stroke-linejoin="round"/>'
             f'{inne}<ellipse cx="32" cy="26" rx="17" ry="5.5" fill="{c["glas"]}" fill-opacity="{c["glasop"]}" stroke="{c["linje"]}" stroke-width="{sw}"/>'
             f'<line x1="26" y1="26" x2="38" y2="26" stroke="{c["linje"]}" stroke-width="{sw}" stroke-linecap="round"/></g>')
    hl = f'<path d="M{32-r*.45:.1f} {cy-r*.2:.1f} a{r*.5:.1f} {r*.5:.1f} 0 0 1 {r*.55:.1f} -{r*.35:.1f}" stroke="{GRAFIT}" stroke-opacity=".45" stroke-width="2" stroke-linecap="round" fill="none"/>'
    mynt = f'<g clip-path="url(#ovanSpringan-{tema})"><g class="mynt"><circle cx="32" cy="{cy}" r="{r}" fill="{c["mynt"]}"{mk}/>{hl}</g></g>'
    defs = f'<defs><clipPath id="ovanSpringan-{tema}"><rect x="0" y="-30" width="64" height="56"/></clipPath></defs>'
    return defs + skr + bossa + mynt

CSS = """<style>
  .mynt { animation: mynt 3.2s infinite; }
  .bossa { transform-box: fill-box; transform-origin: 50% 100%; animation: skaka 3.2s infinite; }
  .skrammel { transform-box: fill-box; transform-origin: 50% 50%; animation: skrammel 3.2s infinite; }
  .inne circle { transform-box: fill-box; transform-origin: 50% 100%; animation: hoppa 3.2s infinite; }
  .inne .i2 { animation-delay: -.06s; } .inne .i3 { animation-delay: -.12s; }
  @keyframes mynt {
    0%, 45% { transform: translateY(0); opacity: 1; animation-timing-function: cubic-bezier(.55,0,.85,.4); }
    62% { transform: translateY(17px); opacity: 1; }
    63%, 86% { transform: translateY(17px); opacity: 0; }
    87% { transform: translateY(-8px); opacity: 0; animation-timing-function: ease-out; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes skaka {
    0%, 62% { transform: rotate(0); } 66% { transform: rotate(-5deg); } 70% { transform: rotate(4deg); }
    74% { transform: rotate(-2deg); } 78%, 100% { transform: rotate(0); }
  }
  @keyframes skrammel {
    0%, 42% { opacity: 1; transform: scale(1); } 52%, 62% { opacity: 0; transform: scale(.6); }
    68% { opacity: 1; transform: scale(1.18); } 78%, 100% { opacity: 1; transform: scale(1); }
  }
  @keyframes hoppa {
    0%, 62% { transform: translateY(0); } 67% { transform: translateY(-4px); } 72%, 100% { transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) { .mynt, .bossa, .skrammel, .inne circle { animation: none; } }
</style>"""

def wordmark(tema, x, baslinje, cap):
    s = cap / W["capH"]
    return f'<path transform="translate({x} {baslinje}) scale({s:.5f})" fill="{farger(tema)["text"]}" d="{W["d"]}"/>', W["w"] * s

def fil(namn, inner, w, h, animerad=False, titel="Skramlat"):
    css = CSS if animerad else ""
    open(namn, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w*4}" height="{h*4}" fill="none" role="img" aria-label="{titel}"><title>{titel}</title>{css}{inner}</svg>\n')

for tema in ("mork", "ljus"):
    fil(f"skramlat-symbol-{tema}.svg", symbol(tema), 64, 64)
    fil(f"skramlat-symbol-{tema}-animerad.svg", symbol(tema), 64, 64, animerad=True)
    fil(f"skramlat-ikon-{tema}.svg", symbol(tema, enkel=True), 64, 64)
    wm, ww = wordmark(tema, 78, 48, 32)
    total = round(78 + ww + 4)
    fil(f"skramlat-logga-{tema}.svg", symbol(tema) + wm, total, 64)
    fil(f"skramlat-logga-{tema}-animerad.svg", symbol(tema) + wm, total, 64, animerad=True)
print("klart")
