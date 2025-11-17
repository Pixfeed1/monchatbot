from . import db
from datetime import datetime
import json
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from . import login_manager

###############################################
# Nouveaux modèles pour l'automatisation d'actions
###############################################

class ActionTrigger(db.Model):
    """Modèle pour les déclencheurs d'actions"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    trigger_type = db.Column(db.String(50), nullable=False)  # email, sms, calendar, ticket, form
    is_active = db.Column(db.Boolean, default=True)
    
    # Configuration du déclencheur en JSON
    _conditions = db.Column('conditions', db.Text)
    _config = db.Column('config', db.Text)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def conditions(self):
        return json.loads(self._conditions) if self._conditions else {}

    @conditions.setter
    def conditions(self, value):
        self._conditions = json.dumps(value)

    @property
    def config(self):
        return json.loads(self._config) if self._config else {}

    @config.setter
    def config(self, value):
        self._config = json.dumps(value)


class EmailTemplate(db.Model):
    """Modèle pour les templates d'emails"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    subject = db.Column(db.String(200))
    body = db.Column(db.Text)
    variables = db.Column(db.Text)  # Variables disponibles dans le template
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class CalendarConfig(db.Model):
    """Configuration des intégrations calendrier"""
    id = db.Column(db.Integer, primary_key=True)
    service_type = db.Column(db.String(50))  # google, outlook
    credentials = db.Column(db.Text)  # Stocké de manière sécurisée
    default_duration = db.Column(db.Integer, default=30)  # en minutes
    calendar_id = db.Column(db.String(200))
    settings = db.Column(db.Text)  # Paramètres supplémentaires en JSON


class TicketConfig(db.Model):
    """Configuration du système de tickets"""
    id = db.Column(db.Integer, primary_key=True)
    service_type = db.Column(db.String(50))  # internal, zendesk, freshdesk
    api_key = db.Column(db.String(200))
    subdomain = db.Column(db.String(100))
    _priority_mapping = db.Column('priority_mapping', db.Text)

    @property
    def priority_mapping(self):
        return json.loads(self._priority_mapping) if self._priority_mapping else {}

    @priority_mapping.setter
    def priority_mapping(self, value):
        self._priority_mapping = json.dumps(value)


class FormRedirection(db.Model):
    """Configuration des redirections vers des formulaires"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    url = db.Column(db.String(500), nullable=False)
    conditions = db.Column(db.Text)
    parameters = db.Column(db.Text)  # Paramètres à passer au formulaire


###############################################
# Modèles généraux avec support API utilisateur
###############################################

class Settings(db.Model):
    """Paramètres du bot et configuration API par utilisateur"""
    id = db.Column(db.Integer, primary_key=True)
    
    # Paramètres généraux du bot
    bot_name = db.Column(db.String(100), nullable=False, default="Léo")
    bot_description = db.Column(db.String(500), nullable=True, default="Je suis Léo, votre assistant intelligent et sympathique. Je suis là pour vous aider et répondre à vos questions.")
    bot_welcome = db.Column(db.String(500), nullable=False, default="Bonjour ! Je suis Léo, ravi de vous rencontrer !")
    bot_avatar = db.Column(db.String(200), nullable=True)
    
    # Configuration API par utilisateur
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    encrypted_openai_key = db.Column(db.Text, nullable=True)
    encrypted_mistral_key = db.Column(db.Text, nullable=True)
    encrypted_claude_key = db.Column(db.Text, nullable=True)
    current_provider = db.Column(db.String(20), nullable=True)  # openai, mistral, claude
    openai_model = db.Column(db.String(50), nullable=True, default='gpt-3.5-turbo')
    mistral_model = db.Column(db.String(50), nullable=True, default='mistral-small')
    claude_model = db.Column(db.String(50), nullable=True, default='claude-sonnet-4')
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relation avec User
    user = db.relationship('User', backref=db.backref('settings', lazy=True))

    def __repr__(self):
        return f'<Settings {self.bot_name}>'


class KnowledgeCategory(db.Model):
    """Catégorie de la base de connaissances"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations avec d'autres modèles
    faqs = db.relationship('FAQ', backref='category', lazy=True)
    documents = db.relationship('Document', backref='category', lazy=True)
    rules = db.relationship('ResponseRule', backref='category', lazy=True)


class FAQ(db.Model):
    """Questions fréquentes et leurs réponses"""
    id = db.Column(db.Integer, primary_key=True)
    question = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('knowledge_category.id'), nullable=False)
    keywords = db.Column(db.Text)  # Stocké au format JSON
    priority = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def keyword_list(self):
        return json.loads(self.keywords) if self.keywords else []

    @keyword_list.setter
    def keyword_list(self, value):
        self.keywords = json.dumps(value)


class Document(db.Model):
    """Documents de référence uploadés"""
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(50))
    file_size = db.Column(db.Integer, default=0)  # Taille en bytes
    category_id = db.Column(db.Integer, db.ForeignKey('knowledge_category.id'), nullable=False)
    content = db.Column(db.Text)  # Contenu extrait du document
    summary = db.Column(db.Text)  # Résumé du document
    status = db.Column(db.String(20), default='processing')  # processing, processed, error
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ResponseRule(db.Model):
    """Règles de réponse personnalisées"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('knowledge_category.id'), nullable=False)
    conditions = db.Column(db.Text)  # Stocké au format JSON
    response_template = db.Column(db.Text, nullable=False)
    priority = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def condition_rules(self):
        return json.loads(self.conditions) if self.conditions else {}

    @condition_rules.setter
    def condition_rules(self, value):
        self.conditions = json.dumps(value)


class VocabularyTerm(db.Model):
    """Termes de vocabulaire métier"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    definition = db.Column(db.Text, nullable=False)
    synonyms = db.Column(db.Text)  # Stocké au format JSON
    category = db.Column(db.String(100), default='general')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def synonym_list(self):
        return json.loads(self.synonyms) if self.synonyms else []

    @synonym_list.setter
    def synonym_list(self, value):
        self.synonyms = json.dumps(value)


class AdvancedRule(db.Model):
    """Règles avancées pour la base de connaissances"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    rule_type = db.Column(db.String(50), nullable=False)  # conditional, context, priority
    description = db.Column(db.Text)
    conditions = db.Column(db.Text)  # Stocké au format JSON
    actions = db.Column(db.Text)  # Stocké au format JSON
    is_active = db.Column(db.Boolean, default=True)
    priority = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def condition_list(self):
        return json.loads(self.conditions) if self.conditions else []

    @condition_list.setter
    def condition_list(self, value):
        self.conditions = json.dumps(value)

    @property
    def action_list(self):
        return json.loads(self.actions) if self.actions else []

    @action_list.setter
    def action_list(self, value):
        self.actions = json.dumps(value)


class BotCompetences(db.Model):
    """Compétences et domaines d'expertise du bot"""
    id = db.Column(db.Integer, primary_key=True)
    
    # Service Client
    service_client_active = db.Column(db.Boolean, default=False)
    service_client_niveau = db.Column(db.String(20), default='basic')
    _service_client_domains = db.Column(db.Text, default='[]')  # Stocké en JSON
    
    # Génération de Leads
    lead_gen_active = db.Column(db.Boolean, default=False)
    _lead_qualification = db.Column(db.Text, default='[]')  # Stocké en JSON
    
    # Support Technique
    support_tech_active = db.Column(db.Boolean, default=False)
    support_tech_niveau = db.Column(db.String(20), default='l1')

    @property
    def service_client_domains(self):
        return json.loads(self._service_client_domains)

    @service_client_domains.setter
    def service_client_domains(self, value):
        self._service_client_domains = json.dumps(value)

    @property
    def lead_qualification(self):
        return json.loads(self._lead_qualification)

    @lead_qualification.setter
    def lead_qualification(self, value):
        self._lead_qualification = json.dumps(value)


class BotResponses(db.Model):
    """Configuration des réponses du bot"""
    id = db.Column(db.Integer, primary_key=True)
    
    # Style et ton
    communication_style = db.Column(db.String(50), default='professional')
    language_level = db.Column(db.String(50), default='standard')
    _personality_traits = db.Column('personality_traits', db.Text, default='[]')
    
    # Messages par défaut
    welcome_message = db.Column(db.Text)
    goodbye_message = db.Column(db.Text)
    fallback_message = db.Column(db.Text)
    redirect_message = db.Column(db.Text)
    
    # Messages d'erreur
    technical_error = db.Column(db.Text)
    invalid_data = db.Column(db.Text)
    service_unavailable = db.Column(db.Text)
    
    # Vocabulaire personnalisé
    _vocabulary = db.Column('vocabulary', db.Text, default='{}')

    # Templates essentiels (stockés en JSON)
    _essential_templates = db.Column('essential_templates', db.Text, default='{}')

    # Configuration du comportement (stockée en JSON)
    _behavior_config = db.Column('behavior_config', db.Text, default='{}')

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def personality_traits(self):
        return json.loads(self._personality_traits)

    @personality_traits.setter
    def personality_traits(self, value):
        self._personality_traits = json.dumps(value)

    @property
    def vocabulary(self):
        try:
            result = json.loads(self._vocabulary) if self._vocabulary else {}
            return result
        except (TypeError, json.JSONDecodeError) as e:
            return {}

    @vocabulary.setter
    def vocabulary(self, value):
        try:
            if value is None:
                self._vocabulary = '{}'
            else:
                if isinstance(value, str):
                    # Vérifie que c'est un JSON valide
                    json.loads(value)
                    self._vocabulary = value
                else:
                    self._vocabulary = json.dumps(value)
        except (TypeError, json.JSONDecodeError) as e:
            self._vocabulary = '{}'

    @property
    def essential_templates(self):
        try:
            return json.loads(self._essential_templates) if self._essential_templates else {}
        except (TypeError, json.JSONDecodeError):
            return {}

    @essential_templates.setter
    def essential_templates(self, value):
        try:
            self._essential_templates = json.dumps(value) if value else '{}'
        except (TypeError, json.JSONDecodeError):
            self._essential_templates = '{}'

    @property
    def behavior_config(self):
        try:
            return json.loads(self._behavior_config) if self._behavior_config else {}
        except (TypeError, json.JSONDecodeError):
            return {}

    @behavior_config.setter
    def behavior_config(self, value):
        try:
            self._behavior_config = json.dumps(value) if value else '{}'
        except (TypeError, json.JSONDecodeError):
            self._behavior_config = '{}'


###############################################
# Modèle pour les messages par défaut
###############################################

class DefaultMessage(db.Model):
    """Messages par défaut et réponses rapides"""
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    triggers = db.Column(db.String(200))  # Stocké comme string avec séparateurs
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'triggers': self.triggers.split(',') if self.triggers else []
        }


###############################################
# Nouveaux modèles pour les flux de conversation
###############################################

class ConversationFlow(db.Model):
    """Modèle principal pour les flux de conversation"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Structure du flux stockée en JSON
    _flow_data = db.Column('flow_data', db.Text)
    
    # Relations
    nodes = db.relationship('FlowNode', backref='flow', lazy=True, cascade='all, delete-orphan')
    
    @property
    def flow_data(self):
        return json.loads(self._flow_data) if self._flow_data else {}
    
    @flow_data.setter
    def flow_data(self, value):
        self._flow_data = json.dumps(value)


class FlowNode(db.Model):
    """Nœuds individuels dans le flux de conversation"""
    id = db.Column(db.Integer, primary_key=True)
    flow_id = db.Column(db.Integer, db.ForeignKey('conversation_flow.id'), nullable=False)
    node_type = db.Column(db.String(50), nullable=False)  # message, condition, input, action, api
    position_x = db.Column(db.Float)
    position_y = db.Column(db.Float)
    
    # Configuration du nœud en JSON
    _config = db.Column('config', db.Text)
    
    # Relations
    connections = db.relationship(
        'NodeConnection',
        foreign_keys='NodeConnection.source_node_id',
        backref='source_node', 
        lazy=True,
        cascade='all, delete-orphan'
    )
    
    @property
    def config(self):
        return json.loads(self._config) if self._config else {}
    
    @config.setter
    def config(self, value):
        self._config = json.dumps(value)


class NodeConnection(db.Model):
    """Connexions entre les nœuds"""
    id = db.Column(db.Integer, primary_key=True)
    source_node_id = db.Column(db.Integer, db.ForeignKey('flow_node.id'), nullable=False)
    target_node_id = db.Column(db.Integer, db.ForeignKey('flow_node.id'), nullable=False)
    condition = db.Column(db.Text)  # Condition pour suivre cette connexion
    priority = db.Column(db.Integer, default=0)  # Ordre d'évaluation des conditions


class FlowVariable(db.Model):
    """Variables utilisées dans les flux"""
    id = db.Column(db.Integer, primary_key=True)
    flow_id = db.Column(db.Integer, db.ForeignKey('conversation_flow.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    var_type = db.Column(db.String(50))  # string, number, boolean, etc.
    default_value = db.Column(db.Text)


###############################################
# Modèle pour les utilisateurs (Flask-Login)
###############################################

class User(UserMixin, db.Model):
    """Modèle d'utilisateur avec gestion des clés API personnelles"""
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    
    # Gestion des rôles
    is_admin = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    
    # Métadonnées utilisateur
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    login_count = db.Column(db.Integer, default=0)
    
    # Préférences utilisateur pour l'API
    preferred_provider = db.Column(db.String(20), nullable=True)  # openai, mistral, claude
    api_usage_limit = db.Column(db.Integer, nullable=True)  # Limite mensuelle
    api_usage_current = db.Column(db.Integer, default=0)  # Usage actuel du mois
    api_usage_reset_date = db.Column(db.DateTime, nullable=True)  # Date de reset du compteur

    # Préférences UX - Mode Simple/Avancé
    onboarding_completed = db.Column(db.Boolean, default=False)  # A terminé le wizard
    ui_mode = db.Column(db.String(20), default='simple')  # 'simple' ou 'advanced'

    def set_password(self, password):
        """Hash et stocke le mot de passe"""
        self.password = generate_password_hash(password)
    
    def check_password(self, password):
        """Vérifie le mot de passe"""
        return check_password_hash(self.password, password)
    
    def update_login_stats(self):
        """Met à jour les statistiques de connexion"""
        self.last_login = datetime.utcnow()
        self.login_count += 1
    
    def get_api_settings(self):
        """Récupère les paramètres API de l'utilisateur"""
        return Settings.query.filter_by(user_id=self.id).first()
    
    def has_valid_api_key(self):
        """Vérifie si l'utilisateur a au moins une clé API configurée"""
        settings = self.get_api_settings()
        if not settings:
            return False
        return bool(settings.encrypted_openai_key or settings.encrypted_mistral_key)
    
    def can_use_api(self):
        """Vérifie si l'utilisateur peut utiliser l'API (limites, etc.)"""
        if not self.is_active:
            return False
        
        # Vérifier les limites d'usage si configurées
        if self.api_usage_limit and self.api_usage_current >= self.api_usage_limit:
            return False
        
        return self.has_valid_api_key()
    
    def increment_api_usage(self):
        """Incrémente le compteur d'usage API"""
        self.api_usage_current += 1
        
        # Reset automatique si c'est un nouveau mois
        now = datetime.utcnow()
        if (self.api_usage_reset_date and 
            now.month != self.api_usage_reset_date.month):
            self.api_usage_current = 1
            self.api_usage_reset_date = now
        elif not self.api_usage_reset_date:
            self.api_usage_reset_date = now

    def __repr__(self):
        return f'<User {self.username}>'


###############################################
# Nouveaux modèles pour l'audit et la sécurité
###############################################

class APIUsageLog(db.Model):
    """Log d'utilisation des APIs par utilisateur"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    provider = db.Column(db.String(20), nullable=False)  # openai, mistral
    model = db.Column(db.String(50), nullable=False)
    tokens_used = db.Column(db.Integer, default=0)
    cost_estimate = db.Column(db.Float, default=0.0)
    request_duration = db.Column(db.Float, default=0.0)  # en secondes
    success = db.Column(db.Boolean, default=True)
    error_message = db.Column(db.Text, nullable=True)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relation avec User
    user = db.relationship('User', backref=db.backref('api_usage_logs', lazy=True))


class SecurityAuditLog(db.Model):
    """Log d'audit de sécurité"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    event_type = db.Column(db.String(50), nullable=False)  # login, api_key_change, config_update
    event_description = db.Column(db.Text, nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)
    user_agent = db.Column(db.Text, nullable=True)
    success = db.Column(db.Boolean, default=True)
    risk_level = db.Column(db.String(20), default='low')  # low, medium, high, critical
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relation avec User
    user = db.relationship('User', backref=db.backref('security_logs', lazy=True))


###############################################
# Chargeur d'utilisateur Flask-Login
###############################################

@login_manager.user_loader
def load_user(user_id):
    """Charge un utilisateur pour Flask-Login"""
    return User.query.get(int(user_id))


###############################################
# Fonctions utilitaires pour les modèles
###############################################

def init_default_data():
    """Initialise les données par défaut de l'application"""
    try:
        # Créer les paramètres par défaut s'ils n'existent pas
        if not Settings.query.first():
            default_settings = Settings(
                bot_name="Léo",
                bot_description="Je suis Léo, votre assistant intelligent et sympathique. Je suis là pour vous aider et répondre à vos questions.",
                bot_welcome="Bonjour ! Je suis Léo, ravi de vous rencontrer !"
            )
            db.session.add(default_settings)
        
        # Créer une catégorie de connaissances par défaut
        if not KnowledgeCategory.query.first():
            default_category = KnowledgeCategory(
                name="Général",
                description="Catégorie par défaut pour les connaissances générales"
            )
            db.session.add(default_category)
        
        # Créer la configuration de réponses par défaut
        if not BotResponses.query.first():
            default_responses = BotResponses(
                communication_style="professional",
                language_level="standard",
                welcome_message="Bonjour ! Je suis votre assistant IA. Comment puis-je vous aider ?",
                fallback_message="Je ne suis pas sûr de comprendre. Pouvez-vous reformuler votre question ?",
                technical_error="Désolé, un problème technique est survenu. Veuillez réessayer dans quelques instants."
            )
            db.session.add(default_responses)
        
        db.session.commit()
        print("Données par défaut initialisées avec succès")
        
    except Exception as e:
        db.session.rollback()
        print(f"Erreur lors de l'initialisation des données par défaut: {e}")


def cleanup_old_logs(days=30):
    """Nettoie les anciens logs (fonction à appeler périodiquement)"""
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Nettoyer les logs d'usage API
        old_usage_logs = APIUsageLog.query.filter(APIUsageLog.created_at < cutoff_date).all()
        for log in old_usage_logs:
            db.session.delete(log)
        
        # Nettoyer les logs de sécurité (garder plus longtemps)
        old_security_logs = SecurityAuditLog.query.filter(
            SecurityAuditLog.created_at < cutoff_date,
            SecurityAuditLog.risk_level == 'low'
        ).all()
        for log in old_security_logs:
            db.session.delete(log)
        
        db.session.commit()
        print(f"Nettoyage des logs terminé: {len(old_usage_logs)} logs d'usage et {len(old_security_logs)} logs de sécurité supprimés")
        
    except Exception as e:
        db.session.rollback()
        print(f"Erreur lors du nettoyage des logs: {e}")