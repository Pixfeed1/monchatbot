/**
 * Requêtes non comprises - Gestion des données et interactions
 */

class UnhandledQueriesManager {
    constructor() {
        this.queries = [];
        this.filteredQueries = [];
        this.currentFilter = 'all';
        this.currentChannel = '';
        this.searchTerm = '';
        this.currentPage = 1;
        this.perPage = 20;
        this.currentQueryId = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadQueries();
        this.loadStats();

        // Initialiser les icônes Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupEventListeners() {
        // Filtres
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.applyFilters();
            });
        });

        // Recherche
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.applyFilters();
        });

        // Filtre canal
        const channelFilter = document.getElementById('channel-filter');
        channelFilter.addEventListener('change', (e) => {
            this.currentChannel = e.target.value;
            this.applyFilters();
        });

        // Pagination
        document.getElementById('prev-page').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderQueries();
            }
        });

        document.getElementById('next-page').addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredQueries.length / this.perPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderQueries();
            }
        });

        // Modal détails
        document.getElementById('close-query-modal').addEventListener('click', () => {
            this.closeQueryModal();
        });

        document.getElementById('close-modal-btn').addEventListener('click', () => {
            this.closeQueryModal();
        });

        document.getElementById('mark-resolved-btn').addEventListener('click', () => {
            this.closeQueryModal();
            this.showResolveModal();
        });

        // Modal résolution
        document.getElementById('close-resolve-modal').addEventListener('click', () => {
            this.closeResolveModal();
        });

        document.getElementById('cancel-resolve-btn').addEventListener('click', () => {
            this.closeResolveModal();
        });

        document.getElementById('submit-resolve-btn').addEventListener('click', () => {
            this.submitResolution();
        });
    }

    async loadQueries() {
        try {
            const response = await fetch('/api/unhandled-queries');
            if (!response.ok) throw new Error('Erreur lors du chargement des requêtes');

            const data = await response.json();
            if (data.success) {
                this.queries = data.queries;
                this.applyFilters();
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Erreur lors du chargement des requêtes');
        }
    }

    async loadStats() {
        try {
            const response = await fetch('/api/unhandled-queries/stats');
            if (!response.ok) throw new Error('Erreur lors du chargement des statistiques');

            const data = await response.json();
            if (data.success) {
                this.updateStats(data.stats);
            }
        } catch (error) {
            console.error('Erreur:', error);
        }
    }

    updateStats(stats) {
        document.getElementById('total-unhandled').textContent = stats.total || 0;
        document.getElementById('pending-queries').textContent = stats.pending || 0;
        document.getElementById('resolved-queries').textContent = stats.resolved || 0;
        document.getElementById('resolution-rate').textContent = `${stats.resolution_rate || 0}%`;
    }

    applyFilters() {
        this.filteredQueries = this.queries.filter(query => {
            // Filtre par statut
            if (this.currentFilter === 'pending' && query.resolved) return false;
            if (this.currentFilter === 'resolved' && !query.resolved) return false;

            // Filtre par canal
            if (this.currentChannel && query.channel !== this.currentChannel) return false;

            // Recherche
            if (this.searchTerm) {
                const searchable = `${query.user_message} ${query.bot_response || ''}`.toLowerCase();
                if (!searchable.includes(this.searchTerm)) return false;
            }

            return true;
        });

        this.currentPage = 1;
        this.renderQueries();
    }

    renderQueries() {
        const tbody = document.getElementById('queries-tbody');

        if (this.filteredQueries.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">
                        <div class="empty-state">
                            <i data-lucide="inbox"></i>
                            <p>Aucune requête trouvée</p>
                            <small>Essayez de modifier vos filtres</small>
                        </div>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            document.getElementById('pagination').style.display = 'none';
            return;
        }

        // Pagination
        const start = (this.currentPage - 1) * this.perPage;
        const end = start + this.perPage;
        const pageQueries = this.filteredQueries.slice(start, end);

        tbody.innerHTML = pageQueries.map(query => {
            const date = new Date(query.created_at).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const reformulationClass = query.reformulation_count > 3 ? 'high' : '';
            const statusClass = query.resolved ? 'resolved' : 'pending';
            const statusText = query.resolved ? 'Traitée' : 'En attente';

            return `
                <tr data-query-id="${query.id}">
                    <td>${date}</td>
                    <td>
                        <div class="user-message-preview" title="${this.escapeHtml(query.user_message)}">
                            ${this.escapeHtml(query.user_message)}
                        </div>
                    </td>
                    <td>
                        <span class="channel-badge">${this.getChannelName(query.channel)}</span>
                    </td>
                    <td>
                        <span class="reformulation-badge ${reformulationClass}">
                            ${query.reformulation_count}
                        </span>
                    </td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon view-query" data-query-id="${query.id}" title="Voir les détails">
                                <i data-lucide="eye"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Event listeners pour les lignes
        tbody.querySelectorAll('tr[data-query-id]').forEach(row => {
            row.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-icon')) {
                    const queryId = parseInt(row.dataset.queryId);
                    this.showQueryDetails(queryId);
                }
            });
        });

        tbody.querySelectorAll('.view-query').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const queryId = parseInt(btn.dataset.queryId);
                this.showQueryDetails(queryId);
            });
        });

        // Réinitialiser les icônes Lucide
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Mettre à jour la pagination
        this.updatePagination();
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredQueries.length / this.perPage);

        if (totalPages <= 1) {
            document.getElementById('pagination').style.display = 'none';
            return;
        }

        document.getElementById('pagination').style.display = 'flex';
        document.getElementById('current-page').textContent = this.currentPage;
        document.getElementById('total-pages').textContent = totalPages;

        document.getElementById('prev-page').disabled = this.currentPage === 1;
        document.getElementById('next-page').disabled = this.currentPage === totalPages;
    }

    showQueryDetails(queryId) {
        const query = this.queries.find(q => q.id === queryId);
        if (!query) return;

        this.currentQueryId = queryId;

        // Remplir les détails
        document.getElementById('detail-user-id').textContent = query.user_identifier || 'Anonyme';
        document.getElementById('detail-channel').textContent = this.getChannelName(query.channel);
        document.getElementById('detail-date').textContent = new Date(query.created_at).toLocaleString('fr-FR');
        document.getElementById('detail-reformulations').textContent = query.reformulation_count;
        document.getElementById('detail-user-message').textContent = query.user_message;
        document.getElementById('detail-bot-response').textContent = query.bot_response || 'Aucune réponse';

        // Score de confiance
        const confidenceScore = query.confidence_score !== null ? Math.round(query.confidence_score * 100) : 0;
        document.getElementById('detail-confidence-bar').style.width = `${confidenceScore}%`;
        document.getElementById('detail-confidence-text').textContent = `${confidenceScore}%`;

        // Contexte
        const context = query.context ? JSON.stringify(JSON.parse(query.context), null, 2) : 'Aucun contexte';
        document.getElementById('detail-context').textContent = context;

        // Section résolution
        const resolveSection = document.getElementById('resolution-section');
        if (query.resolved) {
            resolveSection.style.display = 'block';
            document.getElementById('detail-resolver').textContent = query.resolver_name || 'Inconnu';
            document.getElementById('detail-resolution-notes').textContent = query.resolution_notes || '-';
            document.getElementById('mark-resolved-btn').style.display = 'none';
        } else {
            resolveSection.style.display = 'none';
            document.getElementById('mark-resolved-btn').style.display = 'inline-flex';
        }

        // Ouvrir la modal
        document.getElementById('query-modal').classList.add('show');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    closeQueryModal() {
        document.getElementById('query-modal').classList.remove('show');
    }

    showResolveModal() {
        document.getElementById('resolve-modal').classList.add('show');
        document.getElementById('resolution-notes').value = '';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    closeResolveModal() {
        document.getElementById('resolve-modal').classList.remove('show');
    }

    async submitResolution() {
        const notes = document.getElementById('resolution-notes').value.trim();

        if (!notes) {
            alert('Veuillez entrer des notes de résolution');
            return;
        }

        try {
            const response = await fetch(`/api/unhandled-queries/${this.currentQueryId}/resolve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    resolution_notes: notes
                })
            });

            if (!response.ok) throw new Error('Erreur lors de la résolution');

            const data = await response.json();
            if (data.success) {
                this.closeResolveModal();
                this.loadQueries();
                this.loadStats();
                this.showSuccess('Requête marquée comme traitée');
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Erreur lors de la résolution');
        }
    }

    getChannelName(channel) {
        const channels = {
            'web': 'Web',
            'whatsapp': 'WhatsApp',
            'messenger': 'Messenger',
            'instagram': 'Instagram',
            'telegram': 'Telegram'
        };
        return channels[channel] || channel || 'Inconnu';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showSuccess(message) {
        // Vous pouvez implémenter un système de notifications ici
        console.log('Succès:', message);
    }

    showError(message) {
        // Vous pouvez implémenter un système de notifications ici
        console.error('Erreur:', message);
    }
}

// Initialiser au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    new UnhandledQueriesManager();
});
