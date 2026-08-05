import timm


def build_model(backbone_name, num_classes, pretrained=True):
    model = timm.create_model(backbone_name, pretrained=pretrained, num_classes=num_classes)
    return model


def freeze_backbone(model):
    classifier = model.get_classifier()
    classifier_param_ids = set(id(p) for p in classifier.parameters())
    for param in model.parameters():
        if id(param) not in classifier_param_ids:
            param.requires_grad = False


def unfreeze_all(model):
    for param in model.parameters():
        param.requires_grad = True
