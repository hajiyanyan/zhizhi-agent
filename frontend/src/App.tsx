
import { useCallback, useEffect, useRef, useState } from 'react'
import Interview from './Interview'
import VideoInterview from './VideoInterview'

import {
  queryKnowledge,
  getKnowledgeMemory,
  updateKnowledgeMemory,
  deleteKnowledgeMemory,
  getInterviewSessions,
  getInterviewReport,
  generateInterviewReport,
  type KnowledgeGap,
  type InterviewSession,
  type InterviewReport,
} from './api/interview'

import {
  LayoutDashboard,
  Video,
  BrainCircuit,
  BookOpen,
  FileText,
  Settings,
  Bell,
  Search,
  Sparkles,
  ArrowUpRight,
  Play,
  ChevronRight,
  Menu,
  X,
  Network,
  CheckCircle2,
  MessageSquareText,
  Target,
  History,
  Zap,
  CircleHelp,
  Database,
  Cpu,
  Server,
  Layers,
  BookMarked,
  ClipboardList,
  ArrowLeft,
  RefreshCw,
  Pencil,
  Trash2,
  Save,
  XCircle,
} from 'lucide-react'

// 当前测试用户 ID，后续接入登录系统后再替换为动态用户 ID
// 获取当前登录用户 ID，与面试模块保持一致
function getMemoryUserId(): number {
  const savedUserId = localStorage.getItem('zhizhi_user_id')

  if (savedUserId) {
    const userId = Number(savedUserId)

    if (Number.isInteger(userId) && userId > 0) {
      return userId
    }
  }

  // 兼容之前创建的测试用户
  return 1
}

type NavItem = {
  label: string
  icon: typeof LayoutDashboard
}

const navItems: NavItem[] = [
  { label: '工作台', icon: LayoutDashboard },
  { label: '模拟面试', icon: Video },
  { label: '视频面试', icon: Video },
  { label: '知识记忆', icon: BrainCircuit },
  { label: '专业知识库', icon: BookOpen },
  { label: '面试报告', icon: FileText },
]

const trainingModes = [
  {
    id: 'data-structure',
    title: '数据结构',
    subtitle: '核心理论与算法',
    description: '线性表、树、图、查找、排序与算法复杂度',
    icon: Network,
    tag: '408 专业课',
  },
  {
    id: 'computer-organization',
    title: '计算机组成原理',
    subtitle: '计算机系统基础',
    description: '数据表示、运算器、存储器、指令系统与 CPU',
    icon: Cpu,
    tag: '408 专业课',
  },
  {
    id: 'operating-system',
    title: '操作系统',
    subtitle: '系统资源管理',
    description: '进程线程、内存管理、文件系统与 I/O 管理',
    icon: Server,
    tag: '408 专业课',
  },
  {
    id: 'computer-network',
    title: '计算机网络',
    subtitle: '网络体系与协议',
    description: 'TCP/IP、网络层、传输层、应用层与网络安全基础',
    icon: Database,
    tag: '408 专业课',
  },
]

const features = [
  {
    icon: MessageSquareText,
    title: 'AI 智能模拟面试',
    description: '模拟真实复试面试官，根据个人简历和回答动态生成追问。',
    color: 'text-violet-200',
    bg: 'bg-violet-400/15',
    target: '模拟面试',
  },
  {
    icon: Target,
    title: '多维度回答评估',
    description: '从理论准确性、逻辑表达、项目理解和科研潜力等角度评估。',
    color: 'text-cyan-200',
    bg: 'bg-cyan-400/15',
    target: '面试报告',
  },
  {
    icon: BrainCircuit,
    title: '个性化记忆系统',
    description: '记录面试中的知识薄弱点，帮助持续追踪需要加强的内容。',
    color: 'text-fuchsia-200',
    bg: 'bg-fuchsia-400/15',
    target: '知识记忆',
  },
  {
    icon: BookOpen,
    title: '408 专业知识库',
    description: '结合计算机专业知识资料，为复试理论问题提供检索支持。',
    color: 'text-blue-200',
    bg: 'bg-blue-400/15',
    target: '专业知识库',
  },
]

function App() {
  const [knowledgeHasEvidence] = useState(false)
  const [activeNav, setActiveNav] = useState('工作台')
  const [notice, setNotice] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [showInterview, setShowInterview] = useState(false)
  const [showVideoInterview, setShowVideoInterview] = useState(false)
  const [selectedMode, setSelectedMode] = useState('data-structure')

  // 专业知识库检索状态
  const [knowledgeQuestion, setKnowledgeQuestion] = useState('')
  const [knowledgeResult, setKnowledgeResult] = useState('')
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeError, setKnowledgeError] = useState('')
  const [knowledgeSearched, setKnowledgeSearched] = useState(false)

  // 知识记忆状态
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([])
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memoryError, setMemoryError] = useState('')
  const [memoryLoaded, setMemoryLoaded] = useState(false)

  const [editingGapId, setEditingGapId] = useState<number | null>(null)
  const [editingKnowledgePoint, setEditingKnowledgePoint] = useState('')
  const [savingGapId, setSavingGapId] = useState<number | null>(null)
  const [deletingGapId, setDeletingGapId] = useState<number | null>(null)

  const memoryRequestInFlight = useRef(false)

  // 面试报告状态
  const [interviewSessions, setInterviewSessions] = useState<InterviewSession[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState('')
  const [reportsLoaded, setReportsLoaded] = useState(false)

  const [selectedReportSessionId, setSelectedReportSessionId] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<InterviewReport | null>(null)
  const [reportDetailLoading, setReportDetailLoading] = useState(false)
  const [reportActionSessionId, setReportActionSessionId] = useState<string | null>(null)
  const [reportDetailError, setReportDetailError] = useState('')

  const reportsRequestInFlight = useRef(false)
  const reportDetailRequestInFlight = useRef(false)

  const [showHelp, setShowHelp] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [defaultPressureMode, setDefaultPressureMode] = useState(false)
  const [defaultQuestionCount, setDefaultQuestionCount] = useState(8)

  const handleNavClick = (label: string) => {
    setActiveNav(label)
    setNotice('')
    setSidebarOpen(false)
    if (label === '视频面试') setShowVideoInterview(true)
  }

  const handleStartInterview = () => {
    setNotice('')
    setShowInterview(true)
  }

  // 查询 408 专业知识库
  const handleKnowledgeQuery = async () => {
    const question = knowledgeQuestion.trim()

    if (!question) {
      setKnowledgeError('请先输入需要查询的专业问题。')
      setKnowledgeResult('')
      setKnowledgeSearched(false)
      return
    }

    if (knowledgeLoading) return

    setKnowledgeLoading(true)
    setKnowledgeError('')
    setKnowledgeResult('')
    setKnowledgeSearched(false)

    try {
      const result = await queryKnowledge('408', question)

      setKnowledgeResult(result.answer || '')
      setKnowledgeSearched(true)

      if (!result.success) {
        setKnowledgeError(result.message || 'AI 回答暂时不可用')
      }
    } catch (error) {
      setKnowledgeError(
        error instanceof Error ? error.message : '知识检索失败，请稍后重试。',
      )
    } finally {
      setKnowledgeLoading(false)
    }
  }
  // 加载长期知识记忆
  const loadKnowledgeMemory = useCallback(async () => {
    if (memoryRequestInFlight.current) return

    memoryRequestInFlight.current = true
    setMemoryLoading(true)
    setMemoryError('')

    try {
      const result = await getKnowledgeMemory(getMemoryUserId())
      setKnowledgeGaps(result.knowledge_gaps || [])
      setMemoryLoaded(true)
    } catch (error) {
      setMemoryError(
        error instanceof Error ? error.message : '知识记忆加载失败，请稍后重试。',
      )
    } finally {
      memoryRequestInFlight.current = false
      setMemoryLoading(false)
    }
  }, [])
  
  // 进入首页或知识记忆页面时加载知识记忆
useEffect(() => {
  if (
    (activeNav === '知识记忆' || activeNav === '工作台') &&
    !memoryLoaded
  ) {
    void loadKnowledgeMemory()
  }
}, [activeNav, memoryLoaded, loadKnowledgeMemory])

  // 加载历史面试记录
  const loadInterviewSessions = useCallback(async () => {
    if (reportsRequestInFlight.current) return

    reportsRequestInFlight.current = true
    setReportsLoading(true)
    setReportsError('')

    try {
      const result = await getInterviewSessions(getMemoryUserId())
      setInterviewSessions(result.sessions || [])
      setReportsLoaded(true)
    } catch (error) {
      console.error('加载历史面试记录失败：', error)
      setReportsError(
        error instanceof Error
          ? error.message
          : '历史面试记录加载失败，请检查后端服务。',
      )
    } finally {
      reportsRequestInFlight.current = false
      setReportsLoading(false)
    }
  }, [])

  // 进入首页或面试报告页面时加载历史记录
useEffect(() => {
  if (
    (activeNav === '工作台' || activeNav === '面试报告') &&
    !reportsLoaded
  ) {
    void loadInterviewSessions()
  }
}, [activeNav, reportsLoaded, loadInterviewSessions])

  // 格式化报告字段，兼容字符串、数组和对象
// 将报告中的数组和对象转换为易读的分层文本
const formatReportValue = (value: unknown): string => {
  const fieldLabels: Record<string, string> = {
    dimension: '评价维度',
    name: '名称',
    score: '得分',
    question: '面试问题',
    answer: '回答内容',
    evaluation: '回答评价',
    feedback: '反馈意见',
    analysis: '分析',
    suggestion: '建议',
    suggestions: '建议',
    improvement: '改进方向',
    improvement_suggestions: '改进建议',
    knowledge_point: '知识点',
    knowledge_gaps: '薄弱知识点',
    reason: '失分原因',
    evidence: '参考依据',
    strengths: '优势',
    weaknesses: '不足',
    title: '标题',
    content: '内容',
    description: '说明',
    summary: '总结',
    action: '训练任务',
    priority: '优先级',
    accuracy: '准确性',
    logic: '逻辑表达',
  }

  const formatValue = (
    current: unknown,
    depth = 0,
  ): string => {
    const indent = '  '.repeat(depth)

    if (
      current === null ||
      current === undefined ||
      current === ''
    ) {
      return '暂无数据'
    }

    if (
      typeof current === 'string' ||
      typeof current === 'number' ||
      typeof current === 'boolean'
    ) {
      return String(current)
    }

    if (Array.isArray(current)) {
      if (current.length === 0) return '暂无数据'

      return current
        .map((item, index) => {
          const content = formatValue(item, depth + 1)
          return `${indent}${index + 1}. ${content}`
        })
        .join('\n\n')
    }

    if (typeof current === 'object') {
      const entries = Object.entries(
        current as Record<string, unknown>,
      )

      if (entries.length === 0) return '暂无数据'

      return entries
        .map(([key, item]) => {
          const label = fieldLabels[key] || key
          const content = formatValue(item, depth + 1)

          return `${indent}${label}：\n${content}`
        })
        .join('\n\n')
    }

    return String(current)
  }

  return formatValue(value)
}

  const formatReportDate = (value: string | null | undefined): string => {
    if (!value) return '时间暂不可用'

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      return '时间暂不可用'
    }

    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 打开已有报告，或者为已完成面试生成报告
  const handleOpenReport = async (
    session: InterviewSession,
    shouldGenerate = false,
  ) => {
    if (!session.finished) {
      setReportDetailError('这场面试尚未完成，暂时不能查看或生成正式报告。')
      return
    }

    if (reportDetailRequestInFlight.current) return

    reportDetailRequestInFlight.current = true
    setReportActionSessionId(session.session_id)
    setReportDetailLoading(true)
    setReportDetailError('')

    try {
      let report: InterviewReport

      if (shouldGenerate) {
        const result = await generateInterviewReport(session.session_id)
        report = result.report
      } else {
        const result = await getInterviewReport(session.session_id)
        report = result.report
      }

      if (!report) {
        throw new Error('后端没有返回有效的面试报告。')
      }

      setSelectedReport(report)
      setSelectedReportSessionId(session.session_id)

      // 从首页或其他位置打开报告时，自动切换到报告页面
      setActiveNav('面试报告')
      setSidebarOpen(false)

      setInterviewSessions((previous) =>
        previous.map((item) =>
          item.session_id === session.session_id
            ? {
                ...item,
                has_report: true,
                average_score: report.overall_score ?? item.average_score,
              }
            : item,
        ),
      )
    } catch (error) {
      console.error('获取面试报告失败：', error)
      setReportDetailError(
        error instanceof Error ? error.message : '报告获取失败，请稍后重试。',
      )
    } finally {
      reportDetailRequestInFlight.current = false
      setReportDetailLoading(false)
      setReportActionSessionId(null)
    }
  }

  // 返回报告列表
  const handleBackToReports = () => {
    setSelectedReport(null)
    setSelectedReportSessionId(null)
    setReportDetailError('')
  }

  // 开始编辑知识点
  const handleStartEdit = (item: KnowledgeGap) => {
    setEditingGapId(item.id)
    setEditingKnowledgePoint(item.knowledge_point)
    setMemoryError('')
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingGapId(null)
    setEditingKnowledgePoint('')
  }

  // 保存知识点修改
  const handleUpdateKnowledge = async (gapId: number) => {
    const knowledgePoint = editingKnowledgePoint.trim()

    if (!knowledgePoint) {
      setMemoryError('知识点名称不能为空。')
      return
    }

    if (savingGapId !== null) return

    setSavingGapId(gapId)
    setMemoryError('')

    try {
      await updateKnowledgeMemory(getMemoryUserId(), gapId, knowledgePoint)

      setKnowledgeGaps((previous) =>
        previous.map((item) =>
          item.id === gapId
            ? { ...item, knowledge_point: knowledgePoint }
            : item,
        ),
      )

      setEditingGapId(null)
      setEditingKnowledgePoint('')
      setNotice('知识点修改成功。')
    } catch (error) {
      setMemoryError(
        error instanceof Error ? error.message : '修改失败，请稍后重试。',
      )
    } finally {
      setSavingGapId(null)
    }
  }

  // 删除知识点
  const handleDeleteKnowledge = async (gapId: number) => {
    if (deletingGapId !== null) return

    const confirmed = window.confirm(
      '确定要删除这条薄弱知识点记录吗？删除后无法恢复。',
    )

    if (!confirmed) return

    setDeletingGapId(gapId)
    setMemoryError('')

    try {
      await deleteKnowledgeMemory(getMemoryUserId(), gapId)

      setKnowledgeGaps((previous) =>
        previous.filter((item) => item.id !== gapId),
      )

      if (editingGapId === gapId) {
        handleCancelEdit()
      }

      setNotice('知识点记录已删除。')
    } catch (error) {
      setMemoryError(
        error instanceof Error ? error.message : '删除失败，请稍后重试。',
      )
    } finally {
      setDeletingGapId(null)
    }
  }


  // ==================== 首页真实数据统计 ====================

// 已完成面试
const completedSessions = interviewSessions.filter(
  (item) => item.finished,
)

// 已生成报告的面试
const generatedReports = interviewSessions.filter(
  (item) => item.finished && item.has_report,
)

// 计算有效评分
const scoredSessions = completedSessions.filter(
  (item) =>
    typeof item.average_score === 'number' &&
    Number.isFinite(item.average_score),
)

// 平均面试得分
const averageInterviewScore =
  scoredSessions.length > 0
    ? Math.round(
        scoredSessions.reduce(
          (total, item) => total + (item.average_score ?? 0),
          0,
        ) / scoredSessions.length,
      )
    : null

// 面试完成率
const trainingProgress =
  interviewSessions.length > 0
    ? Math.round(
        (completedSessions.length / interviewSessions.length) * 100,
      )
    : 0

// 报告生成率：只以已完成面试为分母
const reportProgress =
  completedSessions.length > 0
    ? Math.round(
        (generatedReports.length / completedSessions.length) * 100,
      )
    : 0

// 最近四场面试
const recentSessions = [...interviewSessions]
  .sort((a, b) => {
    const timeA = new Date(a.started_at).getTime()
    const timeB = new Date(b.started_at).getTime()

    return (
      (Number.isFinite(timeB) ? timeB : 0) -
      (Number.isFinite(timeA) ? timeA : 0)
    )
  })
  .slice(0, 4)

// 面试阶段中文名称
const getPhaseLabel = (phase: string) => {
  const phaseLabels: Record<string, string> = {
    intro: '自我介绍',
    theory: '专业理论',
    project: '项目经历',
    pressure: '压力面试',
    questions: '自由提问',
    review: '面试总结',
    finished: '已完成',
  }

  return phaseLabels[phase?.toLowerCase()] || phase || '未知阶段'
}

// 面试记录状态
const getSessionStatus = (session: InterviewSession) => {
  if (!session.finished) return '进行中'
  if (session.has_report) return '报告已生成'
  return '待生成报告'
}
  const handleFeatureClick = (target: string) => {
    if (target === '模拟面试') {
      handleStartInterview()
      return
    }

    handleNavClick(target)
  }

  if (showVideoInterview) {
    return (
      <VideoInterview
        defaultPressureMode={defaultPressureMode}
        defaultQuestionCount={defaultQuestionCount}
        onBack={() => {
          setShowVideoInterview(false)
          setActiveNav('工作台')
        }}
      />
    )
  }

  if (showInterview) {
    return (
      <Interview
        onBack={() => {
          setShowInterview(false)
          setActiveNav('工作台')

          // 面试结束或退出后，重新获取历史面试和知识记忆
          setReportsLoaded(false)
          setMemoryLoaded(false)

          // 清除旧报告详情，避免误显示上一场报告
          setSelectedReport(null)
          setSelectedReportSessionId(null)
        }}
      />
    )
  }

  const renderWorkspace = () => {
    switch (activeNav) {
      case '模拟面试':
        return (
          <section className="glass-panel p-6 sm:p-9">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-200">
                <Video size={24} />
              </div>
              <div>
                <p className="text-xs tracking-[2px] text-violet-200/60">
                  AI MOCK INTERVIEW
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  计算机考研 408 模拟面试
                </h2>
              </div>
            </div>

            <p className="max-w-3xl text-sm leading-7 text-white/55">
              上传个人简历，填写报考专业、研究方向和目标院校。
              职智 Agent 将结合你的个人材料开展个性化提问，
              并根据回答进行动态追问和专业能力评估。
            </p>

            <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {trainingModes.map((item) => {
                const Icon = item.icon

                return (
                  <div
                    key={item.id}
                    className="glass-card flex items-start gap-4 p-5"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-400/15 text-violet-200">
                      <Icon size={22} />
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      <p className="mt-1 text-xs text-white/40">
                        {item.subtitle}
                      </p>
                      <p className="mt-3 text-xs leading-6 text-white/45">
                        {item.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              onClick={handleStartInterview}
              className="mt-8 flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:-translate-y-1"
            >
              <Play size={17} fill="currentColor" />
              进入面试准备
              <ArrowUpRight size={17} />
            </button>
          </section>
        )

      case '知识记忆': {
        const highFrequencyCount = knowledgeGaps.filter(
          (item) => item.occurrence_count >= 3,
        ).length

        const latestGap = [...knowledgeGaps].sort(
          (a, b) =>
            new Date(b.last_missed_at).getTime() -
            new Date(a.last_missed_at).getTime(),
        )[0]

        const formatDate = (value: string) => {
          const date = new Date(value)

          if (Number.isNaN(date.getTime())) {
            return '时间暂不可用'
          }

          return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        }

        return (
          <section className="space-y-6">
            <div className="glass-panel p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-400/15 text-fuchsia-200">
                    <BrainCircuit size={24} />
                  </div>

                  <div>
                    <p className="text-xs tracking-[2px] text-fuchsia-200/60">
                      KNOWLEDGE MEMORY
                    </p>
                    <h2 className="mt-1 text-xl font-bold">个人知识记忆</h2>
                  </div>
                </div>

                <button
                  onClick={() => void loadKnowledgeMemory()}
                  disabled={memoryLoading}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    size={15}
                    className={memoryLoading ? 'animate-spin' : ''}
                  />
                  {memoryLoading ? '正在刷新' : '刷新数据'}
                </button>
              </div>

              <p className="mt-5 text-sm leading-7 text-white/50">
                这里集中展示模拟面试中发现的知识薄弱点。
                系统会记录知识点出现次数和最近一次失分时间，
                你可以在这里修改或删除相关记录。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  title: '待巩固知识点',
                  value:
                    memoryLoading && !memoryLoaded
                      ? '加载中'
                      : `${knowledgeGaps.length} 个`,
                  icon: Target,
                },
                {
                  title: '高频薄弱知识点',
                  value:
                    memoryLoading && !memoryLoaded
                      ? '加载中'
                      : `${highFrequencyCount} 个`,
                  icon: Zap,
                },
                {
                  title: '最近失分记录',
                  value: latestGap
                    ? formatDate(latestGap.last_missed_at)
                    : memoryLoading && !memoryLoaded
                      ? '加载中'
                      : '暂无记录',
                  icon: History,
                },
              ].map((item) => {
                const Icon = item.icon

                return (
                  <div key={item.title} className="glass-card p-5">
                    <Icon size={22} className="mb-4 text-violet-200" />
                    <p className="text-xs text-white/45">{item.title}</p>
                    <p className="mt-3 break-words text-sm font-semibold text-white/75">
                      {item.value}
                    </p>
                  </div>
                )
              })}
            </div>

            {memoryError && (
              <div className="rounded-xl border border-red-300/20 bg-red-400/10 p-4">
                <div className="flex items-start gap-2 text-sm text-red-200">
                  <CircleHelp size={18} className="mt-0.5 shrink-0" />
                  <span>{memoryError}</span>
                </div>
              </div>
            )}

            <div className="glass-panel p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">知识薄弱点列表</h3>
                  <p className="mt-1 text-xs text-white/35">
                    根据面试评估记录自动整理
                  </p>
                </div>

                <span className="rounded-lg border border-violet-300/20 bg-violet-400/10 px-3 py-1.5 text-xs text-violet-200">
                  共 {knowledgeGaps.length} 条记录
                </span>
              </div>

              {memoryLoading && !memoryLoaded && (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center">
                  <RefreshCw
                    size={27}
                    className="mx-auto mb-3 animate-spin text-violet-200"
                  />
                  <p className="text-sm text-white/60">
                    正在加载知识记忆数据...
                  </p>
                </div>
              )}

              {!memoryLoading &&
                memoryLoaded &&
                knowledgeGaps.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center">
                    <BookMarked
                      size={30}
                      className="mx-auto mb-3 text-white/30"
                    />
                    <p className="text-sm text-white/50">
                      目前还没有知识薄弱点记录
                    </p>
                    <p className="mt-2 text-xs leading-6 text-white/30">
                      完成模拟面试并产生评估记录后，
                      系统会自动将需要加强的知识点保存到这里。
                    </p>
                  </div>
                )}

              {knowledgeGaps.length > 0 && (
                <div className="space-y-3">
                  {knowledgeGaps.map((item) => {
                    const isEditing = editingGapId === item.id
                    const isSaving = savingGapId === item.id
                    const isDeleting = deletingGapId === item.id

                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-violet-300/20 hover:bg-white/[0.05]"
                      >
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fuchsia-400/10 text-fuchsia-200">
                                <BookMarked size={18} />
                              </div>

                              <div className="min-w-0 flex-1">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingKnowledgePoint}
                                    onChange={(event) =>
                                      setEditingKnowledgePoint(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        void handleUpdateKnowledge(item.id)
                                      }
                                      if (event.key === 'Escape') {
                                        handleCancelEdit()
                                      }
                                    }}
                                    autoFocus
                                    className="w-full rounded-lg border border-violet-300/30 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-violet-300/60"
                                    placeholder="请输入知识点名称"
                                  />
                                ) : (
                                  <h4 className="break-words text-sm font-semibold text-white/85">
                                    {item.knowledge_point}
                                  </h4>
                                )}

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/45">
                                    出现 {item.occurrence_count} 次
                                  </span>

                                  <span
                                    className={`rounded-md px-2 py-1 text-[10px] ${
                                      item.occurrence_count >= 3
                                        ? 'border border-amber-300/20 bg-amber-400/10 text-amber-200'
                                        : 'border border-blue-300/20 bg-blue-400/10 text-blue-200'
                                    }`}
                                  >
                                    {item.status ||
                                      (item.occurrence_count >= 3
                                        ? '需要重点训练'
                                        : '需要继续训练')}
                                  </span>
                                </div>

                                <p className="mt-3 text-xs text-white/35">
                                  最近失分时间：
                                  {formatDate(item.last_missed_at)}
                                </p>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() =>
                                      void handleUpdateKnowledge(item.id)
                                    }
                                    disabled={
                                      isSaving || !editingKnowledgePoint.trim()
                                    }
                                    className="flex items-center gap-1.5 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <Save size={14} />
                                    {isSaving ? '保存中' : '保存'}
                                  </button>

                                  <button
                                    onClick={handleCancelEdit}
                                    disabled={isSaving}
                                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60 transition hover:bg-white/10 disabled:opacity-40"
                                  >
                                    <XCircle size={14} />
                                    取消
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleStartEdit(item)}
                                    disabled={
                                      isDeleting || editingGapId !== null
                                    }
                                    className="flex items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-xs text-violet-200 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <Pencil size={14} />
                                    编辑
                                  </button>

                                  <button
                                    onClick={() =>
                                      void handleDeleteKnowledge(item.id)
                                    }
                                    disabled={
                                      isDeleting || editingGapId !== null
                                    }
                                    className="flex items-center gap-1.5 rounded-lg border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs text-red-200 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <Trash2 size={14} />
                                    {isDeleting ? '删除中' : '删除'}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {!memoryLoading && !memoryLoaded && memoryError && (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
                  <Database
                    size={28}
                    className="mx-auto mb-3 text-white/30"
                  />
                  <p className="text-sm text-white/50">
                    暂时无法获取知识记忆数据
                  </p>
                  <button
                    onClick={() => void loadKnowledgeMemory()}
                    className="mt-4 rounded-lg border border-violet-300/20 bg-violet-400/10 px-4 py-2 text-xs text-violet-200 transition hover:bg-violet-400/20"
                  >
                    重新加载
                  </button>
                </div>
              )}
            </div>
          </section>
        )
      }

      case '专业知识库':
        return (
          <section className="space-y-6">
            <div className="glass-panel p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-400/15 text-blue-200">
                  <BookOpen size={24} />
                </div>

                <div>
                  <p className="text-xs tracking-[2px] text-blue-200/60">
                    408 KNOWLEDGE BASE
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    计算机 408 专业知识库
                  </h2>
                </div>
              </div>

              <p className="mt-5 text-sm leading-7 text-white/50">
                知识库围绕数据结构、计算机组成原理、操作系统和计算机网络四门核心课程组织。
                输入专业问题后，系统将通过 RAG 检索已有知识资料，并展示检索结果。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {trainingModes.map((item) => {
                const Icon = item.icon

                return (
                  <div key={item.id} className="glass-card p-5">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-400/15 text-blue-200">
                      <Icon size={22} />
                    </div>

                    <h3 className="text-base font-semibold">{item.title}</h3>

                    <p className="mt-2 text-xs leading-6 text-white/45">
                      {item.description}
                    </p>

                    <div className="mt-4 flex items-center gap-2 text-xs text-blue-200/70">
                      <Layers size={14} />
                      408 专业知识分类
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="glass-panel p-6 sm:p-7">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-200">
                  <Search size={20} />
                </div>

                <div>
                  <h3 className="text-base font-semibold">专业知识检索</h3>
                  <p className="mt-1 text-xs text-white/40">
                    输入 408 专业问题，检索知识库中的相关资料
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={knowledgeQuestion}
                  onChange={(e) => setKnowledgeQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleKnowledgeQuery()
                    }
                  }}
                  placeholder="例如：请解释 TCP 的流量控制和拥塞控制有什么区别？"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-300/50 focus:bg-white/[0.08]"
                />

                <button
                  onClick={() => void handleKnowledgeQuery()}
                  disabled={knowledgeLoading}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {knowledgeLoading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      正在检索
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      开始检索
                    </>
                  )}
                </button>
              </div>

              <div className="mt-5">
                <p className="mb-3 text-xs text-white/35">
                  你也可以尝试以下问题
                </p>

                <div className="flex flex-wrap gap-2">
                  {[
                    '什么是 TCP 三次握手？',
                    '进程和线程有什么区别？',
                    '什么是 Cache 的局部性原理？',
                    '快速排序的时间复杂度是多少？',
                  ].map((question) => (
                    <button
                      key={question}
                      onClick={() => {
                        setKnowledgeQuestion(question)
                        setKnowledgeError('')
                        setKnowledgeResult('')
                        setKnowledgeSearched(false)
                      }}
                      className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/55 transition hover:border-violet-300/30 hover:bg-violet-400/10 hover:text-violet-100"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>

              {knowledgeError && (
                <div className="mt-6 rounded-xl border border-red-300/20 bg-red-400/10 p-4">
                  <div className="flex items-start gap-2 text-sm text-red-200">
                    <CircleHelp size={18} className="mt-0.5 shrink-0" />
                    <span>{knowledgeError}</span>
                  </div>
                </div>
              )}

              {knowledgeSearched && (
                <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.035] p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Database size={18} className="text-cyan-200" />
                      <h4 className="text-sm font-semibold">知识检索结果</h4>
                    </div>

                    <span
                      className={`rounded-md px-2.5 py-1 text-[10px] ${
                        knowledgeSearched && !knowledgeError
                          ? knowledgeHasEvidence
                            ? 'border border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
                            : 'border border-blue-300/20 bg-blue-400/10 text-blue-200'
                          : 'border border-amber-300/20 bg-amber-400/10 text-amber-200'
                      }`}
                    >
                      {knowledgeLoading
                        ? '正在查询...'
                        : knowledgeError
                          ? '查询失败'
                          : knowledgeSearched
                            ? knowledgeHasEvidence
                              ? '已匹配知识库资料'
                              : 'AI 专业知识补充'
                            : '等待查询'}
                  </span>
                  </div>

                  <div className="mb-4 rounded-lg border border-white/5 bg-black/10 p-3">
                    <p className="mb-1 text-xs text-white/35">本次查询</p>
                    <p className="text-sm leading-6 text-white/80">
                      {knowledgeQuestion}
                    </p>
                  </div>

                  {knowledgeResult &&
                  knowledgeResult.trim() !== '资料不足，待核验' ? (
                    <div>
                      <p className="mb-2 text-xs text-cyan-200/70">
                        检索到的知识资料
                      </p>

                      <div className="whitespace-pre-wrap break-words rounded-lg border border-cyan-300/10 bg-cyan-400/[0.04] p-4 text-sm leading-7 text-white/75">
                        {knowledgeResult}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-300/10 bg-amber-400/[0.04] p-4">
                      <p className="text-sm leading-7 text-amber-100/80">
                        当前知识库没有检索到足够的相关资料。
                        为避免生成未经资料支持的答案，本次不提供推测性结论。
                        你可以尝试调整问题表述，或检查知识库是否已经导入相关资料。
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!knowledgeSearched &&
                !knowledgeError &&
                !knowledgeLoading && (
                  <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-7 text-center">
                    <BookMarked
                      size={28}
                      className="mx-auto mb-3 text-white/30"
                    />
                    <p className="text-sm text-white/50">
                      等待输入专业问题
                    </p>
                    <p className="mt-2 text-xs text-white/30">
                      检索结果将展示在这里
                    </p>
                  </div>
                )}
            </div>
          </section>
        )

      case '面试报告': {
        // const completedSessions = interviewSessions.filter(
        //   (item) => item.finished,
        // )

        const generatedReports = interviewSessions.filter(
          (item) => item.finished && item.has_report,
        )

        const pendingReports = interviewSessions.filter(
          (item) => item.finished && !item.has_report,
        )

        // 报告详情页
        if (selectedReport) {
          const reportSections = [
            {
              title: '维度分析',
              icon: Target,
              value: selectedReport.dimension_analysis,
            },
            {
              title: '逐题点评',
              icon: MessageSquareText,
              value: selectedReport.question_reviews,
            },
            {
              title: '知识薄弱点',
              icon: BrainCircuit,
              value: selectedReport.knowledge_gaps,
            },
            {
              title: '改进建议',
              icon: Zap,
              value: selectedReport.improvement_suggestions,
            },
            {
              title: '后续训练计划',
              icon: ClipboardList,
              value: selectedReport.training_plan,
            },
          ]

          return (
            <section className="space-y-6">
              <div className="glass-panel p-6 sm:p-8">
                <button
                  onClick={handleBackToReports}
                  className="mb-6 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/65 transition hover:bg-white/10"
                >
                  <ArrowLeft size={15} />
                  返回历史报告
                </button>

                <div className="flex flex-wrap items-center justify-between gap-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200">
                      <FileText size={24} />
                    </div>

                    <div>
                      <p className="text-xs tracking-[2px] text-cyan-200/60">
                        INTERVIEW REPORT DETAIL
                      </p>
                      <h2 className="mt-1 text-xl font-bold">
                        面试能力分析报告
                      </h2>
                      <p className="mt-1 text-xs text-white/35">
                        面试记录 ID：{selectedReportSessionId}
                      </p>
                    </div>
                  </div>

                  <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full border border-violet-300/30 bg-violet-400/10">
                    <span className="text-3xl font-bold text-violet-100">
                      {selectedReport.overall_score ?? '--'}
                    </span>
                    <span className="mt-1 text-xs text-white/45">
                      综合评分
                    </span>
                  </div>
                </div>

                <div className="mt-7 rounded-xl border border-white/10 bg-white/[0.035] p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Sparkles size={17} className="text-violet-200" />
                    总体评价
                  </h3>
                  <p className="whitespace-pre-wrap break-words text-sm leading-7 text-white/65">
                    {formatReportValue(selectedReport.summary)}
                  </p>
                </div>
              </div>

              {reportDetailError && (
                <div className="rounded-xl border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-200">
                  {reportDetailError}
                </div>
              )}

              {reportSections.map((section) => {
                const Icon = section.icon
                const hasValue =
                  section.value !== null &&
                  section.value !== undefined &&
                  section.value !== '' &&
                  (!Array.isArray(section.value) || section.value.length > 0)

                return (
                  <div key={section.title} className="glass-panel p-6">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400/15 text-violet-200">
                        <Icon size={20} />
                      </div>
                      <h3 className="text-base font-semibold">
                        {section.title}
                      </h3>
                    </div>

                    {hasValue ? (
                      <div className="whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-7 text-white/65">
                        {formatReportValue(section.value)}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center text-sm text-white/35">
                        暂无相关内容
                      </div>
                    )}
                  </div>
                )
              })}

              <button
                onClick={handleBackToReports}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/65 transition hover:bg-white/10"
              >
                <ArrowLeft size={15} />
                返回历史报告列表
              </button>
            </section>
          )
        }

        // 历史报告列表页
        return (
          <section className="space-y-6">
            <div className="glass-panel p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200">
                    <FileText size={24} />
                  </div>

                  <div>
                    <p className="text-xs tracking-[2px] text-cyan-200/60">
                      INTERVIEW REPORTS
                    </p>
                    <h2 className="mt-1 text-xl font-bold">
                      面试报告与能力分析
                    </h2>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setReportsLoaded(false)
                    void loadInterviewSessions()
                  }}
                  disabled={reportsLoading}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    size={15}
                    className={reportsLoading ? 'animate-spin' : ''}
                  />
                  {reportsLoading ? '正在刷新' : '刷新记录'}
                </button>
              </div>

              <p className="mt-5 text-sm leading-7 text-white/50">
                这里展示每场模拟面试的完成状态、综合评分和报告生成情况。
                你可以查看已经生成的报告，也可以为已完成但尚未生成报告的面试创建报告。
              </p>
            </div>

            {/* 报告统计 */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  title: '历史面试总数',
                  value: reportsLoading && !reportsLoaded
                    ? '加载中'
                    : `${interviewSessions.length} 场`,
                  icon: History,
                },
                {
                  title: '已生成报告',
                  value: reportsLoading && !reportsLoaded
                    ? '加载中'
                    : `${generatedReports.length} 份`,
                  icon: FileText,
                },
                {
                  title: '待生成报告',
                  value: reportsLoading && !reportsLoaded
                    ? '加载中'
                    : `${pendingReports.length} 份`,
                  icon: ClipboardList,
                },
              ].map((item) => {
                const Icon = item.icon

                return (
                  <div key={item.title} className="glass-card p-5">
                    <Icon size={22} className="mb-4 text-violet-200" />
                    <p className="text-xs text-white/45">{item.title}</p>
                    <p className="mt-3 text-xl font-semibold text-white/80">
                      {item.value}
                    </p>
                  </div>
                )
              })}
            </div>

            {reportsError && (
              <div className="rounded-xl border border-red-300/20 bg-red-400/10 p-4">
                <div className="flex items-start gap-2 text-sm text-red-200">
                  <CircleHelp size={18} className="mt-0.5 shrink-0" />
                  <span>{reportsError}</span>
                </div>
                <button
                  onClick={() => void loadInterviewSessions()}
                  className="mt-3 rounded-lg border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs text-red-100 transition hover:bg-red-400/20"
                >
                  重新加载
                </button>
              </div>
            )}

            {reportDetailError && (
              <div className="rounded-xl border border-red-300/20 bg-red-400/10 p-4 text-sm text-red-200">
                {reportDetailError}
              </div>
            )}

            <div className="glass-panel p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">历史面试记录</h3>
                  <p className="mt-1 text-xs text-white/35">
                    选择一场已完成的面试查看或生成报告
                  </p>
                </div>
                <ClipboardList size={19} className="text-violet-200" />
              </div>

              {reportsLoading && !reportsLoaded && (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center">
                  <RefreshCw
                    size={27}
                    className="mx-auto mb-3 animate-spin text-violet-200"
                  />
                  <p className="text-sm text-white/60">
                    正在加载历史面试记录...
                  </p>
                </div>
              )}

              {!reportsLoading &&
                reportsLoaded &&
                interviewSessions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center">
                    <History
                      size={30}
                      className="mx-auto mb-3 text-white/30"
                    />
                    <p className="text-sm text-white/50">
                      暂无历史面试记录
                    </p>
                    <p className="mt-2 text-xs leading-6 text-white/30">
                      完成一场模拟面试后，记录会显示在这里。
                    </p>
                    <button
                      onClick={handleStartInterview}
                      className="mt-5 rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-5 py-2.5 text-xs font-semibold text-white transition hover:-translate-y-0.5"
                    >
                      开始模拟面试
                    </button>
                  </div>
                )}

              {interviewSessions.length > 0 && (
                <div className="space-y-3">
                  {interviewSessions.map((session) => {
                    const isGenerating =
                      reportActionSessionId === session.session_id

                    const statusText = !session.finished
                      ? '面试未完成'
                      : session.has_report
                        ? '报告已生成'
                        : '待生成报告'

                    const statusClass = !session.finished
                      ? 'border-amber-300/20 bg-amber-400/10 text-amber-200'
                      : session.has_report
                        ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
                        : 'border-blue-300/20 bg-blue-400/10 text-blue-200'

                    return (
                      <div
                        key={session.session_id}
                        className="rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-violet-300/20 hover:bg-white/[0.05]"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200">
                              <Video size={20} />
                            </div>

                            <div className="min-w-0 flex-1">
                              <h4 className="break-words text-sm font-semibold text-white/85">
                                {session.title || '计算机考研 408 模拟面试'}
                              </h4>

                              <p className="mt-2 text-xs text-white/40">
                                开始时间：{formatReportDate(session.started_at)}
                              </p>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/45">
                                  阶段：{session.phase || '未知'}
                                </span>

                                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/45">
                                  {session.question_count ?? 0} 道问题
                                </span>

                                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/45">
                                  综合评分：
                                  {session.average_score ?? '暂无'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                            <span
                              className={`rounded-md border px-2.5 py-1.5 text-[10px] ${statusClass}`}
                            >
                              {statusText}
                            </span>

                            {session.finished && (
                              <button
                                onClick={() =>
                                  void handleOpenReport(
                                    session,
                                    !session.has_report,
                                  )
                                }
                                disabled={reportDetailLoading}
                                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-400 to-indigo-400 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isGenerating ? (
                                  <>
                                    <RefreshCw
                                      size={14}
                                      className="animate-spin"
                                    />
                                    {session.has_report
                                      ? '加载中'
                                      : '生成中'}
                                  </>
                                ) : (
                                  <>
                                    <FileText size={14} />
                                    {session.has_report
                                      ? '查看报告'
                                      : '生成报告'}
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        )
      }

      default:
        return null
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      {/* 背景光斑 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="ambient-glow left-[15%] top-[-160px] h-[420px] w-[420px] bg-purple-500/40" />
        <div className="ambient-glow right-[-100px] top-[20%] h-[450px] w-[450px] bg-indigo-400/30" />
        <div className="ambient-glow bottom-[-180px] left-[35%] h-[420px] w-[420px] bg-cyan-500/20" />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* 左侧导航 */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50
            flex w-[250px] flex-col
            border-r border-white/10
            bg-[#17172f]/75
            p-5
            backdrop-blur-2xl
            transition-transform duration-300
            lg:sticky lg:top-0
            lg:h-screen lg:translate-x-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="mb-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-300/30 bg-gradient-to-br from-violet-400/30 to-indigo-500/20 shadow-lg shadow-violet-500/10">
                <BrainCircuit size={25} className="text-violet-100" />
              </div>

              <div>
                <h1 className="text-lg font-bold tracking-wide">
                  职智 Agent
                </h1>
                <p className="text-[10px] tracking-[3px] text-white/40">
                  AI INTERVIEW
                </p>
              </div>
            </div>

            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-2 text-white/60 hover:bg-white/10 lg:hidden"
              aria-label="关闭导航"
            >
              <X size={19} />
            </button>
          </div>

          <div className="mb-4 px-3 text-[11px] font-semibold tracking-[2px] text-white/35">
            WORKSPACE
          </div>

          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = activeNav === item.label

              return (
                <button
                  key={item.label}
                  onClick={() => handleNavClick(item.label)}
                  className={`
                    group flex items-center gap-3
                    rounded-xl px-4 py-3.5
                    text-sm transition-all duration-200
                    ${
                      active
                        ? 'border border-violet-300/20 bg-gradient-to-r from-violet-500/25 to-indigo-500/15 text-white shadow-lg shadow-violet-900/20'
                        : 'border border-transparent text-white/55 hover:border-white/10 hover:bg-white/5 hover:text-white'
                    }
                  `}
                >
                  <Icon
                    size={19}
                    strokeWidth={1.8}
                    className={
                      active
                        ? 'text-violet-200'
                        : 'text-white/50 group-hover:text-violet-200'
                    }
                  />

                  <span className="flex-1 text-left">{item.label}</span>

                  {active && (
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-300 shadow-[0_0_10px_rgba(196,181,253,0.9)]" />
                  )}
                </button>
              )
            })}
          </nav>

          <div className="mb-4 mt-10 px-3 text-[11px] font-semibold tracking-[2px] text-white/35">
            GENERAL
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-white/55 transition hover:bg-white/5 hover:text-white"
            >
              <CircleHelp size={19} />
              帮助中心
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-white/55 transition hover:bg-white/5 hover:text-white"
            >
              <Settings size={19} />
              系统设置
            </button>
          </div>

          <div className="mt-auto">
            <div className="glass-card rounded-2xl p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-300 to-indigo-400 text-sm font-bold text-indigo-950">
                  Z
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold">学习者</p>
                  <p className="text-xs text-white/40">个人训练空间</p>
                </div>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-violet-400 to-cyan-300" />
              </div>

              <p className="mt-2 text-[11px] text-white/40">
                学习空间持续成长中
              </p>
            </div>

            <p className="mt-5 text-center text-[10px] tracking-wider text-white/25">
              ZHIZHI AGENT · AI INTERVIEW
            </p>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            aria-label="关闭侧边栏"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* 右侧工作区 */}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1450px]">
            {/* 顶部工具栏 */}
            <header className="glass-panel mb-8 flex min-h-[70px] items-center justify-between gap-4 px-5 py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-xl p-2 text-white/70 hover:bg-white/10 lg:hidden"
                  aria-label="打开导航"
                >
                  <Menu size={22} />
                </button>

                <div>
                  <p className="text-xs text-white/40">
                    WORKSPACE / {activeNav}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{activeNav}</h2>
                </div>
              </div>

              <div className="flex items-center gap-3 sm:gap-5">
                <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 md:flex">
                  <Search size={16} className="text-white/40" />

                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchText.trim()) {
                        setKnowledgeQuestion(searchText.trim())
                        setKnowledgeResult('')
                        setKnowledgeError('')
                        setKnowledgeSearched(false)
                        handleNavClick('专业知识库')
                      }
                    }}
                    placeholder="搜索面试内容..."
                    className="w-36 bg-transparent text-xs text-white outline-none placeholder:text-white/35"
                  />
                </div>

                <button
                  onClick={() => setNotice('目前没有新的系统通知。')}
                  className="relative rounded-xl border border-white/10 bg-white/5 p-2.5 text-white/65 transition hover:bg-white/10"
                  aria-label="通知"
                >
                  <Bell size={19} />
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-violet-300" />
                </button>

                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-violet-300 to-indigo-400 text-sm font-bold text-indigo-950">
                  Z
                </div>
              </div>
            </header>

            {notice && (
              <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-violet-300/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-100 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={17} />
                  {notice}
                </div>

                <button
                  onClick={() => setNotice('')}
                  aria-label="关闭提示"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            {/* 工作台首页 */}
            {activeNav === '工作台' && (
              <>
                <section className="glass-panel relative mb-8 overflow-hidden p-6 sm:p-9 lg:p-11">
                  <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-violet-400/20 blur-[90px]" />
                  <div className="pointer-events-none absolute bottom-[-100px] right-[25%] h-60 w-60 rounded-full bg-cyan-400/10 blur-[90px]" />

                  <div className="relative z-10 max-w-3xl">
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-200/20 bg-violet-300/10 px-3 py-1.5 text-xs text-violet-100">
                      <Sparkles size={14} />
                      AI POWERED INTERVIEW PLATFORM
                    </div>

                    <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                      让每一次练习，
                      <br />
                      <span className="gradient-text">
                        都成为成长的积累。
                      </span>
                    </h1>

                    <p className="mt-5 max-w-2xl text-sm leading-7 text-white/55 sm:text-base">
                      职智 Agent 是一款面向计算机考研 408 复试的 AI 模拟面试助手。
                      通过个性化提问、多轮追问、回答评估和知识记忆，
                      帮助考生开展系统化复试训练。
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-4">
                      <button
                        onClick={handleStartInterview}
                        className="group flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-violet-500/20"
                      >
                        <Play size={17} fill="currentColor" />
                        开始模拟面试
                        <ArrowUpRight
                          size={17}
                          className="transition-transform group-hover:translate-x-1 group-hover:-translate-y-1"
                        />
                      </button>

                      <button
                        onClick={() => handleNavClick('专业知识库')}
                        className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm text-white/75 backdrop-blur-xl transition hover:bg-white/10"
                      >
                        <BookOpen size={17} />
                        探索知识库
                      </button>
                    </div>
                  </div>

                  <div className="pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 lg:block">
                    <div className="relative flex h-52 w-52 items-center justify-center rounded-full border border-violet-200/15 bg-violet-300/5 shadow-[0_0_80px_rgba(167,139,250,0.12)]">
                      <div className="absolute inset-5 rounded-full border border-violet-200/20" />
                      <div className="absolute inset-10 rounded-full border border-cyan-200/20" />

                      <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-violet-200/30 bg-gradient-to-br from-violet-300/25 to-indigo-400/10 shadow-[0_0_50px_rgba(167,139,250,0.2)]">
                        <BrainCircuit
                          size={48}
                          strokeWidth={1.3}
                          className="text-violet-100"
                        />
                      </div>

                      <div className="absolute right-6 top-8 h-3 w-3 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(131,218,250,0.9)]" />
                      <div className="absolute bottom-8 left-7 h-2.5 w-2.5 rounded-full bg-violet-200 shadow-[0_0_15px_rgba(196,181,253,0.9)]" />
                    </div>
                  </div>
                </section>

                {/* 408 训练方向 */}
                <section className="mb-9">
                  <div className="mb-5 flex items-end justify-between">
                    <div>
                      <p className="mb-2 text-xs tracking-[2px] text-violet-200/60">
                        408 INTERVIEW MODES
                      </p>

                      <h2 className="text-xl font-bold">选择你的训练方向</h2>

                      <p className="mt-2 text-sm text-white/40">
                        围绕计算机考研 408 四门核心课程开展复试训练
                      </p>
                    </div>

                    <span className="hidden text-xs text-white/35 sm:block">
                      01 / INTERVIEW
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {trainingModes.map((mode) => {
                      const Icon = mode.icon
                      const selected = selectedMode === mode.id

                      return (
                        <button
                          key={mode.id}
                          onClick={() => {
                            setSelectedMode(mode.id)
                            setNotice(
                              `已选择 ${mode.title} 训练方向。开始面试时，AI 将结合个人材料生成问题。`,
                            )
                          }}
                          className={`
                            glass-card relative min-h-[220px] p-5 text-left
                            transition-all duration-300
                            ${
                              selected
                                ? 'border-violet-300/50 bg-violet-400/15 shadow-[0_0_28px_rgba(167,139,250,0.12)]'
                                : ''
                            }
                          `}
                        >
                          <div className="mb-5 flex items-center justify-between">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-200/15 bg-violet-300/10 text-violet-200">
                              <Icon size={22} strokeWidth={1.7} />
                            </div>

                            {selected && (
                              <CheckCircle2
                                size={19}
                                className="text-violet-200"
                              />
                            )}
                          </div>

                          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-violet-100/75">
                            {mode.tag}
                          </span>

                          <h3 className="mt-4 text-base font-semibold">
                            {mode.title}
                          </h3>

                          <p className="mt-1 text-xs text-white/45">
                            {mode.subtitle}
                          </p>

                          <p className="mt-3 text-xs leading-5 text-white/40">
                            {mode.description}
                          </p>

                          <div className="mt-4 flex items-center justify-between">
                            <span className="text-[11px] text-white/35">
                              {selected ? '当前已选择' : '点击选择方向'}
                            </span>
                            <ChevronRight
                              size={17}
                              className="text-white/40"
                            />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>

                {/* 核心功能 */}
                <section className="mb-9">
                  <div className="mb-5 flex items-end justify-between">
                    <div>
                      <p className="mb-2 text-xs tracking-[2px] text-violet-200/60">
                        CORE CAPABILITIES
                      </p>

                      <h2 className="text-xl font-bold">核心智能能力</h2>

                      <p className="mt-2 text-sm text-white/40">
                        从模拟训练到知识沉淀，构建完整学习闭环
                      </p>
                    </div>

                    <span className="hidden text-xs text-white/35 sm:block">
                      02 / FEATURES
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {features.map((feature) => {
                      const Icon = feature.icon

                      return (
                        <button
                          key={feature.title}
                          onClick={() => handleFeatureClick(feature.target)}
                          className="glass-card group p-5 text-left transition hover:border-violet-300/30 hover:bg-white/[0.07]"
                        >
                          <div
                            className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${feature.bg} ${feature.color} transition-transform duration-300 group-hover:scale-110`}
                          >
                            <Icon size={23} strokeWidth={1.7} />
                          </div>

                          <h3 className="text-sm font-semibold">
                            {feature.title}
                          </h3>

                          <p className="mt-3 text-xs leading-6 text-white/45">
                            {feature.description}
                          </p>

                          <div className="mt-4 flex items-center justify-between">
                            <span className="text-[11px] text-white/30">
                              进入功能模块
                            </span>

                            <ArrowUpRight
                              size={16}
                              className="text-white/35 transition-all group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-violet-200"
                            />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>

            
{/* 最近面试和学习进度 */}
<section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
  {/* 左侧：最近面试记录 */}
  <div className="glass-panel p-5 sm:p-6 xl:col-span-2">
    <div className="mb-6 flex items-center justify-between">
      <div>
        <p className="mb-2 text-xs tracking-[2px] text-violet-200/60">
          RECENT INTERVIEWS
        </p>
        <h2 className="text-lg font-bold">最近面试记录</h2>
        <p className="mt-2 text-xs leading-5 text-white/40">
          展示最近的模拟面试记录及完成情况。
        </p>
      </div>

      <button
        onClick={() => handleNavClick('面试报告')}
        className="flex items-center gap-1 text-xs text-violet-200/70 transition hover:text-white"
      >
        查看全部
        <ChevronRight size={15} />
      </button>
    </div>

    {/* 加载状态 */}
    {reportsLoading && !reportsLoaded ? (
      <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
        <RefreshCw
          size={25}
          className="mx-auto mb-3 animate-spin text-violet-200"
        />
        <p className="text-sm text-white/50">
          正在加载历史面试记录...
        </p>
      </div>
    ) : reportsError && !reportsLoaded ? (
      <div className="rounded-xl border border-red-300/20 bg-red-400/10 p-5 text-center">
        <CircleHelp
          size={25}
          className="mx-auto mb-3 text-red-200"
        />
        <p className="text-sm text-red-200">
          历史记录加载失败
        </p>
        <p className="mt-2 break-words text-xs text-red-100/60">
          {reportsError}
        </p>
        <button
          onClick={() => {
            setReportsLoaded(false)
            void loadInterviewSessions()
          }}
          className="mt-4 rounded-lg border border-red-300/20 px-4 py-2 text-xs text-red-100 transition hover:bg-red-400/10"
        >
          重新加载
        </button>
      </div>
    ) : recentSessions.length === 0 ? (
      <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
        <History
          size={28}
          className="mx-auto mb-3 text-white/30"
        />

        <p className="text-sm text-white/50">
          暂无历史面试记录
        </p>

        <p className="mt-2 text-xs text-white/30">
          完成模拟面试后，真实记录将自动显示在这里。
        </p>

        <button
          onClick={handleStartInterview}
          className="mt-5 rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-5 py-2.5 text-xs font-semibold text-white transition hover:-translate-y-0.5"
        >
          开始模拟面试
        </button>
      </div>
    ) : (
      <div className="space-y-3">
        {recentSessions.map((session) => {
          const status = getSessionStatus(session)

          const statusClass = !session.finished
            ? 'border-amber-300/20 bg-amber-400/10 text-amber-200'
            : session.has_report
              ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'
              : 'border-blue-300/20 bg-blue-400/10 text-blue-200'

          return (
            <div
              key={session.session_id}
              className="rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-violet-300/20 hover:bg-white/[0.05]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200">
                    <Video size={19} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-semibold text-white/85">
                      {session.title || '计算机考研 408 模拟面试'}
                    </h3>

                    <p className="mt-1 text-xs text-white/35">
                      {formatReportDate(session.started_at)}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/45">
                        {getPhaseLabel(session.phase)}
                      </span>

                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/45">
                        {session.question_count ?? 0} 道问题
                      </span>

                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/45">
                        评分：{session.average_score ?? '暂无'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <span
                    className={`rounded-md border px-2.5 py-1.5 text-[10px] ${statusClass}`}
                  >
                    {status}
                  </span>

                  <button
                    onClick={() => {
                      if (session.finished) {
                        void handleOpenReport(
                          session,
                          !session.has_report,
                        )
                      } else {
                        handleNavClick('面试报告')
                      }
                    }}
                    disabled={
                      reportDetailLoading && session.finished
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-400/10 px-3 py-2 text-xs text-violet-100 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileText size={13} />
                    {session.finished
                      ? session.has_report
                        ? '查看报告'
                        : '生成报告'
                      : '查看记录'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )}
  </div>

  {/* 右侧：真实学习进度 */}
  <div className="glass-panel p-5 sm:p-6">
    <p className="mb-2 text-xs tracking-[2px] text-violet-200/60">
      LEARNING PROGRESS
    </p>

    <h2 className="text-lg font-bold">学习能力概览</h2>

    <p className="mt-2 text-xs leading-5 text-white/40">
      根据历史面试记录和知识记忆数据实时统计。
    </p>

    {/* 面试完成率环形图 */}
    <div className="my-7 flex items-center justify-center">
      <div
        className="relative flex h-40 w-40 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(rgba(167,139,250,0.95) ${trainingProgress}%, rgba(255,255,255,0.08) ${trainingProgress}% 100%)`,
        }}
      >
        <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-[#22213f]">
          <span className="text-3xl font-bold text-white">
            {reportsLoading && !reportsLoaded
              ? '--'
              : `${trainingProgress}%`}
          </span>
          <span className="mt-1 text-xs text-white/40">
            面试完成率
          </span>
        </div>
      </div>
    </div>

    {/* 真实统计数据 */}
    <div className="mb-6 grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
        <p className="text-[11px] text-white/40">
          累计面试
        </p>
        <p className="mt-2 text-xl font-bold text-white/85">
          {reportsLoading && !reportsLoaded
            ? '--'
            : interviewSessions.length}
          <span className="ml-1 text-xs font-normal text-white/40">
            场
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
        <p className="text-[11px] text-white/40">
          已完成面试
        </p>
        <p className="mt-2 text-xl font-bold text-white/85">
          {reportsLoading && !reportsLoaded
            ? '--'
            : completedSessions.length}
          <span className="ml-1 text-xs font-normal text-white/40">
            场
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
        <p className="text-[11px] text-white/40">
          平均面试评分
        </p>
        <p className="mt-2 text-xl font-bold text-cyan-200">
          {reportsLoading && !reportsLoaded
            ? '--'
            : averageInterviewScore ?? '--'}
          <span className="ml-1 text-xs font-normal text-white/40">
            分
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
        <p className="text-[11px] text-white/40">
          待巩固知识点
        </p>
        <p className="mt-2 text-xl font-bold text-fuchsia-200">
          {memoryLoading && !memoryLoaded
            ? '--'
            : knowledgeGaps.length}
          <span className="ml-1 text-xs font-normal text-white/40">
            个
          </span>
        </p>
      </div>
    </div>

    {/* 面试完成率 */}
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex justify-between text-xs">
          <span className="text-white/60">面试完成率</span>
          <span className="text-violet-200">
            {reportsLoaded ? `${trainingProgress}%` : '--'}
          </span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-400 transition-all duration-500"
            style={{ width: `${trainingProgress}%` }}
          />
        </div>
      </div>

      {/* 报告生成率 */}
      <div>
        <div className="mb-2 flex justify-between text-xs">
          <span className="text-white/60">报告生成率</span>
          <span className="text-cyan-200">
            {reportsLoaded ? `${reportProgress}%` : '--'}
          </span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 transition-all duration-500"
            style={{ width: `${reportProgress}%` }}
          />
        </div>
      </div>
    </div>

    {/* 知识记忆入口 */}
    <button
      onClick={() => handleNavClick('知识记忆')}
      className="mt-6 flex w-full items-center justify-between rounded-xl border border-fuchsia-300/15 bg-fuchsia-400/[0.06] px-4 py-3 text-xs text-fuchsia-100/80 transition hover:bg-fuchsia-400/10"
    >
      <span className="flex items-center gap-2">
        <BrainCircuit size={15} />
        查看个人知识薄弱点
      </span>
      <ChevronRight size={15} />
    </button>

    {/* 报告入口 */}
    <button
      onClick={() => handleNavClick('面试报告')}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200/20 bg-violet-400/10 py-3 text-xs text-violet-100 transition hover:bg-violet-400/20"
    >
      查看完整面试报告
      <ArrowUpRight size={15} />
    </button>
  </div>
</section>

              </>
            )}

            {/* 其他工作区 */}
            {activeNav !== '工作台' && (
              <div className="space-y-6">
                {renderWorkspace()}

                <button
                  onClick={() => handleNavClick('工作台')}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  <ArrowLeft size={15} />
                  返回工作台
                </button>
              </div>
            )}

            <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 py-6 text-[11px] text-white/30">
              <p>© 2026 职智 Agent · AI Interview Assistant</p>

              <div className="flex items-center gap-5">
                <span className="flex items-center gap-1.5">
                  <Zap size={13} />
                  AI Powered
                </span>
                <span>Version 1.0</span>
              </div>
            </footer>
          </div>
        </main>
      </div>

      {/* 帮助中心弹窗 */}
      {showHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CircleHelp size={23} className="text-violet-200" />
                <h2 className="text-lg font-bold">帮助中心</h2>
              </div>

              <button
                onClick={() => setShowHelp(false)}
                className="rounded-lg p-2 text-white/50 hover:bg-white/10"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-4 text-sm leading-7 text-white/60">
              <div>
                <h3 className="font-semibold text-white/85">
                  1. 开始模拟面试
                </h3>
                <p>
                  进入模拟面试，填写报考专业、研究方向和简历，设置题目数量后开始训练。
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white/85">
                  2. 回答问题
                </h3>
                <p>
                  阅读 AI 面试官提出的问题，在回答区域输入内容并提交，系统会继续生成后续问题。
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white/85">
                  3. 查看面试报告
                </h3>
                <p>
                  完成本场面试后生成报告，查看综合评价、知识薄弱点和改进建议。
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white/85">
                  4. 专业知识库
                </h3>
                <p>
                  专业知识库围绕数据结构、计算机组成原理、操作系统和计算机网络组织。
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="mt-7 w-full rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 py-3 text-sm font-semibold"
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {/* 系统设置弹窗 */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings size={23} className="text-violet-200" />
                <h2 className="text-lg font-bold">系统设置</h2>
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="rounded-lg p-2 text-white/50 hover:bg-white/10"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium">
                    默认压力面试模式
                  </h3>
                  <p className="mt-1 text-xs text-white/40">
                    作为后续面试准备页面的默认设置
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={defaultPressureMode}
                  onChange={(e) => setDefaultPressureMode(e.target.checked)}
                  className="h-5 w-5 accent-violet-500"
                />
              </div>

              <div>
                <h3 className="text-sm font-medium">默认面试题目数量</h3>

                <p className="mt-1 text-xs text-white/40">
                  设置新一场模拟面试的默认题目数量
                </p>

                <select
                  value={defaultQuestionCount}
                  onChange={(e) =>
                    setDefaultQuestionCount(Number(e.target.value))
                  }
                  className="mt-3 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none"
                >
                  {[3, 5, 8, 10, 15, 20, 30].map((count) => (
                    <option key={count} value={count}>
                      {count} 道
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mt-5 text-xs leading-5 text-white/35">
              当前设置暂存在本次页面状态中。下一步可以将设置持久化，并传递给面试准备页面。
            </p>

            <button
              onClick={() => {
                setShowSettings(false)
                setNotice(
                  `设置已应用：默认${defaultQuestionCount}道题，压力面试${defaultPressureMode ? '开启' : '关闭'}。`,
                )
              }}
              className="mt-7 w-full rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 py-3 text-sm font-semibold"
            >
              保存设置
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
