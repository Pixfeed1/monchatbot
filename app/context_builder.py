import logging
import json
import re
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime

from flask_login import current_user

from .models import (
    Settings, BotResponses, DefaultMessage, FAQ, 
    ResponseRule, BotCompetences, Document
)
from .fast_responses_cache import get_fast_response, process_variables
from .knowledge_integrator import KnowledgeIntegrator

logger = logging.getLogger(__name__)

class ContextBuilder:
    """
    Classe responsable de construire un contexte riche pour l'IA
    en rassemblant toutes les données configurées.
    Version optimisée qui s'adapte automatiquement à la complexité
    et FORCE l'utilisation des paramètres utilisateur.
    VERSION MISE À JOUR AVEC CORRECTION FORCÉE POUR GPT/MISTRAL.
    """
    
    def __init__(self, app=None):
        self.app = app
        self._cache = {}
        self._cache_ttl = 300  # 5 minutes
        self.knowledge_integrator = KnowledgeIntegrator()
        
        # Messages très simples qui ne nécessitent qu'un contexte minimal
        self.simple_patterns = {
            'greetings': ['salut', 'bonjour', 'hello', 'hi', 'coucou', 'bonsoir'],
            'thanks': ['merci', 'thanks', 'thx'],
            'goodbye': ['au revoir', 'bye', 'à bientôt', 'goodbye'],
            'yes_no': ['oui', 'non', 'yes', 'no', 'ok', 'd\'accord']
        }
        
    def build_system_prompt(self, user_message: str, session_context: Dict = None) -> Tuple[Dict[str, str], Dict]:
        """
        Construit un prompt système adaptatif selon la complexité du message.
        FORCE l'utilisation des paramètres utilisateur configurés.

        Returns:
            Tuple[Dict, Dict]: ({'system': str, 'user': str}, metadata)
        """
        logger.info(f"Construction du contexte pour: {user_message[:50]}...")

        # 1. Analyse préliminaire du message
        message_type = self._analyze_message_type(user_message)

        # 2. Si c'est un message très simple, utiliser un contexte minimal
        if message_type['is_simple']:
            return self._build_simple_prompt(user_message, message_type)

        # 3. Pour les messages complexes, construire le contexte enrichi
        return self._build_enriched_prompt(user_message, session_context)
    
    def _analyze_message_type(self, message: str) -> Dict:
        """
        Analyse le type et la complexité d'un message.
        """
        message_lower = message.lower().strip()
        message_words = message_lower.split()
        
        analysis = {
            'is_simple': False,
            'category': 'complex',
            'needs_knowledge': True,
            'needs_vocabulary': True,
            'needs_examples': True,
            'estimated_complexity': 2
        }
        
        # Vérifier si c'est un message très simple
        for category, patterns in self.simple_patterns.items():
            if any(pattern in message_lower for pattern in patterns):
                if len(message_words) <= 3:  # Messages de 1-3 mots max
                    analysis.update({
                        'is_simple': True,
                        'category': category,
                        'needs_knowledge': False,
                        'needs_vocabulary': False,
                        'needs_examples': False,
                        'estimated_complexity': 0
                    })
                    return analysis
        
        # Analyser la complexité pour les autres messages
        complexity_score = 0
        
        # Longueur du message
        complexity_score += min(len(message_words) / 20, 1.0)
        
        # Mots interrogatifs complexes
        complex_words = ['pourquoi', 'comment', 'expliquer', 'analyser', 'comparer', 'évaluer']
        complexity_score += sum(0.5 for word in complex_words if word in message_lower)
        
        # Questions multiples
        complexity_score += message.count('?') * 0.3
        
        # Déterminer les besoins selon la complexité
        if complexity_score < 0.5:
            analysis.update({
                'estimated_complexity': 0,
                'needs_examples': False,
                'needs_vocabulary': len(message_words) > 5
            })
        elif complexity_score < 1.0:
            analysis.update({
                'estimated_complexity': 1,
                'needs_examples': True,
                'needs_vocabulary': True
            })
        elif complexity_score < 2.0:
            analysis.update({
                'estimated_complexity': 2,
                'needs_knowledge': True,
                'needs_vocabulary': True,
                'needs_examples': True
            })
        else:
            analysis.update({
                'estimated_complexity': 3,
                'needs_knowledge': True,
                'needs_vocabulary': True,
                'needs_examples': True
            })
        
        return analysis
    
    def _build_simple_prompt(self, user_message: str, message_type: Dict) -> Tuple[Dict[str, str], Dict]:
        """
        Construit un prompt minimal pour les messages simples.
        FORCE l'utilisation des paramètres configurés.
        Retourne séparément system et user pour les APIs.
        """
        bot_info = self._get_bot_info()

        # System prompt avec identité FORCÉE
        base_identity = f"Tu es {bot_info['name']}. {bot_info['description']} Tu n'es PAS une assistante virtuelle générique."

        if message_type['category'] == 'greetings':
            system_prompt = f"{base_identity} Réponds amicalement à cette salutation en restant dans ton rôle."
        elif message_type['category'] == 'thanks':
            system_prompt = f"{base_identity} L'utilisateur te remercie, réponds poliment."
        elif message_type['category'] == 'goodbye':
            system_prompt = f"{base_identity} L'utilisateur dit au revoir, réponds courtoisement."
        else:
            system_prompt = base_identity

        prompts = {
            'system': system_prompt,
            'user': user_message
        }

        metadata = {
            'complexity': 0,
            'has_examples': False,
            'has_faqs': False,
            'has_knowledge': False,
            'is_personal': False,
            'knowledge_score': 0,
            'estimated_tokens': len(system_prompt.split()) * 1.3 + len(user_message.split()) * 1.3
        }

        logger.info(f"Prompt simplifié généré ({metadata['estimated_tokens']:.1f} tokens)")
        return prompts, metadata
    
    def _build_enriched_prompt(self, user_message: str, session_context: Dict = None) -> Tuple[Dict[str, str], Dict]:
        """
        Construit un prompt enrichi pour les messages complexes.
        FORCE l'utilisation des paramètres configurés.
        Retourne séparément system et user pour les APIs.
        """
        # Récupérer les infos de base
        bot_info = self._get_bot_info()
        response_config = self._get_response_config()

        # Analyser si c'est une question personnelle
        try:
            from .bot_answers import check_personal_questions
            personal_question_context = check_personal_questions(user_message)
        except ImportError:
            personal_question_context = None

        # Recherche intelligente selon le besoin
        message_analysis = self._analyze_message_type(user_message)

        relevant_examples = []
        relevant_faqs = []
        knowledge_results = {'has_knowledge': False, 'relevance_score': 0}
        vocabulary_rules = {}

        # Charger les données selon les besoins
        if message_analysis['needs_examples']:
            relevant_examples = self._find_relevant_examples(user_message, max_examples=2)

        if message_analysis['needs_knowledge']:
            knowledge_results = self.knowledge_integrator.search_knowledge(user_message, max_results=3)
            relevant_faqs = self._search_faqs(user_message, max_results=2)

        if message_analysis['needs_vocabulary']:
            vocabulary_rules = self._get_vocabulary_rules()

        # Estimer la complexité finale
        complexity = self._estimate_complexity(
            user_message,
            has_knowledge=knowledge_results.get('has_knowledge', False),
            is_personal=personal_question_context is not None
        )

        # Construire le system prompt adaptatif avec IDENTITÉ FORCÉE
        system_prompt = self._assemble_adaptive_prompt(
            bot_info=bot_info,
            response_config=response_config,
            examples=relevant_examples,
            faqs=relevant_faqs,
            vocabulary=vocabulary_rules,
            knowledge=knowledge_results,
            personal_context=personal_question_context,
            complexity=complexity
        )

        prompts = {
            'system': system_prompt,
            'user': user_message
        }

        metadata = {
            'complexity': complexity,
            'has_examples': len(relevant_examples) > 0,
            'has_faqs': len(relevant_faqs) > 0,
            'has_knowledge': knowledge_results.get('has_knowledge', False),
            'is_personal': personal_question_context is not None,
            'knowledge_score': knowledge_results.get('relevance_score', 0),
            'estimated_tokens': len(system_prompt.split()) * 1.3 + len(user_message.split()) * 1.3
        }

        logger.info(f"Prompt enrichi généré ({metadata['estimated_tokens']:.1f} tokens) - Complexité: {complexity}")
        return prompts, metadata
    
    def _get_bot_info(self) -> Dict[str, str]:
        """
        Récupère les informations de base du bot depuis les PARAMÈTRES GÉNÉRAUX.
        PRIORITÉ ABSOLUE aux paramètres configurés par l'utilisateur.
        """
        # CORRECTION : Utiliser les Settings généraux pour nom/description/avatar
        # Ces paramètres sont configurés dans "Paramètres Généraux", pas par utilisateur
        general_settings = Settings.query.filter_by(user_id=None).first()
        
        if not general_settings:
            # Fallback vers le premier Settings trouvé
            general_settings = Settings.query.first()
        
        if general_settings:
            logger.info(f"🎯 PARAMÈTRES CHARGÉS: Nom='{general_settings.bot_name}', Description='{general_settings.bot_description}'")
            return {
                'name': general_settings.bot_name or 'Assistant',
                'description': general_settings.bot_description or 'Je suis votre assistant virtuel.',
                'welcome': general_settings.bot_welcome or 'Bonjour! Comment puis-je vous aider?',
                'avatar': general_settings.bot_avatar
            }
        else:
            logger.warning("AUCUN PARAMÈTRE TROUVÉ - Utilisation des valeurs par défaut")
            return {
                'name': 'Assistant',
                'description': 'Je suis votre assistant virtuel.',
                'welcome': 'Bonjour! Comment puis-je vous aider?'
            }
    
    def _get_response_config(self) -> Dict[str, Any]:
        """Récupère la configuration des réponses (style, ton, traits)."""
        config = BotResponses.query.first()
        if not config:
            return {
                'style': 'professional',
                'level': 'standard',
                'traits': [],
                'vocabulary': {}
            }
        
        return {
            'style': config.communication_style,
            'level': config.language_level,
            'traits': config.personality_traits,
            'vocabulary': config.vocabulary or {}
        }
    
    def _find_relevant_examples(self, user_message: str, max_examples: int = 2) -> List[Dict]:
        """Trouve les réponses rapides pertinentes pour servir d'exemples."""
        examples = []
        user_message_lower = user_message.lower().strip()
        
        default_messages = DefaultMessage.query.all()
        
        for message in default_messages:
            if not message.triggers:
                continue
                
            triggers = [t.strip().lower() for t in message.triggers.split(',')]
            relevance_score = 0
            
            for trigger in triggers:
                if trigger in user_message_lower:
                    relevance_score += 2
                elif any(word in user_message_lower for word in trigger.split()):
                    relevance_score += 1
            
            if relevance_score > 0:
                examples.append({
                    'trigger': triggers[0],
                    'response': message.content[:100] + '...' if len(message.content) > 100 else message.content,
                    'score': relevance_score
                })
        
        examples.sort(key=lambda x: x['score'], reverse=True)
        return examples[:max_examples]
    
    def _search_faqs(self, user_message: str, max_results: int = 2) -> List[Dict]:
        """Recherche dans la FAQ les questions pertinentes."""
        faqs = []
        user_words = set(user_message.lower().split())
        
        all_faqs = FAQ.query.all()
        
        for faq in all_faqs:
            question_words = set(faq.question.lower().split())
            common_words = user_words.intersection(question_words)
            
            if len(common_words) > 0:
                score = len(common_words) / len(question_words)
                faqs.append({
                    'question': faq.question,
                    'answer': faq.answer[:150] + '...' if len(faq.answer) > 150 else faq.answer,
                    'score': score
                })
        
        faqs.sort(key=lambda x: x['score'], reverse=True)
        return faqs[:max_results]
    
    def _get_vocabulary_rules(self) -> Dict[str, str]:
        """Récupère les règles de vocabulaire métier importantes uniquement."""
        config = BotResponses.query.first()
        if not config or not config.vocabulary:
            return {}
        
        # Limiter à 5 termes les plus importants pour éviter la surcharge
        vocab = config.vocabulary
        if len(vocab) > 5:
            # Garder les 5 premiers (ou implémenter une logique de priorité)
            vocab = dict(list(vocab.items())[:5])
        
        return vocab
    
    def _estimate_complexity(self, message: str, has_knowledge: bool = False, 
                            is_personal: bool = False) -> int:
        """Estime la complexité d'un message (0-3) avec facteurs enrichis."""
        if is_personal:
            return 0
        
        length_score = min(len(message) / 100, 1.0)
        
        complex_words = ['pourquoi', 'comment', 'expliquer', 'analyser', 'comparer', 'évaluer']
        complex_score = sum(0.3 for word in complex_words if word in message.lower())
        
        question_score = message.count('?') * 0.3
        knowledge_bonus = -0.3 if has_knowledge else 0
        
        total = length_score + complex_score + question_score + knowledge_bonus
        
        if total < 0.5:
            return 0
        elif total < 1.0:
            return 1
        elif total < 2.0:
            return 2
        else:
            return 3
    
    def _assemble_adaptive_prompt(self, **kwargs) -> str:
        """
        VERSION ULTRA-RENFORCÉE qui FORCE l'identité même pour GPT/Mistral récalcitrants.
        Retourne SEULEMENT le system prompt, sans le message utilisateur.
        """
        sections = []

        bot_info = kwargs.get('bot_info', {})
        response_config = kwargs.get('response_config', {})
        examples = kwargs.get('examples', [])
        faqs = kwargs.get('faqs', [])
        vocabulary = kwargs.get('vocabulary', {})
        knowledge = kwargs.get('knowledge', {})
        personal_context = kwargs.get('personal_context')
        complexity = kwargs.get('complexity', 1)
        
        # 1. IDENTITÉ ULTRA-FORCÉE AVEC RÉPÉTITION ET EXEMPLES
        identity_section = f"""IDENTITÉ ABSOLUE - RESPECTER OBLIGATOIREMENT:
- Nom: {bot_info['name']}
- Rôle: {bot_info['description']}

INTERDICTIONS STRICTES:
- ❌ JAMAIS dire "Je suis une assistante virtuelle"
- ❌ JAMAIS dire "Je suis un assistant virtuel"
- ❌ JAMAIS dire "Je suis Claude" ou "Je suis ChatGPT"
- ❌ JAMAIS utiliser des phrases génériques d'IA

EXEMPLE DE BONNE RÉPONSE:
Utilisateur: "Qui es-tu ?"
Réponse correcte: "Je suis {bot_info['name']}. {bot_info['description']}"

EXEMPLE DE MAUVAISE RÉPONSE (À ÉVITER):
❌ "Je suis une assistante virtuelle conçue pour..."

TON IDENTITÉ EST {bot_info['name']} - PAS UNE "ASSISTANTE VIRTUELLE" !"""
        
        sections.append(identity_section)
        
        # 2. RENFORCEMENT SPÉCIAL POUR QUESTIONS PERSONNELLES
        if personal_context:
            if personal_context.get('confidence', 0) > 0.8:
                if personal_context.get('direct_response'):
                    # RÉPONSE DIRECTE ULTRA-FORCÉE
                    sections.append(f"""RÉPONSE OBLIGATOIRE EXACTE:
"{personal_context['direct_response']}"

INSTRUCTIONS:
- Donne EXACTEMENT cette réponse
- N'ajoute RIEN d'autre
- Pas d'explication supplémentaire
- Pas de phrase générique d'IA""")

                    # Return system prompt only (no user message)
                    return "\n\n".join(sections)
        
        # 3. CONTEXTE RENFORCÉ SELON COMPLEXITÉ
        if complexity >= 1:
            style = response_config.get('style', 'professional')
            level = response_config.get('level', 'standard')
            
            style_section = f"""STYLE DE COMMUNICATION:
- Style: {style}
- Niveau: {level}
- Toujours en tant que {bot_info['name']}
- Jamais en tant qu'IA générique"""
            
            sections.append(style_section)
        
        # 4. VOCABULAIRE MÉTIER (limité mais renforcé)
        if vocabulary and complexity >= 1:
            vocab_items = list(vocabulary.items())[:3]
            if vocab_items:
                vocab_section = f"""VOCABULAIRE SPÉCIALISÉ:
{'; '.join([f"'{k}' signifie '{v}'" for k, v in vocab_items])}
Utilise ce vocabulaire en tant que {bot_info['name']}."""
                sections.append(vocab_section)
        
        # 5. CONNAISSANCES (condensées)
        if knowledge.get('has_knowledge') and complexity >= 2:
            knowledge_section = "INFORMATIONS PERTINENTES:"
            
            if knowledge.get('faqs'):
                for faq in knowledge['faqs'][:1]:
                    knowledge_section += f"\nQ: {faq['question']}\nR: {faq['answer'][:100]}..."
            
            sections.append(knowledge_section)
        
        # 6. EXEMPLES DE STYLE (très limités)
        if examples and complexity >= 2:
            example = examples[0]
            example_section = f"""EXEMPLE DE TON STYLE:
Trigger: "{example['trigger']}"
Ta réponse en tant que {bot_info['name']}: "{example['response'][:80]}...\""""
            sections.append(example_section)
        
        # 7. INSTRUCTIONS FINALES ULTRA-RENFORCÉES
        final_instructions = f"""RAPPELS CRITIQUES:
1. Tu es {bot_info['name']} - PAS une IA générique
2. Utilise ton identité configurée ci-dessus
3. INTERDICTION de dire "assistante virtuelle"
4. Réponds directement en tant que {bot_info['name']}"""
        
        if complexity <= 1:
            final_instructions += "\n5. Sois concis"
        
        sections.append(final_instructions)
        
        # 8. FORMAT FINAL AVEC EXEMPLE
        sections.append(f"""EXEMPLE D'APPLICATION:
Si l'utilisateur demande qui tu es, réponds:
"Je suis {bot_info['name']}. {bot_info['description']}"

Maintenant, réponds à l'utilisateur en respectant ton identité.""")

        # Return system prompt only (user message handled separately by API calls)
        return "\n\n".join(sections)
    
    def post_process_response(self, response: str, bot_info: Dict[str, str]) -> str:
        """
        Post-traite la réponse pour forcer l'identité si l'IA a désobéi.
        """
        # Phrases génériques à remplacer
        generic_phrases = [
            "Je suis une assistante virtuelle",
            "Je suis un assistant virtuel", 
            "Je suis une IA",
            "Je suis Claude",
            "Je suis ChatGPT",
            "Je suis un modèle de langage",
            "assistante virtuelle conçue pour",
            "assistant virtuel conçu pour",
            "assistante virtuelle spécialisée",
            "assistant virtuel spécialisé"
        ]
        
        response_lower = response.lower()
        corrected_response = response
        
        # Vérifier si la réponse contient des phrases génériques
        for phrase in generic_phrases:
            if phrase.lower() in response_lower:
                logger.warning(f"⚠️ Réponse générique détectée: '{phrase}' - Correction forcée")
                
                # Remplacer par l'identité correcte
                correct_identity = f"Je suis {bot_info['name']}. {bot_info['description']}"
                
                # Remplacer la phrase problématique
                corrected_response = re.sub(
                    re.escape(phrase), 
                    correct_identity, 
                    corrected_response, 
                    flags=re.IGNORECASE
                )
                break
        
        return corrected_response