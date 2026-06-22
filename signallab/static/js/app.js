// ═══════════════════════════════════════════════════════════════
//  SignalLab — app.js
//  Todos los controles, llamadas API, y renderizado de gráficas
// ═══════════════════════════════════════════════════════════════

'use strict';

const $ = id => document.getElementById(id);
const v = id => $('control-label-text') && $('control-label-text').textContent; // unused

// ─────────────────────────────────────────────
//  CHART REGISTRY
// ─────────────────────────────────────────────
const CHARTS = {};

Chart.defaults.color = '#5A6478';
Chart.defaults.borderColor = '#DEE2E8';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 10;

function chartOpts(xLabel = 'n', yLabel = '', opts = {}) {
  return {
    animation: false,
    responsive: true,
    maintainAspectRatio: true,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${parseFloat(ctx.parsed.y).toFixed(4)}`
        }
      },
      ...opts.plugins
    },
    scales: {
      x: {
        grid: { color: '#F0F2F5', lineWidth: 1 },
        title: { display: !!xLabel, text: xLabel, color: '#8E97A8', font: { size: 10 } },
        ticks: { maxTicksLimit: 12, color: '#8E97A8', font: { size: 9 } },
        ...(opts.xScale || {})
      },
      y: {
        grid: { color: '#F0F2F5', lineWidth: 1 },
        title: { display: !!yLabel, text: yLabel, color: '#8E97A8', font: { size: 10 } },
        ticks: { color: '#8E97A8', font: { size: 9 }, maxTicksLimit: 8 },
        ...(opts.yScale || {})
      }
    },
    ...opts.extra
  };
}

function upsertChart(id, type, data, opts) {
  if (CHARTS[id]) {
    CHARTS[id].data = data;
    if (opts) CHARTS[id].options = opts;
    CHARTS[id].update('none');
    return CHARTS[id];
  }
  CHARTS[id] = new Chart($(id).getContext('2d'), { type, data, options: opts || chartOpts() });
  return CHARTS[id];
}

// ─────────────────────────────────────────────
//  API HELPERS
// ─────────────────────────────────────────────
async function apiPost(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────
//  NAV
// ─────────────────────────────────────────────
function switchTab(id) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $('tab-' + id).classList.add('active');
  event.currentTarget.classList.add('active');

  // lazy init
  if (id === 'dft')         onDFT1();
  if (id === 'convolution') onConvControl();
  if (id === 'sampling')    onSampControl();
  if (id === 'fourier-series') onFSControl();
}

function dftSub(sub, el) {
  ['single', 'composite', 'noise'].forEach(s => {
    const el2 = $('dft-' + s);
    if (el2) el2.style.display = 'none';
  });
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  $('dft-' + sub).style.display = 'block';
  el.classList.add('active');
  if (sub === 'single')    onDFT1();
  if (sub === 'composite') onDFTComposite();
  if (sub === 'noise')     onDFTNoise();
}

// ─────────────────────────────────────────────
//  HELPERS UI
// ─────────────────────────────────────────────
function setVal(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function fmt(v, d = 4) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return parseFloat(v).toFixed(d);
}

function getSlider(id) { return parseFloat($(id).value); }
function getSelect(id) { return $(id).value; }
function getInt(id)    { return parseInt($(id).value); }

// ─────────────────────────────────────────────
//  DOWNSAMPLING for chart performance
// ─────────────────────────────────────────────
function thin(arr, maxPts = 600) {
  if (arr.length <= maxPts) return arr;
  const step = Math.ceil(arr.length / maxPts);
  return arr.filter((_, i) => i % step === 0);
}

function thinPair(labels, data, maxPts = 600) {
  if (labels.length <= maxPts) return { labels, data };
  const step = Math.ceil(labels.length / maxPts);
  return {
    labels: labels.filter((_, i) => i % step === 0),
    data:   data.filter((_, i) => i % step === 0),
  };
}

// ═══════════════════════════════════════════════════════════════
//  SIGNAL GENERATOR
// ═══════════════════════════════════════════════════════════════
async function onSigControl() {
  const type     = getSelect('sig-type');
  const A        = getSlider('sig-A');
  const f        = getSlider('sig-f');
  const phi      = getSlider('sig-phi');
  const dc       = getSlider('sig-dc');
  const fs       = getSlider('sig-fs');
  const dur      = getSlider('sig-dur');
  const decay    = getSlider('sig-decay');
  const duty     = getSlider('sig-duty') / 100;
  const noise    = getSlider('sig-noise') / 100;
  const ntype    = getSelect('sig-noise-type');

  setVal('sig-A-val',     fmt(A, 2));
  setVal('sig-f-val',     fmt(f, 2) + ' Hz');
  setVal('sig-phi-val',   fmt(phi, 0) + '°');
  setVal('sig-dc-val',    fmt(dc, 2));
  setVal('sig-fs-val',    fmt(fs, 0));
  setVal('sig-dur-val',   fmt(dur, 1) + ' s');
  setVal('sig-decay-val', fmt(decay, 2));
  setVal('sig-duty-val',  fmt(duty * 100, 0) + '%');
  setVal('sig-noise-val', fmt(noise * 100, 0) + '%');

  // show/hide advanced controls
  const showDecay = ['damped_sine', 'damped_cosine'].includes(type);
  const showDuty  = type === 'square';
  $('ctrl-decay').style.opacity = showDecay ? '1' : '0.35';
  $('ctrl-duty').style.opacity  = showDuty  ? '1' : '0.35';

  const N = Math.min(Math.floor(fs * dur), 4000);
  const body = {
    signal_type: type, amplitude: A, frequency: f, phase: phi,
    dc_offset: dc, decay, duty_cycle: duty,
    duration: dur, sample_rate: fs, num_points: N,
    noise_level: noise, noise_type: ntype
  };

  try {
    const d = await apiPost('/api/signal', body);

    if (d.is_complex) {
      $('complex-panel').style.display = 'block';
      const { labels: tl, data: yr } = thinPair(d.t.map(v => fmt(v, 3)), d.y_real);
      const { data: yi } = thinPair(d.t.map(v => fmt(v, 3)), d.y_imag);
      upsertChart('sig-complex-chart', 'line', {
        labels: tl,
        datasets: [
          { label: 'Re{x(t)}', data: yr, borderColor: '#1A56C4', borderWidth: 1.5, pointRadius: 0, tension: 0 },
          { label: 'Im{x(t)}', data: yi, borderColor: '#0E7C5A', borderWidth: 1.5, pointRadius: 0, tension: 0, borderDash: [4,3] },
        ]
      }, { ...chartOpts('t (s)', 'x(t)'), plugins: { legend: { display: true, labels: { color: '#5A6478', font: { size: 10 } } } } });
      $('complex-panel').style.display = 'block';

      setVal('m-rms', fmt(d.params.rms)); setVal('m-peak', fmt(d.params.peak));
      setVal('m-mean', fmt(d.params.mean)); setVal('m-energy', fmt(d.params.energy, 4));
      setVal('m-power', '—'); setVal('m-N', d.y_real.length);

      const { labels, data } = thinPair(d.t.map(v => fmt(v, 3)), d.y_real);
      upsertChart('sig-chart', 'line', {
        labels,
        datasets: [{ data, borderColor: '#1A56C4', borderWidth: 1.5, pointRadius: 0, tension: 0 }]
      }, chartOpts('t (s)', 'Re{x(t)}'));
    } else {
      $('complex-panel').style.display = 'none';
      const { labels, data } = thinPair(d.t.map(v => fmt(v, 3)), d.y);
      upsertChart('sig-chart', 'line', {
        labels,
        datasets: [{ data, borderColor: '#1A56C4', borderWidth: 1.5, pointRadius: 0, tension: 0 }]
      }, chartOpts('t (s)', 'x(t)'));

      const p = d.params;
      setVal('m-rms',    fmt(p.rms, 5));
      setVal('m-peak',   fmt(p.peak, 5));
      setVal('m-mean',   fmt(p.mean, 5));
      setVal('m-energy', fmt(p.energy, 5));
      setVal('m-power',  fmt(p.power, 5));
      setVal('m-N',      p.N);
    }
  } catch (e) {
    console.error('Signal error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  SERIES DE FOURIER
// ═══════════════════════════════════════════════════════════════
async function onFSControl() {
  const shape = getSelect('fs-shape');
  const N     = getInt('fs-N');
  const f0    = getSlider('fs-f0');
  const A     = getSlider('fs-A');
  const duty  = getSlider('fs-duty') / 100;

  setVal('fs-N-val',    N);
  setVal('fs-f0-val',   fmt(f0, 1) + ' Hz');
  setVal('fs-A-val',    fmt(A, 1));
  setVal('fs-duty-val', fmt(duty * 100, 0) + '%');

  try {
    const d = await apiPost('/api/fourier-series', {
      signal_type: shape, N_harmonics: N, frequency: f0,
      amplitude: A, duty_cycle: duty, duration: 4 / Math.max(f0, 0.1),
      sample_rate: 2000
    });

    // Time chart
    const { labels: tl, data: yt } = thinPair(d.t.map(v => fmt(v, 4)), d.y_true);
    const { data: ya } = thinPair(d.t.map(v => fmt(v, 4)), d.y_approx);
    upsertChart('fs-time-chart', 'line', {
      labels: tl,
      datasets: [
        { label: 'Señal ideal', data: yt, borderColor: '#DEE2E8', borderWidth: 2, pointRadius: 0, tension: 0 },
        { label: `Serie Fourier (N=${N})`, data: ya, borderColor: '#1A56C4', borderWidth: 1.5, pointRadius: 0, tension: 0.05 },
      ]
    }, { ...chartOpts('t (s)', 'f(t)'), plugins: { legend: { display: true, labels: { color: '#5A6478', boxWidth: 20 } } } });

    // Spectrum
    upsertChart('fs-spectrum-chart', 'bar', {
      labels: d.spectrum.n.map(n => 'n=' + n),
      datasets: [
        { label: '|aₙ|', data: d.spectrum.an.map(Math.abs), backgroundColor: 'rgba(26,86,196,0.6)', borderRadius: 2 },
        { label: '|bₙ|', data: d.spectrum.bn.map(Math.abs), backgroundColor: 'rgba(14,124,90,0.6)', borderRadius: 2 },
      ]
    }, {
      ...chartOpts('Armónico n', 'Amplitud'),
      plugins: { legend: { display: true, labels: { color: '#5A6478', boxWidth: 16, font: { size: 10 } } } }
    });

    // Metrics
    const m = d.metrics;
    setVal('fs-m-N',    m.N_harmonics);
    setVal('fs-m-err',  fmt(m.rms_error, 5));
    setVal('fs-m-thd',  fmt(m.thd_percent, 2) + '%');
    setVal('fs-m-bw',   fmt(m.bandwidth_hz, 2) + ' Hz');
    setVal('fs-m-a0',   fmt(d.a0, 5));
    setVal('fs-m-fmax', fmt(m.N_harmonics * m.fundamental_hz, 2) + ' Hz');

    const shapeNames = {
      square:'cuadrada', sawtooth:'diente de sierra', triangle:'triangular',
      half_rectified:'semi-onda rectificada', full_rectified:'onda completa rectificada'
    };
    $('fs-info').innerHTML = `La onda <strong>${shapeNames[shape] || shape}</strong> contiene solo armónicos ${shape === 'square' || shape === 'triangle' ? 'impares' : 'pares e impares'}. THD = ${fmt(m.thd_percent, 2)}%. Con N = ${N} armónicos el ancho de banda requerido es ${fmt(m.bandwidth_hz, 1)} Hz.`;

    // Coefficients table
    const tbody = $('fs-coeff-tbody');
    tbody.innerHTML = '';
    d.coefficients.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-accent">${c.n}</td>
        <td>${fmt(c.freq_hz, 3)}</td>
        <td>${fmt(c.an, 6)}</td>
        <td>${fmt(c.bn, 6)}</td>
        <td class="td-green">${fmt(c.cn, 6)}</td>
        <td>${fmt(c.phase_deg, 2)}°</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error('FS error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
//  DFT — SIMPLE
// ═══════════════════════════════════════════════════════════════
async function onDFT1() {
  const type  = getSelect('dft1-type');
  const f     = getSlider('dft1-f');
  const A     = getSlider('dft1-A');
  const phi   = getSlider('dft1-phi');
  const noise = getSlider('dft1-noise') / 100;
  const N     = parseInt(getSelect('dft1-N'));
  const fs    = getSlider('dft1-fs');
  const win   = getSelect('dft1-win');

  setVal('dft1-f-val',   fmt(f, 0) + ' Hz');
  setVal('dft1-A-val',   fmt(A, 1));
  setVal('dft1-phi-val', fmt(phi, 0) + '°');
  setVal('dft1-noise-val', fmt(noise * 100, 0) + '%');
  setVal('dft1-N-val',   N);
  setVal('dft1-fs-val',  fmt(fs, 0) + ' Hz');

  const body = {
    signals: [{ type, frequency: f, amplitude: A, phase: phi, dc_offset: 0, noise }],
    sample_rate: fs, num_points: N, window: win,
    show_phase: true, show_power: true
  };

  try {
    const d = await apiPost('/api/dft', body);

    // Time
    const { labels: tl, data: xt } = thinPair(d.t.map(v => fmt(v * 1000, 1) + 'ms'), d.x);
    upsertChart('dft1-time', 'line', {
      labels: tl,
      datasets: [{ data: xt, borderColor: '#1A56C4', borderWidth: 1.2, pointRadius: 0, tension: 0 }]
    }, chartOpts('ms', 'x[n]'));

    // Magnitude
    const { labels: fl, data: mag } = thinPair(d.freqs.map(v => fmt(v, 1)), d.magnitude);
    upsertChart('dft1-mag', 'line', {
      labels: fl,
      datasets: [{ data: mag, borderColor: '#1A56C4', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(26,86,196,0.08)', pointRadius: 0, tension: 0 }]
    }, chartOpts('Hz', '|X[k]|'));

    // Phase
    const { data: ph } = thinPair(d.freqs.map(v => fmt(v, 1)), d.phase_deg);
    upsertChart('dft1-phase', 'scatter', {
      labels: fl,
      datasets: [{ data: fl.map((f, i) => ({ x: parseFloat(f), y: ph[i] })), borderColor: '#0E7C5A', backgroundColor: 'rgba(14,124,90,0.5)', pointRadius: 2 }]
    }, chartOpts('Hz', '∠X[k] (°)', { xScale: { type: 'linear' } }));

    const m = d.metrics;
    setVal('dft1-m-peak', fmt(m.peak_freq_hz, 2) + ' Hz');
    setVal('dft1-m-df',   fmt(m.freq_resolution_hz, 3) + ' Hz');
    setVal('dft1-m-ny',   fmt(m.nyquist_hz, 1) + ' Hz');
    setVal('dft1-m-snr',  fmt(m.snr_db, 1) + ' dB');
    $('dft1-info').textContent = `Pico detectado en ${fmt(m.peak_freq_hz, 2)} Hz (esperado ${f} Hz). Resolución espectral Δf = ${fmt(m.freq_resolution_hz, 3)} Hz. Ventana: ${win}.`;

  } catch (e) { console.error('DFT1 error:', e); }
}

// ═══════════════════════════════════════════════════════════════
//  DFT — COMPOSITE
// ═══════════════════════════════════════════════════════════════
async function onDFTComposite() {
  const get = (base) => ({
    type: getSelect(`dftc-t${base}`),
    frequency: getSlider(`dftc-f${base}`),
    amplitude: getSlider(`dftc-a${base}`),
    phase: getSlider(`dftc-p${base}`),
    dc_offset: 0, noise: 0
  });

  [1, 2, 3].forEach(i => {
    setVal(`dftc-f${i}-val`, fmt(getSlider(`dftc-f${i}`), 0) + ' Hz');
    setVal(`dftc-a${i}-val`, fmt(getSlider(`dftc-a${i}`), 1));
    setVal(`dftc-p${i}-val`, fmt(getSlider(`dftc-p${i}`), 0) + '°');
  });

  const body = {
    signals: [get(1), get(2), get(3)],
    sample_rate: 600, num_points: 1024, window: 'hann'
  };

  try {
    const d = await apiPost('/api/dft', body);

    const { labels: tl, data: xt } = thinPair(d.t.map(v => fmt(v * 1000, 1)), d.x);
    upsertChart('dftc-time', 'line', {
      labels: tl,
      datasets: [{ data: xt, borderColor: '#1A56C4', borderWidth: 1.2, pointRadius: 0, tension: 0 }]
    }, chartOpts('ms', 'x[n]'));

    const { labels: fl, data: mag } = thinPair(d.freqs.map(v => fmt(v, 1)), d.magnitude);
    upsertChart('dftc-mag', 'line', {
      labels: fl,
      datasets: [{ data: mag, borderColor: '#0E7C5A', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(14,124,90,0.07)', pointRadius: 0, tension: 0 }]
    }, chartOpts('Hz', '|X[k]|'));

  } catch (e) { console.error('DFTComposite error:', e); }
}

// ═══════════════════════════════════════════════════════════════
//  DFT — NOISE
// ═══════════════════════════════════════════════════════════════
async function onDFTNoise() {
  const f    = getSlider('dftn-f');
  const A    = getSlider('dftn-A');
  const snrT = getSlider('dftn-snr');
  const win  = getSelect('dftn-win');

  setVal('dftn-f-val',   fmt(f, 0) + ' Hz');
  setVal('dftn-A-val',   fmt(A, 1));
  setVal('dftn-snr-val', fmt(snrT, 0) + ' dB');

  // Convert SNR to noise level: SNR = 20*log10(A/sigma) => sigma = A/10^(SNR/20)
  const noiseAmp = A / Math.pow(10, snrT / 20);

  const body = {
    signals: [{ type: 'sine', frequency: f, amplitude: A, phase: 0, dc_offset: 0, noise: noiseAmp / A }],
    sample_rate: 512, num_points: 1024, window: win
  };

  try {
    const d = await apiPost('/api/dft', body);

    const { labels: tl, data: xt } = thinPair(d.t.map(v => fmt(v * 1000, 1)), d.x);
    upsertChart('dftn-time', 'line', {
      labels: tl,
      datasets: [{ data: xt, borderColor: '#1A56C4', borderWidth: 1.2, pointRadius: 0, tension: 0 }]
    }, chartOpts('ms', 'x[n]'));

    const { labels: fl, data: pdb } = thinPair(d.freqs.map(v => fmt(v, 1)), d.power_db);
    upsertChart('dftn-power', 'line', {
      labels: fl,
      datasets: [{ data: pdb, borderColor: '#B45309', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(180,83,9,0.07)', pointRadius: 0, tension: 0 }]
    }, chartOpts('Hz', 'dB'));

    const m = d.metrics;
    setVal('dftn-m-peak', fmt(m.peak_freq_hz, 2) + ' Hz');
    setVal('dftn-m-snr',  fmt(m.snr_db, 1) + ' dB');
    setVal('dftn-m-df',   fmt(m.freq_resolution_hz, 3) + ' Hz');
    setVal('dftn-m-N',    m.N);
    $('dftn-info').textContent = `SNR objetivo: ${snrT} dB. Medido: ${fmt(m.snr_db, 1)} dB. Ventana ${win} mejora la estimación espectral reduciendo el leakage.`;

  } catch (e) { console.error('DFTNoise error:', e); }
}

// ═══════════════════════════════════════════════════════════════
//  CONVOLUCIÓN
// ═══════════════════════════════════════════════════════════════
let CONV_DATA = null;

async function onConvControl() {
  const xType  = getSelect('conv-x-type');
  const xDur   = getInt('conv-x-dur');
  const xAmp   = getSlider('conv-x-amp');
  const xFreq  = getSlider('conv-x-freq');
  const hType  = getSelect('conv-h-type');
  const hLen   = getInt('conv-h-len');
  const hDec   = getSlider('conv-h-dec');

  setVal('conv-x-dur-val',  xDur);
  setVal('conv-x-amp-val',  fmt(xAmp, 1));
  setVal('conv-x-freq-val', fmt(xFreq, 1));
  setVal('conv-h-len-val',  hLen);
  setVal('conv-h-dec-val',  fmt(hDec, 2));

  const showFreq = ['sine', 'cosine'].includes(xType);
  $('ctrl-conv-freq').style.opacity = showFreq ? '1' : '0.35';

  try {
    const d = await apiPost('/api/convolution', {
      x_type: xType, x_duration: xDur, x_amplitude: xAmp, x_frequency: xFreq,
      h_type: hType, h_duration: hLen, h_amplitude: 1.0, h_decay: hDec
    });
    CONV_DATA = d;

    upsertChart('conv-x-chart', 'bar', {
      labels: d.n_x,
      datasets: [{ data: d.x, backgroundColor: 'rgba(26,86,196,0.7)', borderRadius: 2 }]
    }, chartOpts('n', 'x[n]'));

    upsertChart('conv-h-chart', 'bar', {
      labels: d.n_h,
      datasets: [{ data: d.h, backgroundColor: 'rgba(14,124,90,0.7)', borderRadius: 2 }]
    }, chartOpts('k', 'h[k]'));

    const m = d.metrics;
    $('conv-metrics-grid').innerHTML = `
      <div class="metric-card"><div class="metric-label">len(x)</div><div class="metric-value accent">${m.Nx}</div></div>
      <div class="metric-card"><div class="metric-label">len(h)</div><div class="metric-value green">${m.Nh}</div></div>
      <div class="metric-card"><div class="metric-label">len(y)</div><div class="metric-value">${m.Ny}</div></div>
      <div class="metric-card"><div class="metric-label">max|y|</div><div class="metric-value">${fmt(m.max_y, 4)}</div></div>
      <div class="metric-card"><div class="metric-label">Σy[n]</div><div class="metric-value">${fmt(m.sum_y, 4)}</div></div>
      <div class="metric-card"><div class="metric-label">E_y</div><div class="metric-value">${fmt(m.energy_y, 4)}</div></div>
    `;
    $('conv-info').textContent = `L_y = L_x + L_h − 1 = ${m.Ny_formula}. Energía: E_x = ${fmt(m.energy_x, 4)}, E_h = ${fmt(m.energy_h, 4)}, E_y = ${fmt(m.energy_y, 4)}.`;

    $('conv-anim-n').max = d.n_y.length - 1;
    $('conv-anim-n').value = d.n_y.length - 1;
    renderConvResult(d.n_y.length - 1);
  } catch (e) { console.error('Conv error:', e); }
}

function renderConvResult(step) {
  if (!CONV_DATA) return;
  const d = CONV_DATA;
  setVal('conv-anim-val', step);
  const colors = d.y.map((_, i) => i <= step ? 'rgba(26,86,196,0.75)' : 'rgba(222,226,232,0.6)');
  upsertChart('conv-y-chart', 'bar', {
    labels: d.n_y,
    datasets: [{ data: d.y, backgroundColor: colors, borderRadius: 2 }]
  }, chartOpts('n', 'y[n]'));
}

function onConvAnim() {
  renderConvResult(parseInt($('conv-anim-n').value));
}

let convAnimTimer = null;
function animateConv() {
  if (convAnimTimer) { clearInterval(convAnimTimer); convAnimTimer = null; $('conv-play-btn').textContent = '▶ Animar'; return; }
  if (!CONV_DATA) return;
  let n = 0;
  $('conv-play-btn').textContent = '⏹ Detener';
  $('conv-anim-n').value = 0;
  convAnimTimer = setInterval(() => {
    n++;
    if (n >= CONV_DATA.n_y.length) { clearInterval(convAnimTimer); convAnimTimer = null; $('conv-play-btn').textContent = '▶ Animar'; return; }
    $('conv-anim-n').value = n;
    renderConvResult(n);
  }, 80);
}

// ═══════════════════════════════════════════════════════════════
//  MUESTREO
// ═══════════════════════════════════════════════════════════════
async function onSampControl() {
  const f0    = getSlider('samp-f0');
  const A     = getSlider('samp-A');
  const fs    = getSlider('samp-fs');
  const phi   = getSlider('samp-phi');
  const dur   = getSlider('samp-dur');
  const rec   = getSelect('samp-rec');
  const type  = getSelect('samp-type');
  const add2  = $('samp-add2').checked;
  const f2    = getSlider('samp-f2');
  const a2    = getSlider('samp-a2');

  setVal('samp-f0-val',  fmt(f0, 1) + ' Hz');
  setVal('samp-A-val',   fmt(A, 1));
  setVal('samp-fs-val',  fmt(fs, 1) + ' Hz');
  setVal('samp-phi-val', fmt(phi, 0) + '°');
  setVal('samp-dur-val', fmt(dur, 1) + ' s');
  setVal('samp-f2-val',  fmt(f2, 1) + ' Hz');
  setVal('samp-a2-val',  fmt(a2, 1));

  $('samp-comp2-ctrls').style.opacity       = add2 ? '1' : '0.4';
  $('samp-comp2-ctrls').style.pointerEvents = add2 ? 'auto' : 'none';

  try {
    const d = await apiPost('/api/sampling', {
      signal_frequency: f0, signal_type: type, signal_amplitude: A,
      signal_phase: phi, sample_rate: fs, duration: dur,
      reconstruction: rec, add_component: add2, freq2: f2, amp2: a2
    });

    const a = d.analysis;
    const isAlias = a.is_aliasing;

    setVal('samp-m-f0',    fmt(a.f0_hz, 2) + ' Hz');
    setVal('samp-m-fs',    fmt(a.fs_hz, 2) + ' Hz');
    setVal('samp-m-fn',    fmt(a.f_nyquist_hz, 2) + ' Hz');
    setVal('samp-m-ratio', fmt(a.ratio_fs_f0, 3) + '×');
    setVal('samp-m-N',     a.N_samples);
    setVal('samp-m-err',   fmt(a.rec_error_rms, 5));

    const sb = $('samp-status');
    if (isAlias) {
      sb.className = 'info-box danger';
      sb.innerHTML = `⚠ <strong>ALIASING.</strong> f₀ = ${a.f0_hz} Hz > f_Nyquist = ${a.f_nyquist_hz} Hz. La frecuencia aparente en la señal reconstruida será <strong>${fmt(a.f_alias_hz, 2)} Hz</strong> en lugar de ${a.f0_hz} Hz. Requiere f_s ≥ ${2 * a.f0_hz} Hz.`;
    } else {
      sb.className = 'info-box ok';
      sb.innerHTML = `✓ <strong>Criterio de Nyquist satisfecho.</strong> f_s = ${a.fs_hz} Hz ≥ 2·f₀ = ${2 * a.f0_hz} Hz. Factor de sobremuestreo: ${fmt(a.ratio_fs_f0, 2)}×. Error RMS reconstrucción: ${fmt(a.rec_error_rms, 5)}.`;
    }

    // Main chart
    const { labels: tl, data: yc } = thinPair(d.t_cont.map(v => fmt(v, 4)), d.y_cont);
    const { data: yr } = thinPair(d.t_cont.map(v => fmt(v, 4)), d.y_rec);
    upsertChart('samp-main-chart', 'line', {
      labels: tl,
      datasets: [
        { label: 'Original x(t)', data: yc, borderColor: '#DEE2E8', borderWidth: 2, pointRadius: 0, tension: 0 },
        { label: `Reconstruida (${rec})`, data: yr, borderColor: isAlias ? '#B91C1C' : '#0E7C5A', borderWidth: 1.5, pointRadius: 0, tension: 0, borderDash: isAlias ? [6, 3] : [] },
        {
          label: 'Muestras x[n]', data: tl.map((t, i) => {
            const tval = d.t_samp.findIndex(ts => Math.abs(parseFloat(t) - ts) < 1e-4);
            return tval >= 0 ? d.y_samp[tval] : null;
          }),
          borderColor: 'transparent', backgroundColor: '#1A56C4',
          pointRadius: 5, showLine: false
        }
      ]
    }, {
      ...chartOpts('t (s)', 'Amplitud'),
      plugins: { legend: { display: true, labels: { color: '#5A6478', boxWidth: 20, font: { size: 10 } } } }
    });

    // Spectrum
    const { labels: fl, data: sp } = thinPair(d.freqs.map(v => fmt(v, 2)), d.spectrum);
    upsertChart('samp-spec-chart', 'line', {
      labels: fl,
      datasets: [{ data: sp, borderColor: '#1A56C4', borderWidth: 1.5, fill: true, backgroundColor: 'rgba(26,86,196,0.07)', pointRadius: 0, tension: 0 }]
    }, chartOpts('Hz', '|X[k]|'));

    // Nyquist bar chart
    const fmax_samp = add2 ? Math.max(f0, f2) : f0;
    const maxF = Math.max(fs * 1.1, f0 * 2.5);
    upsertChart('samp-nyq-chart', 'bar', {
      labels: ['f₀ señal', 'f_Nyquist', 'f_s muestreo', '2·f_max requerido'],
      datasets: [{
        data: [f0, a.f_nyquist_hz, fs, 2 * fmax_samp],
        backgroundColor: [
          'rgba(26,86,196,0.7)',
          isAlias ? 'rgba(185,28,28,0.7)' : 'rgba(14,124,90,0.7)',
          'rgba(26,86,196,0.5)',
          'rgba(180,83,9,0.5)'
        ],
        borderRadius: 3
      }]
    }, {
      indexAxis: 'y', animation: false, responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#F0F2F5' }, max: maxF, title: { display: true, text: 'Hz', color: '#8E97A8' }, ticks: { color: '#8E97A8' } },
        y: { grid: { display: false }, ticks: { color: '#5A6478' } }
      }
    });

  } catch (e) { console.error('Sampling error:', e); }
}
