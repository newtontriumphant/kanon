<script>
  import { onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { initAudio, getTuningData, setThreshold, setA4, setDoubleStopMode } from './lib/audioEngine.js';


  let started = false;
  let errorMsg = null;
  let tuningData = [];
  let canvas;
  let ctx;
  let threshold = -60;
  let sensitivity = 10;
  let a4Freq = 440;
  let doubleStopMode = true;
  let maxHistory = 300;
  let history1 = [];
  let history2 = [];


  $: if (started) {
    setThreshold(threshold);
    setA4(a4Freq);
    setDoubleStopMode(doubleStopMode);
  }


  onMount(() => {
    maxHistory = window.innerWidth < 768 ? 150 : 300;
    history1 = Array(maxHistory).fill(null);
    history2 = Array(maxHistory).fill(null);
    generateBackground();
    start();
  });


  function generateBackground() {
    if (typeof document === 'undefined') return;
    const notes = ['♩', '♫'];
    const accidentals = ['♭', '♮', '♯'];
    const clefs = ['𝄞', '𝄢', '𝄡'];
    let svgStrs = [];
    for(let i=0; i<6; i++) {
      const cy = i * 140 + 50;
      const opacity = (Math.random() * 0.2 + 0.15).toFixed(2);
      svgStrs.push(`<g transform="translate(0, ${cy})">`);
      
      for(let j=0; j<5; j++) {
        const yOffset = j * 12;
        svgStrs.push(`<line x1="0" y1="${yOffset}" x2="1200" y2="${yOffset}" stroke="rgba(167, 243, 208, ${opacity})" stroke-width="2"/>`);
      }


      const clef = clefs[Math.floor(Math.random() * clefs.length)];
      let clefFontSize = 70;
      let clefY = 42;
      if (clef === '𝄞') {
        clefFontSize = 85;
        clefY = 46;
      }
      svgStrs.push(`<text x="15" y="${clefY}" font-size="${clefFontSize}" fill="rgba(167, 243, 208, ${opacity})" font-family="sans-serif">${clef}</text>`);


      const measureWidth = 300;
      for(let m=1; m<4; m++) {
        const measureX = m * measureWidth;
        svgStrs.push(`<line x1="${measureX}" y1="0" x2="${measureX}" y2="48" stroke="rgba(167, 243, 208, ${opacity})" stroke-width="2"/>`);
      }


      const yPositions = [0, 6, 12, 18, 24, 30, 36, 42, 48];
      for(let m=0; m<4; m++) {
        const beats = 4;
        for(let b=0; b<beats; b++) {
          let x;
          if (m === 0) {
            const startX = 110;
            const availableWidth = measureWidth - startX;
            const spacing = availableWidth / beats;
            x = startX + (spacing / 2) + b * spacing;
          } else {
            const startX = m * measureWidth;
            const spacing = measureWidth / beats;
            x = startX + (spacing / 2) + b * spacing;
          }
          const yPos = yPositions[Math.floor(Math.random() * yPositions.length)];
          const symbol = notes[Math.floor(Math.random() * notes.length)];
          const hasFermata = Math.random() > 0.9;
          const hasAccidental = Math.random() > 0.7;
          const noteSize = 45;


          const isStemDown = yPos <= 24;
          svgStrs.push(`<g transform="translate(${x}, ${yPos})">`);
          if (hasAccidental) {
            const acc = accidentals[Math.floor(Math.random() * accidentals.length)];
            svgStrs.push(`<text x="-24" y="6" font-size="28" fill="rgba(167, 243, 208, ${opacity})" font-family="sans-serif" text-anchor="middle">${acc}</text>`);
          }


          const noteTransform = isStemDown ? ` transform="rotate(180)"` : "";
          svgStrs.push(`<text x="0" y="6" font-size="${noteSize}" fill="rgba(167, 243, 208, ${opacity})" font-family="sans-serif" text-anchor="middle"${noteTransform}>${symbol}</text>`);
          if (hasFermata) {
            if (isStemDown) {
              svgStrs.push(`<text x="0" y="-16" font-size="35" fill="rgba(167, 243, 208, ${opacity})" font-family="sans-serif" text-anchor="middle">𝄐</text>`);
            } else {
              svgStrs.push(`<text x="0" y="28" font-size="35" fill="rgba(167, 243, 208, ${opacity})" font-family="sans-serif" text-anchor="middle" transform="rotate(180, 0, 18)">𝄐</text>`);
            }
          }
          svgStrs.push(`</g>`);
        }
      }
      svgStrs.push(`</g>`);
    }
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'>${svgStrs.join('')}</svg>`;
    const bgSvgUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    document.body.style.backgroundImage = `url("${bgSvgUrl}")`;
    document.body.style.backgroundSize = "1200px 800px";
  }

  async function start() {
    try {
      await initAudio();
      started = true;
      await tick();
      setupCanvas();
      window.addEventListener('resize', setupCanvas);
      requestAnimationFrame(update);
    } catch (e) {
      errorMsg = "mic denied or not available RAH";
    }
  }

  function setupCanvas() {
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const newMax = window.innerWidth < 768 ? 150 : 300;
    if (newMax !== maxHistory) {
      maxHistory = newMax;
      while (history1.length > maxHistory) history1.shift();
      while (history2.length > maxHistory) history2.shift();
      while (history1.length < maxHistory) history1.unshift(null);
      while (history2.length < maxHistory) history2.unshift(null);
    }
  }

  function update() {
    if (!started) return;
    tuningData = getTuningData();

    if (tuningData.length > 0) {
      history1.shift();
      history2.shift();

      history1.push(tuningData[0] ? tuningData[0].cents : null);
      history2.push(tuningData[1] ? tuningData[1].cents : null);
    }

    drawCanvas();
    requestAnimationFrame(update);
  }

  function getColor(cents) {
    if (cents === null || cents === undefined) return 'transparent';
    const a = Math.abs(cents);
    if (a <= sensitivity) return '#22c55e';
    if (a <= sensitivity + 10) return '#eab308';
    return '#ef4444';
  }

  function drawCanvas() {
    if (!ctx || !canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#e5e7eb';

    const staffYs = [0.1, 0.3, 0.5, 0.7, 0.9]
    staffYs.forEach((pct, idx) => {
      ctx.beginPath();
      if (idx === 2) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 10]);
      } else {
        ctx.strokeStyle = idx % 2 === 0 ? '#9ca3af' : '#e5e7eb';
        ctx.lineWidth = idx % 2 === 0 ? 2 : 1;
        ctx.setLineDash([]);
      }
      ctx.moveTo(0, height * pct);
      ctx.lineTo(width, height * pct);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    // the next bit of code is ai-assisted
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    const yTop = height / 2 - (sensitivity / 25) * (height / 2.5);
    const yBottom = height / 2 - (-sensitivity / 25) * (height / 2.5);
    ctx.moveTo(0, yTop); ctx.lineTo(width, yTop);
    ctx.moveTo(0, yBottom); ctx.lineTo(width, yBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    
    const step = width / (maxHistory - 1);
    
    const drawLine = (hist) => {
      const smoothedHist = [];
      const WINDOW = 5;
      for (let i = 0; i < hist.length; i++) {
        if (hist[i] === null) {
          smoothedHist.push(null);
        } else {
          let sum = 0;
          let count = 0;
          for (let j = Math.max(0, i - WINDOW); j <= i; j++) {
            if (hist[j] !== null) { sum += hist[j]; count++; }
          }
          smoothedHist.push(count > 0 ? sum / count : hist[i]);
        }
      }

      let segments = [];
      let currentSegment = [];
      for (let i = 0; i < smoothedHist.length; i++) {
        if (smoothedHist[i] !== null) {
          const x = i * step;
          const y = height / 2 - (smoothedHist[i] / 25) * (height / 2.5);
          currentSegment.push({x, y, val: smoothedHist[i]});
        } else {
          if (currentSegment.length > 0) { segments.push(currentSegment); currentSegment = []; }
        }
      }
      if (currentSegment.length > 0) segments.push(currentSegment);

      segments.forEach(segment => {
        if (segment.length === 1) return;
        
        if (segment.length === 2) {
          ctx.beginPath();
          ctx.strokeStyle = getColor(segment[1].val);
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(segment[0].x, segment[0].y);
          ctx.lineTo(segment[1].x, segment[1].y);
          ctx.stroke();
        } else {
          for (let i = 1; i < segment.length - 1; i++) {
            ctx.beginPath();
            ctx.strokeStyle = getColor(segment[i].val);
            ctx.lineWidth = 8;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            const x0 = (segment[i-1].x + segment[i].x) / 2;
            const y0 = (segment[i-1].y + segment[i].y) / 2;
            const x1 = (segment[i].x + segment[i+1].x) / 2;
            const y1 = (segment[i].y + segment[i+1].y) / 2;
            
            const startX = (i === 1) ? segment[0].x : x0;
            const startY = (i === 1) ? segment[0].y : y0;
            const endX = (i === segment.length - 2) ? segment[segment.length-1].x : x1;
            const endY = (i === segment.length - 2) ? segment[segment.length-1].y : y1;
            
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(segment[i].x, segment[i].y, endX, endY);
            ctx.stroke();
          }
        }
      });
      
      const lastVal = smoothedHist[smoothedHist.length - 1];
      if (lastVal !== null && lastVal !== undefined) {
        const x = (smoothedHist.length - 1) * step;
        const y = height / 2 - (lastVal / 25) * (height / 2.5);
        ctx.beginPath();
        ctx.fillStyle = getColor(lastVal);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    };
    
    drawLine(history1);
    drawLine(history2);
  }

  function playDemo() {
    alert("demo mode coming soon! [insert yt link here]");
  }

  $: note1 = tuningData[0];
  $: note2 = tuningData[1];
</script>

<svelte:head>
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
</svelte:head>



<main id="app">
  <header class="animate-drop" style="animation-delay: 0.1s">
    <div class="zunable-badge">kanōn</div>
    <button class="demo-btn brutal-box" on:click={playDemo}>
      no instrument on hand?! click me! :3
    </button>
  </header>

  {#if errorMsg}
    <div class="state-box error-box brutal-box animate-drop" style="animation-delay: 0.2s">
      <h2>ERROR: {errorMsg}</h2>
      <p>make sure mic access is allowed and refresh!</p>
    </div>
  {:else if !started}
    <div class="state-box loading-box brutal-box animate-drop" style="animation-delay: 0.2s">
      <h2>please allow mic access if prompted!!</h2>
    </div>
  {:else}
    <div class="main-display brutal-box animate-drop" style="animation-delay: 0.2s">
      
      <div class="graph-container">
        <div class="graph-label sharp">+25c</div>
        <div class="graph-label perfect">perfect!</div>
        <div class="graph-label flat">-25c</div>
        <canvas bind:this={canvas} class="history-graph"></canvas>
      </div>

      <div class="notes-wrapper">
        <div class="note-row" id="note-1-container">
          {#if note1}
            <div class="note-label" style="color: {getColor(note1.cents)}">note one</div>
            <div class="note-display">
              <span class="note-name">{note1.noteName}</span>
              <span class="octave">{note1.octave}</span>
              {#if Math.abs(note1.cents) > 0.5}
                <span class="tune-arrow" style="color: {getColor(note1.cents)}">
                  {note1.cents > 0 ? '▲' : '▼'}
                </span>
              {/if}
            </div>
            <div class="freq-cents">
              <span>{note1.frequency.toFixed(2)} Hz</span> |
              <span class="cents-val" style="color: {getColor(note1.cents)}">
                {note1.cents > 0 ? '+' : ''}{note1.cents.toFixed(1)} c
              </span>
            </div>
          {:else}
            <div class="note-label">listening...</div>
            <div class="note-display"><span class="note-name">--</span></div>
            <div class="freq-cents"><span>0.00 Hz</span> | <span>0c</span></div>
          {/if}
        </div>

        {#if note2}
          <div class="note-row" id="note-2-container" transition:fade={{duration:250}}>
            <div class="note-label" style="color: {getColor(note2.cents)}">note two</div>
            <div class="note-display">
              <span class="note-name">{note2.noteName}</span>
              <span class="octave">{note2.octave}</span>
              {#if Math.abs(note2.cents) > 0.5}
                <span class="tune-arrow" style="color: {getColor(note2.cents)}">
                  {note2.cents > 0 ? '▲' : '▼'}
                </span>
              {/if}
            </div>
            <div class="freq-cents">
              <span>{note2.frequency.toFixed(2)} Hz</span> |
              <span class="cents-val" style="color: {getColor(note2.cents)}">
                {note2.cents > 0 ? '+' : ''}{note2.cents.toFixed(1)} c
              </span>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="controls brutal-box-small animate-drop" style="animation-delay: 0.3s">
      <div class="slider-row toggle-row">
        <button class="mode-toggle {doubleStopMode ? '' : 'active'}" on:click={() => doubleStopMode = false}>single notes!</button>
        <button class="mode-toggle {doubleStopMode ? 'active' : ''}" on:click={() => doubleStopMode = true}>double stops!</button>
      </div>
      <div class="slider-row">
        <label>
          noise threshold [ {threshold}dB ]
          <input type="range" bind:value={threshold} min="-90" max="-30" step="1">
        </label>
      </div>
      <div class="slider-row">
        <label>
          pitch sensitivity [ +/-{sensitivity.toFixed(1)}c ]
          <input type="range" bind:value={sensitivity} min="0" max="20" step="0.1">
        </label>
      </div>
      <div class="slider-row">
        <label>
          a4 tuning [ {a4Freq} Hz ]
          <input type="range" bind:value={a4Freq} min="430" max="450" step="1">
        </label>
      </div>
    </div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #ecfdf5;
    color: #000;
    font-family: 'Space Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  #app {
    max-width: 900px;
    width: 100%;
    box-sizing: border-box;
    margin: 40px auto;
    padding: 20px;
  }

  header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-bottom: 50px;
  }

  .zunable-badge {
    font-weight: 900;
    background: rgba(167, 243, 208, 0.8);
    backdrop-filter: blur(4px);
    color: #000;
    display: inline-block;
    padding: 15px 30px;
    margin: 0 0 20px 0;
    font-size: clamp(2rem, 8vw, 4rem);
    letter-spacing: 4px;
    text-transform: uppercase;
    border: 4px solid #000;
    box-shadow: 8px 8px 0px 0px rgba(0,0,0,1);
  }

  .demo-btn {
    margin-top: 20px;
    padding: 15px 20px;
    font-family: inherit;
    font-weight: 700;
    font-size: clamp(0.8rem, 2.5vw, 1.1rem);
    cursor: pointer;
    background: #fef08a; /* Yellowish brutal background */
    border: 4px solid #000;
    box-shadow: 6px 6px 0px 0px rgba(0,0,0,1);
    transition: all 0.1s ease;
    text-transform: uppercase;
    display: block; /* ensure margins apply */
    margin-bottom: 0; /* Clear bottom margin to prevent override */
  }

  .demo-btn:hover {
    transform: translate(-4px, -4px);
    box-shadow: 10px 10px 0px 0px rgba(0,0,0,1);
    background: #fde047;
  }

  .demo-btn:active {
    transform: translate(4px, 4px);
    box-shadow: 2px 2px 0px 0px rgba(0,0,0,1);
  }

  @keyframes dropIn {
    0% {
      opacity: 0;
      transform: translateY(-30px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-drop {
    opacity: 0; /* Starts hidden */
    animation: dropIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  }

  .state-box {
    text-align: center;
    padding: 60px 20px;
  }

  .state-box h2 {
    font-size: 2.5rem;
    margin: 0 0 10px 0;
    letter-spacing: -1px;
  }

  .error-box {
    background: #dc2626;
    color: white;
    border-color: #000;
    box-shadow: 8px 8px 0px 0px rgba(220,38,38,1);
  }

  .loading-box {
    background: #000;
    color: white;
  }

  .brutal-box {
    background: white;
    border: 4px solid #000;
    box-shadow: 8px 8px 0px 0px rgba(0,0,0,1);
    margin-bottom: 40px;
    display: flex;
    flex-direction: column;
  }

  .brutal-box-small {
    background: white;
    border: 4px solid #000;
    box-shadow: 8px 8px 0px 0px rgba(0,0,0,1);
    padding: 20px;
    margin-bottom: 30px;
  }

  .slider-row {
    margin-bottom: 20px;
  }
  .slider-row:last-child {
    margin-bottom: 0;
  }

  .toggle-row {
    display: flex;
    gap: 15px;
  }

  .mode-toggle {
    flex: 1;
    padding: 12px 10px;
    font-family: inherit;
    font-weight: 700;
    font-size: clamp(0.9rem, 3vw, 1.2rem);
    cursor: pointer;
    background: #fff;
    border: 4px solid #000;
    box-shadow: 4px 4px 0px 0px rgba(0,0,0,1);
    transition: all 0.1s ease;
    text-transform: uppercase;
  }

  .mode-toggle.active {
    background: #a7f3d0;
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0px 0px rgba(0,0,0,1);
  }

  .mode-toggle:not(.active):hover {
    background: #f1f5f9;
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0px 0px rgba(0,0,0,1);
  }

  .controls label {
    display: block;
    font-weight: 700;
    font-size: 1.2rem;
  }

  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    margin-top: 15px;
    background: transparent;
    height: 20px;
  }

  input[type="range"]:focus {
    outline: none;
  }

  input[type="range"]::-webkit-slider-runnable-track {
    width: 100%;
    height: 12px;
    cursor: pointer;
    background: #fff;
    border: 3px solid #000;
    box-shadow: 3px 3px 0px #000;
  }

  input[type="range"]::-moz-range-track {
    width: 100%;
    height: 12px;
    cursor: pointer;
    background: #fff;
    border: 3px solid #000;
    box-shadow: 3px 3px 0px #000;
  }

  input[type="range"]::-webkit-slider-thumb {
    height: 28px;
    width: 20px;
    border-radius: 0;
    background: #a7f3d0;
    border: 3px solid #000;
    cursor: pointer;
    -webkit-appearance: none;
    margin-top: -11px;
    box-shadow: 3px 3px 0px #000;
  }

  input[type="range"]::-moz-range-thumb {
    height: 28px;
    width: 20px;
    border-radius: 0;
    background: #a7f3d0;
    border: 3px solid #000;
    cursor: pointer;
    box-shadow: 3px 3px 0px #000;
  }

  .graph-container {
    height: 250px;
    width: 100%;
    border-bottom: 4px solid #000;
    position: relative;
    background: #fff;
  }

  .history-graph {
    width: 100%;
    height: 100%;
    display: block;
  }

  .graph-label {
    position: absolute;
    left: 10px;
    font-weight: 700;
    font-size: 0.9rem;
    padding: 2px 6px;
    border: 2px solid #000;
    background: white;
    z-index: 10;
    box-shadow: 4px 4px 0px 0px rgba(0,0,0,1);
  }

  .graph-label.sharp { top: 10px; color: #ef4444; }
  .graph-label.perfect { top: 50%; transform: translateY(-50%); color: #22c55e; }
  .graph-label.flat { bottom: 10px; color: #eab308; }

  .notes-wrapper {
    padding: clamp(20px, 5vw, 40px);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    min-height: clamp(350px, 40vh, 500px);
    justify-content: center;
    gap: 30px;
    position: relative;
  }

  .note-row {
    position: relative;
    width: 100%;
    max-width: 400px;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    align-items: center;
    background: white;
    z-index: 2;
    padding: 30px 20px;
    box-sizing: border-box;
  }

  .note-label {
    font-weight: 700;
    font-size: 1.5rem;
    margin-bottom: 5px;
  }

  .note-display {
    font-size: clamp(5rem, 15vw, 8rem);
    font-weight: 700;
    line-height: 1.2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    position: relative;
  }

  .tune-arrow {
    font-size: clamp(2rem, 8vw, 3rem);
    margin-left: 10px;
    font-weight: 900;
    line-height: 1;
    display: inline-block;
    transform: translateY(-5px);
  }

  .note-name {
    letter-spacing: -5px;
  }

  .octave {
    font-size: clamp(2rem, 8vw, 3.5rem);
    color: #000;
  }

  .freq-cents {
    font-size: clamp(1.2rem, 4vw, 1.5rem);
    font-weight: 700;
    margin: 10px 0;
  }

  .cents-val {
    font-size: clamp(1.5rem, 5vw, 2rem);
  }
</style>