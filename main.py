"""
SignalLab — Backend de Procesamiento de Señales
ESCOM · IPN
FastAPI + NumPy + SciPy
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
import numpy as np
from scipy import signal as scipy_signal
from scipy.fft import fft, ifft, fftfreq, fftshift
import math

app = FastAPI(title="SignalLab", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# ─────────────────────────────────────────────
#  MODELOS DE DATOS
# ─────────────────────────────────────────────

class SignalParams(BaseModel):
    signal_type: str = "sine"
    amplitude: float = 1.0
    frequency: float = 1.0
    phase: float = 0.0
    dc_offset: float = 0.0
    decay: float = 0.5          # para exponencial
    duty_cycle: float = 0.5     # para cuadrada
    duration: float = 2.0
    sample_rate: float = 1000.0
    num_points: int = 1000
    noise_level: float = 0.0
    noise_type: str = "gaussian"

class FourierSeriesParams(BaseModel):
    signal_type: str = "square"
    N_harmonics: int = 10
    frequency: float = 1.0
    amplitude: float = 1.0
    duty_cycle: float = 0.5
    duration: float = 3.0
    sample_rate: float = 1000.0
    show_gibbs: bool = True

class DFTParams(BaseModel):
    signals: List[dict]         # lista de señales a sumar
    sample_rate: float = 1000.0
    num_points: int = 1024
    window: str = "rectangular"
    show_phase: bool = True
    show_power: bool = True
    frequency_range: Optional[float] = None

class ConvolutionParams(BaseModel):
    x_type: str = "rectangular"
    x_duration: int = 10
    x_amplitude: float = 1.0
    x_frequency: float = 1.0
    h_type: str = "rectangular"
    h_duration: int = 5
    h_amplitude: float = 1.0
    h_decay: float = 0.3
    mode: str = "full"          # full, same, valid

class SamplingParams(BaseModel):
    signal_frequency: float = 5.0
    signal_type: str = "sine"
    signal_amplitude: float = 1.0
    signal_phase: float = 0.0
    sample_rate: float = 20.0
    duration: float = 1.0
    reconstruction: str = "sinc"  # sinc, zoh, linear
    num_harmonics: int = 3
    add_component: bool = False
    freq2: float = 3.0
    amp2: float = 0.5


# ─────────────────────────────────────────────
#  GENERADOR DE SEÑALES
# ─────────────────────────────────────────────

def generate_signal(params: SignalParams) -> dict:
    N = params.num_points
    t = np.linspace(0, params.duration, N, endpoint=False)
    dt = t[1] - t[0]
    w = 2 * np.pi * params.frequency
    phi = np.radians(params.phase)
    A = params.amplitude
    dc = params.dc_offset

    stype = params.signal_type.lower()

    if stype == "sine":
        y = A * np.sin(w * t + phi) + dc
    elif stype == "cosine":
        y = A * np.cos(w * t + phi) + dc
    elif stype == "complex_exp":
        # retorna parte real e imaginaria
        z = A * np.exp(1j * (w * t + phi))
        yr = np.real(z) + dc
        yi = np.imag(z) + dc
    elif stype == "square":
        y = A * scipy_signal.square(w * t + phi, duty=params.duty_cycle) + dc
    elif stype == "sawtooth":
        y = A * scipy_signal.sawtooth(w * t + phi, width=1.0) + dc
    elif stype == "sawtooth_inv":
        y = A * scipy_signal.sawtooth(w * t + phi, width=0.0) + dc
    elif stype == "triangle":
        y = A * scipy_signal.sawtooth(w * t + phi, width=0.5) + dc
    elif stype == "rectangular_pulse":
        # pulso rectangular centrado
        center = params.duration / 2
        width = 1.0 / params.frequency if params.frequency > 0 else params.duration * 0.2
        y = A * ((np.abs(t - center) <= width / 2).astype(float)) + dc
    elif stype == "sinc":
        t_shifted = t - params.duration / 2
        arg = w * t_shifted / (2 * np.pi)
        y = A * np.sinc(arg) + dc
    elif stype == "gaussian":
        mu = params.duration / 2
        sigma = 1.0 / (2 * np.pi * params.frequency) if params.frequency > 0 else params.duration * 0.15
        y = A * np.exp(-0.5 * ((t - mu) / sigma) ** 2) + dc
    elif stype == "unit_step":
        t0 = params.duration / 4
        y = A * (t >= t0).astype(float) + dc
    elif stype == "unit_impulse":
        y = np.zeros(N)
        idx = N // 4
        y[idx] = A / (t[1] - t[0])
        y += dc
    elif stype == "ramp":
        t0 = params.duration / 4
        y = A * np.where(t >= t0, t - t0, 0.0) + dc
    elif stype == "damped_sine":
        y = A * np.exp(-params.decay * t) * np.sin(w * t + phi) + dc
    elif stype == "damped_cosine":
        y = A * np.exp(-params.decay * t) * np.cos(w * t + phi) + dc
    elif stype == "chirp":
        f_end = params.frequency * 3
        y = A * scipy_signal.chirp(t, f0=params.frequency, f1=f_end, t1=params.duration, method='linear') + dc
    else:
        y = np.zeros(N)

    # Ruido
    if params.noise_level > 0:
        if params.noise_type == "gaussian":
            noise = np.random.normal(0, params.noise_level * A, N)
        elif params.noise_type == "uniform":
            noise = np.random.uniform(-params.noise_level * A, params.noise_level * A, N)
        else:
            noise = np.random.normal(0, params.noise_level * A, N)
        if stype == "complex_exp":
            yr += noise
        else:
            y += noise

    if stype == "complex_exp":
        return {
            "t": t.tolist(),
            "y_real": yr.tolist(),
            "y_imag": yi.tolist(),
            "is_complex": True,
            "params": {
                "rms": float(np.sqrt(np.mean(yr**2))),
                "peak": float(np.max(np.abs(yr))),
                "mean": float(np.mean(yr)),
                "energy": float(np.trapezoid(yr**2, t)),
            }
        }

    rms = float(np.sqrt(np.mean(y**2)))
    peak = float(np.max(np.abs(y)))
    mean = float(np.mean(y))
    energy = float(np.trapezoid(y**2, t))
    power = energy / params.duration

    return {
        "t": t.tolist(),
        "y": y.tolist(),
        "is_complex": False,
        "params": {
            "rms": round(rms, 6),
            "peak": round(peak, 6),
            "mean": round(mean, 6),
            "energy": round(energy, 6),
            "power": round(power, 6),
            "duration": params.duration,
            "sample_rate": params.sample_rate,
            "N": N,
        }
    }


# ─────────────────────────────────────────────
#  ENDPOINTS
# ─────────────────────────────────────────────

@app.post("/api/signal")
async def api_signal(params: SignalParams):
    return JSONResponse(content=generate_signal(params))


@app.post("/api/fourier-series")
async def api_fourier_series(params: FourierSeriesParams):
    f0 = params.frequency
    T = 1.0 / f0
    N = int(params.sample_rate * params.duration)
    t = np.linspace(0, params.duration, N, endpoint=False)
    A = params.amplitude

    stype = params.signal_type
    coefficients = []
    y_approx = np.zeros(N)
    y_true = np.zeros(N)

    # Señal ideal
    if stype == "square":
        y_true = A * scipy_signal.square(2 * np.pi * f0 * t, duty=params.duty_cycle)
    elif stype == "sawtooth":
        y_true = A * scipy_signal.sawtooth(2 * np.pi * f0 * t, width=1.0)
    elif stype == "triangle":
        y_true = A * scipy_signal.sawtooth(2 * np.pi * f0 * t, width=0.5)
    elif stype == "half_rectified":
        y_true = A * np.maximum(np.sin(2 * np.pi * f0 * t), 0)
    elif stype == "full_rectified":
        y_true = A * np.abs(np.sin(2 * np.pi * f0 * t))

    # Coeficientes y síntesis
    spectrum_n = []
    spectrum_an = []
    spectrum_bn = []
    spectrum_cn = []

    a0 = 0.0
    if stype == "square":
        a0 = 0.0
    elif stype == "sawtooth":
        a0 = 0.0
    elif stype == "triangle":
        a0 = 0.0
    elif stype == "half_rectified":
        a0 = A / np.pi
    elif stype == "full_rectified":
        a0 = 2 * A / np.pi

    y_approx += a0

    for n in range(1, params.N_harmonics + 1):
        an, bn, cn = 0.0, 0.0, 0.0

        if stype == "square":
            if n % 2 == 1:
                bn = (4 * A) / (n * np.pi)
            an, cn = 0.0, abs(bn)
        elif stype == "sawtooth":
            bn = -2 * A * ((-1)**n) / (n * np.pi)
            an, cn = 0.0, abs(bn)
        elif stype == "triangle":
            if n % 2 == 1:
                sign = (-1) ** ((n - 1) // 2)
                bn = sign * 8 * A / (n**2 * np.pi**2)
            an, cn = 0.0, abs(bn)
        elif stype == "half_rectified":
            if n == 1:
                an, bn = A / 2, 0.0
            elif n % 2 == 0:
                an = -2 * A / (np.pi * (n**2 - 1))
                bn = 0.0
            cn = abs(an)
        elif stype == "full_rectified":
            if n % 2 == 0:
                an = -4 * A / (np.pi * (n**2 - 1))
            bn = 0.0
            cn = abs(an)

        y_approx += an * np.cos(2 * np.pi * n * f0 * t) + bn * np.sin(2 * np.pi * n * f0 * t)

        spectrum_n.append(n)
        spectrum_an.append(round(an, 6))
        spectrum_bn.append(round(bn, 6))
        spectrum_cn.append(round(cn, 6))
        coefficients.append({
            "n": n,
            "freq_hz": round(n * f0, 4),
            "an": round(an, 6),
            "bn": round(bn, 6),
            "cn": round(cn, 6),
            "phase_deg": round(math.degrees(math.atan2(-bn, an)) if (an != 0 or bn != 0) else 0, 3)
        })

    error = float(np.sqrt(np.mean((y_true - y_approx)**2)))
    thd = 0.0
    if len(spectrum_cn) > 1 and spectrum_cn[0] > 0:
        thd = 100.0 * math.sqrt(sum(c**2 for c in spectrum_cn[1:])) / spectrum_cn[0]

    return JSONResponse(content={
        "t": t.tolist(),
        "y_true": y_true.tolist(),
        "y_approx": y_approx.tolist(),
        "a0": round(a0, 6),
        "coefficients": coefficients,
        "spectrum": {
            "n": spectrum_n,
            "an": spectrum_an,
            "bn": spectrum_bn,
            "cn": spectrum_cn,
        },
        "metrics": {
            "rms_error": round(error, 6),
            "thd_percent": round(thd, 3),
            "N_harmonics": params.N_harmonics,
            "fundamental_hz": f0,
            "bandwidth_hz": round(params.N_harmonics * f0, 3),
        }
    })


@app.post("/api/dft")
async def api_dft(params: DFTParams):
    N = params.num_points
    fs = params.sample_rate
    t = np.arange(N) / fs

    # Construir señal sumando componentes
    x = np.zeros(N)
    for s in params.signals:
        stype = s.get("type", "sine")
        A = s.get("amplitude", 1.0)
        f = s.get("frequency", 1.0)
        phi = np.radians(s.get("phase", 0.0))
        dc = s.get("dc_offset", 0.0)
        noise = s.get("noise", 0.0)
        w = 2 * np.pi * f

        if stype == "sine":
            comp = A * np.sin(w * t + phi)
        elif stype == "cosine":
            comp = A * np.cos(w * t + phi)
        elif stype == "square":
            comp = A * scipy_signal.square(w * t + phi)
        elif stype == "sawtooth":
            comp = A * scipy_signal.sawtooth(w * t + phi, width=1.0)
        elif stype == "triangle":
            comp = A * scipy_signal.sawtooth(w * t + phi, width=0.5)
        else:
            comp = A * np.sin(w * t + phi)

        if noise > 0:
            comp += np.random.normal(0, noise * A, N)
        x += comp + dc

    # Ventana
    win_name = params.window.lower()
    if win_name == "hann":
        w_func = np.hanning(N)
    elif win_name == "hamming":
        w_func = np.hamming(N)
    elif win_name == "blackman":
        w_func = np.blackman(N)
    elif win_name == "bartlett":
        w_func = np.bartlett(N)
    elif win_name == "flattop":
        w_func = scipy_signal.windows.flattop(N)
    else:
        w_func = np.ones(N)

    x_windowed = x * w_func
    X = fft(x_windowed, n=N)
    freqs = fftfreq(N, d=1.0/fs)

    # Solo frecuencias positivas
    half = N // 2
    freqs_pos = freqs[:half]
    X_pos = X[:half]
    mag = (2.0 / N) * np.abs(X_pos)
    phase_deg = np.degrees(np.angle(X_pos))
    power_db = 20 * np.log10(mag + 1e-12)

    # Picos prominentes
    from scipy.signal import find_peaks
    peaks, props = find_peaks(mag, height=np.max(mag)*0.05, distance=5)
    peak_info = [{"freq_hz": round(freqs_pos[p], 3), "magnitude": round(mag[p], 6)} for p in peaks[:10]]

    snr = 0.0
    if len(peaks) > 0:
        signal_power = mag[peaks[0]]**2
        noise_power = np.mean(mag**2) - signal_power / N if N > 0 else 1e-9
        if noise_power > 0:
            snr = 10 * np.log10(signal_power / max(noise_power, 1e-12))

    return JSONResponse(content={
        "t": t.tolist(),
        "x": x.tolist(),
        "freqs": freqs_pos.tolist(),
        "magnitude": mag.tolist(),
        "phase_deg": phase_deg.tolist(),
        "power_db": power_db.tolist(),
        "peaks": peak_info,
        "metrics": {
            "N": N,
            "fs": fs,
            "freq_resolution_hz": round(fs / N, 4),
            "nyquist_hz": fs / 2,
            "window": params.window,
            "snr_db": round(snr, 2),
            "peak_freq_hz": round(freqs_pos[peaks[0]], 3) if len(peaks) > 0 else 0,
        }
    })


@app.post("/api/convolution")
async def api_convolution(params: ConvolutionParams):
    # Señal x[n]
    Nx = params.x_duration
    n_x = np.arange(Nx)
    xtype = params.x_type

    if xtype == "rectangular":
        x = params.x_amplitude * np.ones(Nx)
    elif xtype == "triangular":
        x = params.x_amplitude * (1 - np.abs(2 * n_x / (Nx - 1) - 1))
    elif xtype == "exponential_decay":
        x = params.x_amplitude * np.exp(-0.3 * n_x)
    elif xtype == "exponential_growth":
        x = params.x_amplitude * np.exp(0.1 * n_x)
    elif xtype == "sine":
        x = params.x_amplitude * np.sin(2 * np.pi * params.x_frequency * n_x / Nx)
    elif xtype == "cosine":
        x = params.x_amplitude * np.cos(2 * np.pi * params.x_frequency * n_x / Nx)
    elif xtype == "unit_impulse":
        x = np.zeros(Nx)
        x[0] = params.x_amplitude
    elif xtype == "unit_step":
        x = np.zeros(Nx)
        x[Nx // 4:] = params.x_amplitude
    elif xtype == "random":
        np.random.seed(42)
        x = params.x_amplitude * np.random.randn(Nx)
    else:
        x = np.ones(Nx)

    # Respuesta al impulso h[n]
    Nh = params.h_duration
    n_h = np.arange(Nh)
    htype = params.h_type

    if htype == "rectangular":
        h = (params.h_amplitude / Nh) * np.ones(Nh)
    elif htype == "exponential_decay":
        alpha = params.h_decay
        h = params.h_amplitude * np.exp(-alpha * n_h)
    elif htype == "gaussian":
        mu = (Nh - 1) / 2
        sigma = Nh / 5
        h = params.h_amplitude * np.exp(-0.5 * ((n_h - mu) / sigma) ** 2)
        h /= (np.sum(h) + 1e-12)
    elif htype == "unit_impulse":
        h = np.zeros(Nh)
        h[0] = params.h_amplitude
    elif htype == "derivative":
        h = np.zeros(Nh)
        h[0] = params.h_amplitude
        if Nh > 1:
            h[1] = -params.h_amplitude
    elif htype == "integrator":
        h = params.h_amplitude * np.ones(Nh) / Nh
    elif htype == "highpass":
        h = np.zeros(Nh)
        h[0] = params.h_amplitude
        h[Nh//2] = -params.h_amplitude / 2 if Nh > 1 else 0
    elif htype == "lowpass":
        h = params.h_amplitude * np.sinc(np.linspace(-2, 2, Nh))
        h *= np.hamming(Nh)
        h /= (np.sum(h) + 1e-12)
    else:
        h = np.ones(Nh) / Nh

    # Convolución
    y = np.convolve(x, h, mode='full')
    Ny = len(y)

    # Energía
    Ex = float(np.sum(x**2))
    Eh = float(np.sum(h**2))
    Ey = float(np.sum(y**2))

    return JSONResponse(content={
        "x": x.tolist(),
        "h": h.tolist(),
        "y": y.tolist(),
        "n_x": n_x.tolist(),
        "n_h": n_h.tolist(),
        "n_y": list(range(Ny)),
        "metrics": {
            "Nx": Nx,
            "Nh": Nh,
            "Ny": Ny,
            "Ny_formula": f"{Nx} + {Nh} - 1 = {Ny}",
            "energy_x": round(Ex, 6),
            "energy_h": round(Eh, 6),
            "energy_y": round(Ey, 6),
            "max_y": round(float(np.max(np.abs(y))), 6),
            "sum_y": round(float(np.sum(y)), 6),
        }
    })


@app.post("/api/sampling")
async def api_sampling(params: SamplingParams):
    f0 = params.signal_frequency
    fs = params.sample_rate
    dur = params.duration
    A = params.signal_amplitude
    phi = np.radians(params.signal_phase)

    # Señal continua de alta resolución
    N_cont = 2000
    t_cont = np.linspace(0, dur, N_cont, endpoint=False)

    def gen_sig(t, f, A, phi, stype):
        w = 2 * np.pi * f
        if stype == "sine":
            return A * np.sin(w * t + phi)
        elif stype == "cosine":
            return A * np.cos(w * t + phi)
        elif stype == "square":
            return A * scipy_signal.square(w * t + phi)
        elif stype == "sawtooth":
            return A * scipy_signal.sawtooth(w * t + phi, width=1.0)
        elif stype == "triangle":
            return A * scipy_signal.sawtooth(w * t + phi, width=0.5)
        return A * np.sin(w * t + phi)

    y_cont = gen_sig(t_cont, f0, A, phi, params.signal_type)
    if params.add_component:
        y_cont += gen_sig(t_cont, params.freq2, params.amp2, 0, "sine")

    # Muestras
    N_samp = max(2, int(fs * dur))
    t_samp = np.arange(N_samp) / fs
    y_samp = gen_sig(t_samp, f0, A, phi, params.signal_type)
    if params.add_component:
        y_samp += gen_sig(t_samp, params.freq2, params.amp2, 0, "sine")

    # Reconstrucción
    if params.reconstruction == "sinc":
        # Interpolación sinc ideal
        y_rec = np.zeros(N_cont)
        Ts = 1.0 / fs
        for k, t in enumerate(t_cont):
            y_rec[k] = np.sum(y_samp * np.sinc((t - t_samp) / Ts))
    elif params.reconstruction == "zoh":
        y_rec = np.zeros(N_cont)
        Ts = 1.0 / fs
        for k, t in enumerate(t_cont):
            n = int(np.floor(t * fs))
            n = min(n, N_samp - 1)
            y_rec[k] = y_samp[n]
    elif params.reconstruction == "linear":
        y_rec = np.interp(t_cont, t_samp, y_samp)
    else:
        y_rec = np.interp(t_cont, t_samp, y_samp)

    # Análisis de aliasing
    f_nyquist = fs / 2.0
    is_aliasing = f0 > f_nyquist
    f_alias = abs(f0 - round(f0 / fs) * fs) if is_aliasing else 0.0

    # Error de reconstrucción
    rec_error = float(np.sqrt(np.mean((y_cont - y_rec)**2)))

    # Espectro de las muestras
    N_fft = 512
    if len(y_samp) >= 4:
        Y_samp = fft(y_samp, n=N_fft)
        freqs_samp = fftfreq(N_fft, d=1.0/fs)
        half = N_fft // 2
        freqs_pos = freqs_samp[:half]
        mag_samp = (2.0 / N_fft) * np.abs(Y_samp[:half])
    else:
        freqs_pos = np.array([0.0])
        mag_samp = np.array([0.0])

    return JSONResponse(content={
        "t_cont": t_cont.tolist(),
        "y_cont": y_cont.tolist(),
        "t_samp": t_samp.tolist(),
        "y_samp": y_samp.tolist(),
        "y_rec": y_rec.tolist(),
        "freqs": freqs_pos.tolist(),
        "spectrum": mag_samp.tolist(),
        "analysis": {
            "f0_hz": f0,
            "fs_hz": fs,
            "f_nyquist_hz": f_nyquist,
            "ratio_fs_f0": round(fs / f0, 4) if f0 > 0 else 0,
            "is_aliasing": is_aliasing,
            "f_alias_hz": round(f_alias, 4),
            "nyquist_satisfied": fs >= 2 * f0,
            "rec_error_rms": round(rec_error, 6),
            "N_samples": N_samp,
            "T_sampling_ms": round(1000.0 / fs, 4),
            "signal_type": params.signal_type,
        }
    })


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
