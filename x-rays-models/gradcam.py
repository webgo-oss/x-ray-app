import torch
import numpy as np

def generate_gradcam(model, input_tensor, target_layer):
    activations = []
    gradients = []

    def forward_hook(module, input, output):
        activations.append(output)

    def backward_hook(module, grad_input, grad_output):
        gradients.append(grad_output[0])

    fh = target_layer.register_forward_hook(forward_hook)
    bh = target_layer.register_backward_hook(backward_hook)

    output = model(input_tensor)
    pred_class = output.logits.argmax(dim=1).item()
    score = output.logits[:, pred_class]
    model.zero_grad()
    score.backward()

    acts = activations[0].squeeze()
    grads = gradients[0].squeeze()
    weights = grads.mean(dim=(1, 2))

    cam = torch.zeros_like(acts[0])
    for i, w in enumerate(weights):
        cam += w * acts[i]

    cam = cam.detach().numpy()
    cam = np.maximum(cam, 0)
    cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-6)

    fh.remove()
    bh.remove()

    return cam
