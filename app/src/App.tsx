import { useState } from 'react'

const components = [
  { name: 'Utility feed', normal: 'Grid online', outage: 'Grid offline', backup: 'Grid offline', weight: 0 },
  { name: 'Backup generator', normal: 'Ready', outage: 'Ready · awaiting transfer', backup: 'Supplying cooling', weight: 0 },
  { name: 'Cooling unit', normal: 'Running on grid', outage: 'Power interrupted', backup: 'Running on generator', weight: 25 },
  { name: 'Server room', normal: 'Temperature stable', outage: 'Projected to warm', backup: 'Temperature stabilized', weight: 30 },
  { name: 'Tenant service', normal: 'Service available', outage: 'Service at risk', backup: 'Service protected', weight: 45 },
] as const

type Scenario = 'normal' | 'outage' | 'backup'

function App() {
  const [scenario, setScenario] = useState<Scenario>('normal')
  const [ticket, setTicket] = useState(false)
  const risk = components.reduce((total, item) => total + (scenario === 'outage' ? item.weight : 0), 0)

  return (
    <main>
      <header><strong>RIPPLE</strong><span>CBRE challenge · Synthetic scenario</span></header>
      <section className="intro">
        <p className="label">01 / FICTIONAL DATA CENTER</p>
        <h1>Trace the outage.</h1>
        <p>See how loss of utility power can threaten cooling, server temperatures, and tenant service.</p>
      </section>
      <section className="panel" aria-labelledby="systems">
        <h2 id="systems">Power and its downstream effects</h2>
        <ol>
          {components.map((item) => (
            <li key={item.name} data-risk={scenario === 'outage' && item.weight > 0}>
              <strong>{item.name}</strong>
              <span>{item[scenario]}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="panel response">
        <div aria-live="polite">
          <p className="label">MODELED SERVICE RISK</p>
          <h2 className="score">{risk} <small>/ 100</small></h2>
          <p>Demo weights: cooling 25, server room 30, tenant service 45. Affected components add to the score.</p>
        </div>
        <div>
          <h2>Response</h2>
          <p>{scenario === 'normal' ? 'Simulate a grid outage to see the impact.' : scenario === 'outage' ? 'The demo generator is ready. Test whether transferring cooling to backup protects tenant service.' : 'Backup restores cooling in the simulation. Schedule an inspection of the failed utility feed.'}</p>
          <div className="controls">
            <button disabled={scenario !== 'normal'} onClick={() => setScenario('outage')}>Simulate outage</button>
            <button disabled={scenario !== 'outage'} onClick={() => setScenario('backup')}>Test backup transfer</button>
            <button disabled={scenario === 'normal'} onClick={() => { setScenario('normal'); setTicket(false) }}>Reset</button>
          </div>
          {scenario === 'backup' && <button disabled={ticket} onClick={() => setTicket(true)}>Create demo work order</button>}
          {ticket && <p role="status">Work order opened · Inspect utility feed · Facilities team</p>}
        </div>
      </section>
    </main>
  )
}

export default App
