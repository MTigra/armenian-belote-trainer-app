import { useEffect, useState } from "react";
const read = () =>
  typeof window === "undefined" || window.innerHeight >= window.innerWidth
    ? "portrait"
    : "landscape";
export function useOrientation() {
  const [orientation, setOrientation] = useState(read);
  useEffect(() => {
    const resize = () => setOrientation(read());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return orientation;
}
