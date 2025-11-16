#!/usr/bin/env python3
"""
Module API Inference - Version Clés Utilisateur
===============================================

Ce module fournit une instance API compatible avec le mode clés utilisateur.
En mode clés utilisateur, les clés API sont gérées côté serveur (chiffrées)
et les appels API sont effectués par le backend pour plus de sécurité.

Le backend gère :
- Le stockage chiffré des clés utilisateur
- Les appels API sécurisés
- Le context building intelligent
- La gestion des sessions
- Les statistiques et monitoring
"""

import logging
import os
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)

class UserKeysAPIManager:
    """
    Gestionnaire API pour le mode clés utilisateur.
    
    Gère les clés API stockées côté serveur de manière chiffrée
    et effectue les appels API de manière sécurisée.
    """
    
    def __init__(self, app=None):
        self.mode = "user_keys_api"
        self.app = app
        self.is_ready = True
        self.providers = {
            "openai": "available_user_keys",
            "mistral": "available_user_keys",
            "claude": "available_user_keys"
        }
        self.stats = {
            "total_generations": 0,
            "cache_hit_rate": 0,
            "cache_size": 0,
            "user_requests": 0,
            "context_generations": 0,
            "encrypted_keys_count": 0
        }
        logger.info("UserKeysAPIManager initialisé")
    
    def get_supported_providers(self) -> List[str]:
        """Retourne la liste des providers supportés."""
        return ["openai", "mistral", "claude"]
    
    def get_supported_models(self, provider: str = None) -> Dict[str, List[str]]:
        """Retourne les modèles supportés par provider."""
        models = {
            "openai": [
                "gpt-3.5-turbo",
                "gpt-4",
                "gpt-4-turbo",
                "gpt-4o",
                "gpt-4o-mini"
            ],
            "mistral": [
                "mistral-small",
                "mistral-medium",
                "mistral-large",
                "open-mistral-7b",
                "open-mixtral-8x7b"
            ],
            "claude": [
                "claude-sonnet-4-5",
                "claude-opus-4-1",
                "claude-sonnet-4",
                "claude-haiku-4-5",
                "claude-3-7-sonnet"
            ]
        }

        if provider:
            return models.get(provider, [])
        return models
    
    def get_recommended_config(self, complexity: int = 1, user_config: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Retourne une configuration recommandée basée sur la complexité et la config utilisateur.
        
        Args:
            complexity: Niveau de complexité (0-3)
            user_config: Configuration utilisateur (provider, model)
            
        Returns:
            Configuration recommandée
        """
        # Configuration par défaut basée sur la complexité
        base_configs = [
            {  # Complexité 0 - Réponses simples/rapides
                "max_tokens": 50,
                "temperature": 0.3,
                "timeout": 10
            },
            {  # Complexité 1 - Questions standards
                "max_tokens": 100,
                "temperature": 0.5,
                "timeout": 15
            },
            {  # Complexité 2 - Questions complexes
                "max_tokens": 150,
                "temperature": 0.7,
                "timeout": 20
            },
            {  # Complexité 3 - Très complexe
                "max_tokens": 200,
                "temperature": 0.8,
                "timeout": 30
            }
        ]
        
        config = base_configs[min(complexity, 3)]
        
        # Appliquer la configuration utilisateur si disponible
        if user_config:
            config.update({
                "provider": user_config.get("provider", "openai"),
                "model": user_config.get("model", "gpt-3.5-turbo"),
                "api_key": user_config.get("api_key"),  # Clé déchiffrée
            })
        else:
            # Configuration par défaut
            config.update({
                "provider": "openai",
                "model": "gpt-3.5-turbo"
            })
        
        return config
    
    def validate_user_config(self, user_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Valide une configuration utilisateur.
        
        Args:
            user_config: Configuration utilisateur à valider
            
        Returns:
            Résultat de validation
        """
        errors = []
        warnings = []
        
        # Validation du provider
        provider = user_config.get("provider")
        if not provider:
            errors.append("Provider manquant")
        elif provider not in self.get_supported_providers():
            errors.append(f"Provider '{provider}' non supporté")
        
        # Validation du modèle
        model = user_config.get("model")
        if not model:
            errors.append("Modèle manquant")
        elif provider and model not in self.get_supported_models(provider):
            warnings.append(f"Modèle '{model}' non reconnu pour {provider}")
        
        # Validation de la clé API
        api_key = user_config.get("api_key")
        if not api_key:
            errors.append("Clé API manquante")
        elif len(api_key) < 10:
            errors.append("Clé API trop courte")
        
        # Validation spécifique par provider
        if provider == "openai" and api_key and not api_key.startswith("sk-"):
            warnings.append("Format de clé OpenAI suspect (devrait commencer par 'sk-')")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "provider": provider,
            "model": model
        }
    
    def estimate_cost(self, prompt: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Estime le coût d'une requête.
        
        Args:
            prompt: Le prompt
            config: Configuration
            
        Returns:
            Estimation des coûts
        """
        provider = config.get("provider", "openai")
        model = config.get("model", "gpt-3.5-turbo")
        
        # Estimation approximative du nombre de tokens
        estimated_tokens = len(prompt.split()) * 1.3  # Approximation
        max_tokens = config.get("max_tokens", 100)
        total_tokens = estimated_tokens + max_tokens
        
        # Coûts approximatifs (à ajuster selon les tarifs actuels)
        costs = {
            "openai": {
                "gpt-3.5-turbo": 0.002 / 1000,  # $0.002 per 1K tokens
                "gpt-4": 0.06 / 1000,            # $0.06 per 1K tokens
                "gpt-4-turbo": 0.03 / 1000,      # $0.03 per 1K tokens
                "gpt-4o": 0.015 / 1000,          # Estimation
                "gpt-4o-mini": 0.0015 / 1000,    # Estimation
            },
            "mistral": {
                "mistral-small": 0.002 / 1000,   # Approximation
                "mistral-medium": 0.01 / 1000,   # Approximation
                "mistral-large": 0.02 / 1000,    # Approximation
            }
        }
        
        cost_per_token = costs.get(provider, {}).get(model, 0.002 / 1000)
        estimated_cost = total_tokens * cost_per_token
        
        return {
            "estimated_tokens": int(total_tokens),
            "estimated_cost_usd": round(estimated_cost, 4),
            "currency": "USD",
            "provider": provider,
            "model": model,
            "breakdown": {
                "input_tokens": int(estimated_tokens),
                "output_tokens": max_tokens,
                "total_tokens": int(total_tokens)
            }
        }
    
    def log_user_request(self, user_id: int, request_data: Dict[str, Any]):
        """
        Log une requête utilisateur pour les statistiques.
        
        Args:
            user_id: ID de l'utilisateur
            request_data: Données de la requête
        """
        self.stats["user_requests"] += 1
        self.stats["context_generations"] += 1
        
        logger.info(f"Requête utilisateur loggée: user_id={user_id}, provider={request_data.get('provider', 'unknown')}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du gestionnaire."""
        return {
            **self.stats,
            "mode": self.mode,
            "providers_available": len(self.providers),
            "is_ready": self.is_ready,
            "encryption_enabled": True,
            "server_side_keys": True,
            "last_updated": datetime.utcnow().isoformat()
        }
    
    def test_user_connection(self, user_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Teste la connexion avec la configuration utilisateur.
        
        Args:
            user_config: Configuration utilisateur
            
        Returns:
            Résultat du test
        """
        try:
            # Validation de base
            validation = self.validate_user_config(user_config)
            if not validation["valid"]:
                return {
                    "success": False,
                    "error": "Configuration invalide",
                    "details": validation["errors"]
                }
            
            provider = user_config["provider"]
            api_key = user_config["api_key"]
            model = user_config["model"]
            
            # Test spécifique selon le provider
            if provider == "openai":
                return self._test_openai_connection(api_key, model)
            elif provider == "mistral":
                return self._test_mistral_connection(api_key, model)
            elif provider == "claude":
                return self._test_claude_connection(api_key, model)
            else:
                return {
                    "success": False,
                    "error": f"Provider {provider} non supporté pour les tests"
                }
                
        except Exception as e:
            logger.error(f"Erreur test connexion utilisateur: {e}")
            return {
                "success": False,
                "error": f"Erreur inattendue: {str(e)}"
            }
    
    def _test_openai_connection(self, api_key: str, model: str) -> Dict[str, Any]:
        """Teste une connexion OpenAI."""
        try:
            import openai
            
            client = openai.OpenAI(api_key=api_key)
            
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": "Test de connexion"}],
                max_tokens=5,
                timeout=10
            )
            
            return {
                "success": True,
                "message": f"Connexion OpenAI réussie avec {model}",
                "usage": response.usage.total_tokens if hasattr(response, 'usage') else None,
                "model_confirmed": response.model if hasattr(response, 'model') else model
            }
            
        except Exception as e:
            error_msg = str(e)
            if "invalid" in error_msg.lower() or "unauthorized" in error_msg.lower():
                error_msg = "Clé API OpenAI invalide ou expirée"
            elif "model" in error_msg.lower():
                error_msg = f"Modèle {model} non disponible avec cette clé"
            elif "quota" in error_msg.lower():
                error_msg = "Quota OpenAI dépassé ou facturation requise"
            
            return {
                "success": False,
                "error": error_msg,
                "provider": "openai"
            }
    
    def _test_mistral_connection(self, api_key: str, model: str) -> Dict[str, Any]:
        """Teste une connexion Mistral."""
        try:
            import requests
            
            headers = {
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                'model': model,
                'messages': [{'role': 'user', 'content': 'Test de connexion'}],
                'max_tokens': 5
            }
            
            response = requests.post(
                'https://api.mistral.ai/v1/chat/completions',
                headers=headers,
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "message": f"Connexion Mistral réussie avec {model}",
                    "usage": data.get('usage', {}).get('total_tokens'),
                    "model_confirmed": data.get('model', model)
                }
            else:
                error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                error_msg = error_data.get('message', f"Erreur HTTP {response.status_code}")
                
                if response.status_code == 401:
                    error_msg = "Clé API Mistral invalide ou expirée"
                elif response.status_code == 402:
                    error_msg = "Quota Mistral dépassé ou facturation requise"
                elif response.status_code == 404:
                    error_msg = f"Modèle {model} non trouvé"
                
                return {
                    "success": False,
                    "error": error_msg,
                    "provider": "mistral"
                }
                
        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": "Timeout - Vérifiez votre connexion internet",
                "provider": "mistral"
            }
        except requests.exceptions.ConnectionError:
            return {
                "success": False,
                "error": "Erreur de connexion à l'API Mistral",
                "provider": "mistral"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Erreur inattendue: {str(e)}",
                "provider": "mistral"
            }

    def _test_claude_connection(self, api_key: str, model: str) -> Dict[str, Any]:
        """Teste une connexion Claude (Anthropic)."""
        try:
            from anthropic import Anthropic

            client = Anthropic(api_key=api_key)

            response = client.messages.create(
                model=model,
                max_tokens=5,
                messages=[{"role": "user", "content": "Test de connexion"}]
            )

            return {
                "success": True,
                "message": f"Connexion Claude réussie avec {model}",
                "usage": response.usage.input_tokens + response.usage.output_tokens if hasattr(response, 'usage') else None,
                "model_confirmed": response.model if hasattr(response, 'model') else model
            }

        except Exception as e:
            error_msg = str(e)
            if "invalid" in error_msg.lower() or "unauthorized" in error_msg.lower() or "authentication" in error_msg.lower():
                error_msg = "Clé API Claude invalide ou expirée"
            elif "model" in error_msg.lower() or "not found" in error_msg.lower():
                error_msg = f"Modèle {model} non disponible avec cette clé"
            elif "quota" in error_msg.lower() or "rate" in error_msg.lower():
                error_msg = "Quota Claude dépassé ou limite de requêtes atteinte"

            return {
                "success": False,
                "error": error_msg,
                "provider": "claude"
            }

    def get_provider_info(self, provider: str) -> Dict[str, Any]:
        """
        Retourne les informations d'un provider.
        
        Args:
            provider: Nom du provider
            
        Returns:
            Informations du provider
        """
        info = {
            "openai": {
                "name": "OpenAI",
                "description": "GPT models by OpenAI",
                "website": "https://openai.com",
                "models": self.get_supported_models("openai"),
                "requires_key": True,
                "key_format": "sk-...",
                "documentation": "https://platform.openai.com/docs",
                "pricing_url": "https://openai.com/pricing",
                "key_management": "server_encrypted"
            },
            "mistral": {
                "name": "Mistral AI",
                "description": "Open and commercial models by Mistral AI",
                "website": "https://mistral.ai",
                "models": self.get_supported_models("mistral"),
                "requires_key": True,
                "key_format": "...",
                "documentation": "https://docs.mistral.ai",
                "pricing_url": "https://mistral.ai/pricing",
                "key_management": "server_encrypted"
            },
            "claude": {
                "name": "Claude (Anthropic)",
                "description": "Claude AI models by Anthropic",
                "website": "https://www.anthropic.com",
                "models": self.get_supported_models("claude"),
                "requires_key": True,
                "key_format": "sk-ant-...",
                "documentation": "https://docs.anthropic.com",
                "pricing_url": "https://www.anthropic.com/pricing",
                "key_management": "server_encrypted"
            }
        }

        return info.get(provider, {})
    
    def get_user_instructions(self) -> Dict[str, Any]:
        """
        Retourne les instructions pour les utilisateurs.
        
        Returns:
            Instructions détaillées
        """
        return {
            "title": "Configuration des Clés API",
            "mode": "user_keys_server_managed",
            "security": {
                "encryption": "Les clés API sont chiffrées et stockées de manière sécurisée sur le serveur",
                "access": "Seul l'utilisateur propriétaire peut accéder à ses clés",
                "transmission": "Les clés ne sont jamais transmises en clair"
            },
            "setup_steps": [
                {
                    "step": 1,
                    "title": "Obtenir une clé API",
                    "openai": "Créez un compte sur platform.openai.com et générez une clé API",
                    "mistral": "Créez un compte sur console.mistral.ai et obtenez une clé API",
                    "claude": "Créez un compte sur console.anthropic.com et générez une clé API"
                },
                {
                    "step": 2,
                    "title": "Configurer dans l'interface",
                    "description": "Allez dans Paramètres > Configuration API et saisissez votre clé"
                },
                {
                    "step": 3,
                    "title": "Tester la configuration",
                    "description": "Utilisez le bouton 'Tester' pour vérifier que la clé fonctionne"
                },
                {
                    "step": 4,
                    "title": "Utiliser le chatbot",
                    "description": "Votre configuration est maintenant active pour toutes vos conversations"
                }
            ],
            "troubleshooting": {
                "invalid_key": "Vérifiez que votre clé API est correcte et active",
                "quota_exceeded": "Vérifiez votre limite d'utilisation sur le site du provider",
                "model_not_available": "Certains modèles nécessitent un accès spécial",
                "network_error": "Vérifiez votre connexion internet"
            }
        }


def get_api_instance(app=None) -> UserKeysAPIManager:
    """
    Retourne une instance du gestionnaire API pour clés utilisateur.
    
    Args:
        app: Instance Flask (optionnel)
        
    Returns:
        Instance de UserKeysAPIManager
    """
    logger.info("Création d'une instance UserKeysAPIManager")
    return UserKeysAPIManager(app)


def get_api_status() -> Dict[str, Any]:
    """
    Retourne le statut de l'API en mode clés utilisateur.
    
    Returns:
        Statut de l'API
    """
    return {
        "mode": "user_keys_api",
        "status": "ready",
        "backend_managed": True,
        "server_side_keys": True,
        "encryption_enabled": True,
        "security": "server_encrypted_keys",
        "supported_providers": ["openai", "mistral", "claude"],
        "key_storage": "encrypted_database",
        "api_calls": "server_side",
        "timestamp": datetime.utcnow().isoformat()
    }


# ========================
# UTILITAIRES POUR LA COMPATIBILITÉ
# ========================

def is_api_available() -> bool:
    """Vérifie si l'API est disponible."""
    return True

def get_default_provider() -> str:
    """Retourne le provider par défaut."""
    return "openai"

def get_default_model(provider: str = None) -> str:
    """Retourne le modèle par défaut pour un provider."""
    if provider == "mistral":
        return "mistral-small"
    elif provider == "claude":
        return "claude-sonnet-4"
    return "gpt-3.5-turbo"


# ========================
# CLASSE D'EXCEPTION PERSONNALISÉE
# ========================

class UserKeysAPIError(Exception):
    """Exception personnalisée pour les erreurs du mode clés utilisateur."""
    
    def __init__(self, message: str, error_code: str = None, details: Dict[str, Any] = None):
        super().__init__(message)
        self.error_code = error_code or "USER_KEYS_API_ERROR"
        self.details = details or {}
        self.timestamp = datetime.utcnow().isoformat()


# ========================
# MONITORING ET LOGGING
# ========================

class UserKeysAPIMonitor:
    """Monitor pour le mode clés utilisateur."""
    
    def __init__(self):
        self.metrics = {
            "user_requests_count": 0,
            "api_calls_count": 0,
            "errors_count": 0,
            "average_response_time": 0,
            "last_request": None,
            "encryption_operations": 0
        }
    
    def log_user_request(self, user_id: int, request_id: str, duration: float = None):
        """Log une requête utilisateur."""
        self.metrics["user_requests_count"] += 1
        self.metrics["last_request"] = datetime.utcnow().isoformat()
        
        if duration:
            # Calcul de la moyenne mobile simple
            current_avg = self.metrics["average_response_time"]
            count = self.metrics["user_requests_count"]
            self.metrics["average_response_time"] = (
                (current_avg * (count - 1) + duration) / count
            )
        
        logger.info(f"User API request logged: user_id={user_id}, request_id={request_id}")
    
    def log_api_call(self, provider: str, model: str, success: bool):
        """Log un appel API."""
        self.metrics["api_calls_count"] += 1
        if not success:
            self.metrics["errors_count"] += 1
        
        logger.info(f"API call logged: {provider}/{model}, success={success}")
    
    def log_encryption_operation(self):
        """Log une opération de chiffrement/déchiffrement."""
        self.metrics["encryption_operations"] += 1
    
    def get_metrics(self) -> Dict[str, Any]:
        """Retourne les métriques."""
        return {
            **self.metrics,
            "error_rate": (
                self.metrics["errors_count"] / max(self.metrics["api_calls_count"], 1)
            ),
            "success_rate": (
                (self.metrics["api_calls_count"] - self.metrics["errors_count"]) / 
                max(self.metrics["api_calls_count"], 1)
            ),
            "timestamp": datetime.utcnow().isoformat()
        }


# Instance globale du monitor
monitor = UserKeysAPIMonitor()


# ========================
# HELPERS POUR L'INTÉGRATION
# ========================

def validate_provider_response(response: Dict[str, Any], provider: str) -> Dict[str, Any]:
    """
    Valide et formate une réponse d'API provider.
    
    Args:
        response: Réponse brute de l'API
        provider: Provider utilisé (openai/mistral)
        
    Returns:
        Réponse validée et formatée
    """
    validation_result = {
        "valid": False,
        "message": "",
        "error": None,
        "metadata": {}
    }
    
    try:
        if provider == "openai":
            if "choices" in response and len(response["choices"]) > 0:
                choice = response["choices"][0]
                if "message" in choice and "content" in choice["message"]:
                    validation_result.update({
                        "valid": True,
                        "message": choice["message"]["content"].strip(),
                        "metadata": {
                            "model": response.get("model", "unknown"),
                            "usage": response.get("usage", {}),
                            "finish_reason": choice.get("finish_reason"),
                            "provider": "openai"
                        }
                    })
                else:
                    validation_result["error"] = "Format de réponse OpenAI invalide"
            else:
                validation_result["error"] = "Aucun choix dans la réponse OpenAI"
                
        elif provider == "mistral":
            if "choices" in response and len(response["choices"]) > 0:
                choice = response["choices"][0]
                if "message" in choice and "content" in choice["message"]:
                    validation_result.update({
                        "valid": True,
                        "message": choice["message"]["content"].strip(),
                        "metadata": {
                            "model": response.get("model", "unknown"),
                            "usage": response.get("usage", {}),
                            "finish_reason": choice.get("finish_reason"),
                            "provider": "mistral"
                        }
                    })
                else:
                    validation_result["error"] = "Format de réponse Mistral invalide"
            else:
                validation_result["error"] = "Aucun choix dans la réponse Mistral"
        else:
            validation_result["error"] = f"Provider '{provider}' non supporté"
            
    except Exception as e:
        validation_result["error"] = f"Erreur lors de la validation: {str(e)}"
    
    return validation_result


def get_security_info() -> Dict[str, Any]:
    """
    Retourne les informations de sécurité du système.
    
    Returns:
        Informations de sécurité
    """
    return {
        "encryption": {
            "algorithm": "Fernet (AES 128)",
            "key_storage": "Environment variable",
            "key_rotation": "Manual",
            "at_rest": "Encrypted in database",
            "in_transit": "HTTPS only"
        },
        "access_control": {
            "user_isolation": "Each user can only access their own keys",
            "authentication": "Required for all operations",
            "session_management": "Server-side sessions",
            "audit_logging": "All operations logged"
        },
        "compliance": {
            "data_protection": "Keys are never logged in plaintext",
            "retention": "Keys stored until user deletion",
            "backup": "Encrypted backups recommended",
            "gdpr_ready": "User data deletion supported"
        }
    }


# ========================
# POINT D'ENTRÉE PRINCIPAL
# ========================

if __name__ == "__main__":
    # Test du module
    api_manager = get_api_instance()
    print("✅ UserKeysAPIManager créé avec succès")
    print(f"📊 Stats: {api_manager.get_stats()}")
    print(f"🔧 Providers: {api_manager.get_supported_providers()}")
    print(f"🔒 Mode: Clés utilisateur avec chiffrement serveur")
    print(f"📚 Instructions: {api_manager.get_user_instructions()['title']}")