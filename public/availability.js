export const AVAILABILITY_POLICY='official-injury-review-1';
export function availabilityHolds(scenario,now=Date.now()){
 let evidence=scenario?.availabilityEvidence;const remaining=Date.parse(scenario?.start)-now,confirmation=scenario?.availabilityConfirmation;
 if(confirmation?.policy===AVAILABILITY_POLICY){if(confirmation.fingerprint!==evidence?.fingerprint)return ['Availability changed since this forecast; refresh the prediction'];if(!Number.isFinite(Date.parse(confirmation.checkedAt))||Date.parse(confirmation.checkedAt)>now)return ['Availability confirmation timestamp is invalid'];evidence=confirmation.evidence;}
 if(evidence?.policy!==AVAILABILITY_POLICY)return ['Official game-specific injury review is missing; refresh this matchup'];
 const holds=[],maxReceiptAge=remaining<=90*60000?10*60000:remaining<=6*3600000?20*60000:75*60000;
 if(evidence.state!=='verified')holds.push('Official injury coverage is unavailable, incomplete or conflicting');
 const published=Date.parse(evidence.publishedAt),received=Date.parse(evidence.receivedAt),maxReportAge=remaining<=6*3600000?90*60000:3*3600000;
 if(!Number.isFinite(published)||published>now||now-published>maxReportAge)holds.push('Official injury report is stale or has an invalid publication time');
 if(!Number.isFinite(received)||received>now||now-received>maxReceiptAge)holds.push('Injury review needs a fresh check before selection');
 for(const t of scenario.teams||[]){const receipt=Date.parse(evidence.rosterReceivedAt?.[t.id]);if(!Number.isFinite(receipt)||receipt>now||now-receipt>maxReceiptAge)holds.push(t.name+': roster observation needs refreshing');
  for(const p of t.players||[]){if(p.availabilityEvidence?.conflict)holds.push(p.name+': injury sources conflict');if(String(p.injury||'').toLowerCase()==='out'&&p.availability>0)holds.push(p.name+': a known Out player was activated in this scenario');if((p.roleMinutes??p.minutes??0)>=20&&p.availability>0&&p.availability<1)holds.push(p.name+': rotation availability is unresolved');if(p.availability>0&&p.availabilityEvidence?.restriction)holds.push(p.name+': minutes restriction or return status needs review');}
 }
 return [...new Set(holds)];
}
