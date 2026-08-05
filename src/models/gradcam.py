import cv2
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget


def get_target_layers(model, backbone_name):
    name = backbone_name.lower()
    if "efficientnet" in name:
        return [model.conv_head]
    if "resnet" in name or "resnext" in name:
        return [model.layer4[-1]]
    if "convnext" in name:
        return [model.stages[-1].blocks[-1]]
    if "densenet" in name:
        return [model.features.norm5]
    return [list(model.children())[-3]]


def generate_gradcam(model, backbone_name, input_tensor, rgb_image_float, target_class=None):
    target_layers = get_target_layers(model, backbone_name)
    targets = [ClassifierOutputTarget(target_class)] if target_class is not None else None
    with GradCAM(model=model, target_layers=target_layers) as cam:
        grayscale_cam = cam(input_tensor=input_tensor, targets=targets)[0]
    visualization = show_cam_on_image(rgb_image_float, grayscale_cam, use_rgb=True)
    return visualization, grayscale_cam


def resize_for_overlay(rgb_image, size):
    resized = cv2.resize(rgb_image, (size, size))
    return resized.astype("float32") / 255.0
