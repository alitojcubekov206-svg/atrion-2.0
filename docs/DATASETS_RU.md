# Datasets and Future Experiments

Atrion uses real user descriptions and reviewed plan inputs together with synthetic procedural geometry and catalog objects. It has not trained or fine-tuned its own model.

The collected datasets below are for future experiments. They are not connected to production generation.

## Collected starter data

| Source | Collected content | License / attribution |
| --- | --- | --- |
| [Amazon Berkeley Objects](https://amazon-berkeley-objects.s3.amazonaws.com/index.html) | Metadata index for 7,953 geometry IDs and three GLB samples | CC BY 4.0; source attribution retained |
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | Furniture package with 140 models | CC0; license file retained |
| [Kenney Animated Characters](https://kenney.nl/assets/animated-characters-protagonists) | Character archive and file listing | CC0; license retained |
| [Quaternius Animated Animals](https://opengameart.org/content/animated-animales-low-poly) | Animal archive and file listing | CC0; license retained |

The full ABO geometry archive was not downloaded. Its index is deduplicated by geometry ID. A stable hash assigns 7,197 / 365 / 391 entries to proposed train/validation/test splits, without separating alternate captions of the same geometry.

These are dataset partitions, not training results. Download checksums identify collected files and are not publisher signatures.

## Reproduce collection

```powershell
python -X utf8 scripts/collect-3d-data.py --output .datasets --samples 3
```

The Python utility records source URLs, licenses and SHA-256 checksums, bounds downloads and reads metadata archives without extracting untrusted paths. Unavailable sources produce an error.

Large datasets and model archives do not belong in Git or the Vercel bundle.

## Next steps

Future use requires explicit integration, license review, preprocessing and evaluation on unseen prompts. Animated assets additionally need rig and target-engine checks.

An asset index alone does not teach the current generator arbitrary forms. A generated mesh also does not automatically provide editable rooms, useful doors or a character rig.

[Project passport](../PROJECT_PASSPORT.md) · [Generation quality](GENERATION_QUALITY.md)
