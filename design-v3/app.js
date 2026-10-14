// Isolated visual prototype: no game rules, sockets, guest storage or production changes.
const CARD_BASE = "../cards/";
const glyphs = { CLUBS: "♣", DIAMONDS: "♦", HEARTS: "♥", SPADES: "♠" };
const suitOrder = ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"];
const trumpRanks = ["JACK", "NINE", "ACE", "TEN", "KING", "QUEEN", "EIGHT", "SEVEN"];
const plainRanks = ["ACE", "TEN", "KING", "QUEEN", "JACK", "NINE", "EIGHT", "SEVEN"];
const hand = [
  ["SPADES", "QUEEN"], ["CLUBS", "ACE"], ["SPADES", "KING"], ["CLUBS", "JACK"],
  ["SPADES", "TEN"], ["CLUBS", "NINE"], ["SPADES", "ACE"], ["CLUBS", "TEN"],
];
function sortHand(source, trump) {
  return [...source].sort(([suitA, rankA], [suitB, rankB]) => {
    const suits = suitOrder.indexOf(suitA) - suitOrder.indexOf(suitB);
    if (suits) return suits;
    const ranks = suitA === trump ? trumpRanks : plainRanks;
    return ranks.indexOf(rankA) - ranks.indexOf(rankB);
  });
}
const cardImage = (suit, rank) => `<img src="${CARD_BASE}${suit}-${rank}.svg" alt="${rank} ${suit}" draggable="false">`;
const suitImage = suit => `<img class="suit" src="${CARD_BASE}${suit}.svg" alt="${glyphs[suit]}" draggable="false">`;
const menuIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`;
const coachIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8L12 3Z"/></svg>`;
function avatar(letter, seat) {
  return `<div class="avatar-shell" data-seat="${seat}"><svg class="player-clock" viewBox="0 0 58 58" aria-label="Оставшееся время хода"><circle class="clock-track" cx="29" cy="29" r="27"/><circle class="clock-ring" cx="29" cy="29" r="27" transform="rotate(-90 29 29)"/></svg><div class="avatar">${letter}</div><span class="clock-count">37</span></div>`;
}
const players = `<div class="player player-north">${avatar("Д", "NORTH")}<div class="identity"><div class="player-name">Давид</div><span class="player-role">Партнёр</span></div><span class="first-lead"><b>1</b>Первый ход</span></div><div class="player player-west">${avatar("Н", "WEST")}<div class="player-name">Нарек</div><span class="player-role">Соперник</span></div><div class="player player-east">${avatar("М", "EAST")}<div class="player-name">Мариам</div><span class="player-role">Соперник</span></div>`;
function scoreboard(bidding) {
  return `<div class="score" aria-label="Счёт команд"><table><thead><tr><th></th><th>Мы</th><th>Они</th></tr></thead><tbody><tr><th>Партия</th><td>112</td><td>86</td></tr><tr class="live"><th>Раздача</th><td>${bidding ? 0 : 43}</td><td>${bidding ? 0 : 28}</td></tr></tbody></table><div class="score-meta"><span>До 301</span><span>Очки карт</span></div></div>`;
}
function cards(bidding, proof, trump = "CLUBS") {
  const cards = sortHand(proof ? hand.filter(([suit, rank]) => !(suit === "SPADES" && rank === "TEN")) : hand, trump);
  return `<div class="hand" aria-label="Карты по мастям, внутри масти — по силе в блоте" style="--count:${cards.length}">${cards.map(([suit, rank], index) => {
    const available = bidding || (proof ? suit === "CLUBS" && rank === "JACK" : suit === "SPADES");
    const middle = (cards.length - 1) / 2;
    return `<button class="hand-card ${available ? "" : "unavailable"} ${suit === trump ? "trump" : ""}" style="--index:${index};--angle:${(index - middle) * 1.6};--curve:${Math.abs(index - middle) * 1.2}" ${!available || bidding ? "disabled" : ""} aria-label="${rank} ${glyphs[suit]}${suit === trump ? ", козырь" : ""}">${cardImage(suit, rank)}</button>`;
  }).join("")}</div>`;
}
function bidPanel() {
  return `<div class="bid-panel" aria-label="Торговля по центру стола"><div class="current-offer"><span>Заявка Давида</span><b>15 <span class="suit-chip">${suitImage("CLUBS")}</span></b></div><div class="bid-amount"><div class="amount-control"><button class="decrease" aria-label="Уменьшить заявку">−</button><output>16</output><button class="increase" aria-label="Увеличить заявку">+</button></div><button class="caput" aria-pressed="false">Капут</button></div><div class="bid-suits" aria-label="Выбор масти или боя">${["CLUBS", "DIAMONDS", "HEARTS", "SPADES"].map(suit => `<button data-suit="${suit}" class="${suit === "CLUBS" ? "selected" : ""}">${suitImage(suit)}</button>`).join("")}<button data-suit="BOI">Бой</button></div><div class="bid-actions"><button class="pass">Пас</button><button class="double">Контра</button><button class="submit-bid">Заявить 16</button></div></div>`;
}
const scenes = [
  { id: "play", title: "Розыгрыш · недоступные карты темнее, козыри выделены" },
  { id: "proof", title: "Показ комбинации · сообщение возле игрока" },
  { id: "bid", title: "Торговля · панель в центре, счёт остаётся виден", bidding: true },
  { id: "landscape", title: "Торговля в горизонтальной ориентации · та же центральная панель", bidding: true },
];
document.querySelector("#scenes").innerHTML = scenes.map(scene => {
  const proof = scene.id === "proof";
  const trick = proof ? [["WEST", "CLUBS", "QUEEN"], ["NORTH", "SPADES", "SEVEN"], ["EAST", "DIAMONDS", "TEN"]] : [["NORTH", "SPADES", "NINE"], ["EAST", "HEARTS", "SEVEN"], ["WEST", "CLUBS", "KING"]];
  const announcements = scene.bidding ? "" : `<div class="speech speech-north ${proof ? "proof" : ""}" data-static-notice><strong>Терц</strong><small>${proof ? "Давид показывает комбинацию" : "Давид · 20 очков карт"}</small>${proof ? `<div class="proof-cards">${["SEVEN", "EIGHT", "NINE"].map(rank => cardImage("SPADES", rank)).join("")}</div>` : ""}</div><div class="speech speech-west is-blot" data-static-notice><strong>${proof ? "Реблот" : "Блот"}</strong><small>${proof ? "Нарек · +20 очков карт" : "Нарек"}</small></div>`;
  return `<figure class="scene ${scene.id === "play" ? "active" : ""} ${scene.id === "landscape" ? "scene-landscape" : ""}" data-scene="${scene.id}"><figcaption>${scene.title}</figcaption><div class="board ${scene.bidding ? "bid-board" : ""} ${proof ? "proof-board" : ""}"><div class="felt-oval"></div>${scoreboard(scene.bidding)}<button class="corner-menu" aria-label="Меню партии">${menuIcon}</button><div class="contract"><span>Козырь</span><strong>${suitImage("CLUBS")}</strong><small>Раздача ${scene.bidding ? 5 : 4}</small></div>${players}<div class="back-hand">${Array.from({ length: scene.bidding ? 8 : 7 }, () => '<span class="card-back"></span>').join("")}</div><span class="brand-watermark">Բ</span>${scene.bidding ? bidPanel() : `<div class="trick" aria-label="Карты сыграны со стороны игроков">${trick.map(([seat, suit, rank]) => `<div class="table-card" data-seat="${seat}">${cardImage(suit, rank)}</div>`).join("")}</div>${announcements}<div class="previous-trick"><span>Последняя взятка</span><div>${[["SPADES", "JACK"], ["CLUBS", "EIGHT"], ["DIAMONDS", "NINE"], ["HEARTS", "QUEEN"]].map(([suit, rank]) => cardImage(suit, rank)).join("")}</div></div>`}<button class="notice-tray"><span>Объявления</span><span class="count">0</span></button><button class="coach">${coachIcon}Тренер</button><div class="self-player">${avatar("Т", "SOUTH")}<div><strong>Вы</strong><span class="self-status">${scene.bidding ? "Ваша очередь" : "Ваш ход"}</span></div></div>${cards(scene.bidding, proof)}<div class="archive-popover" hidden><button class="close" aria-label="Закрыть объявления">×</button><h3>Объявления раздачи</h3><div class="archive-items"></div></div></div></figure>`;
}).join("");

const noticeTypes = {
  "Терц": { title: "Терц", detail: "Давид · 20 очков карт", cards: ["SEVEN", "EIGHT", "NINE"] },
  "50": { title: "50", detail: "Давид · четыре карты подряд", cards: ["SEVEN", "EIGHT", "NINE", "TEN"] },
  "100": { title: "100", detail: "Давид · пять карт подряд", cards: ["SEVEN", "EIGHT", "NINE", "TEN", "JACK"] },
  "4 карты": { title: "4 валета", detail: "Давид · 200 очков карт", four: true },
  "Блот": { title: "Блот", detail: "Нарек", blot: true },
  "Реблот": { title: "Реблот", detail: "Нарек · +20 очков карт", blot: true },
};
let stored = [];
const timers = new WeakMap();
function renderArchive() {
  document.querySelectorAll(".archive-items").forEach(element => {
    element.innerHTML = stored.length ? stored.map(item => `<div class="archive-item"><div><strong>${item.title}</strong><small>${item.detail}</small></div>${item.cards ? `<div class="proof-cards">${item.cards.map(rank => cardImage("SPADES", rank)).join("")}</div>` : ""}</div>`).join("") : "<p>Объявлений пока нет.</p>";
  });
  document.querySelectorAll(".scene:not([data-scene='bid']):not([data-scene='landscape']) .notice-tray .count").forEach(element => element.textContent = stored.length);
}
function announce(key) {
  let active = document.querySelector(".scene.active");
  if (!["play", "proof"].includes(active?.dataset.scene)) {
    document.querySelector('.preview-nav button[data-scene="play"]').click();
    active = document.querySelector('.scene[data-scene="play"]');
  }
  active?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const item = noticeTypes[key];
  document.querySelectorAll(".scene[data-scene='play'],.scene[data-scene='proof']").forEach(scene => {
    scene.querySelectorAll("[data-static-notice]").forEach(element => element.hidden = true);
    const board = scene.querySelector(".board");
    board.querySelector(".live-notice")?.remove();
    clearTimeout(timers.get(board));
    const bubble = document.createElement("div");
    bubble.className = `speech live-notice entering ${item.blot ? "speech-west is-blot" : "speech-north"}`;
    bubble.innerHTML = `<strong>${item.title}</strong><small>${item.detail}</small>`;
    board.append(bubble);
    if (!item.blot && scene.dataset.scene === "proof") setTimeout(() => {
      if (!bubble.isConnected) return;
      bubble.classList.add("proof");
      const proofCards = item.four
        ? ["CLUBS", "DIAMONDS", "HEARTS", "SPADES"].map(suit => cardImage(suit, "JACK")).join("")
        : item.cards.map(rank => cardImage("SPADES", rank)).join("");
      bubble.style.minWidth = `${Math.max(186, (item.four ? 4 : item.cards.length) * 42 + 24)}px`;
      bubble.innerHTML = `<strong>${item.title}</strong><small>Давид показывает комбинацию</small><div class="proof-cards">${proofCards}</div>`;
    }, 900);
    // Ordinary announcements publish only a summary; actual proof is a separate second-trick state.
    timers.set(board, setTimeout(() => bubble.classList.add("storing"), 2600));
    setTimeout(() => { if (bubble.isConnected) bubble.remove(); }, 3180);
  });
  setTimeout(() => { stored.push(item); renderArchive(); }, 3180);
}
document.querySelector("#announcement-controls").innerHTML = Object.keys(noticeTypes).map(key => `<button data-notice="${key}">${key}</button>`).join("");
document.querySelectorAll("[data-notice]").forEach(button => button.addEventListener("click", () => announce(button.dataset.notice)));
document.querySelectorAll(".notice-tray").forEach(button => button.addEventListener("click", () => {
  renderArchive(); const popover = button.closest(".board").querySelector(".archive-popover"); popover.hidden = !popover.hidden;
}));
document.querySelectorAll(".archive-popover .close").forEach(button => button.addEventListener("click", () => button.closest(".archive-popover").hidden = true));
document.querySelectorAll(".preview-nav button").forEach(button => button.addEventListener("click", () => {
  document.body.classList.add("focused");
  document.querySelectorAll(".preview-nav button").forEach(b => b.classList.toggle("chosen", b === button));
  document.querySelectorAll(".scene").forEach(scene => scene.classList.toggle("active", scene.dataset.scene === button.dataset.scene));
  if (innerWidth > 600) document.querySelector(`.scene[data-scene='${button.dataset.scene}']`).scrollIntoView({ behavior: "smooth", block: "start" });
}));
document.querySelectorAll(".bid-panel").forEach(panel => {
  let amount = 16;
  let minimum = 16;
  function update() { panel.querySelector("output").textContent = amount; panel.querySelector(".submit-bid").textContent = `Заявить ${amount}`; }
  panel.querySelector(".increase").addEventListener("click", () => { amount++; update(); });
  panel.querySelector(".decrease").addEventListener("click", () => { amount = Math.max(minimum, amount - 1); update(); });
  panel.querySelectorAll("[data-suit]").forEach(button => button.addEventListener("click", () => panel.querySelectorAll("[data-suit]").forEach(b => b.classList.toggle("selected", b === button))));
  panel.querySelector(".caput").addEventListener("click", event => { const button = event.currentTarget; const pressed = button.getAttribute("aria-pressed") !== "true"; button.setAttribute("aria-pressed", pressed); if (pressed) amount = Math.max(26, amount); update(); });
  // A draft suit does not change the current contract or reorder the hand.
  // Submit only applies a visual example; it does not run the game's auction.
  panel.querySelector(".submit-bid").addEventListener("click", () => {
    const suit = panel.querySelector("[data-suit].selected").dataset.suit;
    const trump = suit === "BOI" ? null : suit;
    const symbol = trump ? suitImage(trump) : "Бой";
    panel.querySelector(".current-offer").innerHTML = `<span>Ваша заявка</span><b>${amount} <span class="suit-chip">${symbol}</span></b>`;
    const board = panel.closest(".board");
    board.querySelector(".contract > span").textContent = trump ? "Козырь" : "Контракт";
    board.querySelector(".contract > strong").innerHTML = symbol;
    board.querySelector(".hand").outerHTML = cards(true, false, trump);
    minimum = amount + 1;
    amount = minimum;
    update();
  });
});
function fitLandscape() { document.documentElement.style.setProperty("--landscape-scale", Math.min(390, innerWidth) / 844); document.documentElement.style.setProperty("--focus-landscape-scale", Math.min(844, innerWidth - (innerWidth > 600 ? 32 : 0)) / 844); }
addEventListener("resize", fitLandscape); fitLandscape(); renderArchive();

// Visual countdown only: production will use the server deadline and clock offset.
let secondsLeft = 37;
let timerTotal = 60;
let timerId;
function renderClock() {
  document.querySelectorAll(".avatar-shell").forEach(shell => {
    const active = shell.dataset.seat === "SOUTH";
    shell.dataset.active = active;
    shell.dataset.urgency = secondsLeft <= 3 ? "critical" : secondsLeft <= 10 ? "warning" : "normal";
    shell.querySelector(".clock-count").textContent = secondsLeft;
    const ring = shell.querySelector(".clock-ring");
    ring.style.strokeDasharray = "169.646";
    ring.style.strokeDashoffset = 169.646 * (1 - secondsLeft / timerTotal);
    shell.querySelector(".player-clock").setAttribute("aria-label", `Осталось ${secondsLeft} секунд`);
  });
  document.querySelectorAll(".self-status").forEach(el => el.textContent = secondsLeft ? (el.closest(".bid-board") ? "Ваша очередь" : "Ваш ход") : "Время вышло");
}
function startClock(seconds = 37, total = 60) {
  clearInterval(timerId); secondsLeft = seconds; timerTotal = total; renderClock();
  if (new URLSearchParams(location.search).has("static")) return;
  timerId = setInterval(() => { secondsLeft = Math.max(0, secondsLeft - 1); renderClock(); if (!secondsLeft) clearInterval(timerId); }, 1000);
}
const timerDemo = document.createElement("button");
timerDemo.textContent = "Показать таймер · 10 секунд";
timerDemo.addEventListener("click", () => { startClock(10, 10); document.querySelector(".scene.active")?.scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); });
document.querySelector("#announcement-controls").append(timerDemo);
startClock();
