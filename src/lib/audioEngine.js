export let A4 = 440.0;

export function setA4(val) {
    A4 = val;
}

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const INTERVAL_NAMES = [
    "UNISON", "MINOR 2ND", "MAJOR 2ND", "MINOR 3RD", "MAJOR 3RD", 
    "PERFECT 4TH", "TRITONE", "PERFECT 5TH", "MINOR 6TH", "MAJOR 6TH", 
    "MINOR 7TH", "MAJOR 7TH", "OCTAVE"
];
export const FFT_SIZE = 16384;
let audioCtx, analyser, dataArray;
let isRunning = false;
export let noiseThreshold = -60;
let isDoubleStopMode = true;

const PYTHAGOREAN_OFFSETS = [ // google my savior <3
    -5.865,
    7.82,
    -1.955,
    -11.73,
    1.955,
    -7.82,
    5.865,
    -3.91,
    9.775,
    0,
    -9.775,
    3.91
];

export function setThreshold(val) {
    noiseThreshold = val;
}

export function setDoubleStopMode(val) {
    isDoubleStopMode = val;
}

export async function initAudio() {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
    });
    audioCtx = new (window.AudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.1;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    window.__kanon_stream = stream;
    window.__kanon_source = source;
    dataArray = new Float32Array(analyser.frequencyBinCount);
    isRunning = true;
}

export async function resumeAudio() {
    if (!audioCtx) return;

    // iOS suspends the context
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    const stream = window.__kanon_stream;
    if (stream) {
        const allTracksLive = stream.getTracks().every(t => t.readyState === 'live');
        if (!allTracksLive) {
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
            });
            if (window.__kanon_source) {
                window.__kanon_source.disconnect();
            }
            const newSource = audioCtx.createMediaStreamSource(newStream);
            newSource.connect(analyser);
            window.__kanon_stream = newStream;
            window.__kanon_source = newSource;
        }
    }

    isRunning = true;
}

export function freqToNoteInfo(frequency) {
    if (frequency <= 0) return null;
    const midiNote = 69 + 12 * Math.log2(frequency / A4);
    const roundedMidi = Math.round(midiNote);
    const noteIndex = (roundedMidi % 12 + 12) % 12;

    const targetOffset = isDoubleStopMode ? PYTHAGOREAN_OFFSETS[noteIndex] : 0;
    const cents = (midiNote - roundedMidi) * 100 - targetOffset;

    return {
        frequency,
        noteName: NOTE_NAMES[noteIndex],
        octave: Math.floor(roundedMidi / 12) - 1,
        cents,
        midiNote: roundedMidi
    };
}

export function getIntervalName(midi1, midi2) {
    const diff = Math.abs(midi1 - midi2);
    if (diff <= 12) return INTERVAL_NAMES[diff];

    const base = diff % 12;
    const octaves = Math.floor(diff / 12);
    if (base === 0) return octaves + " OCTAVES!";
    return INTERVAL_NAMES[base] + " + " + octaves + " 8VA";
}

function getPeaks(data, sampleRate, fftSize) {
    const peaks = [];
    const binSize = sampleRate / fftSize;
    const startBin = Math.floor(50 / binSize); // ignore frequencies below 50Hz
    const endBin = Math.floor(5000 / binSize); // ignore frequencies above 5kHz

    for (let i = startBin; i < endBin; i++) {
        if (data[i] > noiseThreshold && data[i] > data[i-1] && data[i] > data[i+1]) {
            const alpha = data[i-1], beta = data[i], gamma = data[i+1];
            const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
            peaks.push({ frequency: (i + p) * binSize, magnitude: beta });
        }
    }
    return peaks.sort((a, b) => b.magnitude - a.magnitude);
}

function filterHarmonics(peaks) {
    let fundamentals = [];
    peaks.sort((a, b) => b.magnitude - a.magnitude);

    for (const peak of peaks) {
        let isLeakage = false;
        let isHarmonic = false;
        let isSubharmonic = false;
        let parentIndex = -1;
        let ratioToParent = 0;

        for (let i = 0; i < fundamentals.length; i++) {
            const fund = fundamentals[i];

            if (Math.abs(peak.frequency - fund.frequency) / fund.frequency < 0.04) {
                isLeakage = true;
                break;
            }

            const ratio = peak.frequency / fund.frequency;
            if (ratio > 1.9 && Math.abs(ratio - Math.round(ratio)) < 0.08) {
                isHarmonic = true;
                parentIndex = i;
                ratioToParent = Math.round(ratio);
                break;
            }
            
            const subRatio = fund.frequency / peak.frequency;
            if (subRatio > 1.9 && Math.abs(subRatio - Math.round(subRatio)) < 0.08) {
                isSubharmonic = true;
                parentIndex = i;
                ratioToParent = Math.round(subRatio);
                break;
            }
        }

        if (isLeakage) continue;

        const HARMONIC_TOLERANCE_DB = isDoubleStopMode ? 35 : 6;
        const ABSOLUTE_MIN_DB = noiseThreshold + (isDoubleStopMode ? 8 : 25);

        if (isHarmonic) {
            const fund = fundamentals[parentIndex];

            if (peak.magnitude > fund.magnitude - HARMONIC_TOLERANCE_DB && peak.magnitude > ABSOLUTE_MIN_DB) {
                fundamentals.push(peak);
            }
            continue;
        }

        if (isSubharmonic) {
            const fund = fundamentals[parentIndex];
            if (peak.magnitude > fund.magnitude - 40) {
                if (fund.magnitude > peak.magnitude - HARMONIC_TOLERANCE_DB && fund.magnitude > ABSOLUTE_MIN_DB) {
                    fundamentals.push(peak);
                } else {
                    fundamentals[parentIndex] = peak;
                }
            }
            continue;
        }

        fundamentals.push(peak); //repush to avoid globbing harmonics together
    }

    return fundamentals.slice(0, isDoubleStopMode ? 2 : 1).sort((a, b) => a.frequency - b.frequency); // sort by frequency
}

const SPELLINGS = [
    [{ name: 'C', letter: 0 }],
    [{ name: 'C#', letter: 0 }, { name: 'Db', letter: 1 }],
    [{ name: 'D', letter: 1 }],
    [{ name: 'D#', letter: 1 }, { name: 'Eb', letter: 2 }],
    [{ name: 'E', letter: 2 }],
    [{ name: 'F', letter: 3 }],
    [{ name: 'F#', letter: 3 }, { name: 'Gb', letter: 4 }],
    [{ name: 'G', letter: 4 }],
    [{ name: 'G#', letter: 4 }, { name: 'Ab', letter: 5 }],
    [{ name: 'A', letter: 5 }],
    [{ name: 'A#', letter: 5 }, { name: 'Bb', letter: 6 }],
    [{ name: 'B', letter: 6 }]
]; //map to numerals

const IDEAL_LETTER_DIST = {
    0: [0], 1: [1], 2: [1], 3: [2], 4: [2], 5: [3],
    6: [3, 4], 7: [4], 8: [5], 9: [5], 10: [6], 11: [6]
}; // C C# D D# E F F# G G# A A# B :3

function applyContextualSpelling(notes) {
    if (notes.length === 1) {
        const noteClass = (notes[0].midiNote % 12 + 12) % 12;
        notes[0].noteName = SPELLINGS[noteClass][0].name;
    } else if (notes.length === 2) {
        let n1 = notes[0], n2 = notes[1];
        let class1 = (n1.midiNote % 12 + 12) % 12;
        let class2 = (n2.midiNote % 12 + 12) % 12;
        let semiDist = (class2 - class1 + 12) % 12;
        
        let bestScore = -Infinity;
        let bestS1 = SPELLINGS[class1][0];
        let bestS2 = SPELLINGS[class2][0];
        
        for (let s1 of SPELLINGS[class1]) {
            for (let s2 of SPELLINGS[class2]) {
                let score = 0;
                let letterDist = (s2.letter - s1.letter + 7) % 7;
                
                if (IDEAL_LETTER_DIST[semiDist].includes(letterDist)) score += 10;
                
                let acc1 = s1.name.includes('#') ? '#' : s1.name.includes('b') ? 'b' : 'n';
                let acc2 = s2.name.includes('#') ? '#' : s2.name.includes('b') ? 'b' : 'n';
                
                if (acc1 === acc2 && acc1 !== 'n') score += 3;
                else if (acc1 === 'n' && acc2 === 'n') score += 2;
                else if (acc1 === 'n' || acc2 === 'n') score += 1;
                else if (acc1 !== acc2) score -= 5;
                
                if (score > bestScore) {
                    bestScore = score; bestS1 = s1; bestS2 = s2;
                }
            }
        }
        n1.noteName = bestS1.name;
        n2.noteName = bestS2.name;
    }
    return notes;
}

let prevFreqs = [];

export function getTuningData() {
    if (!isRunning || !analyser) return []; // safety check
    analyser.getFloatFrequencyData(dataArray);
    const fundamentals = filterHarmonics(getPeaks(dataArray, audioCtx.sampleRate, FFT_SIZE));

    const smoothedFundamentals = fundamentals.map((f, i) => {
        let smoothFreq = f.frequency;
        if (prevFreqs[i] && Math.abs(prevFreqs[i] - f.frequency) < 15) {
            const freqDelta = Math.abs(prevFreqs[i] - f.frequency);
            const relativeChange = freqDelta / prevFreqs[i];
            const adaptiveFactor = Math.min(0.7, Math.max(0.05, 1 - Math.exp(-relativeChange * 200)));
            smoothFreq = prevFreqs[i] * (1 - adaptiveFactor) + f.frequency * adaptiveFactor;
        }
        prevFreqs[i] = smoothFreq;
        return { frequency: smoothFreq, magnitude: f.magnitude };
    });

    if (smoothedFundamentals.length < prevFreqs.length) {
        prevFreqs = prevFreqs.slice(0, smoothedFundamentals.length);
    }

    const notes = smoothedFundamentals.map(f => freqToNoteInfo(f.frequency)).filter(n => n !== null);
    return applyContextualSpelling(notes);
}