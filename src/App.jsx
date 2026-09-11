import { useEffect, useState } from 'react'
import './App.css'
import Auth from './Auth'
import Store from './Store'
import Product from './Product'
import Market from './Market'
import Cart from './Cart'
import Checkout from './Checkout'
import MyOrders from './MyOrders'
import VendorOrders from './VendorOrders'
import { supabase } from './lib/supabase'

function App() {
  const [showAuth, setShowAuth] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [showProduct, setShowProduct] = useState(false)
  const [showMarket, setShowMarket] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [showOrders, setShowOrders] = useState(false)
  const [showVendorOrders, setShowVendorOrders] = useState(false)

  const [user, setUser] = useState(null)
  const [store, setStore] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null

        setUser(currentUser)

        if (!currentUser) {
          setStore(null)
          return
        }

        loadStore(currentUser.id)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const checkUser = async () => {
    const { data } =
      await supabase.auth.getSession()

    const currentUser =
      data.session?.user ?? null

    setUser(currentUser)

    if (currentUser) {
      await loadStore(currentUser.id)
    }

    setLoading(false)
  }

  const loadStore = async (userId) => {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', userId)
      .maybeSingle()

    if (error) {
      console.error('Store loading error:', error)
      setStore(null)
      return
    }

    setStore(data || null)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()

    setUser(null)
    setStore(null)
    setShowAuth(false)
    setShowStore(false)
    setShowProduct(false)
    setShowMarket(false)
    setShowCart(false)
    setShowCheckout(false)
    setShowOrders(false)
    setShowVendorOrders(false)
  }

  const handleStoreCreated = async (newStore) => {
    setStore(newStore)

    if (user) {
      await loadStore(user.id)
    }

    setShowStore(false)
  }

  const handleProductCreated = () => {
    setShowProduct(false)
  }

  const handleOrderCreated = () => {
    setShowCheckout(false)
    setShowCart(false)

    alert(
      'Order placed successfully! Your order has been created.'
    )
  }

  if (loading) {
    return (
      <div className="loading-page">
        <h2>
          UniAbuja Market
        </h2>

        <p>
          Loading...
        </p>
      </div>
    )
  }

  if (user && showVendorOrders) {
    return (
      <VendorOrders
        user={user}
        onBack={() => setShowVendorOrders(false)}
      />
    )
  }

  if (user && showOrders) {
    return (
      <MyOrders
        user={user}
        onBack={() => setShowOrders(false)}
      />
    )
  }

  if (user && showCheckout) {
    return (
      <Checkout
        user={user}
        onBack={() => setShowCheckout(false)}
        onOrderCreated={handleOrderCreated}
      />
    )
  }

  if (user && showCart) {
    return (
      <Cart
        user={user}
        onBack={() => setShowCart(false)}
        onCheckout={() => {
          setShowCart(false)
          setShowCheckout(true)
        }}
      />
    )
  }

  if (user && showMarket) {
    return (
      <Market
        user={user}
        onBack={() => setShowMarket(false)}
      />
    )
  }

  if (user && showProduct) {
    return (
      <Product
        user={user}
        onBack={() => setShowProduct(false)}
        onProductCreated={handleProductCreated}
      />
    )
  }

  if (user && showStore) {
    return (
      <Store
        user={user}
        onBack={() => setShowStore(false)}
        onStoreCreated={handleStoreCreated}
      />
    )
  }

  if (user) {
    return (
      <div className="dashboard-page">
        <nav className="navbar">
          <div className="logo">
            UniAbuja Market
          </div>

          <button
            type="button"
            className="back-button"
            onClick={handleLogout}
          >
            Log out
          </button>
        </nav>

        <main className="dashboard-container">
          <div className="dashboard-header">
            <p className="welcome-small">
              UNIABUJA MARKET
            </p>

            <h1>
              Welcome back!
            </h1>

            <p>
              Buy, sell and connect with students on campus.
            </p>
          </div>

          <div className="dashboard-grid">

            {/* MARKET */}
            <div className="dashboard-card">
              <span>🛍️</span>

              <h3>
                Marketplace
              </h3>

              <p>
                Browse products from student vendors.
              </p>

              <button
                type="button"
                onClick={() => setShowMarket(true)}
              >
                Explore Market
              </button>
            </div>

            {/* CART */}
            <div className="dashboard-card">
              <span>🛒</span>

              <h3>
                My Cart
              </h3>

              <p>
                View products you've added to your cart.
              </p>

              <button
                type="button"
                onClick={() => setShowCart(true)}
              >
                View Cart
              </button>
            </div>

            {/* STORE / VENDOR */}
            <div className="dashboard-card">
              <span>🏪</span>

              <h3>
                {store
                  ? 'My Store'
                  : 'Become a Vendor'}
              </h3>

              <p>
                {store
                  ? 'Manage your UniAbuja Market store.'
                  : 'Create your store and start selling.'}
              </p>

              <button
                type="button"
                onClick={() => setShowStore(true)}
              >
                {store
                  ? 'Manage Store'
                  : 'Create Store'}
              </button>
            </div>

            {/* ADD PRODUCT */}
            {store && (
              <div className="dashboard-card">
                <span>➕</span>

                <h3>
                  Add Product
                </h3>

                <p>
                  Add products to your store.
                </p>

                <button
                  type="button"
                  onClick={() => setShowProduct(true)}
                >
                  Add Product
                </button>
              </div>
            )}

            {/* MY ORDERS */}
            <div className="dashboard-card">
              <span>📦</span>

              <h3>
                My Orders
              </h3>

              <p>
                Track your purchases and deliveries.
              </p>

              <button
                type="button"
                onClick={() => setShowOrders(true)}
              >
                View Orders
              </button>
            </div>

            {/* VENDOR ORDERS */}
            {store && (
              <div className="dashboard-card">
                <span>📋</span>

                <h3>
                  Vendor Orders
                </h3>

                <p>
                  View orders containing your products.
                </p>

                <button
                  type="button"
                  onClick={() => setShowVendorOrders(true)}
                >
                  View Vendor Orders
                </button>
              </div>
            )}

            {/* PROFILE */}
            <div className="dashboard-card">
              <span>👤</span>

              <h3>
                Profile
              </h3>

              <p>
                Manage your account information.
              </p>

              <button
                type="button"
                disabled
              >
                Coming Soon
              </button>
            </div>

          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="home-page">
      <nav className="navbar">
        <div className="logo">
          UniAbuja Market
        </div>

        <button
          type="button"
          className="back-button"
          onClick={() => setShowAuth(true)}
        >
          Log in
        </button>
      </nav>

      {showAuth ? (
        <Auth
          onBack={() => setShowAuth(false)}
        />
      ) : (
        <main className="hero-section">
          <div className="hero-content">
            <p className="welcome-small">
              BUILT FOR UNIABUJA STUDENTS
            </p>

            <h1>
              Buy and sell within your campus.
            </h1>

            <p>
              UniAbuja Market connects students with
              products, services and student-owned stores.
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={() => setShowAuth(true)}
            >
              Get Started
            </button>
          </div>
        </main>
      )}
    </div>
  )
}

export default App