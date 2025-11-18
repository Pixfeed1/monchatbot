class IntegrationsManager {
    constructor() {
        this.csrfToken = this.getCsrfToken();
        this.currentChannel = null;
        this.integrations = [];
        this.logs = [];
        this.initializeElements();
        this.setupEventListeners();
        this.loadInitialData();
    }

    getCsrfToken() {
        const token = document.querySelector('meta[name="csrf-token"]');
        return token ? token.getAttribute('content') : '';
    }

    initializeElements() {
        // Modals
        this.configModal = document.getElementById('configModal');
        this.modalTitle = document.getElementById('modal-title');
        this.modalBody = document.getElementById('modal-body');
        this.saveConfigBtn = document.getElementById('save-config-btn');

        // Stats
        this.totalChannelsEl = document.getElementById('total-channels');
        this.messagesSentEl = document.getElementById('messages-sent');
        this.messagesReceivedEl = document.getElementById('messages-received');
        this.errorsCountEl = document.getElementById('errors-count');

        // Logs
        this.logsList = document.getElementById('logs-list');
        this.logTypeFilter = document.getElementById('log-type-filter');
        this.logChannelFilter = document.getElementById('log-channel-filter');
        this.refreshLogsBtn = document.getElementById('refresh-logs-btn');

        // Canaux
        this.channelCards = document.querySelectorAll('.channel-card');
        this.channelToggles = document.querySelectorAll('.switch input[type="checkbox"]');
        this.configButtons = document.querySelectorAll('.config-btn');
    }

    setupEventListeners() {
        // Gestion des toggle switches
        this.channelToggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => this.handleChannelToggle(e));
        });

        // Gestion des boutons de configuration
        this.configButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const channel = e.currentTarget.dataset.channel;
                this.showConfigModal(channel);
            });
        });

        // Sauvegarde de configuration
        if (this.saveConfigBtn) {
            this.saveConfigBtn.addEventListener('click', () => this.saveConfiguration());
        }

        // Filtres de logs
        if (this.logTypeFilter) {
            this.logTypeFilter.addEventListener('change', () => this.filterLogs());
        }

        if (this.logChannelFilter) {
            this.logChannelFilter.addEventListener('change', () => this.filterLogs());
        }

        // Actualisation des logs
        if (this.refreshLogsBtn) {
            this.refreshLogsBtn.addEventListener('click', () => this.loadLogs());
        }
    }

    async loadInitialData() {
        try {
            // Charger les intégrations
            await this.loadIntegrations();

            // Charger les stats
            await this.loadStats();

            // Charger les logs
            await this.loadLogs();
        } catch (error) {
            console.error('Erreur lors du chargement des données:', error);
            this.showError('Erreur lors du chargement des données');
        }
    }

    async loadIntegrations() {
        try {
            const response = await fetch('/integrations/list', {
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (!response.ok) {
                throw new Error('Erreur chargement intégrations');
            }

            const data = await response.json();
            if (data.success) {
                this.integrations = data.integrations;
                this.renderIntegrations();
                this.updateChannelFilter();
            }
        } catch (error) {
            console.error('Erreur loadIntegrations:', error);
        }
    }

    renderIntegrations() {
        this.integrations.forEach(integration => {
            const card = document.querySelector(`.channel-card[data-channel="${integration.channel_type}"]`);
            if (!card) return;

            // Mettre à jour le toggle
            const toggle = card.querySelector('input[type="checkbox"]');
            if (toggle) {
                toggle.checked = integration.is_active;
                toggle.dataset.integrationId = integration.id;
            }

            // Mettre à jour le statut
            const statusEl = card.querySelector('.channel-status');
            if (statusEl) {
                statusEl.textContent = this.getStatusText(integration.status);
                statusEl.className = `channel-status ${integration.status}`;
            }

            // Mettre à jour la carte
            if (integration.is_active && integration.status === 'connected') {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
    }

    getStatusText(status) {
        const statusMap = {
            'connected': 'Connecté',
            'disconnected': 'Non connecté',
            'error': 'Erreur',
            'pending': 'En attente'
        };
        return statusMap[status] || 'Non connecté';
    }

    async handleChannelToggle(event) {
        const toggle = event.target;
        const channelType = toggle.dataset.channelType;
        const integrationId = toggle.dataset.integrationId;
        const isActive = toggle.checked;

        try {
            // Désactiver le toggle pendant la requête
            toggle.disabled = true;

            let response;

            if (integrationId) {
                // Mise à jour d'une intégration existante
                response = await fetch(`/integrations/${integrationId}/toggle`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': this.csrfToken
                    },
                    body: JSON.stringify({ is_active: isActive })
                });
            } else {
                // Création d'une nouvelle intégration
                if (!isActive) {
                    toggle.disabled = false;
                    return; // Ne rien faire si on désactive un canal non créé
                }

                response = await fetch('/integrations/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': this.csrfToken
                    },
                    body: JSON.stringify({
                        channel_type: channelType,
                        name: this.getChannelName(channelType),
                        is_active: true
                    })
                });
            }

            const result = await response.json();

            if (result.success) {
                this.showSuccess(result.message || 'Modification enregistrée');
                await this.loadIntegrations(); // Recharger
                await this.loadStats();
            } else {
                this.showError(result.error || 'Erreur lors de la modification');
                toggle.checked = !isActive; // Revenir à l'état précédent
            }

            toggle.disabled = false;
        } catch (error) {
            console.error('Erreur handleChannelToggle:', error);
            toggle.checked = !isActive; // Revenir à l'état précédent
            toggle.disabled = false;
            this.showError('Erreur lors de la modification');
        }
    }

    getChannelName(channelType) {
        const names = {
            'whatsapp': 'WhatsApp Business',
            'messenger': 'Facebook Messenger',
            'instagram': 'Instagram Direct',
            'telegram': 'Telegram',
            'sms': 'SMS (Twilio)',
            'email': 'Email',
            'slack': 'Slack',
            'teams': 'Microsoft Teams',
            'web': 'Widget Web'
        };
        return names[channelType] || channelType;
    }

    showConfigModal(channel) {
        this.currentChannel = channel;
        const integration = this.integrations.find(i => i.channel_type === channel);

        this.modalTitle.textContent = `Configuration - ${this.getChannelName(channel)}`;
        this.modalBody.innerHTML = this.getConfigFormHTML(channel, integration);
        this.configModal.classList.add('show');

        // Ajouter les event listeners pour le formulaire
        this.setupConfigFormListeners(channel);
    }

    getConfigFormHTML(channel, integration) {
        const config = integration ? integration.config : {};

        switch (channel) {
            case 'whatsapp':
                return this.getWhatsAppConfigForm(config);
            case 'messenger':
                return this.getMessengerConfigForm(config);
            case 'instagram':
                return this.getInstagramConfigForm(config);
            case 'telegram':
                return this.getTelegramConfigForm(config);
            case 'sms':
                return this.getSMSConfigForm(config);
            case 'email':
                return this.getEmailConfigForm(config);
            case 'slack':
                return this.getSlackConfigForm(config);
            case 'teams':
                return this.getTeamsConfigForm(config);
            case 'web':
                return this.getWebConfigForm(config);
            case 'zendesk':
                return this.getZendeskConfigForm(config);
            case 'freshdesk':
                return this.getFreshdeskConfigForm(config);
            default:
                return '<p>Configuration non disponible</p>';
        }
    }

    getWhatsAppConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Identifiants API</h4>
                    <div class="form-group">
                        <label class="form-label">Phone Number ID</label>
                        <input type="text" class="form-control" name="phone_number_id" value="${config.phone_number_id || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Business Account ID</label>
                        <input type="text" class="form-control" name="business_account_id" value="${config.business_account_id || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Access Token</label>
                        <input type="password" class="form-control" name="access_token" value="${config.access_token || ''}" required>
                        <small class="help-text">Token permanent d'accès à l'API WhatsApp Business</small>
                    </div>
                </div>
                <div class="form-section">
                    <h4>Configuration Webhook</h4>
                    <div class="form-group">
                        <label class="form-label">Webhook URL</label>
                        <div class="code-snippet">${window.location.origin}/webhooks/whatsapp</div>
                        <small class="help-text">Copiez cette URL dans la configuration Meta</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Verify Token</label>
                        <input type="text" class="form-control" name="verify_token" value="${config.verify_token || ''}" required>
                    </div>
                </div>
            </form>
        `;
    }

    getMessengerConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Identifiants API</h4>
                    <div class="form-group">
                        <label class="form-label">Page ID</label>
                        <input type="text" class="form-control" name="page_id" value="${config.page_id || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Page Access Token</label>
                        <input type="password" class="form-control" name="page_access_token" value="${config.page_access_token || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">App Secret</label>
                        <input type="password" class="form-control" name="app_secret" value="${config.app_secret || ''}" required>
                    </div>
                </div>
                <div class="form-section">
                    <h4>Configuration Webhook</h4>
                    <div class="form-group">
                        <label class="form-label">Webhook URL</label>
                        <div class="code-snippet">${window.location.origin}/webhooks/messenger</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Verify Token</label>
                        <input type="text" class="form-control" name="verify_token" value="${config.verify_token || ''}" required>
                    </div>
                </div>
            </form>
        `;
    }

    getInstagramConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Identifiants API</h4>
                    <div class="form-group">
                        <label class="form-label">Instagram Account ID</label>
                        <input type="text" class="form-control" name="instagram_account_id" value="${config.instagram_account_id || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Page Access Token</label>
                        <input type="password" class="form-control" name="page_access_token" value="${config.page_access_token || ''}" required>
                    </div>
                </div>
            </form>
        `;
    }

    getTelegramConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Identifiants API</h4>
                    <div class="form-group">
                        <label class="form-label">Bot Token</label>
                        <input type="password" class="form-control" name="bot_token" value="${config.bot_token || ''}" required>
                        <small class="help-text">Token fourni par @BotFather</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Webhook URL</label>
                        <div class="code-snippet">${window.location.origin}/webhooks/telegram</div>
                    </div>
                </div>
            </form>
        `;
    }

    getSMSConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Configuration Twilio</h4>
                    <div class="form-group">
                        <label class="form-label">Account SID</label>
                        <input type="text" class="form-control" name="account_sid" value="${config.account_sid || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Auth Token</label>
                        <input type="password" class="form-control" name="auth_token" value="${config.auth_token || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Numéro Twilio</label>
                        <input type="tel" class="form-control" name="phone_number" value="${config.phone_number || ''}" placeholder="+33123456789" required>
                    </div>
                </div>
            </form>
        `;
    }

    getEmailConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Configuration SMTP</h4>
                    <div class="form-group">
                        <label class="form-label">Serveur SMTP</label>
                        <input type="text" class="form-control" name="smtp_host" value="${config.smtp_host || ''}" placeholder="smtp.gmail.com" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Port</label>
                        <input type="number" class="form-control" name="smtp_port" value="${config.smtp_port || '587'}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Adresse email</label>
                        <input type="email" class="form-control" name="email" value="${config.email || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Mot de passe</label>
                        <input type="password" class="form-control" name="password" value="${config.password || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">
                            <input type="checkbox" name="use_tls" ${config.use_tls ? 'checked' : ''}>
                            Utiliser TLS
                        </label>
                    </div>
                </div>
            </form>
        `;
    }

    getSlackConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Identifiants API</h4>
                    <div class="form-group">
                        <label class="form-label">Bot Token</label>
                        <input type="password" class="form-control" name="bot_token" value="${config.bot_token || ''}" placeholder="xoxb-..." required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Signing Secret</label>
                        <input type="password" class="form-control" name="signing_secret" value="${config.signing_secret || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Webhook URL</label>
                        <div class="code-snippet">${window.location.origin}/webhooks/slack</div>
                    </div>
                </div>
            </form>
        `;
    }

    getTeamsConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Configuration Microsoft</h4>
                    <div class="form-group">
                        <label class="form-label">App ID</label>
                        <input type="text" class="form-control" name="app_id" value="${config.app_id || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">App Password</label>
                        <input type="password" class="form-control" name="app_password" value="${config.app_password || ''}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Webhook URL</label>
                        <div class="code-snippet">${window.location.origin}/webhooks/teams</div>
                    </div>
                </div>
            </form>
        `;
    }

    getWebConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Configuration Widget</h4>
                    <div class="form-group">
                        <label class="form-label">Titre du widget</label>
                        <input type="text" class="form-control" name="title" value="${config.title || 'Chat avec nous'}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Message d'accueil</label>
                        <textarea class="form-control" name="welcome_message" rows="3" required>${config.welcome_message || 'Bonjour ! Comment puis-je vous aider ?'}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Couleur principale</label>
                        <input type="color" class="form-control" name="primary_color" value="${config.primary_color || '#0d6efd'}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Position</label>
                        <select class="form-control" name="position">
                            <option value="bottom-right" ${config.position === 'bottom-right' ? 'selected' : ''}>Bas droite</option>
                            <option value="bottom-left" ${config.position === 'bottom-left' ? 'selected' : ''}>Bas gauche</option>
                        </select>
                    </div>
                </div>
                <div class="form-section">
                    <h4>Code d'intégration</h4>
                    <div class="code-snippet" style="word-break: break-all; white-space: pre-wrap;">
&lt;script src="${window.location.origin}/static/js/widget.js"&gt;&lt;/script&gt;
&lt;script&gt;
  ChatWidget.init({
    apiUrl: "${window.location.origin}/api/chat"
  });
&lt;/script&gt;
                    </div>
                    <small class="help-text">Copiez ce code avant la balise &lt;/body&gt; de votre site</small>
                </div>
            </form>
        `;
    }

    getZendeskConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Configuration Zendesk</h4>
                    <div class="form-group">
                        <label class="form-label">Subdomain Zendesk</label>
                        <input type="text" class="form-control" name="subdomain" value="${config.subdomain || ''}" placeholder="example" required>
                        <small class="help-text">Votre sous-domaine Zendesk (ex: example.zendesk.com → "example")</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email de l'agent</label>
                        <input type="email" class="form-control" name="agent_email" value="${config.agent_email || ''}" placeholder="agent@example.com" required>
                        <small class="help-text">Adresse email de votre agent Zendesk</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">API Token</label>
                        <input type="password" class="form-control" name="api_token" value="${config.api_token || ''}" required>
                        <small class="help-text">Générez un token API dans Admin > Canaux > API</small>
                    </div>
                </div>
                <div class="form-section">
                    <h4>Options de tickets</h4>
                    <div class="form-group">
                        <label class="form-label">Priorité par défaut</label>
                        <select class="form-control" name="default_priority">
                            <option value="low" ${config.default_priority === 'low' ? 'selected' : ''}>Basse</option>
                            <option value="normal" ${config.default_priority === 'normal' ? 'selected' : ''}>Normale</option>
                            <option value="high" ${config.default_priority === 'high' ? 'selected' : ''}>Haute</option>
                            <option value="urgent" ${config.default_priority === 'urgent' ? 'selected' : ''}>Urgente</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Type de ticket par défaut</label>
                        <select class="form-control" name="default_type">
                            <option value="question" ${config.default_type === 'question' ? 'selected' : ''}>Question</option>
                            <option value="incident" ${config.default_type === 'incident' ? 'selected' : ''}>Incident</option>
                            <option value="problem" ${config.default_type === 'problem' ? 'selected' : ''}>Problème</option>
                            <option value="task" ${config.default_type === 'task' ? 'selected' : ''}>Tâche</option>
                        </select>
                    </div>
                </div>
            </form>
        `;
    }

    getFreshdeskConfigForm(config) {
        return `
            <form class="config-form" id="channel-config-form">
                <div class="form-section">
                    <h4>Configuration Freshdesk</h4>
                    <div class="form-group">
                        <label class="form-label">Domain Freshdesk</label>
                        <input type="text" class="form-control" name="domain" value="${config.domain || ''}" placeholder="example.freshdesk.com" required>
                        <small class="help-text">Votre domaine Freshdesk complet</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label">API Key</label>
                        <input type="password" class="form-control" name="api_key" value="${config.api_key || ''}" required>
                        <small class="help-text">Trouvez votre API Key dans Profile Settings > API Key</small>
                    </div>
                </div>
                <div class="form-section">
                    <h4>Options de tickets</h4>
                    <div class="form-group">
                        <label class="form-label">Priorité par défaut</label>
                        <select class="form-control" name="default_priority">
                            <option value="1" ${config.default_priority === '1' ? 'selected' : ''}>Basse</option>
                            <option value="2" ${config.default_priority === '2' ? 'selected' : ''}>Moyenne</option>
                            <option value="3" ${config.default_priority === '3' ? 'selected' : ''}>Haute</option>
                            <option value="4" ${config.default_priority === '4' ? 'selected' : ''}>Urgente</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Source par défaut</label>
                        <select class="form-control" name="default_source">
                            <option value="1" ${config.default_source === '1' ? 'selected' : ''}>Email</option>
                            <option value="2" ${config.default_source === '2' ? 'selected' : ''}>Portail</option>
                            <option value="3" ${config.default_source === '3' ? 'selected' : ''}>Téléphone</option>
                            <option value="7" ${config.default_source === '7' ? 'selected' : ''}>Chat</option>
                            <option value="9" ${config.default_source === '9' ? 'selected' : ''}>Chatbot</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Statut par défaut</label>
                        <select class="form-control" name="default_status">
                            <option value="2" ${config.default_status === '2' ? 'selected' : ''}>Ouvert</option>
                            <option value="3" ${config.default_status === '3' ? 'selected' : ''}>En attente</option>
                            <option value="4" ${config.default_status === '4' ? 'selected' : ''}>Résolu</option>
                        </select>
                    </div>
                </div>
            </form>
        `;
    }

    setupConfigFormListeners(channel) {
        // Aucun listener spécifique nécessaire pour l'instant
    }

    async saveConfiguration() {
        const form = document.getElementById('channel-config-form');
        if (!form) return;

        try {
            this.saveConfigBtn.disabled = true;
            this.saveConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';

            const formData = new FormData(form);
            const config = {};

            for (let [key, value] of formData.entries()) {
                if (key === 'use_tls') {
                    config[key] = true;
                } else {
                    config[key] = value;
                }
            }

            // Trouver l'intégration
            const integration = this.integrations.find(i => i.channel_type === this.currentChannel);

            let response;
            if (integration) {
                // Mise à jour
                response = await fetch(`/integrations/${integration.id}/config`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': this.csrfToken
                    },
                    body: JSON.stringify({ config })
                });
            } else {
                // Création
                response = await fetch('/integrations/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': this.csrfToken
                    },
                    body: JSON.stringify({
                        channel_type: this.currentChannel,
                        name: this.getChannelName(this.currentChannel),
                        config: config,
                        is_active: true
                    })
                });
            }

            const result = await response.json();

            if (result.success) {
                this.showSuccess(result.message || 'Configuration enregistrée');
                this.hideConfigModal();
                await this.loadIntegrations();
            } else {
                this.showError(result.error || 'Erreur lors de l\'enregistrement');
            }
        } catch (error) {
            console.error('Erreur saveConfiguration:', error);
            this.showError('Erreur lors de l\'enregistrement');
        } finally {
            this.saveConfigBtn.disabled = false;
            this.saveConfigBtn.innerHTML = 'Enregistrer';
        }
    }

    hideConfigModal() {
        this.configModal.classList.remove('show');
        this.currentChannel = null;
    }

    async loadStats() {
        try {
            const response = await fetch('/integrations/stats', {
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (!response.ok) return;

            const data = await response.json();
            if (data.success) {
                this.updateStats(data.stats);
            }
        } catch (error) {
            console.error('Erreur loadStats:', error);
        }
    }

    updateStats(stats) {
        if (this.totalChannelsEl) {
            this.totalChannelsEl.textContent = stats.total_channels || 0;
        }
        if (this.messagesSentEl) {
            this.messagesSentEl.textContent = stats.messages_sent || 0;
        }
        if (this.messagesReceivedEl) {
            this.messagesReceivedEl.textContent = stats.messages_received || 0;
        }
        if (this.errorsCountEl) {
            this.errorsCountEl.textContent = stats.errors_count || 0;
        }
    }

    async loadLogs() {
        try {
            const response = await fetch('/integrations/logs', {
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (!response.ok) return;

            const data = await response.json();
            if (data.success) {
                this.logs = data.logs;
                this.renderLogs();
            }
        } catch (error) {
            console.error('Erreur loadLogs:', error);
        }
    }

    renderLogs() {
        const filteredLogs = this.getFilteredLogs();

        if (filteredLogs.length === 0) {
            this.logsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <p>Aucun journal disponible</p>
                </div>
            `;
            return;
        }

        const logsHTML = filteredLogs.map(log => `
            <div class="log-item ${log.log_type}">
                <div class="log-icon ${log.log_type}">
                    ${this.getLogIcon(log.log_type)}
                </div>
                <div class="log-content">
                    <div class="log-header">
                        <span class="log-channel">${log.channel_name}</span>
                        <span class="log-time">${this.formatTime(log.created_at)}</span>
                    </div>
                    <p class="log-message">${log.message}</p>
                </div>
            </div>
        `).join('');

        this.logsList.innerHTML = logsHTML;
    }

    getFilteredLogs() {
        let filtered = this.logs;

        // Filtre par type
        const typeFilter = this.logTypeFilter?.value;
        if (typeFilter && typeFilter !== 'all') {
            filtered = filtered.filter(log => log.log_type === typeFilter);
        }

        // Filtre par canal
        const channelFilter = this.logChannelFilter?.value;
        if (channelFilter && channelFilter !== 'all') {
            filtered = filtered.filter(log => log.channel_type === channelFilter);
        }

        return filtered;
    }

    filterLogs() {
        this.renderLogs();
    }

    updateChannelFilter() {
        if (!this.logChannelFilter) return;

        const options = ['<option value="all">Tous les canaux</option>'];
        this.integrations.forEach(integration => {
            options.push(`<option value="${integration.channel_type}">${integration.name}</option>`);
        });

        this.logChannelFilter.innerHTML = options.join('');
    }

    getLogIcon(logType) {
        const icons = {
            'info': '<i class="fas fa-info-circle"></i>',
            'warning': '<i class="fas fa-exclamation-triangle"></i>',
            'error': '<i class="fas fa-times-circle"></i>',
            'message_sent': '<i class="fas fa-paper-plane"></i>',
            'message_received': '<i class="fas fa-inbox"></i>',
            'sync': '<i class="fas fa-sync-alt"></i>'
        };
        return icons[logType] || icons.info;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        // Moins d'une minute
        if (diff < 60000) {
            return 'À l\'instant';
        }

        // Moins d'une heure
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `Il y a ${minutes} min`;
        }

        // Moins d'un jour
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `Il y a ${hours}h`;
        }

        // Format date
        return date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Méthodes de notification
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showInfo(message) {
        this.showNotification(message, 'info');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            min-width: 300px;
            padding: 15px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            animation: slideInRight 0.3s ease-out;
        `;

        const icons = {
            'success': '<i class="fas fa-check-circle"></i>',
            'error': '<i class="fas fa-exclamation-circle"></i>',
            'info': '<i class="fas fa-info-circle"></i>'
        };

        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                ${icons[type] || icons.info}
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 5000);
    }
}

// Animations CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.integrationsManager = new IntegrationsManager();
});
