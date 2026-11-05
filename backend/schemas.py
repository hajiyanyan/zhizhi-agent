
from typing import Literal
from pydantic import BaseModel, Field


InterviewMode = Literal["408", "data_analyst"]


class StartInterviewRequest(BaseModel):
    mode: InterviewMode
    material: str = ""
    pressure_mode: bool = False
    max_questions: int = Field(default=8, ge=3, le=30)


class AnswerRequest(BaseModel):
    session_id: str
    answer: str = Field(min_length=1, max_length=10000)


class InterviewMessage(BaseModel):
    role: Literal["interviewer", "candidate"]
    content: str


class EvaluationResult(BaseModel):
    score: float = Field(ge=0, le=100)
    strengths: list[str]
    weaknesses: list[str]
    knowledge_gaps: list[str]
    evidence: list[str] = []
    feedback: str


class InterviewResponse(BaseModel):
    session_id: str
    phase: str
    question: str
    finished: bool = False
