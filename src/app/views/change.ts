/** The class suffix and arrow for a change. The arrow and a sign carry it, never colour alone. */
export function direction(value: number): ['up' | 'down' | 'none', string] {
  return value > 0 ? ['up', '↑'] : value < 0 ? ['down', '↓'] : ['none', '→'];
}
