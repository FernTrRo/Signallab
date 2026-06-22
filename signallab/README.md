# SignalLab — Herramienta de Procesamiento de Señales
**ESCOM · IPN** · Señales y Sistemas Discretos

## Estructura del proyecto

```
signallab/
├── main.py              # Backend FastAPI (endpoints de señales)
├── requirements.txt     # Dependencias Python
├── render.yaml          # Config de deploy en Render.com
├── Procfile             # Alternativa Railway/Heroku
├── templates/
│   └── index.html       # Interfaz principal
└── static/
    └── js/
        └── app.js       # Lógica del frontend
```

## Módulos incluidos

| Módulo | Señales / funciones |
|--------|---------------------|
| **Generador** | Senoidal, cosenoidal, cuadrada, sierra (asc/desc), triangular, pulso rect., sinc, gaussiana, escalón, impulso, rampa, senoidal amortiguada, cosenoidal amortiguada, exponencial compleja, chirp |
| **Series Fourier** | Cuadrada, diente de sierra, triangular, semi-onda rectificada, onda completa rect. Coeficientes exactos aₙ, bₙ, |cₙ|, THD, tabla completa |
| **DFT / FFT** | Señal simple, señal compuesta (3 componentes), señal + ruido. Ventanas: rect., Hann, Hamming, Blackman, Bartlett, Flat Top. Espectro de magnitud, fase, potencia dB |
| **Convolución** | 9 tipos de x[n] × 8 tipos de h[n]. Animación paso a paso. Métricas de energía |
| **Muestreo** | Nyquist, aliasing en tiempo real. Reconstrucción sinc, ZOH, lineal. Espectro de muestras |

## Deploy en Render.com (gratis, recomendado)

1. Sube este proyecto a un repositorio GitHub (público o privado)
2. Ve a https://render.com → **New** → **Web Service**
3. Conecta el repositorio
4. Render detecta `render.yaml` automáticamente
5. Haz clic en **Create Web Service**
6. En ~2 minutos tienes una URL pública: `https://signallab.onrender.com`

> **Nota:** El free tier de Render pone el servicio en "sleep" tras 15 min de inactividad.
> La primera carga puede tardar ~30 segundos mientras se "despierta".

## Deploy en Railway.app (alternativa)

1. railway.app → **New Project** → **Deploy from GitHub**
2. Selecciona el repo → detecta Python automáticamente
3. Variables de entorno: ninguna necesaria
4. URL generada automáticamente

## Ejecución local

```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Abrir: http://localhost:8000
```
