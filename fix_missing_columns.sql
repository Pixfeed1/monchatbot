-- Script SQL pour ajouter les colonnes manquantes à bot_responses
-- Exécutez ce script avec : psql -U votre_user -d votre_database -f fix_missing_columns.sql

-- Ajouter les colonnes manquantes si elles n'existent pas
DO $$
BEGIN
    -- Ajouter essential_templates si elle n'existe pas
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bot_responses'
        AND column_name = 'essential_templates'
    ) THEN
        ALTER TABLE bot_responses ADD COLUMN essential_templates TEXT;
        RAISE NOTICE 'Colonne essential_templates ajoutée';
    ELSE
        RAISE NOTICE 'Colonne essential_templates existe déjà';
    END IF;

    -- Ajouter behavior_config si elle n'existe pas
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bot_responses'
        AND column_name = 'behavior_config'
    ) THEN
        ALTER TABLE bot_responses ADD COLUMN behavior_config TEXT;
        RAISE NOTICE 'Colonne behavior_config ajoutée';
    ELSE
        RAISE NOTICE 'Colonne behavior_config existe déjà';
    END IF;
END $$;

-- Vérification : lister toutes les colonnes de bot_responses
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bot_responses'
ORDER BY ordinal_position;
