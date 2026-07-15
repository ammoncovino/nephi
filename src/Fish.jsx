const FIN_PATH = `
  M74 -90
  Q52 -75 74 -60 Q52 -45 74 -30 Q52 -15 74 0
  Q52 15 74 30 Q52 45 74 60 Q52 75 74 90
  Q52 105 74 120 Q52 135 74 150 Q52 165 74 180
  Q52 195 74 210 Q52 225 74 240 Q52 255 74 270
  Q52 285 74 300 Q52 315 74 330 Q52 345 74 360
  Q52 375 74 390 Q52 405 74 420 Q52 435 74 450
  Q52 465 74 480 Q52 495 74 510 Q52 525 74 540
  Q52 555 74 570 Q52 585 74 600 Q52 615 74 630
  Q52 645 74 660 Q52 675 74 690 Q52 705 74 720
  L92 720 L92 -90 Z`;

// ribbon body outline, reused for the base fill and the depth overlay
const BODY_PATH = `M80 18
  C96 18 104 32 104 54
  C104 88 102 150 99 220
  C96 330 93 440 90 530
  C89 585 88 625 87 656
  L75 656
  C73 615 71 560 70 500
  C68 400 66 280 66 195
  C66 120 66 68 69 44
  C71 26 74 18 80 18 Z`;

/**
 * The animated oarfish. Position/idle-bob is driven imperatively from the
 * scroll effect via the forwarded ref; the fin/crest/oar undulations are
 * pure CSS keyframes keyed off the class names.
 */
export default function Fish({ fishRef }) {
  return (
    <div className="fish" id="fish" aria-hidden="true" ref={fishRef}>
      <svg viewBox="-14 -22 176 706" width="100%" height="100%" overflow="visible" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="obody" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4c5a68" />
            <stop offset="0.42" stopColor="#e3ecf3" />
            <stop offset="0.75" stopColor="#93a7b8" />
            <stop offset="1" stopColor="#3e4a57" />
          </linearGradient>
          <linearGradient id="odepth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="0.5" stopColor="#000000" stopOpacity="0" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {/* head crest: long streamers sweeping back over the head */}
        <g className="crest">
          <path className="cray" d="M78 26 C68 10 48 -2 20 -6" fill="none" stroke="#d84457" strokeWidth="2.6" strokeLinecap="round" />
          <ellipse cx="20" cy="-6" rx="5.5" ry="3" fill="#d84457" transform="rotate(-18 20 -6)" />
          <path className="cray c2" d="M83 24 C79 6 66 -8 46 -14" fill="none" stroke="#d84457" strokeWidth="2.4" strokeLinecap="round" />
          <ellipse cx="46" cy="-14" rx="4.6" ry="2.6" fill="#d84457" transform="rotate(-22 46 -14)" />
          <path className="cray c3" d="M89 24 C90 6 84 -8 70 -16" fill="none" stroke="#d84457" strokeWidth="2.2" strokeLinecap="round" />
          <ellipse cx="70" cy="-16" rx="4" ry="2.3" fill="#d84457" transform="rotate(-30 70 -16)" />
        </g>
        {/* pelvic "oar" streamers */}
        <g>
          <path className="oar" d="M72 104 C56 150 42 220 34 310" fill="none" stroke="#d84457" strokeWidth="2.4" strokeLinecap="round" />
          <ellipse className="oar-tip" cx="34" cy="312" rx="4.6" ry="8.5" fill="#d84457" transform="rotate(-12 34 312)" />
          <path className="oar o2" d="M76 110 C66 170 56 260 50 350" fill="none" stroke="#b03848" strokeWidth="2" strokeLinecap="round" />
          <ellipse className="oar-tip" cx="50" cy="352" rx="4" ry="7" fill="#b03848" transform="rotate(-8 50 352)" />
        </g>
        {/* continuous dorsal fin: denser periodic frill scrolling behind a
            clip, so the undulation travels down the whole fin */}
        <clipPath id="finclip">
          <polygon points="40,26 76,20 84,652 48,648" />
        </clipPath>
        <g clipPath="url(#finclip)">
          <path className="fin-run" fill="#c73e52" opacity="0.9" d={FIN_PATH} />
        </g>
        {/* ribbon body: thick, laterally compressed, blunt head up top */}
        <path d={BODY_PATH} fill="url(#obody)" opacity="0.97" />
        <path d={BODY_PATH} fill="url(#odepth)" />
        {/* dark flank blotches */}
        <ellipse cx="86" cy="160" rx="5.5" ry="3" fill="#26292c" opacity="0.32" />
        <ellipse cx="83" cy="250" rx="4.6" ry="2.6" fill="#26292c" opacity="0.28" />
        <ellipse cx="84" cy="345" rx="5" ry="2.6" fill="#26292c" opacity="0.26" />
        <ellipse cx="81" cy="440" rx="4" ry="2.3" fill="#26292c" opacity="0.26" />
        <ellipse cx="81" cy="530" rx="3.6" ry="2" fill="#26292c" opacity="0.22" />
        {/* lateral line */}
        <path d="M88 80 C87 220 83 430 81 645" stroke="#3c4854" strokeWidth="1.2" fill="none" opacity="0.45" />
        {/* face: modest eye set into the head, subtle mouth */}
        <circle cx="90" cy="46" r="4" fill="#11161b" />
        <circle cx="91.4" cy="44.6" r="1.2" fill="#dfe9f1" />
        <path d="M103 58 Q99 60 96 59" stroke="#31404d" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
