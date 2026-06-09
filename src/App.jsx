import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import HomeScreen from './screens/HomeScreen.jsx'
import LobbyScreen from './screens/LobbyScreen.jsx'
import SetupScreen from './screens/SetupScreen.jsx'
import DisperseScreen from './screens/DisperseScreen.jsx'
import GameScreen from './screens/GameScreen.jsx'
import GameOverScreen from './screens/GameOverScreen.jsx'
import ProfileScreen from './screens/ProfileScreen.jsx'
import LeaderboardScreen from './screens/LeaderboardScreen.jsx'
import JoinRoom from './screens/JoinRoom.jsx'
import { useGameStore } from './store/gameStore.js'
import { ensureAuth } from './services/gameService.js'
import { signInSync } from './services/statsCloud.js'
import { auth } from './services/firebase.js'
import { onAuthStateChanged } from 'firebase/auth'

function RequireSession({ children }) {
  const roomCode = useGameStore(s => s.roomCode)
  if (!roomCode) return <Navigate to="/" replace />
  return children
}

/*
 * Wait for Firebase to restore the persistent anonymous uid before rendering
 * routes. This is what makes reload-rejoin work: the same uid that's already in
 * the game's players map is restored, and roomCode was rehydrated from
 * localStorage by the store, so RequireSession passes and the screen's existing
 * status subscription forwards the player to the right place.
 */
function SessionBoot({ children }) {
  const authReady = useGameStore(s => s.authReady)
  const setUid = useGameStore(s => s.setUid)

  useEffect(() => {
    ensureAuth().catch(() => {})
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid)
        // Logged-in (non-anonymous) → pull cloud stats onto this device.
        if (!user.isAnonymous) signInSync(user.uid).catch(() => {})
      }
    })
    return unsub
  }, [setUid])

  if (!authReady) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }
  return children
}

export default function App() {
  return (
    <SessionBoot>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
        <Route path="/g/:code" element={<JoinRoom />} />
        <Route path="/lobby" element={<RequireSession><LobbyScreen /></RequireSession>} />
        <Route path="/setup" element={<RequireSession><SetupScreen /></RequireSession>} />
        <Route path="/dispersal" element={<RequireSession><DisperseScreen /></RequireSession>} />
        <Route path="/game" element={<RequireSession><GameScreen /></RequireSession>} />
        <Route path="/gameover" element={<RequireSession><GameOverScreen /></RequireSession>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionBoot>
  )
}
