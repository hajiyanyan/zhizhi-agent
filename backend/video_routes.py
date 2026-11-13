import os
import base64
import json
import asyncio
import queue
import time
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

load_dotenv(Path(__file__).resolve().parent / ".env")

import duplex_runtime
from services.database import SessionLocal
from services.models import (
    User,
    InterviewSession,
    InterviewMessage,
    Evaluation,
    InterviewReport,
    VideoReportTask,
)

router = APIRouter(prefix="/api/video", tags=["video-interview"])


class VideoSessionRequest(BaseModel):
    major: str = "计算机科学与技术"
    research_direction: str = ""
    target_school: str = ""
    resume_text: str
    user_id: int = 1
    pressure_mode: bool = False
    max_questions: int = 8


class AudioRequest(BaseModel):
    session_id: str
    audio: str


class SessionRequest(BaseModel):
    session_id: str


class TextRequest(BaseModel):
    session_id: str
    text: str


class TranscriptMessage(BaseModel):
    role: Literal["考生", "面试官"]
    text: str = Field(min_length=1, max_length=12000)


class FinishVideoRequest(BaseModel):
    session_id: str
    messages: list[TranscriptMessage] = Field(default_factory=list)


def get_session(session_id: str):
    session = duplex_runtime.STATE.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="视频面试会话不存在或已结束")
    return session


def _set_report_task(session_id: str, status: str, error: str = ""):
    with SessionLocal() as db:
        task = db.get(VideoReportTask, session_id)
        if task is None:
            task = VideoReportTask(
                session_id=session_id,
                status=status,
                error=error[:1000],
            )
            db.add(task)
        else:
            task.status = status
            task.error = error[:1000]
        db.commit()


def generate_video_report_background(session_id: str):
    """面试结束后在后台统一评分并生成报告，不占用实时面试链路。"""
    try:
        _set_report_task(session_id, "running")

        # 延迟导入，避免 video_routes 与 main.py 在应用启动时形成循环依赖。
        try:
            from main import evaluate_finished_session, create_interview_report
        except ImportError:
            from backend.main import evaluate_finished_session, create_interview_report

        with SessionLocal() as db:
            existing_report = db.scalar(
                select(InterviewReport)
                .where(InterviewReport.session_id == session_id)
                .order_by(InterviewReport.id.desc())
            )
        if existing_report is not None:
            _set_report_task(session_id, "completed")
            return

        # 若之前已完成评分、仅报告生成失败，则复用评分结果，避免重试时重复写入评价。
        with SessionLocal() as db:
            has_evaluations = db.query(Evaluation.id).filter(
                Evaluation.session_id == session_id
            ).first() is not None

        if not has_evaluations:
            evaluation = evaluate_finished_session(session_id)
            if not evaluation.get("evaluated"):
                raise ValueError("有效问答不足，暂时无法生成完整报告")

        result = asyncio.run(create_interview_report(session_id))
        if not isinstance(result, dict) or not result.get("report"):
            raise RuntimeError("报告生成未返回有效结果")

        _set_report_task(session_id, "completed")
        print(f"[视频面试报告] {session_id} 已生成并保存", flush=True)

    except Exception as exc:
        _set_report_task(session_id, "failed", str(exc))
        print(
            f"[视频面试报告] {session_id} 生成失败：{type(exc).__name__}: {exc}",
            flush=True,
        )


@router.post("/session")
def create_video_session(data: VideoSessionRequest):
    api_key = os.getenv("VOLCENGINE_SEEDUPEX_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="后端尚未配置 VOLCENGINE_SEEDUPEX_API_KEY"
        )

    if not data.resume_text.strip():
        raise HTTPException(status_code=400, detail="请先填写个人简历或复试材料")

    instructions = f"""
你是职智 Agent 的计算机考研 408 复试面试官。你通过实时语音与考生进行正式模拟面试。
请始终使用自然、清晰、专业的中文口语。

【考生信息】
报考专业：{data.major}
研究方向：{data.research_direction or "未填写"}
目标院校：{data.target_school or "未填写"}
个人材料：
{data.resume_text[:12000]}

【面试要求】
1. 你负责完整的视频语音面试，不调用其他面试 Agent。
2. 面试开始后主动向考生问好，并邀请考生进行简短自我介绍。
3. 根据考生材料提出个性化问题，重点考查数据结构、计算机组成原理、操作系统、计算机网络。
4. 结合简历中的项目、科研经历和研究方向进行追问。
5. 每次只问一个问题，等待考生回答后再继续。
6. 根据回答质量调整后续问题，必要时进行适度追问。
7. 计划提问数量约为 {data.max_questions} 道。
8. 压力面试模式：{"开启，适当增加追问和问题深度" if data.pressure_mode else "关闭，保持正常复试交流节奏"}。
9. 不要一次性输出整套题目，不要在每道题后给分。
10. 面试结束时只需自然结束交流，不要生成评分或长篇报告；系统会在结束后独立生成正式报告。
11. 不得编造考生简历内容或虚构标准答案。
12. 语言简洁，符合真实研究生复试现场交流习惯。
"""

    config = {
        "api_key": api_key,
        "model": "1.2.6.1",
        "instructions": instructions,
        "voice": "zh_female_vv_jupiter_bigtts",
        "input_format": "pcm",
        "output_format": "pcm_s16le",
        "enable_tools": False,
        "tool_root": tempfile.gettempdir(),
        "enable_proactive_speak": True,
        "enable_websearch": False,
        "enable_music": False,
    }

    try:
        session = duplex_runtime.STATE.create(config)
        with SessionLocal() as db:
            user = db.get(User, data.user_id)
            if user is None:
                user = User(id=data.user_id, profile={})
                db.add(user)
                db.flush()

            db.add(
                InterviewSession(
                    id=session.id,
                    user_id=data.user_id,
                    mode="408",
                    phase="intro",
                )
            )
            db.commit()

        return {"ok": True, "session_id": session.id}
    except HTTPException:
        raise
    except Exception as exc:
        try:
            duplex_runtime.STATE.close(session.id)
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=f"豆包实时会话创建失败：{exc}")


@router.get("/events")
async def video_events(session_id: str):
    session = get_session(session_id)

    async def event_stream():
        while True:
            try:
                event = await asyncio.to_thread(session.events.get, True, 15)
            except queue.Empty:
                event = {"type": "local.ping", "ts": time.time()}

            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

            if event.get("type") == "local.closed":
                break

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket("/ws")
async def video_websocket(websocket: WebSocket, session_id: str):
    """单条持久 WebSocket 承载浏览器音频上行与豆包事件下行。"""
    session = duplex_runtime.STATE.get(session_id)
    if session is None:
        await websocket.close(code=4404, reason="视频面试会话不存在或已结束")
        return

    await websocket.accept()

    async def forward_events():
        try:
            while True:
                try:
                    event = await asyncio.to_thread(session.events.get, True, 1)
                except queue.Empty:
                    if session.closed.is_set():
                        break
                    continue
                await websocket.send_json(event)
                if event.get("type") == "local.closed":
                    break
        except Exception:
            pass

    forward_task = asyncio.create_task(forward_events())
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            raw_audio = message.get("bytes")
            if raw_audio is not None:
                if raw_audio:
                    session.send_audio(base64.b64encode(raw_audio).decode("ascii"))
                continue

            raw_text = message.get("text")
            if raw_text:
                try:
                    payload = json.loads(raw_text)
                except json.JSONDecodeError:
                    await websocket.send_json({
                        "type": "local.error",
                        "message": "无法识别的实时控制消息",
                    })
                    continue

                event_type = payload.get("type")
                if event_type == "audio_commit":
                    session.commit_audio()
                elif event_type == "text":
                    text_value = str(payload.get("text") or "").strip()
                    if text_value:
                        session.send_text(text_value)
                elif event_type == "close":
                    break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json({
                "type": "local.error",
                "message": f"实时音频传输失败：{exc}",
            })
        except Exception:
            pass
    finally:
        forward_task.cancel()
        try:
            await forward_task
        except asyncio.CancelledError:
            pass
        # 浏览器断开时释放豆包上游连接，避免遗留会话。
        duplex_runtime.STATE.close(session_id)


@router.post("/audio")
def send_video_audio(data: AudioRequest):
    if not data.audio:
        raise HTTPException(status_code=400, detail="音频数据为空")
    get_session(data.session_id).send_audio(data.audio)
    return {"ok": True}


@router.post("/audio_commit")
def commit_video_audio(data: SessionRequest):
    get_session(data.session_id).commit_audio()
    return {"ok": True}


@router.post("/text")
def send_video_text(data: TextRequest):
    get_session(data.session_id).send_text(data.text)
    return {"ok": True}


@router.post("/finish")
def finish_video_session(
    data: FinishVideoRequest,
    background_tasks: BackgroundTasks,
):
    """先保存面试转写并立即结束面试，再由后台生成评分报告。"""
    with SessionLocal() as db:
        session = db.get(InterviewSession, data.session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="面试场次不存在")

        task = db.get(VideoReportTask, data.session_id)
        if session.phase == "finished":
            if task and task.status == "completed":
                return {"ok": True, "status": "completed"}
            if task and task.status == "running":
                return {"ok": True, "status": "running"}
            if task is None:
                task = VideoReportTask(
                    session_id=data.session_id,
                    status="pending",
                    error="",
                )
                db.add(task)
            else:
                task.status = "pending"
                task.error = ""
        else:
            # 保留对话顺序，并合并连续的同一说话人转写片段，
            # 避免考生停顿后分段识别导致一题被拆成多条回答。
            last_message = None
            for item in data.messages[:200]:
                content = item.text.strip()
                if not content:
                    continue
                role = "candidate" if item.role == "考生" else "interviewer"

                if last_message and last_message.role == role:
                    if content != last_message.content.strip():
                        last_message.content = (
                            last_message.content + "\n" + content
                        )[:12000]
                    continue

                last_message = InterviewMessage(
                    session_id=data.session_id,
                    role=role,
                    content=content,
                )
                db.add(last_message)

            session.phase = "finished"
            session.ended_at = datetime.utcnow()
            if task is None:
                task = VideoReportTask(
                    session_id=data.session_id,
                    status="pending",
                    error="",
                )
                db.add(task)
            else:
                task.status = "pending"
                task.error = ""

        db.commit()

    background_tasks.add_task(
        generate_video_report_background,
        data.session_id,
    )
    return {"ok": True, "status": "pending"}


@router.get("/report-status/{session_id}")
def get_video_report_status(session_id: str):
    with SessionLocal() as db:
        session = db.get(InterviewSession, session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="面试场次不存在")

        task = db.get(VideoReportTask, session_id)
        report = db.query(InterviewReport).filter(
            InterviewReport.session_id == session_id
        ).order_by(InterviewReport.id.desc()).first()

        if report is not None:
            return {
                "session_id": session_id,
                "status": "completed",
                "report": json.loads(report.content),
                "error": "",
            }

        return {
            "session_id": session_id,
            "status": task.status if task else "pending",
            "report": None,
            "error": task.error if task else "",
        }


@router.post("/close")
def close_video_session(data: SessionRequest):
    duplex_runtime.STATE.close(data.session_id)
    return {"ok": True}
