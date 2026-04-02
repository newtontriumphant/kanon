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
</script>