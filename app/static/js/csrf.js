// Fonction pour récupérer le token CSRF depuis la balise meta
function getCSRFToken() {
    return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
}

// Fonction utilitaire pour les requêtes fetch avec CSRF
function fetchWithCSRF(url, options = {}) {
    // Récupération du token
    const token = getCSRFToken();

    // Configuration par défaut des requêtes
    const defaultOptions = {
        credentials: 'same-origin', // Inclut les cookies
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': token
        }
    };

    // Fusion des options par défaut avec les options fournies
    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    // Retourne la promesse fetch
    return fetch(url, finalOptions);
}

// Fonction pour les requêtes GET
function getJSON(url) {
    return fetchWithCSRF(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Erreur réseau');
            }
            return response.json();
        });
}

// Fonction pour les requêtes POST
function postJSON(url, data) {
    return fetchWithCSRF(url, {
        method: 'POST',
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Erreur réseau');
        }
        return response.json();
    });
}

// Fonction pour les requêtes PUT
function putJSON(url, data) {
    return fetchWithCSRF(url, {
        method: 'PUT',
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Erreur réseau');
        }
        return response.json();
    });
}

// Fonction pour les requêtes DELETE
function deleteJSON(url) {
    return fetchWithCSRF(url, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Erreur réseau');
        }
        return response.json();
    });
}

// Export des fonctions pour les utiliser ailleurs
window.csrfFetch = {
    get: getJSON,
    post: postJSON,
    put: putJSON,
    delete: deleteJSON
};