"""Collect public 3D data and geometry-disjoint splits. Does not train a model."""
import argparse
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile
import urllib.request
import zipfile

ABO = "https://amazon-berkeley-objects.s3.amazonaws.com/"
KENNEY = "https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip"
ATTRIBUTION = "Amazon.com; dataset: Matthieu Guillaumin, Thomas Dideriksen, Kenan Deng, Himanshu Arora, Jasmine Collins, Jitendra Malik"

def download(url, target, limit, manifest):
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        pending = target.with_suffix(target.suffix + ".partial")
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Atrion-Dataset-Collector/1.0"})
            with urllib.request.urlopen(request, timeout=60) as response, pending.open("wb") as output:
                if int(response.headers.get("Content-Length", "0")) > limit:
                    raise ValueError("Download exceeds configured size limit")
                total = 0
                while block := response.read(1024 * 1024):
                    total += len(block)
                    if total > limit:
                        raise ValueError("Download exceeds configured size limit")
                    output.write(block)
            pending.replace(target)
        finally:
            pending.unlink(missing_ok=True)
    if target.stat().st_size > limit:
        raise ValueError("Cached file exceeds configured size limit")
    digest = hashlib.sha256()
    with target.open("rb") as source:
        while block := source.read(1024 * 1024):
            digest.update(block)
    manifest.append({"url": url, "file": str(target.name), "bytes": target.stat().st_size, "sha256": digest.hexdigest()})
    return target

def values(product, key):
    return [v.get("value", "") for v in product.get(key, []) if isinstance(v, dict) and isinstance(v.get("value"), str)]

def split_for(model_id):
    bucket = int(hashlib.sha256(model_id.encode()).hexdigest()[:8], 16) % 100
    return "test" if bucket < 5 else "validation" if bucket < 10 else "train"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(".datasets"))
    parser.add_argument("--samples", type=int, default=3, choices=range(0, 11))
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest = []
    download(ABO + "LICENSE-CC-BY-4.0.txt", output / "ABO-LICENSE-CC-BY-4.0.txt", 100_000, manifest)
    download(ABO + "README.md", output / "ABO-README.md", 100_000, manifest)
    metadata = download(ABO + "3dmodels/metadata/3dmodels.csv.gz", output / "abo-models.csv.gz", 5_000_000, manifest)
    with gzip.open(metadata, "rt", encoding="utf8") as source:
        models = {row["3dmodel_id"]: row for row in csv.DictReader(source)}
    archive = download(ABO + "archives/abo-listings.tar", output / "abo-listings.tar", 110_000_000, manifest)
    records = {}
    with tarfile.open(archive, "r:") as source:
        for member in source:
            if not member.isfile() or not member.name.endswith(".json.gz"):
                continue
            if member.size > 20_000_000:
                raise ValueError("Unexpected metadata shard size")
            stream = source.extractfile(member)
            with gzip.GzipFile(fileobj=stream) as compressed, io.TextIOWrapper(compressed, encoding="utf8") as lines:
                for line in lines:
                    product = json.loads(line)
                    model_id = product.get("3dmodel_id")
                    if model_id not in models:
                        continue
                    model = models[model_id]
                    model_path = PurePosixPath(model["path"])
                    if model_path.is_absolute() or ".." in model_path.parts or model_path.suffix != ".glb":
                        raise ValueError("Invalid model path")
                    captions = {v["language_tag"]: v["value"] for v in product.get("item_name", []) if isinstance(v, dict) and isinstance(v.get("value"), str) and isinstance(v.get("language_tag"), str)}
                    record = {"id": "abo:" + model_id, "modelId": model_id, "captions": captions,
                              "types": values(product, "product_type"), "materials": values(product, "material"),
                              "colors": values(product, "color"), "style": values(product, "style"),
                              "boundsMeters": [float(model["extent_" + axis]) for axis in "xyz"],
                              "faces": int(model["faces"]), "modelUrl": ABO + "3dmodels/original/" + str(model_path),
                              "source": ABO + "index.html", "license": "CC-BY-4.0", "attribution": ATTRIBUTION,
                              "split": split_for(model_id), "changes": "Metadata normalized; duplicate geometry IDs grouped; meshes unmodified"}
                    if model_id in records:
                        records[model_id]["captions"].update(captions)
                    else:
                        records[model_id] = record
    with (output / "abo-3d-index.jsonl").open("w", encoding="utf8") as target:
        for key in sorted(records):
            target.write(json.dumps(records[key], ensure_ascii=False) + "\n")
    # Starter sample; the 154 GB mesh archive is not required for indexing.
    samples = sorted(records.values(), key=lambda r: (r["faces"], r["id"]))[:args.samples]
    for record in samples:
        download(record["modelUrl"], output / "samples" / (record["modelId"] + ".glb"), 30_000_000, manifest)
    furniture = download(KENNEY, output / "kenney_furniture-kit.zip", 50_000_000, manifest)
    with zipfile.ZipFile(furniture) as source:
        if sum(item.file_size for item in source.infolist()) > 200_000_000:
            raise ValueError("Unexpected furniture archive expansion")
        furniture_models = [name for name in source.namelist() if name.lower().endswith((".glb", ".gltf", ".fbx", ".obj"))]
        furniture_names = sorted({PurePosixPath(name).stem for name in furniture_models})
        license_files = [name for name in source.namelist() if "license" in name.lower() and name.lower().endswith(".txt")]
        for i, name in enumerate(license_files):
            (output / f"KENNEY-LICENSE-{i}.txt").write_bytes(source.read(name))
    animated = []
    for name, page, url, author in [
        ("kenney-animated-characters", "https://kenney.nl/assets/animated-characters-protagonists", "https://kenney.nl/media/pages/assets/animated-characters-protagonists/608191acc4-1774773108/kenney_animated-characters-protagonists.zip", "Kenney"),
        ("quaternius-animated-animals", "https://opengameart.org/content/animated-animales-low-poly", "https://opengameart.org/sites/default/files/Animal%20Pack%20Vol.2%20by%20%40Quaternius.zip", "Quaternius"),
    ]:
        pack = download(url, output / (name + ".zip"), 25_000_000, manifest)
        with zipfile.ZipFile(pack) as source:
            if sum(item.file_size for item in source.infolist()) > 150_000_000:
                raise ValueError("Unexpected animated pack expansion")
            files = [path for path in source.namelist() if path.lower().endswith((".fbx", ".obj", ".blend", ".glb", ".gltf"))]
        animated.append({"name": name, "author": author, "source": page, "license": "CC0-1.0", "modelFiles": files, "importValidated": False})
    (output / "animated-model-index.json").write_text(json.dumps(animated, indent=2), encoding="utf8")
    report = {"trained": False, "connectedToProductionGenerator": False,
              "aboIndexedGeometries": len(records), "aboKnownGeometries": len(models),
              "aboCategoryCount": len({kind for r in records.values() for kind in r["types"]}),
              "splits": {split: sum(r["split"] == split for r in records.values()) for split in ["train", "validation", "test"]},
              "aboDownloadedMeshes": len(samples), "kenneyModelFiles": len(furniture_models),
              "kenneyUniqueModels": len(furniture_names),
              "animatedPacks": [{"name": pack["name"], "modelFileCount": len(pack["modelFiles"])} for pack in animated],
              "sources": [{"name": "ABO", "license": "CC-BY-4.0", "attribution": ATTRIBUTION, "url": ABO + "index.html"},
                          {"name": "Kenney Furniture Kit", "license": "CC0-1.0", "attribution": "Kenney", "url": "https://kenney.nl/assets/furniture-kit"}],
              "files": manifest}
    report["sources"].extend({"name": pack["name"], "license": pack["license"], "attribution": pack["author"], "url": pack["source"]} for pack in animated)
    (output / "collection-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    (output / "kenney-model-index.json").write_text(json.dumps({"names": furniture_names, "files": furniture_models, "license": "CC0-1.0", "source": "https://kenney.nl/assets/furniture-kit"}, indent=2), encoding="utf8")
    print(json.dumps({key: value for key, value in report.items() if key not in ["files", "sources"]}, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    main()
