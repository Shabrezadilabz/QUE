import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getApiBase } from '@/services/apiConfig'
import { verifyAttestationPublic } from '@/services/stitchApi'
import { FigmaPublicShell, PUBLIC_ASSETS } from '@/components/figma/FigmaPublicShell'

/** Attestation Verification — pixel-faithful Figma v2 frame (2:1250). */
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
    <FigmaPublicShell
      section="Verify"
      sectionBadge
      headerRight={
        <Link to="/product" className="text-[13px] text-[#a3afbe] hover:text-[#ecf0f4]">
          Documentation
        </Link>
      }
    >
      <div className="flex flex-1 items-center justify-center p-[40px]">
        <div className="w-[580px] max-w-full rounded-[12px] border border-solid border-[#2a313c] bg-[#15191e] p-[32px]">
          <header className="mb-[24px] flex flex-col gap-[8px]">
            <h1 className="text-[22px] font-bold text-[#ecf0f4]">Verify Attestation</h1>
            <p className="text-[13px] text-[#a3afbe]">
              Input the cryptographic attestation token or snapshot fingerprint to verify the
              integrity and lineage of the data artifact.
            </p>
          </header>

          <form onSubmit={(e) => void onVerify(e)} className="flex flex-col gap-[24px]">
            <label className="flex flex-col gap-[8px]">
              <span className="text-[11px] font-extrabold tracking-[1px] text-[#a3afbe] uppercase">
                Attestation token / fingerprint
              </span>
              <textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={8}
                spellCheck={false}
                placeholder="Paste the verification token here (e.g. que_attest_sha256_8f2d93...)"
                className="h-[160px] w-full resize-y rounded-[6px] border border-solid border-[#2a313c] bg-[#0f1216] p-[12px] font-mono text-[13px] text-[#d4dbe3] outline-none placeholder:text-[#a3afbe]"
              />
            </label>

            {error ? (
              <p className="rounded-[6px] border border-solid border-[#ff6b6b]/40 bg-[rgba(255,107,107,0.13)] px-[12px] py-[8px] text-[13px] text-[#ff6b6b]">
                {error}
              </p>
            ) : null}

            {result ? (
              <div
                className={[
                  'rounded-[6px] border border-solid px-[12px] py-[10px] text-[13px]',
                  result.ok
                    ? 'border-[#7aecd0] bg-[rgba(122,236,208,0.13)] text-[#7aecd0]'
                    : 'border-[#ff6b6b] bg-[rgba(255,107,107,0.13)] text-[#ff6b6b]',
                ].join(' ')}
              >
                {result.ok ? 'Signature valid' : result.reason || 'Verification failed'}
                {result.fingerprint ? (
                  <p className="mt-1 font-mono text-[11px] opacity-80">{result.fingerprint}</p>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="pdf-btn-primary flex w-full items-center justify-center gap-[8px] rounded-[6px] px-[24px] py-[12px] text-[14px] font-bold disabled:opacity-50"
            >
              <img alt="" className="size-[16px]" src={PUBLIC_ASSETS.check} />
              {busy ? 'Verifying…' : 'Verify Artifact'}
            </button>

            <p className="text-center text-[11px] text-[#a3afbe]">
              API:{' '}
              <code className="font-mono text-[#d4dbe3]">{apiHint}</code>
            </p>
          </form>
        </div>
      </div>
    </FigmaPublicShell>
  )
}

export default AttestationVerifyPage
