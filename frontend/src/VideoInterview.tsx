import { useEffect, useRef, useState } from 'react'
import { API_BASE_URL, uploadResume } from './api/interview'
import {
  ArrowLeft, Camera, CameraOff, Mic, MicOff, PhoneOff,
  Sparkles, Volume2, Loader2, CheckCircle2, AlertCircle, RefreshCw, Target, BookOpen
} from 'lucide-react'

interface VideoInterviewProps {
  onBack: () => void
  defaultPressureMode?: boolean
  defaultQuestionCount?: number
  userId: number
}

type Message = { role: '考生' | '面试官'; text: string }

const API = `${API_BASE_URL}/api/video`

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function eventText(event: Record<string, unknown>) {
  for (const key of ['text', 'transcript', 'delta']) {
    if (typeof event[key] === 'string') return event[key] as string
  }
  return ''
}

export default function VideoInterview({
  onBack,
  defaultPressureMode = false,
  defaultQuestionCount = 8,
  userId,
}: VideoInterviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const websocketRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef('')
  const audioQueueRef = useRef<Uint8Array[]>([])
  const outputSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const outputNextTimeRef = useRef(0)
  const mountedRef = useRef(true)
  const micEnabledRef = useRef(true)

  const [major, setMajor] = useState('计算机科学与技术')
  const [researchDirection, setResearchDirection] = useState('')
  const [targetSchool, setTargetSchool] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [resumeFileName, setResumeFileName] = useState('')
  const [resumeUploading, setResumeUploading] = useState(false)
  const [pressureMode, setPressureMode] = useState(defaultPressureMode)
  const [questionCount, setQuestionCount] = useState(defaultQuestionCount)
  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [starting, setStarting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [finished, setFinished] = useState(false)
  const [finishSaved, setFinishSaved] = useState(false)
  const [avatarState, setAvatarState] = useState<'standby' | 'thinking' | 'speaking'>('standby')
  const [status, setStatus] = useState('填写资料后开始视频面试')
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [reportSessionId, setReportSessionId] = useState('')
  const [reportStatus, setReportStatus] = useState<'idle' | 'pending' | 'running' | 'completed' | 'failed'>('idle')
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [reportError, setReportError] = useState('')
  const [currentQuestion, setCurrentQuestion] = useState('等待面试开始')

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopResources()
    }
  }, [])

  // 面试结束后轮询后台报告状态；此轮询不会进入实时音频链路。
  useEffect(() => {
    if (!finished || !reportSessionId || !['pending', 'running'].includes(reportStatus)) return

    let active = true
    let timer: number | undefined
    let attempts = 0

    const poll = async () => {
      if (!active) return
      attempts += 1
      try {
        const response = await fetch(`${API}/report-status/${encodeURIComponent(reportSessionId)}`)
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.detail || `查询报告状态失败：${response.status}`)

        if (data.status === 'completed' && data.report) {
          setReport(data.report as Record<string, unknown>)
          setReportStatus('completed')
          setReportError('')
          setStatus('面试已结束，分析报告已生成')
          active = false
          return
        }

        if (data.status === 'failed') {
          setReportStatus('failed')
          setReportError(String(data.error || '报告生成失败，可点击重试。'))
          active = false
          return
        }

        setReportStatus(data.status === 'running' ? 'running' : 'pending')
      } catch (err) {
        setReportError(err instanceof Error ? err.message : '报告状态暂时无法获取，系统会继续尝试。')
      }

      if (attempts >= 180) {
        setReportStatus('failed')
        setReportError('报告生成时间较长。面试记录已保存，可稍后重试生成报告。')
        active = false
        return
      }
      if (active) timer = window.setTimeout(() => void poll(), 2500)
    }

    void poll()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [finished, reportSessionId, reportStatus])

  function stopResources() {
    websocketRef.current?.close()
    websocketRef.current = null

    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    processorRef.current = null
    sourceRef.current = null

    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null

    for (const source of outputSourcesRef.current) {
      try {
        source.stop()
      } catch {
        // 音频可能已经播放结束
      }
    }
    outputSourcesRef.current.clear()
    outputSourceRef.current = null
    outputNextTimeRef.current = 0

    if (audioContextRef.current) {
      void audioContextRef.current.close()
      audioContextRef.current = null
    }

    setCameraOn(false)
    setConnected(false)
  }

  async function requestJSON(path: string, body: unknown) {
    const response = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.detail || `请求失败：${response.status}`)
    }
    return data
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
    } catch {
      setError('摄像头暂不可用，仍可继续语音面试。请检查浏览器摄像头权限。')
    }
  }

  function downsampleToPcm16(input: Float32Array, inputRate: number) {
    const outputRate = 16000
    const ratio = inputRate / outputRate
    const outputLength = Math.floor(input.length / ratio)
    const output = new Uint8Array(outputLength * 2)
    const view = new DataView(output.buffer)

    for (let i = 0; i < outputLength; i++) {
      const position = Math.floor(i * ratio)
      const sample = Math.max(-1, Math.min(1, input[position] || 0))
      view.setInt16(i * 2, sample < 0 ? sample * 32768 : sample * 32767, true)
    }
    return output
  }

  function flushAudioQueue() {
    const socket = websocketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    // 持久 WebSocket 直接发送二进制 PCM，避免每 100ms 发起一次 HTTP 请求。
    while (audioQueueRef.current.length && socket.readyState === WebSocket.OPEN) {
      const chunk = audioQueueRef.current.shift()
      if (chunk) socket.send(chunk)
    }
  }

  async function startMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })

    streamRef.current = stream

    const context = audioContextRef.current || new AudioContext()
    audioContextRef.current = context
    await context.resume()

    const source = context.createMediaStreamSource(stream)
    const processor = context.createScriptProcessor(4096, 1, 1)

    sourceRef.current = source
    processorRef.current = processor

    let pending: number[] = []

    // Seeduplex 3.0 是全双工语音模型：持续上送麦克风 PCM（包括静音），
    // 不在本地做“停顿判句”或发送 input_audio_buffer.commit。
    // 这样豆包可以边听边判断轮次，用户也能在面试官说话时自然插话。
    processor.onaudioprocess = event => {
      if (!micEnabledRef.current || !sessionIdRef.current) return

      const pcm = downsampleToPcm16(
        event.inputBuffer.getChannelData(0),
        context.sampleRate,
      )
      for (let i = 0; i < pcm.length; i++) pending.push(pcm[i])

      // 约 100ms 一包，保持连续音频流与服务端保活。
      const batchSize = 3200
      while (pending.length >= batchSize) {
        audioQueueRef.current.push(new Uint8Array(pending.splice(0, batchSize)))
      }
      void flushAudioQueue()
    }

    source.connect(processor)
    processor.connect(context.destination)
  }

  function handleUpstream(message: Record<string, unknown>) {
    const event = (message.event || {}) as Record<string, unknown>
    const type = String(event.type || '')
    const text = eventText(event)

    if (type.includes('input_audio_transcription.delta')) {
      if (text) setCurrentQuestion(text)
      setAvatarState('thinking')
      return
    }

    if (type.includes('input_audio_transcription.completed')) {
      if (text) {
        setCurrentQuestion(text)
        setMessages(prev => [...prev, { role: '考生', text }])
      }
      setAvatarState('thinking')
      return
    }

    if (type === 'response.output_text.delta') {
      if (text) {
        setCurrentQuestion(prev => prev === '等待面试开始' ? text : prev + text)
      }
      return
    }

    if (type === 'response.output_text.done') {
      if (text) {
        setMessages(prev => [...prev, { role: '面试官', text }])
        setCurrentQuestion(text)
      }
      return
    }

    if (type === 'response.output_audio.started') {
      // 新一轮输出开始时清理上一轮尚未播放完的片段。
      for (const source of outputSourcesRef.current) {
        try { source.stop() } catch { /* 已结束 */ }
      }
      outputSourcesRef.current.clear()
      outputSourceRef.current = null
      outputNextTimeRef.current = 0
      setAvatarState('speaking')
      return
    }

    if (type === 'response.output_audio.delta') {
      const encoded = String(event.audio || event.delta || '')
      if (!encoded) return

      const context = audioContextRef.current
      if (!context || context.state === 'closed') {
        setError('音频播放环境尚未准备好，请重新开始面试。')
        return
      }

      try {
        const binary = atob(encoded)
        const pcmBytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          pcmBytes[i] = binary.charCodeAt(i)
        }

        // 每收到一个豆包音频 delta 就立即排入 Web Audio 播放队列，
        // 不再等 response.output_audio.done 后才播放整段音频。
        const sampleCount = Math.floor(pcmBytes.length / 2)
        if (!sampleCount) return

        const audioBuffer = context.createBuffer(1, sampleCount, 24000)
        const channel = audioBuffer.getChannelData(0)
        const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, sampleCount * 2)
        for (let i = 0; i < sampleCount; i++) {
          channel[i] = view.getInt16(i * 2, true) / 32768
        }

        const source = context.createBufferSource()
        source.buffer = audioBuffer
        source.connect(context.destination)
        outputSourcesRef.current.add(source)
        outputSourceRef.current = source

        const startAt = Math.max(context.currentTime + 0.035, outputNextTimeRef.current)
        outputNextTimeRef.current = startAt + audioBuffer.duration
        source.onended = () => {
          outputSourcesRef.current.delete(source)
          if (outputSourceRef.current === source) outputSourceRef.current = null
          if (mountedRef.current && outputSourcesRef.current.size === 0) {
            setAvatarState('standby')
          }
        }

        void context.resume().then(() => {
          if (context.state !== 'closed' && outputSourcesRef.current.has(source)) {
            source.start(startAt)
          }
        }).catch(() => {
          outputSourcesRef.current.delete(source)
          setError('面试官语音播放失败，请检查浏览器声音权限。')
          setAvatarState('standby')
        })
      } catch {
        // 忽略无法解析的音频片段
      }
      return
    }

    if (type === 'response.output_audio.done') {
      if (outputSourcesRef.current.size === 0) setAvatarState('standby')
      return
    }

    if (type === 'response.done') {
      if (outputSourcesRef.current.size === 0) setAvatarState('standby')
      return
    }

    if (type === 'error') {
      setError(text || '实时语音服务暂时不可用')
      setAvatarState('standby')
    }
  }

  async function handleResumeUpload(file: File) {
    if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) {
      setError('仅支持 PDF、DOCX、TXT 和 MD 文件。')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('简历文件不能超过 10 MB。')
      return
    }

    setResumeUploading(true)
    setError('')
    try {
      const result = await uploadResume(file)
      setResumeText(result.content)
      setResumeFileName(result.filename)
    } catch (err) {
      setError(err instanceof Error ? err.message : '简历上传失败，请重试。')
    } finally {
      setResumeUploading(false)
    }
  }

  async function handleStart() {
    if (!resumeText.trim()) {
      setError('请先填写简历或个人复试材料。')
      return
    }

    setStarting(true)
    setError('')

    try {
      const context = new AudioContext()
      audioContextRef.current = context
      await context.resume()

      const data = await requestJSON('session', {
        user_id: userId,
        major,
        research_direction: researchDirection,
        target_school: targetSchool,
        resume_text: resumeText,
        pressure_mode: pressureMode,
        max_questions: questionCount,
      })

      sessionIdRef.current = data.session_id
      setReportSessionId(data.session_id)
      setFinishSaved(false)
      setReportStatus('idle')
      setReport(null)
      setReportError('')
      setStatus('正在建立面试连接…')

      const wsUrl = new URL(`${API}/ws`)
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl.searchParams.set('session_id', data.session_id)

      const socket = new WebSocket(wsUrl.toString())
      websocketRef.current = socket

      socket.onmessage = async event => {
        let message: Record<string, unknown>
        try {
          message = JSON.parse(String(event.data))
        } catch {
          return
        }

        if (message.type === 'local.connected') {
          setConnected(true)
          setStatus('连接成功，正在启动麦克风…')
          setAvatarState('speaking')
          try {
            await startMicrophone()
            setStatus('面试进行中，请直接对着麦克风回答')
            setCurrentQuestion('面试官已进入面试，请听取开场问题')
          } catch {
            setError('麦克风启动失败，请允许浏览器使用麦克风后重试。')
            setStatus('麦克风不可用')
          }
          return
        }

        if (message.type === 'upstream.event') {
          handleUpstream(message)
          return
        }

        if (message.type === 'local.error') {
          const detail = message.message || message.error || '实时语音连接发生错误'
          setError(String(detail))
          setStatus('连接异常')
          return
        }

        if (message.type === 'local.closed') {
          setConnected(false)
          setStatus('面试连接已结束')
        }
      }

      socket.onerror = () => {
        if (mountedRef.current) {
          setError('实时音频连接失败，请检查网络后重试。')
          setStatus('连接异常')
        }
      }

      socket.onclose = () => {
        if (mountedRef.current && sessionIdRef.current) {
          setConnected(false)
          setStatus('实时连接中断，请检查网络或后端服务')
        }
      }

      setStatus('正在建立实时语音连接…')
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动视频面试失败')
      setStatus('启动失败')
      stopResources()
    } finally {
      setStarting(false)
    }
  }

  function toggleMic() {
    const next = !micOn
    micEnabledRef.current = next
    setMicOn(next)
    setStatus(next ? '麦克风已开启' : '麦克风已静音')
  }

  async function handleEnd() {
    const id = sessionIdRef.current
    sessionIdRef.current = ''
    stopResources()
    setFinished(true)
    setFinishSaved(false)
    setAvatarState('standby')
    setReportStatus('pending')
    setReportError('')
    setReportSessionId(id)
    setStatus('面试已结束，正在保存记录并生成分析报告…')

    if (!id) {
      setReportStatus('failed')
      setReportError('未找到本场面试编号，无法生成报告。')
      return
    }

    try {
      // 先保存完整转写并结束数据库场次；报告分析由后端后台任务执行。
      await requestJSON('finish', {
        session_id: id,
        messages,
      })
      setFinishSaved(true)
    } catch (err) {
      setReportStatus('failed')
      setReportError(err instanceof Error ? err.message : '面试记录保存失败，可点击重试。')
    } finally {
      // 关闭实时语音连接不等待报告分析。
      void requestJSON('close', { session_id: id }).catch(() => undefined)
    }
  }

  async function retryReport() {
    if (!reportSessionId) return
    setReportStatus('pending')
    setReportError('')
    try {
      await requestJSON('finish', {
        session_id: reportSessionId,
        messages,
      })
      setFinishSaved(true)
    } catch (err) {
      setReportStatus('failed')
      setReportError(err instanceof Error ? err.message : '报告重试失败，请稍后再试。')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-6">
        <header className="mb-6 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
          >
            <ArrowLeft size={17} /> 返回
          </button>
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Sparkles size={17} className="text-violet-400" />
            职智 Agent · AI 视频面试
          </div>
        </header>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold">408 复试视频面试</h1>
          <p className="mt-2 text-sm text-slate-400">{status}</p>
        </div>

        {!connected && !finished && (
          <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="mb-4 font-medium">面试资料</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm text-slate-300">
                报考专业
                <input value={major} onChange={e => setMajor(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">
                研究方向
                <input value={researchDirection} onChange={e => setResearchDirection(e.target.value)}
                  placeholder="选填"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-white" />
              </label>
              <label className="text-sm text-slate-300">
                目标院校
                <input value={targetSchool} onChange={e => setTargetSchool(e.target.value)}
                  placeholder="选填"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-white" />
              </label>
            </div>

            <label className="mt-4 block text-sm text-slate-300">
              简历 / 个人复试材料
              <textarea value={resumeText} onChange={e => setResumeText(e.target.value)}
                rows={5} placeholder="粘贴简历、项目经历、科研经历或个人陈述…"
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-white" />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-200 hover:bg-violet-500/20">
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  disabled={resumeUploading || starting}
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (file) await handleResumeUpload(file)
                    e.target.value = ''
                  }}
                />
                {resumeUploading
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Sparkles size={16} />}
                {resumeUploading ? '正在上传并解析…' : '上传简历文件'}
              </label>
              <span className="text-xs text-slate-400">支持 PDF、DOCX、TXT、MD，最大 10 MB</span>
            </div>
            {resumeFileName && (
              <p className="mt-2 text-xs text-emerald-300">
                已上传并解析：{resumeFileName}
              </p>
            )}


            <div className="mt-4 flex flex-wrap items-center gap-5 text-sm text-slate-300">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pressureMode}
                  onChange={e => setPressureMode(e.target.checked)} />
                压力面试
              </label>
              <label className="flex items-center gap-2">
                题目数量
                <select value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))}
                  className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1">
                  {[3, 5, 8, 10, 15].map(n => <option key={n} value={n}>{n} 题</option>)}
                </select>
              </label>
            </div>
          </section>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <section className="relative flex min-h-[390px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-indigo-950 via-slate-900 to-violet-950 p-8">
            <div className="absolute left-5 top-5 flex items-center gap-2 text-xs text-slate-400">
              <Sparkles size={15} /> AI 复试面试官
            </div>
            <div className={`flex h-36 w-36 items-center justify-center rounded-full border border-violet-300/30 bg-violet-400/10 shadow-2xl shadow-violet-500/20 ${avatarState === 'speaking' ? 'ring-4 ring-violet-400/30' : ''}`}>
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-blue-500">
                <Sparkles size={42} />
              </div>
            </div>
            <h2 className="mt-6 text-lg font-medium">职智 AI 面试官</h2>
            <p className="mt-2 text-sm text-violet-200">
              {avatarState === 'speaking' ? '正在回答 / 提问…' :
                avatarState === 'thinking' ? '正在分析你的回答…' : '等待交流'}
            </p>
            <div className="mt-8 w-full rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs text-violet-300">
                <Volume2 size={14} /> 当前面试内容
              </div>
              <p className="text-sm leading-7 text-slate-200">{currentQuestion}</p>
            </div>
          </section>

          <section className="flex min-h-[390px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-medium">考生画面</span>
              <span className="text-xs text-slate-400">{cameraOn ? '摄像头已开启' : '摄像头未开启'}</span>
            </div>
            <div className="relative flex flex-1 items-center justify-center bg-black/40">
              <video ref={videoRef} autoPlay muted playsInline
                className={`h-full max-h-[330px] w-full object-cover ${cameraOn ? '' : 'hidden'}`} />
              {!cameraOn && (
                <div className="text-center text-slate-500">
                  <CameraOff size={36} className="mx-auto mb-3" />
                  <p className="text-sm">摄像头尚未开启</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-3 border-t border-white/10 p-4">
              <button onClick={() => void startCamera()}
                disabled={cameraOn || connected}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-40">
                <Camera size={16} /> 开启摄像头
              </button>
              <button onClick={toggleMic} disabled={!connected}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm ${micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500/20 text-red-300'}`}>
                {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                {micOn ? '麦克风已开' : '麦克风静音'}
              </button>
            </div>
          </section>
        </div>

        {messages.length > 0 && (
          <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="mb-3 font-medium">面试对话记录</h3>
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {messages.map((message, index) => (
                <div key={index} className="rounded-lg bg-white/[0.04] p-3">
                  <div className="mb-1 text-xs text-violet-300">{message.role}</div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{message.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {finished && (
          <section className="mt-6 rounded-2xl border border-violet-300/20 bg-gradient-to-br from-violet-500/[0.09] to-blue-500/[0.06] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs tracking-[2px] text-violet-200/60">POST-INTERVIEW ANALYSIS</p>
                <h2 className="mt-1 text-lg font-semibold">408 视频面试分析报告</h2>
              </div>
              {reportStatus === 'completed' && (
                <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
                  <CheckCircle2 size={15} /> 分析完成
                </span>
              )}
            </div>

            {(reportStatus === 'pending' || reportStatus === 'running' || reportStatus === 'idle') && (
              <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-4">
                <Loader2 size={20} className="animate-spin text-violet-200" />
                <div>
                  <p className="text-sm font-medium text-white/85">面试已结束，正在后台分析</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">实时语音连接已关闭，报告生成不会占用面试过程。完成后会自动显示并保存到「面试报告」。</p>
                </div>
              </div>
            )}

            {reportStatus === 'failed' && (
              <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-400/[0.07] p-4">
                <div className="flex items-center gap-2 text-sm text-amber-200">
                  <AlertCircle size={17} /> 报告暂未生成
                </div>
                <p className="mt-2 text-xs leading-6 text-slate-300">{reportError || '面试记录已保留，可重新发起分析。'}</p>
                <button onClick={() => void retryReport()} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-200/20 bg-amber-300/10 px-4 py-2 text-xs text-amber-100 hover:bg-amber-300/20">
                  <RefreshCw size={14} /> 重试生成报告
                </button>
              </div>
            )}

            {reportStatus === 'completed' && report && (
              <div className="mt-5 space-y-5">
                <div className="grid gap-4 md:grid-cols-[150px_1fr]">
                  <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-black/15 p-5">
                    <span className="text-xs text-slate-400">综合评分</span>
                    <span className="mt-1 text-4xl font-bold text-violet-200">{String(report.overall_score ?? '--')}</span>
                    <span className="mt-1 text-xs text-slate-500">满分 100</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/15 p-4">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-white/90"><Target size={15} className="text-violet-200" /> 综合评价</h3>
                    <p className="text-sm leading-7 text-slate-300">{String(report.summary || '本场面试分析已完成。')}</p>
                  </div>
                </div>

                {Array.isArray(report.dimension_analysis) && report.dimension_analysis.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-medium text-white/85">能力维度分析</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      {(report.dimension_analysis as Array<Record<string, unknown>>).map((item, index) => (
                        <div key={index} className="rounded-xl border border-white/10 bg-black/15 p-4">
                          <p className="text-sm font-medium text-violet-200">{String(item.dimension || '能力维度')}</p>
                          <p className="mt-2 text-xs leading-6 text-slate-300">{String(item.analysis || '')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(report.knowledge_gaps) && report.knowledge_gaps.length > 0 && (
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-white/85"><BookOpen size={15} className="text-amber-200" /> 薄弱知识点</h3>
                    <div className="space-y-2">
                      {(report.knowledge_gaps as Array<Record<string, unknown>>).map((item, index) => (
                        <div key={index} className="rounded-lg border border-white/10 bg-black/15 p-3">
                          <p className="text-sm text-amber-100">{String(item.knowledge_point || '待巩固知识点')}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-400">{String(item.analysis || '')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(report.question_reviews) && report.question_reviews.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-medium text-white/85">问答表现</h3>
                    <div className="space-y-3">
                      {(report.question_reviews as Array<Record<string, unknown>>).map((item, index) => (
                        <div key={index} className="rounded-xl border border-white/10 bg-black/15 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm leading-6 text-white/90">{index + 1}. {String(item.question || '面试问题')}</p>
                            <span className="shrink-0 rounded-md bg-violet-400/10 px-2 py-1 text-xs text-violet-200">{String(item.score ?? '--')} 分</span>
                          </div>
                          <p className="mt-2 text-xs leading-6 text-slate-400">回答概括：{String(item.answer_summary || '未提供')}</p>
                          {item.suggestion && <p className="mt-2 text-xs leading-6 text-emerald-200/80">建议：{String(item.suggestion)}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(report.improvement_suggestions) && report.improvement_suggestions.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-medium text-white/85">改进建议</h3>
                    <ul className="space-y-2">
                      {(report.improvement_suggestions as string[]).map((item, index) => (
                        <li key={index} className="rounded-lg border border-white/10 bg-black/15 px-4 py-3 text-xs leading-6 text-slate-300">{index + 1}. {item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(report.training_plan) && report.training_plan.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-medium text-white/85">后续训练计划</h3>
                    <div className="grid gap-3 md:grid-cols-3">
                      {(report.training_plan as Array<Record<string, unknown>>).map((item, index) => (
                        <div key={index} className="rounded-xl border border-white/10 bg-black/15 p-4">
                          <p className="text-sm font-medium text-cyan-100">{String(item.topic || ('训练任务 ' + (index + 1)))}</p>
                          <p className="mt-2 text-xs leading-6 text-slate-400">{String(item.task || '')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!connected && !finished ? (
            <button onClick={() => void handleStart()} disabled={starting || resumeUploading}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-8 py-3 font-medium shadow-lg shadow-violet-900/30 hover:opacity-90 disabled:opacity-50">
              {starting ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              {starting ? '正在建立连接…' : '开始视频面试'}
            </button>
          ) : (
            <button onClick={() => void handleEnd()}
              className="flex items-center gap-2 rounded-xl bg-red-600 px-8 py-3 font-medium hover:bg-red-500">
              <PhoneOff size={18} /> 结束面试
            </button>
          )}
          {finished && finishSaved && (
            <button onClick={onBack}
              className="rounded-xl border border-white/15 px-6 py-3 text-sm hover:bg-white/10">
              返回工作台
            </button>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-slate-500">
          摄像头画面仅在本地预览；实时语音服务已就绪。
        </p>
      </div>
    </div>
  )
}
