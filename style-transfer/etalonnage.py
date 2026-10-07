import sys, numpy as np
from PIL import Image, ImageFilter

def srgb_to_lin(c): return np.where(c <= 0.04045, c/12.92, ((c+0.055)/1.055)**2.4)
def lin_to_srgb(c): return np.where(c <= 0.0031308, c*12.92, 1.055*np.clip(c,0,None)**(1/2.4)-0.055)
M = np.array([[0.4124,0.3576,0.1805],[0.2126,0.7152,0.0722],[0.0193,0.1192,0.9505]])
WP = np.array([0.95047,1.0,1.08883])
def f(t): return np.where(t > (6/29)**3, np.cbrt(t), t/(3*(6/29)**2)+4/29)
def finv(t): return np.where(t > 6/29, t**3, 3*(6/29)**2*(t-4/29))
def rgb2lab(rgb):
    xyz = srgb_to_lin(rgb) @ M.T / WP
    fx, fy, fz = f(xyz[...,0]), f(xyz[...,1]), f(xyz[...,2])
    return np.stack([116*fy-16, 500*(fx-fy), 200*(fy-fz)], -1)
def lab2rgb(lab):
    fy = (lab[...,0]+16)/116; fx = fy+lab[...,1]/500; fz = fy-lab[...,2]/200
    xyz = np.stack([finv(fx), finv(fy), finv(fz)], -1) * WP
    return np.clip(lin_to_srgb(xyz @ np.linalg.inv(M).T), 0, 1)

src_p, ref_p, out_p, strength = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
src = np.asarray(Image.open(src_p).convert('RGB'), dtype=np.float64)/255
ref = np.asarray(Image.open(ref_p).convert('RGB'), dtype=np.float64)/255
# ignore the UI dots / border of the reference: crop 6% margins
h, w = ref.shape[:2]; ref = ref[int(h*.06):int(h*.94), int(w*.06):int(w*.94)]

L, R = rgb2lab(src), rgb2lab(ref)
out = L.copy()
# 1) chroma/tint transfer (a, b) - Reinhard style, full stats
for c in (1, 2):
    tgt_mean = R[...,c].mean()*(0.35 if c==1 else 1.15)  # less magenta, more golden
    tgt_std = 0.5*(R[...,c].std()+L[...,c].std())
    out[...,c] = (L[...,c]-L[...,c].mean())/(L[...,c].std()+1e-6)*tgt_std + tgt_mean
# 2) luminance: match mean/contrast partially (photo 2 is darker and softer)
l = L[...,0]
lt = (l-l.mean())/l.std()*R[...,0].std() + R[...,0].mean()
out[...,0] = l + 0.55*(lt-l)
# 3) soft filmic curve: lift blacks, roll off highlights
x = out[...,0]/100
x = 0.04 + 0.92*x            # matte blacks, softened whites
x = x + 0.06*np.sin(np.pi*x)*(0.5-x)*-1  # gentle low-contrast S inversion
out[...,0] = np.clip(x, 0, 1)*100
# blend with original for the chosen strength
out = L + strength*(out-L)
rgb = lab2rgb(out)
# 4) warm vignette like the window-lit interior
hh, ww = rgb.shape[:2]
yy, xx = np.mgrid[0:hh, 0:ww]
d = np.sqrt(((xx-ww*0.48)/(ww*0.75))**2 + ((yy-hh*0.33)/(hh*0.75))**2)
vig = 1 - 0.28*np.clip(d-0.35, 0, 1)**1.5
rgb = rgb*vig[...,None]
img = Image.fromarray((np.clip(rgb,0,1)*255+0.5).astype(np.uint8))
img.save(out_p, quality=95)
print('saved', out_p, 'ref Lab mean', R.reshape(-1,3).mean(0).round(1), 'src', L.reshape(-1,3).mean(0).round(1))
