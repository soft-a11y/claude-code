import sys, numpy as np
from PIL import Image
def fblur(a, sig):
    a0 = np.asarray(a, float); p = int(4*sig)+4
    a = np.pad(a0, p, mode="edge"); h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None]
    return np.real(np.fft.ifft2(np.fft.fft2(a)*np.exp(-2*(np.pi*sig)**2*(fx**2+fy**2))))[p:-p, p:-p]
photo, design, out = sys.argv[1:4]
im = np.asarray(Image.open(photo).convert("RGB")).astype(float)
# work region (cover area left of the elastic)
x0, y0, x1, y1 = 600, 820, 1170, 1500
R = im[y0:y1, x0:x1].copy()
lum = R.mean(2)
ink = lum < 150
inkd = fblur(ink.astype(float), 3) > 0.02
# inpaint by normalized convolution of non-ink pixels
w = (~inkd).astype(float)
clean = np.dstack([fblur(R[..., c]*w, 25)/np.maximum(fblur(w, 25), 1e-3) for c in range(3)])
for s in (12, 6):
    clean = np.where(inkd[..., None], clean, R)
    clean = np.dstack([fblur(clean[..., c], s) for c in range(3)])*inkd[..., None] + R*(~inkd[..., None])
inkcol = np.median(R[lum < 90], axis=0)
grain = R - np.dstack([fblur(R[..., c], 2) for c in range(3)])
gs = grain[~inkd].std(0)
rnd = np.random.default_rng(1).standard_normal(R.shape)
rnd = np.dstack([fblur(rnd[..., c], 0.7) for c in range(3)]); rnd = rnd/rnd.std()*gs
grain = np.where(inkd[..., None], rnd, grain)
# design ink alpha
d = np.asarray(Image.open(design).convert("L")).astype(float)
bg = np.median(d); a = np.clip((bg - d)/(bg - 30), 0, 1)
ys, xs = np.nonzero(a > 0.3)
a = a[ys.min()-4:ys.max()+5, xs.min()-4:xs.max()+5]
s = 442/947  # match previous MEMBRE width
A = np.asarray(Image.fromarray((a*255).astype(np.uint8)).resize((round(a.shape[1]*s), round(a.shape[0]*s)), Image.LANCZOS)).astype(float)/255
A = fblur(A, 0.5)
H, W = A.shape
cx, cy = 300+619 - x0, 400+792 - y0
ox, oy = int(cx - W/2), int(cy - H/2)
full = np.zeros(lum.shape); full[oy:oy+H, ox:ox+W] = A
light = clean.mean(2, keepdims=True)/np.median(clean.mean(2))
col = inkcol*light
newR = clean*(1-full[..., None]) + col*full[..., None] + grain*0.8
res = im.copy(); res[y0:y1, x0:x1] = newR
Image.fromarray(np.clip(res, 0, 255).astype(np.uint8)).save(out)
print(inkcol, W, H)
