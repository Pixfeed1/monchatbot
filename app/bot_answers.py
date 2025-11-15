import re
import time
from typing import Optional, Dict, Set, List, Any
import logging
import unicodedata

# Configuration du logger
logger = logging.getLogger(__name__)

# Cache pour les infos du bot avec TTL
_bot_info_cache = {
    "data": None,
    "timestamp": 0,
    "ttl": 30  # secondes
}

def normalize_text(text: str) -> str:
    """
    Normalise un texte (supprime les accents, met en minuscule, etc.)
    
    Args:
        text (str): Texte à normaliser
        
    Returns:
        str: Texte normalisé
    """
    if not text:
        return ""
    
    # Convertir en minuscule
    text = text.lower()
    
    # Supprimer les accents
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
    
    # Supprimer les caractères spéciaux (garder uniquement lettres, chiffres et espaces)
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    
    # Remplacer les espaces multiples par un seul espace
    text = re.sub(r'\s+', ' ', text)
    
    return text.strip()

def get_bot_info(force_refresh: bool = False, user_id: int = None) -> Dict[str, str]:
    """
    AMÉLIORÉ: Récupère les informations du bot depuis les PARAMÈTRES GÉNÉRAUX.
    Gère maintenant les paramètres utilisateur spécifiques et les paramètres globaux.
    
    Args:
        force_refresh (bool): Forcer le rafraîchissement du cache
        user_id (int, optional): ID utilisateur pour paramètres spécifiques
        
    Returns:
        Dict[str, str]: Dictionnaire contenant le nom et la description du bot
    """
    global _bot_info_cache
    
    # Créer une clé de cache unique selon l'utilisateur
    cache_key = f"user_{user_id}" if user_id else "global"
    
    current_time = time.time()
    if (cache_key not in _bot_info_cache or
        not _bot_info_cache.get(cache_key) or 
        current_time - _bot_info_cache.get(f"{cache_key}_timestamp", 0) > _bot_info_cache["ttl"] or 
        force_refresh):
        try:
            from .models import Settings
            
            settings = None
            
            # Stratégie de récupération des paramètres
            if user_id:
                # 1. Essayer de récupérer les paramètres spécifiques à l'utilisateur
                user_settings = Settings.query.filter_by(user_id=user_id).first()
                if user_settings and user_settings.bot_name:
                    settings = user_settings
                    logger.info(f"📋 Paramètres utilisateur trouvés pour user_id={user_id}")
            
            if not settings:
                # 2. Récupérer les paramètres généraux (user_id=None)
                settings = Settings.query.filter_by(user_id=None).first()
                if settings:
                    logger.info("📋 Paramètres généraux trouvés (user_id=None)")
            
            if not settings:
                # 3. Fallback vers le premier Settings (paramètres généraux historiques)
                settings = Settings.query.first()
                if settings:
                    logger.info("📋 Fallback vers premier Settings trouvé")
            
            if settings:
                # Utiliser VOS paramètres configurés
                bot_data = {
                    "name": settings.bot_name or "Assistant",
                    "description": settings.bot_description or "Je suis votre assistant virtuel spécialisé.",
                    "welcome": settings.bot_welcome or "",
                    "avatar": settings.bot_avatar or ""
                }
                
                _bot_info_cache[cache_key] = bot_data
                _bot_info_cache[f"{cache_key}_timestamp"] = current_time
                
                logger.info(f"🎯 Bot info chargée pour {cache_key}: Nom='{settings.bot_name}', Description='{settings.bot_description}'")
            else:
                # Valeurs par défaut si aucun paramètre trouvé
                bot_data = {
                    "name": "Assistant",
                    "description": "Je suis votre assistant virtuel spécialisé.",
                    "welcome": "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
                    "avatar": ""
                }
                
                _bot_info_cache[cache_key] = bot_data
                _bot_info_cache[f"{cache_key}_timestamp"] = current_time
                
                logger.warning(f"Aucun paramètre trouvé pour {cache_key}, utilisation des valeurs par défaut")
            
        except Exception as e:
            logger.error(f"Erreur lors de la récupération des infos du bot: {str(e)}", exc_info=True)
            # Valeurs par défaut en cas d'erreur
            _bot_info_cache[cache_key] = {
                "name": "Assistant",
                "description": "Je suis votre assistant virtuel spécialisé.",
                "welcome": "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
                "avatar": ""
            }
            _bot_info_cache[f"{cache_key}_timestamp"] = current_time
    
    return _bot_info_cache.get(cache_key, _bot_info_cache.get("global", {}))

def check_personal_questions(message: str, user_id: int = None) -> Optional[Dict[str, Any]]:
    """
    AMÉLIORÉ: Analyse si le message est une question personnelle et utilise VOS paramètres.
    Maintenant compatible avec les paramètres utilisateur.
    
    Args:
        message (str): Message à analyser
        user_id (int, optional): ID utilisateur pour paramètres spécifiques
    
    Returns:
        Dict ou None: Dictionnaire avec suggestions ou None
    """
    if not message:
        return None
        
    # Préparer le message
    original_message = message.lower().strip()
    normalized_message = normalize_text(message)
    
    # Récupérer les infos du bot (VOS paramètres configurés)
    bot_info = get_bot_info(user_id=user_id)
    logger.info(f"🔍 Bot info utilisée: {bot_info}")
    
    # Analyser le type de question
    question_type = None
    confidence = 0.0
    suggested_response = None
    
    # ===== DÉTECTION DU TYPE DE QUESTION =====
    
    # Questions sur le nom - PATTERNS ÉTENDUS
    name_keywords = {
        "nom", "prenom", "prénom", "appelle", "appelles", "t'appelles", "t appelles",
        "qui es tu", "qui es-tu", "qui êtes vous", "qui êtes-vous", "te nommer", 
        "ton nom", "votre nom", "comment tu t'appelles", "comment vous appelez vous",
        "comment vous vous appelez", "quel est ton nom", "quel est votre nom",
        "peux tu te présenter", "pouvez vous vous présenter", "présente toi",
        "présentez vous", "identité", "qui vous êtes"
    }
    
    for keyword in name_keywords:
        if keyword in normalized_message:
            question_type = "identity"
            confidence = 0.9
            suggested_response = f"Je m'appelle {bot_info['name']}."
            logger.info(f"✅ Question sur le nom détectée, réponse suggérée: {suggested_response}")
            break
    
    # Questions sur le métier/fonction/profession - PATTERNS ÉTENDUS
    job_keywords = {
        "métier", "metier", "profession", "travail", "boulot", "job",
        "tu fais quoi", "que fais tu", "que fais-tu", "fais tu dans la vie",
        "faites vous dans la vie", "que faites vous", "occupation", "fonction", 
        "ton travail", "votre travail", "ton metier", "votre métier", 
        "ta profession", "votre profession", "rôle", "role", "activité",
        "activite", "domaine", "spécialité", "specialite", "compétence",
        "competence", "en quoi tu peux aider", "en quoi vous pouvez aider",
        "comment tu peux m'aider", "comment vous pouvez m'aider",
        "quel est ton rôle", "quel est votre rôle"
    }
    
    for keyword in job_keywords:
        if keyword in normalized_message:
            question_type = "profession"
            confidence = 0.9
            # UTILISER directement la description configurée
            suggested_response = bot_info['description']
            logger.info(f"✅ Question sur le métier détectée, réponse suggérée: {suggested_response}")
            break
    
    # Questions sur les capacités/compétences - NOUVEAU
    capability_keywords = {
        "que sais tu faire", "que savez vous faire", "tes capacités", "vos capacités",
        "tes compétences", "vos compétences", "tu peux faire quoi", "vous pouvez faire quoi",
        "comment tu m'aides", "comment vous m'aidez", "à quoi tu sers", "à quoi vous servez",
        "pourquoi tu es là", "pourquoi vous êtes là"
    }
    
    for keyword in capability_keywords:
        if keyword in normalized_message:
            question_type = "capabilities"
            confidence = 0.8
            # Combiner nom et description pour les capacités
            suggested_response = f"Je suis {bot_info['name']}. {bot_info['description']}"
            logger.info(f"✅ Question sur les capacités détectée, réponse suggérée: {suggested_response}")
            break
    
    # Questions de présentation générale - NOUVEAU
    presentation_keywords = {
        "présente toi", "présentez vous", "raconte moi qui tu es", "racontez moi qui vous êtes",
        "dis moi qui tu es", "dites moi qui vous êtes", "parle de toi", "parlez de vous"
    }
    
    for keyword in presentation_keywords:
        if keyword in normalized_message:
            question_type = "presentation"
            confidence = 0.9
            # Présentation complète
            suggested_response = f"Je m'appelle {bot_info['name']}. {bot_info['description']}"
            logger.info(f"✅ Question de présentation détectée, réponse suggérée: {suggested_response}")
            break
    
    # Si on a détecté quelque chose, retourner des suggestions CLAIRES
    if question_type and suggested_response:
        logger.info(f"🎯 Question personnelle détectée (type: {question_type}, confiance: {confidence})")
        
        return {
            'type': question_type,
            'confidence': confidence,
            'direct_response': suggested_response,  # Réponse directe à utiliser
            'suggestions': {
                'key_info': [suggested_response],
                'tone': 'direct',
                'max_tokens': 80 if question_type == "presentation" else 50,  # Plus de tokens pour présentation
                'temperature': 0.2,  # Réponse très précise
                'use_direct_response': True,  # Flag pour utiliser la réponse directe
                'priority': 'high'  # Priorité haute pour les questions personnelles
            },
            'bot_context': bot_info,
            'user_id': user_id
        }
    
    # Pas de question personnelle détectée
    logger.debug(f"❌ Pas de question personnelle détectée pour: '{message}'")
    return None

def get_bot_context(user_id: int = None) -> Dict[str, Any]:
    """
    AMÉLIORÉ: Retourne un contexte complet du bot pour enrichir l'IA.
    Maintenant compatible avec les paramètres utilisateur.
    
    Args:
        user_id (int, optional): ID utilisateur pour paramètres spécifiques
    """
    from .models import Settings, BotResponses, BotCompetences
    
    context = {
        'identity': {},
        'style': {},
        'competences': {},
        'vocabulary': {},
        'user_specific': bool(user_id)
    }
    
    try:
        # Identité depuis les paramètres (utilisateur ou généraux)
        bot_info = get_bot_info(user_id=user_id)
        context['identity'] = bot_info
        
        # Style et ton (toujours global pour l'instant)
        responses = BotResponses.query.first()
        if responses:
            context['style'] = {
                'communication': getattr(responses, 'communication_style', 'professional'),
                'language_level': getattr(responses, 'language_level', 'standard'),
                'traits': getattr(responses, 'personality_traits', []),
                'vocabulary': getattr(responses, 'vocabulary', {})
            }
        
        # Compétences (globales)
        competences = BotCompetences.query.first()
        if competences:
            active_competences = []
            if getattr(competences, 'service_client_active', False):
                active_competences.append({
                    'name': 'service_client',
                    'level': getattr(competences, 'service_client_niveau', 'standard'),
                    'domains': getattr(competences, 'service_client_domains', [])
                })
            if getattr(competences, 'lead_gen_active', False):
                active_competences.append({
                    'name': 'lead_generation',
                    'criteria': getattr(competences, 'lead_qualification', {})
                })
            if getattr(competences, 'support_tech_active', False):
                active_competences.append({
                    'name': 'support_technique',
                    'level': getattr(competences, 'support_tech_niveau', 'standard')
                })
            context['competences'] = active_competences
        
        logger.info(f"📋 Contexte bot généré pour user_id={user_id}, identité: {context['identity']['name']}")
        
    except Exception as e:
        logger.error(f"Erreur lors de la récupération du contexte: {str(e)}")
        # Contexte par défaut en cas d'erreur
        context['identity'] = get_bot_info(user_id=user_id)
    
    return context

def clear_bot_info_cache(user_id: int = None):
    """
    NOUVEAU: Vide le cache des informations du bot.
    Utile après modification des paramètres.
    
    Args:
        user_id (int, optional): Vider le cache d'un utilisateur spécifique
    """
    global _bot_info_cache
    
    if user_id:
        cache_key = f"user_{user_id}"
        if cache_key in _bot_info_cache:
            del _bot_info_cache[cache_key]
        if f"{cache_key}_timestamp" in _bot_info_cache:
            del _bot_info_cache[f"{cache_key}_timestamp"]
        logger.info(f"🗑️ Cache bot info vidé pour user_id={user_id}")
    else:
        # Vider tout le cache
        _bot_info_cache.clear()
        _bot_info_cache.update({"data": None, "timestamp": 0, "ttl": 30})
        logger.info("🗑️ Cache bot info entièrement vidé")

def test_personal_question_detection(message: str, user_id: int = None) -> Dict[str, Any]:
    """
    NOUVEAU: Fonction de test pour vérifier la détection des questions personnelles.
    Utile pour debugger et tester les patterns.
    
    Args:
        message (str): Message à tester
        user_id (int, optional): ID utilisateur
        
    Returns:
        Dict[str, Any]: Résultat du test avec détails
    """
    start_time = time.time()
    
    # Tester la détection
    result = check_personal_questions(message, user_id=user_id)
    
    processing_time = time.time() - start_time
    
    return {
        'input_message': message,
        'normalized_message': normalize_text(message),
        'detected': result is not None,
        'result': result,
        'processing_time_ms': round(processing_time * 1000, 2),
        'bot_info_used': get_bot_info(user_id=user_id),
        'timestamp': time.time()
    }

def get_response_suggestions(question_type: str, bot_info: Dict[str, str]) -> List[str]:
    """
    NOUVEAU: Génère plusieurs suggestions de réponses selon le type de question.
    
    Args:
        question_type (str): Type de question détectée
        bot_info (Dict[str, str]): Informations du bot
        
    Returns:
        List[str]: Liste de suggestions de réponses
    """
    suggestions = []
    
    if question_type == "identity":
        suggestions = [
            f"Je m'appelle {bot_info['name']}.",
            f"Mon nom est {bot_info['name']}.",
            f"Je suis {bot_info['name']}, votre assistant."
        ]
    
    elif question_type == "profession":
        suggestions = [
            bot_info['description'],
            f"Je suis {bot_info['name']}. {bot_info['description']}",
            f"{bot_info['description']} N'hésitez pas à me poser vos questions !"
        ]
    
    elif question_type == "capabilities":
        suggestions = [
            f"Je suis {bot_info['name']}. {bot_info['description']}",
            f"{bot_info['description']} Comment puis-je vous aider ?",
            f"En tant que {bot_info['name']}, {bot_info['description'].lower()}"
        ]
    
    elif question_type == "presentation":
        suggestions = [
            f"Je m'appelle {bot_info['name']}. {bot_info['description']}",
            f"Bonjour ! Je suis {bot_info['name']}, {bot_info['description'].lower()}",
            f"Je me présente : {bot_info['name']}, {bot_info['description'].lower()} Comment puis-je vous aider ?"
        ]
    
    return suggestions

def log_missed_personal_question(original: str, normalized: str = None, user_id: int = None) -> None:
    """
    AMÉLIORÉ: Log les questions qui pourraient être des questions personnelles
    mais qui n'ont pas été interceptées par les patterns.
    
    Args:
        original (str): Le message original de l'utilisateur
        normalized (str, optional): Le message normalisé
        user_id (int, optional): ID utilisateur
    """
    if not normalized:
        normalized = normalize_text(original)
    
    # Mots-clés de base pour détecter des questions manquées
    name_related_keywords = ["nom", "appell", "prénom", "prenom", "qui es", "identité", "présent", "blaz"]
    job_related_keywords = ["métier", "metier", "travail", "profession", "fais quoi", "rôle", "role", "boulot", "job"]
    capability_keywords = ["capacité", "compétence", "sais faire", "peux faire", "aider"]
    
    # Vérifier si le message contient des mots-clés liés au nom
    for keyword in name_related_keywords:
        if keyword in normalized:
            logger.warning(f"❗ Possible question sur le nom non interceptée (user_id={user_id}): '{original}'")
            return
            
    # Vérifier si le message contient des mots-clés liés au métier
    for keyword in job_related_keywords:
        if keyword in normalized:
            logger.warning(f"❗ Possible question sur le métier non interceptée (user_id={user_id}): '{original}'")
            return
    
    # Vérifier si le message contient des mots-clés liés aux capacités
    for keyword in capability_keywords:
        if keyword in normalized:
            logger.warning(f"❗ Possible question sur les capacités non interceptée (user_id={user_id}): '{original}'")
            return

def should_use_direct_response(analysis_result: Dict[str, Any]) -> bool:
    """
    NOUVEAU: Détermine s'il faut utiliser la réponse directe ou laisser l'IA traiter.
    
    Args:
        analysis_result (Dict[str, Any]): Résultat de l'analyse de question personnelle
        
    Returns:
        bool: True si utiliser la réponse directe, False sinon
    """
    if not analysis_result:
        return False
    
    # Utiliser la réponse directe si :
    # 1. La confiance est élevée (>= 0.8)
    # 2. Le flag use_direct_response est activé
    # 3. Il s'agit d'une question d'identité ou de présentation
    
    confidence = analysis_result.get('confidence', 0)
    use_direct = analysis_result.get('suggestions', {}).get('use_direct_response', False)
    question_type = analysis_result.get('type', '')
    
    return (confidence >= 0.8 and use_direct) or question_type in ['identity', 'presentation']

# ===== FONCTIONS D'ADMINISTRATION ET DEBUG =====

def get_detection_stats() -> Dict[str, Any]:
    """
    NOUVEAU: Retourne des statistiques sur la détection des questions personnelles.
    """
    return {
        'cache_info': {
            'entries': len([k for k in _bot_info_cache.keys() if not k.endswith('_timestamp')]),
            'ttl_seconds': _bot_info_cache.get('ttl', 30)
        },
        'supported_question_types': ['identity', 'profession', 'capabilities', 'presentation'],
        'detection_patterns': {
            'name_keywords_count': 15,
            'job_keywords_count': 20,
            'capability_keywords_count': 10,
            'presentation_keywords_count': 6
        }
    }

def refresh_all_bot_info():
    """
    NOUVEAU: Force le rafraîchissement de toutes les informations bot en cache.
    """
    clear_bot_info_cache()
    # Recharger les infos globales
    get_bot_info(force_refresh=True)
    logger.info("🔄 Toutes les informations bot ont été rafraîchies")