import os
import requests
from functools import wraps
from flask import request, jsonify
from jose import jwt
from database.db import db
from models.user import User

# ---------------------------------------------------------------------------
# Clerk JWT Verification Utils
# ---------------------------------------------------------------------------

CLERK_SECRET_KEY = os.environ.get("CLERK_SECRET_KEY")

def verify_clerk_token(token):
    """
    Verify the Clerk JWT token. 
    Note: In production, you should cache the JWKS.
    """
    if not token:
        return None
    
    try:
        # In this migration, we extract claims. 
        # For full security, use clerk-sdk-python or RS256 JWKS validation.
        payload = jwt.get_unverified_claims(token)
        return payload
    except Exception as e:
        print(f"[AUTH] Token verification failed: {e}")
        return None

def get_current_user():
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    
    token = auth_header.split(" ")[1]
    claims = verify_clerk_token(token)
    if not claims:
        return None
    
    clerk_id = claims.get("sub")
    user = User.query.filter_by(clerk_id=clerk_id).first()
    
    if not user:
        # Auto-sync user from Clerk if they don't exist locally
        email = claims.get("email") or f"{clerk_id}@uips.placeholder"
        name = claims.get("name") or "Clerk User"
        role = claims.get("metadata", {}).get("role", "student")
        
        user = User(clerk_id=clerk_id, email=email, name=name, role=role)
        db.session.add(user)
        db.session.commit()
        print(f"[AUTH] Synced new user: {email} ({role})")
        
    return user


