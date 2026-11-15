// Historical research retains its embargo. Live refreshes may use a complete
// final box only after its receipt has been recorded before the forecast cutoff.
export const LIVE_INPUT_VERSION='verified-finals-1';
export const LIVE_MODEL_VERSION='trained-opponent-rest-latest-final-1';
export const LIVE_BASELINE_VERSION='recent-game-latest-final-1';
export const LIVE_JOINT_VERSION='minute-shadow-latest-final-3';
export function eligibleFinal(bundle,game,cutoff=Date.parse(bundle.fetchedAt)){
 const time=Date.parse(game?.datetime||game?.date),final=game?.status_state==='final'||game?.status==='Final';
 if(!final||!Number.isFinite(time)||time>=cutoff)return false;
 if(time+86400000<cutoff)return true;
 const receipt=bundle.verifiedFinals?.[game.id],received=Date.parse(receipt?.receivedAt);
 return bundle.liveInputVersion===LIVE_INPUT_VERSION&&receipt?.complete===true&&receipt.start===game.datetime&&Number.isFinite(received)&&received>=time&&received<=cutoff;
}
export function eligibleStat(bundle,row,cutoff=Date.parse(bundle.fetchedAt)){
 const game=bundle.games.find(g=>String(g.id)===String(row.game?.id));
 if(game)return eligibleFinal(bundle,game,cutoff);
 return row.provenance==='espn-player-gamelog'&&row.game?.final&&Date.parse(row.game.datetime)+86400000<cutoff;
}
