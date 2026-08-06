import base64
import gc
import io
import os
from pathlib import Path

from src.config import MODULES


IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


class OnnxDiseaseDetector:
    """Memory-conscious inference path for small production instances."""

    def __init__(self, module_config, weights_path):
        import onnxruntime as ort

        self.config = module_config
        self.session = ort.InferenceSession(
            weights_path,
            providers=["CPUExecutionProvider"],
            sess_options=self._session_options(ort),
        )
        self.input_name = self.session.get_inputs()[0].name

    @staticmethod
    def _session_options(ort):
        options = ort.SessionOptions()
        options.intra_op_num_threads = max(1, int(os.environ.get("WIT_TORCH_THREADS", "1")))
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        return options

    def predict(self, image_bytes):
        import cv2
        import numpy as np
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        rgb_image = np.array(image)
        resized = cv2.resize(rgb_image, (self.config.img_size, self.config.img_size))
        normalized = resized.astype(np.float32) / 255.0
        normalized = (normalized - np.array(IMAGENET_MEAN, dtype=np.float32)) / np.array(
            IMAGENET_STD, dtype=np.float32
        )
        input_tensor = np.transpose(normalized, (2, 0, 1))[None, ...].astype(np.float32)
        logits = np.asarray(self.session.run(None, {self.input_name: input_tensor})[0])[0]
        logits = logits - np.max(logits)
        probs = np.exp(logits)
        probs /= np.sum(probs)

        predicted_idx = int(np.argmax(probs))
        success, buffer = cv2.imencode(
            ".png", cv2.cvtColor(resized, cv2.COLOR_RGB2BGR)
        )
        if not success:
            raise RuntimeError("could not encode the inference preview")
        return {
            "predicted_class": self.config.class_names[predicted_idx],
            "confidence": float(probs[predicted_idx]),
            "class_probabilities": {
                name: float(probs[i]) for i, name in enumerate(self.config.class_names)
            },
            "gradcam_image_base64": base64.b64encode(buffer).decode("utf-8"),
            "gradcam_available": False,
            "gradcam_message": "Grad-CAM is unavailable on the constrained ONNX Runtime deployment; the prediction remains valid for research review.",
        }


class DiseaseDetector:
    def __init__(self, module_config, weights_path, device="cpu"):
        import torch

        from src.data.transforms import get_val_transforms
        from src.models.architecture import build_model

        thread_count = max(1, int(os.environ.get("WIT_TORCH_THREADS", "1")))
        torch.set_num_threads(thread_count)
        try:
            torch.set_num_interop_threads(thread_count)
        except RuntimeError:
            pass

        self.config = module_config
        self.device = torch.device(device)
        self.model = build_model(module_config.backbone, module_config.num_classes, pretrained=False)
        state_dict = torch.load(weights_path, map_location=self.device)
        self.model.load_state_dict(state_dict)
        del state_dict
        gc.collect()
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

        with torch.inference_mode():
            outputs = self.model(input_tensor)
            probs = torch.softmax(outputs, dim=1)[0].cpu().numpy()

        predicted_idx = int(np.argmax(probs))
        predicted_class = self.config.class_names[predicted_idx]
        confidence = float(probs[predicted_idx])
        class_probabilities = {
            name: float(probs[i]) for i, name in enumerate(self.config.class_names)
        }

        default_gradcam = "false" if os.environ.get("RENDER") or os.environ.get("RENDER_SERVICE_ID") else "true"
        gradcam_enabled = os.environ.get("WIT_ENABLE_GRADCAM", default_gradcam).strip().lower() in {"1", "true", "yes", "on"}
        gradcam_available = True
        gradcam_message = None
        if gradcam_enabled:
            try:
                visualization, _ = generate_gradcam(
                    self.model, self.config.backbone, input_tensor, normalized_rgb, predicted_idx
                )
            except Exception:
                visualization = resized
                gradcam_available = False
                gradcam_message = "Grad-CAM was unavailable for this scan; the prediction is still valid for research review."
        else:
            visualization = resized
            gradcam_available = False
            gradcam_message = "Grad-CAM is disabled on the constrained deployment to keep inference within its memory limit."
        success, buffer = cv2.imencode(".png", cv2.cvtColor(visualization, cv2.COLOR_RGB2BGR))
        gradcam_base64 = base64.b64encode(buffer).decode("utf-8")

        return {
            "predicted_class": predicted_class,
            "confidence": confidence,
            "class_probabilities": class_probabilities,
            "gradcam_image_base64": gradcam_base64,
            "gradcam_available": gradcam_available,
            "gradcam_message": gradcam_message,
        }


def load_available_detectors(device="cpu", names=None):
    detectors = {}
    constrained_backend = os.environ.get("WIT_INFERENCE_BACKEND", "").strip().lower() == "onnx"
    for name, config in MODULES.items():
        if names is not None and name not in names:
            continue
        if os.path.exists(config.weights_path):
            fp16_path = Path(config.weights_path).with_suffix(".fp16.onnx")
            quantized_path = Path(config.weights_path).with_suffix(".int8.onnx")
            base_path = Path(config.weights_path).with_suffix(".onnx")
            onnx_path = next(
                (path for path in (fp16_path, quantized_path, base_path) if path.exists()),
                base_path,
            )
            if constrained_backend:
                if not os.path.exists(onnx_path):
                    raise FileNotFoundError(f"missing ONNX model for {name}: {onnx_path}")
                detectors[name] = OnnxDiseaseDetector(config, str(onnx_path))
            else:
                detectors[name] = DiseaseDetector(config, config.weights_path, device)
    return detectors
