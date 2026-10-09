"""Generate the EUDIMON pixel sprites (src/client/shared/eudimon-sprites.ts) and
the credential card images and logos of the three starters
(eudiplo-config/playground/images/eudimon-<starter>[-logo].png).

Usage: python3 scripts/generate-eudimon-sprites.py [--preview DIR]
Requires rsvg-convert (brew install librsvg). --preview also writes an 8x
scaled PNG per sprite to DIR.

Like Gen 1 on the Game Boy Color, every sprite has its own four colour palette
(see PALETTES): '.' transparent, '0' white, '1' light, '2' dark, '3' black.
Each body part is drawn as a black outline (mask grown by one pixel) plus its
fill, back to front, so overlapping parts get inner outlines like Gen 1 sprites.
Tweak a sprite by editing its function below and re-running the script.
"""
import math, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "client" / "shared" / "eudimon-sprites.ts"
IMAGES = ROOT / "eudiplo-config" / "playground" / "images"
# white, light, dark, black
PALETTES = {
    "bulbasaur": ["#FFFFFF", "#98D890", "#308850", "#000000"],
    "charmander": ["#FFFFFF", "#F8B060", "#D85020", "#000000"],
    "squirtle": ["#FFFFFF", "#90D0F8", "#3080D0", "#000000"],
    "oak": ["#FFFFFF", "#C8C8C8", "#707070", "#000000"],
    "gary": ["#FFFFFF", "#A8B8F0", "#805030", "#000000"],
    "ball": ["#FFFFFF", "#D0D0D0", "#E83030", "#000000"],
}


class Sprite:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [["."] * w for _ in range(h)]

    def inside(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def set(self, x, y, c):
        if self.inside(x, y):
            self.px[y][x] = c

    # --- masks: sets of (x, y) pixels ---------------------------------------
    def ellipse_mask(self, cx, cy, rx, ry, rot=0.0):
        cr, sr = math.cos(rot), math.sin(rot)
        mask = set()
        for y in range(self.h):
            for x in range(self.w):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                u, v = dx * cr + dy * sr, -dx * sr + dy * cr
                if (u / rx) ** 2 + (v / ry) ** 2 <= 1.0:
                    mask.add((x, y))
        return mask

    def poly_mask(self, pts):
        mask = set()
        for y in range(self.h):
            for x in range(self.w):
                px, py, inside, j = x + 0.5, y + 0.5, False, len(pts) - 1
                for i, (xi, yi) in enumerate(pts):
                    xj, yj = pts[j]
                    if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                        inside = not inside
                    j = i
                if inside:
                    mask.add((x, y))
        return mask

    def thick_curve_mask(self, pts, r0, r1=None):
        """Discs along a polyline, radius interpolated from r0 to r1."""
        r1 = r0 if r1 is None else r1
        segs = list(zip(pts, pts[1:]))
        mask = set()
        for si, ((x0, y0), (x1, y1)) in enumerate(segs):
            for k in range(61):
                t = k / 60
                r = r0 + (r1 - r0) * (si + t) / len(segs)
                mask |= self.ellipse_mask(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r)
        return mask

    # --- drawing -------------------------------------------------------------
    def part(self, mask, fill="1", outline="3", shade="2"):
        """Outline + fill, with a shade band along the bottom right edge."""
        if outline:
            for x, y in mask:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if (x + dx, y + dy) not in mask:
                        self.set(x + dx, y + dy, outline)
        for x, y in mask:
            self.set(x, y, fill)
        if shade:
            for x, y in mask:
                if (x + 1, y + 1) not in mask or ((x + 2, y + 2) not in mask and (x + 2, y) not in mask):
                    self.set(x, y, shade)
        return mask

    def fill(self, mask, c):
        for x, y in mask:
            self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c="3"):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.set(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def pixels(self, pts, c):
        for x, y in pts:
            self.set(x, y, c)

    def rows(self):
        return ["".join(r) for r in self.px]


def outline_only(s, mask, c="3"):
    for x, y in mask:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in mask:
                s.set(x + dx, y + dy, c)


# --- sprites (front views face left) ----------------------------------------
def charmander():
    s = Sprite(40, 40)
    # tail (behind body), curling up to the right
    tail = s.thick_curve_mask([(24, 31), (30, 31), (33, 27), (34, 22)], 2.6, 1.6)
    s.part(tail)
    # flame on the tail tip
    flame = s.poly_mask([(34, 9), (37.5, 15), (38, 19), (35.5, 22.5), (32, 22.5), (30, 19), (31, 14)])
    s.part(flame, fill='1', shade='2')
    core = s.poly_mask([(34, 14), (36, 18), (35, 21), (33, 21), (32, 18)])
    s.fill(core, '0')
    # far foot
    s.part(s.ellipse_mask(25.5, 35.5, 4, 2.6))
    # body
    body = s.ellipse_mask(19, 26.5, 8, 8.5)
    s.part(body)
    belly = s.ellipse_mask(17, 28, 4.6, 5.8)
    s.fill(belly, '0')
    # near foot
    s.part(s.ellipse_mask(13.5, 35.5, 4.2, 2.6))
    s.pixels([(10, 36), (12, 36)], '3')  # claws
    # far arm
    s.part(s.ellipse_mask(26, 23, 3.4, 2, rot=-0.6))
    # head (round skull + snout)
    head = s.ellipse_mask(16.5, 12.5, 9, 8) | s.ellipse_mask(9.5, 14.5, 5.5, 4.2)
    s.part(head)
    # near arm
    s.part(s.ellipse_mask(10.5, 24, 3.6, 2.1, rot=0.5))
    s.pixels([(7, 25), (7, 23)], '3')
    # eye
    s.fill({(x, y) for x in range(12, 15) for y in range(9, 14)}, '3')
    s.pixels([(13, 10), (13, 11)], '0')
    s.pixels([(12, 9), (14, 9)], '1')  # rounder top
    # nostril + mouth
    s.set(6, 13, '3')
    s.line(5, 17, 9, 18)
    s.line(9, 18, 13, 17)
    s.set(12, 18, '2')
    return s


def bulbasaur():
    s = Sprite(40, 40)
    # bulb on the back (garlic shape with a pointed top)
    bulb = s.ellipse_mask(26, 15.5, 9.5, 8.5) | s.poly_mask([(22.5, 9), (31, 9), (27.5, 4)])
    s.part(bulb, fill='1')
    # bulb leaf segments
    s.line(27, 5, 24, 11, '2')
    s.line(24, 11, 23, 22, '2')
    s.line(28, 5, 31, 11, '2')
    s.line(31, 11, 32, 21, '2')
    s.pixels([(25, 8), (24, 10), (20, 14), (19, 16)], '0')
    s.pixels([(29, 9), (30, 11)], '0')
    # far legs
    s.part(s.ellipse_mask(31, 33, 3.2, 4))
    s.part(s.ellipse_mask(21, 34.5, 3.2, 3.5))
    # body
    body = s.ellipse_mask(22, 27, 12, 7)
    s.part(body)
    # near legs
    s.part(s.ellipse_mask(26, 34.5, 3.4, 3.6))
    s.part(s.ellipse_mask(13, 33.5, 3.6, 4))
    s.pixels([(10, 37), (12, 37), (24, 38), (26, 38)], '3')
    # ears
    s.part(s.poly_mask([(4, 12), (9.5, 16), (5, 18)]))
    s.part(s.poly_mask([(17, 11), (18, 18), (13, 16)]))
    # head
    head = s.ellipse_mask(11.5, 22, 9, 7)
    s.part(head)
    # spots
    s.pixels([(14, 17), (15, 17), (14, 18), (8, 17), (28, 26), (29, 26), (29, 27), (20, 30), (21, 30)], '2')
    # eyes
    for ex in (6, 13):
        s.fill({(x, y) for x in range(ex, ex + 3) for y in range(20, 24)}, '3')
        s.pixels([(ex + 1, 21)], '0')
        s.pixels([(ex + 1, 22)], '2')
    # mouth
    s.line(5, 26, 9, 27)
    s.line(9, 27, 15, 26)
    s.pixels([(10, 28), (11, 28)], '0')
    return s


def squirtle():
    s = Sprite(40, 40)
    # curly tail behind
    tail = s.ellipse_mask(32, 28, 5, 4.6)
    s.part(tail)
    s.line(31, 27, 33, 27, '2')
    s.line(33, 27, 33, 29, '2')
    s.set(31, 28, '2')
    # shell (rim visible behind the body)
    shell = s.ellipse_mask(22, 25.5, 9.5, 10)
    s.part(shell, fill='2', shade='3')
    s.pixels([(27, 18), (28, 19), (29, 20)], '1')
    # far foot
    s.part(s.ellipse_mask(25, 35.5, 3.4, 2.6))
    # body + belly plate
    body = s.ellipse_mask(18.5, 26.5, 7.5, 8.5)
    s.part(body, fill='0', shade='1')
    for y in (23, 27, 31):
        s.line(14, y, 23, y, '2')
    s.line(18, 19, 18, 34, '2')
    # near foot
    s.part(s.ellipse_mask(14, 35.5, 3.8, 2.6))
    s.pixels([(11, 36), (13, 36)], '3')
    # arms
    s.part(s.ellipse_mask(26.5, 23, 3.2, 2.1, rot=-0.5))
    s.part(s.ellipse_mask(10, 24.5, 3.6, 2.2, rot=0.5))
    # head
    head = s.ellipse_mask(16, 11.5, 9.5, 8.2)
    s.part(head)
    # big eye
    s.fill({(x, y) for x in range(10, 14) for y in range(8, 13)}, '3')
    s.pixels([(10, 8), (13, 8)], '1')
    s.pixels([(11, 9), (11, 10)], '0')
    s.pixels([(12, 11)], '2')
    # far eye
    s.fill({(x, y) for x in range(19, 21) for y in range(8, 12)}, '3')
    s.set(19, 9, '0')
    # mouth
    s.line(8, 15, 11, 16)
    s.line(11, 16, 16, 15)
    s.set(12, 16, '3')
    return s



def oak():
    s = Sprite(32, 56)
    # legs / trousers
    s.part(s.poly_mask([(10, 40), (15.5, 40), (15.5, 52), (10, 52)]), fill='2', shade='3')
    s.part(s.poly_mask([(16.5, 40), (22, 40), (22, 52), (16.5, 52)]), fill='2', shade='3')
    # shoes
    s.part(s.ellipse_mask(12, 53.5, 3.5, 1.6), fill='3', shade=None)
    s.part(s.ellipse_mask(20, 53.5, 3.5, 1.6), fill='3', shade=None)
    # lab coat
    coat = s.poly_mask([(8, 20), (24, 20), (27, 45), (5, 45)])
    s.part(coat, fill='0', shade='1')
    # shirt + tie
    shirt = s.poly_mask([(13, 20), (19, 20), (17, 31), (15, 31)])
    s.part(shirt, fill='1', shade=None, outline=None)
    s.line(16, 21, 16, 29, '2')
    s.line(15, 31, 16, 44, '3')
    s.line(17, 31, 16, 44, '3')
    # arms
    s.part(s.poly_mask([(6, 22), (9, 23), (7, 38), (4, 37)]), fill='0', shade='1')
    s.part(s.poly_mask([(26, 22), (23, 23), (25, 38), (28, 37)]), fill='0', shade='1')
    # hands
    s.part(s.ellipse_mask(5.5, 39.5, 2, 2), fill='0', shade='1')
    s.part(s.ellipse_mask(26.5, 39.5, 2, 2), fill='0', shade='1')
    # pocket + pen
    s.line(20, 28, 23, 28)
    s.line(21, 26, 21, 28, '2')
    # head
    head = s.ellipse_mask(16, 12, 6, 7)
    s.part(head, fill='0', shade='1')
    # hair: grey, swept back, spiky on top, tufts over the ears
    hair = {(x, y) for (x, y) in s.ellipse_mask(16, 8, 8, 6) if y <= 8}
    hair |= s.ellipse_mask(9.5, 10, 1.8, 3) | s.ellipse_mask(22.5, 10, 1.8, 3)
    hair |= {(11, 1), (14, 1), (15, 1), (18, 1), (21, 2)}
    s.part(hair, fill='1', shade='2')
    s.pixels([(12, 4), (13, 3), (17, 3), (18, 4)], '0')
    # face
    s.line(13, 10, 15, 10, '2')
    s.line(17, 10, 19, 10, '2')
    s.pixels([(14, 11), (14, 12), (18, 11), (18, 12)], '3')
    s.set(16, 14, '1')
    s.line(15, 16, 17, 16, '3')
    # collar
    s.pixels([(13, 20), (14, 21), (19, 20), (18, 21)], '3')
    return s


def gary():
    s = Sprite(32, 56)
    # legs / trousers
    s.part(s.poly_mask([(10, 37), (15.5, 37), (15, 52), (10, 52)]), fill='2', shade='3')
    s.part(s.poly_mask([(16.5, 37), (22, 37), (22, 52), (17, 52)]), fill='2', shade='3')
    # shoes
    s.part(s.ellipse_mask(12, 53.5, 3.6, 1.6), fill='3', shade=None)
    s.part(s.ellipse_mask(20, 53.5, 3.6, 1.6), fill='3', shade=None)
    # arms bent into the pockets (behind the torso)
    s.part(s.poly_mask([(9, 21), (5, 30), (8, 37), (11, 36), (9, 30), (11, 24)]), fill='1', shade='2')
    s.part(s.poly_mask([(23, 21), (27, 30), (24, 37), (21, 36), (23, 30), (21, 24)]), fill='1', shade='2')
    # torso: shirt
    s.part(s.poly_mask([(9, 19), (23, 19), (22, 38), (10, 38)]), fill='1', shade='2')
    # belt
    s.line(10, 36, 22, 36, '3')
    s.set(16, 36, '0')
    # pendant necklace
    s.line(13, 20, 16, 25, '3')
    s.line(19, 20, 16, 25, '3')
    s.pixels([(16, 26), (15, 26), (17, 26), (16, 27)], '0')
    s.set(16, 26, '2')
    # head
    head = s.ellipse_mask(16, 12.5, 5.6, 6.5)
    s.part(head, fill='0', shade=None)
    s.pixels([(20, 14), (20, 15), (19, 16), (19, 17)], '1')
    # spiky hair
    hair = {(x, y) for (x, y) in s.ellipse_mask(16, 8.5, 8, 6) if y <= 9}
    hair |= s.poly_mask([(6, 9), (1, 4), (9, 5)]) | s.poly_mask([(26, 9), (31, 5), (23, 5)])
    hair |= s.poly_mask([(9, 4), (8, -1), (14, 2)]) | s.poly_mask([(14, 2), (17, -2), (19, 3)]) | s.poly_mask([(19, 3), (25, 0), (23, 5)])
    hair |= s.ellipse_mask(10.5, 11, 1.4, 2.6) | s.ellipse_mask(21.5, 11, 1.4, 2.6)
    s.part(hair, fill='2', shade='3')
    s.pixels([(12, 4), (13, 3), (18, 3), (19, 4), (8, 6)], '1')
    # face: smug look
    s.line(13, 11, 15, 12, '3')
    s.line(19, 11, 17, 12, '3')
    s.pixels([(14, 13), (18, 13)], '3')
    s.line(15, 16, 18, 15, '3')
    return s


def ball():
    s = Sprite(16, 16)
    m = s.ellipse_mask(8, 8, 7.5, 7.5)
    outline_only(s, m)
    for (x, y) in m:
        s.set(x, y, '2' if y < 7 else '0')
    # shading
    for (x, y) in m:
        if (x + 1, y + 1) not in m and y >= 7:
            s.set(x, y, '1')
    s.line(0, 7, 15, 7, '3')
    s.line(0, 8, 15, 8, '3')
    s.fill(s.ellipse_mask(8, 8, 3, 3), '3')
    s.fill(s.ellipse_mask(8, 8, 1.8, 1.8), '0')
    s.pixels([(4, 3), (5, 3), (4, 4)], '1')
    return s


SPRITES = {
    "charmander": charmander,
    "bulbasaur": bulbasaur,
    "squirtle": squirtle,
    "oak": oak,
    "gary": gary,
    "ball": ball,
}


# --- credential cards ----------------------------------------------------------

# Same data as STARTERS in src/client/shared/eudimon.ts
CARD_STARTERS = [
    dict(id="bulbasaur", name="BULBASAUR", dex=1, type="GRASS/POISON"),
    dict(id="charmander", name="CHARMANDER", dex=4, type="FIRE"),
    dict(id="squirtle", name="SQUIRTLE", dex=7, type="WATER"),
]

# 5x7 pixel font for the card texts
FONT = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
    "/": [".....", "....#", "...#.", "..#..", ".#...", "#....", "....."],
    "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
    ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
    " ": ["....."] * 7,
}


def text_rects(text, x, y, scale, colour):
    """SVG rects for a text in the pixel font, one rect per horizontal run."""
    out = []
    for i, ch in enumerate(text):
        for row, line in enumerate(FONT[ch]):
            col = 0
            while col < 5:
                if line[col] == "#":
                    end = col
                    while end < 5 and line[end] == "#":
                        end += 1
                    out.append(
                        f'<rect x="{x + (i * 6 + col) * scale}" y="{y + row * scale}" '
                        f'width="{(end - col) * scale}" height="{scale}" fill="{colour}"/>'
                    )
                    col = end
                else:
                    col += 1
    return "".join(out)


def text_width(text, scale):
    return (len(text) * 6 - 1) * scale


def sprite_rects(name, rows, x, y, scale):
    palette = PALETTES[name]
    out = []
    for row_index, row in enumerate(rows):
        col = 0
        while col < len(row):
            c = row[col]
            end = col + 1
            while end < len(row) and row[end] == c:
                end += 1
            if c != ".":
                out.append(
                    f'<rect x="{x + col * scale}" y="{y + row_index * scale}" '
                    f'width="{(end - col) * scale}" height="{scale}" fill="{palette[int(c)]}"/>'
                )
            col = end
    return "".join(out)


def gb_box(x, y, w, h, b, line):
    """Gen 1 text box: black border, white gap, thin inner line."""
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#000000"/>'
        f'<rect x="{x + b}" y="{y + b}" width="{w - 2 * b}" height="{h - 2 * b}" fill="#FFFFFF"/>'
        f'<rect x="{x + 2 * b}" y="{y + 2 * b}" width="{w - 4 * b}" height="{h - 4 * b}" fill="{line}"/>'
        f'<rect x="{x + 3 * b}" y="{y + 3 * b}" width="{w - 6 * b}" height="{h - 6 * b}" fill="#FFFFFF"/>'
    )


CARD_W, CARD_H = 1012, 638


def card_svg(starter, sprites):
    """Card in the colours of the starter: dark header, light floor tiles."""
    white, light, dark, black = PALETTES[starter["id"]]
    header = 120
    # floor tiles like Professor Oak's lab
    tiles = "".join(
        f'<rect x="{x}" y="{header}" width="4" height="{CARD_H - header}" fill="{light}"/>' for x in range(0, CARD_W, 46)
    ) + "".join(
        f'<rect x="0" y="{y}" width="{CARD_W}" height="4" fill="{light}"/>' for y in range(header + 40, CARD_H, 46)
    )
    name_scale = 8 if len(starter["name"]) <= 8 else 7
    ball_x = CARD_W - 60 - 16 * 4
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{CARD_W}" height="{CARD_H}" viewBox="0 0 {CARD_W} {CARD_H}" shape-rendering="crispEdges">
  <rect width="{CARD_W}" height="{CARD_H}" fill="{white}"/>
  {tiles}
  <rect width="{CARD_W}" height="{header}" fill="{dark}"/>
  <rect y="{header}" width="{CARD_W}" height="8" fill="{black}"/>
  {text_rects("EUDIMON", 60 + 7, 32 + 7, 8, black)}
  {text_rects("EUDIMON", 60, 32, 8, white)}
  {sprite_rects("ball", sprites["ball"], ball_x, 28, 4)}
  {text_rects("STARTER", ball_x - 24 - text_width("STARTER", 3), 50, 3, white)}
  {sprite_rects(starter["id"], sprites[starter["id"]], CARD_W - 40 * 11 - 40, header + 30, 11)}
  {text_rects("NO." + str(starter["dex"]).zfill(3), 60, header + 70, 5, dark)}
  {text_rects(starter["name"], 60, header + 130, name_scale, black)}
  {text_rects("TYPE/", 60, header + 230, 4, black)}
  {text_rects(starter["type"], 60, header + 270, 4, black)}
  {gb_box(40, CARD_H - 150, 470, 110, 6, light)}
  {text_rects("PROF. OAK", 76, CARD_H - 122, 4, black)}
  {text_rects("PALLET TOWN LAB", 76, CARD_H - 82, 3, dark)}
  <rect x="0" y="0" width="{CARD_W}" height="{CARD_H}" fill="none" stroke="{black}" stroke-width="16"/>
</svg>
"""


LOGO = 256


def logo_svg(starter, sprites):
    scale = 5
    offset = (LOGO - 40 * scale) // 2
    light = PALETTES[starter["id"]][1]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{LOGO}" height="{LOGO}" viewBox="0 0 {LOGO} {LOGO}" shape-rendering="crispEdges">
  <rect width="{LOGO}" height="{LOGO}" fill="{light}"/>
  <rect x="8" y="8" width="{LOGO - 16}" height="{LOGO - 16}" fill="#FFFFFF"/>
  {sprite_rects(starter["id"], sprites[starter["id"]], offset, offset, scale)}
</svg>
"""


def render_png(svg, target):
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg)
    subprocess.run(["rsvg-convert", f.name, "-o", str(target)], check=True)
    print("wrote", target.relative_to(ROOT) if target.is_relative_to(ROOT) else target)


def to_ts(sprites):
    out = [
        "// Generated by scripts/generate-eudimon-sprites.py - do not edit by hand.",
        "// rows: '.' transparent, otherwise the index into palette (white, light, dark, black)",
        "",
        "export const SPRITES = {",
    ]
    for name, rows in sprites.items():
        palette = ", ".join(f"'{c}'" for c in PALETTES[name])
        out.append(f"  {name}: {{")
        out.append(f"    palette: [{palette}],")
        out.append("    rows: [")
        out += [f"      '{r}'," for r in rows]
        out.append("    ],")
        out.append("  },")
    out += ["} as const;", "", "export type SpriteName = keyof typeof SPRITES;", ""]
    return "\n".join(out)


def preview(name, rows, out_dir, scale=8):
    h, w = len(rows), len(rows[0])
    rects = sprite_rects(name, rows, 0, 0, scale)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w * scale}" height="{h * scale}" shape-rendering="crispEdges">'
        f'<rect width="100%" height="100%" fill="#e8f0ff"/>{rects}</svg>'
    )
    render_png(svg, out_dir / f"{name}.png")


if __name__ == "__main__":
    sprites = {name: fn().rows() for name, fn in SPRITES.items()}
    OUT.write_text(to_ts(sprites))
    print("wrote", OUT.relative_to(ROOT))
    for starter in CARD_STARTERS:
        render_png(card_svg(starter, sprites), IMAGES / f"eudimon-{starter['id']}.png")
        render_png(logo_svg(starter, sprites), IMAGES / f"eudimon-{starter['id']}-logo.png")
    if "--preview" in sys.argv:
        out_dir = pathlib.Path(sys.argv[sys.argv.index("--preview") + 1])
        out_dir.mkdir(parents=True, exist_ok=True)
        for name, rows in sprites.items():
            preview(name, rows, out_dir)
        print("previews in", out_dir)
