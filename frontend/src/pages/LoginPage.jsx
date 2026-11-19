import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { getApiErrorMessage } from '../api/client.js'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid work email address.')
      return
    }
    if (!password) {
      setError('Enter your password to continue.')
      return
    }

    setLoading(true)
    try {
      await login({ email: normalizedEmail, password })
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (requestError) {
      if (requestError.response) setError(getApiErrorMessage(requestError, 'Unable to sign in.'))
      else if (requestError.isAxiosError) setError('Unable to reach SecureGuard. Check your connection and try again.')
      else setError(requestError.message || 'Unable to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-brand-panel">
        <div className="login-brand">
          <span className="brand-mark brand-mark-large"><ShieldCheck size={25} strokeWidth={2.1} /></span>
          <span><strong>SecureGuard</strong><small>WORKFORCE OPERATIONS</small></span>
        </div>
        <div className="login-brand-content">
          <span className="login-kicker"><span />SECURE WORKFORCE MANAGEMENT</span>
          <h1>Every shift.<br />Every site.<br /><em>In sync.</em></h1>
          <p>A clear operational workspace for the people who keep teams and sites moving.</p>
        </div>
        <div className="login-brand-footer"><span>SECUREGUARD</span><span>ACCESS PORTAL</span></div>
      </section>

      <section className="login-form-panel">
        <div className="login-form-wrap">
          <div className="login-mobile-brand"><span className="brand-mark"><ShieldCheck size={21} /></span><strong>SecureGuard</strong></div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your account</h2>
          <p className="login-intro">Use your work credentials to access your workspace.</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <label htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={loading} />
            <div className="password-label-row"><label htmlFor="password">Password</label></div>
            <div className="password-input-wrap">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={loading} />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && <div className="form-error" role="alert">{error}</div>}
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? <><span className="button-spinner" /> Signing in…</> : <>Sign in <ArrowRight size={17} /></>}
            </button>
          </form>

          <div className="login-security-note"><ShieldCheck size={17} /><span>Your access is protected and monitored.</span></div>
          <p className="login-help">Need access? Contact your organization administrator.</p>
        </div>
        <footer className="login-footer"><span>© {new Date().getFullYear()} SecureGuard</span><span>Authorized personnel only</span></footer>
      </section>
    </main>
  )
}
