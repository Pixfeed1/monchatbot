import torch
import logging
import psutil
from pathlib import Path
from transformers import AutoModelForCausalLM, AutoTokenizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MistralLoader:
    def __init__(self, save_path: str = './mistral'):
        self.save_path = Path(save_path)
        self.save_path.mkdir(exist_ok=True)
        
        self.ram_total = psutil.virtual_memory().total / (1024**3)
        logger.info(f"RAM totale disponible: {self.ram_total:.1f}GB")

    def download_and_save(self):
        try:
            logger.info("Début du téléchargement du modèle...")
            
            model_name = "TheBloke/Mistral-7B-Instruct-v0.2-GPTQ"
            logger.info(f"Utilisation du modèle: {model_name}")
            
            logger.info("Téléchargement du modèle pré-quantifié...")
            model = AutoModelForCausalLM.from_pretrained(
                model_name,
                device_map="auto",
                low_cpu_mem_usage=True,
                trust_remote_code=True
            )

            logger.info("Sauvegarde du modèle...")
            model.save_pretrained(str(self.save_path / 'model_quantized'))

            logger.info("Téléchargement du tokenizer...")
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            tokenizer.save_pretrained(str(self.save_path))

            logger.info("Installation terminée avec succès!")
            
            model_size = sum(f.stat().st_size for f in self.save_path.rglob('*') if f.is_file())
            logger.info(f"Taille totale du modèle: {model_size / (1024**3):.2f}GB")
            
            return True

        except Exception as e:
            logger.error(f"Erreur lors de l'installation: {str(e)}")
            logger.error(f"Type d'erreur: {e.__class__.__name__}")
            return False

if __name__ == "__main__":
    logger.info("Démarrage de l'installation du modèle Mistral...")
    loader = MistralLoader()
    loader.download_and_save()