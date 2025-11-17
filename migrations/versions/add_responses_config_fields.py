"""Add essential_templates and behavior_config to BotResponses

Revision ID: add_responses_config
Revises: add_api_usage_log
Create Date: 2025-01-17

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_responses_config'
down_revision = 'add_api_usage_log'
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns to bot_responses table
    op.add_column('bot_responses', sa.Column('essential_templates', sa.Text(), nullable=True))
    op.add_column('bot_responses', sa.Column('behavior_config', sa.Text(), nullable=True))


def downgrade():
    # Remove the columns if we need to rollback
    op.drop_column('bot_responses', 'behavior_config')
    op.drop_column('bot_responses', 'essential_templates')
