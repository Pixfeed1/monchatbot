"""Add APIUsageLog and SecurityAuditLog tables

Revision ID: add_api_usage_log
Revises: add_ui_mode_preferences
Create Date: 2025-01-16

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_api_usage_log'
down_revision = 'add_ui_mode_preferences'
branch_labels = None
depends_on = None


def upgrade():
    # Create APIUsageLog table
    op.create_table('api_usage_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=20), nullable=False),
        sa.Column('model', sa.String(length=50), nullable=False),
        sa.Column('tokens_used', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('cost_estimate', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('request_duration', sa.Float(), nullable=True, server_default='0.0'),
        sa.Column('success', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create SecurityAuditLog table
    op.create_table('security_audit_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('event_description', sa.Text(), nullable=False),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('risk_level', sa.String(length=20), nullable=True, server_default='low'),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('security_audit_log')
    op.drop_table('api_usage_log')
