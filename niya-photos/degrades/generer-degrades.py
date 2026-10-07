import numpy as np, sys
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter, uniform_filter1d
W,H=1880,2840
def hx(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],float)
DARK,RED,LAV,GREY=hx('#1F0803'),hx('#CA4429'),hx('#BEC6F0'),hx('#E6E6E6')
def make(stops, seed, name, wave=0.06):
    rng=np.random.default_rng(seed)
    x=np.linspace(0,1,W)[None,:]; y=np.linspace(0,1,H)[:,None]
    # wavy displacement of y varying with x (like the curved band)
    ph=rng.uniform(0,6.28,3)
    disp=-wave*1.6*(x-0.75)**2+wave*0.5*x
    yy=np.clip(y+disp*(1-y)**0.5,0,1)
    pos=np.array([s[0] for s in stops]); cols=np.array([s[1] for s in stops])
    img=np.zeros((H,W,3))
    for c in range(3): img[...,c]=np.interp(yy,pos,cols[:,c])
    # horizontal streak noise (motion blur look)
    streak=rng.normal(0,1,(H,1))*np.ones((1,W))
    streak=gaussian_filter(streak,(3,0))
    lowband=np.clip((y-0.7)/0.3,0,1)
    img+= streak[...,None]*np.array([14,12,16])*(0.3+1.5*lowband)[...,None]
    # motion blur horizontally, soften vertically
    for c in range(3):
        img[...,c]=uniform_filter1d(img[...,c],size=401,axis=1,mode='nearest')
        img[...,c]=gaussian_filter(img[...,c],(10,60))
    # film grain
    img+=rng.normal(0,7,(H,W,1))
    Image.fromarray(np.clip(img,0,255).astype('uint8')).save(name,quality=95)
D='/home/user/claude-code/niya-photos/degrades/'
# v1: structure of the reference (lavender sky, red band, lavender/grey middle, dark bottom)
make([(0,LAV),(0.22,LAV),(0.30,(LAV+RED)/2),(0.37,RED),(0.43,RED),(0.50,(RED*0.5+LAV*0.5)),(0.60,LAV),(0.72,GREY*0.6+LAV*0.4),(0.80,LAV*0.7+DARK*0.3),(0.88,DARK*0.7+RED*0.3),(1,DARK)],1,D+'degrade-niya-v1.jpg')
# v2: darker, red glow rising from dark
make([(0,DARK),(0.25,DARK),(0.40,DARK*0.5+RED*0.5),(0.50,RED),(0.58,RED*0.6+LAV*0.4),(0.68,LAV),(0.80,GREY),(0.90,LAV*0.8+DARK*0.2),(1,DARK*0.6+LAV*0.4)],7,D+'degrade-niya-v2.jpg',wave=0.08)
# v3: light, grey/lavender with thin red stripe
make([(0,GREY),(0.30,GREY*0.5+LAV*0.5),(0.48,LAV),(0.54,RED),(0.58,RED*0.5+LAV*0.5),(0.70,LAV),(0.85,GREY),(1,GREY*0.8+DARK*0.2)],3,D+'degrade-niya-v3.jpg',wave=0.04)
