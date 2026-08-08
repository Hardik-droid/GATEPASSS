"""Mark the public app-state schema as Alembic-managed.

The public schema used to be applied by the Node runtime, so committed DDL
could reach production without ever being executed. Alembic is now the sole
DDL owner; application startup only verifies that this revision is installed.

Revision 0002 contains the immutable public-schema snapshot because a blank
database reaches it before its synchronization triggers. This marker retains
the revision ID already installed in production without replaying mutable DDL.
"""

revision = "0003_public_schema"
down_revision = "0002_cleanup_legacy_and_sync"
branch_labels = None
depends_on = None

def upgrade() -> None:
    pass


def downgrade() -> None:
    # The public schema predates this migration and the DDL is additive-only.
    pass
