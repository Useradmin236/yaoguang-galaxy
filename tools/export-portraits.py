"""Small local portraits made from the current Three.js worlds."""
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
dest = root / 'vendor' / 'portraits'
dest.mkdir(exist_ok=True)
for key in ['jixi', 'mingai', 'lingxi', 'suxian', 'xunqi', 'qitang', 'yaoguang']:
    with Image.open(root / 'artifacts' / 'refinement' / f'{key}-portrait.png') as image:
        ImageOps.fit(image.convert('RGB'), (440, 240), method=Image.Resampling.LANCZOS).save(dest / f'{key}.webp', quality=90, method=6)
print('Exported seven actual scene portraits')
