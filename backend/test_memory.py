
from services.database import init_db, SessionLocal
from services.models import User

from agents.memory_agent import (
    create_session_context,
    get_session_context,
    append_session_message,
    update_session_context,
    delete_session_context,
    record_knowledge_gaps,
    get_knowledge_gaps,
    update_knowledge_gap,
    delete_knowledge_gap,
    get_priority_knowledge_points,
)


def main():
    init_db()

    # 1. 准备测试用户
    with SessionLocal() as db:
        user = User(
            profile={"nickname": "记忆功能测试用户"}
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id

    print("\n===== 一、短期记忆测试 =====")

    # 2. 创建面试上下文
    context = create_session_context(
        mode="408",
        user_id=user_id,
        phase="theory",
    )

    session_id = context["session_id"]
    print("创建面试：", session_id)

    # 3. 保存问题和回答
    append_session_message(
        session_id,
        "interviewer",
        "请解释 TCP 流量控制。",
    )

    append_session_message(
        session_id,
        "candidate",
        "TCP 流量控制用于控制发送方发送数据的速度。",
    )

    update_session_context(
        session_id,
        phase="project",
    )

    saved_context = get_session_context(session_id)

    assert saved_context is not None
    assert saved_context["question_count"] == 1
    assert len(saved_context["history"]) == 2
    assert saved_context["phase"] == "project"

    print("短期记忆测试成功")
    print("问题数量：", saved_context["question_count"])
    print("当前阶段：", saved_context["phase"])

    print("\n===== 二、长期记忆测试 =====")

    # 4. 模拟一次评估完成后发现的薄弱知识点
    record_knowledge_gaps(
        user_id,
        [
            "TCP 流量控制与拥塞控制的区别",
            "TCP 滑动窗口机制",
        ],
    )

    # 5. 再次发现同一个薄弱点，验证累计次数
    record_knowledge_gaps(
        user_id,
        [
            "TCP 流量控制与拥塞控制的区别",
        ],
    )

    gaps = get_knowledge_gaps(user_id)

    for gap in gaps:
        print(
            gap["knowledge_point"],
            "出现次数：",
            gap["occurrence_count"],
            "状态：",
            gap["status"],
        )

    assert any(
        gap["knowledge_point"] == "TCP 流量控制与拥塞控制的区别"
        and gap["occurrence_count"] == 2
        for gap in gaps
    )

    print("\n长期记忆累计测试成功")

    # 6. 测试优先训练知识点
    priority_points = get_priority_knowledge_points(user_id)

    print("优先训练知识点：", priority_points)

    # 7. 测试修改知识点
    target_gap = next(
        gap for gap in gaps
        if gap["knowledge_point"] == "TCP 滑动窗口机制"
    )

    updated = update_knowledge_gap(
        user_id,
        target_gap["id"],
        "TCP 滑动窗口与接收窗口",
    )

    assert updated is not None
    print("知识点修改测试成功")

    # 8. 测试删除知识点
    deleted = delete_knowledge_gap(
        user_id,
        target_gap["id"],
    )

    assert deleted is True
    print("知识点删除测试成功")

    # 9. 删除短期记忆
    assert delete_session_context(session_id) is True
    assert get_session_context(session_id) is None

    print("短期记忆删除测试成功")
    print("\n所有记忆功能测试通过！")


if __name__ == "__main__":
    main()
