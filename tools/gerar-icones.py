#!/usr/bin/env python3
"""Gera os ícones do PWA (SVG + PNG) sem dependências externas.

Desenho: quadrado arredondado com gradiente índigo→violeta, um "documento"
branco com linhas de texto e um selo verde de "certo" no canto — leitura clara
tanto em 192px quanto em 512px, e no formato maskable (área de segurança).

Uso: python3 tools/gerar-icones.py
"""
from __future__ import annotations

import math
import os
import struct
import zlib

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "icons")

COR_A = (29, 78, 216)      # índigo  (#1d4ed8)
COR_B = (124, 58, 237)     # violeta (#7c3aed)
BRANCO = (255, 255, 255)
VERDE = (34, 197, 94)
CINZA_LINHA = (148, 163, 184)


def misturar(c1, c2, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


def arredondado(x, y, x0, y0, x1, y1, r):
    """SDF de retângulo arredondado (negativo = dentro), a partir dos cantos."""
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    hx = max((x1 - x0) / 2.0 - r, 0.0)
    hy = max((y1 - y0) / 2.0 - r, 0.0)
    qx = abs(x - cx) - hx
    qy = abs(y - cy) - hy
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def cobertura(sdf, aa=1.0):
    """Converte distância assinada em alfa 0..1 com antialias de `aa` pixels."""
    return max(0.0, min(1.0, 0.5 - sdf / aa))


def desenhar(tam, maskable=False):
    ss = 3 if tam >= 256 else 2          # superamostragem
    W = tam * ss
    buf = bytearray(tam * tam * 4)

    # margens: no maskable a arte ocupa o círculo central (80% seguro)
    margem = 0.0 if maskable else tam * 0.02
    raio_canto = (tam * 0.5) if maskable else (tam * 0.22)

    # geometria na escala real (não superamostrada)
    bx0, by0 = margem, margem
    bx1, by1 = tam - margem, tam - margem

    # documento
    dx0, dy0 = tam * 0.26, tam * 0.20
    dx1, dy1 = tam * 0.74, tam * 0.72
    dr = tam * 0.055

    # selo de "certo"
    cx, cy, cr = tam * 0.70, tam * 0.72, tam * 0.155

    for py in range(tam):
        for px in range(tam):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    x = px + (sx + 0.5) / ss
                    y = py + (sy + 0.5) / ss

                    a_fundo = cobertura(arredondado(x, y, bx0, by0, bx1, by1, raio_canto), 1.0)
                    if a_fundo <= 0:
                        continue
                    t = ((x - bx0) + (y - by0)) / max(1e-6, (bx1 - bx0) + (by1 - by0))
                    cor = misturar(COR_A, COR_B, max(0.0, min(1.0, t)))
                    r, g, b, a = cor[0], cor[1], cor[2], a_fundo

                    # documento branco
                    a_doc = cobertura(arredondado(x, y, dx0, dy0, dx1, dy1, dr), 1.0)
                    if a_doc > 0:
                        r, g, b = misturar((r, g, b), BRANCO, a_doc)
                        a = max(a, a_doc)
                        # linhas de texto
                        linhas = [(0.335, 0.665), (0.335, 0.60), (0.335, 0.665), (0.335, 0.52)]
                        for i, (lx0f, lx1f) in enumerate(linhas):
                            ly0 = dy0 + (dy1 - dy0) * (0.20 + i * 0.175)
                            ly1 = ly0 + (dy1 - dy0) * 0.055
                            lx0 = dx0 + (dx1 - dx0) * lx0f
                            lx1 = dx0 + (dx1 - dx0) * lx1f
                            a_lin = cobertura(arredondado(x, y, lx0, ly0, lx1, ly1, (ly1 - ly0) / 2), 1.0)
                            if a_lin > 0:
                                r, g, b = misturar((r, g, b), CINZA_LINHA, a_lin * 0.95)

                    # selo verde
                    d_selo = math.hypot(x - cx, y - cy) - cr
                    a_selo = cobertura(d_selo, 1.0)
                    if a_selo > 0:
                        r, g, b = misturar((r, g, b), VERDE, a_selo)
                        a = max(a, a_selo)
                        # borda branca do selo
                        d_borda = abs(math.hypot(x - cx, y - cy) - cr) - tam * 0.022
                        a_borda = cobertura(d_borda, 1.0) * (1.0 - a_selo * 0.0)
                        if a_borda > 0:
                            r, g, b = misturar((r, g, b), BRANCO, min(1.0, a_borda * 0.9))
                        # check mark (dois segmentos)
                        p1 = (cx - cr * 0.46, cy + cr * 0.02)
                        p2 = (cx - cr * 0.10, cy + cr * 0.40)
                        p3 = (cx + cr * 0.52, cy - cr * 0.36)
                        esp = cr * 0.235
                        d1 = dist_seg(x, y, p1, p2) - esp
                        d2 = dist_seg(x, y, p2, p3) - esp
                        a_chk = max(cobertura(d1, 1.0), cobertura(d2, 1.0))
                        if a_chk > 0:
                            r, g, b = misturar((r, g, b), BRANCO, a_chk)

                    acc[0] += r
                    acc[1] += g
                    acc[2] += b
                    acc[3] += a * 255.0
            n = ss * ss
            off = (py * tam + px) * 4
            buf[off] = min(255, int(round(acc[0] / n)))
            buf[off + 1] = min(255, int(round(acc[1] / n)))
            buf[off + 2] = min(255, int(round(acc[2] / n)))
            buf[off + 3] = min(255, int(round(acc[3] / n)))
    return bytes(buf), tam


def dist_seg(px, py, a, b):
    ax, ay = a
    bx, by = b
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def escrever_png(caminho, rgba, tam):
    def chunk(tipo, dados):
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    bruto = bytearray()
    for y in range(tam):
        bruto.append(0)  # filtro None
        bruto += rgba[y * tam * 4:(y + 1) * tam * 4]
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", tam, tam, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(bruto), 9))
        + chunk(b"IEND", b"")
    )
    with open(caminho, "wb") as f:
        f.write(png)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="ALEPA 2026 — App de estudo">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d4ed8"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect x="10" y="10" width="492" height="492" rx="112" fill="url(#g)"/>
  <rect x="133" y="102" width="246" height="266" rx="28" fill="#ffffff"/>
  <g fill="#94a3b8">
    <rect x="172" y="156" width="168" height="15" rx="7.5"/>
    <rect x="172" y="200" width="135" height="15" rx="7.5"/>
    <rect x="172" y="244" width="168" height="15" rx="7.5"/>
    <rect x="172" y="288" width="100" height="15" rx="7.5"/>
  </g>
  <circle cx="358" cy="368" r="80" fill="#ffffff"/>
  <circle cx="358" cy="368" r="68" fill="#22c55e"/>
  <path d="M324 368 l26 28 l46 -56" fill="none" stroke="#ffffff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
"""


def main():
    os.makedirs(SAIDA, exist_ok=True)
    with open(os.path.join(SAIDA, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(SVG)
    print("icons/icon.svg")

    for nome, tam, maskable in (
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-512-maskable.png", 512, True),
    ):
        rgba, t = desenhar(tam, maskable=maskable)
        caminho = os.path.join(SAIDA, nome)
        escrever_png(caminho, rgba, t)
        print(f"{nome} ({os.path.getsize(caminho)/1024:.1f} KB)")


if __name__ == "__main__":
    main()
