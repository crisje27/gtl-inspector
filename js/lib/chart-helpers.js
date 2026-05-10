/* ============================================================
   GTL Inspector — Helpers de Chart.js
   Estilo ejecutivo / reporte gerencial YPF
   ============================================================ */
(function (global) {
  "use strict";

  const COLORS = {
    blue:    "#003087",
    blueMid: "#0060D6",
    blueLight: "#4D8FE8",
    yellow:  "#FFD100",
    ok:      "#00884A",
    okSoft:  "#D1FAE5",
    warn:    "#D97706",
    warnSoft:"#FEF3C7",
    danger:  "#CC1F1F",
    dangerSoft: "#FEE2E2",
    purple:  "#6E3FB8",
    teal:    "#3FB89D",
    orange:  "#B8763F",
    grey:    "#8892A6",
    greyLight: "#CBD5E1"
  };

  const SPECIALTY_COLOR = {
    fo:   COLORS.blueMid,
    pat:  COLORS.ok,
    pc:   COLORS.warn,
    elec: COLORS.yellow,
    inst: COLORS.purple,
    civ:  COLORS.orange,
    mec:  COLORS.teal
  };

  const baseFont = {
    family: "Barlow, system-ui, sans-serif",
    size: 12
  };
  const titleFont = {
    family: "Barlow Condensed, Barlow, system-ui, sans-serif",
    size: 14,
    weight: "700"
  };

  function fmt(n, opts) {
    opts = opts || {};
    if (n == null || isNaN(n)) return "—";
    const v = Number(n);
    const decimals = opts.decimals != null ? opts.decimals : (Math.abs(v) < 10 ? 2 : (Math.abs(v) < 100 ? 1 : 0));
    return v.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + (opts.unit ? " " + opts.unit : "");
  }

  function commonOptions(extra) {
    const o = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 420, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            font: baseFont,
            color: "#1F2937",
            boxWidth: 14,
            boxHeight: 10,
            padding: 14,
            usePointStyle: true,
            pointStyle: "rectRounded"
          }
        },
        tooltip: {
          backgroundColor: "rgba(15,23,42,0.96)",
          titleFont: { ...baseFont, size: 13, weight: "700" },
          bodyFont: { ...baseFont, size: 12 },
          padding: { top: 10, bottom: 10, left: 12, right: 12 },
          cornerRadius: 8,
          displayColors: true,
          boxPadding: 4,
          borderColor: "rgba(255,255,255,0.1)",
          borderWidth: 1
        },
        title: { display: false }
      },
      scales: {
        x: {
          ticks: { font: baseFont, color: "#5B6478", maxRotation: 0, autoSkip: true, autoSkipPadding: 16 },
          grid: { color: "rgba(0,0,0,0.04)", drawBorder: false }
        },
        y: {
          ticks: { font: baseFont, color: "#5B6478", padding: 6 },
          grid: { color: "rgba(0,0,0,0.06)", drawBorder: false },
          beginAtZero: true
        }
      }
    };
    return deepMerge(o, extra || {});
  }

  function deepMerge(target, source) {
    const out = Array.isArray(target) ? target.slice() : Object.assign({}, target);
    Object.keys(source || {}).forEach(k => {
      const sv = source[k];
      if (sv && typeof sv === "object" && !Array.isArray(sv) && out[k] && typeof out[k] === "object") {
        out[k] = deepMerge(out[k], sv);
      } else {
        out[k] = sv;
      }
    });
    return out;
  }

  function lineChart(canvas, labels, datasets, options) {
    return new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          tension: 0.32,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: "#fff",
          pointBorderWidth: 2,
          fill: d.fill != null ? d.fill : false,
          ...d
        }))
      },
      options: commonOptions(options)
    });
  }

  function areaChart(canvas, labels, datasets, options) {
    return new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: datasets.map(d => ({
          tension: 0.32,
          borderWidth: 2.5,
          pointRadius: 2,
          pointHoverRadius: 5,
          fill: true,
          backgroundColor: (d.borderColor || COLORS.blueMid) + "22",
          ...d
        }))
      },
      options: commonOptions(options)
    });
  }

  function barChart(canvas, labels, datasets, options) {
    return new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: datasets.map(d => ({ borderWidth: 0, borderRadius: 6, ...d })) },
      options: commonOptions(options)
    });
  }

  function stackedBarChart(canvas, labels, datasets, options) {
    const opts = deepMerge(commonOptions(options), {
      scales: {
        x: { stacked: true },
        y: { stacked: true }
      }
    });
    return new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: datasets.map(d => ({ borderWidth: 0, borderRadius: 4, ...d })) },
      options: opts
    });
  }

  function pieChart(canvas, labels, data, colors, options) {
    const total = data.reduce((a, b) => a + b, 0);
    return new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors || [COLORS.blue, COLORS.blueMid, COLORS.yellow, COLORS.ok, COLORS.warn, COLORS.purple, COLORS.teal],
          borderWidth: 3,
          borderColor: "#fff",
          hoverOffset: 8
        }]
      },
      options: deepMerge(commonOptions(), {
        cutout: "65%",
        scales: {},
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed;
                const pct = total ? ((v / total) * 100).toFixed(1) : "0";
                return ctx.label + ": " + fmt(v, { decimals: 0 }) + " (" + pct + "%)";
              }
            }
          }
        }
      })
    });
  }

  // Plugin: dibuja una línea horizontal de umbral en gráficos de barras (PAT 2Ω)
  function thresholdPlugin(value, label, color) {
    return {
      id: "threshold_" + value,
      afterDraw(chart) {
        const yScale = chart.scales.y;
        if (!yScale) return;
        const y = yScale.getPixelForValue(value);
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = color || COLORS.danger;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(chart.chartArea.left, y);
        ctx.lineTo(chart.chartArea.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (label) {
          ctx.font = "600 11px Barlow, system-ui";
          ctx.fillStyle = color || COLORS.danger;
          ctx.textAlign = "right";
          ctx.fillText(label, chart.chartArea.right - 6, y - 4);
        }
        ctx.restore();
      }
    };
  }

  global.GTL = global.GTL || {};
  global.GTL.Charts = {
    lineChart, areaChart, barChart, stackedBarChart, pieChart,
    thresholdPlugin, fmt,
    COLORS, SPECIALTY_COLOR
  };
})(window);
