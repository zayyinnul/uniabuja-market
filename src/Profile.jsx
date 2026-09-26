import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function Profile({ user, onBack }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('')
  const [createdAt, setCreatedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadProfile()
  }, [user])

  const loadProfile = async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    setMessage('')

    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, phone, role, created_at')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Profile loading error:', error)
      setError('Unable to load your profile.')
      setLoading(false)
      return
    }

    if (data) {
      setFullName(data.full_name || '')
      setPhone(data.phone || '')
      setRole(data.role || '')
      setCreatedAt(data.created_at || '')
    } else {
      setFullName(user.user_metadata?.full_name || '')
      setPhone('')
      setRole('')
      setCreatedAt('')
    }

    setLoading(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (error) {
        throw error
      }

      setMessage('Profile updated successfully.')
    } catch (err) {
      console.error('Profile update error:', err)
      setError(
        err.message || 'Unable to update your profile.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <p>Loading your profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <div className="profile-card">

        <button
          type="button"
          className="back-button"
          onClick={onBack}
        >
          ← Back to Dashboard
        </button>

        <div className="profile-header">
          <div className="profile-avatar">
            {fullName
              ? fullName.charAt(0).toUpperCase()
              : 'U'}
          </div>

          <div>
            <h2>My Profile</h2>
            <p>
              Manage your UniAbuja Market account
              information.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave}>

          <label>
            Full name
          </label>

          <input
            type="text"
            value={fullName}
            onChange={(e) =>
              setFullName(e.target.value)
            }
            placeholder="Enter your full name"
            required
          />

          <label>
            Email address
          </label>

          <input
            type="email"
            value={user?.email || ''}
            disabled
          />

          <small>
            Your email address is managed by your
            account authentication.
          </small>

          <label>
            Phone number
          </label>

          <input
            type="tel"
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value)
            }
            placeholder="Enter your phone number"
          />

          <label>
            Account type
          </label>

          <input
            type="text"
            value={role || 'Student'}
            disabled
          />

          {createdAt && (
            <p className="profile-joined">
              Member since{' '}
              {new Date(createdAt).toLocaleDateString(
                'en-NG',
                {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }
              )}
            </p>
          )}

          {message && (
            <p className="profile-success">
              {message}
            </p>
          )}

          {error && (
            <p className="profile-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
          >
            {saving
              ? 'Saving...'
              : 'Save Changes'}
          </button>

        </form>
      </div>
    </div>
  )
}

export default Profile