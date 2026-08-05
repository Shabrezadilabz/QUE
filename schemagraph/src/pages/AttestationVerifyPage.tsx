import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getApiBase } from '@/services/apiConfig'
import { verifyAttestationPublic } from '@/services/stitchApi'

/**
 * Public diligence page — paste a Que export attestation and re-verify HMAC.
 * No login required (matches POST /auth/attestation/verify).
 */
export function AttestationVerifyPage() {
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    ok: boolean
    reason?: string | null
    fingerprint?: string | null
    policy?: string | null
    alg?: string | null
  } | null>(null)

  const apiHint = useMemo(
    () => `${getApiBase()}/auth/attestation/verify`,
    [],
  )

  async function onVerify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const trimmed = raw.trim()
      if (!trimmed) throw new Error('Paste an attestation JSON object first.')
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        throw new Error('Invalid JSON — paste the attestation object only.')
      }
      const body =
        parsed &&
        typeof parsed === 'object' &&
        'attestation' in (parsed as object) &&
        (parsed as { attestation?: unknown }).attestation
          ? (parsed as { attestation: unknown }).attestation
          : parsed
      const out = await verifyAttestationPublic(body)
      setResult(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full w-full bg-[linear-gradient(165deg,#faf6f1_0%,#f0e4d8_55%,#ebe0d4_100%)]">
      <div className="mx-auto max-w-[40rem] px-md py-xl sm:px-lg">
        <header className="mb-lg">
          <p className="font-label text-[11px] font-bold tracking-[0.18em] text-[#8b4a34] uppercase">
            Que · Diligence
          </p>
          <h1 className="mt-sm font-headline text-[1.75rem] font-semibold tracking-tight text-[#3d241c]">
            Verify attestation
          </h1>
          <p className="mt-sm max-w-[36rem] font-body text-[14px] leading-relaxed text-on-surface-variant">
            Paste a schema-only export attestation from a Que job (or a
            downloaded verify pack). Que recomputes the HMAC — no login, no
            warehouse data.
          </p>
        </header>

        <form
          onSubmit={(e) => void onVerify(e)}
          className="rounded-xl border border-[#c9b8a8]/60 bg-white/90 p-md shadow-sm sm:p-lg"
        >
          <label className="block">
            <span className="font-label text-[11px] font-semibold tracking-[0.12em] text-on-surface-variant uppercase">
              Attestation JSON
            </span>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={14}
              spellCheck={false}
              placeholder='{ "version": 2, "policy": "schema-only", "signature": { ... }, ... }'
              className="mt-sm w-full resize-y rounded-lg border border-outline-variant/40 bg-[#FBF8F4] px-sm py-sm font-mono text-[12px] text-on-surface outline-none focus:border-primary"
            />
          </label>
          <div className="mt-md flex flex-wrap items-center gap-sm">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-primary px-md py-2 font-label text-[12px] font-semibold text-on-primary disabled:opacity-40"
            >
              {busy ? 'Verifying…' : 'Verify signature'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRaw('')
                setResult(null)
                setError(null)
              }}
              className="rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px] text-on-surface-variant hover:border-primary"
            >
              Clear
            </button>
          </div>
          <p className="mt-sm font-body text-[11px] text-on-surface-variant/80">
            API: <code className="font-mono text-[11px]">{apiHint}</code>
          </p>
        </form>

        {error ? (
          <div
            className="mt-md rounded-xl border border-error/30 bg-error/5 px-md py-sm"
            role="alert"
          >
            <p className="font-label text-[11px] font-semibold tracking-wide text-error uppercase">
              Could not verify
            </p>
            <p className="mt-xs font-body text-[13px] text-on-surface">{error}</p>
          </div>
        ) : null}

        {result ? (
          <div
            className={`mt-md rounded-xl border px-md py-sm ${
              result.ok
                ? 'border-tertiary/30 bg-tertiary/5'
                : 'border-error/30 bg-error/5'
            }`}
            role="status"
          >
            <p
              className={`font-label text-[11px] font-semibold tracking-wide uppercase ${
                result.ok ? 'text-tertiary' : 'text-error'
              }`}
            >
              {result.ok ? 'Signature valid' : 'Signature invalid'}
            </p>
            <dl className="mt-sm space-y-xs font-body text-[13px] text-on-surface">
              {result.reason ? (
                <div className="flex justify-between gap-sm">
                  <dt className="text-on-surface-variant">Reason</dt>
                  <dd>{result.reason}</dd>
                </div>
              ) : null}
              {result.fingerprint ? (
                <div className="flex justify-between gap-sm">
                  <dt className="text-on-surface-variant">Fingerprint</dt>
                  <dd className="truncate font-mono text-[12px]">
                    {result.fingerprint}
                  </dd>
                </div>
              ) : null}
              {result.policy ? (
                <div className="flex justify-between gap-sm">
                  <dt className="text-on-surface-variant">Policy</dt>
                  <dd>{result.policy}</dd>
                </div>
              ) : null}
              {result.alg ? (
                <div className="flex justify-between gap-sm">
                  <dt className="text-on-surface-variant">Alg</dt>
                  <dd>{result.alg}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}

        <p className="mt-lg font-body text-[12px] text-on-surface-variant">
          Workspace members can download verify packs from{' '}
          <Link to="/settings" className="text-primary underline">
            Settings
          </Link>{' '}
          after an attested export. Need an account?{' '}
          <Link to="/login" className="text-primary underline">
            Sign in
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

export default AttestationVerifyPage
