import { useState } from 'react'
import { supabase } from './lib/supabase'

function Auth({ onBack, onLogin }) {
  const [isLogin, setIsLogin] = useState(true)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (isLogin) {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          })

        if (error) {
          setMessage(error.message)
        } else if (data.user) {
          onLogin()
        }
      } else {
        const { data, error } =
          await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
              },
              emailRedirectTo: window.location.origin,
            },
          })

        if (error) {
          setMessage(error.message)
        } else if (data.user) {
          if (data.session) {
            setMessage('Account created successfully!')
          } else {
            setMessage(
              'Account created! Please check your email and confirm your account.'
            )
          }
        }
      }
    } catch (error) {
      setMessage(error.message)
    }

    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        <button
          type="button"
          className="back-button"
          onClick={onBack}
        >
          ← Back to Market
        </button>

        <h2>
          {isLogin ? 'Welcome back' : 'Create your account'}
        </h2>

        <p>
          {isLogin
            ? 'Log in to your UniAbuja Market account.'
            : 'Join UniAbuja Market today.'}
        </p>

        <form onSubmit={handleSubmit}>

          {!isLogin && (
            <input
              type="text"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          )}

          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          <button type="submit" disabled={loading}>
            {loading
              ? 'Please wait...'
              : isLogin
                ? 'Log in'
                : 'Create account'}
          </button>

        </form>

        {message && (
          <p className="auth-message">
            {message}
          </p>
        )}

        <button
          type="button"
          className="switch-auth"
          onClick={() => {
            setIsLogin(!isLogin)
            setMessage('')
          }}
        >
          {isLogin
            ? "Don't have an account? Sign up"
            : 'Already have an account? Log in'}
        </button>

      </div>
    </div>
  )
}

export default Auth