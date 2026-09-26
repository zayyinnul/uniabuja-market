import { useEffect, useState } from 'react'
import './App.css'

import Auth from './Auth'
import Store from './Store'
import Product from './Product'
import MyProducts from './MyProducts'
import Market from './Market'
import Cart from './Cart'
import Checkout from './Checkout'
import MyOrders from './MyOrders'
import VendorOrders from './VendorOrders'
import PayoutAccount from './PayoutAccount'
import VendorEarnings from './VendorEarnings'
import Profile from './Profile'
import AdminDashboard from './AdminDashboard'
import RiderDashboard from './pages/RiderDashboard'
import Notifications from './Notifications'

import { supabase } from './lib/supabase'

function App() {
  const [showAuth, setShowAuth] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [showProduct, setShowProduct] = useState(false)
  const [showMyProducts, setShowMyProducts] = useState(false)
  const [showMarket, setShowMarket] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [showOrders, setShowOrders] = useState(false)
  const [showVendorOrders, setShowVendorOrders] = useState(false)
  const [showPayoutAccount, setShowPayoutAccount] = useState(false)
  const [showVendorEarnings, setShowVendorEarnings] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showAdminDashboard, setShowAdminDashboard] = useState(false)
  const [showRiderDashboard, setShowRiderDashboard] = useState(false)

  const [user, setUser] = useState(null)
  const [store, setStore] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const checkAdmin = async () => {
      const { data, error } = await supabase.rpc('is_admin')

      if (error) {
        console.error('Admin check error:', error)

        if (mounted) {
          setIsAdmin(false)
        }

        return
      }

      console.log('Admin check:', data)

      if (mounted) {
        setIsAdmin(data === true)
      }
    }

    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      setUser(session?.user ?? null)

      if (session?.user) {
        await loadStore(session.user.id)
        await checkAdmin()
      } else {
        setIsAdmin(false)
      }

      setLoading(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return

        setUser(session?.user ?? null)

        if (session?.user) {
          await loadStore(session.user.id)
          await checkAdmin()
        } else {
          setStore(null)
          setIsAdmin(false)
        }

        setLoading(false)
      }
    )

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
    setIsAdmin(false)

    setShowAuth(false)
    setShowStore(false)
    setShowProduct(false)
    setShowMyProducts(false)
    setShowMarket(false)
    setShowCart(false)
    setShowCheckout(false)
    setShowOrders(false)
    setShowVendorOrders(false)
    setShowPayoutAccount(false)
    setShowVendorEarnings(false)
    setShowProfile(false)
    setShowAdminDashboard(false)
    setShowRiderDashboard(false)
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

  /*
   * AUTH
   */
  if (showAuth) {
    return (
      <Auth
        onBack={() => {
          setShowAuth(false)

          /*
           * If the user was trying to access
           * the Rider Dashboard, cancel that
           * pending navigation when they go back.
           */
          if (!user) {
            setShowRiderDashboard(false)
          }
        }}
        onLogin={() => {
          setShowAuth(false)

          /*
           * If the user came here by clicking
           * Apply as a Rider, keep the Rider
           * Dashboard open after login.
           */
          if (showRiderDashboard) {
            setShowRiderDashboard(true)
          }
        }}
      />
    )
  }

  /*
   * ADMIN DASHBOARD
   */
  if (showAdminDashboard) {
    return (
      <AdminDashboard
        user={user}
        onBack={() => setShowAdminDashboard(false)}
      />
    )
  }

  /*
   * RIDER DASHBOARD
   */
  if (showRiderDashboard) {
    if (!user) {
      /*
       * This normally won't be reached because
       * the public Apply as Rider button opens Auth.
       * It is kept as a safety check.
       */
      setShowAuth(true)

      return null
    }

    return (
      <RiderDashboard
        user={user}
        onBack={() => setShowRiderDashboard(false)}
      />
    )
  }

  /*
   * PROFILE
   */
  if (showProfile) {
    return (
      <Profile
        user={user}
        onBack={() => setShowProfile(false)}
      />
    )
  }

  /*
   * VENDOR EARNINGS
   */
  if (showVendorEarnings) {
    return (
      <VendorEarnings
        user={user}
        onBack={() => setShowVendorEarnings(false)}
      />
    )
  }

  /*
   * PAYOUT ACCOUNT
   */
  if (showPayoutAccount) {
    return (
      <PayoutAccount
        user={user}
        onBack={() => setShowPayoutAccount(false)}
      />
    )
  }

  /*
   * VENDOR ORDERS
   */
  if (showVendorOrders) {
    return (
      <VendorOrders
        user={user}
        onBack={() => setShowVendorOrders(false)}
      />
    )
  }

  /*
   * MY ORDERS
   */
  if (showOrders) {
    return (
      <MyOrders
        user={user}
        onBack={() => setShowOrders(false)}
      />
    )
  }

  /*
   * CHECKOUT
   */
  if (showCheckout) {
    return (
      <Checkout
        user={user}
        onBack={() => setShowCheckout(false)}
        onOrderCreated={handleOrderCreated}
      />
    )
  }

  /*
   * CART
   */
  if (showCart) {
    return (
      <Cart
        user={user}
        onBack={() => setShowCart(false)}
        onCheckout={() => setShowCheckout(true)}
      />
    )
  }

  /*
   * MARKETPLACE
   */
  if (showMarket) {
    return (
      <Market
        user={user}
        onBack={() => setShowMarket(false)}
        onCart={() => setShowCart(true)}
      />
    )
  }

  /*
   * MY PRODUCTS
   */
  if (showMyProducts) {
    return (
      <MyProducts
        user={user}
        onBack={() => setShowMyProducts(false)}
        onAddProduct={() => {
          setShowMyProducts(false)
          setShowProduct(true)
        }}
      />
    )
  }

  /*
   * PRODUCT
   */
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

  /*
   * STORE
   */
  if (showStore) {
    return (
      <Store
        user={user}
        store={store}
        onBack={() => setShowStore(false)}
        onStoreCreated={handleStoreCreated}
      />
    )
  }

  /*
   * MAIN FRONT PAGE
   */
  return (
    <div className="dashboard-page">

      <nav className="navbar">

        <div className="logo">
          UniAbuja Market
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >

          {/* NOTIFICATIONS */}
          {user && (
            <Notifications user={user} />
          )}

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

          {/* ADMIN DASHBOARD */}
          {user && isAdmin && (
            <div className="dashboard-card">

              <span>🛡️</span>

              <h3>
                Admin Dashboard
              </h3>

              <p>
                Manage the marketplace, vendors,
                orders, products and platform activity.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowAdminDashboard(true)
                }
              >
                Open Admin Dashboard
              </button>

            </div>
          )}

          {/* MARKETPLACE */}
          <div className="dashboard-card">

            <span>🛍️</span>

            <h3>
              Marketplace
            </h3>

            <p>
              Browse products and services available
              around campus.
            </p>

            <button
              type="button"
              onClick={() =>
                setShowMarket(true)
              }
            >
              Open Marketplace
            </button>

          </div>

          {/* DELIVERY PARTNERS */}
          <div className="dashboard-card">

            <span>🚴</span>

            <h3>
              Delivery Partners
            </h3>

            <p>
              Deliver orders around UniAbuja and
              nearby areas. Propose different fees
              for different delivery zones.
            </p>

            <button
              type="button"
              onClick={() => {

                if (user) {

                  /*
                   * Already logged in:
                   * open Rider Dashboard directly.
                   */
                  setShowRiderDashboard(true)

                } else {

                  /*
                   * Not logged in:
                   * remember that the user wants
                   * the Rider Dashboard, then open Auth.
                   */
                  setShowRiderDashboard(true)
                  setShowAuth(true)

                }

              }}
            >
              {user
                ? 'Rider Dashboard'
                : 'Apply as a Rider'}
            </button>

          </div>

          {/* CART */}
          {user && (
            <div className="dashboard-card">

              <span>🛒</span>

              <h3>
                My Cart
              </h3>

              <p>
                View your selected products and
                proceed to checkout.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowCart(true)
                }
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
                onClick={() =>
                  setShowStore(true)
                }
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

              <h3>
                Add Product
              </h3>

              <p>
                Add products to your store for
                students to discover.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowProduct(true)
                }
              >
                Add Product
              </button>

            </div>
          )}

          {/* MY PRODUCTS */}
          {user && store && (
            <div className="dashboard-card">

              <span>📦</span>

              <h3>
                My Products
              </h3>

              <p>
                Edit, update or remove products
                from your store.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowMyProducts(true)
                }
              >
                Manage Products
              </button>

            </div>
          )}

          {/* MY ORDERS */}
          {user && (
            <div className="dashboard-card">

              <span>📦</span>

              <h3>
                My Orders
              </h3>

              <p>
                Track your purchases and
                delivery status.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowOrders(true)
                }
              >
                View My Orders
              </button>

            </div>
          )}

          {/* VENDOR ORDERS */}
          {user && store && (
            <div className="dashboard-card">

              <span>📋</span>

              <h3>
                Vendor Orders
              </h3>

              <p>
                View orders containing
                your products.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowVendorOrders(true)
                }
              >
                View Vendor Orders
              </button>

            </div>
          )}

          {/* VENDOR EARNINGS & PAYOUT */}
          {user && store && (
            <div className="dashboard-card">

              <span>💰</span>

              <h3>
                Earnings & Payouts
              </h3>

              <p>
                Track your sales, earnings
                and vendor payouts.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowVendorEarnings(true)
                }
              >
                View Earnings
              </button>

              <button
                type="button"
                style={{ marginTop: '8px' }}
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

              <h3>
                Profile
              </h3>

              <p>
                Manage your account information.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowProfile(true)
                }
              >
                Open Profile
              </button>

            </div>
          )}

        </div>

        {/* PUBLIC LOGIN */}
        {!user && (
          <div
            style={{
              textAlign: 'center',
              marginTop: '30px',
            }}
          >
            <button
              type="button"
              onClick={() =>
                setShowAuth(true)
              }
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