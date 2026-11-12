
// 本地开发使用 Vite 代理；生产环境默认直连 Render 后端。
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '' : 'https://zhizhi-agent-backend.onrender.com')
).replace(/\/$/, '')
// ==================== 统一 HTTP 请求 ====================

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch {
    throw new Error('无法连接后端，请确认 FastAPI 服务已经启动。')
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const detail = data.detail

    throw new Error(
      typeof detail === 'string'
        ? detail
        : `请求失败，HTTP ${response.status}`,
    )
  }

  return data as T
}

// ==================== 基础类型 ====================

export type InterviewMode = '408' | 'data_analyst'

export interface StartInterviewParams {
  mode: InterviewMode
  user_id?: number
  material?: string
  pressure_mode?: boolean
  max_questions?: number
}

export interface StartInterviewResult {
  session_id: string
  user_id: number
  mode: InterviewMode
  phase: string
  question_count: number
  question: string
  evidence: string
  priority_knowledge_points: string[]
  finished: boolean
}

export interface Evaluation {
  score: number
  dimension_scores: Record<string, number>
  strengths: string[]
  weaknesses: string[]
  knowledge_gaps: string[]
  evidence: string[]
  feedback: string
  needs_review: boolean
}

export interface SubmitAnswerResult {
  session_id: string
  question: string
  answer: string
  evaluation: Evaluation | null
  evidence: string
  updated_knowledge_gaps: unknown[]
  needs_review: boolean
  answered_count: number
  finished: boolean
  message: string
}

export interface NextQuestionResult {
  session_id: string
  phase?: string
  question_count?: number
  question?: string
  evidence?: string
  priority_knowledge_points?: string[]
  finished: boolean
  message?: string
}

// ==================== SSE 流式事件类型 ====================

export interface InterviewStreamMeta {
  session_id: string
  user_id?: number
  mode?: InterviewMode
  phase?: string
  question_count?: number
}

export interface InterviewStreamStatus {
  message: string
}

export interface InterviewStreamDone {
  session_id: string
  user_id?: number
  mode?: InterviewMode
  phase?: string
  question_count?: number
  evidence?: string
  priority_knowledge_points?: string[]
  finished: boolean
  message?: string
}

export interface InterviewStreamCallbacks {
  // 会话创建成功
  onMeta?: (data: InterviewStreamMeta) => void

  // 后端处理状态
  onStatus?: (data: InterviewStreamStatus) => void

  // 模型生成的问题片段
  onChunk?: (content: string) => void

  // 流式生成完成
  onDone?: (data: InterviewStreamDone) => void
}

// ==================== SSE 流式请求处理 ====================

interface SSEEvent {
  event: string
  data: string
}

/**
 * 解析 SSE 事件。
 *
 * 兼容：
 * 1. 中文 UTF-8 分段
 * 2. 网络分块传输
 * 3. 多个事件连续到达
 * 4. CRLF 和 LF 换行
 */
function parseSSEFrame(frame: string): SSEEvent | null {
  let event = 'message'
  const dataLines: string[] = []

  const lines = frame.split('\n')

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue
    }

    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event,
    data: dataLines.join('\n'),
  }
}

/**
 * 发送 SSE 请求并实时处理模型输出。
 */
async function streamRequest<T>(
  path: string,
  body: unknown,
  callbacks: InterviewStreamCallbacks = {},
): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('无法连接后端，请确认 FastAPI 服务已经启动。')
  }

  // 处理 HTTP 错误
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))

    throw new Error(
      typeof data.detail === 'string'
        ? data.detail
        : `请求失败，HTTP ${response.status}`,
    )
  }

  if (!response.body) {
    throw new Error('浏览器不支持读取流式响应。')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  let fullQuestion = ''
  let metaData: InterviewStreamMeta | null = null
  let doneData: InterviewStreamDone | null = null

  /**
   * 处理单个 SSE 事件。
   */
  function handleEvent(frame: string) {
    const parsed = parseSSEFrame(frame)

    if (!parsed) return

    let data: any

    try {
      data = JSON.parse(parsed.data)
    } catch {
      throw new Error('后端返回了无法解析的流式数据。')
    }

    switch (parsed.event) {
      case 'meta': {
        metaData = data as InterviewStreamMeta
        callbacks.onMeta?.(metaData)
        break
      }

      case 'status': {
        callbacks.onStatus?.(data as InterviewStreamStatus)
        break
      }

      case 'chunk': {
        const content = String(data.content || '')

        if (content) {
          fullQuestion += content
          callbacks.onChunk?.(content)
        }

        break
      }

      case 'done': {
        doneData = data as InterviewStreamDone
        callbacks.onDone?.(doneData)
        break
      }

      case 'error': {
        throw new Error(
          data.message || '面试问题生成失败，请稍后重试。',
        )
      }

      default: {
        console.warn('收到未知 SSE 事件：', parsed.event)
      }
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()

      if (done) break

      // 流式解码，避免中文字符被网络分块截断
      buffer += decoder.decode(value, {
        stream: true,
      })

      // 统一换行符
      buffer = buffer.replace(/\r\n/g, '\n')

      // 一个数据块中可能包含多个 SSE 事件
      let boundaryIndex = buffer.indexOf('\n\n')

      while (boundaryIndex !== -1) {
        const frame = buffer.slice(0, boundaryIndex)

        buffer = buffer.slice(boundaryIndex + 2)

        handleEvent(frame)

        boundaryIndex = buffer.indexOf('\n\n')
      }
    }

    // 处理解码器剩余内容
    buffer += decoder.decode()

    if (buffer.trim()) {
      handleEvent(buffer)
    }

  } catch (error) {
    try {
      await reader.cancel()
    } catch {
      // 忽略取消读取时的异常
    }

    throw error

  } finally {
    reader.releaseLock()
  }

  // 必须收到 done 事件才认为生成成功
  if (!doneData) {
    throw new Error('流式连接已结束，但后端没有发送完成事件。')
  }

  if (!metaData && !doneData.session_id) {
    throw new Error('后端没有返回有效的面试会话信息。')
  }

  return {
    ...(metaData || {}),
    ...doneData,
    question: fullQuestion,
  } as T
}

// ==================== 基础 API 接口 ====================

// 1. 检查后端服务

export function checkBackend() {
  return request<{
    status: string
    service: string
  }>('/api/health')
}

// 2. 开始面试：SSE 流式生成首题

export function startInterview(
  params: StartInterviewParams,
  callbacks: InterviewStreamCallbacks = {},
) {
  return streamRequest<StartInterviewResult>(
    '/api/interview/start',
    params,
    callbacks,
  )
}

// 3. 提交回答并获得 AI 评估

export function submitAnswer(
  session_id: string,
  answer: string,
) {
  return request<SubmitAnswerResult>(
    '/api/interview/answer',
    {
      method: 'POST',
      body: JSON.stringify({
        session_id,
        answer,
      }),
    },
  )
}

// 4. 生成下一道问题：SSE 流式生成

export function getNextQuestion(
  session_id: string,
  callbacks: InterviewStreamCallbacks = {},
) {
  return streamRequest<NextQuestionResult>(
    `/api/interview/next-question/${encodeURIComponent(session_id)}`,
    {},
    callbacks,
  )
}

// ==================== 专业知识问答类型 ====================

export interface KnowledgeSource {
  index: number
  source: string
  chapter: string
  content: string
  distance: number
}

export interface KnowledgeQueryResult {
  mode: '408'
  success: boolean
  question: string
  answer: string
  answer_type: 'knowledge_base' | 'ai_supplement'
  has_evidence: boolean
  sources: KnowledgeSource[]
  message: string
}

// 5. 查询专业知识库并获得 AI 回答

export function queryKnowledge(
  mode: '408',
  question: string,
) {
  return request<KnowledgeQueryResult>(
    '/api/knowledge/query',
    {
      method: 'POST',
      body: JSON.stringify({
        mode,
        question,
      }),
    },
  )
}

// ==================== 面试报告类型 ====================

export interface InterviewReport {
  summary: string
  overall_score: number
  dimension_analysis: unknown
  question_reviews: unknown[]
  knowledge_gaps: unknown[]
  improvement_suggestions: unknown[]
  training_plan: unknown
}

export interface GenerateReportResult {
  session_id: string
  report_id: number | string
  report: InterviewReport
  cached: boolean
  message: string
}

export interface GetReportResult {
  session_id: string
  report: InterviewReport
  created_at?: string
}

// 6. 生成面试报告

export function generateInterviewReport(session_id: string) {
  return request<GenerateReportResult>(
    `/api/interview/report/${encodeURIComponent(session_id)}`,
    {
      method: 'POST',
    },
  )
}

// 7. 获取已经生成的面试报告

export function getInterviewReport(session_id: string) {
  return request<GetReportResult>(
    `/api/interview/report/${encodeURIComponent(session_id)}`,
  )
}

// ==================== 简历上传 ====================

// 8. 上传并解析 Word / PDF / TXT / MD 简历

export async function uploadResume(file: File): Promise<{
  filename: string
  content: string
  message: string
}> {
  const formData = new FormData()
  formData.append('file', file)

  let response: Response

  try {
    response = await fetch(`${API_BASE_URL}/api/resume/upload`, {
      method: 'POST',
      body: formData,
    })
  } catch {
    throw new Error('无法连接后端，请确认 FastAPI 服务已经启动。')
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      typeof data.detail === 'string'
        ? data.detail
        : `简历上传失败，HTTP ${response.status}`,
    )
  }

  return data
}

// ==================== 长期知识记忆 ====================

export interface KnowledgeGap {
  id: number
  user_id: number
  knowledge_point: string
  occurrence_count: number
  last_missed_at: string
  status: string
}

export interface KnowledgeMemoryResponse {
  user_id: number
  total: number
  knowledge_gaps: KnowledgeGap[]
}

// 9. 查询长期知识记忆

export function getKnowledgeMemory(userId: number) {
  return request<KnowledgeMemoryResponse>(
    `/api/memory/${userId}`,
    {
      method: 'GET',
    },
  )
}

// 修改薄弱知识点

export function updateKnowledgeMemory(
  userId: number,
  gapId: number,
  knowledgePoint: string,
) {
  return request<{
    message: string
    data: {
      id: number
      knowledge_point: string
      occurrence_count: number
    }
  }>(`/api/memory/${userId}/${gapId}`, {
    method: 'PUT',
    body: JSON.stringify({
      knowledge_point: knowledgePoint,
    }),
  })
}

// 删除薄弱知识点

export function deleteKnowledgeMemory(
  userId: number,
  gapId: number,
) {
  return request<{
    message: string
    deleted: boolean
  }>(`/api/memory/${userId}/${gapId}`, {
    method: 'DELETE',
  })
}

// ==================== 历史面试记录 ====================

export interface InterviewSession {
  session_id: string
  mode: InterviewMode
  phase: string
  started_at: string | null
  ended_at: string | null
  question_count: number
  average_score: number | null
  title: string | null
  finished: boolean
  has_report: boolean
}

export interface InterviewSessionsResponse {
  user_id: number
  total: number
  sessions: InterviewSession[]
}

// 10. 查询历史面试记录

export function getInterviewSessions(userId: number) {
  return request<InterviewSessionsResponse>(
    `/api/interview/sessions/${userId}`,
    {
      method: 'GET',
    },
  )
}
