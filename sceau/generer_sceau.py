import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
src, out, font = sys.argv[1], sys.argv[2], sys.argv[3]
def fblur(a, sig):
    a0 = np.asarray(a, float); p = int(4*sig)+4
    a = np.pad(a0, p, mode="edge"); h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None]
    return np.real(np.fft.ifft2(np.fft.fft2(a)*np.exp(-2*(np.pi*sig)**2*(fx**2+fy**2))))[p:-p, p:-p]
def noise(shape, cell, rng):
    h, w = shape
    return np.asarray(Image.fromarray(rng.random((h//cell+2, w//cell+2)).astype(np.float32), "F").resize((w+2*cell, h+2*cell), Image.BICUBIC))[cell:cell+h, cell:cell+w]

# ---------- logo mask ----------
im = Image.open(src).convert("RGBA")
bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im)
ink = np.asarray(bg.convert("L")) < 128
ys, xs = np.nonzero(ink)
cx, cy = (xs.min()+xs.max())/2, (ys.min()+ys.max())/2
r0 = max(xs.max()-xs.min(), ys.max()-ys.min())/2

# ---------- wax seal heightmap ----------
S = 1400; C = S/2; rng = np.random.default_rng(11)
yy, xx = np.mgrid[0:S, 0:S].astype(float)
dx, dy = xx-C, yy-C; rr = np.hypot(dx, dy); th = np.arctan2(dy, dx)
edge = 610 + sum(rng.uniform(6, 22)/k**0.9*np.sin(k*th+rng.uniform(0, 6.28)) for k in range(2, 50))
for _ in range(6):
    a = rng.uniform(-np.pi, np.pi); w = rng.uniform(0.15, 0.4); h = rng.uniform(10, 40)
    edge = edge + h*np.exp(-(np.angle(np.exp(1j*(th-a)))/w)**2)
wax = rr < edge
# stamp slightly off-centre, ridge irregular
pcx, pcy = C+8, C-6
pr = np.hypot(xx-pcx, yy-pcy); pth = np.arctan2(yy-pcy, xx-pcx)
press = 505 + sum(rng.uniform(2, 6)/k*np.sin(k*pth+rng.uniform(0, 6.28)) for k in range(2, 20))
outer = np.clip((edge-rr)/110, 0, 1)**0.5           # rounded puddle rim
ridge = np.clip(1-((pr-press-28)/55)**2, 0, 1)**1.5  # displaced wax lip
ridge *= 0.75 + 0.5*noise((S, S), 90, rng)
H = 0.65*outer + 0.55*ridge
inside = pr < press
H = np.where(inside, 0.45 + 0.04*noise((S, S), 160, rng), H)
# logo relief (engraved stamp -> raised design)
LR = int(505*0.93)
logo = Image.fromarray((ink*255).astype(np.uint8)).crop((int(cx-r0), int(cy-r0), int(cx+r0), int(cy+r0))).resize((2*LR, 2*LR), Image.LANCZOS)
L = np.zeros((S, S)); x0, y0 = int(pcx-LR), int(pcy-LR)
L[y0:y0+2*LR, x0:x0+2*LR] = np.asarray(logo)/255
L = fblur(L, 2.0)
H = H + 0.16*L*inside
H = H*wax + 0.012*noise((S, S), 25, rng)*wax
H = fblur(H, 2.2)
alpha = np.clip(fblur(wax.astype(float), 1.0), 0, 1)

gy, gx = np.gradient(H*70)
nz = 1/np.sqrt(gx**2+gy**2+1); nx, ny = -gx*nz, -gy*nz
def lam(l):
    l = np.array(l, float); l /= np.linalg.norm(l); return np.clip(nx*l[0]+ny*l[1]+nz*l[2], 0, 1), l
def spec(l, p):
    hv = l+np.array([0, 0, 1.]); hv /= np.linalg.norm(hv)
    return np.clip(nx*hv[0]+ny*hv[1]+nz*hv[2], 0, 1)**p
d1, l1 = lam([-0.45, -0.7, 0.55]); d2, l2 = lam([0.6, 0.3, 0.75])
base = np.array([26, 40, 38])/255
col = base*(0.35+0.9*d1+0.25*d2)[..., None]
glow = 1.0*spec(l1, 35) + 0.18*spec(l1, 6) + 0.35*spec(l2, 60)
col = col + glow[..., None]*np.array([0.85, 0.92, 0.9])
# glitter specks
sp = (rng.random((S, S)) > 0.9992) & wax
sp = np.clip(fblur(sp.astype(float), 0.9)*12, 0, 1)*(0.4+0.6*d1)
col = col + 0.5*sp[..., None]
col = np.clip(col, 0, 1)
seal = Image.fromarray(np.dstack([(col*255).astype(np.uint8), (alpha*255).astype(np.uint8)]), "RGBA")
seal.save(out+"_seal_noir.png")

# ---------- envelope close-up (4:5) ----------
W, Hh = 2160, 2700
rng2 = np.random.default_rng(5)
Y, X = np.mgrid[0:Hh, 0:W].astype(float)
paper = np.array([214, 218, 205], float)
img = np.ones((Hh, W, 3))*paper
grain = fblur(rng2.random((Hh, W)), 1.1); grain = (grain-grain.mean())/grain.std()
tipx, tipy = W*0.52, Hh*0.43
def side(ax, ay, bx, by): return (bx-ax)*(Y-ay)-(by-ay)*(X-ax)
flap = (side(-400, -300, tipx, tipy) <= 0) & (side(tipx, tipy, W+400, -250) <= 0)
# lower side folds meet a little below the tip
lowL = side(-200, Hh+200, tipx, tipy+260) < 0
lowR = side(tipx, tipy+260, W+200, Hh+300) < 0
img = np.where((~flap & lowL)[..., None], img*0.975, img)
img = np.where((~flap & lowR)[..., None], img*0.955, img)
# soft light falloff
img *= (1.04 - 0.10*((X/W-0.4)**2 + (Y/Hh-0.3)**2))[..., None]
fm = flap.astype(float)
fsh = np.clip(fblur(fm, 22)-fm, 0, 1); fsh = np.pad(fsh, ((14, 0), (4, 0)), mode='edge')[:Hh, :W]
img = img*(1-0.6*fsh[..., None])
img = np.where(flap[..., None], img*1.025, img)
img = img + grain[..., None]*1.8
# seal + shadow
sz = 1060
sm = seal.resize((sz, sz), Image.LANCZOS)
ox, oy = int(tipx-sz/2), int(tipy-sz/2+10)
a = np.zeros((Hh, W)); a[oy:oy+sz, ox:ox+sz] = np.asarray(sm)[..., 3]/255
sh = np.pad(fblur(a, 26), ((30, 0), (16, 0)))[:Hh, :W]
img = img*(1-0.55*sh[..., None])
P = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")
P.alpha_composite(sm, (ox, oy))
P.convert("RGB").resize((1080, 1350), Image.LANCZOS).save(out+"_enveloppe_noir.png")
# with headline
T = P.copy(); d = ImageDraw.Draw(T)
f = ImageFont.truetype(font, 210)
for i, line in enumerate(["BECOME OUR", "MEMBER"]):
    w = d.textlength(line, font=f)
    d.text(((W-w)/2, 1960+i*250), line, font=f, fill=(36, 54, 56))
T.convert("RGB").resize((1080, 1350), Image.LANCZOS).save(out+"_enveloppe_noir_member.png")
