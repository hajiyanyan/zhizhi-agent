
import json
import re

from services.llm_service import ask_llm


DIMENSIONS = [
    "理论准确性",
    "逻辑表达",
    "项目理解深度",
    "科研潜力",
    "语言表达",
]


def _safe_list(value, limit):
    """安全处理列表字段。"""
    if not isinstance(value, list):
        return []

    return [
        str(item).strip()
        for item in value
        if item is not None and str(item).strip()
    ][:limit]


def _extract_json(raw):
    """从模型输出中提取 JSON。"""
    text = str(raw).strip()

    text = re.sub(
        r"^```(?:json)?\s*|\s*```$",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()

    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end <= start:
        raise ValueError("模型没有返回有效 JSON")

    return json.loads(text[start:end + 1])


def _normalize_review(item, question_index):
    """统一每道题的评估结果格式。"""

    if not isinstance(item, dict):
        item = {}

    try:
        score = float(item.get("score", 60))
    except (TypeError, ValueError):
        score = 60

    score = max(0, min(100, score))

    raw_dimensions = item.get("dimension_scores", {})
    if not isinstance(raw_dimensions, dict):
        raw_dimensions = {}

    dimension_scores = {}

    for dimension in DIMENSIONS:
        try:
            value = float(raw_dimensions.get(dimension, score))
        except (TypeError, ValueError):
            value = score

        dimension_scores[dimension] = max(0, min(100, value))

    needs_review = item.get("needs_review", False)
    if not isinstance(needs_review, bool):
        needs_review = False

    feedback = item.get("feedback", "本题评价已完成。")
    if not isinstance(feedback, str):
        feedback = "本题评价已完成。"

    return {
        "score": score,
        "dimension_scores": dimension_scores,
        "strengths": _safe_list(item.get("strengths"), 2),
        "weaknesses": _safe_list(item.get("weaknesses"), 2),
        "knowledge_gaps": _safe_list(item.get("knowledge_gaps"), 3),
        "evidence": _safe_list(item.get("evidence"), 2),
        "feedback": feedback.strip()[:200],
        "needs_review": needs_review,
    }


def evaluate_all_answers(
    mode: str,
    question_answers: list[dict],
) -> list[dict]:
    """
    面试结束后统一评估所有问答。

    正常情况下：
    整场面试只调用一次大模型。
    不进行知识库检索。
    不进行逐题重复调用。
    """

    if not question_answers:
        return []

    compact_answers = []

    for index, item in enumerate(question_answers, start=1):
        compact_answers.append({
            "question_index": index,
            "question": str(item.get("question", ""))[:1000],
            "answer": str(item.get("answer", ""))[:1500],
        })

    system_prompt = f"""
你是职智 Agent 的计算机考研 408 复试评估专家。

现在整场面试已经结束，请一次性评估候选人的全部回答。

面试模式：{mode}

评分维度：
{json.dumps(DIMENSIONS, ensure_ascii=False)}

评估要求：
1. 必须逐题评价，不能遗漏任何一道题。
2. 每题独立评分，范围为 0—100。
3. 重点判断计算机专业知识是否准确。
4. 区分知识错误、内容遗漏和表达不清。
5. 不得编造候选人的经历或回答中不存在的内容。
6. strengths 每题最多 2 条。
7. weaknesses 每题最多 2 条。
8. knowledge_gaps 每题最多 3 条。
9. evidence 每题最多 2 条，必须来自题目和回答。
10. feedback 每题不超过 80 字。
11. 无法可靠判断的知识点，在 evidence 中标记“待核验”。
12. needs_review 为 true 表示该题存在需要复习或核验的知识点。
13. 不要因为回答简短就直接判定错误。
14. 只输出 JSON，不要输出 Markdown 或额外解释。

严格使用以下格式：

{{
  "reviews": [
    {{
      "question_index": 1,
      "score": 80,
      "dimension_scores": {{
        "理论准确性": 85,
        "逻辑表达": 80,
        "项目理解深度": 80,
        "科研潜力": 75,
        "语言表达": 80
      }},
      "strengths": ["回答优点"],
      "weaknesses": ["回答不足"],
      "knowledge_gaps": ["薄弱知识点"],
      "evidence": ["判断依据"],
      "feedback": "简短评价",
      "needs_review": false
    }}
  ]
}}

reviews 数组必须与输入问答数量完全一致。
每道题的 question_index 必须与输入序号一致。
"""

    user_prompt = (
        "请一次性评估以下整场面试问答：\n"
        + json.dumps(compact_answers, ensure_ascii=False)
    )

    try:
        # 整场面试唯一一次大模型评估调用
        raw = ask_llm(system_prompt, user_prompt)

        data = _extract_json(raw)
        reviews = data.get("reviews")

        if not isinstance(reviews, list):
            raise ValueError("reviews 必须是数组")

        review_map = {}

        for item in reviews:
            if not isinstance(item, dict):
                continue

            try:
                index = int(item.get("question_index"))
            except (TypeError, ValueError):
                continue

            if 1 <= index <= len(question_answers):
                review_map[index] = item

        results = []

        for index in range(1, len(question_answers) + 1):
            item = review_map.get(index)

            if item is None:
                item = {
                    "score": 60,
                    "weaknesses": ["模型未返回本题的完整评价"],
                    "knowledge_gaps": [],
                    "evidence": ["本题评价结果不完整，建议核验"],
                    "feedback": "本题评价不完整，建议进一步核验。",
                    "needs_review": True,
                }

            results.append(_normalize_review(item, index))

        return results

    except Exception as exc:
        print(
            f"[整场评估] 统一评估失败：{type(exc).__name__}: {exc}",
            flush=True,
        )

        # 降级处理，避免评估失败导致面试结束流程崩溃
        return [
            {
                "score": 60,
                "dimension_scores": {
                    dimension: 60 for dimension in DIMENSIONS
                },
                "strengths": [],
                "weaknesses": ["本题自动评估未能完成"],
                "knowledge_gaps": [],
                "evidence": ["本次结果需要进一步核验"],
                "feedback": "本题暂时无法完成自动评估。",
                "needs_review": True,
            }
            for _ in question_answers
        ]
