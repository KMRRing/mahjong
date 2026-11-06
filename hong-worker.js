// Mahjong's computer players think here, off the page's thread: a hand's state and a seat in, the decision and its reasons
// out (the coach asks the same question for your seat). how: { skill, seed, noise }. A puzzle's verdict asks with kind
// "explain" and the move made: the coach's options in words, the move's among them.
import { decide, explainMove } from "./hong-bot.js";

onmessage = e => {
  const { id, state, seat, how, kind, action } = e.data;
  let decision = null, error = null;
  try { decision = kind === "explain" ? explainMove(state, seat, action) : decide(state, seat, how || {}); } catch (err) { error = String(err?.stack || err); }
  postMessage({ id, decision, error });
};
