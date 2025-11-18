/**
 * SMS Envoyés - Gestion des données et interactions
 */

class SMSManager {
    constructor() {
        this.sms = [];
        this.filteredSMS = [];
        this.currentFilter = 'all';
        this.currentPeriod = 'today';
        this.searchTerm = '';
        this.currentPage = 1;
        this.perPage = 20;
        this.currentSMSId = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSMS();
        this.loadStats();

        // Initialiser les icônes Lucide
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupEventListeners() {
        // Filtres de statut
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
                this.loadSMS();
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
                this.renderSMS();
            }
        });

        document.getElementById('next-page').addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredSMS.length / this.perPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderSMS();
            }
        });

        // Modal
        document.getElementById('close-sms-modal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('close-modal-btn').addEventListener('click', () => {
            this.closeModal();
        });
    }

    async loadSMS() {
        try {
            const response = await fetch(`/api/sms/sent?period=${this.currentPeriod}`);
            if (!response.ok) throw new Error('Erreur lors du chargement des SMS');

            const data = await response.json();
            if (data.success) {
                this.sms = data.sms;
                this.applyFilters();
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Erreur lors du chargement des SMS');
        }
    }

    async loadStats() {
        try {
            const response = await fetch(`/api/sms/stats?period=${this.currentPeriod}`);
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
        document.getElementById('total-sms').textContent = stats.total || 0;
        document.getElementById('delivered-sms').textContent = stats.delivered || 0;
        document.getElementById('failed-sms').textContent = stats.failed || 0;
        const successRate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
        document.getElementById('success-rate').textContent = `${successRate}%`;
    }

    applyFilters() {
        this.filteredSMS = this.sms.filter(sms => {
            // Filtre par statut
            if (this.currentFilter === 'delivered' && sms.status !== 'delivered') return false;
            if (this.currentFilter === 'failed' && sms.status !== 'failed') return false;

            // Recherche
            if (this.searchTerm) {
                const searchable = `${sms.recipient} ${sms.message || ''}`.toLowerCase();
                if (!searchable.includes(this.searchTerm)) return false;
            }

            return true;
        });

        this.currentPage = 1;
        this.renderSMS();
    }

    renderSMS() {
        const tbody = document.getElementById('sms-tbody');

        if (this.filteredSMS.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">
                        <div class="empty-state">
                            <i data-lucide="inbox"></i>
                            <p>Aucun SMS trouvé</p>
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
        const pageSMS = this.filteredSMS.slice(start, end);

        tbody.innerHTML = pageSMS.map(sms => {
            const date = new Date(sms.sent_at).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const statusClass = sms.status === 'delivered' ? 'delivered' : 'failed';
            const statusText = sms.status === 'delivered' ? 'Délivré' : 'Échec';

            return `
                <tr data-sms-id="${sms.id}">
                    <td>${date}</td>
                    <td>${this.escapeHtml(sms.recipient)}</td>
                    <td><div class="message-preview">${this.escapeHtml(sms.message || '-')}</div></td>
                    <td>${this.escapeHtml(sms.provider || 'Twilio')}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button class="btn-icon view-sms" data-sms-id="${sms.id}" title="Voir les détails">
                            <i data-lucide="eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Event listeners
        tbody.querySelectorAll('tr[data-sms-id]').forEach(row => {
            row.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-icon')) {
                    const smsId = parseInt(row.dataset.smsId);
                    this.showSMSDetails(smsId);
                }
            });
        });

        tbody.querySelectorAll('.view-sms').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const smsId = parseInt(btn.dataset.smsId);
                this.showSMSDetails(smsId);
            });
        });

        // Réinitialiser les icônes Lucide
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Mettre à jour la pagination
        this.updatePagination();
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredSMS.length / this.perPage);

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

    showSMSDetails(smsId) {
        const sms = this.sms.find(s => s.id === smsId);
        if (!sms) return;

        this.currentSMSId = smsId;

        // Remplir les détails
        document.getElementById('detail-recipient').textContent = sms.recipient;
        document.getElementById('detail-date').textContent = new Date(sms.sent_at).toLocaleString('fr-FR');
        document.getElementById('detail-provider').textContent = sms.provider || 'Twilio';

        const statusClass = sms.status === 'delivered' ? 'delivered' : 'failed';
        const statusText = sms.status === 'delivered' ? 'Délivré' : 'Échec';
        document.getElementById('detail-status').innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;

        document.getElementById('detail-message').textContent = sms.message || '-';
        const charCount = (sms.message || '').length;
        document.getElementById('detail-char-count').textContent = `${charCount} caractères`;

        // Section erreur
        const errorSection = document.getElementById('error-section');
        if (sms.status === 'failed' && sms.error_message) {
            errorSection.style.display = 'block';
            document.getElementById('detail-error').textContent = sms.error_message;
        } else {
            errorSection.style.display = 'none';
        }

        // Ouvrir la modal
        document.getElementById('sms-modal').classList.add('show');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    closeModal() {
        document.getElementById('sms-modal').classList.remove('show');
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
    new SMSManager();
});
