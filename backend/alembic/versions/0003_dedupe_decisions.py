"""Drop repeated approval notes and replace the placeholder tool name."""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        sa.text(
            """
            DELETE FROM activities
            WHERE kind = 'decision'
              AND id NOT IN (
                SELECT id FROM (
                  SELECT MIN(id) AS id
                  FROM activities
                  WHERE kind = 'decision'
                  GROUP BY deal_id, text
                ) AS kept
              )
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE programs
            SET tools = 'Автотестирование'
            WHERE tools = 'Яга' AND name LIKE '%тестировщик%'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE programs
            SET tools = 'Управление задачами'
            WHERE tools = 'Яга' AND name LIKE '%проект%'
            """
        )
    )


def downgrade():
    pass
