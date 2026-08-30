import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  getMutatingRequestCount,
  subscribeMutatingRequests,
} from '@/services/stitchApi'
import { BackendBusyOverlay } from '@/components/BackendBusyOverlay'

const BackendBusyContext = createContext(false)

export function BackendBusyProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(() => getMutatingRequestCount())
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    return subscribeMutatingRequests(setCount)
  }, [])

  useEffect(() => {
    if (count > 0) {
      const show = window.setTimeout(() => setVisible(true), 120)
      return () => window.clearTimeout(show)
    }
    setVisible(false)
  }, [count])

  return (
    <BackendBusyContext.Provider value={count > 0}>
      {children}
      <BackendBusyOverlay active={visible} label="Working…" />
    </BackendBusyContext.Provider>
  )
}

export function useBackendBusy() {
  return useContext(BackendBusyContext)
}
