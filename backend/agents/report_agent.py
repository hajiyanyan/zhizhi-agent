
import json
import re
from typing import Any

from services.llm_service import ask_llm


def _extract_json(text: str) -> dict:
    """从模型返回内容中提取 JSON 对象。"""

    text = text.strip()

    text = re.sub(
        r"^```(?:json)?\s*|\s*```$",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)

        if not match:
            raise ValueError("模型没有返回有效的 JSON 报告")

        data = json.loads(match.group())

    if not isinstance(data, dict):
        raise ValueError("报告内容必须是 JSON 对象")

    required_fields = [
        "summary",
        "overall_score",
        "dimension_analysis",
        "question_reviews",
        "knowledge_gaps",
        "improvement_suggestions",
        "training_plan",
    ]

    missing = [
        field for field in required_fields
        if field not in data
    ]

    if missing:
        raise ValueError(f"报告缺少必要字段：{missing}")

    return data


def generate_report(report_data: dict[str, Any]) -> dict:
    """生成简洁的结构化面试报告。"""

    system_prompt = """
你是职智 Agent 的面试报告助手。

根据输入的真实面试记录生成简洁报告。

规则：
1. 只能依据输入数据，不得编造内容。
2. overall_score 必须使用输入提供的分数。
3. 重点总结整体表现和薄弱知识点。
4. 逐题评价简短，每题最多保留一个优点和一个不足。
5. 总体评价不超过100字。
6. 每个能力维度分析不超过40字。
7. knowledge_gaps 最多5项。
8. improvement_suggestions 最多3条。
9. training_plan 最多3项，每项给出一个简短任务。
10. 信息不足时明确说明。
11. 只返回合法 JSON，不要输出 Markdown。

严格使用以下字段：

{
  "summary": "总体评价",
  "overall_score": 0,
  "dimension_analysis": [
    {
      "dimension": "能力维度",
      "analysis": "简短分析"
    }
  ],
  "question_reviews": [
    {
      "question": "真实面试问题",
      "answer_summary": "回答概括",
      "score": 0,
      "strengths": ["一个优点"],
      "weaknesses": ["一个不足"],
      "suggestion": "简短建议"
    }
  ],
  "knowledge_gaps": [
    {
      "knowledge_point": "薄弱知识点",
      "analysis": "简短说明"
    }
  ],
  "improvement_suggestions": [
    "具体改进建议"
  ],
  "training_plan": [
    {
      "topic": "训练主题",
      "task": "具体训练任务"
    }
  ]
}
"""

    # 压缩输入 JSON，减少不必要的格式字符
    user_prompt = (
        "请根据以下真实面试数据生成简洁报告：\n"
        + json.dumps(
            report_data,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )

    raw_result = ask_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )

    report = _extract_json(raw_result)

    # 综合得分始终由后端计算，模型不能修改
    report["overall_score"] = report_data["overall_score"]

    return report
