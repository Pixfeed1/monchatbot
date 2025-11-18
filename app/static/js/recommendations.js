/**
 * Gestionnaire de la page Recommandations
 */
class RecommendationsManager {
    constructor() {
        this.recommendations = [];
        this.currentRecommendationId = null;
        this.filters = {
            status: '',
            priority: '',
            type: '',
            category: ''
        };

        this.init();
    }

    /**
     * Initialisation
     */
    init() {
        this.setupEventListeners();
        this.loadRecommendations();
    }

    /**
     * Configuration des écouteurs d'événements
     */
    setupEventListeners() {
        // Bouton créer recommandation
        document.getElementById('create-recommendation-btn').addEventListener('click', () => {
            this.openCreateModal();
        });

        // Modal: Fermer
        document.getElementById('close-recommendation-modal').addEventListener('click', () => {
            this.closeModal('recommendation-modal');
        });

        document.getElementById('cancel-recommendation').addEventListener('click', () => {
            this.closeModal('recommendation-modal');
        });

        // Modal: Sauvegarder
        document.getElementById('save-recommendation').addEventListener('click', () => {
            this.saveRecommendation();
        });

        // Modal View: Fermer
        document.getElementById('close-view-modal').addEventListener('click', () => {
            this.closeModal('view-recommendation-modal');
        });

        document.getElementById('close-view-btn').addEventListener('click', () => {
            this.closeModal('view-recommendation-modal');
        });

        // Modal View: Editer depuis vue détail
        document.getElementById('edit-from-view-btn').addEventListener('click', () => {
            this.closeModal('view-recommendation-modal');
            this.openEditModal(this.currentRecommendationId);
        });

        // Filtres
        document.getElementById('filter-status').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.applyFilters();
        });

        document.getElementById('filter-priority').addEventListener('change', (e) => {
            this.filters.priority = e.target.value;
            this.applyFilters();
        });

        document.getElementById('filter-type').addEventListener('change', (e) => {
            this.filters.type = e.target.value;
            this.applyFilters();
        });

        document.getElementById('filter-category').addEventListener('change', (e) => {
            this.filters.category = e.target.value;
            this.applyFilters();
        });

        // Réinitialiser filtres
        document.getElementById('reset-filters-btn').addEventListener('click', () => {
            this.resetFilters();
        });

        // Validation JSON en temps réel
        document.getElementById('recommendation-source-data').addEventListener('input', (e) => {
            this.validateJSON(e.target.value);
        });

        // Fermer modal en cliquant à l'extérieur
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });
    }

    /**
     * Charge toutes les recommandations
     */
    async loadRecommendations() {
        try {
            const response = await fetch('/api/recommendations');
            const data = await response.json();

            if (data.success) {
                this.recommendations = data.recommendations;
                this.renderRecommendations();
                this.updateStats();
            } else {
                this.showError('Erreur lors du chargement des recommandations');
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Impossible de charger les recommandations');
        }
    }

    /**
     * Affiche les recommandations
     */
    renderRecommendations() {
        const grid = document.getElementById('recommendations-grid');
        const emptyState = document.getElementById('empty-state');

        // Filtrer les recommandations
        const filteredRecommendations = this.getFilteredRecommendations();

        if (filteredRecommendations.length === 0) {
            grid.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        grid.innerHTML = filteredRecommendations.map(rec => this.createRecommendationCard(rec)).join('');

        // Réinitialiser les icônes Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Ajouter les event listeners
        this.attachCardEventListeners();
    }

    /**
     * Crée une carte de recommandation
     */
    createRecommendationCard(rec) {
        const statusLabels = {
            pending: 'En attente',
            in_progress: 'En cours',
            implemented: 'Implémentée',
            dismissed: 'Rejetée'
        };

        const priorityLabels = {
            low: 'Basse',
            medium: 'Moyenne',
            high: 'Haute',
            critical: 'Critique'
        };

        const typeLabels = {
            manual: 'Manuelle',
            auto: 'Auto',
            ai_suggested: 'IA'
        };

        const categoryLabels = {
            response_quality: 'Qualité réponses',
            new_topic: 'Nouveau sujet',
            missing_info: 'Info manquante',
            flow_improvement: 'Amélioration flux',
            other: 'Autre'
        };

        const createdDate = new Date(rec.created_at).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });

        return `
            <div class="recommendation-card priority-${rec.priority}" data-id="${rec.id}">
                <div class="recommendation-header">
                    <h3 class="recommendation-title">${this.escapeHtml(rec.title)}</h3>
                    <div class="recommendation-actions">
                        <button class="action-btn edit-btn" data-id="${rec.id}" title="Modifier">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button class="action-btn delete-btn" data-id="${rec.id}" title="Supprimer">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>

                <p class="recommendation-description">${this.escapeHtml(rec.description)}</p>

                <div class="recommendation-meta">
                    <span class="meta-badge badge-status ${rec.status}">
                        <i data-lucide="${this.getStatusIcon(rec.status)}"></i>
                        ${statusLabels[rec.status] || rec.status}
                    </span>
                    <span class="meta-badge badge-priority ${rec.priority}">
                        <i data-lucide="flag"></i>
                        ${priorityLabels[rec.priority] || rec.priority}
                    </span>
                    ${rec.recommendation_type ? `
                        <span class="meta-badge badge-type ${rec.recommendation_type}">
                            <i data-lucide="${this.getTypeIcon(rec.recommendation_type)}"></i>
                            ${typeLabels[rec.recommendation_type] || rec.recommendation_type}
                        </span>
                    ` : ''}
                    ${rec.category ? `
                        <span class="meta-badge badge-category">
                            <i data-lucide="tag"></i>
                            ${categoryLabels[rec.category] || rec.category}
                        </span>
                    ` : ''}
                </div>

                <div class="recommendation-footer">
                    <div class="footer-info">
                        <span title="Date de création">
                            <i data-lucide="calendar"></i>
                            ${createdDate}
                        </span>
                        ${rec.affected_users_count > 0 ? `
                            <span title="Utilisateurs affectés">
                                <i data-lucide="users"></i>
                                ${rec.affected_users_count}
                            </span>
                        ` : ''}
                    </div>
                    <select class="status-selector" data-id="${rec.id}" onclick="event.stopPropagation()">
                        <option value="pending" ${rec.status === 'pending' ? 'selected' : ''}>En attente</option>
                        <option value="in_progress" ${rec.status === 'in_progress' ? 'selected' : ''}>En cours</option>
                        <option value="implemented" ${rec.status === 'implemented' ? 'selected' : ''}>Implémentée</option>
                        <option value="dismissed" ${rec.status === 'dismissed' ? 'selected' : ''}>Rejetée</option>
                    </select>
                </div>
            </div>
        `;
    }

    /**
     * Attache les event listeners aux cartes
     */
    attachCardEventListeners() {
        // Clic sur la carte pour voir les détails
        document.querySelectorAll('.recommendation-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.action-btn') && !e.target.closest('.status-selector')) {
                    const id = parseInt(card.dataset.id);
                    this.viewRecommendation(id);
                }
            });
        });

        // Boutons d'édition
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.openEditModal(id);
            });
        });

        // Boutons de suppression
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.deleteRecommendation(id);
            });
        });

        // Changement de statut
        document.querySelectorAll('.status-selector').forEach(select => {
            select.addEventListener('change', (e) => {
                e.stopPropagation();
                const id = parseInt(select.dataset.id);
                const newStatus = select.value;
                this.updateStatus(id, newStatus);
            });
        });
    }

    /**
     * Ouvre la modal de création
     */
    openCreateModal() {
        this.currentRecommendationId = null;
        document.getElementById('modal-title').textContent = 'Nouvelle recommandation';
        this.resetForm();
        this.openModal('recommendation-modal');
    }

    /**
     * Ouvre la modal d'édition
     */
    openEditModal(id) {
        const rec = this.recommendations.find(r => r.id === id);
        if (!rec) return;

        this.currentRecommendationId = id;
        document.getElementById('modal-title').textContent = 'Modifier la recommandation';

        // Remplir le formulaire
        document.getElementById('recommendation-title').value = rec.title;
        document.getElementById('recommendation-description').value = rec.description;
        document.getElementById('recommendation-category').value = rec.category || 'other';
        document.getElementById('recommendation-priority').value = rec.priority;
        document.getElementById('recommendation-impact').value = rec.estimated_impact || '';
        document.getElementById('recommendation-users').value = rec.affected_users_count || '';
        document.getElementById('recommendation-source').value = rec.source || '';
        document.getElementById('recommendation-source-data').value = rec.source_data || '';

        this.openModal('recommendation-modal');
    }

    /**
     * Voir les détails d'une recommandation
     */
    viewRecommendation(id) {
        const rec = this.recommendations.find(r => r.id === id);
        if (!rec) return;

        this.currentRecommendationId = id;

        const statusLabels = {
            pending: 'En attente',
            in_progress: 'En cours',
            implemented: 'Implémentée',
            dismissed: 'Rejetée'
        };

        const priorityLabels = {
            low: 'Basse',
            medium: 'Moyenne',
            high: 'Haute',
            critical: 'Critique'
        };

        const typeLabels = {
            manual: 'Manuelle',
            auto: 'Automatique',
            ai_suggested: 'Suggérée par IA'
        };

        const categoryLabels = {
            response_quality: 'Qualité des réponses',
            new_topic: 'Nouveau sujet',
            missing_info: 'Information manquante',
            flow_improvement: 'Amélioration du flux',
            other: 'Autre'
        };

        document.getElementById('view-modal-title').textContent = rec.title;

        const detailsHtml = `
            <div class="detail-section">
                <div class="detail-label">Description</div>
                <div class="detail-value">${this.escapeHtml(rec.description)}</div>
            </div>

            <div class="detail-section">
                <div class="detail-label">Informations</div>
                <div class="detail-badges">
                    <span class="meta-badge badge-status ${rec.status}">
                        ${statusLabels[rec.status] || rec.status}
                    </span>
                    <span class="meta-badge badge-priority ${rec.priority}">
                        ${priorityLabels[rec.priority] || rec.priority}
                    </span>
                    ${rec.recommendation_type ? `
                        <span class="meta-badge badge-type ${rec.recommendation_type}">
                            ${typeLabels[rec.recommendation_type] || rec.recommendation_type}
                        </span>
                    ` : ''}
                    ${rec.category ? `
                        <span class="meta-badge badge-category">
                            ${categoryLabels[rec.category] || rec.category}
                        </span>
                    ` : ''}
                </div>
            </div>

            ${rec.estimated_impact ? `
                <div class="detail-section">
                    <div class="detail-label">Impact estimé</div>
                    <div class="detail-value">${rec.estimated_impact}</div>
                </div>
            ` : ''}

            ${rec.affected_users_count > 0 ? `
                <div class="detail-section">
                    <div class="detail-label">Utilisateurs affectés</div>
                    <div class="detail-value">${rec.affected_users_count}</div>
                </div>
            ` : ''}

            ${rec.source ? `
                <div class="detail-section">
                    <div class="detail-label">Source</div>
                    <div class="detail-value">${this.escapeHtml(rec.source)}</div>
                </div>
            ` : ''}

            ${rec.source_data ? `
                <div class="detail-section">
                    <div class="detail-label">Données source</div>
                    <div class="detail-code">${this.escapeHtml(rec.source_data)}</div>
                </div>
            ` : ''}

            <div class="detail-section">
                <div class="detail-label">Dates</div>
                <div class="detail-value">
                    Créé le ${new Date(rec.created_at).toLocaleString('fr-FR')}<br>
                    ${rec.updated_at ? `Modifié le ${new Date(rec.updated_at).toLocaleString('fr-FR')}` : ''}
                </div>
            </div>
        `;

        document.querySelector('#view-recommendation-modal .recommendation-details').innerHTML = detailsHtml;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        this.openModal('view-recommendation-modal');
    }

    /**
     * Sauvegarde une recommandation
     */
    async saveRecommendation() {
        const title = document.getElementById('recommendation-title').value.trim();
        const description = document.getElementById('recommendation-description').value.trim();
        const category = document.getElementById('recommendation-category').value;
        const priority = document.getElementById('recommendation-priority').value;
        const impact = document.getElementById('recommendation-impact').value;
        const users = document.getElementById('recommendation-users').value;
        const source = document.getElementById('recommendation-source').value.trim();
        const sourceData = document.getElementById('recommendation-source-data').value.trim();

        // Validation
        if (!title) {
            alert('Le titre est obligatoire');
            return;
        }

        if (!description) {
            alert('La description est obligatoire');
            return;
        }

        // Validation JSON si présent
        if (sourceData && !this.validateJSON(sourceData)) {
            alert('Le format JSON des données source est invalide');
            return;
        }

        const data = {
            title,
            description,
            category,
            priority,
            estimated_impact: impact || null,
            affected_users_count: users ? parseInt(users) : 0,
            source: source || null,
            source_data: sourceData || null,
            recommendation_type: 'manual'
        };

        try {
            let response;
            if (this.currentRecommendationId) {
                // Mise à jour
                response = await fetch(`/api/recommendations/${this.currentRecommendationId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
            } else {
                // Création
                response = await fetch('/api/recommendations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
            }

            const result = await response.json();

            if (result.success) {
                this.closeModal('recommendation-modal');
                this.loadRecommendations();
                this.showSuccess(this.currentRecommendationId ? 'Recommandation mise à jour' : 'Recommandation créée');
            } else {
                this.showError(result.error || 'Erreur lors de la sauvegarde');
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Impossible de sauvegarder la recommandation');
        }
    }

    /**
     * Supprime une recommandation
     */
    async deleteRecommendation(id) {
        const rec = this.recommendations.find(r => r.id === id);
        if (!rec) return;

        if (!confirm(`Voulez-vous vraiment supprimer la recommandation "${rec.title}" ?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/recommendations/${id}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.loadRecommendations();
                this.showSuccess('Recommandation supprimée');
            } else {
                this.showError(result.error || 'Erreur lors de la suppression');
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Impossible de supprimer la recommandation');
        }
    }

    /**
     * Met à jour le statut d'une recommandation
     */
    async updateStatus(id, newStatus) {
        try {
            const response = await fetch(`/api/recommendations/${id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });

            const result = await response.json();

            if (result.success) {
                this.loadRecommendations();
                this.showSuccess('Statut mis à jour');
            } else {
                this.showError(result.error || 'Erreur lors de la mise à jour');
                this.loadRecommendations(); // Recharger pour annuler le changement visuel
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Impossible de mettre à jour le statut');
            this.loadRecommendations();
        }
    }

    /**
     * Met à jour les statistiques
     */
    updateStats() {
        const pending = this.recommendations.filter(r => r.status === 'pending').length;
        const inProgress = this.recommendations.filter(r => r.status === 'in_progress').length;
        const implemented = this.recommendations.filter(r => r.status === 'implemented').length;
        const highPriority = this.recommendations.filter(r => ['high', 'critical'].includes(r.priority)).length;

        document.getElementById('pending-count').textContent = pending;
        document.getElementById('in-progress-count').textContent = inProgress;
        document.getElementById('implemented-count').textContent = implemented;
        document.getElementById('high-priority-count').textContent = highPriority;
    }

    /**
     * Applique les filtres
     */
    applyFilters() {
        this.renderRecommendations();
    }

    /**
     * Réinitialise les filtres
     */
    resetFilters() {
        this.filters = {
            status: '',
            priority: '',
            type: '',
            category: ''
        };

        document.getElementById('filter-status').value = '';
        document.getElementById('filter-priority').value = '';
        document.getElementById('filter-type').value = '';
        document.getElementById('filter-category').value = '';

        this.applyFilters();
    }

    /**
     * Retourne les recommandations filtrées
     */
    getFilteredRecommendations() {
        return this.recommendations.filter(rec => {
            if (this.filters.status && rec.status !== this.filters.status) return false;
            if (this.filters.priority && rec.priority !== this.filters.priority) return false;
            if (this.filters.type && rec.recommendation_type !== this.filters.type) return false;
            if (this.filters.category && rec.category !== this.filters.category) return false;
            return true;
        });
    }

    /**
     * Valide le JSON
     */
    validateJSON(jsonString) {
        if (!jsonString.trim()) return true;

        try {
            JSON.parse(jsonString);
            document.getElementById('json-error').style.display = 'none';
            return true;
        } catch (e) {
            document.getElementById('json-error').style.display = 'block';
            return false;
        }
    }

    /**
     * Réinitialise le formulaire
     */
    resetForm() {
        document.getElementById('recommendation-form').reset();
        document.getElementById('json-error').style.display = 'none';
    }

    /**
     * Ouvre une modal
     */
    openModal(modalId) {
        document.getElementById(modalId).classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Ferme une modal
     */
    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
        document.body.style.overflow = '';
    }

    /**
     * Icône pour le statut
     */
    getStatusIcon(status) {
        const icons = {
            pending: 'clock',
            in_progress: 'loader',
            implemented: 'check-circle',
            dismissed: 'x-circle'
        };
        return icons[status] || 'circle';
    }

    /**
     * Icône pour le type
     */
    getTypeIcon(type) {
        const icons = {
            manual: 'edit',
            auto: 'zap',
            ai_suggested: 'sparkles'
        };
        return icons[type] || 'tag';
    }

    /**
     * Échappe le HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Affiche un message de succès
     */
    showSuccess(message) {
        // Utiliser le système de notification existant ou créer un simple alert
        console.log('SUCCESS:', message);
        // TODO: Implémenter un système de toast notifications
    }

    /**
     * Affiche un message d'erreur
     */
    showError(message) {
        console.error('ERROR:', message);
        alert(message);
    }
}
