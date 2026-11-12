import os
import json
import asyncio
import queue
import time
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent / ".env")

import duplex_runtime

router = APIRouter(prefix="/api/video", tags=["video-interview"])


class VideoSessionRequest(BaseModel):
    major: str = "计算机科学与技术"
    research_direction: str = ""
    target_school: str = ""
    resume_text: str
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


def get_session(session_id: str):
    session = duplex_runtime.STATE.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="视频面试会话不存在或已结束")
    return session


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
10. 面试结束时给出整场综合评价，包括专业基础、表达逻辑、项目理解、知识掌握和改进建议。
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
        return {"ok": True, "session_id": session.id}
    except Exception as exc:
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


@router.post("/close")
def close_video_session(data: SessionRequest):
    duplex_runtime.STATE.close(data.session_id)
    return {"ok": True}
