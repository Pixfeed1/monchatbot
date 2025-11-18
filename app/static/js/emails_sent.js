/**
 * Emails Envoyés - Gestion des données et interactions
 */

class EmailsManager {
    constructor() {
        this.emails = [];
        this.filteredEmails = [];
        this.currentFilter = 'all';
        this.currentPeriod = 'today';
        this.searchTerm = '';
        this.currentPage = 1;
        this.perPage = 20;
        this.currentEmailId = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadEmails();
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
                this.loadEmails();
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
                this.renderEmails();
            }
        });

        document.getElementById('next-page').addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredEmails.length / this.perPage);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderEmails();
            }
        });

        // Modal
        document.getElementById('close-email-modal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('close-modal-btn').addEventListener('click', () => {
            this.closeModal();
        });
    }

    async loadEmails() {
        try {
            const response = await fetch(`/api/emails/sent?period=${this.currentPeriod}`);
            if (!response.ok) throw new Error('Erreur lors du chargement des emails');

            const data = await response.json();
            if (data.success) {
                this.emails = data.emails;
                this.applyFilters();
            }
        } catch (error) {
            console.error('Erreur:', error);
            this.showError('Erreur lors du chargement des emails');
        }
    }

    async loadStats() {
        try {
            const response = await fetch(`/api/emails/stats?period=${this.currentPeriod}`);
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
        document.getElementById('total-emails').textContent = stats.total || 0;
        document.getElementById('delivered-emails').textContent = stats.delivered || 0;
        document.getElementById('failed-emails').textContent = stats.failed || 0;
        const successRate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
        document.getElementById('success-rate').textContent = `${successRate}%`;
    }

    applyFilters() {
        this.filteredEmails = this.emails.filter(email => {
            // Filtre par statut
            if (this.currentFilter === 'delivered' && email.status !== 'delivered') return false;
            if (this.currentFilter === 'failed' && email.status !== 'failed') return false;

            // Recherche
            if (this.searchTerm) {
                const searchable = `${email.recipient} ${email.subject || ''}`.toLowerCase();
                if (!searchable.includes(this.searchTerm)) return false;
            }

            return true;
        });

        this.currentPage = 1;
        this.renderEmails();
    }

    renderEmails() {
        const tbody = document.getElementById('emails-tbody');

        if (this.filteredEmails.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">
                        <div class="empty-state">
                            <i data-lucide="inbox"></i>
                            <p>Aucun email trouvé</p>
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
        const pageEmails = this.filteredEmails.slice(start, end);

        tbody.innerHTML = pageEmails.map(email => {
            const date = new Date(email.sent_at).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const statusClass = email.status === 'delivered' ? 'delivered' : 'failed';
            const statusText = email.status === 'delivered' ? 'Délivré' : 'Échec';

            return `
                <tr data-email-id="${email.id}">
                    <td>${date}</td>
                    <td>${this.escapeHtml(email.recipient)}</td>
                    <td><div class="message-preview">${this.escapeHtml(email.subject || '-')}</div></td>
                    <td>${this.escapeHtml(email.template_name || 'Personnalisé')}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button class="btn-icon view-email" data-email-id="${email.id}" title="Voir les détails">
                            <i data-lucide="eye"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Event listeners
        tbody.querySelectorAll('tr[data-email-id]').forEach(row => {
            row.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-icon')) {
                    const emailId = parseInt(row.dataset.emailId);
                    this.showEmailDetails(emailId);
                }
            });
        });

        tbody.querySelectorAll('.view-email').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const emailId = parseInt(btn.dataset.emailId);
                this.showEmailDetails(emailId);
            });
        });

        // Réinitialiser les icônes Lucide
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Mettre à jour la pagination
        this.updatePagination();
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredEmails.length / this.perPage);

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

    showEmailDetails(emailId) {
        const email = this.emails.find(e => e.id === emailId);
        if (!email) return;

        this.currentEmailId = emailId;

        // Remplir les détails
        document.getElementById('detail-recipient').textContent = email.recipient;
        document.getElementById('detail-date').textContent = new Date(email.sent_at).toLocaleString('fr-FR');
        document.getElementById('detail-template').textContent = email.template_name || 'Personnalisé';

        const statusClass = email.status === 'delivered' ? 'delivered' : 'failed';
        const statusText = email.status === 'delivered' ? 'Délivré' : 'Échec';
        document.getElementById('detail-status').innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;

        document.getElementById('detail-subject').textContent = email.subject || '-';
        document.getElementById('detail-body').textContent = email.body || '-';

        // Section erreur
        const errorSection = document.getElementById('error-section');
        if (email.status === 'failed' && email.error_message) {
            errorSection.style.display = 'block';
            document.getElementById('detail-error').textContent = email.error_message;
        } else {
            errorSection.style.display = 'none';
        }

        // Ouvrir la modal
        document.getElementById('email-modal').classList.add('show');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    closeModal() {
        document.getElementById('email-modal').classList.remove('show');
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
    new EmailsManager();
});
