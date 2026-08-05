from dataclasses import dataclass, field
from typing import List


@dataclass
class ModuleConfig:
    name: str
    class_names: List[str]
    data_dir: str
    label_source: str = "imagefolder"
    csv_path: str = ""
    csv_filename_col: str = ""
    csv_label_col: str = ""
    csv_extension: str = ""
    backbone: str = "efficientnet_b3"
    img_size: int = 224
    batch_size: int = 32
    epochs_head: int = 6
    epochs_finetune: int = 24
    lr_head: float = 1e-3
    lr_finetune: float = 3e-5
    val_split: float = 0.15
    test_split: float = 0.15
    seed: int = 42
    weights_dir: str = "model_weights"

    @property
    def num_classes(self):
        return len(self.class_names)

    @property
    def weights_path(self):
        return f"{self.weights_dir}/{self.name}_best.pt"


MALARIA_CONFIG = ModuleConfig(
    name="malaria",
    class_names=["Parasitized", "Uninfected"],
    data_dir="/kaggle/input/cell-images-for-detecting-malaria/cell_images",
    label_source="imagefolder",
    backbone="efficientnet_b3",
    img_size=224,
    batch_size=32,
    epochs_head=5,
    epochs_finetune=20,
)

LEUKEMIA_CONFIG = ModuleConfig(
    name="leukemia",
    class_names=["Benign", "Early", "Pre", "Pro"],
    data_dir="/kaggle/input/blood-cell-cancer-all-4class/Blood cell Cancer [ALL]",
    label_source="imagefolder",
    backbone="efficientnet_b3",
    img_size=224,
    batch_size=32,
    epochs_head=8,
    epochs_finetune=30,
)

HISTOPATHOLOGY_CONFIG = ModuleConfig(
    name="histopathology",
    class_names=["Benign", "Malignant"],
    data_dir="/kaggle/input/histopathologic-cancer-detection/train",
    label_source="csv",
    csv_path="/kaggle/input/histopathologic-cancer-detection/train_labels.csv",
    csv_filename_col="id",
    csv_label_col="label",
    csv_extension=".tif",
    backbone="efficientnet_b3",
    img_size=96,
    batch_size=64,
    epochs_head=4,
    epochs_finetune=14,
)

MODULES = {
    "malaria": MALARIA_CONFIG,
    "leukemia": LEUKEMIA_CONFIG,
    "histopathology": HISTOPATHOLOGY_CONFIG,
}
