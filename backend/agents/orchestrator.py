
from enum import Enum


class InterviewPhase(str, Enum):
    INTRO = "intro"
    THEORY = "theory"
    PROJECT = "project"
    PRESSURE = "pressure"
    QUESTIONS = "questions"
    REVIEW = "review"
    FINISHED = "finished"


PHASE_ORDER = {
    InterviewPhase.INTRO: InterviewPhase.THEORY,
    InterviewPhase.THEORY: InterviewPhase.PROJECT,
    InterviewPhase.PROJECT: InterviewPhase.PRESSURE,
    InterviewPhase.PRESSURE: InterviewPhase.QUESTIONS,
    InterviewPhase.QUESTIONS: InterviewPhase.REVIEW,
    InterviewPhase.REVIEW: InterviewPhase.FINISHED,
}


def next_phase(
    current: InterviewPhase,
    pressure_mode: bool = True,
) -> InterviewPhase:
    if current == InterviewPhase.PROJECT and not pressure_mode:
        return InterviewPhase.QUESTIONS

    return PHASE_ORDER.get(
        current,
        InterviewPhase.FINISHED,
    )
