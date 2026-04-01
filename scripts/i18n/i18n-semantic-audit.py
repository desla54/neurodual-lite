#!/usr/bin/env python3
"""
i18n Semantic Audit — detects translations that diverged from the French source.

Two engines available:
  --engine labse      Fast embedding similarity (LaBSE, ~470MB, good first filter)
  --engine cometkiwi  Neural translation QE (CometKiwi, ~2.3GB, gold standard)

Usage:
    python scripts/i18n/i18n-semantic-audit.py                          # LaBSE, all langs
    python scripts/i18n/i18n-semantic-audit.py --engine cometkiwi       # CometKiwi, all langs
    python scripts/i18n/i18n-semantic-audit.py --lang de --top 30       # German only, worst 30
    python scripts/i18n/i18n-semantic-audit.py --engine cometkiwi --ns stats --lang de
    python scripts/i18n/i18n-semantic-audit.py --csv > audit.csv        # CSV export
    python scripts/i18n/i18n-semantic-audit.py --engine both --lang de  # run both, compare

Requires:
    pip install sentence-transformers unbabel-comet
"""

import argparse
import csv
import json
import re
import sys
from pathlib import Path

# ─── Config ────────────────────────────────────────────────

LOCALES_DIR = Path(__file__).resolve().parent.parent.parent / "apps/web/src/locales"
SOURCE_LANG = "fr"
TARGET_LANGS = [
    "en", "ar", "de", "es", "hi", "it", "ja", "ko", "pl", "pt", "ru", "zh",
    # Wave 1 (9 strategic markets)
    "tr", "vi", "th", "id", "nl", "sv", "fi", "uk", "ms",
    # Wave 2 (16 expansion)
    "bn", "fa", "cs", "da", "no", "ro", "el", "hu",
    "ta", "te", "mr", "ur", "sw", "tl", "my", "km",
]
MIN_FR_LENGTH = 15

DEFAULTS = {
    "labse": 0.82,
    "cometkiwi": 0.70,
}

# ─── Helpers ───────────────────────────────────────────────

def flatten(obj: dict, prefix: str = "") -> dict[str, str]:
    items = {}
    for k, v in obj.items():
        full = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            items.update(flatten(v, full))
        elif isinstance(v, str):
            items[full] = v
    return items


def strip_variables(text: str) -> str:
    """Remove {{variables}} and {placeholders} before embedding — they add noise."""
    text = re.sub(r"\{\{[^}]+\}\}", "X", text)  # replace with placeholder token
    text = re.sub(r"\{[^}]+\}", "X", text)
    return text.strip()


def load_namespaces() -> list[str]:
    fr_dir = LOCALES_DIR / SOURCE_LANG
    return sorted(f.stem for f in fr_dir.glob("*.json"))


def load_flat(lang: str, ns: str) -> dict[str, str]:
    fpath = LOCALES_DIR / lang / f"{ns}.json"
    if not fpath.exists():
        return {}
    with open(fpath) as f:
        return flatten(json.load(f))


def collect_pairs(namespaces: list[str], target_langs: list[str]) -> list[tuple]:
    """Returns [(full_key, lang, fr_text, lang_text)]"""
    pairs = []
    for ns in namespaces:
        fr = load_flat(SOURCE_LANG, ns)
        for lang in target_langs:
            lang_data = load_flat(lang, ns)
            for key, fr_val in fr.items():
                if key.endswith(("_one", "_other", "_many", "_few", "_two", "_zero")):
                    continue
                if len(fr_val) < MIN_FR_LENGTH:
                    continue
                lang_val = lang_data.get(key, "")
                if not lang_val:
                    continue
                pairs.append((f"{ns}:{key}", lang, fr_val, lang_val))
    return pairs


# ─── Engines ───────────────────────────────────────────────

def score_labse(pairs: list[tuple], gpu_id: int) -> list[float]:
    """Score pairs using LaBSE cosine similarity. Returns list of scores in [0, 1]."""
    import torch
    from sentence_transformers import SentenceTransformer

    device = f"cuda:{gpu_id}" if gpu_id >= 0 and torch.cuda.is_available() else "cpu"
    print(f"Loading LaBSE on {device}...", file=sys.stderr)
    model = SentenceTransformer("sentence-transformers/LaBSE", device=device)

    fr_texts = [strip_variables(p[2]) for p in pairs]
    lang_texts = [strip_variables(p[3]) for p in pairs]

    print(f"Encoding {len(pairs)} × 2 texts...", file=sys.stderr)
    fr_emb = model.encode(fr_texts, batch_size=256, show_progress_bar=True,
                          convert_to_tensor=True)
    lang_emb = model.encode(lang_texts, batch_size=256, show_progress_bar=True,
                            convert_to_tensor=True)

    fr_norm = torch.nn.functional.normalize(fr_emb, p=2, dim=1)
    lang_norm = torch.nn.functional.normalize(lang_emb, p=2, dim=1)
    scores = (fr_norm * lang_norm).sum(dim=1).tolist()
    return scores


def score_cometkiwi(pairs: list[tuple], gpu_id: int) -> list[float]:
    """Score pairs using CometKiwi (reference-free QE). Returns list of scores ~[0, 1]."""
    from comet import download_model, load_from_checkpoint

    print("Loading CometKiwi (first run downloads ~2.3 GB)...", file=sys.stderr)
    model_path = download_model("Unbabel/wmt22-cometkiwi-da")
    model = load_from_checkpoint(model_path)

    # CometKiwi expects {"src": source, "mt": translation}
    data = [
        {"src": strip_variables(p[2]), "mt": strip_variables(p[3])}
        for p in pairs
    ]

    print(f"Scoring {len(data)} pairs with CometKiwi on GPU {gpu_id}...", file=sys.stderr)
    output = model.predict(data, batch_size=64, gpus=1 if gpu_id >= 0 else 0,
                           devices=[gpu_id] if gpu_id >= 0 else None,
                           progress_bar=True)
    return output.scores


# ─── Output ────────────────────────────────────────────────

def output_results(results: list[dict], pairs_count: int, threshold: float,
                   engine: str, as_csv: bool):
    if as_csv:
        writer = csv.DictWriter(sys.stdout,
                                fieldnames=["engine", "score", "lang", "key", "fr", "translation"])
        writer.writeheader()
        for r in results:
            writer.writerow(r)
    else:
        flagged = len(results)
        pct = flagged / pairs_count * 100 if pairs_count > 0 else 0
        print(f"\n{'='*70}")
        print(f"[{engine}] {flagged} issues / {pairs_count} pairs ({pct:.1f}%) — threshold {threshold}")
        print(f"{'='*70}\n")

        for r in results:
            print(f"{'─'*60}")
            print(f"⚠️  [{r['lang']}] {r['key']}  ({engine}: {r['score']:.3f})")
            print(f"  FR: {r['fr'][:130]}")
            print(f"  {r['lang'].upper()}: {r['translation'][:130]}")
            print()

        if not results:
            print(f"✅ [{engine}] All translations are semantically aligned.")


# ─── Main ──────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Semantic i18n audit using LaBSE and/or CometKiwi")
    parser.add_argument("--engine", choices=["labse", "cometkiwi", "both"],
                        default="labse", help="Scoring engine (default: labse)")
    parser.add_argument("--lang", type=str, help="Audit a single target language")
    parser.add_argument("--threshold", type=float, default=None,
                        help="Similarity threshold (default: auto per engine)")
    parser.add_argument("--top", type=int, default=0, help="Show only N worst results")
    parser.add_argument("--ns", type=str, help="Audit a single namespace")
    parser.add_argument("--csv", action="store_true", help="Output as CSV")
    parser.add_argument("--skip-admin", action="store_true", default=True)
    parser.add_argument("--gpu", type=int, default=1,
                        help="GPU index to use (default: 1 = RTX 4060)")
    args = parser.parse_args()

    target_langs = [args.lang] if args.lang else TARGET_LANGS
    namespaces = [args.ns] if args.ns else load_namespaces()
    if args.skip_admin and "admin" in namespaces:
        namespaces.remove("admin")

    print("Collecting translation pairs...", file=sys.stderr)
    pairs = collect_pairs(namespaces, target_langs)
    print(f"Collected {len(pairs)} pairs across {len(target_langs)} language(s)", file=sys.stderr)

    engines = ["labse", "cometkiwi"] if args.engine == "both" else [args.engine]

    for engine in engines:
        threshold = args.threshold if args.threshold is not None else DEFAULTS[engine]

        if engine == "labse":
            scores = score_labse(pairs, args.gpu)
        else:
            scores = score_cometkiwi(pairs, args.gpu)

        results = []
        for i, (full_key, lang, fr_val, lang_val) in enumerate(pairs):
            score = scores[i]
            if score < threshold:
                results.append({
                    "engine": engine,
                    "key": full_key,
                    "lang": lang,
                    "score": round(score, 3),
                    "fr": fr_val,
                    "translation": lang_val,
                })

        results.sort(key=lambda r: r["score"])
        if args.top > 0:
            results = results[:args.top]

        output_results(results, len(pairs), threshold, engine, args.csv)


if __name__ == "__main__":
    main()
