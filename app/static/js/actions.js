class ActionsManager {
    constructor() {
        this.csrfToken = this.getCsrfToken();
        this.currentSection = 'email';
        this.redirections = [];
        this.initializeElements();
        this.setupEventListeners();
        this.loadInitialData();
    }

    getCsrfToken() {
        const token = document.querySelector('meta[name="csrf-token"]');
        return token ? token.getAttribute('content') : '';
    }

    initializeElements() {
        // Sélecteurs de type d'action
        this.typeButtons = document.querySelectorAll('.type-btn');
        this.configSections = document.querySelectorAll('.config-section');

        // Boutons globaux
        this.saveBtn = document.getElementById('saveBtn');
        this.testBtn = document.getElementById('testBtn');

        // Modals
        this.triggerModal = document.getElementById('triggerModal');

        // Boutons d'ajout
        this.addTriggerBtn = document.querySelector('.add-trigger-btn');
        this.addRedirectionBtn = document.querySelector('.add-redirection-btn');
    }

    setupEventListeners() {
        // Gestion des types d'action
        this.typeButtons.forEach(button => {
            button.addEventListener('click', () => this.switchSection(button.dataset.type));
        });

        // Gestion des sauvegardes
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.saveConfiguration());
        }

        // Gestion des tests
        if (this.testBtn) {
            this.testBtn.addEventListener('click', () => this.testConfiguration());
        }

        // Gestion des ajouts
        if (this.addTriggerBtn) {
            this.addTriggerBtn.addEventListener('click', () => this.showTriggerModal());
        }

        if (this.addRedirectionBtn) {
            this.addRedirectionBtn.addEventListener('click', () => this.showRedirectionModal());
        }

        // Gestion des switchers
        document.querySelectorAll('.switch input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => this.handleTriggerStateChange(e));
        });
    }

    async loadInitialData() {
        try {
            // Charger les déclencheurs
            const triggersResponse = await fetch('/actions/triggers', {
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (!triggersResponse.ok) {
                throw new Error('Erreur chargement triggers');
            }

            const triggersData = await triggersResponse.json();
            if (triggersData.success) {
                this.renderTriggers(triggersData.triggers);
            }

            // Charger les templates d'email
            const templatesResponse = await fetch('/actions/email/templates', {
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (templatesResponse.ok) {
                const templatesData = await templatesResponse.json();
                if (templatesData.success) {
                    this.updateTemplateOptions(templatesData.templates);
                }
            }

            // Charger les configurations
            await this.loadConfigurations();

            // Charger les redirections
            await this.loadRedirections();
        } catch (error) {
            console.error('Erreur lors du chargement des données:', error);
            this.showError('Erreur lors du chargement des données');
        }
    }

    async loadConfigurations() {
        try {
            // Charger la configuration du calendrier
            const calendarResponse = await fetch('/actions/calendar/config', {
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (calendarResponse.ok) {
                const calendarData = await calendarResponse.json();
                if (calendarData.success) {
                    this.updateCalendarConfig(calendarData.config);
                }
            }

            // Charger la configuration des tickets
            const ticketResponse = await fetch('/actions/tickets/config', {
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (ticketResponse.ok) {
                const ticketData = await ticketResponse.json();
                if (ticketData.success) {
                    this.updateTicketConfig(ticketData.config);
                }
            }
        } catch (error) {
            console.error('Erreur loadConfigurations:', error);
        }
    }

    renderTriggers(triggers) {
        // Grouper par type
        const emailTriggers = triggers.filter(t => t.type === 'email');
        const smsTriggers = triggers.filter(t => t.type === 'sms');

        // Rendre les triggers email
        const emailList = document.querySelector('#email-config .trigger-list');
        if (emailList && emailTriggers.length > 0) {
            emailTriggers.forEach(trigger => {
                this.addTriggerToList(emailList, trigger);
            });
        }

        // Rendre les triggers SMS
        const smsList = document.querySelector('#sms-config .trigger-list');
        if (smsList && smsTriggers.length > 0) {
            smsTriggers.forEach(trigger => {
                this.addTriggerToList(smsList, trigger);
            });
        }
    }

    addTriggerToList(container, trigger) {
        const card = document.createElement('div');
        card.className = 'trigger-card';
        card.dataset.triggerId = trigger.id;

        card.innerHTML = `
            <div class="card-header">
                <h4>${trigger.name}</h4>
                <label class="switch">
                    <input type="checkbox" ${trigger.active ? 'checked' : ''} data-trigger-id="${trigger.id}">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="card-content">
                <p><small>Type: ${trigger.type}</small></p>
            </div>
        `;

        // Ajouter avant le bouton d'ajout
        const addBtn = container.querySelector('.add-trigger-btn');
        if (addBtn) {
            container.insertBefore(card, addBtn);
        } else {
            container.appendChild(card);
        }

        // Ajouter listener pour le switch
        const checkbox = card.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => this.handleTriggerStateChange(e));
        }
    }

    updateTemplateOptions(templates) {
        const selects = document.querySelectorAll('select[name="email_template"]');
        selects.forEach(select => {
            // Vider les options existantes sauf la première
            select.innerHTML = '<option value="">Sélectionner un template</option>';

            // Ajouter les templates
            templates.forEach(template => {
                const option = document.createElement('option');
                option.value = template.id;
                option.textContent = template.name;
                select.appendChild(option);
            });
        });
    }

    updateCalendarConfig(config) {
        const serviceSelect = document.querySelector('select[name="calendar_service"]');
        const durationSelect = document.querySelector('select[name="default_duration"]');

        if (serviceSelect && config.service_type) {
            serviceSelect.value = config.service_type;
        }

        if (durationSelect && config.default_duration) {
            durationSelect.value = config.default_duration;
        }
    }

    updateTicketConfig(config) {
        const serviceSelect = document.querySelector('select[name="ticket_service"]');

        if (serviceSelect && config.service_type) {
            serviceSelect.value = config.service_type;
        }
    }

    switchSection(type) {
        this.currentSection = type;

        // Mettre à jour les boutons
        this.typeButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.type === type);
        });

        // Mettre à jour les sections
        this.configSections.forEach(section => {
            section.classList.toggle('active', section.id === `${type}-config`);
        });
    }

    async saveConfiguration() {
        try {
            let configData;
            let url;

            switch (this.currentSection) {
                case 'email':
                    configData = this.getEmailConfig();
                    url = '/actions/email/config';
                    break;
                case 'sms':
                    configData = this.getSMSConfig();
                    url = '/actions/sms/config';
                    break;
                case 'calendar':
                    configData = this.getCalendarConfig();
                    url = '/actions/calendar/config';
                    break;
                case 'tickets':
                    configData = this.getTicketConfig();
                    url = '/actions/tickets/config';
                    break;
                case 'forms':
                    configData = this.getFormsConfig();
                    url = '/actions/forms/config';
                    break;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.csrfToken
                },
                body: JSON.stringify(configData)
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(result.message || 'Configuration sauvegardée avec succès');
            } else {
                this.showError(result.error || 'Erreur lors de la sauvegarde');
            }
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            this.showError('Erreur lors de la sauvegarde');
        }
    }

    async testConfiguration() {
        try {
            const response = await fetch('/actions/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.csrfToken
                },
                body: JSON.stringify({
                    type: this.currentSection,
                    config: this.getCurrentConfig()
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(result.message || 'Test effectué avec succès');
            } else {
                this.showError(result.error || 'Erreur lors du test');
            }
        } catch (error) {
            console.error('Erreur lors du test:', error);
            this.showError('Erreur lors du test');
        }
    }

    getEmailConfig() {
        const triggers = [];
        const triggerCards = document.querySelectorAll('#email-config .trigger-card');

        triggerCards.forEach(card => {
            const triggerId = card.dataset.triggerId;
            const checkbox = card.querySelector('input[type="checkbox"]');

            if (triggerId) {
                triggers.push({
                    id: parseInt(triggerId),
                    active: checkbox ? checkbox.checked : false
                });
            }
        });

        return { triggers };
    }

    getSMSConfig() {
        const triggers = [];
        const triggerCards = document.querySelectorAll('#sms-config .trigger-card');

        triggerCards.forEach(card => {
            const triggerId = card.dataset.triggerId;
            const checkbox = card.querySelector('input[type="checkbox"]');

            if (triggerId) {
                triggers.push({
                    id: parseInt(triggerId),
                    active: checkbox ? checkbox.checked : false
                });
            }
        });

        return { triggers };
    }

    getCalendarConfig() {
        const serviceSelect = document.querySelector('select[name="calendar_service"]');
        const durationSelect = document.querySelector('select[name="default_duration"]');

        return {
            service_type: serviceSelect ? serviceSelect.value : 'google',
            default_duration: durationSelect ? parseInt(durationSelect.value) : 30
        };
    }

    getTicketConfig() {
        const serviceSelect = document.querySelector('select[name="ticket_service"]');

        return {
            service_type: serviceSelect ? serviceSelect.value : 'internal',
            priority_mapping: {}
        };
    }

    getFormsConfig() {
        return {
            redirections: []
        };
    }

    getCurrentConfig() {
        switch (this.currentSection) {
            case 'email':
                return this.getEmailConfig();
            case 'sms':
                return this.getSMSConfig();
            case 'calendar':
                return this.getCalendarConfig();
            case 'tickets':
                return this.getTicketConfig();
            case 'forms':
                return this.getFormsConfig();
            default:
                return {};
        }
    }

    async handleTriggerStateChange(event) {
        const checkbox = event.target;
        const triggerId = checkbox.dataset.triggerId;

        if (!triggerId) return;

        try {
            // Mettre à jour immédiatement l'UI
            checkbox.disabled = true;

            // Sauvegarder la modification
            await this.saveConfiguration();

            checkbox.disabled = false;
        } catch (error) {
            console.error('Erreur handleTriggerStateChange:', error);
            // Revenir à l'état précédent
            checkbox.checked = !checkbox.checked;
            checkbox.disabled = false;
        }
    }

    showTriggerModal() {
        if (!this.triggerModal) return;

        const modalContent = `
            <h3>Nouveau Déclencheur</h3>
            <form id="triggerForm">
                <div class="form-group">
                    <label class="form-label">Nom du déclencheur</label>
                    <input type="text" class="form-control" name="trigger_name" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Conditions</label>
                    <textarea class="form-control" name="conditions" rows="3"></textarea>
                </div>
                <div class="modal-actions" style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="actionsManager.hideTriggerModal()">Annuler</button>
                    <button type="submit" class="btn btn-primary">Ajouter</button>
                </div>
            </form>
        `;

        this.triggerModal.querySelector('.modal-content').innerHTML = modalContent;
        this.triggerModal.style.display = 'block';

        // Ajouter listener pour le formulaire
        const form = document.getElementById('triggerForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleTriggerFormSubmit(e));
        }
    }

    async handleTriggerFormSubmit(event) {
        event.preventDefault();

        const form = event.target;
        const formData = new FormData(form);

        try {
            const response = await fetch('/actions/triggers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.csrfToken
                },
                body: JSON.stringify({
                    name: formData.get('trigger_name'),
                    type: this.currentSection,
                    conditions: formData.get('conditions') || '',
                    active: true
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess('Déclencheur créé avec succès');
                this.hideTriggerModal();
                await this.loadInitialData(); // Recharger
            } else {
                this.showError(result.error || 'Erreur lors de la création');
            }
        } catch (error) {
            console.error('Erreur handleTriggerFormSubmit:', error);
            this.showError('Erreur lors de la création du déclencheur');
        }
    }

    hideTriggerModal() {
        if (this.triggerModal) {
            this.triggerModal.style.display = 'none';
        }
    }

    async loadRedirections() {
        try {
            const response = await fetch('/actions/redirections', {
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            if (!response.ok) return;

            const data = await response.json();
            if (data.success) {
                this.redirections = data.redirections;
                this.renderRedirections();
            }
        } catch (error) {
            console.error('Erreur loadRedirections:', error);
        }
    }

    renderRedirections() {
        const redirectionList = document.querySelector('#forms-config .redirection-list');
        if (!redirectionList) return;

        // Supprimer les anciennes cartes (sauf le bouton d'ajout)
        const existingCards = redirectionList.querySelectorAll('.redirection-card');
        existingCards.forEach(card => card.remove());

        // Ajouter les redirections
        const addBtn = redirectionList.querySelector('.add-redirection-btn');

        this.redirections.forEach(redirection => {
            const card = document.createElement('div');
            card.className = 'redirection-card';
            card.dataset.redirectionId = redirection.id;

            card.innerHTML = `
                <div class="card-header">
                    <h4>${redirection.name}</h4>
                    <button class="btn btn-danger btn-sm delete-redirection-btn" data-redirection-id="${redirection.id}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
                <div class="card-content">
                    <div class="form-group">
                        <label>URL du formulaire</label>
                        <div class="url-display">${redirection.url}</div>
                    </div>
                    ${redirection.conditions ? `
                    <div class="form-group">
                        <label>Conditions</label>
                        <div class="conditions-display">${redirection.conditions}</div>
                    </div>
                    ` : ''}
                </div>
            `;

            if (addBtn) {
                redirectionList.insertBefore(card, addBtn);
            } else {
                redirectionList.appendChild(card);
            }

            // Ajouter listener pour le bouton supprimer
            const deleteBtn = card.querySelector('.delete-redirection-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteRedirection(redirection.id);
                });
            }
        });

        // Réinitialiser les icônes Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    showRedirectionModal() {
        // Créer la modale dynamiquement
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.id = 'redirectionModal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Nouvelle Redirection de Formulaire</h3>
                    <button class="close-modal" id="close-redirection-modal">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="redirection-form">
                        <div class="form-group">
                            <label class="form-label">Nom de la redirection</label>
                            <input type="text" class="form-control" name="name" required placeholder="Ex: Formulaire de contact">
                        </div>
                        <div class="form-group">
                            <label class="form-label">URL du formulaire</label>
                            <input type="url" class="form-control" name="url" required placeholder="https://example.com/form">
                            <small class="help-text">URL complète du formulaire externe</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Conditions de déclenchement (optionnel)</label>
                            <textarea class="form-control" name="conditions" rows="3" placeholder="Ex: Quand l'utilisateur demande à nous contacter"></textarea>
                            <small class="help-text">Conditions pour déclencher cette redirection</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Paramètres à transmettre (optionnel)</label>
                            <textarea class="form-control" name="parameters" rows="2" placeholder="Ex: email={{user_email}}&name={{user_name}}"></textarea>
                            <small class="help-text">Paramètres URL à ajouter automatiquement</small>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancel-redirection-btn">Annuler</button>
                    <button class="btn btn-primary" id="save-redirection-btn">
                        <i data-lucide="save"></i>
                        Créer
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Réinitialiser les icônes Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Event listeners
        const closeBtn = modal.querySelector('#close-redirection-modal');
        const cancelBtn = modal.querySelector('#cancel-redirection-btn');
        const saveBtn = modal.querySelector('#save-redirection-btn');

        const closeModal = () => {
            modal.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        saveBtn.addEventListener('click', () => this.saveRedirection(modal));

        // Fermer en cliquant à l'extérieur
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    async saveRedirection(modal) {
        const form = modal.querySelector('#redirection-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const data = {
            name: formData.get('name'),
            url: formData.get('url'),
            conditions: formData.get('conditions') || '',
            parameters: formData.get('parameters') || ''
        };

        try {
            const saveBtn = modal.querySelector('#save-redirection-btn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i data-lucide="loader"></i> Création...';

            const response = await fetch('/actions/redirections', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.csrfToken
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(result.message || 'Redirection créée avec succès');
                await this.loadRedirections();
                modal.remove();
            } else {
                this.showError(result.error || 'Erreur lors de la création');
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i data-lucide="save"></i> Créer';
            }
        } catch (error) {
            console.error('Erreur saveRedirection:', error);
            this.showError('Erreur lors de la création de la redirection');
        }
    }

    async deleteRedirection(redirectionId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette redirection ?')) {
            return;
        }

        try {
            const response = await fetch(`/actions/redirections/${redirectionId}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': this.csrfToken
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(result.message || 'Redirection supprimée');
                await this.loadRedirections();
            } else {
                this.showError(result.error || 'Erreur lors de la suppression');
            }
        } catch (error) {
            console.error('Erreur deleteRedirection:', error);
            this.showError('Erreur lors de la suppression de la redirection');
        }
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
        // Créer la notification
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

        // Auto-suppression après 5 secondes
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
    window.actionsManager = new ActionsManager();
});
