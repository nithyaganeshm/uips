import enum
from datetime import datetime, timezone

from database.db import db



class UserRole(enum.Enum):
    student = "student"
    invigilator = "invigilator"


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    clerk_id = db.Column(db.String(128), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)
    role = db.Column(db.Enum(UserRole), nullable=False, default=UserRole.student)
    created_at = db.Column(
        db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )


    # Relationships
    exams_created = db.relationship(
        "Exam", backref="creator", lazy=True, foreign_keys="Exam.created_by", cascade="all, delete-orphan"
    )
    sessions = db.relationship("ExamSession", backref="student", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role.value if isinstance(self.role, UserRole) else self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
