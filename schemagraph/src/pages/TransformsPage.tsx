import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createTransformApi,
  fetchTransforms,
  reviewTransformApi,
} from '@/services/stitchApi'

/** NL → reviewed SQL transforms (HITL). */
export function TransformsPage() {
  const { canWrite } = useWorkspaceRole()
  const [prompt, setPrompt] = useState(
    'Clean customer emails and join to orders for a trusted 360 extract',
  )
  const [items, setItems] = useState<
    {
      id: string
      title: string
      prompt: string
      sqlText: string
      status: string
      jobId?: string | null
    }[]
  >([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setItems(await fetchTransforms())
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  async function draft() {
    if (!canWrite) return
    setBusy(true)
    setError(null)
    try {
      await createTransformApi({ prompt })
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function act(id: string, action: 'approve' | 'reject' | 'apply') {
    setBusy(true)
    try {
      await reviewTransformApi(id, action)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome eyebrow="TRANSFORMS · NL → SQL">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-4xl md:px-lg">
        <h1 className="font-headline text-xl font-semibold">Transforms</h1>
        <p className="mt-xs text-[13px] text-on-surface-variant">
          Describe a clean/transform in plain language. Review SQL, approve,
          then apply to a job notebook — never silent apply.
        </p>
        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        {canWrite ? (
          <div className="mt-lg rounded-xl border border-outline-variant/30 bg-white p-md">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
            />
            <button
              type="button"
              disabled={busy || !prompt.trim()}
              onClick={() => void draft()}
              className="mt-sm rounded-lg bg-primary px-md py-1.5 text-[12px] font-semibold text-on-primary disabled:opacity-40"
            >
              {busy ? 'Drafting…' : 'Draft SQL'}
            </button>
          </div>
        ) : null}
        <ul className="mt-lg space-y-md">
          {items.map((d) => (
            <li
              key={d.id}
              className="rounded-xl border border-outline-variant/30 bg-white p-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <p className="font-label text-[13px] font-semibold">{d.title}</p>
                <span className="text-[11px] uppercase text-on-surface-variant">
                  {d.status}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-on-surface-variant">{d.prompt}</p>
              <pre className="mt-md overflow-x-auto rounded-lg bg-[#2a211c] p-md font-mono text-[11px] text-[#f0e6dc]">
                {d.sqlText}
              </pre>
              {canWrite && d.status === 'proposed' ? (
                <div className="mt-sm flex gap-sm">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(d.id, 'approve')}
                    className="rounded border border-primary px-md py-1 text-[12px] text-primary"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act(d.id, 'reject')}
                    className="rounded border border-error/40 px-md py-1 text-[12px] text-error"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
              {canWrite && d.status === 'approved' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act(d.id, 'apply')}
                  className="mt-sm rounded-lg bg-primary px-md py-1.5 text-[12px] font-semibold text-on-primary"
                >
                  Apply to job
                </button>
              ) : null}
              {d.jobId ? (
                <Link
                  to={`/jobs/${d.jobId}/notebook`}
                  className="mt-sm inline-block text-[12px] text-primary underline"
                >
                  Open job
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </QueAppChrome>
  )
}

export default TransformsPage
