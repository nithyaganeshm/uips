import enum
from datetime import datetime, timezone

from database.db import db


class ExamMode(enum.Enum):
    online = "online"


class ExamStatus(enum.Enum):
    scheduled = "scheduled"
    active = "active"
    completed = "completed"


class Exam(db.Model):
    __tablename__ = "exams"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    mode = db.Column(db.Enum(ExamMode), nullable=False, default=ExamMode.online)
    status = db.Column(
        db.Enum(ExamStatus), nullable=False, default=ExamStatus.scheduled
    )
    created_at = db.Column(
        db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    sessions = db.relationship("ExamSession", backref="exam", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "created_by": self.created_by,
            "mode": self.mode.value if isinstance(self.mode, ExamMode) else self.mode,
            "status": (
                self.status.value
                if isinstance(self.status, ExamStatus)
                else self.status
            ),
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None
        }
