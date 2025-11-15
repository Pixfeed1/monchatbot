import logging
from pathlib import Path
from safetensors import safe_open
from safetensors.torch import save_file
import torch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def clean_safetensors(input_path: str, output_path: str):
    """Crée une version nettoyée du fichier safetensors."""
    try:
        # Dictionnaire pour stocker les tenseurs
        tensors = {}
        
        # Ouvre le fichier source
        with safe_open(input_path, framework="pt", device="cpu") as f:
            # Copie tous les tenseurs sauf lm_head.weight
            for key in f.keys():
                if key != "lm_head.weight":
                    tensors[key] = f.get_tensor(key)
            
        logger.info(f"Nombre de tenseurs copiés: {len(tensors)}")
        
        # Sauvegarde le nouveau fichier
        save_file(tensors, output_path)
        logger.info(f"Fichier nettoyé sauvegardé: {output_path}")
        
    except Exception as e:
        logger.error(f"Erreur lors du nettoyage: {e}")

if __name__ == "__main__":
    input_path = "D:/monchat-bot/models/mistral/consolidated.safetensors"
    output_path = "D:/monchat-bot/models/mistral/model.safetensors"
    clean_safetensors(input_path, output_path)