// file: app/static/js/base.js
document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburger-menu');
    const hasSubmenuItems = document.querySelectorAll('.has-submenu');

    // Gestion du hamburger
    hamburger.addEventListener('click', function(e) {
        e.stopPropagation();
        this.classList.toggle('active');
        sidebar.classList.toggle('mobile-open');
    });

    // Fonction pour gérer l'ouverture/fermeture d'un sous-menu
    function handleSubmenu(menuItem, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        const link = menuItem.querySelector('a');
        const submenu = menuItem.querySelector('.submenu-container');
        const isExpanded = menuItem.classList.contains('expanded');

        // Toggle des classes et attributs
        menuItem.classList.toggle('expanded');
        link.setAttribute('aria-expanded', !isExpanded);

        // Gestion de la hauteur du sous-menu
        if (submenu) {
            if (!isExpanded) {
                submenu.style.maxHeight = submenu.scrollHeight + 'px';
                
                // Ajuster les hauteurs des parents si nécessaire
                let parent = submenu.parentElement.closest('.submenu-container');
                while (parent) {
                    parent.style.maxHeight = parent.scrollHeight + submenu.scrollHeight + 'px';
                    parent = parent.parentElement.closest('.submenu-container');
                }
            } else {
                submenu.style.maxHeight = '0';
            }
        }
    }

    // Gestion des clics sur les éléments avec sous-menus
    hasSubmenuItems.forEach(item => {
        const link = item.querySelector('a');
        if (link) {
            link.addEventListener('click', function(e) {
                handleSubmenu(item, e);
            });
        }
    });

    // Fermeture au clic en dehors
    document.addEventListener('click', function(e) {
        if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('mobile-open');
                hamburger.classList.remove('active');
            }
        }
    });

    // Empêcher la propagation des clics dans la sidebar en mobile
    sidebar.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            e.stopPropagation();
        }
    });

    // Réinitialisation lors du redimensionnement
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('mobile-open');
            hamburger.classList.remove('active');
        }
    });

    // Initialiser le mode UI au chargement
    initializeUIMode();

    // Gestion du dropdown de notifications
    const notificationBell = document.getElementById('notificationBell');
    const notificationDropdown = document.getElementById('notificationDropdown');

    if (notificationBell && notificationDropdown) {
        notificationBell.addEventListener('click', function(e) {
            e.stopPropagation();
            notificationDropdown.classList.toggle('show');
        });

        // Fermer le dropdown au clic en dehors
        document.addEventListener('click', function(e) {
            if (!notificationDropdown.contains(e.target) && e.target !== notificationBell) {
                notificationDropdown.classList.remove('show');
            }
        });
    }
});

/**
 * Initialise le mode UI (Simple/Avancé) au chargement de la page
 */
function initializeUIMode() {
    // Récupérer le mode actuel depuis localStorage ou défaut simple
    const currentMode = localStorage.getItem('uiMode') || 'simple';

    if (currentMode === 'advanced') {
        showAdvancedMode();
    } else {
        showSimpleMode();
    }
}

/**
 * Bascule entre le mode Simple et Avancé
 */
function toggleUIMode() {
    const modeLabel = document.querySelector('.mode-label');
    const currentMode = modeLabel.textContent.includes('Simple') ? 'simple' : 'advanced';
    const newMode = currentMode === 'simple' ? 'advanced' : 'simple';

    // Récupérer le CSRF token
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

    // Envoyer la requête au backend
    fetch('/api/toggle-ui-mode', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ mode: newMode })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Sauvegarder le nouveau mode
            localStorage.setItem('uiMode', newMode);

            // Mettre à jour l'interface
            if (newMode === 'advanced') {
                showAdvancedMode();
            } else {
                showSimpleMode();
            }

            // Animation de feedback (micro-interaction 2025)
            const toggleBtn = document.querySelector('.mode-toggle-btn');
            toggleBtn.style.transform = 'scale(0.9)';
            setTimeout(() => {
                toggleBtn.style.transform = '';
            }, 150);
        } else {
            console.error('Erreur lors du changement de mode:', data.error);
        }
    })
    .catch(error => {
        console.error('Erreur réseau:', error);
    });
}

/**
 * Affiche le mode Simple (masque les menus avancés)
 */
function showSimpleMode() {
    const advancedItems = document.querySelectorAll('.advanced-only');
    const modeLabel = document.querySelector('.mode-label');
    const modeHint = document.querySelector('.mode-hint');
    const toggleBtn = document.querySelector('.mode-toggle-btn');

    // Masquer les menus avancés avec animation
    advancedItems.forEach(item => {
        item.classList.remove('show');
        setTimeout(() => {
            item.style.display = 'none';
        }, 300);
    });

    // Mettre à jour les textes
    if (modeLabel) modeLabel.textContent = 'Mode Simple';
    if (modeHint) modeHint.textContent = 'Fonctions essentielles';
    if (toggleBtn) {
        toggleBtn.title = 'Passer en mode avancé';
        const icon = toggleBtn.querySelector('i');
        if (icon) icon.className = 'fas fa-rocket';
    }
}

/**
 * Affiche le mode Avancé (affiche tous les menus)
 */
function showAdvancedMode() {
    const advancedItems = document.querySelectorAll('.advanced-only');
    const modeLabel = document.querySelector('.mode-label');
    const modeHint = document.querySelector('.mode-hint');
    const toggleBtn = document.querySelector('.mode-toggle-btn');

    // Afficher les menus avancés avec animation
    advancedItems.forEach((item, index) => {
        item.style.display = 'block';
        setTimeout(() => {
            item.classList.add('show');
        }, 50 + (index * 50)); // Animation décalée pour chaque item
    });

    // Mettre à jour les textes
    if (modeLabel) modeLabel.textContent = 'Mode Avancé';
    if (modeHint) modeHint.textContent = 'Toutes les fonctions';
    if (toggleBtn) {
        toggleBtn.title = 'Passer en mode simple';
        const icon = toggleBtn.querySelector('i');
        if (icon) icon.className = 'fas fa-sliders-h';
    }
}