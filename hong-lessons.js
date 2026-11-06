// Mahjong's lessons (hong-course.js is the stage and the judges): every rule in order, then a little strategy. Facts a
// question rests on are the referee's: a question may carry check(), which tests/hong-course.mjs compares with its
// answer, and a step whose words quote figures carries proves(), which must hold. Tiles: see hong-course.js.
import * as E from "./hong-engine.js";
import { OPTS, tilesOf, sceneOf, scoreAt } from "./hong-course.js";

const deal0 = (o = {}) => E.deal({ seed: 11, dealer: 0, round: 0, opts: OPTS, ...o });
const fanAt = step => scoreAt(sceneOf(step)).fan;
const WORDS = ["Nothing", "1 fan", "2 fan"];

const ALL_CHOWS = { hand: "2m 3m 4m 5p 6p 7p 3s 4s 5s 6s 7s 5m 5m", draw: "8s" };
const OPEN_CHOW = { hand: "5p 6p 7p 3s 4s 5s 7s 8s 5m 5m", melds: ["c:2m"], discard: "9s", from: 1 };
const SHUT_CHOW = { hand: "2m 3m 4m 5p 6p 7p 3s 4s 5s 7s 8s 5m 5m", discard: "9s", from: 1 };
const DOUBLE_WIND = { hand: "2m 3m 5p 6p 7p 3s 4s 5s 9s 9s", melds: ["p:E"], discard: "4m", from: 1 };
const RED_PUNG = { hand: "2m 3m 4m 5p 6p 7p 3s 4s 5s Rd Rd Rd 5m", discard: "5m", from: 2 };
const FOUR_PUNGS = { hand: "2m 2m 2m 5p 5p 5p 8s 8s 8s 4s 4s 7m 7m", discard: "7m", from: 2 };
const FLUSH = { hand: "1m 2m 3m 4m 5m 6m 7m 8m 9m 2m 3m 5m 5m", draw: "4m" };
const ROBBED = { hand: "2m 3m 4m 5p 6p 7p 3s 4s 5s 6s 7s 5m 5m", rob: "8s", from: 2 };
const LONE_HONOURS = { hand: "2m 3m 4m 6p 7p 8p 3s 4s 5s 5m 9s N Gd 7m" };
const DRAGON_TABLE = { handLabel: "Their tiles", throwLabel: "You throw", hand: "Wd 2m 3m 4m 5p 6p 7p", melds: ["p:Rd", "p:Gd"], discard: "Wd", from: 2 };

export const COURSE = {
  title: "Learn Mahjong", zh: "麻雀",
  chapters: [
    {
      id: "game", title: "The game", zh: "牌局",
      lessons: [
        {
          id: "game", title: "Hong Kong mahjong", zh: "香港麻雀",
          steps: [
            { say: "Mahjong for four, as it is played in Hong Kong homes and clubs, and as this game plays it: 144 tiles, three fan (points of pattern) to win, ten fan the most a hand pays. The Menu can switch to a game without fan, or to other minimums; the course teaches the usual one. A hand is four sets and a pair.", rows: [{ label: "Four sets", tiles: "1m 2m 3m 5p 5p 5p 7s 8s 9s E E E" }, { label: "and a pair", tiles: "Rd Rd" }] },
            { goal: "pair", hand: "1m 2m 3m 5p 5p 5p 7s 8s 9s E E E Rd Rd", what: "the pair", say: "Fourteen tiles: four sets and a pair. Tap the two tiles that are the pair.", then: "The red dragons: every other tile is in a set of three. Making that is the aim." },
          ],
        },
        {
          id: "tiles", title: "The tiles", zh: "牌",
          steps: [
            { rows: [{ label: "Characters 萬", tiles: "1m 2m 3m 4m 5m 6m 7m 8m 9m" }, { label: "Dots 筒", tiles: "1p 2p 3p 4p 5p 6p 7p 8p 9p" }, { label: "Bamboo 索", tiles: "1s 2s 3s 4s 5s 6s 7s 8s 9s" }], say: "Three suits of nine, four of each tile: 108." },
            { goal: "tiles", pred: "suit:1", what: "a dot", hand: "3m 7p Gd 2p 5s 9p N", say: "Tap the dots (筒).", then: "Three of them." },
            { rows: [{ label: "Winds 東南西北", tiles: "E S W N" }, { label: "Dragons 中發白", tiles: "Rd Gd Wd" }, { label: "Flowers and seasons", tiles: "F1 F2 F3 F4 F5 F6 F7 F8" }], say: "Honours: the four winds and the three dragons, four of each, 28 tiles. They make pungs and pairs but never runs. With the eight flowers and seasons, one of each, the set is 144." },
            { goal: "tiles", pred: "dragon", what: "a dragon", hand: "Rd 4p E Gd 8s Wd N", say: "Tap the dragons.", then: "Red, green and white." },
            { goal: "tiles", pred: "own", what: "yours", hand: "F1 F2 F3 F4 F5 F6 F7 F8", dealer: 2, say: "Flowers aren't played: drawn, they are set aside and replaced. Each seat has its own flower and season, East the first of each, South the second, West the third, North the fourth, and yours is worth a fan. The dealer is the player across, so you sit West. Tap your flower and your season.", then: "The chrysanthemum and autumn. Seven flowers shown win at once; eight pay the limit." },
            { rows: [{ label: "Suits", text: "108" }, { label: "Honours", text: "28" }, { label: "Flowers", text: "8" }], quiz: ["136", "144", "152"], answer: 1, say: "How many tiles are there, with the flowers?", why: "108 suit tiles, 28 honours and 8 flowers.", check: () => String(deal0().wall.length) },
          ],
        },
        {
          id: "deal", title: "The deal, the winds", zh: "起牌",
          steps: [
            { rows: [{ label: "Dealer: East 東", text: "14 tiles" }, { label: "The others", text: "13 tiles" }], say: "One player deals and sits as East (東); the others are South, West and North in the order of play, which goes to the right. The dealer starts with fourteen tiles, the others thirteen; flowers in the deal are set out and replaced from the end of the wall." },
            { rows: [{ label: "Dealer: East 東", text: "14 tiles" }, { label: "The others", text: "13 tiles" }], quiz: ["13", "14", "16"], answer: 1, say: "How many tiles does the dealer start with?", why: "Fourteen: the first draw is already in the hand, so the dealer begins with a tile to throw.", check: () => String(deal0().seats[0].hand.length) },
            { rows: [{ label: "The dealer", text: "the player across" }], quiz: ["East", "South", "West", "North"], answer: 2, say: "The dealer, East, is the player across from you. Which wind are you?", why: "The deal goes to the right: East, then South, then West: you are third.", check: () => E.WIND_NAMES[E.windOf(deal0({ dealer: 2 }), 0)] },
            { rows: [{ label: "A flower dealt", text: "set aside" }], quiz: ["The front of the wall", "The end of the wall", "A neighbour's hand"], answer: 1, say: "A flower is set aside. Where does its replacement come from?", why: "From the end of the wall; the front is where ordinary draws come from.", check: () => { const d = deal0({ seed: 5 }), n = d.seats.flatMap(s => s.flowers).length; return n > 0 && d.tail === d.wall.length - n ? "The end of the wall" : "?"; } },
          ],
        },
        {
          id: "turn", title: "A turn", zh: "出牌",
          steps: [
            { goal: "discard", crit: "ready", hand: "1m 2m 3m 4p 5p 6p 7s 8s 9s Wd Wd 4m 5m", draw: "N", why: "That breaks a set or the pair.", say: "A turn is a draw and a throw. You've drawn the north wind (set apart on the right). Without it the hand is a tile short of complete: throw the tile that keeps it so. Tap it.", then: "The north wind connects to nothing. Now a 3 or a 6 of characters would finish the hand." },
            { rows: [{ label: "After your throw", text: "13 tiles again" }], quiz: ["12", "13", "14"], answer: 1, say: "How many tiles are in your hand when your turn is over?", why: "You drew to fourteen and threw one: thirteen, always, unless you've made a kong (a replacement is drawn for it).", check: () => { const s = sceneOf({ hand: "1m 2m 3m 4p 5p 6p 7s 8s 9s Wd Wd 4m 5m", draw: "N" }); E.act(s, 0, { t: "discard", k: tilesOf("N")[0] }); return String(s.seats[0].hand.length); } },
          ],
        },
      ],
    },
    {
      id: "play", title: "Playing a hand", zh: "打牌",
      lessons: [
        {
          id: "chow", title: "Chow", zh: "上",
          steps: [
            { goal: "set", want: "chow", hand: "2m 3m 4m 5m 5m 5m Wd Wd 1p 3p 7s 8s E", what: "a chow", say: "A chow (上) is three in a row in one suit: never a wind or dragon, never round the corner (8-9-1). Tap three tiles that make a chow.", then: "A run of three." },
            { goal: "claim", answer: "Chow", hand: "4p 6p 2m 3m 7m 8m 9m E E Wd 2s 5s 8s", discard: "5p", from: 3, opts: ["Pass", "Chow"], say: "A thrown tile can be taken to complete a set. A chow may be taken from one player only: the one before you, whose throw comes just ahead of your turn. The player on your left throws the 5 of dots; you hold the 4 and the 6. Take it.", then: "4-5-6 of dots, face up. You then throw a tile." },
            { goal: "claim", answer: "Pass", hand: "4p 6p 2m 3m 7m 8m 9m E E Wd 2s 5s 8s", discard: "5p", from: 2, opts: ["Pass", "Chow"], say: "The same tile, thrown by the player across. Try the chow.", then: "Pass: that tile would be a chow for the player on the right, not for you." },
          ],
        },
        {
          id: "pung", title: "Pung and kong", zh: "碰槓",
          steps: [
            { goal: "set", want: "pung", hand: "2m 3m 4m 5m 5m 5m Wd Wd 1p 3p 7s 8s E", what: "a pung", say: "A pung (碰) is three of a kind. Tap one.", then: "Three 5s of characters." },
            { goal: "claim", answer: "Pung", hand: "7s 7s 2m 3m 4m 5p 6p 3s 4s 8p 8p 9m 9m", discard: "7s", from: 1, opts: ["Pass", "Chow", "Pung"], say: "A pung may be taken from anyone's throw. The player on your right throws the 7 of bamboo; you hold two.", then: "A pung, face up. You throw next." },
            { goal: "claim", answer: "Kong", hand: "7s 7s 7s 2m 3m 4m 5p 6p 3s 4s 8p 9m 9m", discard: "7s", from: 2, opts: ["Pass", "Pung", "Kong"], not: { Pung: "You can, but you hold three: the kong is a set as well, and draws you a free tile." }, say: "A kong (槓) is four of a kind. You hold three 7s and the player across throws the fourth.", then: "A kong, and you draw a replacement from the end of the wall before you throw." },
            { rows: [{ label: "Four alike in your hand", text: "a concealed kong" }], quiz: ["Nothing: it is only a pung with a spare", "A replacement from the end of the wall", "The turn passes at once"], answer: 1, say: "You draw the fourth of a tile you hold three of. You may lay them down as a concealed kong. What do you get?", why: "A replacement from the end of the wall, then you throw.", check: () => { const s = sceneOf({ hand: "4m 4m 4m 2p 3p 4p 5p 6p 7p 3s 4s 8s 8s", draw: "4m" }), t0 = s.tail; E.act(s, 0, { t: "kong", k: tilesOf("4m")[0], how: "concealed" }); return s.tail === t0 - 1 ? "A replacement from the end of the wall" : "?"; } },
          ],
        },
        {
          id: "order", title: "Whose is the tile?", zh: "先後",
          steps: [
            { rows: [{ label: "First", text: "a win" }, { label: "then", text: "a pung or kong" }, { label: "last", text: "a chow" }], say: "Several players may want a thrown tile. A win beats a pung or kong, which beats a chow. Of two who could win, the first after the thrower takes it (the head bump)." },
            { goal: "taker", hand: "4p 6p 2m 3m 7m 8m 9m E E Wd 2s 5s 8s", discard: "5p", from: 3, others: { 2: "5p 5p 1m 2m 3m 7s 8s 9s E S W N Rd" }, claims: { 0: { t: "chow", k: tilesOf("4p")[0] }, 2: { t: "pung", k: tilesOf("5p")[0] } }, opts: ["You", "The player across"], say: "The player on your left throws the 5 of dots. You'd chow it with your 4 and 6; the player across holds a pair of 5s and calls a pung. Who gets the tile?", then: "The player across: a pung comes before a chow." },
            { goal: "taker", hand: "1m 2m 3m 4p 5p 6p 7s 8s 9s E E Wd Wd", discard: "9m", from: 0, others: { 1: "2m 2m 2m 5p 5p 5p 8s 8s 8s Rd Rd Rd 9m", 3: "3m 3m 3m 6p 6p 6p 9s 9s 9s Gd Gd Gd 9m" }, claims: { 1: { t: "win" }, 3: { t: "win" } }, opts: ["The player on your right", "The player on your left"], throwLabel: "You throw", say: "You throw the 9 of characters. The players on your right and on your left are both waiting for it, and both would win. Who wins?", then: "The player on your right: the first after the thrower. The other's win is bumped." },
          ],
        },
        {
          id: "win", title: "Winning hands", zh: "糊牌",
          steps: [
            { rows: [{ label: "Complete", tiles: "1m 2m 3m 4p 5p 6p 7s 8s 9s Wd Wd 4m 5m 6m" }], say: "Four sets and a pair complete the hand; it then wins if it is worth enough (the next chapter). One tile short of complete you are ready (聽), and the tiles that would finish it are your waits." },
            { goal: "waits", hand: "1m 2m 3m 4p 5p 6p 7s 8s 9s Wd Wd 4m 5m", cands: "3m 6m 2m 7m 5p Wd", say: "Three sets, a pair, and 4 and 5 of characters side by side. Tap every tile that would complete the hand.", then: "The 3 and the 6 of characters: a two-sided wait, the widest there is." },
            { goal: "waits", hand: "1m 2m 3m 4p 5p 6p 7s 8s 9s E E 4m 6m", cands: "3m 4m 5m 6m 7m E", say: "Now the pair of neighbours has a gap: the 4 and the 6. Tap every tile that completes the hand.", then: "Only the 5: a gap waits on one tile. The east wind would make a pung and leave the 4 and the 6 with no pair." },
          ],
        },
      ],
    },
    {
      id: "score", title: "Scoring", zh: "計番",
      lessons: [
        {
          id: "minimum", title: "Three fan to win", zh: "三番起糊",
          steps: [
            { rows: [{ label: "To win", text: "at least 3 fan" }], say: "A complete hand isn't a win until it earns three fan (番): points for its pattern and for how it was won. A hand with fewer isn't offered the Win button." },
            { goal: "claim", answer: "Pass", ...SHUT_CHOW, flowers: "F2", opts: ["Pass", "Win"], say: "Four runs and a pair, and the 9 of bamboo would finish it. But the hand is only runs and the flower you hold isn't yours. Try Win.", then: "All chows (1) and a concealed hand (1) is two fan: pass, and wait for a better tile or a self-drawn one.", proves: () => fanAt({ ...SHUT_CHOW, flowers: "F2" }) === 2 },
            { goal: "claim", answer: "Win", ...RED_PUNG, opts: ["Pass", "Win"], say: "A pung of red dragons in the hand, no flowers, nothing called. The player across throws the 5 of characters.", then: "Three fan: the dragon pung (1), no flowers (1) and a concealed hand (1).", proves: () => fanAt(RED_PUNG) === 3 },
          ],
        },
        {
          id: "fan", title: "Counting fan", zh: "番",
          steps: [
            { rows: [{ label: "Self-drawn 自摸", text: "1" }, { label: "Concealed 門前清", text: "1" }, { label: "No flowers 無花", text: "1" }, { label: "Own flower or season 正花", text: "1 each" }, { label: "All four flowers (or seasons)", text: "2" }, { label: "Dragon pung, seat wind, round wind", text: "1 each" }, { label: "All chows 平糊", text: "1" }], say: "The small fan: how you won and what you hold. The Rules button has the whole table; the game's referee counts it all." },
            { goal: "fan", ...ALL_CHOWS, opts: [2, 3, 4, 5], say: "You draw the 8 of bamboo and win. All runs, nothing called, no flowers. How many fan?", then: "Self-drawn, concealed, no flowers and all chows." },
            { goal: "fan", hand: "E E E 2m 3m 4m 5p 6p 7p 8s 8s 4s 5s", draw: "6s", opts: [3, 4, 5, 6], say: "You're the dealer, East, in the East round. A pung of east winds in the hand, and the 6 of bamboo comes. How many fan?", then: "The pung counts twice: it is your seat's wind and the round's." },
            { goal: "fan", ...ALL_CHOWS, flowers: "F1 F2 F3 F4", opts: [3, 4, 5, 6], say: "The same hand, but you've collected all four flowers on the way. How many fan?", then: "All four flowers are worth two (your own among them doesn't count again), and the fan for having none is gone." },
          ],
        },
        {
          id: "big", title: "Big hands", zh: "大牌",
          steps: [
            { goal: "fan", ...FOUR_PUNGS, opts: [3, 4, 5, 6], say: "Four pungs and a pair (對對糊) are worth 3. This one wins on a thrown 7 of characters, nothing called. How many fan?", then: "All pungs (3), no flowers (1) and a concealed hand (1)." },
            { goal: "fan", hand: "1m 2m 3m 4m 5m 6m 7m 8m 9m Rd Rd 4m 5m", discard: "3m", from: 1, opts: [4, 5, 6, 7], say: "One suit and honours is a half flush (混一色), worth 3. The player on your right throws the 3 of characters.", then: "A half flush (3), all chows (1), no flowers (1) and a concealed hand (1)." },
            { goal: "fan", hand: "Rd Rd Rd Gd Gd Gd Wd 2m 3m 4m 5p 6p 7p", discard: "Wd", from: 2, opts: [5, 6, 7, 8], say: "Two dragon pungs and a pair of the third (小三元) are worth 5. A thrown white dragon finishes this one.", then: "Little three dragons (5), no flowers (1) and a concealed hand (1): the dragon pungs aren't counted again." },
            { rows: [{ label: "Full flush 7 + chows 1 + self-drawn 1", text: "+ concealed 1 + no flowers 1" }], quiz: ["11", "10", "13"], answer: 1, say: "A full flush (清一色), one suit only, is worth 7. This one is self-drawn, concealed, with no flowers and all runs: 11 on the count. What does it pay?", why: "Ten: the most a hand pays. Limit hands (thirteen orphans, all honours, four kongs…) pay it at once, whatever else they hold.", check: () => String(fanAt(FLUSH)) },
          ],
        },
        {
          id: "pay", title: "Paying", zh: "賠",
          steps: [
            { rows: [{ label: "Fan", text: "1 2 3 4 5 6 7 8 9 10" }, { label: "Base", text: "2 4 8 16 24 32 48 64 96 128" }, { label: "Off a thrown tile", text: "the thrower pays 4 × base" }, { label: "Self-drawn", text: "each of the three pays 2 × base" }], say: "Half spicy: the base doubles for each fan up to four, then for every two fan (24, 32, 48, 64, 96, 128 at five to ten). The thrower of the winning tile pays all of it; a self-drawn win is paid by all three." },
            { goal: "pay", ...FOUR_PUNGS, opts: [48, 96, 144, 192], say: "The four pungs again, five fan, off the player across: the base is 24. What do you win?", then: "All from the thrower." },
            { goal: "pay", ...ALL_CHOWS, opts: [48, 96, 144, 192], say: "Four fan, self-drawn: the base is 16. What do you win from the three?", then: "Each pays 2 bases. Self-drawn, the three together pay half again what a thrower would." },
          ],
        },
        {
          id: "kongs", title: "Kongs and the last tile", zh: "槓",
          steps: [
            { goal: "claim", answer: "Win", ...ROBBED, opts: ["Pass", "Win"], say: "The player across adds a fourth 8 of bamboo to the pung they called. That kong tile is one of yours: you're waiting on the 5 or the 8 of bamboo. Rob it.", then: "Robbing a kong (搶槓) is worth a fan, and the player who added it pays. Only a kong added to a called pung can be robbed.", proves: () => fanAt(ROBBED) === 4 },
            { rows: [{ label: "Win on a kong's replacement 槓上開花", text: "1 fan" }, { label: "Win on the last tile 海底撈月", text: "1 fan" }], quiz: WORDS, answer: 1, say: "The tile you draw to replace a kong completes your hand. How many fan does that add?", why: "One, as does winning on the last tile of the wall (or on its last throw).", check: () => WORDS[fanAt({ ...ALL_CHOWS, flags: { afterKong: true } }) - fanAt(ALL_CHOWS)] },
          ],
        },
        {
          id: "block", title: "Liability and next deal", zh: "包",
          steps: [
            { goal: "claim", answer: "Pass", ...RED_PUNG, block: true, opts: ["Pass", "Win"], say: "You passed on a win a moment ago (糊一唔糊二) and haven't drawn since. Now the tile comes that would win. Try Win.", then: "A win you pass bars you from winning off a throw until you draw again." },
            { rows: [{ label: "Their sets down", text: "three; a fourth makes it" }], quiz: ["Nothing", "The whole of their self-drawn win", "Half"], answer: 1, say: "A player has three sets down and you throw the tile that gives them a fourth. If they then win by drawing, what do you pay?", why: "All of it (包): the three would have paid 2 bases each, you pay 6. The same holds for the tile that makes a third dragon set.", check: () => { const s = sceneOf({ hand: "1m 2m 3m", discard: "3p", from: 0, others: { 1: "3p 3p 8s 8s" }, othersMelds: { 1: ["p:1m", "p:5s", "c:7p"] } }); E.act(s, 1, { t: "pung", k: tilesOf("3p")[0] }); return s.liable[1] === 0 ? "The whole of their self-drawn win" : "?"; } },
            { rows: [{ label: "The dealer wins, or the hand is drawn", text: "keeps the deal" }, { label: "Anyone else wins", text: "the deal moves on" }], quiz: ["The next player", "The same dealer", "Whoever drew first"], answer: 1, say: "The dealer wins the hand. Who deals next?", why: "The dealer keeps the deal after a win or a drawn hand; otherwise it passes to the right, and the round's wind turns once it has been round.", check: () => { const s = deal0(); s.result = { kind: "win", seat: s.dealer }; const n = E.nextHand(s, { seed: 1, firstDealer: 0 }); return n.dealer === s.dealer ? "The same dealer" : "?"; } },
          ],
        },
      ],
    },
    {
      id: "well", title: "A little strategy", zh: "策略",
      lessons: [
        {
          id: "shape", title: "Tiles that connect", zh: "牌形",
          steps: [
            { goal: "discard", crit: "shanten", ...LONE_HONOURS, why: "That breaks a run you've made, or the pair of neighbours. Throw a loner.", say: "Efficiency decides the first half of a hand. You hold three runs and the 5 and 7 of characters, which a 6 would join; the 9 of bamboo, the north wind and the green dragon connect to nothing. Throw the tile that costs you least.", then: "A loner: nothing you draw makes much of it. Honours with no pair go first, then the ends of the suits." },
            { goal: "discard", crit: "waits", hand: "2m 3m 4m 6p 7p 8p 3s 4s 5s Wd Wd 5m 6m 8m", why: "Another throw leaves a narrower wait.", say: "Ready is not enough: the more tiles that win, the sooner you win. Throw one of the 5, 6 and 8 of characters to be ready on as many tiles as you can.", then: "The 8: you wait on the 1, 4 and 7 of characters, eleven tiles in all. Either of the others leaves a single wait, the 7, with four." },
          ],
        },
        {
          id: "safe", title: "Safe discards", zh: "安全牌",
          steps: [
            { goal: "discard", crit: "safe", hand: "2m 3m 4m 6p 7p 8p 3s 4s 5s Gd 5m 6m 9s", draw: "W", seen: "W W W", why: "Someone might use that.", say: "Everyone watches your throws for a win, and nobody gets to say pass for you. A tile is certainly safe only if nobody can use it. Three west winds are out on the table and you hold the fourth. You must throw something: which tile can't help anyone?", then: "The west wind: nobody holds another, so nobody has a pair of it to finish with. (Every suited tile can complete a run, and a thirteen-orphans hand, rare, would wait on any honour.)" },
            { goal: "pay", ...DRAGON_TABLE, opts: [64, 96, 128, 192], say: "The player on your right has a pung of red dragons and one of green down. This is their table. If you threw them the white dragon, how much would you pay?", then: "Little three dragons is 5 and they hold no flowers: 6 fan, base 32. Two dragon pungs down: keep the third dragon back." },
          ],
        },
        {
          id: "call", title: "When to call a tile", zh: "食碰",
          steps: [
            { goal: "claim", answer: "Pass", hand: "2m 3m 5p 6p 7p 3s 4s 5s 7s 8s 5m 5m 9p", discard: "4m", from: 3, opts: ["Pass", "Chow"], not: { Chow: "You can, but check what a call costs." }, say: "A call shows your sets to everyone and costs the fan for a concealed hand. The player on your left throws the 4 of characters and you hold the 2 and the 3. The rest of the hand is all runs.", then: "Pass. Kept shut, this hand wins on a thrown tile with three fan (chows, concealed, no flowers); called, it has two, and only a self-draw reaches three.", proves: () => fanAt(SHUT_CHOW) === 3 && fanAt(OPEN_CHOW) === 2 },
            { goal: "claim", answer: "Pung", hand: "E E 2m 3m 5p 6p 7p 3s 4s 5s 9s 9s N", discard: "E", from: 2, opts: ["Pass", "Pung"], say: "You're East in the East round. The player across throws an east wind and you hold two.", then: "Pung: the east wind is your seat's wind and the round's, two fan in one set, and the hand then wins on a thrown tile.", proves: () => fanAt(DOUBLE_WIND) === 3 },
          ],
        },
        {
          id: "first", title: "A first game", zh: "開局",
          steps: [{ say: "That is the game. Play a game against the computer players; the Menu's coach will comment on your throws if you ask it to.", play: true }],
        },
      ],
    },
  ],
};
