
from uuid import uuid4

from sqlalchemy import select

from services.database import SessionLocal, init_db
from services.models import User, InterviewSession


def main():
    init_db()

    with SessionLocal() as db:
        # 创建测试用户
        user = User(
            profile={
                "nickname": "数据库测试用户",
                "target": "408考研复试",
            }
        )
        db.add(user)
        db.flush()

        # 创建一场测试面试
        session = InterviewSession(
            id=str(uuid4()),
            user_id=user.id,
            mode="408",
            phase="intro",
        )
        db.add(session)
        db.commit()

        user_id = user.id
        session_id = session.id

    # 重新查询，验证数据已经持久化
    with SessionLocal() as db:
        saved_user = db.get(User, user_id)
        saved_session = db.get(InterviewSession, session_id)

        assert saved_user is not None
        assert saved_session is not None

        print("写入和读取测试成功")
        print("用户 ID：", saved_user.id)
        print("面试 ID：", saved_session.id)
        print("面试模式：", saved_session.mode)


if __name__ == "__main__":
    main()
