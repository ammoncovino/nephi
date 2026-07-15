import { useEffect, useRef } from "react";
import Fish from "./Fish.jsx";
import { initBackground } from "./effects/background.js";
import { initFluid } from "./effects/fluid.js";
import { initBoxes } from "./effects/boxes.js";

const FACTS = [
  ["❓", "The mystery", "For most of human history we knew nothing about this animal. Not where it lived, not how it swam, not what it ate. It existed to us only as a rumor with a body count of zero witnesses."],
  ["🌊", "What washed up", "All we ever got were the dead. Every few years an impossible silver ribbon would roll up on some beach — and that was the entire fossil record of our knowledge. The living animal? Never seen."],
  ["📸", "Fifteen people", "In 1996, one came ashore in California so massive it took a whole line of Navy SEALs — around fifteen of them, shoulder to shoulder — just to hold it up for the photo. That picture went around the world. It was still all we had."],
  ["🌀", "So we made up stories", "When you can't explain a 30-foot sea serpent on the sand, you invent one. Sailors' serpent tales, messengers from the sea god's palace in Japanese legend, the “doomsday fish” that surfaces before earthquakes. The myths filled the space where the facts should have been."],
  ["🎥", "Even now", "A living oarfish wasn't filmed in the deep until 2001. A handful of sightings since — that's the whole catalogue. Nearly everything else about it is still a guess."],
];

const PHOTOS = [
  ["https://commons.wikimedia.org/wiki/Special:FilePath/Giant%20Oarfish.jpg?width=900", "A long line of Navy SEALs holding a giant oarfish carcass on a beach", "Coronado, California, 1996. The one it took the whole line of Navy SEALs to hold."],
  ["https://commons.wikimedia.org/wiki/Special:FilePath/Giant%20oarfish%20bermuda%20beach%201860.jpg?width=900", "Illustration of a giant oarfish washed ashore on a Bermuda beach in 1860", "Bermuda, 1860. Reported then as a sea serpent — nobody had a better word for it."],
  ["https://commons.wikimedia.org/wiki/Special:FilePath/Regalecus_glesne.jpg?width=900", "A giant oarfish specimen laid out full length", "Regalecus glesne, laid out flat. The ribbon shape only makes sense once you see the whole thing."],
];

export default function App() {
  const bgRef = useRef(null);
  const fluidRef = useRef(null);
  const fishRef = useRef(null);
  const boxRef = useRef(null);
  const photosRef = useRef(null);
  const chromeRef = useRef(null);

  useEffect(() => {
    // order matters only loosely: the fluid loop polls the boxes updater
    // (guarded), so either init order is safe.
    const stopBg = initBackground(bgRef.current);
    const stopFluid = initFluid({ canvas: fluidRef.current, chrome: chromeRef.current });
    const stopBoxes = initBoxes({ box: boxRef.current, photos: photosRef.current, fish: fishRef.current });
    return () => {
      stopBoxes && stopBoxes();
      stopFluid && stopFluid();
      stopBg && stopBg();
    };
  }, []);

  return (
    <>
      <canvas id="bg" aria-hidden="true" ref={bgRef} />
      <canvas id="fluid" aria-hidden="true" ref={fluidRef} />

      <div className="hero-fallback" aria-hidden="true"><h1>NEPHI</h1></div>
      <h1 className="sr-only">NEPHI</h1>

      <div className="scroll-space" aria-hidden="true" />

      <Fish fishRef={fishRef} />

      <section className="oarfish" id="oarfish" aria-hidden="true" ref={boxRef}>
        <div className="binner">
          <h2>The Giant Oarfish</h2>
          {FACTS.map(([icon, heading, body]) => (
            <div className="fact" key={heading}>
              <h3><span className="fi">{icon}</span>{heading}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="oarfish photos" id="photos" aria-hidden="true" ref={photosRef}>
        <div className="binner">
          <h2>The Ones That Washed Up</h2>
          {PHOTOS.map(([src, alt, caption]) => (
            <figure key={src}>
              <img src={src} alt={alt} />
              <figcaption>{caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div className="chrome" id="chrome" ref={chromeRef}>
        <div className="row">
          <span>NEPHI</span>
          <span>EST. 2026</span>
        </div>
      </div>
    </>
  );
}
