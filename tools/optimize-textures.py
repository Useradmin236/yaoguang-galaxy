"""Build runtime WebP textures without changing the authored source images.

Authored colour maps stay 2048px at quality 94. Numeric relief/cloud maps and
satellite maps use a 1024px runtime limit; numeric channels and alpha are encoded
losslessly against their resampled reference. Backgrounds remain lossless.
Run with --check to verify existing outputs.
"""
from pathlib import Path
import argparse
import json
import math

from PIL import Image, ImageChops, ImageStat, features


ROOT = Path(__file__).resolve().parents[1]
TEXTURES = ROOT / 'vendor' / 'textures'
REPORT = ROOT / 'artifacts' / 'texture-webp-20260922' / 'asset-results.json'
WORLDS = ('jixi', 'lingxi', 'xunqi', 'mingai', 'suxian', 'qitang')
COLOUR_QUALITY = 94


def sources():
    for world in WORLDS:
        yield TEXTURES / 'worlds' / f'{world}-albedo.png', False
        yield TEXTURES / 'worlds' / f'{world}-relief.png', True
        cloud = TEXTURES / 'worlds' / f'{world}-clouds.png'
        if cloud.exists():
            yield cloud, True
    for name in ('deep-field.png', 'nebula-field.png'):
        yield TEXTURES / 'worlds' / name, True
    for name in ('2k_earth_daymap.jpg', '2k_jupiter.jpg', '2k_moon.jpg',
                 '2k_mercury.jpg', '2k_venus_surface.jpg'):
        yield TEXTURES / name, False
    yield TEXTURES / '2k_saturn_ring_alpha.png', True


def verify(source, target, lossless):
    with Image.open(source) as original, Image.open(target) as compressed:
        compressed.load()
        assert compressed.format == 'WEBP', target
        reference = runtime_image(source, original)
        assert reference.size == compressed.size, f'Unexpected resolution: {target}'
        reference = reference.convert('RGBA')
        actual = compressed.convert('RGBA')
        error = ImageChops.difference(reference, actual)
        alpha_error = error.getchannel('A').getextrema()[1]
        assert alpha_error == 0, f'Alpha changed: {target}'
        rgb_error = error.convert('RGB')
        stats = ImageStat.Stat(rgb_error)
        max_error = max(high for low, high in rgb_error.getextrema())
        mse = sum(value ** 2 for value in stats.rms) / 3
        psnr = None if mse == 0 else round(20 * math.log10(255 / math.sqrt(mse)), 3)
        mean_error = round(sum(stats.mean) / 3, 4)
        if lossless:
            assert max_error == 0, f'Data channel changed: {target}'
        else:
            assert mean_error < 3.5, f'Colour error too high: {target}'
            assert psnr is None or psnr > 33, f'Colour PSNR too low: {target}'
        seam = ImageChops.difference(actual.crop((0, 0, 1, actual.height)).convert('RGB'), actual.crop((actual.width - 1, 0, actual.width, actual.height)).convert('RGB'))
        seam_mean = sum(ImageStat.Stat(seam).mean) / 3
        return {
            'source': source.relative_to(ROOT).as_posix(),
            'output': target.relative_to(ROOT).as_posix(),
            'sourceWidth': original.width, 'sourceHeight': original.height,
            'width': compressed.width, 'height': compressed.height,
            'reference': 'LANCZOS runtime resize' if original.size != compressed.size else 'original',
            'lossless': lossless, 'quality': None if lossless else COLOUR_QUALITY,
            'sourceBytes': source.stat().st_size, 'outputBytes': target.stat().st_size,
            'alphaMaxError': alpha_error, 'rgbMaxError': max_error,
            'rgbMeanError': mean_error, 'rgbPSNRdB': psnr,
            'longitudeSeamMeanError': round(seam_mean, 4),
        }


def runtime_image(source, image):
    runtime = image.convert('RGBA')
    if '-clouds' in source.stem or '-relief' in source.stem or source.suffix == '.jpg':
        runtime.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    return runtime


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify without encoding')
    args = parser.parse_args()
    assert features.check('webp'), 'Pillow WebP encoder is required'
    rows = []
    for source, lossless in sources():
        target = source.with_suffix('.webp')
        if not args.check:
            with Image.open(source) as image:
                # Keep alpha and channel values exact. RGB strips only fully
                # opaque alpha, which browsers decode as the same 255 values.
                rgba = runtime_image(source, image)
                encoded = rgba.convert('RGB') if rgba.getchannel('A').getextrema() == (255, 255) else rgba
                encoded.save(target, 'WEBP', lossless=lossless, quality=100 if lossless else COLOUR_QUALITY, method=6, exact=True)
        row = verify(source, target, lossless)
        rows.append(row)
        print(f'{target.name}: {row["sourceBytes"]:,} -> {row["outputBytes"]:,} bytes; lossless={lossless}', flush=True)
    # Actual default-page requests exclude the unused fallback Earth map and
    # alternate nebula sky. Runtime browser checking records the exact set.
    default_rows = [row for row in rows if not row['source'].endswith(('2k_earth_daymap.jpg', '2k_jupiter.jpg', '2k_venus_surface.jpg', 'nebula-field.png'))]
    original_bytes = sum(row['sourceBytes'] for row in default_rows)
    runtime_bytes = sum(row['outputBytes'] for row in default_rows)
    assert runtime_bytes < 8_000_000, f'Default texture budget exceeded: {runtime_bytes:,}'
    result = {'passed': True, 'defaultSourceBytes': original_bytes,
              'defaultRuntimeBytes': runtime_bytes,
              'reductionPercent': round((1 - runtime_bytes / original_bytes) * 100, 2),
              'allOutputBytes': sum(row['outputBytes'] for row in rows), 'textures': rows}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'PASS: default textures {original_bytes:,} -> {runtime_bytes:,} bytes ({result["reductionPercent"]}% smaller)')


if __name__ == '__main__':
    main()
