import json
import re
import time
from typing import Literal


from io import BytesIO
from datetime import datetime
from contextlib import asynccontextmanager
from starlette.concurrency import run_in_threadpool

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from fastapi.responses import StreamingResponse

from agents.knowledge_agent import answer_knowledge
# from agents.parser_agent import parse_material
from agents.interviewer_agent import generate_question
from agents.evaluator_agent import evaluate_all_answers
from agents.report_agent import generate_report
from agents.interviewer_agent import generate_question_stream


from agents.memory_agent import (
    create_session_context,
    get_session_context,
    update_session_context,
    append_session_message,
    record_knowledge_gaps,
    get_knowledge_gaps,
    update_knowledge_gap,
    delete_knowledge_gap,
    get_priority_knowledge_points,
)

from services.database import SessionLocal, init_db
from services.models import (
    User,
    InterviewSession,
    InterviewMessage,
    Evaluation,
    InterviewReport,
)

def sse_event(event: str, data: dict) -> str:
    return (
        f"event: {event}\n"
        f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    )
# =========================================================
# 一、请求数据模型
# =========================================================

# 当前产品仅支持计算机考研 408 复试
InterviewMode = Literal["408"]


class KnowledgeQueryRequest(BaseModel):
    mode: InterviewMode
    question: str = Field(min_length=1, max_length=10000)


class StartInterviewRequest(BaseModel):
    mode: InterviewMode
    user_id: int | None = None
    material: str = ""
    pressure_mode: bool = False
    max_questions: int = Field(default=8, ge=3, le=30)


class AnswerRequest(BaseModel):
    session_id: str
    answer: str = Field(min_length=1, max_length=10000)


class UpdateKnowledgeRequest(BaseModel):
    knowledge_point: str = Field(min_length=1, max_length=200)


# =========================================================
# 二、应用初始化
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("正在初始化数据库...", flush=True)

    await run_in_threadpool(init_db)

    print("数据库初始化成功！", flush=True)

    yield


app = FastAPI(
    title="职智 Agent",
    description="面向计算机考研 408 复试的个性化 AI 模拟面试平台",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




@app.get("/")
async def root():
    return {
        "name": "职智 Agent",
        "status": "running",
        "message": "后端服务启动成功",
    }


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "zhizhi-agent-backend",
    }


# =========================================================
# 三、简历上传：支持 Word / PDF / TXT / MD
# =========================================================

MAX_RESUME_SIZE = 10 * 1024 * 1024
MAX_RESUME_TEXT_LENGTH = 50000


@app.post("/api/resume/upload")
async def upload_resume(file: UploadFile = File(...)):
    """
    上传并提取简历文字。

    支持：
    DOCX、PDF、TXT、MD
    """

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="请提供有效的文件名",
        )

    filename = file.filename
    suffix = filename.lower().rsplit(".", 1)[-1]

    allowed_extensions = {"docx", "pdf", "txt", "md"}

    if suffix not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="不支持该文件格式，请上传 DOCX、PDF、TXT 或 MD 文件",
        )

    try:
        content = await file.read(MAX_RESUME_SIZE + 1)

        if not content:
            raise HTTPException(
                status_code=400,
                detail="上传的文件为空",
            )

        if len(content) > MAX_RESUME_SIZE:
            raise HTTPException(
                status_code=413,
                detail="简历文件不能超过 10 MB",
            )

        extracted_text = ""

        # TXT / MD
        if suffix in {"txt", "md"}:
            try:
                extracted_text = content.decode("utf-8-sig")
            except UnicodeDecodeError:
                extracted_text = content.decode(
                    "gb18030",
                    errors="replace",
                )

        # DOCX
        elif suffix == "docx":
            from docx import Document

            document = Document(BytesIO(content))
            text_parts = []

            for paragraph in document.paragraphs:
                text = paragraph.text.strip()
                if text:
                    text_parts.append(text)

            for table in document.tables:
                for row in table.rows:
                    cells = [
                        cell.text.strip().replace("\n", " ")
                        for cell in row.cells
                    ]

                    row_text = " | ".join(
                        cell for cell in cells if cell
                    )

                    if row_text:
                        text_parts.append(row_text)

            extracted_text = "\n".join(text_parts)

        # PDF
        elif suffix == "pdf":
            from pypdf import PdfReader

            reader = PdfReader(BytesIO(content))

            if reader.is_encrypted:
                raise HTTPException(
                    status_code=400,
                    detail="该 PDF 已加密，请先解除密码保护后再上传",
                )

            if len(reader.pages) > 100:
                raise HTTPException(
                    status_code=400,
                    detail="PDF 页数过多，请控制在 100 页以内",
                )

            text_parts = []

            for page in reader.pages:
                page_text = page.extract_text() or ""

                if page_text.strip():
                    text_parts.append(page_text.strip())

            extracted_text = "\n".join(text_parts)

        # 清理文本
        extracted_text = re.sub(
            r"\n{3,}",
            "\n\n",
            extracted_text,
        ).strip()

        if not extracted_text:
            raise HTTPException(
                status_code=400,
                detail=(
                    "没有从文件中提取到文字。"
                    "如果这是扫描版 PDF，请先进行 OCR 文字识别。"
                ),
            )

        if len(extracted_text) > MAX_RESUME_TEXT_LENGTH:
            raise HTTPException(
                status_code=400,
                detail="简历提取文字超过 50000 字，请精简后重新上传。",
            )

        return {
            "filename": filename,
            "content": extracted_text,
            "message": "简历文字提取成功",
            "character_count": len(extracted_text),
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"简历解析失败，请检查文件是否损坏：{str(exc)}",
        )


# =========================================================
# 四、辅助函数
# =========================================================


def build_candidate_material(material: str) -> str:
    """
    快速整理候选人材料。

    启动阶段不再调用大模型解析简历，
    直接保存原始简历，交由面试官 Agent
    在生成问题时结合上下文进行分析。
    """

    raw_material = (material or "").strip()

    candidate_material = {
        "parsed_profile": {},
        "original_material": raw_material,
    }

    print(
        f"[面试启动] 简历材料整理完成，"
        f"原始文本长度：{len(raw_material)}，"
        f"跳过启动阶段的大模型简历解析",
        flush=True,
    )

    return json.dumps(
        candidate_material,
        ensure_ascii=False,
    )

    raw_material = (material or "").strip()

    if not raw_material:
        parsed_profile = {}
    else:
        start_time = time.perf_counter()

        print(
            f"[面试启动] 开始简历解析，文本长度：{len(raw_material)}",
            flush=True,
        )

        try:
            parsed_text = parse_material(raw_material)
            parsed_profile = json.loads(parsed_text)

            if not isinstance(parsed_profile, dict):
                raise ValueError("简历解析结果必须是 JSON 对象")

            elapsed = time.perf_counter() - start_time

            print(
                f"[面试启动] 简历解析完成，耗时：{elapsed:.2f} 秒",
                flush=True,
            )

        except Exception as exc:
            elapsed = time.perf_counter() - start_time

            print(
                f"[面试启动] 简历解析失败，耗时：{elapsed:.2f} 秒，原因：{exc}",
                flush=True,
            )

            raise HTTPException(
                status_code=502,
                detail=f"简历结构化解析失败：{str(exc)}",
            )

    candidate_material = {
        "parsed_profile": parsed_profile,
        "original_material": raw_material,
    }

    return json.dumps(
        candidate_material,
        ensure_ascii=False,
    )


def parse_evaluation(raw_text: str) -> dict:
    """解析并验证评估 Agent 返回的 JSON。"""

    text = raw_text.strip()

    text = re.sub(
        r"^```(?:json)?\s*|\s*```$",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()

    try:
        data = json.loads(text)

    except json.JSONDecodeError as exc:
        raise ValueError(
            f"评估 Agent 返回的内容不是有效 JSON：{exc}"
        )

    if not isinstance(data, dict):
        raise ValueError("评估结果必须是 JSON 对象")

    required_fields = [
        "score",
        "dimension_scores",
        "strengths",
        "weaknesses",
        "knowledge_gaps",
        "evidence",
        "feedback",
        "needs_review",
    ]

    missing = [
        field for field in required_fields
        if field not in data
    ]

    if missing:
        raise ValueError(
            f"评估结果缺少必要字段：{missing}"
        )

    try:
        score = float(data["score"])
    except (TypeError, ValueError):
        raise ValueError("评估总分必须是数字")

    if not 0 <= score <= 100:
        raise ValueError("评估总分必须在 0 到 100 之间")

    if not isinstance(data["dimension_scores"], dict):
        raise ValueError("dimension_scores 必须是 JSON 对象")

    for field in [
        "strengths",
        "weaknesses",
        "knowledge_gaps",
        "evidence",
    ]:
        if not isinstance(data[field], list):
            raise ValueError(f"{field} 必须是数组")

    if not isinstance(data["feedback"], str):
        raise ValueError("feedback 必须是字符串")

    if not isinstance(data["needs_review"], bool):
        raise ValueError("needs_review 必须是布尔值")

    data["score"] = score

    data["knowledge_gaps"] = list(dict.fromkeys(
        point.strip()
        for point in data["knowledge_gaps"]
        if isinstance(point, str) and point.strip()
    ))

    return data


def evaluate_finished_session(session_id: str):
    """
    面试结束后统一评估全部问答。
    只调用一次评估大模型。
    """

    with SessionLocal() as db:
        messages = db.scalars(
            select(InterviewMessage)
            .where(
                InterviewMessage.session_id == session_id
            )
            .order_by(InterviewMessage.id.asc())
        ).all()

        questions = []
        question_message_ids = []

        # 按对话顺序配对问题和回答
        current_question = None
        current_question_id = None

        for message in messages:
            if message.role == "interviewer":
                current_question = message.content
                current_question_id = message.id

            elif message.role == "candidate" and current_question:
                questions.append({
                    "question": current_question,
                    "answer": message.content,
                })

                question_message_ids.append(
                    current_question_id
                )

                current_question = None
                current_question_id = None

        if not questions:
            return {
                "total": 0,
                "average_score": 0,
                "evaluated": False,
            }

        session = db.get(InterviewSession, session_id)

        if session is None:
            raise ValueError("面试场次不存在")

        mode = session.mode
        user_id = session.user_id

    print(
        f"[整场评估] 开始统一评估，共 {len(questions)} 道题",
        flush=True,
    )

    start_time = time.perf_counter()

    # 全场只调用一次大模型
    reviews = evaluate_all_answers(
        mode=mode,
        question_answers=questions,
    )

    print(
        f"[整场评估] 完成，耗时："
        f"{time.perf_counter() - start_time:.2f} 秒",
        flush=True,
    )

    if len(reviews) != len(questions):
        raise ValueError("统一评估结果数量与面试题数量不一致")

    all_knowledge_gaps = []
    scores = []

    # 保存逐题评价
    with SessionLocal() as db:
        for index, review in enumerate(reviews):
            answer_message = db.scalar(
                select(InterviewMessage)
                .where(
                    InterviewMessage.session_id == session_id,
                    InterviewMessage.role == "candidate",
                )
                .order_by(InterviewMessage.id.asc())
                .offset(index)
                .limit(1)
            )

            if answer_message is None:
                continue

            evaluation = Evaluation(
                session_id=session_id,
                question_message_id=question_message_ids[index],
                answer_message_id=answer_message.id,
                score=review["score"],
                dimension_scores=review["dimension_scores"],
                missed_points=review["knowledge_gaps"],
                evidence=review["evidence"],
                feedback=review["feedback"],
            )

            db.add(evaluation)

            scores.append(float(review["score"]))

            if review["needs_review"]:
                all_knowledge_gaps.extend(review["knowledge_gaps"])
                all_knowledge_gaps.extend(
                    review["knowledge_gaps"]
                )

        db.commit()

    # 面试结束后统一更新长期知识记忆
    all_knowledge_gaps = list(dict.fromkeys(
        point.strip()
        for point in all_knowledge_gaps
        if isinstance(point, str) and point.strip()
    ))

    updated_gaps = []

    if user_id and all_knowledge_gaps:
        updated_gaps = record_knowledge_gaps(
            user_id=user_id,
            knowledge_points=all_knowledge_gaps,
        )

    average_score = (
        round(sum(scores) / len(scores), 2)
        if scores else 0
    )

    return {
        "total": len(reviews),
        "average_score": average_score,
        "evaluated": True,
        "memory_saved_count": len(updated_gaps),
    }


def build_question(
    mode: str,
    phase: str,
    material: str,
    history: list[dict],
    pressure_mode: bool,
    priority_points: list[str],
) -> tuple[str, str]:
    """
    结合原始简历、RAG 和长期记忆生成面试问题。
    """

    # 1. 提取原始简历和结构化资料
    original_material = ""
    profile_text = ""

    try:
        candidate_data = json.loads(material)

        if isinstance(candidate_data, dict):
            original_material = candidate_data.get(
                "original_material", ""
            )

            parsed_profile = candidate_data.get(
                "parsed_profile", {}
            )

            if isinstance(parsed_profile, dict):
                profile_text = json.dumps(
                    parsed_profile,
                    ensure_ascii=False,
                )

        else:
            original_material = str(candidate_data)

    except (json.JSONDecodeError, TypeError):
        original_material = material

    # 2. 将原始简历和结构化信息共同用于检索
    resume_text = "\n".join(
        part for part in [
            original_material,
            profile_text,
        ]
        if part.strip()
    )

    # 3. 整理最近的面试历史
    history_text = "\n".join(
        f"{item.get('role', 'unknown')}: "
        f"{item.get('content', '')}"
        for item in history[-6:]
    )

    # 4. 组织 RAG 检索内容
    query_parts = [
        resume_text[:1000],
        history_text[:400],
        phase,
        "计算机考研 408 复试",
        "优先训练知识点：" + "、".join(
            priority_points[:6]
        ),
    ]

    query_text = "\n".join(
        part for part in query_parts
        if part.strip()
    )[:1500]

    if not query_text.strip():
        query_text = "计算机考研 408 复试专业基础知识"

    # 5. 检索专业知识资料
    rag_start = time.perf_counter()

    print(
        "[面试启动] 开始知识库检索",
        flush=True,
    )

    evidence = ""

    print(
        f"[面试启动] 知识库检索完成，"
        f"耗时：{time.perf_counter() - rag_start:.2f} 秒",
        flush=True,
    )

    # 6. 加入长期记忆中的薄弱知识点
    memory_evidence = (
        "\n\n用户历史薄弱知识点（应优先考虑）：\n"
        + "\n".join(
            f"- {point}"
            for point in priority_points[:8]
        )
        if priority_points else ""
    )

    combined_evidence = evidence + memory_evidence

    # 7. 调用个性化面试官
    llm_start = time.perf_counter()

    print(
        "[面试启动] 开始生成面试问题",
        flush=True,
    )

    question = generate_question(
        mode=mode,
        phase=phase.upper(),
        material=material,
        history=history[-6:],
        evidence=combined_evidence,
        pressure_mode=pressure_mode,
    )

    print(
        f"[面试启动] 面试问题生成完成，"
        f"耗时：{time.perf_counter() - llm_start:.2f} 秒",
        flush=True,
    )

    return question, evidence


# =========================================================
# 五、RAG 知识检索接口
# =========================================================


from starlette.concurrency import run_in_threadpool


@app.post("/api/knowledge/query")
async def knowledge_query(request: KnowledgeQueryRequest):
    try:
        result = await run_in_threadpool(
            answer_knowledge,
            mode=request.mode,
            question=request.question,
        )

        return {
            "mode": request.mode,
            **result,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"知识问答失败：{str(exc)}",
        )





def build_question_stream(
    mode: str,
    phase: str,
    material: str,
    history: list[dict],
    pressure_mode: bool,
    priority_points: list[str],
):
    """
    直接根据简历、历史对话和薄弱知识点生成问题。
    不调用知识库。
    """

    memory_evidence = ""

    if priority_points:
        memory_evidence = (
            "\n历史薄弱知识点：\n"
            + "\n".join(
                f"- {point}"
                for point in priority_points[:5]
            )
        )

    print(
        "[面试出题] 跳过知识库检索，直接调用面试官模型",
        flush=True,
    )

    question_stream = generate_question_stream(
        mode=mode,
        phase=phase.upper(),
        material=material,
        history=history[-4:],
        evidence=memory_evidence,
        pressure_mode=pressure_mode,
    )

    return question_stream, ""

# =========================================================
# 六、开始面试：解析简历、创建记忆和数据库记录
# =========================================================

@app.post("/api/interview/start")
def start_interview(request: StartInterviewRequest):

    # 先完成材料整理和会话创建
    candidate_material = build_candidate_material(
        request.material
    )

    with SessionLocal() as db:
        if request.user_id is None:
            user = User(profile={})
            db.add(user)
            db.flush()
        else:
            user = db.get(User, request.user_id)

            if user is None:
                raise HTTPException(
                    status_code=404,
                    detail="指定用户不存在",
                )

        user_id = user.id

        context = create_session_context(
            mode=request.mode,
            user_id=user_id,
            phase="intro",
        )

        session_id = context["session_id"]

        context["material"] = request.material
        context["parsed_material"] = candidate_material
        context["pressure_mode"] = request.pressure_mode
        context["max_questions"] = request.max_questions
        context["answered_count"] = 0
        context["current_question"] = None
        context["finished"] = False

        db.add(
            InterviewSession(
                id=session_id,
                user_id=user_id,
                mode=request.mode,
                phase="intro",
            )
        )

        db.commit()

    def generate_events():

        try:
            # 先通知前端会话已经创建
            yield sse_event("meta", {
                "session_id": session_id,
                "user_id": user_id,
                "mode": request.mode,
                "phase": "intro",
                "question_count": 0,
            })

            yield sse_event("status", {
                "message": "正在检索专业知识资料..."
            })

            # 读取长期记忆
            priority_points = get_priority_knowledge_points(
                user_id
            )

            # 开始知识库检索及问题生成
            question_stream, evidence = build_question_stream(
                mode=request.mode,
                phase="intro",
                material=candidate_material,
                history=[],
                pressure_mode=request.pressure_mode,
                priority_points=priority_points,
            )

            yield sse_event("status", {
                "message": "资料检索完成，正在生成面试问题..."
            })

            question_parts = []

            # 逐段发送模型生成的文字
            for chunk in question_stream:
                if not chunk:
                    continue

                question_parts.append(chunk)

                yield sse_event("chunk", {
                    "content": chunk
                })

            question = "".join(question_parts).strip()

            if not question:
                raise RuntimeError("模型没有生成有效面试问题")

            # 完整生成后再保存
            append_session_message(
                session_id,
                "interviewer",
                question,
            )

            context["current_question"] = question

            with SessionLocal() as db:
                db.add(
                    InterviewMessage(
                        session_id=session_id,
                        role="interviewer",
                        content=question,
                    )
                )
                db.commit()

            yield sse_event("done", {
                "session_id": session_id,
                "user_id": user_id,
                "phase": context["phase"],
                "question_count": context["question_count"],
                "evidence": evidence,
                "priority_knowledge_points": priority_points,
                "finished": False,
            })

        except Exception as exc:
            print(
                f"[流式开始面试失败] {type(exc).__name__}: {exc}",
                flush=True,
            )

            yield sse_event("error", {
                "message": str(exc)
            })

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

# =========================================================
# 七、提交回答：评估、保存评价、更新长期记忆
# =========================================================


@app.post("/api/interview/answer")
async def submit_answer(request: AnswerRequest):
    try:
        context = get_session_context(request.session_id)

        if context is None:
            raise HTTPException(
                status_code=404,
                detail="面试会话不存在或已失效，请重新开始面试",
            )

        if context.get("finished"):
            raise HTTPException(
                status_code=400,
                detail="本场面试已经结束",
            )

        question = context.get("current_question")

        if not question:
            raise HTTPException(
                status_code=400,
                detail="当前没有等待回答的面试问题",
            )

        # 1. 保存回答到短期记忆
        append_session_message(
            request.session_id,
            "candidate",
            request.answer,
        )

        # 2. 保存回答到数据库
        with SessionLocal() as db:
            answer_message = InterviewMessage(
                session_id=request.session_id,
                role="candidate",
                content=request.answer,
            )

            db.add(answer_message)
            db.commit()

        # 3. 更新已回答题数
        context["answered_count"] = (
            context.get("answered_count", 0) + 1
        )

        # 当前问题已回答，允许生成下一题
        context["current_question"] = None

        return {
            "session_id": request.session_id,
            "question": question,
            "answer": request.answer,
            "evaluation": None,
            "evidence": "",
            "updated_knowledge_gaps": [],
            "memory_saved": False,
            "memory_saved_count": 0,
            "answered_count": context["answered_count"],
            "finished": False,
            "message": "回答已保存，正在准备下一道问题",
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"保存回答失败：{str(exc)}",
        )


# =========================================================
# 八、生成下一道问题
# =========================================================

@app.post("/api/interview/next-question/{session_id}")
def next_interview_question(session_id: str):

    context = get_session_context(session_id)

    if context is None:
        raise HTTPException(
            status_code=404,
            detail="面试会话不存在或短期记忆已失效",
        )

    if context.get("finished"):
        raise HTTPException(
            status_code=400,
            detail="面试已经结束",
        )

    if context.get("current_question"):
        raise HTTPException(
            status_code=400,
            detail="当前问题尚未回答，不能生成下一题",
        )

    
    if context["question_count"] >= context["max_questions"]:

        context["finished"] = True
        context["phase"] = "finished"

        with SessionLocal() as db:
            db_session = db.get(
                InterviewSession,
                session_id,
            )

            if db_session:
                db_session.phase = "finished"
                db_session.ended_at = datetime.now()
                db.commit()

        def finished_events():
            try:
                # 先通知前端：面试已结束，正在统一评估
                yield sse_event("status", {
                    "message": "面试结束，正在统一评估本场所有回答..."
                })

                # 对全部问答进行一次性评估
                final_result = evaluate_finished_session(
                    session_id
                )

                yield sse_event("done", {
                    "session_id": session_id,
                    "finished": True,
                    "final_evaluation": final_result,
                    "message": "本场面试结束，全部回答已完成统一评估",
                })

            except Exception as exc:
                print(
                    f"[整场评估失败] {type(exc).__name__}: {exc}",
                    flush=True,
                )

                yield sse_event("error", {
                    "message": f"面试已结束，但统一评估失败：{str(exc)}"
                })

        return StreamingResponse(
            finished_events(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )


    def generate_events():

        try:
            yield sse_event("status", {
                "message": "正在分析上一题回答..."
            })

            priority_points = get_priority_knowledge_points(
                context["user_id"]
            )

            candidate_material = context.get(
                "parsed_material",
                context.get("material", ""),
            )

            yield sse_event("status", {
                "message": "正在生成下一道问题..."
            })

            question_stream, evidence = build_question_stream(
                mode=context["mode"],
                phase=context["phase"],
                material=candidate_material,
                history=context["history"],
                pressure_mode=context.get("pressure_mode", False),
                priority_points=priority_points,
            )

            question_parts = []

            for chunk in question_stream:
                if not chunk:
                    continue

                question_parts.append(chunk)

                yield sse_event("chunk", {
                    "content": chunk
                })

            question = "".join(question_parts).strip()

            if not question:
                raise RuntimeError("模型没有生成有效面试问题")

            append_session_message(
                session_id,
                "interviewer",
                question,
            )

            context["current_question"] = question

            with SessionLocal() as db:
                db.add(
                    InterviewMessage(
                        session_id=session_id,
                        role="interviewer",
                        content=question,
                    )
                )
                db.commit()

            yield sse_event("done", {
                "session_id": session_id,
                "phase": context["phase"],
                "question_count": context["question_count"],
                "evidence": evidence,
                "priority_knowledge_points": priority_points,
                "finished": False,
            })

        except Exception as exc:
            print(
                f"[流式下一题失败] {type(exc).__name__}: {exc}",
                flush=True,
            )

            yield sse_event("error", {
                "message": str(exc)
            })

    return StreamingResponse(
        generate_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
# =========================================================
# 九、长期记忆：查询、修改、删除学习档案
# =========================================================

@app.get("/api/memory/{user_id}")
async def read_user_memory(user_id: int):
    try:
        with SessionLocal() as db:
            if db.get(User, user_id) is None:
                raise HTTPException(
                    status_code=404,
                    detail="用户不存在",
                )

        gaps = get_knowledge_gaps(user_id)

        return {
            "user_id": user_id,
            "total": len(gaps),
            "knowledge_gaps": gaps,
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"读取学习档案失败：{str(exc)}",
        )


@app.put("/api/memory/{user_id}/{gap_id}")
async def edit_user_memory(
    user_id: int,
    gap_id: int,
    request: UpdateKnowledgeRequest,
):
    try:
        result = update_knowledge_gap(
            user_id=user_id,
            gap_id=gap_id,
            knowledge_point=request.knowledge_point,
        )

        if result is None:
            raise HTTPException(
                status_code=404,
                detail="没有找到对应的学习档案记录",
            )

        return {
            "message": "学习档案修改成功",
            "data": result,
        }

    except HTTPException:
        raise

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"修改学习档案失败：{str(exc)}",
        )


@app.delete("/api/memory/{user_id}/{gap_id}")
async def remove_user_memory(user_id: int, gap_id: int):
    try:
        deleted = delete_knowledge_gap(
            user_id,
            gap_id,
        )

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="没有找到对应的学习档案记录",
            )

        return {
            "message": "学习档案删除成功",
            "deleted": True,
        }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"删除学习档案失败：{str(exc)}",
        )

# =========================================================
# 历史面试记录：查询用户的所有面试场次
# =========================================================

@app.get("/api/interview/sessions/{user_id}")
async def get_interview_sessions(user_id: int):
    try:
        with SessionLocal() as db:

            user = db.get(User, user_id)

            if user is None:
                raise HTTPException(
                    status_code=404,
                    detail="用户不存在",
                )

            sessions = db.scalars(
                select(InterviewSession)
                .where(InterviewSession.user_id == user_id)
                .order_by(InterviewSession.started_at.desc())
            ).all()

            results = []

            for session in sessions:

                evaluations = db.scalars(
                    select(Evaluation)
                    .where(
                        Evaluation.session_id == session.id
                    )
                    .order_by(Evaluation.id.asc())
                ).all()

                messages = db.scalars(
                    select(InterviewMessage)
                    .where(
                        InterviewMessage.session_id == session.id,
                        InterviewMessage.role == "interviewer",
                    )
                    .order_by(InterviewMessage.id.asc())
                ).all()

                scores = [
                    float(item.score)
                    for item in evaluations
                ]

                average_score = (
                    round(sum(scores) / len(scores), 2)
                    if scores else None
                )

                first_question = (
                    messages[0].content
                    if messages else "计算机考研 408 模拟面试"
                )

                report = db.scalar(
                    select(InterviewReport)
                    .where(
                        InterviewReport.session_id == session.id
                    )
                    .order_by(InterviewReport.id.desc())
                )

                results.append({
                    "session_id": session.id,
                    "mode": session.mode,
                    "phase": session.phase,
                    "started_at": (
                        session.started_at.isoformat()
                        if session.started_at else None
                    ),
                    "ended_at": (
                        session.ended_at.isoformat()
                        if session.ended_at else None
                    ),
                    "question_count": len(evaluations),
                    "average_score": average_score,
                    "title": first_question[:80],
                    "finished": session.phase == "finished",
                    "has_report": report is not None,
                })

            return {
                "user_id": user_id,
                "total": len(results),
                "sessions": results,
            }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"读取历史面试记录失败：{str(exc)}",
        )

# =========================================================
# 十、AI 面试报告：生成与保存
# =========================================================

@app.post("/api/interview/report/{session_id}")
async def create_interview_report(session_id: str):
    try:
        # 1. 查询面试场次
        with SessionLocal() as db:
            session = db.get(
                InterviewSession,
                session_id,
            )

            if session is None:
                raise HTTPException(
                    status_code=404,
                    detail="面试场次不存在",
                )

            if session.phase != "finished":
                raise HTTPException(
                    status_code=400,
                    detail="面试尚未结束，暂时不能生成报告",
                )

            # 2. 检查是否已经生成过报告
            existing_report = db.scalar(
                select(InterviewReport)
                .where(
                    InterviewReport.session_id == session_id
                )
                .order_by(InterviewReport.id.desc())
            )

            if existing_report:
                return {
                    "session_id": session_id,
                    "report_id": existing_report.id,
                    "report": json.loads(existing_report.content),
                    "cached": True,
                    "message": "已读取本场面试的历史报告",
                }

            # 3. 查询全部对话
            messages = db.scalars(
                select(InterviewMessage)
                .where(
                    InterviewMessage.session_id == session_id
                )
                .order_by(InterviewMessage.id.asc())
            ).all()

            message_map = {
                message.id: message.content
                for message in messages
            }

            # 4. 查询全部评价
            evaluations = db.scalars(
                select(Evaluation)
                .where(
                    Evaluation.session_id == session_id
                )
                .order_by(Evaluation.id.asc())
            ).all()

            if not evaluations:
                raise HTTPException(
                    status_code=400,
                    detail="本场面试没有有效评价，无法生成报告",
                )

            # 5. 组装逐题评价数据
            question_reviews = []

            for evaluation in evaluations:
                question = message_map.get(
                    evaluation.question_message_id,
                    "问题记录不存在",
                )

                answer = message_map.get(
                    evaluation.answer_message_id,
                    "回答记录不存在",
                )

                question_reviews.append({
                    "question": question,
                    "answer": answer,
                    "score": evaluation.score,
                    "dimension_scores": (
                        evaluation.dimension_scores or {}
                    ),
                    "knowledge_gaps": (
                        evaluation.missed_points or []
                    ),
                    "evidence": evaluation.evidence or [],
                    "feedback": evaluation.feedback or "",
                })

            # 6. 计算综合得分
            scores = [
                float(item.score)
                for item in evaluations
            ]

            overall_score = round(
                sum(scores) / len(scores),
                2,
            )

            # 7. 汇总知识薄弱点
            knowledge_gaps = []

            for evaluation in evaluations:
                knowledge_gaps.extend(
                    evaluation.missed_points or []
                )

            knowledge_gaps = list(dict.fromkeys(
                point.strip()
                for point in knowledge_gaps
                if isinstance(point, str) and point.strip()
            ))

            # 8. 构建报告输入数据
            report_data = {
                "session_id": session_id,
                "user_id": session.user_id,
                "mode": session.mode,
                "started_at": (
                    session.started_at.isoformat()
                    if session.started_at else None
                ),
                "ended_at": (
                    session.ended_at.isoformat()
                    if session.ended_at else None
                ),
                "question_count": len(question_reviews),
                "overall_score": overall_score,
                "question_reviews": question_reviews,
                "knowledge_gaps": knowledge_gaps,
            }

        # 9. 调用报告 Agent
        report = generate_report(report_data)

        # 10. 保存报告
        report_content = json.dumps(
            report,
            ensure_ascii=False,
        )

        with SessionLocal() as db:
            existing_report = db.scalar(
                select(InterviewReport)
                .where(
                    InterviewReport.session_id == session_id
                )
                .order_by(InterviewReport.id.desc())
            )

            if existing_report:
                return {
                    "session_id": session_id,
                    "report_id": existing_report.id,
                    "report": json.loads(existing_report.content),
                    "cached": True,
                    "message": "已读取本场面试的历史报告",
                }

            new_report = InterviewReport(
                session_id=session_id,
                content=report_content,
            )

            db.add(new_report)
            db.commit()
            db.refresh(new_report)

            return {
                "session_id": session_id,
                "report_id": new_report.id,
                "report": report,
                "cached": False,
                "message": "AI 面试报告生成成功",
            }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"生成面试报告失败：{str(exc)}",
        )


# =========================================================
# 十一、查询历史面试报告
# =========================================================

@app.get("/api/interview/report/{session_id}")
async def read_interview_report(session_id: str):
    try:
        with SessionLocal() as db:
            session = db.get(
                InterviewSession,
                session_id,
            )

            if session is None:
                raise HTTPException(
                    status_code=404,
                    detail="面试场次不存在",
                )

            report = db.scalar(
                select(InterviewReport)
                .where(
                    InterviewReport.session_id == session_id
                )
                .order_by(InterviewReport.id.desc())
            )

            if report is None:
                raise HTTPException(
                    status_code=404,
                    detail="本场面试暂时没有生成报告",
                )

            return {
                "session_id": session_id,
                "report_id": report.id,
                "report": json.loads(report.content),
                "created_at": report.created_at.isoformat(),
            }

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"查询面试报告失败：{str(exc)}",
        )