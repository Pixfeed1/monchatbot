class ActionsManager {
    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.currentSection = 'email';
        this.loadInitialData();
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
        this.saveBtn.addEventListener('click', () => this.saveConfiguration());

        // Gestion des tests
        this.testBtn.addEventListener('click', () => this.testConfiguration());

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
            const triggersResponse = await fetch('/actions/triggers');
            const triggers = await triggersResponse.json();
            this.renderTriggers(triggers);

            // Charger les templates d'email
            const templatesResponse = await fetch('/actions/email/templates');
            const templates = await templatesResponse.json();
            this.updateTemplateOptions(templates);

            // Charger les configurations
            await this.loadConfigurations();
        } catch (error) {
            console.error('Erreur lors du chargement des données:', error);
            this.showError('Erreur lors du chargement des données');
        }
    }

    async loadConfigurations() {
        // Charger la configuration du calendrier
        const calendarResponse = await fetch('/actions/calendar/config');
        const calendarConfig = await calendarResponse.json();
        this.updateCalendarConfig(calendarConfig);

        // Charger la configuration des tickets
        const ticketResponse = await fetch('/actions/tickets/config');
        const ticketConfig = await ticketResponse.json();
        this.updateTicketConfig(ticketConfig);
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
            switch (this.currentSection) {
                case 'email':
                    configData = this.getEmailConfig();
                    await this.saveEmailConfig(configData);
                    break;
                case 'sms':
                    configData = this.getSMSConfig();
                    await this.saveSMSConfig(configData);
                    break;
                case 'calendar':
                    configData = this.getCalendarConfig();
                    await this.saveCalendarConfig(configData);
                    break;
                case 'tickets':
                    configData = this.getTicketConfig();
                    await this.saveTicketConfig(configData);
                    break;
                case 'forms':
                    configData = this.getFormsConfig();
                    await this.saveFormsConfig(configData);
                    break;
            }
            this.showSuccess('Configuration sauvegardée avec succès');
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
                },
                body: JSON.stringify({
                    type: this.currentSection,
                    config: this.getCurrentConfig()
                })
            });

            const result = await response.json();
            if (result.success) {
                this.showSuccess('Test effectué avec succès');
            } else {
                this.showError(result.error || 'Erreur lors du test');
            }
        } catch (error) {
            console.error('Erreur lors du test:', error);
            this.showError('Erreur lors du test');
        }
    }

    showTriggerModal() {
        const modalContent = `
            <form id="triggerForm">
                <div class="form-group">
                    <label>Nom du déclencheur</label>
                    <input type="text" class="form-control" name="trigger_name" required>
                </div>
                <div class="form-group">
                    <label>Conditions</label>
                    <textarea class="form-control" name="conditions"></textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="actionsManager.hideTriggerModal()">Annuler</button>
                    <button type="submit" class="btn btn-primary">Ajouter</button>
                </div>
            </form>
        `;
        
        this.triggerModal.querySelector('.modal-content').innerHTML = modalContent;
        this.triggerModal.style.display = 'block';
    }

    hideTriggerModal() {
        this.triggerModal.style.display = 'none';
    }

    // Méthodes utilitaires
    showSuccess(message) {
        // Implémenter l'affichage des messages de succès
    }

    showError(message) {
        // Implémenter l'affichage des erreurs
    }

    getCurrentConfig() {
        // Récupérer la configuration actuelle selon la section
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
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.actionsManager = new ActionsManager();
});