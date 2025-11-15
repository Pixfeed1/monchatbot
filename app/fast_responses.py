import logging
from flask import Blueprint, jsonify, request, render_template, flash, redirect, url_for
from flask_login import login_required
from sqlalchemy import or_
from .models import db, DefaultMessage
import re

# Configuration du logger
logger = logging.getLogger(__name__)
logger.info("===> Chargement du module fast_responses.py...")

fast_responses_bp = Blueprint('fast_responses', __name__, url_prefix='/api/fast-responses')
logger.info("===> Blueprint fast_responses_bp créé")

@fast_responses_bp.route('/', methods=['GET'])
@login_required
def get_all_responses():
    """Récupère toutes les réponses rapides"""
    logger.info("===> Route GET / appelée")
    responses = DefaultMessage.query.all()
    logger.info(f"===> {len(responses)} réponses récupérées")
    
    return jsonify({
        'status': 'success',
        'data': [
            {
                'id': r.id,
                'title': r.title,
                'content': r.content,
                'triggers': r.triggers.split(',') if r.triggers else [],
                'created_at': r.created_at.isoformat() if r.created_at else None,
                'updated_at': r.updated_at.isoformat() if r.updated_at else None
            }
            for r in responses
        ]
    })

@fast_responses_bp.route('/<int:id>', methods=['GET'])
@login_required
def get_response(id):
    """Récupère une réponse rapide par son ID"""
    logger.info(f"===> Route GET /{id} appelée")
    response = DefaultMessage.query.get_or_404(id)
    
    return jsonify({
        'status': 'success',
        'data': {
            'id': response.id,
            'title': response.title,
            'content': response.content,
            'triggers': response.triggers.split(',') if response.triggers else [],
            'created_at': response.created_at.isoformat() if response.created_at else None,
            'updated_at': response.updated_at.isoformat() if response.updated_at else None
        }
    })

@fast_responses_bp.route('/', methods=['POST'])
@login_required
def create_response():
    """Crée une nouvelle réponse rapide"""
    logger.info("===> Route POST / appelée")
    data = request.get_json()
    
    # Validation
    if not data.get('title'):
        return jsonify({'status': 'error', 'message': 'Le titre est obligatoire'}), 400
    
    if not data.get('content'):
        return jsonify({'status': 'error', 'message': 'Le contenu est obligatoire'}), 400
    
    # Convertir les triggers en chaîne
    triggers = data.get('triggers', [])
    if isinstance(triggers, list):
        triggers = ','.join(triggers)
    
    # Créer la réponse
    new_response = DefaultMessage(
        title=data.get('title'),
        content=data.get('content'),
        triggers=triggers
    )
    
    # Enregistrer
    db.session.add(new_response)
    db.session.commit()
    
    # Rafraîchir le cache
    logger.info("===> Tentative de rafraîchissement du cache")
    try:
        from .fast_responses_cache import refresh_cache
        refresh_cache()
        logger.info("===> Cache rafraîchi avec succès")
    except Exception as e:
        logger.error(f"===> Erreur lors du rafraîchissement du cache: {str(e)}", exc_info=True)
    
    return jsonify({
        'status': 'success',
        'message': 'Réponse rapide créée avec succès',
        'data': {
            'id': new_response.id,
            'title': new_response.title,
            'content': new_response.content,
            'triggers': new_response.triggers.split(',') if new_response.triggers else [],
            'created_at': new_response.created_at.isoformat() if new_response.created_at else None
        }
    }), 201

@fast_responses_bp.route('/<int:id>', methods=['PUT'])
@login_required
def update_response(id):
    """Met à jour une réponse rapide"""
    logger.info(f"===> Route PUT /{id} appelée")
    response = DefaultMessage.query.get_or_404(id)
    data = request.get_json()
    
    # Mise à jour des champs
    if 'title' in data:
        response.title = data['title']
    
    if 'content' in data:
        response.content = data['content']
    
    if 'triggers' in data:
        triggers = data['triggers']
        if isinstance(triggers, list):
            triggers = ','.join(triggers)
        response.triggers = triggers
    
    # Enregistrer
    db.session.commit()
    
    # Rafraîchir le cache
    logger.info("===> Tentative de rafraîchissement du cache")
    try:
        from .fast_responses_cache import refresh_cache
        refresh_cache()
        logger.info("===> Cache rafraîchi avec succès")
    except Exception as e:
        logger.error(f"===> Erreur lors du rafraîchissement du cache: {str(e)}", exc_info=True)
    
    return jsonify({
        'status': 'success',
        'message': 'Réponse rapide mise à jour avec succès',
        'data': {
            'id': response.id,
            'title': response.title,
            'content': response.content,
            'triggers': response.triggers.split(',') if response.triggers else [],
            'updated_at': response.updated_at.isoformat() if response.updated_at else None
        }
    })

@fast_responses_bp.route('/<int:id>', methods=['DELETE'])
@login_required
def delete_response(id):
    """Supprime une réponse rapide"""
    logger.info(f"===> Route DELETE /{id} appelée")
    response = DefaultMessage.query.get_or_404(id)
    
    # Supprimer
    db.session.delete(response)
    db.session.commit()
    
    # Rafraîchir le cache
    logger.info("===> Tentative de rafraîchissement du cache")
    try:
        from .fast_responses_cache import refresh_cache
        refresh_cache()
        logger.info("===> Cache rafraîchi avec succès")
    except Exception as e:
        logger.error(f"===> Erreur lors du rafraîchissement du cache: {str(e)}", exc_info=True)
    
    return jsonify({
        'status': 'success',
        'message': 'Réponse rapide supprimée avec succès'
    })

@fast_responses_bp.route('/search', methods=['GET'])
@login_required
def search_responses():
    """Recherche des réponses rapides"""
    logger.info("===> Route GET /search appelée")
    query = request.args.get('q', '')
    
    if not query:
        return jsonify({'status': 'error', 'message': 'Requête de recherche manquante'}), 400
    
    # Recherche
    results = DefaultMessage.query.filter(
        or_(
            DefaultMessage.title.ilike(f'%{query}%'),
            DefaultMessage.content.ilike(f'%{query}%'),
            DefaultMessage.triggers.ilike(f'%{query}%')
        )
    ).all()
    
    logger.info(f"===> {len(results)} résultats trouvés pour la recherche '{query}'")
    
    return jsonify({
        'status': 'success',
        'data': [
            {
                'id': r.id,
                'title': r.title,
                'content': r.content,
                'triggers': r.triggers.split(',') if r.triggers else [],
                'created_at': r.created_at.isoformat() if r.created_at else None
            }
            for r in results
        ]
    })

@fast_responses_bp.route('/test', methods=['POST'])
@login_required
def test_response():
    """Teste une réponse avec variables"""
    logger.info("===> Route POST /test appelée")
    data = request.get_json()
    
    content = data.get('content', '')
    variables = data.get('variables', {})
    
    # Traiter les variables
    var_pattern = re.compile(r'\{([a-zA-Z0-9_]+)\}')
    
    # Trouver toutes les variables dans le contenu
    vars_found = re.findall(var_pattern, content)
    logger.info(f"===> Variables trouvées: {vars_found}")
    
    # Remplacer les variables par leurs valeurs
    for var in vars_found:
        placeholder = f"{{{var}}}"
        value = variables.get(var, placeholder)
        content = content.replace(placeholder, value)
    
    return jsonify({
        'status': 'success',
        'data': {
            'processed_content': content,
            'variables_found': vars_found,
            'variables_provided': list(variables.keys())
        }
    })

@fast_responses_bp.route('/refresh-cache', methods=['POST'])
@login_required
def refresh_responses_cache():
    """Force le rafraîchissement du cache des réponses rapides"""
    logger.info("===> Route POST /refresh-cache appelée")
    try:
        from .fast_responses_cache import refresh_cache
        logger.info("===> Module fast_responses_cache importé avec succès")
        refresh_cache()
        logger.info("===> Cache rafraîchi avec succès")
        return jsonify({
            'status': 'success',
            'message': 'Cache des réponses rapides rafraîchi avec succès'
        })
    except Exception as e:
        logger.error(f"===> Erreur lors du rafraîchissement du cache: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': f'Erreur lors du rafraîchissement du cache: {str(e)}'
        }), 500

@fast_responses_bp.route('/variables', methods=['GET'])
@login_required
def get_available_variables():
    """Récupère la liste des variables disponibles pour les réponses"""
    logger.info("===> Route GET /variables appelée")
    # Variables système disponibles
    system_variables = [
        {'name': 'bot_name', 'description': 'Nom du bot configuré dans les paramètres'},
        {'name': 'domain', 'description': 'Domaine/description du bot configuré dans les paramètres'},
        {'name': 'current_date', 'description': 'Date actuelle (format: JJ/MM/AAAA)'},
        {'name': 'current_time', 'description': 'Heure actuelle (format: HH:MM)'}
    ]
    
    # Variables personnalisées (à partir des settings)
    custom_variables = []
    try:
        logger.info("===> Tentative de récupération des settings")
        from .models import Settings
        settings = Settings.query.first()
        if settings:
            logger.info("===> Settings trouvés")
            custom_variables.append({
                'name': 'bot_welcome',
                'description': 'Message de bienvenue configuré',
                'value': settings.bot_welcome
            })
    except Exception as e:
        logger.error(f"===> Erreur lors de la récupération des settings: {str(e)}", exc_info=True)
    
    return jsonify({
        'status': 'success',
        'data': {
            'system_variables': system_variables,
            'custom_variables': custom_variables
        }
    })

logger.info("===> Fin du chargement du module fast_responses.py")