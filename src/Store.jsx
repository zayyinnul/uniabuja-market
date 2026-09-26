import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function Store({ user, store, onBack, onStoreCreated }) {
  const [storeName, setStoreName] = useState('')
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [logo, setLogo] = useState(null)

  const [zones, setZones] = useState([])
  const [zoneFees, setZoneFees] = useState({})

  const [loading, setLoading] = useState(false)
  const [loadingRates, setLoadingRates] = useState(false)
  const [message, setMessage] = useState('')

  const isEditing = Boolean(store)

  useEffect(() => {
    if (store) {
      setStoreName(store.store_name || '')
      setDescription(store.description || '')
      setPhone(store.phone || '')
      setLocation(store.location || '')
    } else {
      setStoreName('')
      setDescription('')
      setPhone('')
      setLocation('')
    }

    setLogo(null)
    setMessage('')
    setZoneFees({})
  }, [store])

  useEffect(() => {
    loadDeliveryZones()
  }, [])

  useEffect(() => {
    if (store?.id) {
      loadStoreDeliveryRates(store.id)
    }
  }, [store?.id])

  const loadDeliveryZones = async () => {
    const { data, error } = await supabase
      .from('delivery_zones')
      .select('id, name, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (error) {
      console.error('Delivery zones error:', error)
      setMessage('Could not load delivery areas.')
      return
    }

    setZones(data || [])
  }

  const loadStoreDeliveryRates = async (storeId) => {
    setLoadingRates(true)

    const { data, error } = await supabase
      .from('store_delivery_rates')
      .select('zone_id, delivery_fee, is_active')
      .eq('store_id', storeId)
      .eq('is_active', true)

    if (error) {
      console.error('Delivery rates error:', error)
      setMessage('Could not load your delivery prices.')
      setLoadingRates(false)
      return
    }

    const fees = {}

    ;(data || []).forEach((rate) => {
      fees[rate.zone_id] = String(rate.delivery_fee)
    })

    setZoneFees(fees)
    setLoadingRates(false)
  }

  const handleZoneFeeChange = (zoneId, value) => {
    setZoneFees((current) => ({
      ...current,
      [zoneId]: value,
    }))
  }

  const saveDeliveryRates = async (storeId) => {
    for (const zone of zones) {
      const rawFee = zoneFees[zone.id]

      if (rawFee === undefined || rawFee === '') {
        continue
      }

      const fee = Number(rawFee)

      if (!Number.isFinite(fee) || fee < 0) {
        throw new Error(
          `Please enter a valid delivery fee for ${zone.name}.`
        )
      }

      const { error } = await supabase.rpc(
        'set_store_delivery_rate',
        {
          p_store_id: storeId,
          p_zone_id: zone.id,
          p_delivery_fee: fee,
        }
      )

      if (error) {
        throw error
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!user) {
      setMessage('Please log in first.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      let logoUrl = store?.logo_url || null

      // Upload a new logo if selected
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

      let savedStore

      if (isEditing) {
        // UPDATE EXISTING STORE
        const { data: updatedStore, error: updateError } =
          await supabase
            .from('stores')
            .update({
              store_name: storeName,
              description,
              phone,
              location,
              logo_url: logoUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', store.id)
            .eq('owner_id', user.id)
            .select()
            .single()

        if (updateError) {
          throw updateError
        }

        savedStore = updatedStore
      } else {
        // CREATE NEW STORE AS PENDING
        const { data: newStore, error: storeError } =
          await supabase
            .from('stores')
            .insert({
              owner_id: user.id,
              store_name: storeName,
              description,
              phone,
              location,
              logo_url: logoUrl,
              delivery_fee: 0,
              status: 'pending',
            })
            .select()
            .single()

        if (storeError) {
          throw storeError
        }

        savedStore = newStore
      }

      // Save location-based delivery prices
      await saveDeliveryRates(savedStore.id)

      setMessage(
        isEditing
          ? '✅ Store and delivery prices updated successfully!'
          : '🎉 Store application submitted! Waiting for admin approval.'
      )

      setLogo(null)

      setTimeout(() => {
        onStoreCreated(savedStore)
      }, 1500)
    } catch (error) {
      console.error('Store error:', error)
      setMessage(
        error.message || 'Something went wrong.'
      )
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
          <p className="welcome-small">
            {isEditing ? 'YOUR STORE' : 'SELL ON UNIABUJA MARKET'}
          </p>

          <h1>
            {isEditing
              ? 'Edit your store'
              : 'Apply to become a vendor'}
          </h1>

          <p>
            {isEditing
              ? 'Update your store information and delivery prices.'
              : 'Submit your store information for admin review before you start selling.'}
          </p>
        </div>

        {!isEditing && (
          <div className="store-approval-notice">
            <strong>Admin approval required</strong>
            <p>
              Your store will remain pending until an administrator
              reviews and approves your application.
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="store-form"
        >

          <label>
            Store name

            <input
              type="text"
              placeholder="e.g. Deen Fashion"
              value={storeName}
              onChange={(e) =>
                setStoreName(e.target.value)
              }
              required
            />
          </label>

          <label>
            Store description

            <textarea
              placeholder="Tell customers what you sell..."
              value={description}
              onChange={(e) =>
                setDescription(e.target.value)
              }
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
              onChange={(e) =>
                setPhone(e.target.value)
              }
              required
            />
          </label>

          <label>
            Store location

            <input
              type="text"
              placeholder="e.g. Main Campus, Abuja"
              value={location}
              onChange={(e) =>
                setLocation(e.target.value)
              }
              required
            />
          </label>

          <div className="delivery-pricing-section">
            <h3>Delivery pricing</h3>

            <p>
              Set the delivery price customers will pay
              for each delivery area.
            </p>

            {loadingRates ? (
              <p>Loading your delivery prices...</p>
            ) : zones.length === 0 ? (
              <p>No delivery areas are available yet.</p>
            ) : (
              <div className="delivery-zone-list">
                {zones.map((zone) => (
                  <label key={zone.id}>
                    {zone.name}

                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 500 or 0 for free"
                      value={zoneFees[zone.id] ?? ''}
                      onChange={(e) =>
                        handleZoneFeeChange(
                          zone.id,
                          e.target.value
                        )
                      }
                    />

                    {zoneFees[zone.id] === '0' && (
                      <small>
                        🎉 Free delivery
                      </small>
                    )}
                  </label>
                ))}
              </div>
            )}

            <small>
              Enter 0 for free delivery. You can leave an
              area blank if you do not currently deliver
              there. More areas can be added later by the
              administrator.
            </small>
          </div>

          <label>
            Store logo

            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setLogo(e.target.files?.[0] || null)
              }
            />

            <small>
              {isEditing
                ? 'Optional. Choose a new image only if you want to replace the current logo.'
                : 'Optional. Maximum recommended size: 5MB.'}
            </small>
          </label>

          {isEditing && store?.logo_url && !logo && (
            <div className="store-current-logo">
              <p>Current store logo</p>

              <img
                src={store.logo_url}
                alt="Current store logo"
              />
            </div>
          )}

          {logo && (
            <p className="store-file-name">
              New logo selected: {logo.name}
            </p>
          )}

          <button
            type="submit"
            className="primary-btn store-submit"
            disabled={loading}
          >
            {loading
              ? isEditing
                ? 'Saving changes...'
                : 'Submitting application...'
              : isEditing
                ? 'Save Changes'
                : 'Submit Vendor Application'}
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