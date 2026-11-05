
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from services.database import SessionLocal
from services.models import KnowledgeGap


# =========================================================
# 一、短期记忆：保存在当前后端进程的内存中
# =========================================================

# session_id -> 当前面试上下文
session_contexts: dict[str, dict[str, Any]] = {}


def create_session_context(
    mode: str,
    user_id: int,
    phase: str = "intro",
) -> dict:
    """创建一场面试的短期记忆。"""

    session_id = str(uuid4())

    context = {
        "session_id": session_id,
        "user_id": user_id,
        "mode": mode,
        "phase": phase,
        "question_count": 0,
        "history": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    session_contexts[session_id] = context

    return context


def get_session_context(session_id: str) -> dict | None:
    """读取一场面试的短期记忆。"""

    return session_contexts.get(session_id)


def update_session_context(
    session_id: str,
    phase: str | None = None,
) -> dict:
    """更新当前面试阶段。"""

    context = session_contexts.get(session_id)

    if context is None:
        raise ValueError("面试会话不存在或短期记忆已失效")

    if phase is not None:
        context["phase"] = phase

    return context


def append_session_message(
    session_id: str,
    role: str,
    content: str,
) -> dict:
    """向短期记忆追加考官问题或候选人回答。"""

    context = session_contexts.get(session_id)

    if context is None:
        raise ValueError("面试会话不存在或短期记忆已失效")

    if role not in {"interviewer", "candidate"}:
        raise ValueError("role 只能是 interviewer 或 candidate")

    context["history"].append({
        "role": role,
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    if role == "interviewer":
        context["question_count"] += 1

    return context


def delete_session_context(session_id: str) -> bool:
    """删除一场面试的短期记忆。"""

    return session_contexts.pop(session_id, None) is not None


# =========================================================
# 二、长期记忆：将薄弱知识点保存到 SQLite
# =========================================================

def record_knowledge_gaps(
    user_id: int,
    knowledge_points: list[str],
) -> list[dict]:
    """
    记录评估发现的薄弱知识点。

    已存在的知识点：出现次数加 1。
    新知识点：创建记录。
    注意：应在回答评估完成后调用本函数。
    """

    normalized_points = list(dict.fromkeys(
        point.strip()
        for point in knowledge_points
        if isinstance(point, str) and point.strip()
    ))

    if not normalized_points:
        return []

    results = []

    with SessionLocal() as db:
        try:
            for point in normalized_points:
                statement = select(KnowledgeGap).where(
                    KnowledgeGap.user_id == user_id,
                    KnowledgeGap.knowledge_point == point,
                )

                gap = db.scalar(statement)

                if gap is None:
                    gap = KnowledgeGap(
                        user_id=user_id,
                        knowledge_point=point,
                        occurrence_count=1,
                    )
                    db.add(gap)
                else:
                    gap.occurrence_count += 1
                    gap.last_missed_at = datetime.now(
                        timezone.utc
                    ).replace(tzinfo=None)

                db.flush()

                results.append({
                    "id": gap.id,
                    "knowledge_point": gap.knowledge_point,
                    "occurrence_count": gap.occurrence_count,
                })

            db.commit()
            return results

        except Exception:
            db.rollback()
            raise


def get_knowledge_gaps(user_id: int) -> list[dict]:
    """查询某个用户的全部薄弱知识点。"""

    with SessionLocal() as db:
        statement = (
            select(KnowledgeGap)
            .where(KnowledgeGap.user_id == user_id)
            .order_by(
                KnowledgeGap.occurrence_count.desc(),
                KnowledgeGap.last_missed_at.desc(),
            )
        )

        gaps = db.scalars(statement).all()

        return [
            {
                "id": gap.id,
                "user_id": gap.user_id,
                "knowledge_point": gap.knowledge_point,
                "occurrence_count": gap.occurrence_count,
                "last_missed_at": gap.last_missed_at.isoformat(),
                "status": (
                    "需要重点训练"
                    if gap.occurrence_count >= 3
                    else "需要继续训练"
                ),
            }
            for gap in gaps
        ]


def update_knowledge_gap(
    user_id: int,
    gap_id: int,
    knowledge_point: str,
) -> dict | None:
    """修改用户档案中的知识点名称。"""

    knowledge_point = knowledge_point.strip()

    if not knowledge_point:
        raise ValueError("知识点名称不能为空")

    with SessionLocal() as db:
        try:
            gap = db.scalar(
                select(KnowledgeGap).where(
                    KnowledgeGap.id == gap_id,
                    KnowledgeGap.user_id == user_id,
                )
            )

            if gap is None:
                return None

            # 防止同一用户出现重复知识点
            duplicate = db.scalar(
                select(KnowledgeGap).where(
                    KnowledgeGap.user_id == user_id,
                    KnowledgeGap.knowledge_point == knowledge_point,
                    KnowledgeGap.id != gap_id,
                )
            )

            if duplicate is not None:
                raise ValueError("该知识点已经存在，不能重复添加")

            gap.knowledge_point = knowledge_point
            db.commit()
            db.refresh(gap)

            return {
                "id": gap.id,
                "knowledge_point": gap.knowledge_point,
                "occurrence_count": gap.occurrence_count,
            }

        except Exception:
            db.rollback()
            raise


def delete_knowledge_gap(user_id: int, gap_id: int) -> bool:
    """删除指定用户的一条薄弱知识点记录。"""

    with SessionLocal() as db:
        gap = db.scalar(
            select(KnowledgeGap).where(
                KnowledgeGap.id == gap_id,
                KnowledgeGap.user_id == user_id,
            )
        )

        if gap is None:
            return False

        db.delete(gap)
        db.commit()
        return True


def get_priority_knowledge_points(
    user_id: int,
    limit: int = 5,
) -> list[str]:
    """按照重复失分次数获取优先训练的知识点。"""

    gaps = get_knowledge_gaps(user_id)

    return [
        item["knowledge_point"]
        for item in gaps[:limit]
    ]
