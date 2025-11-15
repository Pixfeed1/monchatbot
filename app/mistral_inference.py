import os
import json
import sys
import time
import gc
import psutil
import torch
import requests
import platform
from pathlib import Path
from typing import Optional, Dict, Any, Union, List, Tuple
import numpy as np
import logging
import threading
from functools import lru_cache
import hashlib

# Configuration de base
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Vérification et configuration CUDA
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA disponible: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU détecté: {torch.cuda.get_device_name(0)}")
    print(f"Nombre de GPUs: {torch.cuda.device_count()}")
    torch.cuda.empty_cache()
    torch.cuda.memory.empty_cache()
    torch.cuda.set_per_process_memory_fraction(0.9)  # Utiliser 90% de la VRAM
else:
    print("Aucun GPU détecté. Utilisation du CPU.")
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)

# Cache des générations récentes
RESPONSE_CACHE = {}
CACHE_SIZE = 100  # Augmenté pour meilleure performance
CACHE_LOCK = threading.Lock()
CONTEXT_CACHE = {}  # Nouveau cache pour les contextes enrichis
CONTEXT_CACHE_SIZE = 50

def get_memory_status():
    """Retourne des informations sur l'utilisation mémoire"""
    process = psutil.Process()
    memory_info = {
        'ram_used_mb': process.memory_info().rss / (1024 * 1024),
        'ram_available_mb': psutil.virtual_memory().available / (1024 * 1024),
        'ram_percent': psutil.virtual_memory().percent
    }
    if torch.cuda.is_available():
        memory_info.update({
            'cuda_allocated_mb': torch.cuda.memory_allocated() / (1024 * 1024),
            'cuda_cached_mb': torch.cuda.memory_reserved() / (1024 * 1024),
            'cuda_percent': torch.cuda.memory_allocated() / torch.cuda.get_device_properties(0).total_memory * 100
        })
    return memory_info

def force_gc():
    """Force la collecte des objets non utilisés"""
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()

def normalize_prompt(prompt):
    """Normalise un prompt pour le caching"""
    # Enlève les espaces supplémentaires et convertit en minuscules
    normalized = ' '.join(prompt.lower().split())
    # Limite la longueur pour éviter des clés de cache trop longues
    if len(normalized) > 200:
        return hashlib.md5(normalized.encode()).hexdigest()
    return normalized

class MistralInference:
    def __init__(
        self,
        use_api: bool = True,
        model_path: Optional[Path] = None,
        tokenizer_file: Optional[str] = None,
        device: str = None  # Paramètre modifié pour auto-détection
    ):
        start_time = time.time()
        self.use_api = use_api
        
        # Auto-détection du device (GPU si disponible)
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Initialisation MistralInference sur le device: {self.device}")
        
        self.is_ready = False
        self.error_message = None
        self.model_type = "none"  # Type de modèle: "transformers", "llama_cpp", "gptq" ou "none"
        self.model = None
        self.tokenizer = None
        self.initialization_time = None
        self.generation_count = 0
        self.cache_hits = 0
        self.context_cache_hits = 0  # Nouveau compteur
        self.total_generation_time = 0
        self.is_generating = False
        self.generation_lock = threading.Lock()
        
        # Stats avancées
        self.complexity_stats = {0: 0, 1: 0, 2: 0, 3: 0}  # Compteurs par complexité
        self.avg_generation_times = {0: [], 1: [], 2: [], 3: []}  # Temps moyens par complexité

        if self.use_api:
            logger.info(f"Initialisation MistralInference en mode API")
            from .config import Config
            self.api_key = Config.MISTRAL_API_KEY
            self.api_endpoint = Config.MISTRAL_API_URL
            if not self.api_key:
                self.error_message = "Clé API Mistral non spécifiée."
                logger.error(self.error_message)
                self.use_api = False
            else:
                logger.info(f"Utilisation de l'API Mistral configurée")
                self.is_ready = True
            logger.info(f"Initialisation API terminée en {time.time() - start_time:.2f}s")
        else:
            logger.info(f"Initialisation MistralInference en local sur {self.device}")
            if not model_path:
                from .config import Config
                model_path = Config.MISTRAL_CONFIG["model_path"]
            self.model_path = model_path
            self._initialize_model()
            self.initialization_time = time.time() - start_time
            logger.info(f"Initialisation locale terminée en {self.initialization_time:.2f}s")

    def _initialize_model(self):
        """Initialise le modèle en utilisant la meilleure approche disponible"""
        try:
            # Essayer d'abord llama.cpp (le plus efficace)
            self._try_llama_cpp()
            
            # Si llama.cpp échoue, essayer GPTQ
            if not self.is_ready:
                self._try_gptq()
            
            # Si GPTQ échoue, essayer transformers standard
            if not self.is_ready:
                self._try_transformers()

            # Log du résultat
            if self.is_ready:
                logger.info(f"Modèle initialisé avec succès (type: {self.model_type}, device: {self.device})")
                memory = get_memory_status()
                logger.info(f"Utilisation mémoire: RAM {memory['ram_percent']}%, " + 
                           (f"VRAM {memory.get('cuda_percent', 0):.1f}%" if 'cuda_percent' in memory else ""))
                
                # Préchauffer le modèle avec une petite génération
                try:
                    logger.debug("Préchauffage du modèle...")
                    self.generate_response("Bonjour, comment vas-tu?", max_tokens=5, temperature=0.1)
                    logger.debug("Préchauffage terminé")
                except Exception as e:
                    logger.warning(f"Erreur lors du préchauffage: {e}")
            else:
                logger.error(f"Échec de l'initialisation du modèle: {self.error_message}")

        except Exception as e:
            self.error_message = str(e)
            logger.error(f"Erreur générale lors de l'initialisation: {str(e)}", exc_info=True)
    
    def _try_llama_cpp(self):
        """Tente d'initialiser le modèle avec llama.cpp"""
        try:
            # Débogage approfondi: afficher le chemin complet et vérifier le contenu
            abs_path = os.path.abspath(self.model_path)
            logger.info(f"Recherche de fichiers GGUF dans: {abs_path}")
            
            # Vérifier si le chemin existe
            if not os.path.exists(abs_path):
                logger.warning(f"Le chemin {abs_path} n'existe pas!")
                # Essayer de créer le dossier
                try:
                    os.makedirs(abs_path, exist_ok=True)
                    logger.info(f"Dossier {abs_path} créé")
                except Exception as e:
                    logger.error(f"Impossible de créer le dossier: {e}")
            
            # Lister tous les fichiers du dossier
            if os.path.exists(abs_path):
                all_files = os.listdir(abs_path)
                logger.info(f"Fichiers dans {abs_path}: {all_files}")
            
            # Essayer plusieurs patterns pour trouver des fichiers GGUF
            gguf_files = []
            for pattern in ["*.gguf", "*.GGUF", "*mistral*.gguf"]:
                gguf_files.extend(list(Path(self.model_path).glob(pattern)))
            
            # Chercher dans le dossier parent aussi
            parent_path = Path(self.model_path).parent
            for pattern in ["*.gguf", "*.GGUF", "*mistral*.gguf"]:
                gguf_parent = list(parent_path.glob(pattern))
                if gguf_parent:
                    logger.info(f"Fichiers GGUF trouvés dans le dossier parent: {gguf_parent}")
                    gguf_files.extend(gguf_parent)
            
            # Chercher à la racine du projet
            root_path = Path(__file__).parent.parent
            for pattern in ["*.gguf", "*.GGUF", "*mistral*.gguf"]:
                gguf_root = list(root_path.glob(pattern))
                if gguf_root:
                    logger.info(f"Fichiers GGUF trouvés à la racine: {gguf_root}")
                    gguf_files.extend(gguf_root)
            
            if not gguf_files:
                logger.info("Aucun fichier GGUF trouvé, passage à la méthode suivante")
                return
                
            # Utiliser le premier fichier GGUF trouvé
            gguf_path = str(gguf_files[0])
            logger.info(f"Fichier GGUF trouvé: {gguf_path}")
            
            try:
                from llama_cpp import Llama
                logger.info("Initialisation du modèle avec llama-cpp-python")
                
                # Paramètres optimisés pour GPU ou CPU
                n_gpu_layers = -1 if self.device == "cuda" and torch.cuda.is_available() else 0
                logger.info(f"Utilisation GPU pour llama.cpp: {n_gpu_layers} layers")
                
                # Paramètres ultra-optimisés pour réponse rapide en 1-3 secondes
                self.model = Llama(
                    model_path=gguf_path,
                    n_ctx=2048,             # Contexte augmenté pour les prompts enrichis
                    n_batch=256,            # Augmenté pour meilleure throughput
                    n_threads=8,           # Nombre de threads CPU réduit
                    n_gpu_layers=-1,
                    verbose=True,
                    seed=42,               # Seed fixe pour reproduction
                    f16_kv=True,           # Utilisation de float16 pour les KV caches
                    use_mlock=True,        # Verrouiller la mémoire
                    logits_all=False,      # Désactiver pour économiser de la mémoire
                    embedding=False,        # Désactiver les embeddings pour économiser du temps
                    use_mmap=True, 
                    n_ubatch=256,
                    main_gpu=0,
                                        # Utiliser mmap pour charger plus vite
                )
                
                self.model_type = "llama_cpp"
                self.is_ready = True
                logger.info(f"Modèle llama-cpp initialisé avec succès (GPU layers: {n_gpu_layers})")
                
            except ImportError:
                logger.warning("llama-cpp-python non disponible, passage à la méthode suivante")
                
        except Exception as e:
            logger.warning(f"Erreur lors de l'initialisation avec llama-cpp: {str(e)}")
    
    def _try_gptq(self):
        """Tente d'initialiser le modèle avec AutoGPTQ"""
        try:
            # Vérifier si un modèle GPTQ est présent
            if not (Path(self.model_path) / "quantize_config.json").exists() and not list(Path(self.model_path).glob("*gptq*")):
                logger.info("Aucun modèle GPTQ trouvé, passage à la méthode suivante")
                return
                
            logger.info("Tentative d'initialisation avec AutoGPTQ")
            
            try:
                from auto_gptq import AutoGPTQForCausalLM
                from transformers import AutoTokenizer
                
                self.tokenizer = AutoTokenizer.from_pretrained(
                    self.model_path,
                    trust_remote_code=True
                )
                
                # Configuration pour GPU ou CPU
                device_map = {"": self.device}
                logger.info(f"Chargement GPTQ sur {self.device} avec device_map: {device_map}")
                
                self.model = AutoGPTQForCausalLM.from_quantized(
                    self.model_path,
                    use_safetensors=True,
                    trust_remote_code=True,
                    device_map=device_map,
                    use_triton=False
                )
                
                self.model_type = "gptq"
                self.is_ready = True
                logger.info(f"Modèle GPTQ initialisé avec succès sur {self.device}")
                
            except ImportError:
                logger.warning("AutoGPTQ non disponible, passage à la méthode suivante")
                
        except Exception as e:
            logger.warning(f"Erreur lors de l'initialisation avec GPTQ: {str(e)}")
    
    def _try_transformers(self):
        """Tente d'initialiser le modèle avec Transformers standard"""
        try:
            logger.info("Tentative d'initialisation avec Transformers standard")
            
            # Vérifier si config.json existe
            if not (Path(self.model_path) / "config.json").exists():
                logger.warning("Aucun fichier config.json trouvé, impossible d'initialiser avec Transformers")
                return
            
            from transformers import AutoTokenizer, AutoModelForCausalLM
            
            # Essayer d'initialiser le tokenizer
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_path,
                trust_remote_code=True
            )
            
            # Vérifier la disponibilité de la mémoire
            memory_gb = psutil.virtual_memory().available / (1024**3)
            logger.info(f"Mémoire RAM disponible: {memory_gb:.2f} GB")
            
            # Utiliser un chargement optimisé selon le device
            try:
                if self.device == "cuda" and torch.cuda.is_available():
                    logger.info("Chargement du modèle sur GPU avec device_map=auto")
                    try:
                        # Essayer d'abord avec Accelerate si disponible
                        import accelerate
                        logger.info("Module Accelerate disponible")
                        self.model = AutoModelForCausalLM.from_pretrained(
                            self.model_path,
                            torch_dtype=torch.float16,
                            device_map="auto",
                            trust_remote_code=True
                        )
                    except ImportError:
                        # Fallback sans Accelerate - charger puis déplacer
                        logger.info("Module Accelerate non disponible, chargement sans device_map")
                        self.model = AutoModelForCausalLM.from_pretrained(
                            self.model_path,
                            torch_dtype=torch.float16,
                            trust_remote_code=True
                        )
                        # Puis déplacer explicitement sur GPU
                        logger.info("Déplacement explicite du modèle sur GPU")
                        self.model = self.model.to("cuda")
                else:
                    logger.info("Chargement du modèle sur CPU")
                    self.model = AutoModelForCausalLM.from_pretrained(
                        self.model_path,
                        torch_dtype=torch.float16,
                        trust_remote_code=True
                    )
                    
                # Vérifier sur quel device le modèle est réellement
                actual_device = next(self.model.parameters()).device
                logger.info(f"Modèle chargé, il est sur le device: {actual_device}")
                # Si le modèle n'est pas sur le bon device, le déplacer
                if self.device == "cuda" and actual_device.type != "cuda":
                    logger.info(f"Déplacement du modèle de {actual_device} vers {self.device}")
                    self.model = self.model.to(self.device)
                    new_device = next(self.model.parameters()).device
                    logger.info(f"Après déplacement, modèle sur: {new_device}")
                
                self.model_type = "transformers"
                self.is_ready = True
                logger.info(f"Modèle Transformers initialisé avec succès sur {actual_device}")
                
            except Exception as e:
                logger.error(f"Erreur lors du chargement du modèle: {str(e)}")
                
                # Si l'erreur concerne Accelerate, essayer sans
                if "accelerate" in str(e).lower():
                    logger.info("Tentative de chargement sans Accelerate")
                    self.model = AutoModelForCausalLM.from_pretrained(
                        self.model_path,
                        torch_dtype=torch.float16,
                        trust_remote_code=True
                    )
                    if self.device == "cuda":
                        self.model = self.model.to("cuda")
                    self.model_type = "transformers"
                    self.is_ready = True
                    logger.info("Modèle chargé sans Accelerate")
                else:
                    raise
            
        except Exception as e:
            self.error_message = str(e)
            logger.error(f"Erreur lors de l'initialisation avec Transformers: {str(e)}")

    def generate_response(
        self, 
        prompt: str, 
        max_tokens: int = 10,
        temperature: float = 0.3,
        top_p: float = 0.8,
        top_k: int = 30,
        use_cache: bool = True
    ) -> str:
        """
        Génère une réponse à partir du prompt fourni.
        Optimisé pour différents types de modèles et contextes enrichis.
        """
        logger.info(f"Génération de réponse (max_tokens={max_tokens}, temp={temperature})")
        
        # Vérifier si on est déjà en train de générer
        if self.is_generating and self.model_type != "llama_cpp":
            logger.warning("Une génération est déjà en cours, attente...")
            wait_start = time.time()
            while self.is_generating and time.time() - wait_start < 3:
                time.sleep(0.1)
            if self.is_generating:
                return "La génération est trop occupée. Veuillez réessayer."
        
        # Étape 1: Vérifier le cache si activé
        if use_cache:
            cache_key = f"{normalize_prompt(prompt)}_{max_tokens}_{temperature:.2f}"
            with CACHE_LOCK:
                if cache_key in RESPONSE_CACHE:
                    self.cache_hits += 1
                    logger.info(f"Réponse trouvée dans le cache! Hits: {self.cache_hits}")
                    return RESPONSE_CACHE[cache_key]
        
        # Étape 2: Acquérir le verrou de génération
        with self.generation_lock:
            self.is_generating = True
            gen_start = time.time()
            
            try:
                if self.use_api:
                    # API Mistral
                    try:
                        # Extraire le contexte système du prompt enrichi
                        parts = prompt.split("\n\nMaintenant, réponds à cette demande:\nUtilisateur: ")
                        if len(parts) == 2:
                            system_prompt = parts[0]
                            user_message = parts[1]
                        else:
                            # Fallback pour ancien format
                            parts = prompt.split("\n\nUtilisateur: ")
                            system_prompt = parts[0] if len(parts) > 1 else ""
                            user_message = parts[1] if len(parts) > 1 else prompt
        
                        payload = {
                            "model": "mistral-tiny",
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_message}
                            ],
                            "temperature": temperature,
                            "max_tokens": max_tokens,
                            "top_p": top_p
                        }
                        headers = {
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json"
                        }
                        api_endpoint = (
                            "https://mistral.ai/api/v1/chat" 
                            if self.api_key.startswith("mis_")
                            else "https://api.mistral.ai/v1/chat/completions"
                        )
                        logger.info(f"Appel API: {api_endpoint}")
                        response = requests.post(api_endpoint, json=payload, headers=headers, timeout=min(max_tokens/10 + 2, 10))
                        if response.status_code == 401:
                            return "Erreur d'authentification : vérifiez votre clé API Mistral."
                        response.raise_for_status()
                        result = response.json()
                        if self.api_key.startswith("mis_"):
                            message = result.get("response", "")
                        else:
                            message = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                        
                        # Mettre en cache
                        if use_cache:
                            with CACHE_LOCK:
                                RESPONSE_CACHE[cache_key] = message
                                if len(RESPONSE_CACHE) > CACHE_SIZE:
                                    # Supprimer l'entrée la plus ancienne
                                    key_to_remove = list(RESPONSE_CACHE.keys())[0]
                                    del RESPONSE_CACHE[key_to_remove]
                        
                        return message
                    except Exception as e:
                        logger.error(f"Erreur API Mistral: {e}", exc_info=True)
                        return f"Erreur génération API: {str(e)}"
                else:
                    # Inférence locale optimisée selon le type de modèle
                    if not self.is_ready:
                        error_msg = (
                            "Le modèle Mistral n'est pas prêt.\n"
                            f"Raison: {self.error_message or 'Inconnue'}\n"
                            "Vérifiez l'installation."
                        )
                        logger.error(error_msg)
                        return error_msg
        
                    try:
                        # 1. Génération avec llama-cpp (ultra-optimisée)
                        if self.model_type == "llama_cpp":
                            logger.info("Génération avec llama-cpp")
                            
                            # Paramètres optimisés pour génération ultra-rapide
                            generation_params = {
                                "prompt": prompt,
                                "max_tokens": max_tokens,
                                "temperature": temperature,
                                "top_p": top_p,
                                "top_k": top_k,
                                "echo": False,
                                "stop": ["Utilisateur:", "\n\n", "User:", "Human:"],
                                "repeat_penalty": 1.1
                            }
                            
                            # Ajouter des paramètres spécifiques selon la configuration matérielle
                            if not torch.cuda.is_available():
                                # Sur CPU, optimiser encore plus
                                generation_params.update({
                                    "threads": min(os.cpu_count() or 4, 4),
                                    "batch_size": 8
                                })
                            
                            # Génération proprement dite
                            result = self.model(**generation_params)
                            response_text = result["choices"][0]["text"]
                        
                        # 2. Génération avec GPTQ ou Transformers standard
                        elif self.model_type in ["gptq", "transformers"]:
                            logger.info(f"Génération avec {self.model_type}")
                            
                            # Obtenir le device actuel du modèle
                            model_device = next(self.model.parameters()).device
                            logger.info(f"Modèle sur device: {model_device}")
                            
                            # Préparation des inputs
                            inputs = self.tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512)
                            
                            # Déplacer inputs sur le même device que le modèle
                            inputs = {k: v.to(model_device) for k, v in inputs.items()}
                            
                            try:
                                with torch.no_grad(), torch.inference_mode():
                                    generation_params = {
                                        "max_new_tokens": max_tokens,
                                        "temperature": temperature,
                                        "top_p": top_p,
                                        "top_k": top_k if top_k > 0 else None,
                                        "do_sample": temperature > 0,
                                        "pad_token_id": self.tokenizer.eos_token_id,
                                        "early_stopping": True,
                                        "num_beams": 1,
                                        "length_penalty": 0.8,
                                        "repetition_penalty": 1.1,
                                        "eos_token_id": self.tokenizer.eos_token_id
                                    }
                                    
                                    # Sur GPU, utiliser des paramètres optimisés pour la vitesse
                                    if self.device == "cuda":
                                        generation_params.update({
                                            "use_cache": True,
                                            "low_memory": True
                                        })
                                    
                                    outputs = self.model.generate(**inputs, **generation_params)
                                
                                # S'assurer que outputs est sur CPU pour le décodage
                                if outputs.device.type != "cpu":
                                    outputs = outputs.cpu()
                                
                                # Décodage
                                response_text = self.tokenizer.decode(
                                    outputs[0], 
                                    skip_special_tokens=True
                                )
                                
                                # Supprimer le prompt initial de la sortie
                                prompt_tokens = self.tokenizer.encode(prompt, add_special_tokens=False)
                                if len(prompt_tokens) < len(outputs[0]):
                                    decoded_prompt = self.tokenizer.decode(prompt_tokens, skip_special_tokens=True)
                                    if response_text.startswith(decoded_prompt):
                                        response_text = response_text[len(decoded_prompt):].lstrip()
                            
                            except RuntimeError as e:
                                # Gérer les erreurs de device mismatch
                                if "expected all tensors to be on the same device" in str(e).lower():
                                    logger.error(f"Erreur de device mismatch: {str(e)}")
                                    logger.info("Tentative de récupération en déplaçant tous les tenseurs sur CPU")
                                    
                                    # Déplacer le modèle sur CPU temporairement
                                    self.model = self.model.to("cpu")
                                    inputs = {k: v.to("cpu") for k, v in inputs.items()}
                                    
                                    with torch.no_grad():
                                        outputs = self.model.generate(
                                            **inputs,
                                            max_new_tokens=max_tokens,
                                            temperature=temperature,
                                            top_p=top_p,
                                            top_k=top_k if top_k > 0 else None,
                                            do_sample=temperature > 0,
                                            pad_token_id=self.tokenizer.eos_token_id,
                                            early_stopping=True,
                                            num_beams=1,
                                            length_penalty=0.8,
                                            repetition_penalty=1.1
                                        )
                                    
                                    # Décodage
                                    response_text = self.tokenizer.decode(
                                        outputs[0], 
                                        skip_special_tokens=True
                                    )
                                    
                                    # Supprimer le prompt initial
                                    prompt_tokens = self.tokenizer.encode(prompt, add_special_tokens=False)
                                    if len(prompt_tokens) < len(outputs[0]):
                                        decoded_prompt = self.tokenizer.decode(prompt_tokens, skip_special_tokens=True)
                                        if response_text.startswith(decoded_prompt):
                                            response_text = response_text[len(decoded_prompt):].lstrip()
                                    
                                    # Remettre le modèle sur le device d'origine
                                    if self.device == "cuda":
                                        self.model = self.model.to("cuda")
                                else:
                                    raise
                        
                        else:
                            return f"Type de modèle non supporté: {self.model_type}"
        
                        delta = time.time() - gen_start
                        self.generation_count += 1
                        self.total_generation_time += delta
                        
                        # Enregistrer les stats par complexité
                        complexity = self._estimate_complexity_from_tokens(max_tokens)
                        self.complexity_stats[complexity] += 1
                        self.avg_generation_times[complexity].append(delta)
                        if len(self.avg_generation_times[complexity]) > 100:
                            self.avg_generation_times[complexity] = self.avg_generation_times[complexity][-100:]
                        
                        logger.info(f"Génération terminée en {delta:.2f}s pour {max_tokens} tokens (complexité: {complexity})")
                        
                        # Mettre en cache si activé
                        if use_cache:
                            with CACHE_LOCK:
                                RESPONSE_CACHE[cache_key] = response_text
                                if len(RESPONSE_CACHE) > CACHE_SIZE:
                                    # Supprimer l'entrée la plus ancienne
                                    key_to_remove = list(RESPONSE_CACHE.keys())[0]
                                    del RESPONSE_CACHE[key_to_remove]
                        
                        # Libérer la mémoire après génération
                        if self.device == "cuda":
                            force_gc()
                            
                        return response_text
        
                    except Exception as e:
                        error_msg = f"Erreur génération: {str(e)}"
                        logger.error(error_msg, exc_info=True)
                        return error_msg
                        
            finally:
                # Mesurer et enregistrer les statistiques de performance
                generation_time = time.time() - gen_start
                self.total_generation_time += generation_time
                self.generation_count += 1
                
                # Toujours libérer le verrou de génération
                self.is_generating = False
                
                # Log de performance périodique
                if self.generation_count % 10 == 0:
                    avg_time = self.total_generation_time / self.generation_count
                    cache_rate = (self.cache_hits / self.generation_count) * 100 if self.generation_count > 0 else 0
                    logger.info(f"Stats: {self.generation_count} générations, temps moyen: {avg_time:.2f}s, taux cache: {cache_rate:.1f}%")

    def generate_with_context(self, enriched_context: Dict[str, Any]) -> str:
        """
        Génère une réponse avec un contexte enrichi provenant du ContextBuilder.
        
        Args:
            enriched_context: Dict contenant le prompt et les métadonnées
            
        Returns:
            str: La réponse générée
        """
        if not enriched_context or 'prompt' not in enriched_context:
            return self.generate_response("Erreur: contexte invalide", max_tokens=50)
        
        # Extraire les paramètres du contexte
        prompt = enriched_context['prompt']
        metadata = enriched_context.get('metadata', {})
        complexity = metadata.get('complexity', 1)
        
        # Vérifier d'abord le cache de contexte
        context_hash = hashlib.md5(json.dumps(enriched_context, sort_keys=True).encode()).hexdigest()
        
        with CACHE_LOCK:
            if context_hash in CONTEXT_CACHE:
                self.context_cache_hits += 1
                logger.info(f"Contexte trouvé dans le cache! Hits: {self.context_cache_hits}")
                return CONTEXT_CACHE[context_hash]
        
        # Obtenir les paramètres optimisés
        params = self._get_optimized_params(complexity)
        
        # Ajuster selon les métadonnées
        if metadata.get('has_knowledge'):
            # Si on a des connaissances, on peut être plus précis
            params['temperature'] = max(params['temperature'] - 0.1, 0.2)
        
        if metadata.get('is_personal'):
            # Questions personnelles = réponses courtes et directes
            params['max_tokens'] = min(params['max_tokens'], 40)
            params['temperature'] = 0.3
        
        logger.info(f"Génération avec contexte enrichi - Complexité: {complexity}, Params: {params}")
        
        # Générer la réponse
        response = self.generate_response(
            prompt=prompt,
            **params
        )
        
        # Mettre en cache le contexte
        with CACHE_LOCK:
            CONTEXT_CACHE[context_hash] = response
            if len(CONTEXT_CACHE) > CONTEXT_CACHE_SIZE:
                # Supprimer l'entrée la plus ancienne
                oldest_key = list(CONTEXT_CACHE.keys())[0]
                del CONTEXT_CACHE[oldest_key]
        
        return response

    def answer_question(self, question: str, system_context: str = None, 
                       enriched_context: Dict = None) -> str:
        """
        Méthode améliorée pour répondre avec un contexte enrichi.
        """
        start_time = time.time()
        
        # Si on a un contexte enrichi complet, l'utiliser directement
        if enriched_context and 'prompt' in enriched_context:
            prompt = enriched_context['prompt']
            complexity = enriched_context.get('metadata', {}).get('complexity', 1)
            # Utiliser la nouvelle méthode
            response = self.generate_with_context(enriched_context)
        else:
            # Sinon, utiliser l'ancienne méthode
            if system_context:
                prompt = f"{system_context}\n\nUtilisateur: {question}"
            else:
                prompt = f"Tu es un assistant utile et concis.\n\nUtilisateur: {question}"
            complexity = self._estimate_complexity(question)
            
            # Générer avec les paramètres standards
            params = self._get_optimized_params(complexity)
            response = self.generate_response(prompt=prompt, **params)
        
        elapsed = time.time() - start_time
        logger.info(f"Question répondue en {elapsed:.2f}s (complexité: {complexity})")
        
        return response

    def _get_optimized_params(self, complexity: int) -> Dict:
        """Retourne les paramètres optimisés selon la complexité."""
        # Paramètres de base optimisés pour la rapidité
        base_params = {
            0: {  # Très simple
                "max_tokens": 30,
                "temperature": 0.3,
                "top_p": 0.5,
                "top_k": 20,
                "use_cache": True
            },
            1: {  # Simple
                "max_tokens": 50,
                "temperature": 0.5,
                "top_p": 0.7,
                "top_k": 30,
                "use_cache": True
            },
            2: {  # Modéré
                "max_tokens": 80,
                "temperature": 0.6,
                "top_p": 0.8,
                "top_k": 40,
                "use_cache": True
            },
            3: {  # Complexe
                "max_tokens": 120,
                "temperature": 0.7,
                "top_p": 0.9,
                "top_k": 50,
                "use_cache": True
            }
        }
        
        return base_params.get(complexity, base_params[1])

    def _estimate_complexity(self, text: str) -> int:
        """Estime la complexité d'un texte sur une échelle de 0 à 3"""
        # Score initial basé sur la longueur
        complexity = min(len(text) / 200, 1.0)
        
        # Mots indiquant une question complexe
        complex_keywords = [
            "pourquoi", "comment", "expliquer", "différence", "comparaison",
            "analyse", "impact", "conséquence", "relation", "synthèse"
        ]
        
        # Augmenter le score pour les mots complexes
        complexity += sum(0.2 for word in complex_keywords if word in text.lower()) 
        
        # Augmenter pour les caractères de ponctuation
        complexity += min(text.count('?') * 0.2, 0.6)  # Questions
        complexity += min(text.count(',') * 0.05, 0.4)  # Complexité grammaticale
        
        return min(int(complexity * 1.5), 3)  # Plafonner à 3

    def _estimate_complexity_from_tokens(self, max_tokens: int) -> int:
        """Estime la complexité basée sur le nombre de tokens."""
        if max_tokens <= 40:
            return 0
        elif max_tokens <= 60:
            return 1
        elif max_tokens <= 100:
            return 2
        else:
            return 3

    def get_stats(self) -> Dict[str, Any]:
        """Retourne des statistiques détaillées sur le modèle et ses performances"""
        stats = {
            "model_type": self.model_type,
            "device": self.device,
            "is_ready": self.is_ready,
            "total_generations": self.generation_count,
            "cache_hits": self.cache_hits,
            "context_cache_hits": self.context_cache_hits,
            "initialization_time": self.initialization_time,
            "is_generating": self.is_generating
        }
        
        # Statistiques de performance
        if self.generation_count > 0:
            stats["avg_generation_time"] = self.total_generation_time / self.generation_count
            stats["cache_hit_rate"] = (self.cache_hits / self.generation_count) * 100
            stats["context_cache_hit_rate"] = (self.context_cache_hits / self.generation_count) * 100
        
        # Statistiques par complexité
        complexity_stats = {}
        for complexity in range(4):
            count = self.complexity_stats[complexity]
            if count > 0 and self.avg_generation_times[complexity]:
                avg_time = sum(self.avg_generation_times[complexity]) / len(self.avg_generation_times[complexity])
                complexity_stats[f"complexity_{complexity}"] = {
                    "count": count,
                    "avg_time": round(avg_time, 2),
                    "percentage": round((count / self.generation_count) * 100, 1) if self.generation_count > 0 else 0
                }
        stats["complexity_breakdown"] = complexity_stats
        
        # Ajouter les infos mémoire
        memory = get_memory_status()
        stats.update({
            "ram_usage_percent": memory["ram_percent"],
            "ram_usage_mb": memory["ram_used_mb"]
        })
        
        if self.device == "cuda" and "cuda_percent" in memory:
            stats.update({
                "vram_usage_percent": memory["cuda_percent"],
                "vram_usage_mb": memory["cuda_allocated_mb"]
            })
        
        # Taille des caches
        stats["response_cache_size"] = len(RESPONSE_CACHE)
        stats["context_cache_size"] = len(CONTEXT_CACHE)
        
        return stats

    def clear_caches(self):
        """Vide tous les caches."""
        with CACHE_LOCK:
            RESPONSE_CACHE.clear()
            CONTEXT_CACHE.clear()
            self.cache_hits = 0
            self.context_cache_hits = 0
        logger.info("Caches vidés")

    def cleanup(self):
        """Nettoie les ressources du modèle"""
        try:
            # Libérer la mémoire du modèle
            if self.model is not None:
                if self.device == "cuda":
                    self.model = self.model.to("cpu")
                self.model = None
                self.tokenizer = None
                force_gc()
                logger.info("Ressources du modèle libérées")
            
            # Vider les caches
            self.clear_caches()
            
            return True
        except Exception as e:
            logger.error(f"Erreur lors du nettoyage: {e}")
            return False

    def warmup(self):
        """Préchauffe le modèle avec quelques générations."""
        if not self.is_ready:
            logger.warning("Le modèle n'est pas prêt pour le préchauffage")
            return
        
        logger.info("Début du préchauffage du modèle...")
        warmup_prompts = [
            "Bonjour",
            "Comment allez-vous ?",
            "Quelle est la capitale de la France ?"
        ]
        
        for i, prompt in enumerate(warmup_prompts):
            try:
                response = self.generate_response(
                    prompt, 
                    max_tokens=10, 
                    temperature=0.1,
                    use_cache=False  # Pas de cache pour le warmup
                )
                logger.debug(f"Warmup {i+1}/{len(warmup_prompts)}: '{prompt}' -> '{response[:30]}...'")
            except Exception as e:
                logger.warning(f"Erreur durant le warmup: {e}")
        
        logger.info("Préchauffage terminé")

    def batch_generate(self, prompts: List[str], **kwargs) -> List[str]:
        """
        Génère des réponses pour plusieurs prompts.
        Utile pour le traitement en lot.
        """
        responses = []
        total_start = time.time()
        
        for i, prompt in enumerate(prompts):
            try:
                response = self.generate_response(prompt, **kwargs)
                responses.append(response)
                logger.debug(f"Batch {i+1}/{len(prompts)} traité")
            except Exception as e:
                logger.error(f"Erreur batch {i+1}: {e}")
                responses.append(f"Erreur: {str(e)}")
        
        total_time = time.time() - total_start
        logger.info(f"Batch de {len(prompts)} prompts traité en {total_time:.2f}s")
        
        return responses


# Fonction utilitaire pour obtenir une instance singleton
_instance = None

def get_mistral_instance(force_new=False, **kwargs):
    """
    Retourne une instance singleton de MistralInference.
    
    Args:
        force_new: Force la création d'une nouvelle instance
        **kwargs: Arguments pour MistralInference
    """
    global _instance
    
    if force_new or _instance is None:
        _instance = MistralInference(**kwargs)
        # Préchauffer si c'est une nouvelle instance
        if _instance.is_ready:
            _instance.warmup()
    
    return _instance