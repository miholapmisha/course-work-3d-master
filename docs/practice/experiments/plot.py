"""Builds the report figures from results.json (run run.js first)."""
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).parent
FIG = HERE.parent / "figures"
FIG.mkdir(exist_ok=True)
DATA = json.loads((HERE / "results.json").read_text())

plt.rcParams.update({
    "font.family": "Times New Roman",
    "font.size": 12,
    "svg.fonttype": "none",
    "axes.grid": True,
    "grid.alpha": 0.35,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "figure.dpi": 150,
})
W = 6.3  # inches ≈ 16 cm text width
STATUS_COLOR = {"SEARCH": "#9e9e9e", "TRACKING": "#2e7d32", "LOST": "#c62828"}


def save(fig: plt.Figure, name: str) -> None:
    fig.tight_layout()
    fig.savefig(FIG / f"{name}.svg")
    plt.close(fig)


def kp_series() -> None:
    fig, ax = plt.subplots(figsize=(W, 2.9))
    styles = {"1": ("#c62828", "-"), "4": ("#1565c0", "-"), "12": ("#2e7d32", "-")}
    for kp, rows in DATA["e1series"].items():
        t = [r[0] for r in rows]
        e = [r[1] if r[2] == "TRACKING" else None for r in rows]
        color, ls = styles[kp]
        ax.plot(t, e, color=color, ls=ls, lw=1.4, label=f"$K_p$ = {kp} с$^{{-1}}$")
    ax.axvline(DATA["e1"]["circle"][0]["acq"], color="#616161", lw=1, ls="--")
    ax.text(DATA["e1"]["circle"][0]["acq"] + 0.3, 36, "захоплення цілі", fontsize=11, color="#424242")
    ax.set_xlabel("Час, с")
    ax.set_ylabel("Кутова похибка, °")
    ax.set_xlim(0, 15)
    ax.set_ylim(0, 40)
    ax.legend(loc="upper right", ncol=3, frameon=False)
    save(fig, "fig-4-1-kp-series")


def kp_rms() -> None:
    fig, ax = plt.subplots(figsize=(W, 2.9))
    rows_c = [r for r in DATA["e1"]["circle"] if r["rms"] is not None]
    rows_z = [r for r in DATA["e1"]["zigzag"] if r["rms"] is not None]
    kp = [r["kp"] for r in rows_c]
    ax.plot(kp, [r["rms"] for r in rows_c], "o-", color="#1565c0", label="коло R = 15 м (СКП)")
    ax.plot([r["kp"] for r in rows_z], [r["rms"] for r in rows_z], "s-", color="#ef6c00", label="«змійка» (СКП)")
    ax.plot([r["kp"] for r in rows_z], [r["max"] for r in rows_z], "s:", color="#ef6c00", alpha=0.7, label="«змійка» (максимум)")
    omega = 8 / 15 * 180 / 3.141592653589793
    dense = [0.5 + i * 0.1 for i in range(156)]
    ax.plot(dense, [omega / k for k in dense], color="#616161", lw=1, ls="--", label="теорія ω/$K_p$")
    ax.set_xlabel("$K_p$, с$^{-1}$")
    ax.set_ylabel("Похибка, °")
    ax.set_ylim(0, 45)
    ax.legend(frameon=False, fontsize=11)
    save(fig, "fig-4-2-kp-rms")


def step_responses() -> None:
    fig, ax = plt.subplots(figsize=(W, 3.4))
    labels = {
        "4@30": ("$K_p$=4, 30 Гц ($K_pT$=0,13)", "#2e7d32"),
        "8@5": ("$K_p$=8, 5 Гц ($K_pT$=1,6)", "#1565c0"),
        "12@5": ("$K_p$=12, 5 Гц ($K_pT$=2,4)", "#ef6c00"),
        "20@1": ("$K_p$=20, 1 Гц ($K_pT$=20)", "#c62828"),
    }
    for key, rows in DATA["e2series"].items():
        first = next((r[0] for r in rows if r[2] == "TRACKING"), None)
        if first is None:
            continue
        t = [r[0] - first for r in rows if r[0] >= first]
        e = [r[1] for r in rows if r[0] >= first]
        label, color = labels[key]
        ax.plot(t, e, color=color, lw=1.3, label=label)
    ax.set_xlim(0, 8)
    ax.set_ylim(0, 60)
    ax.set_xlabel("Час від захоплення цілі, с")
    ax.set_ylabel("Кутова похибка, °")
    ax.legend(frameon=False, fontsize=11, ncol=2, loc="upper center", bbox_to_anchor=(0.5, -0.22))
    save(fig, "fig-4-3-step")


def stability_map() -> None:
    fig, ax = plt.subplots(figsize=(W, 3.1))
    marks = {
        "stable": ("o", "#2e7d32", "стійкий режим"),
        "osc": ("^", "#ef6c00", "незгасні коливання"),
        "loss": ("x", "#c62828", "втрата цілі"),
    }
    seen = set()
    for r in DATA["e2"]:
        if r["losses"] > 0 or r["tailShare"] < 0.99:
            kind = "loss"
        elif r["tailMax"] is not None and r["tailMax"] >= 1:
            kind = "osc"
        else:
            kind = "stable"
        m, c, lab = marks[kind]
        ax.scatter(r["hz"], r["kp"], marker=m, color=c, s=60, label=None if kind in seen else lab, zorder=3)
        seen.add(kind)
    hz = [0.9 + i * 0.05 for i in range(600)]
    ax.plot(hz, [1.8 * h for h in hz], color="#424242", ls="--", lw=1, label="межа $K_pT$ = 2 − 2$K_d$ = 1,8")
    ax.set_xscale("log")
    ax.set_xticks([1, 2, 5, 10, 30])
    ax.get_xaxis().set_major_formatter(matplotlib.ticker.ScalarFormatter())
    ax.set_ylim(0, 22)
    ax.set_xlim(0.8, 40)
    ax.set_xlabel("Частота детекції detectHz, Гц")
    ax.set_ylabel("$K_p$, с$^{-1}$")
    ax.legend(frameon=False, fontsize=11, loc="upper left", bbox_to_anchor=(1.01, 1.0))
    save(fig, "fig-4-4-stability")


def png_paths() -> None:
    fig, ax = plt.subplots(figsize=(W, 3.6))
    colors = {"1": "#c62828", "3": "#1565c0", "5": "#2e7d32"}
    target_drawn = False
    for k in ("1", "3", "5"):
        rows = DATA["e5paths"][f"crossing-K{k}"]
        if not target_drawn:
            ax.plot([r[3] for r in rows], [r[4] for r in rows], color="#424242", lw=2.2, label="ціль (4 м/с)")
            target_drawn = True
        label = "K = 1 (чисте переслідування)" if k == "1" else f"K = {k} (PNG)"
        ax.plot([r[0] for r in rows], [r[2] for r in rows], color=colors[k], lw=1.4, label=label)
        ax.plot(rows[-1][0], rows[-1][2], "o", color=colors[k], ms=5)
    ax.plot(0, 0, "k^", ms=8, label="старт БпЛА (висота 20 м)")
    ax.set_aspect("equal")
    ax.set_xlabel("X, м")
    ax.set_ylabel("Z, м")
    ax.legend(frameon=False, fontsize=10.5, loc="upper left", bbox_to_anchor=(1.0, 1.0))
    save(fig, "fig-4-5-png")


if __name__ == "__main__":
    kp_series()
    kp_rms()
    step_responses()
    stability_map()
    png_paths()
    print("figures written to", FIG)
