const paths: Record<string, string> = {
  cards: "M8 5h11v15H8z M5 17 3 5l8-2",
  history: "M3 11a9 9 0 1 1 2.5 7 M3 4v7h7 M12 6v6l4 2",
  book: "M12 5v15 M3 4c4-1 7 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 1-3-1-6-2-9-1z",
  spark:
    "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z M20 2v4m-2-2h4",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  back: "M20 12H4m6-6-6 6 6 6",
  close: "m6 6 12 12M6 18 18 6",
  menu: "M5 6h14M5 12h14M5 18h14",
  players: "M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5",
  link: "m10 14 4-4m-6 2-2 2a3 3 0 0 0 4 4l2-2m0-8 2-2a3 3 0 0 1 4 4l-2 2",
  pause: "M9 5v14M15 5v14",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  upload: "M12 17V3m-5 5 5-5 5 5M4 17v4h16v-4",
};
export default function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name] ?? paths.cards} />
    </svg>
  );
}
