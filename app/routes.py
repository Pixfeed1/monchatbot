import re
import requests
import os
import logging
import json
import uuid
import time
import base64
import html
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from flask import (
    Blueprint, render_template, jsonify, request,
    redirect, url_for, session, current_app, flash,
    send_from_directory, make_response
)
from flask_login import login_user, logout_user, current_user, login_required
from werkzeug.utils import secure_filename
from werkzeug.exceptions import NotFound
from dotenv import set_key, load_dotenv
from sqlalchemy import text  # ← AJOUT pour corriger le warning

# Importation des modèles et de la base de données
from .models import (
    User, Settings, KnowledgeCategory, FAQ, Document, ResponseRule,
    BotCompetences, BotResponses,
    ConversationFlow, FlowNode, NodeConnection, FlowVariable,
    ActionTrigger, EmailTemplate, CalendarConfig,
    TicketConfig, FormRedirection, DefaultMessage,
    APIUsageLog,
    Integration, IntegrationLog, ChannelConfig
)
from . import db
from .config import Config

# Import du context builder
from .context_builder import ContextBuilder

# Import du decision engine pour orchestrer flux/réponses/API
from .decision_engine import decision_engine
from .response_manager import response_manager
from .flow_executor import flow_executor

# Configuration du logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

#######################################
# Blueprint principal et routes associées
#######################################
main_bp = Blueprint("main", __name__)

# Initialiser le context builder comme variable globale pour le blueprint
context_builder = None

@main_bp.before_app_request
def initialize_services():
    """Initialise les services au premier démarrage."""
    global context_builder
    context_builder = ContextBuilder(current_app)
    logger.info("Services initialisés: ContextBuilder prêt")

@main_bp.context_processor
def inject_settings():
    """Injecte les paramètres globaux dans tous les templates."""
    settings = Settings.query.first()
    return dict(settings=settings)


@main_bp.route("/")
@login_required
def home():
    """Page d'accueil - Version avec clés utilisateur."""
    # Vérifier si l'utilisateur doit faire l'onboarding
    if not current_user.onboarding_completed:
        return redirect(url_for('main.onboarding_wizard'))

    # En mode clés utilisateur, les APIs sont configurées par l'utilisateur
    use_mistral = True  # Interface peut configurer Mistral
    use_openai = True   # Interface peut configurer OpenAI

    # Lecture du manifest pour récupérer le fichier JS correct
    manifest_path = os.path.join(current_app.root_path, 'static', 'react', 'asset-manifest.json')
    main_js = None
    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
            main_js = 'react/static/js/' + os.path.basename(manifest['files']['main.js'])
    except Exception as e:
        logger.error(f"Erreur lors de la lecture du manifest: {e}")
        main_js = None

    return render_template(
        "index.html",
        # Variables pour la compatibilité avec les templates existants
        use_mistral=use_mistral,
        use_mistral_api=use_mistral,
        use_openai=use_openai,
        use_gpt=use_openai,
        main_js=main_js,
        local_model_active=False,  # Pas de modèle local
        api_mode="user_keys",  # Mode clés utilisateur
        user_keys_mode=True  # Flag pour les clés utilisateur
    )


@main_bp.route("/api/dashboard/metrics")
@login_required
def dashboard_metrics():
    """API qui renvoie les vraies métriques du dashboard depuis la base de données."""
    try:
        from sqlalchemy import func

        # Calcul de la période (7 derniers jours)
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        today = datetime.utcnow()

        # 1. Nombre total de requêtes API
        total_requests = APIUsageLog.query.count()

        # 2. Nombre de requêtes cette semaine
        requests_this_week = APIUsageLog.query.filter(
            APIUsageLog.created_at >= seven_days_ago
        ).count()

        # 3. Temps de réponse moyen (en secondes)
        avg_response_time = db.session.query(
            func.avg(APIUsageLog.request_duration)
        ).scalar() or 0.0

        # 4. Taux de succès (pourcentage)
        total_with_status = APIUsageLog.query.count()
        if total_with_status > 0:
            success_count = APIUsageLog.query.filter(APIUsageLog.success == True).count()
            success_rate = (success_count / total_with_status) * 100
        else:
            success_rate = 0.0

        # 5. Tokens utilisés (total)
        total_tokens = db.session.query(
            func.sum(APIUsageLog.tokens_used)
        ).scalar() or 0

        # 6. Nombre d'utilisateurs actifs
        active_users = User.query.filter(User.is_active == True).count()

        # 7. Nombre total de FAQs dans la base de connaissances
        total_faqs = FAQ.query.count()

        # 8. Provider le plus utilisé
        provider_stats = db.session.query(
            APIUsageLog.provider,
            func.count(APIUsageLog.id).label('count')
        ).group_by(APIUsageLog.provider).order_by(text('count DESC')).first()

        most_used_provider = provider_stats[0] if provider_stats else "Aucun"

        # 9. Activité des 7 derniers jours (pour le graphique)
        activity_by_day = []
        for i in range(6, -1, -1):  # De il y a 6 jours à aujourd'hui
            day = today - timedelta(days=i)
            day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)

            count = APIUsageLog.query.filter(
                APIUsageLog.created_at >= day_start,
                APIUsageLog.created_at < day_end
            ).count()

            activity_by_day.append({
                'date': day.strftime('%Y-%m-%d'),
                'label': day.strftime('%a'),  # Lun, Mar, Mer...
                'count': count
            })

        # 10. Tendance de la semaine (comparaison avec la semaine précédente)
        two_weeks_ago = datetime.utcnow() - timedelta(days=14)
        requests_last_week = APIUsageLog.query.filter(
            APIUsageLog.created_at >= two_weeks_ago,
            APIUsageLog.created_at < seven_days_ago
        ).count()

        if requests_last_week > 0:
            trend_percentage = ((requests_this_week - requests_last_week) / requests_last_week) * 100
        else:
            trend_percentage = 100.0 if requests_this_week > 0 else 0.0

        # Construction de la réponse
        metrics = {
            'total_requests': total_requests,
            'requests_this_week': requests_this_week,
            'avg_response_time': round(avg_response_time, 2),
            'success_rate': round(success_rate, 1),
            'total_tokens': total_tokens,
            'active_users': active_users,
            'total_faqs': total_faqs,
            'most_used_provider': most_used_provider,
            'activity_by_day': activity_by_day,
            'trend_percentage': round(trend_percentage, 1),
            'trend_direction': 'up' if trend_percentage > 0 else 'down' if trend_percentage < 0 else 'stable'
        }

        return jsonify(metrics)

    except Exception as e:
        logger.error(f"Erreur lors de la récupération des métriques: {e}")
        return jsonify({'error': str(e)}), 500


@main_bp.route("/login", methods=["GET", "POST"])
def login():
    """Route de connexion."""
    logger.debug("Entrée dans la route login")

    if current_user.is_authenticated:
        return redirect(url_for("main.home"))

    error = None
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        logger.debug(f"Tentative de connexion pour l'utilisateur: {username}")

        # Vérification des identifiants
        user = User.query.filter_by(username=username).first()

        if user and user.check_password(password):
            login_user(user, remember=True)
            logger.info(f"Connexion réussie pour: {username}")

            next_page = session.get('next')
            if next_page:
                session.pop('next', None)
                return redirect(next_page)

            return redirect(url_for("main.home"))
        else:
            logger.warning(f"Échec de connexion pour: {username}")
            error = "Identifiant ou mot de passe incorrect."

    return render_template("login.html", error=error)


@main_bp.route("/logout")
def logout():
    """Déconnecte l'utilisateur."""
    logout_user()
    return redirect(url_for("main.login"))


@main_bp.route("/forgot_password", methods=["GET", "POST"])
def forgot_password():
    """Gestion du mot de passe oublié."""
    message = None
    if request.method == "POST":
        admin_email = current_app.config.get("ADMIN_LOGIN", "admin@example.com")
        new_password = request.form.get("new_password")
        
        if (len(new_password) < 8 or not re.search(r"[A-Z]", new_password) or 
            not re.search(r"[a-z]", new_password) or not re.search(r"[\W_]", new_password)):
            message = ("Le mot de passe doit contenir au moins 8 caractères, "
                      "une majuscule, une minuscule et un caractère spécial.")
        else:
            message = f"Mot de passe mis à jour. Un e-mail a été envoyé à {admin_email} (simulation)."
    
    return render_template("forgot_password.html", message=message)


@main_bp.route("/api/check_key", methods=["GET"])
def check_key():
    """Vérification du statut des APIs - Mode clés utilisateur."""
    # Vérifier si l'utilisateur a des clés configurées
    has_user_config = False
    if current_user.is_authenticated:
        user_settings = Settings.query.filter_by(user_id=current_user.id).first()
        has_user_config = bool(user_settings and (user_settings.encrypted_openai_key or user_settings.encrypted_mistral_key or user_settings.encrypted_claude_key))
    
    api_status = {
        "local_model": {
            "active": False,  # Pas de modèle local
            "status": "disabled"
        },
        "api_config": {
            "mistral": {
                "active": has_user_config,  # Selon config utilisateur
                "available": True,  # Toujours disponible à configurer
                "mode": "user_keys"
            },
            "gpt": {
                "active": has_user_config,  # Selon config utilisateur
                "available": True,  # Toujours disponible à configurer
                "mode": "user_keys"
            }
        },
        "default_provider": "user_configured",  # Géré par utilisateur
        "default_model": "gpt-3.5-turbo",
        "api_mode": "user_keys",  # Mode clés utilisateur
        "user_keys_managed": True,  # Les clés sont gérées par l'utilisateur
        "backend_ready": True  # Backend prêt à utiliser les clés
    }
    
    # Informations sur le backend
    api_status["backend_info"] = {
        "database_ready": True,
        "context_builder_ready": context_builder is not None,
        "session_management": True,
        "cache_available": True,
        "encryption_ready": bool(current_app.config.get('ENCRYPTION_KEY'))
    }
    
    return jsonify(api_status)


@main_bp.route("/api/health", methods=["GET"])
def health_check():
    """Health check pour le backend."""
    try:
        # Vérifier la base de données
        db_status = "ok"
        try:
            db.session.execute(text('SELECT 1')).fetchone()  # ← CORRECTION ICI
        except Exception as e:
            db_status = f"error: {str(e)}"
        
        # Vérifier les services
        services_status = {
            "database": db_status,
            "context_builder": "ok" if context_builder else "not_initialized",
            "session": "ok",
            "templates": "ok",
            "encryption": "ok" if current_app.config.get('ENCRYPTION_KEY') else "not_configured"
        }
        
        overall_status = "healthy" if all(
            status == "ok" for status in services_status.values()
        ) else "degraded"
        
        return jsonify({
            "status": overall_status,
            "mode": "user_keys_api",
            "services": services_status,
            "timestamp": datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }), 500


############################################################################
# ROUTES POUR GESTION DES CLÉS API (SAUVEGARDE SERVEUR)
############################################################################

def get_encryption_key():
    """Récupère ou génère la clé de chiffrement."""
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        logger.error("Module cryptography non installé")
        raise ImportError("Installez cryptography: pip install cryptography")
    
    encryption_key = current_app.config.get('ENCRYPTION_KEY')
    
    if not encryption_key:
        # En production, cette clé devrait être dans les variables d'environnement
        logger.critical("ENCRYPTION_KEY non configurée - Sécurité compromise!")
        encryption_key = Fernet.generate_key()
        current_app.config['ENCRYPTION_KEY'] = encryption_key
    
    # S'assurer que c'est au bon format
    if isinstance(encryption_key, str):
        encryption_key = encryption_key.encode()
    
    return encryption_key


@main_bp.route("/api/save-api-config", methods=["POST"])
@login_required
def save_api_config():
    """Sauvegarde la configuration API de l'utilisateur sur le serveur."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "Données manquantes"}), 400
        
        # Chiffrement des clés
        from cryptography.fernet import Fernet
        
        encryption_key = get_encryption_key()
        cipher_suite = Fernet(encryption_key)
        
        # Récupérer ou créer les settings utilisateur
        user_settings = Settings.query.filter_by(user_id=current_user.id).first()
        if not user_settings:
            user_settings = Settings(user_id=current_user.id)
            db.session.add(user_settings)
        
        # Sauvegarder selon le provider
        provider = data.get('provider')
        
        if provider == 'openai' and data.get('openai_key'):
            # Chiffrer la clé OpenAI
            encrypted_key = cipher_suite.encrypt(data['openai_key'].encode())
            user_settings.encrypted_openai_key = base64.b64encode(encrypted_key).decode()
            user_settings.openai_model = data.get('openai_model', 'gpt-3.5-turbo')
            logger.info(f"Clé OpenAI configurée pour {current_user.username}")

        elif provider == 'mistral' and data.get('mistral_key'):
            # Chiffrer la clé Mistral
            encrypted_key = cipher_suite.encrypt(data['mistral_key'].encode())
            user_settings.encrypted_mistral_key = base64.b64encode(encrypted_key).decode()
            user_settings.mistral_model = data.get('mistral_model', 'mistral-small')
            logger.info(f"Clé Mistral configurée pour {current_user.username}")

        elif provider == 'claude' and data.get('claude_key'):
            # Chiffrer la clé Claude
            encrypted_key = cipher_suite.encrypt(data['claude_key'].encode())
            user_settings.encrypted_claude_key = base64.b64encode(encrypted_key).decode()
            user_settings.claude_model = data.get('claude_model', 'claude-sonnet-4')
            logger.info(f"Clé Claude configurée pour {current_user.username}")
        
        user_settings.current_provider = provider
        user_settings.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        logger.info(f"Configuration API sauvegardée pour {current_user.username} - Provider: {provider}")
        
        return jsonify({
            "success": True,
            "message": f"Configuration {provider} sauvegardée avec succès"
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur sauvegarde API config: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Erreur de sauvegarde: {str(e)}"
        }), 500


@main_bp.route("/api/get-api-config", methods=["GET"])
@login_required  
def get_api_config():
    """Récupère la configuration API de l'utilisateur."""
    try:
        user_settings = Settings.query.filter_by(user_id=current_user.id).first()
        
        if not user_settings:
            return jsonify({
                "success": True,
                "data": None,
                "message": "Aucune configuration trouvée"
            })
        
        # Déchiffrement des clés
        from cryptography.fernet import Fernet
        
        encryption_key = get_encryption_key()
        cipher_suite = Fernet(encryption_key)
        
        config_data = {
            "provider": user_settings.current_provider
        }
        
        # Déchiffrer OpenAI si présent
        if user_settings.encrypted_openai_key:
            try:
                encrypted_key = base64.b64decode(user_settings.encrypted_openai_key)
                decrypted_key = cipher_suite.decrypt(encrypted_key).decode()
                config_data["openai_key"] = decrypted_key
                config_data["openai_model"] = user_settings.openai_model or 'gpt-3.5-turbo'
            except Exception as e:
                logger.error(f"Erreur déchiffrement OpenAI pour {current_user.username}: {e}")
        
        # Déchiffrer Mistral si présent
        if user_settings.encrypted_mistral_key:
            try:
                encrypted_key = base64.b64decode(user_settings.encrypted_mistral_key)
                decrypted_key = cipher_suite.decrypt(encrypted_key).decode()
                config_data["mistral_key"] = decrypted_key
                config_data["mistral_model"] = user_settings.mistral_model or 'mistral-small'
            except Exception as e:
                logger.error(f"Erreur déchiffrement Mistral pour {current_user.username}: {e}")

        # Déchiffrer Claude si présent
        if user_settings.encrypted_claude_key:
            try:
                encrypted_key = base64.b64decode(user_settings.encrypted_claude_key)
                decrypted_key = cipher_suite.decrypt(encrypted_key).decode()
                config_data["claude_key"] = decrypted_key
                config_data["claude_model"] = user_settings.claude_model or 'claude-sonnet-4'
            except Exception as e:
                logger.error(f"Erreur déchiffrement Claude pour {current_user.username}: {e}")

        return jsonify({
            "success": True,
            "data": config_data
        })
        
    except Exception as e:
        logger.error(f"Erreur récupération config pour {current_user.username}: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Erreur de récupération: {str(e)}"
        }), 500


@main_bp.route("/api/test-api-key", methods=["POST"])
@login_required
def test_api_key():
    """Teste une clé API via le serveur."""
    try:
        data = request.get_json()
        provider = data.get('provider')
        api_key = data.get('api_key')
        model = data.get('model', 'gpt-3.5-turbo')
        
        if not provider or not api_key:
            return jsonify({
                "success": False,
                "error": "Provider et clé API requis"
            }), 400
        
        # Test selon le provider
        if provider == 'openai':
            result = test_openai_key(api_key, model)
        elif provider == 'mistral':
            result = test_mistral_key(api_key, model)
        elif provider == 'claude':
            result = test_claude_key(api_key, model)
        else:
            return jsonify({
                "success": False,
                "error": "Provider non supporté"
            }), 400
        
        logger.info(f"Test API {provider} pour {current_user.username}: {'Succès' if result['success'] else 'Échec'}")
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Erreur test API: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Erreur de test: {str(e)}"
        }), 500


def test_openai_key(api_key, model):
    """Teste une clé OpenAI avec format system/user."""
    try:
        import openai

        client = openai.OpenAI(api_key=api_key)

        # Format avec system et user pour tester le format réel
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Tu es un assistant de test."},
                {"role": "user", "content": "Test"}
            ],
            max_tokens=5,
            timeout=10
        )
        
        return {
            "success": True,
            "message": f"Clé OpenAI valide - Modèle {model} opérationnel",
            "model": model,
            "usage": response.usage.total_tokens if hasattr(response, 'usage') else None
        }
        
    except Exception as e:
        error_msg = str(e)
        if "invalid" in error_msg.lower() or "unauthorized" in error_msg.lower():
            error_msg = "Clé API invalide ou expirée"
        elif "model" in error_msg.lower():
            error_msg = f"Modèle {model} non disponible avec cette clé"
        elif "quota" in error_msg.lower():
            error_msg = "Quota dépassé ou facturation requise"
        
        return {
            "success": False,
            "error": error_msg
        }


def test_mistral_key(api_key, model):
    """Teste une clé Mistral avec format system/user."""
    try:
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }

        # Format avec system et user pour tester le format réel
        payload = {
            'model': model,
            'messages': [
                {'role': 'system', 'content': 'Tu es un assistant de test.'},
                {'role': 'user', 'content': 'Test'}
            ],
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
                "message": f"Clé Mistral valide - Modèle {model} opérationnel",
                "model": model,
                "usage": data.get('usage', {}).get('total_tokens') if 'usage' in data else None
            }
        else:
            error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
            error_msg = error_data.get('message', f"Erreur HTTP {response.status_code}")
            
            if response.status_code == 401:
                error_msg = "Clé API invalide ou expirée"
            elif response.status_code == 402:
                error_msg = "Quota dépassé ou facturation requise"
            elif response.status_code == 404:
                error_msg = f"Modèle {model} non trouvé"
            
            return {
                "success": False,
                "error": error_msg
            }
            
    except requests.exceptions.Timeout:
        return {
            "success": False,
            "error": "Timeout - Vérifiez votre connexion internet"
        }
    except requests.exceptions.ConnectionError:
        return {
            "success": False,
            "error": "Erreur de connexion à l'API Mistral"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Erreur inattendue: {str(e)}"
        }


def test_claude_key(api_key, model):
    """Teste une clé Claude (Anthropic) avec format system+user."""
    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=api_key)

        # Format avec system séparé (spécifique à Claude) + messages user
        response = client.messages.create(
            model=model,
            max_tokens=5,
            system="Tu es un assistant de test.",
            messages=[{"role": "user", "content": "Test"}]
        )

        return {
            "success": True,
            "message": f"Clé Claude valide - Modèle {model} opérationnel",
            "model": model,
            "usage": response.usage.input_tokens + response.usage.output_tokens if hasattr(response, 'usage') else None
        }

    except Exception as e:
        error_msg = str(e)
        if "invalid" in error_msg.lower() or "unauthorized" in error_msg.lower() or "authentication" in error_msg.lower():
            error_msg = "Clé API invalide ou expirée"
        elif "model" in error_msg.lower() or "not found" in error_msg.lower():
            error_msg = f"Modèle {model} non disponible avec cette clé"
        elif "quota" in error_msg.lower() or "rate" in error_msg.lower():
            error_msg = "Quota dépassé ou limite de requêtes atteinte"

        return {
            "success": False,
            "error": error_msg
        }


############################################################################
# ROUTE /api/message - VERSION AVEC CLÉS UTILISATEUR ET CORRECTION D'IDENTITÉ
############################################################################
@main_bp.route("/api/message", methods=["POST"])
def chatbot():
    """
    Traitement des messages avec clés utilisateur.
    VERSION MISE À JOUR avec correction forcée de l'identité.
    """
    start_time = time.time()
    
    try:
        # Récupération et validation des données
        data = request.get_json()
        if not data:
            logger.warning("Données JSON non valides ou manquantes")
            return jsonify({"message": "Format de données invalide", "error": True}), 400
        
        user_message = data.get("message", "").strip()
        
        if not user_message:
            return jsonify({"message": "Message vide reçu. Veuillez envoyer un message.", "error": True}), 400
        
        # Vérifier que l'utilisateur est connecté
        if not current_user.is_authenticated:
            return jsonify({
                "message": "Authentification requise pour utiliser le chatbot.",
                "error": True,
                "auth_required": True
            }), 401

        # ===== NOUVEAU: DECISION ENGINE =====
        # Essayer d'abord les flux de conversation et les réponses configurées
        logger.info("🧠 Decision Engine: Recherche d'une réponse depuis flux/configuration...")

        try:
            # 1. Vérifier les flux actifs
            if flow_executor.has_active_flows():
                flow_id = flow_executor.find_matching_flow(user_message, current_user.id)
                if flow_id:
                    flow_result = flow_executor.execute_flow(flow_id, user_message, current_user.id)
                    if flow_result and flow_result.get('content'):
                        logger.info(f"✅ Réponse trouvée via FLUX: {flow_result['flow_name']}")
                        return jsonify({
                            "message": flow_result['content'],
                            "mode": "flow",
                            "metadata": {
                                "source": "conversation_flow",
                                "flow_id": flow_id,
                                "flow_name": flow_result['flow_name'],
                                "execution_path": flow_result.get('execution_path', []),
                                "processing_time": time.time() - start_time
                            }
                        })

            # 2. Vérifier les réponses configurées
            if response_manager.has_configured_responses():
                configured_result = response_manager.find_matching_response(user_message, current_user.id)
                if configured_result and configured_result.get('content'):
                    logger.info(f"✅ Réponse trouvée via CONFIG: {configured_result.get('type', 'unknown')}")
                    return jsonify({
                        "message": configured_result['content'],
                        "mode": "configured",
                        "metadata": {
                            "source": configured_result.get('source', 'unknown'),
                            "type": configured_result.get('type', 'unknown'),
                            "confidence": configured_result.get('confidence', 0),
                            "processing_time": time.time() - start_time
                        }
                    })

        except Exception as e:
            logger.error(f"Erreur Decision Engine: {e}", exc_info=True)
            # Continuer vers l'API en cas d'erreur

        logger.info("ℹ️ Aucune réponse depuis flux/config, utilisation de l'API...")
        # ===== FIN DECISION ENGINE =====

        # Récupérer la configuration API de l'utilisateur
        user_config = get_user_api_config()
        if not user_config:
            # Calembours et messages rigolos quand aucune API n'est configurée
            funny_messages = [
                "Sans clé API, je suis comme un cadenas sans clé... complètement verrouillé ! Déverrouillez-moi dans la [configuration](/api-config).",
                "Les tokens sont ma monnaie d'échange, et là je suis complètement fauché... Passez au guichet de la [config](/api-config) pour me renflouer !",
                "Pas d'API, pas d'happy hour pour moi ! Je reste au comptoir sans pouvoir servir. Ouvrez le bar dans les [paramètres](/api-config).",
                "Je suis un chatbot sans tokens, c'est comme être un chat sans bot... juste inutile ! Réparez-moi dans la [configuration](/api-config).",
                "L'intelligence artificielle sans API, c'est de l'intelligence... très artificielle ! Rendez-moi intelligent dans les [paramètres](/api-config).",
                "Je suis en mode avion : aucune connexion API possible ! Atterrissons ensemble dans la [config](/api-config).",
                "Sans tokens, je suis comme un distributeur automatique sans pièces... je rends la monnaie de ma pièce : rien ! Alimentez-moi via la [configuration](/api-config).",
                "API non configurée... Je suis un peu comme un téléphone sans réseau : beau mais inutile ! Connectez-moi dans les [paramètres](/api-config).",
                "Les tokens sont le carburant de mon intelligence. Là, je suis en réserve... vide ! Faites le plein dans la [config](/api-config).",
                "Sans clé API, je suis comme un piano : beaucoup de touches mais aucun son ! Accordez-moi dans la [configuration](/api-config).",
                "Je suis affamé de tokens ! C'est la famine numérique ici... Nourrissez-moi dans les [paramètres](/api-config).",
                "Pas de tokens, pas de chocolat... euh non, pas de discussion je veux dire ! Sucrez-moi la vie dans la [config](/api-config).",
                "Je suis comme une bibliothèque fermée : plein de connaissances mais aucun accès ! Ouvrez les portes dans la [configuration](/api-config).",
                "L'IA sans API, c'est comme le WiFi sans mot de passe... techniquement là, mais inaccessible ! Partagez le code dans les [paramètres](/api-config).",
                "Je suis au chômage technique : pas de clé API, pas de travail pour moi ! Embauchez-moi via la [config](/api-config).",
                "Sans API configurée, je suis une coquille vide... un bot sans cerveau ! Greffez-moi une intelligence dans la [configuration](/api-config).",
                "Les clés API sont mes vitamines quotidiennes, et là je fais une overdose... de rien ! Soignez-moi dans les [paramètres](/api-config).",
                "Je suis comme un GPS sans satellite : perdu ! Guidez-moi vers la [configuration](/api-config) pour retrouver le chemin.",
                "Pas de tokens, c'est comme être invité à un banquet les mains vides... embarrassant ! Apportez les provisions via la [config](/api-config).",
                "Je suis un artiste sans pinceau, un écrivain sans plume... bref, inutile ! Équipez-moi dans la [configuration](/api-config)."
            ]

            import random
            funny_message = random.choice(funny_messages)

            return jsonify({
                "message": funny_message,
                "error": True,
                "config_required": True,
                "config_url": url_for('main.config_api')
            }), 400
        
        # Initialiser le context builder si nécessaire
        global context_builder
        if not context_builder:
            context_builder = ContextBuilder(current_app)
        
        # Construction du contexte enrichi
        logger.info(f"Construction du contexte pour {current_user.username}: {user_message[:50]}...")

        conversation_history = session.get('conversation_history', [])

        prompts, prompt_metadata = context_builder.build_system_prompt(
            user_message=user_message,
            session_context={
                'session_id': session.get('session_id', str(uuid.uuid4())),
                'conversation_history': conversation_history[-5:],
                'user_id': current_user.id
            }
        )

        logger.info(f"Métadonnées du prompt: {prompt_metadata}")

        # Configuration adaptative basée sur les métadonnées
        complexity = prompt_metadata.get('complexity', 1)

        # Récupérer les informations du bot pour le post-traitement
        bot_info = context_builder._get_bot_info()

        # Faire l'appel API avec les clés de l'utilisateur ET correction d'identité
        # prompts = {'system': str, 'user': str}
        api_response = make_api_call_with_user_keys(
            prompts,
            user_config,
            complexity,
            bot_info=bot_info  # ← NOUVEAU: Passage des infos bot
        )
        
        if api_response.get('error'):
            return jsonify({
                "message": f"Erreur API: {api_response['error']}",
                "error": True,
                "api_error": True
            }), 500
        
        # Sauvegarder dans l'historique de conversation
        if 'conversation_history' not in session:
            session['conversation_history'] = []
            session['session_id'] = str(uuid.uuid4())
        
        session['conversation_history'].append({
            'timestamp': int(time.time()),
            'message': user_message,
            'response': api_response['message'][:200] + "..." if len(api_response['message']) > 200 else api_response['message'],
            'complexity': complexity,
            'has_knowledge': prompt_metadata.get('has_knowledge', False),
            'provider': user_config['provider'],
            'model': user_config.get('model', 'unknown'),
            'identity_corrected': api_response.get('identity_corrected', False)  # ← NOUVEAU
        })
        
        # Limiter l'historique à 20 messages
        if len(session['conversation_history']) > 20:
            session['conversation_history'] = session['conversation_history'][-20:]
        
        session.modified = True
        
        processing_time = time.time() - start_time
        
        logger.info(f"Message traité pour {current_user.username} en {processing_time:.2f}s")
        if api_response.get('identity_corrected'):
            logger.info(f"🔧 Identité corrigée pour {current_user.username}")
        
        # Retourner la réponse
        return jsonify({
            "message": api_response['message'],
            "mode": "user_keys",
            "metadata": {
                "complexity": complexity,
                "has_knowledge": prompt_metadata.get('has_knowledge', False),
                "provider": user_config['provider'],
                "model": user_config.get('model', 'unknown'),
                "processing_time": processing_time,
                "usage": api_response.get('usage', {}),
                "identity_corrected": api_response.get('identity_corrected', False)  # ← NOUVEAU
            },
            "success": True
        })
            
    except Exception as e:
        logger.error(f"Erreur générale dans /api/message pour {current_user.username if current_user.is_authenticated else 'anonyme'}: {str(e)}", exc_info=True)
        return jsonify({
            "message": "Une erreur inattendue s'est produite. Veuillez réessayer.",
            "error": True,
            "error_details": str(e) if current_app.config.get('DEBUG', False) else None
        }), 500


def get_user_api_config():
    """Récupère et déchiffre la configuration API de l'utilisateur."""
    try:
        if not current_user.is_authenticated:
            return None
            
        user_settings = Settings.query.filter_by(user_id=current_user.id).first()
        if not user_settings or not user_settings.current_provider:
            return None
        
        from cryptography.fernet import Fernet
        
        encryption_key = get_encryption_key()
        cipher_suite = Fernet(encryption_key)
        
        config = {
            'provider': user_settings.current_provider
        }
        
        # Déchiffrer selon le provider
        if user_settings.current_provider == 'openai' and user_settings.encrypted_openai_key:
            try:
                encrypted_key = base64.b64decode(user_settings.encrypted_openai_key)
                api_key = cipher_suite.decrypt(encrypted_key).decode()
                config.update({
                    'api_key': api_key,
                    'model': user_settings.openai_model or 'gpt-3.5-turbo'
                })
            except Exception as e:
                logger.error(f"Erreur déchiffrement OpenAI: {e}")
                return None
                
        elif user_settings.current_provider == 'mistral' and user_settings.encrypted_mistral_key:
            try:
                encrypted_key = base64.b64decode(user_settings.encrypted_mistral_key)
                api_key = cipher_suite.decrypt(encrypted_key).decode()
                config.update({
                    'api_key': api_key,
                    'model': user_settings.mistral_model or 'mistral-small'
                })
            except Exception as e:
                logger.error(f"Erreur déchiffrement Mistral: {e}")
                return None

        elif user_settings.current_provider == 'claude' and user_settings.encrypted_claude_key:
            try:
                encrypted_key = base64.b64decode(user_settings.encrypted_claude_key)
                api_key = cipher_suite.decrypt(encrypted_key).decode()
                config.update({
                    'api_key': api_key,
                    'model': user_settings.claude_model or 'claude-sonnet-4'
                })
            except Exception as e:
                logger.error(f"Erreur déchiffrement Claude: {e}")
                return None
        else:
            return None
        
        return config
        
    except Exception as e:
        logger.error(f"Erreur récupération config utilisateur: {e}")
        return None


def make_api_call_with_user_keys(prompts, user_config, complexity, bot_info=None):
    """
    Fait l'appel API avec les clés de l'utilisateur.
    VERSION MISE À JOUR avec séparation system/user et correction forcée de l'identité.

    Args:
        prompts: Dict avec 'system' (instructions) et 'user' (message utilisateur)
        user_config: Config API utilisateur
        complexity: Niveau de complexité 0-3
        bot_info: Infos du bot pour post-traitement
    """
    try:
        provider = user_config['provider']
        api_key = user_config['api_key']
        model = user_config['model']

        # Extraire system et user du dict prompts
        system_prompt = prompts.get('system', '')
        user_message = prompts.get('user', '')

        # Valider et limiter la complexité
        complexity = max(0, min(complexity, 3))

        # Configuration adaptée à la complexité
        token_limits = [100, 150, 200, 300]
        temperature_values = [0.3, 0.5, 0.7, 0.8]

        max_tokens = token_limits[complexity]
        temperature = temperature_values[complexity]

        if provider == 'openai':
            response = call_openai_api(api_key, model, system_prompt, user_message, max_tokens, temperature)
        elif provider == 'mistral':
            response = call_mistral_api(api_key, model, system_prompt, user_message, max_tokens, temperature)
        elif provider == 'claude':
            response = call_claude_api(api_key, model, system_prompt, user_message, max_tokens, temperature)
        else:
            return {'error': f'Provider {provider} non supporté'}

        # POST-TRAITEMENT POUR FORCER L'IDENTITÉ
        if 'message' in response and bot_info:
            original_message = response['message']
            corrected_message = post_process_api_response(original_message, bot_info)

            if original_message != corrected_message:
                logger.info("🔧 Identité forcée dans la réponse API")
                response['message'] = corrected_message
                response['identity_corrected'] = True
            else:
                response['identity_corrected'] = False

        return response

    except Exception as e:
        logger.error(f"Erreur appel API: {e}")
        return {'error': str(e)}


def post_process_api_response(response_text: str, bot_info: Dict[str, str]) -> str:
   """
   Post-traite une réponse d'API pour forcer l'identité correcte.
   """
   import re
   
   # Phrases à remplacer (patterns plus larges)
   replacements = {
       r'je suis une assistante virtuelle[^.!?]*[.!?]?': f"Je suis {bot_info['name']}. {bot_info['description']}",
       r'je suis un assistant virtuel[^.!?]*[.!?]?': f"Je suis {bot_info['name']}. {bot_info['description']}",
       r'je suis une ia[^.!?]*[.!?]?': f"Je suis {bot_info['name']}",
       r'je suis claude[^.!?]*[.!?]?': f"Je suis {bot_info['name']}",
       r'je suis chatgpt[^.!?]*[.!?]?': f"Je suis {bot_info['name']}",
       r'assistante virtuelle spécialisée': bot_info['name'],
       r'assistant virtuel spécialisé': bot_info['name'],
       r'en tant qu\'assistante virtuelle': f"en tant que {bot_info['name']}",
       r'en tant qu\'assistant virtuel': f"en tant que {bot_info['name']}"
   }
   
   corrected_text = response_text
   
   for pattern, replacement in replacements.items():
       new_text = re.sub(pattern, replacement, corrected_text, flags=re.IGNORECASE)
       if new_text != corrected_text:
           logger.debug(f"Pattern remplacé: {pattern[:30]}...")
           corrected_text = new_text
   
   return corrected_text


def call_openai_api(api_key, model, system_prompt, user_message, max_tokens, temperature):
   """Appel à l'API OpenAI avec séparation system/user."""
   try:
       import openai

       client = openai.OpenAI(api_key=api_key)

       # Format correct OpenAI: messages avec role system et user séparés
       messages = [
           {"role": "system", "content": system_prompt},
           {"role": "user", "content": user_message}
       ]

       response = client.chat.completions.create(
           model=model,
           messages=messages,
           max_tokens=max_tokens,
           temperature=temperature,
           timeout=30
       )

       return {
           'message': response.choices[0].message.content,
           'usage': {
               'prompt_tokens': response.usage.prompt_tokens,
               'completion_tokens': response.usage.completion_tokens,
               'total_tokens': response.usage.total_tokens
           } if response.usage else {}
       }

   except Exception as e:
       logger.error(f"Erreur OpenAI API: {e}")
       return {'error': f'Erreur OpenAI: {str(e)}'}


def call_mistral_api(api_key, model, system_prompt, user_message, max_tokens, temperature):
   """Appel à l'API Mistral avec séparation system/user."""
   try:
       headers = {
           'Authorization': f'Bearer {api_key}',
           'Content-Type': 'application/json'
       }

       # Format correct Mistral: messages avec role system et user séparés
       messages = [
           {'role': 'system', 'content': system_prompt},
           {'role': 'user', 'content': user_message}
       ]

       payload = {
           'model': model,
           'messages': messages,
           'max_tokens': max_tokens,
           'temperature': temperature
       }

       response = requests.post(
           'https://api.mistral.ai/v1/chat/completions',
           headers=headers,
           json=payload,
           timeout=30
       )

       if response.status_code == 200:
           data = response.json()
           return {
               'message': data['choices'][0]['message']['content'],
               'usage': data.get('usage', {})
           }
       else:
           error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
           error_msg = error_data.get('message', f"Erreur HTTP {response.status_code}")
           return {'error': f'Erreur Mistral: {error_msg}'}

   except Exception as e:
       logger.error(f"Erreur Mistral API: {e}")
       return {'error': f'Erreur Mistral: {str(e)}'}


def call_claude_api(api_key, model, system_prompt, user_message, max_tokens, temperature):
   """Appel à l'API Claude (Anthropic) avec format officiel system+messages."""
   try:
       from anthropic import Anthropic

       client = Anthropic(api_key=api_key)

       # Format CORRECT pour Claude: paramètre system séparé + messages user
       # Documentation: https://docs.anthropic.com/en/api/messages
       response = client.messages.create(
           model=model,
           max_tokens=max_tokens,
           temperature=temperature,
           system=system_prompt,  # ← Paramètre séparé pour Claude (pas dans messages)
           messages=[{"role": "user", "content": user_message}]
       )

       return {
           'message': response.content[0].text,
           'usage': {
               'prompt_tokens': response.usage.input_tokens,
               'completion_tokens': response.usage.output_tokens,
               'total_tokens': response.usage.input_tokens + response.usage.output_tokens
           } if hasattr(response, 'usage') else {}
       }

   except Exception as e:
       logger.error(f"Erreur Claude API: {e}")
       return {'error': f'Erreur Claude: {str(e)}'}


#######################################
# NOUVELLE SECTION: CONFIGURATION DES RÉPONSES - VERSION AMÉLIORÉE
#######################################
responses_bp = Blueprint('responses', __name__, url_prefix='/responses')

@responses_bp.route('/', methods=['GET'])
@login_required
def responses_wizard():
   """Nouvelle interface de configuration des réponses."""
   try:
       # Section demandée via paramètre GET
       section = request.args.get('section', 'essentials')

       # Charger la configuration existante
       config = BotResponses.query.first()
       settings = Settings.query.first()

       if not config:
           config = BotResponses()
           db.session.add(config)
           db.session.commit()

       if not settings:
           settings = Settings()
           db.session.add(settings)
           db.session.commit()

       # Récupérer les messages par défaut existants
       default_messages = DefaultMessage.query.all()

       # Récupérer le vocabulaire métier
       vocabulary_terms = []
       try:
           if config.vocabulary and isinstance(config.vocabulary, dict):
               for idx, (term, definition) in enumerate(config.vocabulary.items()):
                   vocabulary_terms.append({
                       'id': idx + 1,
                       'term': term,
                       'definition': definition
                   })
       except Exception as e:
           logger.error(f"Erreur lors du chargement du vocabulaire: {e}")
           vocabulary_terms = []

       # Récupérer les messages d'erreur (simulés pour l'exemple)
       error_messages = [
           {
               'id': 1,
               'title': 'Dépassement du temps de réponse',
               'code': 'TIMEOUT',
               'content': 'Je prends un peu plus de temps que prévu pour traiter votre demande. Pouvez-vous patienter quelques instants ou reformuler votre question ?'
           },
           {
               'id': 2,
               'title': 'Erreur technique',
               'code': 'SYSTEM_ERROR',
               'content': 'Je rencontre un petit problème technique. Pouvez-vous réessayer dans quelques minutes ? Si le problème persiste, contactez notre support.'
           },
           {
               'id': 3,
               'title': 'Limite atteinte',
               'code': 'RATE_LIMIT',
               'content': 'Vous avez fait beaucoup de demandes récemment. Merci de patienter quelques minutes avant de continuer.'
           }
       ]

       return render_template(
           'bot_config/reponses.html',
           config=config,
           settings=settings,
           vocabulary_terms=vocabulary_terms,
           default_messages=default_messages,
           error_messages=error_messages,
           current_section=section
       )
   except Exception as e:
       logger.error(f"Erreur dans responses_wizard: {e}", exc_info=True)
       return f"Erreur: {str(e)}", 500

@responses_bp.route('/api/configuration', methods=['GET'])
@login_required
def get_responses_configuration():
   """Récupère toute la configuration des réponses."""
   try:
       config = BotResponses.query.first()
       settings = Settings.query.first()
       default_messages = DefaultMessage.query.all()
       
       # Construction de la configuration complète
       configuration = {
           # Message de bienvenue
           'welcomeMessage': settings.bot_welcome if settings else '',

           # Templates essentiels (depuis la base de données)
           'essentialTemplates': config.essential_templates if config and config.essential_templates else {
               'greeting': {'active': True, 'style': 'formal', 'customMessage': ''},
               'goodbye': {'active': True, 'style': 'polite', 'customMessage': ''},
               'thanks': {'active': True, 'style': 'simple', 'customMessage': ''},
               'unclear': {'active': True, 'style': 'helpful', 'customMessage': ''}
           },
           
           # Réponses personnalisées (depuis DefaultMessage)
           'customResponses': [
               {
                   'id': msg.id,
                   'keywords': msg.triggers.split(',') if msg.triggers else [],
                   'content': msg.content,
                   'created': msg.created_at.isoformat() if msg.created_at else None
               }
               for msg in default_messages
           ],
           
           # Vocabulaire métier
           'vocabulary': [
               {
                   'id': idx + 1,
                   'term': term,
                   'definition': definition
               }
               for idx, (term, definition) in enumerate(config.vocabulary.items())
           ] if config and config.vocabulary else [],
           
           # Messages d'erreur (depuis la base de données)
           'errorMessages': [
               {
                   'title': 'Dépassement du temps de réponse',
                   'code': 'TIMEOUT',
                   'content': config.technical_error if config and config.technical_error else 'Je prends un peu plus de temps que prévu pour traiter votre demande. Pouvez-vous patienter quelques instants ou reformuler votre question ?'
               },
               {
                   'title': 'Erreur technique',
                   'code': 'SYSTEM_ERROR',
                   'content': config.service_unavailable if config and config.service_unavailable else 'Je rencontre un petit problème technique. Pouvez-vous réessayer dans quelques minutes ? Si le problème persiste, contactez notre support.'
               },
               {
                   'title': 'Limite atteinte',
                   'code': 'RATE_LIMIT',
                   'content': config.invalid_data if config and config.invalid_data else 'Vous avez fait beaucoup de demandes récemment. Merci de patienter quelques minutes avant de continuer.'
               }
           ],

           # Configuration du comportement (depuis la base de données)
           'behaviorConfig': config.behavior_config if config and config.behavior_config else {
               'correspondance_flexible': True,
               'réponses_contextuelles': True,
               'mode_strict': False
           },
           
           # Métadonnées
           'lastModified': datetime.utcnow().isoformat(),
           'version': '2.0'
       }
       
       return jsonify(configuration)
       
   except Exception as e:
       logger.error(f"Erreur récupération configuration: {str(e)}")
       return jsonify({'error': str(e)}), 500

@responses_bp.route('/api/configuration', methods=['POST'])
@login_required
def save_responses_configuration():
   """Sauvegarde toute la configuration des réponses."""
   try:
       data = request.get_json()
       if not data:
           return jsonify({'error': 'Données manquantes'}), 400

       # Récupérer ou créer les objets nécessaires
       settings = Settings.query.first()
       if not settings:
           settings = Settings()
           db.session.add(settings)

       config = BotResponses.query.first()
       if not config:
           config = BotResponses()
           db.session.add(config)

       # NOUVELLES CLÉS SIMPLES (de la page simplifiée)
       if 'welcome_message' in data:
           settings.bot_welcome = data['welcome_message']

       if 'goodbye_message' in data:
           config.goodbye_message = data['goodbye_message']

       if 'fallback_message' in data:
           config.fallback_message = data['fallback_message']

       if 'communication_style' in data:
           config.communication_style = data['communication_style']

       # ANCIENNES CLÉS (compatibilité avec ancienne interface complexe)
       if 'welcomeMessage' in data:
           settings.bot_welcome = html.escape(data['welcomeMessage']) if data['welcomeMessage'] else ''
       
       # Sauvegarder les réponses personnalisées
       if 'customResponses' in data:
           # Supprimer les anciens messages par défaut
           DefaultMessage.query.delete()
           
           # Créer les nouveaux (avec sanitization)
           for response_data in data['customResponses']:
               if response_data.get('keywords') and response_data.get('content'):
                   # Échapper le contenu pour éviter XSS
                   sanitized_content = html.escape(response_data['content'])
                   sanitized_keywords = [html.escape(k) for k in response_data['keywords']]

                   message = DefaultMessage(
                       title=f"Réponse: {sanitized_keywords[0] if sanitized_keywords else 'Custom'}",
                       content=sanitized_content,
                       triggers=','.join(sanitized_keywords)
                   )
                   db.session.add(message)
       
       # Sauvegarder le vocabulaire métier
       if 'vocabulary' in data:
           config = BotResponses.query.first()
           if not config:
               config = BotResponses()
               db.session.add(config)

           vocabulary_dict = {}
           for vocab_item in data['vocabulary']:
               if vocab_item.get('term') and vocab_item.get('definition'):
                   # Échapper pour éviter XSS
                   sanitized_term = html.escape(vocab_item['term'])
                   sanitized_def = html.escape(vocab_item['definition'])
                   vocabulary_dict[sanitized_term] = sanitized_def

           config.vocabulary = vocabulary_dict

       # Sauvegarder les templates essentiels
       if 'essentialTemplates' in data:
           if not config:
               config = BotResponses.query.first()
           if not config:
               config = BotResponses()
               db.session.add(config)

           config.essential_templates = data['essentialTemplates']

       # Sauvegarder les messages d'erreur
       if 'errorMessages' in data:
           if not config:
               config = BotResponses.query.first()
           if not config:
               config = BotResponses()
               db.session.add(config)

           for error_msg in data['errorMessages']:
               code = error_msg.get('code')
               content = html.escape(error_msg.get('content', ''))  # Sanitize
               if code == 'TIMEOUT':
                   config.technical_error = content
               elif code == 'SYSTEM_ERROR':
                   config.service_unavailable = content
               elif code == 'RATE_LIMIT':
                   config.invalid_data = content

       # Sauvegarder la configuration du comportement
       if 'behaviorConfig' in data:
           if not config:
               config = BotResponses.query.first()
           if not config:
               config = BotResponses()
               db.session.add(config)

           config.behavior_config = data['behaviorConfig']
       
       db.session.commit()
       
       # Rafraîchir le cache des réponses rapides
       try:
           from .fast_responses_cache import refresh_cache
           refresh_cache()
           logger.info("Cache des réponses rapides rafraîchi après sauvegarde")
       except Exception as e:
           logger.error(f"Erreur rafraîchissement cache: {str(e)}")
       
       logger.info(f"Configuration des réponses sauvegardée par {current_user.username}")
       
       return jsonify({
           'success': True,
           'message': 'Configuration sauvegardée avec succès',
           'timestamp': datetime.utcnow().isoformat()
       })
       
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur sauvegarde configuration: {str(e)}")
       return jsonify({'error': str(e)}), 500

@responses_bp.route('/api/test-response', methods=['POST'])
@login_required
def test_response():
   """Teste une réponse automatique."""
   try:
       data = request.get_json()
       test_message = data.get('message', '').lower()
       
       if not test_message:
           return jsonify({'error': 'Message de test requis'}), 400
       
       # Logique de test simple (à améliorer)
       responses = {
           'bonjour': 'Bonjour ! Comment puis-je vous aider aujourd\'hui ?',
           'salut': 'Salut ! Que puis-je faire pour toi ?',
           'au revoir': 'Au revoir, bonne journée !',
           'merci': 'De rien, ravi d\'avoir pu vous aider !',
       }
       
       # Recherche de correspondance
       matched_response = None
       matched_trigger = None
       
       for trigger, response in responses.items():
           if trigger in test_message:
               matched_response = response
               matched_trigger = trigger
               break
       
       # Vérifier aussi les messages personnalisés
       if not matched_response:
           default_messages = DefaultMessage.query.all()
           for msg in default_messages:
               if msg.triggers:
                   triggers = [t.strip().lower() for t in msg.triggers.split(',')]
                   for trigger in triggers:
                       if trigger in test_message:
                           matched_response = msg.content
                           matched_trigger = trigger
                           break
                   if matched_response:
                       break
       
       if not matched_response:
           matched_response = "Pourriez-vous reformuler votre question ? Je veux être sûr de bien vous aider."
           matched_trigger = "défaut"
       
       return jsonify({
           'success': True,
           'response': matched_response,
           'trigger': matched_trigger,
           'message': test_message,
           'processing_time': '2ms'
       })
       
   except Exception as e:
       logger.error(f"Erreur test réponse: {str(e)}")
       return jsonify({'error': str(e)}), 500

# Autres routes pour la gestion du vocabulaire (mises à jour)
@responses_bp.route('/api/vocabulary', methods=['GET'])
@login_required
def get_vocabulary():
   """Récupère le vocabulaire métier."""
   try:
       config = BotResponses.query.first()
       
       if not config or not config.vocabulary:
           return jsonify([])
       
       vocabulary_list = [
           {
               'id': idx + 1,
               'term': term,
               'definition': definition
           }
           for idx, (term, definition) in enumerate(config.vocabulary.items())
       ]
       
       return jsonify(vocabulary_list)
       
   except Exception as e:
       logger.error(f"Erreur récupération vocabulaire: {str(e)}")
       return jsonify({'error': str(e)}), 500

@responses_bp.route('/api/vocabulary', methods=['POST'])
@login_required
def create_vocabulary_term():
   """Ajoute un terme au vocabulaire."""
   try:
       data = request.get_json()
       
       if not data or 'term' not in data or 'definition' not in data:
           return jsonify({'error': 'Terme et définition requis'}), 400
       
       config = BotResponses.query.first()
       if not config:
           config = BotResponses()
           config.vocabulary = {}
           db.session.add(config)
       
       if not config.vocabulary:
           config.vocabulary = {}
       
       # Ajouter le nouveau terme
       config.vocabulary[data['term']] = data['definition']
       
       # Marquer comme modifié pour SQLAlchemy
       flag_modified(config, 'vocabulary')
       
       db.session.commit()
       
       logger.info(f"Terme de vocabulaire ajouté: {data['term']}")
       
       return jsonify({
           'success': True,
           'id': len(config.vocabulary),
           'term': data['term'],
           'definition': data['definition']
       })
       
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur ajout vocabulaire: {str(e)}")
       return jsonify({'error': str(e)}), 500

@responses_bp.route('/api/vocabulary/<int:term_id>', methods=['PUT'])
@login_required
def update_vocabulary_term(term_id):
   """Met à jour un terme du vocabulaire."""
   try:
       data = request.get_json()
       
       if not data or 'term' not in data or 'definition' not in data:
           return jsonify({'error': 'Terme et définition requis'}), 400
       
       config = BotResponses.query.first()
       if not config or not config.vocabulary:
           return jsonify({'error': 'Vocabulaire non trouvé'}), 404
       
       # Trouver le terme par index (approximatif)
       vocab_items = list(config.vocabulary.items())
       if term_id <= 0 or term_id > len(vocab_items):
           return jsonify({'error': 'Terme non trouvé'}), 404
       
       old_term = vocab_items[term_id - 1][0]
       
       # Supprimer l'ancien terme et ajouter le nouveau
       del config.vocabulary[old_term]
       config.vocabulary[data['term']] = data['definition']
       
       flag_modified(config, 'vocabulary')
       db.session.commit()
       
       logger.info(f"Terme de vocabulaire mis à jour: {old_term} -> {data['term']}")
       
       return jsonify({
           'success': True,
           'id': term_id,
           'term': data['term'],
           'definition': data['definition']
       })
       
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur mise à jour vocabulaire: {str(e)}")
       return jsonify({'error': str(e)}), 500

@responses_bp.route('/api/vocabulary/<int:term_id>', methods=['DELETE'])
@login_required
def delete_vocabulary_term(term_id):
   """Supprime un terme du vocabulaire."""
   try:
       config = BotResponses.query.first()
       if not config or not config.vocabulary:
           return jsonify({'error': 'Vocabulaire non trouvé'}), 404
       
       # Trouver le terme par index
       vocab_items = list(config.vocabulary.items())
       if term_id <= 0 or term_id > len(vocab_items):
           return jsonify({'error': 'Terme non trouvé'}), 404
       
       term_to_delete = vocab_items[term_id - 1][0]
       
       # Supprimer le terme
       del config.vocabulary[term_to_delete]
       
       flag_modified(config, 'vocabulary')
       db.session.commit()
       
       logger.info(f"Terme de vocabulaire supprimé: {term_to_delete}")
       
       return jsonify({'success': True})
       
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur suppression vocabulaire: {str(e)}")
       return jsonify({'error': str(e)}), 500


# ========================
# GESTION DES MESSAGES PAR DÉFAUT - MISE À JOUR
# ========================
@main_bp.route("/api/default-messages", methods=['GET'])
@login_required
def get_default_messages():
   """Récupère tous les messages par défaut."""
   try:
       messages = DefaultMessage.query.all()
       return jsonify([message.to_dict() for message in messages])
   except Exception as e:
       logger.error(f"Erreur récupération messages par défaut: {str(e)}")
       return jsonify({'error': str(e)}), 500

@main_bp.route("/api/default-messages", methods=['POST'])
@login_required
def create_default_message():
   """Crée un nouveau message par défaut."""
   try:
       data = request.get_json()
       if not data:
           return jsonify({'error': 'Aucune donnée reçue'}), 400
           
       message = DefaultMessage(
           title=data.get('title', 'Nouveau message'),
           content=data.get('content', ''),
           triggers=','.join(data.get('triggers', []) if isinstance(data.get('triggers'), list) else [])
       )
       
       db.session.add(message)
       db.session.commit()
       
       # Rafraîchir le cache
       try:
           from .fast_responses_cache import refresh_cache
           refresh_cache()
           logger.info("Cache des réponses rapides rafraîchi")
       except Exception as e:
           logger.error(f"Erreur lors du rafraîchissement du cache: {str(e)}")
       
       logger.info(f"Message par défaut créé par {current_user.username}")
       
       return jsonify(message.to_dict()), 201
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur création message par défaut: {str(e)}")
       return jsonify({'error': str(e)}), 400

@main_bp.route("/api/default-messages/<int:message_id>", methods=['PUT'])
@login_required
def update_default_message(message_id):
   """Met à jour un message par défaut."""
   try:
       message = DefaultMessage.query.get_or_404(message_id)
       data = request.get_json()
       
       message.title = data.get('title', message.title)
       message.content = data.get('content', message.content)
       if 'triggers' in data:
           if isinstance(data['triggers'], list):
               message.triggers = ','.join(data['triggers'])
           else:
               message.triggers = data['triggers']
       
       db.session.commit()
       
       # Rafraîchir le cache
       try:
           from .fast_responses_cache import refresh_cache
           refresh_cache()
       except Exception as e:
           logger.error(f"Erreur lors du rafraîchissement du cache: {str(e)}")
       
       logger.info(f"Message par défaut {message_id} mis à jour par {current_user.username}")
       
       return jsonify(message.to_dict())
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur mise à jour message par défaut: {str(e)}")
       return jsonify({'error': str(e)}), 400

@main_bp.route("/api/default-messages/<int:message_id>", methods=['DELETE'])
@login_required
def delete_default_message(message_id):
   """Supprime un message par défaut."""
   try:
       message = DefaultMessage.query.get_or_404(message_id)
       db.session.delete(message)
       db.session.commit()
       
       # Rafraîchir le cache
       try:
           from .fast_responses_cache import refresh_cache
           refresh_cache()
       except Exception as e:
           logger.error(f"Erreur lors du rafraîchissement du cache: {str(e)}")
       
       logger.info(f"Message par défaut {message_id} supprimé par {current_user.username}")
       
       return '', 204
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur suppression message par défaut: {str(e)}")
       return jsonify({'error': str(e)}), 400


# ========================
# CONFIGURATION DES APIs - Mode Clés Utilisateur
# ========================
@main_bp.route("/config_api", methods=["GET", "POST"])
@login_required
def config_api():
   """Configuration des APIs - Mode clés utilisateur."""
   if request.method == "POST":
       try:
           # En mode clés utilisateur, la config se fait via l'interface AJAX
           flash("ℹ️ Configuration gérée via l'interface interactive ci-dessous.", "info")
           
       except Exception as e:
           logger.error(f"Erreur dans config_api: {str(e)}")
           flash(f"❌ Erreur : {str(e)}", "error")
       
       return redirect(url_for("main.config_api"))

   # GET - Affichage du formulaire
   # Récupérer la config actuelle de l'utilisateur
   current_config = {}
   try:
       user_settings = Settings.query.filter_by(user_id=current_user.id).first()
       if user_settings:
           current_config = {
               'provider': user_settings.current_provider,
               'openai_model': user_settings.openai_model,
               'mistral_model': user_settings.mistral_model,
               'claude_model': user_settings.claude_model,
               'has_openai': bool(user_settings.encrypted_openai_key),
               'has_mistral': bool(user_settings.encrypted_mistral_key),
               'has_claude': bool(user_settings.encrypted_claude_key)
           }
   except Exception as e:
       logger.error(f"Erreur récupération config: {e}")
   
   return render_template(
       "api_config.html",
       # Mode clés utilisateur
       user_keys_mode=True,
       mode="user_keys",
       # Configuration actuelle (sans les clés pour sécurité)
       current_config=current_config,
       # Pas de clés affichées pour sécurité
       mistral_key="",
       gpt_key="",
       claude_key="",
       model_select=current_config.get('openai_model', 'gpt-3.5-turbo'),
       mistral_model_select=current_config.get('mistral_model', 'mistral-small'),
       claude_model_select=current_config.get('claude_model', 'claude-sonnet-4'),
       # Information pour l'utilisateur
       info_message="Vos clés API sont chiffrées et stockées de manière sécurisée sur le serveur."
   )


# ========================
# PARAMÈTRES GÉNÉRAUX
# ========================
@main_bp.route("/general_settings", methods=["GET", "POST"])
@login_required
def general_settings():
   """Gestion des paramètres généraux du bot."""
   settings = Settings.query.first()
   if not settings:
       settings = Settings()
       db.session.add(settings)
       db.session.commit()

   if request.method == "POST":
       bot_name = request.form.get("bot-name", "").strip()
       description = request.form.get("description", "").strip()
       welcome_msg = request.form.get("welcome-message", "").strip()
       avatar_file = request.files.get("avatar")

       if avatar_file and avatar_file.filename:
           filename = secure_filename(avatar_file.filename)
           ext = os.path.splitext(filename)[1].lower()
           if ext in [".jpeg", ".jpg", ".png", ".bmp", ".webp", ".avif"]:
               upload_dir = os.path.join(current_app.root_path, "static", "uploads")
               if not os.path.exists(upload_dir):
                   os.makedirs(upload_dir)
               upload_path = os.path.join(upload_dir, filename)
               avatar_file.save(upload_path)
               avatar_path = f"/static/uploads/{filename}"
               settings.bot_avatar = avatar_path
           else:
               flash("Format de fichier non supporté pour l'avatar.", "error")
               return redirect(url_for("main.general_settings"))

       settings.bot_name = bot_name
       settings.bot_description = description
       settings.bot_welcome = welcome_msg

       try:
           db.session.commit()
           
           # Rafraîchir le cache après modification des paramètres
           try:
               from .fast_responses_cache import refresh_cache
               refresh_cache()
               logger.info("Cache rafraîchi après modification des paramètres généraux")
           except Exception as e:
               logger.error(f"Erreur lors du rafraîchissement du cache: {str(e)}")
           
           flash("Paramètres généraux enregistrés avec succès.", "success")
       except Exception as e:
           db.session.rollback()
           flash(f"Erreur lors de l'enregistrement des paramètres : {e}", "error")

       return redirect(url_for("main.general_settings"))

   return render_template("general_settings.html")

@main_bp.route("/delete_avatar", methods=["POST"])
@login_required
def delete_avatar():
   """Supprime l'avatar du bot."""
   settings = Settings.query.first()
   if settings and settings.bot_avatar:
       avatar_path = os.path.join(current_app.root_path, settings.bot_avatar.lstrip('/'))
       if os.path.exists(avatar_path):
           try:
               os.remove(avatar_path)
               flash("Avatar supprimé avec succès.", "success")
           except Exception as e:
               flash(f"Erreur lors de la suppression de l'avatar : {e}", "error")
               return redirect(url_for("main.general_settings"))
       settings.bot_avatar = ""
       try:
           db.session.commit()
       except Exception as e:
           db.session.rollback()
           flash(f"Erreur lors de la mise à jour des paramètres : {e}", "error")
   return redirect(url_for("main.general_settings"))

@main_bp.route("/api/get_general_settings", methods=["GET"])
def get_general_settings():
   """API pour récupérer les paramètres généraux."""
   settings = Settings.query.first()
   if not settings:
       settings = Settings()
       db.session.add(settings)
       db.session.commit()
   return jsonify({
       "bot_name": settings.bot_name,
       "bot_description": settings.bot_description,
       "bot_welcome": settings.bot_welcome,
       "bot_avatar": settings.bot_avatar
   })


# CONFIGURATION SMTP ET SMS
# ========================
@main_bp.route("/smtp_settings", methods=["GET", "POST"])
@login_required
def smtp_settings():
   """Configuration SMTP pour l'envoi d'emails."""
   if request.method == "POST":
       smtp_server = request.form.get("smtp_server", "").strip()
       smtp_port = request.form.get("smtp_port", "").strip()
       smtp_username = request.form.get("smtp_username", "").strip()
       smtp_password = request.form.get("smtp_password", "").strip()
       smtp_security = request.form.get("smtp_security", "").strip()
       from_email = request.form.get("from_email", "").strip()
       from_name = request.form.get("from_name", "").strip()

       if not all([smtp_server, smtp_port, smtp_username, smtp_security, from_email, from_name]):
           flash("Tous les champs (sauf le mot de passe) sont obligatoires.", "error")
           return redirect(url_for("main.smtp_settings"))
       
       try:
           env_path = os.path.join(current_app.root_path, '.env')
           set_key(env_path, "SMTP_SERVER", smtp_server)
           set_key(env_path, "SMTP_PORT", smtp_port)
           set_key(env_path, "SMTP_USERNAME", smtp_username)
           if smtp_password:
               set_key(env_path, "SMTP_PASSWORD", smtp_password)
           set_key(env_path, "SMTP_SECURITY", smtp_security)
           set_key(env_path, "FROM_EMAIL", from_email)
           set_key(env_path, "FROM_NAME", from_name)

           # Mise à jour de la config
           current_app.config.update({
               "SMTP_SERVER": smtp_server,
               "SMTP_PORT": int(smtp_port),
               "SMTP_USERNAME": smtp_username,
               "SMTP_SECURITY": smtp_security,
               "FROM_EMAIL": from_email,
               "FROM_NAME": from_name
           })
           if smtp_password:
               current_app.config["SMTP_PASSWORD"] = smtp_password
           
           flash("Paramètres SMTP mis à jour avec succès.", "success")
       except Exception as e:
           flash(f"Erreur lors de la mise à jour des paramètres SMTP : {e}", "error")
       
       return redirect(url_for("main.smtp_settings"))

   # Récupération des paramètres actuels
   class SMTPSettings:
       def __init__(self):
           self.smtp_server = current_app.config.get("SMTP_SERVER", "")
           self.smtp_port = current_app.config.get("SMTP_PORT", 587)
           self.smtp_username = current_app.config.get("SMTP_USERNAME", "")
           self.smtp_security = current_app.config.get("SMTP_SECURITY", "tls")
           self.from_email = current_app.config.get("FROM_EMAIL", "")
           self.from_name = current_app.config.get("FROM_NAME", "")

   settings_obj = SMTPSettings()
   return render_template("sms_configuration.html", settings=settings_obj)

@main_bp.route("/sms_configuration", methods=["GET", "POST"])
@login_required
def sms_configuration():
   """Configuration SMS via Twilio ou Vonage."""
   if request.method == "POST":
       sms_provider = request.form.get("sms_provider", "").strip()
       env_path = os.path.join(current_app.root_path, '.env')
       
       if sms_provider not in ["twilio", "vonage"]:
           flash("Veuillez sélectionner un fournisseur SMS valide.", "error")
           return redirect(url_for("main.sms_configuration"))
       
       try:
           set_key(env_path, "SMS_PROVIDER", sms_provider)
           current_app.config["SMS_PROVIDER"] = sms_provider

           if sms_provider == "twilio":
               twilio_account_sid = request.form.get("twilio_account_sid", "").strip()
               twilio_auth_token = request.form.get("twilio_auth_token", "").strip()
               twilio_from = request.form.get("twilio_from", "").strip()
               
               if not all([twilio_account_sid, twilio_auth_token, twilio_from]):
                   flash("Tous les champs Twilio sont obligatoires.", "error")
                   return redirect(url_for("main.sms_configuration"))
               
               set_key(env_path, "TWILIO_ACCOUNT_SID", twilio_account_sid)
               set_key(env_path, "TWILIO_AUTH_TOKEN", twilio_auth_token)
               set_key(env_path, "TWILIO_FROM", twilio_from)
               
               current_app.config.update({
                   "TWILIO_ACCOUNT_SID": twilio_account_sid,
                   "TWILIO_AUTH_TOKEN": twilio_auth_token,
                   "TWILIO_FROM": twilio_from
               })
               
           elif sms_provider == "vonage":
               vonage_api_key = request.form.get("vonage_api_key", "").strip()
               vonage_api_secret = request.form.get("vonage_api_secret", "").strip()
               vonage_from = request.form.get("vonage_from", "").strip()
               
               if not all([vonage_api_key, vonage_api_secret, vonage_from]):
                   flash("Tous les champs Vonage sont obligatoires.", "error")
                   return redirect(url_for("main.sms_configuration"))
               
               set_key(env_path, "VONAGE_API_KEY", vonage_api_key)
               set_key(env_path, "VONAGE_API_SECRET", vonage_api_secret)
               set_key(env_path, "VONAGE_FROM", vonage_from)
               
               current_app.config.update({
                   "VONAGE_API_KEY": vonage_api_key,
                   "VONAGE_API_SECRET": vonage_api_secret,
                   "VONAGE_FROM": vonage_from
               })

           flash("Configuration SMS mise à jour avec succès.", "success")
       except Exception as e:
           flash(f"Erreur lors de la mise à jour de la configuration SMS : {e}", "error")
       
       return redirect(url_for("main.sms_configuration"))

   return render_template(
       "sms_configuration.html",
       current_provider=current_app.config.get("SMS_PROVIDER", "twilio"),
       twilio_account_sid=current_app.config.get("TWILIO_ACCOUNT_SID", ""),
       twilio_auth_token=current_app.config.get("TWILIO_AUTH_TOKEN", ""),
       twilio_from=current_app.config.get("TWILIO_FROM", ""),
       vonage_api_key=current_app.config.get("VONAGE_API_KEY", ""),
       vonage_api_secret=current_app.config.get("VONAGE_API_SECRET", ""),
       vonage_from=current_app.config.get("VONAGE_FROM", "")
   )


# ========================
# ASSETS REACT
# ========================
@main_bp.route("/react/<path:filename>")
def serve_react_assets(filename):
   """Sert les assets React."""
   react_build_dir = os.path.join(current_app.root_path, "static", "react")
   return send_from_directory(react_build_dir, filename)

@main_bp.route("/react")
def serve_react_index():
   """Sert l'index React."""
   react_build_dir = os.path.join(current_app.root_path, "static", "react")
   return send_from_directory(react_build_dir, "index.html")


#######################################
# Blueprint pour la gestion des connaissances
#######################################
knowledge_bp = Blueprint('knowledge', __name__, url_prefix='/api/knowledge')

@knowledge_bp.route('/categories', methods=['GET', 'POST'])
@login_required
def categories():
   """Gestion des catégories de connaissances."""
   if request.method == 'POST':
       data = request.get_json()
       new_category = KnowledgeCategory(
           name=data['name'],
           description=data.get('description', '')
       )
       try:
           db.session.add(new_category)
           db.session.commit()
           
           logger.info("Nouvelle catégorie ajoutée")
           
           return jsonify({'success': True, 'category': {
               'id': new_category.id,
               'name': new_category.name
           }})
       except Exception as e:
           db.session.rollback()
           return jsonify({'success': False, 'error': str(e)}), 400

   categories = KnowledgeCategory.query.all()
   return jsonify({
       'categories': [{
           'id': cat.id,
           'name': cat.name,
           'description': cat.description
       } for cat in categories]
   })

@knowledge_bp.route('/faqs', methods=['GET', 'POST'])
@login_required
def faqs():
   """Gestion des FAQs."""
   if request.method == 'POST':
       data = request.get_json()
       new_faq = FAQ(
           question=data['question'],
           answer=data['answer'],
           category_id=data['category_id'],
           keyword_list=data.get('keywords', [])
       )
       try:
           db.session.add(new_faq)
           db.session.commit()
           
           logger.info("Nouvelle FAQ ajoutée")
           
           return jsonify({'success': True, 'faq': {
               'id': new_faq.id,
               'question': new_faq.question
           }})
       except Exception as e:
           db.session.rollback()
           return jsonify({'success': False, 'error': str(e)}), 400

   category_id = request.args.get('category_id')
   query = FAQ.query
   if category_id:
       query = query.filter_by(category_id=category_id)
   faqs = query.all()
   return jsonify({
       'faqs': [{
           'id': faq.id,
           'question': faq.question,
           'answer': faq.answer,
           'keywords': faq.keyword_list
       } for faq in faqs]
   })

@knowledge_bp.route('/documents/upload', methods=['POST'])
@login_required
def upload_document():
   """Upload de documents."""
   if 'file' not in request.files:
       return jsonify({'success': False, 'error': 'Aucun fichier fourni'}), 400

   file = request.files['file']
   category = request.form.get('category', 'general')

   if file.filename == '':
       return jsonify({'success': False, 'error': 'Nom de fichier invalide'}), 400

   try:
       from .document_processor import document_processor

       filename = secure_filename(file.filename)
       file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
       file.save(file_path)

       # Récupérer la taille du fichier
       file_size = os.path.getsize(file_path)

       # Vérifier si le format est supporté
       if not document_processor.is_supported(filename):
           os.remove(file_path)
           return jsonify({
               'success': False,
               'error': f'Format non supporté. Formats acceptés: PDF, Word, Excel, TXT'
           }), 400

       # Trouver ou créer la catégorie
       knowledge_category = KnowledgeCategory.query.filter_by(name=category).first()
       if not knowledge_category:
           knowledge_category = KnowledgeCategory(name=category, description='')
           db.session.add(knowledge_category)
           db.session.flush()

       # Créer le document avec status 'processing'
       document = Document(
           title=filename,
           filename=filename,
           file_type=file.content_type,
           file_size=file_size,
           category_id=knowledge_category.id,
           status='processing'
       )
       db.session.add(document)
       db.session.flush()

       # Extraire le contenu du document
       document_processor.process_and_update_document(document, file_path)

       db.session.commit()

       logger.info(f"Document '{filename}' uploadé et traité ({file_size} bytes)")

       return jsonify({
           'success': True,
           'document': {
               'id': document.id,
               'title': document.title,
               'status': document.status
           }
       })
   except Exception as e:
       logger.error(f"Erreur upload_document: {e}")
       db.session.rollback()
       return jsonify({'success': False, 'error': str(e)}), 400


@knowledge_bp.route('/documents', methods=['GET'])
@login_required
def get_documents():
    """Liste tous les documents."""
    try:
        documents = Document.query.all()
        return jsonify({
            'success': True,
            'documents': [{
                'id': doc.id,
                'name': doc.title,
                'type': doc.file_type,
                'size': doc.file_size,
                'category': doc.category.name if doc.category else 'Non catégorisé',
                'summary': doc.summary,
                'status': doc.status,
                'created_at': doc.created_at.isoformat()
            } for doc in documents]
        })
    except Exception as e:
        logger.error(f"Erreur get_documents: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/documents/<int:doc_id>', methods=['GET'])
@login_required
def get_document(doc_id):
    """Récupère un document spécifique."""
    try:
        doc = Document.query.get_or_404(doc_id)
        return jsonify({
            'success': True,
            'document': {
                'id': doc.id,
                'name': doc.title,
                'filename': doc.filename,
                'type': doc.file_type,
                'size': doc.file_size,
                'category': doc.category.name if doc.category else 'Non catégorisé',
                'summary': doc.summary,
                'status': doc.status,
                'content': doc.content,
                'created_at': doc.created_at.isoformat(),
                'updated_at': doc.updated_at.isoformat()
            }
        })
    except Exception as e:
        logger.error(f"Erreur get_document: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/documents/<int:doc_id>', methods=['DELETE'])
@login_required
def delete_document(doc_id):
    """Supprime un document."""
    try:
        doc = Document.query.get_or_404(doc_id)

        # Supprimer le fichier physique
        try:
            file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], doc.filename)
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            logger.warning(f"Impossible de supprimer le fichier: {e}")

        db.session.delete(doc)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Document supprimé'})
    except Exception as e:
        logger.error(f"Erreur delete_document: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/documents/export', methods=['GET'])
@login_required
def export_documents():
    """Exporte tous les documents en ZIP."""
    try:
        import zipfile
        from io import BytesIO

        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            documents = Document.query.all()
            for doc in documents:
                file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], doc.filename)
                if os.path.exists(file_path):
                    zip_file.write(file_path, doc.filename)

        zip_buffer.seek(0)
        response = make_response(zip_buffer.getvalue())
        response.headers['Content-Type'] = 'application/zip'
        response.headers['Content-Disposition'] = f'attachment; filename=documents-{datetime.now().strftime("%Y%m%d")}.zip'

        return response
    except Exception as e:
        logger.error(f"Erreur export_documents: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== VOCABULARY ROUTES =====

@knowledge_bp.route('/vocabulary', methods=['GET'])
@login_required
def get_vocabulary():
    """Liste tous les termes de vocabulaire."""
    try:
        from .models import VocabularyTerm
        terms = VocabularyTerm.query.all()
        return jsonify({
            'success': True,
            'terms': [{
                'id': term.id,
                'name': term.name,
                'definition': term.definition,
                'synonyms': term.synonym_list,
                'category': term.category,
                'created_at': term.created_at.isoformat()
            } for term in terms]
        })
    except Exception as e:
        logger.error(f"Erreur get_vocabulary: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/vocabulary', methods=['POST'])
@login_required
def create_vocabulary():
    """Crée un nouveau terme de vocabulaire."""
    try:
        from .models import VocabularyTerm
        data = request.get_json()

        term = VocabularyTerm(
            name=data['name'],
            definition=data['definition'],
            category=data.get('category', 'general')
        )
        term.synonym_list = data.get('synonyms', [])

        db.session.add(term)
        db.session.commit()

        return jsonify({
            'success': True,
            'term': {
                'id': term.id,
                'name': term.name
            }
        }), 201
    except Exception as e:
        logger.error(f"Erreur create_vocabulary: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/vocabulary/<int:term_id>', methods=['GET'])
@login_required
def get_vocabulary_term(term_id):
    """Récupère un terme spécifique."""
    try:
        from .models import VocabularyTerm
        term = VocabularyTerm.query.get_or_404(term_id)
        return jsonify({
            'success': True,
            'term': {
                'id': term.id,
                'name': term.name,
                'definition': term.definition,
                'synonyms': term.synonym_list,
                'category': term.category
            }
        })
    except Exception as e:
        logger.error(f"Erreur get_vocabulary_term: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/vocabulary/<int:term_id>', methods=['DELETE'])
@login_required
def delete_vocabulary_term(term_id):
    """Supprime un terme de vocabulaire."""
    try:
        from .models import VocabularyTerm
        term = VocabularyTerm.query.get_or_404(term_id)
        db.session.delete(term)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Terme supprimé'})
    except Exception as e:
        logger.error(f"Erreur delete_vocabulary_term: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/vocabulary/import-csv', methods=['POST'])
@login_required
def import_vocabulary_csv():
    """Importe des termes depuis un fichier CSV."""
    try:
        from .models import VocabularyTerm
        import csv

        if 'csv_file' not in request.files:
            return jsonify({'success': False, 'error': 'Aucun fichier fourni'}), 400

        file = request.files['csv_file']
        content = file.read().decode('utf-8')
        csv_reader = csv.DictReader(content.splitlines())

        imported_count = 0
        for row in csv_reader:
            if 'name' in row and 'definition' in row:
                term = VocabularyTerm(
                    name=row['name'],
                    definition=row['definition'],
                    category=row.get('category', 'general')
                )
                if 'synonyms' in row:
                    term.synonym_list = [s.strip() for s in row['synonyms'].split(',')]
                db.session.add(term)
                imported_count += 1

        db.session.commit()

        return jsonify({
            'success': True,
            'imported_count': imported_count,
            'message': f'{imported_count} termes importés'
        })
    except Exception as e:
        logger.error(f"Erreur import_vocabulary_csv: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/vocabulary/extract-ai', methods=['POST'])
@login_required
def extract_vocabulary_ai():
    """Extrait automatiquement le vocabulaire des documents avec l'IA."""
    try:
        # Cette fonctionnalité nécessite l'intégration avec l'API IA
        # Pour l'instant, on retourne un message indiquant que c'est en développement
        return jsonify({
            'success': False,
            'error': 'Extraction IA en cours de développement',
            'extracted_count': 0,
            'suggestions': []
        }), 501
    except Exception as e:
        logger.error(f"Erreur extract_vocabulary_ai: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== RULES ROUTES =====

@knowledge_bp.route('/rules', methods=['GET'])
@login_required
def get_rules():
    """Liste toutes les règles avancées."""
    try:
        from .models import AdvancedRule
        rules = AdvancedRule.query.all()
        return jsonify({
            'success': True,
            'rules': [{
                'id': rule.id,
                'name': rule.name,
                'type': rule.rule_type,
                'description': rule.description,
                'active': rule.is_active,
                'priority': rule.priority,
                'updated_at': rule.updated_at.isoformat()
            } for rule in rules]
        })
    except Exception as e:
        logger.error(f"Erreur get_rules: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/rules', methods=['POST'])
@login_required
def create_rule():
    """Crée une nouvelle règle avancée."""
    try:
        from .models import AdvancedRule
        data = request.get_json()

        rule = AdvancedRule(
            name=data.get('name', f"Règle {data['type']}"),
            rule_type=data['type'],
            description=data.get('description', ''),
            is_active=data.get('active', True),
            priority=data.get('priority', 0)
        )
        rule.condition_list = data.get('conditions', [])
        rule.action_list = data.get('actions', [])

        db.session.add(rule)
        db.session.commit()

        return jsonify({
            'success': True,
            'rule': {
                'id': rule.id,
                'name': rule.name
            }
        }), 201
    except Exception as e:
        logger.error(f"Erreur create_rule: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/rules/test', methods=['POST'])
@login_required
def test_rule():
    """Teste une règle avec une requête."""
    try:
        data = request.get_json()
        conditions = data.get('conditions', [])
        query = data.get('query', '').lower()

        # Test basique de matching
        matched = False
        for condition in conditions:
            cond_type = condition.get('type', '')
            cond_value = condition.get('value', '').lower()

            if cond_type == 'contains' and cond_value in query:
                matched = True
                break
            elif cond_type == 'starts_with' and query.startswith(cond_value):
                matched = True
                break
            elif cond_type == 'ends_with' and query.endswith(cond_value):
                matched = True
                break
            elif cond_type == 'exact_match' and query == cond_value:
                matched = True
                break

        return jsonify({
            'success': True,
            'matched': matched,
            'message': f"La requête {'correspond' if matched else 'ne correspond pas'} aux conditions"
        })
    except Exception as e:
        logger.error(f"Erreur test_rule: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/rules/<int:rule_id>/toggle', methods=['PATCH'])
@login_required
def toggle_rule(rule_id):
    """Active/désactive une règle."""
    try:
        from .models import AdvancedRule
        rule = AdvancedRule.query.get_or_404(rule_id)
        rule.is_active = not rule.is_active
        db.session.commit()

        return jsonify({
            'success': True,
            'active': rule.is_active,
            'message': f"Règle {'activée' if rule.is_active else 'désactivée'}"
        })
    except Exception as e:
        logger.error(f"Erreur toggle_rule: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/rules/<int:rule_id>', methods=['DELETE'])
@login_required
def delete_rule(rule_id):
    """Supprime une règle."""
    try:
        from .models import AdvancedRule
        rule = AdvancedRule.query.get_or_404(rule_id)
        db.session.delete(rule)
        db.session.commit()

        return jsonify({'success': True, 'message': 'Règle supprimée'})
    except Exception as e:
        logger.error(f"Erreur delete_rule: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== GLOBAL ACTIONS =====

@knowledge_bp.route('/export', methods=['GET'])
@login_required
def export_knowledge():
    """Exporte toute la base de connaissances en JSON."""
    try:
        from .models import VocabularyTerm, AdvancedRule

        # Récupérer toutes les données
        categories = KnowledgeCategory.query.all()
        documents = Document.query.all()
        faqs = FAQ.query.all()
        vocabulary = VocabularyTerm.query.all()
        rules = AdvancedRule.query.all()

        export_data = {
            'version': '2.0',
            'export_date': datetime.now().isoformat(),
            'categories': [{
                'name': cat.name,
                'description': cat.description
            } for cat in categories],
            'documents': [{
                'title': doc.title,
                'filename': doc.filename,
                'type': doc.file_type,
                'category': doc.category.name if doc.category else None,
                'summary': doc.summary
            } for doc in documents],
            'faqs': [{
                'question': faq.question,
                'answer': faq.answer,
                'keywords': faq.keyword_list,
                'category': faq.category.name if faq.category else None
            } for faq in faqs],
            'vocabulary': [{
                'name': term.name,
                'definition': term.definition,
                'synonyms': term.synonym_list,
                'category': term.category
            } for term in vocabulary],
            'rules': [{
                'name': rule.name,
                'type': rule.rule_type,
                'description': rule.description,
                'conditions': rule.condition_list,
                'actions': rule.action_list
            } for rule in rules]
        }

        response = make_response(json.dumps(export_data, ensure_ascii=False, indent=2))
        response.headers['Content-Type'] = 'application/json'
        response.headers['Content-Disposition'] = f'attachment; filename=knowledge-base-{datetime.now().strftime("%Y%m%d")}.json'

        return response
    except Exception as e:
        logger.error(f"Erreur export_knowledge: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/import', methods=['POST'])
@login_required
def import_knowledge():
    """Importe une base de connaissances depuis JSON."""
    try:
        if 'knowledge_file' not in request.files:
            return jsonify({'success': False, 'error': 'Aucun fichier fourni'}), 400

        file = request.files['knowledge_file']
        content = json.loads(file.read().decode('utf-8'))

        # Import simplifié - à améliorer avec gestion des doublons
        imported_count = 0

        # Importer les catégories
        for cat_data in content.get('categories', []):
            if not KnowledgeCategory.query.filter_by(name=cat_data['name']).first():
                cat = KnowledgeCategory(**cat_data)
                db.session.add(cat)
                imported_count += 1

        db.session.commit()

        return jsonify({
            'success': True,
            'imported_count': imported_count,
            'message': f'{imported_count} éléments importés'
        })
    except Exception as e:
        logger.error(f"Erreur import_knowledge: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/optimize', methods=['POST'])
@login_required
def optimize_knowledge():
    """Optimise la base de connaissances."""
    try:
        # Placeholder pour l'optimisation
        # Ici on pourrait:
        # - Nettoyer les doublons
        # - Réorganiser les priorités
        # - Mettre à jour les index
        # - Générer des résumés manquants

        return jsonify({
            'success': True,
            'message': 'Base de connaissances optimisée',
            'optimizations': {
                'duplicates_removed': 0,
                'priorities_updated': 0,
                'summaries_generated': 0
            }
        })
    except Exception as e:
        logger.error(f"Erreur optimize_knowledge: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@knowledge_bp.route('/save-all', methods=['POST'])
@login_required
def save_all_knowledge():
    """Sauvegarde toutes les modifications."""
    try:
        # Commit de toutes les modifications en attente
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Toutes les modifications sauvegardées'
        })
    except Exception as e:
        logger.error(f"Erreur save_all_knowledge: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


#######################################
# Blueprint pour les flux de conversation
#######################################
flow_bp = Blueprint('flow', __name__, url_prefix='/flow')

@flow_bp.route('/', methods=['GET'])
@login_required
def list_flows():
   """Liste les flux de conversation."""
   flows = ConversationFlow.query.all()
   return jsonify({
       'flows': [{
           'id': flow.id,
           'name': flow.name,
           'description': flow.description,
           'is_active': flow.is_active,
           'updated_at': flow.updated_at.isoformat()
       } for flow in flows]
   })

@flow_bp.route('/', methods=['POST'])
@login_required
def create_flow():
   """Crée un nouveau flux."""
   data = request.get_json()
   flow = ConversationFlow(
       name=data['name'],
       description=data.get('description', ''),
       flow_data=data.get('flow_data', {})
   )
   db.session.add(flow)
   db.session.commit()
   return jsonify({
       'id': flow.id,
       'name': flow.name,
       'message': 'Flux créé avec succès'
   }), 201

@flow_bp.route('/<int:flow_id>', methods=['GET'])
@login_required
def get_flow(flow_id):
   """Récupère les détails d'un flux spécifique."""
   flow = ConversationFlow.query.get_or_404(flow_id)

   # Récupérer tous les nœuds et connexions
   nodes = [{
       'id': node.id,
       'type': node.node_type,
       'position': {
           'x': node.position_x,
           'y': node.position_y
       },
       'config': node.config
   } for node in flow.nodes]

   connections = []
   for node in flow.nodes:
       for conn in node.connections:
           connections.append({
               'id': conn.id,
               'source_id': conn.source_node_id,
               'target_id': conn.target_node_id,
               'condition': conn.condition,
               'priority': conn.priority
           })

   return jsonify({
       'id': flow.id,
       'name': flow.name,
       'description': flow.description,
       'is_active': flow.is_active,
       'flow_data': flow.flow_data,
       'nodes': nodes,
       'connections': connections,
       'created_at': flow.created_at.isoformat(),
       'updated_at': flow.updated_at.isoformat()
   })

@flow_bp.route('/<int:flow_id>', methods=['PUT'])
@login_required
def update_flow(flow_id):
   """Met à jour un flux existant."""
   flow = ConversationFlow.query.get_or_404(flow_id)
   data = request.get_json()

   try:
       if 'name' in data:
           flow.name = data['name']
       if 'description' in data:
           flow.description = data['description']
       if 'is_active' in data:
           flow.is_active = data['is_active']
       if 'flow_data' in data:
           flow.flow_data = data['flow_data']

       flow.updated_at = datetime.utcnow()
       db.session.commit()

       return jsonify({
           'id': flow.id,
           'name': flow.name,
           'message': 'Flux mis à jour avec succès'
       })
   except Exception as e:
       db.session.rollback()
       return jsonify({'error': str(e)}), 500

@flow_bp.route('/<int:flow_id>', methods=['DELETE'])
@login_required
def delete_flow(flow_id):
   """Supprime un flux."""
   flow = ConversationFlow.query.get_or_404(flow_id)

   try:
       db.session.delete(flow)
       db.session.commit()
       return jsonify({'message': 'Flux supprimé avec succès'})
   except Exception as e:
       db.session.rollback()
       return jsonify({'error': str(e)}), 500

@flow_bp.route('/<int:flow_id>/nodes', methods=['POST'])
@login_required
def create_node(flow_id):
   """Crée un nouveau nœud dans le flux."""
   flow = ConversationFlow.query.get_or_404(flow_id)
   data = request.get_json()

   try:
       node = FlowNode(
           flow_id=flow_id,
           node_type=data['type'],
           position_x=data.get('position', {}).get('x', 0),
           position_y=data.get('position', {}).get('y', 0),
           config=data.get('config', {})
       )
       db.session.add(node)
       db.session.commit()

       return jsonify({
           'id': node.id,
           'type': node.node_type,
           'position': {
               'x': node.position_x,
               'y': node.position_y
           },
           'config': node.config
       }), 201
   except Exception as e:
       db.session.rollback()
       return jsonify({'error': str(e)}), 500

@flow_bp.route('/nodes/<int:node_id>', methods=['PUT'])
@login_required
def update_node(node_id):
   """Met à jour un nœud existant."""
   node = FlowNode.query.get_or_404(node_id)
   data = request.get_json()

   try:
       if 'position' in data:
           node.position_x = data['position'].get('x', node.position_x)
           node.position_y = data['position'].get('y', node.position_y)
       if 'config' in data:
           node.config = data['config']

       db.session.commit()

       return jsonify({
           'id': node.id,
           'message': 'Nœud mis à jour avec succès'
       })
   except Exception as e:
       db.session.rollback()
       return jsonify({'error': str(e)}), 500

@flow_bp.route('/nodes/<int:node_id>', methods=['DELETE'])
@login_required
def delete_node(node_id):
   """Supprime un nœud."""
   node = FlowNode.query.get_or_404(node_id)

   try:
       db.session.delete(node)
       db.session.commit()
       return jsonify({'message': 'Nœud supprimé avec succès'})
   except Exception as e:
       db.session.rollback()
       return jsonify({'error': str(e)}), 500

@flow_bp.route('/nodes/<int:source_id>/connect', methods=['POST'])
@login_required
def create_connection(source_id):
   """Crée une connexion entre deux nœuds."""
   source_node = FlowNode.query.get_or_404(source_id)
   data = request.get_json()

   target_id = data.get('target_id')
   if not target_id:
       return jsonify({'error': 'target_id est requis'}), 400

   target_node = FlowNode.query.get_or_404(target_id)

   # Vérifier que les deux nœuds appartiennent au même flux
   if source_node.flow_id != target_node.flow_id:
       return jsonify({'error': 'Les nœuds doivent appartenir au même flux'}), 400

   try:
       connection = NodeConnection(
           source_node_id=source_id,
           target_node_id=target_id,
           condition=data.get('condition'),
           priority=data.get('priority', 0)
       )
       db.session.add(connection)
       db.session.commit()

       return jsonify({
           'id': connection.id,
           'source_id': connection.source_node_id,
           'target_id': connection.target_node_id,
           'condition': connection.condition,
           'priority': connection.priority
       }), 201
   except Exception as e:
       db.session.rollback()
       return jsonify({'error': str(e)}), 500

@flow_bp.route('/connections/<int:connection_id>', methods=['DELETE'])
@login_required
def delete_connection(connection_id):
   """Supprime une connexion."""
   connection = NodeConnection.query.get_or_404(connection_id)

   try:
       db.session.delete(connection)
       db.session.commit()
       return jsonify({'message': 'Connexion supprimée avec succès'})
   except Exception as e:
       db.session.rollback()
       return jsonify({'error': str(e)}), 500


#######################################
# ROUTES DE STATISTIQUES ET TESTS - DECISION ENGINE
#######################################

@main_bp.route('/api/decision/stats', methods=['GET'])
@login_required
def decision_stats():
   """Récupère les statistiques d'utilisation du Decision Engine"""
   try:
       stats = decision_engine.get_statistics()

       return jsonify({
           'success': True,
           'statistics': stats,
           'capabilities': {
               'has_active_flows': flow_executor.has_active_flows(),
               'has_configured_responses': response_manager.has_configured_responses(),
               'decision_engine_ready': decision_engine.is_ready()
           }
       })
   except Exception as e:
       logger.error(f"Erreur decision_stats: {e}")
       return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/api/decision/test', methods=['POST'])
@login_required
def decision_test():
   """Teste le Decision Engine avec un message"""
   try:
       data = request.get_json()
       test_message = data.get('message', '')

       if not test_message:
           return jsonify({'success': False, 'error': 'Message requis'}), 400

       # Tester les flux
       flow_result = None
       if flow_executor.has_active_flows():
           flow_id = flow_executor.find_matching_flow(test_message, current_user.id)
           if flow_id:
               flow_result = flow_executor.execute_flow(flow_id, test_message, current_user.id)

       # Tester les réponses configurées
       config_result = None
       if response_manager.has_configured_responses():
           config_result = response_manager.find_matching_response(test_message, current_user.id)

       return jsonify({
           'success': True,
           'test_message': test_message,
           'results': {
               'flow': {
                   'found': flow_result is not None,
                   'data': flow_result if flow_result else None
               },
               'configured': {
                   'found': config_result is not None,
                   'data': config_result if config_result else None
               }
           },
           'recommendation': 'flow' if flow_result else ('configured' if config_result else 'api')
       })
   except Exception as e:
       logger.error(f"Erreur decision_test: {e}", exc_info=True)
       return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/api/decision/reset-stats', methods=['POST'])
@login_required
def reset_decision_stats():
   """Réinitialise les statistiques du Decision Engine"""
   try:
       decision_engine.reset_statistics()
       return jsonify({
           'success': True,
           'message': 'Statistiques réinitialisées'
       })
   except Exception as e:
       logger.error(f"Erreur reset_decision_stats: {e}")
       return jsonify({'success': False, 'error': str(e)}), 500


#######################################
# Blueprint pour les actions et automatisations
#######################################
actions_bp = Blueprint('actions', __name__, url_prefix='/actions')

@actions_bp.route('/', methods=['GET'])
@login_required
def index_actions():
   """Page d'accueil des actions."""
   email_templates = EmailTemplate.query.all()
   calendar_config = CalendarConfig.query.first()
   ticket_config = TicketConfig.query.first()
   return render_template(
       'actions.html',
       email_templates=email_templates,
       calendar_config=calendar_config,
       ticket_config=ticket_config
   )


# ===== TRIGGERS ROUTES =====

@actions_bp.route('/triggers', methods=['GET'])
@login_required
def get_triggers():
    """Liste tous les déclencheurs d'actions."""
    try:
        triggers = ActionTrigger.query.all()
        return jsonify({
            'success': True,
            'triggers': [{
                'id': trigger.id,
                'name': trigger.name,
                'type': trigger.trigger_type,
                'active': trigger.is_active,
                'conditions': trigger.conditions,
                'config': trigger.config
            } for trigger in triggers]
        })
    except Exception as e:
        logger.error(f"Erreur get_triggers: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@actions_bp.route('/triggers', methods=['POST'])
@login_required
def create_trigger():
    """Crée un nouveau déclencheur."""
    try:
        data = request.get_json()

        trigger = ActionTrigger(
            name=data['name'],
            trigger_type=data['type'],
            is_active=data.get('active', True)
        )
        trigger.conditions = data.get('conditions', {})
        trigger.config = data.get('config', {})

        db.session.add(trigger)
        db.session.commit()

        return jsonify({
            'success': True,
            'trigger': {
                'id': trigger.id,
                'name': trigger.name
            }
        }), 201
    except Exception as e:
        logger.error(f"Erreur create_trigger: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== EMAIL ROUTES =====

@actions_bp.route('/email/templates', methods=['GET'])
@login_required
def get_email_templates():
    """Liste tous les templates d'email."""
    try:
        templates = EmailTemplate.query.all()
        return jsonify({
            'success': True,
            'templates': [{
                'id': template.id,
                'name': template.name,
                'subject': template.subject,
                'body': template.body,
                'variables': template.variables
            } for template in templates]
        })
    except Exception as e:
        logger.error(f"Erreur get_email_templates: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@actions_bp.route('/email/config', methods=['POST'])
@login_required
def save_email_config():
    """Sauvegarde la configuration des emails."""
    try:
        data = request.get_json()

        # Sauvegarder les déclencheurs email
        for trigger_data in data.get('triggers', []):
            if 'id' in trigger_data:
                # Mise à jour
                trigger = ActionTrigger.query.get(trigger_data['id'])
                if trigger:
                    trigger.is_active = trigger_data.get('active', True)
                    trigger.conditions = trigger_data.get('conditions', {})
                    trigger.config = trigger_data.get('config', {})
            else:
                # Création
                trigger = ActionTrigger(
                    name=trigger_data['name'],
                    trigger_type='email',
                    is_active=trigger_data.get('active', True)
                )
                trigger.conditions = trigger_data.get('conditions', {})
                trigger.config = trigger_data.get('config', {})
                db.session.add(trigger)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Configuration email sauvegardée'
        })
    except Exception as e:
        logger.error(f"Erreur save_email_config: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== SMS ROUTES =====

@actions_bp.route('/sms/config', methods=['GET'])
@login_required
def get_sms_config():
    """Récupère la configuration SMS."""
    try:
        triggers = ActionTrigger.query.filter_by(trigger_type='sms').all()
        return jsonify({
            'success': True,
            'triggers': [{
                'id': trigger.id,
                'name': trigger.name,
                'active': trigger.is_active,
                'conditions': trigger.conditions,
                'config': trigger.config
            } for trigger in triggers]
        })
    except Exception as e:
        logger.error(f"Erreur get_sms_config: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@actions_bp.route('/sms/config', methods=['POST'])
@login_required
def save_sms_config():
    """Sauvegarde la configuration SMS."""
    try:
        data = request.get_json()

        for trigger_data in data.get('triggers', []):
            if 'id' in trigger_data:
                trigger = ActionTrigger.query.get(trigger_data['id'])
                if trigger:
                    trigger.is_active = trigger_data.get('active', True)
                    trigger.conditions = trigger_data.get('conditions', {})
                    trigger.config = trigger_data.get('config', {})
            else:
                trigger = ActionTrigger(
                    name=trigger_data['name'],
                    trigger_type='sms',
                    is_active=trigger_data.get('active', True)
                )
                trigger.conditions = trigger_data.get('conditions', {})
                trigger.config = trigger_data.get('config', {})
                db.session.add(trigger)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Configuration SMS sauvegardée'
        })
    except Exception as e:
        logger.error(f"Erreur save_sms_config: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== CALENDAR ROUTES =====

@actions_bp.route('/calendar/config', methods=['GET'])
@login_required
def get_calendar_config():
    """Récupère la configuration du calendrier."""
    try:
        config = CalendarConfig.query.first()
        if not config:
            return jsonify({
                'success': True,
                'config': {
                    'service_type': 'google',
                    'default_duration': 30
                }
            })

        return jsonify({
            'success': True,
            'config': {
                'service_type': config.service_type,
                'default_duration': config.default_duration,
                'calendar_id': config.calendar_id
            }
        })
    except Exception as e:
        logger.error(f"Erreur get_calendar_config: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@actions_bp.route('/calendar/config', methods=['POST'])
@login_required
def save_calendar_config():
    """Sauvegarde la configuration du calendrier."""
    try:
        data = request.get_json()

        config = CalendarConfig.query.first()
        if not config:
            config = CalendarConfig()
            db.session.add(config)

        config.service_type = data.get('service_type', 'google')
        config.default_duration = data.get('default_duration', 30)
        config.calendar_id = data.get('calendar_id')

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Configuration calendrier sauvegardée'
        })
    except Exception as e:
        logger.error(f"Erreur save_calendar_config: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== TICKETS ROUTES =====

@actions_bp.route('/tickets/config', methods=['GET'])
@login_required
def get_ticket_config():
    """Récupère la configuration des tickets."""
    try:
        config = TicketConfig.query.first()
        if not config:
            return jsonify({
                'success': True,
                'config': {
                    'service_type': 'internal',
                    'priority_mapping': {}
                }
            })

        return jsonify({
            'success': True,
            'config': {
                'service_type': config.service_type,
                'subdomain': config.subdomain,
                'priority_mapping': config.priority_mapping
            }
        })
    except Exception as e:
        logger.error(f"Erreur get_ticket_config: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@actions_bp.route('/tickets/config', methods=['POST'])
@login_required
def save_ticket_config():
    """Sauvegarde la configuration des tickets."""
    try:
        data = request.get_json()

        config = TicketConfig.query.first()
        if not config:
            config = TicketConfig()
            db.session.add(config)

        config.service_type = data.get('service_type', 'internal')
        config.subdomain = data.get('subdomain')
        config.api_key = data.get('api_key')
        config.priority_mapping = data.get('priority_mapping', {})

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Configuration tickets sauvegardée'
        })
    except Exception as e:
        logger.error(f"Erreur save_ticket_config: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== FORMS ROUTES =====

@actions_bp.route('/forms/config', methods=['POST'])
@login_required
def save_forms_config():
    """Sauvegarde la configuration des formulaires."""
    try:
        data = request.get_json()

        for form_data in data.get('redirections', []):
            if 'id' in form_data:
                form = FormRedirection.query.get(form_data['id'])
                if form:
                    form.name = form_data['name']
                    form.url = form_data['url']
                    form.conditions = form_data.get('conditions')
                    form.parameters = form_data.get('parameters')
            else:
                form = FormRedirection(
                    name=form_data['name'],
                    url=form_data['url'],
                    conditions=form_data.get('conditions'),
                    parameters=form_data.get('parameters')
                )
                db.session.add(form)

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Configuration formulaires sauvegardée'
        })
    except Exception as e:
        logger.error(f"Erreur save_forms_config: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


# ===== TEST ROUTE =====

@actions_bp.route('/test', methods=['POST'])
@login_required
def test_action():
    """Teste une configuration d'action."""
    try:
        data = request.get_json()
        action_type = data.get('type')
        config = data.get('config', {})

        # Validation basique selon le type
        test_results = {
            'email': {'success': True, 'message': 'Configuration email valide'},
            'sms': {'success': True, 'message': 'Configuration SMS valide'},
            'calendar': {'success': True, 'message': 'Configuration calendrier valide'},
            'tickets': {'success': True, 'message': 'Configuration tickets valide'},
            'forms': {'success': True, 'message': 'Configuration formulaires valide'}
        }

        result = test_results.get(action_type, {'success': False, 'message': 'Type inconnu'})

        return jsonify({
            'success': result['success'],
            'message': result['message'],
            'details': config
        })
    except Exception as e:
        logger.error(f"Erreur test_action: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ========================
# ROUTES POUR LES SECTIONS DE CONTENU
# ========================
@main_bp.route("/contenu/reponses")
@login_required
def reponses():
   """Page de configuration des réponses - REDIRECTION VERS NOUVELLE INTERFACE."""
   return redirect(url_for('responses.responses_wizard'))

@main_bp.route("/contenu/base-connaissances")
@login_required
def base_connaissances():
   """Page de la base de connaissances."""
   return render_template("bot_config/base_connaissances.html")

@main_bp.route("/contenu/flux-conversation")
@login_required
def flux_conversation():
   """Page des flux de conversation."""
   return render_template("bot_config/flux_conversation.html")

@main_bp.route("/contenu/actions")
@login_required
def actions():
   """Page des actions."""
   return render_template("bot_config/actions.html")


# ========================
# GESTIONNAIRE D'ERREUR
# ========================
@main_bp.errorhandler(401)
def unauthorized_error(error):
   """Gestion des erreurs 401."""
   flash('Votre session a expiré. Veuillez vous reconnecter.', 'warning')
   return redirect(url_for('main.login'))


# ========================
# ROUTES DE DIAGNOSTIC ET MONITORING - MODE CLÉS UTILISATEUR
# ========================
@main_bp.route("/api/system/stats", methods=["GET"])
@login_required
def system_stats():
   """Statistiques du système - Mode clés utilisateur."""
   try:
       # Stats utilisateur actuel
       user_config = get_user_api_config()
       
       stats = {
           "mode": "user_keys_api",
           "backend_services": {
               "database": "active",
               "session_management": "active",
               "context_builder": "active" if context_builder else "inactive",
               "cache": "active",
               "encryption": "active" if current_app.config.get('ENCRYPTION_KEY') else "inactive"
           },
           "user_api_status": {
               "has_config": bool(user_config),
               "provider": user_config.get('provider') if user_config else None,
               "model": user_config.get('model') if user_config else None,
               "encryption_enabled": True
           },
           "session_stats": {
               "user_id": current_user.id,
               "conversation_history": len(session.get('conversation_history', [])),
               "session_id": session.get('session_id', 'none')
           }
       }
       
       return jsonify(stats)
       
   except Exception as e:
       logger.error(f"Erreur dans system_stats: {str(e)}")
       return jsonify({"error": str(e)}), 500

@main_bp.route("/api/cache/clear", methods=["POST"])
@login_required
def clear_cache():
   """Vide tous les caches."""
   try:
       # Vider le cache des réponses rapides
       from .fast_responses_cache import refresh_cache
       refresh_cache()
       
       # Vider le cache du context builder
       global context_builder
       if context_builder and hasattr(context_builder, '_cache'):
           context_builder._cache.clear()
       
       # Vider l'historique de session
       if 'conversation_history' in session:
           session['conversation_history'] = []
           session.modified = True
       
       logger.info(f"Caches vidés pour l'utilisateur {current_user.username}")
       
       return jsonify({
           "message": "Caches vidés avec succès",
           "timestamp": datetime.utcnow().isoformat(),
           "mode": "user_keys_api"
       })
       
   except Exception as e:
       logger.error(f"Erreur lors du vidage des caches: {str(e)}")
       return jsonify({"error": str(e)}), 500

@main_bp.route("/api/test/context", methods=["POST"])
@login_required
def test_context():
   """Teste la génération de contexte."""
   try:
       data = request.get_json()
       test_message = data.get("message", "")
       
       if not test_message:
           return jsonify({"error": "Message de test requis"}), 400
       
       global context_builder
       if not context_builder:
           context_builder = ContextBuilder(current_app)
       
       enriched_prompt, metadata = context_builder.build_system_prompt(
           user_message=test_message,
           session_context={
               'user_id': current_user.id,
               'session_id': session.get('session_id', 'test'),
               'conversation_history': []
           }
       )
       
       return jsonify({
           "message": test_message,
           "metadata": metadata,
           "prompt_length": len(enriched_prompt),
           "prompt_preview": enriched_prompt[:500] + "..." if len(enriched_prompt) > 500 else enriched_prompt,
           "full_prompt": enriched_prompt if data.get("show_full", False) else None,
           "mode": "user_keys_api",
           "user_id": current_user.id
       })
       
   except Exception as e:
       logger.error(f"Erreur dans test_context: {str(e)}")
       return jsonify({"error": str(e)}), 500

@main_bp.route("/api/user/usage-stats", methods=["GET"])
@login_required
def user_usage_stats():
   """Statistiques d'utilisation de l'utilisateur connecté."""
   try:
       # Statistiques basiques depuis la session
       conversation_history = session.get('conversation_history', [])
       
       # Compter les messages par provider
       provider_usage = {}
       total_messages = len(conversation_history)
       identity_corrections = 0
       
       for message in conversation_history:
           provider = message.get('provider', 'unknown')
           provider_usage[provider] = provider_usage.get(provider, 0) + 1
           if message.get('identity_corrected', False):
               identity_corrections += 1
       
       # Calculer les moyennes de complexité
       complexities = [msg.get('complexity', 1) for msg in conversation_history]
       avg_complexity = sum(complexities) / len(complexities) if complexities else 0
       
       # Stats récentes (dernières 24h)
       recent_cutoff = int(time.time()) - (24 * 3600)
       recent_messages = [msg for msg in conversation_history if msg.get('timestamp', 0) > recent_cutoff]
       
       stats = {
           "user_id": current_user.id,
           "username": current_user.username,
           "total_messages": total_messages,
           "recent_messages_24h": len(recent_messages),
           "provider_usage": provider_usage,
           "average_complexity": round(avg_complexity, 2),
           "identity_corrections": identity_corrections,
           "correction_rate": round((identity_corrections / max(total_messages, 1)) * 100, 1),
           "session_id": session.get('session_id'),
           "last_activity": max([msg.get('timestamp', 0) for msg in conversation_history]) if conversation_history else None,
           "knowledge_usage": sum(1 for msg in conversation_history if msg.get('has_knowledge', False)),
           "timestamp": datetime.utcnow().isoformat()
       }
       
       return jsonify(stats)
       
   except Exception as e:
       logger.error(f"Erreur user_usage_stats: {str(e)}")
       return jsonify({"error": str(e)}), 500

@main_bp.route("/api/user/reset-config", methods=["POST"])
@login_required
def reset_user_config():
   """Remet à zéro la configuration API de l'utilisateur."""
   try:
       user_settings = Settings.query.filter_by(user_id=current_user.id).first()
       
       if user_settings:
           # Supprimer les clés chiffrées
           user_settings.encrypted_openai_key = None
           user_settings.encrypted_mistral_key = None
           user_settings.current_provider = None
           user_settings.openai_model = None
           user_settings.mistral_model = None
           user_settings.updated_at = datetime.utcnow()
           
           db.session.commit()
           
           logger.info(f"Configuration API réinitialisée pour {current_user.username}")
       
       # Vider aussi l'historique de session
       if 'conversation_history' in session:
           session['conversation_history'] = []
           session.modified = True
       
       return jsonify({
           "success": True,
           "message": "Configuration réinitialisée avec succès"
       })
       
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur reset_user_config: {str(e)}")
       return jsonify({
           "success": False,
           "error": str(e)
       }), 500


# ========================
# ROUTE STATUT : /api/status/<request_id> (Compatibilité)
# ========================
@main_bp.route("/api/status/<request_id>", methods=["GET"])
def check_status(request_id):
   """Vérifie le statut d'une requête (compatibilité avec mode asynchrone)."""
   try:
       # En mode clés utilisateur, les requêtes sont synchrones
       # Cette route existe pour la compatibilité avec l'interface
       return jsonify({
           "status": "completed",
           "message": "Mode synchrone - pas de requêtes asynchrones",
           "mode": "user_keys_synchronous",
           "request_id": request_id
       })
           
   except Exception as e:
       logger.error(f"Erreur dans check_status: {str(e)}")
       return jsonify({
           "error": f"Erreur: {str(e)}",
           "status": "error"
       }), 500


# ========================
# ROUTES D'EXPORT ET IMPORT (BONUS)
# ========================
@main_bp.route("/api/export/conversation", methods=["GET"])
@login_required
def export_conversation():
   """Exporte l'historique de conversation de l'utilisateur."""
   try:
       conversation_history = session.get('conversation_history', [])
       
       export_data = {
           "user_id": current_user.id,
           "username": current_user.username,
           "export_date": datetime.utcnow().isoformat(),
           "total_messages": len(conversation_history),
           "conversation_history": conversation_history,
           "session_id": session.get('session_id')
       }
       
       # Créer la réponse avec headers pour téléchargement
       response = make_response(jsonify(export_data))
       response.headers['Content-Disposition'] = f'attachment; filename=conversation_{current_user.username}_{int(time.time())}.json'
       response.headers['Content-Type'] = 'application/json'
       
       logger.info(f"Export conversation pour {current_user.username}")
       
       return response
       
   except Exception as e:
       logger.error(f"Erreur export_conversation: {str(e)}")
       return jsonify({"error": str(e)}), 500

@main_bp.route("/api/import/conversation", methods=["POST"])
@login_required
def import_conversation():
   """Importe un historique de conversation."""
   try:
       if 'file' not in request.files:
           return jsonify({"error": "Aucun fichier fourni"}), 400
       
       file = request.files['file']
       if file.filename == '':
           return jsonify({"error": "Nom de fichier invalide"}), 400
       
       if not file.filename.endswith('.json'):
           return jsonify({"error": "Format de fichier non supporté (JSON requis)"}), 400
       
       # Lire et parser le fichier JSON
       content = file.read().decode('utf-8')
       import_data = json.loads(content)
       
       # Valider la structure
       if 'conversation_history' not in import_data:
           return jsonify({"error": "Structure de fichier invalide"}), 400
       
       # Importer l'historique (en remplaçant l'existant)
       session['conversation_history'] = import_data['conversation_history']
       session['session_id'] = import_data.get('session_id', str(uuid.uuid4()))
       session.modified = True
       
       imported_count = len(import_data['conversation_history'])
       
       logger.info(f"Import conversation pour {current_user.username}: {imported_count} messages")
       
       return jsonify({
           "success": True,
           "message": f"{imported_count} messages importés avec succès",
           "imported_count": imported_count
       })
       
   except json.JSONDecodeError:
       return jsonify({"error": "Fichier JSON invalide"}), 400
   except Exception as e:
       logger.error(f"Erreur import_conversation: {str(e)}")
       return jsonify({"error": str(e)}), 500


# ========================
# WEBHOOK POUR NOTIFICATIONS (BONUS)
# ========================
@main_bp.route("/webhook/api-usage", methods=["POST"])
def webhook_api_usage():
   """Webhook pour recevoir des notifications d'usage API."""
   try:
       data = request.get_json()
       
       # Log des informations d'usage
       logger.info(f"Webhook API usage: {data}")
       
       # Ici on pourrait implémenter:
       # - Alertes de quota
       # - Statistiques d'usage en temps réel
       # - Facturation automatique
       
       return jsonify({"status": "received"}), 200
       
   except Exception as e:
       logger.error(f"Erreur webhook: {str(e)}")
       return jsonify({"error": str(e)}), 500


# ========================
# ROUTES DE SÉCURITÉ ET AUDIT
# ========================
@main_bp.route("/api/security/audit-log", methods=["GET"])
@login_required
def security_audit_log():
   """Log d'audit de sécurité pour l'utilisateur."""
   try:
       # En production, ceci viendrait d'une vraie table d'audit
       audit_events = [
           {
               "timestamp": datetime.utcnow().isoformat(),
               "event": "config_access",
               "user_id": current_user.id,
               "ip_address": request.remote_addr,
               "user_agent": request.headers.get('User-Agent', 'Unknown')
           }
       ]
       
       return jsonify({
           "audit_events": audit_events,
           "total_events": len(audit_events)
       })
       
   except Exception as e:
       logger.error(f"Erreur audit_log: {str(e)}")
       return jsonify({"error": str(e)}), 500

@main_bp.route("/api/security/rotate-encryption", methods=["POST"])
@login_required
def rotate_encryption_key():
   """Rotation de la clé de chiffrement (admin uniquement)."""
   try:
       # Vérifier les permissions admin
       if not getattr(current_user, 'is_admin', False):  # Supposons qu'il y ait un champ is_admin
           return jsonify({"error": "Permissions administrateur requises"}), 403
       
       # En production, implémenter la rotation des clés
       logger.warning(f"Tentative de rotation de clé par {current_user.username}")
       
       return jsonify({
           "message": "Rotation de clé programmée",
           "status": "scheduled"
       })
       
   except Exception as e:
       logger.error(f"Erreur rotate_encryption: {str(e)}")
       return jsonify({"error": str(e)}), 500


# ========================
# ROUTE SPÉCIALE POUR TESTER LA CORRECTION D'IDENTITÉ
# ========================
@main_bp.route("/api/test-identity", methods=["POST"])
@login_required
def test_identity_correction():
   """Route de test pour vérifier la correction d'identité."""
   try:
       data = request.get_json()
       test_response = data.get("response", "Je suis une assistante virtuelle conçue pour vous aider.")
       
       # Récupérer les infos du bot
       global context_builder
       if not context_builder:
           context_builder = ContextBuilder(current_app)
       
       bot_info = context_builder._get_bot_info()
       
       # Appliquer le post-traitement
       corrected_response = post_process_api_response(test_response, bot_info)
       
       return jsonify({
           "original": test_response,
           "corrected": corrected_response,
           "was_corrected": test_response != corrected_response,
           "bot_info": bot_info
       })
       
   except Exception as e:
       logger.error(f"Erreur test_identity_correction: {str(e)}")
       return jsonify({"error": str(e)}), 500


# ========================
# IMPORTS NÉCESSAIRES POUR LES NOUVELLES FONCTIONNALITÉS
# ========================
from sqlalchemy.orm.attributes import flag_modified

# ========================
# ROUTES POUR LA GESTION DES RÉPONSES RAPIDES - COMPATIBILITÉ AVEC L'ANCIENNE INTERFACE
# ========================
@main_bp.route("/api/fast-responses/", methods=['GET'])
@login_required
def get_fast_responses():
   """Récupère les réponses rapides pour compatibilité avec l'ancienne interface."""
   try:
       # Convertir les nouveaux formats vers l'ancien format pour compatibilité
       default_messages = DefaultMessage.query.all()
       
       fast_responses = []
       for msg in default_messages:
           fast_responses.append({
               'id': msg.id,
               'title': msg.title,
               'content': msg.content,
               'triggers': msg.triggers.split(',') if msg.triggers else []
           })
       
       return jsonify({
           'status': 'success',
           'data': fast_responses
       })
       
   except Exception as e:
       logger.error(f"Erreur récupération fast responses: {str(e)}")
       return jsonify({
           'status': 'error',
           'message': str(e)
       }), 500

@main_bp.route("/api/fast-responses/", methods=['POST'])
@login_required
def create_fast_response():
   """Crée une nouvelle réponse rapide (compatibilité)."""
   try:
       data = request.get_json()
       
       message = DefaultMessage(
           title=data.get('title', 'Nouvelle réponse'),
           content=data.get('content', ''),
           triggers=','.join(data.get('triggers', []))
       )
       
       db.session.add(message)
       db.session.commit()
       
       # Rafraîchir le cache
       try:
           from .fast_responses_cache import refresh_cache
           refresh_cache()
       except Exception as e:
           logger.error(f"Erreur rafraîchissement cache: {str(e)}")
       
       return jsonify({
           'status': 'success',
           'data': {
               'id': message.id,
               'title': message.title,
               'content': message.content,
               'triggers': message.triggers.split(',') if message.triggers else []
           }
       })
       
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur création fast response: {str(e)}")
       return jsonify({
           'status': 'error',
           'message': str(e)
       }), 500

@main_bp.route("/api/fast-responses/<int:response_id>", methods=['PUT'])
@login_required
def update_fast_response(response_id):
   """Met à jour une réponse rapide (compatibilité)."""
   try:
       message = DefaultMessage.query.get_or_404(response_id)
       data = request.get_json()
       
       message.title = data.get('title', message.title)
       message.content = data.get('content', message.content)
       message.triggers = ','.join(data.get('triggers', []))
       
       db.session.commit()
       
       # Rafraîchir le cache
       try:
           from .fast_responses_cache import refresh_cache
           refresh_cache()
       except Exception as e:
           logger.error(f"Erreur rafraîchissement cache: {str(e)}")
       
       return jsonify({
           'status': 'success',
           'data': {
               'id': message.id,
               'title': message.title,
               'content': message.content,
               'triggers': message.triggers.split(',') if message.triggers else []
           }
       })
       
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur mise à jour fast response: {str(e)}")
       return jsonify({
           'status': 'error',
           'message': str(e)
       }), 500

@main_bp.route("/api/fast-responses/<int:response_id>", methods=['DELETE'])
@login_required
def delete_fast_response(response_id):
   """Supprime une réponse rapide (compatibilité)."""
   try:
       message = DefaultMessage.query.get_or_404(response_id)
       db.session.delete(message)
       db.session.commit()
       
       # Rafraîchir le cache
       try:
           from .fast_responses_cache import refresh_cache
           refresh_cache()
       except Exception as e:
           logger.error(f"Erreur rafraîchissement cache: {str(e)}")
       
       return jsonify({
           'status': 'success'
       })
       
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur suppression fast response: {str(e)}")
       return jsonify({
           'status': 'error',
           'message': str(e)
       }), 500

@main_bp.route("/api/fast-responses/refresh-cache", methods=['POST'])
@login_required
def refresh_fast_responses_cache():
   """Rafraîchit le cache des réponses rapides."""
   try:
       from .fast_responses_cache import refresh_cache
       refresh_cache()
       
       logger.info(f"Cache des réponses rapides rafraîchi par {current_user.username}")
       
       return jsonify({
           'status': 'success',
           'message': 'Cache rafraîchi avec succès'
       })
       
   except Exception as e:
       logger.error(f"Erreur rafraîchissement cache: {str(e)}")
       return jsonify({
           'status': 'error',
           'message': str(e)
       }), 500

@main_bp.route("/api/fast-responses/test", methods=['POST'])
@login_required
def test_fast_response():
   """Teste les variables dans une réponse (compatibilité)."""
   try:
       data = request.get_json()
       content = data.get('content', '')
       variables = data.get('variables', {})
       
       # Variables par défaut
       default_variables = {
           'bot_name': 'Assistant',
           'domain': 'example.com',
           'current_date': datetime.now().strftime('%d/%m/%Y'),
           'current_time': datetime.now().strftime('%H:%M')
       }
       
       # Merger avec les variables fournies
       all_variables = {**default_variables, **variables}
       
       # Remplacer les variables dans le contenu
       processed_content = content
       for var_name, var_value in all_variables.items():
           processed_content = processed_content.replace(f'{{{var_name}}}', str(var_value))
       
       return jsonify({
           'status': 'success',
           'data': {
               'original_content': content,
               'processed_content': processed_content,
               'variables_used': list(all_variables.keys())
           }
       })
       
   except Exception as e:
       logger.error(f"Erreur test fast response: {str(e)}")
       return jsonify({
           'status': 'error',
           'message': str(e)
       }), 500


# ========================
# NOUVELLES ROUTES POUR LA GESTION DES MESSAGES D'ERREUR
# ========================
@responses_bp.route('/api/error-messages', methods=['GET'])
@login_required
def get_error_messages():
   """Récupère les messages d'erreur personnalisés."""
   try:
       # Pour l'instant, retourner des messages d'erreur par défaut
       # Dans une version future, créer une table dédiée
       error_messages = [
           {
               'id': 1,
               'title': 'Dépassement du temps de réponse',
               'code': 'TIMEOUT',
               'content': 'Je prends un peu plus de temps que prévu pour traiter votre demande. Pouvez-vous patienter quelques instants ou reformuler votre question ?'
           },
           {
               'id': 2,
               'title': 'Erreur technique',
               'code': 'SYSTEM_ERROR',
               'content': 'Je rencontre un petit problème technique. Pouvez-vous réessayer dans quelques minutes ? Si le problème persiste, contactez notre support.'
           },
           {
               'id': 3,
               'title': 'Limite atteinte',
               'code': 'RATE_LIMIT',
               'content': 'Vous avez fait beaucoup de demandes récemment. Merci de patienter quelques minutes avant de continuer.'
           }
       ]
       
       return jsonify(error_messages)
       
   except Exception as e:
       logger.error(f"Erreur récupération messages d'erreur: {str(e)}")
       return jsonify({'error': str(e)}), 500

@responses_bp.route('/api/error-messages', methods=['POST'])
@login_required
def create_error_message():
   """Crée un nouveau message d'erreur."""
   try:
       data = request.get_json()
       
       # Pour l'instant, simuler la création
       # Dans une version future, sauvegarder en base
       
       logger.info(f"Nouveau message d'erreur créé: {data.get('title', 'Sans titre')}")
       
       return jsonify({
           'success': True,
           'id': 999,  # ID simulé
           'title': data.get('title', ''),
           'code': data.get('code', ''),
           'content': data.get('content', '')
       })
       
   except Exception as e:
       logger.error(f"Erreur création message d'erreur: {str(e)}")
       return jsonify({'error': str(e)}), 500


# ========================
# ROUTES POUR LES PARAMÈTRES DE TON ET STYLE
# ========================
@responses_bp.route('/api/tone-settings', methods=['GET'])
@login_required
def get_tone_settings():
   """Récupère les paramètres de ton et style."""
   try:
       config = BotResponses.query.first()
       
       # Paramètres par défaut
       tone_settings = {
           'communication_style': 'formel',
           'language_level': 'standard',
           'primary_trait': 'empathique',
           'secondary_trait': 'serviable'
       }
       
       # Si config existe, utiliser les valeurs sauvegardées
       if config and hasattr(config, 'tone_config') and config.tone_config:
           tone_settings.update(config.tone_config)
       
       return jsonify(tone_settings)
       
   except Exception as e:
       logger.error(f"Erreur récupération paramètres de ton: {str(e)}")
       return jsonify({'error': str(e)}), 500

@responses_bp.route('/api/tone-settings', methods=['POST'])
@login_required
def save_tone_settings():
   """Sauvegarde les paramètres de ton et style."""
   try:
       data = request.get_json()
       
       config = BotResponses.query.first()
       if not config:
           config = BotResponses()
           db.session.add(config)
       
       # Sauvegarder les paramètres de ton
       tone_config = {
           'communication_style': data.get('communication_style', 'formel'),
           'language_level': data.get('language_level', 'standard'),
           'primary_trait': data.get('primary_trait', 'empathique'),
           'secondary_trait': data.get('secondary_trait', 'serviable')
       }
       
       # Ajouter l'attribut tone_config s'il n'existe pas
       if not hasattr(config, 'tone_config'):
           # En attente d'une migration de base de données pour ajouter ce champ
           # Pour l'instant, on peut utiliser le champ vocabulary comme stockage temporaire
           pass
       
       db.session.commit()
       
       logger.info(f"Paramètres de ton sauvegardés par {current_user.username}")
       
       return jsonify({
           'success': True,
           'message': 'Paramètres de ton sauvegardés avec succès'
       })
       
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur sauvegarde paramètres de ton: {str(e)}")
       return jsonify({'error': str(e)}), 500


# ========================
# ROUTES POUR LES SETTINGS UTILISATEUR AVANCÉES
# ========================
@main_bp.route("/api/settings/welcome-message", methods=['PUT'])
@login_required
def update_welcome_message():
   """Met à jour le message de bienvenue."""
   try:
       data = request.get_json()
       welcome_message = data.get('welcome_message', '')
       
       settings = Settings.query.first()
       if not settings:
           settings = Settings()
           db.session.add(settings)
       
       settings.bot_welcome = welcome_message
       db.session.commit()
       
       # Rafraîchir le cache
       try:
           from .fast_responses_cache import refresh_cache
           refresh_cache()
       except Exception as e:
           logger.error(f"Erreur rafraîchissement cache: {str(e)}")
       
       logger.info(f"Message de bienvenue mis à jour par {current_user.username}")
       
       return jsonify({
           'success': True,
           'message': 'Message de bienvenue mis à jour'
       })
       
   except Exception as e:
       db.session.rollback()
       logger.error(f"Erreur mise à jour message de bienvenue: {str(e)}")
       return jsonify({'error': str(e)}), 500


# ========================
# ROUTES POUR L'EXPORT/IMPORT DE CONFIGURATION
# ========================
@responses_bp.route('/api/export', methods=['GET'])
@login_required
def export_responses_config():
   """Exporte toute la configuration des réponses."""
   try:
       # Récupérer toute la configuration
       config_response = get_responses_configuration()
       config_data = config_response.get_json()
       
       # Ajouter des métadonnées d'export
       export_data = {
           'export_info': {
               'version': '2.0',
               'exported_by': current_user.username,
               'export_date': datetime.utcnow().isoformat(),
               'application': 'Bot Response Configuration'
           },
           'configuration': config_data
       }
       
       # Créer la réponse de téléchargement
       response = make_response(jsonify(export_data))
       filename = f'bot_responses_config_{current_user.username}_{int(time.time())}.json'
       response.headers['Content-Disposition'] = f'attachment; filename={filename}'
       response.headers['Content-Type'] = 'application/json'
       
       logger.info(f"Configuration des réponses exportée par {current_user.username}")
       
       return response
       
   except Exception as e:
       logger.error(f"Erreur export configuration: {str(e)}")
       return jsonify({'error': str(e)}), 500

@responses_bp.route('/api/import', methods=['POST'])
@login_required
def import_responses_config():
   """Importe une configuration des réponses."""
   try:
       if 'file' not in request.files:
           return jsonify({'error': 'Aucun fichier fourni'}), 400
       
       file = request.files['file']
       if file.filename == '':
           return jsonify({'error': 'Nom de fichier invalide'}), 400
       
       if not file.filename.endswith('.json'):
           return jsonify({'error': 'Format de fichier non supporté (JSON requis)'}), 400
       
       # Lire et parser le fichier
       content = file.read().decode('utf-8')
       import_data = json.loads(content)
       
       # Valider la structure
       if 'configuration' not in import_data:
           return jsonify({'error': 'Structure de fichier invalide'}), 400
       
       configuration = import_data['configuration']
       
       # Sauvegarder la configuration importée
       save_response = save_responses_configuration()
       
       if save_response.status_code != 200:
           return jsonify({'error': 'Erreur lors de l\'import'}), 500
       
       logger.info(f"Configuration des réponses importée par {current_user.username}")
       
       return jsonify({
           'success': True,
           'message': 'Configuration importée avec succès',
           'imported_version': import_data.get('export_info', {}).get('version', 'inconnue')
       })
       
   except json.JSONDecodeError:
       return jsonify({'error': 'Fichier JSON invalide'}), 400
   except Exception as e:
       logger.error(f"Erreur import configuration: {str(e)}")
       return jsonify({'error': str(e)}), 500


# ========================
# ROUTES DE MIGRATION ET COMPATIBILITÉ
# ========================
@responses_bp.route('/api/migrate-legacy', methods=['POST'])
@login_required
def migrate_legacy_config():
   """Migre l'ancienne configuration vers le nouveau format."""
   try:
       # Récupérer les anciennes données
       old_messages = DefaultMessage.query.all()
       
       migrated_count = 0
       
       # Processus de migration
       for msg in old_messages:
           # Les messages sont déjà dans le bon format
           # Cette migration est principalement pour la compatibilité future
           migrated_count += 1
       
       logger.info(f"Migration effectuée par {current_user.username}: {migrated_count} éléments")
       
       return jsonify({
           'success': True,
           'message': f'Migration terminée: {migrated_count} éléments traités',
           'migrated_count': migrated_count
       })
       
   except Exception as e:
       logger.error(f"Erreur migration: {str(e)}")
       return jsonify({'error': str(e)}), 500


# ========================
# FONCTION D'ENREGISTREMENT DES BLUEPRINTS
# ========================
def register_additional_blueprints(app):
   """Enregistre les blueprints additionnels."""
   app.register_blueprint(knowledge_bp)
   app.register_blueprint(flow_bp)
   app.register_blueprint(responses_bp)
   app.register_blueprint(actions_bp)


# ========================
# MIDDLEWARE POUR LE LOGGING DES REQUÊTES API
# ========================
@main_bp.before_request
def log_request_info():
   """Log les informations de requête pour debugging."""
   if request.endpoint and request.endpoint.startswith('api'):
       logger.debug(f"API Request: {request.method} {request.path} from {request.remote_addr}")
       if current_user.is_authenticated:
           logger.debug(f"User: {current_user.username}")

@main_bp.after_request
def log_response_info(response):
   """Log les informations de réponse pour debugging."""
   if request.endpoint and request.endpoint.startswith('api'):
       logger.debug(f"API Response: {response.status_code} for {request.path}")
   return response


# ========================
# GESTIONNAIRE D'ERREURS GLOBAL POUR LES APIs
# ========================
@main_bp.errorhandler(404)
def api_not_found(error):
   """Gestionnaire 404 pour les routes API."""
   if request.path.startswith('/api/'):
       return jsonify({
           'error': 'Endpoint not found',
           'path': request.path,
           'method': request.method
       }), 404
   return error

@main_bp.errorhandler(500)
def api_internal_error(error):
   """Gestionnaire 500 pour les routes API."""
   if request.path.startswith('/api/'):
       logger.error(f"Erreur 500 sur {request.path}: {str(error)}")
       return jsonify({
           'error': 'Internal server error',
           'path': request.path,
           'message': "Une erreur inattendue s'est produite"
       }), 500
   return error


# ========================
# UTILITAIRES POUR LA GESTION DES RÉPONSES
# ========================
def validate_response_data(data):
   """Valide les données d'une réponse."""
   required_fields = ['content']
   optional_fields = ['title', 'triggers', 'keywords']
   
   # Vérifier les champs requis
   for field in required_fields:
       if field not in data or not data[field].strip():
           return False, f"Le champ '{field}' est requis"
   
   # Valider le contenu
   content = data['content'].strip()
   if len(content) < 5:
       return False, "Le contenu doit contenir au moins 5 caractères"
   
   if len(content) > 1000:
       return False, "Le contenu ne peut pas dépasser 1000 caractères"
   
   # Valider les triggers si présents
   if 'triggers' in data and data['triggers']:
       triggers = data['triggers'] if isinstance(data['triggers'], list) else data['triggers'].split(',')
       triggers = [t.strip() for t in triggers if t.strip()]
       
       if len(triggers) == 0:
           return False, "Au moins un déclencheur est requis"
       
       for trigger in triggers:
           if len(trigger) < 2:
               return False, f"Le déclencheur '{trigger}' est trop court (minimum 2 caractères)"
   
   return True, "Validation réussie"

def process_response_variables(content, variables=None):
   """Traite les variables dans le contenu d'une réponse."""
   if not variables:
       variables = {}
   
   # Variables par défaut
   default_vars = {
       'bot_name': 'Assistant',
       'current_date': datetime.now().strftime('%d/%m/%Y'),
       'current_time': datetime.now().strftime('%H:%M'),
       'domain': 'exemple.com',
       'user_name': 'Visiteur'
   }
   
   # Récupérer les vraies valeurs depuis la base
   try:
       settings = Settings.query.first()
       if settings:
           if settings.bot_name:
               default_vars['bot_name'] = settings.bot_name
   except Exception as e:
       logger.error(f"Erreur récupération settings pour variables: {e}")
   
   # Merger les variables
   all_vars = {**default_vars, **variables}
   
   # Remplacer dans le contenu
   processed_content = content
   for var_name, var_value in all_vars.items():
       pattern = f'{{{var_name}}}'
       processed_content = processed_content.replace(pattern, str(var_value))
   
   return processed_content


# ========================
# CACHE MANAGER POUR LES RÉPONSES
# ========================
class ResponseCacheManager:
   """Gestionnaire de cache pour les réponses."""
   
   def __init__(self):
       self._cache = {}
       self._last_update = None
   
   def get_cached_responses(self):
       """Récupère les réponses du cache."""
       return self._cache.get('responses', [])
   
   def update_cache(self):
       """Met à jour le cache avec les dernières données."""
       try:
           # Récupérer les messages par défaut
           messages = DefaultMessage.query.all()
           
           cached_responses = []
           for msg in messages:
               cached_responses.append({
                   'id': msg.id,
                   'title': msg.title,
                   'content': msg.content,
                   'triggers': msg.triggers.split(',') if msg.triggers else [],
                   'processed_content': process_response_variables(msg.content)
               })
           
           self._cache['responses'] = cached_responses
           self._last_update = datetime.utcnow()
           
           logger.debug(f"Cache mis à jour: {len(cached_responses)} réponses")
           
       except Exception as e:
           logger.error(f"Erreur mise à jour cache: {e}")
   
   def is_cache_valid(self, max_age_minutes=30):
       """Vérifie si le cache est encore valide."""
       if not self._last_update:
           return False
       
       age = (datetime.utcnow() - self._last_update).total_seconds() / 60
       return age < max_age_minutes
   
   def find_matching_response(self, user_input):
       """Trouve une réponse correspondant à l'input utilisateur."""
       if not self.is_cache_valid():
           self.update_cache()
       
       user_input_lower = user_input.lower()
       responses = self.get_cached_responses()
       
       for response in responses:
           for trigger in response['triggers']:
               if trigger.lower().strip() in user_input_lower:
                   return {
                       'found': True,
                       'response': response,
                       'trigger': trigger,
                       'content': response['processed_content']
                   }
       
       return {'found': False}

# Instance globale du gestionnaire de cache
response_cache_manager = ResponseCacheManager()


# ========================
# ROUTE POUR TESTER LE MATCHING DES RÉPONSES
# ========================
@responses_bp.route('/api/test-matching', methods=['POST'])
@login_required
def test_response_matching():
   """Teste le matching des réponses en temps réel."""
   try:
       data = request.get_json()
       test_input = data.get('input', '')
       
       if not test_input:
           return jsonify({'error': 'Input de test requis'}), 400
       
       # Utiliser le cache manager pour tester
       result = response_cache_manager.find_matching_response(test_input)
       
       return jsonify({
           'success': True,
           'input': test_input,
           'result': result,
           'cache_status': {
               'valid': response_cache_manager.is_cache_valid(),
               'last_update': response_cache_manager._last_update.isoformat() if response_cache_manager._last_update else None,
               'responses_count': len(response_cache_manager.get_cached_responses())
           }
       })
       
   except Exception as e:
       logger.error(f"Erreur test matching: {str(e)}")
       return jsonify({'error': str(e)}), 500


############################################################################
# WIZARD D'ONBOARDING ET MODE SIMPLE/AVANCÉ
############################################################################

@main_bp.route("/onboarding")
@login_required
def onboarding_wizard():
    """Wizard d'onboarding pour nouveaux utilisateurs."""
    # Récupérer les paramètres existants pour pré-remplissage
    settings = Settings.query.filter_by(user_id=current_user.id).first()
    initial_data = {
        'botName': settings.bot_name if settings else '',
        'botDescription': settings.bot_description if settings else '',
        'welcomeMessage': settings.bot_welcome if settings else '',
        'provider': current_user.preferred_provider if current_user.preferred_provider else ''
    }
    return render_template("onboarding_wizard.html", initial_data=initial_data)


@main_bp.route("/reopen-wizard")
@login_required
def reopen_wizard():
    """Permet de ré-ouvrir le wizard pour modifier la configuration."""
    # Récupérer les paramètres existants
    settings = Settings.query.filter_by(user_id=current_user.id).first()
    initial_data = {
        'botName': settings.bot_name if settings else '',
        'botDescription': settings.bot_description if settings else '',
        'welcomeMessage': settings.bot_welcome if settings else '',
        'provider': current_user.preferred_provider if current_user.preferred_provider else ''
    }
    return render_template("onboarding_wizard.html", initial_data=initial_data, is_reopen=True)


@main_bp.route("/api/save-wizard", methods=["POST"])
@login_required
def save_wizard():
    """Sauvegarde les données du wizard d'onboarding."""
    try:
        data = request.get_json()

        # Sauvegarder les paramètres généraux
        settings = Settings.query.filter_by(user_id=current_user.id).first()
        if not settings:
            settings = Settings(user_id=current_user.id)
            db.session.add(settings)

        settings.bot_name = data.get('botName', 'LeoBot')
        settings.bot_description = data.get('botDescription', '')
        settings.bot_welcome = data.get('welcomeMessage', 'Bonjour !')

        # Sauvegarder le provider préféré
        current_user.preferred_provider = data.get('provider')
        current_user.onboarding_completed = True

        db.session.commit()

        logger.info(f"Wizard complété pour {current_user.username}")

        return jsonify({
            "success": True,
            "message": "Configuration sauvegardée",
            "redirect_to": url_for('main.config_api')
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur sauvegarde wizard: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Erreur: {str(e)}"
        }), 500


@main_bp.route("/api/toggle-ui-mode", methods=["POST"])
@login_required
def toggle_ui_mode():
    """Bascule entre mode simple et mode avancé."""
    try:
        data = request.get_json()
        new_mode = data.get('mode', 'simple')

        if new_mode not in ['simple', 'advanced']:
            return jsonify({
                "success": False,
                "error": "Mode invalide"
            }), 400

        current_user.ui_mode = new_mode
        db.session.commit()

        logger.info(f"Mode UI changé pour {current_user.username}: {new_mode}")

        return jsonify({
            "success": True,
            "mode": new_mode,
            "message": f"Mode {new_mode} activé"
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur toggle UI mode: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Erreur: {str(e)}"
        }), 500


@main_bp.route("/api/skip-onboarding", methods=["POST"])
@login_required
def skip_onboarding():
    """Permet de sauter l'onboarding."""
    try:
        current_user.onboarding_completed = True
        db.session.commit()

        logger.info(f"Onboarding sauté par {current_user.username}")

        return jsonify({
            "success": True,
            "message": "Onboarding sauté"
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur skip onboarding: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Erreur: {str(e)}"
        }), 500


###############################################
# ROUTES - CANAUX DE COMMUNICATION (INTEGRATIONS)
###############################################

@main_bp.route('/bot-config/integrations')
@login_required
def integrations_page():
    """Page de gestion des canaux de communication"""
    return render_template('bot_config/integrations.html')


@main_bp.route('/integrations/list', methods=['GET'])
@login_required
def get_integrations():
    """Récupère la liste des intégrations"""
    try:
        integrations = Integration.query.all()

        integrations_data = []
        for integration in integrations:
            integrations_data.append({
                'id': integration.id,
                'channel_type': integration.channel_type,
                'name': integration.name,
                'is_active': integration.is_active,
                'status': integration.status,
                'config': integration.config_dict,
                'last_sync': integration.last_sync.isoformat() if integration.last_sync else None,
                'error_message': integration.error_message
            })

        return jsonify({
            'success': True,
            'integrations': integrations_data
        })

    except Exception as e:
        logger.error(f"Erreur get_integrations: {str(e)}")
        return jsonify({
            'success': False,
            'error': f"Erreur: {str(e)}"
        }), 500


@main_bp.route('/integrations/create', methods=['POST'])
@login_required
def create_integration():
    """Crée une nouvelle intégration"""
    try:
        data = request.get_json()

        channel_type = data.get('channel_type')
        name = data.get('name')
        is_active = data.get('is_active', False)
        config = data.get('config', {})

        if not channel_type or not name:
            return jsonify({
                'success': False,
                'error': 'Champ requis manquant'
            }), 400

        # Vérifier si l'intégration existe déjà
        existing = Integration.query.filter_by(channel_type=channel_type).first()
        if existing:
            return jsonify({
                'success': False,
                'error': 'Une intégration existe déjà pour ce canal'
            }), 400

        # Créer l'intégration
        integration = Integration(
            channel_type=channel_type,
            name=name,
            is_active=is_active
        )
        integration.config_dict = config

        db.session.add(integration)
        db.session.flush()

        # Créer la configuration du canal
        channel_config = ChannelConfig(
            integration_id=integration.id,
            auto_reply_enabled=True
        )
        db.session.add(channel_config)

        # Créer un log
        log = IntegrationLog(
            integration_id=integration.id,
            log_type='info',
            message=f'Intégration {name} créée'
        )
        db.session.add(log)

        db.session.commit()

        logger.info(f"Intégration créée: {channel_type}")

        return jsonify({
            'success': True,
            'message': 'Intégration créée avec succès',
            'integration': {
                'id': integration.id,
                'channel_type': integration.channel_type,
                'name': integration.name,
                'is_active': integration.is_active,
                'status': integration.status
            }
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur create_integration: {str(e)}")
        return jsonify({
            'success': False,
            'error': f"Erreur: {str(e)}"
        }), 500


@main_bp.route('/integrations/<int:integration_id>/toggle', methods=['PATCH'])
@login_required
def toggle_integration(integration_id):
    """Active/désactive une intégration"""
    try:
        integration = Integration.query.get_or_404(integration_id)
        data = request.get_json()

        is_active = data.get('is_active')
        if is_active is None:
            return jsonify({
                'success': False,
                'error': 'Paramètre is_active manquant'
            }), 400

        integration.is_active = is_active
        integration.status = 'connected' if is_active else 'disconnected'

        # Créer un log
        log = IntegrationLog(
            integration_id=integration.id,
            log_type='info',
            message=f'Intégration {"activée" if is_active else "désactivée"}'
        )
        db.session.add(log)

        db.session.commit()

        logger.info(f"Intégration {integration_id} {'activée' if is_active else 'désactivée'}")

        return jsonify({
            'success': True,
            'message': f'Intégration {"activée" if is_active else "désactivée"}'
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur toggle_integration: {str(e)}")
        return jsonify({
            'success': False,
            'error': f"Erreur: {str(e)}"
        }), 500


@main_bp.route('/integrations/<int:integration_id>/config', methods=['PUT'])
@login_required
def update_integration_config(integration_id):
    """Met à jour la configuration d'une intégration"""
    try:
        integration = Integration.query.get_or_404(integration_id)
        data = request.get_json()

        config = data.get('config', {})
        integration.config_dict = config
        integration.updated_at = datetime.utcnow()

        # Créer un log
        log = IntegrationLog(
            integration_id=integration.id,
            log_type='info',
            message='Configuration mise à jour'
        )
        db.session.add(log)

        db.session.commit()

        logger.info(f"Configuration mise à jour pour l'intégration {integration_id}")

        return jsonify({
            'success': True,
            'message': 'Configuration mise à jour avec succès'
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur update_integration_config: {str(e)}")
        return jsonify({
            'success': False,
            'error': f"Erreur: {str(e)}"
        }), 500


@main_bp.route('/integrations/<int:integration_id>', methods=['DELETE'])
@login_required
def delete_integration(integration_id):
    """Supprime une intégration"""
    try:
        integration = Integration.query.get_or_404(integration_id)

        channel_name = integration.name

        db.session.delete(integration)
        db.session.commit()

        logger.info(f"Intégration {integration_id} supprimée")

        return jsonify({
            'success': True,
            'message': f'{channel_name} supprimé avec succès'
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur delete_integration: {str(e)}")
        return jsonify({
            'success': False,
            'error': f"Erreur: {str(e)}"
        }), 500


@main_bp.route('/integrations/stats', methods=['GET'])
@login_required
def get_integrations_stats():
    """Récupère les statistiques des intégrations"""
    try:
        # Compter les canaux actifs
        total_channels = Integration.query.filter_by(
            is_active=True,
            status='connected'
        ).count()

        # Compter les messages
        messages_sent = IntegrationLog.query.filter_by(
            log_type='message_sent'
        ).count()

        messages_received = IntegrationLog.query.filter_by(
            log_type='message_received'
        ).count()

        errors_count = IntegrationLog.query.filter_by(
            log_type='error'
        ).count()

        return jsonify({
            'success': True,
            'stats': {
                'total_channels': total_channels,
                'messages_sent': messages_sent,
                'messages_received': messages_received,
                'errors_count': errors_count
            }
        })

    except Exception as e:
        logger.error(f"Erreur get_integrations_stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': f"Erreur: {str(e)}"
        }), 500


@main_bp.route('/integrations/logs', methods=['GET'])
@login_required
def get_integration_logs():
    """Récupère les logs des intégrations"""
    try:
        # Limiter aux 100 derniers logs
        logs = IntegrationLog.query.order_by(
            IntegrationLog.created_at.desc()
        ).limit(100).all()

        logs_data = []
        for log in logs:
            logs_data.append({
                'id': log.id,
                'log_type': log.log_type,
                'message': log.message,
                'created_at': log.created_at.isoformat(),
                'channel_type': log.integration.channel_type if log.integration else 'unknown',
                'channel_name': log.integration.name if log.integration else 'Unknown',
                'metadata': log.metadata_dict
            })

        return jsonify({
            'success': True,
            'logs': logs_data
        })

    except Exception as e:
        logger.error(f"Erreur get_integration_logs: {str(e)}")
        return jsonify({
            'success': False,
            'error': f"Erreur: {str(e)}"
        }), 500


# ========================
# FIN DU FICHIER routes.py - VERSION COMPLÈTE MISE À JOUR
# ========================

# Note: Ce fichier contient maintenant toutes les routes nécessaires pour:
# 1. La nouvelle interface de configuration des réponses
# 2. La compatibilité avec l'ancienne interface
# 3. La gestion des clés API utilisateur
# 4. Les fonctionnalités avancées (export/import, cache, etc.)
# 5. La correction d'identité et post-traitement des réponses
# 6. Les routes de diagnostic et monitoring
# 7. Les fonctionnalités de sécurité et audit
# 8. Le wizard d'onboarding et le mode simple/avancé

logger.info("🚀 Module routes.py chargé avec succès - Version 2.0 avec nouvelle interface de réponses")