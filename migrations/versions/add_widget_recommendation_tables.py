"""Add Widget and Recommendation tables

Revision ID: add_widget_recommendation
Revises: add_api_usage_log
Create Date: 2025-11-18

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_widget_recommendation'
down_revision = 'add_api_usage_log'
branch_labels = None
depends_on = None


def upgrade():
    # Create Widget table
    op.create_table('widget',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('widget_key', sa.String(length=64), nullable=False),
        sa.Column('allowed_domains', sa.Text(), nullable=False),
        sa.Column('page_scope', sa.String(length=20), nullable=True, server_default='all'),
        sa.Column('allowed_pages', sa.Text(), nullable=True),
        sa.Column('primary_color', sa.String(length=7), nullable=True, server_default='#0d6efd'),
        sa.Column('position', sa.String(length=20), nullable=True, server_default='bottom-right'),
        sa.Column('welcome_message', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['created_by'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('widget_key')
    )

    # Create indexes for Widget table
    op.create_index('ix_widget_created_by', 'widget', ['created_by'])
    op.create_index('ix_widget_is_active', 'widget', ['is_active'])

    # Create Recommendation table
    op.create_table('recommendation',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('recommendation_type', sa.String(length=50), nullable=True, server_default='manual'),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('priority', sa.String(length=20), nullable=True, server_default='medium'),
        sa.Column('status', sa.String(length=20), nullable=True, server_default='pending'),
        sa.Column('source', sa.Text(), nullable=True),
        sa.Column('source_data', sa.Text(), nullable=True),
        sa.Column('estimated_impact', sa.String(length=20), nullable=True),
        sa.Column('affected_users_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('suggested_action', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('implemented_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.Column('implemented_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['user.id'], ),
        sa.ForeignKeyConstraint(['implemented_by'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for Recommendation table
    op.create_index('ix_recommendation_status', 'recommendation', ['status'])
    op.create_index('ix_recommendation_priority', 'recommendation', ['priority'])
    op.create_index('ix_recommendation_category', 'recommendation', ['category'])
    op.create_index('ix_recommendation_created_by', 'recommendation', ['created_by'])


def downgrade():
    # Drop indexes first
    op.drop_index('ix_recommendation_created_by', table_name='recommendation')
    op.drop_index('ix_recommendation_category', table_name='recommendation')
    op.drop_index('ix_recommendation_priority', table_name='recommendation')
    op.drop_index('ix_recommendation_status', table_name='recommendation')
    op.drop_index('ix_widget_is_active', table_name='widget')
    op.drop_index('ix_widget_created_by', table_name='widget')

    # Drop tables
    op.drop_table('recommendation')
    op.drop_table('widget')
