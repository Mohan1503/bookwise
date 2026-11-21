from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from app.core.config import settings

# No pre-ping: it costs a database round trip on every request (~90 ms to Neon from
# India). Instead, connections are replaced after 4 minutes, before Neon's compute can
# suspend (5 idle minutes) and close them underneath the pool.
engine: Engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=False,
    pool_recycle=240,
    pool_size=5,
    max_overflow=5,
)
