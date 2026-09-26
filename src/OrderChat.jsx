import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function OrderChat({
  user,
  orderId = null,
  vendorOrderId = null,
  title = 'Order chat',
}) {
  const [chat, setChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (
      !user?.id ||
      (!orderId && !vendorOrderId)
    ) {
      setLoading(false)
      return
    }

    loadChat()
  }, [user?.id, orderId, vendorOrderId])

  const loadChat = async () => {
    setLoading(true)
    setMessage('')
    setChat(null)

    try {
      const { data: chatId, error: resolveError } =
        await supabase.rpc('resolve_order_chat', {
          p_order_id: orderId || null,
          p_vendor_order_id: vendorOrderId || null,
        })

      if (resolveError) {
        throw new Error(resolveError.message)
      }

      if (!chatId) {
        throw new Error(
          'Order chat is not available.'
        )
      }

      const { data: chatData, error: chatError } =
        await supabase
          .from('order_chats')
          .select(
            'id, vendor_order_id, created_at'
          )
          .eq('id', chatId)
          .maybeSingle()

      if (chatError) {
        throw new Error(chatError.message)
      }

      if (!chatData) {
        throw new Error(
          'Order chat is not available yet.'
        )
      }

      setChat(chatData)

      const {
        data: messageData,
        error: messagesError,
      } = await supabase
        .from('chat_messages')
        .select(`
          id,
          chat_id,
          sender_id,
          message,
          is_read,
          created_at
        `)
        .eq('chat_id', chatData.id)
        .order('created_at', {
          ascending: true,
        })

      if (messagesError) {
        throw new Error(messagesError.message)
      }

      setMessages(messageData || [])

      await supabase.rpc(
        'mark_chat_messages_read',
        {
          p_chat_id: chatData.id,
        }
      )
    } catch (error) {
      console.error(
        'Order chat error:',
        error
      )

      setMessage(
        error.message ||
          'Could not load the order chat.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!chat?.id) {
      return
    }

    const channel = supabase
      .channel(`order-chat-${chat.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `chat_id=eq.${chat.id}`,
        },
        async (payload) => {
          const newMessage = payload.new

          setMessages((current) => {
            if (
              current.some(
                (item) =>
                  item.id === newMessage.id
              )
            ) {
              return current
            }

            return [
              ...current,
              newMessage,
            ]
          })

          if (
            newMessage.sender_id !== user.id
          ) {
            await supabase.rpc(
              'mark_chat_messages_read',
              {
                p_chat_id: chat.id,
              }
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chat?.id, user?.id])

  const sendMessage = async (event) => {
    event.preventDefault()

    const trimmed = text.trim()

    if (
      !trimmed ||
      !chat?.id ||
      sending
    ) {
      return
    }

    setSending(true)
    setMessage('')

    try {
      const {
        data,
        error,
      } = await supabase
        .from('chat_messages')
        .insert({
          chat_id: chat.id,
          sender_id: user.id,
          message: trimmed,
        })
        .select(`
          id,
          chat_id,
          sender_id,
          message,
          is_read,
          created_at
        `)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      setMessages((current) => {
        if (
          current.some(
            (item) => item.id === data.id
          )
        ) {
          return current
        }

        return [...current, data]
      })

      setText('')
    } catch (error) {
      console.error(
        'Send chat message error:',
        error
      )

      setMessage(
        error.message ||
          'Could not send your message.'
      )
    } finally {
      setSending(false)
    }
  }

  const formatTime = (date) => {
    return new Date(date).toLocaleString(
      [],
      {
        hour: 'numeric',
        minute: '2-digit',
      }
    )
  }

  if (loading) {
    return (
      <div
        style={{
          marginTop: '18px',
          padding: '16px',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          background: '#f8fafc',
        }}
      >
        <strong>
          💬 {title}
        </strong>

        <p>Loading chat...</p>
      </div>
    )
  }

  if (!chat) {
    return (
      <div
        style={{
          marginTop: '18px',
          padding: '16px',
          border: '1px solid #fecaca',
          borderRadius: '12px',
          background: '#fef2f2',
          color: '#991b1b',
        }}
      >
        <strong>
          💬 {title}
        </strong>

        <p
          style={{
            marginBottom: 0,
          }}
        >
          {message ||
            'Chat unavailable.'}
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        marginTop: '18px',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          background: '#f8fafc',
          borderBottom:
            '1px solid #e2e8f0',
        }}
      >
        <strong>
          💬 {title}
        </strong>

        <p
          style={{
            margin: '4px 0 0',
            fontSize: '13px',
            color: '#64748b',
          }}
        >
          Chat about this order.
          Phone numbers are not shared.
        </p>
      </div>

      <div
        style={{
          padding: '14px',
          height: '260px',
          overflowY: 'auto',
          background: '#f8fafc',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '14px',
            }}
          >
            No messages yet.
            <br />
            Start the conversation below.
          </div>
        ) : (
          messages.map((item) => {
            const mine =
              item.sender_id === user.id

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent:
                    mine
                      ? 'flex-end'
                      : 'flex-start',
                  marginBottom: '10px',
                }}
              >
                <div
                  style={{
                    maxWidth: '78%',
                    padding: '10px 12px',
                    borderRadius: mine
                      ? '14px 14px 4px 14px'
                      : '14px 14px 14px 4px',
                    background: mine
                      ? '#0f766e'
                      : '#fff',
                    color: mine
                      ? '#fff'
                      : '#1e293b',
                    border: mine
                      ? 'none'
                      : '1px solid #e2e8f0',
                    boxShadow:
                      '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                >
                  <div
                    style={{
                      whiteSpace:
                        'pre-wrap',
                      wordBreak:
                        'break-word',
                    }}
                  >
                    {item.message}
                  </div>

                  <div
                    style={{
                      marginTop: '4px',
                      fontSize: '11px',
                      opacity: 0.7,
                      textAlign: 'right',
                    }}
                  >
                    {formatTime(
                      item.created_at
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {message && (
        <div
          style={{
            padding: '8px 12px',
            color: '#b91c1c',
            fontSize: '13px',
            background: '#fef2f2',
            borderTop:
              '1px solid #fecaca',
          }}
        >
          {message}
        </div>
      )}

      <form
        onSubmit={sendMessage}
        style={{
          display: 'flex',
          gap: '8px',
          padding: '12px',
          borderTop:
            '1px solid #e2e8f0',
          background: '#fff',
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(event) =>
            setText(event.target.value)
          }
          placeholder="Type a message..."
          maxLength={1000}
          disabled={sending}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '11px 12px',
            border:
              '1px solid #cbd5e1',
            borderRadius: '9px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <button
          type="submit"
          className="primary-btn"
          disabled={
            sending ||
            !text.trim()
          }
          style={{
            marginTop: 0,
            whiteSpace: 'nowrap',
            opacity:
              sending ||
              !text.trim()
                ? 0.6
                : 1,
          }}
        >
          {sending
            ? 'Sending...'
            : 'Send'}
        </button>
      </form>
    </div>
  )
}

export default OrderChat