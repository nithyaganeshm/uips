from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
import logging

# Configure logging
logger = logging.getLogger(__name__)

from database.db import db
from models.session import ExamSession
from models.event import SuspicionEvent
from models.user import User
from utils.auth_helpers import role_required

from ml.inference import run_inference, save_inference_result
from extensions import socketio

monitor_bp = Blueprint("monitor", __name__)


@monitor_bp.route("/api/monitor/live", methods=["GET"])
@role_required("invigilator")
def live_sessions():
    """All ongoing and completed ExamSession values for active exams."""
    sessions = ExamSession.query.filter(ExamSession.status.in_(["ongoing", "completed"])).all()
    results = []
    for s in sessions:
        student = User.query.get(s.student_id)
        results.append({
            "session_id": s.id,
            "student_id": s.student_id,
            "student_name": student.name if student else "Unknown",
            "exam_id": s.exam_id,
            "suspicion_index": s.suspicion_index,
            "status": s.status.value if hasattr(s.status, "value") else s.status
        })
    return jsonify(results)


@monitor_bp.route("/api/monitor/analyse/<int:session_id>", methods=["POST"])
@role_required("invigilator")
def analyse_session(session_id):
    """Call run_inference, save result, emit update via SocketIO."""
    session = ExamSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    try:
        # 1. Run ML inference (returns dict)
        result = run_inference(session_id)
        
        # 2. Save results and generate events via centralized helper
        save_inference_result(session_id, result)
        
        # 3. Fetch updated session to ensure we have current DB state
        db.session.refresh(session)

        # 4. Emit real-time update
        try:
            socketio.emit(
                "score_update",
                {
                    "session_id": session_id,
                    "suspicion_index": session.suspicion_index,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "anomalies": result.get("anomalies", [])
                },
                room="invigilators"
            )
        except Exception as e:
            print(f"[SOCKET] Emit failed: {e}")

        return jsonify({
            "status": "success",
            "suspicion_index": session.suspicion_index,
            "result": result
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500


@monitor_bp.route("/api/monitor/<int:student_id>/alerts", methods=["GET"])
@role_required("invigilator")
def student_alerts(student_id):
    """All SuspicionEvents for student, DESC limited to 50."""
    sessions = ExamSession.query.filter_by(student_id=student_id).all()
    session_ids = [s.id for s in sessions]
    if not session_ids:
        return jsonify([])

    events = SuspicionEvent.query.filter(
        SuspicionEvent.session_id.in_(session_ids)
    ).order_by(SuspicionEvent.timestamp.desc()).limit(50).all()

    return jsonify([e.to_dict() for e in events])


@monitor_bp.route("/api/monitor/session/<int:session_id>/status", methods=["PATCH"])
@role_required("invigilator")
def update_session_status(session_id):
    """Invigilator can force end or resume an exam."""
    data = request.get_json()
    new_status = data.get("status")
    if not new_status:
        return jsonify({"error": "Status is required"}), 400

    session = ExamSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    if new_status == 'completed':
        session.status = 'completed'
    else:
        return jsonify({"error": "Invalid status or operation not permitted"}), 400

    db.session.commit()

    try:
        payload = {
            "session_id": session_id,
            "status": new_status,
            "student_id": session.student_id,
            "action": "force_status_update"
        }
        # Emit to students so the student's exam page detects force-end
        socketio.emit("session_status_update", payload, room="students")
        # Also emit to invigilators so dashboard updates
        socketio.emit("session_status_update", payload, room="invigilators")
    except NameError:
        pass

    return jsonify({"message": f"Session status updated to {new_status}"})

@monitor_bp.route("/api/sessions/<int:session_id>", methods=["GET"])
@role_required("invigilator")
def get_session_detail(session_id):
    session = ExamSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
        
    student = User.query.get(session.student_id)
    return jsonify({
        "session_id": session.id,
        "student_id": session.student_id,
        "student_name": student.name if student else "Unknown",
        "exam_id": session.exam_id,
        "suspicion_index": session.suspicion_index,
        "status": session.status.value if hasattr(session.status, "value") else session.status
    })
