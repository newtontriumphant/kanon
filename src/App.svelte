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
    alert("Demo mode coming soon! We will simulate a double stop here.");
  }

  $: note1 = tuningData[0];
  $: note2 = tuningData[1];
</script>

<svelte:head>
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
</svelte:head>

<main id="app">
  <header>
    <h1>kanōn polyphonic tuner :3</h1>
    <button on:click={playDemo}>Play Demo</button>
  </header>
</main>

<style>

</style>