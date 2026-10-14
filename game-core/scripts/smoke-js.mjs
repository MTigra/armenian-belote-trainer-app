import assert from 'node:assert/strict';
import {
  startGame, applyAction, playerView, automaticAction, nextDeal,
  matchRecord, replayMatch, validateSnapshot,
} from '../build/dist/js/productionLibrary/armenian-belote-trainer-game-core.mjs';

let snapshot = startGame(17, 'SOUTH');
assert.equal(validateSnapshot(snapshot), true);
assert.throws(() => matchRecord(snapshot));
const publicState = JSON.parse(playerView(snapshot, 'WEST'));
assert.equal(publicState.hand.length, 8);
assert.equal('initialHands' in publicState, false);
assert.equal('setups' in publicState, false);
assert.equal('actions' in publicState, false);
const before = snapshot;
assert.throws(() => applyAction(snapshot, JSON.stringify({ type: 'bid', seat: 'SOUTH', amount: 8, trump: null })));
assert.equal(snapshot, before);

let deals = 0;
while (JSON.parse(snapshot).phase !== 'MATCH_FINISHED') {
  const seat = JSON.parse(snapshot).auction.turn;
  snapshot = applyAction(snapshot, JSON.stringify({ type: 'bid', seat, amount: 8, trump: deals % 2 ? null : 'HEARTS' }));
  for (let i = 0; i < 4; i++) {
    snapshot = applyAction(snapshot, JSON.stringify({ type: 'pass', seat: JSON.parse(snapshot).auction.turn }));
  }
  while (JSON.parse(snapshot).phase === 'PLAYING') {
    const state = JSON.parse(snapshot);
    snapshot = applyAction(snapshot, automaticAction(snapshot, state.turn));
  }
  deals++;
  assert.ok(deals < 100);
  if (JSON.parse(snapshot).phase !== 'MATCH_FINISHED') snapshot = nextDeal(snapshot, 17 + deals);
}
const archive = matchRecord(snapshot);
assert.deepEqual(JSON.parse(replayMatch(archive)), JSON.parse(snapshot));
assert.throws(() => replayMatch(JSON.stringify({ ...JSON.parse(archive), profileVersion: 'unknown' })));
console.log(`Exported ES-module API passed: complete ${deals}-deal match, privacy projection, invalid action, archive and replay.`);
