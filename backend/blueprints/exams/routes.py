from datetime import datetime
from flask import Blueprint, request, jsonify

from database.db import db
from models.exam import Exam
from models.session import ExamSession
from models.event import SuspicionEvent
from models.media import MediaChunk
from utils.auth import get_current_user
from utils.auth_helpers import role_required
from utils.validators import validate_exam_mode

exams_bp = Blueprint("exams", __name__)


@exams_bp.route("/api/exams", methods=["GET"])
@role_required("invigilator", "student")
def list_exams():
    """List all exams as JSON (invigilator + student)."""
    exams = Exam.query.order_by(Exam.id.desc()).all()
    return jsonify([e.to_dict() for e in exams])


@exams_bp.route("/api/exams", methods=["POST"])
@role_required("invigilator")
def create_exam():
    """Create a new exam (invigilator)."""
    user = get_current_user()
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    title = data.get("title", "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400

    mode = data.get("mode", "online")
    if not validate_exam_mode(mode):
        return jsonify({"error": "Invalid mode. Must be online"}), 400

    exam = Exam(
        title=title,
        description=data.get("description", ""),
        created_by=user.id,
        mode=mode,
        status="scheduled",
    )
    db.session.add(exam)
    db.session.commit()

    return jsonify({"success": True, "exam": exam.to_dict()}), 201


@exams_bp.route("/api/exams/<int:exam_id>", methods=["GET"])
@role_required("invigilator", "student")
def get_exam(exam_id):
    """Get a single exam by ID."""
    exam = Exam.query.get(exam_id)
    if not exam:
        return jsonify({"error": "Exam not found"}), 404
    return jsonify(exam.to_dict())


@exams_bp.route("/api/exams/<int:exam_id>", methods=["PATCH"])
@role_required("invigilator")
def update_exam_status(exam_id):
    """Update exam status only (invigilator only)."""
    exam = Exam.query.get(exam_id)
    if not exam:
        return jsonify({"error": "Exam not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    status = data.get("status")
    if status not in ("active", "scheduled", "completed"):
        return jsonify({"error": "Invalid status"}), 400

    exam.status = status
    db.session.commit()

    return jsonify({"success": True, "exam": exam.to_dict()})


@exams_bp.route("/api/exams/<int:exam_id>", methods=["DELETE"])
@role_required("invigilator")
def delete_exam(exam_id):
    """Delete an exam (invigilator only)."""
    exam = Exam.query.get(exam_id)
    if not exam:
        return jsonify({"error": "Exam not found"}), 404

    try:
        sessions = ExamSession.query.filter_by(exam_id=exam.id).all()
        session_ids = [s.id for s in sessions]

        if session_ids:
            SuspicionEvent.query.filter(SuspicionEvent.session_id.in_(session_ids)).delete(
                synchronize_session=False
            )
            MediaChunk.query.filter(MediaChunk.session_id.in_(session_ids)).delete(
                synchronize_session=False
            )
            ExamSession.query.filter(ExamSession.id.in_(session_ids)).delete(
                synchronize_session=False
            )

        db.session.delete(exam)
        db.session.commit()
        return jsonify({"success": True, "message": "Exam deleted"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to delete exam: {str(e)}"}), 500
