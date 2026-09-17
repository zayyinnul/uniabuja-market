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
import PayoutAccount from './PayoutAccount'

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
  const [showPayoutAccount, setShowPayoutAccount] = useState(false)

  const [user, setUser] = useState(null)
  const [store, setStore] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      setUser(session?.user ?? null)

      if (session?.user) {
        await loadStore(session.user.id)
      }

      setLoading(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return

      setUser(session?.user ?? null)

      if (session?.user) {
        await loadStore(session.user.id)
      } else {
        setStore(null)
      }

      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

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

    setStore(data)
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
    setShowPayoutAccount(false)
  }

  const handleStoreCreated = async () => {
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
    setShowOrders(true)
  }

  if (loading) {
    return (
      <div className="app-loading">
        <h2>UniAbuja Market</h2>
        <p>Loading...</p>
      </div>
    )
  }

  if (showAuth) {
    return (
      <Auth
        onBack={() => setShowAuth(false)}
        onLogin={() => setShowAuth(false)}
      />
    )
  }

  if (showPayoutAccount) {
    return (
      <PayoutAccount
        user={user}
        onBack={() => setShowPayoutAccount(false)}
      />
    )
  }

  if (showVendorOrders) {
    return (
      <VendorOrders
        user={user}
        onBack={() => setShowVendorOrders(false)}
      />
    )
  }

  if (showOrders) {
    return (
      <MyOrders
        user={user}
        onBack={() => setShowOrders(false)}
      />
    )
  }

  if (showCheckout) {
    return (
      <Checkout
        user={user}
        onBack={() => setShowCheckout(false)}
        onOrderCreated={handleOrderCreated}
      />
    )
  }

  if (showCart) {
    return (
      <Cart
        user={user}
        onBack={() => setShowCart(false)}
        onCheckout={() => setShowCheckout(true)}
      />
    )
  }

  if (showMarket) {
    return (
      <Market
        user={user}
        onBack={() => setShowMarket(false)}
        onCart={() => setShowCart(true)}
      />
    )
  }

  if (showProduct) {
    return (
      <Product
        user={user}
        store={store}
        onBack={() => setShowProduct(false)}
        onProductCreated={handleProductCreated}
      />
    )
  }

  if (showStore) {
    return (
      <Store
        user={user}
        onBack={() => setShowStore(false)}
        onStoreCreated={handleStoreCreated}
      />
    )
  }

  return (
    <div className="dashboard-page">
      <nav className="navbar">
        <div className="logo">
          UniAbuja Market
        </div>

        <div>
          {user ? (
            <button
              type="button"
              className="back-button"
              onClick={handleLogout}
            >
              Logout
            </button>
          ) : (
            <button
              type="button"
              className="back-button"
              onClick={() => setShowAuth(true)}
            >
              Login
            </button>
          )}
        </div>
      </nav>

      <main className="dashboard-container">
        <div className="dashboard-header">
          <p className="welcome-small">
            THE STUDENT MARKETPLACE
          </p>

          <h1>
            Everything you need, right on campus
          </h1>

          {user ? (
            <p>
              Welcome back,{' '}
              {user.user_metadata?.full_name ||
                user.email}
              .
            </p>
          ) : (
            <p>
              Shop, sell and discover products from
              UniAbuja students.
            </p>
          )}
        </div>

        <div className="dashboard-grid">
          {/* MARKETPLACE */}
          <div className="dashboard-card">
            <span>🛍️</span>
            <h3>Marketplace</h3>
            <p>
              Browse products and services available
              around campus.
            </p>

            <button
              type="button"
              onClick={() => setShowMarket(true)}
            >
              Open Marketplace
            </button>
          </div>

          {/* CART */}
          {user && (
            <div className="dashboard-card">
              <span>🛒</span>
              <h3>My Cart</h3>
              <p>
                View your selected products and proceed
                to checkout.
              </p>

              <button
                type="button"
                onClick={() => setShowCart(true)}
              >
                View Cart
              </button>
            </div>
          )}

          {/* STORE / VENDOR */}
          {user && (
            <div className="dashboard-card">
              <span>🏪</span>
              <h3>
                {store ? 'My Store' : 'Become a Vendor'}
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
          )}

          {/* ADD PRODUCT */}
          {user && store && (
            <div className="dashboard-card">
              <span>➕</span>
              <h3>Add Product</h3>
              <p>
                Add products to your store for students
                to discover.
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
          {user && (
            <div className="dashboard-card">
              <span>📦</span>
              <h3>My Orders</h3>
              <p>
                Track your purchases and delivery status.
              </p>

              <button
                type="button"
                onClick={() => setShowOrders(true)}
              >
                View My Orders
              </button>
            </div>
          )}

          {/* VENDOR ORDERS */}
          {user && store && (
            <div className="dashboard-card">
              <span>📋</span>
              <h3>Vendor Orders</h3>
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

          {/* VENDOR PAYOUT */}
          {user && store && (
            <div className="dashboard-card">
              <span>💰</span>
              <h3>Vendor Payout</h3>
              <p>
                Set the bank account for receiving your
                vendor payouts.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowPayoutAccount(true)
                }
              >
                Manage Payout Account
              </button>
            </div>
          )}

          {/* PROFILE */}
          {user && (
            <div className="dashboard-card">
              <span>👤</span>
              <h3>Profile</h3>
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
          )}
        </div>

        {!user && (
          <div
            style={{
              textAlign: 'center',
              marginTop: '30px',
            }}
          >
            <button
              type="button"
              onClick={() => setShowAuth(true)}
            >
              Login / Create Account
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default App