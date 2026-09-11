import { useState } from 'react'
import { supabase } from './lib/supabase'

function Product({ user, onBack, onProductCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [stock, setStock] = useState('')
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      // Find the store belonging to the logged-in user
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle()

      if (storeError) {
        throw storeError
      }

      if (!store) {
        throw new Error('You need to create a store first.')
      }

      let imageUrl = null

      // Upload product image
      if (image) {
        const fileExt = image.name.split('.').pop()
        const fileName = `${user.id}-${Date.now()}.${fileExt}`
        const filePath = `${user.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, image)

        if (uploadError) {
          throw uploadError
        }

        const { data } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath)

        imageUrl = data.publicUrl
      }

      // Create product
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          vendor_id: user.id,
          name,
          description,
          price: Number(price),
          category,
          image_url: imageUrl,
          stock: Number(stock),
          status: 'active',
        })
        .select()
        .single()

      if (productError) {
        throw productError
      }

      setMessage('🎉 Product added successfully!')

      setTimeout(() => {
        onProductCreated(product)
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
          <p className="welcome-small">YOUR STORE</p>

          <h1>Add a product</h1>

          <p>
            Add products that students can discover and buy
            on UniAbuja Market.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="store-form">

          <label>
            Product name
            <input
              type="text"
              placeholder="e.g. Chicken Shawarma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label>
            Product description
            <textarea
              placeholder="Describe your product..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="4"
              required
            />
          </label>

          <label>
            Price (₦)
            <input
              type="number"
              placeholder="e.g. 2500"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="1"
              required
            />
          </label>

          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="">Select a category</option>
              <option value="Food & Drinks">Food & Drinks</option>
              <option value="Fashion">Fashion</option>
              <option value="Electronics">Electronics</option>
              <option value="Beauty">Beauty</option>
              <option value="Books">Books</option>
              <option value="Services">Services</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label>
            Stock quantity
            <input
              type="number"
              placeholder="e.g. 10"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              min="0"
              required
            />
          </label>

          <label>
            Product image
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files[0])}
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
            {loading ? 'Adding product...' : 'Add Product'}
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

export default Product