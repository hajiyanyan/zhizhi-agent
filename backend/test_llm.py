from services.llm_service import ask_llm

answer = ask_llm(
    system_prompt="你是一名计算机考研复试考官。",
    user_prompt="请提出一道关于 TCP 流量控制的基础问题。",
)

print(answer)