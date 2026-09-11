import { useState } from 'react'
import { supabase } from './lib/supabase'

function Store({ user, onBack, onStoreCreated }) {
  const [storeName, setStoreName] = useState('')
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [logo, setLogo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      let logoUrl = null

      // Upload logo if one was selected
      if (logo) {
        const fileExt = logo.name.split('.').pop()
        const fileName = `${user.id}-${Date.now()}.${fileExt}`
        const filePath = `${user.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('store-images')
          .upload(filePath, logo)

        if (uploadError) {
          throw uploadError
        }

        const { data } = supabase.storage
          .from('store-images')
          .getPublicUrl(filePath)

        logoUrl = data.publicUrl
      }

      // Create the store
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .insert({
          owner_id: user.id,
          store_name: storeName,
          description: description,
          phone: phone,
          location: location,
          logo_url: logoUrl,
          status: 'active',
        })
        .select()
        .single()

      if (storeError) {
        throw storeError
      }

      setMessage('🎉 Store created successfully!')

      setTimeout(() => {
        onStoreCreated(store)
      }, 1000)
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="store-page">
      <div className="store-card">

        <button
          type="button"
          className="back-button"
          onClick={onBack}
        >
          ← Back to Dashboard
        </button>

        <div className="store-heading">
          <p className="welcome-small">START SELLING</p>

          <h1>Create your store</h1>

          <p>
            Set up your UniAbuja Market store and start selling
            to other students.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="store-form">

          <label>
            Store name
            <input
              type="text"
              placeholder="e.g. Deen Fashion"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
            />
          </label>

          <label>
            Store description
            <textarea
              placeholder="Tell customers what you sell..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="4"
              required
            />
          </label>

          <label>
            Phone number
            <input
              type="tel"
              placeholder="e.g. 08012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>

          <label>
            Store location
            <input
              type="text"
              placeholder="e.g. Campus 2, Abuja"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </label>

          <label>
            Store logo
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogo(e.target.files[0])}
            />
            <small>
              Optional. Maximum recommended size: 5MB.
            </small>
          </label>

          <button
            type="submit"
            className="primary-btn store-submit"
            disabled={loading}
          >
            {loading ? 'Creating store...' : 'Create Store'}
          </button>

        </form>

        {message && (
          <p className="auth-message">
            {message}
          </p>
        )}

      </div>
    </div>
  )
}

export default Store