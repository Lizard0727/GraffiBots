#!/usr/bin/env python3
# 涂鸦机兵 电脑版 3.2 —— 用 OpenAI GPT Image 重新生成全部驾驶员的立绘 + 头像
# 画风：偏写实的动漫插画、粗重墨线、低饱和配色 + 一个主题色、强烈明暗、颗粒笔触（不点名任何现有作品）
# 运行：python3 tools/gen-portraits.py [id ...]     （不写 id = 全部；已经生成过的会跳过，加 --force 重新生成）
# Key：在云端环境的 Network secrets 里给 api.openai.com 配 Bearer key（代理会自动带上），或者设置 OPENAI_API_KEY
# 输出：godot/art/portraits/<id>.png（600×780，透明背景）、godot/art/faces/<id>.png（160×160 头像）、原图在 tools/portraits-raw/
import base64, io, json, os, sys, time, urllib.request
from PIL import Image

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

def export(pid, raw):
    im = Image.open(raw).convert('RGBA')
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
    bg = Image.new('RGBA', (160, 160), P_BG(pid)); bg.alpha_composite(face)
    bg.save(os.path.join(ROOT, 'godot', 'art', 'faces', pid + '.png'), optimize=True)

def P_BG(pid):
    c = DATA['pilots'][pid]['accent'].lstrip('#'); r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    return (int(r * 0.35), int(g * 0.35), int(b * 0.35), 255)

if __name__ == '__main__':
    force = '--force' in sys.argv
    ids = [a for a in sys.argv[1:] if not a.startswith('--')] or DATA['pilotOrder']
    for pid in ids:
        export(pid, gen(pid, force))
    print('完成', len(ids), '位驾驶员')
