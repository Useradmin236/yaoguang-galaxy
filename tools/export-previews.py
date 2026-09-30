"""Export real browser captures into gallery assets and comparison sheets."""
from pathlib import Path
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'artifacts' / 'looks'
DEST = ROOT / 'vendor' / 'previews'
DEST.mkdir(parents=True, exist_ok=True)
LOOKS = [
    ('observatory', '瑶光观测台', '淡银河 · 克制导航'),
    ('cinema', '静谧远航', '低角度 · 深色夜面'),
    ('atlas', '星图档案', '俯视测绘 · 球面经纬'),
    ('nebula', '星云梦境', '彩色尘云 · 柔光'),
]
VIEWS = [('system', '星系全景'), ('lingxi', '聆汐近景'), ('suxian', '素霰环系'), ('mobile', '手机视图')]
FONT = Path(os.environ['PREVIEW_FONT'])

for key, _, _ in LOOKS:
    for view, _ in VIEWS:
        with Image.open(SOURCE / f'{key}-{view}.png') as source:
            source.convert('RGB').save(DEST / f'{key}-{view}.webp', quality=92, method=6)

for view, label in VIEWS:
    mobile = view == 'mobile'
    thumb_w, thumb_h = (390, 844) if mobile else (960, 640)
    gap, margin, header, caption = 24, 32, 112, 76
    columns, rows = (4, 1) if mobile else (2, 2)
    width = margin * 2 + columns * thumb_w + (columns - 1) * gap
    height = header + rows * (thumb_h + caption) + (rows - 1) * gap + 32
    board = Image.new('RGB', (width, height), '#060813')
    draw = ImageDraw.Draw(board)
    title_font = ImageFont.truetype(str(FONT), 30)
    font = ImageFont.truetype(str(FONT), 23)
    small = ImageFont.truetype(str(FONT), 16)
    draw.text((margin, 22), f'瑶光 · 四种观看方式 / {label}', fill='#e2eaf0', font=title_font)
    draw.text((margin, 69), '实际 3D 页面截图 · 相同天体时刻 · 公开演示', fill='#91a8ba', font=small)
    for i, (key, name, description) in enumerate(LOOKS):
        x = margin + (i % columns) * (thumb_w + gap)
        y = header + (i // columns) * (thumb_h + caption + gap)
        draw.text((x, y), name, fill='#e2eaf0', font=font)
        draw.text((x, y + 34), description, fill='#91a8ba', font=small)
        with Image.open(SOURCE / f'{key}-{view}.png') as source:
            thumb = source.convert('RGB').resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            board.paste(thumb, (x, y + caption))
    board.save(DEST / f'compare-{view}.jpg', quality=94, subsampling=0)
    print(f'Exported {view} comparison: {width} x {height}')
print(f'16 browser captures and 4 comparison sheets saved to {DEST}')
