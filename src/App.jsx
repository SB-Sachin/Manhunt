import { Routes, Route, Navigate } from 'react-router-dom'
import HomeScreen from './screens/HomeScreen.jsx'
import LobbyScreen from './screens/LobbyScreen.jsx'
import SetupScreen from './screens/SetupScreen.jsx'
import DisperseScreen from './screens/DisperseScreen.jsx'
import GameScreen from './screens/GameScreen.jsx'
import GameOverScreen from './screens/GameOverScreen.jsx'
import ProfileScreen from './screens/ProfileScreen.jsx'
import { useGameStore } from './store/gameStore.js'

function RequireSession({ children }) {
  const roomCode = useGameStore(s => s.roomCode)
  if (!roomCode) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/profile" element={<ProfileScreen />} />
      <Route path="/lobby" element={<RequireSession><LobbyScreen /></RequireSession>} />
      <Route path="/setup" element={<RequireSession><SetupScreen /></RequireSession>} />
      <Route path="/dispersal" element={<RequireSession><DisperseScreen /></RequireSession>} />
      <Route path="/game" element={<RequireSession><GameScreen /></RequireSession>} />
      <Route path="/gameover" element={<RequireSession><GameOverScreen /></RequireSession>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
