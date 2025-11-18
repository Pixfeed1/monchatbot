-- Migration manuelle pour ajouter les tables Widget et Recommendation
-- À utiliser si run_migrations.py ne fonctionne pas
-- Usage: psql -U votre_user -d votre_database -f migrations/manual_add_widget_recommendation.sql

-- ==================================================
-- TABLE WIDGET - Pour les widgets d'intégration
-- ==================================================

CREATE TABLE IF NOT EXISTS widget (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    widget_key VARCHAR(64) NOT NULL UNIQUE,
    allowed_domains TEXT NOT NULL,
    page_scope VARCHAR(20) DEFAULT 'all',
    allowed_pages TEXT,
    primary_color VARCHAR(7) DEFAULT '#0d6efd',
    position VARCHAR(20) DEFAULT 'bottom-right',
    welcome_message TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER NOT NULL REFERENCES "user"(id),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS ix_widget_created_by ON widget(created_by);
CREATE INDEX IF NOT EXISTS ix_widget_is_active ON widget(is_active);

COMMENT ON TABLE widget IS 'Widgets pour intégrer le bot sur des sites externes';
COMMENT ON COLUMN widget.widget_key IS 'Clé unique générée pour identifier le widget';
COMMENT ON COLUMN widget.allowed_domains IS 'JSON array des domaines autorisés (support wildcard)';
COMMENT ON COLUMN widget.page_scope IS 'all, specific, ou pattern';
COMMENT ON COLUMN widget.allowed_pages IS 'JSON array des pages autorisées';

-- ==================================================
-- TABLE RECOMMENDATION - Pour les recommandations
-- ==================================================

CREATE TABLE IF NOT EXISTS recommendation (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    recommendation_type VARCHAR(50) DEFAULT 'manual',
    category VARCHAR(50),
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'pending',
    source TEXT,
    source_data TEXT,
    estimated_impact VARCHAR(20),
    affected_users_count INTEGER DEFAULT 0,
    suggested_action TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES "user"(id),
    implemented_by INTEGER REFERENCES "user"(id),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    implemented_at TIMESTAMP
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS ix_recommendation_status ON recommendation(status);
CREATE INDEX IF NOT EXISTS ix_recommendation_priority ON recommendation(priority);
CREATE INDEX IF NOT EXISTS ix_recommendation_category ON recommendation(category);
CREATE INDEX IF NOT EXISTS ix_recommendation_created_by ON recommendation(created_by);

COMMENT ON TABLE recommendation IS 'Recommandations pour améliorer le bot basées sur l''analyse';
COMMENT ON COLUMN recommendation.recommendation_type IS 'manual, auto, ou ai_suggested';
COMMENT ON COLUMN recommendation.priority IS 'low, medium, high, ou critical';
COMMENT ON COLUMN recommendation.status IS 'pending, in_progress, implemented, ou dismissed';
COMMENT ON COLUMN recommendation.source IS 'Source de la recommandation (queries, analytics, etc.)';
COMMENT ON COLUMN recommendation.source_data IS 'Données JSON de la source';

-- ==================================================
-- Mettre à jour le numéro de version Alembic
-- ==================================================

-- Si vous utilisez ce script, vous devez aussi mettre à jour la table alembic_version
-- ATTENTION: Vérifiez d'abord la version actuelle avec:
-- SELECT version_num FROM alembic_version;

-- Puis mettez à jour (décommentez la ligne suivante SEULEMENT si nécessaire):
-- UPDATE alembic_version SET version_num = 'add_widget_recommendation';

-- ==================================================
-- VÉRIFICATION
-- ==================================================

-- Vérifier que les tables ont été créées
SELECT 'widget' as table_name, COUNT(*) as exists
FROM information_schema.tables
WHERE table_name = 'widget'
UNION ALL
SELECT 'recommendation' as table_name, COUNT(*) as exists
FROM information_schema.tables
WHERE table_name = 'recommendation';

-- Afficher la structure des tables
\d widget
\d recommendation
