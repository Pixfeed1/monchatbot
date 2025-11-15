import os
from pathlib import Path

# Configuration pour compilation PyTorch - désactivé car plus besoin
os.environ["TORCH_COMPILE_DEBUG"] = "0"

# Chargement des variables d'environnement
basedir = Path(__file__).parent

class Config:
    """Configuration principale de l'application - Version Clés Utilisateur"""

    # Clés de sécurité et mode de débogage
    SECRET_KEY = os.getenv('SECRET_KEY', 'default-secret-key-change-in-production')
    DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'
    
    # Désactivation du reloader de Flask
    USE_RELOADER = False

    # Configuration de la base de données
    SQLALCHEMY_DATABASE_URI = os.getenv('SQLALCHEMY_DATABASE_URI')
    if not SQLALCHEMY_DATABASE_URI:
        db_path = basedir / 'instance' / 'site.db'
        SQLALCHEMY_DATABASE_URI = f'sqlite:///{db_path}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ===== CONFIGURATION MODE CLÉS UTILISATEUR =====
    
    # Mode de fonctionnement
    API_MODE = "user_keys"  # NOUVEAU : Mode clés utilisateur
    USER_KEYS_MANAGED = True  # Les clés sont gérées par les utilisateurs
    SERVER_SIDE_ENCRYPTION = True  # Chiffrement côté serveur
    
    # Désactivation complète du modèle local
    USE_LOCAL_MODEL = False
    
    # NOUVEAU : Configuration pour clés utilisateur
    # Les APIs sont disponibles mais les clés sont fournies par l'utilisateur
    USE_GPT = True  # Interface disponible pour OpenAI
    USE_MISTRAL_API = True  # Interface disponible pour Mistral
    USE_CLAUDE = True  # Interface disponible pour Claude (Anthropic)
    
    # Clés API serveur (SUPPRIMÉES - maintenant gérées par utilisateur)
    # Les clés sont maintenant stockées chiffrées en base pour chaque utilisateur
    OPENAI_API_KEY = ""  # Vide - géré par utilisateur
    MISTRAL_API_KEY = ""  # Vide - géré par utilisateur
    CLAUDE_API_KEY = ""  # Vide - géré par utilisateur
    
    # ===== CHIFFREMENT DES CLÉS UTILISATEUR =====
    
    # Clé de chiffrement pour les clés API utilisateur
    # IMPORTANT : Cette clé doit être définie dans les variables d'environnement
    ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')
    if not ENCRYPTION_KEY:
        # Générer une clé temporaire pour le développement
        # EN PRODUCTION : Cette clé DOIT être définie dans les variables d'environnement
        try:
            from cryptography.fernet import Fernet
            ENCRYPTION_KEY = Fernet.generate_key()
            print("⚠️  ATTENTION : Clé de chiffrement temporaire générée!")
            print("   Définissez ENCRYPTION_KEY dans vos variables d'environnement pour la production")
        except ImportError:
            print("❌ Module cryptography manquant. Installez-le : pip install cryptography")
            ENCRYPTION_KEY = None
    
    # ===== MODÈLES SUPPORTÉS =====
    
    # Modèles disponibles pour les utilisateurs
    AVAILABLE_MODELS = {
        'openai': {
            'gpt-3.5-turbo': 'GPT-3.5 Turbo (Rapide et économique)',
            'gpt-4': 'GPT-4 (Plus intelligent)',
            'gpt-4-turbo': 'GPT-4 Turbo (Équilibré)',
            'gpt-4o': 'GPT-4o (Dernière version)',
            'gpt-4o-mini': 'GPT-4o Mini (Rapide et économique)'
        },
        'mistral': {
            'mistral-small': 'Mistral Small (Rapide)',
            'mistral-medium': 'Mistral Medium (Équilibré)',
            'mistral-large': 'Mistral Large (Plus intelligent)',
            'open-mistral-7b': 'Open Mistral 7B',
            'open-mixtral-8x7b': 'Open Mixtral 8x7B'
        },
        'claude': {
            'claude-sonnet-4-5': 'Claude Sonnet 4.5 (Meilleur pour le code)',
            'claude-opus-4-1': 'Claude Opus 4.1 (Le plus puissant)',
            'claude-sonnet-4': 'Claude Sonnet 4 (Équilibré)',
            'claude-haiku-4-5': 'Claude Haiku 4.5 (Rapide et économique)',
            'claude-3-7-sonnet': 'Claude 3.7 Sonnet (Raisonnement hybride)'
        }
    }
    
    # Modèles par défaut recommandés
    DEFAULT_MODELS = {
        'openai': 'gpt-3.5-turbo',
        'mistral': 'mistral-small',
        'claude': 'claude-sonnet-4'
    }
    
    # Provider par défaut (pour suggestions)
    DEFAULT_PROVIDER = 'openai'
    DEFAULT_MODEL = 'gpt-3.5-turbo'
    
    # ===== PARAMÈTRES DE GÉNÉRATION =====
    
    # Paramètres par défaut optimisés pour les APIs
    DEFAULT_API_PARAMS = {
        'max_tokens': 150,
        'temperature': 0.7,
        'top_p': 0.9,
        'frequency_penalty': 0,
        'presence_penalty': 0
    }
    
    # Paramètres spécifiques par complexité
    COMPLEXITY_PARAMS = {
        0: {'max_tokens': 50, 'temperature': 0.3, 'top_p': 0.8},   # Simple
        1: {'max_tokens': 100, 'temperature': 0.5, 'top_p': 0.9},  # Modéré
        2: {'max_tokens': 150, 'temperature': 0.7, 'top_p': 0.9},  # Complexe
        3: {'max_tokens': 200, 'temperature': 0.8, 'top_p': 1.0}   # Très complexe
    }
    
    # Limites de sécurité
    MAX_TOKENS_LIMIT = 500  # Limite maximale pour éviter les coûts excessifs
    MAX_TEMPERATURE = 1.0
    MIN_TEMPERATURE = 0.0
    
    # ===== CONFIGURATION UTILISATEUR =====
    
    # Dossiers pour upload utilisateur
    UPLOAD_FOLDER = os.path.join(basedir, 'static', 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
    
    # Extensions autorisées pour les avatars
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'}

    # ===== CONFIGURATION reCAPTCHA =====
    
    RECAPTCHA_SECRET_KEY = os.getenv('RECAPTCHA_SECRET_KEY', '')
    RECAPTCHA_SITE_KEY = os.getenv('RECAPTCHA_SITE_KEY', '')

    # ===== IDENTIFIANTS ADMIN =====
    
    # Identifiants administrateur (optionnels)
    ADMIN_LOGIN = os.getenv('ADMIN_LOGIN', 'admin')
    ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')  # À changer en production
    
    # Identifiants utilisateur par défaut (optionnels)
    USER_LOGIN = os.getenv('USER_LOGIN', 'user')
    USER_PASSWORD = os.getenv('USER_PASSWORD', 'user123')  # À changer en production

    # ===== CONFIGURATION SMTP =====
    
    SMTP_SERVER = os.getenv('SMTP_SERVER', '')
    SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
    SMTP_USERNAME = os.getenv('SMTP_USERNAME', '')
    SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')
    SMTP_SECURITY = os.getenv('SMTP_SECURITY', 'tls')  # tls ou ssl
    FROM_EMAIL = os.getenv('FROM_EMAIL', '')
    FROM_NAME = os.getenv('FROM_NAME', 'Assistant Bot')

    # ===== CONFIGURATION SMS =====
    
    SMS_PROVIDER = os.getenv('SMS_PROVIDER', 'twilio')  # twilio ou vonage
    
    # Twilio
    TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID', '')
    TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN', '')
    TWILIO_FROM = os.getenv('TWILIO_FROM', '')
    
    # Vonage (ex-Nexmo)
    VONAGE_API_KEY = os.getenv('VONAGE_API_KEY', '')
    VONAGE_API_SECRET = os.getenv('VONAGE_API_SECRET', '')
    VONAGE_FROM = os.getenv('VONAGE_FROM', '')

    # ===== CONFIGURATION BOT PAR DÉFAUT =====
    
    # Paramètres par défaut du bot (peuvent être surchargés en base)
    BOT_NAME = os.getenv('BOT_NAME', 'Assistant')
    BOT_DESCRIPTION = os.getenv('BOT_DESCRIPTION', 'Je suis votre assistant virtuel intelligent.')
    BOT_WELCOME = os.getenv('BOT_WELCOME', 'Bonjour ! Comment puis-je vous aider aujourd\'hui ?')
    BOT_AVATAR = os.getenv('BOT_AVATAR', '')
    
    # ===== CONFIGURATION SESSION =====
    
    # Configuration des sessions Flask
    SESSION_TYPE = 'filesystem'
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True
    SESSION_FILE_DIR = os.path.join(basedir, 'flask_session')
    PERMANENT_SESSION_LIFETIME = 3600 * 24  # 24 heures
    
    # ===== CONFIGURATION CACHE =====
    
    # Cache pour les réponses et contextes
    CACHE_TYPE = 'simple'  # ou 'redis' en production
    CACHE_DEFAULT_TIMEOUT = 300  # 5 minutes
    
    # ===== CONFIGURATION LOGGING =====
    
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO').upper()
    LOG_FILE = os.getenv('LOG_FILE', '')  # Vide = pas de fichier de log
    
    # ===== VALIDATION ET SÉCURITÉ =====
    
    # Validation des clés API
    MIN_API_KEY_LENGTH = 10
    MAX_API_REQUESTS_PER_MINUTE = 60  # Limite par utilisateur
    
    # Sécurité
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = 3600  # 1 heure
    
    @classmethod
    def init_app(cls, app):
        """Initialisation pour version clés utilisateur"""
        
        print("🔧 Initialisation de l'application - Mode Clés Utilisateur")
        
        # Création des dossiers essentiels
        paths = [
            app.instance_path,
            Path(app.root_path) / 'flask_session',
            Path(app.root_path) / 'static' / 'uploads',
            Path(app.root_path) / 'logs'
        ]
        
        for path in paths:
            Path(path).mkdir(parents=True, exist_ok=True)
            print(f"✅ Dossier créé/vérifié: {path}")
        
        # Validation de la configuration
        cls._validate_config()
        
        # Configuration de l'app Flask
        app.config.update({
            # Mode de fonctionnement
            "API_MODE": cls.API_MODE,
            "USER_KEYS_MANAGED": cls.USER_KEYS_MANAGED,
            "SERVER_SIDE_ENCRYPTION": cls.SERVER_SIDE_ENCRYPTION,
            
            # APIs disponibles
            "USE_LOCAL_MODEL": False,
            "USE_GPT": cls.USE_GPT,
            "USE_MISTRAL_API": cls.USE_MISTRAL_API,
            
            # Configuration par défaut
            "DEFAULT_PROVIDER": cls.DEFAULT_PROVIDER,
            "DEFAULT_MODEL": cls.DEFAULT_MODEL,
            "AVAILABLE_MODELS": cls.AVAILABLE_MODELS,
            
            # Chiffrement
            "ENCRYPTION_KEY": cls.ENCRYPTION_KEY,
            
            # Limites
            "MAX_TOKENS_LIMIT": cls.MAX_TOKENS_LIMIT,
            "MAX_API_REQUESTS_PER_MINUTE": cls.MAX_API_REQUESTS_PER_MINUTE
        })
        
        print("🚀 Application configurée en mode Clés Utilisateur")
        print(f"   📊 Providers disponibles: OpenAI, Mistral, Claude")
        print(f"   🔐 Chiffrement activé: {bool(cls.ENCRYPTION_KEY)}")
        print(f"   🎯 Provider par défaut: {cls.DEFAULT_PROVIDER}")
    
    @classmethod
    def _validate_config(cls):
        """Valide la configuration et affiche des avertissements si nécessaire"""
        
        warnings = []
        errors = []
        
        # Validation de la clé de chiffrement
        if not cls.ENCRYPTION_KEY:
            errors.append("ENCRYPTION_KEY manquante - Le chiffrement des clés utilisateur ne fonctionnera pas")
        
        # Validation de la clé secrète
        if cls.SECRET_KEY == 'default-secret-key-change-in-production':
            warnings.append("SECRET_KEY par défaut détectée - Changez-la en production")
        
        # Validation des identifiants admin
        if cls.ADMIN_PASSWORD in ['admin123', 'admin', 'password']:
            warnings.append("Mot de passe admin faible détecté - Changez-le en production")
        
        # Validation SMTP (optionnelle)
        if not cls.SMTP_SERVER:
            warnings.append("Configuration SMTP manquante - Les fonctionnalités email seront désactivées")
        
        # Affichage des résultats
        if errors:
            print("❌ ERREURS DE CONFIGURATION:")
            for error in errors:
                print(f"   - {error}")
        
        if warnings:
            print("⚠️  AVERTISSEMENTS:")
            for warning in warnings:
                print(f"   - {warning}")
        
        if not errors and not warnings:
            print("✅ Configuration validée sans problème")
    
    @classmethod
    def get_model_info(cls, provider: str, model: str) -> dict:
        """
        Retourne les informations d'un modèle spécifique.
        
        Args:
            provider (str): Provider (openai/mistral)
            model (str): Nom du modèle
            
        Returns:
            dict: Informations du modèle
        """
        models = cls.AVAILABLE_MODELS.get(provider, {})
        if model in models:
            return {
                'provider': provider,
                'model': model,
                'display_name': models[model],
                'available': True
            }
        else:
            return {
                'provider': provider,
                'model': model,
                'display_name': model,
                'available': False
            }
    
    @classmethod
    def get_complexity_config(cls, complexity: int) -> dict:
        """
        Retourne la configuration pour un niveau de complexité donné.
        
        Args:
            complexity (int): Niveau de complexité (0-3)
            
        Returns:
            dict: Configuration des paramètres
        """
        complexity = max(0, min(complexity, 3))  # Limiter entre 0 et 3
        base_config = cls.DEFAULT_API_PARAMS.copy()
        complexity_config = cls.COMPLEXITY_PARAMS.get(complexity, {})
        
        # Merger les configurations
        base_config.update(complexity_config)
        
        # Appliquer les limites de sécurité
        base_config['max_tokens'] = min(base_config['max_tokens'], cls.MAX_TOKENS_LIMIT)
        base_config['temperature'] = max(cls.MIN_TEMPERATURE, 
                                        min(base_config['temperature'], cls.MAX_TEMPERATURE))
        
        return base_config
    
    @classmethod
    def is_api_available(cls, provider: str) -> bool:
        """
        Vérifie si un provider API est disponible.

        Args:
            provider (str): Nom du provider

        Returns:
            bool: True si disponible
        """
        if provider == 'openai':
            return cls.USE_GPT
        elif provider == 'mistral':
            return cls.USE_MISTRAL_API
        elif provider == 'claude':
            return cls.USE_CLAUDE
        else:
            return False

# ===== CONFIGURATION DE DÉVELOPPEMENT =====

class DevelopmentConfig(Config):
    """Configuration pour l'environnement de développement"""
    DEBUG = True
    TESTING = False
    
    # Logging plus verbeux en développement
    LOG_LEVEL = 'DEBUG'
    
    # Sessions plus courtes en développement
    PERMANENT_SESSION_LIFETIME = 3600  # 1 heure

# ===== CONFIGURATION DE PRODUCTION =====

class ProductionConfig(Config):
    """Configuration pour l'environnement de production"""
    DEBUG = False
    TESTING = False
    
    # Sécurité renforcée
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Logging en production
    LOG_LEVEL = 'WARNING'
    LOG_FILE = 'app.log'
    
    # Cache Redis recommandé en production
    CACHE_TYPE = 'redis'
    CACHE_REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')

# ===== CONFIGURATION DE TEST =====

class TestingConfig(Config):
    """Configuration pour les tests"""
    TESTING = True
    DEBUG = True
    
    # Base de données en mémoire pour les tests
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    
    # Désactiver CSRF pour les tests
    WTF_CSRF_ENABLED = False
    
    # Clé de chiffrement fixe pour les tests
    from cryptography.fernet import Fernet
    ENCRYPTION_KEY = Fernet.generate_key()

# ===== SÉLECTION DE LA CONFIGURATION =====

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

def get_config():
    """Retourne la configuration selon l'environnement"""
    env = os.getenv('FLASK_ENV', 'development').lower()
    return config.get(env, config['default'])