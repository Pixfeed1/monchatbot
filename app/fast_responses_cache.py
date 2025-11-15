"""
Service de cache pour enrichir le contexte avec des réponses rapides.
Version refactorée pour fournir des "seeds" au lieu de réponses finales.
"""
import re
import logging
import time
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

# Configuration du logger
logger = logging.getLogger(__name__)
logger.info("====> Chargement du module fast_responses_cache (version enrichissement)")

# Cache global pour les réponses
responses_cache = {}
settings_cache = {}
cache_initialized = False
last_refresh = 0
CACHE_TTL = 300  # 5 minutes

def initialize_cache(app=None):
    """Initialise le cache des réponses rapides."""
    global cache_initialized, last_refresh
    
    logger.info("====> Début de l'initialisation du cache enrichi")
    
    if cache_initialized and time.time() - last_refresh < CACHE_TTL:
        logger.info("====> Cache encore valide, pas de rafraîchissement")
        return
    
    try:
        # Charger les paramètres du bot
        from .models import Settings, DefaultMessage, BotResponses
        
        # Paramètres généraux
        settings = Settings.query.first()
        if settings:
            settings_cache['bot_name'] = settings.bot_name or 'Assistant'
            settings_cache['bot_description'] = settings.bot_description or ''
            settings_cache['bot_welcome'] = settings.bot_welcome or ''
        
        # Messages d'erreur et fallback
        bot_responses = BotResponses.query.first()
        if bot_responses:
            settings_cache['fallback_message'] = bot_responses.fallback_message or "Je ne suis pas sûr de comprendre."
            settings_cache['technical_error'] = bot_responses.technical_error or "Une erreur technique s'est produite."
        
        # Charger toutes les réponses rapides
        responses = DefaultMessage.query.all()
        responses_cache.clear()
        
        for response in responses:
            if response.triggers:
                # Stocker par trigger pour recherche rapide
                triggers = [t.strip().lower() for t in response.triggers.split(',')]
                for trigger in triggers:
                    if trigger:
                        responses_cache[trigger] = {
                            'id': response.id,
                            'title': response.title,
                            'content': response.content,
                            'original_triggers': triggers,
                            'created_at': response.created_at
                        }
        
        cache_initialized = True
        last_refresh = time.time()
        logger.info(f"====> Cache initialisé avec {len(responses_cache)} entrées")
        
    except Exception as e:
        logger.error(f"====> Erreur lors de l'initialisation du cache: {str(e)}", exc_info=True)

def get_relevant_responses(message: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """
    Trouve les réponses rapides pertinentes pour enrichir le contexte.
    Retourne des "seeds" pour l'IA, pas des réponses finales.
    
    Returns:
        List[Dict]: Liste des réponses pertinentes avec score
    """
    if not cache_initialized:
        initialize_cache()
    
    message_lower = message.lower().strip()
    relevant_responses = []
    seen_contents = set()  # Pour éviter les doublons
    
    # 1. Recherche exacte des triggers
    words = message_lower.split()
    for word in words:
        if word in responses_cache:
            response = responses_cache[word]
            content_hash = hash(response['content'])
            if content_hash not in seen_contents:
                seen_contents.add(content_hash)
                relevant_responses.append({
                    'trigger': word,
                    'content': response['content'],
                    'title': response['title'],
                    'score': 2.0,  # Score élevé pour correspondance exacte
                    'match_type': 'exact'
                })
    
    # 2. Recherche par sous-chaîne
    for trigger, response in responses_cache.items():
        if trigger in message_lower and hash(response['content']) not in seen_contents:
            seen_contents.add(hash(response['content']))
            relevant_responses.append({
                'trigger': trigger,
                'content': response['content'],
                'title': response['title'],
                'score': 1.5,  # Score moyen pour sous-chaîne
                'match_type': 'substring'
            })
    
    # 3. Recherche par similarité (mots communs)
    message_words = set(message_lower.split())
    for trigger, response in responses_cache.items():
        trigger_words = set(trigger.split())
        common_words = message_words.intersection(trigger_words)
        
        if len(common_words) > 0 and hash(response['content']) not in seen_contents:
            score = len(common_words) / len(trigger_words)
            if score > 0.3:  # Seuil minimum de similarité
                seen_contents.add(hash(response['content']))
                relevant_responses.append({
                    'trigger': trigger,
                    'content': response['content'],
                    'title': response['title'],
                    'score': score,
                    'match_type': 'similarity'
                })
    
    # Trier par score et limiter
    relevant_responses.sort(key=lambda x: x['score'], reverse=True)
    
    # Traiter les variables dans les réponses
    for response in relevant_responses[:max_results]:
        response['content'] = process_variables(response['content'])
    
    logger.info(f"====> Trouvé {len(relevant_responses[:max_results])} réponses pertinentes pour: '{message[:50]}...'")
    return relevant_responses[:max_results]

def get_response_context(message: str) -> Dict[str, Any]:
    """
    Retourne un contexte enrichi pour l'IA basé sur les réponses rapides.
    """
    relevant_responses = get_relevant_responses(message)
    
    context = {
        'has_relevant_responses': len(relevant_responses) > 0,
        'responses': relevant_responses,
        'bot_info': {
            'name': settings_cache.get('bot_name', 'Assistant'),
            'description': settings_cache.get('bot_description', '')
        }
    }
    
    # Si on a des réponses très pertinentes (score > 1.5), suggérer un style
    if relevant_responses and relevant_responses[0]['score'] > 1.5:
        context['suggested_style'] = 'concis'  # Réponse courte car on a un bon exemple
        context['confidence'] = 'high'
    else:
        context['suggested_style'] = 'normal'
        context['confidence'] = 'low'
    
    return context

def process_variables(content: str, context: Dict[str, Any] = None) -> str:
    """Traite les variables dans le contenu."""
    if not content:
        return content
    
    # Variables système
    replacements = {
        '{bot_name}': settings_cache.get('bot_name', 'Assistant'),
        '{domain}': settings_cache.get('bot_description', 'assistance'),
        '{current_date}': datetime.now().strftime('%d/%m/%Y'),
        '{current_time}': datetime.now().strftime('%H:%M')
    }
    
    # Variables additionnelles du contexte
    if context:
        for key, value in context.items():
            replacements[f'{{{key}}}'] = str(value)
    
    # Remplacer toutes les variables
    for var, value in replacements.items():
        content = content.replace(var, value)
    
    return content

def refresh_cache():
    """Force le rafraîchissement du cache."""
    global cache_initialized, last_refresh
    cache_initialized = False
    last_refresh = 0
    initialize_cache()
    logger.info("====> Cache rafraîchi manuellement")

# Fonctions de compatibilité pour l'ancien code
def get_fast_response(message: str) -> Optional[Dict[str, Any]]:
    """
    DEPRECATED: Ancienne fonction conservée pour compatibilité.
    Utiliser get_relevant_responses() à la place.
    """
    logger.warning("====> ATTENTION: get_fast_response() est déprécié. Utiliser get_relevant_responses()")
    responses = get_relevant_responses(message, max_results=1)
    return responses[0] if responses else None

def get_fallback_message() -> str:
    """Retourne le message de secours."""
    if not cache_initialized:
        initialize_cache()
    return settings_cache.get('fallback_message', "Je ne suis pas sûr de comprendre. Pouvez-vous reformuler?")

def get_error_message() -> str:
    """Retourne le message d'erreur technique."""
    if not cache_initialized:
        initialize_cache()
    return settings_cache.get('technical_error', "Désolé, une erreur technique s'est produite.")

def start_refresh_thread(app=None):
    """Fonction vide - pas de thread dans cette version."""
    logger.info("====> Thread de rafraîchissement non utilisé dans cette version")
    return True

logger.info("====> Module fast_responses_cache chargé (mode enrichissement)")