
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

api_key = os.getenv("DASHSCOPE_API_KEY")
base_url = os.getenv("DASHSCOPE_BASE_URL")
model_name = os.getenv("DASHSCOPE_MODEL")

if not api_key or not base_url or not model_name:
    raise RuntimeError("请检查 backend/.env 中的模型 API 配置")

client = OpenAI(
    api_key=api_key,
    base_url=base_url,
    timeout=180.0,
    max_retries=1,
)


def ask_llm(
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: float | None = None,
    max_tokens: int | None = None,
) -> str:
    """
    统一大模型调用入口。

    timeout_seconds:
        单次请求超时时间。不传时使用 client 的默认超时。

    max_tokens:
        限制模型输出长度。不传时使用模型默认设置。
    """

    if not user_prompt or not user_prompt.strip():
        raise ValueError("模型输入内容不能为空")

    if not system_prompt or not system_prompt.strip():
        raise ValueError("系统提示词不能为空")

    request_args = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
        "temperature": 0.3,
    }

    if max_tokens is not None:
        request_args["max_tokens"] = max_tokens

    if timeout_seconds is not None:
        request_args["timeout"] = timeout_seconds

    try:
        response = client.chat.completions.create(**request_args)

        if not response.choices:
            raise RuntimeError("模型没有返回有效结果")

        content = response.choices[0].message.content

        if not content or not content.strip():
            raise RuntimeError("模型返回内容为空")

        return content.strip()

    except Exception as exc:
        print("\n========== 大模型调用失败 ==========", flush=True)
        print("异常类型：", type(exc).__name__, flush=True)
        print("异常信息：", str(exc), flush=True)
        print("模型名称：", model_name, flush=True)
        print("输入长度：", len(user_prompt), flush=True)
        print("====================================\n", flush=True)

        raise RuntimeError(
            f"大模型调用失败（{type(exc).__name__}）：{str(exc)}"
        ) from exc

def ask_llm_stream(
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: float | None = None,
    max_tokens: int = 180,
):
    """
    流式调用大模型。
    模型每生成一段内容，就立即 yield 给上层。
    """

    if not user_prompt or not user_prompt.strip():
        raise ValueError("模型输入内容不能为空")

    if not system_prompt or not system_prompt.strip():
        raise ValueError("系统提示词不能为空")

    request_args = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            },
        ],
        "temperature": 0.3,
        "max_tokens": max_tokens,
        "stream": True,
    }

    if timeout_seconds is not None:
        request_args["timeout"] = timeout_seconds

    response = None

    try:
        response = client.chat.completions.create(**request_args)

        for chunk in response:
            if not chunk.choices:
                continue

            content = chunk.choices[0].delta.content

            if content:
                yield content

    except Exception as exc:
        print(
            f"[模型流式调用失败] {type(exc).__name__}: {exc}",
            flush=True,
        )
        raise RuntimeError(
            f"大模型流式调用失败（{type(exc).__name__}）：{exc}"
        ) from exc

    finally:
        if response is not None:
            response.close()