import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function Market({ user, onBack, onCart }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingProduct, setAddingProduct] = useState(null)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Product loading error:', error)
      setMessage('Could not load products.')
    } else {
      setProducts(data || [])
    }

    setLoading(false)
  }

  const addToCart = async (product) => {
    if (!user) {
      setMessage('Please log in before adding products to your cart.')
      return
    }

    setAddingProduct(product.id)
    setMessage('')

    try {
      const { data: existingItem, error: checkError } = await supabase
        .from('cart_items')
        .select('*')
        .eq('customer_id', user.id)
        .eq('product_id', product.id)
        .maybeSingle()

      if (checkError) {
        console.error('Cart checking error:', checkError)
        throw new Error('Could not check your cart.')
      }

      if (existingItem) {
        const newQuantity = existingItem.quantity + 1

        if (newQuantity > product.stock) {
          setMessage('You cannot add more than the available stock.')
          return
        }

        const { error: updateError } = await supabase
          .from('cart_items')
          .update({
            quantity: newQuantity,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingItem.id)
          .eq('customer_id', user.id)

        if (updateError) {
          console.error('Cart update error:', updateError)
          throw new Error('Could not update your cart.')
        }

        setMessage(`${product.name} quantity increased in your cart.`)
      } else {
        const { error: insertError } = await supabase
          .from('cart_items')
          .insert({
            customer_id: user.id,
            product_id: product.id,
            quantity: 1,
          })

        if (insertError) {
          console.error('Cart insert error:', insertError)
          throw new Error('Could not add product to cart.')
        }

        setMessage(`${product.name} added to cart! 🛒`)
      }
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Something went wrong.')
    } finally {
      setAddingProduct(null)
    }
  }

  const filteredProducts = products.filter((product) => {
    const productName = product.name || ''
    const productDescription = product.description || ''

    const matchesSearch =
      productName.toLowerCase().includes(search.toLowerCase()) ||
      productDescription.toLowerCase().includes(search.toLowerCase())

    const matchesCategory =
      category === 'All' || product.category === category

    return matchesSearch && matchesCategory
  })

  const categories = [
    'All',
    'Food & Drinks',
    'Fashion',
    'Electronics',
    'Beauty',
    'Books',
    'Services',
    'Other',
  ]

  return (
    <div className="market-page">
      <nav className="navbar">
        <div className="logo">
          UniAbuja Market
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="back-button"
            onClick={onCart}
          >
            🛒 View Cart
          </button>

          <button
            type="button"
            className="back-button"
            onClick={onBack}
          >
            ← Back to Dashboard
          </button>
        </div>
      </nav>

      <main className="market-container">
        <div className="market-header">
          <p className="welcome-small">
            UNIABUJA MARKET
          </p>

          <h1>
            Explore Market
          </h1>

          <p>
            Discover products from student vendors.
          </p>
        </div>

        <div className="market-controls">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((item) => (
              <option
                key={item}
                value={item}
              >
                {item}
              </option>
            ))}
          </select>
        </div>

        {message && (
          <div className="auth-message">
            {message}
          </div>
        )}

        {loading ? (
          <div className="market-message">
            <h3>
              Loading products...
            </h3>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="market-message">
            <h3>
              No products found
            </h3>

            <p>
              Try another search or category.
            </p>
          </div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((product) => (
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
                    <span>
                      🛍️
                    </span>
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
                      ₦{Number(product.price).toLocaleString()}
                    </strong>

                    <span>
                      {product.stock > 0
                        ? `${product.stock} available`
                        : 'Out of stock'}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="primary-btn"
                    disabled={
                      product.stock <= 0 ||
                      addingProduct === product.id
                    }
                    onClick={() => addToCart(product)}
                  >
                    {addingProduct === product.id
                      ? 'Adding...'
                      : product.stock > 0
                        ? 'Add to Cart'
                        : 'Out of Stock'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default Market