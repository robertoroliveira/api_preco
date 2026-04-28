const axios = require("axios");

async function buscarProdutoExterno(codigo) {
  try {
    const url = `https://world.openfoodfacts.org/api/v0/product/${codigo}.json`;

    const response = await axios.get(url);

    if (response.data.status === 1) {
      return {
        nome: response.data.product.product_name || "Produto sem nome",
        imagem: response.data.product.image_url || null
      };
    }

    return null;

  } catch (e) {
    return null;
  }
}

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================
   📦 PRODUTO (GLOBAL COMPLETO)
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

        (COALESCE(c.total_comprado, 0) - COALESCE(v.total_vendido, 0)) AS estoque_atual,

        ult.nome_fornecedor,
        ult.preco_compra,
        ult.data_compra AS ultima_compra

      FROM produtos p

      LEFT JOIN (
        SELECT produto_id, SUM(qtd_compra) AS total_comprado
        FROM compras
        GROUP BY produto_id
      ) c ON c.produto_id = p.id

      LEFT JOIN (
        SELECT produto_id, SUM(quantidade) AS total_vendido
        FROM vendas
        GROUP BY produto_id
      ) v ON v.produto_id = p.id

      LEFT JOIN LATERAL (
        SELECT 
          nome_fornecedor,
          preco_compra,
          TO_CHAR(data_compra::date, 'DD/MM/YYYY') AS data_compra
        FROM compras c2
        WHERE c2.produto_id = p.id
        ORDER BY c2.data_compra DESC
        LIMIT 1
      ) ult ON true

      WHERE p.codigo = $1
    `, [codigo]);

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});


/* =========================
   📅 PRODUTO (PERÍODO)
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
        p.preco AS preco_venda,

        COALESCE(c.total_comprado, 0) AS total_comprado,
        COALESCE(v.total_vendido, 0) AS total_vendido,

        (COALESCE(c.total_comprado, 0) - COALESCE(v.total_vendido, 0)) AS estoque_periodo,

        ult.nome_fornecedor,
        ult.preco_compra,
        ult.data_compra

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

      LEFT JOIN LATERAL (
        SELECT 
          nome_fornecedor,
          preco_compra,
          TO_CHAR(data_compra::date, 'DD/MM/YYYY') AS data_compra
        FROM compras c2
        WHERE c2.produto_id = p.id
          AND c2.data_compra::date BETWEEN $2 AND $3
        ORDER BY c2.data_compra DESC
        LIMIT 1
      ) ult ON true

      WHERE p.codigo = $1
    `, [codigo, inicio, fim]);

    res.json(result.rows[0] || { error: "Produto não encontrado" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("API rodando");
});
app.get("/produto/auto/:codigo", async (req, res) => {
  const { codigo } = req.params;

  try {
    // verifica se já existe
    const existe = await pool.query(
      "SELECT * FROM produtos WHERE codigo = $1",
      [codigo]
    );

    if (existe.rows.length > 0) {
      return res.json(existe.rows[0]);
    }

    // busca na API externa
    const externo = await buscarProdutoExterno(codigo);

    if (!externo) {
      return res.json({ error: "Produto não encontrado" });
    }

    // salva no banco
    const insert = await pool.query(
      `INSERT INTO produtos (codigo, nome, imagem)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [codigo, externo.nome, externo.imagem]
    );

    res.json(insert.rows[0]);

  } catch (err) {
    console.error("Erro auto:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

app.get("/produtos", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, codigo, nome, preco, imagem
      FROM produtos
      ORDER BY nome
    `);

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar produtos" });
  }
});