// Isolated visual prototype: no game rules, sockets, guest storage or production changes.
const CARD_BASE = "../cards/";
const glyphs = { CLUBS: "♣", DIAMONDS: "♦", HEARTS: "♥", SPADES: "♠" };
const rankOrder = ["ACE", "KING", "QUEEN", "JACK", "TEN", "NINE", "EIGHT", "SEVEN"];
const hand = [
  ["SPADES", "ACE"], ["HEARTS", "KING"], ["DIAMONDS", "QUEEN"], ["CLUBS", "JACK"],
  ["SPADES", "TEN"], ["HEARTS", "NINE"], ["DIAMONDS", "EIGHT"], ["CLUBS", "SEVEN"],
].sort((a, b) => rankOrder.indexOf(a[1]) - rankOrder.indexOf(b[1]));
const cardImage = (suit, rank) => `<img src="${CARD_BASE}${suit}-${rank}.svg" alt="${rank} ${suit}" draggable="false">`;
const suitImage = suit => `<img class="suit" src="${CARD_BASE}${suit}.svg" alt="${glyphs[suit]}" draggable="false">`;
const menuIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`;
const coachIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8L12 3Z"/></svg>`;
const players = `<div class="player player-north"><div class="avatar">Д</div><div class="identity"><div class="player-name">Давид</div><span class="player-role">Партнёр</span></div><span class="first-lead"><b>1</b>Первый ход</span></div><div class="player player-west"><div class="avatar">Н</div><div class="player-name">Нарек</div><span class="player-role">Соперник</span></div><div class="player player-east"><div class="avatar">М</div><div class="player-name">Мариам</div><span class="player-role">Соперник</span></div>`;
function scoreboard(bidding) {
  return `<div class="score" aria-label="Счёт команд"><table><thead><tr><th></th><th>Мы</th><th>Они</th></tr></thead><tbody><tr><th>Партия</th><td>112</td><td>86</td></tr><tr class="live"><th>Раздача</th><td>${bidding ? 0 : 43}</td><td>${bidding ? 0 : 28}</td></tr></tbody></table><div class="score-meta"><span>До 301</span><span>Очки карт</span></div></div>`;
}
function cards(bidding, proof) {
  const cards = proof ? hand.filter(c => c[1] !== "TEN") : hand;
  return `<div class="hand" aria-label="Карты по рангу от туза до семёрки" style="--count:${cards.length}">${cards.map(([suit, rank], index) => {
    const available = bidding || (proof ? suit === "CLUBS" && rank === "JACK" : suit === "SPADES");
    const middle = (cards.length - 1) / 2;
    return `<button class="hand-card ${available ? "" : "unavailable"} ${suit === "CLUBS" ? "trump" : ""}" style="--index:${index};--angle:${(index - middle) * 1.6};--curve:${Math.abs(index - middle) * 1.2}" ${!available || bidding ? "disabled" : ""} aria-label="${rank} ${glyphs[suit]}${suit === "CLUBS" ? ", козырь" : ""}">${cardImage(suit, rank)}</button>`;
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
  return `<figure class="scene ${scene.id === "play" ? "active" : ""} ${scene.id === "landscape" ? "scene-landscape" : ""}" data-scene="${scene.id}"><figcaption>${scene.title}</figcaption><div class="board ${scene.bidding ? "bid-board" : ""} ${proof ? "proof-board" : ""}"><div class="felt-oval"></div>${scoreboard(scene.bidding)}<button class="corner-menu" aria-label="Меню партии">${menuIcon}</button><div class="contract"><span>Козырь</span><strong>${suitImage("CLUBS")}</strong><small>Раздача ${scene.bidding ? 5 : 4}</small></div>${players}<div class="back-hand">${Array.from({ length: scene.bidding ? 8 : 7 }, () => '<span class="card-back"></span>').join("")}</div><span class="brand-watermark">Բ</span>${scene.bidding ? bidPanel() : `<div class="trick" aria-label="Карты сыграны со стороны игроков">${trick.map(([seat, suit, rank]) => `<div class="table-card" data-seat="${seat}">${cardImage(suit, rank)}</div>`).join("")}</div>${announcements}<div class="previous-trick"><span>Последняя взятка</span><div>${[["SPADES", "JACK"], ["CLUBS", "EIGHT"], ["DIAMONDS", "NINE"], ["HEARTS", "QUEEN"]].map(([suit, rank]) => cardImage(suit, rank)).join("")}</div></div>`}<button class="notice-tray"><span>Объявления</span><span class="count">0</span></button><button class="coach">${coachIcon}Тренер</button><div class="turn">${scene.bidding ? "Ваша очередь в торговле" : "Ваш ход"}</div>${cards(scene.bidding, proof)}<div class="archive-popover" hidden><button class="close" aria-label="Закрыть объявления">×</button><h3>Объявления раздачи</h3><div class="archive-items"></div></div></div></figure>`;
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
  function update() { panel.querySelector("output").textContent = amount; panel.querySelector(".submit-bid").textContent = `Заявить ${amount}`; }
  panel.querySelector(".increase").addEventListener("click", () => { amount++; update(); });
  panel.querySelector(".decrease").addEventListener("click", () => { amount = Math.max(16, amount - 1); update(); });
  panel.querySelectorAll("[data-suit]").forEach(button => button.addEventListener("click", () => panel.querySelectorAll("[data-suit]").forEach(b => b.classList.toggle("selected", b === button))));
  panel.querySelector(".caput").addEventListener("click", event => { const button = event.currentTarget; const pressed = button.getAttribute("aria-pressed") !== "true"; button.setAttribute("aria-pressed", pressed); if (pressed) amount = Math.max(26, amount); update(); });
});
function fitLandscape() { document.documentElement.style.setProperty("--landscape-scale", Math.min(390, innerWidth) / 844); document.documentElement.style.setProperty("--focus-landscape-scale", Math.min(844, innerWidth - (innerWidth > 600 ? 32 : 0)) / 844); }
addEventListener("resize", fitLandscape); fitLandscape(); renderArchive();
