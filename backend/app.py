from gevent import monkey
monkey.patch_all()

import os
import sys

# Force output to be unbuffered
print("[UIPS] --- PROCESS START ---", flush=True)
print(f"[UIPS] Python Version: {sys.version}", flush=True)
print("[UIPS] Loading core dependencies...", flush=True)

# Fix OpenBLAS memory allocation error on Windows
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

from dotenv import load_dotenv
load_dotenv()

print("[UIPS] Initializing Flask & SocketIO...", flush=True)
from flask import Flask, jsonify
from flask_socketio import SocketIO
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_cors import CORS

from jose import jwt
import requests
from functools import wraps
from flask import request

from config import config_by_name
from database.db import db, init_db
from models import User, Exam, ExamSession, SuspicionEvent, MediaChunk
from sockets.events import register_socket_events

# ---------------------------------------------------------------------------
# Extensions
# ---------------------------------------------------------------------------

app = Flask(__name__)
env = os.environ.get("FLASK_ENV", "development")
app.config.from_object(config_by_name[env])

db.init_app(app)

limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["2000 per day", "500 per hour"],
    storage_uri="memory://",
)

CORS(
    app,
    origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:5175").split(","),
    supports_credentials=True,
)

from extensions import socketio

socketio.init_app(
    app,
    cors_allowed_origins="*",
    async_mode="gevent",
    manage_session=False,
)

# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy", "version": "1.0.0"})


print(f"[UIPS] Initializing application components...")
with app.app_context():
    # Register blueprints late to avoid import hangs
    print("[UIPS] Registering blueprints...", flush=True)
    from blueprints.exams import exams_bp
    from blueprints.session import session_bp
    from blueprints.monitor import monitor_bp
    from blueprints.reports import reports_bp
    from blueprints.auth.routes import auth_bp

    app.register_blueprint(exams_bp)
    app.register_blueprint(session_bp)
    app.register_blueprint(monitor_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(auth_bp)

    # Register socket events late
    print("[UIPS] Registering socket events...", flush=True)
    register_socket_events(socketio)

    # Create required directories
    os.makedirs("reports", exist_ok=True)

    # Initialize database and seed data
    print(f"[UIPS] Connecting to database...", flush=True)
    init_db(app)
    print(f"[UIPS] Application ready to handle requests.", flush=True)



# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[UIPS] Starting local server on http://0.0.0.0:{port}")
    print(f"[UIPS] Environment: {env}")
    
    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=app.config.get("DEBUG", False),
        use_reloader=True,
    )
