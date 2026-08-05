from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "UI" / "stitch_wit_research_and_analysis" / "home_wit_research_analysis" / "assets"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

sources = {
    "hero-malaria.jpg": ROOT / "data" / "malaria" / "cell_images" / "Parasitized" / "C100P61ThinF_IMG_20150918_144104_cell_162.png",
    "hero-leukemia.jpg": ROOT / "data" / "leukemia" / "Blood cell Cancer [ALL]" / "Benign" / "Sap_013 (1).jpg",
    "hero-histopathology.jpg": ROOT / "data" / "histopathology" / "train" / "00001b2b5609af42ab0ab276dd4cd41c3e7745b5.tif",
}

resample = getattr(Image, "LANCZOS", Image.Resampling.LANCZOS)

for filename, source_path in sources.items():
    output_path = OUTPUT_DIR / filename
    with Image.open(source_path) as source:
        image = source.convert("RGB").resize((800, 600), resample)
        image.save(output_path, format="JPEG", quality=84, optimize=True)
    print(f"{source_path} -> {output_path} ({output_path.stat().st_size} bytes)")
