/* api/modelos.js — lista os modelos do Gemini liberados para as chaves do servidor.
 *
 *   GET /api/modelos → { modelos: [{ id, rotulo, gera, descricao }], chave, totalChaves }
 *
 * Serve para o botão "Listar modelos" do app quando ele está no modo proxy: a chave não
 * sai do servidor e você descobre quais modelos Flash/Flash-Lite a cota gratuita alcança.
 * Flash-Lite vem primeiro (costuma ter mais folga de cota).
 */

import { config, modelos, limitarPorIP, ipDoCliente, cabecalhosCORS, dicaDeErro } from '../serverless/lib/gemini.js';

export default async function handler(req, res) {
  const cfg = config();
  const cors = cabecalhosCORS(req, cfg);
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ erro: 'Use GET.' });
  }
  if (!cfg.chaves.length) {
    return res.status(500).json({
      erro: 'Nenhuma chave do Gemini configurada no servidor.',
      dica: 'Defina GEMINI_API_KEYS (ou GEMINI_API_KEY) nas variáveis de ambiente do deploy.',
    });
  }

  const limite = limitarPorIP(ipDoCliente(req), Math.max(6, Math.round(cfg.rateLimit / 3)));
  if (!limite.ok) {
    return res.status(429).json({ erro: 'Muitas requisições deste IP.', dica: `Aguarde ~${limite.falta}s.` });
  }

  try {
    const r = await modelos({ cfg });
    return res.status(200).json({
      modelos: r.modelos,
      chave: r.chave + 1,
      totalChaves: r.totalChaves,
      modeloPadrao: cfg.modelo,
    });
  } catch (e) {
    const status = Number(e.status) || 502;
    return res.status(status >= 500 ? 502 : status).json({
      erro: String(e.message || 'Falha ao listar modelos.'),
      dica: dicaDeErro(e, cfg.chaves.length),
      status,
    });
  }
}
