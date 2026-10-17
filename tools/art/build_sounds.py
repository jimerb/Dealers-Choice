"""Build the "parlor" sound pack: short synthesized effects, one WAV per game event.

    python3 -I tools/art/build_sounds.py            (run from the repo root)

Writes web/public/assets/sounds/parlor/<event>.wav (44.1 kHz, mono, 16-bit). Everything is generated
from noise and sine waves here, so the pack is entirely our own. Tweak a recipe and re-run.
"""
import math
import os
import random
import struct
import wave

RATE = 44100
OUT = os.path.join(os.getcwd(), 'web/public/assets/sounds/parlor')
rng = random.Random(7)


def silence(sec):
    return [0.0] * int(RATE * sec)


def mix(dst, src, at=0.0, gain=1.0):
    start = int(at * RATE)
    if len(dst) < start + len(src):
        dst.extend([0.0] * (start + len(src) - len(dst)))
    for i, v in enumerate(src):
        dst[start + i] += v * gain
    return dst


def lowpass(x, cutoff):
    a = 1 - math.exp(-2 * math.pi * cutoff / RATE)
    y, out = 0.0, []
    for v in x:
        y += a * (v - y)
        out.append(y)
    return out


def highpass(x, cutoff):
    lo = lowpass(x, cutoff)
    return [a - b for a, b in zip(x, lo)]


def noise(sec, attack=0.002, decay=0.04):
    n = int(RATE * sec)
    return [rng.uniform(-1, 1) * env(i / RATE, attack, decay) for i in range(n)]


def env(t, attack, decay):
    return t / attack if t < attack else math.exp(-(t - attack) / decay)


def tone(freq, sec, decay=0.25, partials=((1, 1.0),), attack=0.004):
    n = int(RATE * sec)
    return [sum(a * math.sin(2 * math.pi * freq * m * i / RATE) for m, a in partials) * env(i / RATE, attack, decay) for i in range(n)]


BELL = ((1, 1.0), (2.01, 0.35), (3.02, 0.12))
WOOD = ((1, 1.0), (2.76, 0.25), (5.4, 0.08))


def snap(sec=0.06, bright=5000, body=900, decay=0.012):
    x = highpass(lowpass(noise(sec, 0.001, decay), bright), body)
    return mix(x, tone(140, sec, 0.015), 0, 0.25)


def build():
    s = {}
    s['deal'] = snap(0.07, 6000, 1200, 0.010)
    s['card'] = mix(snap(0.11, 3500, 500, 0.022), tone(110, 0.08, 0.02), 0, 0.3)
    flip = highpass(lowpass(noise(0.09, 0.02, 0.02), 7000), 1500)
    s['flip'] = flip
    sh = silence(0.05)
    t = 0.0
    while t < 0.75:
        mix(sh, snap(0.03, 7000, 1500, 0.004), t, 0.35 + 0.65 * math.sin(math.pi * t / 0.75))
        t += rng.uniform(0.018, 0.034)
    s['shuffle'] = sh
    sw = noise(0.28, 0.06, 0.08)
    s['trick'] = [v * 0.8 for v in lowpass(highpass(sw, 300), 2500)]
    s['click'] = [v * 0.5 for v in highpass(noise(0.03, 0.0005, 0.004), 2500)]
    s['bid'] = tone(660, 0.22, 0.06, WOOD)
    s['pass'] = tone(392, 0.22, 0.06, WOOD)
    s['score'] = mix(tone(659.3, 0.5, 0.2, BELL), tone(987.8, 0.5, 0.25, BELL), 0.11)
    ch = silence(0.02)
    for k, f in enumerate([3150, 3720, 2980]):
        mix(ch, tone(f, 0.12, 0.03, ((1, 1.0), (1.52, 0.5), (2.37, 0.3))), 0.045 * k, 0.6)
    s['chips'] = ch
    win = []
    for k, f in enumerate([523.3, 659.3, 784.0, 1046.5]):
        mix(win, tone(f, 0.9 if k == 3 else 0.5, 0.35 if k == 3 else 0.18, BELL), 0.11 * k, 0.8)
    s['win'] = win
    lose = []
    for k, f in enumerate([392.0, 329.6, 261.6]):
        mix(lose, tone(f, 0.6, 0.25, ((1, 1.0), (2, 0.15))), 0.18 * k, 0.8)
    s['lose'] = lose
    s['error'] = [v * 0.6 for v in lowpass(mix(tone(185, 0.1, 0.05, ((1, 1), (3, 0.3))), tone(155, 0.14, 0.06, ((1, 1), (3, 0.3))), 0.1), 1800)]
    bub = []
    phase = 0.0
    for i in range(int(RATE * 0.14)):
        tt = i / RATE
        phase += 2 * math.pi * (300 + 700 * (tt / 0.14) ** 0.6) / RATE
        bub.append(math.sin(phase) * env(tt, 0.005, 0.05))
    s['bubble'] = bub
    s['match'] = mix(tone(784.0, 0.6, 0.22, BELL), tone(1174.7, 0.6, 0.25, BELL), 0.07)
    return s


def write(name, x):
    peak = max(1e-9, max(abs(v) for v in x))
    fade = int(RATE * 0.01)
    data = bytearray()
    for i, v in enumerate(x):
        g = 0.85 / peak * (min(1.0, (len(x) - i) / fade))
        data += struct.pack('<h', int(max(-1, min(1, v * g)) * 32767))
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(data))


if __name__ == '__main__':
    for name, x in build().items():
        write(name, x)
        print(f'{name}.wav  {len(x) / RATE:.2f}s')
