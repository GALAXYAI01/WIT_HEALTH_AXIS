import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import torch
from torch.utils.data import DataLoader

from src.config import MODULES
from src.data.dataset import (
    MedicalImageDataset,
    build_dataframe,
    compute_class_weights,
    split_dataframe,
)
from src.data.transforms import get_train_transforms, get_val_transforms
from src.models.architecture import build_model
from src.training.metrics import compute_metrics, predict_dataset
from src.training.trainer import train_module
from src.utils.seed import set_seed


def parse_args():
    parser = argparse.ArgumentParser(description="Train a disease detection module locally")
    parser.add_argument("--module", required=True, choices=list(MODULES.keys()))
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--csv-path", default=None)
    parser.add_argument("--backbone", default=None)
    parser.add_argument("--batch-size", type=int, default=None)
    parser.add_argument("--epochs-head", type=int, default=None)
    parser.add_argument("--epochs-finetune", type=int, default=None)
    return parser.parse_args()


def main():
    args = parse_args()
    config = MODULES[args.module]

    if args.data_dir:
        config.data_dir = args.data_dir
    if args.csv_path:
        config.csv_path = args.csv_path
    if args.backbone:
        config.backbone = args.backbone
    if args.batch_size:
        config.batch_size = args.batch_size
    if args.epochs_head:
        config.epochs_head = args.epochs_head
    if args.epochs_finetune:
        config.epochs_finetune = args.epochs_finetune

    set_seed(config.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"module: {config.name}")
    print(f"device: {device}")
    if device.type == "cuda":
        print(f"gpu: {torch.cuda.get_device_name(0)}")

    df = build_dataframe(config)
    print(f"total images found: {len(df)}")
    if len(df) == 0:
        raise SystemExit(
            f"no images found for data_dir={config.data_dir!r}. "
            "check the path and that the folder/CSV layout matches src/data/dataset.py"
        )
    print(df["label"].value_counts().rename(index=dict(enumerate(config.class_names))))

    train_df, val_df, test_df = split_dataframe(df, config.val_split, config.test_split, config.seed)
    print(f"train/val/test sizes: {len(train_df)}/{len(val_df)}/{len(test_df)}")

    class_weights = compute_class_weights(train_df, config.num_classes)
    print("class weights:", class_weights)

    os.makedirs(config.weights_dir, exist_ok=True)

    train_ds = MedicalImageDataset(train_df, get_train_transforms(config.img_size))
    val_ds = MedicalImageDataset(val_df, get_val_transforms(config.img_size))
    test_ds = MedicalImageDataset(test_df, get_val_transforms(config.img_size))

    num_workers = 2 if os.name == "nt" else 4
    train_loader = DataLoader(train_ds, batch_size=config.batch_size, shuffle=True, num_workers=num_workers, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=config.batch_size, num_workers=num_workers, pin_memory=True)
    test_loader = DataLoader(test_ds, batch_size=config.batch_size, num_workers=num_workers, pin_memory=True)

    model = build_model(config.backbone, config.num_classes, pretrained=True)
    model, history, best_val_acc = train_module(model, train_loader, val_loader, config, class_weights, device)
    print("best validation accuracy during training:", best_val_acc)

    y_true, y_pred, y_probs = predict_dataset(model, test_loader, device)
    metrics = compute_metrics(y_true, y_pred, y_probs, config.class_names)
    print(f"test accuracy: {metrics['accuracy']:.4f}")
    print(f"test auc_roc: {metrics['auc_roc']}")
    print(metrics["classification_report"])
    print("confusion matrix:")
    print(metrics["confusion_matrix"])

    torch.save(model.state_dict(), config.weights_path)
    print(f"saved weights to {config.weights_path}")


if __name__ == "__main__":
    main()
