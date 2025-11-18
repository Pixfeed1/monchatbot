"""
Decision Engine - Moteur de Décision Intelligent
Orchestre l'utilisation des Flux, Réponses Configurées et API IA
"""

import logging
from typing import Optional, Dict, Any
from .response_manager import response_manager
from .flow_executor import flow_executor
from .knowledge_integrator import KnowledgeIntegrator

logger = logging.getLogger(__name__)

# Instance globale de KnowledgeIntegrator
knowledge_integrator = KnowledgeIntegrator()


class DecisionEngine:
    """
    Moteur de décision qui choisit la meilleure source de réponse
    Ordre de priorité:
    1. Flux de conversation actif
    2. Réponse configurée (templates + réponses rapides)
    3. API IA (Claude/OpenAI)
    """

    def __init__(self):
        self.response_manager = response_manager
        self.flow_executor = flow_executor
        self.stats = {
            'total_requests': 0,
            'flow_responses': 0,
            'configured_responses': 0,
            'api_responses': 0
        }

    async def get_response(
        self,
        user_message: str,
        user_id: int = None,
        context: Dict = None,
        api_manager = None
    ) -> Dict[str, Any]:
        """
        Récupère la meilleure réponse pour un message utilisateur

        Args:
            user_message: Message de l'utilisateur
            user_id: ID de l'utilisateur
            context: Contexte de la conversation
            api_manager: Gestionnaire d'API IA

        Returns:
            Dict contenant la réponse et les métadonnées
        """
        self.stats['total_requests'] += 1

        logger.info(f"🤖 Decision Engine - Message: '{user_message}'")
        logger.info(f"📊 Stats: {self.stats}")

        try:
            # ÉTAPE 1: Vérifier les flux de conversation actifs
            flow_response = await self._try_flow_response(user_message, user_id)
            if flow_response:
                self.stats['flow_responses'] += 1
                logger.info("✅ Réponse via FLUX DE CONVERSATION")
                return {
                    'response': flow_response['content'],
                    'source': 'flow',
                    'metadata': flow_response,
                    'success': True
                }

            # ÉTAPE 2: Vérifier les réponses configurées
            configured_response = self._try_configured_response(user_message, user_id)
            if configured_response:
                self.stats['configured_responses'] += 1
                logger.info("✅ Réponse via CONFIGURATION")
                return {
                    'response': configured_response['content'],
                    'source': 'configured',
                    'metadata': configured_response,
                    'success': True
                }

            # ÉTAPE 3: Utiliser l'API IA en dernier recours
            if api_manager:
                api_response = await self._try_api_response(
                    user_message,
                    user_id,
                    context,
                    api_manager
                )
                if api_response:
                    self.stats['api_responses'] += 1
                    logger.info("✅ Réponse via API IA")
                    return {
                        'response': api_response['response'],
                        'source': 'api',
                        'metadata': api_response,
                        'success': True
                    }

            # Aucune réponse trouvée
            logger.warning("❌ Aucune source de réponse disponible")
            return {
                'response': self._get_fallback_response(),
                'source': 'fallback',
                'metadata': {},
                'success': False
            }

        except Exception as e:
            logger.error(f"Erreur Decision Engine: {e}", exc_info=True)
            return {
                'response': "Désolé, une erreur s'est produite. Veuillez réessayer.",
                'source': 'error',
                'metadata': {'error': str(e)},
                'success': False
            }

    async def _try_flow_response(self, user_message: str, user_id: int = None) -> Optional[Dict]:
        """
        Tente d'obtenir une réponse via un flux de conversation

        Args:
            user_message: Message utilisateur
            user_id: ID utilisateur

        Returns:
            Dict avec la réponse ou None
        """
        try:
            # Vérifier s'il existe des flux actifs
            if not self.flow_executor.has_active_flows():
                logger.debug("Aucun flux actif disponible")
                return None

            # Trouver un flux correspondant
            flow_id = self.flow_executor.find_matching_flow(user_message, user_id)
            if not flow_id:
                logger.debug("Aucun flux correspondant trouvé")
                return None

            # Exécuter le flux
            result = self.flow_executor.execute_flow(flow_id, user_message, user_id)
            if result and result.get('content'):
                return result

            return None

        except Exception as e:
            logger.error(f"Erreur _try_flow_response: {e}")
            return None

    def _try_configured_response(self, user_message: str, user_id: int = None) -> Optional[Dict]:
        """
        Tente d'obtenir une réponse configurée

        Args:
            user_message: Message utilisateur
            user_id: ID utilisateur

        Returns:
            Dict avec la réponse ou None
        """
        try:
            # Vérifier s'il existe des réponses configurées
            if not self.response_manager.has_configured_responses():
                logger.debug("Aucune réponse configurée disponible")
                return None

            # Chercher une réponse correspondante
            result = self.response_manager.find_matching_response(user_message, user_id)
            if result and result.get('content'):
                return result

            return None

        except Exception as e:
            logger.error(f"Erreur _try_configured_response: {e}")
            return None

    async def _try_api_response(
        self,
        user_message: str,
        user_id: int,
        context: Dict,
        api_manager
    ) -> Optional[Dict]:
        """
        Tente d'obtenir une réponse via l'API IA
        Enrichit le contexte avec les connaissances pertinentes

        Args:
            user_message: Message utilisateur
            user_id: ID utilisateur
            context: Contexte de conversation
            api_manager: Gestionnaire d'API

        Returns:
            Dict avec la réponse ou None
        """
        try:
            if not api_manager or not api_manager.is_ready:
                logger.warning("API Manager non disponible")
                return None

            # NOUVEAU: Enrichir le contexte avec la base de connaissances
            knowledge_results = knowledge_integrator.search_knowledge(user_message, max_results=3)

            # Ajouter les connaissances au contexte si pertinentes
            if knowledge_results.get('has_knowledge'):
                if context is None:
                    context = {}

                context['knowledge'] = {
                    'faqs': knowledge_results['faqs'],
                    'documents': knowledge_results['documents'],
                    'rules': knowledge_results['rules'],
                    'relevance_score': knowledge_results['relevance_score']
                }

                logger.info(f"✨ Connaissances enrichies: score {knowledge_results['relevance_score']}")

            # Récupérer la configuration du comportement
            behavior_config = self.response_manager.get_behavior_config(user_id)

            # Appeler l'API avec le contexte enrichi
            # NOTE: Cette méthode dépend de l'implémentation exacte de l'api_manager
            # Je suppose qu'elle a une méthode pour générer une réponse
            response = await api_manager.generate_response(
                user_message=user_message,
                user_id=user_id,
                context=context,
                config=behavior_config
            )

            if response:
                return {
                    'response': response,
                    'provider': getattr(api_manager, 'current_provider', 'unknown'),
                    'knowledge_used': knowledge_results.get('has_knowledge', False)
                }

            return None

        except Exception as e:
            logger.error(f"Erreur _try_api_response: {e}")
            return None

    def _get_fallback_response(self) -> str:
        """
        Récupère une réponse de secours

        Returns:
            Message de secours
        """
        # Essayer de récupérer un message d'erreur configuré
        try:
            error_msg = self.response_manager.get_error_message('general')
            if error_msg:
                return error_msg
        except Exception:
            pass

        return "Désolé, je n'ai pas compris votre message. Pouvez-vous reformuler ?"

    def get_statistics(self) -> Dict[str, Any]:
        """
        Récupère les statistiques d'utilisation

        Returns:
            Dict avec les statistiques
        """
        total = self.stats['total_requests']
        if total == 0:
            return {
                'total_requests': 0,
                'sources': {
                    'flow': {'count': 0, 'percentage': 0},
                    'configured': {'count': 0, 'percentage': 0},
                    'api': {'count': 0, 'percentage': 0}
                }
            }

        return {
            'total_requests': total,
            'sources': {
                'flow': {
                    'count': self.stats['flow_responses'],
                    'percentage': round((self.stats['flow_responses'] / total) * 100, 2)
                },
                'configured': {
                    'count': self.stats['configured_responses'],
                    'percentage': round((self.stats['configured_responses'] / total) * 100, 2)
                },
                'api': {
                    'count': self.stats['api_responses'],
                    'percentage': round((self.stats['api_responses'] / total) * 100, 2)
                }
            }
        }

    def reset_statistics(self):
        """Réinitialise les statistiques"""
        self.stats = {
            'total_requests': 0,
            'flow_responses': 0,
            'configured_responses': 0,
            'api_responses': 0
        }
        logger.info("Statistiques réinitialisées")

    def is_ready(self) -> bool:
        """
        Vérifie si le moteur de décision est prêt

        Returns:
            True si au moins une source de réponse est disponible
        """
        has_flows = self.flow_executor.has_active_flows()
        has_responses = self.response_manager.has_configured_responses()

        return has_flows or has_responses


# Instance globale
decision_engine = DecisionEngine()
