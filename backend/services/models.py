
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Float,
    String,
    Text,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from services.database import Base


def current_time() -> datetime:
    """返回当前 UTC 时间。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    """用户表。"""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=current_time, nullable=False
    )
    profile: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    sessions: Mapped[list["InterviewSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    knowledge_gaps: Mapped[list["KnowledgeGap"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class InterviewSession(Base):
    """面试场次表。"""
    __tablename__ = "interview_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    mode: Mapped[str] = mapped_column(String(30), nullable=False)
    phase: Mapped[str] = mapped_column(
        String(30), default="intro", nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime, default=current_time, nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="sessions")
    messages: Mapped[list["InterviewMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    evaluations: Mapped[list["Evaluation"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    reports: Mapped[list["InterviewReport"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class InterviewMessage(Base):
    """面试对话表。每条记录存储一道问题或一条回答。"""
    __tablename__ = "interview_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("interview_sessions.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=current_time, nullable=False
    )

    session: Mapped["InterviewSession"] = relationship(
        back_populates="messages"
    )
    question_evaluations: Mapped[list["Evaluation"]] = relationship(
        back_populates="question_message",
        foreign_keys="Evaluation.question_message_id",
    )
    answer_evaluations: Mapped[list["Evaluation"]] = relationship(
        back_populates="answer_message",
        foreign_keys="Evaluation.answer_message_id",
    )


class Evaluation(Base):
    """单题面试评价表。"""
    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("interview_sessions.id"), nullable=False, index=True
    )
    question_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("interview_messages.id"), nullable=True
    )
    answer_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("interview_messages.id"), nullable=True
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    dimension_scores: Mapped[dict] = mapped_column(
        JSON, default=dict, nullable=False
    )
    missed_points: Mapped[list] = mapped_column(
        JSON, default=list, nullable=False
    )
    evidence: Mapped[list] = mapped_column(
        JSON, default=list, nullable=False
    )
    feedback: Mapped[str] = mapped_column(
        Text, default="", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=current_time, nullable=False
    )

    session: Mapped["InterviewSession"] = relationship(
        back_populates="evaluations"
    )
    question_message: Mapped["InterviewMessage | None"] = relationship(
        back_populates="question_evaluations",
        foreign_keys=[question_message_id],
    )
    answer_message: Mapped["InterviewMessage | None"] = relationship(
        back_populates="answer_evaluations",
        foreign_keys=[answer_message_id],
    )


class KnowledgeGap(Base):
    """用户长期薄弱知识点表。"""
    __tablename__ = "knowledge_gaps"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "knowledge_point",
            name="uq_user_knowledge_point",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    knowledge_point: Mapped[str] = mapped_column(
        String(200), nullable=False
    )
    occurrence_count: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )
    last_missed_at: Mapped[datetime] = mapped_column(
        DateTime, default=current_time, nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="knowledge_gaps")


class VideoReportTask(Base):
    """视频面试结束后的异步报告任务状态。"""
    __tablename__ = "video_report_tasks"

    session_id: Mapped[str] = mapped_column(
        ForeignKey("interview_sessions.id"),
        primary_key=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False
    )
    error: Mapped[str] = mapped_column(
        Text, default="", nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=current_time, onupdate=current_time, nullable=False
    )


class InterviewReport(Base):
    """面试复盘报告表。"""
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("interview_sessions.id"), nullable=False, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=current_time, nullable=False
    )

    session: Mapped["InterviewSession"] = relationship(
        back_populates="reports"
    )
