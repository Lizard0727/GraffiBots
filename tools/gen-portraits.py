#!/usr/bin/env python3
# 涂鸦机兵 电脑版 3.2 —— 用 OpenAI GPT Image 重新生成全部驾驶员的立绘 + 头像
# 画风：偏写实的动漫插画、粗重墨线、低饱和配色 + 一个主题色、强烈明暗、颗粒笔触（不点名任何现有作品）
# 运行：python3 tools/gen-portraits.py [id ...]     （不写 id = 全部；已经生成过的会跳过，加 --force 重新生成）
# Key：在云端环境的 Network secrets 里给 api.openai.com 配 Bearer key（代理会自动带上），或者设置 OPENAI_API_KEY
# 免费做法（3.2 实际用的）：用 Figma 免费帐号自带的 AI 生图（Figma MCP 的 generate_image，吃每月免费 AI 额度，不要 API Key），
#   提示词 = STYLE_KEYED + LOOKS，背景要求纯绿 #00FF00（青绿系角色用纯品红 #FF00FF），下载到 tools/portraits-raw/<id>.png（仓库里存的是 683×1024 的 .jpg 原图，省空间），
#   然后 python3 tools/gen-portraits.py --export-only 抠掉纯色背景并导出
# 输出：godot/art/portraits/<id>.png（600×780，透明背景）、godot/art/faces/<id>.png（160×160 头像）、原图在 tools/portraits-raw/
import base64, io, json, os, sys, time, urllib.request
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont
import random

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA = json.load(open(os.path.join(ROOT, 'godot', 'data', 'game.json'), encoding='utf-8'))
RAW = os.path.join(ROOT, 'tools', 'portraits-raw')
STYLE = ('Bust-up character portrait for a game roster, original character. Semi-realistic anime illustration with heavy black ink '
         'linework and hard-edged cel shadows, gritty urban atmosphere, desaturated muted palette with a single strong accent color, '
         'dramatic chiaroscuro rim lighting, subtle grain and brush texture, sharp confident expression. Head and shoulders, '
         'three-quarter view facing slightly to the left, centered, face in the upper third. Fully transparent background, '
         'no text, no logo, no frame.')
# 每个人的外貌：年龄感 / 脸型 / 发型 / 表情 / 衣服 / 标志性配饰 —— 刻意拉开差距，不撞脸
LOOKS = {
    'blaze': 'Hot-blooded teenage boy, sharp angular face, wild spiky crimson hair swept up like flames, amber eyes, cocky grin showing a fang, red open bomber jacket over a white tee, bandage on the nose bridge',
    'frost': 'Aloof young woman sniper, long narrow face, straight silver-white bob with one side tucked behind the ear, pale ice-blue eyes, expressionless, long white military greatcoat with high collar, a thin scar under the left eye',
    'candy': 'Bubbly idol streamer girl, round soft face, big twin-tails in pastel pink with darker pink ends, violet sparkling eyes, open-mouth smile and a wink, frilly pink stage outfit with a yellow bow, star hairpins and a headset mic',
    'titan': 'Huge muscular dark-skinned man in his thirties, square jaw, thick black dreadlocks tied back, gold eyes, stern calm stare, sleeveless tank top, heavy shoulders, a steel plate brace on one arm',
    'raven': 'Mysterious quiet graffiti artist, androgynous slim face half hidden in an oversized dark purple hood, sleepy half-lidded lilac eyes, paint-stained cheek, black face mask pulled down around the neck',
    'aurora': 'Cheerful genius mechanic girl, freckled heart-shaped face, teal high ponytail with goggles pushed up on the forehead, mint-green eyes, grease smudge on the cheek, white tee under teal overalls, wrench behind the ear',
    'gale': 'Speed-racer young woman, slim face with a confident smirk, long pale-blue hair in a single thick braid, bright blue eyes, brown leather aviator jacket with fur collar and flight goggles around the neck',
    'hex': 'Cocky teenage hacker boy, thin pale face, dark violet undercut with a neon magenta streak, glowing magenta eyes reflecting code, black hoodie with cyan circuit trim, AR visor over one eye',
    'chef': 'Jolly chubby cook in his forties, round cheerful face with rosy cheeks and a curled mustache, ginger-brown hair under a tall white chef hat, warm brown eyes, double-breasted white chef coat, ladle over the shoulder',
    'vet': 'Grizzled retired ace pilot in his fifties, weathered lined face, short grey crew cut and a trimmed grey beard, steel-blue eyes, olive military jacket with medals, an old aviator scar across the eyebrow',
    'yuzu': 'Energetic little drone girl, small round face, orange hair in two space buns, big orange eyes, toothy grin, yellow hoodie with cat ears, a small cat-shaped drone perched on her shoulder',
    'flag': 'Resistance captain young woman, determined strong face, dark charcoal hair in a short swept cut, burning orange eyes, grey worn coat with a long orange scarf, red armband, paint-stained gloves',
    'hammer': 'Burly demolition foreman in his forties, broad weathered tan face, short dark brown hair and stubble, brown eyes, orange work jacket with a yellow hi-vis vest, hard hat tilted back, sledgehammer handle over the shoulder',
    'echo': 'Underground radio DJ young man, lean face with a lazy grin, spiky teal hair with dark roots, violet eyes, cyan bomber jacket with gold chain, large studio headphones around the neck',
    'han': 'Former corporate security chief, middle-aged woman, sharp severe face, pale silver undercut with short top, cold blue eyes, black tactical suit with shoulder armor, an earpiece, scar across the chin',
    'kaka': 'Mischievous street magician young man, playful narrow face, slicked black hair under a tilted top hat, golden eyes, knowing smirk, black tailcoat with red bowtie and a red-lined cape, a playing card between fingers',
    'fu': 'Calm talisman sorceress young woman, delicate oval face, long dark navy hair in a high ponytail, violet eyes, serene expression, dark academy uniform with gold buttons and high collar, paper talismans floating near her',
    'aka': 'Possessed young man with a scythe, gaunt pale face, messy black spiky hair with crimson tips, glowing red eyes with dark circles, wild grin, black hooded academy uniform with red lining, a shadowy red aura behind him',
    'hawk': 'Veteran mercenary captain in his forties, rugged tanned face with stubble, dark brown undercut, sky-blue eyes, desert tactical vest over a dark shirt, tan scarf, dog tags, calm confident half smile',
    'doc': 'Defector research doctor woman in her late twenties, intelligent narrow face, dark slate hair in a low ponytail, cyan eyes behind thin rectangular glasses, white lab coat over a dark turtleneck, ID badge clipped on',
    'zero': 'Elite test-pilot young man, sharp emotionless face, black undercut with a hot-pink strand, hot-pink eyes, black pilot suit with glowing pink lines and the number 00 on the chest, neck interface port',
    'xiwei': 'Gentle rescue operator girl, soft round face with a warm smile, cream-white hair in a long side braid tied with amber thread, amber eyes, cream short cape over an amber tactical jacket, a small golden sun hairpin and a sundial emblem',
    'coda': 'Melancholic radio host young woman, cool composed face, dark navy hair with glowing cyan inner tips falling past the shoulders, cyan eyes, deep navy long coat with cyan piping, large monitor headphones, an old cassette tape clipped to her strap',
    'xiao': 'Silent night-watch young man, sharp handsome face mostly shadowed by a black hood with violet lining, short black hair, violet eyes, a small crescent-moon mark under the left eye, black high-collar cloak, a hanging lantern charm',
}

def api(path, body):
    key = os.environ.get('OPENAI_API_KEY', 'proxy-injects-the-real-key')
    req = urllib.request.Request('https://api.openai.com/v1/' + path, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())

def gen(pid, force=False):
    P = DATA['pilots'][pid]
    raw = os.path.join(RAW, pid + '.png')
    if os.path.exists(raw) and not force: print('跳过（已经有了）', pid); return raw
    prompt = STYLE + ' Character: ' + LOOKS[pid] + '. Accent color ' + P['accent'] + '. Role: ' + P['title'] + '.'
    for attempt in range(3):
        try:
            r = api('images/generations', {'model': 'gpt-image-1', 'prompt': prompt, 'size': '1024x1536', 'quality': 'high', 'background': 'transparent', 'n': 1})
            os.makedirs(RAW, exist_ok=True)
            open(raw, 'wb').write(base64.b64decode(r['data'][0]['b64_json']))
            print('生成', pid); return raw
        except Exception as e:
            print('失败，重试', pid, e); time.sleep(5 * (attempt + 1))
    raise SystemExit('生成失败：' + pid)

def key(im):
    # 抠纯色背景：取上面两个角的颜色当背景色，按颜色距离算透明度（边缘柔和），再去掉边缘的绿/品红溢色
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    H, W, _ = a.shape
    kc = (a[:12, :12].reshape(-1, 3).mean(0) + a[:12, -12:].reshape(-1, 3).mean(0)) / 2
    green = kc[1] > kc[0]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # 「有多像背景」：绿幕 = g 比 r、b 都高多少；品红幕 = r、b 都比 g 高多少
    sc = g - np.maximum(r, b) if green else np.minimum(r, b) - g
    alpha = np.clip((140.0 - sc) / 80.0, 0, 1)          # sc ≥ 140 → 全透明，sc ≤ 60 → 不透明（头发缝里被包住的背景也一起抠）
    # 只在背景附近去溢色，角色身体中间的颜色不动
    near = np.asarray(Image.fromarray(((alpha < 0.99) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    # 去溢色（只在背景附近）：绿幕把 g 压到 max(r,b)，品红幕把 r、b 一起压掉多出来的那部分
    spill = np.maximum(0, sc) * near
    if green: a[..., 1] -= spill
    else: a[..., 0] -= spill; a[..., 2] -= spill
    out = np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'

def make_bg(pid, W=1280, H=720):
    # 抽卡展示用的背景（1280×720）：暗底 + 主题色光 + 斜向大笔刷 + 网点 + 墨点 + 划痕 + 大号英文名 + 档案框线
    # 背景细节全部程序化生成（按 id 固定随机种子），角色本身用透明立绘叠在上面
    rnd = random.Random(pid)
    c = DATA['pilots'][pid]['accent'].lstrip('#'); acc = np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    base = acc * 0.10 + 6
    img = np.ones((H, W, 3), np.float32) * base
    # 角色身后的主题色光（偏右）
    d = np.sqrt(((xx - W * 0.68) / (W * 0.42)) ** 2 + ((yy - H * 0.42) / (H * 0.7)) ** 2)
    img += acc[None, None, :] * (np.clip(1 - d, 0, 1) ** 1.6)[..., None] * 0.55
    im = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(lay)
    # 网点（左下 → 右上渐变大小）
    step = 14
    for y in range(0, H, step):
        for x in range(0, W, step):
            t = (x / W) * 0.6 + (1 - y / H) * 0.4
            r = 5.5 * max(0.0, 1 - abs(t - 0.55) * 2.4)
            if r > 0.6: dr.ellipse((x - r, y - r, x + r, y + r), fill=tuple(int(v) for v in acc * 0.55) + (70,))
    # 斜向大笔刷（边缘抖动）
    def stroke(x0, w, col, alpha, slope=0.42):
        pts_l, pts_r = [], []
        for i in range(0, H + 40, 20):
            j = rnd.uniform(-10, 10); off = (H - i) * slope
            pts_l.append((x0 + off + j, i)); pts_r.append((x0 + off + w + rnd.uniform(-14, 14), i))
        dr.polygon(pts_l + pts_r[::-1], fill=col + (alpha,))
    stroke(W * 0.38, W * 0.2, tuple(int(v) for v in acc * 0.85), 150)
    stroke(W * 0.35, 10, (240, 236, 228), 150)
    stroke(W * 0.62, 26, tuple(int(v) for v in acc), 110)
    # 墨点 / 飞溅
    for _ in range(9):
        cx, cy = rnd.uniform(W * 0.3, W), rnd.uniform(0, H); R = rnd.uniform(8, 34)
        col = (8, 6, 10, 200) if rnd.random() < 0.6 else tuple(int(v) for v in acc) + (170,)
        dr.ellipse((cx - R, cy - R, cx + R, cy + R), fill=col)
        for _ in range(rnd.randint(6, 14)):
            a = rnd.uniform(0, 6.283); dd = R * rnd.uniform(1.2, 3.2); r2 = rnd.uniform(1.5, R * 0.3)
            px, py = cx + np.cos(a) * dd, cy + np.sin(a) * dd
            dr.ellipse((px - r2, py - r2, px + r2, py + r2), fill=col)
        if rnd.random() < 0.5:   # 往下流的墨痕
            L = rnd.uniform(30, 120); dr.rectangle((cx - R * 0.2, cy, cx + R * 0.2, cy + L), fill=col); dr.ellipse((cx - R * 0.3, cy + L - R * 0.3, cx + R * 0.3, cy + L + R * 0.3), fill=col)
    # 划痕
    for _ in range(40):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H); L = rnd.uniform(20, 140); a = rnd.uniform(-0.5, 0.5) - 1.1
        dr.line((x, y, x + np.cos(a) * L, y + np.sin(a) * L), fill=(230, 226, 220, rnd.randint(18, 50)), width=1)
    # 大号英文名（描边、半透明，竖排在右边 + 横排在底下）
    name = pid.upper()
    f = ImageFont.truetype(SERIF, 230)
    dr.text((W * 0.30, H * 0.56), name, font=f, fill=(0, 0, 0, 0), stroke_width=3, stroke_fill=tuple(int(v) for v in acc) + (90,))
    txt = Image.new('RGBA', (H, 200), (0, 0, 0, 0)); ImageDraw.Draw(txt).text((10, 0), (name + ' // ') * 3, font=ImageFont.truetype(SERIF, 120), fill=(255, 255, 255, 22))
    lay.alpha_composite(txt.rotate(90, expand=True), (W - 190, 0))
    # 档案框线 + 小字
    fm = ImageFont.truetype(MONO, 15)
    no = DATA['pilotOrder'].index(pid) + 1
    for (x, y, sx, sy) in ((24, 24, 1, 1), (W - 24, 24, -1, 1), (24, H - 24, 1, -1), (W - 24, H - 24, -1, -1)):
        dr.line((x, y, x + 60 * sx, y), fill=(240, 236, 228, 160), width=2); dr.line((x, y, x, y + 60 * sy), fill=(240, 236, 228, 160), width=2)
    dr.text((40, H - 46), 'GRAFFIBOTS // PILOT FILE No.%02d // %s' % (no, name), font=fm, fill=(240, 236, 228, 120))
    dr.text((W - 330, 34), 'CLEARANCE ▮▮▮▮▯  SYNC %d%%' % rnd.randint(71, 99), font=fm, fill=(240, 236, 228, 110))
    dr.line((40, H - 54, W * 0.45, H - 54), fill=tuple(int(v) for v in acc) + (160,), width=2)
    im = im.convert('RGBA'); im.alpha_composite(lay)
    # 颗粒 + 暗角
    g = np.asarray(im.convert('RGB')).astype(np.float32)
    g += np.random.default_rng(len(pid) * 97).normal(0, 7, (H, W, 1))
    vig = np.clip(1.25 - np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2), 0.35, 1)
    g *= vig[..., None]
    return Image.fromarray(g.clip(0, 255).astype(np.uint8))

def export(pid, raw):
    im = Image.open(raw)
    if im.mode != 'RGBA' or im.getextrema()[3][0] == 255: im = key(im)
    im = im.convert('RGBA')
    W, H = im.size
    # 立绘 600×780：按宽缩放，从上往下裁
    por = im.resize((600, int(H * 600 / W)), Image.LANCZOS).crop((0, 0, 600, 780))
    por.save(os.path.join(ROOT, 'godot', 'art', 'portraits', pid + '.png'), optimize=True)
    # 头像 160×160：找不透明区域的上部（脸），裁成正方形
    bbox = im.getbbox() or (0, 0, W, H)
    x0, y0, x1, y1 = bbox
    side = int((x1 - x0) * 0.62)
    cx = (x0 + x1) // 2; top = y0 + int(side * 0.12)
    face = im.crop((cx - side // 2, top, cx + side // 2, top + side)).resize((160, 160), Image.LANCZOS)
    bgi = make_bg(pid); os.makedirs(os.path.join(ROOT, 'godot', 'art', 'revealbg'), exist_ok=True)
    bgi.save(os.path.join(ROOT, 'godot', 'art', 'revealbg', pid + '.jpg'), quality=88)
    bg = bgi.crop((700, 120, 1180, 600)).resize((160, 160), Image.LANCZOS).convert('RGBA'); bg.alpha_composite(face)
    bg.save(os.path.join(ROOT, 'godot', 'art', 'faces', pid + '.png'), optimize=True)

def P_BG(pid):
    c = DATA['pilots'][pid]['accent'].lstrip('#'); r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    return (int(r * 0.35), int(g * 0.35), int(b * 0.35), 255)

if __name__ == '__main__':
    force = '--force' in sys.argv
    ids = [a for a in sys.argv[1:] if not a.startswith('--')] or DATA['pilotOrder']
    for pid in ids:
        if '--export-only' in sys.argv:
            for ext in ('.png', '.jpg'):
                raw = os.path.join(RAW, pid + ext)
                if os.path.exists(raw): export(pid, raw); print('导出', pid); break
            continue
        export(pid, gen(pid, force))
    print('完成', len(ids), '位驾驶员')
