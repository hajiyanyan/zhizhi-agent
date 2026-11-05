
import { useState } from 'react'
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  MessageSquare,
  Send,
  Sparkles,
  Target,
  UserRound,
  FileText,
  RefreshCw,
  Award,
  BookOpen,
} from 'lucide-react'

import {
  startInterview,
  submitAnswer,
  getNextQuestion,
  generateInterviewReport,
  uploadResume,
  type InterviewReport,
} from './api/interview'

interface InterviewProps {
  onBack: () => void
  onMemoryUpdated?: () => Promise<void> | void
}

type InterviewStatus = 'ready' | 'answering' | 'finished'

function ReportValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-sm text-white/40">暂无内容</p>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-sm text-white/40">暂无内容</p>
    }

    return (
      <ul className="space-y-3">
        {value.map((item, index) => (
          <li
            key={index}
            className="rounded-lg border border-white/10 bg-black/10 p-3 text-sm leading-7 text-white/75"
          >
            <ReportValue value={item} />
          </li>
        ))}
      </ul>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)

    if (!entries.length) {
      return <p className="text-sm text-white/40">暂无内容</p>
    }

    return (
      <div className="space-y-3">
        {entries.map(([key, item]) => (
          <div
            key={key}
            className="rounded-lg border border-white/10 bg-black/10 p-3"
          >
            <div className="mb-2 text-sm font-medium text-violet-200">
              {key}
            </div>
            <div className="text-sm leading-7 text-white/70">
              <ReportValue value={item} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-7 text-white/75">
      {String(value)}
    </p>
  )
}

export default function Interview({
  onBack,
  onMemoryUpdated,
}: InterviewProps) {
  // 报考信息
  const [major, setMajor] = useState('计算机科学与技术')
  const [customMajor, setCustomMajor] = useState('')
  const [researchDirection, setResearchDirection] = useState('')
  const [targetSchool, setTargetSchool] = useState('')

  // 简历
  const [resumeText, setResumeText] = useState('')
  const [resumeFileName, setResumeFileName] = useState('')

  const selectedMajor =
    major === '其他' ? customMajor.trim() : major

  // 面试设置
  const [pressureMode, setPressureMode] = useState(false)
  const [maxQuestions, setMaxQuestions] = useState(8)

  // 面试状态
  const [sessionId, setSessionId] = useState('')
  const [userId, setUserId] = useState<number | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [questionCount, setQuestionCount] = useState(1)

  const [status, setStatus] = useState<InterviewStatus>('ready')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loadingMessage, setLoadingMessage] = useState('')
  const [streamingQuestion, setStreamingQuestion] = useState(false)

  // 报告状态
  const [report, setReport] = useState<InterviewReport | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportCached, setReportCached] = useState(false)

  const cardStyle = {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(18px)',
    borderRadius: '18px',
  } as const

  // 流式回调：收到模型生成的文字就立即显示
  function createStreamCallbacks() {
    return {
      onMeta: (data: {
        session_id: string
        user_id?: number
        question_count?: number
      }) => {
        if (data.session_id) {
          setSessionId(data.session_id)
        }

        if (data.user_id !== undefined) {
          setUserId(data.user_id)
          localStorage.setItem(
            'zhizhi_user_id',
            String(data.user_id),
          )
        }

        if (data.question_count) {
          setQuestionCount(data.question_count)
        }

        setStatus('answering')
        setStreamingQuestion(true)
      },

      onStatus: (data: { message: string }) => {
        setLoadingMessage(data.message)
      },

      onChunk: (content: string) => {
        setQuestion((previous) => previous + content)
        setStreamingQuestion(true)
      },

      onDone: (data: {
        session_id?: string
        user_id?: number
        question_count?: number
        finished?: boolean
      }) => {
        if (data.session_id) {
          setSessionId(data.session_id)
        }

        if (data.user_id !== undefined) {
          setUserId(data.user_id)
          localStorage.setItem(
            'zhizhi_user_id',
            String(data.user_id),
          )
        }

        if (data.question_count) {
          setQuestionCount(data.question_count)
        }

        setStreamingQuestion(false)
        setLoadingMessage('')
      },
    }
  }

  // 生成报告
  async function handleGenerateReport() {
    if (!sessionId) return

    setReportLoading(true)
    setReportError('')

    try {
      const result = await generateInterviewReport(sessionId)
      setReport(result.report)
      setReportCached(Boolean(result.cached))
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : '面试报告生成失败',
      )
    } finally {
      setReportLoading(false)
    }
  }

  // 开始面试
  async function handleStart() {
    if (loading) return

    if (!selectedMajor) {
      setError('请填写报考专业')
      return
    }

    if (!resumeText.trim()) {
      setError('请填写或上传个人简历内容')
      return
    }

    setLoading(true)
    setError('')
    setLoadingMessage('正在准备面试资料...')
    setStreamingQuestion(true)

    setQuestion('')
    setAnswer('')
    setQuestionCount(1)
    setSessionId('')
    setUserId(null)

    setReport(null)
    setReportError('')
    setReportCached(false)

    const interviewMaterial = [
      `报考专业：${selectedMajor}`,
      researchDirection.trim()
        ? `研究方向：${researchDirection.trim()}`
        : '',
      targetSchool.trim()
        ? `目标院校：${targetSchool.trim()}`
        : '',
      `个人简历：\n${resumeText.trim()}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    try {
      const savedUserId = localStorage.getItem('zhizhi_user_id')

      await startInterview(
        {
          mode: '408',
          user_id: savedUserId
            ? Number(savedUserId)
            : undefined,
          material: interviewMaterial,
          pressure_mode: pressureMode,
          max_questions: maxQuestions,
        },
        createStreamCallbacks(),
      )

      setStreamingQuestion(false)
      setLoadingMessage('')
      setStatus('answering')

    } catch (err) {
      setStreamingQuestion(false)
      setError(
        err instanceof Error
          ? err.message
          : '开始面试失败，请稍后重试',
      )
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  // 提交回答并生成下一题
  async function handleSubmitAnswer() {
    if (!answer.trim() || !sessionId || loading) return

    setLoading(true)
    setError('')
    setLoadingMessage('正在评估你的回答...')

    try {
      const evaluationResult = await submitAnswer(
        sessionId,
        answer.trim(),
      )

      // 如果产生新的薄弱知识点，刷新长期记忆
      if (
        evaluationResult.updated_knowledge_gaps &&
        evaluationResult.updated_knowledge_gaps.length > 0
      ) {
        await onMemoryUpdated?.()
      }

      setAnswer('')
      setQuestion('')
      setStreamingQuestion(true)
      setLoadingMessage('正在生成下一道个性化问题...')

      const nextResult = await getNextQuestion(
        sessionId,
        createStreamCallbacks(),
      )

      if (nextResult.finished) {
        setStreamingQuestion(false)
        setStatus('finished')
        setLoadingMessage('正在生成面试报告...')
        await handleGenerateReport()
        return
      }

      setQuestionCount(
        nextResult.question_count || questionCount + 1,
      )

      setStatus('answering')
      setStreamingQuestion(false)

    } catch (err) {
      setStreamingQuestion(false)
      setError(
        err instanceof Error
          ? err.message
          : '回答提交失败，请稍后重试',
      )
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  // 重新开始
  function handleRestart() {
    setSessionId('')
    setUserId(null)
    setQuestion('')
    setAnswer('')
    setQuestionCount(1)

    setStatus('ready')
    setLoading(false)
    setStreamingQuestion(false)
    setLoadingMessage('')
    setError('')

    setReport(null)
    setReportError('')
    setReportLoading(false)
    setReportCached(false)
  }

  return (
    <div className="min-h-screen px-4 py-6 text-white md:px-8">
      <div className="mx-auto max-w-5xl">
        {/* 顶部导航 */}
        <div className="mb-8 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
          >
            <ArrowLeft size={17} />
            返回工作台
          </button>

          <div className="flex items-center gap-2 text-sm text-white/60">
            <BrainCircuit size={18} className="text-violet-300" />
            职智 Agent · 408 考研复试
          </div>
        </div>

        {/* 标题 */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2 text-sm text-violet-300">
            <Sparkles size={16} />
            INTELLIGENT INTERVIEW
          </div>

          <h1 className="mb-3 text-3xl font-bold md:text-4xl">
            {status === 'ready'
              ? '开启你的个性化复试'
              : status === 'finished'
                ? '本场面试已结束'
                : '正在进行智能面试'}
          </h1>

          <p className="text-sm text-white/50">
            根据个人简历、报考专业和研究方向生成个性化复试问题
          </p>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            <CircleAlert size={19} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 准备页面 */}
        {status === 'ready' && (
          <div className="space-y-6">
            <section className="p-6 md:p-8" style={cardStyle}>
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-xl bg-violet-500/20 p-3">
                  <BrainCircuit size={25} className="text-violet-300" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">
                    计算机考研复试模拟面试
                  </h2>
                  <p className="mt-1 text-sm text-white/45">
                    根据你的个人背景生成专属面试问题
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-4">
                <div className="mb-2 text-sm font-medium text-violet-200">
                  面试考查范围
                </div>
                <p className="text-sm leading-7 text-white/65">
                  数据结构、计算机网络、操作系统、计算机组成原理，
                  以及个人简历、项目经历、科研经历和报考专业相关问题。
                </p>
              </div>
            </section>

            {/* 报考信息 */}
            <section className="space-y-5 p-6 md:p-8" style={cardStyle}>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Target size={20} className="text-violet-300" />
                报考信息
              </h2>

              <div>
                <label className="mb-2 block text-sm text-white/70">
                  报考专业 <span className="ml-1 text-red-300">*</span>
                </label>

                <select
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-violet-400"
                >
                  <option value="计算机科学与技术">计算机科学与技术</option>
                  <option value="软件工程">软件工程</option>
                  <option value="网络空间安全">网络空间安全</option>
                  <option value="人工智能">人工智能</option>
                  <option value="电子信息">电子信息</option>
                  <option value="网络工程">网络工程</option>
                  <option value="其他">其他计算机相关专业</option>
                </select>
              </div>

              {major === '其他' && (
                <div>
                  <label className="mb-2 block text-sm text-white/70">
                    具体专业 <span className="ml-1 text-red-300">*</span>
                  </label>
                  <input
                    value={customMajor}
                    onChange={(e) => setCustomMajor(e.target.value)}
                    placeholder="请输入报考专业"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-violet-400"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm text-white/70">
                  研究方向
                </label>
                <input
                  value={researchDirection}
                  onChange={(e) => setResearchDirection(e.target.value)}
                  placeholder="例如：人工智能、计算机视觉、软件工程、网络安全等"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-violet-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/70">
                  目标院校
                </label>
                <input
                  value={targetSchool}
                  onChange={(e) => setTargetSchool(e.target.value)}
                  placeholder="请输入目标院校名称（选填）"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-violet-400"
                />
              </div>
            </section>

            {/* 简历 */}
            <section className="space-y-5 p-6 md:p-8" style={cardStyle}>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <FileText size={20} className="text-violet-300" />
                个人简历与复试材料
              </h2>

              <div>
                <label className="mb-2 block text-sm text-white/70">
                  简历内容 <span className="ml-1 text-red-300">*</span>
                </label>

                <textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="请粘贴个人简历、项目经历、科研经历、竞赛经历、本科课程和复试自述等内容。"
                  rows={9}
                  className="w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white outline-none placeholder:text-white/30 focus:border-violet-400"
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <label className="mb-3 block text-sm text-white/70">
                  上传个人简历
                </label>

                <input
                  type="file"
                  accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  disabled={loading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return

                    try {
                      setError('')
                      setLoading(true)

                      const result = await uploadResume(file)
                      setResumeText(result.content)
                      setResumeFileName(result.filename)
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : '简历上传失败，请重新尝试',
                      )
                    } finally {
                      setLoading(false)
                      e.target.value = ''
                    }
                  }}
                  className="w-full text-sm text-white/60 file:mr-4 file:rounded-lg file:border-0 file:bg-violet-500/20 file:px-4 file:py-2 file:text-sm file:text-violet-200 hover:file:bg-violet-500/30 disabled:opacity-50"
                />

                {resumeFileName && (
                  <p className="mt-3 text-xs text-emerald-300">
                    <CheckCircle2 size={14} className="mr-1 inline" />
                    已解析：{resumeFileName}
                  </p>
                )}

                <p className="mt-2 text-xs text-white/35">
                  支持 Word（DOCX）、PDF、TXT 和 MD 文件。
                </p>
              </div>
            </section>

            {/* 面试参数 */}
            <section className="space-y-5 p-6 md:p-8" style={cardStyle}>
              <h2 className="text-lg font-semibold">面试参数设置</h2>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="mb-1 text-sm font-medium">
                    面试题目数量
                  </div>
                  <p className="text-xs text-white/40">
                    本场面试最多生成的问题数量
                  </p>
                </div>

                <select
                  value={maxQuestions}
                  onChange={(e) => setMaxQuestions(Number(e.target.value))}
                  className="rounded-lg border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white outline-none"
                >
                  {[3, 5, 8, 10, 15, 20, 30].map((number) => (
                    <option key={number} value={number}>
                      {number} 道
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
                <div>
                  <div className="mb-1 text-sm font-medium">
                    压力面试模式
                  </div>
                  <div className="text-xs text-white/40">
                    开启更具挑战性的专业追问
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={pressureMode}
                  onChange={(e) => setPressureMode(e.target.checked)}
                  className="h-5 w-5 accent-violet-500"
                />
              </label>

              <button
                onClick={handleStart}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-4 font-semibold shadow-lg shadow-violet-900/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <LoaderCircle size={19} className="animate-spin" />
                ) : (
                  <Sparkles size={19} />
                )}
                {loading
                  ? loadingMessage || 'AI 正在处理中...'
                  : '开始个性化模拟面试'}
              </button>

              {loading && (
                <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-4">
                  <div className="flex items-center gap-3">
                    <LoaderCircle
                      size={20}
                      className="animate-spin text-violet-300"
                    />
                    <div>
                      <p className="text-sm font-medium text-violet-200">
                        职智 Agent 正在生成面试问题
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        正在等待模型响应，请勿重复提交。
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* 面试进行中 */}
        {status === 'answering' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-violet-500/20 px-3 py-2 text-sm text-violet-200">
                  408 考研复试
                </span>
                <span className="text-sm text-white/50">
                  第 {questionCount} / {maxQuestions} 题
                </span>
              </div>

              <span className="flex items-center gap-2 text-sm text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                面试进行中
              </span>
            </div>

            <section className="p-6 md:p-8" style={cardStyle}>
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-xl bg-violet-500/20 p-3">
                  <BrainCircuit size={24} className="text-violet-300" />
                </div>
                <div>
                  <div className="font-semibold">AI 面试官</div>
                  <div className="text-xs text-white/40">
                    个性化提问 · 智能动态追问
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-5">
                <div className="mb-3 text-xs font-medium text-violet-300">
                  INTERVIEW QUESTION
                </div>

                {question ? (
                  <p className="whitespace-pre-wrap text-base leading-8 text-white md:text-lg">
                    {question}
                    {streamingQuestion && (
                      <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-violet-300" />
                    )}
                  </p>
                ) : (
                  <div className="flex items-center gap-3 text-sm text-violet-200">
                    <LoaderCircle size={18} className="animate-spin" />
                    {loadingMessage || 'AI 正在生成面试问题...'}
                  </div>
                )}
              </div>
            </section>

            <section className="p-6 md:p-8" style={cardStyle}>
              <div className="mb-4 flex items-center gap-2">
                <UserRound size={19} className="text-violet-300" />
                <h2 className="font-semibold">你的回答</h2>
              </div>

              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={loading || streamingQuestion || !question}
                placeholder="请在这里输入你的回答，尽量清晰地表达思路和专业知识……"
                rows={7}
                className="w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white outline-none placeholder:text-white/30 focus:border-violet-400 disabled:opacity-50"
              />

              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSubmitAnswer}
                  disabled={
                    loading ||
                    streamingQuestion ||
                    !question ||
                    !answer.trim()
                  }
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? (
                    <LoaderCircle size={17} className="animate-spin" />
                  ) : (
                    <Send size={17} />
                  )}
                  {loading
                    ? loadingMessage || 'AI 正在处理，请稍候...'
                    : '提交回答并继续'}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* 面试结束 */}
        {status === 'finished' && (
          <div className="space-y-6">
            <section className="p-8 text-center md:p-12" style={cardStyle}>
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 size={40} className="text-emerald-300" />
              </div>

              <h2 className="mb-3 text-2xl font-bold">
                恭喜完成本场面试！
              </h2>

              <p className="mb-7 text-sm leading-7 text-white/50">
                本场面试已结束，系统正在整理你的回答、评分和薄弱知识点。
              </p>

              <div className="mb-8 rounded-xl bg-white/5 p-5">
                <div className="text-sm text-white/50">本场完成题数</div>
                <div className="mt-2 text-3xl font-bold text-violet-300">
                  {questionCount}
                </div>
              </div>

              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  onClick={handleRestart}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-7 py-3 font-semibold"
                >
                  再来一场
                </button>
                <button
                  onClick={onBack}
                  className="rounded-xl border border-white/15 bg-white/5 px-7 py-3 text-white/80"
                >
                  返回工作台
                </button>
              </div>
            </section>

            {reportLoading && (
              <section className="p-10 text-center" style={cardStyle}>
                <LoaderCircle
                  size={34}
                  className="mx-auto mb-4 animate-spin text-violet-300"
                />
                <h3 className="mb-2 font-semibold">
                  AI 正在生成你的面试报告
                </h3>
                <p className="text-sm text-white/45">
                  正在整理专业知识掌握情况和简历项目表现，请稍候……
                </p>
              </section>
            )}

            {reportError && !reportLoading && (
              <section className="p-6" style={cardStyle}>
                <div className="mb-3 flex items-center gap-2 text-red-300">
                  <CircleAlert size={20} />
                  <h3 className="font-semibold">报告生成暂时失败</h3>
                </div>
                <p className="mb-5 text-sm leading-7 text-white/60">
                  {reportError}
                </p>
                <button
                  onClick={handleGenerateReport}
                  disabled={reportLoading}
                  className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold transition hover:bg-violet-500 disabled:opacity-50"
                >
                  <RefreshCw size={16} />
                  重新生成报告
                </button>
              </section>
            )}

            {report && !reportLoading && (
              <div className="space-y-6">
                <section className="p-6 md:p-8" style={cardStyle}>
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-violet-500/20 p-3">
                        <FileText size={24} className="text-violet-300" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">
                          AI 考研复试分析报告
                        </h2>
                        <p className="mt-1 text-xs text-white/40">
                          计算机考研 408 · {questionCount} 道题目
                        </p>
                      </div>
                    </div>

                    {reportCached && (
                      <span className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-200">
                        已读取已保存报告
                      </span>
                    )}
                  </div>

                  <div className="mb-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-violet-300/20 bg-violet-500/10 p-6 text-center">
                      <Award size={25} className="mx-auto mb-3 text-violet-300" />
                      <div className="text-sm text-white/50">
                        本场综合得分
                      </div>
                      <div className="mt-2 text-5xl font-bold text-violet-300">
                        {report.overall_score}
                        <span className="ml-1 text-lg text-white/40">
                          / 100
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                      <div className="mb-3 text-sm text-white/50">
                        面试总体评价
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-7 text-white/80">
                        {report.summary || '暂无总体评价'}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="p-6 md:p-8" style={cardStyle}>
                  <h3 className="mb-5 flex items-center gap-2 font-semibold">
                    <Target size={19} className="text-violet-300" />
                    多维度能力分析
                  </h3>
                  <ReportValue value={report.dimension_analysis} />
                </section>

                <section className="p-6 md:p-8" style={cardStyle}>
                  <h3 className="mb-5 flex items-center gap-2 font-semibold">
                    <MessageSquare size={19} className="text-violet-300" />
                    逐题表现分析
                  </h3>
                  <ReportValue value={report.question_reviews} />
                </section>

                <section className="p-6 md:p-8" style={cardStyle}>
                  <h3 className="mb-5 flex items-center gap-2 font-semibold">
                    <BrainCircuit size={19} className="text-amber-300" />
                    薄弱知识点汇总
                  </h3>
                  <ReportValue value={report.knowledge_gaps} />
                </section>

                <section className="p-6 md:p-8" style={cardStyle}>
                  <h3 className="mb-5 flex items-center gap-2 font-semibold">
                    <Sparkles size={19} className="text-emerald-300" />
                    个性化改进建议
                  </h3>
                  <ReportValue value={report.improvement_suggestions} />
                </section>

                <section className="p-6 md:p-8" style={cardStyle}>
                  <h3 className="mb-5 flex items-center gap-2 font-semibold">
                    <BookOpen size={19} className="text-violet-300" />
                    后续训练计划
                  </h3>
                  <ReportValue value={report.training_plan} />
                </section>

                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    onClick={handleRestart}
                    className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-7 py-3 font-semibold"
                  >
                    开始新一场面试
                  </button>
                  <button
                    onClick={onBack}
                    className="rounded-xl border border-white/15 bg-white/5 px-7 py-3 text-white/80"
                  >
                    返回工作台
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 会话信息 */}
        {sessionId && status !== 'ready' && (
          <div className="mt-6 text-center text-xs text-white/30">
            会话 ID：{sessionId}
            {userId !== null && ` · 用户 ID：${userId}`}
          </div>
        )}
      </div>
    </div>
  )
}
