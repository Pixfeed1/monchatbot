"""
Response Manager - Gestionnaire de Réponses Configurées
Gère le matching et la récupération des réponses depuis la Configuration des Réponses
"""

import logging
import re
from typing import Optional, Dict, List, Tuple
from .models import DefaultMessage, BotResponses, Settings
from .bot_answers import normalize_text

logger = logging.getLogger(__name__)


class ResponseManager:
    """Gestionnaire des réponses configurées par l'utilisateur"""

    def __init__(self):
        self.cache = {}
        self.cache_timestamp = 0
        self.cache_ttl = 60  # 1 minute

    def find_matching_response(self, user_message: str, user_id: int = None) -> Optional[Dict]:
        """
        Cherche une réponse configurée qui correspond au message utilisateur

        Args:
            user_message: Message de l'utilisateur
            user_id: ID de l'utilisateur (optionnel)

        Returns:
            Dict avec la réponse trouvée ou None
        """
        logger.info(f"🔍 Recherche réponse pour: '{user_message}'")

        # Normaliser le message
        normalized_message = normalize_text(user_message)

        # 1. Chercher dans les réponses rapides (DefaultMessage)
        quick_response = self._find_quick_response(normalized_message)
        if quick_response:
            logger.info(f"✅ Réponse rapide trouvée: '{quick_response['title']}'")
            return {
                'type': 'quick_response',
                'source': 'DefaultMessage',
                'title': quick_response['title'],
                'content': quick_response['content'],
                'confidence': quick_response['confidence']
            }

        # 2. Chercher dans les templates essentiels (BotResponses)
        template_response = self._find_template_response(normalized_message, user_id)
        if template_response:
            logger.info(f"✅ Template trouvé: '{template_response['type']}'")
            return {
                'type': 'template',
                'source': 'BotResponses',
                'template_type': template_response['type'],
                'content': template_response['content'],
                'confidence': template_response['confidence']
            }

        logger.info("❌ Aucune réponse configurée trouvée")
        return None

    def _find_quick_response(self, normalized_message: str) -> Optional[Dict]:
        """
        Cherche dans les réponses rapides (DefaultMessage)

        Args:
            normalized_message: Message normalisé

        Returns:
            Dict avec la réponse ou None
        """
        try:
            # Récupérer toutes les réponses rapides
            quick_responses = DefaultMessage.query.all()

            best_match = None
            best_score = 0

            for response in quick_responses:
                if not response.triggers:
                    continue

                # Récupérer les triggers
                triggers = [t.strip() for t in response.triggers.split(',') if t.strip()]

                # Calculer le score de matching
                score = self._calculate_trigger_score(normalized_message, triggers)

                if score > best_score:
                    best_score = score
                    best_match = {
                        'id': response.id,
                        'title': response.title,
                        'content': response.content,
                        'triggers': triggers,
                        'confidence': score
                    }

            # Retourner si le score est suffisant (> 0.5)
            if best_match and best_score > 0.5:
                return best_match

            return None

        except Exception as e:
            logger.error(f"Erreur _find_quick_response: {e}")
            return None

    def _calculate_trigger_score(self, message: str, triggers: List[str]) -> float:
        """
        Calcule le score de matching entre un message et une liste de triggers

        Args:
            message: Message normalisé
            triggers: Liste de mots-clés déclencheurs

        Returns:
            Score entre 0 et 1
        """
        if not triggers:
            return 0

        message_words = set(message.split())
        total_score = 0

        for trigger in triggers:
            trigger_normalized = normalize_text(trigger)
            trigger_words = set(trigger_normalized.split())

            # Correspondance exacte de phrase
            if trigger_normalized in message:
                total_score += 1.0
                continue

            # Correspondance de mots
            matching_words = message_words.intersection(trigger_words)
            if matching_words:
                # Score proportionnel au nombre de mots correspondants
                word_score = len(matching_words) / len(trigger_words)
                total_score += word_score * 0.7  # Pondération

        # Moyenne des scores
        return min(total_score / len(triggers), 1.0)

    def _find_template_response(self, normalized_message: str, user_id: int = None) -> Optional[Dict]:
        """
        Cherche dans les templates essentiels (BotResponses)

        Args:
            normalized_message: Message normalisé
            user_id: ID utilisateur

        Returns:
            Dict avec le template ou None
        """
        try:
            # Récupérer la configuration
            config = BotResponses.query.first()
            if not config:
                return None

            # Récupérer les templates essentiels
            templates = config.essential_templates
            if not templates or not isinstance(templates, dict):
                return None

            # Patterns de détection
            patterns = {
                'greeting': [
                    r'\b(bonjour|salut|hello|hi|hey|coucou)\b',
                    r'\b(bonsoir|bonne\s+journee)\b'
                ],
                'farewell': [
                    r'\b(au\s+revoir|bye|ciao|a\s+bientot|adieu)\b',
                    r'\b(bonne\s+soiree|bonne\s+nuit)\b'
                ],
                'thanks': [
                    r'\b(merci|thank|remercie)\b',
                    r'\b(merci\s+beaucoup|merci\s+bien)\b'
                ],
                'help': [
                    r'\b(aide|help|aider|assister)\b',
                    r'\b(comment|que\s+faire|comment\s+faire)\b'
                ]
            }

            # Chercher le meilleur matching
            best_match = None
            best_score = 0

            for template_type, pattern_list in patterns.items():
                if template_type not in templates:
                    continue

                for pattern in pattern_list:
                    if re.search(pattern, normalized_message):
                        score = 0.9  # Score élevé pour les patterns
                        if score > best_score:
                            best_score = score
                            best_match = {
                                'type': template_type,
                                'content': templates[template_type],
                                'confidence': score
                            }

            return best_match

        except Exception as e:
            logger.error(f"Erreur _find_template_response: {e}")
            return None

    def get_welcome_message(self, user_id: int = None) -> str:
        """
        Récupère le message de bienvenue configuré

        Args:
            user_id: ID utilisateur

        Returns:
            Message de bienvenue
        """
        try:
            settings = Settings.query.filter_by(user_id=user_id).first()
            if not settings:
                settings = Settings.query.filter_by(user_id=None).first()

            if settings and settings.bot_welcome:
                return settings.bot_welcome

            return "Bonjour ! Comment puis-je vous aider aujourd'hui ?"

        except Exception as e:
            logger.error(f"Erreur get_welcome_message: {e}")
            return "Bonjour !"

    def get_error_message(self, error_type: str = 'general', user_id: int = None) -> str:
        """
        Récupère un message d'erreur configuré

        Args:
            error_type: Type d'erreur (general, technical, timeout, rate_limit, etc.)
            user_id: ID utilisateur

        Returns:
            Message d'erreur
        """
        try:
            config = BotResponses.query.first()
            if not config:
                return "Désolé, une erreur s'est produite."

            # Mapper les types d'erreur aux attributs
            error_mapping = {
                'general': 'general_error',
                'technical': 'technical_error',
                'timeout': 'technical_error',
                'rate_limit': 'invalid_data',
                'unavailable': 'service_unavailable'
            }

            attr_name = error_mapping.get(error_type, 'general_error')
            error_msg = getattr(config, attr_name, None)

            if error_msg:
                return error_msg

            return "Désolé, une erreur s'est produite. Veuillez réessayer."

        except Exception as e:
            logger.error(f"Erreur get_error_message: {e}")
            return "Une erreur s'est produite."

    def get_behavior_config(self, user_id: int = None) -> Dict:
        """
        Récupère la configuration du comportement du bot

        Args:
            user_id: ID utilisateur

        Returns:
            Dict avec la configuration
        """
        try:
            config = BotResponses.query.first()
            if not config:
                return {}

            behavior = config.behavior_config
            if not behavior or not isinstance(behavior, dict):
                return {}

            return behavior

        except Exception as e:
            logger.error(f"Erreur get_behavior_config: {e}")
            return {}

    def has_configured_responses(self) -> bool:
        """
        Vérifie si des réponses ont été configurées

        Returns:
            True si des réponses existent
        """
        try:
            quick_count = DefaultMessage.query.count()
            bot_responses = BotResponses.query.first()

            has_quick = quick_count > 0
            has_templates = bot_responses and bot_responses.essential_templates

            return has_quick or has_templates

        except Exception as e:
            logger.error(f"Erreur has_configured_responses: {e}")
            return False


# Instance globale
response_manager = ResponseManager()
