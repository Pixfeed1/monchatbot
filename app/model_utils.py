from dataclasses import dataclass
from typing import Optional
from mistral_inference.args import TransformerArgs, VisionEncoderArgs
from mistral_inference.lora import LoraArgs
from mistral_inference.moe import MoeArgs
import logging

logger = logging.getLogger(__name__)

def create_transformer_args(config: dict) -> TransformerArgs:
    """
    Crée une instance de TransformerArgs à partir d'un dictionnaire de configuration.
    """
    try:
        transformed_config = {
            "dim": config["hidden_size"],
            "n_layers": config["num_hidden_layers"],
            "head_dim": config["hidden_size"] // config["num_attention_heads"],
            "hidden_dim": config["intermediate_size"],
            "n_heads": config["num_attention_heads"],
            "n_kv_heads": config["num_key_value_heads"],
            "norm_eps": config["rms_norm_eps"],
            "vocab_size": config["vocab_size"],
            "max_batch_size": 1,
            "rope_theta": config.get("rope_theta"),
            "sliding_window": config.get("sliding_window"),
            "moe": None,
            "lora": None
        }
        
        return TransformerArgs(**transformed_config)
    except KeyError as e:
        logger.error(f"Champ manquant dans la configuration: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Erreur lors de la création des arguments du transformeur: {str(e)}")
        raise