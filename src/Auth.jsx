import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function getFriendlyAuthError(error) {
  const errorMessage = String(error?.message || '')
  const lowerMessage = errorMessage.toLowerCase()

  if (
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch')
  ) {
    return 'Unable to connect. Please check your internet connection and try again.'
  }

  return errorMessage || 'Something went wrong. Please try again shortly.'
}

function Auth({
  onBack,
  onLogin,
  passwordRecovery = false,
  onPasswordResetComplete,
}) {
  const [mode, setMode] = useState(
    passwordRecovery ? 'recovery' : 'login'
  )

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (passwordRecovery) {
      setMode('recovery')
      setMessage('')
    }
  }, [passwordRecovery])

  const handleSubmit = async (e) => {
    e.preventDefault()

    setLoading(true)
    setMessage('')

    try {
      // LOGIN
      if (mode === 'login') {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          })

        if (error) {
          setMessage(getFriendlyAuthError(error))
        } else if (data.user) {
          onLogin()
        }
      }

      // SIGNUP
      else if (mode === 'signup') {
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
          setMessage(getFriendlyAuthError(error))
        } else if (data.user) {
          if (data.session) {
            setMessage('Account created successfully!')
          } else {
            setMessage(
              'Account created! Please check your email for your verification link.'
            )
          }
        }
      }

      // REQUEST PASSWORD RESET
      else if (mode === 'forgot') {
        const { error } =
          await supabase.auth.resetPasswordForEmail(
            email,
            {
              redirectTo: window.location.origin,
            }
          )

        if (error) {
          setMessage(getFriendlyAuthError(error))
        } else {
          setMode('reset-sent')
          setMessage(
            'If an account exists with this email, a password-reset link will be sent. Please check your inbox and spam folder.'
          )
        }
      }

      // UPDATE PASSWORD
      else if (mode === 'recovery') {
        if (password.length < 6) {
          setMessage(
            'Your new password must contain at least 6 characters.'
          )
          return
        }

        if (password !== confirmPassword) {
          setMessage('Your passwords do not match.')
          return
        }

        const { error } =
          await supabase.auth.updateUser({
            password,
          })

        if (error) {
          setMessage(getFriendlyAuthError(error))
        } else {
          setPassword('')
          setConfirmPassword('')
          setShowPassword(false)
          setShowConfirmPassword(false)

          setMessage(
            'Your password has been changed successfully.'
          )

          setMode('reset-success')

          if (onPasswordResetComplete) {
            onPasswordResetComplete()
          }
        }
      }
    } catch (error) {
      setMessage(getFriendlyAuthError(error))
    } finally {
      setLoading(false)
    }
  }

  const isLogin = mode === 'login'
  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'
  const isRecovery = mode === 'recovery'
  const isResetSent = mode === 'reset-sent'
  const isResetSuccess = mode === 'reset-success'

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
          {isLogin && 'Welcome back'}
          {isSignup && 'Create your account'}
          {isForgot && 'Forgot your password?'}
          {isRecovery && 'Create a new password'}
          {isResetSent && 'Check your email'}
          {isResetSuccess && 'Password updated'}
        </h2>

        <p>
          {isLogin &&
            'Log in to your UniAbuja Market account.'}

          {isSignup &&
            'Join UniAbuja Market today.'}

          {isForgot &&
            'Enter your registered email address and we will send you a password-reset link.'}

          {isRecovery &&
            'Choose a new password for your UniAbuja Market account.'}

          {isResetSent &&
            'Follow the password-reset link sent to your email address.'}

          {isResetSuccess &&
            'Your account password has been updated successfully.'}
        </p>

        {(isLogin ||
          isSignup ||
          isForgot ||
          isRecovery) && (
          <form onSubmit={handleSubmit}>
            {isSignup && (
              <input
                type="text"
                placeholder="Full name"
                value={fullName}
                onChange={(e) =>
                  setFullName(e.target.value)
                }
                required
              />
            )}

            {(isLogin || isSignup || isForgot) && (
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                required
              />
            )}

            {(isLogin || isSignup || isRecovery) && (
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={
                    isRecovery ? 'New password' : 'Password'
                  }
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  minLength={6}
                  autoComplete={
                    isRecovery
                      ? 'new-password'
                      : isLogin
                        ? 'current-password'
                        : 'new-password'
                  }
                  required
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowPassword((previous) => !previous)
                  }
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                  aria-pressed={showPassword}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            )}

            {isRecovery && (
              <div className="password-input-wrapper">
                <input
                  type={
                    showConfirmPassword ? 'text' : 'password'
                  }
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(e.target.value)
                  }
                  minLength={6}
                  autoComplete="new-password"
                  required
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() =>
                    setShowConfirmPassword(
                      (previous) => !previous
                    )
                  }
                  aria-label={
                    showConfirmPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                  aria-pressed={showConfirmPassword}
                >
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'Please wait...'
                : isLogin
                  ? 'Log in'
                  : isSignup
                    ? 'Create account'
                    : isForgot
                      ? 'Send reset link'
                      : 'Update password'}
            </button>
          </form>
        )}

        {message && (
          <p
            className="auth-message"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        )}

        {isLogin && (
          <>
            <button
              type="button"
              className="switch-auth"
              onClick={() => {
                setMode('forgot')
                setMessage('')
              }}
            >
              Forgot password?
            </button>

            <button
              type="button"
              className="switch-auth"
              onClick={() => {
                setMode('signup')
                setMessage('')
              }}
            >
              Don't have an account? Sign up
            </button>
          </>
        )}

        {isSignup && (
          <button
            type="button"
            className="switch-auth"
            onClick={() => {
              setMode('login')
              setMessage('')
            }}
          >
            Already have an account? Log in
          </button>
        )}

        {isForgot && (
          <button
            type="button"
            className="switch-auth"
            onClick={() => {
              setMode('login')
              setMessage('')
            }}
          >
            Back to login
          </button>
        )}

        {isResetSent && (
          <button
            type="button"
            className="switch-auth"
            onClick={() => {
              setMode('login')
              setMessage('')
            }}
          >
            Back to login
          </button>
        )}

        {isResetSuccess && (
          <button
            type="button"
            className="switch-auth"
            onClick={() => {
              setMode('login')
              setMessage('')
              onLogin()
            }}
          >
            Continue to Market
          </button>
        )}

        {isRecovery && (
          <button
            type="button"
            className="switch-auth"
            onClick={() => {
              setMode('login')
              setMessage('')
            }}
          >
            Back to login
          </button>
        )}
      </div>
    </div>
  )
}

export default Auth