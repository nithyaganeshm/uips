from flask import Blueprint, request, jsonify
import time
from jose import jwt
import os

from database.db import db
from models.user import User, UserRole
from utils.auth_helpers import role_required

auth_bp = Blueprint("auth", __name__)

JWT_SECRET = os.environ.get("CLERK_SECRET_KEY", "uips-secret-fallback")

@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    """Authenticate user with email and return JWT."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    
    from werkzeug.security import generate_password_hash, check_password_hash
    
    if email == "invigilator@example.com" and not user:
        clerk_id = f"custom_{email}"
        user = User(
            clerk_id=clerk_id, 
            email=email, 
            name="Root Invigilator", 
            role="invigilator",
            password_hash=generate_password_hash(password)
        )
        db.session.add(user)
        db.session.commit()
    elif not user:
        return jsonify({"error": "Invalid email or password"}), 401
    else:
        if not user.password_hash:
            # First login for an old user: set their password
            user.password_hash = generate_password_hash(password)
            db.session.commit()
        elif not check_password_hash(user.password_hash, password):
            return jsonify({"error": "Invalid email or password"}), 401

    role = user.role.value if hasattr(user.role, "value") else user.role

    # Create token payload matching what verify_clerk_token expects
    payload = {
        "sub": user.clerk_id,
        "email": user.email,
        "name": user.name,
        "metadata": {
            "role": role
        },
        "exp": int(time.time()) + 86400 * 7
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    
    return jsonify({
        "success": True,
        "token": token,
        "user": {
            "id": user.clerk_id,
            "name": user.name,
            "email": user.email,
            "role": role
        }
    })

@auth_bp.route("/api/users", methods=["GET"])
@role_required("invigilator")
def get_users():
    """Get all users."""
    users = User.query.all()
    return jsonify([u.to_dict() for u in users])

@auth_bp.route("/api/users", methods=["POST"])
@role_required("invigilator")
def create_user():
    """Create a new user."""
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")
    
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "User already exists"}), 400
        
    from werkzeug.security import generate_password_hash
    clerk_id = f"custom_{email}"
    user = User(
        clerk_id=clerk_id, 
        email=email, 
        name=data.get("name", email.split('@')[0]), 
        role=data.get("role", "student"),
        password_hash=generate_password_hash(password)
    )
    db.session.add(user)
    db.session.commit()
    return jsonify(user.to_dict()), 201

@auth_bp.route("/api/users/<int:user_id>", methods=["DELETE"])
@role_required("invigilator")
def delete_user(user_id):
    """Delete a user."""
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    db.session.delete(user)
    db.session.commit()
    return jsonify({"success": True})

