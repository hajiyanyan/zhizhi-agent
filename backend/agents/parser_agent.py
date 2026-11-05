import json
import re

from services.llm_service import ask_llm


def parse_material(material: str) -> str:
    """
    解析考研复试个人简历或个人陈述。
    返回标准化 JSON 字符串，供后续面试智能体使用。
    """

    system_prompt = """
你是一名计算机考研复试材料解析智能体。

你的任务是从用户提供的简历、个人陈述或其他报考材料中，
提取与计算机考研复试有关的真实信息。

请严格遵守以下规则：

1. 只能提取材料中明确出现的信息，不得虚构学历、项目、竞赛、科研成果或技术能力。
2. 不要将用户表达的兴趣直接认定为已经掌握的技术。
3. 项目经历要尽可能提取项目名称、项目背景、个人职责、使用技术和实际成果。
4. 对信息不完整或无法确认的内容，放入 uncertainties。
5. 根据材料中的真实经历提出潜在追问。
6. 只输出合法 JSON，不要使用 Markdown 代码块，不要输出额外解释。
7. 没有相关信息的字段使用空字符串或空数组。

严格按照以下 JSON 结构输出：

{
    "education_background": [],
    "major_courses": [],
    "skills": [],
    "projects": [
        {
            "name": "",
            "background": "",
            "responsibilities": "",
            "technologies": [],
            "results": "",
            "evidence": ""
        }
    ],
    "research_interests": [],
    "target_direction": "",
    "potential_followups": [],
    "uncertainties": []
}

字段说明：

education_background：学历、学校、专业等教育背景。
major_courses：计算机相关专业课程。
skills：明确掌握或使用过的技术、编程语言和工具。
projects：实际参与过的项目经历。
research_interests：明确表达的研究兴趣。
target_direction：报考专业或研究方向。
potential_followups：结合真实经历设计的复试追问。
uncertainties：材料中不明确、需要进一步确认的信息。

特别注意：
如果材料只提到使用过 Python，不要推断用户精通 Python。
如果材料只提到参与项目，不要推断用户是项目负责人。
如果材料没有科研经历，不要编造科研成果。
"""

    if not material or not material.strip():
        raise ValueError("简历或个人陈述内容不能为空")

    result = ask_llm(system_prompt, material)

    # 去除模型可能返回的 Markdown 代码块标记
    cleaned = re.sub(
        r"^\s*```(?:json)?\s*|\s*```\s*$",
        "",
        result.strip(),
        flags=re.IGNORECASE
    )

    try:
        # 直接尝试解析 JSON
        data = json.loads(cleaned)

    except json.JSONDecodeError:
        # 尝试提取模型输出中的 JSON 主体
        start = cleaned.find("{")
        end = cleaned.rfind("}")

        if start == -1 or end == -1 or end <= start:
            raise ValueError("简历解析失败：模型没有返回有效 JSON")

        try:
            data = json.loads(cleaned[start:end + 1])
        except json.JSONDecodeError as exc:
            raise ValueError("简历解析失败：模型返回的 JSON 格式不正确") from exc

    # 补齐标准字段，避免后续智能体读取时缺少键
    default_data = {
        "education_background": [],
        "major_courses": [],
        "skills": [],
        "projects": [],
        "research_interests": [],
        "target_direction": "",
        "potential_followups": [],
        "uncertainties": []
    }

    for key, default_value in default_data.items():
        if key not in data or data[key] is None:
            data[key] = default_value

    return json.dumps(data, ensure_ascii=False, indent=2)