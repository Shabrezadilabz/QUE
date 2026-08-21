import { QueAppChrome } from '@/layouts/QueAppChrome'

const RULES_ASSETS = {
  switchOn: '/figma/rules/switchOn.svg',
  switchOff: '/figma/rules/switchOff.svg',
} as const

const ACTIVE_RULES = [
  {
    id: '1',
    enforced: true,
    title: 'Always join on customer_id',
    description:
      'Enforce referential integrity checks during schema transformations and PR validations.',
    code: "ASSERT JOIN ON KEY = 'customer_id';",
  },
  {
    id: '2',
    enforced: true,
    title: 'Hide PII columns by default',
    description:
      'Automatically redact columns containing email, phone, or SSN patterns in final marts.',
  },
  {
    id: '3',
    enforced: false,
    title: 'Prefer partitioned tables for trailing 30 days',
    description: 'Optimize Snowflake storage queries through static time partitions.',
  },
]

const LEARNED = [
  {
    id: 'a',
    title: 'Rule: Group by partition_date',
    body: 'We detected 87% of query volume filters transaction queries by partition_date. Enforcing this optimizes average compute latency.',
  },
  {
    id: 'b',
    title: 'Rule: Map Stripe refund_id',
    body: 'Stripe schema change suggests refund_id should natively map downstream to raw_refunds table.',
  },
]

/** Rules & Org Memory — pixel-faithful Figma v2 frame (2:948). */
export function RulesPage() {
  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col gap-[24px] overflow-y-auto p-[24px]">
        <header className="flex w-full items-center justify-between pb-[12px]">
          <div className="flex flex-col gap-[4px]">
            <h1 className="text-[24px] font-bold leading-[32px] tracking-[-0.48px] text-[#ecf0f4]">
              Rules & Org Memory
            </h1>
            <p className="text-[14px] leading-[20px] text-[#c8cdd3]">
              Federated structural guidelines automatically synced from semantic stores.
            </p>
          </div>
          <button
            type="button"
            className="pdf-btn-primary rounded-[4px] px-[16px] py-[8px] text-[13px] font-semibold"
          >
            Create Custom Rule
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-[16px] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Active Global Rules */}
          <section className="flex min-h-[320px] flex-col overflow-hidden rounded-[8px] border border-solid border-[#2a313c] bg-[#15191e]">
            <div className="border-b border-solid border-[#2a313c] bg-[#0f1216] px-[16px] py-[12px]">
              <p className="text-[14px] font-bold text-[#ecf0f4]">Active Global Rules</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {ACTIVE_RULES.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col gap-[12px] border-b border-solid border-[#2a313c] p-[16px]"
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-[8px]">
                      <span
                        className={[
                          'rounded-[4px] px-[6px] py-[2px] text-[9px] font-bold',
                          rule.enforced
                            ? 'border border-solid border-[#68ceaf] bg-[rgba(104,206,175,0.13)] text-[#68ceaf]'
                            : 'bg-[#424850] text-[#a3afbe]',
                        ].join(' ')}
                      >
                        {rule.enforced ? 'ENFORCED' : 'DISABLED'}
                      </span>
                      <p
                        className={[
                          'text-[14px] font-bold',
                          rule.enforced ? 'text-[#d4dbe3]' : 'text-[#a3afbe]',
                        ].join(' ')}
                      >
                        {rule.title}
                      </p>
                    </div>
                    <img
                      alt=""
                      className="h-[20px] w-[36px] shrink-0"
                      src={rule.enforced ? RULES_ASSETS.switchOn : RULES_ASSETS.switchOff}
                    />
                  </div>
                  <p className="text-[13px] text-[#a3afbe]">{rule.description}</p>
                  {rule.code ? (
                    <div className="rounded-[6px] border border-solid border-[#2a313c] bg-[#0b0e11] p-[12px]">
                      <p className="text-[12px] leading-[16px] text-[#68ceaf]">{rule.code}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {/* Learned Rules */}
          <section className="flex min-h-[320px] flex-col overflow-hidden rounded-[8px] border border-solid border-[#2a313c] bg-[#15191e]">
            <div className="flex items-center justify-between border-b border-solid border-[#2a313c] bg-[#0f1216] px-[16px] py-[12px]">
              <p className="text-[14px] font-bold text-[#ecf0f4]">Learned Rules</p>
              <span className="rounded-[12px] bg-[rgba(177,152,255,0.13)] px-[8px] py-[2px] text-[10px] font-bold text-[#b198ff]">
                {LEARNED.length} SUGGESTIONS
              </span>
            </div>
            <div className="flex flex-col gap-[16px] p-[16px]">
              {LEARNED.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-[12px] rounded-[6px] border border-solid border-[#2a313c] bg-[#0f1216] p-[16px]"
                >
                  <p className="text-[13px] font-bold text-[#d4dbe3]">{item.title}</p>
                  <p className="text-[12px] text-[#a3afbe]">{item.body}</p>
                  <div className="flex gap-[8px]">
                    <button
                      type="button"
                      className="rounded-[4px] border border-solid border-[#424850] bg-[#252a30] px-[12px] py-[4px] text-[11px] font-semibold text-[#d4dbe3]"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      className="pdf-btn-primary rounded-[4px] px-[12px] py-[4px] text-[11px] font-bold"
                    >
                      Confirm Rule
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </QueAppChrome>
  )
}

export default RulesPage
