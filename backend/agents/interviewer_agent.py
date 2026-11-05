
import json

from services.llm_service import ask_llm


def generate_question(
    mode: str,
    phase: str,
    material: str,
    history: list[dict],
    evidence: str = "",
    pressure_mode: bool = False,
) -> str:
    """
    根据考生原始简历、报考方向、历史回答和知识库资料，
    生成一道个性化计算机考研 408 复试问题。
    """

    if mode != "408":
        raise ValueError("当前职智 Agent 仅支持计算机考研 408 复试")

    # 兼容原始简历文本和结构化简历 JSON
    try:
        candidate_info = json.loads(material)
        if not isinstance(candidate_info, dict):
            candidate_info = {"original_material": material}
    except (json.JSONDecodeError, TypeError):
        candidate_info = {"original_material": material}

    original_material = candidate_info.get("original_material", "")
    parsed_profile = candidate_info.get("parsed_profile", {})

    if parsed_profile:
        candidate_text = json.dumps(
            parsed_profile,
            ensure_ascii=False,
        )
        if original_material:
            candidate_text += "\n原始简历：\n" + original_material
    else:
        candidate_text = original_material or material

    # 控制输入长度，避免不必要的 Token 消耗
    candidate_text = candidate_text[:4000]

    recent_history = history[-6:] if history else []

    phase_guidance = {
        "INTRO": "重点考查自我介绍、教育背景和报考动机。",
        "THEORY": "重点考查数据结构、计算机网络、操作系统和计算机组成原理。",
        "PROJECT": "重点考查项目背景、技术选型、实现过程和个人贡献。",
        "PRESSURE": "针对考生之前回答中的薄弱点进行深入追问。",
        "QUESTIONS": "重点考查专业综合能力和研究方向。",
        "REVIEW": "针对之前暴露的知识薄弱点进行补充提问。",
    }

    guidance = phase_guidance.get(
        phase,
        "结合考生个人背景进行专业综合提问。",
    )

    system_prompt = f"""
你是职智 Agent 的计算机考研 408 复试面试官。

你的任务是生成一道真实、专业、有针对性的复试问题。

【考查范围】
数据结构、计算机组成原理、操作系统、计算机网络，
以及考生简历中的项目、课程和研究方向。

【当前阶段】
{phase}

【阶段要求】
{guidance}

【提问规则】
1. 优先结合考生真实的简历内容提问。
2. 不得编造考生的项目、经历和技术能力。
3. 如果材料缺少相关经历，可以考查专业基础知识。
4. 如果历史回答存在错误或漏洞，优先进行针对性追问。
5. 如果历史回答已经充分，可以进入新的考查内容。
6. 每次只提出一道问题。
7. 问题控制在100字以内。
8. {"采用适度压力面试语气。" if pressure_mode else "采用正常、严谨的高校复试语气。"}
9. 专业知识问题优先参考提供的知识资料。
10. 不输出答案、解析、评分或额外说明。

直接输出面试问题。
"""

    user_prompt = f"""
【考生简历及报考信息】
{candidate_text}

【历史对话】
{json.dumps(recent_history, ensure_ascii=False)}

【知识库参考资料】
{evidence[:1200] if evidence else "暂无额外资料"}

请生成下一道最合适的复试问题。
"""

    result = ask_llm(system_prompt, user_prompt)

    return result.strip()

from services.llm_service import ask_llm_stream


def generate_question_stream(
    mode: str,
    phase: str,
    material: str,
    history: list[dict],
    evidence: str = "",
    pressure_mode: bool = False,
):
    """
    流式生成一道个性化 408 复试问题。
    """

    if mode != "408":
        raise ValueError("当前职智 Agent 仅支持计算机考研 408 复试")

    try:
        candidate_info = json.loads(material)

        if not isinstance(candidate_info, dict):
            candidate_info = {"original_material": material}

    except (json.JSONDecodeError, TypeError):
        candidate_info = {"original_material": material}

    original_material = candidate_info.get("original_material", "")
    parsed_profile = candidate_info.get("parsed_profile", {})

    if parsed_profile:
        candidate_text = json.dumps(
            parsed_profile,
            ensure_ascii=False,
        )

        if original_material:
            candidate_text += "\n原始简历：\n" + original_material
    else:
        candidate_text = original_material or material

    candidate_text = candidate_text[:3000]

    recent_history = history[-4:] if history else []

    phase_guidance = {
        "INTRO": "重点考查自我介绍、教育背景和报考动机。",
        "THEORY": "重点考查数据结构、计算机网络、操作系统和计算机组成原理。",
        "PROJECT": "重点考查项目背景、技术选型、实现过程和个人贡献。",
        "PRESSURE": "针对考生之前回答中的薄弱点进行深入追问。",
        "QUESTIONS": "重点考查专业综合能力和研究方向。",
        "REVIEW": "针对之前暴露的知识薄弱点进行补充提问。",
    }

    guidance = phase_guidance.get(
        phase,
        "结合考生个人背景进行专业综合提问。",
    )

    system_prompt = f"""
你是职智 Agent 的计算机考研 408 复试面试官。

当前阶段：{phase}
阶段要求：{guidance}

要求：
1. 优先结合考生真实简历和报考方向。
2. 不得编造考生经历。
3. 历史回答存在错误时，优先针对错误追问。
4. 每次只提出一道问题。
5. 问题控制在80字以内。
6. {"采用适度压力面试语气。" if pressure_mode else "采用正常、严谨的高校复试语气。"}
7. 专业问题优先参考提供的知识资料。
8. 不输出答案、解析、评分或额外说明。

直接输出面试问题。
"""

    user_prompt = f"""
【考生资料】
{candidate_text}

【最近面试记录】
{json.dumps(recent_history, ensure_ascii=False)}

【知识库参考资料】
{evidence[:800] if evidence else "暂无额外资料"}

请直接生成下一道最合适的复试问题。
"""

    yield from ask_llm_stream(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        timeout_seconds=60,
        max_tokens=120,
    )