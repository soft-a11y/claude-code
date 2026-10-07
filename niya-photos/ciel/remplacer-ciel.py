import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, binary_opening, binary_closing
src='/tmp/claude-0/-home-user-claude-code/efd88e6d-65fc-5ddf-8392-52d5f4036901/images/8.jpg'
im=np.asarray(Image.open(src).convert('RGB')).astype(float)
H,W,_=im.shape
r,g,b=im[...,0],im[...,1],im[...,2]
lum=0.299*r+0.587*g+0.114*b
mx=im.max(-1); mn=im.min(-1); sat=(mx-mn)/(mx+1e-3)
y=np.arange(H)[:,None]/H; x=np.arange(W)[None,:]/W
# sky: bright, low saturation, bluish/neutral, in the upper part
sky=(lum>120)&(sat<0.35)&(b>=r-25)&(y<0.62)
sky=binary_opening(sky,iterations=2); sky=binary_closing(sky,iterations=2)
m=gaussian_filter(sky.astype(float),1.2)[...,None]
def hx(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],float)
RED,LAV,GREY,DARK=hx('#CA4429'),hx('#BEC6F0'),hx('#E6E6E6'),hx('#1F0803')
# diagonal coordinate: rises to the right
t=(y/0.55) - 0.25*(x-0.5)
t=np.clip(t,0,1)
stops=[(0,RED),(0.22,RED*0.85+LAV*0.15),(0.45,LAV),(0.68,GREY*0.6+LAV*0.4),(0.86,GREY*0.55+DARK*0.45),(1,DARK*0.8+RED*0.2)]
pos=np.array([s[0] for s in stops]); cols=np.array([s[1] for s in stops])
grad=np.stack([np.interp(t,pos,cols[:,c]) for c in range(3)],-1)
grad=gaussian_filter(grad,(25,25,0))
rng=np.random.default_rng(4); grad+=rng.normal(0,6,(H,W,1))
# keep a bit of original texture (window film lines) via luminance detail
detail=(lum-gaussian_filter(lum,6))[...,None]*0.6
out=im*(1-m)+(grad+detail)*m
Image.fromarray(np.clip(out,0,255).astype('uint8')).save('/home/user/claude-code/niya-photos/ciel/observatoire-ciel-niya-v3.jpg',quality=95,subsampling=0)
Image.fromarray((sky*255).astype('uint8')).save('/tmp/claude-0/-home-user-claude-code/efd88e6d-65fc-5ddf-8392-52d5f4036901/scratchpad/mask.png')
