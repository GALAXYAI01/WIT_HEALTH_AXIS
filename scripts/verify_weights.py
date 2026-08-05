import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import pandas as pd
import torch

from src.config import MODULES
from src.data.dataset import build_dataframe
from src.data.transforms import get_val_transforms
from src.models.architecture import build_model


def parse_args():
    parser = argparse.ArgumentParser(
        description="Independently verify a trained module's weights against real sampled images"
    )
    parser.add_argument("--module", required=True, choices=list(MODULES.keys()))
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--csv-path", default=None)
    parser.add_argument("--n-per-class", type=int, default=15)
    return parser.parse_args()


def main():
    args = parse_args()
    config = MODULES[args.module]
    if args.data_dir:
        config.data_dir = args.data_dir
    if args.csv_path:
        config.csv_path = args.csv_path

    if not os.path.exists(config.weights_path):
        raise SystemExit(
            f"NO WEIGHTS FILE FOUND at {config.weights_path}. "
            "Training has not produced a saved model yet — nothing to verify."
        )

    size_mb = os.path.getsize(config.weights_path) / 1e6
    print(f"weights file: {config.weights_path} ({size_mb:.1f} MB)")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model(config.backbone, config.num_classes, pretrained=False)
    state_dict = torch.load(config.weights_path, map_location=device)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    print(f"loaded {config.backbone} with {config.num_classes} output classes onto {device}")

    df = build_dataframe(config)
    print(f"total images available to sample from: {len(df)}")

    sample_parts = []
    for label_idx in range(config.num_classes):
        class_rows = df[df["label"] == label_idx]
        n = min(args.n_per_class, len(class_rows))
        sample_parts.append(class_rows.sample(n, random_state=123))
    sample = pd.concat(sample_parts, ignore_index=True)
    print(f"independently sampled {len(sample)} images across {config.num_classes} classes for this check\n")

    transform = get_val_transforms(config.img_size)
    correct = 0
    confidences = []

    for _, row in sample.iterrows():
        image = cv2.imread(row["filepath"])
        if image is None:
            print(f"WARNING: could not read {row['filepath']}, skipping")
            continue
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        tensor = transform(image=image)["image"].unsqueeze(0).to(device)
        with torch.no_grad():
            probs = torch.softmax(model(tensor), dim=1)[0]
        pred_idx = int(probs.argmax())
        confidence = float(probs[pred_idx])
        true_idx = int(row["label"])
        is_correct = pred_idx == true_idx
        correct += int(is_correct)
        confidences.append(confidence)
        status = "OK" if is_correct else "WRONG"
        print(
            f"true={config.class_names[true_idx]:15s} "
            f"pred={config.class_names[pred_idx]:15s} "
            f"confidence={confidence:.3f}  {status}"
        )

    n = len(confidences)
    sanity_accuracy = correct / n if n else 0.0
    avg_confidence = sum(confidences) / n if n else 0.0
    print(f"\nsanity-check accuracy on {n} independently sampled images: {correct}/{n} = {sanity_accuracy:.2%}")
    print(f"average confidence on its own predictions: {avg_confidence:.3f}")

    if sanity_accuracy < 0.6:
        print(
            "\nRED FLAG: accuracy here is close to random guessing. "
            "This weights file does not behave like a trained model — training likely did not "
            "complete successfully, or these weights are stale/untrained. Do not trust any "
            "reported accuracy number until this is investigated."
        )
        sys.exit(1)
    else:
        print(
            "\nThis is a real, independent check against freshly loaded weights and freshly "
            "sampled images — it cannot be faked by a text summary. A high result here is "
            "genuine evidence the model learned something real."
        )
        sys.exit(0)


if __name__ == "__main__":
    main()
