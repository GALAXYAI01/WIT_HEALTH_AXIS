import copy
import os

import torch
import torch.nn as nn
from torch.amp import GradScaler, autocast
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR


def run_training_stage(model, train_loader, val_loader, epochs, lr, device,
                        class_weights=None, patience=6, label_smoothing=0.1,
                        checkpoint_path=None, stage_name="stage", resume_state=None):
    weight_tensor = None
    if class_weights is not None:
        weight_tensor = torch.tensor(class_weights, dtype=torch.float32).to(device)

    criterion = nn.CrossEntropyLoss(weight=weight_tensor, label_smoothing=label_smoothing)
    trainable_params = filter(lambda p: p.requires_grad, model.parameters())
    optimizer = AdamW(trainable_params, lr=lr, weight_decay=1e-4)
    scheduler = CosineAnnealingLR(optimizer, T_max=max(epochs, 1))
    use_amp = device.type == "cuda"
    scaler = GradScaler(enabled=use_amp)

    start_epoch = 0
    best_state = copy.deepcopy(model.state_dict())
    best_val_acc = 0.0
    patience_counter = 0
    history = {"train_loss": [], "val_loss": [], "val_acc": []}

    if resume_state is not None:
        start_epoch = resume_state["next_epoch"]
        best_state = resume_state["best_state"]
        best_val_acc = resume_state["best_val_acc"]
        patience_counter = resume_state["patience_counter"]
        history = resume_state["history"]
        model.load_state_dict(best_state)
        print(f"resuming {stage_name} from epoch {start_epoch + 1}/{epochs} "
              f"(best_val_acc so far: {best_val_acc:.4f}) — optimizer/scheduler restart fresh, "
              f"already-completed epochs' learned weights are preserved")

    for epoch in range(start_epoch, epochs):
        model.train()
        running_loss = 0.0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            with autocast(device_type=device.type, enabled=use_amp):
                outputs = model(images)
                loss = criterion(outputs, labels)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            running_loss += loss.item() * images.size(0)
        train_loss = running_loss / len(train_loader.dataset)

        model.eval()
        val_loss = 0.0
        correct = 0
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                with autocast(device_type=device.type, enabled=use_amp):
                    outputs = model(images)
                    loss = criterion(outputs, labels)
                val_loss += loss.item() * images.size(0)
                correct += (outputs.argmax(dim=1) == labels).sum().item()
        val_loss = val_loss / len(val_loader.dataset)
        val_acc = correct / len(val_loader.dataset)
        scheduler.step()

        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["val_acc"].append(val_acc)
        print(f"epoch {epoch + 1}/{epochs}  train_loss {train_loss:.4f}  val_loss {val_loss:.4f}  val_acc {val_acc:.4f}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_state = copy.deepcopy(model.state_dict())
            patience_counter = 0
        else:
            patience_counter += 1

        if checkpoint_path:
            torch.save({
                "stage_name": stage_name,
                "next_epoch": epoch + 1,
                "best_state": best_state,
                "best_val_acc": best_val_acc,
                "patience_counter": patience_counter,
                "history": history,
            }, checkpoint_path)

        if patience_counter >= patience:
            print(f"early stopping at epoch {epoch + 1}")
            break

    model.load_state_dict(best_state)
    return model, history, best_val_acc


def train_module(model, train_loader, val_loader, config, class_weights=None, device=None):
    from src.models.architecture import freeze_backbone, unfreeze_all

    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)

    checkpoint_path = f"{config.weights_dir}/{config.name}_checkpoint.pt"
    resume_state = None
    resume_stage = "head"
    if os.path.exists(checkpoint_path):
        loaded = torch.load(checkpoint_path, map_location=device)
        resume_stage = loaded["stage_name"]
        resume_state = loaded
        print(f"found existing checkpoint at {checkpoint_path}, stage={resume_stage}, "
              f"next_epoch={loaded['next_epoch']}")

    history_head = {"train_loss": [], "val_loss": [], "val_acc": []}
    if resume_stage == "head":
        print("stage 1: training classifier head only")
        freeze_backbone(model)
        model, history_head, _ = run_training_stage(
            model, train_loader, val_loader, config.epochs_head, config.lr_head,
            device, class_weights=class_weights,
            checkpoint_path=checkpoint_path, stage_name="head", resume_state=resume_state,
        )
        resume_state = None
    else:
        print("stage 1 already complete per checkpoint — skipping directly to stage 2")
        freeze_backbone(model)
        unfreeze_all(model)

    print("stage 2: fine-tuning full network")
    unfreeze_all(model)
    model, history_finetune, best_val_acc = run_training_stage(
        model, train_loader, val_loader, config.epochs_finetune, config.lr_finetune,
        device, class_weights=class_weights,
        checkpoint_path=checkpoint_path, stage_name="finetune",
        resume_state=resume_state if resume_stage == "finetune" else None,
    )

    combined_history = {
        key: history_head[key] + history_finetune[key] for key in history_finetune
    }

    if os.path.exists(checkpoint_path):
        os.remove(checkpoint_path)
        print(f"training complete — removed checkpoint file {checkpoint_path}")

    return model, combined_history, best_val_acc
