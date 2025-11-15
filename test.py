# test_gpu.py
import torch

print(f"PyTorch version: {torch.__version__}")
print(f"CUDA disponible: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU détecté: {torch.cuda.get_device_name(0)}")
    print(f"Nombre de GPUs: {torch.cuda.device_count()}")
else:
    print("Aucun GPU détecté. Vérifiez vos pilotes NVIDIA.")