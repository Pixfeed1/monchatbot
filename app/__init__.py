import os
import logging
import threading
import time
from datetime import timedelta, datetime

from flask import Flask, session, flash, redirect, url_for, request
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_wtf import CSRFProtect
from flask_login import LoginManager, current_user, logout_user
from flask_session import Session
from flask_cors import CORS
from dotenv import load_dotenv

from .config import Config

# Configuration du logger
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

logger.info("»»»» Début de l'initialisation de l'application (Version API)")

# Initialisation des extensions
db = SQLAlchemy()
migrate = Migrate()
csrf = CSRFProtect()
login_manager = LoginManager()

def create_app():
    """Crée et configure l'application Flask en mode API uniquement."""
    logger.info("»»»» Démarrage de la création de l'application Flask (API)")
    app = Flask(__name__)
    
    # Charger les variables d'environnement
    load_dotenv()
    logger.info("»»»» Variables d'environnement chargées")
    
    # Configuration CORS
    logger.info("»»»» Configuration de CORS")
    CORS(app, resources={
        r"/*": {
            "origins": [
                "http://127.0.0.1:5000",
                "http://localhost:5000",
                "http://127.0.0.1:3000",
                "http://localhost:3000"
            ],
            "methods": ["GET", "POST", "PUT", "DELETE"],
            "allow_headers": ["Content-Type", "X-CSRF-Token", "X-Requested-With", "Authorization"]
        }
    }, supports_credentials=True)
    
    # Création des dossiers nécessaires (réduit pour API)
    logger.info("»»»» Création des dossiers nécessaires")
    os.makedirs(os.path.join(app.root_path, 'flask_session'), exist_ok=True)
    os.makedirs(os.path.join(app.root_path, 'instance'), exist_ok=True)
    upload_dir = os.path.join(app.root_path, 'static', 'uploads')
    os.makedirs(upload_dir, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_dir

    # Configuration des sessions et cookies
    logger.info("»»»» Configuration des sessions et cookies")
    app.config.update(
        PERMANENT_SESSION_LIFETIME=timedelta(days=1),
        SESSION_COOKIE_SECURE=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_TYPE='filesystem',
        REMEMBER_COOKIE_DURATION=timedelta(days=1),
        REMEMBER_COOKIE_SECURE=False,
        REMEMBER_COOKIE_HTTPONLY=True,
        REMEMBER_COOKIE_SAMESITE='Lax'
    )
    
    # Initialisation des composants
    logger.info("»»»» Initialisation de la session Flask")
    Session(app)
    logger.info("»»»» Chargement de la configuration")
    app.config.from_object(Config)
    Config.init_app(app)
    
    # Initialisation des extensions
    logger.info("»»»» Initialisation de la base de données")
    db.init_app(app)
    logger.info("»»»» Initialisation de Flask-Migrate")
    migrate.init_app(app, db)
    logger.info("»»»» Initialisation de CSRF")
    csrf.init_app(app)
    
    # Configuration du login manager
    logger.info("»»»» Configuration du login manager")
    login_manager.init_app(app)
    login_manager.login_view = 'main.login'
    login_manager.login_message = 'Veuillez vous connecter pour accéder à cette page.'
    login_manager.login_message_category = 'warning'
    login_manager.refresh_view = 'main.login'
    login_manager.needs_refresh_message = 'Veuillez vous reconnecter.'
    login_manager.needs_refresh_message_category = 'warning'

    with app.app_context():
        # Ajouter le chargeur d'utilisateur pour Flask-Login
        from .models import User
        
        @login_manager.user_loader
        def load_user(user_id):
            try:
                return User.query.get(int(user_id))
            except Exception as e:
                logger.error(f"Erreur lors du chargement de l'utilisateur {user_id}: {str(e)}")
                return None
        
        # Route de test pour debugging
        @app.route('/test')
        def test_route():
            return 'Test route: OK! Application Flask API fonctionne correctement.'
        

            
        # Gestionnaire d'erreur 404 pour le débogage
        @app.errorhandler(404)
        def page_not_found(e):
            path = request.path
            logger.error(f"Page 404 non trouvée: {path}")
            return f"<h1>Page non trouvée (404)</h1><p>L'URL demandée ({path}) n'existe pas sur ce serveur.</p>", 404
        
        # Middleware de session
        @app.before_request
        def session_management():
            if current_user.is_authenticated:
                session.modified = True
                session.permanent = True
                if 'last_activity' in session:
                    inactive_time = datetime.utcnow() - datetime.fromtimestamp(session['last_activity'])
                    if inactive_time > timedelta(days=1):
                        logout_user()
                        flash('Session expirée. Reconnectez-vous.', 'warning')
                        return redirect(url_for('main.login'))
                session['last_activity'] = datetime.utcnow().timestamp()
                
        # Initialisation de la base de données si nécessaire
        logger.info("»»»» Création/vérification des tables de la base de données")
        try:
            db.create_all()
            logger.info("»»»» Structure de la base de données créée ou vérifiée")
        except Exception as e:
            logger.error(f"»»»» Erreur lors de l'initialisation de la base de données: {str(e)}", exc_info=True)

        # ===== INITIALISATION API (remplace le modèle local) =====
        logger.info("»»»» Initialisation du gestionnaire API...")
        try:
            from .api_inference import get_api_instance
            api_manager = get_api_instance(app)
            app.api_manager = api_manager
            
            if api_manager.is_ready:
                logger.info("✅ Gestionnaire API initialisé avec succès")
                # Note: Les tests API se font quand l'utilisateur configure ses clés
                # test_results = api_manager.test_providers()  # Méthode non disponible en mode user_keys
            else:
                logger.error(f"❌ Échec de l'initialisation API: {api_manager.error_message}")
                
        except Exception as e:
            logger.error(f"»»»» Erreur lors de l'initialisation de l'API: {str(e)}", exc_info=True)
        
        # Enregistrement des blueprints principaux
        logger.info("»»»» Enregistrement des blueprints principaux")
        try:
            from .routes import main_bp, knowledge_bp, flow_bp, responses_bp, actions_bp
            app.register_blueprint(main_bp)
            app.register_blueprint(knowledge_bp)
            app.register_blueprint(flow_bp)
            app.register_blueprint(responses_bp)
            app.register_blueprint(actions_bp)
            logger.info("»»»» Blueprints principaux enregistrés avec succès")
        except Exception as e:
            logger.error(f"»»»» Erreur lors de l'enregistrement des blueprints principaux: {str(e)}", exc_info=True)
        
        # Enregistrement du blueprint des réponses rapides
        logger.info("»»»» Tentative d'enregistrement du blueprint des réponses rapides")
        try:
            from .fast_responses import fast_responses_bp
            app.register_blueprint(fast_responses_bp)
            logger.info("»»»» Blueprint des réponses rapides enregistré avec succès")
        except Exception as e:
            logger.error(f"»»»» Erreur lors de l'enregistrement du blueprint des réponses rapides: {str(e)}", exc_info=True)

        # Initialiser le cache des réponses rapides
        logger.info("»»»» Tentative d'initialisation du cache des réponses rapides")
        try:
            from .fast_responses_cache import initialize_cache
            logger.info("»»»» Module fast_responses_cache importé avec succès")
            initialize_cache(app)
            logger.info("»»»» Cache initialisé avec succès")
        except Exception as e:
            logger.error(f"»»»» Erreur lors de l'initialisation du cache: {str(e)}", exc_info=True)

        # ===== INITIALISATION TERMINÉE =====
        logger.info("»»»» Initialisation terminée sans workers asynchrones")
    
    logger.info("»»»» Création de l'application terminée (Mode API)")
    return app