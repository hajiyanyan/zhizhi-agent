
import { useState } from 'react'
import { checkBackend } from './api/interview'

export default function BackendTest() {
  const [message, setMessage] = useState('尚未测试')
  const [loading, setLoading] = useState(false)

  async function testConnection() {
    setLoading(true)
    setMessage('正在连接后端...')

    try {
      const result = await checkBackend()
      setMessage(
        `连接成功！状态：${result.status}，服务：${result.service}`,
      )
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '连接失败',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <h2>职智 Agent 后端连接测试</h2>
      <p>{message}</p>
      <button
        onClick={testConnection}
        disabled={loading}
        style={{
          padding: '10px 20px',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        {loading ? '连接中...' : '测试后端连接'}
      </button>
    </div>
  )
}
