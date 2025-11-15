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
});