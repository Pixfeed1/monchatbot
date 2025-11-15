/**
 * Gestionnaire des réponses rapides - Version simplifiée et optimisée
 * Compatible avec la nouvelle interface de configuration
 */

class FastResponsesManager {
    constructor() {
        this.responses = new Map();
        this.isLoading = false;
        this.lastSync = null;
        
        this.init();
    }

    /**
     * Initialisation du gestionnaire
     */
    init() {
        if (!this.checkCompatibility()) {
            console.warn('Interface de réponses rapides non détectée');
            return;
        }

        this.loadResponses();
        this.setupEventListeners();
        this.startPeriodicSync();
    }

    /**
     * Vérification de compatibilité avec l'ancienne interface
     */
    checkCompatibility() {
        return document.querySelector('.messages-list') !== null;
    }

    /**
     * Configuration des écouteurs d'événements
     */
    setupEventListeners() {
        // Bouton d'ajout de message (s'il existe encore)
        const addMessageBtn = document.querySelector('.add-message-btn');
        if (addMessageBtn) {
            addMessageBtn.addEventListener('click', () => {
                this.showMigrationNotice();
            });
        }

        // Bouton de sauvegarde (s'il existe encore)
        const saveBtn = document.querySelector('.btn-primary[type="button"]');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.showMigrationNotice();
            });
        }

        // Écouteurs pour les boutons de suppression existants
        document.addEventListener('click', (e) => {
            if (e.target.closest('.delete-message')) {
                e.preventDefault();
                this.showMigrationNotice();
            }
        });
    }

    /**
     * Chargement des réponses depuis la nouvelle API
     */
    async loadResponses() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        
        try {
            const response = await fetch('/api/responses/configuration');
            if (response.ok) {
                const config = await response.json();
                this.processConfiguration(config);
                this.renderResponses();
                this.lastSync = Date.now();
            } else {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
        } catch (error) {
            console.error('Erreur lors du chargement des réponses:', error);
            this.showError('Erreur lors du chargement des réponses');
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Traitement de la configuration pour créer les réponses rapides
     */
    processConfiguration(config) {
        this.responses.clear();

        // Traitement du message de bienvenue
        if (config.welcomeMessage) {
            this.responses.set('welcome', {
                id: 'welcome',
                title: 'Message de Bienvenue',
                content: config.welcomeMessage,
                triggers: ['__welcome__'],
                type: 'system',
                active: true
            });
        }

        // Traitement des templates essentiels
        if (config.essentialTemplates) {
            this.processEssentialTemplates(config.essentialTemplates);
        }

        // Traitement des réponses personnalisées
        if (config.customResponses && Array.isArray(config.customResponses)) {
            config.customResponses.forEach((response, index) => {
                this.responses.set(`custom_${response.id || index}`, {
                    id: `custom_${response.id || index}`,
                    title: this.generateTitleFromKeywords(response.keywords),
                    content: response.content,
                    triggers: response.keywords || [],
                    type: 'custom',
                    active: true
                });
            });
        }

        // Traitement des messages d'erreur
        if (config.errorMessages && Array.isArray(config.errorMessages)) {
            config.errorMessages.forEach((error, index) => {
                this.responses.set(`error_${index}`, {
                    id: `error_${index}`,
                    title: error.title,
                    content: error.content,
                    triggers: [error.code],
                    type: 'error',
                    active: true
                });
            });
        }
    }

    /**
     * Traitement des templates essentiels
     */
    processEssentialTemplates(templates) {
        const templateDefinitions = {
            greeting: {
                title: 'Salutations',
                defaultTriggers: ['bonjour', 'salut', 'hello', 'bonsoir', 'coucou'],
                responses: {
                    formal: 'Bonjour, comment puis-je vous aider ?',
                    friendly: 'Salut ! Que puis-je faire pour toi ?'
                }
            },
            goodbye: {
                title: 'Au revoir',
                defaultTriggers: ['au revoir', 'bye', 'à bientôt', 'merci', 'à plus'],
                responses: {
                    polite: 'Au revoir, bonne journée !',
                    helpful: 'N\'hésitez pas à revenir si vous avez d\'autres questions !'
                }
            },
            thanks: {
                title: 'Remerciements',
                defaultTriggers: ['merci', 'thanks', 'super', 'parfait'],
                responses: {
                    simple: 'De rien, ravi d\'avoir pu vous aider !',
                    encouraging: 'Avec plaisir ! Je suis là si vous avez d\'autres questions.'
                }
            },
            unclear: {
                title: 'Question peu claire',
                defaultTriggers: ['__unclear__'],
                responses: {
                    helpful: 'Pourriez-vous reformuler votre question ? Je veux être sûr de bien vous aider.',
                    guiding: 'Je ne suis pas sûr de comprendre. Pouvez-vous me donner plus de détails ?'
                }
            }
        };

        Object.entries(templates).forEach(([templateName, config]) => {
            if (!config.active) return;

            const definition = templateDefinitions[templateName];
            if (!definition) return;

            let content = config.customMessage;
            if (!content && config.style && definition.responses[config.style]) {
                content = definition.responses[config.style];
            }
            if (!content) {
                content = Object.values(definition.responses)[0];
            }

            this.responses.set(templateName, {
                id: templateName,
                title: definition.title,
                content: content,
                triggers: definition.defaultTriggers,
                type: 'essential',
                active: true
            });
        });
    }

    /**
     * Génération d'un titre à partir des mots-clés
     */
    generateTitleFromKeywords(keywords) {
        if (!keywords || keywords.length === 0) {
            return 'Réponse personnalisée';
        }
        
        const firstKeyword = keywords[0];
        return `Réponse: ${firstKeyword.charAt(0).toUpperCase() + firstKeyword.slice(1)}`;
    }

    /**
     * Affichage des réponses dans l'interface
     */
    renderResponses() {
        const messagesList = document.querySelector('.messages-list');
        if (!messagesList) return;

        // Préserver le message de bienvenue spécial s'il existe
        const welcomeMessage = messagesList.querySelector('.special-message');
        messagesList.innerHTML = '';

        if (welcomeMessage) {
            messagesList.appendChild(welcomeMessage);
        }

        // Afficher les réponses par catégorie
        this.renderResponsesByType(messagesList, 'essential', 'Messages Essentiels');
        this.renderResponsesByType(messagesList, 'custom', 'Réponses Métier');
        this.renderResponsesByType(messagesList, 'error', 'Messages d\'Erreur');

        // Afficher un message si aucune réponse
        if (this.responses.size === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state modern';
            emptyState.innerHTML = `
                <div class="empty-icon">
                    <i class="fas fa-magic"></i>
                </div>
                <h3>Nouvelle Interface Disponible</h3>
                <p>Utilisez la nouvelle interface de configuration pour créer vos réponses automatiques.</p>
                <a href="/responses/config" class="btn-primary">
                    <i class="fas fa-arrow-right"></i>
                    Accéder à la nouvelle interface
                </a>
            `;
            messagesList.appendChild(emptyState);
        }
    }

    /**
     * Affichage des réponses par type
     */
    renderResponsesByType(container, type, title) {
        const responsesOfType = Array.from(this.responses.values())
            .filter(response => response.type === type && response.active);

        if (responsesOfType.length === 0) return;

        // Créer un séparateur de section
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'responses-section-header';
        sectionHeader.innerHTML = `
            <h3>${title}</h3>
            <span class="responses-count">${responsesOfType.length} réponse(s)</span>
        `;
        container.appendChild(sectionHeader);

        // Créer les éléments de réponse
        responsesOfType.forEach(response => {
            const responseElement = this.createResponseElement(response);
            container.appendChild(responseElement);
        });
    }

    /**
     * Création d'un élément de réponse
     */
    createResponseElement(response) {
        const messageItem = document.createElement('div');
        messageItem.className = 'message-item readonly';
        messageItem.dataset.id = response.id;
        messageItem.dataset.type = response.type;

        const triggers = Array.isArray(response.triggers) ? 
            response.triggers.join(', ') : 
            (response.triggers || '');

        messageItem.innerHTML = `
            <div class="message-header">
                <div class="message-title-display">
                    <h4>${this.escapeHtml(response.title)}</h4>
                    <div class="message-type-badge ${response.type}">${this.getTypeBadgeText(response.type)}</div>
                </div>
                <div class="message-actions">
<button type="button" class="btn-icon edit-response" title="Modifier dans la nouvelle interface">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn-icon info-response" title="Informations">
                        <i class="fas fa-info-circle"></i>
                    </button>
                </div>
            </div>
            <div class="message-content">
                <div class="message-display">
                    <div class="content-preview">
                        ${this.escapeHtml(response.content)}
                    </div>
                    <div class="triggers-display">
                        <strong>Déclencheurs:</strong> 
                        <span class="triggers-list">${this.escapeHtml(triggers)}</span>
                    </div>
                </div>
            </div>
        `;

        // Ajouter les écouteurs d'événements
        this.attachResponseListeners(messageItem, response);

        return messageItem;
    }

    /**
     * Attachement des écouteurs d'événements pour une réponse
     */
    attachResponseListeners(element, response) {
        const editBtn = element.querySelector('.edit-response');
        const infoBtn = element.querySelector('.info-response');

        if (editBtn) {
            editBtn.addEventListener('click', () => {
                this.redirectToNewInterface(response.type);
            });
        }

        if (infoBtn) {
            infoBtn.addEventListener('click', () => {
                this.showResponseInfo(response);
            });
        }
    }

    /**
     * Redirection vers la nouvelle interface
     */
    redirectToNewInterface(responseType) {
        const sectionMap = {
            'essential': 'essentials',
            'custom': 'specialized',
            'error': 'advanced'
        };

        const section = sectionMap[responseType] || 'essentials';
        window.location.href = `/responses?section=${section}`;
    }

    /**
     * Affichage des informations d'une réponse
     */
    showResponseInfo(response) {
        const modal = this.createInfoModal(response);
        document.body.appendChild(modal);
        
        // Afficher la modal
        setTimeout(() => modal.classList.add('show'), 10);

        // Gestionnaire de fermeture
        const closeModal = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        };

        modal.querySelector('.modal-close').addEventListener('click', closeModal);
        modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    }

    /**
     * Création de la modal d'information
     */
    createInfoModal(response) {
        const modal = document.createElement('div');
        modal.className = 'modal info-modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${this.escapeHtml(response.title)}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="info-section">
                        <h4>Type de réponse</h4>
                        <p class="type-badge ${response.type}">${this.getTypeBadgeText(response.type)}</p>
                    </div>
                    <div class="info-section">
                        <h4>Contenu</h4>
                        <div class="content-display">${this.escapeHtml(response.content)}</div>
                    </div>
                    <div class="info-section">
                        <h4>Déclencheurs</h4>
                        <div class="triggers-display">
                            ${response.triggers.map(trigger => 
                                `<span class="trigger-tag">${this.escapeHtml(trigger)}</span>`
                            ).join('')}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-primary edit-in-new-interface">
                        <i class="fas fa-edit"></i>
                        Modifier dans la nouvelle interface
                    </button>
                </div>
            </div>
        `;

        // Ajouter l'écouteur pour le bouton de modification
        modal.querySelector('.edit-in-new-interface').addEventListener('click', () => {
            this.redirectToNewInterface(response.type);
        });

        return modal;
    }

    /**
     * Obtention du texte du badge de type
     */
    getTypeBadgeText(type) {
        const typeTexts = {
            'system': 'Système',
            'essential': 'Essentiel',
            'custom': 'Métier',
            'error': 'Erreur'
        };
        return typeTexts[type] || 'Inconnu';
    }

    /**
     * Affichage d'un avis de migration
     */
    showMigrationNotice() {
        const notice = document.createElement('div');
        notice.className = 'migration-notice';
        notice.innerHTML = `
            <div class="notice-content">
                <div class="notice-icon">
                    <i class="fas fa-star"></i>
                </div>
                <div class="notice-text">
                    <h4>Nouvelle Interface Disponible</h4>
                    <p>Découvrez notre nouvelle interface de configuration, plus intuitive et plus puissante !</p>
                </div>
                <div class="notice-actions">
                    <button class="btn-primary go-to-new">
                        <i class="fas fa-arrow-right"></i>
                        Essayer maintenant
                    </button>
                    <button class="btn-secondary dismiss-notice">
                        Plus tard
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(notice);

        // Animation d'entrée
        setTimeout(() => notice.classList.add('show'), 10);

        // Gestionnaires d'événements
        notice.querySelector('.go-to-new').addEventListener('click', () => {
            window.location.href = '/responses';
        });

        notice.querySelector('.dismiss-notice').addEventListener('click', () => {
            notice.classList.remove('show');
            setTimeout(() => notice.remove(), 300);
        });

        // Suppression automatique après 10 secondes
        setTimeout(() => {
            if (notice.parentNode) {
                notice.classList.remove('show');
                setTimeout(() => notice.remove(), 300);
            }
        }, 10000);
    }

    /**
     * Synchronisation périodique avec le serveur
     */
    startPeriodicSync() {
        // Synchroniser toutes les 5 minutes
        setInterval(() => {
            this.loadResponses();
        }, 5 * 60 * 1000);
    }

    /**
     * Actualisation du cache des réponses
     */
    async refreshCache() {
        try {
            const response = await fetch('/api/fast-responses/refresh-cache', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
                }
            });

            if (response.ok) {
                await this.loadResponses();
                this.showSuccess('Cache actualisé avec succès');
            } else {
                throw new Error('Erreur lors de l\'actualisation du cache');
            }
        } catch (error) {
            console.error('Erreur refresh cache:', error);
            this.showError('Erreur lors de l\'actualisation du cache');
        }
    }

    /**
     * Affichage d'un message de succès
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    /**
     * Affichage d'un message d'erreur
     */
    showError(message) {
        this.showNotification(message, 'error');
    }

    /**
     * Affichage d'une notification
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-icon">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            </div>
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        `;

        document.body.appendChild(notification);

        // Animation d'entrée
        setTimeout(() => notification.classList.add('show'), 10);

        // Suppression automatique
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);

        // Suppression manuelle
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        });
    }

    /**
     * Obtention de l'icône de notification selon le type
     */
    getNotificationIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    /**
     * Échappement HTML pour la sécurité
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Test des variables dans un message (fonctionnalité legacy)
     */
    testVariables(messageElement) {
        this.showMigrationNotice();
    }

    /**
     * Méthodes de compatibilité avec l'ancien système
     */
    addNewMessage() {
        this.showMigrationNotice();
    }

    saveMessages() {
        this.showMigrationNotice();
    }

    deleteMessage(messageElement) {
        this.showMigrationNotice();
    }
}

/**
 * Styles CSS pour la version améliorée
 */
const legacyStyles = `
/* Styles pour l'interface de transition */
.message-item.readonly {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin-bottom: 12px;
    transition: all 0.2s ease;
}

.message-item.readonly:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
}

.message-title-display {
    display: flex;
    align-items: center;
    gap: 12px;
}

.message-title-display h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
}

.message-type-badge {
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.message-type-badge.essential {
    background-color: #dbeafe;
    color: #2563eb;
}

.message-type-badge.custom {
    background-color: #d1fae5;
    color: #059669;
}

.message-type-badge.error {
    background-color: #fee2e2;
    color: #dc2626;
}

.message-type-badge.system {
    background-color: #f3f4f6;
    color: #6b7280;
}

.content-preview {
    background-color: white;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    margin-bottom: 8px;
    line-height: 1.5;
    color: #374151;
}

.triggers-display {
    font-size: 14px;
    color: #6b7280;
}

.triggers-list {
    font-family: monospace;
    background-color: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
}

/* Séparateurs de section */
.responses-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0 8px 0;
    border-bottom: 2px solid #e2e8f0;
    margin-bottom: 16px;
}

.responses-section-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1e293b;
}

.responses-count {
    background-color: #e2e8f0;
    color: #64748b;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
}

/* État vide modernisé */
.empty-state.modern {
    text-align: center;
    padding: 60px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    color: white;
    margin: 20px 0;
}

.empty-icon {
    font-size: 48px;
    margin-bottom: 20px;
    opacity: 0.9;
}

.empty-state.modern h3 {
    margin: 0 0 12px 0;
    font-size: 24px;
    font-weight: 600;
}

.empty-state.modern p {
    margin: 0 0 24px 0;
    opacity: 0.9;
    font-size: 16px;
}

.empty-state.modern .btn-primary {
    background-color: rgba(255, 255, 255, 0.2);
    border: 2px solid rgba(255, 255, 255, 0.3);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    transition: all 0.2s ease;
}

.empty-state.modern .btn-primary:hover {
    background-color: rgba(255, 255, 255, 0.3);
    border-color: rgba(255, 255, 255, 0.5);
    transform: translateY(-2px);
}

/* Modal d'information */
.info-modal .modal-content {
    max-width: 600px;
    width: 90%;
}

.info-section {
    margin-bottom: 20px;
}

.info-section h4 {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
}

.content-display {
    background-color: #f8fafc;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    line-height: 1.5;
}

.triggers-display {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.trigger-tag {
    background-color: #e2e8f0;
    color: #64748b;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: monospace;
}

/* Avis de migration */
.migration-notice {
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 400px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    z-index: 2000;
    border: 1px solid #e2e8f0;
}

.migration-notice.show {
    transform: translateX(0);
}

.notice-content {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.notice-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 18px;
    align-self: flex-start;
}

.notice-text h4 {
    margin: 0 0 4px 0;
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
}

.notice-text p {
    margin: 0;
    font-size: 14px;
    color: #64748b;
    line-height: 1.4;
}

.notice-actions {
    display: flex;
    gap: 8px;
}

.notice-actions .btn-primary,
.notice-actions .btn-secondary {
    flex: 1;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
}

.notice-actions .btn-primary {
    background-color: #2563eb;
    color: white;
}

.notice-actions .btn-primary:hover {
    background-color: #1d4ed8;
}

.notice-actions .btn-secondary {
    background-color: #f1f5f9;
    color: #64748b;
}

.notice-actions .btn-secondary:hover {
    background-color: #e2e8f0;
}

/* Notifications */
.notification {
    position: fixed;
    top: 20px;
    left: 20px;
    background: white;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 12px;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    z-index: 2000;
    max-width: 400px;
    border-left: 4px solid #2563eb;
}

.notification.show {
    transform: translateX(0);
}

.notification-success {
    border-left-color: #059669;
}

.notification-error {
    border-left-color: #dc2626;
}

.notification-warning {
    border-left-color: #d97706;
}

.notification-icon {
    color: #2563eb;
    font-size: 18px;
}

.notification-success .notification-icon {
    color: #059669;
}

.notification-error .notification-icon {
    color: #dc2626;
}

.notification-warning .notification-icon {
    color: #d97706;
}

.notification-message {
    flex: 1;
    font-size: 14px;
    color: #374151;
}

.notification-close {
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
    line-height: 1;
}

.notification-close:hover {
    color: #6b7280;
}
`;

// Injection des styles si pas déjà présent
if (!document.getElementById('legacy-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'legacy-styles';
    styleSheet.textContent = legacyStyles;
    document.head.appendChild(styleSheet);
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.messages-list')) {
        window.fastResponsesManager = new FastResponsesManager();
    }
});

// Export pour compatibilité
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FastResponsesManager;
}