import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function MyProducts({ user, onBack, onAddProduct }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const loadProducts = async () => {
    if (!user) return

    setLoading(true)
    setMessage('')

    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          vendor_id,
          name,
          description,
          price,
          category,
          image_url,
          stock,
          status,
          created_at
        `)
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      setProducts(data || [])
    } catch (error) {
      console.error('My products error:', error)
      setMessage(
        error.message || 'Could not load your products.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [user])

  const startEditing = (product) => {
    setMessage('')
    setEditingProduct({
      ...product,
      price: String(product.price ?? ''),
      stock: String(product.stock ?? ''),
      newImage: null,
    })
  }

  const cancelEditing = () => {
    setEditingProduct(null)
    setMessage('')
  }

  const handleUpdate = async (e) => {
    e.preventDefault()

    if (!editingProduct) return

    setSaving(true)
    setMessage('')

    try {
      const productPrice = Number(editingProduct.price)
      const productStock = Number(editingProduct.stock)

      if (
        !Number.isFinite(productPrice) ||
        productPrice <= 0
      ) {
        throw new Error(
          'Please enter a valid product price.'
        )
      }

      if (
        !Number.isInteger(productStock) ||
        productStock < 0
      ) {
        throw new Error(
          'Please enter a valid stock quantity.'
        )
      }

      let imageUrl = editingProduct.image_url || null

      // Upload replacement image if one was selected
      if (editingProduct.newImage) {
        const fileExt =
          editingProduct.newImage.name
            .split('.')
            .pop()

        const fileName =
          `${user.id}-${Date.now()}.${fileExt}`

        const filePath =
          `${user.id}/${fileName}`

        const { error: uploadError } =
          await supabase.storage
            .from('product-images')
            .upload(
              filePath,
              editingProduct.newImage
            )

        if (uploadError) {
          throw uploadError
        }

        const { data } =
          supabase.storage
            .from('product-images')
            .getPublicUrl(filePath)

        imageUrl = data.publicUrl
      }

      const { data: updatedProduct, error } =
        await supabase
          .from('products')
          .update({
            name: editingProduct.name.trim(),
            description:
              editingProduct.description.trim(),
            price: productPrice,
            category: editingProduct.category,
            image_url: imageUrl,
            stock: productStock,
          })
          .eq('id', editingProduct.id)
          .eq('vendor_id', user.id)
          .select()
          .single()

      if (error) {
        throw error
      }

      setProducts((currentProducts) =>
        currentProducts.map((product) =>
          product.id === updatedProduct.id
            ? updatedProduct
            : product
        )
      )

      setEditingProduct(null)
      setMessage('✅ Product updated successfully!')
    } catch (error) {
      console.error('Product update error:', error)

      setMessage(
        error.message ||
          'Could not update the product.'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (product) => {
    const confirmed = window.confirm(
      `Delete "${product.name}"?\n\nThis action cannot be undone.`
    )

    if (!confirmed) return

    setDeletingId(product.id)
    setMessage('')

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id)
        .eq('vendor_id', user.id)

      if (error) {
        throw error
      }

      setProducts((currentProducts) =>
        currentProducts.filter(
          (item) => item.id !== product.id
        )
      )

      setMessage('🗑️ Product deleted successfully.')
    } catch (error) {
      console.error('Product delete error:', error)

      setMessage(
        error.message ||
          'Could not delete the product.'
      )
    } finally {
      setDeletingId(null)
    }
  }

  const categories = [
    'Food & Drinks',
    'Fashion',
    'Electronics',
    'Beauty',
    'Books',
    'Services',
    'Other',
  ]

  if (loading) {
    return (
      <div className="loading-page">
        <h2>UniAbuja Market</h2>
        <p>Loading your products...</p>
      </div>
    )
  }

  if (editingProduct) {
    return (
      <div className="store-page">
        <div className="store-card">

          <button
            type="button"
            className="back-button"
            onClick={cancelEditing}
          >
            ← Back to My Products
          </button>

          <div className="store-heading">
            <p className="welcome-small">
              YOUR STORE
            </p>

            <h1>Edit product</h1>

            <p>
              Update your product information.
            </p>
          </div>

          <form
            onSubmit={handleUpdate}
            className="store-form"
          >

            <label>
              Product name

              <input
                type="text"
                value={editingProduct.name}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    name: e.target.value,
                  })
                }
                required
              />
            </label>

            <label>
              Product description

              <textarea
                value={
                  editingProduct.description || ''
                }
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    description: e.target.value,
                  })
                }
                rows="4"
                required
              />
            </label>

            <label>
              Price (₦)

              <input
                type="number"
                value={editingProduct.price}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    price: e.target.value,
                  })
                }
                min="1"
                step="0.01"
                required
              />
            </label>

            <label>
              Category

              <select
                value={editingProduct.category || ''}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    category: e.target.value,
                  })
                }
                required
              >
                <option value="">
                  Select a category
                </option>

                {categories.map((item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Stock quantity

              <input
                type="number"
                value={editingProduct.stock}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    stock: e.target.value,
                  })
                }
                min="0"
                step="1"
                required
              />
            </label>

            <label>
              Product image

              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    newImage:
                      e.target.files?.[0] || null,
                  })
                }
              />

              <small>
                Leave empty to keep the current image.
              </small>
            </label>

            {editingProduct.image_url &&
              !editingProduct.newImage && (
                <div className="store-current-logo">
                  <p>Current product image</p>

                  <img
                    src={editingProduct.image_url}
                    alt={editingProduct.name}
                  />
                </div>
              )}

            {editingProduct.newImage && (
              <p className="store-file-name">
                New image selected:{' '}
                {editingProduct.newImage.name}
              </p>
            )}

            <button
              type="submit"
              className="primary-btn store-submit"
              disabled={saving}
            >
              {saving
                ? 'Saving changes...'
                : 'Save Changes'}
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

  return (
    <div className="market-page">

      <nav className="navbar">

        <div className="logo">
          UniAbuja Market
        </div>

        <button
          type="button"
          className="back-button"
          onClick={onBack}
        >
          ← Back to Dashboard
        </button>

      </nav>

      <main className="market-container">

        <div className="market-header">

          <p className="welcome-small">
            YOUR STORE
          </p>

          <h1>
            My Products
          </h1>

          <p>
            Manage the products you're selling
            on UniAbuja Market.
          </p>

          <button
            type="button"
            className="primary-btn"
            onClick={onAddProduct}
          >
            + Add New Product
          </button>

        </div>

        {message && (
          <div className="auth-message">
            {message}
          </div>
        )}

        {products.length === 0 ? (
          <div className="market-message">

            <div className="empty-cart-icon">
              📦
            </div>

            <h3>
              You haven't added any products yet.
            </h3>

            <p>
              Add your first product to start
              selling to students.
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={onAddProduct}
            >
              Add Your First Product
            </button>

          </div>
        ) : (
          <div className="product-grid">

            {products.map((product) => (
              <div
                className="product-card"
                key={product.id}
              >

                <div className="product-image">

                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                    />
                  ) : (
                    <span>🛍️</span>
                  )}

                </div>

                <div className="product-info">

                  <span className="product-category">
                    {product.category}
                  </span>

                  <h3>
                    {product.name}
                  </h3>

                  <p>
                    {product.description}
                  </p>

                  <div className="product-bottom">

                    <strong>
                      ₦
                      {Number(
                        product.price
                      ).toLocaleString()}
                    </strong>

                    <span>
                      {product.stock > 0
                        ? `${product.stock} available`
                        : 'Out of stock'}
                    </span>

                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      marginTop: '12px',
                    }}
                  >

                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() =>
                        startEditing(product)
                      }
                      style={{
                        flex: 1,
                      }}
                    >
                      ✏️ Edit
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDelete(product)
                      }
                      disabled={
                        deletingId === product.id
                      }
                      style={{
                        flex: 1,
                        border: '1px solid #ef4444',
                        background: '#fff',
                        color: '#dc2626',
                        borderRadius: '8px',
                        padding: '10px',
                        cursor:
                          deletingId === product.id
                            ? 'not-allowed'
                            : 'pointer',
                        fontWeight: '600',
                      }}
                    >
                      {deletingId === product.id
                        ? 'Deleting...'
                        : '🗑️ Delete'}
                    </button>

                  </div>

                </div>

              </div>
            ))}

          </div>
        )}

      </main>

    </div>
  )
}

export default MyProducts