from flask_socketio import join_room, leave_room, emit
from flask import request
from utils.auth import verify_clerk_token
from models.user import User

def get_socket_user(auth=None):
    # 1. Try auth object from handshake (most reliable)
    token = None
    if auth:
        token = auth.get('token')
        
    # 2. Try query params
    if not token:
        token = request.args.get('token')
    
    # 3. Try Authorization Header
    if not token:
        auth_header = request.environ.get('HTTP_AUTHORIZATION')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            
    if not token:
        return None
        
    claims = verify_clerk_token(token)
    if not claims:
        return None
        
    return User.query.filter_by(clerk_id=claims.get('sub')).first()

def register_socket_events(socketio):
    """Register all SocketIO event handlers."""

    @socketio.on("connect")
    def handle_connect(auth=None):
        """On connect, join a room based on user role."""
        print(f"[WS] New connection attempt. Auth: {auth}, Args: {request.args}")
        current_user = get_socket_user(auth)
        if current_user:
            user_role = (
                current_user.role.value
                if hasattr(current_user.role, "value")
                else current_user.role
            )
            print(f"[WS] Auth success: {current_user.email} (Role: {user_role})")
            if user_role == "invigilator":
                join_room("invigilators")
                print(f"[WS] {current_user.name} joined 'invigilators' room")
            else:
                join_room("students")
                print(f"[WS] {current_user.name} joined 'students' room")

            emit("connected", {
                "message": f"Welcome, {current_user.name}",
                "role": user_role,
            })
        else:
            print("[WS] Auth failed: Anonymous user connected")
            emit("connected", {"message": "Connected (unauthenticated)"})

    @socketio.on("disconnect")
    def handle_disconnect():
        """Log disconnection."""
        current_user = get_socket_user()
        if current_user:
            print(f"[WS] {current_user.name} disconnected")
        else:
            print("[WS] Anonymous user disconnected")

    @socketio.on("join_exam")
    def handle_join_exam(data):
        """Join a specific exam room for real-time monitoring."""
        exam_id = data.get("exam_id")
        if not exam_id:
            emit("error", {"message": "exam_id is required"})
            return

        room_name = f"exam_{exam_id}"
        join_room(room_name)

        current_user = get_socket_user()
        user_name = current_user.name if current_user else "Anonymous"
        print(f"[WS] {user_name} joined room '{room_name}'")

        emit("joined_exam", {
            "exam_id": exam_id,
            "message": f"Joined exam room {exam_id}",
        })

        # Notify invigilators that a student joined
        if current_user:
            user_role = (
                current_user.role.value
                if hasattr(current_user.role, "value")
                else current_user.role
            )
            if user_role == "student":
                emit(
                    "student_joined",
                    {
                        "student_id": current_user.id,
                        "student_name": current_user.name,
                        "exam_id": exam_id,
                    },
                    room="invigilators",
                )

    @socketio.on("leave_exam")
    def handle_leave_exam(data):
        """Leave a specific exam room."""
        exam_id = data.get("exam_id")
        if exam_id:
            room_name = f"exam_{exam_id}"
            leave_room(room_name)
            current_user = get_socket_user()
            print(
                f"[WS] {current_user.name if current_user else 'Anonymous'} "
                f"left room '{room_name}'"
            )

    @socketio.on("suspicion_alert")
    def handle_suspicion_alert(data):
        """Broadcast a suspicion alert to invigilators."""
        exam_id = data.get("exam_id")
        if exam_id:
            emit(
                "suspicion_alert",
                {
                    "student_id": data.get("student_id"),
                    "event_type": data.get("event_type"),
                    "severity": data.get("severity"),
                    "exam_id": exam_id,
                    "message": data.get("message", "Suspicious activity detected"),
                },
                room="invigilators",
            )
