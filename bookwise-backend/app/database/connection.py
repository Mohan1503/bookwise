from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from app.core.config import settings

engine: Engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
