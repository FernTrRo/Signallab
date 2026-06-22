// ═══════════════════════════════════════════════════════════════
//  SignalLab — app.js
// ═══════════════════════════════════════════════════════════════
'use strict';

// ─────────────────────────────────────────────
//  ESTADO GLOBAL DE SEÑAL
//  Todo módulo lee de aquí cuando el usuario
//  cambia el selector del topbar.
// ─────────────────────────────────────────────
const G = {
  signal_type:  'sine',
  amplitude:    1.0,
  frequency:    5.0,
  phase:        0.0,
  dc_offset:    0.0,
  decay:        0.5,
  duty_cycle:   0.5,
  noise_level:  0.0,
  noise_type:   'gaussian',
  sample_rate:  1000.0,
  duration:     2.0,
};

// ─────────────────────────────────────────────
//  CHART REGISTRY
// ─────────────────────────────────────────────
const CHARTS = {};

Chart.defaults.color        = '#5A6478';
Chart.defaults.borderColor  = '#DEE2E8';
Chart.defaults.font.family  = "'JetBrains Mono', monospace";
Chart.defaults.font.size    = 10;

function chartOpts(xLabel = 'n', yLabel = '', opts = {}) {
  return {
    animation: false,
    responsive: true,
    maintainAspectRatio: true,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` ${parseFloat(ctx.parsed.y).toFixed(4)}` } },
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
    CHARTS[id].data    = data;
    if (opts) CHARTS[id].options = opts;
    CHARTS[id].update('none');
    return CHARTS[id];
  }
  CHARTS[id] = new Chart(document.getElementById(id).getContext('2d'),
    { type, data, options: opts || chartOpts() });
  return CHARTS[id];
}

// ─────────────────────────────────────────────
//  API
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
  document.getElementById('tab-' + id).classList.add('active');
  event.currentTarget.classList.add('active');
  if (id === 'signals')        onSigControl();
  if (id === 'fourier-series') onFSControl();
  if (id === 'dft')            onDFT1();
  if (id === 'convolution')    onConvControl();
  if (id === 'sampling')       onSampControl();
}

function dftSub(sub, el) {
  ['single','composite','noise'].forEach(s => {
    const e = document.getElementById('dft-' + s);
    if (e) e.style.display = 'none';
  });
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('dft-' + sub).style.display = 'block';
  el.classList.add('active');
  if (sub === 'single')    onDFT1();
  if (sub === 'composite') onDFTComposite();
  if (sub === 'noise')     onDFTNoise();
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function setVal(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function fmt(v, d = 4) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return parseFloat(v).toFixed(d);
}
function getSlider(id) { return parseFloat(document.getElementById(id).value); }
function getSelect(id) { return document.getElementById(id).value; }
function getInt(id)    { return parseInt(document.getElementById(id).value); }

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

// ─────────────────────────────────────────────
//  SELECTOR GLOBAL — propaga a todos los módulos
// ─────────────────────────────────────────────
function onGlobalSignal() {
  G.signal_type = getSelect('g-type');
  G.amplitude   = getSlider('g-A');
  G.frequency   = getSlider('g-f');
  G.phase       = getSlider('g-phi');
  G.dc_offset   = getSlider('g-dc');
  G.decay       = getSlider('g-decay');
  G.duty_cycle  = getSlider('g-duty') / 100;
  G.noise_level = getSlider('g-noise') / 100;

  setVal('g-A-val',     fmt(G.amplitude, 2));
  setVal('g-f-val',     fmt(G.frequency, 1) + ' Hz');
  setVal('g-phi-val',   fmt(G.phase, 0) + '°');
  setVal('g-dc-val',    fmt(G.dc_offset, 2));
  setVal('g-decay-val', fmt(G.decay, 2));
  setVal('g-duty-val',  fmt(G.duty_cycle * 100, 0) + '%');
  setVal('g-noise-val', fmt(G.noise_level * 100, 0) + '%');

  // Show/hide topbar params
  const showDecay = ['damped_sine','damped_cosine'].includes(G.signal_type);
  const showDuty  = G.signal_type === 'square';
  const e = id => document.getElementById(id);
  if (e('g-decay-grp')) e('g-decay-grp').style.display = showDecay ? 'flex' : 'none';
  if (e('g-duty-grp'))  e('g-duty-grp').style.display  = showDuty  ? 'flex' : 'none';

  // Sync all local controls to global state
  syncLocalControls();

  // Refresh active tab
  const active = document.querySelector('.tab-panel.active');
  if (!active) return;
  const id = active.id.replace('tab-', '');
  if (id === 'signals')        onSigControl(true);
  if (id === 'fourier-series') onFSControl(true);
  if (id === 'dft')            onDFT1(true);
  if (id === 'convolution')    onConvControl(true);
  if (id === 'sampling')       onSampControl(true);
}

// Push global values into each tab's own controls
function syncLocalControls() {
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.value = val; };
  // Signals tab
  set('sig-type',  G.signal_type);
  set('sig-A',     G.amplitude);
  set('sig-f',     G.frequency);
  set('sig-phi',   G.phase);
  set('sig-dc',    G.dc_offset);
  set('sig-decay', G.decay);
  set('sig-duty',  G.duty_cycle * 100);
  set('sig-noise', G.noise_level * 100);
  // DFT single tab
  set('dft1-type', G.signal_type === 'damped_sine'    ? 'sine'
                 : G.signal_type === 'damped_cosine'  ? 'cosine'
                 : ['sine','cosine','square','sawtooth','triangle'].includes(G.signal_type)
                    ? G.signal_type : 'sine');
  set('dft1-f',  Math.min(G.frequency, 100));
  set('dft1-A',  G.amplitude);
  set('dft1-phi', G.phase);
  // Sampling tab
  set('samp-type', ['sine','cosine','square','sawtooth','triangle'].includes(G.signal_type)
                    ? G.signal_type : 'sine');
  set('samp-f0',  Math.min(G.frequency, 50));
  set('samp-A',   Math.min(G.amplitude, 3));
  set('samp-phi', G.phase);
  // Fourier series tab (shape only if compatible)
  const fsShapes = ['square','sawtooth','triangle','half_rectified','full_rectified'];
  if (fsShapes.includes(G.signal_type)) set('fs-shape', G.signal_type);
  set('fs-f0', Math.min(Math.max(G.frequency, 0.5), 10));
  set('fs-A',  Math.min(G.amplitude, 5));
}

// ═══════════════════════════════════════════════════════════════
//  SIGNAL GENERATOR TAB
// ═══════════════════════════════════════════════════════════════
async function onSigControl(fromGlobal = false) {
  if (!fromGlobal) {
    // local change → update global
    G.signal_type = getSelect('sig-type');
    G.amplitude   = getSlider('sig-A');
    G.frequency   = getSlider('sig-f');
    G.phase       = getSlider('sig-phi');
    G.dc_offset   = getSlider('sig-dc');
    G.decay       = getSlider('sig-decay');
    G.duty_cycle  = getSlider('sig-duty') / 100;
    G.noise_level = getSlider('sig-noise') / 100;
    G.noise_type  = getSelect('sig-noise-type');
    // reflect in topbar
    const set = (id, val) => { const e = document.getElementById(id); if (e) e.value = val; };
    set('g-type',  G.signal_type);
    set('g-A',     G.amplitude);
    set('g-f',     G.frequency);
    set('g-phi',   G.phase);
    set('g-dc',    G.dc_offset);
    set('g-decay', G.decay);
    set('g-duty',  G.duty_cycle * 100);
    set('g-noise', G.noise_level * 100);
    setVal('g-A-val',     fmt(G.amplitude, 2));
    setVal('g-f-val',     fmt(G.frequency, 1) + ' Hz');
    setVal('g-phi-val',   fmt(G.phase, 0) + '°');
    setVal('g-dc-val',    fmt(G.dc_offset, 2));
    setVal('g-decay-val', fmt(G.decay, 2));
    setVal('g-duty-val',  fmt(G.duty_cycle * 100, 0) + '%');
    setVal('g-noise-val', fmt(G.noise_level * 100, 0) + '%');
  }

  const type = G.signal_type;
  setVal('sig-A-val',     fmt(G.amplitude, 2));
  setVal('sig-f-val',     fmt(G.frequency, 2) + ' Hz');
  setVal('sig-phi-val',   fmt(G.phase, 0) + '°');
  setVal('sig-dc-val',    fmt(G.dc_offset, 2));
  setVal('sig-fs-val',    fmt(G.sample_rate, 0));
  setVal('sig-dur-val',   fmt(G.duration, 1) + ' s');
  setVal('sig-decay-val', fmt(G.decay, 2));
  setVal('sig-duty-val',  fmt(G.duty_cycle * 100, 0) + '%');
  setVal('sig-noise-val', fmt(G.noise_level * 100, 0) + '%');

  document.getElementById('ctrl-decay').style.opacity =
    ['damped_sine','damped_cosine'].includes(type) ? '1' : '0.35';
  document.getElementById('ctrl-duty').style.opacity =
    type === 'square' ? '1' : '0.35';

  const N = Math.min(Math.floor(G.sample_rate * G.duration), 4000);
  try {
    const d = await apiPost('/api/signal', {
      signal_type: type,
      amplitude:   G.amplitude,
      frequency:   G.frequency,
      phase:       G.phase,
      dc_offset:   G.dc_offset,
      decay:       G.decay,
      duty_cycle:  G.duty_cycle,
      duration:    G.duration,
      sample_rate: G.sample_rate,
      num_points:  N,
      noise_level: G.noise_level,
      noise_type:  G.noise_type,
    });

    if (d.is_complex) {
      document.getElementById('complex-panel').style.display = 'block';
      const { labels: tl, data: yr } = thinPair(d.t.map(v => fmt(v, 3)), d.y_real);
      const { data: yi }             = thinPair(d.t.map(v => fmt(v, 3)), d.y_imag);
      upsertChart('sig-complex-chart', 'line', {
        labels: tl,
        datasets: [
          { label: 'Re{x(t)}', data: yr, borderColor: '#1A56C4', borderWidth: 1.5, pointRadius: 0, tension: 0 },
          { label: 'Im{x(t)}', data: yi, borderColor: '#0E7C5A', borderWidth: 1.5, pointRadius: 0, tension: 0, borderDash: [4,3] },
        ]
      }, { ...chartOpts('t (s)', 'x(t)'),
           plugins: { legend: { display: true, labels: { color: '#5A6478', font: { size: 10 } } } } });
      const { labels, data } = thinPair(d.t.map(v => fmt(v, 3)), d.y_real);
      upsertChart('sig-chart', 'line', {
        labels,
        datasets: [{ data, borderColor: '#1A56C4', borderWidth: 1.5, pointRadius: 0, tension: 0 }]
      }, chartOpts('t (s)', 'Re{x(t)}'));
      setVal('m-rms', fmt(d.params.rms)); setVal('m-peak', fmt(d.params.peak));
      setVal('m-mean', fmt(d.params.mean)); setVal('m-energy', fmt(d.params.energy, 4));
      setVal('m-power', '—'); setVal('m-N', d.y_real.length);
    } else {
      document.getElementById('complex-panel').style.display = 'none';
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
  } catch(e) { console.error('Signal error:', e); }
}

// ═══════════════════════════════════════════════════════════════
//  SERIES DE FOURIER
// ═══════════════════════════════════════════════════════════════
async function onFSControl(fromGlobal = false) {
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
      amplitude: A, duty_cycle: duty,
      duration: 4 / Math.max(f0, 0.1), sample_rate: 2000
    });

    const { labels: tl, data: yt } = thinPair(d.t.map(v => fmt(v, 4)), d.y_true);
    const { data: ya }             = thinPair(d.t.map(v => fmt(v, 4)), d.y_approx);
    upsertChart('fs-time-chart', 'line', {
      labels: tl,
      datasets: [
        { label: 'Señal ideal',           data: yt, borderColor: '#DEE2E8', borderWidth: 2,   pointRadius: 0, tension: 0 },
        { label: `Serie Fourier (N=${N})`, data: ya, borderColor: '#1A56C4', borderWidth: 1.5, pointRadius: 0, tension: 0.05 },
      ]
    }, { ...chartOpts('t (s)', 'f(t)'),
         plugins: { legend: { display: true, labels: { color: '#5A6478', boxWidth: 20 } } } });

    upsertChart('fs-spectrum-chart', 'bar', {
      labels: d.spectrum.n.map(n => 'n='+n),
      datasets: [
        { label: '|aₙ|', data: d.spectrum.an.map(Math.abs), backgroundColor: 'rgba(26,86,196,0.6)',  borderRadius: 2 },
        { label: '|bₙ|', data: d.spectrum.bn.map(Math.abs), backgroundColor: 'rgba(14,124,90,0.6)',  borderRadius: 2 },
      ]
    }, { ...chartOpts('Armónico n', 'Amplitud'),
         plugins: { legend: { display: true, labels: { color: '#5A6478', boxWidth: 16, font:{ size:10 } } } } });

    const m = d.metrics;
    setVal('fs-m-N',    m.N_harmonics);
    setVal('fs-m-err',  fmt(m.rms_error, 5));
    setVal('fs-m-thd',  fmt(m.thd_percent, 2) + '%');
    setVal('fs-m-bw',   fmt(m.bandwidth_hz, 2) + ' Hz');
    setVal('fs-m-a0',   fmt(d.a0, 5));
    setVal('fs-m-fmax', fmt(m.N_harmonics * m.fundamental_hz, 2) + ' Hz');

    const names = { square:'cuadrada', sawtooth:'diente de sierra', triangle:'triangular',
                    half_rectified:'semi-onda rectificada', full_rectified:'onda completa rectificada' };
    document.getElementById('fs-info').innerHTML =
      `Onda <strong>${names[shape]||shape}</strong>, N=${N} armónicos, f₀=${f0} Hz. THD = ${fmt(m.thd_percent,2)}%. Ancho de banda = ${fmt(m.bandwidth_hz,1)} Hz.`;

    const tbody = document.getElementById('fs-coeff-tbody');
    tbody.innerHTML = '';
    d.coefficients.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="td-accent">${c.n}</td><td>${fmt(c.freq_hz,3)}</td><td>${fmt(c.an,6)}</td><td>${fmt(c.bn,6)}</td><td class="td-green">${fmt(c.cn,6)}</td><td>${fmt(c.phase_deg,2)}°</td>`;
      tbody.appendChild(tr);
    });
  } catch(e) { console.error('FS error:', e); }
}

// ═══════════════════════════════════════════════════════════════
//  DFT — SIMPLE  (espectro unilateral + bilateral)
// ═══════════════════════════════════════════════════════════════
async function onDFT1(fromGlobal = false) {
  // resolve signal type to DFT-compatible
  const typeMap = { damped_sine:'sine', damped_cosine:'cosine',
                    rectangular_pulse:'sine', sinc:'sine', gaussian:'sine',
                    unit_step:'sine', unit_impulse:'sine', ramp:'sine', chirp:'sine',
                    complex_exp:'cosine' };
  const rawType = fromGlobal ? G.signal_type : getSelect('dft1-type');
  const type    = typeMap[rawType] || rawType;

  const f     = fromGlobal ? Math.min(G.frequency, 100) : getSlider('dft1-f');
  const A     = fromGlobal ? G.amplitude               : getSlider('dft1-A');
  const phi   = fromGlobal ? G.phase                   : getSlider('dft1-phi');
  const noise = fromGlobal ? G.noise_level             : getSlider('dft1-noise') / 100;
  const N     = parseInt(getSelect('dft1-N'));
  const fs    = getSlider('dft1-fs');
  const win   = getSelect('dft1-win');
  const showBi = document.getElementById('dft1-bilateral')?.checked ?? false;

  setVal('dft1-f-val',     fmt(f,0) + ' Hz');
  setVal('dft1-A-val',     fmt(A,1));
  setVal('dft1-phi-val',   fmt(phi,0) + '°');
  setVal('dft1-noise-val', fmt(noise*100,0) + '%');
  setVal('dft1-N-val',     N);
  setVal('dft1-fs-val',    fmt(fs,0) + ' Hz');

  // sync selects back
  if (fromGlobal) {
    const e = id => document.getElementById(id);
    if (e('dft1-type')) e('dft1-type').value = type;
    if (e('dft1-f'))    e('dft1-f').value    = f;
    if (e('dft1-A'))    e('dft1-A').value    = A;
    if (e('dft1-phi'))  e('dft1-phi').value  = phi;
  }

  try {
    const d = await apiPost('/api/dft', {
      signals: [{ type, frequency: f, amplitude: A, phase: phi, dc_offset: 0, noise }],
      sample_rate: fs, num_points: N, window: win,
      show_phase: true, show_power: true
    });

    // Tiempo
    const { labels: tl, data: xt } = thinPair(d.t.map(v => fmt(v*1000,1)+'ms'), d.x);
    upsertChart('dft1-time', 'line', {
      labels: tl,
      datasets: [{ data: xt, borderColor: '#1A56C4', borderWidth: 1.2, pointRadius: 0, tension: 0 }]
    }, chartOpts('ms', 'x[n]'));

    // ── Magnitud: bilateral o unilateral ──────────────────────
    if (showBi) {
      // bilateral: usar freqs_bi / magnitude_bi
      const { labels: fl, data: mg } = thinPair(
        d.freqs_bi.map(v => fmt(v,1)), d.magnitude_bi);
      upsertChart('dft1-mag', 'line', {
        labels: fl,
        datasets: [{
          label: '|X(f)| bilateral',
          data: mg,
          borderColor: '#1A56C4', borderWidth: 1.5,
          fill: true, backgroundColor: 'rgba(26,86,196,0.07)',
          pointRadius: 0, tension: 0
        }]
      }, {
        ...chartOpts('Hz', '|X(f)|'),
        plugins: { legend: { display: true, labels: { color:'#5A6478', font:{size:10} } } }
      });

      // Fase bilateral
      const { data: ph } = thinPair(d.freqs_bi.map(v => fmt(v,1)), d.phase_bi);
      upsertChart('dft1-phase', 'scatter', {
        datasets: [{ data: fl.map((f,i) => ({ x: parseFloat(f), y: ph[i] })),
                     borderColor: '#0E7C5A', backgroundColor: 'rgba(14,124,90,0.5)', pointRadius: 2 }]
      }, chartOpts('Hz', '∠X(f) (°)', { xScale: { type:'linear' } }));

    } else {
      // unilateral
      const { labels: fl, data: mg } = thinPair(d.freqs.map(v => fmt(v,1)), d.magnitude);
      upsertChart('dft1-mag', 'line', {
        labels: fl,
        datasets: [{
          label: '|X[k]| unilateral',
          data: mg,
          borderColor: '#1A56C4', borderWidth: 1.5,
          fill: true, backgroundColor: 'rgba(26,86,196,0.08)',
          pointRadius: 0, tension: 0
        }]
      }, {
        ...chartOpts('Hz', '|X[k]|'),
        plugins: { legend: { display: true, labels: { color:'#5A6478', font:{size:10} } } }
      });

      const { data: ph } = thinPair(d.freqs.map(v => fmt(v,1)), d.phase_deg);
      upsertChart('dft1-phase', 'scatter', {
        datasets: [{ data: fl.map((f,i) => ({ x: parseFloat(f), y: ph[i] })),
                     borderColor: '#0E7C5A', backgroundColor: 'rgba(14,124,90,0.5)', pointRadius: 2 }]
      }, chartOpts('Hz', '∠X[k] (°)', { xScale: { type:'linear' } }));
    }

    const m = d.metrics;
    setVal('dft1-m-peak', fmt(m.peak_freq_hz,2) + ' Hz');
    setVal('dft1-m-df',   fmt(m.freq_resolution_hz,3) + ' Hz');
    setVal('dft1-m-ny',   fmt(m.nyquist_hz,1) + ' Hz');
    setVal('dft1-m-snr',  fmt(m.snr_db,1) + ' dB');
    document.getElementById('dft1-info').textContent =
      `Pico en ${fmt(m.peak_freq_hz,2)} Hz (esperado ${f} Hz). Δf = ${fmt(m.freq_resolution_hz,3)} Hz. Ventana: ${win}. Modo: ${showBi ? 'bilateral (±f_Nyquist)' : 'unilateral (0 → f_Nyquist)'}.`;

  } catch(e) { console.error('DFT1 error:', e); }
}

// ═══════════════════════════════════════════════════════════════
//  DFT — COMPOSITE
// ═══════════════════════════════════════════════════════════════
async function onDFTComposite() {
  const get = b => ({
    type:      getSelect(`dftc-t${b}`),
    frequency: getSlider(`dftc-f${b}`),
    amplitude: getSlider(`dftc-a${b}`),
    phase:     getSlider(`dftc-p${b}`),
    dc_offset: 0, noise: 0
  });
  [1,2,3].forEach(i => {
    setVal(`dftc-f${i}-val`, fmt(getSlider(`dftc-f${i}`),0) + ' Hz');
    setVal(`dftc-a${i}-val`, fmt(getSlider(`dftc-a${i}`),1));
    setVal(`dftc-p${i}-val`, fmt(getSlider(`dftc-p${i}`),0) + '°');
  });
  const showBi = document.getElementById('dftc-bilateral')?.checked ?? false;

  try {
    const d = await apiPost('/api/dft', {
      signals: [get(1), get(2), get(3)],
      sample_rate: 600, num_points: 1024, window: 'hann'
    });

    const { labels: tl, data: xt } = thinPair(d.t.map(v => fmt(v*1000,1)), d.x);
    upsertChart('dftc-time', 'line', {
      labels: tl,
      datasets: [{ data: xt, borderColor: '#1A56C4', borderWidth: 1.2, pointRadius: 0, tension: 0 }]
    }, chartOpts('ms', 'x[n]'));

    const freqs  = showBi ? d.freqs_bi     : d.freqs;
    const magArr = showBi ? d.magnitude_bi : d.magnitude;
    const { labels: fl, data: mg } = thinPair(freqs.map(v => fmt(v,1)), magArr);
    upsertChart('dftc-mag', 'line', {
      labels: fl,
      datasets: [{
        label: showBi ? 'Bilateral' : 'Unilateral',
        data: mg,
        borderColor: '#0E7C5A', borderWidth: 1.5,
        fill: true, backgroundColor: 'rgba(14,124,90,0.07)', pointRadius: 0, tension: 0
      }]
    }, { ...chartOpts('Hz', '|X|'),
         plugins: { legend:{ display:true, labels:{ color:'#5A6478', font:{size:10} } } } });

  } catch(e) { console.error('DFTComposite error:', e); }
}

// ═══════════════════════════════════════════════════════════════
//  DFT — NOISE
// ═══════════════════════════════════════════════════════════════
async function onDFTNoise() {
  const f    = getSlider('dftn-f');
  const A    = getSlider('dftn-A');
  const snrT = getSlider('dftn-snr');
  const win  = getSelect('dftn-win');

  setVal('dftn-f-val',   fmt(f,0) + ' Hz');
  setVal('dftn-A-val',   fmt(A,1));
  setVal('dftn-snr-val', fmt(snrT,0) + ' dB');

  const noiseAmp = A / Math.pow(10, snrT / 20);

  try {
    const d = await apiPost('/api/dft', {
      signals: [{ type:'sine', frequency:f, amplitude:A, phase:0, dc_offset:0, noise: noiseAmp/A }],
      sample_rate: 512, num_points: 1024, window: win
    });

    const { labels: tl, data: xt } = thinPair(d.t.map(v => fmt(v*1000,1)), d.x);
    upsertChart('dftn-time', 'line', {
      labels: tl,
      datasets: [{ data: xt, borderColor: '#1A56C4', borderWidth: 1.2, pointRadius: 0, tension: 0 }]
    }, chartOpts('ms', 'x[n]'));

    const { labels: fl, data: pdb } = thinPair(d.freqs_bi.map(v => fmt(v,1)), d.power_db_bi);
    upsertChart('dftn-power', 'line', {
      labels: fl,
      datasets: [{
        label: 'Potencia bilateral (dB)',
        data: pdb,
        borderColor: '#B45309', borderWidth: 1.5,
        fill: true, backgroundColor: 'rgba(180,83,9,0.07)', pointRadius: 0, tension: 0
      }]
    }, { ...chartOpts('Hz', 'dB'),
         plugins: { legend:{ display:true, labels:{ color:'#5A6478', font:{size:10} } } } });

    const m = d.metrics;
    setVal('dftn-m-peak', fmt(m.peak_freq_hz,2) + ' Hz');
    setVal('dftn-m-snr',  fmt(m.snr_db,1) + ' dB');
    setVal('dftn-m-df',   fmt(m.freq_resolution_hz,3) + ' Hz');
    setVal('dftn-m-N',    m.N);
    document.getElementById('dftn-info').textContent =
      `SNR objetivo: ${snrT} dB. Medido: ${fmt(m.snr_db,1)} dB. Espectro de potencia bilateral mostrado.`;

  } catch(e) { console.error('DFTNoise error:', e); }
}

// ═══════════════════════════════════════════════════════════════
//  CONVOLUCIÓN
// ═══════════════════════════════════════════════════════════════
let CONV_DATA = null;

async function onConvControl(fromGlobal = false) {
  const xType = getSelect('conv-x-type');
  const xDur  = getInt('conv-x-dur');
  const xAmp  = fromGlobal ? G.amplitude           : getSlider('conv-x-amp');
  const xFreq = fromGlobal ? G.frequency            : getSlider('conv-x-freq');
  const hType = getSelect('conv-h-type');
  const hLen  = getInt('conv-h-len');
  const hDec  = getSlider('conv-h-dec');

  if (fromGlobal) {
    const e = id => document.getElementById(id);
    if (e('conv-x-amp'))  e('conv-x-amp').value  = Math.min(G.amplitude, 5);
    if (e('conv-x-freq')) e('conv-x-freq').value = Math.min(G.frequency, 10);
  }

  setVal('conv-x-dur-val',  xDur);
  setVal('conv-x-amp-val',  fmt(xAmp,1));
  setVal('conv-x-freq-val', fmt(xFreq,1));
  setVal('conv-h-len-val',  hLen);
  setVal('conv-h-dec-val',  fmt(hDec,2));

  document.getElementById('ctrl-conv-freq').style.opacity =
    ['sine','cosine'].includes(xType) ? '1' : '0.35';

  try {
    const d = await apiPost('/api/convolution', {
      x_type: xType, x_duration: xDur, x_amplitude: xAmp, x_frequency: xFreq,
      h_type: hType, h_duration: hLen, h_amplitude: 1.0, h_decay: hDec
    });
    CONV_DATA = d;

    upsertChart('conv-x-chart', 'bar', {
      labels: d.n_x,
      datasets: [{ data: d.x, backgroundColor: 'rgba(26,86,196,0.7)', borderRadius: 2 }]
    }, chartOpts('n','x[n]'));

    upsertChart('conv-h-chart', 'bar', {
      labels: d.n_h,
      datasets: [{ data: d.h, backgroundColor: 'rgba(14,124,90,0.7)', borderRadius: 2 }]
    }, chartOpts('k','h[k]'));

    const m = d.metrics;
    document.getElementById('conv-metrics-grid').innerHTML = `
      <div class="metric-card"><div class="metric-label">len(x)</div><div class="metric-value accent">${m.Nx}</div></div>
      <div class="metric-card"><div class="metric-label">len(h)</div><div class="metric-value green">${m.Nh}</div></div>
      <div class="metric-card"><div class="metric-label">len(y)</div><div class="metric-value">${m.Ny}</div></div>
      <div class="metric-card"><div class="metric-label">max|y|</div><div class="metric-value">${fmt(m.max_y,4)}</div></div>
      <div class="metric-card"><div class="metric-label">Σy[n]</div><div class="metric-value">${fmt(m.sum_y,4)}</div></div>
      <div class="metric-card"><div class="metric-label">E_y</div><div class="metric-value">${fmt(m.energy_y,4)}</div></div>`;
    document.getElementById('conv-info').textContent =
      `L_y = L_x + L_h − 1 = ${m.Ny_formula}. E_x=${fmt(m.energy_x,4)}, E_h=${fmt(m.energy_h,4)}, E_y=${fmt(m.energy_y,4)}.`;

    document.getElementById('conv-anim-n').max = d.n_y.length - 1;
    document.getElementById('conv-anim-n').value = d.n_y.length - 1;
    renderConvResult(d.n_y.length - 1);
  } catch(e) { console.error('Conv error:', e); }
}

function renderConvResult(step) {
  if (!CONV_DATA) return;
  setVal('conv-anim-val', step);
  const colors = CONV_DATA.y.map((_,i) => i <= step ? 'rgba(26,86,196,0.75)' : 'rgba(222,226,232,0.6)');
  upsertChart('conv-y-chart', 'bar', {
    labels: CONV_DATA.n_y,
    datasets: [{ data: CONV_DATA.y, backgroundColor: colors, borderRadius: 2 }]
  }, chartOpts('n','y[n]'));
}
function onConvAnim() { renderConvResult(parseInt(document.getElementById('conv-anim-n').value)); }

let convAnimTimer = null;
function animateConv() {
  if (convAnimTimer) {
    clearInterval(convAnimTimer); convAnimTimer = null;
    document.getElementById('conv-play-btn').textContent = '▶ Animar'; return;
  }
  if (!CONV_DATA) return;
  let n = 0;
  document.getElementById('conv-play-btn').textContent = '⏹ Detener';
  document.getElementById('conv-anim-n').value = 0;
  convAnimTimer = setInterval(() => {
    n++;
    if (n >= CONV_DATA.n_y.length) {
      clearInterval(convAnimTimer); convAnimTimer = null;
      document.getElementById('conv-play-btn').textContent = '▶ Animar'; return;
    }
    document.getElementById('conv-anim-n').value = n;
    renderConvResult(n);
  }, 80);
}

// ═══════════════════════════════════════════════════════════════
//  MUESTREO
// ═══════════════════════════════════════════════════════════════
async function onSampControl(fromGlobal = false) {
  const validTypes = ['sine','cosine','square','sawtooth','triangle'];
  const rawType = fromGlobal ? G.signal_type : getSelect('samp-type');
  const type    = validTypes.includes(rawType) ? rawType : 'sine';

  const f0  = fromGlobal ? Math.min(G.frequency, 50) : getSlider('samp-f0');
  const A   = fromGlobal ? Math.min(G.amplitude, 3)  : getSlider('samp-A');
  const phi = fromGlobal ? G.phase                   : getSlider('samp-phi');
  const fs  = getSlider('samp-fs');
  const dur = getSlider('samp-dur');
  const rec = getSelect('samp-rec');
  const add2 = document.getElementById('samp-add2').checked;
  const f2  = getSlider('samp-f2');
  const a2  = getSlider('samp-a2');

  if (fromGlobal) {
    const e = id => document.getElementById(id);
    if (e('samp-type')) e('samp-type').value = type;
    if (e('samp-f0'))   e('samp-f0').value   = f0;
    if (e('samp-A'))    e('samp-A').value     = A;
    if (e('samp-phi'))  e('samp-phi').value   = phi;
  }

  setVal('samp-f0-val',  fmt(f0,1) + ' Hz');
  setVal('samp-A-val',   fmt(A,1));
  setVal('samp-fs-val',  fmt(fs,1) + ' Hz');
  setVal('samp-phi-val', fmt(phi,0) + '°');
  setVal('samp-dur-val', fmt(dur,1) + ' s');
  setVal('samp-f2-val',  fmt(f2,1) + ' Hz');
  setVal('samp-a2-val',  fmt(a2,1));

  document.getElementById('samp-comp2-ctrls').style.opacity       = add2 ? '1' : '0.4';
  document.getElementById('samp-comp2-ctrls').style.pointerEvents = add2 ? 'auto' : 'none';

  try {
    const d = await apiPost('/api/sampling', {
      signal_frequency: f0, signal_type: type, signal_amplitude: A,
      signal_phase: phi, sample_rate: fs, duration: dur,
      reconstruction: rec, add_component: add2, freq2: f2, amp2: a2
    });

    const a = d.analysis;
    const isAlias = a.is_aliasing;
    setVal('samp-m-f0',    fmt(a.f0_hz,2) + ' Hz');
    setVal('samp-m-fs',    fmt(a.fs_hz,2) + ' Hz');
    setVal('samp-m-fn',    fmt(a.f_nyquist_hz,2) + ' Hz');
    setVal('samp-m-ratio', fmt(a.ratio_fs_f0,3) + '×');
    setVal('samp-m-N',     a.N_samples);
    setVal('samp-m-err',   fmt(a.rec_error_rms,5));

    const sb = document.getElementById('samp-status');
    if (isAlias) {
      sb.className = 'info-box danger';
      sb.innerHTML = `⚠ <strong>ALIASING.</strong> f₀ = ${a.f0_hz} Hz > f_Nyquist = ${a.f_nyquist_hz} Hz. Frecuencia aparente: <strong>${fmt(a.f_alias_hz,2)} Hz</strong>. Requiere f_s ≥ ${2*a.f0_hz} Hz.`;
    } else {
      sb.className = 'info-box ok';
      sb.innerHTML = `✓ <strong>Nyquist satisfecho.</strong> f_s = ${a.fs_hz} Hz ≥ 2·f₀ = ${2*a.f0_hz} Hz. Factor: ${fmt(a.ratio_fs_f0,2)}×. Error RMS: ${fmt(a.rec_error_rms,5)}.`;
    }

    // Main chart
    const { labels: tl, data: yc } = thinPair(d.t_cont.map(v => fmt(v,4)), d.y_cont);
    const { data: yr } = thinPair(d.t_cont.map(v => fmt(v,4)), d.y_rec);
    upsertChart('samp-main-chart', 'line', {
      labels: tl,
      datasets: [
        { label: 'Original x(t)',       data: yc, borderColor: '#DEE2E8', borderWidth: 2,   pointRadius: 0, tension: 0 },
        { label: `Reconstruida (${rec})`, data: yr, borderColor: isAlias ? '#B91C1C' : '#0E7C5A',
          borderWidth: 1.5, pointRadius: 0, tension: 0, borderDash: isAlias ? [6,3] : [] },
        { label: 'Muestras x[n]',
          data: tl.map(t => {
            const idx = d.t_samp.findIndex(ts => Math.abs(parseFloat(t) - ts) < 1e-4);
            return idx >= 0 ? d.y_samp[idx] : null;
          }),
          borderColor: 'transparent', backgroundColor: '#1A56C4',
          pointRadius: 5, showLine: false }
      ]
    }, { ...chartOpts('t (s)', 'Amplitud'),
         plugins: { legend:{ display:true, labels:{ color:'#5A6478', boxWidth:20, font:{size:10} } } } });

    // Spectrum bilateral
    const { labels: fl, data: sp } = thinPair(d.freqs.map(v => fmt(v,2)), d.spectrum);
    upsertChart('samp-spec-chart', 'line', {
      labels: fl,
      datasets: [{ data: sp, borderColor: '#1A56C4', borderWidth: 1.5,
                   fill: true, backgroundColor: 'rgba(26,86,196,0.07)', pointRadius: 0, tension: 0 }]
    }, chartOpts('Hz', '|X[k]|'));

    // Nyquist diagram
    const fmax_samp = add2 ? Math.max(f0, f2) : f0;
    const maxF = Math.max(fs * 1.1, f0 * 2.5);
    upsertChart('samp-nyq-chart', 'bar', {
      labels: ['f₀ señal', 'f_Nyquist', 'f_s muestreo', '2·f_max req.'],
      datasets: [{
        data: [f0, a.f_nyquist_hz, fs, 2*fmax_samp],
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
      plugins: { legend:{ display:false } },
      scales: {
        x: { grid:{ color:'#F0F2F5' }, max: maxF,
             title:{ display:true, text:'Hz', color:'#8E97A8' }, ticks:{ color:'#8E97A8' } },
        y: { grid:{ display:false }, ticks:{ color:'#5A6478' } }
      }
    });

  } catch(e) { console.error('Sampling error:', e); }
}