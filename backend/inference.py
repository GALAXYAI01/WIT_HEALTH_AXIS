import base64
import io
import os

from src.config import MODULES


class DiseaseDetector:
    def __init__(self, module_config, weights_path, device="cpu"):
        import torch

        from src.data.transforms import get_val_transforms
        from src.models.architecture import build_model

        self.config = module_config
        self.device = torch.device(device)
        self.model = build_model(module_config.backbone, module_config.num_classes, pretrained=False)
        state_dict = torch.load(weights_path, map_location=self.device)
        self.model.load_state_dict(state_dict)
        self.model.to(self.device)
        self.model.eval()
        self.transform = get_val_transforms(module_config.img_size)

    def predict(self, image_bytes):
        import cv2
        import numpy as np
        import torch
        from PIL import Image

        from src.models.gradcam import generate_gradcam

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        rgb_image = np.array(image)
        resized = cv2.resize(rgb_image, (self.config.img_size, self.config.img_size))
        normalized_rgb = resized.astype(np.float32) / 255.0

        transformed = self.transform(image=rgb_image)
        input_tensor = transformed["image"].unsqueeze(0).to(self.device)

        with torch.no_grad():
            outputs = self.model(input_tensor)
            probs = torch.softmax(outputs, dim=1)[0].cpu().numpy()

        predicted_idx = int(np.argmax(probs))
        predicted_class = self.config.class_names[predicted_idx]
        confidence = float(probs[predicted_idx])
        class_probabilities = {
            name: float(probs[i]) for i, name in enumerate(self.config.class_names)
        }

        visualization, _ = generate_gradcam(
            self.model, self.config.backbone, input_tensor, normalized_rgb, predicted_idx
        )
        success, buffer = cv2.imencode(".png", cv2.cvtColor(visualization, cv2.COLOR_RGB2BGR))
        gradcam_base64 = base64.b64encode(buffer).decode("utf-8")

        return {
            "predicted_class": predicted_class,
            "confidence": confidence,
            "class_probabilities": class_probabilities,
            "gradcam_image_base64": gradcam_base64,
        }


def load_available_detectors(device="cpu", names=None):
    detectors = {}
    for name, config in MODULES.items():
        if names is not None and name not in names:
            continue
        if os.path.exists(config.weights_path):
            detectors[name] = DiseaseDetector(config, config.weights_path, device)
    return detectors
