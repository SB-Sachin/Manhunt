export const POWERUP_TYPES = {
  REVEAL_IT: {
    label: 'Reveal It',
    emoji: '👁️',
    description: 'Shows all "It" positions to all runners for 15s',
    durationMs: 15000,
    availableTo: 'runner',
    color: '#3b82f6',
  },
  IMMUNITY: {
    label: 'Immunity',
    emoji: '🛡️',
    description: 'You cannot be tagged for 30s',
    durationMs: 30000,
    availableTo: 'runner',
    color: '#22c55e',
  },
  REVEAL_RUNNER: {
    label: 'Reveal Runner',
    emoji: '📍',
    description: 'Shows a random runner\'s exact location for 15s',
    durationMs: 15000,
    availableTo: 'it',
    color: '#ef4444',
  },
  CLUSTER_SCAN: {
    label: 'Cluster Scan',
    emoji: '👥',
    description: 'Shows clusters of runners on the map for 15s',
    durationMs: 15000,
    availableTo: 'it',
    color: '#f97316',
  },
}

export const REVEAL_TYPES = {
  REVEAL_RUNNER: 'REVEAL_RUNNER',
  CLUSTER_SCAN: 'CLUSTER_SCAN',
}

export function getActiveEffect(game, type) {
  if (!game?.activeEffects) return null
  return game.activeEffects.find(e => e.type === type && e.expiresAt > Date.now()) || null
}

export function getMyPowerUps(game, uid) {
  return game?.players?.[uid]?.powerUps || []
}

export function isImmune(game, uid) {
  const effects = game?.activeEffects || []
  return effects.some(
    e => e.type === 'IMMUNITY' && e.activatedBy === uid && e.expiresAt > Date.now()
  )
}
