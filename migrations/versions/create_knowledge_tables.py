"""Create knowledge base tables

Revision ID: create_knowledge_tables
Revises:
Create Date: 2025-01-17
"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers
revision = 'create_knowledge_tables'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Table des catégories de connaissances
    op.create_table('knowledge_category',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow),
        sa.PrimaryKeyConstraint('id')
    )

    # Table des FAQs
    op.create_table('faq',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('question', sa.String(length=500), nullable=False),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('keywords', sa.String(length=500), nullable=True),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow),
        sa.ForeignKeyConstraint(['category_id'], ['knowledge_category.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Table des documents
    op.create_table('document',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('file_type', sa.String(length=50), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True, default=0),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, default='processing'),
        sa.Column('created_at', sa.DateTime(), nullable=True, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow),
        sa.ForeignKeyConstraint(['category_id'], ['knowledge_category.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Table des règles de réponse
    op.create_table('response_rule',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('condition_type', sa.String(length=50), nullable=True, default='keyword'),
        sa.Column('condition_rules', sa.Text(), nullable=True),
        sa.Column('response_template', sa.Text(), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=True, default=0),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow),
        sa.ForeignKeyConstraint(['category_id'], ['knowledge_category.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Insérer des catégories par défaut
    op.execute("""
        INSERT INTO knowledge_category (name, description, created_at, updated_at) VALUES
        ('Général', 'Questions et documents généraux', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('Produits', 'Informations sur les produits et services', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('Procédures', 'Procédures et guides pratiques', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('Support', 'Support technique et dépannage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    """)


def downgrade():
    op.drop_table('response_rule')
    op.drop_table('document')
    op.drop_table('faq')
    op.drop_table('knowledge_category')
