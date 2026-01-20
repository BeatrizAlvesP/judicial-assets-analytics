from flask import Flask, render_template
import pandas as pd
import numpy as np
import math
from datetime import datetime
from pathlib import Path

app = Flask(__name__)

# -------------------------- Helpers -------------------------- #
def clean_nans(obj):
    """Converte NaN/Inf recursivamente para None (JSON válido)."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, (int, str)) or obj is None:
        return obj
    if isinstance(obj, dict):
        return {k: clean_nans(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean_nans(v) for v in obj]
    # fallback para tipos não-JSON (ex.: Timestamp)
    try:
        return str(obj)
    except Exception:
        return None


def dataframe_to_json_records(df: pd.DataFrame) -> list[dict]:
    """Prepara DataFrame para JSON: Encerramento ISO, sem NaN/Inf."""
    out = df.copy()

    # Encerramento -> ISO (YYYY-MM-DD) ou None
    if "Encerramento" in out.columns:
        enc = pd.to_datetime(out["Encerramento"], errors="coerce")
        out["Encerramento"] = enc.dt.strftime("%Y-%m-%d").where(enc.notna(), None)

    # Garante que nada reste como ±Inf/NaN
    out = out.replace([np.inf, -np.inf], np.nan).where(pd.notna(out), None)

    records = out.to_dict(orient="records")
    return [clean_nans(r) for r in records]


# --------------------------- Rota ---------------------------- #
@app.route("/judicial-assets")
def index():
    # --- Caminho da base projeto
    BASE_DIR = Path(__file__).resolve().parent
    DATA_FILE = BASE_DIR / "data" / "judicial_assets_sample.xlsx"
    
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {DATA_FILE}")

    # --- Carrega a planilha
    df = pd.read_excel(DATA_FILE)
    df.columns = [str(col).strip() for col in df.columns]

    # --- Seleciona as colunas que vamos usar
    colunas = [
        "Status", "Codigo", "Código", "Emissão", "Emissao",
        "Total Tokens", "% Lastro", "Total Distribuido", "Qtdd Processos",
        "Valor Atual Face", "Valor Atual de Face Estimado da Carteira",
        "% Distribuido", "% Distribuído", "MESES", "PERCENTUAL", "CENARIO TEMPO",
        "Multiplo", "Múltiplo", "Participação",
        "Valor Estimado Possivel Ruim", "Numero de Pastas Estimado", "Valor Estimado",
        "Valor Individual", "Encerramento"
    ]
    # algumas planilhas trazem "possiveis rui" ou "possiveis ruins"
    possiveis_cols = [c for c in df.columns if c.strip().lower() in ("possiveis rui", "possiveis ruins")]
    todos = [c for c in colunas + possiveis_cols if c in df.columns]
    df_filtrado = df[todos].copy()

    # Facilita "tem coluna?"
    def has(c): return c in df_filtrado.columns
    def numcol(c):
        return pd.to_numeric(df_filtrado[c], errors="coerce") if has(c) else pd.Series(np.nan, index=df_filtrado.index)

    # --- Tipagem: numéricas
    colunas_numericas = [
        "Total Tokens", "% Lastro", "Total Distribuido", "Qtdd Processos",
        "Valor Atual Face", "Valor Atual de Face Estimado da Carteira",
        "% Distribuido", "% Distribuído", "MESES", "PERCENTUAL",
        "Multiplo", "Múltiplo", "Participação",
        "Valor Estimado Possivel Ruim", "Numero de Pastas Estimado", "Valor Estimado",
        "Valor Individual"
    ] + possiveis_cols
    for c in colunas_numericas:
        if has(c):
            df_filtrado[c] = pd.to_numeric(df_filtrado[c], errors="coerce").replace([np.inf, -np.inf], np.nan)

    # Datas
    if has("Encerramento"):
        df_filtrado["Encerramento"] = pd.to_datetime(df_filtrado["Encerramento"], errors="coerce")

    # Texto com default amigável
    if has("CENARIO TEMPO"):
        df_filtrado["CENARIO TEMPO"] = (
            df_filtrado["CENARIO TEMPO"]
            .astype(str)
            .replace({"nan": "Sem Cenário", "": "Sem Cenário"})
            .fillna("Sem Cenário")
        )

    # --- Renomeia para o front
    df_filtrado.rename(columns={
        "Qtdd Processos": "Qtd Processos",
        "MESES": "Duration",
        "CENARIO TEMPO": "Cenário",
        "PERCENTUAL": "Percentual PP",
        "Emissao": "Emissão",
        "Múltiplo": "Multiplo",
        "Código": "Codigo",
        "% Distribuído": "% Distribuido"
    }, inplace=True)

    # --- Normaliza percentuais (se vierem 0–100, vira 0–1)
    for c in ["% Lastro", "% Distribuido", "Percentual PP", "Participação"]:
        if has(c):
            col = pd.to_numeric(df_filtrado[c], errors="coerce")
            mask = col > 1
            col.loc[mask] = col.loc[mask] / 100.0
            df_filtrado[c] = col.fillna(0)

    # --- Valor Real por linha (= %Lastro * Valor Atual Face)
    if has("% Lastro") and has("Valor Atual Face"):
        df_filtrado["Valor Real"] = numcol("% Lastro").fillna(0) * numcol("Valor Atual Face").fillna(0)
    else:
        df_filtrado["Valor Real"] = 0.0

    # --- Meses desde Encerramento (fim da captação)
    if has("Encerramento"):
        today = pd.Timestamp(datetime.utcnow().date())
        dif_dias = (today - df_filtrado["Encerramento"]).dt.days
        df_filtrado["Meses desde Encerramento"] = dif_dias.where(dif_dias.notna(), np.nan) / 30.44
    else:
        df_filtrado["Meses desde Encerramento"] = np.nan

    # ===================== INDICADORES (Overview) =====================
    ativas = df_filtrado["Status"].astype(str).str.lower().eq("ativa") if has("Status") \
        else pd.Series(False, index=df_filtrado.index)

    if has("Valor Atual de Face Estimado da Carteira"):
        tem_valor_face = numcol("Valor Atual de Face Estimado da Carteira").gt(0)
    elif has("Valor Atual Face"):
        tem_valor_face = numcol("Valor Atual Face").gt(0)
    else:
        tem_valor_face = pd.Series(False, index=df_filtrado.index)

    # Total Distribuído (somatório do Valor Individual) em Ativas & com face estimada
    if has("Valor Individual"):
        total_distribuido = float(numcol("Valor Individual")[ativas & tem_valor_face].sum(skipna=True))
    elif has("Total Distribuido"):
        total_distribuido = float(numcol("Total Distribuido")[ativas & tem_valor_face].sum(skipna=True))
    else:
        total_distribuido = 0.0

    # Valor Real Total em Ativas & com face estimada
    valor_real_total = float(pd.to_numeric(df_filtrado.loc[ativas & tem_valor_face, "Valor Real"], errors="coerce").sum(skipna=True))

    # Tempo médio ponderado por Participação em Ativas & com face estimada
    dur = numcol("Duration")
    w   = numcol("Participação")
    mask_tm = ativas & tem_valor_face & dur.notna() & w.notna() & (dur > 0) & (w > 0)
    if mask_tm.any() and w[mask_tm].sum(skipna=True) > 0:
        tempo_medio = float((dur[mask_tm] * w[mask_tm]).sum(skipna=True) / w[mask_tm].sum(skipna=True))
    else:
        tempo_medio = None  # mostra "—" no front

    # Total Tokens (contagem de linhas) somente de Ativas & com valor de face estimado
    total_tokens_registros = int((ativas & tem_valor_face).sum())

    # ===================== ALERTAS (Ativa & Valor Estimado > 0) =====================
    base_mask = ativas & numcol("Valor Estimado").gt(0) if has("Valor Estimado") else pd.Series(False, index=df_filtrado.index)

    # Tokens sem valor de face
    if has("Valor Atual de Face Estimado da Carteira"):
        tem_face = numcol("Valor Atual de Face Estimado da Carteira").gt(0)
    elif has("Valor Atual Face"):
        tem_face = numcol("Valor Atual Face").gt(0)
    else:
        tem_face = pd.Series(False, index=df_filtrado.index)
    tokens_sem_valor_face = int((base_mask & ~tem_face).sum())

    # Valor estimado a lastrear
    valor_em_risco = float(numcol("Valor Estimado")[base_mask].sum(skipna=True)) if has("Valor Estimado") else 0.0

    # SOMA (não média) de Participação
    perc_sem_lastro = float(numcol("Participação")[base_mask].sum(skipna=True)) if has("Participação") else 0.0

    # Qtd de pastas a alocar
    qtd_pastas_sem_aloc = int(numcol("Numero de Pastas Estimado")[base_mask].sum(skipna=True)) if has("Numero de Pastas Estimado") else 0

    indicadores = {
        "overview": {
            "total_distribuido": total_distribuido,
            "valor_real_total": valor_real_total,
            "tempo_medio_meses": float(tempo_medio) if tempo_medio is not None else None,
            "total_tokens_registros": total_tokens_registros,
        },
        "risk_alerts": {
            "tokens_sem_valor_face": tokens_sem_valor_face,
            "valor_em_risco": valor_em_risco,
            "perc_sem_lastro": perc_sem_lastro,  # o JS converte p/ % se quiser
            "qtd_pastas_sem_alocacao": qtd_pastas_sem_aloc,
        }
    }

    # --------- JSON seguro (sem NaN/Inf) + datas em ISO --------- #
    dados = dataframe_to_json_records(df_filtrado)
    indicadores = clean_nans(indicadores)

    # Lista de códigos para o datalist (Codigo/Código)
    if has("Codigo"):
        serie_cod = df_filtrado["Codigo"]
    elif has("Código"):
        serie_cod = df_filtrado["Código"]
    else:
        serie_cod = pd.Series(dtype=str)

    codigos = sorted(set(map(lambda x: str(x).strip(), serie_cod.dropna().astype(str)))) if len(serie_cod) else []

    return render_template("index.html", dados=dados, codigos=codigos, indicadores=indicadores)


if __name__ == "__main__":
    app.run(debug=True)
