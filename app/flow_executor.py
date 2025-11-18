"""
Flow Executor - Moteur d'Exécution de Flux de Conversation
Exécute les flux visuels créés dans l'éditeur de flux
"""

import logging
import re
from typing import Optional, Dict, List, Any
from .models import ConversationFlow, FlowNode, NodeConnection
from .bot_answers import normalize_text

logger = logging.getLogger(__name__)


class FlowExecutionContext:
    """Contexte d'exécution d'un flux"""

    def __init__(self, user_id: int, user_message: str):
        self.user_id = user_id
        self.user_message = user_message
        self.variables = {}
        self.current_node_id = None
        self.execution_path = []
        self.response_parts = []

    def set_variable(self, name: str, value: Any):
        """Définit une variable dans le contexte"""
        self.variables[name] = value

    def get_variable(self, name: str, default: Any = None) -> Any:
        """Récupère une variable du contexte"""
        return self.variables.get(name, default)

    def add_response(self, text: str):
        """Ajoute une partie de réponse"""
        self.response_parts.append(text)

    def get_full_response(self) -> str:
        """Récupère la réponse complète"""
        return '\n'.join(self.response_parts)


class FlowExecutor:
    """Moteur d'exécution des flux de conversation"""

    def __init__(self):
        self.active_flows_cache = {}
        self.cache_timestamp = 0
        self.cache_ttl = 300  # 5 minutes

    def find_matching_flow(self, user_message: str, user_id: int = None) -> Optional[int]:
        """
        Trouve un flux actif qui correspond au message utilisateur

        Args:
            user_message: Message de l'utilisateur
            user_id: ID utilisateur

        Returns:
            ID du flux trouvé ou None
        """
        try:
            # Récupérer les flux actifs
            active_flows = ConversationFlow.query.filter_by(is_active=True).all()

            if not active_flows:
                logger.info("Aucun flux actif trouvé")
                return None

            # Pour l'instant, on utilise le premier flux actif
            # TODO: Implémenter une logique de matching plus sophistiquée
            # basée sur les mots-clés, le contexte, etc.

            flow = active_flows[0]
            logger.info(f"🎯 Flux trouvé: '{flow.name}' (ID: {flow.id})")
            return flow.id

        except Exception as e:
            logger.error(f"Erreur find_matching_flow: {e}")
            return None

    def execute_flow(self, flow_id: int, user_message: str, user_id: int = None) -> Optional[Dict]:
        """
        Exécute un flux de conversation

        Args:
            flow_id: ID du flux à exécuter
            user_message: Message de l'utilisateur
            user_id: ID utilisateur

        Returns:
            Dict avec la réponse ou None
        """
        logger.info(f"🚀 Exécution du flux {flow_id} pour: '{user_message}'")

        try:
            # Charger le flux
            flow = ConversationFlow.query.get(flow_id)
            if not flow:
                logger.error(f"Flux {flow_id} introuvable")
                return None

            if not flow.is_active:
                logger.warning(f"Flux {flow_id} est inactif")
                return None

            # Créer le contexte d'exécution
            context = FlowExecutionContext(user_id, user_message)

            # Trouver le nœud de départ
            start_node = self._find_start_node(flow)
            if not start_node:
                logger.error(f"Aucun nœud de départ trouvé pour le flux {flow_id}")
                return None

            # Exécuter le flux à partir du nœud de départ
            result = self._execute_from_node(start_node, context, flow)

            if result:
                logger.info(f"✅ Flux exécuté avec succès: {len(context.execution_path)} nœuds")
                return {
                    'type': 'flow_response',
                    'source': 'ConversationFlow',
                    'flow_id': flow_id,
                    'flow_name': flow.name,
                    'content': context.get_full_response(),
                    'execution_path': context.execution_path,
                    'variables': context.variables
                }

            return None

        except Exception as e:
            logger.error(f"Erreur execute_flow: {e}", exc_info=True)
            return None

    def _find_start_node(self, flow: ConversationFlow) -> Optional[FlowNode]:
        """
        Trouve le nœud de départ du flux

        Args:
            flow: Flux de conversation

        Returns:
            Nœud de départ ou None
        """
        # Stratégies pour trouver le nœud de départ:
        # 1. Chercher un nœud qui n'a pas de connexion entrante
        # 2. Chercher le nœud avec position Y la plus petite
        # 3. Prendre le premier nœud de type 'message'

        nodes = flow.nodes
        if not nodes:
            return None

        # 1. Chercher un nœud sans connexion entrante
        node_ids_with_input = set()
        for node in nodes:
            for conn in node.connections:
                node_ids_with_input.add(conn.target_node_id)

        for node in nodes:
            if node.id not in node_ids_with_input:
                logger.info(f"Nœud de départ trouvé (sans input): {node.id} ({node.node_type})")
                return node

        # 2. Sinon, prendre le nœud avec la position Y la plus petite
        start_node = min(nodes, key=lambda n: n.position_y or 0)
        logger.info(f"Nœud de départ trouvé (position): {start_node.id} ({start_node.node_type})")
        return start_node

    def _execute_from_node(self, node: FlowNode, context: FlowExecutionContext, flow: ConversationFlow, depth: int = 0) -> bool:
        """
        Exécute le flux à partir d'un nœud

        Args:
            node: Nœud à exécuter
            context: Contexte d'exécution
            flow: Flux de conversation
            depth: Profondeur d'exécution (protection contre boucles infinies)

        Returns:
            True si exécution réussie, False sinon
        """
        # Protection contre les boucles infinies
        if depth > 50:
            logger.error("Profondeur d'exécution maximale atteinte (boucle infinie ?)")
            return False

        # Marquer le nœud comme visité
        context.execution_path.append({
            'node_id': node.id,
            'node_type': node.node_type
        })

        logger.info(f"  → Exécution nœud {node.id} ({node.node_type})")

        # Exécuter le nœud selon son type
        try:
            if node.node_type == 'message':
                self._execute_message_node(node, context)
            elif node.node_type == 'condition':
                return self._execute_condition_node(node, context, flow, depth)
            elif node.node_type == 'input':
                self._execute_input_node(node, context)
            elif node.node_type == 'action':
                self._execute_action_node(node, context)
            elif node.node_type == 'api':
                self._execute_api_node(node, context)
            else:
                logger.warning(f"Type de nœud inconnu: {node.node_type}")

        except Exception as e:
            logger.error(f"Erreur lors de l'exécution du nœud {node.id}: {e}")
            return False

        # Trouver le prochain nœud
        next_node = self._find_next_node(node, context)
        if next_node:
            return self._execute_from_node(next_node, context, flow, depth + 1)

        # Fin du flux
        return True

    def _execute_message_node(self, node: FlowNode, context: FlowExecutionContext):
        """Exécute un nœud de type message"""
        config = node.config
        message = config.get('message', '')

        if message:
            # Remplacer les variables dans le message
            message = self._replace_variables(message, context)
            context.add_response(message)
            logger.info(f"    Message ajouté: '{message[:50]}...'")

    def _execute_condition_node(self, node: FlowNode, context: FlowExecutionContext, flow: ConversationFlow, depth: int) -> bool:
        """Exécute un nœud de type condition"""
        config = node.config
        operator = config.get('operator', 'equals')
        value = config.get('value', '')

        # Évaluer la condition
        condition_result = self._evaluate_condition(context.user_message, operator, value)

        logger.info(f"    Condition: {operator} '{value}' → {condition_result}")

        # Trouver les connexions sortantes
        connections = NodeConnection.query.filter_by(source_node_id=node.id).all()

        if not connections:
            logger.warning(f"Nœud condition {node.id} sans connexions sortantes")
            return True

        # Pour l'instant, prendre la première connexion si condition vraie
        # TODO: Implémenter une logique plus sophistiquée avec conditions sur les connexions
        if condition_result and connections:
            next_node = FlowNode.query.get(connections[0].target_node_id)
            if next_node:
                return self._execute_from_node(next_node, context, flow, depth + 1)

        return True

    def _execute_input_node(self, node: FlowNode, context: FlowExecutionContext):
        """Exécute un nœud de type input"""
        config = node.config
        variable_name = config.get('variable', 'user_input')

        # Stocker le message utilisateur dans une variable
        context.set_variable(variable_name, context.user_message)
        logger.info(f"    Variable '{variable_name}' = '{context.user_message}'")

    def _execute_action_node(self, node: FlowNode, context: FlowExecutionContext):
        """Exécute un nœud de type action"""
        config = node.config
        action_type = config.get('action_type', '')

        logger.info(f"    Action: {action_type}")
        # TODO: Implémenter les actions (envoyer email, créer ticket, etc.)

    def _execute_api_node(self, node: FlowNode, context: FlowExecutionContext):
        """Exécute un nœud de type API"""
        config = node.config
        endpoint = config.get('endpoint', '')
        method = config.get('method', 'GET')

        logger.info(f"    API: {method} {endpoint}")
        # TODO: Implémenter les appels API

    def _evaluate_condition(self, text: str, operator: str, value: str) -> bool:
        """
        Évalue une condition

        Args:
            text: Texte à évaluer
            operator: Opérateur (equals, contains, regex)
            value: Valeur de comparaison

        Returns:
            True si condition vraie, False sinon
        """
        text_normalized = normalize_text(text)
        value_normalized = normalize_text(value)

        if operator == 'equals':
            return text_normalized == value_normalized
        elif operator == 'contains':
            return value_normalized in text_normalized
        elif operator == 'regex':
            try:
                return bool(re.search(value, text, re.IGNORECASE))
            except re.error:
                logger.error(f"Regex invalide: {value}")
                return False
        else:
            logger.warning(f"Opérateur inconnu: {operator}")
            return False

    def _find_next_node(self, current_node: FlowNode, context: FlowExecutionContext) -> Optional[FlowNode]:
        """
        Trouve le prochain nœud à exécuter

        Args:
            current_node: Nœud actuel
            context: Contexte d'exécution

        Returns:
            Prochain nœud ou None
        """
        # Récupérer les connexions sortantes
        connections = NodeConnection.query.filter_by(source_node_id=current_node.id).order_by(NodeConnection.priority).all()

        if not connections:
            return None

        # Prendre la première connexion (tri par priorité)
        next_connection = connections[0]
        next_node = FlowNode.query.get(next_connection.target_node_id)

        return next_node

    def _replace_variables(self, text: str, context: FlowExecutionContext) -> str:
        """
        Remplace les variables dans un texte

        Args:
            text: Texte avec variables au format {variable_name}
            context: Contexte d'exécution

        Returns:
            Texte avec variables remplacées
        """
        # Trouver toutes les variables {variable_name}
        pattern = r'\{(\w+)\}'

        def replace_var(match):
            var_name = match.group(1)
            var_value = context.get_variable(var_name, match.group(0))
            return str(var_value)

        return re.sub(pattern, replace_var, text)

    def has_active_flows(self) -> bool:
        """
        Vérifie s'il existe des flux actifs

        Returns:
            True si des flux actifs existent
        """
        try:
            count = ConversationFlow.query.filter_by(is_active=True).count()
            return count > 0
        except Exception as e:
            logger.error(f"Erreur has_active_flows: {e}")
            return False


# Instance globale
flow_executor = FlowExecutor()
