const initClock = () => {
  const el = document.getElementById("system-clock");
  if (!el) return;
  const update = () => {
    const now = new Date();
    el.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  };
  update();
  setInterval(update, 200);
};

document.addEventListener("DOMContentLoaded", initClock);
