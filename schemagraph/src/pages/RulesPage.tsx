import { useCallback, useEffect, useMemo, useState } from 'react'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { useToast } from '@/context/ToastContext'
import {
  applyPiiPolicyApi,
  createWorkspaceRuleApi,
  fetchWorkspaceRules,
  updateWorkspaceRuleApi,
} from '@/services/stitchApi'

const RULES_ASSETS = {
  switchOn: '/figma/rules/switchOn.svg',
  switchOff: '/figma/rules/switchOff.svg',
} as const

type WorkspaceRule = Awaited<ReturnType<typeof fetchWorkspaceRules>>[number]

/** Rules & Org Memory — live workspace rules with HITL toggles. */
export function RulesPage() {
  const { canWrite } = useWorkspaceRole()
  const { pushToast } = useToast()
  const [rules, setRules] = useState<WorkspaceRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newKind, setNewKind] = useState('general')

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await fetchWorkspaceRules(undefined, { ensureDefaults: true })
      setRules(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const activeRules = useMemo(
    () => rules.filter((r) => r.source !== 'promote'),
    [rules],
  )
  const learnedRules = useMemo(
    () => rules.filter((r) => r.source === 'promote'),
    [rules],
  )

  async function toggleRule(rule: WorkspaceRule) {
    if (!canWrite || busyId) return
    setBusyId(rule.id)
    try {
      const next = !rule.enabled
      await updateWorkspaceRuleApi(rule.id, { enabled: next })
      if (
        next &&
        rule.kind === 'privacy' &&
        /hide.*pii/i.test(rule.title)
      ) {
        const scan = await applyPiiPolicyApi().catch(() => null)
        if (scan?.tagged) {
          pushToast(`PII scan tagged ${scan.tagged} column(s)`, 'success')
        }
      }
      await reload()
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Could not update rule',
        'error',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function submitCreate() {
    if (!canWrite || !newTitle.trim() || !newBody.trim()) return
    setBusyId('create')
    try {
      await createWorkspaceRuleApi({
        kind: newKind,
        title: newTitle.trim(),
        body: newBody.trim(),
      })
      setCreateOpen(false)
      setNewTitle('')
      setNewBody('')
      setNewKind('general')
      pushToast('Rule created', 'success')
      await reload()
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Could not create rule',
        'error',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function confirmLearned(rule: WorkspaceRule) {
    if (!canWrite || busyId) return
    setBusyId(rule.id)
    try {
      await updateWorkspaceRuleApi(rule.id, { enabled: true, priority: 60 })
      pushToast('Learned rule promoted to active', 'success')
      await reload()
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Could not confirm rule',
        'error',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function dismissLearned(rule: WorkspaceRule) {
    if (!canWrite || busyId) return
    setBusyId(rule.id)
    try {
      await updateWorkspaceRuleApi(rule.id, { enabled: false, priority: 900 })
      await reload()
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Could not dismiss rule',
        'error',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col gap-[24px] overflow-y-auto p-[24px]">
        <header className="flex w-full items-center justify-between pb-[12px]">
          <div className="flex flex-col gap-[4px]">
            <h1 className="text-[24px] font-bold leading-[32px] tracking-[-0.48px] text-[#ecf0f4]">
              Rules & Org Memory
            </h1>
            <p className="text-[14px] leading-[20px] text-[#c8cdd3]">
              Workspace guidelines for AI Chat, transforms, and grid privacy — synced to the API.
            </p>
          </div>
          <button
            type="button"
            disabled={!canWrite}
            className="pdf-btn-primary rounded-[4px] px-[16px] py-[8px] text-[13px] font-semibold disabled:opacity-40"
            onClick={() => setCreateOpen(true)}
          >
            Create Custom Rule
          </button>
        </header>

        {error ? (
          <p className="text-[12px] text-[var(--pdf-danger)]">{error}</p>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-[16px] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="flex min-h-[320px] flex-col overflow-hidden rounded-[8px] border border-solid border-[#2a313c] bg-[#15191e]">
            <div className="border-b border-solid border-[#2a313c] bg-[#0f1216] px-[16px] py-[12px]">
              <p className="text-[14px] font-bold text-[#ecf0f4]">Active Global Rules</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <p className="p-[16px] text-[13px] text-[#8a9099]">Loading rules…</p>
              ) : activeRules.length === 0 ? (
                <p className="p-[16px] text-[13px] text-[#8a9099]">
                  No rules yet — create one or sync sources to learn join rules from Promote.
                </p>
              ) : (
                activeRules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    busy={busyId === rule.id}
                    canWrite={canWrite}
                    onToggle={() => void toggleRule(rule)}
                  />
                ))
              )}
            </div>
          </section>

          <section className="flex min-h-[320px] flex-col overflow-hidden rounded-[8px] border border-solid border-[#2a313c] bg-[#15191e]">
            <div className="flex items-center justify-between border-b border-solid border-[#2a313c] bg-[#0f1216] px-[16px] py-[12px]">
              <p className="text-[14px] font-bold text-[#ecf0f4]">Learned Rules</p>
              <span className="rounded-[12px] bg-[rgba(177,152,255,0.13)] px-[8px] py-[2px] text-[10px] font-bold text-[#b198ff]">
                {learnedRules.length} SUGGESTIONS
              </span>
            </div>
            <div className="flex flex-col gap-[16px] p-[16px]">
              {learnedRules.length === 0 ? (
                <p className="text-[12px] text-[#8a9099]">
                  Promote joins in the graph to learn rules here.
                </p>
              ) : (
                learnedRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-col gap-[12px] rounded-[6px] border border-solid border-[#2a313c] bg-[#0f1216] p-[16px]"
                  >
                    <p className="text-[13px] font-bold text-[#d4dbe3]">
                      {rule.title}
                    </p>
                    <p className="text-[12px] text-[#a3afbe]">{rule.body}</p>
                    <div className="flex gap-[8px]">
                      <button
                        type="button"
                        disabled={!canWrite || busyId === rule.id}
                        className="rounded-[4px] border border-solid border-[#424850] bg-[#252a30] px-[12px] py-[4px] text-[11px] font-semibold text-[#d4dbe3] disabled:opacity-40"
                        onClick={() => void dismissLearned(rule)}
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite || busyId === rule.id}
                        className="pdf-btn-primary rounded-[4px] px-[12px] py-[4px] text-[11px] font-bold disabled:opacity-40"
                        onClick={() => void confirmLearned(rule)}
                      >
                        Confirm Rule
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-[16px]">
          <div className="w-full max-w-[480px] rounded-[8px] border border-solid border-[#2a313c] bg-[#15191e] p-[20px]">
            <p className="text-[16px] font-bold text-[#ecf0f4]">Create rule</p>
            <div className="mt-[12px] space-y-[10px]">
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value)}
                className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1216] px-[10px] py-[8px] text-[13px] text-[#d4dbe3]"
              >
                <option value="general">General</option>
                <option value="join">Join</option>
                <option value="privacy">Privacy</option>
                <option value="sql">SQL</option>
                <option value="naming">Naming</option>
                <option value="transform">Transform</option>
              </select>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Rule title"
                className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1216] px-[10px] py-[8px] text-[13px] text-[#d4dbe3]"
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="What should AI and jobs always follow?"
                rows={4}
                className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1216] px-[10px] py-[8px] text-[13px] text-[#d4dbe3]"
              />
            </div>
            <div className="mt-[16px] flex justify-end gap-[8px]">
              <button
                type="button"
                className="rounded-[4px] px-[12px] py-[6px] text-[12px] text-[#a3afbe]"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === 'create'}
                className="pdf-btn-primary rounded-[4px] px-[12px] py-[6px] text-[12px] font-semibold"
                onClick={() => void submitCreate()}
              >
                Save rule
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </QueAppChrome>
  )
}

function RuleRow({
  rule,
  busy,
  canWrite,
  onToggle,
}: {
  rule: WorkspaceRule
  busy: boolean
  canWrite: boolean
  onToggle: () => void
}) {
  const enforced = rule.enabled
  return (
    <div className="flex flex-col gap-[12px] border-b border-solid border-[#2a313c] p-[16px]">
      <div className="flex w-full items-center justify-between">
        <div className="flex min-w-0 items-center gap-[8px]">
          <span
            className={[
              'shrink-0 rounded-[4px] px-[6px] py-[2px] text-[9px] font-bold',
              enforced
                ? 'border border-solid border-[#68ceaf] bg-[rgba(104,206,175,0.13)] text-[#68ceaf]'
                : 'bg-[#424850] text-[#a3afbe]',
            ].join(' ')}
          >
            {enforced ? 'ENFORCED' : 'DISABLED'}
          </span>
          <p
            className={[
              'truncate text-[14px] font-bold',
              enforced ? 'text-[#d4dbe3]' : 'text-[#a3afbe]',
            ].join(' ')}
          >
            {rule.title}
          </p>
          <span className="shrink-0 text-[10px] uppercase text-[#6b7380]">
            {rule.kind}
          </span>
        </div>
        <button
          type="button"
          disabled={!canWrite || busy}
          aria-label={enforced ? 'Disable rule' : 'Enable rule'}
          className="shrink-0 disabled:opacity-40"
          onClick={onToggle}
        >
          <img
            alt=""
            className="h-[20px] w-[36px]"
            src={enforced ? RULES_ASSETS.switchOn : RULES_ASSETS.switchOff}
          />
        </button>
      </div>
      <p className="text-[13px] text-[#a3afbe]">{rule.body}</p>
      {rule.kind === 'sql' ? (
        <div className="rounded-[6px] border border-solid border-[#2a313c] bg-[#0b0e11] p-[12px]">
          <p className="text-[12px] leading-[16px] text-[#68ceaf]">{rule.body}</p>
        </div>
      ) : null}
    </div>
  )
}

export default RulesPage
