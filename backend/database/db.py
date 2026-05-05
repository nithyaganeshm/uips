from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text

db = SQLAlchemy()


def init_db(app):
    """Create all database tables and print table names."""
    with app.app_context():
        db.create_all()
        inspector = inspect(db.engine)
        table_names = inspector.get_table_names()
        print(f"[DB] Tables created: {table_names}")





