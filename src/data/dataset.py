from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from torch.utils.data import Dataset


class MedicalImageDataset(Dataset):
    def __init__(self, dataframe, transform=None):
        self.df = dataframe.reset_index(drop=True)
        self.transform = transform

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        image = cv2.imread(str(row["filepath"]))
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        if self.transform:
            image = self.transform(image=image)["image"]
        return image, int(row["label"])


def build_from_imagefolder(root_dir, class_names):
    root = Path(root_dir)
    if not root.exists():
        raise FileNotFoundError(f"data_dir does not exist: {root_dir}")

    remaining_subdirs = [d for d in root.iterdir() if d.is_dir()]
    records = []
    counts = {}

    for label_idx, class_name in enumerate(class_names):
        exact_dir = root / class_name
        matched_dir = None
        if exact_dir.exists():
            matched_dir = exact_dir
        else:
            candidates = [d for d in remaining_subdirs if class_name.lower() in d.name.lower()]
            if len(candidates) == 1:
                matched_dir = candidates[0]
                print(f"note: class '{class_name}' matched folder '{matched_dir.name}' (no exact match found)")
            elif len(candidates) > 1:
                print(f"warning: class '{class_name}' matched multiple folders {[d.name for d in candidates]}, skipping")

        count_for_class = 0
        if matched_dir is not None:
            if matched_dir in remaining_subdirs:
                remaining_subdirs.remove(matched_dir)
            for ext in ("*.png", "*.jpg", "*.jpeg", "*.tif", "*.tiff", "*.bmp"):
                for filepath in matched_dir.glob(ext):
                    records.append({"filepath": str(filepath), "label": label_idx})
                    count_for_class += 1
        counts[class_name] = count_for_class

    print("images found per class:", counts)
    zero_classes = [name for name, c in counts.items() if c == 0]
    if zero_classes:
        found_names = [d.name for d in root.iterdir() if d.is_dir()]
        raise ValueError(
            f"no images found for class(es) {zero_classes}. "
            f"actual subfolders present in {root_dir}: {found_names}. "
            "update class_names in the module config to match these folder names."
        )

    return pd.DataFrame(records)


def build_from_csv(csv_path, image_dir, filename_col, label_col, extension=""):
    df = pd.read_csv(csv_path)
    image_dir = Path(image_dir)
    df["filepath"] = df[filename_col].apply(lambda x: str(image_dir / f"{x}{extension}"))
    df["label"] = df[label_col].astype(int)
    return df[["filepath", "label"]]


def build_dataframe(config):
    if config.label_source == "csv":
        return build_from_csv(
            config.csv_path,
            config.data_dir,
            config.csv_filename_col,
            config.csv_label_col,
            config.csv_extension,
        )
    return build_from_imagefolder(config.data_dir, config.class_names)


def split_dataframe(df, val_split, test_split, seed):
    train_val_df, test_df = train_test_split(
        df, test_size=test_split, stratify=df["label"], random_state=seed
    )
    val_relative = val_split / (1 - test_split)
    train_df, val_df = train_test_split(
        train_val_df, test_size=val_relative, stratify=train_val_df["label"], random_state=seed
    )
    return train_df, val_df, test_df


def compute_class_weights(df, num_classes):
    weights = compute_class_weight(
        class_weight="balanced",
        classes=np.arange(num_classes),
        y=df["label"].values,
    )
    return weights.astype("float32")
