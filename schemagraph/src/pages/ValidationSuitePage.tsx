import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'

const CHECKS = [
  {
    name: 'Row count parity',
    detail: 'Within 0.2% vs warehouse',
    status: 'pass' as const,
  },
  {
    name: 'Schema contract freeze',
    detail: 'No breaking column drops',
    status: 'pass' as const,
  },
  {
    name: 'Join key uniqueness',
    detail: '2 keys below 99% unique',
    status: 'warn' as const,
  },
  {
    name: 'Sample scrub policy',
    detail: '5–10 row cap enforced',
    status: 'pass' as const,
  },
]

const DRIFT_ITEMS = [
  { dataset: 'ml_training_set_v4', severity: 'high', change: 'Column type drift on feature_vector' },
  { dataset: 'stg_events', severity: 'medium', change: 'New nullable field detected' },
]

/** Validation & Drift — Figma v1 slate styling (1:700). */
export function ValidationSuitePage() {
  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <header className="shrink-0 border-b border-solid border-[#424850] bg-[#0f1215] px-[24px] pb-[33px] pt-[32px]">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between">
            <div className="flex flex-col gap-[4px]">
              <h1 className="text-[24px] font-bold leading-[32px] tracking-[-0.48px] text-[#d4dbe3]">
                Validation & Drift Monitoring
              </h1>
              <p className="text-[12px] leading-[18px] text-[#c8cdd3]">
                Contract checks on promoted joins and managed datasets.
              </p>
            </div>
            <Link
              to="/jobs"
              className="rounded-[4px] bg-[#d0d8e0] px-[16px] py-[8px] text-[12px] font-semibold tracking-[0.6px] text-[#323840]"
            >
              Open Jobs
            </Link>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-[24px]">
          <div className="mx-auto grid max-w-[1280px] gap-[16px] lg:grid-cols-2">
            <section className="overflow-hidden rounded-[8px] border border-solid border-[#424850] bg-[#0f1215]">
              <div className="border-b border-solid border-[#424850] bg-[#1e2328] px-[16px] py-[12px]">
                <p className="text-[10px] font-semibold tracking-[0.5px] text-[#c8cdd3] uppercase">
                  Active checks
                </p>
              </div>
              <ul>
                {CHECKS.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center justify-between border-t border-solid border-[#424850] px-[16px] py-[14px]"
                  >
                    <div>
                      <p className="text-[14px] font-medium text-[#d4dbe3]">{c.name}</p>
                      <p className="text-[12px] text-[#c8cdd3]">{c.detail}</p>
                    </div>
                    <span
                      className={[
                        'rounded-[4px] px-[8px] py-[2px] text-[10px] font-bold',
                        c.status === 'pass'
                          ? 'bg-[rgba(104,206,175,0.13)] text-[#68ceaf]'
                          : 'bg-[rgba(255,176,107,0.13)] text-[#ffb06b]',
                      ].join(' ')}
                    >
                      {c.status === 'pass' ? 'PASS' : 'REVIEW'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="overflow-hidden rounded-[8px] border border-solid border-[#424850] bg-[#0f1215]">
              <div className="border-b border-solid border-[#424850] bg-[#1e2328] px-[16px] py-[12px]">
                <p className="text-[10px] font-semibold tracking-[0.5px] text-[#c8cdd3] uppercase">
                  Drift alerts
                </p>
              </div>
              <ul>
                {DRIFT_ITEMS.map((d) => (
                  <li
                    key={d.dataset}
                    className="border-t border-solid border-[#424850] px-[16px] py-[14px]"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[14px] font-medium text-[#d4dbe3]">{d.dataset}</p>
                      <span
                        className={[
                          'rounded-[4px] px-[8px] py-[2px] text-[10px] font-bold uppercase',
                          d.severity === 'high'
                            ? 'bg-[rgba(255,107,107,0.13)] text-[#ff6b6b]'
                            : 'bg-[rgba(255,176,107,0.13)] text-[#ffb06b]',
                        ].join(' ')}
                      >
                        {d.severity}
                      </span>
                    </div>
                    <p className="mt-[4px] text-[12px] text-[#c8cdd3]">{d.change}</p>
                  </li>
                ))}
              </ul>
              <div className="border-t border-solid border-[#424850] p-[16px]">
                <Link
                  to="/drift-agent"
                  className="text-[13px] text-[#68ceaf] hover:underline"
                >
                  Open drift agent →
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </QueAppChrome>
  )
}

export default ValidationSuitePage
