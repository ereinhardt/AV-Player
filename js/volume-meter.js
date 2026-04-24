/* VU Meters — master + per-track/channel peak level bars */

document.addEventListener("DOMContentLoaded", () => {
  const minDb = -60,
    maxDb = 15,
    range = maxDb - minDb;
  const fmt = (db) => (db > -60 ? formatDb(db) : "-\u221E dB");

  const init = (el) => {
    const bar = el.appendChild(
      Object.assign(document.createElement("div"), { className: "vu-bar" }),
    );
    const dbSpan = Object.assign(document.createElement("span"), {
      className: "vu-db",
      textContent: "-∞ dB",
    });
    el.after(dbSpan);
    return { bar, dbSpan };
  };

  const update = ({ bar, dbSpan }, db = -Infinity) => {
    const pct = Math.max(0, Math.min(100, ((db - minDb) / range) * 100));
    bar.style.width = pct + "%";
    bar.className = "vu-bar" + (db > 0 ? " vu-clip" : db > -6 ? " vu-hot" : "");
    dbSpan.textContent = fmt(db);
  };

  const maxPeak = (obj) => {
    let m = -Infinity;
    for (const k in obj) {
      const v = obj[k];
      if (v !== null && v > m) m = v;
    }
    return m;
  };

  const master = document.getElementById("vu-meter");
  const masterM = master ? init(master) : null;
  const trackM = {};
  for (const el of document.querySelectorAll(".vu-meter[data-track]")) {
    const { track, channel } = el.dataset;
    trackM[channel != null ? `${track}-${channel}` : track] = init(el);
  }

  setTimeout(() => {
    const orig = window.handleAudioPositionUpdate;
    window.handleAudioPositionUpdate = (msg) => {
      orig?.(msg);
      if (masterM)
        update(
          masterM,
          msg.peaks?.length
            ? Math.max(...msg.peaks.filter((v) => v !== null))
            : -Infinity,
        );
      const tp = msg.trackPeaks || {};
      for (const key in trackM) {
        const [idx, ch] = key.split("-");
        update(
          trackM[key],
          tp[idx]
            ? ch != null
              ? (tp[idx][ch] ?? -Infinity)
              : maxPeak(tp[idx])
            : -Infinity,
        );
      }
    };
  }, 0);
});
