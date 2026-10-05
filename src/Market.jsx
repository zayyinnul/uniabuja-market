import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function Market({ user, onBack, onCart }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingProduct, setAddingProduct] = useState(null)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedStore, setSelectedStore] = useState(null)
  const [storeProducts, setStoreProducts] = useState([])
  const [loadingStore, setLoadingStore] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname

      const productMatch = path.match(/^\/product\/([^/]+)$/)
      const storeMatch = path.match(/^\/store\/([^/]+)$/)

      if (productMatch) {
        const product = products.find(
          (item) => item.id === productMatch[1]
        )

        setSelectedStore(null)
        setStoreProducts([])

        if (product) {
          setSelectedProduct(product)
        }
      } else if (storeMatch) {
        setSelectedProduct(null)

        loadStore(storeMatch[1])
      } else {
        setSelectedProduct(null)
        setSelectedStore(null)
        setStoreProducts([])
      }
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [products])

  useEffect(() => {
    const path = window.location.pathname

    const productMatch = path.match(/^\/product\/([^/]+)$/)
    const storeMatch = path.match(/^\/store\/([^/]+)$/)

    if (productMatch && products.length > 0) {
      const product = products.find(
        (item) => item.id === productMatch[1]
      )

      if (product) {
        setSelectedProduct(product)
      }
    }

    if (storeMatch) {
      loadStore(storeMatch[1])
    }
  }, [products])

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

  const loadStore = async (storeId) => {
    setLoadingStore(true)
    setMessage('')

    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select(`
        id,
        owner_id,
        store_name,
        description,
        phone,
        location,
        logo_url,
        status
      `)
      .eq('id', storeId)
      .eq('status', 'approved')
      .maybeSingle()

    if (storeError) {
      console.error('Store loading error:', storeError)
      setMessage('Could not load this store.')
      setLoadingStore(false)
      return
    }

    if (!store) {
      setMessage('Store not found or is not currently available.')
      setSelectedStore(null)
      setLoadingStore(false)
      return
    }

    const { data: productsForStore, error: productsError } =
      await supabase
        .from('products')
        .select('*')
        .eq('vendor_id', store.owner_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

    if (productsError) {
      console.error(
        'Store products loading error:',
        productsError
      )

      setMessage('Could not load this store.')
      setLoadingStore(false)
      return
    }

    setSelectedStore(store)
    setStoreProducts(productsForStore || [])
    setSelectedProduct(null)
    setLoadingStore(false)
  }

  const openProduct = (product) => {
    setSelectedStore(null)
    setStoreProducts([])
    setSelectedProduct(product)
    setMessage('')

    window.history.pushState(
      {
        uniAbujaMarketView: 'product',
        productId: product.id,
      },
      '',
      `/product/${product.id}`
    )
  }

  const openStore = async (storeId) => {
    setSelectedProduct(null)
    setSelectedStore(null)
    setStoreProducts([])
    setMessage('')

    window.history.pushState(
      {
        uniAbujaMarketView: 'store',
        storeId,
      },
      '',
      `/store/${storeId}`
    )

    await loadStore(storeId)
  }

  /*
   * FIX:
   * Product has vendor_id, but the public store URL needs stores.id.
   * Resolve the vendor's approved store first.
   */
  const openVendorStore = async (vendorId) => {
    if (!vendorId) {
      setMessage('Vendor store could not be found.')
      return
    }

    setMessage('')
    setLoadingStore(true)

    const { data: store, error } = await supabase
      .from('stores')
      .select(`
        id,
        owner_id,
        store_name,
        description,
        phone,
        location,
        logo_url,
        status
      `)
      .eq('owner_id', vendorId)
      .eq('status', 'approved')
      .maybeSingle()

    if (error) {
      console.error(
        'Vendor store lookup error:',
        error
      )

      setLoadingStore(false)
      setMessage('Could not load this vendor store.')
      return
    }

    if (!store) {
      setLoadingStore(false)
      setMessage(
        'This vendor does not currently have an approved store.'
      )
      return
    }

    setLoadingStore(false)

    await openStore(store.id)
  }

  /*
   * FIX:
   * Use browser history instead of pushState('/') so Android/browser
   * Back correctly returns:
   *
   * Product → Market
   * Store → Market
   * Product → Store → Product
   */
  const closeDetail = () => {
    if (
      window.location.pathname.startsWith('/product/') ||
      window.location.pathname.startsWith('/store/')
    ) {
      window.history.back()
      return
    }

    setSelectedProduct(null)
    setSelectedStore(null)
    setStoreProducts([])
  }

  const shareProduct = async (product) => {
    const shareUrl =
      `${window.location.origin}/product/${product.id}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: product.name,
          text:
            `Check out ${product.name} on UniAbuja Market.`,
          url: shareUrl,
        })

        return
      }

      await navigator.clipboard.writeText(shareUrl)

      setMessage('Product link copied! 🔗')
    } catch (error) {
      console.error(
        'Product sharing error:',
        error
      )
    }
  }

  const shareStore = async (store) => {
    const shareUrl =
      `${window.location.origin}/store/${store.id}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: store.store_name,
          text:
            `Check out ${store.store_name} on UniAbuja Market.`,
          url: shareUrl,
        })

        return
      }

      await navigator.clipboard.writeText(shareUrl)

      setMessage('Store link copied! 🔗')
    } catch (error) {
      console.error(
        'Store sharing error:',
        error
      )
    }
  }

  const addToCart = async (product) => {
    if (!user) {
      setMessage(
        'Please log in before adding products to your cart.'
      )
      return
    }

    setAddingProduct(product.id)
    setMessage('')

    try {
      const {
        data: existingItem,
        error: checkError,
      } = await supabase
        .from('cart_items')
        .select('*')
        .eq('customer_id', user.id)
        .eq('product_id', product.id)
        .maybeSingle()

      if (checkError) {
        console.error(
          'Cart checking error:',
          checkError
        )

        throw new Error(
          'Could not check your cart.'
        )
      }

      if (existingItem) {
        const newQuantity =
          existingItem.quantity + 1

        if (newQuantity > product.stock) {
          setMessage(
            'You cannot add more than the available stock.'
          )

          return
        }

        const {
          error: updateError,
        } = await supabase
          .from('cart_items')
          .update({
            quantity: newQuantity,
            updated_at:
              new Date().toISOString(),
          })
          .eq('id', existingItem.id)
          .eq('customer_id', user.id)

        if (updateError) {
          console.error(
            'Cart update error:',
            updateError
          )

          throw new Error(
            'Could not update your cart.'
          )
        }

        setMessage(
          `${product.name} quantity increased in your cart.`
        )
      } else {
        const {
          error: insertError,
        } = await supabase
          .from('cart_items')
          .insert({
            customer_id: user.id,
            product_id: product.id,
            quantity: 1,
          })

        if (insertError) {
          console.error(
            'Cart insert error:',
            insertError
          )

          throw new Error(
            'Could not add product to cart.'
          )
        }

        setMessage(
          `${product.name} added to cart! 🛒`
        )
      }
    } catch (error) {
      console.error(error)

      setMessage(
        error.message ||
          'Something went wrong.'
      )
    } finally {
      setAddingProduct(null)
    }
  }

  const filteredProducts =
    products.filter((product) => {
      const productName =
        product.name || ''

      const productDescription =
        product.description || ''

      const matchesSearch =
        productName
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        productDescription
          .toLowerCase()
          .includes(search.toLowerCase())

      const matchesCategory =
        category === 'All' ||
        product.category === category

      return (
        matchesSearch &&
        matchesCategory
      )
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

  /*
   * STORE DETAIL PAGE
   */

  if (selectedStore) {
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
              onClick={closeDetail}
            >
              ← Back to Market
            </button>
          </div>
        </nav>

        <main className="market-container">
          {loadingStore ? (
            <div className="market-message">
              <h3>
                Loading store...
              </h3>
            </div>
          ) : (
            <>
              <div className="market-header">
                <p className="welcome-small">
                  UNIABUJA MARKET STORE
                </p>

                <div
                  style={{
                    display: 'flex',
                    justifyContent:
                      'center',
                    marginBottom: '16px',
                  }}
                >
                  {selectedStore.logo_url ? (
                    <img
                      src={
                        selectedStore.logo_url
                      }
                      alt={
                        selectedStore.store_name
                      }
                      style={{
                        width: '90px',
                        height: '90px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '90px',
                        height: '90px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent:
                          'center',
                        fontSize: '40px',
                        background:
                          '#f3f4f6',
                      }}
                    >
                      🏪
                    </div>
                  )}
                </div>

                <h1>
                  {selectedStore.store_name}
                </h1>

                <p>
                  {selectedStore.description}
                </p>

                {selectedStore.location && (
                  <p>
                    📍{' '}
                    {selectedStore.location}
                  </p>
                )}

                <button
                  type="button"
                  className="back-button"
                  onClick={() =>
                    shareStore(
                      selectedStore
                    )
                  }
                >
                  🔗 Share Store
                </button>
              </div>

              {message && (
                <div className="auth-message">
                  {message}
                </div>
              )}

              {storeProducts.length ===
              0 ? (
                <div className="market-message">
                  <h3>
                    No products available
                  </h3>

                  <p>
                    This store hasn't listed
                    any products yet.
                  </p>
                </div>
              ) : (
                <div className="product-grid">
                  {storeProducts.map(
                    (product) => (
                      <div
                        className="product-card"
                        key={product.id}
                        onClick={() =>
                          openProduct(
                            product
                          )
                        }
                        style={{
                          cursor:
                            'pointer',
                        }}
                      >
                        <div className="product-image">
                          {product.image_url ? (
                            <img
                              src={
                                product.image_url
                              }
                              alt={
                                product.name
                              }
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
                            {
                              product.description
                            }
                          </p>

                          <div className="product-bottom">
                            <strong>
                              ₦
                              {Number(
                                product.price
                              ).toLocaleString()}
                            </strong>

                            <span>
                              {product.stock >
                              0
                                ? `${product.stock} available`
                                : 'Out of stock'}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="primary-btn"
                            disabled={
                              product.stock <=
                                0 ||
                              addingProduct ===
                                product.id
                            }
                            onClick={(
                              e
                            ) => {
                              e.stopPropagation()

                              addToCart(
                                product
                              )
                            }}
                          >
                            {addingProduct ===
                            product.id
                              ? 'Adding...'
                              : product.stock >
                                  0
                                ? 'Add to Cart'
                                : 'Out of Stock'}
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    )
  }

  /*
   * PRODUCT DETAIL PAGE
   */

  if (selectedProduct) {
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
              onClick={closeDetail}
            >
              ← Back to Market
            </button>
          </div>
        </nav>

        <main className="market-container">
          <div
            style={{
              maxWidth: '700px',
              margin: '0 auto',
            }}
          >
            <div className="product-card">
              <div className="product-image">
                {selectedProduct.image_url ? (
                  <img
                    src={
                      selectedProduct.image_url
                    }
                    alt={
                      selectedProduct.name
                    }
                  />
                ) : (
                  <span>
                    🛍️
                  </span>
                )}
              </div>

              <div className="product-info">
                <span className="product-category">
                  {selectedProduct.category}
                </span>

                <h1>
                  {selectedProduct.name}
                </h1>

                <p>
                  {
                    selectedProduct.description
                  }
                </p>

                <div className="product-bottom">
                  <strong>
                    ₦
                    {Number(
                      selectedProduct.price
                    ).toLocaleString()}
                  </strong>

                  <span>
                    {selectedProduct.stock >
                    0
                      ? `${selectedProduct.stock} available`
                      : 'Out of stock'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                    marginTop: '16px',
                  }}
                >
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={
                      selectedProduct.stock <=
                        0 ||
                      addingProduct ===
                        selectedProduct.id
                    }
                    onClick={() =>
                      addToCart(
                        selectedProduct
                      )
                    }
                  >
                    {addingProduct ===
                    selectedProduct.id
                      ? 'Adding...'
                      : selectedProduct.stock >
                          0
                        ? 'Add to Cart'
                        : 'Out of Stock'}
                  </button>

                  <button
                    type="button"
                    className="back-button"
                    onClick={() =>
                      shareProduct(
                        selectedProduct
                      )
                    }
                  >
                    🔗 Share Product
                  </button>
                </div>

                <button
                  type="button"
                  className="back-button"
                  style={{
                    marginTop: '12px',
                    width: '100%',
                  }}
                  onClick={() =>
                    openVendorStore(
                      selectedProduct.vendor_id
                    )
                  }
                >
                  🏪 Visit Vendor Store
                </button>

                {message && (
                  <div
                    className="auth-message"
                    style={{
                      marginTop: '12px',
                    }}
                  >
                    {message}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  /*
   * NORMAL MARKET PAGE
   */

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
            Discover products from student
            vendors.
          </p>
        </div>

        <div className="market-controls">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
          />

          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value)
            }
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
        ) : filteredProducts.length ===
          0 ? (
          <div className="market-message">
            <h3>
              No products found
            </h3>

            <p>
              Try another search or
              category.
            </p>
          </div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map(
              (product) => (
                <div
                  className="product-card"
                  key={product.id}
                  onClick={() =>
                    openProduct(product)
                  }
                  style={{
                    cursor: 'pointer',
                  }}
                >
                  <div className="product-image">
                    {product.image_url ? (
                      <img
                        src={
                          product.image_url
                        }
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
                        ₦
                        {Number(
                          product.price
                        ).toLocaleString()}
                      </strong>

                      <span>
                        {product.stock >
                        0
                          ? `${product.stock} available`
                          : 'Out of stock'}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="primary-btn"
                      disabled={
                        product.stock <=
                          0 ||
                        addingProduct ===
                          product.id
                      }
                      onClick={(e) => {
                        e.stopPropagation()

                        addToCart(
                          product
                        )
                      }}
                    >
                      {addingProduct ===
                      product.id
                        ? 'Adding...'
                        : product.stock >
                            0
                          ? 'Add to Cart'
                          : 'Out of Stock'}
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default Market