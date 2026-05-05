from functools import wraps
from flask import jsonify
from utils.auth import get_current_user



def role_required(*roles):
    """Decorator that restricts access to users with specific roles.

    Usage:
        @role_required("admin")
        @role_required("admin", "invigilator")
    """

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"error": "Authentication required"}), 401

            user_role = (
                user.role.value
                if hasattr(user.role, "value")
                else user.role
            )

            if user_role not in roles:
                return (
                    jsonify({"error": "Insufficient permissions"}),
                    403,
                )

            return f(*args, **kwargs)

        return decorated_function

    return decorator
