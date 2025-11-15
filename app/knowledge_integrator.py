"""
Module d'intégration de la base de connaissances.
Permet de rechercher et scorer les informations pertinentes.
"""
import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import or_, and_
import re
from collections import Counter

from .models import FAQ, Document, ResponseRule, KnowledgeCategory

logger = logging.getLogger(__name__)

class KnowledgeIntegrator:
    """
    Intègre les différentes sources de connaissances
    pour enrichir le contexte de l'IA.
    """
    
    def __init__(self):
        self.stop_words = {
            'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du',
            'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car',
            'à', 'dans', 'pour', 'sur', 'avec', 'sans'
        }
    
    def search_knowledge(self, query: str, max_results: int = 5) -> Dict[str, List[Dict]]:
        """
        Recherche dans toute la base de connaissances.
        
        Returns:
            Dict contenant les FAQs, règles et documents pertinents
        """
        results = {
            'faqs': self._search_faqs(query, max_results),
            'rules': self._search_rules(query, max_results),
            'documents': self._search_documents(query, max_results)
        }
        
        # Calculer un score de pertinence global
        total_score = sum(
            sum(item.get('score', 0) for item in items)
            for items in results.values()
        )
        
        results['relevance_score'] = total_score
        results['has_knowledge'] = total_score > 0
        
        return results
    
    def _search_faqs(self, query: str, limit: int) -> List[Dict]:
        """Recherche dans les FAQ."""
        try:
            query_words = self._extract_keywords(query)
            faqs = FAQ.query.all()
            scored_faqs = []
            
            for faq in faqs:
                score = self._calculate_relevance(
                    query_words,
                    faq.question + " " + faq.answer,
                    faq.keyword_list
                )
                
                if score > 0:
                    scored_faqs.append({
                        'id': faq.id,
                        'question': faq.question,
                        'answer': faq.answer,
                        'category': faq.category.name if faq.category else None,
                        'score': score,
                        'keywords': faq.keyword_list
                    })
            
            # Trier par score et limiter
            scored_faqs.sort(key=lambda x: x['score'], reverse=True)
            return scored_faqs[:limit]
            
        except Exception as e:
            logger.error(f"Erreur recherche FAQ: {str(e)}")
            return []
    
    def _search_rules(self, query: str, limit: int) -> List[Dict]:
        """Recherche dans les règles de réponse."""
        try:
            rules = ResponseRule.query.filter_by(is_active=True).all()
            applicable_rules = []
            
            for rule in rules:
                if self._check_rule_conditions(query, rule.condition_rules):
                    applicable_rules.append({
                        'id': rule.id,
                        'name': rule.name,
                        'template': rule.response_template,
                        'priority': rule.priority,
                        'category': rule.category.name if rule.category else None
                    })
            
            # Trier par priorité
            applicable_rules.sort(key=lambda x: x['priority'], reverse=True)
            return applicable_rules[:limit]
            
        except Exception as e:
            logger.error(f"Erreur recherche règles: {str(e)}")
            return []
    
    def _search_documents(self, query: str, limit: int) -> List[Dict]:
        """Recherche dans les documents."""
        try:
            query_words = self._extract_keywords(query)
            documents = Document.query.all()
            scored_docs = []
            
            for doc in documents:
                if doc.content:
                    score = self._calculate_relevance(
                        query_words,
                        doc.title + " " + (doc.content or ""),
                        []
                    )
                    
                    if score > 0:
                        scored_docs.append({
                            'id': doc.id,
                            'title': doc.title,
                            'excerpt': self._extract_excerpt(doc.content, query_words),
                            'category': doc.category.name if doc.category else None,
                            'score': score
                        })
            
            scored_docs.sort(key=lambda x: x['score'], reverse=True)
            return scored_docs[:limit]
            
        except Exception as e:
            logger.error(f"Erreur recherche documents: {str(e)}")
            return []
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extrait les mots-clés pertinents d'un texte."""
        # Nettoyer et normaliser
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)
        
        # Séparer en mots
        words = text.split()
        
        # Filtrer les stop words et mots courts
        keywords = [
            word for word in words
            if word not in self.stop_words and len(word) > 2
        ]
        
        return keywords
    
    def _calculate_relevance(self, query_words: List[str], 
                           content: str, 
                           keywords: List[str]) -> float:
        """Calcule un score de pertinence."""
        content_lower = content.lower()
        score = 0.0
        
        # Score pour mots exacts
        for word in query_words:
            if word in content_lower:
                score += 1.0
                # Bonus si le mot apparaît plusieurs fois
                count = content_lower.count(word)
                if count > 1:
                    score += min(count * 0.1, 0.5)
        
        # Bonus pour mots-clés
        for keyword in keywords:
            if keyword.lower() in [w.lower() for w in query_words]:
                score += 2.0
        
        # Pénalité pour contenu très long (moins précis)
        if len(content) > 1000:
            score *= 0.8
        
        return score
    
    def _check_rule_conditions(self, query: str, conditions: Dict) -> bool:
        """Vérifie si les conditions d'une règle sont remplies."""
        if not conditions:
            return False
        
        query_lower = query.lower()
        
        # Vérifier chaque condition
        for condition_type, condition_value in conditions.items():
            if condition_type == 'contains':
                if isinstance(condition_value, list):
                    if not any(word.lower() in query_lower for word in condition_value):
                        return False
                else:
                    if condition_value.lower() not in query_lower:
                        return False
            
            elif condition_type == 'regex':
                try:
                    if not re.search(condition_value, query, re.IGNORECASE):
                        return False
                except:
                    return False
            
            elif condition_type == 'min_length':
                if len(query) < condition_value:
                    return False
        
        return True
    
    def _extract_excerpt(self, content: str, keywords: List[str], 
                        max_length: int = 200) -> str:
        """Extrait un extrait pertinent du contenu."""
        if not content:
            return ""
        
        content_lower = content.lower()
        
        # Trouver la première occurrence d'un mot-clé
        best_position = len(content)
        for keyword in keywords:
            pos = content_lower.find(keyword.lower())
            if pos != -1 and pos < best_position:
                best_position = pos
        
        # Si aucun mot-clé trouvé, prendre le début
        if best_position == len(content):
            best_position = 0
        
        # Extraire autour de cette position
        start = max(0, best_position - 50)
        end = min(len(content), best_position + max_length - 50)
        
        excerpt = content[start:end]
        
        # Ajouter les ellipses si nécessaire
        if start > 0:
            excerpt = "..." + excerpt
        if end < len(content):
            excerpt = excerpt + "..."
        
        return excerpt
    
    def get_category_context(self, category_name: str) -> Dict[str, Any]:
        """
        Récupère le contexte spécifique d'une catégorie.
        """
        try:
            category = KnowledgeCategory.query.filter_by(name=category_name).first()
            if not category:
                return {}
            
            context = {
                'name': category.name,
                'description': category.description,
                'faq_count': len(category.faqs),
                'document_count': len(category.documents),
                'rule_count': len(category.rules)
            }
            
            # Exemples de FAQ de cette catégorie
            sample_faqs = FAQ.query.filter_by(category_id=category.id).limit(3).all()
            context['sample_faqs'] = [
                {'q': faq.question, 'a': faq.answer[:100] + '...' if len(faq.answer) > 100 else faq.answer}
                for faq in sample_faqs
            ]
            
            return context
            
        except Exception as e:
            logger.error(f"Erreur récupération contexte catégorie: {str(e)}")
            return {}