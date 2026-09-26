import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

const WORKER_BASE_URL = import.meta.env.DEV
  ? 'http://127.0.0.1:8787'
  : ''

function PayoutAccount({ user, onBack }) {
  const [accountNumber, setAccountNumber] = useState('')
  const [banks, setBanks] = useState([])
  const [selectedBank, setSelectedBank] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')

  const [loadingAccount, setLoadingAccount] = useState(true)
  const [loadingBanks, setLoadingBanks] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preparingRecipient, setPreparingRecipient] = useState(false)

  const [accountSaved, setAccountSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [recipientCode, setRecipientCode] = useState('')

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadSavedAccount() {
      if (!user?.id) {
        setLoadingAccount(false)
        return
      }

      setLoadingAccount(true)
      setError('')

      const { data, error } = await supabase
        .from('vendor_payout_accounts')
        .select(
          `
            id,
            vendor_id,
            account_name,
            bank_code,
            bank_name,
            account_number,
            paystack_recipient_code,
            is_verified,
            is_active
          `
        )
        .eq('vendor_id', user.id)
        .maybeSingle()

      if (error) {
        console.error('Payout account load error:', error)
        setError('Could not load your saved payout account.')
        setLoadingAccount(false)
        return
      }

      if (data) {
        setAccountNumber(data.account_number || '')
        setSelectedBank(data.bank_code || '')
        setBankName(data.bank_name || '')
        setAccountName(data.account_name || '')

        setAccountSaved(
          data.is_verified === true &&
          data.is_active === true
        )

        setRecipientCode(
          data.paystack_recipient_code || ''
        )
      }

      setLoadingAccount(false)
    }

    loadSavedAccount()
  }, [user?.id])

  useEffect(() => {
    if (loadingAccount || (accountSaved && !editing)) {
      return
    }

    async function loadBanks() {
      setLoadingBanks(true)
      setError('')

      try {
        const {
          data: sessionData,
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        const accessToken =
          sessionData?.session?.access_token

        if (!accessToken) {
          throw new Error('You must be logged in.')
        }

        const response = await fetch(
          `${WORKER_BASE_URL}/api/payouts/banks`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )

        const data = await response.json()

        if (!response.ok || !data.status) {
          throw new Error(
            data.message || 'Unable to load banks.'
          )
        }

        setBanks(
          Array.isArray(data.data)
            ? data.data
            : []
        )
      } catch (err) {
        console.error('Bank list error:', err)
        setError(
          'Bank list is temporarily unavailable. Please try again later.'
        )
      } finally {
        setLoadingBanks(false)
      }
    }

    loadBanks()
  }, [loadingAccount, accountSaved, editing])

  async function verifyAccount() {
    setMessage('')
    setError('')

    if (!accountNumber || accountNumber.length !== 10) {
      setError('Enter a valid 10-digit account number.')
      return
    }

    if (!selectedBank) {
      setError('Please select your bank.')
      return
    }

    setLoading(true)

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      const accessToken =
        sessionData?.session?.access_token

      if (!accessToken) {
        throw new Error(
          'Your login session has expired. Please log in again.'
        )
      }

      const response = await fetch(
        `${WORKER_BASE_URL}/api/payouts/resolve-account`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            account_number: accountNumber,
            bank_code: selectedBank,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok || data.success !== true) {
        throw new Error(
          data.message || 'Unable to verify bank account.'
        )
      }

      const verifiedName =
        data.data?.account_name ||
        data.account_name ||
        ''

      const selectedBankObject = banks.find(
        (bank) =>
          String(bank.code) === String(selectedBank)
      )

      setAccountName(verifiedName)
      setBankName(
        selectedBankObject?.name || bankName
      )

      setMessage('Bank account verified successfully.')
    } catch (err) {
      console.error('Account verification error:', err)
      setError(
        err.message ||
        'Unable to verify this bank account.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function savePayoutAccount() {
    setMessage('')
    setError('')

    if (!user?.id) {
      setError('You must be logged in.')
      return
    }

    if (!accountName) {
      setError('Verify the bank account first.')
      return
    }

    if (!selectedBank) {
      setError('Please select a bank.')
      return
    }

    const selectedBankObject = banks.find(
      (bank) =>
        String(bank.code) === String(selectedBank)
    )

    const finalBankName =
      selectedBankObject?.name ||
      bankName ||
      'Unknown Bank'

    setSaving(true)

    const { data: existingAccount, error: existingError } =
      await supabase
        .from('vendor_payout_accounts')
        .select('id')
        .eq('vendor_id', user.id)
        .maybeSingle()

    if (existingError) {
      console.error(
        'Existing payout account check error:',
        existingError
      )
      setError('Could not check your payout account.')
      setSaving(false)
      return
    }

    let result

    if (existingAccount?.id) {
      result = await supabase
        .from('vendor_payout_accounts')
        .update({
          account_name: accountName,
          bank_code: selectedBank,
          bank_name: finalBankName,
          account_number: accountNumber,
          is_verified: true,
          is_active: true,
          paystack_recipient_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAccount.id)
    } else {
      result = await supabase
        .from('vendor_payout_accounts')
        .insert({
          vendor_id: user.id,
          account_name: accountName,
          bank_code: selectedBank,
          bank_name: finalBankName,
          account_number: accountNumber,
          is_verified: true,
          is_active: true,
        })
    }

    if (result.error) {
      console.error(
        'Payout account save error:',
        result.error
      )
      setError(
        result.error.message ||
        'Could not save payout account.'
      )
      setSaving(false)
      return
    }

    setBankName(finalBankName)
    setAccountSaved(true)
    setEditing(false)
    setRecipientCode('')

    setMessage(
      'Your verified payout account has been updated successfully.'
    )

    setSaving(false)
  }

  function startEditing() {
    setEditing(true)
    setAccountSaved(false)
    setRecipientCode('')
    setMessage('')
    setError('')
  }

  function cancelEditing() {
    window.location.reload()
  }

  async function prepareRecipient() {
    setMessage('')
    setError('')

    if (!user?.id) {
      setError('You must be logged in.')
      return
    }

    setPreparingRecipient(true)

    try {
      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      const accessToken =
        sessionData?.session?.access_token

      if (!accessToken) {
        throw new Error(
          'Your login session has expired. Please log in again.'
        )
      }

      const response = await fetch(
        `${WORKER_BASE_URL}/api/payouts/prepare-recipient`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      const data = await response.json()

      // FIXED:
      // Worker returns "success", not "status".
      if (!response.ok || data.success !== true) {
        throw new Error(
          data.message ||
          'Unable to set up the Paystack recipient.'
        )
      }

      const newRecipientCode =
        data.recipient_code ||
        data.data?.recipient_code ||
        ''

      setRecipientCode(newRecipientCode)

      setMessage(
        'Paystack recipient has been set up successfully.'
      )
    } catch (err) {
      console.error(
        'Paystack recipient error:',
        err
      )

      setError(
        err.message ||
        'Unable to set up Paystack recipient.'
      )
    } finally {
      setPreparingRecipient(false)
    }
  }

  if (loadingAccount) {
    return (
      <div style={{ padding: '20px' }}>
        <button onClick={onBack}>← Back</button>

        <h2>Payout Account</h2>

        <p>Loading your payout account...</p>
      </div>
    )
  }

  return (
    <div
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '20px',
      }}
    >
      <button
        onClick={onBack}
        style={{
          marginBottom: '20px',
          padding: '8px 12px',
          cursor: 'pointer',
        }}
      >
        ← Back
      </button>

      <h2>Payout Account</h2>

      <p style={{ color: '#666' }}>
        Add the bank account where your eligible
        marketplace earnings will be paid.
      </p>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #ef4444',
            color: '#991b1b',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '15px',
          }}
        >
          {error}
        </div>
      )}

      {message && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #10b981',
            color: '#065f46',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '15px',
          }}
        >
          {message}
        </div>
      )}

      <label
        style={{
          display: 'block',
          marginBottom: '6px',
          fontWeight: '600',
        }}
      >
        Account Number
      </label>

      <input
        type="text"
        inputMode="numeric"
        maxLength={10}
        value={accountNumber}
        onChange={(e) => {
          setAccountNumber(
            e.target.value.replace(/\D/g, '')
          )
          setAccountName('')
          setBankName('')
          setRecipientCode('')
          setMessage('')
        }}
        disabled={accountSaved && !editing}
        placeholder="Enter 10-digit account number"
        style={{
          width: '100%',
          padding: '12px',
          marginBottom: '15px',
          boxSizing: 'border-box',
        }}
      />

      {accountSaved && !editing ? (
        <>
          <label
            style={{
              display: 'block',
              marginBottom: '6px',
              fontWeight: '600',
            }}
          >
            Bank
          </label>

          <div
            style={{
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '15px',
              background: '#f9fafb',
            }}
          >
            {bankName || 'Bank not available'}
          </div>

          <label
            style={{
              display: 'block',
              marginBottom: '6px',
              fontWeight: '600',
            }}
          >
            Account Name
          </label>

          <div
            style={{
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '15px',
              background: '#f9fafb',
            }}
          >
            {accountName}
          </div>

          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #10b981',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '15px',
              color: '#065f46',
            }}
          >
            <strong>✓ VERIFIED PAYOUT ACCOUNT</strong>

            <div style={{ marginTop: '6px' }}>
              This account is active and ready for
              Paystack recipient setup.
            </div>
          </div>

          <button
            onClick={startEditing}
            style={{
              width: '100%',
              padding: '13px',
              marginBottom: '15px',
              background: '#111827',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            Edit Payout Account
          </button>

          {!recipientCode ? (
            <button
              onClick={prepareRecipient}
              disabled={preparingRecipient}
              style={{
                width: '100%',
                padding: '13px',
                background: preparingRecipient
                  ? '#9ca3af'
                  : '#111827',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: preparingRecipient
                  ? 'not-allowed'
                  : 'pointer',
                fontWeight: '600',
              }}
            >
              {preparingRecipient
                ? 'Setting Up Paystack Recipient...'
                : 'Set Up Paystack Recipient'}
            </button>
          ) : (
            <div
              style={{
                background: '#eff6ff',
                border: '1px solid #3b82f6',
                borderRadius: '10px',
                padding: '14px',
                color: '#1e3a8a',
              }}
            >
              <strong>
                ✓ Paystack Recipient Ready
              </strong>

              <div
                style={{
                  marginTop: '8px',
                  wordBreak: 'break-word',
                }}
              >
                Recipient code: {recipientCode}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <label
            style={{
              display: 'block',
              marginBottom: '6px',
              fontWeight: '600',
            }}
          >
            Bank Name
          </label>

          <select
            value={selectedBank}
            onChange={(e) => {
              const newBankCode = e.target.value

              const selectedBankObject = banks.find(
                (bank) =>
                  String(bank.code) ===
                  String(newBankCode)
              )

              setSelectedBank(newBankCode)
              setBankName(
                selectedBankObject?.name || ''
              )
              setAccountName('')
              setRecipientCode('')
              setMessage('')
              setError('')
            }}
            disabled={loadingBanks}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              boxSizing: 'border-box',
            }}
          >
            <option value="">
              {loadingBanks
                ? 'Loading banks...'
                : 'Select your bank'}
            </option>

            {banks.map((bank, index) => (
              <option
                key={`${bank.code}-${bank.name}-${index}`}
                value={bank.code}
              >
                {bank.name}
              </option>
            ))}
          </select>

          <button
            onClick={verifyAccount}
            disabled={
              loading ||
              loadingBanks ||
              !accountNumber ||
              accountNumber.length !== 10 ||
              !selectedBank
            }
            style={{
              width: '100%',
              padding: '13px',
              marginBottom: '15px',
              background:
                loading ||
                loadingBanks ||
                !accountNumber ||
                accountNumber.length !== 10 ||
                !selectedBank
                  ? '#9ca3af'
                  : '#111827',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor:
                loading ||
                loadingBanks ||
                !accountNumber ||
                accountNumber.length !== 10 ||
                !selectedBank
                  ? 'not-allowed'
                  : 'pointer',
              fontWeight: '600',
            }}
          >
            {loading
              ? 'Verifying...'
              : 'Verify Bank Account'}
          </button>

          {accountName && (
            <>
              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #10b981',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '15px',
                  color: '#065f46',
                }}
              >
                <strong>Account Name:</strong>{' '}
                {accountName}
              </div>

              <button
                onClick={savePayoutAccount}
                disabled={saving}
                style={{
                  width: '100%',
                  padding: '13px',
                  marginBottom: '10px',
                  background: saving
                    ? '#9ca3af'
                    : '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saving
                    ? 'not-allowed'
                    : 'pointer',
                  fontWeight: '600',
                }}
              >
                {saving
                  ? 'Saving...'
                  : 'Save Payout Account'}
              </button>

              {editing && (
                <button
                  onClick={cancelEditing}
                  disabled={saving}
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: saving
                      ? 'not-allowed'
                      : 'pointer',
                    fontWeight: '600',
                  }}
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export default PayoutAccount