import type { Register } from 'claude-code'

// What the spinner says while a turn runs: "Matutando… (12s · 300 tokens)".
const GERUNDS = [
  'Matutando', 'Garimpando', 'Destrinchando', 'Fuçando', 'Cozinhando', 'Ruminando',
  'Tricotando', 'Lapidando', 'Futucando', 'Maquinando', 'Costurando', 'Esmiuçando',
  'Peneirando', 'Burilando', 'Cismando', 'Arquitetando', 'Engendrando', 'Desembaraçando',
  'Remexendo', 'Desenrolando', 'Fermentando', 'Bordando', 'Tramando', 'Rabiscando',
  'Batucando', 'Caraminholando', 'Proseando', 'Pelejando', 'Labutando', 'Farejando',
  'Xeretando', 'Bisbilhotando', 'Escarafunchando', 'Remoendo', 'Esquadrinhando', 'Decifrando',
  'Ponderando', 'Elucubrando', 'Tecendo', 'Alinhavando', 'Temperando', 'Refogando',
  'Marinando', 'Sovando', 'Polindo', 'Afinando', 'Calibrando', 'Gingando',
] as const

// What the line that closes a turn says: "✻ Garimpou por 1m 4s".
const PAST = [
  'Matutou', 'Garimpou', 'Destrinchou', 'Fuçou', 'Cozinhou', 'Ruminou', 'Tricotou',
  'Lapidou', 'Futucou', 'Maquinou', 'Costurou', 'Esmiuçou', 'Peneirou', 'Burilou',
  'Cismou', 'Arquitetou', 'Remexeu', 'Fermentou', 'Bordou', 'Tramou', 'Rabiscou',
  'Batucou', 'Proseou', 'Pelejou', 'Labutou', 'Farejou', 'Xeretou', 'Escarafunchou',
  'Remoeu', 'Esquadrinhou', 'Decifrou', 'Ponderou', 'Teceu', 'Alinhavou', 'Temperou',
  'Refogou', 'Marinou', 'Poliu', 'Afinou', 'Calibrou',
] as const

// The engine's own mark for the turn line.
const MARK = '✻'

// FNV-1a: the same seed always picks the same word, so a line never flickers.
function hash(text: string): number {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function pick(list: readonly string[], seed: string, fallback: string): string {
  return list[hash(seed) % list.length] ?? fallback
}

// The engine's format: 3s, 1m 4s, 1h 2m.
function duration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export const register: Register = on => {
  // The engine samples an English word per turn; the same word maps to the same one here.
  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, word: pick(GERUNDS, e.props.word, 'Matutando') } }),
  )

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    // ctrl+o shows the engine's full line, and the waiting text stays the engine's.
    if (e.props.isExpanded === true || e.props.waitingFor !== undefined) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const verb = pick(PAST, e.requestId || e.props.word, 'Trabalhou')

    return (
      <Box flexDirection="row" marginTop={1} width="100%">
        <Box minWidth={2}>
          <Text dimColor>{MARK}</Text>
        </Box>
        <Text dimColor>{`${verb} por ${duration(e.props.durationMs)}`}</Text>
      </Box>
    )
  })
}
