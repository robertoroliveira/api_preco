const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   🔌 CONEXÃO POSTGRES (RAILWAY)
========================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =========================
   📦 PRODUTO (SEM FILTRO)
========================= */
app.get("/produto/:codigo", async (req, res) => {
  const { codigo } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.codigo,
        p.nome,
        p.preco AS preco_venda,

        COALESCE(c.total_comprado, 0) AS total_comprado,
        COALESCE(v.total_vendido, 0) AS total_vendido,

        /* 🧾 ÚLTIMA COMPRA (DATA + FORNECEDOR + PREÇO) */
        c_last.preco_compra,
        c_last.nome_fornecedor,

        COALESCE(
          c_last.data_compra,
          'SEM COMPRA'
        ) AS ultima_compra,

        /* 📦 ESTOQUE */
        COALESCE(c.total_comprado, 0)
        - COALESCE(v.total_vendido, 0) AS estoque_atual

      FROM produtos p

      /* 📦 TOTAL COMPRADO */
      LEFT JOIN (
        SELECT produto_id, SUM(qtd_compra) AS total_comprado
        FROM compras
        GROUP BY produto_id
      ) c ON c.produto_id = p.id

      /* 📦 TOTAL VENDIDO */
      LEFT JOIN (
        SELECT produto_id, SUM(quantidade) AS total_vendido
        FROM vendas
        GROUP BY produto_id
      ) v ON v.produto_id = p.id

      /* 🔥 ÚLTIMA COMPRA CORRETA (SEM DUPLICAÇÃO) */
      LEFT JOIN LATERAL (
        SELECT 
          TO_CHAR(data_compra::date, 'DD/MM/YYYY') AS data_compra,
          preco_compra,
          nome_fornecedor
        FROM compras c2
        WHERE c2.produto_id = p.id
        ORDER BY c2.data_compra DESC
        LIMIT 1
      ) c_last ON true

      WHERE p.codigo = $1
    `, [codigo]);

    if (result.rows.length === 0) {
      return res.json({ error: "Produto não encontrado" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Erro API produto:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});


/* =========================
   📅 PRODUTO COM FILTRO DE PERÍODO
========================= */
app.get("/produto/:codigo/periodo", async (req, res) => {
  const { codigo } = req.params;
  const { inicio, fim } = req.query;

  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.codigo,
        p.nome,

        COALESCE(c.total_comprado, 0) AS total_comprado,
        COALESCE(v.total_vendido, 0) AS total_vendido,

        COALESCE(c.total_comprado, 0)
        - COALESCE(v.total_vendido, 0) AS estoque_periodo

      FROM produtos p

      LEFT JOIN (
        SELECT produto_id, SUM(qtd_compra) AS total_comprado
        FROM compras
        WHERE data_compra::date BETWEEN $2 AND $3
        GROUP BY produto_id
      ) c ON c.produto_id = p.id

      LEFT JOIN (
        SELECT produto_id, SUM(quantidade) AS total_vendido
        FROM vendas
        WHERE data_venda::date BETWEEN $2 AND $3
        GROUP BY produto_id
      ) v ON v.produto_id = p.id

      WHERE p.codigo = $1
    `, [codigo, inicio, fim]);

    res.json(result.rows[0] || { error: "Produto não encontrado" });

  } catch (err) {
    console.error("Erro API período:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});


/* =========================
   🚀 START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API rodando na porta ${PORT}`);
});