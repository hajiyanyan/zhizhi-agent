
from knowledge.retriever import retrieve
from services.llm_service import ask_llm


# 知识库检索阈值。
# ChromaDB 使用 cosine distance 时，数值越小通常代表越相似。
RETRIEVAL_THRESHOLD = 0.75

# 知识问答最多取 4 条资料，控制检索和模型输入长度。
KNOWLEDGE_TOP_K = 4


def _get_valid_results(
    mode: str,
    question: str,
    top_k: int = KNOWLEDGE_TOP_K,
    threshold: float = RETRIEVAL_THRESHOLD,
) -> list[dict]:
    """执行向量检索并过滤低相关度资料。"""

    if mode != "408":
        raise ValueError("目前仅支持计算机考研 408 知识库")

    if not question or not question.strip():
        return []

    raw_results = retrieve(
        mode=mode,
        query=question.strip(),
        top_k=top_k,
    )

    valid_results = []

    for item in raw_results:
        distance = item.get("distance")

        if distance is None:
            continue

        if distance > threshold:
            continue

        if not item.get("text"):
            continue

        valid_results.append(item)

    return valid_results


def _format_sources(results: list[dict]) -> list[dict]:
    """整理知识库来源，避免伪造来源信息。"""

    sources = []

    for index, item in enumerate(results, start=1):
        metadata = item.get("metadata") or {}

        source = (
            metadata.get("source")
            or metadata.get("file_name")
            or metadata.get("filename")
            or "未标注来源"
        )

        chapter = metadata.get("chapter") or "未标注章节"

        sources.append({
            "index": index,
            "source": str(source),
            "chapter": str(chapter),
            "content": str(item.get("text", ""))[:600],
            "distance": round(float(item["distance"]), 4),
        })

    return sources


def query_knowledge(
    mode: str,
    question: str,
    top_k: int = 3,
    threshold: float = RETRIEVAL_THRESHOLD,
) -> str:
    """
    原有面试流程使用的知识检索入口。
    保留字符串返回格式，避免影响其他 Agent。
    """

    valid_results = _get_valid_results(
        mode=mode,
        question=question,
        top_k=top_k,
        threshold=threshold,
    )

    if not valid_results:
        return "资料不足，待核验"

    parts = []

    for idx, item in enumerate(valid_results, start=1):
        metadata = item.get("metadata") or {}

        source = (
            metadata.get("source")
            or metadata.get("file_name")
            or metadata.get("filename")
            or "未知来源"
        )

        chapter = metadata.get("chapter", "未标注章节")
        content = item.get("text", "")

        parts.append(
            f"资料 {idx}：\n"
            f"来源：{source}\n"
            f"章节：{chapter}\n"
            f"内容：{content[:800]}"
        )

    return "\n\n".join(parts)


def answer_knowledge(
    mode: str,
    question: str,
) -> dict:
    """
    专业知识问答入口。

    先检索知识库，再调用一次大模型生成答案。
    知识库没有匹配资料时，允许 AI 使用通用 408 知识回答，
    但明确标注为 AI 补充，不伪造知识库来源。
    """

    question = (question or "").strip()

    if not question:
        raise ValueError("请输入需要查询的专业问题")

    if mode != "408":
        raise ValueError("目前仅支持计算机考研 408 知识库")

    # 第一步：快速检索
    results = _get_valid_results(
        mode=mode,
        question=question,
        top_k=KNOWLEDGE_TOP_K,
        threshold=RETRIEVAL_THRESHOLD,
    )

    sources = _format_sources(results)

    # 第二步：整理少量检索资料
    if results:
        evidence_parts = []

        for index, item in enumerate(results, start=1):
            metadata = item.get("metadata") or {}

            source = (
                metadata.get("source")
                or metadata.get("file_name")
                or metadata.get("filename")
                or "未标注来源"
            )

            chapter = metadata.get("chapter") or "未标注章节"

            evidence_parts.append(
                f"资料{index}：{source}，{chapter}\n"
                f"{str(item.get('text', ''))[:600]}"
            )

        evidence = "\n\n".join(evidence_parts)
        answer_type = "knowledge_base"
    else:
        evidence = "知识库没有检索到足够相关的资料。"
        answer_type = "ai_supplement"

    # 第三步：一次模型调用完成回答
    system_prompt = """
你是一名计算机考研 408 专业课教师，负责回答专业知识问题。

回答要求：
1. 直接回答用户的问题，不要寒暄。
2. 优先使用提供的知识库资料。
3. 如果资料不足，可以使用你掌握的标准计算机专业知识补充。
4. 不得编造教材名称、章节、页码或知识库来源。
5. 如果不同教材或场景存在差异，要明确说明。
6. 不确定的内容必须说明不确定，不得强行给出结论。
7. 使用简洁、准确、适合考研复试的中文。
8. 优先采用以下结构：
   【核心答案】
   【原理解释】
   【易错点】
   【复试表达】
9. 不需要每个问题都机械地写满四部分。
10. 总体控制在 500 字以内。
"""

    user_prompt = f"""
用户问题：
{question}

知识库检索资料：
{evidence}

请结合问题和资料，给出准确、清晰的 408 专业知识回答。
"""

    try:
        answer = ask_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            timeout_seconds=120.0,
            max_tokens=700,
        )

        return {
            "success": True,
            "question": question,
            "answer": answer,
            "answer_type": answer_type,
            "has_evidence": bool(results),
            "sources": sources,
            "message": (
                "回答参考了知识库资料"
                if results
                else "当前知识库没有检索到相关资料，本回答由 AI 专业知识补充"
            ),
        }

    except Exception as exc:
        # AI 调用失败时，不把失败伪装成成功回答。
        # 如果有知识库资料，仍将资料返回给前端。
        return {
            "success": False,
            "question": question,
            "answer": (
                "AI 暂时无法生成答案，请稍后重试。"
                if not results
                else "AI 暂时无法生成完整答案，以下为检索到的知识库资料。"
            ),
            "answer_type": answer_type,
            "has_evidence": bool(results),
            "sources": sources,
            "message": str(exc),
        }
