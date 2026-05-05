from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from utils.auth import get_current_user
from database.db import db
from models.session import ExamSession
from models.exam import Exam
from utils.auth_helpers import role_required

from utils.report_generator import generate_report
from extensions import socketio

session_bp = Blueprint("session", __name__)

import sys

if '__main__' in sys.modules and hasattr(sys.modules['__main__'], 'limiter'):
    limiter = sys.modules['__main__'].limiter
else:
    try:
        from app import limiter
    except ImportError:
        class DummyLimiter:
            def limit(self, *args, **kwargs):
                def decorator(f):
                    return f
                return decorator
        limiter = DummyLimiter()

@session_bp.route("/api/session/start", methods=["POST"])
@role_required("student")
def start_session():
    """Start an exam session."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    exam_id = data.get("exam_id")
    if not exam_id:
        return jsonify({"error": "exam_id is required"}), 400

    exam = Exam.query.get(exam_id)
    if not exam:
        return jsonify({"error": "Exam not found"}), 404

    ex_status = exam.status.value if hasattr(exam.status, "value") else exam.status
    if ex_status != "active":
        return jsonify({"error": "Exam is not active"}), 400

    existing = ExamSession.query.filter_by(
        exam_id=exam_id, student_id=get_current_user().id
    ).first()
    
    if existing:
        if existing.status == 'completed':
            return jsonify({"error": "You have already completed this exam."}), 400
            
        # If already ongoing, allow rejoining (e.g., after a refresh)
        return jsonify({
            "session_id": existing.id,
            "exam_id": exam_id,
            "resumed": True
        }), 200

    session = ExamSession(
        exam_id=exam_id,
        student_id=get_current_user().id,
        status="ongoing",
    )
    db.session.add(session)
    db.session.commit()

    return jsonify({
        "session_id": session.id,
        "exam_id": exam_id
    }), 201


@session_bp.route("/api/session/end", methods=["POST"])
@role_required("student")
def end_session():
    """End an exam session and generate report."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    session_id = data.get("session_id")
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = ExamSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    if session.student_id != get_current_user().id:
        return jsonify({"error": "Access denied"}), 403

    session.status = "completed"
    db.session.commit()

    generate_report(session.id)

    return jsonify({
        "session_id": session.id,
        "suspicion_index": session.suspicion_index,
        "status": session.status.value if hasattr(session.status, "value") else session.status
    })


@session_bp.route("/api/session/my", methods=["GET"])
@role_required("student")
def my_sessions():
    """Get all sessions for current student."""
    sessions = ExamSession.query.filter_by(
        student_id=get_current_user().id
    ).order_by(ExamSession.id.desc()).all()
    return jsonify([s.to_dict() for s in sessions])


@session_bp.route("/api/session/stream/behavior", methods=["POST"])
@role_required("student")
@limiter.limit("20 per second")
def stream_behavior():
    """Upload behavior logs."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    session_id = data.get("session_id")
    event_type = data.get("event_type")
    timestamp = data.get("timestamp")

    if not session_id or not event_type:
        return jsonify({"error": "session_id and event_type are required"}), 400

    session = ExamSession.query.get(session_id)
    if not session or session.student_id != get_current_user().id:
        return jsonify({"error": "Access denied or session not found"}), 403

    sess_status = session.status.value if hasattr(session.status, "value") else session.status
    if sess_status != "ongoing":
        return jsonify({"error": "Session is not ongoing"}), 400

    from models.event import SuspicionEvent, Severity
    
    severity_level = data.get("severity", "medium")
    severity = Severity.high if severity_level == "high" else Severity.low if severity_level == "low" else Severity.medium
    
    score_delta = 20.0 if severity == Severity.high else 10.0 if severity == Severity.medium else 5.0
    
    event = SuspicionEvent(
        session_id=session.id,
        event_type=event_type,
        severity=severity,
        score_delta=score_delta
    )
    db.session.add(event)
    
    session.suspicion_index = min(100.0, session.suspicion_index + score_delta)
    db.session.commit()

    try:
        from models.user import User
        student = User.query.get(session.student_id)
        socketio.emit(
            "score_update",
            {
                "session_id": session.id,
                "suspicion_index": session.suspicion_index,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "anomalies": []
            },
            room="invigilators"
        )
        socketio.emit(
            "alert",
            {
                "student_name": student.name if student else "Unknown",
                "type": event_type,
                "severity": severity.value if hasattr(severity, "value") else severity,
            },
            room="invigilators"
        )
    except Exception as e:
        print("SocketIO emit error:", e)

    return jsonify({"logged": True})


@session_bp.route("/api/session/ml-analysis", methods=["POST"])
@role_required("student")
def ml_analysis():
    """Run ML inference on session data and return integrity scores."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    session_id = data.get("session_id")
    frame_b64 = data.get("frame") # Expecting base64 string
    
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = ExamSession.query.get(session_id)
    if not session or session.student_id != get_current_user().id:
        return jsonify({"error": "Access denied or session not found"}), 403

    try:
        import base64
        import numpy as np
        import cv2
        from ml.inference import run_inference
        
        img_data = None
        if frame_b64:
            # Decode base64 image
            try:
                if "," in frame_b64:
                    frame_b64 = frame_b64.split(",")[1]
                img_bytes = base64.b64decode(frame_b64)
                nparr = np.frombuffer(img_bytes, np.uint8)
                img_data = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if img_data is not None:
                    img_data = cv2.cvtColor(img_data, cv2.COLOR_BGR2RGB)
            except Exception as decode_err:
                print(f"Base64 decode error: {decode_err}")

        # Run actual inference
        result = run_inference(session_id, img_data=img_data)
        
        # Save results to DB (this creates suspicion events and updates index)
        from ml.inference import save_inference_result
        save_inference_result(session_id, result)
        
        # Emit real-time updates to invigilators via WebSocket
        try:
            from models.user import User
            
            # Broadcast the updated integrity scores
            print(f"[WS] Emitting score_update for session {session_id}: {result.get('suspicion_index')}")
            socketio.emit(
                "score_update",
                {
                    "session_id": session_id,
                    "suspicion_index": result.get("suspicion_index", 0.0),
                    "visual_risk": result.get("visual_risk", 0.0),
                    "behavior_risk": result.get("behavior_risk", 0.0),
                    "face_detected": result.get("face_detected", False),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "anomalies": result.get("anomalies", [])
                },
                room="invigilators"
            )
            
            # If high risk or specific anomalies, broadcast an alert
            risk_level = result.get("risk_level", "low")
            if risk_level in ["high", "medium"] or not result.get("face_detected"):
                student = User.query.get(session.student_id)
                print(f"[WS] Emitting alert for session {session_id}: {risk_level}")
                socketio.emit(
                    "alert",
                    {
                        "student_name": student.name if student else "Unknown",
                        "type": "Visual Deviation" if result.get("face_detected") else "Face Missing",
                        "severity": risk_level,
                        "session_id": session_id
                    },
                    room="invigilators"
                )
        except Exception as socket_err:
            print(f"Socket emit error in ml_analysis: {socket_err}")

        # Map to frontend expected format
        return jsonify({
            "audio_risk": result.get("audio_risk", 0.0),
            "visual_risk": result.get("visual_risk", 0.0),
            "behavior_risk": result.get("behavior_risk", result.get("suspicion_index", 0.0)),
            "integrity_score": 100 - result.get("suspicion_index", 0.0),
            "risk_level": result.get("risk_level", "low"),
            "face_detected": result.get("face_detected", False),
            "face_count": result.get("face_count", 0),
            "anomalies": result.get("anomalies", [])
        })

    except Exception as e:
        print(f"ML Analysis error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "audio_risk": 0,
            "visual_risk": 0,
            "behavior_risk": 0,
            "integrity_score": 100,
            "face_detected": True,
            "face_count": 1,
            "anomalies": []
        })


@session_bp.route("/api/session/submit-exam-analysis", methods=["POST"])
@role_required("student")
def submit_exam_analysis():
    """Submit exam answers and ML analysis scores, finalizing the session."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    session_id = data.get("session_id")
    answers = data.get("answers", {})
    score = data.get("score", 0)
    ml_analysis = data.get("ml_analysis", {})

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = ExamSession.query.get(session_id)
    if not session or session.student_id != get_current_user().id:
        return jsonify({"error": "Access denied or session not found"}), 403

    # Update session with exam results
    session.answers = answers
    session.score = float(score)
    session.audio_risk = float(ml_analysis.get("audio_risk", 0))
    session.visual_risk = float(ml_analysis.get("visual_risk", 0))
    session.behavior_risk = float(ml_analysis.get("behavior_risk", 0))
    session.integrity_score = float(ml_analysis.get("integrity_score", 100))

    # Mark session as completed
    session.status = "completed"

    try:
        db.session.commit()

        # Generate report for completed session
        generate_report(session.id)

        return jsonify({
            "success": True,
            "session_id": session.id,
            "message": "Exam completed and analysis saved"
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error saving exam analysis: {e}")
        return jsonify({"error": "Failed to save exam analysis"}), 500
