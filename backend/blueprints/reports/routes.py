from flask import Blueprint, jsonify, send_file, current_app
from models.session import ExamSession
from models.exam import Exam
from models.user import User
from utils.report_generator import generate_report, generate_report_pdf
from utils.auth_helpers import role_required
import os
import zipfile
import io

reports_bp = Blueprint("reports", __name__)

@reports_bp.route("/api/reports/<int:exam_id>", methods=["GET"])
@role_required("admin", "invigilator")
def get_exam_reports(exam_id):
    """Get all session reports for a specific exam."""
    sessions = ExamSession.query.filter_by(exam_id=exam_id).all()
    results = []
    for s in sessions:
        student = User.query.get(s.student_id)
        status_val = s.status.value if hasattr(s.status, 'value') else s.status
        results.append({
            "session_id": s.id,
            "student_id": s.student_id,
            "student_name": student.name if student else "Unknown",
            "suspicion_index": s.suspicion_index,
            "risk_level": "High" if s.suspicion_index > 70 else "Medium" if s.suspicion_index >= 30 else "Low",
            "anomalies_count": len(s.events),
            "status": status_val,
            "report_url": f"/api/reports/download/{s.id}"
        })
    return jsonify(results)

@reports_bp.route("/api/reports/generate/<int:session_id>", methods=["GET"])
@role_required("admin", "invigilator")
def generate_session_report(session_id):
    """Trigger report generation for a session."""
    try:
        generate_report(session_id)
        generate_report_pdf(session_id)
        return jsonify({"message": "Report generated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@reports_bp.route("/api/reports/download/<int:session_id>", methods=["GET"])
@role_required("admin", "invigilator")
def download_report(session_id):
    """Download the PDF report for a session."""
    session = ExamSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
        
    # In a real app, we'd check if file exists, if not generate it
    # For now, let's assume generate_report_pdf returns the path
    try:
        pdf_path = generate_report_pdf(session_id)
        # Ensure path is absolute for send_file if needed, but relative usually works from root
        return send_file(os.path.abspath(pdf_path), as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@reports_bp.route("/api/reports/download/exam/<int:exam_id>", methods=["GET"])
@role_required("admin", "invigilator")
def download_exam_reports(exam_id):
    """Export all session reports for an exam into a ZIP file."""
    exam = Exam.query.get(exam_id)
    if not exam:
        return jsonify({"error": "Exam not found"}), 404
        
    sessions = ExamSession.query.filter_by(exam_id=exam_id, status="completed").all()
    if not sessions:
        return jsonify({"error": "No completed sessions found for this exam"}), 404
        
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w') as zf:
        for s in sessions:
            try:
                # Ensure PDF exists or generate it
                pdf_path = generate_report_pdf(s.id)
                # Ensure the path is relative to the root for better zipping or just use the basename
                if os.path.exists(pdf_path):
                    student = User.query.get(s.student_id)
                    student_name = student.name.replace(" ", "_") if student else f"student_{s.student_id}"
                    zip_filename = f"report_{s.id}_{student_name}.pdf"
                    zf.write(pdf_path, zip_filename)
            except Exception as e:
                current_app.logger.error(f"Failed to include report for session {s.id}: {str(e)}")
                continue
                
    memory_file.seek(0)
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f"exam_{exam_id}_reports.zip"
    )
