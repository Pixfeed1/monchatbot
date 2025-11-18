/**
 * Réponses Emails/SMS - Gestion des données et interactions
 */

class ResponsesManager {
    constructor() {
        this.responses = [];
        this.filteredResponses = [];
        this.currentFilter = 'all';
        this.currentPeriod = 'today';
        this.searchTerm = '';
        this.currentPage = 1;
        this.perPage = 20;
        this.currentResponseId = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadResponses();
        this.loadStats();

        // Initialiser les icônes Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupEventListeners() {
        // Filtres de type
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.applyFilters();
            });
        });

        // Filtres de période
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentPeriod = btn.dataset.period;
                this.loadResponses();
            });
        });

        // Recherche
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.applyFilters();
        });

        // Pagination
        document.getElementById('prev-page').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderResponses();
            }
        });

        document.getElementById('next-page').addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredResponses.length / this.perPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderResponses();
            }
        });

        // Modal
        document.getElementById('close-response-modal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('close-modal-btn').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('mark-read-btn').addEventListener('click', () => {
            this.markAsRead();
        });
    }

    async loadResponses() {
        try {
            const response = await fetch(`/api/communication/responses?period=${this.currentPeriod}`);
            if (!response.ok) throw new Error('Erreur lors du chargement des réponses');

            const data = await response.json();
            if (data.success) {
                this.responses = data.responses;
                this.applyFilters();
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Erreur lors du chargement des réponses');
        }
    }

    async loadStats() {
        try {
            const response = await fetch(`/api/communication/responses/stats?period=${this.currentPeriod}`);
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
        document.getElementById('total-responses').textContent = stats.total || 0;
        document.getElementById('email-responses').textContent = stats.email || 0;
        document.getElementById('sms-responses').textContent = stats.sms || 0;
        const responseRate = stats.sent > 0 ? Math.round((stats.total / stats.sent) * 100) : 0;
        document.getElementById('response-rate').textContent = `${responseRate}%`;
    }

    applyFilters() {
        this.filteredResponses = this.responses.filter(response => {
            // Filtre par type
            if (this.currentFilter === 'email' && response.type !== 'email') return false;
            if (this.currentFilter === 'sms' && response.type !== 'sms') return false;
            if (this.currentFilter === 'unread' && response.is_read) return false;

            // Recherche
            if (this.searchTerm) {
                const searchable = `${response.sender} ${response.content || ''}`.toLowerCase();
                if (!searchable.includes(this.searchTerm)) return false;
            }

            return true;
        });

        this.currentPage = 1;
        this.renderResponses();
    }

    renderResponses() {
        const tbody = document.getElementById('responses-tbody');

        if (this.filteredResponses.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">
                        <div class="empty-state">
                            <i data-lucide="inbox"></i>
                            <p>Aucune réponse trouvée</p>
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
        const pageResponses = this.filteredResponses.slice(start, end);

        tbody.innerHTML = pageResponses.map(response => {
            const date = new Date(response.received_at).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const typeClass = response.type === 'email' ? 'email' : 'sms';
            const typeText = response.type === 'email' ? 'Email' : 'SMS';

            const statusClass = response.is_read ? 'read' : 'unread';
            const statusText = response.is_read ? 'Lu' : 'Non lu';

            return `
                <tr data-response-id="${response.id}">
                    <td>${date}</td>
                    <td>${this.escapeHtml(response.sender)}</td>
                    <td><span class="type-badge ${typeClass}">${typeText}</span></td>
                    <td><div class="message-preview">${this.escapeHtml(response.content || '-')}</div></td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button class="btn-icon view-response" data-response-id="${response.id}" title="Voir les détails">
                            <i data-lucide="eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Event listeners
        tbody.querySelectorAll('tr[data-response-id]').forEach(row => {
            row.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-icon')) {
                    const responseId = parseInt(row.dataset.responseId);
                    this.showResponseDetails(responseId);
                }
            });
        });

        tbody.querySelectorAll('.view-response').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const responseId = parseInt(btn.dataset.responseId);
                this.showResponseDetails(responseId);
            });
        });

        // Réinitialiser les icônes Lucide
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Mettre à jour la pagination
        this.updatePagination();
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredResponses.length / this.perPage);

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

    showResponseDetails(responseId) {
        const response = this.responses.find(r => r.id === responseId);
        if (!response) return;

        this.currentResponseId = responseId;

        // Remplir les détails
        document.getElementById('detail-sender').textContent = response.sender;
        document.getElementById('detail-date').textContent = new Date(response.received_at).toLocaleString('fr-FR');

        const typeClass = response.type === 'email' ? 'email' : 'sms';
        const typeText = response.type === 'email' ? 'Email' : 'SMS';
        document.getElementById('detail-type').innerHTML = `<span class="type-badge ${typeClass}">${typeText}</span>`;

        const statusClass = response.is_read ? 'read' : 'unread';
        const statusText = response.is_read ? 'Lu' : 'Non lu';
        document.getElementById('detail-status').innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;

        document.getElementById('detail-original').textContent = response.original_message || '-';
        document.getElementById('detail-response').textContent = response.content || '-';

        // Bouton marquer comme lu
        const markReadBtn = document.getElementById('mark-read-btn');
        markReadBtn.style.display = response.is_read ? 'none' : 'inline-flex';

        // Ouvrir la modal
        document.getElementById('response-modal').classList.add('show');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    async markAsRead() {
        if (!this.currentResponseId) return;

        try {
            const response = await fetch(`/api/communication/responses/${this.currentResponseId}/mark-read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Erreur lors de la mise à jour');

            const data = await response.json();
            if (data.success) {
                this.closeModal();
                this.loadResponses();
                this.loadStats();
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Erreur lors de la mise à jour');
        }
    }

    closeModal() {
        document.getElementById('response-modal').classList.remove('show');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showError(message) {
        console.error('Erreur:', message);
    }
}

// Initialiser au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    new ResponsesManager();
});
