export function assert(ok, message) { if (!ok) { const e = new Error(message); e.status = 400; throw e; } }
export function number(x, lo, hi, label) { assert(typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi, `Invalid ${label}`); return x; }
export function string(x, label) { assert(typeof x === 'string' && x.length > 0 && x.length <= 160, `Invalid ${label}`); return x; }
export function timestamp(x, label) { assert(typeof x === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x)), `Invalid ${label}: ISO timestamp with offset required`); return x; }
export function validateScenario(s) {
  assert(s && typeof s === 'object', 'Scenario required'); string(s.id, 'event ID'); timestamp(s.start, 'start'); timestamp(s.asOf, 'asOf');
  assert(Date.parse(s.asOf) < Date.parse(s.start), 'Projection inputs must predate tip-off');
  assert(typeof s.demo === 'boolean', 'demo flag required'); string(s.source, 'source');
  assert(Array.isArray(s.teams) && s.teams.length === 2, 'Two teams required (home first)');
  if(s.gameForecast){const g=s.gameForecast;timestamp(g.trainingLastGameAt,'game model training cutoff');assert(Date.parse(g.trainingLastGameAt)+86400000<Date.parse(s.asOf),'Game model training must predate the forecast');number(g.probability,.000001,.999999,'trained game probability');number(g.marginMean,-150,150,'trained margin');number(g.marginScale,4,15,'trained margin scale');number(g.totalMean,140,300,'trained total');number(g.totalSd,5,50,'trained total dispersion');number(g.rho,-.9,.9,'trained residual correlation');assert(Math.abs(g.marginMean-g.marginScale*Math.log(g.probability/(1-g.probability)))<1e-6,'Trained margin/probability mismatch');}
  const ids = new Set();
  for (const t of s.teams) { string(t.id, 'team ID'); string(t.name, 'team name'); assert(!ids.has(t.id), 'Duplicate team ID'); ids.add(t.id); number(t.pace, 80, 120, 'pace'); number(t.offense, 80, 140, 'offense'); number(t.defense, 80, 140, 'defense'); number(t.restDays, 0, 10, 'rest days');
    assert(Array.isArray(t.players) && t.players.length >= 6 && t.players.length <= 20, '6–20 players per team required');
    let available = 0;
    for (const p of t.players) { string(p.id, 'player ID'); string(p.name, 'player name'); assert(!ids.has(p.id), 'Duplicate player ID'); ids.add(p.id); number(p.minutes, 0, 48, 'minutes'); number(p.availability, 0, 1, 'availability'); number(p.impact, -10, 10, 'impact'); for (const stat of ['points','rebounds','assists']) number(p[stat], 0, 2, `${stat}/minute`); if (p.availability > 0) available++; }
    assert(available >= 5, 'At least five eligible players required');
    assert(t.players.every(p=>p.availability===0||p.points>0), 'Eligible players require a positive scoring rate');
  }
  return s;
}
