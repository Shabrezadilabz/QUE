import { useEffect, useState } from 'react'
import {
  countUnreadPlaneActivity,
  refreshPlaneActivityUnread,
} from '@/plane/planeActivity'

/** Unread Managed Plane activity — synced from API when online. */
export function usePlaneActivityUnread() {
  const [count, setCount] = useState(() => countUnreadPlaneActivity())

  useEffect(() => {
    const refresh = () => {
      void refreshPlaneActivityUnread().then(setCount).catch(() => {
        setCount(countUnreadPlaneActivity())
      })
    }
    refresh()
    window.addEventListener('que-plane-activity', refresh)
    window.addEventListener('storage', refresh)
    const interval = window.setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener('que-plane-activity', refresh)
      window.removeEventListener('storage', refresh)
      window.clearInterval(interval)
    }
  }, [])

  return count
}
